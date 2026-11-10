// ============================================================
// PAINEL DO RESTAURANTE (admin.html)
//
// Login da equipe (Supabase Auth, e-mail e senha) e, depois de entrar:
//   * pedidos chegando em tempo real, com som e destaque para os novos;
//   * mudar o andamento (status) e a situação do pagamento;
//   * marcar item esgotado / disponível;
//   * fechar e reabrir a loja na hora;
//   * só o dono (equipe.papel = 'dono'): preços do cardápio e das opções,
//     horários, entrega, retirada, taxa e bairros (aba "Loja").
// Tudo é gravado no banco, com o token de quem entrou: o que cada um pode
// fazer é decidido pela RLS (supabase/schema.sql), não por este arquivo
// (esconder a aba "Loja" da cozinha é só para não confundir).
// Quem entra: usuários cadastrados na tabela "equipe" (supabase/LEIAME.md, passo 5).
// ============================================================

import { CONFIG } from '../js/config.js';
import { brl, esc, chaveLocal, CHAVES } from '../js/utils.js';
import { linkMapa } from '../js/mensagem.js';
import { comandaHtml } from '../js/comanda.js';
import { clienteSupabase, guardaLocal, tempoRealPedidos } from './supabase.js';
import {
  STATUS, EM_ANDAMENTO, PAGAMENTOS, proximoPasso, statusPara, dentroDoHorario, hora, haQuanto,
  telefoneTxt, linkTelefone, linkWhatsappCliente, detalhesItem, paraComanda, consultaPedidos, CONSULTAS,
  centavosDe, reaisCampo, DIAS, horariosPorDia, faixasParaSalvar, resumoDoDia, idDoNome, caminhoFotoNova, fotoDoStorage,
} from './logica.js';
import { prepararFoto } from './fotos.js';
import { fotoDoBanco } from '../js/services/cardapio.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const main = $('#pn-conteudo');
const acoesTopo = $('#pn-acoes');
const nomeLoja = CONFIG.marca?.nome || 'Restaurante';
const TITULO = `Painel · ${nomeLoja}`;

$('[data-marca]').textContent = nomeLoja;
document.title = TITULO;

// mesmo tema escolhido no site (claro/escuro)
try {
  const t = localStorage.getItem(CHAVES.tema) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
  if (t === 'escuro') {
    document.documentElement.dataset.tema = 'escuro';
    $('meta[name=theme-color]').content = '#17130F';
  }
} catch { /* sem localStorage */ }

let timerToast;
function avisar(texto, tipo = 'ok') {
  const t = $('#toast');
  t.className = `toast toast--${tipo} is-on`;
  t.textContent = texto;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('is-on'), tipo === 'erro' ? 6000 : 2600);
}

// ---------- som de pedido novo (sem arquivo: dois bipes gerados na hora) ----------
const CHAVE_SOM = chaveLocal('painel-som');
// começa LIGADO (pedido sem som é pedido esquecido); só fica desligado se alguém desligar neste aparelho
let somLigado = (() => { try { return localStorage.getItem(CHAVE_SOM) !== '0'; } catch { return true; } })();
let audio = null;
function prepararAudio() {
  if (!somLigado) return;
  try {
    if (!audio) {
      audio = new AudioContext();
      audio.addEventListener('statechange', mostrarSom);
    }
    if (audio.state === 'suspended') audio.resume().then(mostrarSom, () => {});
  } catch { /* navegador sem Web Audio */ }
  mostrarSom();
}
// som ligado, mas o navegador ainda não liberou (página recarregou e ninguém tocou na tela)
const somBloqueado = () => somLigado && audio?.state !== 'running';
function tocar() {
  try { navigator.vibrate?.([300, 150, 300]); } catch { /* sem vibração */ }
  if (!somLigado || !audio) return;
  const t0 = audio.currentTime;
  [0, 0.28].forEach((d, i) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = i ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.24);
    o.connect(g).connect(audio.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.25);
  });
}
function mostrarSom() {
  const b = $('#pn-som');
  const bloqueado = somBloqueado();
  b.setAttribute('aria-pressed', String(somLigado));
  b.classList.toggle('is-bloqueado', bloqueado);
  $('.pn-som-txt', b).textContent = bloqueado ? 'Toque aqui para ativar o som' : somLigado ? 'Som ligado' : 'Som desligado';
}
// estava ligado mas bloqueado: o toque no botão só libera o som (não desliga). O estado é lido no
// pointerdown do botão, antes do da página liberar o áudio (senão o clique desligaria o som).
let botaoLiberava = false;
$('#pn-som').addEventListener('pointerdown', () => { botaoLiberava = somBloqueado(); });
$('#pn-som').addEventListener('click', () => {
  const liberar = botaoLiberava || somBloqueado();
  botaoLiberava = false;
  if (liberar) { prepararAudio(); tocar(); return; }
  somLigado = !somLigado;
  try { localStorage.setItem(CHAVE_SOM, somLigado ? '1' : '0'); } catch { /* fica só nesta aba */ }
  prepararAudio();
  mostrarSom();
  if (somLigado) tocar();
});
// o navegador só libera o som depois de um toque na página
document.addEventListener('pointerdown', prepararAudio);
mostrarSom();

// ---------- tela sempre acesa (tablet/celular do balcão) ----------
// Com a tela apagada o navegador corta a conexão e o pedido novo não chega. O pedido de tela acesa
// cai sozinho quando a aba some; volta quando ela aparece de novo.
let travaTela = null;
async function manterTelaAcesa() {
  if (travaTela || document.hidden || !('wakeLock' in navigator)) return;
  try {
    travaTela = await navigator.wakeLock.request('screen');
    travaTela.addEventListener('release', () => { travaTela = null; });
  } catch { /* bateria fraca ou navegador recusou */ }
}

// ============================================================
// SEM BANCO (CONFIG.api vazio): só explica o que falta
// ============================================================
function telaSemBanco() {
  main.innerHTML = `<section class="pn-cartao pn-login">
    <h1>Painel do restaurante</h1>
    <p class="aviso aviso--alerta">O painel precisa do banco de pedidos ligado. Siga o passo a passo em
    <code>supabase/LEIAME.md</code> e preencha <code>api</code> em <code>js/config.js</code>.</p>
    <p><a class="link" href="./">Voltar para o site</a></p>
  </section>`;
}

const cliente = CONFIG.api?.supabaseUrl && CONFIG.api?.chavePublica ? clienteSupabase({
  url: CONFIG.api.supabaseUrl,
  chave: CONFIG.api.chavePublica,
  guarda: guardaLocal(chaveLocal('painel')),
}) : null;

// ============================================================
// ESTADO
// ============================================================
const estado = {
  pedidos: [],
  conhecidos: null,      // ids já vistos (null = primeira carga, não toca som)
  novos: new Set(),      // pedidos recebidos que ninguém mexeu ainda
  filtro: 'andamento',
  aba: 'pedidos',
  loja: null,
  horarios: [],
  categorias: [],
  produtos: [],
  bairros: [],
  papel: 'cozinha',
  abertos: new Set(),    // "Opções de ..." e "Editar ..." abertos no cardápio (sobrevive ao redesenho)
  criando: false,        // formulário "Produto novo" aberto
  conexao: 'conectando',
  ultimaCarga: 0,
  ocupado: new Set(),
};
let canal = null;
let timers = [];
let recarga = null;
let motivoSaida = '';

cliente?.aoTrocarToken((t) => {
  if (t) canal?.trocarToken(t);
  else encerrar();
});

