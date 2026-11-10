// ============================================================
// EXPERIÊNCIA CINEMATOGRÁFICA
// A posição da rolagem (p, de 0 a 1) controla diretamente cada
// elemento. Não há animação "disparada": parar, avançar e voltar
// mantém tudo sincronizado.
//
// Linha do tempo (p):
//   0.00–0.06  Cena 1: hambúrguer montado, fundo degradê marrom (o da foto)
//   0.07–0.45  Cena 2: desmontagem com giro, fundo clareia até o branco,
//              rótulos dos ingredientes (aberto = igual à foto original)
//   0.44–0.72  Cena 3: remontagem, fundo escurece, entra na caixa
//   0.76–1.00  Cena 4: tampa fecha, câmera aproxima, chamada final
// ============================================================

import { CONFIG } from './config.js';
import { CINE_LAYERS, camadaSrcset, CINE_CENTER, CINE_BOTTOM, CINE_EXP_TOP, CINE_EXP_BOTTOM, layerImage, friesImage, cupImage, shakeImage, cheddarImage } from './art.js';
import { criarCaixa, limites, BOX, PITCH } from './box.js';
import { clamp, lerp, seg, ease, el, esc, movimentoReduzido } from './utils.js';
import { tentarDeNovo } from './ui.js';

const T = CONFIG.textos;
const FOTOS = CONFIG.fotosCena || {};
// true quando a <img> mostra uma foto já carregada (não o desenho reserva)
const ehFoto = (img) => img.naturalWidth > 0 && !img.currentSrc.startsWith('data:');
const ALVOS = [0, 0.37, 0.7, 1]; // início de cada cena (para o indicador)
const NOMES_CENA = ['Lendário', 'Camadas', 'Montagem', 'Entrega'];
const PROPORCAO = CINE_BOTTOM / 400; // altura / largura do lanche montado
// largura do que vai dentro da caixa, em unidades da caixa (a caixa tem 1,5 de largura):
// o lanche enche a metade esquerda e as batatas a parte da direita
// assenta*: quanto encolhem quando a tampa fecha (a caixa tem 0,66 de altura)
const DENTRO = { lanche: 0.76, batatas: 0.46, assentaLanche: 0.6, assentaBatatas: 0.8 };
const VAZIO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

function destacar(texto, palavra) {
  const t = esc(texto);
  const alvo = palavra || t.split(' ').pop();
  return t.replace(alvo, `<em>${alvo}</em>`);
}

function htmlPalco() {
  const camadas = CINE_LAYERS.map((L, i) => {
    const reserva = L.tipo ? layerImage(L.tipo).src : VAZIO;
    // foto trocada no config (FOTOS) não tem versão "-m": vai sem srcset
    const r = !FOTOS[L.id] && L.foto && L.px ? camadaSrcset(L) : null;
    const resp = r ? ` srcset="${r.srcset}" sizes="${r.sizes}"` : '';
    return `<img class="cine-camada" data-i="${i}" alt="" draggable="false" decoding="async" fetchpriority="high" src="${FOTOS[L.id] || L.foto || reserva}"${resp} data-fallback="${reserva}" style="z-index:${L.z ?? CINE_LAYERS.length - i}">`;
  }).join('');
  const rotulos = CINE_LAYERS.map((L, i) =>
    `<div class="rotulo" data-i="${i}"><span class="rotulo-linha"></span><span class="rotulo-texto"><strong>${esc(L.nome)}</strong><span>${esc(L.det)}</span></span></div>`
  ).join('');
  return `
  <div class="cine-palco">
    <div class="cine-fundo cine-fundo--claro"></div>
    <div class="cine-fundo cine-fundo--marrom"></div>
    <div class="cine-fundo cine-fundo--escuro"></div>
    <div class="cine-texto cine-s1">
      <h1 class="cine-titulo">${destacar(T.cena1Titulo)}</h1>
      <p class="cine-sub">${esc(T.cena1Sub)}</p>
    </div>
    <div class="cine-sombra-mesa"></div>
    <svg class="cine-caixa cine-caixa--fundo" aria-hidden="true" focusable="false"></svg>
    <div class="cine-sombra-burger"></div>
    <div class="cine-sombra-dentro"></div>
    <img class="cine-pote" alt="" draggable="false" fetchpriority="low" decoding="async" src="${FOTOS.pote || cupImage()}" data-fallback="${cupImage()}">
    <img class="cine-cheddar" alt="" draggable="false" src="${cheddarImage()}">
    <img class="cine-shake" alt="" draggable="false" fetchpriority="low" decoding="async" src="${FOTOS.lata || shakeImage()}" data-fallback="${shakeImage()}">
    <img class="cine-batatas" alt="" draggable="false" fetchpriority="low" decoding="async" src="${FOTOS.batatas || friesImage()}" data-fallback="${friesImage()}">
    <div class="cine-burger">${camadas}</div>
    <svg class="cine-caixa cine-caixa--frente" aria-hidden="true" focusable="false"></svg>
    <div class="cine-rotulos" aria-hidden="true">${rotulos}</div>
    <div class="cine-texto cine-s2"><p class="cine-olho">${esc(T.cena2Olho || '')}</p><h2>${esc(T.cena2Titulo)}</h2></div>
    <div class="cine-texto cine-s3"><h2>${esc(T.cena3Titulo.split('.')[0])}.</h2><p>${esc(T.cena3Titulo.split('.').slice(1).join('.').trim() || '')}</p></div>
    <div class="cine-texto cine-s4">
      <h2>${destacar(T.cena4Titulo, 'FAVORITO')}</h2>
      <button type="button" class="btn-cta">${esc(T.ctaCardapio)} <span aria-hidden="true">→</span></button>
    </div>
    <p class="cine-dica" aria-hidden="true">Role para descobrir<span></span></p>
  </div>`;
}

