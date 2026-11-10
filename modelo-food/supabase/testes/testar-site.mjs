// Teste de ponta a ponta: o site de verdade no Chromium (Playwright), com CONFIG.api ligado
// e as chamadas ao Supabase respondidas pelo schema.sql num Postgres local (postgrest-falso.mjs).
// Rode DEPOIS do testar-banco.mjs (ele cria o banco). Uso:
//   PGHOST=/tmp PGPORT=5499 PGUSER=postgres PGDATABASE=teste_supabase node supabase/testes/testar-site.mjs

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sql, atender } from './postgrest-falso.mjs';
import { servirSite, SUPA } from './servidor.mjs';

process.env.PGDATABASE ||= 'teste_supabase';
const { chromium } = createRequire(import.meta.url)('playwright');
const admin = (c) => {
  const r = sql(c, { papel: 'postgres' });
  if (!r.ok) throw new Error(`${r.code} ${r.message}`);
  return r.saida;
};

const servidor = await servirSite();
const SITE = servidor.url;

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

let n = 1;
async function novoContexto() {
  const ctx = await navegador.newContext({ serviceWorkers: 'block', locale: 'pt-BR', viewport: { width: 390, height: 844 } });
  const ip = `203.0.113.${n++}`;
  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request();
    const r = atender(req.method(), req.url().slice(`${SUPA}/rest/v1/`.length), req.postData(), { ip });
    await route.fulfill({ status: r.status, body: r.corpo, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'whatsapp', contentType: 'text/plain' }));
  return ctx;
}

const erros = [];
const vigiar = (page) => {
  page.on('pageerror', (e) => erros.push(String(e)));
  // o 400 da recusa "os preços mudaram" (de propósito) aparece como erro de rede no console: não conta
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 400/.test(m.text())) erros.push(m.text()); });
};

// estado do banco para o teste: loja aberta o dia todo, preço do X-Burger mudado, X-Bacon esgotado
admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha) select d, '00:00', '23:59:59' from generate_series(1, 7) d;
  update public.produtos set preco = 1990 where id = 'x-burger'; update public.produtos set disponivel = false where id = 'x-bacon';
  update public.loja set aberta_manual = true, bloquear_fechado = true`);

console.log('Site com Supabase:');
const ctx = await novoContexto();
const page = await ctx.newPage();
vigiar(page);
let codigo;
let link;

await teste('cardápio vem do banco (preço novo e item esgotado)', async () => {
  await page.goto(`${SITE}#cardapio`);
  const burger = page.locator('article.prod', { hasText: 'X-Burger' }).first();
  await burger.waitFor();
  assert.match(await burger.innerText(), /19,90/);
  const bacon = page.locator('article.prod', { hasText: 'X-Bacon' }).first();
  assert.match(await bacon.getAttribute('class'), /is-esgotado/);
});

