// ============================================================
// ESTABELECIMENTO ATUAL E VITRINE
// O site antigo atende UMA loja: cardápio, entrega, horário e Pix vêm de CONFIG e PRODUTOS.
// Aqui a loja escolhida pelo cliente é colocada nesses mesmos objetos (trocados no lugar),
// e assim cardápio, carrinho, checkout, Pix e acompanhamento continuam sendo os do site antigo.
// Com o banco ligado, a vitrine e a loja vêm da tabela `estabelecimentos` (supabase/plataforma.sql);
// sem ele (modo demonstração), dos exemplos de dados.js.
// ============================================================

import { CONFIG } from '../config.js';
import { PRODUTOS, CATEGORIAS, PRODUTOS_BASE } from '../products.js';
import { carrinho } from '../store.js';
import { salvo } from '../utils.js';
import { situacaoLoja } from '../horario.js';
import { avisar } from '../ui.js';
import { ESTABS, estabPorId } from './dados.js';
import { modoDemo } from '../services/api.js';
import { buscarDoBanco, aplicarDoBanco, lerDoBanco, idLojaValido, fotoDoBanco } from '../services/cardapio.js';

const CHAVE_LOJA = 'modelo:loja:v1';
const PAGAMENTOS_BASE = structuredClone(CONFIG.pagamentos);
const MARCA_BASE = { ...CONFIG.marca };
let atual = null;
let vitrine = null;   // lista do banco (null = ainda não leu)

export const lojaAtual = () => atual;
export const usarBanco = () => !modoDemo();

// ---------- vitrine ----------
const DIAS = [null, 'seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const semanaDe = (horarios) => {
  const s = { seg: [], ter: [], qua: [], qui: [], sex: [], sab: [], dom: [] };
  for (const h of Array.isArray(horarios) ? horarios : []) {
    const d = DIAS[h?.dia];
    if (d && typeof h.abre === 'string' && typeof h.fecha === 'string') s[d].push([h.abre.slice(0, 5), h.fecha.slice(0, 5)]);
  }
  for (const d of Object.keys(s)) s[d].sort((a, b) => a[0].localeCompare(b[0]));
  return s;
};
// linha do banco -> o formato que as páginas da vitrine usam (o mesmo de dados.js)
export function estabDoBanco(r) {
  const qtd = Number.isInteger(r.avaliacoes_qtd) ? r.avaliacoes_qtd : 0;
  return {
    id: r.id,
    nome: String(r.nome || ''),
    nomeCurto: String(r.nome_curto || ''),
    sufixo: String(r.sufixo || ''),
    cat: r.categoria,
    cidade: String(r.cidade || ''),
    descricao: String(r.descricao || ''),
    logo: fotoDoBanco(r.logo, CONFIG.api?.supabaseUrl),
    nota: qtd ? r.avaliacoes_soma / qtd : 0,
    avaliacoes: qtd,
    fechadaAgora: r.aberta_manual === false,
    entrega: {
      ativo: r.entrega_ativa !== false,
      tempo: String(r.entrega_tempo || ''),
      taxa: r.taxa_tipo === 'bairro' ? { tipo: 'bairro' } : { tipo: 'fixa', valor: Number.isInteger(r.taxa_fixa) ? r.taxa_fixa : 0 },
    },
    horario: semanaDe(r.horarios),
  };
}

const COLUNAS_VITRINE = 'id,nome,nome_curto,sufixo,categoria,cidade,descricao,logo,entrega_ativa,entrega_tempo,taxa_tipo,taxa_fixa,'
  + 'aberta_manual,avaliacoes_qtd,avaliacoes_soma,horarios(dia,abre,fecha)';

