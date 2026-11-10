// Regras do painel sem tela (testáveis em Node): andamento do pedido, horário,
// conversão do pedido do banco para a comanda e as consultas ao /rest/v1.

import { digitos } from '../js/utils.js';

export const STATUS = {
  recebido: 'Recebido',
  preparo: 'Em preparo',
  pronto: 'Pronto',
  saiu: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
export const EM_ANDAMENTO = ['recebido', 'preparo', 'pronto', 'saiu'];
export const PAGAMENTOS = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro' };

// próximo passo do pedido (botão principal do cartão). null = já terminou.
export function proximoPasso(p) {
  const retirada = p.modo === 'retirada';
  switch (p.status) {
    case 'recebido': return { status: 'preparo', rotulo: 'Começar preparo' };
    case 'preparo': return { status: 'pronto', rotulo: 'Marcar pronto' };
    case 'pronto': return retirada ? { status: 'entregue', rotulo: 'Cliente retirou' } : { status: 'saiu', rotulo: 'Saiu para entrega' };
    case 'saiu': return { status: 'entregue', rotulo: 'Marcar entregue' };
    default: return null;
  }
}

// status que fazem sentido para o modo (retirada não "sai para entrega")
export const statusPara = (modo) => Object.keys(STATUS).filter((s) => !(s === 'saiu' && modo === 'retirada'));

// ---------- horário (mesma regra de public._loja_aberta no banco) ----------
// horarios = linhas da tabela: [{ dia: 1..7 (segunda..domingo), abre: 'HH:MM[:SS]', fecha }]
const minutos = (t) => {
  const m = /^(\d{2}):(\d{2})/.exec(String(t || ''));
  return m ? +m[1] * 60 + +m[2] : NaN;
};
const SEMANA = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
export function dentroDoHorario(horarios, fuso = 'America/Sao_Paulo', data = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(data);
  const pega = (t) => partes.find((x) => x.type === t)?.value;
  const hoje = SEMANA[pega('weekday')];
  const ontem = hoje === 1 ? 7 : hoje - 1;
  const h = (+pega('hour') % 24) * 60 + +pega('minute');
  return (horarios || []).some((x) => {
    const a = minutos(x.abre);
    const f = minutos(x.fecha);
    if (!Number.isFinite(a) || !Number.isFinite(f)) return false;
    if (x.dia === hoje && a < f) return h >= a && h < f;
    if (x.dia === hoje && f < a && h >= a) return true;        // vira a meia-noite: parte de hoje
    return x.dia === ontem && f < a && h < f;                 // parte que veio de ontem
  });
}

// ---------- dinheiro (campos do dono) ----------
// "28,90", "R$ 1.234,5", "30" -> centavos. Vazio, negativo ou lixo -> null. Teto: R$ 10.000,00 (o do banco).
export function centavosDe(texto) {
  const t = String(texto ?? '').replace(/R\$|\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([,.]\d{1,2})?$/.test(t)) return null;
  const c = Math.round(Number(/,/.test(t) || /\.\d{3}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t) * 100);
  return Number.isInteger(c) && c >= 0 && c <= 1000000 ? c : null;
}
// centavos -> "28,90" (para o campo; o brl() do site põe o "R$")
export const reaisCampo = (c) => (Number(c || 0) / 100).toFixed(2).replace('.', ',');

// ---------- horários (aba Loja) ----------
export const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const hhmm = (t) => String(t || '').slice(0, 5);
// linhas da tabela -> [[faixas de segunda], ..., [faixas de domingo]], cada faixa { abre: 'HH:MM', fecha }
export function horariosPorDia(horarios) {
  const dias = DIAS.map(() => []);
  for (const h of horarios || []) if (h.dia >= 1 && h.dia <= 7) dias[h.dia - 1].push({ abre: hhmm(h.abre), fecha: hhmm(h.fecha) });
  dias.forEach((f) => f.sort((a, b) => a.abre.localeCompare(b.abre)));
  return dias;
}
// de volta para o formato do banco (salvar_horarios). Devolve { faixas } ou { erro } com a mensagem.
export function faixasParaSalvar(dias) {
  const faixas = [];
  for (let i = 0; i < 7; i++) {
    for (const f of dias[i] || []) {
      if (!/^\d{2}:\d{2}$/.test(f.abre) || !/^\d{2}:\d{2}$/.test(f.fecha)) return { erro: `${DIAS[i]}: preencha abertura e fechamento.` };
      if (f.abre === f.fecha) return { erro: `${DIAS[i]}: abre e fecha no mesmo horário. Para o dia todo, use 00:00 até 23:59.` };
      faixas.push({ dia: i + 1, abre: f.abre, fecha: f.fecha });
    }
    if ((dias[i] || []).length > 4) return { erro: `${DIAS[i]}: no máximo 4 horários por dia.` };
  }
  return { faixas };
}

// ---------- textos ----------
export const hora = (iso, fuso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso });

