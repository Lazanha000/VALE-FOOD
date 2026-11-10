// ============================================================
// EMBALAGEM 3D
// A caixa é calculada em 3D (largura, profundidade, altura) e
// projetada na tela. A tampa gira na dobra de trás, então o
// fechamento respeita a geometria real da caixa.
// Desenhada em duas camadas SVG: "fundo" (interior, tampa aberta)
// e "frente" (paredes externas, tampa fechando). Entre as duas
// ficam o hambúrguer e as batatas.
// ============================================================

import { logoMark } from './art.js';
import { CONFIG } from './config.js';

export const BOX = { W: 1.5, D: 1.1, H: 0.66, F: 0.15, ABERTA: 110 };

const f4 = (v) => Math.round(v * 10000) / 10000;
const f1 = (v) => Math.round(v * 10) / 10;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => mul(a, 1 / Math.hypot(...a));

// Câmera ortográfica: giro (yaw) e inclinação para baixo (pitch)
export function camera(yawGraus = -18, pitchGraus = 28) {
  const y = (yawGraus * Math.PI) / 180;
  const t = (pitchGraus * Math.PI) / 180;
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return {
    project: ([x, yy, z]) => {
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      return [x1, -yy * ct + z1 * st];
    },
    olhar: [-sy * ct, st, cy * ct], // direção do objeto para a câmera
  };
}

// Inclinação da câmera: de cima com a caixa aberta (vê o que tem dentro,
// como na foto de referência) e mais baixa com a caixa fechada (mostra a frente).
export const PITCH = { aberta: 50, fechada: 28 };
const YAW = -18;
const CAM = camera(YAW, PITCH.fechada);
const { W, D, H, F, ABERTA } = BOX;

// cantos
const A = [-W / 2, 0, D / 2];
const B = [W / 2, 0, D / 2];
const C = [W / 2, H, D / 2];
const Dd = [-W / 2, H, D / 2];
const E = [-W / 2, 0, -D / 2];
const Fb = [W / 2, 0, -D / 2];
const G = [W / 2, H, -D / 2];
const Hh = [-W / 2, H, -D / 2];

export function tampa(phi) {
  const r = (phi * Math.PI) / 180;
  const u = [0, Math.sin(r), Math.cos(r)];
  const n = [0, -Math.cos(r), Math.sin(r)];
  const t = phi / ABERTA;
  const fd = unit(add(mul(n, 1 - 0.55 * t), mul(u, 0.55 * t)));
  const h0 = Hh;
  const h1 = G;
  const f0 = add(h0, mul(u, D));
  const f1 = add(h1, mul(u, D));
  return { h0, h1, f0, f1, q2: add(f1, mul(fd, F)), q3: add(f0, mul(fd, F)) };
}

