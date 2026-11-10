// ============================================================
// PÁGINAS DA PLATAFORMA
// Início com categorias e ranking, lista por categoria, suporte, avaliação e termos.
// Cardápio, carrinho, checkout, Pix e acompanhamento continuam sendo os do site antigo.
// Cadastro de estabelecimento, painel da loja e administração ficam em admin.html (login).
// ============================================================

import { CONFIG } from '../config.js';
import { brl, esc, norm, salvo, digitos, CHAVES } from '../utils.js';
import { avisar } from '../ui.js';
import { rpc, modoDemo } from '../services/api.js';
import { CATEGORIAS_MKT, CIDADES, MIN_AVALIACOES } from './dados.js';
import { entrarNaLoja, situacaoDe, lojaAtual, carregarVitrine, vitrineAtual, usarBanco } from './loja.js';

const estado = { cat: 'lanchonetes', cidade: '', busca: '' };
const secao = (html) => `<section class="mk"><div class="wrap">${html}</div></section>`;
const cab = (olho, titulo) => `<header><p class="olho">${esc(olho)}</p><h1 id="pg-h" tabindex="-1">${esc(titulo)}</h1></header>`;
const demo = () => !usarBanco();
const avisoDemo = () => (demo() ? '<div class="mk-dev">Demonstração: estabelecimentos e avaliações fictícios. Nenhum pedido é enviado.</div>' : '');

// ---------- modal simples ----------
export function modal(html, aoFechar) {
  fecharModal();
  const m = document.createElement('div');
  m.className = 'mk-modal';
  m.id = 'mk-modal';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.innerHTML = `<div class="caixa">${html}</div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (ev) => { if (ev.target === m) { fecharModal(); aoFechar?.(); } });
  m.querySelector('button, textarea, input, a')?.focus();
  return m;
}
export const fecharModal = () => document.getElementById('mk-modal')?.remove();
const aviso = (t) => modal(`<p>${esc(t)}</p><div class="mk-acoes"><button class="btn btn-primario" data-fechar type="button">OK</button></div>`)
  .querySelector('[data-fechar]').addEventListener('click', fecharModal);

// ---------- início: categorias, busca, ranking ----------
function ranking(lista, cat, cidade, busca) {
  const q = norm(busca);
  const achados = lista.filter((e) => (!cat || e.cat === cat) && (!cidade || e.cidade === cidade) && (!q || norm(e.nome).includes(q)));
  const ok = achados.filter((e) => e.avaliacoes >= MIN_AVALIACOES).sort((a, b) => b.nota - a.nota);
  const novos = achados.filter((e) => e.avaliacoes < MIN_AVALIACOES).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return [...ok, ...novos];
}

function cartaoEstab(e) {
  const s = situacaoDe(e);
  const taxa = e.entrega?.taxa?.tipo === 'bairro' ? 'taxa por bairro' : `entrega ${brl(e.entrega?.taxa?.valor || 0)}`;
  const nota = e.avaliacoes >= MIN_AVALIACOES ? `⭐ ${e.nota.toFixed(1)} (${e.avaliacoes})` : 'Novo na plataforma';
  return `<article class="mk-card"><div class="mk-linha"><div>
    <p class="mk-est-nome">${esc(e.nome)}</p>
    <p class="mk-est-meta">${esc(e.cidade)} · ${nota}${e.entrega?.ativo !== false ? ` · ${taxa} · ${esc(e.entrega?.tempo || '')}` : ' · só retirada'}</p>
    ${e.descricao ? `<p class="mk-est-meta">${esc(e.descricao)}</p>` : ''}
    </div><div><span class="mk-tag ${s.aberto ? '' : 'x'}">${s.aberto ? 'Aberto' : 'Fechado'}</span>
    <button class="btn btn-primario" type="button" data-loja="${esc(e.id)}">Ver cardápio</button></div></div>
  </article>`;
}

// lê a vitrine (banco ou exemplos) e chama desenhar; sem internet mostra aviso com "tentar de novo"
async function comVitrine(main, desenhar) {
  if (usarBanco() && !vitrineAtual().length) main.innerHTML = secao('<p class="mk-muted" role="status">Carregando estabelecimentos…</p>');
  try {
    await carregarVitrine();
  } catch {
    main.innerHTML = secao(`<div class="mk-card"><p>Não deu para carregar os estabelecimentos. Confira a internet.</p>
      <button class="btn btn-primario" type="button" data-tentar>Tentar de novo</button></div>`);
    main.querySelector('[data-tentar]').addEventListener('click', () => { carregarVitrine({ forcar: true }).then(() => desenhar(), () => {}); });
    return;
  }
  desenhar();
}

export function paginaInicio(main) {
  comVitrine(main, () => {
    const lista = vitrineAtual();
    const destaque = ranking(lista, '', estado.cidade, '').slice(0, 4);
    main.innerHTML = secao(`${cab('Araçuaí, Coronel Murta, Virgem da Lapa e Itaobim', 'O que você quer pedir hoje?')}
      ${avisoDemo()}
      <div class="mk-lojabar"><label class="mk-l" for="mk-busca" style="margin:0">Buscar</label>
        <input type="text" id="mk-busca" placeholder="Nome do estabelecimento" style="max-width:280px" value="${esc(estado.busca)}">
        <select id="mk-cidade" aria-label="Cidade" style="max-width:200px"><option value="">Todas as cidades</option>${CIDADES.map((c) => `<option ${c === estado.cidade ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="mk-grade" id="mk-cats">${CATEGORIAS_MKT.map((c) => c.embreve
      ? `<div class="mk-cat soon" aria-disabled="true"><span class="ic">${c.icone}</span><b>${esc(c.nome)}</b><div><span class="mk-tag w">Em breve</span></div></div>`
      : `<button class="mk-cat" type="button" data-cat="${c.id}"><span class="ic">${c.icone}</span><b>${esc(c.nome)}</b></button>`).join('')}</div>
      <h2>${destaque.length ? 'Estabelecimentos' : 'Em breve'}</h2>
      <div id="mk-dest">${destaque.length ? destaque.map(cartaoEstab).join('') : '<div class="mk-card">Os primeiros estabelecimentos estão entrando na plataforma. Volte em breve!</div>'}</div>
      <div class="mk-acoes"><a class="btn btn-sec" href="admin.html#cadastro">Cadastrar meu estabelecimento</a></div>`);
    const ir = () => { location.hash = '#lista'; };
    main.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { estado.cat = b.dataset.cat; ir(); }));
    main.querySelector('#mk-busca').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { estado.busca = ev.target.value; estado.cat = ''; ir(); } });
    main.querySelector('#mk-cidade').addEventListener('change', (ev) => { estado.cidade = ev.target.value; paginaInicio(main); });
    ligarLojas(main);
  });
}

