// Testa supabase/schema.sql + cardapio.sql junto com js/services/api.js e cardapio.js.
// Precisa de um Postgres local (ver PENDENCIAS.md). Recria o banco do zero a cada execução.
// Uso: PGHOST=/tmp PGPORT=5499 PGUSER=postgres PGDATABASE=teste_supabase node supabase/testes/testar-banco.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sql, fetchFalso } from './postgrest-falso.mjs';
import { CONFIG } from '../../js/config.js';
import { PRODUTOS, CATEGORIAS, PRODUTOS_BASE } from '../../js/products.js';
import { criarPedido, consultarPedido, rpc, paraServidor } from '../../js/services/api.js';
import { buscarDoBanco, aplicarDoBanco } from '../../js/services/cardapio.js';

const pasta = (f) => fileURLToPath(new URL(f, import.meta.url));
const banco = process.env.PGDATABASE || 'teste_supabase';
process.env.PGDATABASE = banco;

function psqlArquivo(...arquivos) {
  for (const a of arquivos) {
    const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', pasta(a)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${a}: ${r.stderr}`);
  }
}
function recriar() {
  const r = spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${banco}`, '-c', `create database ${banco}`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  psqlArquivo('./supabase-falso.sql', '../schema.sql', '../cardapio.sql');
  // o teste roda a qualquer hora: loja aberta o dia inteiro
  admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha) select d, '00:00', '23:59:59' from generate_series(1, 7) d`);
}
const admin = (c) => {
  const r = sql(c, { papel: 'postgres' });
  if (!r.ok) throw new Error(`${r.code} ${r.message}\n${c}`);
  return r.saida;
};

let ok = 0;
const falhas = [];
async function teste(nome, fn) {
  try {
    await fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(nome);
    console.log(`  FALHOU  ${nome}\n        ${String(e.stack || e).split('\n').slice(0, 4).join('\n        ')}`);
  }
}

CONFIG.api = { supabaseUrl: 'https://teste.supabase.co', chavePublica: 'sb_publishable_teste' };
CONFIG.modoDemonstracao = false;
let ipN = 1;
// cada pedido sai de um "IP" diferente, para o limite por IP não atrapalhar os outros testes
const f = () => fetchFalso({ ip: `198.51.100.${ipN++}` });
let telN = 0;
const telefone = () => `(33) 9${String(88000000 + telN++).padStart(8, '0')}`;

const pedidoBase = (extra = {}) => ({
  cliente: { nome: 'Maria Teste', telefone: telefone() },
  recebimento: { modo: 'entrega', bairro: null, nome: 'Entrega', tempo: '45 min', local: null },
  entrega: { cep: '39800-000', cidade: 'Teófilo Otoni', endereco: 'Rua A', numero: '10', complemento: '', bairro: 'Centro' },
  pagamento: { forma: 'pix', nome: 'Pix', trocoPara: null },
  obs: '',
  itens: [
    { produtoId: 'x-tudo', qtd: 2, escolhasIds: {}, remover: ['Cebola'], obs: 'bem passado', precoUnitario: 1 },
    { produtoId: 'fritas', qtd: 1, escolhasIds: { tamanho: ['m'] }, remover: [], obs: '', precoUnitario: 1 },
  ],
  ...extra,
});
const dados = (extra = {}) => paraServidor(pedidoBase(extra));
const chamar = (d, chave = crypto.randomUUID()) => rpc('criar_pedido', { dados: d, chave }, { fetchFn: f() });
const recusa = async (d, trecho) => {
  await assert.rejects(chamar(d), (e) => {
    assert.match(e.message, trecho);
    return true;
  });
};

recriar();
console.log('Banco:');

await teste('cardápio e loja vêm do banco no formato do site', async () => {
  const lido = await buscarDoBanco(CONFIG.api, { fetchFn: f() });
  const CONF = structuredClone(CONFIG);
  const PROD = [];
  const CATS = [];
  const usado = aplicarDoBanco(lido, { CONFIG: CONF, PRODUTOS: PROD, CATEGORIAS: CATS, reserva: PRODUTOS_BASE });
  assert.deepEqual(usado, { cardapio: true, loja: true });
  assert.equal(PROD.length, PRODUTOS.length);
  assert.deepEqual(CATS.map((c) => c.id), CATEGORIAS.map((c) => c.id));
  const fritas = PROD.find((p) => p.id === 'fritas');
  assert.deepEqual(fritas.opcoes[0].escolhas.map((e) => [e.id, e.preco]), [['p', 0], ['m', 1000]]);
  assert.equal(CONF.entrega.taxa.valor, 500);
  assert.equal(CONF.marca.prefixoPedido, 'MO');
  assert.equal(CONF.horario.semana.seg.length, 1);
});