// limites da silhueta projetada (em unidades), para enquadrar a câmera
export function limites(phi, pitch = PITCH.fechada) {
  const L = tampa(phi);
  const pts = [A, B, C, Dd, E, Fb, G, Hh, L.f0, L.f1, L.q2, L.q3].map(camera(YAW, pitch).project);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export const projetar = CAM.project;

// --- artes das faces (coordenadas locais: 100 por unidade) ---
const marca = CONFIG.marca;
const DISP = "font-family:'Big Shoulders Display','Arial Narrow',Impact,sans-serif;font-weight:900";
const MONO = "font-family:'IBM Plex Mono',ui-monospace,monospace;font-weight:600";

const LH = Math.round(BOX.H * 100); // altura local das paredes
const VERM = '#D9261C';
// estrela de 5 pontas
const estrela = (cx, cy, r, fill) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${p.join(' ')}" fill="${fill}"/>`;
};
// selo vermelho da marca (como na foto da embalagem)
const selo = (cx, cy, r) => `<g transform="translate(${cx} ${cy})">
  <circle r="${r}" fill="${VERM}"/>
  <circle r="${(r * 0.88).toFixed(2)}" fill="none" stroke="#FFFFFF" stroke-width="${(r * 0.05).toFixed(2)}"/>
  <circle r="${(r * 0.74).toFixed(2)}" fill="none" stroke="#FFFFFF" stroke-width="${(r * 0.025).toFixed(2)}" opacity=".7"/>
  <path d="M${-r * 0.42},${-r * 0.02} C${-r * 0.42},${-r * 0.4} ${r * 0.42},${-r * 0.4} ${r * 0.42},${-r * 0.02} Z" fill="#FFFFFF"/>
  <rect x="${-r * 0.47}" y="${r * 0.05}" width="${r * 0.94}" height="${r * 0.12}" rx="${r * 0.06}" fill="#FFFFFF"/>
  <rect x="${-r * 0.42}" y="${r * 0.24}" width="${r * 0.84}" height="${r * 0.12}" rx="${r * 0.06}" fill="#FFFFFF"/>
  ${estrela(0, -r * 0.6, r * 0.09, '#FFFFFF')}${estrela(-r * 0.28, -r * 0.56, r * 0.06, '#FFFFFF')}${estrela(r * 0.28, -r * 0.56, r * 0.06, '#FFFFFF')}
</g>`;
// MODELO (branco, inclinado) + SUFIXO (vermelho, entre linhas) + estrela
const letreiro = (x, y, larg, alto) => `<g transform="translate(${x} ${y}) skewX(-9)">
  <text x="0" y="0" textLength="${larg}" lengthAdjust="spacingAndGlyphs" style="${DISP};font-size:${alto}px" fill="#FFFFFF">${marca.nomeCurto}</text>
  ${estrela(larg + alto * 0.42, -alto * 0.36, alto * 0.24, '#FFFFFF')}
  <rect x="0" y="${alto * 0.2}" width="${larg * 0.16}" height="${alto * 0.045}" fill="${VERM}"/>
  <text x="${larg * 0.2}" y="${alto * 0.42}" textLength="${larg * 0.6}" lengthAdjust="spacingAndGlyphs" style="${DISP};font-size:${alto * 0.36}px" fill="${VERM}">${marca.sufixo}</text>
  <rect x="${larg * 0.84}" y="${alto * 0.2}" width="${larg * 0.16}" height="${alto * 0.045}" fill="${VERM}"/>
</g>`;
const artFrente = (id) => `
  <rect width="150" height="${LH}" fill="url(#${id}fr)"/>
  <rect y="4" width="150" height="1.2" fill="${VERM}"/>
  <rect y="${LH - 7}" width="150" height="1.6" fill="${VERM}"/><rect y="${LH - 4.4}" width="150" height=".7" fill="${VERM}"/>
  ${selo(26, LH / 2 - 1, 19)}
  ${letreiro(54, LH / 2 + 4, 70, 24)}
  <rect width="150" height="${LH}" fill="url(#${id}luz)"/>`;

// Versões com a arte fotográfica da marca (CONFIG.embalagem)
const EMB = CONFIG.embalagem || {};
const artFrenteFoto = (id) => {
  const h = 150 / EMB.proporcaoFrente;
  return `
  <rect width="150" height="${LH}" fill="#151112"/>
  <image href="${EMB.frente}" x="0" y="${(LH - h - 1.5).toFixed(2)}" width="150" height="${h.toFixed(2)}" preserveAspectRatio="none" mask="url(#${id}mf)"/>
  <rect width="150" height="${LH}" fill="url(#${id}luz)"/>`;
};
const artTampaSelo = (id) => `
  <rect width="150" height="110" fill="url(#${id}tf)"/>
  <image href="${EMB.selo}" x="51" y="34" width="48" height="48"/>`;

const artLado = (id) => `
  <rect width="110" height="${LH}" fill="url(#${id}ld)"/>
  <polygon points="0,0 34,0 18,${LH} 0,${LH}" fill="#111111"/>
  <polygon points="40,0 46,0 30,${LH} 24,${LH}" fill="#111111" opacity=".85"/>
  ${estrela(72, LH / 2, 17, '#FFFFFF')}
  <rect width="110" height="${LH}" fill="url(#${id}luz)"/>`;

const artTampaFora = (id) => `
  <rect width="150" height="110" fill="url(#${id}tf)"/>
  <rect x="6" y="6" width="138" height="98" rx="3" fill="none" stroke="${VERM}" stroke-width=".9"/>
  ${selo(75, 36, 19)}
  ${letreiro(34, 80, 70, 24)}`;

// parte de dentro da tampa (aparece com a caixa aberta, como na foto): y = 0 na borda solta
const artTampaDentro = () => `
  <rect width="150" height="110" fill="#121111"/>
  <rect x="4" y="4" width="142" height="102" fill="none" stroke="#2A2626" stroke-width=".8"/>
  ${selo(30, 34, 17)}
  ${letreiro(56, 38, 66, 24)}
  <rect x="22" y="70" width="106" height=".8" fill="${VERM}"/>
  <text x="75" y="80" text-anchor="middle" textLength="70" lengthAdjust="spacingAndGlyphs" style="${MONO};font-size:5px" fill="#E9E2D8">FEITO NA HORA. FEITO NA BRASA.</text>
  ${estrela(30, 78, 2.4, VERM)}${estrela(120, 78, 2.4, VERM)}
  <rect x="22" y="85" width="106" height=".8" fill="${VERM}"/>`;