export function paginaLista(main) {
  comVitrine(main, () => {
    const cat = CATEGORIAS_MKT.find((c) => c.id === estado.cat);
    const l = ranking(vitrineAtual(), cat?.id || '', estado.cidade, estado.busca);
    main.innerHTML = secao(`${cab('Estabelecimentos', cat ? cat.nome : `Busca: ${estado.busca}`)}
      <p class="mk-muted">Ordenados pela nota média. Quem tem menos de ${MIN_AVALIACOES} avaliações aparece depois, em ordem alfabética.${estado.cidade ? ` Cidade: ${esc(estado.cidade)}.` : ''}</p>
      ${l.length ? l.map(cartaoEstab).join('') : '<div class="mk-card">Nenhum estabelecimento encontrado.</div>'}
      ${avisoDemo()}
      <div class="mk-acoes"><a class="btn btn-sec" href="#inicio">Voltar ao início</a></div>`);
    estado.busca = '';
    ligarLojas(main);
  });
}

function ligarLojas(main) {
  main.querySelectorAll('[data-loja]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      if (await entrarNaLoja(b.dataset.loja)) location.hash = '#loja';
      else aviso('Este estabelecimento não está disponível agora.');
    } catch {
      aviso('Não deu para abrir o cardápio. Confira a internet e tente de novo.');
    } finally {
      b.disabled = false;
    }
  }));
}

