// Pix estático (BR Code "copia e cola" + QR). Sem backend: o dono confere
// o recebimento no app do banco. Dados do recebedor vêm de CONFIG.pix.

// O gerador de QR (55 KB) só é baixado quando precisa (finalizar/pedido), para não atrasar a abertura.
let qrcode = null;
let carregando = null;
export function carregarQr() {
  if (qrcode) return Promise.resolve();
  carregando ??= import('./vendor/qrcode.js').then((m) => { qrcode = m.default; });
  return carregando;
}
import { digitos } from './utils.js';

const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;

// nome e cidade do BR Code: maiúsculas, sem acento, só A-Z 0-9 e espaço
const limpo = (s, max) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function crc16(texto) {
  let c = 0xFFFF;
  for (let i = 0; i < texto.length; i++) {
    c ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

// formato da chave dentro do BR Code (telefone precisa de +55)
export function formatarChave(chave, tipo) {
  const c = String(chave || '').trim();
  if (tipo === 'telefone') {
    const d = digitos(c);
    return `+${d.length === 10 || d.length === 11 ? '55' : ''}${d}`;
  }
  if (tipo === 'cpf' || tipo === 'cnpj') return digitos(c);
  if (tipo === 'email') return c.toLowerCase();
  return c;
}

// dígitos verificadores (mesma conta da Receita)
function cpfValido(d) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += +d[i] * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== +d[t]) return false;
  }
  return true;
}
function cnpjValido(d) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  for (const t of [12, 13]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += +d[i] * ((t - 1 - i) % 8 + 2);
    const dv = s % 11 < 2 ? 0 : 11 - (s % 11);
    if (dv !== +d[t]) return false;
  }
  return true;
}

// Confere a chave e o titular do Pix. Chave errada gera um QR válido que paga OUTRA
// pessoa, então qualquer problema aqui desliga o QR. -> lista de problemas ([] = ok)
export function validarPix(p) {
  const erros = [];
  const chave = String(p?.chave || '').trim();
  const d = digitos(chave);
  if (!chave) erros.push('Pix sem chave.');
  else if (p.tipo === 'telefone') {
    const nacional = (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
    if (nacional.length < 10 || nacional.length > 11 || /[^\d\s()+-]/.test(chave)) erros.push('Pix: telefone precisa de DDD + número (10 ou 11 dígitos).');
  } else if (p.tipo === 'cpf') {
    if (!cpfValido(d) || /[^\d.\s-]/.test(chave)) erros.push('Pix: CPF inválido (confira os dígitos).');
  } else if (p.tipo === 'cnpj') {
    if (!cnpjValido(d) || /[^\d./\s-]/.test(chave)) erros.push('Pix: CNPJ inválido (confira os dígitos).');
  } else if (p.tipo === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(chave)) erros.push('Pix: e-mail inválido.');
  } else if (p.tipo === 'aleatoria') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) erros.push('Pix: chave aleatória deve ter o formato 8-4-4-4-12 (letras a-f e números).');
  } else erros.push(`Pix: tipo de chave desconhecido (${p.tipo}). Use telefone, cpf, cnpj, email ou aleatoria.`);
  if (chave && formatarChave(chave, p.tipo).length > 77) erros.push('Pix: chave com mais de 77 caracteres.');
  const nome = limpo(p?.nome, 25);
  const cidade = limpo(p?.cidade, 15);
  if (!nome) erros.push('Pix: nome do titular vazio (precisa de letras ou números).');
  else if (nome === 'SUA MARCA') erros.push('Pix: troque o nome provisório SUA MARCA pelo nome do titular da chave.');
  if (!cidade) erros.push('Pix: cidade vazia (precisa de letras ou números).');
  else if (cidade === 'SUA CIDADE') erros.push('Pix: troque a cidade provisória SUA CIDADE pela cidade do titular.');
  return erros;
}

export const pixConfigurado = (p) => Boolean(p) && validarPix(p).length === 0;

// centavos > 0 inclui o valor; txid só letras/números (até 25), senão '***'
export function brCode({ chave, tipo, nome, cidade, centavos = 0, txid = '' }) {
  const id = String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const corpo = tlv('00', '01')
    + tlv('01', '11')
    + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', formatarChave(chave, tipo)))
    + tlv('52', '0000')
    + tlv('53', '986')
    + (centavos > 0 ? tlv('54', (centavos / 100).toFixed(2)) : '')
    + tlv('58', 'BR')
    + tlv('59', limpo(nome, 25))
    + tlv('60', limpo(cidade, 15))
    + tlv('62', tlv('05', id))
    + '6304';
  return corpo + crc16(corpo);
}

// QR em SVG (nível M); mostrado com fundo branco para leitura em qualquer tema
// Sem o gerador carregado ainda: devolve um espaço reservado que é preenchido sozinho em seguida.
export function qrSvg(texto, rotulo = 'QR Code do Pix') {
  if (!qrcode) {
    carregarQr().then(() => {
      document.querySelectorAll('[data-qr-pendente]').forEach((el) => {
        el.outerHTML = qrSvg(el.dataset.qrPendente, el.dataset.qrRotulo);
      });
    });
    const at = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<span class="esqueleto" style="display:block;aspect-ratio:1;width:100%" data-qr-pendente="${at(texto)}" data-qr-rotulo="${at(rotulo)}"></span>`;
  }
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, alt: rotulo, title: rotulo });
}
