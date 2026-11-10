// Texto do pedido que vai por WhatsApp ao vendedor. Função pura (testável em Node).

import { brl, taxaTxt } from './utils.js';

// link do Google Maps com o endereço (abre o app de mapas no celular do entregador)
export const linkMapa = (e) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${e.endereco}, ${e.numero}, ${e.bairro}, ${e.cidade}, Brasil`)}`;

// texto livre do cliente numa linha só: quebra de linha não imita outra linha da mensagem (ex.: um falso "Total")
const umaLinha = (s) => String(s || '').replace(/\s*[\r\n]+\s*/g, ' ').trim();

const hhmm = (iso, fuso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso });
const dia = (iso, fuso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: fuso });

// semObsItens / maxItens: usados por textoPedidoQueCabe para encurtar a mensagem
// titulo / abertura / fechamento: textos editáveis em CONFIG.whatsapp.pedido (ou em js/ajustes.js)
export function textoPedido(p, { fuso = 'America/Sao_Paulo', marca = '', pix = false, semObsItens = false, maxItens = Infinity, titulo = 'NOVO PEDIDO', abertura = '', fechamento = '' } = {}) {
  const retirada = p.recebimento?.modo === 'retirada';
  const itens = p.itens.slice(0, maxItens);
  const cortados = p.itens.length - itens.length;
  const faltou = [cortados ? `${cortados} ${cortados === 1 ? 'item' : 'itens'}` : '', semObsItens && p.itens.some((i) => i.obs) ? 'as observações dos itens' : ''].filter(Boolean);
  const e = p.entrega;
  const pg = p.pagamento;
  const linhas = [
    `*${umaLinha(titulo) || 'NOVO PEDIDO'}${marca ? ` · ${marca}` : ''}*`,
    abertura ? umaLinha(abertura) : null,
    `Código da venda: *${p.codigo}* (o entregador confere este código)`,
    `Feito em ${dia(p.criadoEm, fuso)} às ${hhmm(p.criadoEm, fuso)} (Brasília)`,
    '',
    '*Itens*',
    ...itens.map((i) => `${i.qtd}x ${i.nome}${i.escolhas.length ? ` (${i.escolhas.join(', ')})` : ''}${i.obs && !semObsItens ? ` - Obs.: ${umaLinha(i.obs)}` : ''} - ${brl(i.precoUnitario * i.qtd)}`),
    faltou.length ? `(resumido: ${faltou.join(' e ')} não couberam na mensagem; confira com o cliente)` : '',
    '',
    `Subtotal: ${brl(p.totais.subtotal)}`,
    retirada ? 'Retirada: grátis' : `Entrega: ${taxaTxt(p.totais.taxa)}`,
    `*Total: ${brl(p.totais.total)}*`,
    '',
    `*Pagamento:* ${pg.nome}${pg.forma === 'pix' ? (pix ? ' (Pix pelo QR do site, conferir no app do banco)' : ' (enviar a chave)') : ''}${pg.trocoPara ? ` - troco para ${brl(pg.trocoPara)}` : ''}`,
    '',
    `*Cliente:* ${p.cliente.nome} - ${p.cliente.telefone}${p.cliente.email ? ` - ${p.cliente.email}` : ''}`,
    retirada
      ? `*Retirada no local*${p.recebimento.local ? `: ${p.recebimento.local}` : ''}${p.recebimento.tempo ? ` (previsão ${p.recebimento.tempo})` : ''}`
      : `*Entrega${p.recebimento?.tempo ? ` (previsão ${p.recebimento.tempo})` : ''}:*\n${e.endereco}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ''}\n${e.bairro}, ${e.cidade} - CEP ${e.cep}\nMapa: ${linkMapa(e)}`,
    p.obs ? `Obs. do pedido: ${umaLinha(p.obs)}` : '',
    fechamento ? '' : null,
    fechamento ? umaLinha(fechamento) : '',
  ].filter((l) => l !== null);
  return linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

// Encurta até caber no link (cabe(texto) -> true/false): primeiro tira as observações dos
// itens, depois os últimos itens. Total, pagamento, cliente e endereço ficam sempre.
export function textoPedidoQueCabe(p, opcoes, cabe) {
  let t = textoPedido(p, opcoes);
  if (cabe(t)) return t;
  for (let n = p.itens.length; n >= 1; n--) {
    t = textoPedido(p, { ...opcoes, semObsItens: true, maxItens: n });
    if (cabe(t)) return t;
  }
  return t;
}
