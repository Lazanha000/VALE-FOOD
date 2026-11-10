// Teste de ponta a ponta do painel (admin.html) no Chromium (Playwright):
// login pelo Auth, pedidos pela API com a RLS do schema.sql (Postgres local, postgrest-falso.mjs)
// e a Realtime imitada por um WebSocket falso (routeWebSocket do Playwright).
// Rode DEPOIS do testar-banco.mjs (ele cria o banco). Uso:
//   PGHOST=/tmp PGPORT=5499 PGUSER=postgres PGDATABASE=teste_supabase node supabase/testes/testar-painel.mjs

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { sql, atender, atenderAuth, uidDoToken, auth } from './postgrest-falso.mjs';
import { servirSite, SUPA } from './servidor.mjs';
import { centavosDe, reaisCampo, horariosPorDia, faixasParaSalvar, resumoDoDia } from '../../painel/logica.js';

process.env.PGDATABASE ||= 'teste_supabase';
const { chromium } = createRequire(import.meta.url)('playwright');
const admin = (c) => {
  const r = sql(c, { papel: 'postgres' });
  if (!r.ok) throw new Error(`${r.code} ${r.message}\n${c}`);
  return r.saida;
};

const servidor = await servirSite();
const PAINEL = `${servidor.url}admin.html`;
const navegador = await chromium.launch();
let ok = 0;
const falhas = [];
async function teste(nome, fn) {
  try {
    await fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(nome);
    console.log(`  FALHOU  ${nome}\n        ${String(e.stack || e).split('\n').slice(0, 5).join('\n        ')}`);
  }
}

