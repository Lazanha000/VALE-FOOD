// Acompanhamento do pedido. Também mostra a confirmação logo
// depois de finalizar. Na demonstração, só encontra pedidos feitos
// neste navegador e confere o telefone usado no pedido.

import { etapasPara, consultarPedido, pedidosNesteAparelho, modoDemo, statusDemo, linkAcompanhamento } from '../services/api.js';
import { brl, esc, el, prefixoPedido } from '../utils.js';
import { whatsappAtivo, linkWhatsapp, cabeNoLink } from '../whatsapp.js';
import { CONFIG } from '../config.js';
import { textoPedidoQueCabe } from '../mensagem.js';
import { brCode, qrSvg, pixConfigurado } from '../pix.js';
import { avisar } from '../ui.js';
import { comandaHtml } from '../comanda.js';

// sem backend e fora da demonstração (ou pedido que foi só pelo WhatsApp porque o sistema
// estava fora do ar): o site não sabe o andamento; quem confirma é o restaurante
const semAcompanhamento = (p) => (modoDemo() && !CONFIG.modoDemonstracao) || Boolean(p?.semSistema);

// Com o banco ligado, a tela consulta o andamento sozinha a cada INTERVALO, só com a aba visível
// e enquanto o pedido não terminou (entregue/cancelado). Para ao sair da tela.
export const INTERVALO_ACOMPANHAR = 15000;
const terminou = (p) => p?.status === 'entregue' || p?.status === 'cancelado';

// horário de Brasília (CONFIG.horario.fuso), igual à mensagem do WhatsApp, não o do celular
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.horario.fuso });

const pixAtivo = (p) => p.pagamento?.forma === 'pix' && pixConfigurado(CONFIG.pix);
// sistema fora do ar: a loja é avisada de que o pedido não está no painel e os valores não foram conferidos
const AVISO_SEM_SISTEMA = 'ATENÇÃO: o sistema de pedidos estava fora do ar. Este pedido NÃO está no painel: confira itens e valores com o cliente.';
const textoWhatsapp = (p) => {
  const extra = p.semSistema ? { abertura: [AVISO_SEM_SISTEMA, CONFIG.whatsapp.pedido?.abertura].filter(Boolean).join(' ') } : {};
  return textoPedidoQueCabe(p, { fuso: CONFIG.horario.fuso, marca: CONFIG.marca.nome, pix: pixAtivo(p), ...CONFIG.whatsapp.pedido, ...extra }, cabeNoLink);
};

export const linkPedidoWhatsapp = (p) => linkWhatsapp(textoWhatsapp(p));

// QR + copia e cola do Pix com o valor do pedido
function blocoPix(p) {
  const codigo = brCode({ ...CONFIG.pix, centavos: p.totais.total, txid: p.codigo });
  return `<section class="pix" aria-labelledby="pix-h">
    <h2 id="pix-h" class="secao-titulo">Pague com Pix · ${brl(p.totais.total)}</h2>
    <div class="pix-qr">${qrSvg(codigo)}</div>
    <p class="campo-dica">Abra o app do seu banco, escolha Pix e leia o QR Code. Ou use o copia e cola:</p>
    <button type="button" class="btn btn-primario btn-largo" data-copiar-pix>Copiar código Pix</button>
    <textarea class="pix-codigo" id="pix-txt" readonly rows="3" aria-label="Pix copia e cola">${esc(codigo)}</textarea>
    <p class="campo-dica">Para: ${esc(CONFIG.pix.nome)} · valor ${brl(p.totais.total)}.</p>
    <p class="aviso pix-volte">${p.token
      ? '<strong>Depois de pagar, volte aqui.</strong> A loja confere o Pix e esta tela mostra “pagamento confirmado” e o andamento do pedido sozinha.'
      : '<strong>Depois de pagar, envie o pedido pelo WhatsApp</strong> (se ainda não enviou) para a loja conferir o Pix.'}</p>
  </section>`;
}

const PAGAMENTO_STATUS = {
  pendente: 'aguardando confirmação da loja',
  confirmado: 'confirmado pela loja',
  cancelado: 'cancelado',
};

