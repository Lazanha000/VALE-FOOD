// Comanda para imprimir (papel A4 ou bobina). Função pura: devolve HTML, testável em Node.

import { brl, esc, taxaTxt } from './utils.js';

const quando = (iso, fuso) => new Date(iso).toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' });

export function comandaHtml(p, { fuso = 'America/Sao_Paulo', marca = '' } = {}) {
  const retirada = p.recebimento?.modo === 'retirada';
  const e = p.entrega;
  const destino = retirada
    ? `<p><b>RETIRADA NO LOCAL</b>${p.recebimento.local ? `<br>${esc(p.recebimento.local)}` : ''}</p>`
    : `<p><b>ENTREGA</b><br>${esc(e.endereco)}, ${esc(e.numero)}${e.complemento ? ` - ${esc(e.complemento)}` : ''}<br>${esc(e.bairro)}, ${esc(e.cidade)}<br>CEP ${esc(e.cep)}</p>`;
  return `<article class="cmd">
    <h1>${esc(marca)}</h1>
    <p class="cmd-cod">${esc(p.codigo)}</p>
    <p class="cmd-peq">${esc(quando(p.criadoEm, fuso))} (Brasília)</p>
    <hr>
    ${destino}
    <p>${esc(p.cliente.nome)}<br>${esc(p.cliente.telefone)}</p>
    <hr>
    <ul>${p.itens.map((i) => `<li><span>${i.qtd}x ${esc(i.nome)}${i.escolhas.length ? `<small>${esc(i.escolhas.join(', '))}</small>` : ''}${i.obs ? `<small>Obs.: ${esc(i.obs)}</small>` : ''}</span><span>${brl(i.precoUnitario * i.qtd)}</span></li>`).join('')}</ul>
    <hr>
    <p class="cmd-linha"><span>Subtotal</span><span>${brl(p.totais.subtotal)}</span></p>
    <p class="cmd-linha"><span>${retirada ? 'Retirada' : 'Entrega'}</span><span>${retirada ? 'grátis' : taxaTxt(p.totais.taxa)}</span></p>
    <p class="cmd-linha cmd-total"><span>TOTAL</span><span>${brl(p.totais.total)}</span></p>
    <p>Pagamento: ${esc(p.pagamento.nome)}${p.pagamento.trocoPara ? ` · troco para ${brl(p.pagamento.trocoPara)}` : ''}</p>
    ${p.obs ? `<p>Obs. do pedido: ${esc(p.obs)}</p>` : ''}
    <hr>
    <p class="cmd-peq">Entregador: confira este código com o cliente.</p>
  </article>`;
}
