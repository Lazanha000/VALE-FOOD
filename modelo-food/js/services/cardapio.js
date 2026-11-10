// ============================================================
// CARDÁPIO E LOJA VINDOS DO BANCO (Supabase)
//
// Converte as linhas das tabelas públicas (categorias, produtos, grupos_opcao,
// opcoes, loja, bairros, horarios) para o MESMO formato de js/products.js e
// js/config.js. Tudo é conferido: valor estranho é descartado e, se o conjunto
// não fizer sentido, a conversão devolve null e o site fica com products.js
// (a reserva). Preço mostrado aqui é só vitrine: quem cobra é o banco.
// ============================================================

import { texto, centavos, caminhoFoto, idValido } from '../ajustar.js';
import { validarPix } from '../pix.js';

const ehObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const lista = (v) => (Array.isArray(v) ? v : []);
const ordenar = (a) => [...a].sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0));
const chaveOk = (v) => typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v);
const idProdutoOk = (v) => typeof v === 'string' && /^[a-z0-9-]{1,60}$/.test(v);
const bool = (v, padrao) => (typeof v === 'boolean' ? v : padrao);

// Foto: caminho do próprio site (assets/produtos/...) ou arquivo do Storage
// (bucket "produtos", nome "<produto>/<arquivo>.webp|jpg|png"), virando URL pública.
const NOME_STORAGE = /^[a-z0-9-]{1,60}\/[A-Za-z0-9-]{8,64}\.(webp|jpg|png)$/;
export function fotoDoBanco(v, supabaseUrl) {
  if (typeof v !== 'string' || !v) return null;
  const local = caminhoFoto(v);
  if (local) return local;
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base)) return null;
  const prefixo = `${base}/storage/v1/object/public/produtos/`;
  const nome = v.startsWith(prefixo) ? v.slice(prefixo.length) : v;
  return NOME_STORAGE.test(nome) ? prefixo + nome : null;
}

function grupoDoBanco(g) {
  if (!ehObj(g) || !chaveOk(g.chave) || !texto(g.nome, 40) || !['unica', 'multipla'].includes(g.tipo)) return null;
  const escolhas = ordenar(lista(g.opcoes))
    .filter((o) => ehObj(o) && o.ativo !== false && chaveOk(o.chave) && texto(o.nome, 60) && centavos(o.preco) !== undefined)
    .map((o) => ({ id: o.chave, nome: texto(o.nome, 60), preco: o.preco }));
  if (!escolhas.length) return null;
  const grupo = { id: g.chave, nome: texto(g.nome, 40), tipo: g.tipo, obrigatorio: g.obrigatorio === true, escolhas };
  if (Number.isInteger(g.max) && g.max >= 1 && g.max <= 20) grupo.max = g.max;
  return grupo;
}

// linhas -> { categorias, produtos } no formato de products.js, ou null se não der para usar
export function cardapioDoBanco(categoriasDb, produtosDb, { supabaseUrl, reserva = [] } = {}) {
  const categorias = ordenar(lista(categoriasDb))
    .filter((c) => ehObj(c) && c.ativo !== false && idValido(c.id) && texto(c.nome, 40))
    .map((c) => ({ id: c.id, nome: texto(c.nome, 40) }));
  const ids = new Set(categorias.map((c) => c.id));
  // ilustração de reserva: a do mesmo produto em products.js, senão uma da mesma categoria
  const arteReserva = (p) => reserva.find((r) => r.id === p.id)?.arte || reserva.find((r) => r.categoria === p.categoria_id)?.arte || 'lata';
  const vistos = new Set();
  const produtos = [];
  for (const p of ordenar(lista(produtosDb))) {
    if (!ehObj(p) || p.ativo === false || !idProdutoOk(p.id) || vistos.has(p.id) || !ids.has(p.categoria_id)) continue;
    const nome = texto(p.nome, 60);
    if (!nome || centavos(p.preco) === undefined) continue;
    vistos.add(p.id);
    produtos.push({
      id: p.id,
      categoria: p.categoria_id,
      nome,
      descricao: texto(p.descricao ?? '', 300) ?? '',
      preco: p.preco,
      arte: typeof p.arte === 'string' && /^[a-z0-9-]{1,40}$/.test(p.arte) ? p.arte : arteReserva(p),
      imagem: fotoDoBanco(p.imagem, supabaseUrl),
      opcoes: ordenar(lista(p.grupos_opcao)).map(grupoDoBanco).filter(Boolean),
      removiveis: lista(p.removiveis).map((x) => texto(x, 40)).filter(Boolean).slice(0, 30),
      ...(p.destaque === true ? { destaque: true } : {}),
      ...(p.disponivel === false ? { esgotado: true } : {}),
    });
  }
  // categoria sem produto não aparece; cardápio vazio = algo errado -> usa a reserva
  const usadas = categorias.filter((c) => produtos.some((p) => p.categoria === c.id));
  if (!produtos.length || !usadas.length) return null;
  return { categorias: usadas, produtos };
}