await teste('pedido confirmado é registrado no banco com o preço do banco', async () => {
  await page.evaluate(() => localStorage.setItem('modelo:carrinho:v1', JSON.stringify([
    { produtoId: 'x-tudo', escolhas: {}, remover: ['Cebola'], obs: '', qtd: 1 },
    { produtoId: 'fritas', escolhas: { tamanho: ['m'] }, remover: [], obs: '', qtd: 1 },
  ])));
  await page.goto(`${SITE}#finalizar`);
  await page.reload();
  await page.locator('#f-nome').waitFor();
  // o preço muda no banco depois que o cliente abriu a página: o banco recusa o total antigo,
  // o site busca o cardápio de novo e o cliente confirma o total novo
  admin(`update public.produtos set preco = 3000 where id = 'x-tudo'`);
  await page.locator('input[name="modo"][value="entrega"]').check();
  await page.fill('#f-nome', 'Cliente Teste');
  await page.fill('#f-telefone', '33988776655');
  await page.fill('#f-cep', '39800000');
  await page.fill('#f-cidade', 'Teófilo Otoni');
  await page.fill('#f-endereco', 'Rua das Flores');
  await page.fill('#f-numero', '42');
  await page.fill('#f-bairro', 'Centro');
  await page.locator('input[name="pagamento"][value="pix"]').check();
  await page.waitForTimeout(3200);   // a trava anti-robô recusa formulário preenchido em menos de 3 s
  // na tela ainda está o total antigo (X-Tudo 28,00): o banco recusa e o site mostra o novo
  assert.match(await page.locator('.btn-enviar').innerText(), /55,00/);
  await page.click('.btn-enviar');
  await page.locator('#erro-geral', { hasText: /Os preços mudaram.*Novo total: R\$\s57,00/ }).waitFor({ timeout: 10000 });
  assert.match(await page.locator('.btn-enviar').innerText(), /Confirmar pedido · R\$\s57,00/);
  assert.match(await page.locator('.comanda').innerText(), /30,00/);
  assert.equal(admin(`select count(*) from public.pedidos where cliente_nome = 'Cliente Teste'`), '0');
  await page.click('.btn-enviar');
  await page.getByRole('heading', { name: 'Pedido registrado na loja' }).waitFor({ timeout: 10000 });
  codigo = (await page.locator('#codigo-txt').innerText()).trim();
  assert.match(codigo, /^MO-[A-Z0-9]{5}$/);
  const linha = JSON.parse(admin(`select row_to_json(p) from public.pedidos p where codigo = '${codigo}'`));
  // X-Tudo 30,00 (preço novo) + Fritas média 22,00 + taxa 5,00
  assert.equal(linha.total, 5700);
  assert.equal(linha.cliente_nome, 'Cliente Teste');
  assert.match(await page.locator('#pix-h').innerText(), /57,00/);
  assert.match(await page.locator('.etapa.is-atual').innerText(), /Pedido recebido/);
  // FOTOS=<pasta> guarda a tela para conferir de olho (celular, 390 px)
  if (process.env.FOTOS) await page.screenshot({ path: `${process.env.FOTOS}/site-pedido-pix.png`, fullPage: true });
  // com o banco ligado o WhatsApp não abre sozinho: vira botão opcional; o cliente fica na tela do Pix
  assert.equal(ctx.pages().length, 1, 'abriu uma aba nova ao confirmar');
  link = await page.evaluate(() => document.querySelector('[data-zap-opcional]')?.href || '');
  assert.match(decodeURIComponent(link), /Total: R\$\s57,00/);
});

await teste('"Atualizar status" mostra a etapa que a loja marcou', async () => {
  admin(`update public.pedidos set status = 'pronto' where codigo = '${codigo}'`);
  await page.click('[data-atualizar]');
  await page.locator('.etapa.is-atual', { hasText: 'Pronto' }).waitFor({ timeout: 5000 });
});

await teste('tela do pedido se atualiza sozinha; para com a aba escondida e quando o pedido termina', async () => {
  let consultas = 0;
  page.on('request', (r) => { if (r.url().includes('rpc/acompanhar_pedido')) consultas++; });
  const esconder = (sim) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, sim);
  // a lista de itens aberta continua aberta depois da atualização
  await page.locator('.status-itens summary').click();
  admin(`update public.pedidos set status = 'saiu', pagamento_status = 'confirmado' where codigo = '${codigo}'`);
  await page.locator('.etapa.is-atual', { hasText: 'Saiu para entrega' }).waitFor({ timeout: 20000 });
  await page.locator('#toast', { hasText: /Saiu para entrega · pagamento confirmado/ }).waitFor({ timeout: 3000 });
  assert.equal(await page.locator('.status-itens').getAttribute('open'), '');
  assert.match(await page.locator('.status-pag').last().innerText(), /confirmado pela loja/);
  // aba escondida: nenhuma consulta
  await esconder(true);
  const antes = consultas;
  await page.waitForTimeout(17000);
  assert.equal(consultas, antes, 'consultou com a aba escondida');
  // voltou: confere na hora
  admin(`update public.pedidos set status = 'entregue' where codigo = '${codigo}'`);
  await esconder(false);
  await page.locator('.etapa.is-atual', { hasText: 'Entregue' }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator('.status-auto').count(), 0);
  // terminou: para de consultar
  const depois = consultas;
  await page.waitForTimeout(17000);
  assert.equal(consultas, depois, 'continuou consultando pedido entregue');
});

