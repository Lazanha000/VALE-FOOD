// ============================================================
// CARRINHO
// Estado único do carrinho, salvo no navegador. Os preços nunca
// são guardados: são sempre recalculados a partir do cardápio,
// então mudar um preço em products.js vale na hora.
// ============================================================

import { buscarProduto } from './products.js';
import { salvo, CHAVES } from './utils.js';
import { recebimentoPadrao, taxaPara, minimoVigente } from './delivery.js';

const CHAVE = CHAVES.carrinho;
const MAX_QTD = 20;
// teto de linhas diferentes: carrinho gigante gera mensagem de WhatsApp grande demais
const MAX_LINHAS = 30;
export const AVISO_CHEIO = `O carrinho aceita até ${MAX_LINHAS} itens diferentes. Aumente a quantidade de um item que já está nele ou finalize este pedido.`;
const ouvintes = new Set();

// Garante que um item só tenha opções que existem no produto
export function normalizarItem(item) {
  const prod = buscarProduto(item.produtoId);
  if (!prod) return null;
  const escolhas = {};
  for (const g of prod.opcoes) {
    const validos = new Set(g.escolhas.map((e) => e.id));
    let sel = (item.escolhas?.[g.id] || []).filter((id) => validos.has(id));
    sel = [...new Set(sel)];
    if (g.tipo === 'unica') {
      sel = sel.slice(0, 1);
      if (g.obrigatorio && sel.length === 0) sel = [g.escolhas[0].id];
    } else if (g.max) {
      sel = sel.slice(0, g.max);
    }
    if (sel.length) escolhas[g.id] = sel;
  }
  const remover = [...new Set((item.remover || []).filter((r) => prod.removiveis.includes(r)))];
  const obs = String(item.obs || '').trim().slice(0, 140);
  const qtd = Math.min(MAX_QTD, Math.max(1, Math.round(Number(item.qtd) || 1)));
  const base = { produtoId: prod.id, escolhas, remover, obs, qtd };
  return { ...base, chave: chaveDo(base) };
}

// mesmo produto + mesmas escolhas = mesma linha do carrinho
function chaveDo({ produtoId, escolhas, remover, obs }) {
  const esc = Object.keys(escolhas).sort().map((g) => `${g}=${[...escolhas[g]].sort().join('+')}`).join('&');
  return [produtoId, esc, [...remover].sort().join('+'), obs.toLowerCase()].join('|');
}

export function precoUnitario(item) {
  const prod = buscarProduto(item.produtoId);
  if (!prod) return 0;
  let total = prod.preco;
  for (const g of prod.opcoes) {
    for (const id of item.escolhas?.[g.id] || []) {
      const e = g.escolhas.find((x) => x.id === id);
      if (e) total += e.preco;
    }
  }
  return total;
}

// texto curto das escolhas ("Ao ponto · Bacon crocante · Sem cebola")
export function resumoEscolhas(item) {
  const prod = buscarProduto(item.produtoId);
  if (!prod) return [];
  const partes = [];
  for (const g of prod.opcoes) {
    for (const id of item.escolhas?.[g.id] || []) {
      const e = g.escolhas.find((x) => x.id === id);
      if (e) partes.push(e.nome);
    }
  }
  for (const r of item.remover || []) partes.push(`Sem ${r.toLowerCase()}`);
  return partes;
}

const lerSalvo = () => juntarIguais((salvo.ler(CHAVE, []) || []).map(normalizarItem).filter(Boolean)).slice(0, MAX_LINHAS);
let itens = lerSalvo();

function juntarIguais(lista) {
  const mapa = new Map();
  for (const it of lista) {
    const atual = mapa.get(it.chave);
    if (atual) atual.qtd = Math.min(MAX_QTD, atual.qtd + it.qtd);
    else mapa.set(it.chave, { ...it });
  }
  return [...mapa.values()];
}

function mudou() {
  salvo.gravar(CHAVE, itens.map(({ chave, ...resto }) => resto));
  ouvintes.forEach((fn) => fn(carrinho.estado()));
}

export const carrinho = {
  assinar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  },
  itens: () => itens.map((i) => ({ ...i })),
  quantidade: () => itens.reduce((s, i) => s + i.qtd, 0),
  // false se o item criaria uma linha nova com o carrinho já no teto
  cabe(novo) {
    const it = normalizarItem(novo);
    return !it || itens.length < MAX_LINHAS || itens.some((i) => i.chave === it.chave);
  },
  adicionar(novo) {
    const it = normalizarItem(novo);
    if (!it || buscarProduto(it.produtoId).esgotado || !carrinho.cabe(it)) return false;
    itens = juntarIguais([...itens, it]);
    mudou();
    return true;
  },
  // troca uma linha por outra versão (edição)
  substituir(chave, novo) {
    const it = normalizarItem(novo);
    if (!it || buscarProduto(it.produtoId).esgotado) return false;
    const idx = itens.findIndex((i) => i.chave === chave);
    if (idx < 0) return carrinho.adicionar(novo);
    const copia = [...itens];
    copia.splice(idx, 1, it);
    itens = juntarIguais(copia);
    mudou();
    return true;
  },
  definirQtd(chave, qtd) {
    const it = itens.find((i) => i.chave === chave);
    if (!it) return;
    if (qtd <= 0) return carrinho.remover(chave);
    it.qtd = Math.min(MAX_QTD, Math.round(qtd));
    mudou();
  },
  remover(chave) {
    itens = itens.filter((i) => i.chave !== chave);
    mudou();
  },
  limpar() {
    itens = [];
    mudou();
  },
  // o cardápio mudou (veio do banco): confere de novo o carrinho salvo.
  // Produto que saiu do cardápio sai do carrinho; opção que não existe mais é descartada.
  reconferir() {
    itens = lerSalvo();
    mudou();
  },
  // itens do carrinho cujo produto foi marcado como esgotado depois de adicionado
  esgotados() {
    return itens.filter((i) => buscarProduto(i.produtoId)?.esgotado).map((i) => ({ ...i }));
  },
  // rec = { modo, bairro }. Sem rec, vale o padrão: modo único já definido,
  // ou "ainda por escolher" quando o comércio oferece entrega e retirada.
  totais(rec = recebimentoPadrao()) {
    const subtotal = itens.reduce((s, i) => s + precoUnitario(i) * i.qtd, 0);
    const t = itens.length ? taxaPara(rec) : { valor: 0, pendente: false };
    const minimo = minimoVigente(rec);
    return {
      subtotal,
      taxa: t.valor,
      taxaPendente: t.pendente,
      modo: rec.modo,
      total: subtotal + t.valor,
      minimo,
      faltaMinimo: Math.max(0, minimo - subtotal),
    };
  },
  estado(rec) {
    return { itens: carrinho.itens(), quantidade: carrinho.quantidade(), esgotados: carrinho.esgotados(), ...carrinho.totais(rec) };
  },
  MAX_QTD,
  MAX_LINHAS,
};