let criado;
await teste('schema.sql roda de novo por cima sem erro e sem apagar nada', async () => {
  const antes = admin(`select count(*) from public.produtos`);
  psqlArquivo('../schema.sql');
  assert.equal(admin(`select count(*) from public.produtos`), antes);
});

await teste('criar_pedido calcula preço, taxa e total no banco (o navegador não manda preço)', async () => {
  const p = pedidoBase();
  criado = await criarPedido(p, { fetchFn: f() });
  assert.match(criado.codigo, /^MO-[A-Z0-9]{5}$/);
  assert.match(criado.token, /^[A-Za-z0-9]{32}$/);
  // X-Tudo 28,00 x2 + Fritas média (12,00 + 10,00) = 78,00 + taxa 5,00
  assert.deepEqual(criado.totais, { subtotal: 7800, desconto: 0, taxa: 500, total: 8300 });
  assert.equal(criado.itens[0].precoUnitario, 2800);
  assert.deepEqual(criado.itens[0].escolhas, ['Sem cebola']);
  assert.deepEqual(criado.itens[1].escolhas, ['Média 400 g']);
  assert.equal(criado.status, 'recebido');
  assert.equal(criado.cliente.nome, 'Maria Teste');   // dado local, para a mensagem do WhatsApp
  const linha = JSON.parse(admin(`select row_to_json(p) from public.pedidos p where codigo = '${criado.codigo}'`));
  assert.equal(linha.total, 8300);
  assert.equal(linha.cliente_telefone.length, 11);
});

await teste('total que o cliente viu: igual passa; diferente recusa com hint "precos"', async () => {
  assert.equal(paraServidor(pedidoBase({ totais: { total: 8300 } })).totalEsperado, 8300);
  assert.equal(paraServidor(pedidoBase({ totais: { total: 1.5 } })).totalEsperado, undefined);
  const r = await chamar(dados({ totais: { total: 8300 } }));
  assert.equal(r.total, 8300);
  await assert.rejects(chamar(dados({ totais: { total: 8200 } })), (e) => {
    assert.match(e.message, /Os preços mudaram/);
    assert.equal(e.motivo, 'precos');
    return true;
  });
  await recusa({ ...dados(), totalEsperado: '8300' }, /Pedido inválido/);
  await recusa({ ...dados(), totalEsperado: -1 }, /Pedido inválido/);
  // preço mudou no banco: o total antigo deixa de valer
  admin(`update public.produtos set preco = 2900 where id = 'x-tudo'`);
  await recusa(dados({ totais: { total: 8300 } }), /Os preços mudaram/);
  assert.equal((await chamar(dados({ totais: { total: 8500 } }))).total, 8500);
  admin(`update public.produtos set preco = 2800 where id = 'x-tudo'`);
});

await teste('mesma chave de envio devolve o mesmo pedido (sem duplicar)', async () => {
  const chave = crypto.randomUUID();
  const d = dados();
  const a = await chamar(d, chave);
  const b = await chamar(d, chave);
  assert.equal(a.codigo, b.codigo);
  assert.equal(a.token, b.token);
  assert.equal(admin(`select count(*) from public.pedidos where codigo = '${a.codigo}'`), '1');
});

