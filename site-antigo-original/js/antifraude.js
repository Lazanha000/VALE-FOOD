// Proteção LEVE contra pedido falso, toda no navegador. Quem sabe programar contorna:
// serve para barrar engano, curioso e robô simples. Proteção de verdade (limite por IP,
// captcha verificado no servidor) só existe com backend (Fase 5).

import { digitos } from './utils.js';

export const LIMITE_PEDIDOS = 3;            // por aparelho...
export const JANELA_MS = 10 * 60 * 1000;    // ...a cada 10 minutos
export const TEMPO_MINIMO_MS = 3000;        // formulário preenchido mais rápido que isso não é gente

const DDDS = new Set(('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 '
  + '51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99').split(' '));

// DDD existente, celular (11 dígitos) começa com 9, fixo (10) com 2 a 5, sem número repetido (999999999)
export function telefoneValido(v) {
  const d = digitos(v);
  if (![10, 11].includes(d.length) || !DDDS.has(d.slice(0, 2))) return false;
  const num = d.slice(2);
  if (new Set(num).size === 1) return false;
  return d.length === 11 ? num[0] === '9' : /[2-5]/.test(num[0]);
}

// quantos pedidos já saíram deste aparelho na janela; devolve { bloqueado, esperaMin }
export function limiteDeEnvios(horarios, agora = Date.now()) {
  const recentes = (horarios || []).filter((t) => agora - t < JANELA_MS).sort((a, b) => a - b);
  if (recentes.length < LIMITE_PEDIDOS) return { bloqueado: false, esperaMin: 0 };
  return { bloqueado: true, esperaMin: Math.ceil((recentes[0] + JANELA_MS - agora) / 60000) };
}

// 'isca' = campo escondido que gente não vê e robô preenche; ms = tempo desde que o formulário abriu
export function pareceRobo({ isca = '', ms = Infinity } = {}) {
  if (String(isca).trim()) return 'isca';
  if (ms < TEMPO_MINIMO_MS) return 'rapido';
  return '';
}