function encerrar() {
  canal?.fechar();
  canal = null;
  timers.forEach(clearInterval);
  timers = [];
  travaTela?.release().catch(() => {});
  estado.conhecidos = null;
  estado.novos.clear();
  estado.papel = 'cozinha';
  estado.aba = 'pedidos';
  acoesTopo.hidden = true;
  document.title = TITULO;
  telaLogin(motivoSaida || 'Sua sessão terminou. Entre de novo.');
  motivoSaida = '';
}

// ============================================================
// LOGIN
// ============================================================
function telaLogin(mensagem = '') {
  main.innerHTML = `<section class="pn-cartao pn-login">
    <h1>Painel do restaurante</h1>
    <p class="pn-dica">Entre com o e-mail e a senha que o dono cadastrou para você.</p>
    <form id="pn-form-login" novalidate>
      <div class="campo"><label for="pn-email">E-mail</label>
        <input id="pn-email" type="email" autocomplete="username" required maxlength="120" inputmode="email"></div>
      <div class="campo"><label for="pn-senha">Senha</label>
        <input id="pn-senha" type="password" autocomplete="current-password" required maxlength="120"></div>
      <p class="aviso aviso--erro pn-login-erro" id="pn-login-erro" role="alert" ${mensagem ? '' : 'hidden'}>${esc(mensagem)}</p>
      <button class="btn btn-primario btn-largo" type="submit"><span class="btn-txt">Entrar</span></button>
    </form>
  </section>`;
  const form = $('#pn-form-login');
  const erro = $('#pn-login-erro');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('#pn-email').value.trim();
    const senha = $('#pn-senha').value;
    const falhar = (m) => { erro.textContent = m; erro.hidden = false; };
    if (!email || !senha) { falhar('Preencha e-mail e senha.'); return; }
    const botao = $('button[type=submit]', form);
    botao.disabled = true;
    botao.classList.add('is-carregando');
    erro.hidden = true;
    prepararAudio();
    try {
      await cliente.entrar(email, senha);
      await iniciarPainel();
    } catch (e) {
      if (!document.body.contains(form)) return;   // já trocou de tela (ex.: sem acesso)
      falhar(e.message || 'Não deu para entrar agora.');
      botao.disabled = false;
      botao.classList.remove('is-carregando');
    }
  });
  $('#pn-email').focus();
}

// ============================================================
// PAINEL
// ============================================================
async function iniciarPainel() {
  const uid = cliente.usuario()?.id;
  let equipe;
  try {
    equipe = await cliente.rest(CONSULTAS.equipe(uid));
  } catch (e) {
    if (e.status === 401) return;   // sessão caiu: encerrar() já mostrou o login
    main.innerHTML = `<section class="pn-cartao pn-login"><h1>Painel do restaurante</h1>
      <p class="aviso aviso--erro" role="alert">${esc(e.message)}</p>
      <button class="btn btn-primario btn-largo" type="button" data-tentar>Tentar de novo</button></section>`;
    $('[data-tentar]').addEventListener('click', iniciarPainel);
    return;
  }
  if (!Array.isArray(equipe) || !equipe.length) {
    motivoSaida = 'Este usuário não tem acesso ao painel. Peça ao dono para incluir você na equipe.';
    await cliente.sair();
    return;
  }

  estado.papel = equipe[0].papel === 'dono' ? 'dono' : 'cozinha';
  const dono = estado.papel === 'dono';
  acoesTopo.hidden = false;
  main.innerHTML = `
    <section class="pn-loja" id="pn-loja" aria-label="Situação da loja"><p class="pn-dica">Carregando a loja…</p></section>
    <div class="pn-abas" role="tablist" aria-label="Seções do painel">
      <button type="button" role="tab" id="tab-pedidos" aria-controls="pn-aba-pedidos" aria-selected="true" data-aba="pedidos">Pedidos <span class="pn-cont" id="pn-cont" hidden></span></button>
      <button type="button" role="tab" id="tab-cardapio" aria-controls="pn-aba-cardapio" aria-selected="false" data-aba="cardapio" tabindex="-1">Cardápio</button>
      ${dono ? '<button type="button" role="tab" id="tab-loja" aria-controls="pn-aba-loja" aria-selected="false" data-aba="loja" tabindex="-1">Loja</button>' : ''}
    </div>
    <section id="pn-aba-pedidos" role="tabpanel" aria-labelledby="tab-pedidos">
      <div class="pn-filtros">
        <button type="button" class="chip chip--peq" data-filtro="andamento" aria-pressed="true">Em andamento</button>
        <button type="button" class="chip chip--peq" data-filtro="concluidos" aria-pressed="false">Concluídos e cancelados (24 h)</button>
      </div>
      <p class="aviso aviso--erro" id="pn-erro" role="alert" hidden></p>
      <p class="pn-resumo" id="pn-resumo" hidden></p>
      <div class="pn-lista" id="pn-lista"><p class="pn-dica">Carregando pedidos…</p></div>
    </section>
    <section id="pn-aba-cardapio" role="tabpanel" aria-labelledby="tab-cardapio" hidden>
      <p class="pn-dica">Esgotado: o produto continua aparecendo no site, mas ninguém consegue pedir. Volta a vender quando você marcar disponível.</p>
      ${dono ? '<p class="pn-dica">Preço: digite o valor novo e aperte Enter (ou saia do campo). Vale na hora para quem abrir o site; quem já estava com o carrinho aberto vê o total novo antes de confirmar.</p>' : ''}
      <div id="pn-cardapio"><p class="pn-dica">Carregando cardápio…</p></div>
    </section>
    ${dono ? `<section id="pn-aba-loja" role="tabpanel" aria-labelledby="tab-loja" hidden>
      <div class="pn-ajustes"><div id="pn-horarios"><p class="pn-dica">Carregando…</p></div><div id="pn-entrega"></div></div>
    </section>` : ''}`;

  await Promise.all([carregarPedidos(), carregarLoja(), carregarCardapio()]);
  if (!cliente.usuario()) return;

  canal = tempoRealPedidos({
    url: CONFIG.api.supabaseUrl,
    chave: CONFIG.api.chavePublica,
    token: () => cliente.token(),
    aoMudar: () => {
      clearTimeout(recarga);
      recarga = setTimeout(carregarPedidos, 250);
    },
    aoEstado: (s) => {
      // voltou a conexão: busca o que mudou enquanto estava fora
      if (s === 'ao-vivo' && estado.conexao !== 'ao-vivo' && estado.ultimaCarga) carregarPedidos();
      estado.conexao = s;
      mostrarConexao();
    },
  });

  timers.push(setInterval(() => {
    // sem tempo real: confere a cada 15 s. Com tempo real: a cada 2 min, por garantia.
    const espera = estado.conexao === 'ao-vivo' ? 120_000 : 15_000;
    if (Date.now() - estado.ultimaCarga >= espera) carregarPedidos();
  }, 5000));
  manterTelaAcesa();
  // pedido novo que ninguém mexeu: toca de novo a cada 20 s até alguém tocar em "Começar preparo"
  timers.push(setInterval(() => {
    if (estado.novos.size) tocar();
    mostrarSom();
  }, 20_000));
  timers.push(setInterval(() => {
    document.querySelectorAll('[data-ha]').forEach((n) => { n.textContent = haQuanto(n.dataset.ha); });
    mostrarLoja();   // o horário pode virar (abre/fecha sozinha)
  }, 30_000));
}