await teste('acompanhar_pedido: código + token certos acham; token errado não', async () => {
  const r = await consultarPedido(criado.codigo, '', { token: criado.token, fetchFn: f() });
  assert.equal(r.pedido.codigo, criado.codigo);
  assert.equal(r.pedido.totais.total, 8300);
  const errado = await consultarPedido(criado.codigo, '', { token: 'A'.repeat(32), fetchFn: f() });
  assert.equal(errado.erro, 'nao-encontrado');
  const minusculo = await rpc('acompanhar_pedido', { codigo: criado.codigo.toLowerCase(), token: criado.token }, { fetchFn: f() });
  assert.equal(minusculo.codigo, criado.codigo);
  // o acompanhamento não devolve dados pessoais
  assert.equal(JSON.stringify(minusculo).includes('Maria'), false);
  admin(`update public.pedidos set status = 'preparo' where codigo = '${criado.codigo}'`);
  const depois = await consultarPedido(criado.codigo, '', { token: criado.token, fetchFn: f() });
  assert.equal(depois.pedido.status, 'preparo');
});

await teste('retirada: sem taxa e sem endereço', async () => {
  const r = await chamar(dados({ recebimento: { modo: 'retirada' }, entrega: null }));
  assert.equal(r.taxa, 0);
  assert.equal(r.total, 7800);
  assert.equal(r.modo, 'retirada');
});

await teste('troco: aceito acima do total, recusado abaixo', async () => {
  const r = await chamar(dados({ pagamento: { forma: 'dinheiro', trocoPara: 10000 } }));
  assert.equal(r.trocoPara, 10000);
  await recusa(dados({ pagamento: { forma: 'dinheiro', trocoPara: 8000 } }), /troco.*maior que o total \(R\$ 83,00\)/);
});

await teste('regras recusadas com mensagem para o cliente', async () => {
  const item = (i) => dados({ itens: [i] });
  await recusa(item({ produtoId: 'nao-existe', qtd: 1 }), /saiu do cardápio/);
  await recusa(item({ produtoId: 'x-tudo', qtd: 0 }), /Quantidade inválida/);
  await recusa(item({ produtoId: 'x-tudo', qtd: 21 }), /Quantidade inválida/);
  await recusa(item({ produtoId: 'x-tudo', qtd: 1.5 }), /Quantidade inválida/);
  await recusa(item({ produtoId: 'x-tudo', qtd: '2' }), /Quantidade inválida/);
  await recusa(item({ produtoId: 'x-tudo', qtd: 1, remover: ['Picanha'] }), /ingredientes de X-Tudo mudaram/);
  await recusa(item({ produtoId: 'fritas', qtd: 2, escolhasIds: {} }), /Escolha tamanho: Fritas/);
  await recusa(item({ produtoId: 'fritas', qtd: 2, escolhasIds: { tamanho: ['p', 'm'] } }), /só uma opção/);
  await recusa(item({ produtoId: 'fritas', qtd: 2, escolhasIds: { tamanho: ['g'] } }), /opções de Fritas mudaram/);
  await recusa(item({ produtoId: 'fritas', qtd: 2, escolhasIds: { tamanho: ['m'], extra: ['x'] } }), /opções de Fritas mudaram/);
  await recusa(item({ produtoId: 'molho-ketchup', qtd: 1 }), /pedido mínimo é R\$ 20,00/);
  await recusa(dados({ itens: [] }), /carrinho está vazio/);
  await recusa(dados({ cliente: { nome: 'Maria', telefone: telefone() } }), /nome e sobrenome/);
  await recusa(dados({ cliente: { nome: 'Maria Teste', telefone: '123' } }), /telefone com DDD/);
  await recusa(dados({ cliente: { nome: 'Maria Teste', telefone: telefone(), email: 'x@' } }), /e-mail válido/);
  await recusa(dados({ pagamento: { forma: 'cheque' } }), /como vai pagar/);
  await recusa(dados({ recebimento: { modo: 'drone' } }), /entrega ou retirada/);
  await recusa(dados({ entrega: { cep: '1', cidade: 'X', endereco: 'Rua', numero: '1', bairro: 'Centro' } }), /CEP tem 8/);
  await recusa(dados({ cupom: 'GRATIS' }), /Cupons ainda não/);
  await recusa(dados({ obs: 'x'.repeat(241) }), /tamanho máximo/);
});

await teste('item esgotado e produto oculto são recusados', async () => {
  admin(`update public.produtos set disponivel = false where id = 'x-tudo'`);
  await recusa(dados(), /Item esgotado: X-Tudo/);
  admin(`update public.produtos set disponivel = true, ativo = false where id = 'x-tudo'`);
  await recusa(dados(), /saiu do cardápio/);
  admin(`update public.produtos set ativo = true where id = 'x-tudo'`);
});

