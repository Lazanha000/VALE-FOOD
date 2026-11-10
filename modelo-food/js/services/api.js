// ============================================================
// CAMADA DE INTEGRAÇÃO (pedidos)
//
// Com Supabase configurado (CONFIG.api.supabaseUrl + CONFIG.api.chavePublica):
//   * o pedido é registrado no banco ANTES de abrir o WhatsApp;
//   * o banco recalcula preços, taxa e total (o que o navegador manda é só pedido,
//     nunca valor) e devolve o código e um token secreto de acompanhamento;
//   * o acompanhamento consulta o banco com código + token.
// Sem Supabase: o pedido fica só neste navegador e segue pelo WhatsApp
// (ou é só demonstração, se CONFIG.modoDemonstracao for true).
// Pagamento online não existe: Pix é conferido à mão pelo restaurante.
// ============================================================

import { CONFIG } from '../config.js';
import { digitos, espera, salvo, CHAVES, prefixoPedido } from '../utils.js';

const CHAVE = CHAVES.pedidos;
const TEMPO_LIMITE = 15000;

export const ETAPAS = [
  { id: 'recebido', nome: 'Pedido recebido' },
  { id: 'preparo', nome: 'Em preparação' },
  { id: 'pronto', nome: 'Pronto' },
  { id: 'saiu', nome: 'Saiu para entrega', so: 'entrega' },
  { id: 'entregue', nome: 'Entregue' },
];
export const etapasPara = (modo) => ETAPAS.filter((e) => !e.so || e.so === modo);

const usarBackend = () => Boolean(CONFIG.api?.supabaseUrl && CONFIG.api?.chavePublica) && !CONFIG.modoDemonstracao;
export const modoDemo = () => !usarBackend();

// ---------- conversa com o Supabase (PostgREST /rpc) ----------
// Erros de regra do banco (preço, horário, cupom...) chegam com a mensagem pronta
// para o cliente (código P0001). Qualquer outro erro vira mensagem genérica.
// erro.motivo = hint do banco ('precos': o total mudou, buscar o cardápio de novo).
export async function rpc(nome, corpo, { fetchFn = fetch } = {}) {
  const base = String(CONFIG.api.supabaseUrl).replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);
  let r;
  try {
    r = await fetchFn(`${base}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.api.chavePublica,
        Authorization: `Bearer ${CONFIG.api.chavePublica}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch {
    // semConexao: o sistema não respondeu (internet do cliente ou banco fora do ar);
    // o checkout oferece mandar o pedido só pelo WhatsApp
    throw Object.assign(new Error('Sem conexão com a loja agora. Confira a internet e tente de novo.'), { semConexao: true });
  } finally {
    clearTimeout(timer);
  }
  let dados = null;
  try { dados = await r.json(); } catch { /* resposta vazia ou não-JSON */ }
  if (!r.ok) {
    const regra = dados?.code === 'P0001' && typeof dados.message === 'string';
    const erro = new Error((regra && dados.message.slice(0, 200)) || 'A loja não conseguiu responder agora. Tente de novo em instantes.');
    if (regra && typeof dados.hint === 'string') erro.motivo = dados.hint;
    // banco pausado, em manutenção ou sobrecarregado (5xx): mesma saída pelo WhatsApp
    if (!regra && r.status >= 500) erro.semConexao = true;
    throw erro;
  }
  return dados;
}

// pedido do site -> formato que o banco entende. O único valor é o total que o cliente
// viu (totalEsperado): o banco calcula o dele e recusa o pedido se for diferente.
export function paraServidor(pedido) {
  const total = pedido.totais?.total;
  return {
    totalEsperado: Number.isInteger(total) && total >= 0 ? total : undefined,
    modo: pedido.recebimento?.modo,
    bairro: pedido.recebimento?.bairro || undefined,
    cliente: pedido.cliente,
    entrega: pedido.entrega || undefined,
    pagamento: { forma: pedido.pagamento?.forma, trocoPara: pedido.pagamento?.trocoPara ?? undefined },
    cupom: pedido.cupom || undefined,
    obs: pedido.obs || '',
    itens: (pedido.itens || []).map((i) => ({
      produtoId: i.produtoId, qtd: i.qtd, escolhas: i.escolhasIds || {}, remover: i.remover || [], obs: i.obs || '',
    })),
  };
}

const nomePagamento = (forma) => CONFIG.pagamentos.find((x) => x.id === forma)?.nome || forma;
const statusValido = (s) => ['recebido', 'preparo', 'pronto', 'saiu', 'entregue', 'cancelado'].includes(s);

// resposta do banco -> formato que as telas do site usam. Valores SEMPRE do banco.
export function doServidor(r, local = {}) {
  return {
    ...local,
    codigo: String(r.codigo),
    token: r.token || local.token,
    criadoEm: r.criadoEm,
    status: statusValido(r.status) ? r.status : 'recebido',
    pagamentoStatus: r.pagamentoStatus,
    recebimento: { ...(local.recebimento || {}), modo: r.modo, nome: r.modo === 'retirada' ? 'Retirada' : 'Entrega' },
    pagamento: { ...(local.pagamento || {}), forma: r.pagamentoForma, nome: nomePagamento(r.pagamentoForma), trocoPara: r.trocoPara ?? null },
    cupom: r.cupom || null,
    itens: (r.itens || []).map((i) => ({
      nome: i.nome,
      qtd: i.qtd,
      precoUnitario: i.precoUnitario,
      escolhas: [...(i.escolhas || []).map((e) => e.opcao), ...(i.remover || []).map((x) => `Sem ${String(x).toLowerCase()}`)],
      obs: i.obs || '',
    })),
    totais: { subtotal: r.subtotal, desconto: r.desconto || 0, taxa: r.taxa, total: r.total },
    demonstracao: false,
  };
}

function gerarCodigo() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(5);
  crypto.getRandomValues(arr);
  return `${prefixoPedido()}-` + [...arr].map((n) => letras[n % letras.length]).join('');
}