function mostrarConexao() {
  const n = $('#pn-conexao');
  n.dataset.estado = estado.conexao;
  n.textContent = estado.conexao === 'ao-vivo' ? 'Ao vivo'
    : estado.conexao === 'conectando' ? 'Conectando…' : 'Sem tempo real: atualizando a cada 15 s';
}

function mostrarErro(msg) {
  const n = $('#pn-erro');
  if (!n) return;
  n.textContent = msg ? `Não deu para atualizar os pedidos: ${msg}` : '';
  n.hidden = !msg;
}

let carregando = null;
async function carregarPedidos() {
  if (carregando) return carregando;
  carregando = (async () => {
    try {
      const lista = await cliente.rest(consultaPedidos());
      estado.ultimaCarga = Date.now();
      receberPedidos(Array.isArray(lista) ? lista : []);
      mostrarErro('');
    } catch (e) {
      estado.ultimaCarga = Date.now();
      if (e.status !== 401) mostrarErro(e.message);
    } finally {
      carregando = null;
    }
  })();
  return carregando;
}

function receberPedidos(lista) {
  const primeira = estado.conhecidos === null;
  const conhecidos = estado.conhecidos || new Set();
  const chegaram = lista.filter((p) => !conhecidos.has(p.id) && p.status === 'recebido');
  lista.forEach((p) => conhecidos.add(p.id));
  estado.conhecidos = conhecidos;
  estado.pedidos = lista;
  if (!primeira && chegaram.length) {
    chegaram.forEach((p) => estado.novos.add(p.id));
    tocar();
    avisar(chegaram.length === 1 ? `Pedido novo: ${chegaram[0].codigo}` : `${chegaram.length} pedidos novos`);
  }
  // "novo" some quando alguém mexe no pedido
  for (const id of estado.novos) {
    const p = lista.find((x) => x.id === id);
    if (!p || p.status !== 'recebido') estado.novos.delete(id);
  }
  document.title = estado.novos.size ? `(${estado.novos.size}) Pedido novo! · ${nomeLoja}` : TITULO;
  mostrarPedidos();
}

// ---------- lista de pedidos ----------
function mostrarPedidos() {
  const alvo = $('#pn-lista');
  if (!alvo) return;
  const andamento = estado.pedidos.filter((p) => EM_ANDAMENTO.includes(p.status))
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));   // fila da cozinha: mais antigo primeiro
  const concluidos = estado.pedidos.filter((p) => !EM_ANDAMENTO.includes(p.status));
  const cont = $('#pn-cont');
  cont.textContent = andamento.length;
  cont.hidden = !andamento.length;
  const lista = estado.filtro === 'andamento' ? andamento : concluidos;
  mostrarResumo();

  // guarda o foco (o cartão é redesenhado a cada mudança)
  const ativo = document.activeElement;
  const foco = ativo?.closest?.('.pn-pedido') && ativo.dataset.foco ? `${ativo.closest('.pn-pedido').dataset.id}|${ativo.dataset.foco}` : null;

  alvo.innerHTML = lista.length ? lista.map(cartaoPedido).join('')
    : `<p class="pn-vazio">${estado.filtro === 'andamento' ? 'Nenhum pedido em andamento. Os novos aparecem aqui sozinhos.' : 'Nenhum pedido concluído nas últimas 24 horas.'}</p>`;

  if (foco) {
    const [id, f] = foco.split('|');
    alvo.querySelector(`.pn-pedido[data-id="${CSS.escape(id)}"] [data-foco="${CSS.escape(f)}"]`)?.focus();
  }
}

// fechamento de caixa: vendas de hoje (sem cancelados), por forma de pagamento
function mostrarResumo() {
  const n = $('#pn-resumo');
  if (!n) return;
  const r = resumoDoDia(estado.pedidos, estado.loja?.fuso || CONFIG.horario?.fuso || 'America/Sao_Paulo');
  n.hidden = !r.quantidade;
  if (!r.quantidade) return;
  const formas = Object.entries(r.porForma).map(([f, v]) => `${esc(PAGAMENTOS[f] || f)} ${brl(v)}`).join(' · ');
  n.innerHTML = `<b>Hoje: ${r.quantidade} ${r.quantidade === 1 ? 'pedido' : 'pedidos'} · ${brl(r.total)}</b><span>${formas}${r.pixPendente ? ` · <b class="pn-resumo-alerta">${r.pixPendente} Pix sem confirmar</b>` : ''}</span>`;
}

function cartaoPedido(p) {
  const fuso = estado.loja?.fuso || CONFIG.horario?.fuso || 'America/Sao_Paulo';
  const e = p.entrega;
  const prox = proximoPasso(p);
  const ocupado = estado.ocupado.has(p.id);
  const dis = ocupado ? ' disabled' : '';
  const pago = p.pagamento_status === 'confirmado';
  const forma = PAGAMENTOS[p.pagamento_forma] || p.pagamento_forma;
  const destino = p.modo === 'entrega' && e
    ? `<p>${esc(e.endereco)}, ${esc(e.numero)}${e.complemento ? ` · ${esc(e.complemento)}` : ''}<br>${esc(e.bairro)}, ${esc(e.cidade)}${e.cep ? ` · CEP ${esc(e.cep)}` : ''}</p>
       <p><a class="link" href="${esc(linkMapa(e))}" target="_blank" rel="noopener noreferrer">Abrir no mapa</a></p>`
    : '<p><b>Retirada no balcão</b></p>';
  const itens = (p.pedido_itens || []).map((i) => `<li>
      <span class="pn-qtd">${i.qtd}x</span>
      <span class="pn-item"><b>${esc(i.nome)}</b>${detalhesItem(i).map((d) => `<small>${esc(d)}</small>`).join('')}${i.obs ? `<small class="pn-obs">Obs.: ${esc(i.obs)}</small>` : ''}</span>
      <span class="pn-preco">${brl(i.preco_unitario * i.qtd)}</span>
    </li>`).join('');
  const troco = p.pagamento_forma === 'dinheiro' && p.troco_para
    ? `<br>Troco para ${brl(p.troco_para)}: levar <b>${brl(p.troco_para - p.total)}</b>` : '';
  const opcoes = statusPara(p.modo).map((s) => `<option value="${s}"${s === p.status ? ' selected' : ''}>${STATUS[s]}</option>`).join('');

  return `<article class="pn-pedido is-${p.status}${estado.novos.has(p.id) ? ' is-novo' : ''}" data-id="${p.id}" aria-label="Pedido ${esc(p.codigo)}">
    <header class="pn-ped-topo">
      <p class="pn-ped-cod">${esc(p.codigo)}</p>
      <p class="pn-ped-hora">${esc(hora(p.criado_em, fuso))} · <span data-ha="${esc(p.criado_em)}">${esc(haQuanto(p.criado_em))}</span></p>
      <p class="pn-etiquetas">
        ${estado.novos.has(p.id) ? '<span class="pn-tag pn-tag--novo">Novo</span>' : ''}
        <span class="pn-tag">${p.modo === 'retirada' ? 'Retirada' : 'Entrega'}</span>
        <span class="pn-tag pn-tag--${p.status}">${STATUS[p.status] || esc(p.status)}</span>
      </p>
    </header>
    <div class="pn-ped-cliente">
      <p><b>${esc(p.cliente_nome)}</b></p>
      <p><a class="link" href="${esc(linkTelefone(p.cliente_telefone))}">${esc(telefoneTxt(p.cliente_telefone))}</a>
        · <a class="link" href="${esc(linkWhatsappCliente(p.cliente_telefone))}" target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
      ${destino}
    </div>
    <ul class="pn-itens">${itens}</ul>
    ${p.obs ? `<p class="pn-ped-obs">Obs. do pedido: ${esc(p.obs)}</p>` : ''}
    <dl class="pn-totais">
      <div><dt>Subtotal</dt><dd>${brl(p.subtotal)}</dd></div>
      ${p.modo === 'entrega' ? `<div><dt>Entrega</dt><dd>${p.taxa ? brl(p.taxa) : 'grátis'}</dd></div>` : ''}
      ${p.desconto ? `<div><dt>Desconto</dt><dd>−${brl(p.desconto)}</dd></div>` : ''}
      <div class="pn-total"><dt>Total</dt><dd>${brl(p.total)}</dd></div>
    </dl>
    <p class="pn-pag">${esc(forma)} · <span class="pn-tag pn-pag--${pago ? 'ok' : p.pagamento_status === 'cancelado' ? 'cancelado' : 'pendente'}">${pago ? 'Pago' : p.pagamento_status === 'cancelado' ? 'Pagamento cancelado' : 'Pagamento pendente'}</span>${troco}</p>
    ${p.pagamento_forma === 'pix' && !pago && p.pagamento_status !== 'cancelado' && p.status !== 'cancelado' ? `<div class="pn-conferir-pix">
      <p>Confira no app do banco se chegou um Pix de</p>
      <p class="pn-conferir-valor">${brl(p.total)}</p>
      <p>de <b>${esc(p.cliente_nome)}</b>. Chegou? Toque em “Confirmar pagamento”.</p>
    </div>` : ''}
    <div class="pn-ped-acoes">
      ${prox ? `<button type="button" class="btn btn-primario" data-status="${prox.status}" data-foco="avancar"${dis}>${prox.rotulo}</button>` : ''}
      <button type="button" class="btn btn-sec" data-pagamento="${pago ? 'pendente' : 'confirmado'}" data-foco="pagamento"${dis}>${pago ? 'Desfazer pagamento' : 'Confirmar pagamento'}</button>
      <label class="pn-mudar"><span>Status</span>
        <select data-mudar data-foco="mudar" aria-label="Mudar status do pedido ${esc(p.codigo)}"${dis}>${opcoes}</select></label>
      <button type="button" class="link" data-imprimir data-foco="imprimir">Imprimir comanda</button>
    </div>
  </article>`;
}