function cartaoStatus(p) {
  const etapas = etapasPara(p.recebimento?.modo);
  const idx = etapas.findIndex((e) => e.id === p.status);
  const cancelado = p.status === 'cancelado';
  return `<article class="status" aria-labelledby="st-h">
    <header class="status-cab">
      <div><p class="olho">Pedido</p><h2 id="st-h" class="status-codigo">${esc(p.codigo)}</h2></div>
      <p class="status-hora">Feito às ${hora(p.criadoEm)}</p>
    </header>
    ${p.demonstracao ? '<p class="selo-demo">Status simulado para demonstração</p>' : ''}
    ${semAcompanhamento(p) ? '<p class="aviso">O restaurante confirma o pedido e o prazo pelo WhatsApp. Este site não acompanha o preparo.</p>'
      : cancelado ? '<p class="aviso aviso--erro"><strong>Pedido cancelado.</strong> Em caso de dúvida, fale com a loja pelo WhatsApp.</p>' : `<ol class="etapas">
      ${etapas.map((e, i) => `<li class="etapa ${i < idx ? 'is-feita' : i === idx ? 'is-atual' : ''}" ${i === idx ? 'aria-current="step"' : ''}>
        <span class="etapa-ponto" aria-hidden="true"></span><span class="etapa-nome">${esc(e.nome)}</span>
        ${i === idx ? '<span class="etapa-agora">agora</span>' : ''}
      </li>`).join('')}
    </ol>`}
    ${p.itens?.length ? `<details class="status-itens">
      <summary>${(() => { const n = p.itens.reduce((s, i) => s + i.qtd, 0); return `${n} ${n === 1 ? 'item' : 'itens'}`; })()} · ${brl(p.totais.total)}</summary>
      <ul class="cm-itens">${p.itens.map((i) => `<li><span class="cm-q">${i.qtd}×</span><span class="cm-n">${esc(i.nome)}${i.escolhas.length ? `<small>${esc(i.escolhas.join(' · '))}</small>` : ''}</span><span class="cm-v">${brl(i.precoUnitario * i.qtd)}</span></li>`).join('')}</ul>
      ${p.totais.desconto ? `<p class="status-pag">Desconto${p.cupom ? ` (cupom ${esc(p.cupom)})` : ''}: −${brl(p.totais.desconto)}</p>` : ''}
      <p class="status-pag">Pagamento${p.pagamento?.forma === 'pix' ? '' : p.recebimento?.modo === 'retirada' ? ' na retirada' : ' na entrega'}: ${esc(p.pagamento.nome)}${p.pagamento.trocoPara ? ` · troco para ${brl(p.pagamento.trocoPara)}` : ''}${PAGAMENTO_STATUS[p.pagamentoStatus] ? ` · ${PAGAMENTO_STATUS[p.pagamentoStatus]}` : ''}</p>
    </details>` : '<p class="campo-dica">Os itens deste pedido não ficaram guardados neste aparelho (a caixa “Lembrar meus dados” não foi marcada).</p>'}
    <div class="status-acoes">
      ${semAcompanhamento(p) ? '' : '<button type="button" class="btn btn-sec" data-atualizar>Atualizar status</button>'}
      ${semAcompanhamento(p) || terminou(p) ? '' : '<p class="campo-dica status-auto">Esta tela se atualiza sozinha enquanto estiver aberta.</p>'}
      ${p.itens?.length ? '<button type="button" class="btn btn-sec" data-imprimir>Imprimir comanda</button>' : ''}
    </div>
  </article>`;
}

