// ============================================================
// PÁGINAS NOVAS DO MODELO FOOD (protótipo)
// Início com categorias e ranking, cadastros, suporte, avaliação e painéis.
// O que depende de banco, pagamento ou texto jurídico mostra "Em desenvolvimento".
// Cardápio, carrinho, checkout, Pix e acompanhamento continuam sendo os do site antigo.
// ============================================================

import { CONFIG } from '../config.js';
import { brl, esc, norm, salvo } from '../utils.js';
import { avisar } from '../ui.js';
import { ESTABS, CATEGORIAS_MKT, CIDADES, MIN_AVALIACOES, estabPorId } from './dados.js';
import { entrarNaLoja, situacaoDe, lojaAtual } from './loja.js';

const dev = (t) => `<div class="mk-dev">🚧 <strong>Em desenvolvimento:</strong> ${t}</div>`;
const fmt = (v) => brl(Math.round(v * 100));
const estado = { cat: 'lanchonetes', cidade: '', busca: '' };
const secao = (html) => `<section class="mk"><div class="wrap">${html}</div></section>`;
const cab = (olho, titulo) => `<header><p class="olho">${esc(olho)}</p><h1 id="pg-h" tabindex="-1">${esc(titulo)}</h1></header>`;

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
  return m;
}
export const fecharModal = () => document.getElementById('mk-modal')?.remove();
const aviso = (t) => modal(`<p>${t}</p><div class="mk-acoes"><button class="btn btn-primario" data-fechar type="button">OK</button></div>`)
  .querySelector('[data-fechar]').addEventListener('click', fecharModal);

// ---------- início: categorias, busca, ranking ----------
function ranking(cat, cidade, busca) {
  const q = norm(busca);
  const lista = ESTABS.filter((e) => e.cat === cat && (!cidade || e.cidade === cidade) && (!q || norm(e.nome).includes(q)));
  const ok = lista.filter((e) => e.avaliacoes >= MIN_AVALIACOES).sort((a, b) => b.nota - a.nota);
  const novos = lista.filter((e) => e.avaliacoes < MIN_AVALIACOES).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return [...ok, ...novos];
}

function cartaoEstab(e) {
  const s = situacaoDe(e);
  const taxa = e.entrega.taxa.valor;
  return `<article class="mk-card"><div class="mk-linha"><div>
    <p class="mk-est-nome">${esc(e.nome)}</p>
    <p class="mk-est-meta">${esc(e.cidade)} · ⭐ ${e.nota.toFixed(1)} (${e.avaliacoes}) · entrega ${brl(taxa)} · ${esc(e.entrega.tempo)}</p>
    ${e.avaliacoes < MIN_AVALIACOES ? '<p class="mk-est-meta">Novo na plataforma</p>' : ''}
    </div><div><span class="mk-tag ${s.aberto ? '' : 'x'}">${s.aberto ? 'Aberto' : 'Fechado'}</span>
    <button class="btn btn-primario" type="button" data-loja="${esc(e.id)}" ${s.aberto ? '' : 'disabled'}>Ver cardápio</button></div></div>
    ${e.fotosDeExemplo ? '<p class="mk-est-meta">Cardápio de exemplo: as fotos reais ainda não foram cadastradas.</p>' : ''}
  </article>`;
}