async function mudarPedido(id, campos) {
  const p = estado.pedidos.find((x) => x.id === id);
  if (!p || estado.ocupado.has(id)) return;
  estado.ocupado.add(id);
  estado.novos.delete(id);
  mostrarPedidos();
  try {
    const r = await cliente.rest(`pedidos?id=eq.${id}`, { method: 'PATCH', body: campos, headers: { Prefer: 'return=representation' } });
    if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para mudar este pedido.');
    Object.assign(p, campos, { status: r[0].status, pagamento_status: r[0].pagamento_status });
    avisar(`${p.codigo}: ${'status' in campos ? STATUS[p.status] : p.pagamento_status === 'confirmado' ? 'pagamento confirmado' : 'pagamento pendente'}`);
  } catch (e) {
    if (e.status !== 401) avisar(e.message || 'Não deu para salvar.', 'erro');
  } finally {
    estado.ocupado.delete(id);
    document.title = estado.novos.size ? `(${estado.novos.size}) Pedido novo! · ${nomeLoja}` : TITULO;
    mostrarPedidos();
  }
}

// ---------- loja aberta / fechada ----------
async function carregarLoja() {
  try {
    const [loja, horarios, bairros] = await Promise.all([cliente.rest(CONSULTAS.loja), cliente.rest(CONSULTAS.horarios),
      estado.papel === 'dono' ? cliente.rest(CONSULTAS.bairros) : []]);
    estado.loja = Array.isArray(loja) ? loja[0] || null : null;
    estado.horarios = Array.isArray(horarios) ? horarios : [];
    estado.bairros = Array.isArray(bairros) ? bairros : [];
  } catch (e) {
    if (e.status === 401) return;
    const n = $('#pn-loja');
    if (n) n.innerHTML = `<p class="aviso aviso--erro">Não deu para ler a situação da loja: ${esc(e.message)}</p>`;
    return;
  }
  mostrarLoja();
}

function mostrarLoja() {
  const n = $('#pn-loja');
  const l = estado.loja;
  if (!n || !l) return;
  const noHorario = dentroDoHorario(estado.horarios, l.fuso);
  let titulo;
  let detalhe;
  if (!l.aberta_manual) {
    titulo = 'Loja fechada agora';
    detalhe = 'Você fechou pelo painel. Ninguém consegue pedir pelo site até reabrir.';
  } else if (noHorario) {
    titulo = 'Loja aberta';
    detalhe = 'Recebendo pedidos pelo site.';
  } else {
    titulo = 'Fora do horário';
    detalhe = l.bloquear_fechado ? 'O site não aceita pedidos agora. Abre sozinha no horário de funcionamento.'
      : 'Fora do horário, mas o site está aceitando pedidos (bloquear_fechado desligado).';
  }
  const aberta = l.aberta_manual && (noHorario || !l.bloquear_fechado);
  n.className = `pn-loja ${aberta ? 'is-aberta' : 'is-fechada'}`;
  n.innerHTML = `<p class="pn-loja-txt"><b>${titulo}</b><span>${detalhe}</span></p>
    <button type="button" class="btn ${l.aberta_manual ? 'btn-sec' : 'btn-primario'}" data-loja="${l.aberta_manual ? 'fechar' : 'abrir'}">
      ${l.aberta_manual ? 'Fechar agora' : 'Reabrir a loja'}</button>`;
}

async function mudarLoja(abrir) {
  if (!abrir && !confirm('Fechar a loja agora? O site para de aceitar pedidos até você reabrir.')) return;
  const b = $('[data-loja]');
  if (b) b.disabled = true;
  try {
    const r = await cliente.rest('loja?id=eq.1', { method: 'PATCH', body: { aberta_manual: abrir }, headers: { Prefer: 'return=representation' } });
    if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para abrir ou fechar a loja.');
    estado.loja = { ...estado.loja, aberta_manual: r[0].aberta_manual };
    avisar(abrir ? 'Loja reaberta.' : 'Loja fechada: o site não aceita pedidos.');
  } catch (e) {
    if (e.status !== 401) avisar(e.message || 'Não deu para salvar.', 'erro');
  }
  mostrarLoja();
}

// ---------- cardápio: esgotado / disponível ----------
async function carregarCardapio() {
  try {
    const [cats, prods] = await Promise.all([cliente.rest(CONSULTAS.categorias), cliente.rest(CONSULTAS.produtos)]);
    estado.categorias = Array.isArray(cats) ? cats : [];
    estado.produtos = Array.isArray(prods) ? prods : [];
  } catch (e) {
    if (e.status === 401) return;
    const n = $('#pn-cardapio');
    if (n) n.innerHTML = `<p class="aviso aviso--erro">Não deu para ler o cardápio: ${esc(e.message)}</p>`;
    return;
  }
  mostrarCardapio();
}

const ordem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.id).localeCompare(String(b.id));

// campo de preço do dono. tipo = 'produto' | 'opcao'
// (aria-label no próprio campo: com <label> em volta, o leitor de tela leria o valor junto com o nome)
const campoPreco = (tipo, id, preco, rotulo) => `<span class="pn-preco-campo"><span aria-hidden="true">R$</span>
  <input type="text" inputmode="decimal" autocomplete="off" maxlength="10" value="${reaisCampo(preco)}" aria-label="${esc(rotulo)}"
  data-preco="${tipo}" data-id="${esc(String(id))}" data-valor="${preco}"${estado.ocupado.has(`${tipo}:${id}`) ? ' disabled' : ''}></span>`;

