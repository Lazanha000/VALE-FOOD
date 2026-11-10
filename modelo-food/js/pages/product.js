// Detalhes do produto (janela): opções, adicionais, retirar
// ingredientes, quantidade, observações e preço ao vivo.

import { buscarProduto } from '../products.js';
import { carrinho, normalizarItem, precoUnitario, AVISO_CHEIO } from '../store.js';
import { brl, esc, el } from '../utils.js';
import { imgProduto, avisar, atualizarContador } from '../ui.js';

let dlg;
let voltarFoco = null;

function garantirDialogo() {
  if (dlg) return dlg;
  dlg = el('<dialog class="dlg" id="dlg-produto" aria-labelledby="dlg-titulo"></dialog>');
  document.body.append(dlg);
  // clique fora do conteúdo fecha
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('trava-rolagem');
    voltarFoco?.focus?.({ preventScroll: true });
  });
  return dlg;
}

export function abrirProduto(id, { editar = null } = {}) {
  const prod = buscarProduto(id);
  if (!prod) return;
  garantirDialogo();
  voltarFoco = document.activeElement;

  // estado inicial: item em edição ou escolhas padrão
  const base = normalizarItem(editar || { produtoId: id, qtd: 1 });
  const st = {
    escolhas: Object.fromEntries(Object.entries(base.escolhas).map(([k, v]) => [k, [...v]])),
    remover: [...base.remover],
    obs: base.obs,
    qtd: base.qtd,
  };

  const grupos = prod.opcoes.map((g) => {
    const tipo = g.tipo === 'unica' ? 'radio' : 'checkbox';
    const dica = g.tipo === 'unica'
      ? (g.obrigatorio ? '<span class="op-tag">Obrigatório</span>' : '<span class="op-dica">Escolha 1</span>')
      : `<span class="op-dica">Até ${g.max || g.escolhas.length}</span>`;
    const itens = g.escolhas.map((e) => `
      <label class="op-item">
        <input type="${tipo}" name="g-${esc(g.id)}" value="${esc(e.id)}" ${st.escolhas[g.id]?.includes(e.id) ? 'checked' : ''}>
        <span class="op-nome">${esc(e.nome)}</span>
        <span class="op-preco">${e.preco ? `+ ${brl(e.preco)}` : ''}</span>
      </label>`).join('');
    return `<fieldset class="op" data-grupo="${esc(g.id)}" data-tipo="${g.tipo}" data-max="${g.max || 0}"><legend>${esc(g.nome)} ${dica}</legend>${itens}</fieldset>`;
  }).join('');

  const retirar = prod.removiveis.length
    ? `<fieldset class="op" data-retirar><legend>Retirar ingredientes <span class="op-dica">Opcional</span></legend>
        ${prod.removiveis.map((r) => `<label class="op-item"><input type="checkbox" name="retirar" value="${esc(r)}" ${st.remover.includes(r) ? 'checked' : ''}><span class="op-nome">Sem ${esc(r.toLowerCase())}</span><span class="op-preco"></span></label>`).join('')}
      </fieldset>`
    : '';

  dlg.innerHTML = `
    <form class="dlg-form" novalidate>
      <button type="button" class="dlg-fechar" aria-label="Fechar">✕</button>
      <div class="dlg-foto">${imgProduto(prod, 'dlg-img', 'grande')}</div>
      <div class="dlg-lado">
        <div class="dlg-corpo">
          <p class="olho">${esc(prod.categoria === 'combos' ? 'Combo' : 'Detalhes')}</p>
          <h2 id="dlg-titulo" class="dlg-titulo">${esc(prod.nome)}</h2>
          <p class="dlg-desc">${esc(prod.descricao)}</p>
          <p class="dlg-base">${brl(prod.preco)}</p>
          ${grupos}
          ${retirar}
          <div class="op op-obs">
            <label for="dlg-obs" class="op-legenda">Observações <span class="op-dica">Opcional</span></label>
            <textarea id="dlg-obs" maxlength="140" rows="2" placeholder="Ex.: cortar ao meio, molho à parte">${esc(st.obs)}</textarea>
            <span class="op-contador" aria-live="polite"><span>${st.obs.length}</span>/140</span>
          </div>
        </div>
        <div class="dlg-rodape">
          <div class="qtd" role="group" aria-label="Quantidade">
            <button type="button" data-q="-1" aria-label="Diminuir quantidade">−</button>
            <output aria-live="polite">${st.qtd}</output>
            <button type="button" data-q="1" aria-label="Aumentar quantidade">+</button>
          </div>
          ${prod.esgotado
    ? '<button type="button" class="btn btn-primario dlg-add" disabled>Esgotado no momento</button>'
    : `<button type="submit" class="btn btn-primario dlg-add">${editar ? 'Salvar alterações' : 'Adicionar'} <span class="dlg-total"></span></button>`}
        </div>
      </div>
    </form>`;

  const form = dlg.querySelector('form');
  const total = dlg.querySelector('.dlg-total');
  const out = dlg.querySelector('output');

  function lerForm() {
    for (const fs of form.querySelectorAll('fieldset[data-grupo]')) {
      st.escolhas[fs.dataset.grupo] = [...fs.querySelectorAll('input:checked')].map((i) => i.value);
    }
    st.remover = [...form.querySelectorAll('input[name="retirar"]:checked')].map((i) => i.value);
    st.obs = form.querySelector('#dlg-obs').value;
  }

  function atualizar() {
    // limite de adicionais: desativa o resto quando atinge o máximo
    for (const fs of form.querySelectorAll('fieldset[data-tipo="multipla"]')) {
      const max = +fs.dataset.max;
      const marcados = fs.querySelectorAll('input:checked').length;
      fs.querySelectorAll('input').forEach((i) => {
        i.disabled = max > 0 && !i.checked && marcados >= max;
      });
    }
    const unit = precoUnitario({ produtoId: id, escolhas: st.escolhas });
    if (total) total.textContent = `· ${brl(unit * st.qtd)}`;
    out.textContent = st.qtd;
    dlg.querySelector('[data-q="-1"]').disabled = st.qtd <= 1;
    dlg.querySelector('[data-q="1"]').disabled = st.qtd >= carrinho.MAX_QTD;
    dlg.querySelector('.op-contador span').textContent = st.obs.length;
  }

  form.addEventListener('change', () => { lerForm(); atualizar(); });
  form.addEventListener('input', (e) => { if (e.target.id === 'dlg-obs') { lerForm(); atualizar(); } });
  dlg.querySelector('.dlg-fechar').addEventListener('click', () => dlg.close());
  dlg.querySelectorAll('[data-q]').forEach((b) =>
    b.addEventListener('click', () => {
      st.qtd = Math.min(carrinho.MAX_QTD, Math.max(1, st.qtd + +b.dataset.q));
      atualizar();
    })
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (prod.esgotado) return;
    lerForm();
    const item = { produtoId: id, ...st };
    if (!editar && !carrinho.cabe(item)) return avisar(AVISO_CHEIO, 'erro');
    const ok = editar ? carrinho.substituir(editar.chave, item) : carrinho.adicionar(item);
    if (!ok) {
      avisar('Este produto não está mais disponível.', 'erro');
      return;
    }
    dlg.close();
    atualizarContador(carrinho.quantidade(), true);
    avisar(editar ? 'Item atualizado' : `${prod.nome} no carrinho`);
  });

  atualizar();
  document.documentElement.classList.add('trava-rolagem');
  dlg.showModal();
  dlg.querySelector('.dlg-corpo').scrollTop = 0;
  dlg.querySelector('.dlg-fechar').focus({ preventScroll: true });
}