export function paginaInicio(main) {
  main.innerHTML = secao(`${cab('Araçuaí, Coronel Murta, Virgem da Lapa e Itaobim', 'O que você quer pedir hoje?')}
    <div class="mk-dev">Versão de análise: estabelecimentos e avaliações fictícios. Nenhum pedido é enviado e nada é cobrado.</div>
    <div class="mk-lojabar"><label class="mk-l" for="mk-busca" style="margin:0">Buscar</label>
      <input type="text" id="mk-busca" placeholder="Nome do estabelecimento" style="max-width:280px" value="${esc(estado.busca)}">
      <select id="mk-cidade" aria-label="Cidade" style="max-width:200px"><option value="">Todas as cidades</option>${CIDADES.map((c) => `<option ${c === estado.cidade ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="mk-grade" id="mk-cats">${CATEGORIAS_MKT.map((c) => c.embreve
    ? `<div class="mk-cat soon" aria-disabled="true"><span class="ic">${c.icone}</span><b>${esc(c.nome)}</b><div><span class="mk-tag w">Em breve</span></div></div>`
    : `<button class="mk-cat" type="button" data-cat="${c.id}"><span class="ic">${c.icone}</span><b>${esc(c.nome)}</b></button>`).join('')}</div>
    <h2>Em destaque</h2><div id="mk-dest">${ESTABS.filter((e) => e.avaliacoes >= MIN_AVALIACOES).sort((a, b) => b.nota - a.nota).slice(0, 3).map(cartaoEstab).join('')}</div>
    <div class="mk-acoes"><a class="btn btn-sec" href="#cadastro">Criar conta de cliente</a><a class="btn btn-sec" href="#estab-cadastro">Cadastrar meu estabelecimento</a></div>`);
  const ir = () => { location.hash = '#lista'; };
  main.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { estado.cat = b.dataset.cat; ir(); }));
  main.querySelector('#mk-busca').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { estado.busca = ev.target.value; ir(); } });
  main.querySelector('#mk-cidade').addEventListener('change', (ev) => { estado.cidade = ev.target.value; });
  ligarLojas(main);
}

export function paginaLista(main) {
  const cat = CATEGORIAS_MKT.find((c) => c.id === estado.cat) || CATEGORIAS_MKT[0];
  const l = ranking(cat.id, estado.cidade, estado.busca);
  main.innerHTML = secao(`${cab('Estabelecimentos', cat.nome)}
    <p class="mk-muted">Ordenados pela nota média. Quem tem menos de ${MIN_AVALIACOES} avaliações aparece depois, em ordem alfabética.${estado.cidade ? ` Cidade: ${esc(estado.cidade)}.` : ''}</p>
    ${l.length ? l.map(cartaoEstab).join('') : '<div class="mk-card">Nenhum estabelecimento encontrado.</div>'}
    <p class="mk-muted">Estabelecimentos e avaliações fictícios, só para a versão de análise.</p>
    <div class="mk-acoes"><a class="btn btn-sec" href="#inicio">Voltar ao início</a></div>`);
  ligarLojas(main);
}

function ligarLojas(main) {
  main.querySelectorAll('[data-loja]').forEach((b) => b.addEventListener('click', () => {
    if (entrarNaLoja(b.dataset.loja)) location.hash = '#loja';
  }));
}

// ---------- cadastro do cliente ----------
const ACEITES = [
  'Li e aceito os <a href="#termos">Termos de uso</a>',
  'Li e aceito a <a href="#termos">Política de privacidade</a>',
  'Aceito a <a href="#termos">Política de cookies</a>',
  'Li e aceito a <a href="#termos">Política de cancelamento e reembolso</a>',
];
function exigirAceites(raiz, botao) {
  const checar = () => { botao.disabled = ![...raiz.querySelectorAll('input.req')].every((c) => c.checked); };
  raiz.querySelectorAll('input.req').forEach((c) => c.addEventListener('change', checar));
  checar();
}
const aceitesHtml = (extra = []) => [...ACEITES, ...extra].map((a) => `<label class="mk-chk"><input type="checkbox" class="req"> <span>${a} *</span></label>`).join('');

export function paginaCadastro(main) {
  main.innerHTML = secao(`${cab('Cliente', 'Criar conta')}
    <ol class="mk-passos"><li class="on">1 Telefone</li><li>2 Dados</li><li>3 Aceites</li></ol>
    <form class="mk-card" id="mk-f" novalidate>
      <label class="mk-l" for="c-tel">Telefone / WhatsApp *</label><input type="tel" id="c-tel" inputmode="tel" placeholder="(33) 9 0000-0000">
      <p class="mk-muted">Você receberá um código de verificação.</p>
      <label class="mk-l" for="c-nome">Nome completo *</label><input type="text" id="c-nome" autocomplete="name">
      <label class="mk-l" for="c-senha">Senha * (8 ou mais caracteres, com letras e números)</label><input type="password" id="c-senha" autocomplete="new-password">
      <label class="mk-l" for="c-email">E-mail (opcional)</label><input type="email" id="c-email" autocomplete="email">
      <label class="mk-chk"><input type="checkbox" id="c-promo"> <span>Aceito receber promoções dos estabelecimentos por e-mail (opcional)</span></label>
      ${aceitesHtml()}
      <p class="mk-muted">O endereço de entrega só é pedido no seu primeiro pedido.</p>
      <button class="btn btn-primario" id="c-ok" type="submit">Criar conta</button>
    </form>${dev('envio real do código por SMS ou WhatsApp, login e a tela Meu perfil (dados, endereços salvos e preferência de e-mail).')}`);
  const f = main.querySelector('#mk-f');
  exigirAceites(f, f.querySelector('#c-ok'));
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const tel = f.querySelector('#c-tel').value.replace(/\D/g, '');
    if (tel.length < 10) return aviso('Telefone inválido. Confira o DDD e os números.');
    if (f.querySelector('#c-nome').value.trim().split(/\s+/).length < 2) return aviso('Informe seu nome completo.');
    const s = f.querySelector('#c-senha').value;
    if (s.length < 8 || !/[a-z]/i.test(s) || !/\d/.test(s)) return aviso('A senha precisa ter 8 caracteres, com letras e números.');
    aviso('Bem-vindo! Sua conta foi criada. (simulação: nada foi salvo)');
  });
}

// ---------- suporte ----------
const MOTIVOS = ['Meu pedido não foi entregue', 'Pedido errado', 'O pedido está demorando', 'Outro problema'];
export function paginaSuporte(main) {
  main.innerHTML = secao(`${cab('Ajuda', 'Suporte')}
    <p class="mk-muted">Escolha o que aconteceu com o seu pedido.</p>
    ${MOTIVOS.map((m, i) => `<button class="mk-cat" style="text-align:left;margin-bottom:10px" type="button" data-motivo="${i}">${esc(m)}</button>`).join('')}
    ${dev('o chamado ainda não é gravado: no sistema real ele vai ligado ao número do pedido e aparece para a equipe com o telefone do estabelecimento.')}`);
  main.querySelectorAll('[data-motivo]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.motivo === '3') {
      const m = modal(`<h3>Conte o que aconteceu</h3><textarea rows="3" id="mk-txt" style="width:100%"></textarea>
        <div class="mk-acoes"><button class="btn btn-sec" type="button" data-x>Cancelar</button><button class="btn btn-primario" type="button" data-ok>Enviar</button></div>`);
      m.querySelector('[data-x]').addEventListener('click', fecharModal);
      m.querySelector('[data-ok]').addEventListener('click', () => { fecharModal(); aviso('Recebemos seu pedido de ajuda. Nossa equipe vai entrar em contato com o estabelecimento em breve.'); });
    } else aviso('Recebemos seu pedido de ajuda. Nossa equipe vai entrar em contato com o estabelecimento em breve.');
  }));
}

// ---------- termos ----------
export function paginaTermos(main) {
  const docs = ['Termos de uso', 'Política de privacidade (LGPD)', 'Política de cookies', 'Política de cancelamento e reembolso', 'Regras de comissão e mensalidade (estabelecimentos)'];
  main.innerHTML = secao(`${cab('Documentos', 'Termos e políticas')}
    ${docs.map((d) => `<div class="mk-card"><strong>${d}</strong>${dev('texto a ser escrito e revisado por advogado antes do lançamento.')}</div>`).join('')}
    <p class="mk-muted">O modelo de política de privacidade do site antigo continua disponível em <a href="#privacidade">Privacidade (modelo)</a>.</p>`);
}

// ---------- avaliação (quadro flutuante depois da entrega) ----------
const JA_PERGUNTOU = 'modelo:avaliacao:v1';
export function abrirAvaliacao(pedido) {
  let n = 0;
  const m = modal(`<h3>Como foi o seu pedido?</h3><p class="mk-muted">${esc(pedido?.codigo ? `Pedido ${pedido.codigo}` : 'Pedido')} · ${esc(CONFIG.marca.nome)}</p>
    <div class="mk-estrelas" id="mk-st" role="group" aria-label="Nota de 0 a 5"></div><p class="mk-muted" id="mk-n">0 de 5</p>
    <label class="mk-l" for="mk-com" style="display:block;font-weight:600;font-size:13px">Comentário (opcional)</label>
    <textarea id="mk-com" rows="3" style="width:100%" maxlength="300"></textarea>
    <div class="mk-acoes"><button class="btn btn-sec" type="button" data-x>Agora não</button><button class="btn btn-primario" type="button" data-ok>Enviar avaliação</button></div>`);
  const pintar = () => {
    m.querySelector('#mk-st').innerHTML = [1, 2, 3, 4, 5].map((i) => `<button type="button" class="${i <= n ? 'on' : ''}" data-n="${i}" aria-label="${i} estrela${i > 1 ? 's' : ''}">★</button>`).join('');
    m.querySelector('#mk-n').textContent = `${n} de 5`;
    m.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { n = Number(b.dataset.n); pintar(); }));
  };
  pintar();
  m.querySelector('[data-x]').addEventListener('click', fecharModal);
  m.querySelector('[data-ok]').addEventListener('click', () => { fecharModal(); avisar('Obrigado por avaliar! (simulação: a nota não foi gravada)'); });
}
// o acompanhamento do pedido avisa quando o status muda; ao ficar "entregue" a pergunta aparece uma vez
window.addEventListener('mkpedido', (ev) => {
  const p = ev.detail;
  if (!p || p.status !== 'entregue') return;
  const vistos = salvo.ler(JA_PERGUNTOU, []);
  if (vistos.includes(p.codigo)) return;
  salvo.gravar(JA_PERGUNTOU, [...vistos, p.codigo].slice(-30));
  setTimeout(() => abrirAvaliacao(p), 600);
});
document.addEventListener('click', (ev) => {
  const b = ev.target.closest?.('[data-avaliar]');
  if (b) abrirAvaliacao({ codigo: b.dataset.avaliar });
  // só no protótipo: pula direto para o pedido entregue, para ver o quadro de avaliação sem esperar 7 minutos
  const s = ev.target.closest?.('[data-simular-entrega]');
  if (s) { fecharModal(); abrirAvaliacao({ codigo: s.dataset.simularEntrega }); }
});

// ---------- estabelecimento: cadastro em etapas ----------
const ETAPAS = ['Estabelecimento', 'Funcionamento', 'Proprietário', 'Cardápio', 'Revisão'];
let etapaEst = 0;
const cidadesOpt = CIDADES.map((c) => `<option>${c}</option>`).join('');
const CORPO_ETAPA = [
  () => `<label class="mk-l">Nome do estabelecimento *</label><input type="text">
    <label class="mk-l">Categoria *</label><select><option>Lanchonetes e hamburguerias</option><option>Restaurantes e pizzarias</option></select>
    <label class="mk-l">CNPJ ou CPF *</label><input type="text" inputmode="numeric">
    <label class="mk-l">Cidade *</label><select>${cidadesOpt}</select>
    <label class="mk-l">Endereço completo *</label><input type="text">
    <label class="mk-l">Telefone do estabelecimento * (público, usado no suporte)</label><input type="tel">`,
  () => `<label class="mk-l">Horário (exemplo para todos os dias)</label><div class="mk-linha"><input type="text" placeholder="Abre 18:00" style="width:48%"><input type="text" placeholder="Fecha 23:00" style="width:48%"></div>
    <label class="mk-l">Forma de entrega *</label><label class="mk-chk"><input type="checkbox" checked> Entrega pelo próprio estabelecimento</label><label class="mk-chk"><input type="checkbox"> Retirada no local</label>
    <label class="mk-l">Taxa de entrega *</label><input type="number" placeholder="5,00">
    <label class="mk-l">Formas de pagamento</label>${dev('as opções de pagamento ainda não foram definidas.')}`,
  () => `<div class="mk-privado">🔒 Estas informações são visíveis e acessadas somente pela equipe do Modelo Food.</div>
    <label class="mk-l">Nome do proprietário *</label><input type="text"><label class="mk-l">Telefone *</label><input type="tel"><label class="mk-l">E-mail *</label><input type="email">`,
  () => `<label class="mk-l">Primeiro produto *</label><input type="text" placeholder="Nome"><input type="number" placeholder="Preço" style="margin-top:6px"><input type="text" placeholder="Categoria (ex.: Lanches)" style="margin-top:6px">${dev('foto do produto e importação rápida do cardápio.')}`,
  () => `<p>Confira os dados e aceite os documentos para enviar.</p>${aceitesHtml(['Aceito as regras de comissão e mensalidade'])}<button class="btn btn-primario" id="e-ok" type="button">Enviar para aprovação</button>`,
];
export function paginaEstabCadastro(main) {
  const s = etapaEst;
  main.innerHTML = secao(`${cab('Estabelecimento', 'Cadastrar estabelecimento')}
    <ol class="mk-passos">${ETAPAS.map((e, i) => `<li class="${i === s ? 'on' : ''}">${i + 1} ${e}</li>`).join('')}</ol>
    <div class="mk-card" id="mk-corpo">${CORPO_ETAPA[s]()}</div>
    <div class="mk-linha"><button class="btn btn-sec" type="button" data-volta ${s ? '' : 'disabled'}>Voltar</button>${s < 4 ? '<button class="btn btn-primario" type="button" data-prox>Próxima etapa</button>' : ''}</div>
    ${dev('verificação do telefone e do e-mail do proprietário, envio de documentos (alvará) e login.')}`);
  main.querySelector('[data-volta]').addEventListener('click', () => { etapaEst--; paginaEstabCadastro(main); });
  main.querySelector('[data-prox]')?.addEventListener('click', () => { etapaEst++; paginaEstabCadastro(main); });
  const ok = main.querySelector('#e-ok');
  if (ok) {
    exigirAceites(main.querySelector('#mk-corpo'), ok);
    ok.addEventListener('click', () => aviso('Recebemos seu cadastro. Nossa equipe vai analisar e avisar você. (simulação)'));
  }
}

// ---------- estabelecimento: painel (pedidos, cardápio, configurações) ----------
const subnav = (a) => `<ol class="mk-passos">${[['estab-pedidos', 'Pedidos'], ['estab-cardapio', 'Cardápio'], ['estab-config', 'Configurações']].map(([r, t]) => `<li class="${a === r ? 'on' : ''}"><a href="#${r}" style="background:none;color:inherit;padding:0">${t}</a></li>`).join('')}</ol>`;
let pedidosEst = [
  { n: 1042, col: 0, it: '2x X-Burger, 1x Coca-Cola lata', v: 42, pg: 'Pix', end: 'Rua das Flores, 120 · Centro' },
  { n: 1043, col: 0, it: '1x X-Bacon, 1x Fritas', v: 38, pg: 'Dinheiro (troco para 50)', end: 'Av. Principal, 45 · Rio Branco' },
  { n: 1041, col: 1, it: '1x X-Tudo', v: 28, pg: 'Cartão na entrega', end: 'Rua do Comércio, 8 · Centro' },
  { n: 1039, col: 3, it: '3x Guaraná lata', v: 18, pg: 'Pix', end: 'Rua Nova, 77 · Bairro Alto' },
];
export function paginaEstabPedidos(main) {
  const COLS = ['Novos', 'Em preparo', 'Saiu / Pronto', 'Entregues'];
  const kpi = [['Hoje', '12 pedidos', 'R$ 389,40'], ['Esta semana', '68 pedidos', 'R$ 2.140,10'], ['Este mês', '241 pedidos', 'R$ 7.912,50']];
  main.innerHTML = secao(`${cab('Painel do estabelecimento', 'Lanchonete do Zé')}${subnav('estab-pedidos')}
    <div class="mk-linha"><span class="mk-muted">Loja aberta para pedidos</span><label class="mk-sw"><input type="checkbox" checked aria-label="Loja aberta"><i></i></label></div>
    <div class="mk-kpi">${kpi.map((k) => `<div class="mk-card"><span class="mk-muted">${k[0]}</span><b>${k[1]}</b><span class="mk-muted">líquido ${k[2]} · valores de exemplo</span></div>`).join('')}</div>
    <div class="mk-cols">${COLS.map((c, i) => `<div class="mk-col"><h3>${c}</h3>${pedidosEst.filter((o) => o.col === i).map((o) => `<div class="mk-ord"><strong>#${o.n}</strong> · ${esc(o.it)}
      <div class="mk-muted">${esc(o.end)}</div><div class="mk-muted">${esc(o.pg)} · líquido ${fmt(o.v - 0.5)}</div>
      ${i === 0 ? `<div class="mk-acoes"><button class="btn btn-primario" type="button" data-av="${o.n}">Aceitar</button><button class="btn btn-sec" type="button" data-rec="${o.n}">Recusar</button></div>` : i < 3 ? `<div class="mk-acoes"><button class="btn btn-primario" type="button" data-av="${o.n}">Avançar</button></div>` : ''}</div>`).join('') || '<span class="mk-muted">Nenhum</span>'}</div>`).join('')}</div>
    ${dev('os pedidos reais, o aviso sonoro de pedido novo, o resumo do dia e a confirmação de Pix já existem no painel do site antigo (admin.html) e serão trazidos para cá. A taxa da plataforma (R$ 0,50) é só exemplo.')}`);
  main.querySelectorAll('[data-av]').forEach((b) => b.addEventListener('click', () => { pedidosEst.find((o) => o.n === Number(b.dataset.av)).col++; paginaEstabPedidos(main); }));
  main.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => { pedidosEst = pedidosEst.filter((o) => o.n !== Number(b.dataset.rec)); paginaEstabPedidos(main); }));
}

export function paginaEstabCardapio(main) {
  const lista = (estabPorId('ze')?.produtos || []).slice(0, 8);
  main.innerHTML = secao(`${cab('Painel do estabelecimento', 'Cardápio')}${subnav('estab-cardapio')}
    <div class="mk-linha"><span class="mk-muted">Pausar tira o item da vitrine sem apagar.</span><button class="btn btn-primario" type="button" data-novo>Novo produto</button></div>
    ${lista.map((p, i) => `<div class="mk-card mk-linha"><div><strong>${esc(p.nome)}</strong><div class="mk-muted">${brl(p.preco)}</div></div>
      <label class="mk-linha" style="gap:8px"><span class="mk-muted">Disponível</span><span class="mk-sw"><input type="checkbox" checked data-i="${i}" aria-label="Disponível: ${esc(p.nome)}"><i></i></span></label></div>`).join('')}
    ${dev('cadastro e edição completos de produtos (o painel do site antigo já cria produto com foto da câmera), categorias, opções extras e importação rápida.')}`);
  main.querySelector('[data-novo]').addEventListener('click', () => aviso('Formulário de novo produto: nome, descrição, preço, categoria, foto e opções extras. (em desenvolvimento)'));
}

export function paginaEstabConfig(main) {
  const itens = [['Dados do estabelecimento', 'nome, categoria, endereço, telefone público, logo'], ['Horários de funcionamento', 'por dia da semana e datas especiais'], ['Entrega', 'taxa, bairros atendidos e tempo de preparo'], ['Pagamento', 'formas aceitas e mensalidade (R$ 50, a confirmar)'], ['Documentos e situação', 'alvará, aprovação e suspensão'], ['Notificações', 'som de novo pedido']];
  main.innerHTML = secao(`${cab('Painel do estabelecimento', 'Configurações')}${subnav('estab-config')}
    ${itens.map(([t, d]) => `<div class="mk-card"><strong>${t}</strong><div class="mk-muted">${d}</div>${dev('tela de edição. No site antigo, horários e entrega por bairro já têm tela no painel do dono.')}</div>`).join('')}`);
}

// ---------- administração (você e seu irmão) ----------
export function paginaAdmin(main) {
  const kpi = [['Hoje', '48 pedidos', 'R$ 1.620,00 vendidos', 'taxa R$ 24,00'], ['Esta semana', '311 pedidos', 'R$ 10.480,00 vendidos', 'taxa R$ 155,50'], ['Este mês', '1.204 pedidos', 'R$ 40.310,00 vendidos', 'taxa R$ 602,00']];
  main.innerHTML = secao(`${cab('Equipe', 'Administração')}
    ${dev('login com verificação em duas etapas. Os números abaixo são fictícios.')}
    <div class="mk-kpi">${kpi.map((k) => `<div class="mk-card"><span class="mk-muted">${k[0]}</span><b>${k[1]}</b><span class="mk-muted">${k[2]}</span><br><span class="mk-tag">${k[3]}</span></div>`).join('')}</div>
    <h2>Por estabelecimento</h2><div class="mk-card" style="overflow:auto"><table class="mk-tabela"><tr><th>Nome</th><th>Categoria</th><th>Cidade</th><th>Pedidos</th><th>Vendido</th><th>Nota</th><th>Situação</th></tr>
    ${ESTABS.map((e, i) => `<tr><td>${esc(e.nome)}</td><td>${esc(e.cat)}</td><td>${esc(e.cidade)}</td><td>${40 + i * 13}</td><td>${fmt(900 + i * 410)}</td><td>${e.nota.toFixed(1)}</td><td><span class="mk-tag ${situacaoDe(e).aberto ? '' : 'x'}">${situacaoDe(e).aberto ? 'Aberto' : 'Fechado'}</span></td></tr>`).join('')}</table></div>
    <h2>Por cidade</h2><div class="mk-card">${[['Araçuaí', 78], ['Coronel Murta', 40], ['Itaobim', 32], ['Virgem da Lapa', 26]].map(([c, v]) => `<div class="mk-linha"><span style="width:130px">${c}</span><div style="flex:1"><div class="mk-barra" style="width:${v}%"></div></div></div>`).join('')}</div>
    <h2>Fila de aprovação <span class="mk-tag w">2</span></h2>
    ${['Lanchonete Nova (Araçuaí)', 'Pastelaria Central (Itaobim)'].map((n) => `<div class="mk-card mk-linha"><span>${n}</span><span class="mk-acoes" style="margin:0"><button class="btn btn-primario" type="button">Aprovar</button><button class="btn btn-sec" type="button">Pedir ajustes</button><button class="btn btn-sec" type="button">Recusar</button></span></div>`).join('')}
    <h2>Chamados de suporte</h2><div class="mk-card mk-linha"><span>#1041 · Pedido demorando · Lanchonete do Zé</span><button class="btn btn-sec" type="button">Abrir</button></div>
    <h2>Contato dos proprietários</h2><div class="mk-privado">🔒 Uso exclusivo da equipe. Não use para suporte de pedidos.</div>
    ${dev('lista de proprietários, moderação de avaliações, exportação para planilha e registro de acessos.')}`);
  main.querySelectorAll('.mk-acoes button').forEach((b) => b.addEventListener('click', () => aviso('Ação de exemplo. (em desenvolvimento)')));
}

// ---------- barra com o nome da loja (cardápio, carrinho, finalizar) ----------
export function barraDaLoja() {
  const e = lojaAtual();
  if (!e) return null;
  const d = document.createElement('div');
  d.className = 'wrap';
  d.innerHTML = `<div class="mk-lojabar" style="margin-top:calc(var(--topo-h) + 8px)"><span><strong>${esc(e.nome)}</strong> · ${esc(e.cidade)}</span><span class="mk-acoes" style="margin:0"><a class="btn btn-sec" href="#inicio">Trocar de estabelecimento</a></span></div>`;
  return d;
}