// ---------- banco: loja aberta o dia todo, uma pessoa da equipe e uma de fora ----------
admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha) select d, '00:00', '23:59:59' from generate_series(1, 7) d;
  update public.loja set aberta_manual = true, bloquear_fechado = true; update public.produtos set disponivel = true;
  delete from public.pedidos;
  delete from public.equipe where user_id in (select id from auth.users where email like '%@teste');
  delete from auth.users where email like '%@teste'`);
const uidCozinha = admin(`insert into auth.users (email, senha) values ('cozinha@teste', 'senha-boa-123') returning id`);
const uidDono = admin(`insert into auth.users (email, senha) values ('dono@teste', 'senha-do-dono-1') returning id`);
admin(`insert into auth.users (email, senha) values ('intruso@teste', 'senha-boa-123')`);
admin(`insert into public.equipe (user_id, nome, papel) values ('${uidCozinha}', 'Cozinha', 'cozinha'), ('${uidDono}', 'Dono', 'dono')`);

let telN = 0;
let ipN = 1;
// pedido feito pelo site (função criar_pedido, como visitante)
function novoPedido(extra = {}) {
  const dados = {
    modo: 'retirada',
    cliente: { nome: 'Joana Prado', telefone: `3398765${String(telN++).padStart(4, '0')}` },
    pagamento: { forma: 'pix' },
    itens: [{ produtoId: 'x-tudo', qtd: 2, escolhas: {}, remover: ['Cebola'], obs: 'bem passado' }],
    ...extra,
  };
  const r = atender('POST', 'rpc/criar_pedido', JSON.stringify({ dados, chave: crypto.randomUUID() }), { ip: `198.18.0.${ipN++}` });
  assert.equal(r.status, 200, r.corpo);
  return JSON.parse(r.corpo);
}
const linhaPedido = (codigo) => JSON.parse(admin(`select row_to_json(p) from public.pedidos p where codigo = '${codigo}'`));

// ---------- Realtime falsa: entra no canal com o token; manda as mudanças só para a equipe ----------
const canais = new Set();
function emitir(type, record) {
  for (const c of canais) {
    if (!c.uid || admin(`select count(*) from public.equipe where user_id = '${c.uid}'`) !== '1') continue;
    c.ws.send(JSON.stringify({ topic: c.topic, event: 'postgres_changes', ref: null,
      payload: { data: { type, record, schema: 'public', table: 'pedidos', commit_timestamp: new Date().toISOString() }, ids: [1] } }));
  }
}

// Storage falso (bucket "produtos"): guarda em memória; só o dono envia/apaga (como a política do schema.sql)
const arquivos = new Map();   // caminho -> { tipo, dados }
const ehDono = (token) => {
  const uid = uidDoToken(token);
  return Boolean(uid) && admin(`select count(*) from public.equipe where user_id = '${uid}' and papel = 'dono'`) === '1';
};
function atenderStorage(metodo, caminho, req, token) {
  const publico = /^object\/public\/(.+)$/.exec(caminho);
  if (metodo === 'GET' && publico) {
    const a = arquivos.get(decodeURIComponent(publico[1]));
    return a ? { status: 200, corpo: a.dados, tipo: a.tipo } : { status: 404, corpo: '{}' };
  }
  const m = /^object\/(produtos\/.+)$/.exec(caminho);
  if (!m) return { status: 404, corpo: '{}' };
  if (!ehDono(token)) return { status: 400, corpo: JSON.stringify({ statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }) };
  if (metodo === 'POST') {
    if (arquivos.has(m[1])) return { status: 400, corpo: JSON.stringify({ statusCode: '409', error: 'Duplicate' }) };
    arquivos.set(m[1], { tipo: req.headers()['content-type'], dados: req.postDataBuffer() });
    return { status: 200, corpo: JSON.stringify({ Key: m[1] }) };
  }
  if (metodo === 'DELETE') { arquivos.delete(m[1]); return { status: 200, corpo: '{}' }; }
  return { status: 405, corpo: '{}' };
}

const erros = [];
async function novoContexto({ tempoReal = true } = {}) {
  const ctx = await navegador.newContext({ serviceWorkers: 'block', locale: 'pt-BR', viewport: { width: 1100, height: 900 } });
  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
    const token = (req.headers().authorization || '').replace(/^Bearer /, '') || null;
    const caminho = req.url().slice(SUPA.length);
    if (caminho.startsWith('/storage/v1/')) {
      const r = atenderStorage(req.method(), caminho.slice('/storage/v1/'.length), req, token);
      await route.fulfill({ status: r.status, body: r.corpo, contentType: r.tipo || 'application/json', headers: cors });
      return;
    }
    const r = caminho.startsWith('/auth/v1/')
      ? atenderAuth(req.method(), caminho.slice('/auth/v1/'.length), req.postData(), token)
      : atender(req.method(), caminho.slice('/rest/v1/'.length), req.postData(), { token });
    await route.fulfill({ status: r.status, body: r.corpo, contentType: 'application/json', headers: cors });
  });
  await ctx.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    if (!tempoReal) { ws.close(); return; }
    const canal = { ws, uid: null, topic: null };
    ws.onMessage((txt) => {
      const m = JSON.parse(txt);
      const responder = (status) => ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status, response: {} } }));
      if (m.topic === 'phoenix' && m.event === 'heartbeat') responder('ok');
      else if (m.event === 'phx_join') {
        canal.uid = uidDoToken(m.payload?.access_token);
        canal.topic = m.topic;
        responder(canal.uid ? 'ok' : 'error');
        if (canal.uid) canais.add(canal);
      } else if (m.event === 'access_token') canal.uid = uidDoToken(m.payload?.access_token) || canal.uid;
    });
    ws.onClose(() => canais.delete(canal));
  });
  return ctx;
}
const vigiar = (page) => {
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => {
    // 400 do login com senha errada/regra recusada e 403/401 de propósito aparecem como erro de rede no console: não contam
    if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 40[0-4]/.test(m.text())) erros.push(m.text());
  });
};
async function entrar(page, email = 'cozinha@teste', senha = 'senha-boa-123') {
  await page.goto(PAINEL);
  await page.fill('#pn-email', email);
  await page.fill('#pn-senha', senha);
  await page.click('#pn-form-login button[type=submit]');
}
const cartao = (page, codigo) => page.locator('.pn-pedido', { hasText: codigo });

console.log('Regras (sem tela):');
await teste('reais <-> centavos e horários do formulário', async () => {
  assert.deepEqual(['28,90', 'R$ 1.234,5', '30', '0', '', 'abc', '-1', '10000,01'].map(centavosDe), [2890, 123450, 3000, 0, null, null, null, null]);
  assert.equal(reaisCampo(500), '5,00');
  const dias = horariosPorDia([{ dia: 7, abre: '18:00:00', fecha: '02:00:00' }, { dia: 1, abre: '19:00:00', fecha: '23:00:00' }, { dia: 1, abre: '11:00:00', fecha: '14:00:00' }]);
  assert.deepEqual(dias[0], [{ abre: '11:00', fecha: '14:00' }, { abre: '19:00', fecha: '23:00' }]);
  assert.deepEqual(dias[6], [{ abre: '18:00', fecha: '02:00' }]);
  assert.deepEqual(faixasParaSalvar(dias).faixas.map((f) => f.dia), [1, 1, 7]);
  assert.match(faixasParaSalvar([[{ abre: '10:00', fecha: '10:00' }]]).erro, /Segunda: abre e fecha no mesmo/);
  assert.match(faixasParaSalvar([[], [{ abre: '', fecha: '10:00' }]]).erro, /Terça: preencha/);
});

console.log('Painel:');

await teste('resumo do dia: só pedidos de hoje no fuso da loja, sem cancelados', async () => {
  const agora = Date.parse('2026-10-29T15:00:00Z');   // 12:00 em Brasília
  const r = resumoDoDia([
    { criado_em: '2026-10-29T03:30:00Z', status: 'entregue', total: 1000, pagamento_forma: 'pix', pagamento_status: 'confirmado' },   // 00:30 de hoje
    { criado_em: '2026-10-29T14:00:00Z', status: 'preparo', total: 2500, pagamento_forma: 'pix', pagamento_status: 'pendente' },
    { criado_em: '2026-10-29T14:10:00Z', status: 'entregue', total: 4000, pagamento_forma: 'dinheiro', pagamento_status: 'pendente' },
    { criado_em: '2026-10-29T14:20:00Z', status: 'cancelado', total: 9999, pagamento_forma: 'pix', pagamento_status: 'pendente' },
    { criado_em: '2026-10-29T02:30:00Z', status: 'entregue', total: 7777, pagamento_forma: 'pix', pagamento_status: 'confirmado' },   // 23:30 de ontem
  ], 'America/Sao_Paulo', agora);
  assert.deepEqual(r, { quantidade: 3, total: 7500, porForma: { pix: 3500, dinheiro: 4000 }, pixPendente: 1 });
});

await teste('sem banco configurado: explica o que falta', async () => {
  const ctx = await novoContexto();
  const original = (await readFile(new URL('../../js/config.js', import.meta.url), 'utf8')).replace(/api: \{ supabaseUrl: [^}]*\}/, 'api: { supabaseUrl: null, chavePublica: null }');
  await ctx.route('**/js/config.js', (route) => route.fulfill({ body: original, contentType: 'text/javascript' }));
  const page = await ctx.newPage();
  vigiar(page);
  await page.goto(PAINEL);
  await page.getByText(/precisa do banco de pedidos ligado/).waitFor();
  await ctx.close();
});

const ctx = await novoContexto();
const page = await ctx.newPage();
vigiar(page);
page.on('dialog', (d) => d.accept());
const pedidoA = novoPedido({
  modo: 'entrega',
  entrega: { cep: '39800000', cidade: 'Teófilo Otoni', endereco: 'Rua das Flores', numero: '42', complemento: 'casa 2', bairro: 'Centro' },
  pagamento: { forma: 'dinheiro', trocoPara: 10000 },
  obs: 'Interfone quebrado',
});

await teste('senha errada não entra', async () => {
  await entrar(page, 'cozinha@teste', 'errada');
  await page.locator('#pn-login-erro', { hasText: 'E-mail ou senha errados.' }).waitFor();
});

await teste('usuário fora da equipe não entra', async () => {
  await entrar(page, 'intruso@teste');
  await page.locator('#pn-login-erro', { hasText: /não tem acesso ao painel/ }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('modelo:painel:v1')), null);
});

await teste('equipe entra e vê o pedido em andamento com tudo da cozinha e da entrega', async () => {
  await entrar(page);
  const c = cartao(page, pedidoA.codigo);
  await c.waitFor();
  const txt = (await c.innerText()).replace(/\u00a0/g, ' ');
  for (const trecho of ['Joana Prado', 'Rua das Flores, 42', 'casa 2', 'Centro, Teófilo Otoni', '2x', 'X-Tudo', 'Sem cebola',
    'Obs.: bem passado', 'Interfone quebrado', 'Dinheiro', 'Troco para R$ 100,00']) assert.ok(txt.includes(trecho), `faltou "${trecho}" em:\n${txt}`);
  // troco = 100,00 - total que o BANCO calculou
  const troco = (10000 - linhaPedido(pedidoA.codigo).total) / 100;
  assert.ok(txt.includes(`levar R$ ${troco.toFixed(2).replace('.', ',')}`), txt);
  await page.locator('#pn-conexao', { hasText: 'Ao vivo' }).waitFor();
  await page.locator('#pn-loja', { hasText: 'Loja aberta' }).waitFor();
  assert.equal(await page.locator('#pn-cont').innerText(), '1');
  // fechamento de caixa do dia
  assert.match(await page.locator('#pn-resumo').innerText(), /Hoje: 1 pedido/);
  if (process.env.FOTOS) await page.screenshot({ path: `${process.env.FOTOS}/painel-topo.png` });
});

let pedidoB;
await teste('pedido novo chega sozinho (tempo real), com destaque e aviso no título', async () => {
  pedidoB = novoPedido();
  emitir('INSERT', { id: linhaPedido(pedidoB.codigo).id, status: 'recebido' });
  const c = cartao(page, pedidoB.codigo);
  await c.waitFor({ timeout: 5000 });
  assert.match(await c.getAttribute('class'), /is-novo/);
  assert.match(await page.title(), /^\(1\) Pedido novo!/);
  assert.equal(await page.locator('#pn-cont').innerText(), '2');
});

await teste('andamento da entrega: preparo, pronto, saiu, entregue (gravado no banco)', async () => {
  const c = cartao(page, pedidoA.codigo);
  for (const [botao, status] of [['Começar preparo', 'preparo'], ['Marcar pronto', 'pronto'], ['Saiu para entrega', 'saiu'], ['Marcar entregue', 'entregue']]) {
    await c.getByRole('button', { name: botao }).click();
    await page.waitForFunction(([cod, st]) => {
      const el = [...document.querySelectorAll('.pn-pedido')].find((x) => x.textContent.includes(cod));
      return !el || el.classList.contains(`is-${st}`);
    }, [pedidoA.codigo, status]);
    assert.equal(linhaPedido(pedidoA.codigo).status, status);
  }
  await c.waitFor({ state: 'detached' });   // saiu da lista "em andamento"
  await page.getByRole('button', { name: /Concluídos/ }).click();
  await cartao(page, pedidoA.codigo).locator('.pn-tag--entregue').waitFor();
  await page.getByRole('button', { name: 'Em andamento' }).click();
});

await teste('retirada pula "saiu para entrega"; pagamento confirmado e desfeito', async () => {
  const c = cartao(page, pedidoB.codigo);
  await c.getByRole('button', { name: 'Começar preparo' }).click();
  await c.getByRole('button', { name: 'Marcar pronto' }).waitFor();
  assert.equal(await page.title(), 'Painel · Modelo Burguer');   // mexeu: deixou de ser "novo"
  await c.getByRole('button', { name: 'Marcar pronto' }).click();
  await c.getByRole('button', { name: 'Cliente retirou' }).waitFor();
  assert.equal(await c.locator('select option[value="saiu"]').count(), 0);
  // Pix pendente: valor e nome em destaque para conferir no extrato do banco
  const total = linhaPedido(pedidoB.codigo).total;
  const quadro = (await c.locator('.pn-conferir-pix').innerText()).replace(/\u00a0/g, ' ');
  assert.ok(quadro.includes(`R$ ${(total / 100).toFixed(2).replace('.', ',')}`) && quadro.includes('Joana Prado'), quadro);
  assert.equal(await cartao(page, pedidoA.codigo).locator('.pn-conferir-pix').count(), 0);   // dinheiro: sem quadro
  if (process.env.FOTOS) {   // FOTOS=<pasta>: guarda o cartão no computador e no celular para conferir de olho
    await c.screenshot({ path: `${process.env.FOTOS}/painel-pix-1100.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await c.screenshot({ path: `${process.env.FOTOS}/painel-pix-390.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'rolagem lateral no celular');
    await page.setViewportSize({ width: 1100, height: 900 });
  }
  await c.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await c.getByRole('button', { name: 'Desfazer pagamento' }).waitFor();
  assert.equal(await c.locator('.pn-conferir-pix').count(), 0);
  assert.equal(linhaPedido(pedidoB.codigo).pagamento_status, 'confirmado');
  await c.getByRole('button', { name: 'Desfazer pagamento' }).click();
  await c.getByRole('button', { name: 'Confirmar pagamento' }).waitFor();
  assert.equal(linhaPedido(pedidoB.codigo).pagamento_status, 'pendente');
});

await teste('cancelar pelo seletor de status (com confirmação)', async () => {
  await cartao(page, pedidoB.codigo).locator('select[data-mudar]').selectOption('cancelado');
  await cartao(page, pedidoB.codigo).waitFor({ state: 'detached' });
  assert.equal(linhaPedido(pedidoB.codigo).status, 'cancelado');
});

await teste('mudança feita em outro aparelho aparece pelo tempo real', async () => {
  const c = novoPedido();
  emitir('INSERT', { id: linhaPedido(c.codigo).id });
  await cartao(page, c.codigo).waitFor();
  admin(`update public.pedidos set status = 'preparo' where codigo = '${c.codigo}'`);
  emitir('UPDATE', { id: linhaPedido(c.codigo).id, status: 'preparo' });
  await cartao(page, c.codigo).locator('.pn-tag--preparo').waitFor({ timeout: 5000 });
});

await teste('item esgotado e de volta (gravado no banco)', async () => {
  await page.getByRole('tab', { name: 'Cardápio' }).click();
  const chave = page.getByRole('switch', { name: /^X-Bacon:/ });
  await chave.click();
  await page.getByRole('switch', { name: 'X-Bacon: esgotado', exact: true }).waitFor();
  assert.equal(admin(`select disponivel from public.produtos where id = 'x-bacon'`), 'f');
  await page.getByRole('switch', { name: 'X-Bacon: esgotado', exact: true }).click();
  await page.getByRole('switch', { name: 'X-Bacon: disponível', exact: true }).waitFor();
  assert.equal(admin(`select disponivel from public.produtos where id = 'x-bacon'`), 't');
  await page.getByRole('tab', { name: /Pedidos/ }).click();
});

await teste('cozinha vê o preço, mas sem campo para mudar, e não tem a aba Loja', async () => {
  await page.getByRole('tab', { name: 'Cardápio' }).click();
  const linha = page.locator('.pn-prod', { hasText: 'X-Bacon' }).first();
  await linha.locator('.pn-prod-preco').waitFor();
  assert.equal(await page.locator('[data-preco]').count(), 0);
  assert.equal(await page.getByRole('tab', { name: 'Loja' }).count(), 0);
  await page.getByRole('tab', { name: /Pedidos/ }).click();
});

await teste('fechar e reabrir a loja (gravado no banco)', async () => {
  await page.getByRole('button', { name: 'Fechar agora' }).click();
  await page.locator('#pn-loja', { hasText: 'Loja fechada agora' }).waitFor();
  assert.equal(admin(`select aberta_manual from public.loja`), 'f');
  await page.getByRole('button', { name: 'Reabrir a loja' }).click();
  await page.locator('#pn-loja', { hasText: 'Loja aberta' }).waitFor();
  assert.equal(admin(`select aberta_manual from public.loja`), 't');
});

await teste('recarregar a página mantém a sessão; "Sair" apaga', async () => {
  await page.reload();
  await page.locator('#pn-loja', { hasText: 'Loja aberta' }).waitFor();
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.locator('#pn-login-erro', { hasText: 'Você saiu do painel.' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('modelo:painel:v1')), null);
  await page.reload();
  await page.locator('#pn-email').waitFor();
});

await teste('token perto de vencer é renovado uma vez só, mesmo com várias consultas juntas', async () => {
  auth.duracao = 30;   // menos que a margem de 1 min: a primeira consulta já renova
  const antes = auth.renovadas;
  await entrar(page);
  await page.locator('#pn-loja', { hasText: 'Loja aberta' }).waitFor();
  await page.locator('.pn-pedido').first().waitFor();
  auth.duracao = 3600;
  assert.ok(auth.renovadas > antes, 'não renovou');
  assert.equal(await page.locator('#pn-email').count(), 0);   // continua logado
});

await teste('sem tempo real: avisa e continua atualizando sozinho', async () => {
  const c2 = await novoContexto({ tempoReal: false });
  const p2 = await c2.newPage();
  vigiar(p2);
  await entrar(p2);
  await p2.locator('#pn-conexao', { hasText: 'Sem tempo real' }).waitFor({ timeout: 5000 });
  const novo = novoPedido();
  await cartao(p2, novo.codigo).waitFor({ timeout: 25000 });
  await c2.close();
});

// ---------- dono ----------
const ctxDono = await novoContexto();
const pd = await ctxDono.newPage();
vigiar(pd);
pd.on('dialog', (d) => d.accept());
const toast = (texto) => pd.locator('#toast', { hasText: texto }).waitFor();
const precoBacon = admin(`select preco from public.produtos where id = 'x-bacon'`);

await teste('dono entra e vê a aba Loja; muda o preço de um produto (Enter salva)', async () => {
  await entrar(pd, 'dono@teste', 'senha-do-dono-1');
  await pd.getByRole('tab', { name: 'Loja' }).waitFor();
  await pd.getByRole('tab', { name: 'Cardápio' }).click();
  const campo = pd.getByLabel('Preço de X-Bacon', { exact: true });
  await campo.fill('31,50');
  await campo.press('Enter');
  await toast('X-Bacon: R$ 31,50');
  assert.equal(admin(`select preco from public.produtos where id = 'x-bacon'`), '3150');
  assert.equal(await campo.inputValue(), '31,50');
});

await teste('preço inválido não vai para o banco e o campo volta ao valor salvo', async () => {
  const campo = pd.getByLabel('Preço de X-Bacon', { exact: true });
  await campo.fill('abc');
  await campo.press('Tab');
  await toast('Preço inválido');
  assert.equal(await campo.inputValue(), '31,50');
  assert.equal(admin(`select preco from public.produtos where id = 'x-bacon'`), '3150');
  admin(`update public.produtos set preco = ${precoBacon} where id = 'x-bacon'`);
});

await teste('dono muda o preço de uma opção (Fritas média)', async () => {
  await pd.getByText('Preços das opções de Fritas').click();
  const campo = pd.getByLabel('Preço a mais de Média 400 g (Tamanho, Fritas)', { exact: true });
  await campo.fill('11');
  await campo.press('Tab');
  await toast('Média 400 g: R$ 11,00');
  assert.equal(admin(`select o.preco from public.opcoes o join public.grupos_opcao g on g.id = o.grupo_id where g.produto_id = 'fritas' and o.chave = 'm'`), '1100');
  // esgotar outro item redesenha o cardápio: as opções continuam abertas
  await pd.getByRole('switch', { name: /^X-Salada:/ }).click();
  await pd.getByRole('switch', { name: 'X-Salada: esgotado', exact: true }).waitFor();
  assert.equal(await pd.locator('details[data-opcoes="fritas"]').getAttribute('open'), '');
  await pd.getByRole('switch', { name: 'X-Salada: esgotado', exact: true }).click();
  await pd.getByRole('switch', { name: 'X-Salada: disponível', exact: true }).waitFor();
  admin(`update public.opcoes o set preco = 1000 from public.grupos_opcao g where g.id = o.grupo_id and g.produto_id = 'fritas' and o.chave = 'm'`);
});

await teste('horários: tira um, põe outro e salva tudo no banco', async () => {
  await pd.getByRole('tab', { name: 'Loja' }).click();
  const form = pd.locator('#pn-form-horarios');
  await form.getByRole('button', { name: 'Remover horário 1 de Segunda' }).click();
  await form.locator('[data-dia="0"]', { hasText: 'Fechado' }).waitFor();
  await form.getByRole('button', { name: 'Adicionar horário em Domingo' }).click();
  const novas = form.locator('[data-dia="6"] .pn-faixa');
  assert.equal(await novas.count(), 2);
  await novas.nth(1).locator('[data-abre]').fill('18:00');
  await novas.nth(1).locator('[data-fecha]').fill('02:00');
  await form.getByRole('button', { name: 'Salvar horários' }).click();
  await toast('Horários salvos');
  assert.equal(admin(`select count(*) from public.horarios where dia = 1`), '0');
  assert.equal(admin(`select string_agg(abre || '-' || fecha, ',' order by abre) from public.horarios where dia = 7`), '00:00:00-23:59:00,18:00:00-02:00:00');
  admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha) select d, '00:00', '23:59:59' from generate_series(1, 7) d`);
});

