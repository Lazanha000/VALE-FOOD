// ============================================================
// ILUSTRAÇÕES PROVISÓRIAS (SVG)
// Servem enquanto não houver fotos reais. Cada camada do hambúrguer
// é uma imagem separada, no mesmo formato que as fotos recortadas
// terão (PNG/WebP com fundo transparente, 400 px de largura de base).
// Para usar fotos, preencha CONFIG.fotosCena e o campo "imagem" dos
// produtos; nada aqui precisa mudar.
// ============================================================

const uri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const n1 = (v) => Math.round(v * 10) / 10;

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// textura granulada recortada no formato do objeto
const grain = (id, freq, seed, [r, g, b], [k, c]) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${k} ${c}"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;
const blur = (id, sd) =>
  `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;

function smooth(pts) {
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const N = pts.length;
  let d = `M${m(pts[0], pts[1]).map(n1).join(',')}`;
  for (let i = 1; i <= N; i++) {
    const p = pts[i % N];
    const q = m(p, pts[(i + 1) % N]);
    d += ` Q${n1(p[0])},${n1(p[1])} ${n1(q[0])},${n1(q[1])}`;
  }
  return d + 'Z';
}

// ---------------- Camadas do hambúrguer ----------------
// Todas com 400 de largura. Retornam { h, defs, body }.

function topBun(p) {
  const r = rng(11);
  const dome = 'M8,176 C6,96 86,18 200,16 C314,18 394,96 392,176 C392,188 383,194 370,194 L30,194 C17,194 8,188 8,176 Z';
  let seeds = '';
  for (let i = 0; i < 34; i++) {
    const x = 46 + r() * 308;
    const dx = (x - 200) / 192;
    const top = 176 - 158 * Math.sqrt(Math.max(0, 1 - dx * dx));
    const y = top + 14 + r() * Math.max(10, (176 - top) * 0.62);
    if (y > 162) continue;
    const rot = r() * 70 - 35 + dx * 40;
    const s = 0.72 + r() * 0.42;
    seeds += `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${Math.round(rot)}) scale(${s.toFixed(2)})"><ellipse rx="6.2" ry="2.7" cy="1.4" fill="#7A3A10" opacity=".35"/><ellipse rx="6" ry="2.6" fill="url(#${p}s)"/></g>`;
  }
  return {
    h: 200,
    defs: `<radialGradient id="${p}b" cx="36%" cy="16%" r="92%"><stop offset="0" stop-color="#FCDB96"/><stop offset=".3" stop-color="#F0AC4E"/><stop offset=".66" stop-color="#C9762B"/><stop offset="1" stop-color="#7B3B12"/></radialGradient>
      <linearGradient id="${p}d" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#4A2008" stop-opacity="0"/><stop offset="1" stop-color="#3E1A06" stop-opacity=".55"/></linearGradient>
      <linearGradient id="${p}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9EA"/><stop offset="1" stop-color="#E6CC98"/></linearGradient>
      ${blur(p + 'f', 10)}${grain(p + 'g', 0.9, 5, [0.42, 0.2, 0.05], [-1.3, 0.92])}`,
    body: `<path d="${dome}" fill="url(#${p}b)"/><path d="${dome}" fill="url(#${p}d)"/>
      <path d="${dome}" fill="#000" filter="url(#${p}g)" opacity=".45"/>
      <ellipse cx="140" cy="64" rx="86" ry="30" fill="#FFF4D8" opacity=".5" filter="url(#${p}f)"/>
      <ellipse cx="300" cy="118" rx="56" ry="36" fill="#FFE2A8" opacity=".14" filter="url(#${p}f)"/>
      ${seeds}
      <path d="M24,187 C120,193 280,193 376,187" stroke="#F5DCA8" stroke-width="3" fill="none" opacity=".5"/>`,
  };
}

