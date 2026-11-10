// Ponto de partida: liga cabeçalho, páginas, carrinho e WhatsApp.

import { CONFIG } from './config.js';
import { rota, iniciar } from './router.js';
import { carrinho } from './store.js';
import { montarCinema } from './scene.js';
import { montarCardapio } from './pages/menu.js';
import { paginaCarrinho } from './pages/cart.js';
import { paginaFinalizar } from './pages/checkout.js';
import { paginaPedido } from './pages/tracking.js';
import { paginaPrivacidade } from './pages/privacy.js';
import { montarWhatsapp, contextoWhatsapp } from './whatsapp.js';
import { atualizarContador, instalarReservaDeImagens, avisar } from './ui.js';
import { movimentoReduzido, esc, CHAVES } from './utils.js';
import { resumoHorario, situacaoLoja } from './horario.js';
import { conferirConfig } from './delivery.js';
import { PRODUTOS, CATEGORIAS, PRODUTOS_BASE } from './products.js';
import { carregarDoBanco } from './services/cardapio.js';

// Com Supabase configurado, cardápio e dados da loja vêm do banco ANTES de desenhar a página.
// Espera no máximo 4 s; se falhar, o site segue com products.js e config.js.
if (CONFIG.api?.supabaseUrl && CONFIG.api?.chavePublica && !CONFIG.modoDemonstracao) {
  document.getElementById('conteudo')?.insertAdjacentHTML('afterbegin', '<div class="wrap" data-carregando><p class="campo-dica" role="status">Carregando o cardápio…</p></div>');
  const veio = await carregarDoBanco({ CONFIG, PRODUTOS, CATEGORIAS, reserva: PRODUTOS_BASE }, { tempo: 4000 });
  if (veio.cardapio) carrinho.reconferir();
}

document.documentElement.lang = 'pt-BR';
// Nome da marca no cabeçalho e no rodapé: sai de CONFIG.marca (o HTML só traz o texto de reserva)
const m0 = CONFIG.marca;
document.querySelectorAll('[data-marca-nome]').forEach((n) => {
  n.innerHTML = m0.nomeCurto ? `${esc(m0.nomeCurto)}${n.closest('.rodape') ? ' ' : ''}<b>${esc(m0.sufixo || '')}</b>` : esc(m0.nome);
});
document.querySelectorAll('[data-marca-descricao]').forEach((n) => { n.textContent = m0.descricao || m0.slogan || ''; });
document.querySelectorAll('[data-marca-local]').forEach((n) => { n.textContent = [m0.nome, m0.local].filter(Boolean).join(' · '); });
// razão social, CNPJ e endereço no rodapé (lei do comércio eletrônico). CNPJ provisório não aparece.
const pv = CONFIG.privacidade || {};
const empresa = [
  pv.controlador,
  /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(pv.cnpj || '') ? `${pv.cnpj.length > 14 ? 'CNPJ' : 'CPF'} ${pv.cnpj}` : '',
  pv.endereco || CONFIG.retirada?.local || '',
].filter(Boolean).join(' · ');
document.querySelectorAll('[data-empresa]').forEach((n) => { n.textContent = empresa; n.hidden = !empresa; });
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
if (!CONFIG.api?.supabaseUrl) document.querySelectorAll('[data-acompanhar]').forEach((a) => a.remove());
const main = document.getElementById('conteudo');
const topo = document.getElementById('topo');
const TITULOS = {
  inicio: CONFIG.marca.nome,
  cardapio: `Cardápio · ${CONFIG.marca.nome}`,
  carrinho: `Carrinho · ${CONFIG.marca.nome}`,
  finalizar: `Finalizar pedido · ${CONFIG.marca.nome}`,
  pedido: `Acompanhar pedido · ${CONFIG.marca.nome}`,
  privacidade: `Política de privacidade · ${CONFIG.marca.nome}`,
  404: `Página não encontrada · ${CONFIG.marca.nome}`,
};

function rolarSuave(alvo) {
  const y = window.scrollY + alvo.getBoundingClientRect().top - topo.offsetHeight + 1;
  window.scrollTo({ top: y, behavior: movimentoReduzido() ? 'auto' : 'smooth' });
}

// ---- Rotas ----
rota('inicio', (m) => {
  let cardapio;
  const cine = montarCinema(m, {
    aoCta: () => {
      rolarSuave(cardapio.secao);
      setTimeout(() => cardapio.secao.querySelector('#cardapio-h').focus({ preventScroll: true }), 600);
    },
  });
  cardapio = montarCardapio(m);
  const sec = m.querySelector('.cine');
  // cabeçalho: transparente sobre as cenas, sólido no cardápio
  const estatico = sec.classList.contains('cine--estatico');
  const aoRolar = () => topo.classList.toggle('is-solido', estatico || sec.getBoundingClientRect().bottom <= topo.offsetHeight + 1);
  const aoTom = (e) => {
    topo.dataset.tom = e.detail;
    document.body.dataset.tom = e.detail;
  };
  sec.addEventListener('tom', aoTom);
  // a cena já começou escura (fundo marrom): aplica o tom atual no cabeçalho
  const tomInicial = sec.querySelector('.cine-palco')?.dataset.tom;
  if (tomInicial && !estatico) aoTom({ detail: tomInicial });
  window.addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();
  return {
    destruir() {
      cine.destruir();
      cardapio.destruir();
      window.removeEventListener('scroll', aoRolar);
      delete topo.dataset.tom;
      delete document.body.dataset.tom;
    },
  };
});
rota('cardapio', (m) => montarCardapio(m, { pagina: true }));
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
  main.innerHTML = '';
  document.body.dataset.pagina = chave;
  topo.classList.toggle('is-solido', chave !== 'inicio');
  document.title = TITULOS[chave] || CONFIG.marca.nome;
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
  if (chave !== 'inicio' && iniciado) main.querySelector('h1')?.focus({ preventScroll: true });
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
instalarReservaDeImagens();
document.getElementById('ano').textContent = new Date().getFullYear();

// PWA: precisa de https ou localhost; em file:// ou sem suporte, segue sem instalar
if ('serviceWorker' in navigator) {
  // quando uma versão nova assume (não na 1ª visita), recarrega uma vez para não ficar na tela antiga
  const tinha = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinha || recarregou) return;
    recarregou = true;
    if (ROTAS_SEM_RECARGA.includes(document.body.dataset.pagina)) {
      atualizacaoPendente = true;
      avisar('Atualizamos o site. Atualize a página quando terminar o pedido.');
      return;
    }
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