await teste('horário igual na abertura e no fechamento: avisa e não salva', async () => {
  await pd.reload();
  await pd.getByRole('tab', { name: 'Loja' }).click();
  const faixa = pd.locator('#pn-form-horarios [data-dia="2"] .pn-faixa').first();
  await faixa.locator('[data-abre]').fill('10:00');
  await faixa.locator('[data-fecha]').fill('10:00');
  await pd.getByRole('button', { name: 'Salvar horários' }).click();
  await pd.locator('#pn-form-horarios [data-erro]', { hasText: 'Quarta: abre e fecha no mesmo horário' }).waitFor();
  assert.equal(admin(`select count(*) from public.horarios`), '7');
});

await teste('entrega: taxa por bairro com lista de bairros, salva no banco', async () => {
  const form = pd.locator('#pn-form-entrega');
  await form.getByLabel('Taxa por bairro').check();
  await form.getByRole('button', { name: '+ Bairro' }).click();
  await form.getByLabel('Nome do bairro 1', { exact: true }).fill('Centro');
  await form.getByLabel('Taxa do bairro 1', { exact: true }).fill('4,50');
  await form.getByRole('button', { name: '+ Bairro' }).click();
  await form.getByLabel('Nome do bairro 2', { exact: true }).fill('Vila Nova');
  await form.getByLabel('Taxa do bairro 2', { exact: true }).fill('8');
  await form.locator('[data-bairro-ativo]').nth(1).uncheck();
  await form.getByLabel('Tempo de entrega').fill('50 min');
  await form.getByRole('button', { name: 'Salvar entrega e retirada' }).click();
  await toast('Entrega e retirada salvas');
  assert.equal(admin(`select taxa_tipo || ' ' || entrega_tempo from public.loja`), 'bairro 50 min');
  assert.equal(admin(`select string_agg(nome || ':' || taxa || ':' || ativo, ',' order by nome) from public.bairros`), 'Centro:450:true,Vila Nova:800:false');
  // relido do banco depois de salvar
  assert.equal(await form.getByLabel('Nome do bairro 2', { exact: true }).inputValue(), 'Vila Nova');
});