function sauce(p, { tone = 'casa' } = {}) {
  const c = {
    casa: ['#F8C27A', '#EE9A4A', '#D9702A'],
    erva: ['#F4F1DA', '#DCE3B5', '#A9B97A'],
  }[tone];
  const d = 'M16,12 C60,5 104,15 148,9 C190,3 232,14 272,8 C314,3 352,13 386,10 L386,21 C374,24 366,22 360,31 C356,40 346,41 344,32 C341,24 322,25 302,23 C274,21 252,25 240,23 C232,31 230,42 221,42 C212,42 212,30 204,26 C172,23 132,27 102,23 C88,23 82,31 76,37 C70,43 61,41 61,33 C61,27 42,24 16,22 Z';
  return {
    h: 46,
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".5" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`,
    body: `<path d="${d}" fill="url(#${p}a)"/>
      <path d="M40,12 C90,8 140,14 180,10" stroke="#FFF6E6" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".7"/>
      <path d="M250,10 C290,7 330,12 362,11" stroke="#FFF6E6" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".55"/>
      <ellipse cx="221" cy="36" rx="2.2" ry="3.2" fill="#FFF6E6" opacity=".6"/><ellipse cx="66" cy="34" rx="2" ry="2.8" fill="#FFF6E6" opacity=".55"/>`,
  };
}

function bacon(p, { seed = 23 } = {}) {
  const r = rng(seed);
  const strip = (id, y0, amp, ph, th, x0, x1) => {
    const N = 40;
    const top = [];
    const bot = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = x0 + (x1 - x0) * t;
      const w = Math.sin(t * Math.PI * 3.1 + ph) * amp + Math.sin(t * Math.PI * 7.3 + ph * 2) * amp * 0.28;
      const tk = th * (0.86 + 0.14 * Math.sin(t * 9 + ph));
      top.push([x, y0 + w]);
      bot.push([x, y0 + w + tk]);
    }
    const outline = 'M' + [...top, ...bot.slice().reverse()].map((q) => q.map(n1).join(',')).join(' L') + 'Z';
    const line = (o) => 'M' + top.map(([x, y]) => `${n1(x)},${n1(y + o)}`).join(' L');
    let specks = '';
    for (let i = 0; i < 9; i++) {
      const k = Math.floor(r() * N);
      specks += `<ellipse cx="${n1(top[k][0])}" cy="${n1(top[k][1] + th * (0.2 + r() * 0.6))}" rx="${n1(2 + r() * 4)}" ry="${n1(1 + r() * 1.6)}" fill="#3A0F07" opacity=".5"/>`;
    }
    return `<clipPath id="${p}${id}"><path d="${outline}"/></clipPath>
      <path d="${outline}" fill="#A3301E" stroke="#4E150B" stroke-width="2.4" stroke-linejoin="round"/>
      <g clip-path="url(#${p}${id})" fill="none" stroke-linecap="round">
        <path d="${line(th * 0.3)}" stroke="#ECB792" stroke-width="${n1(th * 0.2)}" opacity=".92"/>
        <path d="${line(th * 0.58)}" stroke="#C9452E" stroke-width="${n1(th * 0.16)}"/>
        <path d="${line(th * 0.8)}" stroke="#F1C7A4" stroke-width="${n1(th * 0.11)}" opacity=".85"/>
        <path d="${line(th * 0.12)}" stroke="#FFFFFF" stroke-width="1.4" opacity=".3"/>
        ${specks}
      </g>`;
  };
  return {
    h: 80,
    defs: '',
    body: strip('b', 32, 8, 2.1, 22, 30, 382) + strip('a', 14, 7, 0.3 + (seed % 5) * 0.2, 24, 18, 368),
  };
}

function onion(p, { crispy = false } = {}) {
  const r = rng(crispy ? 91 : 41);
  const cols = crispy
    ? ['#A8641E', '#C98634', '#E0A852', '#8A4A16', '#D69A45']
    : ['#7C3A10', '#A1561C', '#C47A2E', '#DE9C4A', '#B5651D'];
  let s = `<ellipse cx="200" cy="30" rx="176" ry="15" fill="${crispy ? '#8A4A16' : '#6E3410'}"/>`;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 28; i++) {
      const cx = 30 + r() * 340;
      const env = Math.sqrt(Math.max(0, 1 - ((cx - 200) / 182) ** 2));
      const cy = 30 + (r() * 2 - 1) * 14 * env;
      const len = 38 + r() * 72;
      const a = (r() * 2 - 1) * 0.5;
      const x1 = cx - (len / 2) * Math.cos(a);
      const y1 = cy - (len / 2) * Math.sin(a);
      const x2 = cx + (len / 2) * Math.cos(a);
      const y2 = cy + (len / 2) * Math.sin(a);
      const b = (r() * 2 - 1) * 16;
      const mx = cx - Math.sin(a) * b;
      const my = cy + Math.cos(a) * b;
      const d = `M${n1(x1)},${n1(y1)} Q${n1(mx)},${n1(my)} ${n1(x2)},${n1(y2)}`;
      const w = (pass ? 3.4 : 6) + r() * 3;
      s += `<path d="${d}" stroke="${cols[Math.floor(r() * cols.length)]}" stroke-width="${n1(w)}"/>`;
      if (pass && r() < 0.55) s += `<path d="${d}" stroke="#F8D79C" stroke-width="1.1" opacity=".7" transform="translate(0 -1.2)"/>`;
    }
  }
  return {
    h: 58,
    defs: `<clipPath id="${p}c"><rect x="0" y="3" width="400" height="53"/></clipPath>`,
    body: `<g clip-path="url(#${p}c)" fill="none" stroke-linecap="round">${s}</g>`,
  };
}

function cheese(p, { tone = 'cheddar', long = false } = {}) {
  const c = {
    cheddar: ['#FFD866', '#F8AE2C', '#E88B16'],
    prato: ['#FBE7A2', '#F1D076', '#DDB24E'],
  }[tone];
  const k = long ? 1.35 : 1;
  const Y = (v) => n1(14 + (v - 14) * k);
  const d = `M14,14 C80,6 320,6 386,14 C392,22 388,${Y(40)} 380,${Y(58)} C376,${Y(70)} 368,${Y(74)} 364,${Y(62)} C360,${Y(48)} 356,${Y(40)} 340,${Y(38)} C320,${Y(38)} 312,${Y(46)} 306,${Y(60)} C300,${Y(76)} 296,${Y(92)} 286,${Y(90)} C276,${Y(88)} 280,${Y(66)} 272,${Y(52)} C262,${Y(38)} 236,${Y(38)} 210,${Y(40)} C190,${Y(42)} 182,${Y(52)} 176,${Y(66)} C170,${Y(80)} 160,${Y(82)} 158,${Y(70)} C156,${Y(54)} 150,${Y(42)} 130,${Y(40)} C104,${Y(38)} 92,${Y(46)} 84,${Y(56)} C76,${Y(66)} 70,${Y(88)} 58,${Y(86)} C46,${Y(84)} 52,${Y(60)} 40,${Y(46)} C30,${Y(36)} 18,${Y(34)} 14,${Y(26)} Z`;
  return {
    h: long ? 128 : 96,
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`,
    body: `<path d="${d}" fill="url(#${p}a)" stroke="${c[2]}" stroke-width="1.2"/>
      <path d="M34,14 C120,9 260,9 360,13" stroke="#FFF3C4" stroke-width="3" stroke-linecap="round" fill="none" opacity=".7"/>
      <ellipse cx="287" cy="${Y(80)}" rx="3" ry="5" fill="#FFF3C4" opacity=".55"/>
      <ellipse cx="60" cy="${Y(74)}" rx="2.6" ry="4.4" fill="#FFF3C4" opacity=".5"/>
      <ellipse cx="160" cy="${Y(68)}" rx="2.2" ry="3.6" fill="#FFF3C4" opacity=".5"/>`,
  };
}

