// Horário de funcionamento, lido de CONFIG.horario.
// Sempre calculado no fuso configurado (Brasília), nunca no do aparelho.

import { CONFIG } from './config.js';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];            // índice = getDay()
const ORDEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];           // semana começando na segunda
const NOME_DIA = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' };
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const SEMANA_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const fuso = () => CONFIG.horario?.fuso || 'America/Sao_Paulo';

// "18:00" -> 1080 (minutos desde a meia-noite)
const paraMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return NaN;
  return +m[1] * 60 + +m[2];
};

// "18:00" -> "18h" / "23:30" -> "23h30"
export const fmtHora = (hhmm) => {
  const min = paraMin(hhmm);
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

// dia da semana (0 = domingo) e minutos desde a meia-noite, no fuso configurado
export function agoraNoFuso(data = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso(), weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data);
  const pega = (t) => partes.find((p) => p.type === t)?.value;
  return { dia: SEMANA_EN[pega('weekday')], min: (+pega('hour') % 24) * 60 + +pega('minute') };
}

// faixas do dia já em minutos: [{ ini, fim, vira }] (vira = passa da meia-noite)
function faixasDoDia(chave) {
  const lista = CONFIG.horario?.semana?.[chave];
  if (!lista) return [];
  return lista
    .map(([a, b]) => ({ ini: paraMin(a), fim: paraMin(b), a, b }))
    .filter((f) => Number.isFinite(f.ini) && Number.isFinite(f.fim) && f.ini !== f.fim)
    .map((f) => ({ ...f, vira: f.fim < f.ini }));
}

// Está aberto neste instante? Considera faixa que vem do dia anterior (passou da meia-noite).
// -> { aberto, fechaEm: 'HH:MM' | null }
export function abertoEm(data = new Date()) {
  // "loja fechada agora" ligado no painel (vem do banco): fechado, seja qual for o horário
  if (CONFIG.horario?.fechadaAgora) return { aberto: false, fechaEm: null, manual: true };
  const { dia, min } = agoraNoFuso(data);
  for (const f of faixasDoDia(DIAS[dia])) {
    if (!f.vira && min >= f.ini && min < f.fim) return { aberto: true, fechaEm: f.b };
    if (f.vira && min >= f.ini) return { aberto: true, fechaEm: f.b };
  }
  for (const f of faixasDoDia(DIAS[(dia + 6) % 7])) {
    if (f.vira && min < f.fim) return { aberto: true, fechaEm: f.b };
  }
  return { aberto: false, fechaEm: null };
}

// Próxima abertura a partir de agora -> { dias: 0 = hoje, 1 = amanhã..., chave, hora } | null
export function proximaAbertura(data = new Date()) {
  const { dia, min } = agoraNoFuso(data);
  for (let add = 0; add <= 7; add++) {
    const chave = DIAS[(dia + add) % 7];
    const fx = faixasDoDia(chave).sort((x, y) => x.ini - y.ini);
    for (const f of fx) {
      if (add === 0 && f.ini <= min) continue;
      return { dias: add, chave, hora: f.a };
    }
  }
  return null;
}

// Situação pronta para exibir
// -> { aberto, texto, curto }
export function situacaoLoja(data = new Date()) {
  const a = abertoEm(data);
  if (a.aberto) return { aberto: true, texto: `Aberto agora · fecha às ${fmtHora(a.fechaEm)}`, curto: 'Aberto agora' };
  if (a.manual) return { aberto: false, texto: 'Fechado no momento', curto: 'Fechado' };
  const p = proximaAbertura(data);
  if (!p) return { aberto: false, texto: 'Fechado no momento', curto: 'Fechado' };
  const quando = p.dias === 0 ? 'hoje' : p.dias === 1 ? 'amanhã' : NOME_DIA[p.chave] + (['sab', 'dom'].includes(p.chave) ? '' : '-feira');
  return { aberto: false, texto: `Fechado · abre ${quando} às ${fmtHora(p.hora)}`, curto: 'Fechado' };
}

const textoFaixas = (chave) => {
  const f = faixasDoDia(chave);
  return f.length ? f.map((x) => `${fmtHora(x.a)} às ${fmtHora(x.b)}`).join(' e ') : 'fechado';
};

// Agrupa dias seguidos com o mesmo horário.
// -> [{ dias: 'Terça a domingo', horas: '18h às 23h30' }, { dias: 'Segunda', horas: 'fechado' }]
export function resumoHorario() {
  const grupos = [];
  for (const chave of ORDEM) {
    const horas = textoFaixas(chave);
    const ult = grupos[grupos.length - 1];
    if (ult && ult.horas === horas) ult.chaves.push(chave);
    else grupos.push({ horas, chaves: [chave] });
  }
  const nome = (c) => NOME_DIA[c];
  return grupos.map(({ horas, chaves }) => {
    let dias;
    if (chaves.length === 1) dias = maiuscula(nome(chaves[0]));
    else if (chaves.length === 2) dias = `${maiuscula(nome(chaves[0]))} e ${nome(chaves[1])}`;
    else dias = `${maiuscula(nome(chaves[0]))} a ${nome(chaves[chaves.length - 1])}`;
    return { dias, horas };
  });
}

// o comércio fechou o site para pedidos fora do horário?
export const bloqueiaFechado = () => Boolean(CONFIG.horario?.bloquearPedidoFechado);