await teste('entrega e retirada desligadas: o banco recusa e o painel mostra o motivo', async () => {
  const form = pd.locator('#pn-form-entrega');
  await form.getByLabel('Fazer entrega').uncheck();
  await form.getByLabel('Aceitar retirada').uncheck();
  await form.getByRole('button', { name: 'Salvar entrega e retirada' }).click();
  await form.locator('[data-erro]', { hasText: 'Deixe a entrega ou a retirada ligada' }).waitFor();
  assert.equal(admin(`select entrega_ativa and retirada_ativa from public.loja`), 't');
  admin(`update public.loja set taxa_tipo = 'fixa', entrega_tempo = '45 min'; delete from public.bairros`);
});

await teste('cozinha não salva preço nem horário nem pela API direta (o banco recusa)', async () => {
  // mesmo que alguém da cozinha mande a requisição na mão, com o próprio token
  const sessao = await page.evaluate(() => JSON.parse(localStorage.getItem('modelo:painel:v1') || 'null'));
  assert.ok(sessao?.access_token, 'cozinha deveria estar logada na outra aba');
  const preco = atender('PATCH', 'produtos?id=eq.x-bacon', JSON.stringify({ preco: 1 }), { token: sessao.access_token });
  assert.equal(preco.status, 403, preco.corpo);
  const hor = atender('POST', 'rpc/salvar_horarios', JSON.stringify({ faixas: [] }), { token: sessao.access_token });
  assert.equal(hor.status, 403, hor.corpo);
  assert.equal(admin(`select preco from public.produtos where id = 'x-bacon'`), precoBacon);
  await ctxDono.close();
});

