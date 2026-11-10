// ============================================================
// PAINEL: telas da plataforma (usadas por painel/painel.js)
//   * criar conta (dono de estabelecimento)
//   * cadastrar o estabelecimento (fica "pendente" até a administração aprovar)
//   * administração: aprovar/recusar/suspender lojas, vendas, chamados e mensalidades
// O que cada pessoa pode fazer é decidido pelo banco (supabase/plataforma.sql), não por esta tela.
// ============================================================

import { brl, esc } from '../js/utils.js';
import { CIDADES } from '../js/marketplace/dados.js';
import { telefoneTxt } from './logica.js';

const $ = (s, raiz = document) => raiz.querySelector(s);

// link público do cardápio da loja (o dono divulga)
export const linkDaLoja = (id) => new URL(`./#loja?e=${encodeURIComponent(id)}`, location.href).href;

function erroDo(form) {
  const n = $('[data-erro]', form);
  return {
    mostrar(m) { n.textContent = m; n.hidden = false; n.scrollIntoView?.({ block: 'nearest' }); },
    limpar() { n.hidden = true; },
  };
}
function ocupar(form, sim) {
  const b = $('button[type=submit]', form);
  b.disabled = sim;
  b.classList.toggle('is-carregando', sim);
}

// ---------- criar conta ----------
export function telaCriarConta(main, { cliente, aoEntrar, aoVoltar }) {
  main.innerHTML = `<section class="pn-cartao pn-login">
    <h1>Criar conta</h1>
    <p class="pn-dica">Para cadastrar o seu estabelecimento. Depois de criar, você preenche os dados da loja e nossa equipe analisa.</p>
    <form id="pn-form-conta" novalidate>
      <div class="campo"><label for="pc-email">E-mail</label><input id="pc-email" type="email" autocomplete="username" maxlength="120" inputmode="email" required></div>
      <div class="campo"><label for="pc-senha">Senha</label><input id="pc-senha" type="password" autocomplete="new-password" maxlength="120" required>
        <p class="campo-dica">8 ou mais caracteres, com letras e números.</p></div>
      <div class="campo"><label for="pc-senha2">Repita a senha</label><input id="pc-senha2" type="password" autocomplete="new-password" maxlength="120" required></div>
      <p class="aviso aviso--erro" data-erro role="alert" hidden></p>
      <button class="btn btn-primario btn-largo" type="submit"><span class="btn-txt">Criar conta</span></button>
    </form>
    <p class="pn-dica"><button type="button" class="link" data-voltar>Já tenho conta: entrar</button></p>
  </section>`;
  $('[data-voltar]').addEventListener('click', () => aoVoltar());
  const form = $('#pn-form-conta');
  const erro = erroDo(form);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('#pc-email').value.trim();
    const senha = $('#pc-senha').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erro.mostrar('Digite um e-mail válido.');
    if (senha.length < 8 || !/[a-z]/i.test(senha) || !/\d/.test(senha)) return erro.mostrar('A senha precisa de 8 ou mais caracteres, com letras e números.');
    if (senha !== $('#pc-senha2').value) return erro.mostrar('As duas senhas não são iguais.');
    erro.limpar();
    ocupar(form, true);
    try {
      const r = await cliente.cadastrar(email, senha);
      if (r.entrou) { await aoEntrar(); return; }
      main.innerHTML = `<section class="pn-cartao pn-login"><h1>Confirme seu e-mail</h1>
        <p>Enviamos um link para <b>${esc(email)}</b>. Abra o e-mail, toque no link e depois entre aqui com a sua senha.</p>
        <p class="pn-dica">Não chegou? Veja a caixa de spam. O envio pode levar alguns minutos.</p>
        <button class="btn btn-primario btn-largo" type="button" data-entrar>Já confirmei: entrar</button></section>`;
      $('[data-entrar]').addEventListener('click', () => aoVoltar());
    } catch (e) {
      ocupar(form, false);
      erro.mostrar(e.message || 'Não deu para criar a conta agora.');
    }
  });
  $('#pc-email').focus();
}