// pedidos feitos neste aparelho que o banco conhece (código + token)
const pedidosComLink = () => salvo.ler(CHAVES.pedidos, []).filter((p) => p?.codigo && /^[A-Za-z0-9]{32}$/.test(p.token || ''));

// ---------- suporte ----------
const MOTIVOS = [['nao_entregue', 'Meu pedido não foi entregue'], ['errado', 'Veio errado ou faltando'], ['demorando', 'O pedido está demorando'], ['outro', 'Outro problema']];
export function paginaSuporte(main) {
  const pedidos = pedidosComLink();
  main.innerHTML = secao(`${cab('Ajuda', 'Suporte')}
    ${avisoDemo()}
    <p class="mk-muted">Conte o que aconteceu. Nossa equipe fala com você e com o estabelecimento.</p>
    <form class="mk-card" id="mk-sup" novalidate>
      <fieldset style="border:0;padding:0;margin:0"><legend class="mk-l">O que aconteceu? *</legend>
        ${MOTIVOS.map(([id, t], i) => `<label class="mk-chk"><input type="radio" name="motivo" value="${id}" ${i ? '' : 'checked'}> <span>${esc(t)}</span></label>`).join('')}</fieldset>
      ${pedidos.length ? `<label class="mk-l" for="mk-ped">Pedido</label><select id="mk-ped">${pedidos.map((p) => `<option value="${esc(p.codigo)}">${esc(p.codigo)}</option>`).join('')}<option value="">Não é sobre um pedido</option></select>` : ''}
      <label class="mk-l" for="mk-tel">Seu telefone com DDD *</label><input type="tel" id="mk-tel" inputmode="tel" autocomplete="tel-national" placeholder="(33) 98765-4321">
      <label class="mk-l" for="mk-txt">Detalhes</label><textarea id="mk-txt" rows="3" maxlength="1000" style="width:100%"></textarea>
      <p class="aviso aviso--erro" id="mk-sup-erro" role="alert" hidden></p>
      <button class="btn btn-primario" type="submit">Enviar</button>
    </form>`);
  const f = main.querySelector('#mk-sup');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = f.querySelector('#mk-sup-erro');
    const motivo = f.querySelector('input[name=motivo]:checked')?.value;
    const tel = digitos(f.querySelector('#mk-tel').value);
    const descricao = f.querySelector('#mk-txt').value.trim();
    const codigo = f.querySelector('#mk-ped')?.value || '';
    const ped = pedidos.find((p) => p.codigo === codigo);
    const falhar = (m) => { erro.textContent = m; erro.hidden = false; };
    if (tel.length < 10 && !ped) return falhar('Digite seu telefone com DDD.');
    if (motivo === 'outro' && descricao.length < 5) return falhar('Conte em poucas palavras o que aconteceu.');
    erro.hidden = true;
    if (modoDemo()) return aviso('Demonstração: o chamado não foi enviado.');
    const botao = f.querySelector('button[type=submit]');
    botao.disabled = true;
    try {
      const r = await rpc('abrir_chamado', { motivo, descricao, telefone: tel || null, codigo: ped?.codigo || null, token: ped?.token || null });
      aviso(`Recebemos seu pedido de ajuda (protocolo ${r?.protocolo ?? '—'}). Nossa equipe vai falar com você pelo telefone informado.`);
      f.reset();
    } catch (e) {
      falhar(e.message);
    } finally {
      botao.disabled = false;
    }
  });
}

// ---------- termos ----------
export function paginaTermos(main) {
  const docs = ['Termos de uso', 'Política de privacidade (LGPD)', 'Política de cookies', 'Política de cancelamento e reembolso', 'Termo de adesão do estabelecimento'];
  main.innerHTML = secao(`${cab('Documentos', 'Termos e políticas')}
    ${docs.map((d) => `<div class="mk-card"><strong>${d}</strong><p class="mk-muted">Texto em revisão jurídica. Será publicado aqui antes do lançamento.</p></div>`).join('')}
    <p class="mk-muted">Enquanto isso, veja como tratamos seus dados em <a href="#privacidade">Privacidade</a>.</p>`);
}

