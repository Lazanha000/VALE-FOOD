// Funções pequenas usadas em todo o site.

import { CONFIG } from './config.js';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// progresso de p dentro do trecho [a, b], de 0 a 1
export const seg = (p, a, b) => clamp((p - a) / (b - a));

export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  soft: (t) => t * t * (3 - 2 * t),
};

export const brl = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// taxa de entrega: 0 vira "grátis"
export const taxaTxt = (centavos) => (centavos ? brl(centavos) : 'grátis');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// texto sem acento e minúsculo, para a busca
export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const digitos = (s) => String(s ?? '').replace(/\D/g, '');

// Chaves do localStorage, sempre com o id do cliente na frente. Sites publicados no
// mesmo endereço (lazanha000.github.io/...) dividem o mesmo armazenamento: sem o
// prefixo, um site leria e apagaria os dados do outro.
export const chaveLocal = (nome) => `${CONFIG.marca.id}:${nome}:v1`;
// tudo que o site grava no aparelho; o botão "apagar" da privacidade limpa esta lista
export const CHAVES = Object.freeze(Object.fromEntries(
  ['carrinho', 'dados', 'pedidos', 'envios', 'tema'].map((n) => [n, chaveLocal(n)]),
));

// letras do código do pedido: CONFIG.marca.prefixoPedido ou as 2 primeiras letras do id
// (só letras, para caber no txid do Pix e na conferência do código)
export const prefixoPedido = () => {
  const proprio = CONFIG.marca.prefixoPedido;
  return String(proprio || CONFIG.marca.id).replace(/[^a-z]/gi, '').slice(0, proprio ? 4 : 2).toUpperCase() || 'PD';
};

// localStorage pode falhar (aba anônima, bloqueio): nunca quebra o site
export const salvo = {
  ler(chave, padrao) {
    try {
      const v = localStorage.getItem(chave);
      return v ? JSON.parse(v) : padrao;
    } catch {
      return padrao;
    }
  },
  gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      /* sem armazenamento: segue sem persistir */
    }
  },
  apagar(chave) {
    try {
      localStorage.removeItem(chave);
    } catch {
      /* sem armazenamento */
    }
  },
};

export const movimentoReduzido = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// cria um elemento a partir de HTML
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const espera = (ms) => new Promise((r) => setTimeout(r, ms));
