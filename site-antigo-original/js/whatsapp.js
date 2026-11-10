// Botão flutuante do WhatsApp. O número vem de CONFIG.whatsapp.numero.
// Sem número configurado, o botão avisa que é uma demonstração e
// não abre conversa nenhuma.

import { CONFIG } from './config.js';
import { esc, digitos } from './utils.js';

// Aceita com ou sem o DDI: '11987654321' (DDD + número) vira '5511987654321'.
export const numeroWhatsapp = (bruto = CONFIG.whatsapp.numero) => {
  const d = digitos(bruto || '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};
const numero = () => numeroWhatsapp();
export const whatsappAtivo = () => numero().length >= 12;
// Links muito longos falham em apps e navegadores embutidos (Instagram, Facebook).
// Acentos viram até 9 caracteres no link, por isso o teto é medido no link pronto.
export const LIMITE_URL = 1800;
const montar = (texto) => `https://wa.me/${numero()}?text=${encodeURIComponent(texto)}`;
export const cabeNoLink = (texto) => montar(texto).length <= LIMITE_URL;
// último recurso: corta o fim do texto (por caractere inteiro, sem quebrar emoji)
export const linkWhatsapp = (texto) => {
  if (cabeNoLink(texto)) return montar(texto);
  const letras = Array.from(texto);
  const aviso = '\n(mensagem cortada)';
  let [lo, hi] = [0, letras.length];
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (cabeNoLink(letras.slice(0, meio).join('') + aviso)) lo = meio; else hi = meio - 1;
  }
  return montar(letras.slice(0, lo).join('') + aviso);
};


const ICONE = `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M16 4C9.4 4 4 9 4 15.2c0 2.6 1 5 2.6 6.9L5.5 27.5l5.7-1.9c1.5.7 3.1 1 4.8 1 6.6 0 12-5 12-11.3S22.6 4 16 4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12.2 10.6c.4 0 .7 0 .9.6l1 2.3c.1.3 0 .6-.2.9l-.7.8c.8 1.6 2.1 2.9 3.8 3.7l.8-.8c.3-.3.6-.3.9-.2l2.3 1c.5.2.6.5.5 1-.3 1.4-1.6 2.2-2.9 2-3.9-.6-7.4-4-8-7.8-.2-1.3.5-2.6 1.6-3.5z" fill="currentColor"/></svg>`;

let botao;
let rotaAtual = '';

// No celular, o botão se recolhe enquanto a pessoa rola para baixo
// (para não cobrir botões) e volta quando ela para ou sobe.
function recolherAoRolar(host) {
  let ultimoY = window.scrollY;
  let timer;
  window.addEventListener('scroll', () => {
    if (window.innerWidth >= 760) return;
    const y = window.scrollY;
    if (y > ultimoY + 4) host.classList.add('is-recolhido');
    else if (y < ultimoY - 4) host.classList.remove('is-recolhido');
    ultimoY = y;
    clearTimeout(timer);
    timer = setTimeout(() => host.classList.remove('is-recolhido'), 900);
  }, { passive: true });
}

export function montarWhatsapp() {
  const host = document.getElementById('wa');
  if (!host) return;
  recolherAoRolar(host);
  if (whatsappAtivo()) {
    host.innerHTML = `<a class="wa-btn" href="${esc(linkWhatsapp(CONFIG.whatsapp.mensagemPadrao))}" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp">${ICONE}<span class="wa-txt">Fale no WhatsApp</span></a>`;
    botao = host.querySelector('a');
    return;
  }
  host.innerHTML = `
    <button type="button" class="wa-btn" aria-expanded="false" aria-controls="wa-pop" aria-label="WhatsApp (demonstração)">${ICONE}<span class="wa-txt">WhatsApp</span></button>
    <div class="wa-pop" id="wa-pop" role="status" hidden>
      <strong>WhatsApp em demonstração</strong>
      <p>O número do restaurante ainda não foi configurado, então nenhuma conversa é aberta.</p>
    </div>`;
  botao = host.querySelector('button');
  const pop = host.querySelector('.wa-pop');
  botao.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    botao.setAttribute('aria-expanded', String(!pop.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!host.contains(e.target) && !pop.hidden) {
      pop.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) {
      pop.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      botao.focus();
    }
  });
}

// mensagem inicial muda conforme a página
export function contextoWhatsapp(rota) {
  rotaAtual = rota;
  if (botao && botao.tagName === 'A') {
    botao.href = linkWhatsapp(CONFIG.whatsapp.mensagens?.[rotaAtual] || CONFIG.whatsapp.mensagemPadrao);
  }
}