await teste('loja fechada recusa (botão e horário); bloquear_fechado = false deixa passar', async () => {
  admin(`update public.loja set aberta_manual = false`);
  await recusa(dados(), /fechados no momento/);
  admin(`update public.loja set bloquear_fechado = false`);
  await chamar(dados());
  admin(`update public.loja set aberta_manual = true, bloquear_fechado = true`);
});

await teste('horário no fuso da loja, com faixa que passa da meia-noite', async () => {
  const salvo = admin(`select json_agg(h) from public.horarios h`);
  admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha) values (4, '11:00', '23:00'), (5, '18:00', '02:00')`);
  const aberta = (utc) => admin(`select public._loja_aberta('${utc}+00')`);
  // 2026-10-29 é quinta (dia 4). Brasília = UTC-3
  assert.equal(aberta('2026-10-29 13:59'), 'f');   // 10h59
  assert.equal(aberta('2026-10-29 14:00'), 't');   // 11h
  assert.equal(aberta('2026-10-30 01:59'), 't');   // 22h59 de quinta
  assert.equal(aberta('2026-10-30 02:00'), 'f');   // 23h
  assert.equal(aberta('2026-10-30 21:00'), 't');   // sexta 18h
  assert.equal(aberta('2026-10-31 04:59'), 't');   // sábado 1h59 (vem da sexta)
  assert.equal(aberta('2026-10-31 05:00'), 'f');   // sábado 2h
  admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha)
    select (x->>'dia')::int, (x->>'abre')::time, (x->>'fecha')::time from json_array_elements('${salvo}') x`);
});

await teste('taxa por bairro: só bairro da lista, com a taxa do banco', async () => {
  admin(`update public.loja set taxa_tipo = 'bairro'; insert into public.bairros (nome, taxa) values ('Centro', 400), ('Vila Nova', 900)`);
  const r = await chamar(dados({ recebimento: { modo: 'entrega', bairro: 'Vila Nova' }, entrega: { ...pedidoBase().entrega, bairro: 'Vila Nova' } }));
  assert.equal(r.taxa, 900);
  await recusa(dados({ recebimento: { modo: 'entrega', bairro: 'Lua' }, entrega: { ...pedidoBase().entrega, bairro: 'Lua' } }), /bairro da lista/);
  admin(`update public.loja set taxa_tipo = 'fixa'`);
});

await teste('bairro sem entrega e cidade fora da lista (sem acento conta igual)', async () => {
  admin(`update public.loja set bairros_sem_entrega = '{"zona rural"}', cidades_atendidas = '{"Teofilo Otoni"}'`);
  await recusa(dados({ entrega: { ...pedidoBase().entrega, bairro: 'Zona Rural Norte' } }), /neste bairro/);
  await recusa(dados({ entrega: { ...pedidoBase().entrega, cidade: 'Itambacuri' } }), /nesta cidade/);
  await chamar(dados());   // Teófilo Otoni com acento passa
  admin(`update public.loja set bairros_sem_entrega = '{}', cidades_atendidas = '{}'`);
});

await teste('limite: 3 pedidos por telefone em 10 min; 10 por IP', async () => {
  const tel = telefone();
  for (let i = 0; i < 3; i++) await chamar(dados({ cliente: { nome: 'Ana Silva', telefone: tel } }));
  await recusa(dados({ cliente: { nome: 'Ana Silva', telefone: tel } }), /vários pedidos há pouco/);
  const mesmoIp = fetchFalso({ ip: '192.0.2.99' });
  for (let i = 0; i < 10; i++) await rpc('criar_pedido', { dados: dados(), chave: crypto.randomUUID() }, { fetchFn: mesmoIp });
  await assert.rejects(rpc('criar_pedido', { dados: dados(), chave: crypto.randomUUID() }, { fetchFn: mesmoIp }), /desta rede/);
});