// Lista de estabelecimentos aprovados. Sem banco: os exemplos. Erro de rede: lança (a página mostra o aviso).
export async function carregarVitrine({ forcar = false } = {}) {
  if (!usarBanco()) return ESTABS;
  if (vitrine && !forcar) return vitrine;
  const linhas = await lerDoBanco(CONFIG.api, `estabelecimentos?select=${COLUNAS_VITRINE}&order=nome`);
  vitrine = linhas.filter((r) => idLojaValido(r?.id)).map(estabDoBanco);
  return vitrine;
}
export const vitrineAtual = () => (usarBanco() ? vitrine || [] : ESTABS);

// ---------- entrar numa loja ----------
function trocarCardapio(produtos, categorias) {
  PRODUTOS.splice(0, PRODUTOS.length, ...produtos);
  CATEGORIAS.splice(0, CATEGORIAS.length, ...categorias);
}
function marcaDa(e) {
  CONFIG.marca = { ...MARCA_BASE, nome: e.nome, nomeCurto: e.nomeCurto || e.nome, sufixo: e.sufixo || '', descricao: e.descricao,
    local: `${e.cidade}, MG` };
}

// Devolve true se entrou. Trocar de loja com itens no carrinho esvazia o carrinho.
export async function entrarNaLoja(id) {
  if (!usarBanco()) {
    const e = estabPorId(id);
    if (!e) return false;
    esvaziarSeTrocou(e.id);
    atual = e;
    marcaDa(e);
    CONFIG.estabelecimentoId = e.id;
    CONFIG.entrega = structuredClone(e.entrega);
    CONFIG.retirada = structuredClone(e.retirada);
    CONFIG.horario = { ...CONFIG.horario, semana: structuredClone(e.horario), bloquearPedidoFechado: true };
    CONFIG.whatsapp = { ...CONFIG.whatsapp, numero: e.whatsapp };
    CONFIG.pix = { ...e.pix };
    trocarCardapio(structuredClone(e.produtos), structuredClone(e.categorias));
    salvo.gravar(CHAVE_LOJA, id);
    return true;
  }
  if (!idLojaValido(id)) return false;
  const dados = await buscarDoBanco(CONFIG.api, { estabelecimento: id });
  const linha = dados.loja?.[0];
  if (!linha) return false;   // não existe ou não está aprovado
  esvaziarSeTrocou(id);
  const e = estabDoBanco({ ...linha, horarios: dados.horarios });
  atual = e;
  marcaDa(e);
  CONFIG.estabelecimentoId = id;
  // o que aplicarDoBanco não sobrescreve sozinho volta ao padrão (senão sobraria da loja anterior)
  CONFIG.pagamentos = structuredClone(PAGAMENTOS_BASE);
  CONFIG.whatsapp = { ...CONFIG.whatsapp, numero: null };
  CONFIG.pix = { chave: '', tipo: null, nome: '', cidade: '' };
  CONFIG.entrega = { ...CONFIG.entrega, ativo: false };
  CONFIG.retirada = { ...CONFIG.retirada, ativo: false };
  trocarCardapio([], []);
  aplicarDoBanco(dados, { CONFIG, PRODUTOS, CATEGORIAS, reserva: PRODUTOS_BASE });
  salvo.gravar(CHAVE_LOJA, id);
  return true;
}

function esvaziarSeTrocou(id) {
  if (atual && atual.id !== id && carrinho.quantidade() > 0) {
    carrinho.limpar();
    avisar('O carrinho foi esvaziado: cada pedido é de um estabelecimento só.');
  }
}

// aberto agora? Reaproveita situacaoLoja() do site antigo trocando o horário por um instante.
export function situacaoDe(e) {
  const antes = CONFIG.horario;
  CONFIG.horario = { ...antes, semana: e.horario, fechadaAgora: Boolean(e.fechadaAgora) };
  try { return situacaoLoja(); } finally { CONFIG.horario = antes; }
}

export function lojaGuardada() {
  const id = salvo.ler(CHAVE_LOJA, null);
  if (!usarBanco()) return typeof id === 'string' && estabPorId(id) ? id : null;
  return idLojaValido(id) ? id : null;
}