// foto "tirada no celular": PNG retangular 1200 x 800, gerado no próprio navegador
const fotoCelular = (page) => page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 800;
  const g = c.getContext('2d');
  g.fillStyle = '#c0392b'; g.fillRect(0, 0, 1200, 800);
  g.fillStyle = '#f1c40f'; g.fillRect(400, 200, 400, 400);
  const b = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  return [...new Uint8Array(await b.arrayBuffer())];
});

await teste('dono cria produto novo com foto (reduzida para 640 x 640) e ele aparece no site', async () => {
  const ctx = await novoContexto();
  const page = await ctx.newPage();
  vigiar(page);
  await entrar(page, 'dono@teste', 'senha-do-dono-1');
  await page.getByRole('tab', { name: 'Cardápio' }).click();
  await page.getByRole('button', { name: '+ Produto novo' }).click();
  const f = page.locator('.pn-novo-produto form');
  await f.locator('[name=foto]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(await fotoCelular(page)) });
  assert.match(await f.locator('[data-previa]').getAttribute('src'), /^blob:/);
  // sem preço: avisa e não cria
  await f.locator('[name=nome]').fill('X-Picanha Especial');
  await f.locator('[name=categoria]').selectOption('hamburgueres');
  await f.getByRole('button', { name: 'Criar produto' }).click();
  await f.locator('[data-erro]', { hasText: 'Confira o preço' }).waitFor();
  await f.locator('[name=descricao]').fill('Pão brioche, picanha 180 g e queijo coalho.');
  await f.locator('[name=preco]').fill('39,90');
  await f.getByRole('button', { name: 'Criar produto' }).click();
  await page.locator('#toast', { hasText: 'X-Picanha Especial criado' }).waitFor({ timeout: 10000 });
  const linha = JSON.parse(admin(`select row_to_json(p) from public.produtos p where id = 'x-picanha-especial'`));
  assert.equal(linha.preco, 3990);
  assert.equal(linha.categoria_id, 'hamburgueres');
  assert.match(linha.imagem, /^x-picanha-especial\/[a-f0-9]{16}\.webp$/);
  const arq = arquivos.get(`produtos/${linha.imagem}`);
  assert.equal(arq.tipo, 'image/webp');
  assert.ok(arq.dados.length < 60_000, `foto pesada: ${arq.dados.length} bytes`);
  const lado = await page.evaluate(async (b) => (await createImageBitmap(new Blob([new Uint8Array(b)], { type: 'image/webp' }))).width, [...arq.dados]);
  assert.equal(lado, 640);
  // o site mostra o produto novo com a foto do Storage
  const site = await ctx.newPage();
  vigiar(site);
  await site.goto(`${servidor.url}#cardapio`);
  const card = site.locator('article.prod', { hasText: 'X-Picanha Especial' });
  await card.waitFor({ timeout: 8000 });
  assert.match(await card.innerText(), /39,90/);
  assert.equal(await card.locator('img').getAttribute('src'), `${SUPA}/storage/v1/object/public/produtos/${linha.imagem}`);
  await site.waitForFunction(() => [...document.querySelectorAll('article.prod img')].some((i) => i.src.includes('/storage/') && i.naturalWidth === 640));
  if (process.env.FOTOS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${process.env.FOTOS}/painel-produto-novo-390.png` });
  }
  await ctx.close();
});

await teste('dono troca a foto (a antiga sai do Storage), muda descrição e tira do cardápio', async () => {
  const ctx = await novoContexto();
  const page = await ctx.newPage();
  vigiar(page);
  await entrar(page, 'dono@teste', 'senha-do-dono-1');
  await page.getByRole('tab', { name: 'Cardápio' }).click();
  const antes = admin(`select imagem from public.produtos where id = 'x-picanha-especial'`);
  const ed = page.locator('details[data-editar="x-picanha-especial"]');
  await ed.locator('summary').click();
  await ed.locator('[name=foto]').setInputFiles({ name: 'nova.png', mimeType: 'image/png', buffer: Buffer.from(await fotoCelular(page)) });
  await ed.locator('[name=descricao]').fill('Picanha 200 g.');
  await ed.getByRole('button', { name: 'Salvar' }).click();
  await page.locator('#toast', { hasText: 'salvo' }).waitFor({ timeout: 10000 });
  const depois = JSON.parse(admin(`select row_to_json(p) from public.produtos p where id = 'x-picanha-especial'`));
  assert.notEqual(depois.imagem, antes);
  assert.equal(depois.descricao, 'Picanha 200 g.');
  assert.ok(arquivos.has(`produtos/${depois.imagem}`));
  // a foto antiga é apagada sem esperar (não trava a tela): dá um tempo para o pedido chegar
  for (let i = 0; i < 20 && arquivos.has(`produtos/${antes}`); i++) await page.waitForTimeout(100);
  assert.equal(arquivos.has(`produtos/${antes}`), false, 'foto antiga continuou no Storage');
  // tirar do cardápio
  const ed2 = page.locator('details[data-editar="x-picanha-especial"]');
  await ed2.locator('summary').click();
  await ed2.locator('[name=ativo]').uncheck();
  await ed2.getByRole('button', { name: 'Salvar' }).click();
  await page.locator('.pn-prod', { hasText: 'X-Picanha Especial' }).filter({ hasText: 'fora do cardápio' }).waitFor({ timeout: 10000 });
  assert.equal(admin(`select ativo from public.produtos where id = 'x-picanha-especial'`), 'f');
  await ctx.close();
});

await teste('cozinha não vê "Produto novo"/"Editar" e o banco recusa produto e foto dela', async () => {
  const ctx = await novoContexto();
  const page = await ctx.newPage();
  vigiar(page);
  await entrar(page);
  await page.getByRole('tab', { name: 'Cardápio' }).click();
  await page.locator('.pn-prod').first().waitFor();
  assert.equal(await page.locator('[data-novo-produto], details[data-editar]').count(), 0);
  const tk = await page.evaluate(() => JSON.parse(localStorage.getItem('modelo:painel:v1')).access_token);
  const r = atender('POST', 'produtos', JSON.stringify({ id: 'invasor', categoria_id: 'bebidas', nome: 'Invasor', preco: 1 }), { token: tk });
  assert.ok(r.status === 403 || r.status === 401, `cozinha criou produto: ${r.status}`);
  const r2 = atender('PATCH', 'produtos?id=eq.x-tudo', JSON.stringify({ nome: 'Hackeado' }), { token: tk });
  assert.equal(r2.status, 403, r2.corpo);
  assert.equal(atenderStorage('POST', 'object/produtos/x-tudo/abcdefgh1234.webp', { headers: () => ({}), postDataBuffer: () => Buffer.from('x') }, tk).status, 400);
  admin(`delete from public.produtos where id = 'x-picanha-especial'`);
  await ctx.close();
});

await teste('nenhum erro no console', async () => {
  assert.deepEqual(erros, []);
});

await navegador.close();
servidor.fechar();
console.log(`\n${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) process.exit(1);