// ---------- avaliação (quadro depois da entrega) ----------
const JA_PERGUNTOU = 'modelo:avaliacao:v1';
export function abrirAvaliacao(pedido) {
  const token = pedido?.token || pedidosComLink().find((p) => p.codigo === pedido?.codigo)?.token;
  let n = 0;
  const m = modal(`<h3>Como foi o seu pedido?</h3><p class="mk-muted">${esc(pedido?.codigo ? `Pedido ${pedido.codigo}` : 'Pedido')} · ${esc(pedido?.estabelecimento?.nome || lojaAtual()?.nome || CONFIG.marca.nome)}</p>
    <div class="mk-estrelas" id="mk-st" role="group" aria-label="Nota de 0 a 5"></div><p class="mk-muted" id="mk-n">0 de 5</p>
    <label class="mk-l" for="mk-com" style="display:block;font-weight:600;font-size:13px">Comentário (opcional)</label>
    <textarea id="mk-com" rows="3" style="width:100%" maxlength="500"></textarea>
    <p class="aviso aviso--erro" id="mk-av-erro" role="alert" hidden></p>
    <div class="mk-acoes"><button class="btn btn-sec" type="button" data-x>Agora não</button><button class="btn btn-primario" type="button" data-ok>Enviar avaliação</button></div>`);
  const pintar = () => {
    m.querySelector('#mk-st').innerHTML = [1, 2, 3, 4, 5].map((i) => `<button type="button" class="${i <= n ? 'on' : ''}" data-n="${i}" aria-label="${i} estrela${i > 1 ? 's' : ''}" aria-pressed="${i <= n}">★</button>`).join('');
    m.querySelector('#mk-n').textContent = `${n} de 5`;
    m.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { n = Number(b.dataset.n) === n ? 0 : Number(b.dataset.n); pintar(); }));
  };
  pintar();
  m.querySelector('[data-x]').addEventListener('click', fecharModal);
  m.querySelector('[data-ok]').addEventListener('click', async (ev) => {
    if (modoDemo() || !token) { fecharModal(); avisar('Obrigado por avaliar!'); return; }
    ev.target.disabled = true;
    try {
      await rpc('avaliar_pedido', { codigo: pedido.codigo, token, nota: n, comentario: m.querySelector('#mk-com').value.trim() });
      fecharModal();
      avisar('Obrigado por avaliar!');
    } catch (e) {
      const erro = m.querySelector('#mk-av-erro');
      erro.textContent = e.message;
      erro.hidden = false;
      ev.target.disabled = false;
    }
  });
}
// o acompanhamento do pedido avisa quando o status muda; ao ficar "entregue" a pergunta aparece uma vez
window.addEventListener('mkpedido', (ev) => {
  const p = ev.detail;
  if (!p || p.status !== 'entregue' || p.avaliado) return;
  const vistos = salvo.ler(JA_PERGUNTOU, []);
  if (vistos.includes(p.codigo)) return;
  salvo.gravar(JA_PERGUNTOU, [...vistos, p.codigo].slice(-30));
  setTimeout(() => abrirAvaliacao(p), 600);
});
document.addEventListener('click', (ev) => {
  const b = ev.target.closest?.('[data-avaliar]');
  if (b) abrirAvaliacao({ codigo: b.dataset.avaliar });
  // só na demonstração: pula direto para o pedido entregue, para ver o quadro de avaliação
  const s = ev.target.closest?.('[data-simular-entrega]');
  if (s) { fecharModal(); abrirAvaliacao({ codigo: s.dataset.simularEntrega }); }
});

// ---------- barra com o nome da loja (cardápio, carrinho, finalizar) ----------
export function barraDaLoja() {
  const e = lojaAtual();
  if (!e) return null;
  const d = document.createElement('div');
  d.className = 'wrap';
  d.innerHTML = `<div class="mk-lojabar" style="margin-top:calc(var(--topo-h) + 8px)"><span><strong>${esc(e.nome)}</strong> · ${esc(e.cidade)}</span><span class="mk-acoes" style="margin:0"><a class="btn btn-sec" href="#inicio">Trocar de estabelecimento</a></span></div>`;
  return d;
}