function patty(p, { thin = false, tone = 'carne' } = {}) {
  const r = rng(thin ? 63 : 57);
  const h = thin ? 84 : 118;
  const ry = thin ? 32 : 48;
  const cy = h / 2 - 1;
  const pts = [];
  const N = 52;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const j = (r() * 2 - 1) * 2.8;
    pts.push([200 + 188 * Math.sign(c) * Math.pow(Math.abs(c), 0.5) + j, cy + ry * Math.sign(s) * Math.pow(Math.abs(s), 0.6) + j]);
  }
  const d = smooth(pts);
  const col = tone === 'veg'
    ? ['#8C6A3A', '#6E5228', '#4F3A1C', '#33260F']
    : ['#7C4728', '#5B301B', '#3E1E0F', '#26120A'];
  let specks = '';
  for (let i = 0; i < 260; i++) {
    const x = 16 + r() * 368;
    const y = cy - ry + r() * ry * 2;
    const light = r() < 0.32;
    specks += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(0.8 + r() * 2.4)}" fill="${light ? (tone === 'veg' ? '#B79B62' : '#9A5A35') : '#1C0C05'}" opacity="${light ? 0.55 : 0.6}"/>`;
  }
  let shine = '';
  for (let i = 0; i < 7; i++) {
    const x = 60 + r() * 280;
    const y = cy - ry * 0.55 + r() * ry * 0.5;
    shine += `<path d="M${n1(x)},${n1(y)} q${n1(10 + r() * 14)},-3 ${n1(22 + r() * 20)},0" stroke="#FFFFFF" stroke-width="1.5" fill="none" opacity=".22" stroke-linecap="round"/>`;
  }
  return {
    h,
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col[0]}"/><stop offset=".35" stop-color="${col[1]}"/><stop offset=".78" stop-color="${col[2]}"/><stop offset="1" stop-color="${col[3]}"/></linearGradient>
      <clipPath id="${p}c"><path d="${d}"/></clipPath>${grain(p + 'g', 0.75, 9, [0.1, 0.04, 0.01], [-1.5, 1])}`,
    body: `<path d="${d}" fill="url(#${p}a)"/><path d="${d}" fill="#000" filter="url(#${p}g)" opacity=".5"/>
      <g clip-path="url(#${p}c)">${specks}${shine}</g>`,
  };
}

function bottomBun(p) {
  const body = 'M10,24 C10,14 18,10 32,10 L368,10 C382,10 390,14 390,24 C390,52 384,78 350,86 C300,94 100,94 50,86 C16,78 10,52 10,24 Z';
  const cut = 'M10,24 C10,14 18,10 32,10 L368,10 C382,10 390,14 390,24 C330,32 70,32 10,24 Z';
  return {
    h: 96,
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EDB25E"/><stop offset=".55" stop-color="#C67A2C"/><stop offset="1" stop-color="#7A3E13"/></linearGradient>
      <linearGradient id="${p}c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C98A3D"/><stop offset=".5" stop-color="#EBC28A"/><stop offset="1" stop-color="#C98A3D"/></linearGradient>
      ${grain(p + 'g', 0.9, 7, [0.4, 0.2, 0.05], [-1.3, 0.92])}`,
    body: `<path d="${body}" fill="url(#${p}a)"/><path d="${body}" fill="#000" filter="url(#${p}g)" opacity=".4"/>
      <path d="${cut}" fill="url(#${p}c)"/>
      <path d="M40,60 C120,70 280,70 360,60" stroke="#FFE2A8" stroke-width="5" fill="none" opacity=".18" stroke-linecap="round"/>`,
  };
}

function lettuce(p) {
  const r = rng(31);
  const top = [];
  const bot = [];
  for (let i = 0; i <= 30; i++) {
    const x = 8 + (384 * i) / 30;
    top.push([x, 14 + Math.sin(i * 1.7) * 5 + r() * 4]);
    bot.push([x, 36 + Math.sin(i * 1.3 + 1) * 7 + r() * 6]);
  }
  const d = 'M' + [...top, ...bot.reverse()].map((q) => q.map(n1).join(',')).join(' L') + 'Z';
  return {
    h: 52,
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A6D85B"/><stop offset=".6" stop-color="#5FA83A"/><stop offset="1" stop-color="#2F7428"/></linearGradient>`,
    body: `<path d="${d}" fill="url(#${p}a)" stroke="#2F7428" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M30,24 C120,20 260,28 370,22" stroke="#DDF2B0" stroke-width="1.6" fill="none" opacity=".7"/>`,
  };
}

function tomato(p) {
  const slice = (x, w) => `<rect x="${x}" y="10" width="${w}" height="24" rx="11" fill="url(#${p}a)"/><ellipse cx="${x + w / 2}" cy="13" rx="${w / 2 - 6}" ry="4" fill="#F27463" opacity=".8"/>`;
  return {
    h: 40,
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9483A"/><stop offset="1" stop-color="#A41E16"/></linearGradient>`,
    body: slice(30, 180) + slice(190, 180),
  };
}

const LAYER = { topBun, sauce, bacon, onion, cheese, patty, bottomBun, lettuce, tomato };

// Pilhas de camadas: [tipo, y, opções] de cima para baixo
const STACKS = {
  classic: [['topBun', 0], ['sauce', 176], ['bacon', 190], ['onion', 246], ['cheese', 272], ['patty', 290], ['bottomBun', 384]],
  duplo: [['topBun', 0], ['sauce', 176], ['cheese', 186], ['patty', 200, { thin: true }], ['cheese', 252], ['patty', 266, { thin: true }], ['bottomBun', 330]],
  bacon: [['topBun', 0], ['sauce', 176], ['bacon', 188], ['bacon', 214, { seed: 77 }], ['onion', 262], ['cheese', 286], ['patty', 304], ['bottomBun', 398]],
  cheddar: [['topBun', 0], ['onion', 178, { crispy: true }], ['cheese', 196, { long: true }], ['patty', 238], ['bottomBun', 332]],
  veg: [['topBun', 0], ['sauce', 176, { tone: 'erva' }], ['lettuce', 184], ['tomato', 216], ['cheese', 240, { tone: 'prato' }], ['patty', 258, { tone: 'veg' }], ['bottomBun', 352]],
};