// ---------- loja ----------
const DIAS = [null, 'seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']; // 1 = segunda (ISO)
const hhmm = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v) ? v.slice(0, 5) : undefined);
const tempo = (v, padrao) => texto(v, 30) || padrao;
const textos = (v, max) => lista(v).map((x) => texto(x, max)).filter(Boolean);

// linhas -> pedaços de CONFIG (só o que o banco manda), ou null se a loja não veio
// (nome da loja e visual ficam no config.js e no index.html: o banco não troca a marca)
// pagamentosBase = CONFIG.pagamentos original (nomes e detalhes dos meios de pagamento)
export function lojaDoBanco(lojaDb, bairrosDb, horariosDb, { pagamentosBase = [], base = {} } = {}) {
  const l = Array.isArray(lojaDb) ? lojaDb[0] : lojaDb;
  if (!ehObj(l)) return null;
  const entrega = base.entrega || {};
  const retirada = base.retirada || {};
  const pix = base.pix || {};

  const semana = { seg: [], ter: [], qua: [], qui: [], sex: [], sab: [], dom: [] };
  for (const h of lista(horariosDb)) {
    const d = DIAS[h?.dia];
    const abre = hhmm(h?.abre);
    const fecha = hhmm(h?.fecha);
    if (d && abre && fecha && abre !== fecha) semana[d].push([abre, fecha]);
  }
  for (const d of Object.keys(semana)) semana[d].sort((a, b) => a[0].localeCompare(b[0]));

  const bairros = lista(bairrosDb)
    .filter((b) => ehObj(b) && b.ativo !== false && texto(b.nome, 60) && centavos(b.taxa) !== undefined)
    .map((b) => ({ nome: texto(b.nome, 60), valor: b.taxa }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const porBairro = l.taxa_tipo === 'bairro';
  // por bairro sem nenhum bairro cadastrado não tem como cobrar: entrega fica desligada
  const entregaAtiva = bool(l.entrega_ativa, entrega.ativo ?? true) && (!porBairro || bairros.length > 0);
  const retiradaAtiva = bool(l.retirada_ativa, retirada.ativo ?? true);
  if (!entregaAtiva && !retiradaAtiva) return null;

  // Pix só aparece se a chave cadastrada no banco for válida (senão o cliente ficaria sem QR para pagar)
  const dadosPix = {
    chave: texto(l.pix_chave, 77) ?? pix.chave ?? '',
    tipo: ['telefone', 'cpf', 'cnpj', 'email', 'aleatoria'].includes(l.pix_tipo) ? l.pix_tipo : pix.tipo,
    nome: texto(l.pix_nome, 25) || pix.nome,
    cidade: texto(l.pix_cidade, 15) || pix.cidade,
  };
  const pixOk = Boolean(dadosPix.chave) && validarPix(dadosPix).length === 0;
  const formas = textos(l.pagamentos, 20).filter((f) => f !== 'pix' || pixOk);
  // se o Pix fosse a única forma e a chave não presta, mantém como o banco mandou (o banco só aceita o que está na lista dele)
  const pagamentos = pagamentosBase.filter((p) => (formas.length ? formas : textos(l.pagamentos, 20)).includes(p.id));

  const whats = typeof l.whatsapp === 'string' && /^[0-9]{12,13}$/.test(l.whatsapp) ? l.whatsapp : null;
  return {
    prefixoPedido: typeof l.prefixo_pedido === 'string' && /^[A-Z]{1,4}$/.test(l.prefixo_pedido) ? l.prefixo_pedido : undefined,
    whatsapp: whats,
    abertaManual: bool(l.aberta_manual, true),
    entrega: {
      ativo: entregaAtiva,
      tempo: tempo(l.entrega_tempo, entrega.tempo),
      pedidoMinimo: centavos(l.entrega_minimo) ?? entrega.pedidoMinimo ?? 0,
      taxa: porBairro ? { tipo: 'bairro', bairros } : { tipo: 'fixa', valor: centavos(l.taxa_fixa) ?? entrega.taxa?.valor ?? 0 },
      bairrosSemEntrega: textos(l.bairros_sem_entrega, 60),
      cidadesAtendidas: textos(l.cidades_atendidas, 60),
    },
    retirada: {
      ativo: retiradaAtiva,
      tempo: tempo(l.retirada_tempo, retirada.tempo),
      pedidoMinimo: centavos(l.retirada_minimo) ?? retirada.pedidoMinimo ?? 0,
      local: texto(l.retirada_local, 160) || retirada.local,
    },
    horario: {
      fuso: typeof l.fuso === 'string' && /^[A-Za-z_]+\/[A-Za-z_]+$/.test(l.fuso) ? l.fuso : 'America/Sao_Paulo',
      semana,
      bloquearPedidoFechado: bool(l.bloquear_fechado, true),
    },
    pix: dadosPix,
    pagamentos: pagamentos.length ? pagamentos : pagamentosBase,
  };
}

// ---------- busca no banco ----------
const TEMPO_LIMITE = 6000;
const CONSULTAS = {
  categorias: 'categorias?select=id,nome,ordem,ativo&ativo=eq.true',
  produtos: 'produtos?select=id,categoria_id,nome,descricao,preco,imagem,arte,destaque,disponivel,ativo,removiveis,ordem,'
    + 'grupos_opcao(chave,nome,tipo,obrigatorio,max,ordem,opcoes(chave,nome,preco,ativo,ordem))&ativo=eq.true',
  loja: 'loja?select=*&id=eq.1',
  bairros: 'bairros?select=nome,taxa,ativo&ativo=eq.true',
  horarios: 'horarios?select=dia,abre,fecha',
};

// Lê as 5 tabelas de uma vez. Qualquer falha (sem internet, demora, erro) -> lança erro;
// quem chama decide ficar com a reserva.
export async function buscarDoBanco(api, { fetchFn = fetch, tempo = TEMPO_LIMITE } = {}) {
  const base = String(api?.supabaseUrl || '').replace(/\/+$/, '');
  if (!base || !api?.chavePublica) throw new Error('Supabase não configurado');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), tempo);
  try {
    const pegar = async (q) => {
      const r = await fetchFn(`${base}/rest/v1/${q}`, {
        headers: { apikey: api.chavePublica, Authorization: `Bearer ${api.chavePublica}`, Accept: 'application/json' },
        signal: ctrl.signal, cache: 'no-store', credentials: 'omit',
      });
      if (!r.ok) throw new Error(`banco respondeu ${r.status}`);
      const dados = await r.json();
      if (!Array.isArray(dados)) throw new Error('resposta inesperada');
      return dados;
    };
    const nomes = Object.keys(CONSULTAS);
    const res = await Promise.all(nomes.map((k) => pegar(CONSULTAS[k])));
    return Object.fromEntries(nomes.map((k, i) => [k, res[i]]));
  } finally {
    clearTimeout(timer);
  }
}

