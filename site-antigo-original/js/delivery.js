// Regras de entrega e retirada, lidas de CONFIG.entrega / CONFIG.retirada.
// Nada aqui guarda estado: recebe a escolha do cliente e devolve números.
//
// "recebimento" = { modo: 'entrega' | 'retirada' | null, bairro: 'Centro' | null }

import { CONFIG } from './config.js';
import { brl, taxaTxt, digitos } from './utils.js';
import { validarPix } from './pix.js';
import { AVISOS_AJUSTES } from './ajustar.js';

export const NOMES = { entrega: 'Entrega', retirada: 'Retirada' };

const cfg = (modo) => (modo === 'retirada' ? CONFIG.retirada : CONFIG.entrega);

const sem = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// bairro digitado está na lista de CONFIG.entrega.bairrosSemEntrega? (comparação por trecho, sem acento)
export const semEntregaNoBairro = (bairro) => {
  const b = sem(bairro);
  return b.length > 0 && (CONFIG.entrega?.bairrosSemEntrega || []).some((x) => b.includes(sem(x)));
};

// cidade digitada é atendida? Lista vazia em CONFIG.entrega.cidadesAtendidas = qualquer cidade
export const cidadeAtendida = (cidade) => {
  const lista = CONFIG.entrega?.cidadesAtendidas || [];
  return !lista.length || lista.some((x) => sem(x) === sem(cidade));
};

// modos que o comércio oferece, na ordem em que aparecem para o cliente
export const modosAtivos = () => ['entrega', 'retirada'].filter((m) => cfg(m)?.ativo);

// taxa por bairro? (senão é taxa fixa)
export const taxaPorBairro = () => CONFIG.entrega?.taxa?.tipo === 'bairro';
export const bairros = () => (taxaPorBairro() ? CONFIG.entrega.taxa.bairros || [] : []);

// escolha inicial: se só há um modo, ele já vale; com dois, o cliente decide
export function recebimentoPadrao() {
  const m = modosAtivos();
  return { modo: m.length === 1 ? m[0] : null, bairro: null };
}

export const tempoPara = (modo) => cfg(modo)?.tempo || '';
export const minimoPara = (modo) => Math.max(0, cfg(modo)?.pedidoMinimo || 0);

// Menor mínimo entre os modos possíveis. Sem escolha ainda, vale o menor:
// o mínimo definitivo é conferido ao finalizar, já com o modo escolhido.
export function minimoVigente(rec) {
  if (rec?.modo) return minimoPara(rec.modo);
  const todos = modosAtivos().map(minimoPara);
  return todos.length ? Math.min(...todos) : 0;
}

// Taxa para a escolha atual.
// -> { valor, pendente }  pendente = ainda falta modo ou bairro para saber
export function taxaPara(rec) {
  if (!rec?.modo) return { valor: 0, pendente: true };
  if (rec.modo === 'retirada') return { valor: 0, pendente: false };
  const t = CONFIG.entrega.taxa;
  if (t.tipo === 'bairro') {
    const b = (t.bairros || []).find((x) => x.nome === rec.bairro);
    return b ? { valor: b.valor, pendente: false } : { valor: 0, pendente: true };
  }
  return { valor: t.valor || 0, pendente: false };
}

// "R$ 7,90" ou "R$ 5,00 a R$ 12,00"
export function faixaDeTaxa() {
  if (!CONFIG.entrega?.ativo) return '';
  const t = CONFIG.entrega.taxa;
  if (t.tipo !== 'bairro') return taxaTxt(t.valor || 0);
  const v = (t.bairros || []).map((b) => b.valor);
  if (!v.length) return '';
  const [min, max] = [Math.min(...v), Math.max(...v)];
  return min === max ? brl(min) : `${brl(min)} a ${brl(max)}`;
}

// frases curtas para o cabeçalho do cardápio
export function resumoDelivery() {
  const partes = [];
  const e = CONFIG.entrega;
  const r = CONFIG.retirada;
  if (e?.ativo) {
    partes.push(`Entrega em ${e.tempo}`);
    partes.push(`Taxa ${faixaDeTaxa()}`);
    if (e.pedidoMinimo) partes.push(`Pedido mínimo ${brl(e.pedidoMinimo)}`);
  }
  if (r?.ativo) partes.push(`Retirada em ${r.tempo}`);
  return partes;
}

// texto de tempo para o carrinho: "entrega em 35–50 min" / "retirada ou entrega"
export function tempoResumo() {
  const m = modosAtivos();
  if (m.length === 2) return `entrega em ${tempoPara('entrega')} · retirada em ${tempoPara('retirada')}`;
  if (m.length === 1) return `${m[0] === 'entrega' ? 'entrega' : 'retirada'} em ${tempoPara(m[0])}`;
  return '';
}

// valida a configuração e devolve problemas em texto (usada nos testes e no console)
export function conferirConfig() {
  const erros = [];
  if (!modosAtivos().length) erros.push('Nenhum modo ativo: ligue entrega ou retirada em CONFIG.');
  const t = CONFIG.entrega?.taxa;
  if (CONFIG.entrega?.ativo) {
    if (!t) erros.push('CONFIG.entrega.taxa ausente.');
    else if (t.tipo === 'bairro') {
      if (!t.bairros?.length) erros.push('Taxa por bairro sem nenhum bairro.');
      const nomes = (t.bairros || []).map((b) => b.nome);
      if (new Set(nomes).size !== nomes.length) erros.push('Há bairros com nome repetido.');
      for (const b of t.bairros || []) if (!Number.isInteger(b.valor) || b.valor < 0) erros.push(`Taxa inválida no bairro ${b.nome}.`);
    } else if (t.tipo !== 'fixa') erros.push(`Tipo de taxa desconhecido: ${t.tipo}.`);
    else if (!Number.isInteger(t.valor) || t.valor < 0) erros.push('Taxa fixa inválida (use centavos).');
  }
  // valores em centavos: 12.9 em vez de 1290 passaria despercebido
  for (const m of ['entrega', 'retirada']) {
    const v = CONFIG[m]?.pedidoMinimo ?? 0;
    if (!Number.isInteger(v) || v < 0) erros.push(`CONFIG.${m}.pedidoMinimo inválido (use centavos inteiros, ex.: 2000 = R$ 20,00).`);
  }
  // Pix: sem chave = desligado de propósito (o pedido segue pelo WhatsApp); com chave, tem de estar certa
  if (CONFIG.pix?.chave) erros.push(...validarPix(CONFIG.pix));
  if (!CONFIG.modoDemonstracao && !(CONFIG.api?.supabaseUrl && CONFIG.api?.chavePublica) && digitos(CONFIG.whatsapp?.numero || '').length < 10) {
    erros.push('Sem whatsapp.numero e sem sistema de pedidos: o site não deixa finalizar pedidos (ligue modoDemonstracao para demonstrar).');
  }
  if (CONFIG.pagamentos.some((p) => p.id === 'pix') && !CONFIG.pix?.chave) erros.push('Pix está nas formas de pagamento mas pix.chave está vazia: o cliente não verá o QR.');
  erros.push(...AVISOS_AJUSTES);
  return erros;
}
