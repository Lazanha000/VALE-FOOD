// Página do carrinho.

import { tempoResumo } from '../delivery.js';
import { situacaoLoja, bloqueiaFechado } from '../horario.js';
import { buscarProduto } from '../products.js';
import { carrinho, precoUnitario, resumoEscolhas } from '../store.js';
import { brl, esc, el, taxaTxt } from '../utils.js';
import { imgProduto, avisar, atualizarContador } from '../ui.js';
import { abrirProduto } from './product.js';

export function linhasComanda(itens) {
  return itens.map((it) => {
    const p = buscarProduto(it.produtoId);
    const extras = resumoEscolhas(it);
    return `<li>
      <span class="cm-q">${it.qtd}×</span>
      <span class="cm-n">${esc(p.nome)}${extras.length ? `<small>${esc(extras.join(' · '))}</small>` : ''}${it.obs ? `<small>Obs.: ${esc(it.obs)}</small>` : ''}</span>
      <span class="cm-v">${brl(precoUnitario(it) * it.qtd)}</span>
    </li>`;
  }).join('');
}

export function totaisComanda(t) {
  const entrega = t.modo === 'retirada'
    ? '<div><dt>Retirada</dt><dd>Grátis</dd></div>'
    : t.taxaPendente
      ? '<div><dt>Entrega</dt><dd class="cm-pend">a definir ao finalizar</dd></div>'
      : `<div><dt>Entrega</dt><dd>${taxaTxt(t.taxa)}</dd></div>`;
  return `<dl class="cm-totais">
    <div><dt>Subtotal</dt><dd>${brl(t.subtotal)}</dd></div>
    ${entrega}
    <div class="cm-total"><dt>${t.taxaPendente ? 'Total sem entrega' : 'Total'}</dt><dd>${brl(t.total)}</dd></div>
  </dl>`;
}

// O que impede de finalizar agora? Conferido de novo a cada clique,
// porque a loja pode abrir/fechar com a página aberta.
export function motivoBloqueio(est) {
  if (est.esgotados?.length) {
    const nomes = est.esgotados.map((i) => buscarProduto(i.produtoId).nome).join(', ');
    return { cod: 'esgotado', msg: `Item esgotado no carrinho: ${nomes}. Remova para continuar.` };
  }
  const loja = situacaoLoja();
  if (bloqueiaFechado() && !loja.aberto) return { cod: 'fechado', msg: `Estamos fechados no momento.${loja.texto.startsWith('Fechado · abre ') ? ' ' + loja.texto.replace(/^Fechado · abre /, 'Vamos abrir ') + '.' : ''}` };
  if (est.faltaMinimo) return { cod: 'minimo', msg: `O pedido mínimo é ${brl(est.minimo)}.` };
  return null;
}

// avisos da loja para carrinho e finalização (fechada, só aviso)
export function avisoLoja() {
  const loja = situacaoLoja();
  if (loja.aberto) return '';
  return `<p class="aviso aviso--alerta" data-aviso-loja>${bloqueiaFechado() ? 'Estamos fechados e não aceitamos pedidos agora.' : 'Estamos fechados no momento.'}${loja.texto.startsWith('Fechado · a') ? ' ' + loja.texto.replace(/^Fechado · a/, 'A') + '.' : ''}</p>`;
}