const artAba = () => `
  <rect width="150" height="15" fill="#141414"/>
  <rect y="11.5" width="150" height="1" fill="#F15A24"/>
  <text x="75" y="8.2" text-anchor="middle" textLength="24" lengthAdjust="spacingAndGlyphs" style="${MONO};font-size:3.6px" fill="#9A928A">ABRA AQUI</text>`;

let nCaixas = 0;
export function criarCaixa(svgFundo, svgFrente) {
  let S = 100; // pixels por unidade
  const id = `cx${++nCaixas}`; // único por caixa (o modo sem animação tem 4 caixas na página)
  let cam = CAM; // câmera desta caixa (muda a inclinação durante a cena)
  let pitchAtual = PITCH.fechada;
  const P = (pt) => cam.project(pt).map((v) => v * S);
  const pts = (arr) => arr.map((pt) => P(pt).map(f1).join(',')).join(' ');
  const poly = (arr, fill, extra = '') => `<polygon points="${pts(arr)}" fill="${fill}" ${extra}/>`;
  // mapeia arte local (largura wl x altura hl) para o paralelogramo p0-p1-p3
  const matriz = (p0, p1, p3, wl, hl) => {
    const a = P(p0);
    const b = P(p1);
    const c = P(p3);
    const m = [(b[0] - a[0]) / wl, (b[1] - a[1]) / wl, (c[0] - a[0]) / hl, (c[1] - a[1]) / hl, a[0], a[1]].map(f4);
    return `matrix(${m.join(' ')})`;
  };
  const face = (p0, p1, p3, wl, hl, art) => `<g transform="${matriz(p0, p1, p3, wl, hl)}">${art}</g>`;
  const visivel = (n) => dot(n, cam.olhar) > 0;
  // Partes que dependem da câmera: marcadas com data-k e reposicionadas em reprojetar(),
  // sem recriar o SVG (a foto da frente não pisca).
  let ligados = [];
  let elsLigados = [];
  const liga = (fn) => { ligados.push(fn); return `data-k="${ligados.length - 1}"`; };
  const polyK = (arr, fill, extra = '') => `<polygon ${liga((e) => e.setAttribute('points', pts(arr)))} fill="${fill}" ${extra}/>`;
  const faceK = (p0, p1, p3, wl, hl, art) => `<g ${liga((e) => e.setAttribute('transform', matriz(p0, p1, p3, wl, hl)))}>${art}</g>`;
  const linhaK = (arr, extra) => `<polyline ${liga((e) => e.setAttribute('points', pts(arr)))} fill="none" ${extra}/>`;
  function reprojetar() {
    ligados.forEach((fn, i) => elsLigados[i] && fn(elsLigados[i]));
  }

  const defs = `<defs>
    <linearGradient id="${id}fr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#202020"/><stop offset="1" stop-color="#121212"/></linearGradient>
    <linearGradient id="${id}ld" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B81D12"/><stop offset="1" stop-color="#E4402A"/></linearGradient>
    <linearGradient id="${id}tf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151515"/><stop offset="1" stop-color="#1F1F1F"/></linearGradient>
    <linearGradient id="${id}luz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".07"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0F0E0E"/><stop offset="1" stop-color="#1D1A19"/></linearGradient>
    <linearGradient id="${id}mfv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".12" stop-color="#FFF"/></linearGradient>
    <mask id="${id}mf" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#${id}mfv)"/></mask>
    <linearGradient id="${id}pp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3EAD6"/><stop offset="1" stop-color="#DCCDAE"/></linearGradient>
  </defs>`;

  function estatico() {
    ligados = [];
    const borda = `stroke="#4A403A" stroke-width="${f1(S * 0.007)}" stroke-linejoin="round"`;
    // interior preto, com divisória entre o lanche e as batatas (como na foto)
    const xd = 0.02;
    const hd = 0.3;
    let fundo = defs + '<g class="tampa-fundo"></g>';
    fundo += polyK([A, B, Fb, E], '#121010'); // piso
    fundo += polyK([[-W / 2 + 0.05, 0.004, -D / 2 + 0.05], [xd - 0.04, 0.004, -D / 2 + 0.05], [xd - 0.04, 0.004, D / 2 - 0.05], [-W / 2 + 0.05, 0.004, D / 2 - 0.05]], '#191616'); // bandeja do lanche
    fundo += polyK([E, Fb, G, Hh], `url(#${id}pf)`); // parede de trás (interna)
    // parede lateral interna visível
    if (visivel([1, 0, 0])) fundo += polyK([E, A, Dd, Hh], '#1C1918');
    else fundo += polyK([Fb, B, C, G], '#1C1918');
    // divisória (frente dela fica de lado para a câmera)
    fundo += polyK([[xd, 0, -D / 2], [xd, 0, D / 2], [xd, hd, D / 2], [xd, hd, -D / 2]], '#0E0D0D');
    fundo += polyK([[xd, hd, -D / 2], [xd + 0.03, hd, -D / 2], [xd + 0.03, hd, D / 2], [xd, hd, D / 2]], VERM);
    fundo += linhaK([Dd, Hh, G, C], borda);

    let frente = '';
    frente += faceK(Dd, C, A, 150, LH, (EMB.frente ? artFrenteFoto : artFrente)(id));
    if (visivel([1, 0, 0])) frente += faceK(C, G, B, 110, LH, artLado(id));
    else frente += faceK(Hh, Dd, E, 110, LH, artLado(id));
    frente += linhaK([Dd, C], borda);
    frente += linhaK([C, B], `stroke="#2C2C2C" stroke-width="${f1(S * 0.006)}"`);
    frente += '<g class="tampa-frente"></g>';
    svgFundo.innerHTML = fundo;
    svgFrente.innerHTML = frente;
    elsLigados = [];
    for (const svg of [svgFundo, svgFrente]) svg.querySelectorAll('[data-k]').forEach((e) => { elsLigados[+e.dataset.k] = e; });
    reprojetar();
    gFundo = svgFundo.querySelector('.tampa-fundo');
    gFrente = svgFrente.querySelector('.tampa-frente');
    montarTampa();
    ultimoPhi = null;
  }

  // A tampa é montada uma vez; a cada quadro só mudam as posições.
  // Assim a imagem do selo não é recarregada durante o fechamento.
  let tampaG;
  let T;
  function montarTampa() {
    tampaG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tampaG.innerHTML = `<g data-f="fora">${(EMB.selo ? artTampaSelo : artTampaFora)(id)}</g>
      <g data-f="dentro">${artTampaDentro()}</g>
      <g data-f="aba">${artAba()}</g>
      <polygon data-f="aba-dentro" fill="#222020"/>
      <polyline data-f="borda" fill="none" stroke="#3A3330" stroke-linejoin="round"/>`;
    const q = (n) => tampaG.querySelector(`[data-f="${n}"]`);
    T = { fora: q('fora'), dentro: q('dentro'), aba: q('aba'), abaDentro: q('aba-dentro'), borda: q('borda') };
  }

  let gFundo;
  let gFrente;
  let ultimoPhi = null;

  function desenharTampa(phi) {
    if (ultimoPhi !== null && Math.abs(phi - ultimoPhi) < 0.05) return;
    ultimoPhi = phi;
    const L = tampa(phi);
    const nTampa = mul(cross(sub(L.h1, L.h0), sub(L.f0, L.h0)), -1);
    const nAba = mul(cross(sub(L.f1, L.f0), sub(L.q3, L.f0)), -1);
    const vt = visivel(nTampa);
    T.fora.style.display = vt ? '' : 'none';
    T.dentro.style.display = vt ? 'none' : '';
    if (vt) T.fora.setAttribute('transform', matriz(L.h0, L.h1, L.f0, 150, 110));
    else T.dentro.setAttribute('transform', matriz(L.f0, L.f1, L.h0, 150, 110));
    const va = visivel(nAba);
    T.aba.style.display = va ? '' : 'none';
    T.abaDentro.style.display = va ? 'none' : '';
    if (va) T.aba.setAttribute('transform', matriz(L.f0, L.f1, L.q3, 150, 15));
    else T.abaDentro.setAttribute('points', pts([L.f0, L.f1, L.q2, L.q3]));
    T.borda.setAttribute('points', pts([L.h0, L.f0, L.f1, L.h1]));
    T.borda.setAttribute('stroke-width', f1(S * 0.005));
    const destino = phi > 90 ? gFundo : gFrente;
    if (tampaG.parentNode !== destino) destino.appendChild(tampaG);
  }

  return {
    escala(s) {
      S = s;
      estatico();
    },
    tampa: desenharTampa,
    // muda a inclinação da câmera desta caixa (graus)
    camera(pitch) {
      if (Math.abs(pitch - pitchAtual) < 0.02) return;
      pitchAtual = pitch;
      cam = camera(YAW, pitch);
      reprojetar();
      ultimoPhi = null;
    },
    projetar: (pt) => cam.project(pt),
  };
}