function opcoesDoProduto(p) {
  const grupos = (p.grupos_opcao || []).filter((g) => (g.opcoes || []).length).sort(ordem);
  if (!grupos.length) return '';
  const aberto = estado.abertos.has(p.id) ? ' open' : '';
  return `<li class="pn-opcoes"><details data-opcoes="${esc(p.id)}"${aberto}><summary>Preços das opções de ${esc(p.nome)}</summary>
    ${grupos.map((g) => `<p class="pn-grupo">${esc(g.nome)}</p><ul>${[...g.opcoes].sort(ordem).map((o) => `
      <li class="pn-prod pn-opcao"><span class="pn-prod-nome">${esc(o.nome)}${o.ativo ? '' : ' <small>(desativada)</small>'}</span>
        ${campoPreco('opcao', o.id, o.preco, `Preço a mais de ${o.nome} (${g.nome}, ${p.nome})`)}</li>`).join('')}</ul>`).join('')}
  </details></li>`;
}

// ---------- produto: criar, editar nome/descrição/categoria, foto, tirar do cardápio (só o dono) ----------
const urlFoto = (imagem) => fotoDoBanco(imagem, CONFIG.api?.supabaseUrl);
function formProduto(p = null) {
  const novo = !p;
  const sufixo = novo ? 'novo' : esc(p.id);
  const foto = p && urlFoto(p.imagem);
  const cats = estado.categorias.map((c) => `<option value="${esc(c.id)}"${p?.categoria_id === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  return `<form class="pn-form-produto" data-produto-form="${novo ? '' : esc(p.id)}" novalidate>
    <div class="pn-foto-linha">
      <img class="pn-foto" data-previa alt="" ${foto ? `src="${esc(foto)}"` : 'hidden'}>
      <div class="campo"><label for="pf-foto-${sufixo}">${foto ? 'Trocar foto' : 'Foto'} <span class="opcional">opcional</span></label>
        <input id="pf-foto-${sufixo}" name="foto" type="file" accept="image/*">
        <p class="campo-dica">Quadrada fica melhor. O painel corta o centro e deixa a foto leve.</p></div>
    </div>
    <div class="linha-campos">
      <div class="campo"><label for="pf-nome-${sufixo}">Nome</label>
        <input id="pf-nome-${sufixo}" name="nome" type="text" maxlength="60" value="${esc(p?.nome || '')}" autocomplete="off"></div>
      <div class="campo"><label for="pf-cat-${sufixo}">Categoria</label>
        <select id="pf-cat-${sufixo}" name="categoria">${novo ? '<option value="">Escolha</option>' : ''}${cats}</select></div>
    </div>
    <div class="campo"><label for="pf-desc-${sufixo}">Descrição <span class="opcional">opcional</span></label>
      <textarea id="pf-desc-${sufixo}" name="descricao" rows="2" maxlength="300">${esc(p?.descricao || '')}</textarea></div>
    ${novo ? `<div class="campo pn-campo-curto"><label for="pf-preco-novo">Preço (R$)</label>
      <input id="pf-preco-novo" name="preco" type="text" inputmode="decimal" maxlength="10" placeholder="28,90" autocomplete="off"></div>`
    : `<label class="check"><input type="checkbox" name="ativo"${p.ativo ? ' checked' : ''}> Aparece no cardápio do site</label>`}
    ${novo ? '<p class="pn-dica">Opções (tamanho, adicionais) de produto novo ainda são criadas no Supabase (Table Editor).</p>' : ''}
    <p class="aviso aviso--erro" data-erro role="alert" hidden></p>
    <button type="submit" class="btn btn-primario"><span class="btn-txt">${novo ? 'Criar produto' : 'Salvar'}</span></button>
  </form>`;
}

const editorProduto = (p) => `<li class="pn-opcoes"><details data-editar="${esc(p.id)}"${estado.abertos.has(`e:${p.id}`) ? ' open' : ''}>
  <summary>Editar nome, descrição e foto de ${esc(p.nome)}</summary>${formProduto(p)}</details></li>`;

async function salvarProduto(form) {
  const id = form.dataset.produtoForm;
  const novo = !id;
  const erro = $('[data-erro]', form);
  const falhar = (m) => { erro.textContent = m; erro.hidden = false; };
  const nome = form.elements.nome.value.trim();
  const descricao = form.elements.descricao.value.trim();
  const categoria = form.elements.categoria.value;
  if (nome.length < 2) return falhar('Digite o nome do produto.');
  if (!estado.categorias.some((c) => c.id === categoria)) return falhar('Escolha a categoria.');
  const preco = novo ? centavosDe(form.elements.preco.value) : null;
  if (novo && preco === null) return falhar('Confira o preço (ex.: 28,90).');
  const arquivo = form.elements.foto.files?.[0];
  erro.hidden = true;
  const botao = $('button[type=submit]', form);
  botao.disabled = true;
  botao.classList.add('is-carregando');
  let criado = null;
  try {
    // a foto é preparada antes de gravar: foto que não abre não deixa produto pela metade
    const foto = arquivo ? await prepararFoto(arquivo) : null;
    let prod = estado.produtos.find((x) => x.id === id);
    if (novo) {
      const ordem = Math.max(0, ...estado.produtos.filter((x) => x.categoria_id === categoria).map((x) => x.ordem ?? 0)) + 1;
      const r = await cliente.rest('produtos', { method: 'POST', body: { id: idDoNome(nome, estado.produtos.map((x) => x.id)), categoria_id: categoria, nome, descricao, preco, ordem }, headers: { Prefer: 'return=representation' } });
      if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para criar produto. Só o dono pode.');
      prod = criado = r[0];
    }
    if (!prod) throw new Error('Produto não encontrado. Atualize a página.');
    const campos = novo ? {} : { nome, descricao, categoria_id: categoria, ativo: form.elements.ativo.checked };
    const antiga = prod.imagem;
    if (foto) {
      const caminho = caminhoFotoNova(prod.id, foto.ext);
      await cliente.enviarArquivo(`produtos/${caminho}`, foto.blob);
      campos.imagem = caminho;
    }
    if (Object.keys(campos).length) {
      const r = await cliente.rest(`produtos?id=eq.${encodeURIComponent(prod.id)}`, { method: 'PATCH', body: campos, headers: { Prefer: 'return=representation' } });
      if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para mudar o cardápio. Só o dono pode.');
    }
    // foto antiga do Storage não serve mais (as do site, em assets/, ficam)
    if (foto && fotoDoStorage(antiga)) cliente.apagarArquivo(`produtos/${antiga}`).catch(() => {});
    if (novo) estado.criando = false;
    else estado.abertos.delete(`e:${prod.id}`);
    await carregarCardapio();
    avisar(novo ? `${nome} criado. Já aparece no site.` : `${nome}: salvo. O site já mostra.`);
  } catch (e) {
    if (e.status === 401) return;
    botao.disabled = false;
    botao.classList.remove('is-carregando');
    if (criado) {
      // o produto foi criado, só a foto falhou: mostra o produto e explica
      estado.criando = false;
      await carregarCardapio();
      avisar(`${criado.nome} criado, mas a foto não foi enviada (${e.message}). Tente em "Editar".`, 'erro');
      return;
    }
    falhar(e.message || 'Não deu para salvar.');
  }
}

function mostrarCardapio() {
  const n = $('#pn-cardapio');
  if (!n) return;
  const dono = estado.papel === 'dono';
  const blocos = estado.categorias.map((c) => {
    const prods = estado.produtos.filter((p) => p.categoria_id === c.id);
    if (!prods.length) return '';
    return `<section class="pn-cat"><h2>${esc(c.nome)}</h2><ul>${prods.map((p) => `
      <li class="pn-prod${p.disponivel ? '' : ' is-esgotado'}${p.ativo ? '' : ' is-oculto'}">
        <span class="pn-prod-nome">${esc(p.nome)}${p.ativo ? '' : ' <small>(fora do cardápio)</small>'}</span>
        ${dono ? campoPreco('produto', p.id, p.preco, `Preço de ${p.nome}`) : `<span class="pn-prod-preco">${brl(p.preco)}</span>`}
        <button type="button" class="pn-chave" role="switch" aria-checked="${p.disponivel}" data-produto="${esc(p.id)}"
          aria-label="${esc(p.nome)}: ${p.disponivel ? 'disponível' : 'esgotado'}"${estado.ocupado.has(`p:${p.id}`) ? ' disabled' : ''}>
          <span class="pn-chave-txt">${p.disponivel ? 'Disponível' : 'Esgotado'}</span></button>
      </li>${dono ? editorProduto(p) + opcoesDoProduto(p) : ''}`).join('')}</ul></section>`;
  }).join('');
  const criar = dono ? `<div class="pn-novo-produto">${estado.criando
    ? `<section class="pn-cartao pn-form"><h2>Produto novo</h2>${formProduto()}
        <button type="button" class="link" data-cancelar-produto>Cancelar</button></section>`
    : '<button type="button" class="btn btn-sec" data-novo-produto>+ Produto novo</button>'}</div>` : '';
  n.innerHTML = criar + (blocos || '<p class="pn-vazio">Nenhum produto no banco.</p>');
}

// preço novo (só o dono; o banco recusa da cozinha). input = o campo que mudou.
async function salvarPreco(input) {
  const tipo = input.dataset.preco;
  const id = input.dataset.id;
  const antes = Number(input.dataset.valor);
  const novo = centavosDe(input.value);
  if (novo === null) {
    avisar('Preço inválido. Use só números, como 28,90 (até R$ 10.000,00).', 'erro');
    input.value = reaisCampo(antes);
    return;
  }
  if (novo === antes) { input.value = reaisCampo(antes); return; }
  const prod = tipo === 'produto' ? estado.produtos.find((p) => p.id === id) : null;
  const opcao = tipo === 'opcao' ? estado.produtos.flatMap((p) => (p.grupos_opcao || []).flatMap((g) => g.opcoes || [])).find((o) => String(o.id) === id) : null;
  const item = prod || opcao;
  const chave = `${tipo}:${id}`;
  if (!item || estado.ocupado.has(chave)) return;
  estado.ocupado.add(chave);
  input.disabled = true;
  try {
    const tabela = tipo === 'produto' ? 'produtos' : 'opcoes';
    const r = await cliente.rest(`${tabela}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { preco: novo }, headers: { Prefer: 'return=representation' } });
    if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para mudar preços. Só o dono pode.');
    item.preco = r[0].preco;
    avisar(`${item.nome}: ${brl(item.preco)}`);
  } catch (e) {
    if (e.status !== 401) avisar(e.message || 'Não deu para salvar o preço.', 'erro');
  } finally {
    // atualiza só o campo (redesenhar tiraria o foco de quem já passou para o próximo com Tab)
    estado.ocupado.delete(chave);
    const campo = $(`[data-preco="${tipo}"][data-id="${CSS.escape(id)}"]`);
    if (campo) {
      campo.disabled = false;
      campo.dataset.valor = item.preco;
      campo.value = reaisCampo(item.preco);
    }
  }
}