// O link de confirmação do e-mail volta com #access_token=...: limpa o endereço e avisa
export function voltouDaConfirmacao() {
  if (!/access_token=|type=signup|error_description=/.test(location.hash)) return '';
  const erro = /error_description=([^&]+)/.exec(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  return erro ? 'O link de confirmação expirou ou já foi usado. Entre com sua senha ou crie a conta de novo.' : 'E-mail confirmado. Entre com a sua senha.';
}

// ---------- cadastro do estabelecimento ----------
const CATEGORIAS = [['lanchonetes', 'Lanchonetes e hamburguerias'], ['restaurantes', 'Restaurantes e pizzarias']];
const campo = (id, rotulo, { tipo = 'text', max = 80, dica = '', modo = '', auto = 'off', valor = '' } = {}) => `<div class="campo">
  <label for="pe-${id}">${rotulo}</label>
  <input id="pe-${id}" name="${id}" type="${tipo}" maxlength="${max}" autocomplete="${auto}"${modo ? ` inputmode="${modo}"` : ''} value="${esc(valor)}">
  ${dica ? `<p class="campo-dica">${dica}</p>` : ''}</div>`;

export function telaCadastroLoja(main, { cliente, aoTerminar }) {
  const email = cliente.usuario()?.email || '';
  main.innerHTML = `<form class="pn-cartao pn-form" id="pn-form-loja" novalidate>
    <h1>Cadastrar estabelecimento</h1>
    <p class="pn-dica">Preencha os dados abaixo. Nossa equipe confere e aprova; enquanto isso você já pode montar o cardápio.</p>
    <div class="aviso"><p><b>Trabalha numa loja que já está aqui?</b> Não preencha. Peça ao dono para pôr o e-mail <b>${esc(email)}</b> na equipe e depois toque em:</p>
      <button type="button" class="btn btn-sec" data-ja-incluido>Já fui incluído: abrir o painel</button></div>
    <fieldset class="pn-bloco"><legend>Estabelecimento</legend>
      ${campo('nome', 'Nome do estabelecimento', { max: 60 })}
      <div class="linha-campos">
        <div class="campo"><label for="pe-categoria">Categoria</label><select id="pe-categoria" name="categoria">
          ${CATEGORIAS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
        <div class="campo"><label for="pe-cidade">Cidade</label><select id="pe-cidade" name="cidade">
          ${CIDADES.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
      </div>
      ${campo('descricao', 'Descrição curta', { max: 160, dica: 'Ex.: Hambúrguer artesanal feito na hora.' })}
      <div class="linha-campos">
        ${campo('telefonePublico', 'Telefone do estabelecimento', { tipo: 'tel', max: 20, modo: 'tel', dica: 'Público: os clientes usam para falar com a loja.' })}
        ${campo('whatsapp', 'WhatsApp do estabelecimento', { tipo: 'tel', max: 20, modo: 'tel', dica: 'Opcional.' })}
      </div>
      ${campo('endereco', 'Endereço completo', { max: 200, auto: 'street-address' })}
    </fieldset>
    <fieldset class="pn-bloco"><legend>Responsável e documento</legend>
      <p class="pn-dica">🔒 Só a equipe da plataforma vê estes dados.</p>
      <div class="pn-taxa-tipo" role="radiogroup" aria-label="Tipo de documento">
        <label class="check"><input type="radio" name="documentoTipo" value="cnpj" checked> CNPJ</label>
        <label class="check"><input type="radio" name="documentoTipo" value="cpf"> CPF</label>
      </div>
      ${campo('documento', 'CNPJ ou CPF', { max: 20, modo: 'numeric' })}
      ${campo('razaoSocial', 'Razão social', { max: 120, dica: 'Opcional para quem usa CPF.' })}
      ${campo('responsavelNome', 'Nome do responsável', { max: 80, auto: 'name' })}
      <div class="linha-campos">
        ${campo('responsavelTelefone', 'Telefone do responsável', { tipo: 'tel', max: 20, modo: 'tel', auto: 'tel-national' })}
        ${campo('responsavelEmail', 'E-mail do responsável', { tipo: 'email', max: 100, modo: 'email', valor: email })}
      </div>
    </fieldset>
    <fieldset class="pn-bloco"><legend>Aceites</legend>
      <label class="check"><input type="checkbox" name="termos"> Li e aceito os <a class="link" href="./#termos" target="_blank" rel="noopener">Termos de uso</a></label>
      <label class="check"><input type="checkbox" name="privacidade"> Li e aceito a <a class="link" href="./#termos" target="_blank" rel="noopener">Política de privacidade</a></label>
      <label class="check"><input type="checkbox" name="adesao"> Li e aceito o <a class="link" href="./#termos" target="_blank" rel="noopener">Termo de adesão</a> (mensalidade e regras)</label>
    </fieldset>
    <p class="aviso aviso--erro" data-erro role="alert" hidden></p>
    <button type="submit" class="btn btn-primario btn-largo"><span class="btn-txt">Enviar para aprovação</span></button>
  </form>`;
  const form = $('#pn-form-loja');
  const erro = erroDo(form);
  $('[data-ja-incluido]', form).addEventListener('click', () => aoTerminar());
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (k) => form.elements[k].value.trim();
    const dados = {
      nome: v('nome'), categoria: v('categoria'), cidade: v('cidade'), descricao: v('descricao'),
      telefonePublico: v('telefonePublico'), whatsapp: v('whatsapp'), endereco: v('endereco'),
      documentoTipo: form.elements.documentoTipo.value, documento: v('documento'), razaoSocial: v('razaoSocial'),
      responsavelNome: v('responsavelNome'), responsavelTelefone: v('responsavelTelefone'), responsavelEmail: v('responsavelEmail'),
      aceites: { termos: form.elements.termos.checked, privacidade: form.elements.privacidade.checked, adesao: form.elements.adesao.checked },
    };
    if (dados.nome.length < 2) return erro.mostrar('Digite o nome do estabelecimento.');
    if (dados.endereco.length < 5) return erro.mostrar('Digite o endereço completo.');
    if (!Object.values(dados.aceites).every(Boolean)) return erro.mostrar('Para enviar, marque os três aceites.');
    erro.limpar();
    ocupar(form, true);
    try {
      await cliente.rest('rpc/cadastrar_estabelecimento', { method: 'POST', body: { dados } });
      await aoTerminar();
    } catch (e) {
      ocupar(form, false);
      if (e.status !== 401) erro.mostrar(e.message || 'Não deu para enviar agora.');
    }
  });
}