await teste('link de acompanhamento abre o pedido em outro aparelho', async () => {
  const token = admin(`select a.token from public.pedidos_acesso a join public.pedidos p on p.id = a.pedido_id where p.codigo = '${codigo}'`);
  const outro = await novoContexto();
  const p2 = await outro.newPage();
  vigiar(p2);
  await p2.goto(`${SITE}#pedido?c=${codigo}&t=${token}`);
  await p2.locator('.status-codigo', { hasText: codigo }).waitFor({ timeout: 5000 });
  assert.match(await p2.locator('.etapa.is-atual').innerText(), /Entregue/);
  await p2.goto(`${SITE}#pedido?c=${codigo}&t=${'B'.repeat(32)}`);
  await p2.reload();
  await p2.getByText(/não encontr/i).first().waitFor({ timeout: 5000 });
  await outro.close();
});

await teste('loja fechada pelo banco: site avisa e não deixa finalizar', async () => {
  admin(`update public.loja set aberta_manual = false`);
  const c3 = await novoContexto();
  const p3 = await c3.newPage();
  vigiar(p3);
  await p3.goto(SITE);
  await p3.evaluate(() => localStorage.setItem('modelo:carrinho:v1', JSON.stringify([{ produtoId: 'x-tudo', escolhas: {}, remover: [], obs: '', qtd: 1 }])));
  await p3.goto(`${SITE}#finalizar`);
  await p3.reload();
  await p3.getByRole('heading', { name: 'Loja fechada' }).waitFor({ timeout: 5000 });
  admin(`update public.loja set aberta_manual = true`);
  await c3.close();
});

await teste('taxa do bairro muda com a página aberta: lista e total novos, bairro continua escolhido', async () => {
  admin(`update public.loja set taxa_tipo = 'bairro'; delete from public.bairros; insert into public.bairros (nome, taxa) values ('Centro', 400), ('Vila Nova', 900)`);
  const c4 = await novoContexto();
  const p4 = await c4.newPage();
  vigiar(p4);
  await p4.goto(SITE);
  await p4.evaluate(() => localStorage.setItem('modelo:carrinho:v1', JSON.stringify([{ produtoId: 'x-tudo', escolhas: {}, remover: [], obs: '', qtd: 1 }])));
  await p4.goto(`${SITE}#finalizar`);
  await p4.reload();
  await p4.locator('input[name="modo"][value="entrega"]').check();
  await p4.selectOption('#f-bairro', 'Centro');
  admin(`update public.bairros set taxa = 700 where nome = 'Centro'`);
  await p4.fill('#f-nome', 'Bia Costa');
  await p4.fill('#f-telefone', '33988771122');
  await p4.fill('#f-cep', '39800000');
  await p4.fill('#f-cidade', 'Teófilo Otoni');
  await p4.fill('#f-endereco', 'Rua B');
  await p4.fill('#f-numero', '5');
  await p4.locator('input[name="pagamento"][value="pix"]').check();
  await p4.waitForTimeout(3200);
  await p4.click('.btn-enviar');
  await p4.locator('#erro-geral', { hasText: /Os preços mudaram.*Novo total: R\$\s37,00/ }).waitFor({ timeout: 10000 });
  assert.equal(await p4.locator('#f-bairro').inputValue(), 'Centro');
  assert.match(await p4.locator('#f-bairro option[value="Centro"]').innerText(), /7,00/);
  await p4.click('.btn-enviar');
  await p4.getByRole('heading', { name: 'Pedido registrado na loja' }).waitFor({ timeout: 10000 });
  assert.equal(admin(`select taxa || ' ' || total from public.pedidos where cliente_nome = 'Bia Costa'`), '700 3700');
  admin(`update public.loja set taxa_tipo = 'fixa'; delete from public.bairros`);
  await c4.close();
});