async function mudarProduto(id) {
  const p = estado.produtos.find((x) => x.id === id);
  const chave = `p:${id}`;
  if (!p || estado.ocupado.has(chave)) return;
  estado.ocupado.add(chave);
  mostrarCardapio();
  try {
    const r = await cliente.rest(`produtos?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { disponivel: !p.disponivel }, headers: { Prefer: 'return=representation' } });
    if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para mudar o cardápio.');
    p.disponivel = r[0].disponivel;
    avisar(`${p.nome}: ${p.disponivel ? 'disponível' : 'esgotado'}`);
  } catch (e) {
    if (e.status !== 401) avisar(e.message || 'Não deu para salvar.', 'erro');
  } finally {
    estado.ocupado.delete(chave);
    mostrarCardapio();
    $(`[data-produto="${CSS.escape(id)}"]`)?.focus();
  }
}

// ============================================================
// ABA LOJA (só o dono): horários, entrega, retirada, taxa e bairros.
// Cada formulário salva tudo de uma vez por uma função do banco
// (salvar_horarios / salvar_entrega), que confere de novo e recusa o que estiver errado.
// ============================================================
const lerHorariosDaTela = () => DIAS.map((_, i) => [...document.querySelectorAll(`#pn-form-horarios [data-dia="${i}"] .pn-faixa`)]
  .map((f) => ({ abre: $('[data-abre]', f).value, fecha: $('[data-fecha]', f).value })));

function mostrarHorarios(dias = horariosPorDia(estado.horarios)) {
  const n = $('#pn-horarios');
  if (!n) return;
  n.innerHTML = `<form class="pn-cartao pn-form" id="pn-form-horarios" novalidate>
    <h2>Horário de funcionamento</h2>
    <p class="pn-dica">Fora destes horários o site não aceita pedidos. Dia sem horário fica fechado.
      Passa da meia-noite? Exemplo: abre 18:00 e fecha 02:00.</p>
    ${dias.map((faixas, i) => `<fieldset class="pn-dia" data-dia="${i}"><legend>${DIAS[i]}</legend>
      <div class="pn-faixas">${faixas.length ? faixas.map((f, j) => `<div class="pn-faixa">
        <label>Abre <input type="time" data-abre value="${esc(f.abre)}" required></label>
        <label>Fecha <input type="time" data-fecha value="${esc(f.fecha)}" required></label>
        <button type="button" class="link link--perigo" data-tirar-faixa="${j}" aria-label="Remover horário ${j + 1} de ${DIAS[i]}">Remover</button>
      </div>`).join('') : '<p class="pn-fechado">Fechado</p>'}</div>
      ${faixas.length < 4 ? `<button type="button" class="link" data-mais-faixa aria-label="Adicionar horário em ${DIAS[i]}">+ Horário</button>` : ''}
    </fieldset>`).join('')}
    <p class="aviso aviso--erro" data-erro role="alert" hidden></p>
    <button type="submit" class="btn btn-primario"><span class="btn-txt">Salvar horários</span></button>
  </form>`;
}

function mexerFaixa(botao) {
  const dia = Number(botao.closest('[data-dia]').dataset.dia);
  const dias = lerHorariosDaTela();
  if (botao.hasAttribute('data-mais-faixa')) {
    // sugere o último horário do dia, ou o do dia anterior, ou um jantar
    const modelo = dias[dia].at(-1) || dias[(dia + 6) % 7][0] || { abre: '18:00', fecha: '23:00' };
    dias[dia].push({ ...modelo });
  } else {
    dias[dia].splice(Number(botao.dataset.tirarFaixa), 1);
  }
  mostrarHorarios(dias);
  const caixa = $(`#pn-form-horarios [data-dia="${dia}"]`);
  ($('.pn-faixa:last-child [data-abre]', caixa) || $('[data-mais-faixa]', caixa))?.focus();
}

async function salvarHorarios(form) {
  const erro = $('[data-erro]', form);
  const { faixas, erro: msg } = faixasParaSalvar(lerHorariosDaTela());
  erro.hidden = !msg;
  erro.textContent = msg || '';
  if (msg) return;
  if (!faixas.length && !confirm('Sem nenhum horário, a loja fica fechada todos os dias. Salvar assim?')) return;
  const botao = $('button[type=submit]', form);
  botao.disabled = true;
  try {
    const r = await cliente.rest('rpc/salvar_horarios', { method: 'POST', body: { faixas } });
    estado.horarios = Array.isArray(r) ? r : faixas;
    mostrarHorarios();
    mostrarLoja();
    avisar('Horários salvos. O site já usa os novos.');
  } catch (e) {
    botao.disabled = false;
    if (e.status === 401) return;
    erro.textContent = e.message || 'Não deu para salvar.';
    erro.hidden = false;
  }
}

// formulário de entrega: valores do banco em centavos, na tela em reais
const entregaDoBanco = () => {
  const l = estado.loja || {};
  return {
    entregaAtiva: l.entrega_ativa !== false, entregaTempo: l.entrega_tempo || '', entregaMinimo: reaisCampo(l.entrega_minimo),
    taxaTipo: l.taxa_tipo === 'bairro' ? 'bairro' : 'fixa', taxaFixa: reaisCampo(l.taxa_fixa),
    retiradaAtiva: l.retirada_ativa !== false, retiradaTempo: l.retirada_tempo || '', retiradaMinimo: reaisCampo(l.retirada_minimo),
    bairros: estado.bairros.map((b) => ({ nome: b.nome, taxa: reaisCampo(b.taxa), ativo: b.ativo !== false })),
  };
};
function lerEntregaDaTela() {
  const f = $('#pn-form-entrega');
  const v = (n) => f.elements[n].value;
  return {
    entregaAtiva: f.elements.entregaAtiva.checked, entregaTempo: v('entregaTempo'), entregaMinimo: v('entregaMinimo'),
    taxaTipo: f.elements.taxaTipo.value, taxaFixa: v('taxaFixa'),
    retiradaAtiva: f.elements.retiradaAtiva.checked, retiradaTempo: v('retiradaTempo'), retiradaMinimo: v('retiradaMinimo'),
    bairros: [...f.querySelectorAll('.pn-bairro')].map((b) => ({
      nome: $('[data-bairro-nome]', b).value, taxa: $('[data-bairro-taxa]', b).value, ativo: $('[data-bairro-ativo]', b).checked,
    })),
  };
}

const campoTexto = (nome, rotulo, valor, { reais = false, max = 30, dica = '' } = {}) => `<div class="campo">
  <label for="pn-${nome}">${rotulo}</label>
  <input id="pn-${nome}" name="${nome}" type="text" value="${esc(valor)}" maxlength="${reais ? 10 : max}" autocomplete="off"${reais ? ' inputmode="decimal"' : ''}>
  ${dica ? `<p class="campo-dica">${dica}</p>` : ''}</div>`;

function mostrarEntrega(d = entregaDoBanco()) {
  const n = $('#pn-entrega');
  if (!n) return;
  const porBairro = d.taxaTipo === 'bairro';
  n.innerHTML = `<form class="pn-cartao pn-form" id="pn-form-entrega" novalidate>
    <h2>Entrega e retirada</h2>
    <fieldset class="pn-bloco"><legend>Entrega</legend>
      <label class="check"><input type="checkbox" name="entregaAtiva"${d.entregaAtiva ? ' checked' : ''}> Fazer entrega</label>
      <div class="linha-campos">
        ${campoTexto('entregaTempo', 'Tempo de entrega', d.entregaTempo, { dica: 'Aparece no site. Ex.: 40 a 60 min' })}
        ${campoTexto('entregaMinimo', 'Pedido mínimo (R$)', d.entregaMinimo, { reais: true, dica: '0 = sem mínimo' })}
      </div>
      <div class="pn-taxa-tipo" role="radiogroup" aria-label="Como cobrar a entrega">
        <label class="check"><input type="radio" name="taxaTipo" value="fixa"${porBairro ? '' : ' checked'}> Taxa única</label>
        <label class="check"><input type="radio" name="taxaTipo" value="bairro"${porBairro ? ' checked' : ''}> Taxa por bairro</label>
      </div>
      <div data-taxa-fixa${porBairro ? ' hidden' : ''}>${campoTexto('taxaFixa', 'Taxa de entrega (R$)', d.taxaFixa, { reais: true, dica: '0 = entrega grátis' })}</div>
      <div data-bairros${porBairro ? '' : ' hidden'}>
        <p class="pn-dica">O cliente escolhe o bairro numa lista. Desmarque "Ativo" para parar de entregar num bairro sem apagar.</p>
        <ul class="pn-bairros">${d.bairros.map((b, i) => `<li class="pn-bairro">
          <span class="pn-bairro-nome"><input type="text" data-bairro-nome value="${esc(b.nome)}" maxlength="60" placeholder="Nome do bairro" aria-label="Nome do bairro ${i + 1}"></span>
          <span class="pn-preco-campo"><span aria-hidden="true">R$</span><input type="text" data-bairro-taxa inputmode="decimal" value="${esc(b.taxa)}" maxlength="10" aria-label="Taxa do bairro ${i + 1}"></span>
          <label class="check"><input type="checkbox" data-bairro-ativo${b.ativo ? ' checked' : ''}> Ativo</label>
          <button type="button" class="link link--perigo" data-tirar-bairro="${i}" aria-label="Remover ${esc(b.nome || `bairro ${i + 1}`)}">Remover</button>
        </li>`).join('')}</ul>
        <button type="button" class="link" data-mais-bairro>+ Bairro</button>
      </div>
    </fieldset>
    <fieldset class="pn-bloco"><legend>Retirada no balcão</legend>
      <label class="check"><input type="checkbox" name="retiradaAtiva"${d.retiradaAtiva ? ' checked' : ''}> Aceitar retirada</label>
      <div class="linha-campos">
        ${campoTexto('retiradaTempo', 'Tempo para ficar pronto', d.retiradaTempo, { dica: 'Ex.: 25 min' })}
        ${campoTexto('retiradaMinimo', 'Pedido mínimo (R$)', d.retiradaMinimo, { reais: true, dica: '0 = sem mínimo' })}
      </div>
    </fieldset>
    <p class="aviso aviso--erro" data-erro role="alert" hidden></p>
    <button type="submit" class="btn btn-primario"><span class="btn-txt">Salvar entrega e retirada</span></button>
  </form>`;
}

function mexerBairro(botao) {
  const d = lerEntregaDaTela();
  if (botao.hasAttribute('data-mais-bairro')) d.bairros.push({ nome: '', taxa: d.bairros.at(-1)?.taxa || '0,00', ativo: true });
  else d.bairros.splice(Number(botao.dataset.tirarBairro), 1);
  mostrarEntrega(d);
  const ultimo = [...document.querySelectorAll('#pn-form-entrega [data-bairro-nome]')].at(-1);
  (botao.hasAttribute('data-mais-bairro') && ultimo ? ultimo : $('#pn-form-entrega [data-mais-bairro]'))?.focus();
}

async function salvarEntrega(form) {
  const erro = $('[data-erro]', form);
  const d = lerEntregaDaTela();
  const falhar = (m) => { erro.textContent = m; erro.hidden = false; };
  const dinheiro = { entregaMinimo: 'pedido mínimo da entrega', taxaFixa: 'taxa de entrega', retiradaMinimo: 'pedido mínimo da retirada' };
  const corpo = { ...d };
  for (const [k, nome] of Object.entries(dinheiro)) {
    corpo[k] = centavosDe(d[k]);
    if (corpo[k] === null) return falhar(`Confira o valor de ${nome} (ex.: 5,00).`);
  }
  corpo.entregaTempo = d.entregaTempo.trim();
  corpo.retiradaTempo = d.retiradaTempo.trim();
  corpo.bairros = [];
  for (const b of d.bairros) {
    const nome = b.nome.trim();
    if (!nome && !b.taxa.trim()) continue;   // linha deixada em branco
    const taxa = centavosDe(b.taxa);
    if (taxa === null) return falhar(`Confira a taxa de ${nome || 'um dos bairros'} (ex.: 7,00).`);
    corpo.bairros.push({ nome, taxa, ativo: b.ativo });
  }
  erro.hidden = true;
  const botao = $('button[type=submit]', form);
  botao.disabled = true;
  try {
    await cliente.rest('rpc/salvar_entrega', { method: 'POST', body: { dados: corpo } });
    await carregarLoja();
    mostrarEntrega();
    avisar('Entrega e retirada salvas. O site já usa os valores novos.');
  } catch (e) {
    botao.disabled = false;
    if (e.status === 401) return;
    falhar(e.message || 'Não deu para salvar.');
  }
}

// ---------- abas e filtros ----------
const ABAS = () => [...document.querySelectorAll('[data-aba]')].map((b) => b.dataset.aba);
function trocarAba(aba) {
  estado.aba = aba;
  document.querySelectorAll('[data-aba]').forEach((b) => {
    const sel = b.dataset.aba === aba;
    b.setAttribute('aria-selected', String(sel));
    b.tabIndex = sel ? 0 : -1;
  });
  for (const a of ABAS()) $(`#pn-aba-${a}`).hidden = a !== aba;
  if (aba === 'cardapio') carregarCardapio();
  if (aba === 'loja') {
    mostrarHorarios();
    mostrarEntrega();
    carregarLoja().then(() => {
      // releu do banco: redesenha só se ninguém começou a mexer ainda
      if (!$('#pn-aba-loja')?.contains(document.activeElement)) { mostrarHorarios(); mostrarEntrega(); }
    });
  }
}

// ---------- cliques (um ouvinte só para tudo) ----------
main.addEventListener('click', (ev) => {
  const alvo = ev.target.closest('button, a');
  if (!alvo) return;
  const cartao = alvo.closest('.pn-pedido');
  const id = cartao ? Number(cartao.dataset.id) : null;
  if (alvo.dataset.aba) trocarAba(alvo.dataset.aba);
  else if (alvo.dataset.filtro) {
    estado.filtro = alvo.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b === alvo)));
    mostrarPedidos();
  } else if (alvo.dataset.status && id) mudarPedido(id, { status: alvo.dataset.status });
  else if (alvo.dataset.pagamento && id) mudarPedido(id, { pagamento_status: alvo.dataset.pagamento });
  else if (alvo.dataset.loja) mudarLoja(alvo.dataset.loja === 'abrir');
  else if (alvo.hasAttribute('data-mais-faixa') || alvo.dataset.tirarFaixa) mexerFaixa(alvo);
  else if (alvo.hasAttribute('data-mais-bairro') || alvo.dataset.tirarBairro) mexerBairro(alvo);
  else if (alvo.dataset.produto) mudarProduto(alvo.dataset.produto);
  else if (alvo.hasAttribute('data-novo-produto') || alvo.hasAttribute('data-cancelar-produto')) {
    estado.criando = alvo.hasAttribute('data-novo-produto');
    mostrarCardapio();
    $(estado.criando ? '#pf-foto-novo' : '[data-novo-produto]')?.focus();
  }
  else if (alvo.hasAttribute('data-imprimir') && id) {
    const p = estado.pedidos.find((x) => x.id === id);
    if (!p) return;
    const area = $('#area-impressao');
    area.innerHTML = comandaHtml(paraComanda(p), { fuso: estado.loja?.fuso || CONFIG.horario.fuso, marca: nomeLoja });
    window.addEventListener('afterprint', () => { area.innerHTML = ''; }, { once: true });
    window.print();
  }
});