// ---------- administração ----------
const SITUACOES = { pendente: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', suspenso: 'Suspenso' };
const MOTIVOS = { nao_entregue: 'Não foi entregue', errado: 'Veio errado', demorando: 'Demorando', outro: 'Outro' };
const doc = (t, d) => (t === 'cnpj' && /^\d{14}$/.test(d) ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  : /^\d{11}$/.test(d || '') ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : esc(d || ''));
const inicioDoMes = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

export function montarAdmin(raiz, { cliente, avisar, aoAbrirLoja }) {
  const est = { lojas: [], chamados: [], mensal: [], vendas: { hoje: [], d7: [], d30: [] }, filtro: 'pendente' };

  async function carregar() {
    raiz.innerHTML = '<p class="pn-dica">Carregando…</p>';
    const agora = new Date();
    const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const ate = new Date(agora.getTime() + 60000).toISOString();
    const vendas = (de) => cliente.rest('rpc/resumo_vendas', { method: 'POST', body: { de: de.toISOString(), ate, estabelecimento: null } });
    try {
      const [lojas, chamados, mensal, hoje, d7, d30] = await Promise.all([
        cliente.rest('estabelecimentos?select=id,nome,cidade,categoria,situacao,telefone_publico,criado_em,'
          + 'estabelecimentos_privado(documento_tipo,documento,razao_social,responsavel_nome,responsavel_telefone,responsavel_email,endereco,situacao_motivo)&order=criado_em.desc'),
        cliente.rest('chamados?select=id,motivo,descricao,telefone,situacao,resposta,criado_em,pedidos(codigo),estabelecimentos(nome,telefone_publico)&order=criado_em.desc&limit=100'),
        cliente.rest(`mensalidades?select=*&competencia=eq.${inicioDoMes()}`),
        vendas(meiaNoite), vendas(new Date(agora - 7 * 86400000)), vendas(new Date(agora - 30 * 86400000)),
      ]);
      Object.assign(est, { lojas, chamados, mensal, vendas: { hoje, d7, d30 } });
    } catch (e) {
      if (e.status === 401) return;
      raiz.innerHTML = `<p class="aviso aviso--erro" role="alert">Não deu para carregar a administração: ${esc(e.message)}</p>
        <button type="button" class="btn btn-sec" data-adm-recarregar>Tentar de novo</button>`;
      return;
    }
    desenhar();
  }

  const soma = (lista) => lista.reduce((t, x) => ({ pedidos: t.pedidos + x.pedidos, total: t.total + x.total }), { pedidos: 0, total: 0 });

  function desenhar() {
    const k = [['Hoje', soma(est.vendas.hoje)], ['7 dias', soma(est.vendas.d7)], ['30 dias', soma(est.vendas.d30)]];
    const contagem = (s) => est.lojas.filter((l) => l.situacao === s).length;
    const lojas = est.lojas.filter((l) => est.filtro === 'todas' || l.situacao === est.filtro);
    const abertos = est.chamados.filter((c) => c.situacao === 'aberto');
    const mes = inicioDoMes();
    const aprovadas = est.lojas.filter((l) => l.situacao === 'aprovado');
    raiz.innerHTML = `
      <section class="pn-cartao"><h2>Vendas na plataforma</h2>
        <p class="pn-dica">Total dos pedidos (sem cancelados). O dinheiro vai direto para cada estabelecimento.</p>
        <div class="pn-adm-kpi">${k.map(([t, x]) => `<p><span>${t}</span><b>${x.pedidos} ${x.pedidos === 1 ? 'pedido' : 'pedidos'}</b><span>${brl(x.total)}</span></p>`).join('')}</div>
        ${est.vendas.d30.length ? `<table class="pn-tabela"><caption>Por estabelecimento, 30 dias</caption><tr><th>Estabelecimento</th><th>Cidade</th><th>Pedidos</th><th>Total</th></tr>
          ${est.vendas.d30.map((r) => `<tr><td>${esc(r.nome)}</td><td>${esc(r.cidade)}</td><td>${r.pedidos}</td><td>${brl(r.total)}</td></tr>`).join('')}</table>` : ''}
      </section>

      <section class="pn-cartao"><h2>Estabelecimentos</h2>
        <div class="pn-filtros">${[['pendente', 'Em análise'], ['aprovado', 'Aprovados'], ['suspenso', 'Suspensos'], ['recusado', 'Recusados'], ['todas', 'Todos']]
          .map(([f, t]) => `<button type="button" class="chip chip--peq" data-adm-filtro="${f}" aria-pressed="${est.filtro === f}">${t}${f !== 'todas' ? ` (${contagem(f)})` : ''}</button>`).join('')}</div>
        ${lojas.length ? lojas.map((l) => {
          const p = l.estabelecimentos_privado || {};
          return `<article class="pn-adm-loja" data-id="${esc(l.id)}">
            <p><b>${esc(l.nome)}</b> · ${esc(l.cidade)} · <span class="pn-tag">${SITUACOES[l.situacao] || esc(l.situacao)}</span></p>
            <p class="pn-dica">${p.documento_tipo ? `${p.documento_tipo.toUpperCase()} ${doc(p.documento_tipo, p.documento)}` : ''}${p.razao_social ? ` · ${esc(p.razao_social)}` : ''}</p>
            <p class="pn-dica">Responsável: ${esc(p.responsavel_nome || '—')} · ${esc(telefoneTxt(p.responsavel_telefone || ''))} · ${esc(p.responsavel_email || '')}</p>
            <p class="pn-dica">${esc(p.endereco || '')}${l.telefone_publico ? ` · Loja: ${esc(telefoneTxt(l.telefone_publico))}` : ''}</p>
            ${p.situacao_motivo ? `<p class="pn-dica">Motivo: ${esc(p.situacao_motivo)}</p>` : ''}
            <div class="pn-ped-acoes">
              ${l.situacao !== 'aprovado' ? '<button type="button" class="btn btn-primario" data-adm-sit="aprovado">Aprovar</button>' : ''}
              ${l.situacao === 'pendente' ? '<button type="button" class="btn btn-sec" data-adm-sit="recusado">Recusar</button>' : ''}
              ${l.situacao === 'aprovado' ? '<button type="button" class="btn btn-sec" data-adm-sit="suspenso">Suspender</button>' : ''}
              <button type="button" class="link" data-adm-abrir>Abrir painel da loja</button>
            </div></article>`;
        }).join('') : '<p class="pn-vazio">Nenhum estabelecimento aqui.</p>'}
      </section>

      <section class="pn-cartao"><h2>Chamados de suporte ${abertos.length ? `<span class="pn-cont">${abertos.length}</span>` : ''}</h2>
        ${est.chamados.length ? est.chamados.map((c) => `<article class="pn-adm-loja${c.situacao === 'aberto' ? ' is-novo' : ''}" data-chamado="${c.id}">
          <p><b>#${c.id} · ${MOTIVOS[c.motivo] || esc(c.motivo)}</b> · ${new Date(c.criado_em).toLocaleString('pt-BR')} · <span class="pn-tag">${c.situacao === 'aberto' ? 'Aberto' : 'Resolvido'}</span></p>
          <p class="pn-dica">${c.pedidos?.codigo ? `Pedido ${esc(c.pedidos.codigo)} · ` : ''}${c.estabelecimentos?.nome ? `${esc(c.estabelecimentos.nome)}${c.estabelecimentos.telefone_publico ? ` (${esc(telefoneTxt(c.estabelecimentos.telefone_publico))})` : ''} · ` : ''}Cliente: ${esc(telefoneTxt(c.telefone))}</p>
          ${c.descricao ? `<p>${esc(c.descricao)}</p>` : ''}
          ${c.resposta ? `<p class="pn-dica">Anotação: ${esc(c.resposta)}</p>` : ''}
          ${c.situacao === 'aberto' ? '<div class="pn-ped-acoes"><button type="button" class="btn btn-sec" data-adm-resolver>Marcar resolvido</button></div>' : ''}
        </article>`).join('') : '<p class="pn-vazio">Nenhum chamado.</p>'}
      </section>

      <section class="pn-cartao"><h2>Mensalidades de ${mes.slice(5, 7)}/${mes.slice(0, 4)}</h2>
        <p class="pn-dica">Controle de quem pagou. A cobrança é feita por fora (Pix ou boleto).</p>
        ${aprovadas.length ? `<table class="pn-tabela"><tr><th>Estabelecimento</th><th>Valor</th><th>Situação</th><th></th></tr>
          ${aprovadas.map((l) => {
            const m = est.mensal.find((x) => x.estabelecimento_id === l.id);
            return `<tr data-mensal="${esc(l.id)}"><td>${esc(l.nome)}</td><td>${m ? brl(m.valor) : '—'}</td>
              <td>${m ? ({ aberta: 'Em aberto', paga: `Paga${m.pago_em ? ` em ${m.pago_em.split('-').reverse().join('/')}` : ''}`, isenta: 'Isenta' })[m.situacao] : 'Não lançada'}</td>
              <td>${!m ? '<button type="button" class="link" data-adm-lancar>Lançar</button>' : m.situacao === 'aberta' ? '<button type="button" class="link" data-adm-pagar>Marcar paga</button>' : ''}</td></tr>`;
          }).join('')}</table>` : '<p class="pn-vazio">Nenhum estabelecimento aprovado ainda.</p>'}
      </section>`;
  }

  async function agir(fn, msg) {
    try {
      await fn();
      if (msg) avisar(msg);
      await carregar();
    } catch (e) {
      if (e.status !== 401) avisar(e.message || 'Não deu para salvar.', 'erro');
    }
  }

  raiz.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const loja = b.closest('[data-id]')?.dataset.id;
    if (b.hasAttribute('data-adm-recarregar')) carregar();
    else if (b.dataset.admFiltro) { est.filtro = b.dataset.admFiltro; desenhar(); }
    else if (b.dataset.admSit && loja) {
      const situacao = b.dataset.admSit;
      let motivo = '';
      if (situacao !== 'aprovado') {
        motivo = prompt(situacao === 'recusado' ? 'Motivo da recusa (o dono vê):' : 'Motivo da suspensão (o dono vê):', '');
        if (motivo === null) return;
      }
      agir(() => cliente.rest('rpc/definir_situacao', { method: 'POST', body: { estabelecimento: loja, situacao, motivo } }), `${SITUACOES[situacao]}.`);
    } else if (b.hasAttribute('data-adm-abrir') && loja) aoAbrirLoja(loja);
    else if (b.hasAttribute('data-adm-resolver')) {
      const id = b.closest('[data-chamado]').dataset.chamado;
      const resposta = prompt('Anotação (opcional): o que foi feito?', '');
      if (resposta === null) return;
      agir(() => cliente.rest(`chamados?id=eq.${Number(id)}`, { method: 'PATCH', body: { situacao: 'resolvido', resposta: resposta.slice(0, 1000) } }), 'Chamado resolvido.');
    } else if (b.hasAttribute('data-adm-lancar')) {
      const id = b.closest('[data-mensal]').dataset.mensal;
      const valor = prompt('Valor da mensalidade (R$):', '50,00');
      if (valor === null) return;
      const centavos = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100);
      if (!Number.isInteger(centavos) || centavos < 0) { avisar('Valor inválido.', 'erro'); return; }
      agir(() => cliente.rest('mensalidades', { method: 'POST', body: { estabelecimento_id: id, competencia: inicioDoMes(), valor: centavos } }), 'Mensalidade lançada.');
    } else if (b.hasAttribute('data-adm-pagar')) {
      const id = b.closest('[data-mensal]').dataset.mensal;
      const hoje = new Date();
      const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      agir(() => cliente.rest(`mensalidades?estabelecimento_id=eq.${encodeURIComponent(id)}&competencia=eq.${inicioDoMes()}`, { method: 'PATCH', body: { situacao: 'paga', pago_em: data } }), 'Mensalidade paga.');
    }
  });

  carregar();
}