function criarPalco(raiz, { aoCta }) {
  raiz.insertAdjacentHTML('beforeend', htmlPalco());
  const palco = raiz.querySelector('.cine-palco');
  const $ = (s) => palco.querySelector(s);
  const q = {
    escuro: $('.cine-fundo--escuro'),
    marrom: $('.cine-fundo--marrom'),
    s1: $('.cine-s1'), s2: $('.cine-s2'), s3: $('.cine-s3'), s4: $('.cine-s4'),
    dica: $('.cine-dica'),
    burger: $('.cine-burger'),
    camadas: [...palco.querySelectorAll('.cine-camada')],
    rotulos: [...palco.querySelectorAll('.rotulo')],
    sombra: $('.cine-sombra-burger'),
    sombraDentro: $('.cine-sombra-dentro'),
    sombraMesa: $('.cine-sombra-mesa'),
    batatas: $('.cine-batatas'),
    pote: $('.cine-pote'),
    cheddar: $('.cine-cheddar'),
    shake: $('.cine-shake'),
    fundoCx: $('.cine-caixa--fundo'),
    frenteCx: $('.cine-caixa--frente'),
  };
  // foto ausente: volta para a ilustração
  // foto que falhou: tenta de novo algumas vezes; só usa o desenho se não carregar de jeito nenhum
  palco.querySelectorAll('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      if (img.src.startsWith('data:')) return;
      if (!tentarDeNovo(img)) img.src = img.dataset.fallback;
    });
  });
  palco.querySelector('.btn-cta').addEventListener('click', aoCta);

  const caixa = criarCaixa(q.fundoCx, q.frenteCx);
  const bAberta = limites(BOX.ABERTA, PITCH.aberta); // aberta: câmera de cima
  const bFechada = limites(0);
  let L = null;

  function layout() {
    const r = palco.getBoundingClientRect();
    const vw = r.width;
    const vh = r.height;
    const mob = vw < 760;
    // cena 1: o hambúrguer ocupa o espaço entre o texto e a base da tela
    const fimTexto = q.s1.offsetTop + q.s1.offsetHeight;
    const livre = vh * 0.85 - fimTexto - 16;
    const Wb = Math.max(140, Math.min(mob ? vw * 0.74 : vw * 0.34, (mob ? vh * 0.48 : vh * 0.6) / PROPORCAO, (livre * 0.96) / PROPORCAO));
    const kpx = Wb / 400;
    const Hb = Wb * PROPORCAO;
    const ext = CINE_EXP_BOTTOM - CINE_EXP_TOP;
    const s2s = Math.min((vh * 0.8) / (ext * kpx), mob ? (vw * 0.56) / Wb : 1.15);
    const s2 = { x: mob ? vw * 0.35 : vw / 2, y: vh * 0.54 + (CINE_CENTER - (CINE_EXP_BOTTOM + CINE_EXP_TOP) / 2) * kpx * s2s, s: s2s };
    const s1 = { x: vw / 2, y: fimTexto + 16 + Math.max(Hb / 2, livre / 2), s: 1 };
    const s3 = { x: vw / 2, y: vh * 0.56, s: 0.9 };

    const wA = bAberta.maxX - bAberta.minX;
    const hA = bAberta.maxY - bAberta.minY;
    const wF = bFechada.maxX - bFechada.minX;
    const hF = bFechada.maxY - bFechada.minY;
    const S = mob ? Math.min((vw * 0.9) / wF, (vh * 0.48) / hF) : Math.min((vw * 0.58) / wF, (vh * 0.52) / hF);
    const Sa = mob ? Math.min((vw * 0.9) / wA, (vh * 0.6) / hA) : Math.min((vw * 0.58) / wA, (vh * 0.62) / hA);
    const kA = Math.min(1, Sa / S);
    const cA = { x: vw / 2 - kA * S * (bAberta.minX + bAberta.maxX) / 2, y: vh * 0.6 - kA * S * (bAberta.minY + bAberta.maxY) / 2 };
    const cF = { x: vw / 2 - S * (bFechada.minX + bFechada.maxX) / 2, y: vh * (mob ? 0.53 : 0.545) - S * (bFechada.minY + bFechada.maxY) / 2 };

    // caixa: SVG desenhado na escala final (fechada) e reduzido quando aberta
    const ox = 1.3 * S;
    const oy = 2.8 * S;
    for (const svg of [q.fundoCx, q.frenteCx]) {
      svg.setAttribute('viewBox', `${-ox} ${-oy} ${2.6 * S} ${3.4 * S}`);
      svg.setAttribute('width', 2.6 * S);
      svg.setAttribute('height', 3.4 * S);
      svg.style.transformOrigin = `${ox}px ${oy}px`;
    }
    caixa.escala(S);

    q.burger.style.width = `${Wb}px`;
    q.burger.style.height = `${Hb}px`;
    CINE_LAYERS.forEach((Ly, i) => {
      const img = q.camadas[i];
      img.style.left = `${Ly.x * kpx}px`;
      img.style.top = `${Ly.y * kpx}px`;
      img.style.width = `${Ly.w * kpx}px`;
      img.style.height = `${Ly.h * kpx}px`;
    });
    q.rotulos.forEach((r2, i) => {
      const lado = mob ? 'd' : CINE_LAYERS[i].lado;
      r2.classList.toggle('rotulo--e', lado === 'e');
      r2.classList.toggle('rotulo--d', lado !== 'e');
    });
    const medidas = q.rotulos.map((r2) => ({ w: r2.offsetWidth, h: r2.offsetHeight }));
    L = { vw, vh, mob, Wb, Hb, kpx, s1, s2, s3, S, kA, cA, cF, ox, oy, medidas };
  }

  const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), s: lerp(a.s, b.s, t) });
  const vis = (node, o) => {
    node.style.opacity = o.toFixed(3);
    node.style.visibility = o < 0.02 ? 'hidden' : 'visible';
  };

  // ângulo da tampa (graus): aberta até 0,76 da rolagem, fechada em 0,895
  // desce acelerando, bate (0,875), quica 7° e assenta
  const phiTampa = (p) => (p < 0.875
    ? lerp(BOX.ABERTA, 0, Math.pow(ease.soft(seg(p, 0.76, 0.875)), 1.6))
    : 7 * Math.sin(Math.PI * seg(p, 0.875, 0.9)));
  // queda com quique: 1 = no alto, 0 = no fundo; t de 0 a 1
  const queda = (t) => (t < 0.72 ? 1 - Math.pow(t / 0.72, 2) : -0.07 * Math.sin(Math.PI * (t - 0.72) / 0.28));

  let ultimoTom = null;
  function render(p) {
    if (!L) return;
    const { vw, vh, kpx, Wb, Hb, S } = L;

    // --- fundo ---
    // degradê marrom da foto no início, clareando até o branco enquanto o lanche abre
    const marrom = 1 - ease.inOut(seg(p, 0.04, 0.2));
    q.marrom.style.opacity = marrom.toFixed(3);
    q.marrom.style.visibility = marrom < 0.005 ? 'hidden' : 'visible';
    const esc2 = ease.inOut(seg(p, 0.46, 0.58));
    q.escuro.style.opacity = esc2.toFixed(3);
    const tom = esc2 > 0.5 || marrom > 0.5 ? 'escuro' : 'claro';
    if (tom !== ultimoTom) {
      ultimoTom = tom;
      palco.dataset.tom = tom;
      raiz.dispatchEvent(new CustomEvent('tom', { detail: tom, bubbles: true }));
    }

    // --- câmera da caixa ---
    const sub = seg(p, 0.575, 0.65);
    const z = ease.inOut(seg(p, 0.78, 0.93));
    const cam = { k: lerp(L.kA, 1, z), x: lerp(L.cA.x, L.cF.x, z), y: lerp(L.cA.y, L.cF.y, z) };
    // câmera de cima com a caixa aberta; desce enquanto a tampa fecha
    caixa.camera(lerp(PITCH.aberta, PITCH.fechada, ease.inOut(seg(p, 0.76, 0.9))));
    const naTela = (pt) => {
      const [px, py] = caixa.projetar(pt);
      return [cam.x + cam.k * S * px, cam.y + cam.k * S * py];
    };
    const subida = (1 - ease.out(sub)) * vh * 0.7;
    const opCaixa = p < 0.575 ? 0 : seg(sub, 0, 0.4);
    const phi = phiTampa(p);
    caixa.tampa(phi);
    const tf = `translate3d(${(cam.x - L.ox).toFixed(1)}px, ${(cam.y - L.oy + subida).toFixed(1)}px, 0) scale(${cam.k.toFixed(4)})`;
    for (const svg of [q.fundoCx, q.frenteCx]) {
      svg.style.transform = tf;
      vis(svg, opCaixa);
    }
    const [mx, my] = naTela([0, 0, 0.05]);
    q.sombraMesa.style.width = `${cam.k * S * 2.3}px`;
    q.sombraMesa.style.height = `${cam.k * S * 0.9}px`;
    q.sombraMesa.style.transform = `translate3d(${mx}px, ${my + subida}px, 0) translate(-50%, -50%)`;
    vis(q.sombraMesa, ease.soft(seg(sub, 0.5, 1)) * esc2);

    // --- hambúrguer ---
    const [bx, by] = naTela([-0.37, 0, -0.04]); // lanche: metade esquerda, no meio da profundidade
    // dentro da caixa: o lanche ocupa a metade esquerda (como na foto de referência da embalagem);
    // a altura só limita em telas onde a foto ficaria alta demais
    const sDentro = (cam.k * S * Math.min(DENTRO.lanche / Wb, (DENTRO.lanche * 1.75) / Hb));
    // enquanto a tampa fecha, o que está dentro assenta (encolhe pela base) para caber sob a tampa;
    // a câmera aproxima ao mesmo tempo, então a diferença não aparece
    const assenta = ease.inOut(1 - seg(phiTampa(p), 35, 100));
    const sAssentado = sDentro * lerp(1, DENTRO.assentaLanche, assenta);
    const dentro = { x: bx, y: by - (CINE_BOTTOM - CINE_CENTER) * kpx * sAssentado, s: sAssentado };
    const pairando = { x: dentro.x, y: dentro.y - cam.k * S * 0.62, s: sDentro };
    let pos;
    if (p < 0.06) pos = L.s1;
    else if (p < 0.3) pos = mix(L.s1, L.s2, ease.inOut(seg(p, 0.06, 0.3)));
    else if (p < 0.44) pos = L.s2;
    else if (p < 0.55) pos = mix(L.s2, L.s3, ease.inOut(seg(p, 0.44, 0.55)));
    else if (p < 0.61) pos = mix(L.s3, pairando, ease.inOut(seg(p, 0.55, 0.61)));
    else if (p < 0.65) pos = pairando;
    else {
      const tq = seg(p, 0.65, 0.705);
      const f = queda(tq);
      pos = { x: lerp(dentro.x, pairando.x, Math.max(0, f)), y: lerp(dentro.y, pairando.y, f), s: lerp(dentro.s, pairando.s, Math.max(0, f)) };
    }
    // entrada na caixa: inclina e endireita, achata no impacto (pela base) e se ajusta à perspectiva da caixa
    const tE = seg(p, 0.6, 0.705);
    const giroE = -7 * Math.sin(Math.PI * tE) * (1 - seg(p, 0.69, 0.705));
    const impacto = seg(p, 0.69, 0.73);
    const achata = impacto > 0 ? 0.09 * Math.sin(Math.PI * impacto) * (1 - impacto) * 2 : 0;
    const persp = lerp(1, 0.93, ease.soft(seg(p, 0.62, 0.7)));
    const escX = 1 + achata * 0.6;
    const escY = persp * (1 - achata);
    const baseY = (Hb / 2) * pos.s * (1 - escY); // mantém a base apoiada
    q.burger.style.transform = `translate3d(${(pos.x - Wb / 2).toFixed(1)}px, ${(pos.y - Hb / 2 + baseY).toFixed(1)}px, 0) rotate(${giroE.toFixed(2)}deg) scale(${(pos.s * escX).toFixed(4)}, ${(pos.s * escY).toFixed(4)})`;
    vis(q.burger, phi < 16 ? 0 : seg(phi, 16, 30));

    const n = CINE_LAYERS.length;
    const desloc = [];
    CINE_LAYERS.forEach((Ly, i) => {
      const ex = ease.inOut(seg(p, 0.07 + i * 0.012, 0.27 + i * 0.012));
      const im = ease.inOut(seg(p, 0.44 + (n - 1 - i) * 0.008, 0.55 + (n - 1 - i) * 0.008));
      const e = ex * (1 - im);
      desloc[i] = e;
      // gira no meio do caminho e chega alinhado, como na foto
      const giro = Math.sin(Math.PI * e);
      q.camadas[i].style.transform = `translate3d(0, ${(Ly.dy * kpx * e).toFixed(2)}px, 0) rotate(${(Ly.rot * giro).toFixed(2)}deg) scale(${(1 + 0.04 * giro).toFixed(4)})`;
    });

    // sombra de contato no fundo branco
    const eB = desloc[n - 1];
    const sy = pos.y + ((CINE_BOTTOM - CINE_CENTER) + CINE_LAYERS[n - 1].dy * eB) * kpx * pos.s;
    q.sombra.style.width = `${Wb * pos.s * 0.95}px`;
    q.sombra.style.height = `${Wb * pos.s * 0.16}px`;
    q.sombra.style.transform = `translate3d(${pos.x}px, ${sy}px, 0) translate(-50%, -50%)`;
    vis(q.sombra, (1 - esc2) * (1 - marrom) * (1 - eB * 0.45));

    // sombra dentro da caixa
    const dentroT = seg(p, 0.6, 0.705);
    const perto = ease.in(dentroT);
    q.sombraDentro.style.width = `${cam.k * S * 0.7}px`;
    q.sombraDentro.style.height = `${cam.k * S * 0.2}px`;
    q.sombraDentro.style.transform = `translate3d(${bx}px, ${by}px, 0) translate(-50%, -50%) scale(${(0.45 + 0.55 * perto).toFixed(3)})`;
    vis(q.sombraDentro, perto * 0.95);

    // batatas e pote caem na caixa
    // foto: largura própria e base pela proporção real; desenho: medidas do SVG
    const fotoB = ehFoto(q.batatas);
    const larB = cam.k * S * (fotoB ? DENTRO.batatas : 0.56) * lerp(1, DENTRO.assentaBatatas, assenta);
    const baseB = fotoB ? (q.batatas.naturalHeight / q.batatas.naturalWidth) * 0.96 : 222 / 320;
    const [fx, fy] = naTela(fotoB ? [0.27, 0, -0.32] : [0.27, 0, -0.28]); // batatas: fundo, à direita
    const tB = seg(p, 0.69, 0.73);
    q.batatas.style.width = `${larB}px`;
    q.batatas.style.transform = `translate3d(${(fx - larB / 2).toFixed(1)}px, ${(fy - larB * baseB - queda(tB) * vh * 0.32).toFixed(1)}px, 0)`;
    // tampa quase fechada: o que está dentro some (senão as pontas escapam pela borda)
    const aindaAberta = seg(phi, 16, 34);
    vis(q.batatas, seg(tB, 0, 0.5) * aindaAberta);
    const fotoP = ehFoto(q.pote);
    const larP = cam.k * S * (fotoP ? 0.18 : 0.17);
    const baseP = fotoP ? (q.pote.naturalHeight / q.pote.naturalWidth) * 0.96 : 100 / 120;
    const [px2, py2] = naTela([0.31, 0, 0.0]); // ketchup: na frente, entre o cheddar e o milkshake
    const tP = seg(p, 0.71, 0.745);
    q.pote.style.width = `${larP}px`;
    q.pote.style.transform = `translate3d(${(px2 - larP / 2).toFixed(1)}px, ${(py2 - larP * baseP - queda(tP) * vh * 0.3).toFixed(1)}px, 0)`;
    vis(q.pote, seg(tP, 0, 0.5) * aindaAberta);
    // cheddar (frente, perto da divisória) e milkshake (frente, à direita), como na foto da embalagem
    const cai = (img, ponto, larg, prop, t0, t1, alturaQueda) => {
      const [cx, cy] = naTela(ponto);
      const l = cam.k * S * larg * lerp(1, DENTRO.assentaBatatas, assenta);
      const t = seg(p, t0, t1);
      img.style.width = `${l}px`;
      img.style.transform = `translate3d(${(cx - l / 2).toFixed(1)}px, ${(cy - l * prop - queda(t) * vh * alturaQueda).toFixed(1)}px, 0)`;
      vis(img, seg(t, 0, 0.5) * aindaAberta);
    };
    cai(q.cheddar, [0.13, 0, -0.04], 0.2, (90 / 120) * 0.94, 0.70, 0.735, 0.3);
    const lataFoto = ehFoto(q.shake);
    cai(q.shake, lataFoto ? [0.6, 0, 0.06] : [0.56, 0, -0.14], lataFoto ? 0.25 : 0.36,
      lataFoto ? (q.shake.naturalHeight / q.shake.naturalWidth) * 0.985 : (200 / 120) * 0.965, 0.72, 0.758, 0.36);

    // --- rótulos ---
    const opR = 1 - seg(p, 0.41, 0.45);
    CINE_LAYERS.forEach((Ly, i) => {
      const o = seg(p, 0.19 + i * 0.012, 0.25 + i * 0.012) * opR;
      const r2 = q.rotulos[i];
      vis(r2, o);
      if (o < 0.02) return;
      const cy = pos.y + (Ly.y + Ly.h / 2 + Ly.dy * desloc[i] - CINE_CENTER) * kpx * pos.s;
      const { w, h: hh } = L.medidas[i];
      const esquerda = r2.classList.contains('rotulo--e');
      const borda = (esquerda ? Ly.x : Ly.x + Ly.w) - 200;
      const x = esquerda ? pos.x + borda * kpx * pos.s - 8 - w : pos.x + borda * kpx * pos.s + 8;
      const deslize = (1 - o) * 12 * (esquerda ? -1 : 1);
      r2.style.transform = `translate3d(${(x + deslize).toFixed(1)}px, ${(cy - hh / 2).toFixed(1)}px, 0)`;
    });

    // --- textos ---
    const o1 = 1 - seg(p, 0.025, 0.08);
    vis(q.s1, o1);
    q.s1.style.transform = `translate3d(0, ${(-24 * (1 - o1)).toFixed(1)}px, 0)`;
    vis(q.dica, 1 - seg(p, 0, 0.03));
    vis(q.s2, seg(p, 0.16, 0.22) * (1 - seg(p, 0.41, 0.46)));
    const o3 = seg(p, 0.6, 0.66) * (1 - seg(p, 0.74, 0.79));
    vis(q.s3, o3);
    q.s3.style.transform = `translate3d(0, ${(16 * (1 - o3)).toFixed(1)}px, 0)`;
    const o4 = seg(p, 0.9, 0.965);
    vis(q.s4, o4);
    q.s4.style.setProperty('--sobe', `${(18 * (1 - o4)).toFixed(1)}px`);
  }

  return { palco, layout, render };
}