await teste('limite por IP usa o cf-connecting-ip: x-forwarded-for inventado não escapa', async () => {
  let n = 0;
  // mesma pessoa (mesmo cf-connecting-ip) mandando um x-forwarded-for diferente a cada pedido
  const falsificado = () => fetchFalso({ ip: `100.64.0.${n++}`, cf: '192.0.2.150' });
  for (let i = 0; i < 10; i++) await rpc('criar_pedido', { dados: dados(), chave: crypto.randomUUID() }, { fetchFn: falsificado() });
  await assert.rejects(rpc('criar_pedido', { dados: dados(), chave: crypto.randomUUID() }, { fetchFn: falsificado() }), /desta rede/);
});

await teste('JSON torto vira mensagem genérica ou de regra, nunca erro interno exposto', async () => {
  for (const d of [null, [], 'x', { itens: 'x' }, { modo: 'entrega', itens: [{ produtoId: 1 }] }, { cliente: { nome: 5 } }]) {
    await assert.rejects(chamar(d), (e) => !/ERROR|syntax|jsonb|plpgsql/i.test(e.message));
  }
});

console.log('Permissões (RLS):');
await teste('visitante não lê pedidos, itens, segredos nem equipe', async () => {
  for (const t of ['pedidos', 'pedido_itens', 'pedidos_acesso', 'equipe']) {
    const r = sql(`select count(*) from public.${t}`);
    assert.equal(r.ok, false, t);
    assert.equal(r.code, '42501', t);
  }
});
await teste('visitante não altera cardápio, loja nem cria pedido direto na tabela', async () => {
  for (const c of [`update public.produtos set preco = 1`, `insert into public.categorias (id, nome) values ('x', 'X')`,
    `update public.loja set pix_chave = 'golpe@x.com'`, `insert into public.pedidos (codigo) values ('MO-AAAAA')`, `delete from public.horarios`]) {
    const r = sql(c);
    assert.equal(r.ok, false, c);
  }
  assert.equal(admin(`select pix_chave from public.loja`), '33999785853');
});
await teste('visitante não chama as funções internas', async () => {
  for (const c of [`select public._pedido_json(1)`, `select public._loja_aberta()`, `select public._texto('"a"', 'x', 1)`]) {
    const r = sql(c);
    assert.equal(r.code, '42501', c);
  }
});
await teste('visitante vê só produto ativo', async () => {
  admin(`update public.produtos set ativo = false where id = 'x-duplo'`);
  assert.equal(sql(`select count(*) from public.produtos where id = 'x-duplo'`).saida, '0');
  admin(`update public.produtos set ativo = true where id = 'x-duplo'`);
});

const uidEquipe = admin(`insert into auth.users (email) values ('cozinha@teste') returning id`);
const uidDono = admin(`insert into auth.users (email) values ('dono@teste') returning id`);
const uidOutro = admin(`insert into auth.users (email) values ('curioso@teste') returning id`);
// sem papel = 'cozinha' (o padrão é o de menos poder)
admin(`insert into public.equipe (user_id, nome) values ('${uidEquipe}', 'Cozinha'); insert into public.equipe (user_id, nome, papel) values ('${uidDono}', 'Dono', 'dono')`);
const comoEquipe = (c) => sql(c, { papel: 'authenticated', uid: uidEquipe });
const comoDono = (c) => sql(c, { papel: 'authenticated', uid: uidDono });
const comoOutro = (c) => sql(c, { papel: 'authenticated', uid: uidOutro });
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;