// Guarda no aparelho o necessário para achar o pedido depois.
// lembrar = caixa "Lembrar meus dados" marcada; sem ela, nunca nome nem endereço.
function guardarNoAparelho(registro, lembrar) {
  const minimo = {
    codigo: registro.codigo, criadoEm: registro.criadoEm, demonstracao: registro.demonstracao,
    ...(registro.token ? { token: registro.token } : {}),
    ...(registro.semSistema ? { semSistema: true } : {}),
    cliente: { telefone: registro.cliente?.telefone },
  };
  const lista = salvo.ler(CHAVE, []).filter((p) => p.codigo !== registro.codigo);
  lista.unshift(lembrar ? registro : minimo);
  salvo.gravar(CHAVE, lista.slice(0, 20));
}

// chave = identificador do envio (crypto.randomUUID), o MESMO em todas as tentativas
// do mesmo pedido: assim um clique repetido ou uma nova tentativa não duplica o pedido.
export async function criarPedido(pedido, { lembrar = false, chave = crypto.randomUUID(), fetchFn } = {}) {
  if (usarBackend()) {
    const r = await rpc('criar_pedido', { dados: paraServidor(pedido), chave }, { fetchFn });
    if (!r?.codigo || !r?.token) throw new Error('A loja não confirmou o pedido. Tente de novo em instantes.');
    const registro = doServidor(r, { cliente: pedido.cliente, recebimento: pedido.recebimento, entrega: pedido.entrega, pagamento: pedido.pagamento, obs: pedido.obs });
    guardarNoAparelho(registro, lembrar);
    return registro;
  }
  await espera(700);
  const registro = {
    ...pedido,
    codigo: gerarCodigo(),
    criadoEm: new Date().toISOString(),
    demonstracao: CONFIG.modoDemonstracao,
  };
  guardarNoAparelho(registro, lembrar);
  return registro;
}

// Reserva quando o sistema de pedidos não responde: o pedido fica só neste aparelho e vai
// pelo WhatsApp, como no site sem banco. semSistema avisa a loja (na mensagem) para conferir
// os valores, que são os da tela do cliente e não foram recalculados pelo banco.
export function pedidoSoWhatsapp(pedido, { lembrar = false } = {}) {
  const registro = { ...pedido, codigo: gerarCodigo(), criadoEm: new Date().toISOString(), demonstracao: false, semSistema: true };
  guardarNoAparelho(registro, lembrar);
  return registro;
}

// Status simulado pelo tempo desde o pedido (só na demonstração)
export function statusDemo(pedido, agora = Date.now()) {
  const min = (agora - new Date(pedido.criadoEm).getTime()) / 60000;
  if (min < 1) return 'recebido';
  if (min < 3) return 'preparo';
  if (min < 4) return 'pronto';
  if (min < 7) return 'saiu';
  return 'entregue';
}

// Link de acompanhamento (vale em qualquer aparelho): #pedido?c=CODIGO&t=TOKEN
export function linkAcompanhamento(p) {
  if (!p?.token) return '';
  const u = new URL(location.href);
  u.hash = `pedido?c=${encodeURIComponent(p.codigo)}&t=${encodeURIComponent(p.token)}`;
  return u.href;
}

// Consulta por código + telefone (pedidos feitos neste aparelho) ou por código + token (link).
export async function consultarPedido(codigo, telefone, { token, fetchFn } = {}) {
  const cod = String(codigo || '').trim().toUpperCase();
  const tel = digitos(telefone);
  const local = salvo.ler(CHAVE, []).find((x) => x.codigo === cod);
  if (usarBackend()) {
    let tk = token;
    if (!tk) {
      if (!local) return { erro: 'outro-aparelho' };
      if (digitos(local.cliente?.telefone) !== tel) return { erro: 'telefone' };
      // enviado só pelo WhatsApp (sistema fora do ar): o banco não conhece este pedido
      if (local.semSistema) return { erro: 'sem-sistema' };
      tk = local.token;
    }
    if (!/^[A-Za-z0-9]{32}$/.test(String(tk || ''))) return { erro: 'nao-encontrado' };
    const r = await rpc('acompanhar_pedido', { codigo: cod, token: tk }, { fetchFn });
    if (!r) return { erro: 'nao-encontrado' };
    // veio pelo link: guarda no aparelho (só código, token e horário) para consultar de novo
    if (token && !local) guardarNoAparelho({ codigo: r.codigo, criadoEm: r.criadoEm, token: tk, demonstracao: false, cliente: {} }, false);
    return { pedido: doServidor({ ...r, token: tk }, local || {}) };
  }
  await espera(400);
  if (!local) return { erro: 'nao-encontrado' };
  if (digitos(local.cliente?.telefone) !== tel) return { erro: 'telefone' };
  return { pedido: { ...local, status: statusDemo(local) } };
}

export function pedidosNesteAparelho() {
  return salvo.ler(CHAVE, []).map((p) => ({ codigo: p.codigo, criadoEm: p.criadoEm }));
}