let seq = 0;
const pref = () => 'a' + (seq++).toString(36);

// grupo SVG (para compor ilustrações maiores)
function burgerGroup(stack) {
  const items = STACKS[stack];
  let defs = '';
  let body = '';
  let bottom = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const [t, y, o] = items[i];
    const L = LAYER[t](pref(), o);
    defs += L.defs;
    body += `<g transform="translate(0 ${y})">${L.body}</g>`;
    bottom = Math.max(bottom, y + L.h);
  }
  return { defs, body, h: bottom };
}

// ---------------- Cena cinematográfica ----------------

export const CINE_W = 400;
// Camadas recortadas da foto real (assets/cena/camadas). px = largura da foto em pixels; ao lado de
// cada uma há a versão "-m" (65% da largura) que o celular baixa. Trocou alguma foto? Gere a "-m",
// ajuste px e atualize a lista do script do tema no index.html (ele pede essas fotos cedo, só na
// página inicial). Medidas em unidades:
// 400 = largura total do lanche. y = posição com o lanche montado;
// dy = quanto a camada se desloca quando o lanche abre (aberto = igual à foto).
export const CINE_BOTTOM = 370.2; // base do pão de baixo (lanche montado)
export const CINE_CENTER = 185.1; // centro vertical do lanche montado
export const CINE_EXP_TOP = -117.4; // topo do lanche aberto
export const CINE_EXP_BOTTOM = 628.7; // base do lanche aberto

// Ordem de cima para baixo. rot = giro máximo (graus) no meio da abertura.
export const CINE_LAYERS = [
  { id: 'paoTopo', foto: 'assets/cena/camadas/paoTopo.webp', px: 826, tipo: 'topBun', x: 14.5, y: 0.0, w: 361.9, h: 150.7, dy: -117.4, z: 6, rot: -7, nome: 'Pão com gergelim', det: 'Com molho da casa', lado: 'd' },
  { id: 'picles', foto: 'assets/cena/camadas/picles.webp', px: 678, tipo: null, x: 44.2, y: 96.8, w: 297.0, h: 58.3, dy: -64.0, z: 7, rot: 9, nome: 'Picles', det: 'Pepino em conserva', lado: 'e' },
  { id: 'cebola', foto: 'assets/cena/camadas/cebola.webp', px: 793, tipo: 'onion', x: 28.5, y: 110.0, w: 347.4, h: 62.7, dy: -34.2, z: 8, rot: -8, nome: 'Cebola roxa', det: 'Em anéis, crocante', lado: 'd' },
  { id: 'bacon', foto: 'assets/cena/camadas/bacon.webp', px: 904, tipo: 'bacon', x: 3.9, y: 123.1, w: 396.1, h: 114.3, dy: 9.6, z: 5, rot: 6, nome: 'Bacon crocante', det: 'Defumado, em fatias', lado: 'e' },
  { id: 'queijo', foto: 'assets/cena/camadas/queijo.webp', px: 822, tipo: 'cheese', x: 15.8, y: 166.5, w: 360.1, h: 103.8, dy: 64.8, z: 4, rot: -5, nome: 'Queijo cheddar', det: 'Derretido na chapa', lado: 'd' },
  { id: 'carne', foto: 'assets/cena/camadas/carne.webp', px: 773, tipo: 'patty', x: 26.3, y: 185.3, w: 338.7, h: 113.0, dy: 121.8, z: 3, rot: 4, nome: 'Blend bovino grelhado', det: '160 g, crosta na chapa', lado: 'e' },
  { id: 'salada', foto: 'assets/cena/camadas/salada.webp', px: 888, tipo: 'lettuce', x: 0.0, y: 197.2, w: 389.0, h: 117.9, dy: 224.3, z: 2, rot: -4, nome: 'Tomate e alface', det: 'Frescos, do dia', lado: 'd' },
  { id: 'paoBase', foto: 'assets/cena/camadas/paoBase.webp', px: 740, tipo: 'bottomBun', x: 33.3, y: 277.8, w: 324.2, h: 92.4, dy: 258.5, z: 1, rot: 2, nome: 'Base do pão', det: 'Tostada por dentro', lado: 'e' },
];

// srcset/sizes da foto de uma camada: o navegador escolhe a "-m" ou a inteira pelo tamanho na tela.
// O lanche ocupa ~76% da largura no celular (até 759 px) e ~35% no computador (js/scene.js).
// O script do tema no index.html repete esta conta no preload: mudou aqui, mude lá.
export function camadaSrcset(L) {
  const m = L.foto.replace(/\.webp$/, '-m.webp');
  return {
    srcset: `${m} ${Math.round(L.px * 0.65)}w, ${L.foto} ${L.px}w`,
    sizes: `(max-width: 759px) ${Math.ceil((76 * L.w) / CINE_W)}vw, ${Math.ceil((35 * L.w) / CINE_W)}vw`,
  };
}


