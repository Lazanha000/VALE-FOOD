// Ponto de partida: liga cabeçalho, páginas, carrinho e WhatsApp.

import { CONFIG } from './config.js';
import { rota, iniciar } from './router.js';
import { carrinho } from './store.js';
import { montarCardapio } from './pages/menu.js';
import { paginaCarrinho } from './pages/cart.js';
import { paginaFinalizar } from './pages/checkout.js';
import { paginaPedido } from './pages/tracking.js';
import { montarWhatsapp, contextoWhatsapp } from './whatsapp.js';
import { atualizarContador, instalarReservaDeImagens, avisar } from './ui.js';
import { esc, CHAVES } from './utils.js';
import { resumoHorario, situacaoLoja } from './horario.js';
import { conferirConfig } from './delivery.js';
import { PLATAFORMA } from './marketplace/dados.js';
import { entrarNaLoja, lojaGuardada, lojaAtual } from './marketplace/loja.js';
import { paginaInicio, paginaLista, paginaSuporte, barraDaLoja } from './marketplace/paginas.js';
import { paginaPrivacidade, paginaTermos, paginaTermosUso, paginaReembolso, paginaCookies, paginaAdesao, avisoArmazenamento } from './marketplace/legal.js';

document.documentElement.lang = 'pt-BR';
// Cabeçalho e rodapé mostram a PLATAFORMA (Modelo Food); o nome do estabelecimento aparece nas páginas dele.
const m0 = { ...CONFIG.marca, nome: PLATAFORMA.nome, nomeCurto: PLATAFORMA.nomeCurto, sufixo: PLATAFORMA.sufixo, descricao: 'Peça de lanchonetes e restaurantes do Vale do Jequitinhonha e do Vale do Mucuri.', local: 'Araçuaí, MG' };
document.querySelectorAll('[data-marca-nome]').forEach((n) => {
  n.innerHTML = `${esc(m0.nomeCurto)}${n.closest('.rodape') ? ' ' : ''}<b>${esc(m0.sufixo)}</b>`;
});
document.querySelectorAll('[data-marca-descricao]').forEach((n) => { n.textContent = m0.descricao; });
document.querySelectorAll('[data-marca-local]').forEach((n) => { n.textContent = [m0.nome, m0.local].filter(Boolean).join(' · '); });
// razão social, CNPJ e endereço da empresa no rodapé: entram quando o CNPJ existir (ver docs/REAPROVEITAMENTO.md)
document.querySelectorAll('[data-empresa]').forEach((n) => { n.hidden = true; });
document.querySelector('.topo .marca')?.setAttribute('aria-label', `${m0.nome}, página inicial`);
const btnTema = document.getElementById('btn-tema');
const metaTema = document.querySelector('meta[name=theme-color]');
function aplicarTema(escuro, guardar) {
  const raiz = document.documentElement;
  if (escuro) raiz.dataset.tema = 'escuro'; else delete raiz.dataset.tema;
  btnTema.setAttribute('aria-pressed', String(escuro));
  metaTema.content = escuro ? '#17130F' : '#FFFFFF';
  if (guardar) try { localStorage.setItem(CHAVES.tema, escuro ? 'escuro' : 'claro'); } catch {}
}
aplicarTema(document.documentElement.dataset.tema === 'escuro', false);
btnTema.addEventListener('click', () => aplicarTema(document.documentElement.dataset.tema !== 'escuro', true));
// Sem sistema de pedidos (api.supabaseUrl) o site não sabe o andamento: tira "Acompanhar pedido"
// do menu e do rodapé. A tela #pedido continua para a confirmação logo após o pedido.
if (!CONFIG.api?.supabaseUrl && !CONFIG.modoDemonstracao) document.querySelectorAll('[data-acompanhar]').forEach((a) => a.remove());
const main = document.getElementById('conteudo');
const topo = document.getElementById('topo');
const TITULOS = {
  inicio: () => PLATAFORMA.nome,
  lista: () => `Estabelecimentos · ${PLATAFORMA.nome}`,
  loja: () => CONFIG.marca.nome,
  cardapio: () => `Cardápio · ${CONFIG.marca.nome}`,
  carrinho: () => `Carrinho · ${CONFIG.marca.nome}`,
  finalizar: () => `Finalizar pedido · ${CONFIG.marca.nome}`,
  pedido: () => `Acompanhar pedido · ${PLATAFORMA.nome}`,
  privacidade: () => `Política de privacidade · ${PLATAFORMA.nome}`,
  suporte: () => `Suporte · ${PLATAFORMA.nome}`,
  termos: () => `Termos e políticas · ${PLATAFORMA.nome}`,
  'termos-uso': () => `Termos de uso · ${PLATAFORMA.nome}`,
  reembolso: () => `Cancelamento e reembolso · ${PLATAFORMA.nome}`,
  cookies: () => `Armazenamento no aparelho · ${PLATAFORMA.nome}`,
  adesao: () => `Termo de adesão · ${PLATAFORMA.nome}`,
  404: () => `Página não encontrada · ${PLATAFORMA.nome}`,
};
const tituloDe = (chave) => (TITULOS[chave] ? TITULOS[chave]() : PLATAFORMA.nome);

// volta a loja que o cliente tinha escolhido (a página foi recarregada) e confere o carrinho salvo
const guardada = lojaGuardada();
if (guardada) { await entrarNaLoja(guardada).catch(() => false); carrinho.reconferir(); }
const PRECISAM_DE_LOJA = ['loja', 'cardapio', 'carrinho', 'finalizar'];