// troca o conteúdo de um array sem trocar o objeto (as páginas já importaram a referência)
const trocar = (alvo, novos) => { alvo.splice(0, alvo.length, ...novos); };

// Aplica no site. Devolve { cardapio: bool, loja: bool } dizendo o que veio do banco.
// Cada parte é independente: cardápio ruim não impede a loja, e vice-versa.
export function aplicarDoBanco(dados, { CONFIG, PRODUTOS, CATEGORIAS, reserva = PRODUTOS }) {
  const usado = { cardapio: false, loja: false };
  const card = cardapioDoBanco(dados?.categorias, dados?.produtos, { supabaseUrl: CONFIG.api?.supabaseUrl, reserva });
  if (card) {
    trocar(CATEGORIAS, card.categorias);
    trocar(PRODUTOS, card.produtos);
    usado.cardapio = true;
  }
  const loja = lojaDoBanco(dados?.loja, dados?.bairros, dados?.horarios, { pagamentosBase: CONFIG.pagamentos, base: CONFIG });
  if (loja) {
    if (loja.prefixoPedido) CONFIG.marca.prefixoPedido = loja.prefixoPedido;
    if (loja.whatsapp) CONFIG.whatsapp.numero = loja.whatsapp;
    CONFIG.entrega = loja.entrega;
    CONFIG.retirada = loja.retirada;
    CONFIG.horario = { ...loja.horario, fechadaAgora: !loja.abertaManual };
    CONFIG.pix = { ...CONFIG.pix, ...loja.pix };
    CONFIG.pagamentos = loja.pagamentos;
    usado.loja = true;
  }
  return usado;
}

// Atalho para o main.js: busca e aplica; em qualquer erro fica tudo como estava (products.js e config.js).
export async function carregarDoBanco(alvos, opcoes = {}) {
  try {
    return aplicarDoBanco(await buscarDoBanco(alvos.CONFIG.api, opcoes), alvos);
  } catch (e) {
    console.warn('Cardápio do banco indisponível; usando o do site.', e?.message || e);
    return { cardapio: false, loja: false };
  }
}