const cacheLayer = {};
export function layerImage(tipo) {
  if (!cacheLayer[tipo]) {
    const L = LAYER[tipo](pref());
    cacheLayer[tipo] = { src: uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 ${L.h}" width="800" height="${L.h * 2}"><defs>${L.defs}</defs>${L.body}</svg>`), h: L.h };
  }
  return cacheLayer[tipo];
}

function friesGroup(seed = 77, count = 30) {
  const r = rng(seed);
  const p = pref();
  const sticks = [];
  for (let i = 0; i < count; i++) {
    const x = 40 + r() * 240;
    sticks.push({ x, base: 222 - r() * 22, len: 110 + r() * 88, ang: (r() * 2 - 1) * 22 + (x - 160) * 0.13, w: 15 + r() * 6, depth: r() });
  }
  sticks.sort((a, b) => a.depth - b.depth);
  let body = '';
  for (const s of sticks) {
    const dark = Math.max(0, 0.55 - s.depth) * 0.55;
    body += `<g transform="translate(${n1(s.x)} ${n1(s.base)}) rotate(${n1(s.ang)})">
      <rect x="${n1(-s.w / 2)}" y="${n1(-s.len)}" width="${n1(s.w)}" height="${n1(s.len)}" rx="3.6" fill="url(#${p}a)"/>
      <rect x="${n1(-s.w / 2)}" y="${n1(-s.len)}" width="${n1(s.w)}" height="12" rx="3.6" fill="#B4661E" opacity=".5"/>
      <rect x="${n1(-s.w / 2 + 3)}" y="${n1(-s.len + 8)}" width="2.2" height="${n1(s.len - 18)}" rx="1" fill="#FFF2C6" opacity=".55"/>
      ${dark ? `<rect x="${n1(-s.w / 2)}" y="${n1(-s.len)}" width="${n1(s.w)}" height="${n1(s.len)}" rx="3.6" fill="#4A2206" opacity="${dark.toFixed(2)}"/>` : ''}
    </g>`;
  }
  for (let i = 0; i < 40; i++) body += `<rect x="${n1(50 + r() * 220)}" y="${n1(40 + r() * 150)}" width="2" height="2" fill="#FFFFFF" opacity=".75"/>`;
  return {
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C47E26"/><stop offset=".22" stop-color="#F2BE5C"/><stop offset=".55" stop-color="#F9D683"/><stop offset="1" stop-color="#D38C2C"/></linearGradient>`,
    body,
  };
}

function cupGroup(color = ['#F7B06A', '#E07A34']) {
  const p = pref();
  return {
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D9D2C6"/><stop offset=".4" stop-color="#FFFFFF"/><stop offset="1" stop-color="#BDB4A6"/></linearGradient>
      <radialGradient id="${p}s" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${color[0]}"/><stop offset="1" stop-color="${color[1]}"/></radialGradient>`,
    body: `<path d="M14,30 L106,30 L96,92 C95,97 90,100 84,100 L36,100 C30,100 25,97 24,92 Z" fill="url(#${p}a)"/>
      <path d="M22,42 L98,42 M24,56 L96,56 M26,70 L94,70 M28,84 L92,84" stroke="#CFC7BA" stroke-width="1.2"/>
      <ellipse cx="60" cy="30" rx="46" ry="11" fill="#E9E3D8"/><ellipse cx="60" cy="31" rx="40" ry="8.5" fill="url(#${p}s)"/>
      <path d="M38,29 C48,25 62,25 74,28" stroke="#FFFFFF" stroke-width="2" fill="none" opacity=".55" stroke-linecap="round"/>`,
  };
}

let friesCache;
export function friesImage() {
  if (!friesCache) {
    const g = friesGroup();
    friesCache = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 230" width="640" height="460"><defs>${g.defs}</defs>${g.body}</svg>`);
  }
  return friesCache;
}
let cupCache;
export function cupImage() {
  if (!cupCache) {
    const g = cupGroup();
    cupCache = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 104" width="240" height="208"><defs>${g.defs}</defs>${g.body}</svg>`);
  }
  return cupCache;
}

// Milkshake no copo com tampa de cúpula (como na foto da embalagem). viewBox 120 x 200.
let shakeCache;
export function shakeImage() {
  if (!shakeCache) {
    const gotas = [[30, 66, 30], [46, 64, 46], [62, 66, 38], [80, 64, 52], [94, 66, 28]]
      .map(([x, y, l]) => `<path d="M${x - 5} ${y} C${x - 5} ${y + l * 0.6} ${x - 2} ${y + l} ${x} ${y + l} C${x + 3} ${y + l} ${x + 5} ${y + l * 0.6} ${x + 5} ${y} Z" fill="url(#sk-calda)"/>`).join('');
    const pedacos = [[40, 40, 7], [56, 33, 6], [72, 38, 8], [86, 44, 6], [50, 47, 5], [64, 50, 6], [30, 48, 5], [80, 30, 5]]
      .map(([x, y, r], i) => `<path d="M${x - r} ${y} L${x - r * 0.3} ${y - r} L${x + r} ${y - r * 0.4} L${x + r * 0.6} ${y + r * 0.8} L${x - r * 0.6} ${y + r * 0.7} Z" fill="${i % 2 ? '#2B1A12' : '#3D2618'}"/>`).join('');
    shakeCache = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" width="240" height="400"><defs>
      <linearGradient id="sk-copo" x1="0" x2="1"><stop offset="0" stop-color="#E9DFD2"/><stop offset=".45" stop-color="#FBF6EF"/><stop offset="1" stop-color="#D8CBBB"/></linearGradient>
      <linearGradient id="sk-calda" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A2214"/><stop offset="1" stop-color="#5A341D"/></linearGradient>
      <radialGradient id="sk-creme" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E7DDD0"/></radialGradient>
      <linearGradient id="sk-vidro" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset=".3" stop-color="#FFFFFF" stop-opacity=".08"/><stop offset=".8" stop-color="#FFFFFF" stop-opacity=".05"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".35"/></linearGradient>
    </defs>
      <ellipse cx="60" cy="193" rx="34" ry="6" fill="#000" opacity=".35"/>
      <path d="M14 62 L26 188 Q60 196 94 188 L106 62 Z" fill="url(#sk-copo)"/>
      ${gotas}
      <path d="M22 120 C40 112 80 128 100 118" stroke="#5A341D" stroke-width="3" fill="none" opacity=".5"/>
      <g transform="translate(60 140)"><circle r="15" fill="#D9261C"/><circle r="12.6" fill="none" stroke="#fff" stroke-width=".9"/>
        <path d="M-6.5 0 C-6.5 -6 6.5 -6 6.5 0 Z" fill="#fff"/><rect x="-7.2" y="1.5" width="14.4" height="2" rx="1" fill="#fff"/><rect x="-6.4" y="4.6" width="12.8" height="2" rx="1" fill="#fff"/></g>
      <path d="M14 62 L26 188 Q60 196 94 188 L106 62 Z" fill="url(#sk-vidro)"/>
      <ellipse cx="60" cy="62" rx="47" ry="9" fill="#D7CCBF"/>
      <path d="M18 60 C18 30 36 18 60 18 C84 18 102 30 102 60 Z" fill="url(#sk-creme)"/>
      ${pedacos}
      <path d="M22 54 C30 50 38 56 46 52 C56 48 64 56 74 52 C84 48 92 54 98 52" stroke="#4A2C1A" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M10 62 C10 18 34 4 60 4 C86 4 110 18 110 62 Z" fill="#FFFFFF" opacity=".16" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="1.6"/>
      <path d="M24 44 C26 26 38 14 52 11" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".8"/>
      <ellipse cx="60" cy="62" rx="50" ry="8" fill="none" stroke="#FFFFFF" stroke-opacity=".8" stroke-width="2"/>
    </svg>`);
  }
  return shakeCache;
}

// Potinho de cheddar cremoso. viewBox 120 x 90.
let cheddarCache;
export function cheddarImage() {
  if (!cheddarCache) {
    cheddarCache = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90" width="240" height="180"><defs>
      <linearGradient id="ch-pote" x1="0" x2="1"><stop offset="0" stop-color="#E4E0DA"/><stop offset=".5" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFC9C1"/></linearGradient>
      <radialGradient id="ch-molho" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#FFD24A"/><stop offset="1" stop-color="#F0A81C"/></radialGradient>
    </defs>
      <ellipse cx="60" cy="84" rx="44" ry="5" fill="#000" opacity=".35"/>
      <path d="M10 30 L20 80 Q60 90 100 80 L110 30 Z" fill="url(#ch-pote)"/>
      <ellipse cx="60" cy="30" rx="50" ry="14" fill="#F2EFEA"/>
      <ellipse cx="60" cy="31" rx="45" ry="11.5" fill="url(#ch-molho)"/>
      <path d="M36 28 C46 22 62 34 76 27 C84 23 90 28 94 30" stroke="#FFE48A" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
      <ellipse cx="46" cy="27" rx="7" ry="2.4" fill="#FFF6C8" opacity=".85"/>
    </svg>`);
  }
  return cheddarCache;
}