// ---- Rotas ----
rota('inicio', (m) => paginaInicio(m));
rota('lista', (m) => paginaLista(m));
rota('loja', (m) => comBarra(m, () => montarCardapio(m, { pagina: true })));
rota('suporte', (m, estado) => paginaSuporte(m, estado));
rota('termos', (m) => paginaTermos(m));
rota('termos-uso', (m) => paginaTermosUso(m));
rota('reembolso', (m) => paginaReembolso(m));
rota('cookies', (m) => paginaCookies(m));
rota('adesao', (m) => paginaAdesao(m));
function comBarra(m, desenhar) {
  const r = desenhar();
  const b = barraDaLoja();
  if (b) m.prepend(b);
  return r;
}
rota('cardapio', (m) => comBarra(m, () => montarCardapio(m, { pagina: true })));
rota('carrinho', (m) => paginaCarrinho(m));
rota('finalizar', (m) => paginaFinalizar(m));
rota('pedido', (m, estado) => paginaPedido(m, estado));
rota('privacidade', (m) => paginaPrivacidade(m));
rota('404', (m) => {
  m.innerHTML = `<section class="pagina"><div class="wrap"><header class="pagina-cab"><p class="olho">Erro 404</p><h1 id="pg-h" tabindex="-1">Página não encontrada</h1></header>
    <div class="vazio"><p>O endereço não existe ou mudou.</p><a class="btn btn-primario" href="#inicio">Voltar ao início</a></div></div></section>`;
  return null;
});

// Versão nova do site chegou enquanto a pessoa preenchia o pedido (ou via a confirmação
// com o QR do Pix): não recarrega ali, porque o formulário e a confirmação se perderiam.
// Recarrega na próxima troca de página segura.
const ROTAS_SEM_RECARGA = ['finalizar', 'pedido'];
let atualizacaoPendente = false;

let iniciado = false;
iniciar((chave, render, estado) => {
  if (atualizacaoPendente && !ROTAS_SEM_RECARGA.includes(chave)) {
    location.reload();
    return null;
  }
  // link direto para uma loja (#loja?e=lanchonete-do-ze): entra nela e mostra o cardápio
  const pedida = chave === 'loja' && estado?.params?.e;
  if (pedida && lojaAtual()?.id !== pedida) {
    main.innerHTML = '<div class="wrap"><p class="campo-dica" role="status" style="margin-top:calc(var(--topo-h) + 24px)">Abrindo o cardápio…</p></div>';
    entrarNaLoja(pedida).then((ok) => location.replace(ok ? '#loja' : '#inicio'), () => location.replace('#inicio'));
    return null;
  }
  if (pedida) { location.replace('#loja'); return null; }
  if (PRECISAM_DE_LOJA.includes(chave) && !lojaAtual()) {
    location.hash = '#inicio';
    return null;
  }
  main.innerHTML = '';
  document.body.dataset.pagina = chave;
  topo.classList.add('is-solido');
  document.title = tituloDe(chave);
  document.querySelectorAll('.topo-nav a, .topo-carrinho').forEach((a) => {
    const alvo = a.getAttribute('href').slice(1);
    if (alvo === chave) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  contextoWhatsapp(chave);
  const pagina = render(main, estado);
  window.scrollTo(0, 0);
  main.classList.remove('is-entrando');
  void main.offsetWidth;
  main.classList.add('is-entrando');
  // foco no título para leitores de tela (menos na abertura do site)
  if (iniciado) main.querySelector('h1')?.focus({ preventScroll: true });
  iniciado = true;
  return pagina;
});

// ---- Carrinho no cabeçalho ----
atualizarContador(carrinho.quantidade());
carrinho.assinar((est) => atualizarContador(est.quantidade));

// ---- Pular para o conteúdo ----
document.querySelector('.pular')?.addEventListener('click', (e) => {
  e.preventDefault();
  const alvo = document.getElementById('cardapio-h') || main.querySelector('h1');
  if (alvo) {
    alvo.setAttribute('tabindex', '-1');
    alvo.scrollIntoView();
    alvo.focus();
  }
});

// ---- Horário: rodapé e aviso aberto/fechado saem de CONFIG.horario ----
const rodapeHorario = document.getElementById('horario-rodape');
function desenharRodapeHorario() {
  if (!rodapeHorario) return;
  const loja = situacaoLoja();
  rodapeHorario.innerHTML = resumoHorario().map((l) => `<p>${esc(l.dias)}<br>${esc(l.horas)}</p>`).join('')
    + `<p class="rodape-status ${loja.aberto ? 'is-aberto' : 'is-fechado'}" data-status-loja>${esc(loja.texto)}</p>`;
}
function atualizarStatusLoja() {
  const loja = situacaoLoja();
  document.querySelectorAll('[data-status-loja]').forEach((n) => {
    n.textContent = loja.texto;
    n.classList.toggle('is-aberto', loja.aberto);
    n.classList.toggle('is-fechado', !loja.aberto);
  });
}
desenharRodapeHorario();
setInterval(atualizarStatusLoja, 30000);
conferirConfig().forEach((e) => console.warn('[config]', e));

montarWhatsapp();
avisoArmazenamento();
instalarReservaDeImagens();
document.getElementById('ano').textContent = new Date().getFullYear();


// Ligado: abre sem internet as telas já visitadas e deixa instalar como app. Só em https (ou localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem PWA: o site funciona igual */ });
}