export function haQuanto(iso, agora = Date.now()) {
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

// telefone do banco (só dígitos, com DDD) -> "(33) 98877-6655" e links
export function telefoneTxt(t) {
  const d = digitos(t);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
export const linkTelefone = (t) => `tel:+55${digitos(t)}`;
export const linkWhatsappCliente = (t) => `https://wa.me/55${digitos(t)}`;

// linhas de detalhe do item: "Tamanho: Média", "Sem cebola"
export const detalhesItem = (i) => [
  ...(Array.isArray(i.escolhas) ? i.escolhas : []).map((e) => `${e.grupo}: ${e.opcao}`),
  ...(Array.isArray(i.remover) ? i.remover : []).map((x) => `Sem ${String(x).toLowerCase()}`),
];

// pedido do banco -> formato de js/comanda.js (impressão)
export function paraComanda(p) {
  return {
    codigo: p.codigo,
    criadoEm: p.criado_em,
    recebimento: { modo: p.modo },
    entrega: p.entrega || null,
    cliente: { nome: p.cliente_nome, telefone: telefoneTxt(p.cliente_telefone) },
    itens: (p.pedido_itens || []).map((i) => ({
      qtd: i.qtd, nome: i.nome, precoUnitario: i.preco_unitario,
      escolhas: [...(i.escolhas || []).map((e) => e.opcao), ...(i.remover || []).map((x) => `Sem ${String(x).toLowerCase()}`)],
      obs: i.obs || '',
    })),
    totais: { subtotal: p.subtotal, desconto: p.desconto || 0, taxa: p.taxa, total: p.total },
    pagamento: { nome: PAGAMENTOS[p.pagamento_forma] || p.pagamento_forma, trocoPara: p.troco_para },
    obs: p.obs || '',
  };
}

// ---------- consultas ao /rest/v1 ----------
const COLUNAS_PEDIDO = 'id,codigo,criado_em,status,pagamento_status,modo,cliente_nome,cliente_telefone,entrega,'
  + 'pagamento_forma,troco_para,obs,subtotal,desconto,taxa,total,pedido_itens(ordem,nome,qtd,preco_unitario,escolhas,remover,obs)';
// em andamento (de qualquer dia) + todos das últimas 24 h
export function consultaPedidos(agora = Date.now()) {
  const desde = new Date(agora - 24 * 3600 * 1000).toISOString();
  return `pedidos?select=${COLUNAS_PEDIDO}&or=(status.in.(${EM_ANDAMENTO.join(',')}),criado_em.gte.${desde})`
    + '&order=criado_em.desc&pedido_itens.order=ordem&limit=300';
}
export const CONSULTAS = {
  equipe: (uid) => `equipe?select=nome,papel&user_id=eq.${encodeURIComponent(uid)}`,
  loja: 'loja?select=aberta_manual,bloquear_fechado,fuso,entrega_ativa,entrega_tempo,entrega_minimo,taxa_tipo,taxa_fixa,'
    + 'retirada_ativa,retirada_tempo,retirada_minimo&id=eq.1',
  horarios: 'horarios?select=dia,abre,fecha',
  categorias: 'categorias?select=id,nome,ordem&order=ordem',
  produtos: 'produtos?select=id,nome,categoria_id,preco,disponivel,ativo,ordem,descricao,imagem,grupos_opcao(id,nome,ordem,opcoes(id,nome,preco,ativo,ordem))&order=ordem',
  // só o dono usa (a lista inteira, com os inativos: a RLS mostra para a equipe)
  bairros: 'bairros?select=nome,taxa,ativo&order=nome',
};

// ---------- resumo do dia (fechamento de caixa) ----------
// Pedidos feitos hoje (no fuso da loja), sem os cancelados: quantidade, total e total por forma de pagamento.
const diaNoFuso = (d, fuso) => new Date(d).toLocaleDateString('en-CA', { timeZone: fuso });
export function resumoDoDia(pedidos, fuso = 'America/Sao_Paulo', agora = Date.now()) {
  const hoje = diaNoFuso(agora, fuso);
  const validos = (pedidos || []).filter((p) => p.status !== 'cancelado' && diaNoFuso(p.criado_em, fuso) === hoje);
  const porForma = {};
  for (const p of validos) porForma[p.pagamento_forma] = (porForma[p.pagamento_forma] || 0) + p.total;
  return {
    quantidade: validos.length,
    total: validos.reduce((s, p) => s + p.total, 0),
    porForma,
    pixPendente: validos.filter((p) => p.pagamento_forma === 'pix' && p.pagamento_status !== 'confirmado').length,
  };
}

// ---------- produto novo ----------
// "X-Bacon Duplo!" -> "x-bacon-duplo"; repetido ganha -2, -3... (o id vira parte do endereço da foto)
export function idDoNome(nome, existentes = []) {
  const base = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'produto';
  const usados = new Set(existentes);
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
}
// caminho da foto nova no Storage: '<id>/<16 letras aleatórias>.<ext>' (nome novo a cada troca: o celular
// do cliente não fica com a foto velha guardada)
export const caminhoFotoNova = (id, ext, aleatorio = crypto.randomUUID().replace(/-/g, '').slice(0, 16)) => `${id}/${aleatorio}.${ext}`;
// produtos.imagem é do Storage (e não um arquivo do site em assets/)?
export const fotoDoStorage = (imagem) => typeof imagem === 'string' && /^[a-z0-9-]{1,60}\/[A-Za-z0-9-]{8,64}\.(webp|jpg|png)$/.test(imagem);