// ---------------- Logo ----------------

export function logoMark(cx, cy, r, ring = '#FFFFFF') {
  return `<g transform="translate(${cx} ${cy})">
    <circle r="${r}" fill="#F15A24"/>
    <circle r="${n1(r * 0.86)}" fill="none" stroke="${ring}" stroke-width="${n1(r * 0.05)}" opacity=".9"/>
    <path d="M${n1(-r * 0.5)},${n1(-r * 0.04)} C${n1(-r * 0.5)},${n1(-r * 0.46)} ${n1(r * 0.5)},${n1(-r * 0.46)} ${n1(r * 0.5)},${n1(-r * 0.04)} Z" fill="#FFFFFF"/>
    <rect x="${n1(-r * 0.56)}" y="${n1(r * 0.05)}" width="${n1(r * 1.12)}" height="${n1(r * 0.15)}" rx="${n1(r * 0.075)}" fill="#111111"/>
    <rect x="${n1(-r * 0.5)}" y="${n1(r * 0.27)}" width="${n1(r * 1.0)}" height="${n1(r * 0.15)}" rx="${n1(r * 0.075)}" fill="#FFFFFF"/>
  </g>`;
}

// ---------------- Ilustrações do cardápio ----------------

function wrap(vw, vh, defs, body, shadow = true) {
  const sh = shadow
    ? `<ellipse cx="${vw / 2}" cy="${vh - 16}" rx="${vw * 0.36}" ry="12" fill="#3A2412" opacity=".18" filter="url(#sh)"/>`
    : '';
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}"><defs>${blur('sh', 8)}${defs}</defs>${sh}${body}</svg>`);
}

function burgerArt(stack) {
  const g = burgerGroup(stack);
  const vh = g.h + 40;
  return wrap(400, vh, g.defs, `<g transform="translate(0 6)">${g.body}</g>`);
}

function scoop(fries) {
  const p = pref();
  return {
    defs: fries.defs + `<linearGradient id="${p}a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0E0E0E"/><stop offset=".45" stop-color="#2A2A2A"/><stop offset="1" stop-color="#0A0A0A"/></linearGradient>`,
    body: `<g transform="translate(-10 -40)">${fries.body}</g>
      <path d="M40,150 L280,150 L254,300 L66,300 Z" fill="url(#${p}a)"/>
      <path d="M44,170 L276,170" stroke="#F15A24" stroke-width="6"/>
      <path d="M62,282 L258,282" stroke="#F15A24" stroke-width="3"/>
      ${logoMark(160, 228, 30)}`,
  };
}

