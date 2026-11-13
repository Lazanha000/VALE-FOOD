// Peças de interface compartilhadas: aviso rápido (toast), imagem
// de produto com reserva, contador do carrinho.

import { esc } from './utils.js';

let timerToast;
// acao opcional: { rotulo: 'Desfazer', fn }
export function avisar(texto, tipo = 'ok', acao = null) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.className = `toast toast--${tipo} is-on`;
  t.innerHTML = `<span>${esc(texto)}</span>${acao ? `<button type="button" class="toast-acao">${esc(acao.rotulo)}</button>` : ''}`;
  if (acao) {
    t.querySelector('button').addEventListener('click', () => {
      t.classList.remove('is-on');
      acao.fn();
    }, { once: true });
  }
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('is-on'), acao ? 5000 : 2600);
}

// <img> do produto: foto real; sem foto, um quadro neutro "Foto em breve"
const SEM_FOTO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e6e3dd"/><text x="200" y="158" font-family="sans-serif" font-size="22" fill="#8a857c" text-anchor="middle">Foto em breve</text></svg>');
export function imgProduto(prod, classe = '', tamanho = 'cartao') {
  const lazy = tamanho === 'cartao' ? 'loading="lazy" decoding="async"' : 'decoding="async"';
  // foto real: se falhar, tenta de novo (nunca troca por outra imagem)
  return prod.imagem
    ? `<img class="${classe} is-foto" src="${esc(prod.imagem)}" alt="${esc(prod.nome)}" ${lazy} data-foto="${esc(prod.imagem)}">`
    : `<img class="${classe}" src="${SEM_FOTO}" alt="${esc(prod.nome)}" ${lazy}>`;
}

// Foto que falhou ao carregar (internet instável, servidor lento): tenta de novo
// até 4 vezes, com espera crescente. Fotos reais nunca viram desenho.
// <img data-foto>: foto do cardápio. <img data-fallback> (abertura): só usa o desenho
// depois de esgotar as tentativas.
export const TENTATIVAS_FOTO = 4;
export function tentarDeNovo(img) {
  const n = +(img.dataset.tentativas || 0);
  const original = img.dataset.foto || img.dataset.original || img.getAttribute('src');
  if (!img.dataset.original) img.dataset.original = original;
  // com srcset o navegador ignora a troca de src: a partir daqui fica só a foto inteira
  img.removeAttribute('srcset');
  img.removeAttribute('sizes');
  if (n >= TENTATIVAS_FOTO) return false;
  img.dataset.tentativas = String(n + 1);
  setTimeout(() => {
    const sep = original.includes('?') ? '&' : '?';
    img.src = `${original}${sep}r=${n + 1}`;
  }, 500 * 2 ** n);
  return true;
}
export function instalarReservaDeImagens() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.src.startsWith('data:')) return;
    if (img.dataset.foto) { tentarDeNovo(img); return; }
    if (img.dataset.fallback && !tentarDeNovo(img)) {
      img.classList.remove('is-foto');
      img.src = img.dataset.fallback;
    }
  }, true);
}

export function atualizarContador(qtd, animar = false) {
  const b = document.getElementById('cart-count');
  const link = document.getElementById('cart-link');
  if (!b || !link) return;
  b.textContent = qtd;
  b.hidden = qtd === 0;
  link.setAttribute('aria-label', qtd ? `Carrinho, ${qtd} ${qtd === 1 ? 'item' : 'itens'}` : 'Carrinho vazio');
  if (animar) {
    link.classList.remove('is-bump');
    void link.offsetWidth;
    link.classList.add('is-bump');
  }
}