// ---------------- Montagem na página ----------------

export function montarCinema(host, { aoCta }) {
  const reduzido = movimentoReduzido();
  const sec = el(`<section class="cine ${reduzido ? 'cine--estatico' : 'cine--rolagem'}" aria-labelledby="cine-h1">
    <p class="sr-only">${esc(T.cena2Olho || 'Hambúrguer')}, camada por camada: ${CINE_LAYERS.map((Ly) => Ly.nome.toLowerCase()).join(', ')}. Montado na hora e entregue na caixa da casa.</p>
  </section>`);
  host.append(sec);
  const limpar = [];

  if (reduzido) {
    // Movimento reduzido: quatro quadros fixos, sem rolagem animada.
    const quadros = ALVOS.map((p) => {
      const q = el('<div class="cine-quadro"></div>');
      sec.append(q);
      const st = criarPalco(q, { aoCta });
      return { p, st };
    });
    quadros[0].st.palco.querySelector('h1').id = 'cine-h1';
    const relayout = () => quadros.forEach(({ p, st }) => { st.layout(); st.render(p); });
    relayout();
    const ro = new ResizeObserver(relayout);
    quadros.forEach(({ st }) => ro.observe(st.palco));
    limpar.push(() => ro.disconnect());
    document.fonts?.ready.then(relayout);
    sec.addEventListener('tom', (e) => e.stopPropagation());
    return { destruir: () => limpar.forEach((f) => f()) };
  }

  const trilho = el('<div class="cine-trilho"></div>');
  sec.append(trilho);
  const st = criarPalco(trilho, { aoCta });
  st.palco.querySelector('h1').id = 'cine-h1';

  const nav = el(`<nav class="cine-progresso" aria-label="Cenas da apresentação">
    ${NOMES_CENA.map((nm, i) => `<button type="button" data-i="${i}"><span>${nm}</span></button>`).join('')}
  </nav>`);
  st.palco.append(nav);
  const botoes = [...nav.querySelectorAll('button')];

  let ultimoP = -1;
  let pedido = false;
  let ativo = -1;
  // medidas em cache: ler o layout a cada quadro de rolagem trava o celular
  let topoTrilho = 0;
  let totalRolagem = 1;
  function medir() {
    topoTrilho = window.scrollY + trilho.getBoundingClientRect().top;
    totalRolagem = Math.max(1, trilho.offsetHeight - st.palco.offsetHeight);
  }
  function progresso() {
    return clamp((window.scrollY - topoTrilho) / totalRolagem);
  }
  function quadro() {
    pedido = false;
    const p = progresso();
    if (Math.abs(p - ultimoP) < 0.00005) return;
    ultimoP = p;
    st.render(p);
    const a = p < 0.12 ? 0 : p < 0.47 ? 1 : p < 0.75 ? 2 : 3;
    if (a !== ativo) {
      ativo = a;
      botoes.forEach((b, i) => (i === a ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
    }
  }
  const agendar = () => {
    if (!pedido) {
      pedido = true;
      requestAnimationFrame(quadro);
    }
  };
  const relayout = () => {
    st.layout();
    medir();
    ultimoP = -1;
    quadro();
  };
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    window.scrollTo({ top: topoTrilho + ALVOS[+b.dataset.i] * totalRolagem + (+b.dataset.i === 3 ? 0 : 2), behavior: 'smooth' });
  });

  window.addEventListener('scroll', agendar, { passive: true });
  const ro = new ResizeObserver(relayout);
  ro.observe(st.palco);
  document.fonts?.ready.then(relayout);
  // quando uma foto termina de carregar, recalcula (a medida depende do tamanho dela)
  const aoCarregar = () => { ultimoP = -1; quadro(); };
  st.palco.querySelectorAll('.cine-batatas, .cine-pote, .cine-shake').forEach((img) => img.addEventListener('load', aoCarregar));
  relayout();
  limpar.push(() => {
    window.removeEventListener('scroll', agendar);
    ro.disconnect();
  });
  return { destruir: () => limpar.forEach((f) => f()) };
}
