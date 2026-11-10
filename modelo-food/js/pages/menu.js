// Cardápio: categorias, busca e cartões de produto.

import { resumoDelivery } from '../delivery.js';
import { situacaoLoja } from '../horario.js';
import { CATEGORIAS, PRODUTOS, buscarProduto } from '../products.js';
import { carrinho, AVISO_CHEIO } from '../store.js';
import { brl, esc, norm, el } from '../utils.js';
import { imgProduto, avisar, atualizarContador } from '../ui.js';
import { abrirProduto } from './product.js';

// produto precisa de uma escolha antes de ir ao carrinho?
const precisaEscolher = (p) => p.opcoes.some((g) => g.tipo === 'unica' && g.escolhas.length > 1);
const temAPartir = (p) => p.opcoes.some((g) => g.tipo === 'unica' && g.escolhas.some((e) => e.preco > 0));

function cartao(p, Hp = 'h4') {
  const fim = Boolean(p.esgotado);
  return `<article class="prod${fim ? ' is-esgotado' : ''}">
    <div class="prod-foto">${imgProduto(p, 'prod-img')}${fim ? '<span class="selo selo--esgotado">Esgotado</span>' : p.destaque ? '<span class="selo">Mais pedido</span>' : ''}</div>
    <div class="prod-info">
      <${Hp} class="prod-nome"><button type="button" class="prod-abrir" data-abrir="${esc(p.id)}">${esc(p.nome)}</button></${Hp}>
      <p class="prod-desc">${esc(p.descricao)}</p>
      <div class="prod-rodape">
        <p class="prod-preco">${temAPartir(p) ? '<small>a partir de</small> ' : ''}${brl(p.preco)}</p>
        ${fim
    ? `<button type="button" class="prod-add prod-add--esgotado" disabled aria-label="${esc(p.nome)} está esgotado"><span aria-hidden="true">Esgotado</span></button>`
    : `<button type="button" class="prod-add" data-add="${esc(p.id)}" aria-label="Adicionar ${esc(p.nome)}"><span aria-hidden="true">+</span></button>`}
      </div>
    </div>
  </article>`;
}

export function montarCardapio(host, { pagina = false } = {}) {
  const Hn = pagina ? 'h1' : 'h2';
  const Hc = pagina ? 'h2' : 'h3';
  const Hp = pagina ? 'h3' : 'h4';
  const sec = el(`<section class="cardapio ${pagina ? 'cardapio--pagina' : ''}" id="menu-inicio" aria-labelledby="cardapio-h">
    <div class="wrap">
      <div class="cardapio-cab">
        <div>
          <p class="olho">${pagina ? 'Peça para entrega' : 'Agora é com você'}</p>
          <${Hn} id="cardapio-h" class="cardapio-titulo" tabindex="-1">Cardápio</${Hn}>
          <p class="cardapio-info">${(() => {
            const loja = situacaoLoja();
            return `<span class="status-loja ${loja.aberto ? 'is-aberto' : 'is-fechado'}" data-status-loja>${esc(loja.texto)}</span>`;
          })()}${resumoDelivery().map((t) => `<span>${esc(t)}</span>`).join('')}</p>
        </div>
        <div class="busca">
          <label for="busca-campo" class="sr-only">Buscar no cardápio</label>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input id="busca-campo" type="search" placeholder="Buscar no cardápio" autocomplete="off" enterkeyhint="search">
        </div>
      </div>
    </div>
    <div class="categorias-faixa">
      <div class="wrap">
        <div class="categorias" role="group" aria-label="Filtrar por categoria">
          <button type="button" class="chip" data-cat="todos" aria-pressed="true">Todos</button>
          ${CATEGORIAS.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="false">${esc(c.nome)}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="wrap">
      <p class="sr-only" aria-live="polite" id="cardapio-status"></p>
      <div class="cardapio-lista"></div>
    </div>
  </section>`);
  host.append(sec);

  const lista = sec.querySelector('.cardapio-lista');
  const busca = sec.querySelector('#busca-campo');
  const status = sec.querySelector('#cardapio-status');
  let cat = 'todos';

  function desenhar() {
    const termo = norm(busca.value.trim());
    const filtra = (p) => (cat === 'todos' || p.categoria === cat) && (!termo || norm(`${p.nome} ${p.descricao}`).includes(termo));
    const achados = PRODUTOS.filter(filtra);
    lista.classList.remove('is-entrando');
    void lista.offsetWidth;
    lista.classList.add('is-entrando');
    if (!achados.length) {
      lista.innerHTML = `<div class="vazio vazio--busca"><p class="vazio-titulo">Nada encontrado para “${esc(busca.value.trim())}”.</p><p>Tente outro nome ou veja todas as categorias.</p><button type="button" class="btn btn-sec" data-limpar>Limpar busca</button></div>`;
      status.textContent = 'Nenhum produto encontrado.';
      return;
    }
    status.textContent = `${achados.length} ${achados.length === 1 ? 'produto' : 'produtos'}.`;
    const cats = CATEGORIAS.filter((c) => achados.some((p) => p.categoria === c.id));
    lista.innerHTML = cats.map((c) => {
      const ps = achados.filter((p) => p.categoria === c.id);
      return `<section class="cat" aria-labelledby="cat-${c.id}">
        <${Hc} class="cat-titulo" id="cat-${c.id}">${esc(c.nome)} <span>${ps.length}</span></${Hc}>
        <div class="grade">${ps.map((p) => cartao(p, Hp)).join('')}</div>
      </section>`;
    }).join('');
  }

  sec.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (chip) {
      cat = chip.dataset.cat;
      sec.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b === chip)));
      desenhar();
      const topo = sec.querySelector('.categorias-faixa').getBoundingClientRect().top;
      const hdr = document.getElementById('topo').offsetHeight;
      if (topo < hdr - 2) window.scrollTo({ top: window.scrollY + lista.getBoundingClientRect().top - hdr - 70 });
      return;
    }
    if (e.target.closest('[data-limpar]')) {
      busca.value = '';
      cat = 'todos';
      sec.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === 'todos')));
      desenhar();
      busca.focus();
      return;
    }
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) return abrirProduto(abrir.dataset.abrir);
    const add = e.target.closest('[data-add]');
    if (add) {
      const p = buscarProduto(add.dataset.add);
      if (p.esgotado) return avisar(`${p.nome} está esgotado`, 'erro');
      if (precisaEscolher(p)) return abrirProduto(p.id);
      if (!carrinho.adicionar({ produtoId: p.id, qtd: 1 })) return avisar(AVISO_CHEIO, 'erro');
      atualizarContador(carrinho.quantidade(), true);
      add.classList.remove('is-ok');
      void add.offsetWidth;
      add.classList.add('is-ok');
      avisar(`${p.nome} no carrinho`);
    }
  });
  let t;
  busca.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(desenhar, 120);
  });
  desenhar();
  return { secao: sec, destruir: () => clearTimeout(t) };
}