function shake() {
  const p = pref();
  const r = rng(5);
  let crumbs = '';
  for (let i = 0; i < 26; i++) crumbs += `<rect x="${n1(44 + r() * 72)}" y="${n1(24 + r() * 40)}" width="${n1(3 + r() * 5)}" height="${n1(3 + r() * 4)}" rx="1" fill="#2B1810" transform="rotate(${Math.round(r() * 90)} ${n1(80)} ${n1(50)})"/>`;
  return {
    defs: `<linearGradient id="${p}a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5B301E"/><stop offset=".4" stop-color="#8C543A"/><stop offset="1" stop-color="#4A2416"/></linearGradient>
      <radialGradient id="${p}c" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E8E0D6"/></radialGradient>`,
    body: `<path d="M98,10 L112,-40" stroke="#111" stroke-width="9" stroke-linecap="round"/><path d="M98,10 L112,-40" stroke="#F15A24" stroke-width="9" stroke-dasharray="8 8" stroke-linecap="round"/>
      <path d="M30,80 L130,80 L118,300 C117,308 110,312 102,312 L58,312 C50,312 43,308 42,300 Z" fill="url(#${p}a)"/>
      <path d="M44,96 L52,296" stroke="#FFFFFF" stroke-width="6" opacity=".18" stroke-linecap="round"/>
      ${logoMark(80, 200, 22)}
      <path d="M24,84 C18,60 40,44 52,48 C54,28 76,18 92,30 C104,18 130,28 128,50 C142,52 146,74 136,84 Z" fill="url(#${p}c)"/>
      <path d="M30,82 C40,92 44,104 50,96 C56,88 62,100 70,108 C78,116 84,96 92,94 C100,92 106,112 114,104 C120,98 124,88 132,82 Z" fill="#3B1D10"/>
      ${crumbs}`,
  };
}

function can() {
  const p = pref();
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs>${blur('sh', 8)}
    <linearGradient id="${p}a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0C0C0C"/><stop offset=".35" stop-color="#3A3A3A"/><stop offset=".55" stop-color="#1A1A1A"/><stop offset="1" stop-color="#050505"/></linearGradient>
    <linearGradient id="${p}m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8E939A"/><stop offset=".4" stop-color="#E6E8EC"/><stop offset="1" stop-color="#7A7F86"/></linearGradient></defs>
    <ellipse cx="100" cy="280" rx="64" ry="10" fill="#3A2412" opacity=".2" filter="url(#sh)"/>
    <path d="M44,48 C44,40 156,40 156,48 L160,70 L160,250 C160,262 40,262 40,250 L40,70 Z" fill="url(#${p}a)"/>
    <ellipse cx="100" cy="46" rx="56" ry="10" fill="url(#${p}m)"/><ellipse cx="100" cy="46" rx="44" ry="7" fill="#B9BDC3"/>
    <rect x="86" y="40" width="28" height="8" rx="4" fill="#9CA1A8"/>
    <rect x="40" y="130" width="120" height="16" fill="#F15A24"/>
    ${logoMark(100, 194, 26)}
    <path d="M58,72 L58,240" stroke="#FFFFFF" stroke-width="6" opacity=".14" stroke-linecap="round"/>
    <path d="M40,250 C40,262 160,262 160,250 L160,256 C160,268 40,268 40,256 Z" fill="url(#${p}m)"/></svg>`);
}

function glass() {
  const p = pref();
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 300"><defs>${blur('sh', 8)}
    <linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6B8"/><stop offset="1" stop-color="#F1DC6B"/></linearGradient></defs>
    <ellipse cx="110" cy="282" rx="70" ry="10" fill="#3A2412" opacity=".2" filter="url(#sh)"/>
    <path d="M150,30 L170,-10" stroke="#111" stroke-width="7" stroke-linecap="round"/>
    <path d="M50,60 L170,60 L158,270 C157,276 150,280 144,280 L76,280 C70,280 63,276 62,270 Z" fill="url(#${p}a)" opacity=".92"/>
    <rect x="70" y="90" width="38" height="34" rx="7" fill="#FFFFFF" opacity=".55" transform="rotate(-12 89 107)"/>
    <rect x="112" y="120" width="34" height="30" rx="7" fill="#FFFFFF" opacity=".5" transform="rotate(14 129 135)"/>
    <rect x="84" y="170" width="36" height="32" rx="7" fill="#FFFFFF" opacity=".45" transform="rotate(8 102 186)"/>
    <path d="M60,64 L70,268" stroke="#FFFFFF" stroke-width="6" opacity=".45" stroke-linecap="round"/>
    <path d="M46,56 L174,56 L172,64 L48,64 Z" fill="#FFFFFF" opacity=".5"/>
    <circle cx="160" cy="62" r="30" fill="#E9F27A" stroke="#9BBE2B" stroke-width="5"/>
    <path d="M160,62 L160,34 M160,62 L184,48 M160,62 L184,76 M160,62 L136,48 M160,62 L136,76 M160,62 L160,90" stroke="#C9DB55" stroke-width="2"/>
    <path d="M74,58 C60,40 70,26 88,32 C92,46 86,54 74,58 Z" fill="#3E9A45"/><path d="M90,56 C96,38 112,36 118,48 C110,58 100,60 90,56 Z" fill="#57B356"/></svg>`);
}

