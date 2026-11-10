// ============================================================
// ESTABELECIMENTO ATUAL
// O site antigo atende UMA loja: cardápio, entrega, horário e Pix vêm de CONFIG e PRODUTOS.
// Aqui a loja escolhida pelo cliente é colocada nesses mesmos objetos (trocados no lugar,
// como js/services/cardapio.js já faz com o banco). Assim cardápio, carrinho, checkout, Pix,
// WhatsApp e acompanhamento continuam sendo os do site antigo, sem mudança.
// Com o Supabase ligado, esta troca passa a ler da tabela `estabelecimentos`.
// ============================================================

import { CONFIG } from '../config.js';
import { PRODUTOS, CATEGORIAS } from '../products.js';
import { carrinho } from '../store.js';
import { salvo } from '../utils.js';
import { situacaoLoja } from '../horario.js';
import { avisar } from '../ui.js';
import { estabPorId } from './dados.js';

const CHAVE_LOJA = 'modelo:loja:v1';
let atual = null;

export const lojaAtual = () => atual;

export function entrarNaLoja(id) {
  const e = estabPorId(id);
  if (!e) return false;
  if (atual && atual.id !== e.id && carrinho.quantidade() > 0) {
    carrinho.limpar();
    avisar('O carrinho foi esvaziado: cada pedido é de um estabelecimento só.');
  }
  atual = e;
  CONFIG.marca = { ...CONFIG.marca, nome: e.nome, nomeCurto: e.nomeCurto, sufixo: e.sufixo, descricao: e.descricao, local: `${e.cidade}, MG`, cinema: Boolean(e.cinema) };
  CONFIG.entrega = structuredClone(e.entrega);
  CONFIG.retirada = structuredClone(e.retirada);
  CONFIG.horario = { ...CONFIG.horario, semana: structuredClone(e.horario), bloquearPedidoFechado: true };
  CONFIG.whatsapp = { ...CONFIG.whatsapp, numero: e.whatsapp };
  CONFIG.pix = { ...e.pix };
  CONFIG.privacidade = { ...CONFIG.privacidade, controlador: e.nome };
  // troca o cardápio no lugar (as telas do site antigo leem estas listas)
  PRODUTOS.splice(0, PRODUTOS.length, ...structuredClone(e.produtos));
  CATEGORIAS.splice(0, CATEGORIAS.length, ...structuredClone(e.categorias));
  salvo.gravar(CHAVE_LOJA, id);
  return true;
}

// aberto agora? Reaproveita situacaoLoja() do site antigo trocando o horário por um instante.
export function situacaoDe(e) {
  const antes = CONFIG.horario;
  CONFIG.horario = { ...antes, semana: e.horario, fechadaAgora: false };
  try { return situacaoLoja(); } finally { CONFIG.horario = antes; }
}

export function lojaGuardada() {
  const id = salvo.ler(CHAVE_LOJA, null);
  return typeof id === 'string' && estabPorId(id) ? id : null;
}