export function paginaPedido(main, estado) {
  const sec = el('<section class="pagina pagina-pedido" aria-labelledby="pg-h"><div class="wrap wrap--estreito"></div></section>');
  main.append(sec);
  const wrap = sec.firstElementChild;
  const recem = estado?.recem || null;
  // link de acompanhamento: #pedido?c=CODIGO&t=TOKEN
  const doLink = estado?.params?.c && estado?.params?.t ? { codigo: estado.params.c, telefone: '', token: estado.params.t } : null;
  let consulta = recem ? { codigo: recem.codigo, telefone: recem.cliente.telefone, token: recem.token } : doLink;

  const confirmacao = recem ? `
    <div class="confirmacao">
      <p class="olho">${semAcompanhamento(recem) ? 'Quase lá' : 'Tudo certo'}</p>
      <h1 id="pg-h" tabindex="-1">${recem.demonstracao ? 'Pedido de demonstração registrado' : semAcompanhamento(recem) ? 'Falta só enviar pelo WhatsApp' : 'Pedido registrado na loja'}</h1>
      ${recem.semSistema ? '<p class="aviso aviso--alerta"><strong>O sistema da loja não respondeu.</strong> Envie o pedido pelo WhatsApp no botão abaixo: a loja confirma o pedido e o valor por lá.</p>' : ''}
      ${recem.demonstracao ? '<p class="aviso aviso--demo"><strong>Nenhum restaurante recebeu este pedido</strong> e nada foi cobrado. Para receber pedidos de verdade, o site precisa ser ligado a um sistema de pedidos.</p>' : ''}
      <div class="codigo-box">
        <p>Código do pedido</p>
        <strong class="codigo" id="codigo-txt">${esc(recem.codigo)}</strong>
        <button type="button" class="link" data-copiar>Copiar código</button>
      </div>
      ${recem.token
        ? `<p class="confirmacao-dica">Este aparelho já guardou o pedido. Para acompanhar de outro aparelho, guarde o link:</p>
           <button type="button" class="btn btn-sec" data-copiar-link>Copiar link de acompanhamento</button>`
        : `<p class="confirmacao-dica">Guarde o código. Para consultar, use o código e o telefone ${esc(recem.cliente.telefone)}.</p>`}
      ${pixAtivo(recem) ? blocoPix(recem) : ''}
      ${whatsappAtivo() && recem.token
        ? `<a class="btn btn-sec" href="${esc(linkWhatsapp(textoWhatsapp(recem)))}" target="_blank" rel="noopener" data-zap-opcional>Mandar o resumo no WhatsApp da loja</a>
           <p class="campo-dica">Opcional: o pedido já chegou na loja.</p>`
        : whatsappAtivo()
        ? `<a class="btn btn-zap" href="${esc(linkWhatsapp(textoWhatsapp(recem)))}" target="_blank" rel="noopener">Enviar pedido pelo WhatsApp</a>`
        : `<div class="zap-off"><button type="button" class="btn btn-zap" disabled>Enviar pedido pelo WhatsApp</button><p class="campo-dica">Disponível quando o número do restaurante for configurado.</p></div>`}
    </div>` : '';

  const recentes = pedidosNesteAparelho().slice(0, 4);
  wrap.innerHTML = `
    ${confirmacao}
    <div class="acompanhar">
      ${recem ? '<h2 class="secao-titulo">Acompanhar</h2>' : '<header class="pagina-cab"><p class="olho">Seu pedido</p><h1 id="pg-h" tabindex="-1">Acompanhar pedido</h1></header>'}
      <div class="status-host"></div>
      ${recem ? '<button type="button" class="link link--outro" data-outro>Consultar outro pedido</button>' : ''}
      <form class="form-consulta" novalidate ${recem ? 'hidden' : ''}>
        ${modoDemo() ? '<p class="campo-dica">Só é possível consultar pedidos feitos neste navegador.</p>' : ''}
        <div class="linha-campos">
          <div class="campo" data-campo="codigo">
            <label for="f-codigo">Código do pedido</label>
            <input id="f-codigo" name="codigo" autocomplete="off" autocapitalize="characters" placeholder="${prefixoPedido()}-XXXXX" aria-describedby="e-codigo">
            <p class="campo-erro" id="e-codigo"></p>
          </div>
          <div class="campo" data-campo="telefone">
            <label for="f-tel">Telefone usado no pedido</label>
            <input id="f-tel" name="telefone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 98765-4321" aria-describedby="e-telefone">
            <p class="campo-erro" id="e-telefone"></p>
          </div>
        </div>
        ${recentes.length ? `<p class="recentes">Pedidos deste aparelho: ${recentes.map((r) => `<button type="button" class="chip chip--peq" data-cod="${esc(r.codigo)}">${esc(r.codigo)}</button>`).join(' ')}</p>` : ''}
        <button type="submit" class="btn btn-primario">Consultar</button>
      </form>
    </div>`;

  let ultimo = null; // pedido mostrado agora, para a comanda
  const host = wrap.querySelector('.status-host');
  const form = wrap.querySelector('.form-consulta');
  let geracao = 0;   // consulta nova (outro pedido) ignora a resposta atrasada da anterior

  // desenha o cartão; ao redesenhar o mesmo pedido, mantém a lista de itens aberta/fechada
  function mostrar(p) {
    const aberto = ultimo?.codigo === p.codigo && host.querySelector('.status-itens')?.open;
    const antes = ultimo?.codigo === p.codigo ? ultimo : null;
    ultimo = p;
    host.innerHTML = cartaoStatus(p);
    if (aberto) host.querySelector('.status-itens')?.setAttribute('open', '');
    // aviso na tela (o #toast também é lido pelo leitor de tela): só quando o andamento ou o pagamento mudou
    if (antes && (antes.status !== p.status || antes.pagamentoStatus !== p.pagamentoStatus)) {
      const etapa = p.status === 'cancelado' ? 'Pedido cancelado' : etapasPara(p.recebimento?.modo).find((e) => e.id === p.status)?.nome;
      const pago = antes.pagamentoStatus !== p.pagamentoStatus && p.pagamentoStatus === 'confirmado' ? 'pagamento confirmado' : '';
      const texto = `${p.codigo}: ${[antes.status !== p.status ? etapa : '', pago].filter(Boolean).join(' · ') || 'atualizado'}`;
      avisar(texto);
    }
    agendar();
  }

  // devolve true se mostrou o pedido. silencioso = atualização (sem esqueleto, erro não apaga o cartão)
  async function buscar(cod, tel, { silencioso = false, token } = {}) {
    const minha = silencioso ? geracao : ++geracao;
    if (!silencioso) {
      ultimo = null;
      parar();
      host.innerHTML = '<div class="status status--carregando"><span class="esqueleto"></span><span class="esqueleto"></span><span class="esqueleto"></span></div>';
    }
    const falha = (html) => {
      if (minha !== geracao) return false;
      if (!silencioso || !ultimo) host.innerHTML = html;
      return false;
    };
    try {
      const r = await consultarPedido(cod, tel, { token });
      if (minha !== geracao) return false;
      if (r.erro === 'outro-aparelho') {
        return falha('<p class="aviso aviso--erro">Este pedido não foi feito neste aparelho. Abra o link de acompanhamento ou fale com a loja pelo WhatsApp.</p>');
      }
      if (r.erro === 'nao-encontrado') {
        return falha(`<p class="aviso aviso--erro">Não encontramos o pedido ${esc(cod.toUpperCase())}. ${modoDemo() ? 'Só aparecem pedidos feitos neste navegador.' : 'Confira o código.'}</p>`);
      }
      if (r.erro === 'sem-sistema') {
        return falha('<p class="aviso">Este pedido foi enviado só pelo WhatsApp (o sistema da loja estava fora do ar). O andamento é combinado com a loja por lá.</p>');
      }
      if (r.erro === 'telefone') {
        return falha('<p class="aviso aviso--erro">O telefone não confere com o usado neste pedido.</p>');
      }
      consulta = { codigo: cod, telefone: tel, token };
      mostrar(r.pedido);
      return true;
    } catch (err) {
      // atualização automática sem internet: mantém o último cartão e tenta de novo depois
      falha(`<p class="aviso aviso--erro">${esc(err.message)}</p>`);
      if (silencioso && minha === geracao) agendar();
      return false;
    }
  }

  // ---- atualização automática ----
  let timer = null;
  let ativo = true;
  function parar() {
    clearTimeout(timer);
    timer = null;
  }
  function agendar() {
    parar();
    if (!ativo || semAcompanhamento(ultimo) || !consulta || !ultimo || terminou(ultimo) || document.hidden) return;
    timer = setTimeout(() => {
      timer = null;
      if (consulta) buscar(consulta.codigo, consulta.telefone, { silencioso: true, token: consulta.token });
    }, INTERVALO_ACOMPANHAR);
  }
  // aba escondida: para; voltou: confere na hora e volta a contar
  function aoVisibilidade() {
    if (document.hidden) parar();
    else if (consulta && ultimo && !terminou(ultimo) && !semAcompanhamento(ultimo)) {
      parar();
      buscar(consulta.codigo, consulta.telefone, { silencioso: true, token: consulta.token });
    }
  }
  document.addEventListener('visibilitychange', aoVisibilidade);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cod = form.querySelector('#f-codigo').value.trim();
    const tel = form.querySelector('#f-tel').value.trim();
    const erros = {
      // aceita qualquer prefixo (o do banco pode ter sido trocado no painel)
      codigo: /^[A-Z]{1,4}-[A-Z0-9]{5}$/i.test(cod) ? '' : `O código tem o formato ${prefixoPedido()}-XXXXX.`,
      telefone: tel.replace(/\D/g, '').length >= 10 ? '' : 'Digite o telefone com DDD.',
    };
    for (const [k, msg] of Object.entries(erros)) {
      form.querySelector(`#e-${k}`).textContent = msg;
      form.querySelector(`[data-campo="${k}"]`).classList.toggle('tem-erro', Boolean(msg));
      form.querySelector(k === 'codigo' ? '#f-codigo' : '#f-tel').setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    if (erros.codigo || erros.telefone) {
      form.querySelector(erros.codigo ? '#f-codigo' : '#f-tel').focus();
      return;
    }
    buscar(cod, tel);
  });

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-outro]')) {
      form.hidden = false;
      e.target.closest('[data-outro]').remove();
      form.querySelector('#f-codigo').focus();
      return;
    }
    const chip = e.target.closest('[data-cod]');
    if (chip) {
      form.querySelector('#f-codigo').value = chip.dataset.cod;
      form.querySelector('#f-tel').focus();
      return;
    }
    if (e.target.closest('[data-atualizar]') && consulta) {
      const antes = ultimo;
      buscar(consulta.codigo, consulta.telefone, { silencioso: true, token: consulta.token }).then((ok) => {
        if (!ok) avisar('Não deu para atualizar agora. Confira a internet.', 'erro');
        else if (ultimo?.status === antes?.status && ultimo?.pagamentoStatus === antes?.pagamentoStatus) avisar('Status atualizado');
      });
      return;
    }
    if (e.target.closest('[data-imprimir]') && ultimo?.itens?.length) {
      // a comanda vai para #area-impressao; o CSS de impressão esconde o resto da página
      const area = document.getElementById('area-impressao');
      area.innerHTML = comandaHtml(ultimo, { fuso: CONFIG.horario.fuso, marca: CONFIG.marca.nome });
      window.addEventListener('afterprint', () => { area.innerHTML = ''; }, { once: true });
      window.print();
      return;
    }
    if (e.target.closest('[data-copiar-link]') && recem?.token) {
      const link = linkAcompanhamento(recem);
      const botao = e.target.closest('[data-copiar-link]');
      // sem acesso à área de transferência: mostra o link selecionado para copiar à mão
      const manual = () => {
        let campo = wrap.querySelector('#link-acomp');
        if (!campo) {
          campo = el(`<input id="link-acomp" class="pix-codigo" readonly aria-label="Link de acompanhamento" value="${esc(link)}">`);
          botao.after(campo);
        }
        campo.select();
        avisar('Link selecionado. Copie com Ctrl+C ou toque longo.');
      };
      try {
        navigator.clipboard.writeText(link).then(() => avisar('Link copiado'), manual);
      } catch {
        manual();
      }
      return;
    }
    if (e.target.closest('[data-copiar-pix]')) {
      const campo = wrap.querySelector('#pix-txt');
      const manual = () => { campo.select(); avisar('Código selecionado. Copie com Ctrl+C ou toque longo.'); };
      try {
        navigator.clipboard.writeText(campo.value).then(() => avisar('Código Pix copiado'), manual);
      } catch {
        manual();
      }
      return;
    }
    if (e.target.closest('[data-copiar]')) {
      const txt = recem.codigo;
      const ok = () => avisar('Código copiado');
      try {
        navigator.clipboard.writeText(txt).then(ok, () => selecionar());
      } catch {
        selecionar();
      }
    }
  });

  function selecionar() {
    const r = document.createRange();
    r.selectNodeContents(wrap.querySelector('#codigo-txt'));
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    avisar('Código selecionado. Copie com Ctrl+C ou toque longo.');
  }

  // logo após o pedido, sem backend: mostra o pedido que está na memória (o aparelho pode
  // ter guardado só o código e o telefone)
  if (recem && (modoDemo() || recem.semSistema)) {
    mostrar({ ...recem, status: statusDemo(recem) });
  } else if (recem) {
    // acabou de ser registrado no banco: já temos o pedido com os valores do servidor
    mostrar(recem);
  } else if (consulta) buscar(consulta.codigo, consulta.telefone, { token: consulta.token });
  return {
    destruir() {
      ativo = false;
      geracao++;
      parar();
      document.removeEventListener('visibilitychange', aoVisibilidade);
    },
  };
}