main.addEventListener('change', (ev) => {
  if (ev.target.matches('[data-preco]')) { salvarPreco(ev.target); return; }
  // prévia da foto escolhida (ainda não enviada)
  if (ev.target.name === 'foto' && ev.target.closest('[data-produto-form]')) {
    const img = $('[data-previa]', ev.target.form);
    const arq = ev.target.files?.[0];
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    if (arq) { img.src = URL.createObjectURL(arq); img.hidden = false; }
    return;
  }
  if (ev.target.name === 'taxaTipo') {
    const f = ev.target.form;
    $('[data-taxa-fixa]', f).hidden = ev.target.value === 'bairro';
    $('[data-bairros]', f).hidden = ev.target.value !== 'bairro';
    return;
  }
  const sel = ev.target.closest('[data-mudar]');
  if (!sel) return;
  const id = Number(sel.closest('.pn-pedido').dataset.id);
  const p = estado.pedidos.find((x) => x.id === id);
  if (!p || sel.value === p.status) return;
  if (sel.value === 'cancelado' && !confirm(`Cancelar o pedido ${p.codigo}? Avise o cliente pelo WhatsApp.`)) {
    sel.value = p.status;
    return;
  }
  mudarPedido(id, { status: sel.value });
});

main.addEventListener('submit', (ev) => {
  if (ev.target.matches('[data-produto-form]')) { ev.preventDefault(); salvarProduto(ev.target); return; }
  if (ev.target.id === 'pn-form-horarios') { ev.preventDefault(); salvarHorarios(ev.target); }
  if (ev.target.id === 'pn-form-entrega') { ev.preventDefault(); salvarEntrega(ev.target); }
});