function brownie() {
  const p = pref();
  const r = rng(19);
  let cracks = '';
  for (let i = 0; i < 10; i++) {
    const x = 70 + r() * 160;
    const y = 112 + r() * 34;
    cracks += `<path d="M${n1(x)},${n1(y)} l${n1(r() * 20 - 10)},${n1(r() * 8 - 4)} l${n1(r() * 16 - 8)},${n1(r() * 6 - 3)}" stroke="#6A3A22" stroke-width="1.4" fill="none" opacity=".7"/>`;
  }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 260"><defs>${blur('sh', 8)}
    <linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A2416"/><stop offset="1" stop-color="#2A120A"/></linearGradient>
    <radialGradient id="${p}i" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#FFFBF2"/><stop offset="1" stop-color="#EADFCB"/></radialGradient></defs>
    <ellipse cx="160" cy="236" rx="120" ry="14" fill="#3A2412" opacity=".2" filter="url(#sh)"/>
    <path d="M60,128 L210,104 L268,132 L118,160 Z" fill="#5A2E1C"/>
    <path d="M60,128 L118,160 L118,226 L60,192 Z" fill="#2E140B"/>
    <path d="M118,160 L268,132 L268,196 L118,226 Z" fill="url(#${p}a)"/>
    ${cracks}
    <path d="M118,160 L268,132" stroke="#7A4A30" stroke-width="2" opacity=".6"/>
    <path d="M122,118 C110,90 140,62 170,66 C200,62 222,86 212,112 C206,124 132,130 122,118 Z" fill="url(#${p}i)"/>
    <path d="M128,116 C136,128 142,140 150,130 C158,120 168,140 178,132 C188,124 196,136 206,116 Z" fill="#EADFCB"/>
    <path d="M96,132 C130,120 170,140 200,118 C222,104 240,126 252,130" stroke="#3B1D10" stroke-width="6" fill="none" stroke-linecap="round"/></svg>`);
}

function cookie() {
  const p = pref();
  const r = rng(29);
  let chips = '';
  for (let i = 0; i < 14; i++) chips += `<path d="M${n1(70 + r() * 180)},${n1(110 + r() * 60)} l6,-8 l6,9 z" fill="#3B1D10"/>`;
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs>${blur('sh', 8)}
    <radialGradient id="${p}a" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#E8B56A"/><stop offset=".7" stop-color="#C98A3D"/><stop offset="1" stop-color="#9C6224"/></radialGradient>
    ${grain(p + 'g', 0.8, 3, [0.35, 0.18, 0.05], [-1.3, 0.9])}</defs>
    <ellipse cx="160" cy="214" rx="120" ry="14" fill="#3A2412" opacity=".2" filter="url(#sh)"/>
    <ellipse cx="160" cy="166" rx="118" ry="40" fill="#8A5420"/>
    <ellipse cx="160" cy="146" rx="118" ry="44" fill="url(#${p}a)"/>
    <ellipse cx="160" cy="146" rx="118" ry="44" fill="#000" filter="url(#${p}g)" opacity=".35"/>
    ${chips}
    <path d="M110,140 l20,6 l10,-8 M190,128 l14,10 l16,-4" stroke="#8A5420" stroke-width="2" fill="none"/></svg>`);
}

function rings() {
  const p = pref();
  const ring = (cx, cy, rx, ry, rot) => `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="url(#${p}a)" stroke-width="22"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#000" stroke-width="22" filter="url(#${p}g)" opacity=".4"/><ellipse cx="${cx}" cy="${cy - ry + 4}" rx="${rx * 0.6}" ry="3" fill="#FFE7B0" opacity=".5"/></g>`;
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 250"><defs>${blur('sh', 8)}
    <linearGradient id="${p}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5C26A"/><stop offset="1" stop-color="#B87428"/></linearGradient>
    ${grain(p + 'g', 1.1, 4, [0.45, 0.24, 0.06], [-1.4, 0.95])}</defs>
    <ellipse cx="170" cy="226" rx="130" ry="14" fill="#3A2412" opacity=".2" filter="url(#sh)"/>
    ${ring(110, 170, 72, 34, -6)}${ring(230, 168, 70, 32, 8)}${ring(168, 120, 74, 36, 4)}${ring(176, 72, 60, 28, -10)}</svg>`);
}

function sauceCupArt(color) {
  const g = cupGroup(color);
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -20 180 150"><defs>${blur('sh', 6)}${g.defs}</defs><ellipse cx="60" cy="110" rx="62" ry="9" fill="#3A2412" opacity=".2" filter="url(#sh)"/>${g.body}</svg>`);
}

function friesArt() {
  const s = scoop(friesGroup(41, 28));
  return wrap(320, 330, s.defs, `<g transform="translate(0 6)">${s.body}</g>`);
}

function comboArt() {
  const b = burgerGroup('bacon');
  const s = scoop(friesGroup(13, 22));
  const m = shake();
  return wrap(
    560,
    420,
    b.defs + s.defs + m.defs,
    `<g transform="translate(36 70) scale(.92)">${m.body}</g>
     <g transform="translate(330 92) scale(.72)">${s.body}</g>
     <g transform="translate(150 150) scale(.56)">${b.body}</g>`
  );
}

function shakeArt() {
  const m = shake();
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -50 200 380"><defs>${blur('sh', 8)}${m.defs}</defs><ellipse cx="80" cy="314" rx="64" ry="10" fill="#3A2412" opacity=".2" filter="url(#sh)"/>${m.body}</svg>`);
}

const MOLHOS = {
  'molho-casa': ['#F7B06A', '#E07A34'],
  'molho-barbecue': ['#8A3B1E', '#4E1A0A'],
  'molho-alho': ['#FBF6E6', '#E6DBBE'],
  'molho-cheddar': ['#FFD45C', '#EE9D1C'],
};

const ART = {
  'burger-classic': () => burgerArt('classic'),
  'burger-duplo': () => burgerArt('duplo'),
  'burger-bacon': () => burgerArt('bacon'),
  'burger-cheddar': () => burgerArt('cheddar'),
  'burger-veg': () => burgerArt('veg'),
  combo: comboArt,
  batata: friesArt,
  onion: rings,
  shake: shakeArt,
  lata: can,
  copo: glass,
  brownie,
  cookie,
};

const cacheArt = {};
// devolve a URL da ilustração do produto
export function artFor(produto) {
  const key = produto.arte;
  if (!cacheArt[key]) {
    if (key.startsWith('molho')) cacheArt[key] = sauceCupArt(MOLHOS[key] || MOLHOS['molho-casa']);
    else cacheArt[key] = (ART[key] || ART['burger-classic'])();
  }
  return cacheArt[key];
}