export function paginaCarrinho(main) {
  const sec = el('<section class="pagina pagina-carrinho" aria-labelledby="pg-h"><div class="wrap"></div></section>');
  main.append(sec);
  const wrap = sec.firstElementChild;

  function desenhar() {
    const est = carrinho.estado();
    document.body.classList.toggle('tem-barra', est.itens.length > 0);
    if (!est.itens.length) {
      wrap.innerHTML = `
        <header class="pagina-cab"><p class="olho">Seu pedido</p><h1 id="pg-h" tabindex="-1">Carrinho</h1></header>
        <div class="vazio">
          <p class="vazio-titulo">Seu carrinho está vazio.</p>
          <p>Escolha um hambúrguer no cardápio e ele aparece aqui.</p>
          <a class="btn btn-primario" href="#cardapio">Ver cardápio</a>
        </div>`;
      return;
    }
    const bloqueio = motivoBloqueio(est);
    const off = bloqueio ? ` is-off" data-motivo="${bloqueio.cod}` : '';
    wrap.innerHTML = `
      <header class="pagina-cab"><p class="olho">Seu pedido</p><h1 id="pg-h" tabindex="-1">Carrinho</h1>
        <p class="pagina-sub">${est.quantidade} ${est.quantidade === 1 ? 'item' : 'itens'} · ${esc(tempoResumo())}</p></header>
      <div class="carrinho-grade">
        <ul class="linhas">
          ${est.itens.map((it) => {
            const p = buscarProduto(it.produtoId);
            const extras = resumoEscolhas(it);
            const unit = precoUnitario(it);
            return `<li class="linha" data-chave="${esc(it.chave)}">
              <div class="linha-foto">${imgProduto(p, 'linha-img')}</div>
              <div class="linha-info">
                <h2 class="linha-nome">${esc(p.nome)}</h2>
                ${extras.length ? `<p class="linha-extras">${esc(extras.join(' · '))}</p>` : ''}
                ${it.obs ? `<p class="linha-obs">Obs.: ${esc(it.obs)}</p>` : ''}
                <p class="linha-unit">${brl(unit)} cada</p>
                <div class="linha-acoes">
                  ${p.opcoes.length || p.removiveis.length ? '<button type="button" class="link" data-editar>Editar</button>' : ''}
                  <button type="button" class="link link--perigo" data-remover>Remover</button>
                </div>
              </div>
              <div class="linha-lado">
                <div class="qtd qtd--peq" role="group" aria-label="Quantidade de ${esc(p.nome)}">
                  <button type="button" data-q="-1" aria-label="Diminuir">−</button>
                  <output>${it.qtd}</output>
                  <button type="button" data-q="1" aria-label="Aumentar" ${it.qtd >= carrinho.MAX_QTD ? 'disabled' : ''}>+</button>
                </div>
                <p class="linha-total">${brl(unit * it.qtd)}</p>
              </div>
            </li>`;
          }).join('')}
        </ul>
        <aside class="comanda" aria-label="Resumo do pedido">
          <p class="cm-cab"><span>Comanda</span><span>${new Date().toLocaleDateString('pt-BR')}</span></p>
          ${totaisComanda(est)}
          ${bloqueio ? `<p class="aviso aviso--alerta">${esc(bloqueio.cod === 'minimo' ? `Faltam ${brl(est.faltaMinimo)} para o pedido mínimo de ${brl(est.minimo)}.` : bloqueio.msg)}</p>` : avisoLoja()}
          <a class="btn btn-primario btn-largo${off}" href="#finalizar" ${bloqueio ? 'aria-disabled="true"' : ''}>Finalizar pedido</a>
          <a class="btn btn-sec btn-largo" href="#cardapio">Continuar comprando</a>
        </aside>
      </div>
      <div class="barra-fixa" aria-hidden="true">
        <div><small>Total</small><strong>${brl(est.total)}</strong></div>
        <a class="btn btn-primario${off}" href="#finalizar" tabindex="-1">Finalizar</a>
      </div>`;
  }

  sec.addEventListener('click', (e) => {
    const off = e.target.closest('.is-off');
    if (off) {
      e.preventDefault();
      const b = motivoBloqueio(carrinho.estado());
      if (b) avisar(b.msg, 'erro');
      else desenhar(); // o motivo já passou (ex.: a loja abriu): atualiza a tela
      return;
    }
    const linha = e.target.closest('.linha');
    if (!linha) return;
    const chave = linha.dataset.chave;
    const it = carrinho.itens().find((i) => i.chave === chave);
    if (!it) return;
    const q = e.target.closest('[data-q]');
    if (q) {
      const nova = it.qtd + +q.dataset.q;
      if (nova <= 0) return removerComDesfazer(it);
      carrinho.definirQtd(chave, nova);
      sec.querySelector(`[data-chave="${CSS.escape(chave)}"] [data-q="${q.dataset.q}"]`)?.focus();
      return;
    }
    if (e.target.closest('[data-remover]')) return removerComDesfazer(it);
    if (e.target.closest('[data-editar]')) abrirProduto(it.produtoId, { editar: it });
  });

  function removerComDesfazer(it) {
    carrinho.remover(it.chave);
    const p = buscarProduto(it.produtoId);
    avisar(`${p.nome} removido`, 'ok', { rotulo: 'Desfazer', fn: () => carrinho.adicionar(it) });
    sec.querySelector('h1')?.focus({ preventScroll: true });
  }

  const sair = carrinho.assinar((est) => {
    atualizarContador(est.quantidade);
    desenhar();
  });
  desenhar();
  return {
    destruir() {
      sair();
      document.body.classList.remove('tem-barra');
    },
  };
}