await teste('equipe lê pedidos e muda status e pagamento', async () => {
  assert.notEqual(comoEquipe(`select count(*) from public.pedidos`).saida, '0');
  const r = comoEquipe(`update public.pedidos set status = 'saiu', pagamento_status = 'confirmado' where codigo = '${criado.codigo}' returning status`);
  assert.equal(r.saida, 'saiu');
  assert.equal(comoEquipe(`select count(*) from public.pedido_itens`).ok, true);
});
await teste('equipe não muda valor nem dados do cliente do pedido', async () => {
  assert.equal(comoEquipe(`update public.pedidos set total = 1 where codigo = '${criado.codigo}'`).code, '42501');
  assert.equal(comoEquipe(`update public.pedidos set status = 'voando' where codigo = '${criado.codigo}'`).ok, false);
  assert.equal(comoEquipe(`select count(*) from public.pedidos_acesso`).code, '42501');
});
await teste('cozinha marca esgotado e abre/fecha a loja', async () => {
  assert.equal(admin(`select papel from public.equipe where user_id = '${uidEquipe}'`), 'cozinha');
  assert.equal(comoEquipe(`update public.produtos set disponivel = false where id = 'x-bacon' returning id`).saida, 'x-bacon');
  assert.equal(comoEquipe(`update public.loja set aberta_manual = false returning aberta_manual`).saida, 'f');
  admin(`update public.produtos set disponivel = true; update public.loja set aberta_manual = true`);
});
const precoBacon = admin(`select preco from public.produtos where id = 'x-bacon'`);
await teste('cozinha NÃO muda preço, Pix, horários, bairros, opções, cardápio nem o próprio papel', async () => {
  for (const c of [`update public.produtos set preco = 1 where id = 'x-bacon'`, `update public.produtos set disponivel = false, preco = 1 where id = 'x-bacon'`,
    `update public.produtos set nome = 'X' where id = 'x-bacon'`, `update public.loja set pix_chave = 'golpe@x.com'`,
    `update public.loja set aberta_manual = false, whatsapp = '5511999999999'`, `insert into public.categorias (id, nome) values ('x', 'X')`,
    `update public.equipe set papel = 'dono'`,
    `select public.salvar_horarios('[]')`, `select public.salvar_entrega('{}')`]) {
    const r = comoEquipe(c);
    assert.equal(r.ok, false, c);
    assert.equal(r.code, '42501', `${c}: ${r.code} ${r.message}`);
  }
  // sem a política, o update só não acha linha nenhuma (RLS)
  for (const t of ['opcoes set preco = 1', 'horarios set abre = \'01:00\'', 'bairros set taxa = 1', 'categorias set nome = \'X\'']) {
    assert.equal(comoEquipe(`update public.${t} returning 1`).saida, '', t);
  }
  assert.equal(comoEquipe(`delete from public.produtos where id = 'x-bacon' returning id`).saida, '');
  assert.equal(admin(`select pix_chave from public.loja`), '33999785853');
  assert.equal(admin(`select preco from public.produtos where id = 'x-bacon'`), precoBacon);
  assert.equal(admin(`select papel from public.equipe where user_id = '${uidEquipe}'`), 'cozinha');
});
await teste('dono muda preço do produto e da opção, e a chave Pix', async () => {
  assert.equal(comoDono(`update public.produtos set preco = 3150 where id = 'x-bacon' returning preco`).saida, '3150');
  const op = admin(`select o.id from public.opcoes o join public.grupos_opcao g on g.id = o.grupo_id where g.produto_id = 'fritas' and o.chave = 'm'`);
  assert.equal(comoDono(`update public.opcoes set preco = 1100 where id = ${op} returning preco`).saida, '1100');
  assert.equal(comoDono(`update public.loja set pix_chave = 'pix@loja.com' returning pix_chave`).saida, 'pix@loja.com');
  admin(`update public.produtos set preco = ${precoBacon} where id = 'x-bacon'; update public.opcoes set preco = 1000 where id = ${op};
    update public.loja set pix_chave = '33999785853'`);
});
await teste('dono salva horários de uma vez (e o banco confere)', async () => {
  const salvo = admin(`select json_agg(h) from public.horarios h`);
  const r = comoDono(`select public.salvar_horarios(${lit([{ dia: 5, abre: '18:00', fecha: '02:00' }, { dia: 1, abre: '11:00', fecha: '14:30' }])})`);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(JSON.parse(r.saida), [{ dia: 1, abre: '11:00:00', fecha: '14:30:00' }, { dia: 5, abre: '18:00:00', fecha: '02:00:00' }]);
  assert.equal(admin(`select count(*) from public.horarios`), '2');
  for (const [faixas, erro] of [
    [[{ dia: 2, abre: '18:00', fecha: '18:00' }], /terça.*mesmo horário/],
    [[{ dia: 3, abre: '25:00', fecha: '23:00' }], /quarta: use hora e minuto/],
    [[{ dia: 8, abre: '10:00', fecha: '11:00' }], /Horários inválidos/],
    [Array.from({ length: 5 }, (_, i) => ({ dia: 1, abre: `0${i}:00`, fecha: `0${i}:30` })), /No máximo 4/],
  ]) {
    const x = comoDono(`select public.salvar_horarios(${lit(faixas)})`);
    assert.equal(x.code, 'P0001', JSON.stringify(faixas));
    assert.match(x.message, erro);
  }
  assert.equal(admin(`select count(*) from public.horarios`), '2');   // erro não apaga nada
  admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha)
    select (x->>'dia')::int, (x->>'abre')::time, (x->>'fecha')::time from json_array_elements('${salvo}') x`);
});
await teste('dono salva entrega, retirada e bairros de uma vez (e o banco confere)', async () => {
  const base = { entregaAtiva: true, entregaTempo: '50 min', entregaMinimo: 2500, taxaTipo: 'bairro', taxaFixa: 600,
    retiradaAtiva: true, retiradaTempo: '20 min', retiradaMinimo: 0,
    bairros: [{ nome: 'Centro', taxa: 400, ativo: true }, { nome: 'Vila Nova', taxa: 900, ativo: false }] };
  const r = comoDono(`select public.salvar_entrega(${lit(base)})`);
  assert.equal(r.ok, true, r.message);
  assert.equal(admin(`select row(entrega_tempo, entrega_minimo, taxa_tipo, taxa_fixa, retirada_tempo)::text from public.loja`), '("50 min",2500,bairro,600,"20 min")');
  assert.equal(admin(`select string_agg(nome || ':' || taxa || ':' || ativo, ',' order by nome) from public.bairros`), 'Centro:400:true,Vila Nova:900:false');
  // o site passa a cobrar a taxa do bairro salvo
  const p = await chamar(dados({ recebimento: { modo: 'entrega', bairro: 'Centro' }, itens: [{ produtoId: 'x-tudo', qtd: 1 }] }));
  assert.equal(p.taxa, 400);
  for (const [extra, erro] of [
    [{ entregaAtiva: false, retiradaAtiva: false }, /entrega ou a retirada/],
    [{ bairros: [{ nome: 'Centro', taxa: 1, ativo: false }] }, /pelo menos um bairro ativo/],
    [{ bairros: [{ nome: 'Centro', taxa: 1, ativo: true }, { nome: 'centro', taxa: 2, ativo: true }] }, /Bairro repetido/],
    [{ taxaFixa: -5 }, /valor de taxa de entrega/],
    [{ taxaFixa: 2000000 }, /passou de R\$ 10\.000,00/],
    [{ entregaTempo: '' }, /tempo de entrega/],
    [{ taxaTipo: 'km' }, /taxa fixa ou por bairro/],
    [{ entregaAtiva: 'sim' }, /campo entrega/],
  ]) {
    const x = comoDono(`select public.salvar_entrega(${lit({ ...base, ...extra })})`);
    assert.equal(x.code, 'P0001', JSON.stringify(extra));
    assert.match(x.message, erro);
  }
  assert.equal(admin(`select count(*) from public.bairros`), '2');   // erro não apaga nada
  admin(`update public.loja set entrega_tempo = '45 min', entrega_minimo = 2000, taxa_tipo = 'fixa', taxa_fixa = 500, retirada_tempo = '30 min'; delete from public.bairros`);
});
await teste('visitante e usuário fora da equipe não chamam as funções do dono', async () => {
  for (const [quem, fn] of [['visitante', sql], ['fora', comoOutro]]) {
    assert.equal(fn(`select public.salvar_horarios('[]')`).code, '42501', quem);
    assert.equal(fn(`select public.salvar_entrega('{}')`).code, '42501', quem);
  }
  assert.notEqual(admin(`select count(*) from public.horarios`), '0');
});
await teste('usuário logado fora da equipe não vê pedidos nem altera nada', async () => {
  assert.equal(comoOutro(`select count(*) from public.pedidos`).saida, '0');
  assert.equal(comoOutro(`update public.produtos set preco = 1 returning id`).saida, '');
  assert.equal(comoOutro(`update public.loja set pix_chave = 'golpe' returning id`).saida, '');
  assert.equal(comoOutro(`select count(*) from public.equipe`).saida, '0');
  assert.equal(comoEquipe(`select count(*) from public.equipe`).saida, '1');
});

console.log(`\n${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) process.exit(1);