await teste('sistema fora do ar ao confirmar: o pedido pode ir só pelo WhatsApp (e a loja é avisada)', async () => {
  const c5 = await novoContexto();
  const p5 = await c5.newPage();
  p5.on('pageerror', (e) => erros.push(String(e)));   // o 503 de propósito aparece no console: não conta
  await p5.goto(SITE);
  // rodapé: razão social e endereço (Decreto 7.962); o CNPJ provisório do modelo não aparece
  const empresa = await p5.locator('[data-empresa]').innerText();
  assert.match(empresa, /Modelo Burguer/);
  assert.doesNotMatch(empresa, /xx\./);
  await p5.evaluate(() => localStorage.setItem('modelo:carrinho:v1', JSON.stringify([{ produtoId: 'x-tudo', escolhas: {}, remover: [], obs: '', qtd: 1 }])));
  await p5.goto(`${SITE}#finalizar`);
  await p5.reload();
  await p5.locator('#f-nome').waitFor();
  // a partir daqui o banco "cai" (projeto pausado / fora do ar)
  await c5.route(`${SUPA}/rest/v1/rpc/criar_pedido`, (route) => route.fulfill({ status: 503, body: '{}', contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await p5.locator('input[name="modo"][value="retirada"]').check();
  await p5.fill('#f-nome', 'Caio Prado');
  await p5.fill('#f-telefone', '33988775544');
  await p5.locator('input[name="pagamento"][value="dinheiro"]').check();
  await p5.waitForTimeout(3200);
  await p5.click('.btn-enviar');
  const botao = p5.locator('#erro-geral [data-so-zap]');
  await botao.waitFor({ timeout: 10000 });
  const [zap] = await Promise.all([c5.waitForEvent('page'), botao.click()]);
  const texto = decodeURIComponent(zap.url());
  assert.match(texto, /^https:\/\/wa\.me\//);
  assert.match(texto, /sistema de pedidos estava fora do ar/);
  assert.match(texto, /Caio Prado/);
  await p5.getByRole('heading', { name: 'Falta só enviar pelo WhatsApp' }).waitFor({ timeout: 5000 });
  assert.equal(await p5.locator('[data-atualizar]').count(), 0);
  assert.equal(await p5.locator('#cart-count').isHidden(), true);
  assert.equal(admin(`select count(*) from public.pedidos where cliente_nome = 'Caio Prado'`), '0');
  await c5.close();
});

await teste('celular com o navegador do Instagram (iPhone): pedido inteiro, Pix copiável, sem sair da página', async () => {
  const { devices } = createRequire(import.meta.url)('playwright');
  const iphone = devices['iPhone 13'];
  const c6 = await navegador.newContext({
    ...iphone, serviceWorkers: 'block', locale: 'pt-BR', permissions: ['clipboard-read', 'clipboard-write'],
    // navegador embutido do Instagram no iPhone
    userAgent: `${iphone.userAgent} Instagram 350.0.0.0 (iPhone14,5; iOS 17_5; pt_BR; pt-BR; scale=3.00; 1170x2532; 0)`,
  });
  await c6.route(`${SUPA}/**`, async (route) => {
    const req = route.request();
    const r = atender(req.method(), req.url().slice(`${SUPA}/rest/v1/`.length), req.postData(), { ip: '203.0.113.200' });
    await route.fulfill({ status: r.status, body: r.corpo, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const p6 = await c6.newPage();
  vigiar(p6);
  await p6.goto(`${SITE}#cardapio`);
  // toque no "+" do X-Tudo (sem opções obrigatórias: vai direto para o carrinho)
  await p6.locator('[data-add="x-tudo"]').tap();
  await p6.locator('#cart-count', { hasText: '1' }).waitFor();
  await p6.locator('#cart-link').tap();
  await p6.locator('.comanda a[href="#finalizar"]').tap();
  await p6.locator('#f-nome').waitFor();
  assert.equal(await p6.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'rolagem para o lado');
  assert.equal(await p6.locator('#f-telefone').getAttribute('inputmode'), 'tel');
  await p6.locator('input[name="modo"][value="retirada"]').check();
  await p6.fill('#f-nome', 'Lia Mendes');
  await p6.fill('#f-telefone', '33988770011');
  await p6.locator('input[name="pagamento"][value="pix"]').check();
  await p6.waitForTimeout(3200);
  await p6.locator('.btn-enviar').tap();
  await p6.getByRole('heading', { name: 'Pedido registrado na loja' }).waitFor({ timeout: 10000 });
  assert.equal(c6.pages().length, 1, 'saiu da página do Pix');
  await p6.locator('[data-copiar-pix]').tap();
  await p6.locator('#toast', { hasText: /Código Pix copiado|Código selecionado/ }).waitFor();
  assert.match(await p6.locator('#pix-txt').inputValue(), /^000201.*br\.gov\.bcb\.pix.*6304[0-9A-F]{4}$/);
  if (process.env.FOTOS) await p6.screenshot({ path: `${process.env.FOTOS}/site-instagram-iphone.png`, fullPage: true });
  await c6.close();
});

await teste('nenhum erro no console', async () => {
  assert.deepEqual(erros, []);
});

await navegador.close();
servidor.fechar();
console.log(`\n${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) process.exit(1);