// Enter no campo de preço salva (o "change" vem junto) sem enviar formulário nenhum
main.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches('[data-preco]')) { ev.preventDefault(); ev.target.blur(); }
});

// "Preços das opções" aberto continua aberto depois de redesenhar o cardápio
main.addEventListener('toggle', (ev) => {
  const id = ev.target.dataset?.opcoes || (ev.target.dataset?.editar && `e:${ev.target.dataset.editar}`);
  if (!id) return;
  if (ev.target.open) estado.abertos.add(id); else estado.abertos.delete(id);
}, true);

// setas do teclado nas abas (padrão de acessibilidade de tablist)
main.addEventListener('keydown', (ev) => {
  const tab = ev.target.closest('[role=tab]');
  if (!tab || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
  const abas = ABAS();
  const i = abas.indexOf(tab.dataset.aba);
  const outra = abas[(i + (ev.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length];
  trocarAba(outra);
  $(`[data-aba="${outra}"]`).focus();
});

$('#pn-sair').addEventListener('click', () => {
  motivoSaida = 'Você saiu do painel.';
  cliente.sair();
});

// voltou para a aba (tablet acordou): atualiza na hora
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cliente?.usuario() && !acoesTopo.hidden) {
    manterTelaAcesa();
    carregarPedidos();
    carregarLoja();
  }
});

// ============================================================
// INÍCIO
// ============================================================
if (!cliente) telaSemBanco();
else if (cliente.usuario()) iniciarPainel();
else telaLogin();
