// Testa supabase/plataforma.sql (vários estabelecimentos) num Postgres local, com as regras de acesso valendo.
// Recria o banco do zero a cada execução. NÃO aponte para o Supabase de verdade.
// Uso (Postgres no Docker):
//   docker run -d --name valefood-pg -e POSTGRES_PASSWORD=teste -p 5499:5432 postgres:17
//   node supabase/testes/testar-plataforma.mjs
// Outro Postgres: PSQL="psql -h localhost -p 5432 -U postgres" node supabase/testes/testar-plataforma.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PSQL = (process.env.PSQL || 'docker exec -i valefood-pg psql -U postgres').split(' ');
const BANCO = 'teste_plataforma';
const ler = (f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const lit = (s) => { const t = `$q${randomBytes(4).toString('hex')}$`; return `${t}${s}${t}`; };

function psql(entrada, banco = BANCO) {
  const r = spawnSync(PSQL[0], [...PSQL.slice(1), '-d', banco, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: entrada, encoding: 'utf8' });
  return r;
}
// roda como um usuário: null = visitante (anon); 'postgres' = SQL Editor; uuid = logado (authenticated)
function rodar(comando, quem = null, ip = '203.0.113.7') {
  const partes = ['\\set VERBOSITY verbose', 'begin;'];
  if (quem !== 'postgres') {
    partes.push(`set local role ${quem ? 'authenticated' : 'anon'};`);
    if (quem) partes.push(`select set_config('teste.uid', '${quem}', true) is null;`);
    partes.push(`select set_config('request.headers', ${lit(JSON.stringify({ 'cf-connecting-ip': ip }))}, true) is null;`);
  }
  partes.push(comando.trim().replace(/;?$/, ';'), 'commit;');
  const r = psql(partes.join('\n'));
  if (r.status !== 0) {
    const m = /ERROR:\s+([0-9A-Z]{5}): (.*)/.exec(r.stderr || '');
    return { ok: false, code: m?.[1] || 'XX000', message: m?.[2] || r.stderr };
  }
  const linhas = r.stdout.split('\n').filter((l) => l !== '' && l !== 'f');
  return { ok: true, saida: linhas.join('\n') };
}
const q = (c, quem) => {
  const r = rodar(c, quem);
  if (!r.ok) throw new Error(`${r.code} ${r.message}\n  ${c.slice(0, 200)}`);
  return r.saida === '' ? null : JSON.parse(r.saida);
};
const erro = (c, quem) => {
  const r = rodar(c, quem);
  if (r.ok) throw new Error(`deveria falhar e passou: ${c.slice(0, 200)}`);
  return r;
};
const json = (o) => `${lit(JSON.stringify(o))}::jsonb`;

let ok = 0;
const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; console.log(`  ok  ${nome}`); } catch (e) { falhas.push(nome); console.log(`  FALHOU  ${nome}\n        ${e.message.split('\n').join('\n        ')}`); }
}

// ---------- banco novo ----------
{
  const r = psql(`drop database if exists ${BANCO};\ncreate database ${BANCO};`, 'postgres');
  if (r.status !== 0) { console.error('Não consegui falar com o Postgres:', r.stderr || r.error?.message); process.exit(2); }
  for (const f of ['./supabase-falso.sql', '../plataforma.sql', '../plataforma.sql']) {   // 2x: rodar de novo não pode quebrar
    const x = psql(ler(f));
    if (x.status !== 0) { console.error(`${f}:\n${x.stderr}`); process.exit(2); }
  }
}
const usuario = (email) => q(`with x as (insert into auth.users (email) values (${lit(email)}) returning id) select to_json(id) from x`, 'postgres');
const ADMIN = usuario('admin@teste.com');
const DONO = usuario('ze@teste.com');
const COZINHA = usuario('cozinha@teste.com');
const DONO2 = usuario('maria@teste.com');
const ESTRANHO = usuario('estranho@teste.com');
q(`insert into public.admins (user_id, nome) values ('${ADMIN}', 'Admin')`, 'postgres');

const CADASTRO = {
  nome: 'Lanchonete do Zé', nomeCurto: 'Lanchonete', sufixo: 'do Zé', categoria: 'lanchonetes', cidade: 'Araçuaí',
  descricao: 'Hambúrguer na hora.', telefonePublico: '(33) 98888-1111', whatsapp: '33988881111',
  documentoTipo: 'cnpj', documento: '11.222.333/0001-81', razaoSocial: 'Zé Lanches LTDA',
  responsavelNome: 'José Silva', responsavelTelefone: '33999990000', responsavelEmail: 'ze@teste.com',
  endereco: 'Rua das Flores, 120', aceites: { termos: true, privacidade: true, adesao: true },
};
const cadastrar = (dados, quem) => q(`select public.cadastrar_estabelecimento(${json(dados)})`, quem);
let ZE, MARIA;

console.log('\nCadastro e aprovação');
teste('visitante não cadastra estabelecimento', () => { erro(`select public.cadastrar_estabelecimento(${json(CADASTRO)})`, null); });
teste('CNPJ com dígito errado é recusado', () => {
  const r = erro(`select public.cadastrar_estabelecimento(${json({ ...CADASTRO, documento: '11222333000182' })})`, DONO);
  assert.match(r.message, /CPF ou CNPJ/);
});
teste('sem aceitar os termos é recusado', () => {
  const r = erro(`select public.cadastrar_estabelecimento(${json({ ...CADASTRO, aceites: { termos: true } })})`, DONO);
  assert.match(r.message, /aceite/);
});
teste('usuário logado cadastra e vira dono; loja fica pendente', () => {
  const r = cadastrar(CADASTRO, DONO);
  assert.deepEqual(r, { id: 'lanchonete-do-ze', situacao: 'pendente' });
  ZE = r.id;
  const eq = q(`select json_agg(papel) from public.equipe where estabelecimento_id = '${ZE}'`, DONO);
  assert.deepEqual(eq, ['dono']);
});
teste('mesmo nome ganha outro endereço; CPF válido aceito', () => {
  const r = cadastrar({ ...CADASTRO, nome: 'Lanchonete do Zé', documentoTipo: 'cpf', documento: '529.982.247-25', responsavelEmail: 'maria@teste.com' }, DONO2);
  assert.equal(r.id, 'lanchonete-do-ze-2');
  MARIA = r.id;
});
teste('loja pendente não aparece para o visitante nem para outra loja', () => {
  assert.equal(q(`select count(*) from public.estabelecimentos`, null), 0);
  assert.deepEqual(q(`select json_agg(id) from public.estabelecimentos`, DONO2), [MARIA]);
  assert.deepEqual(q(`select json_agg(id) from public.estabelecimentos`, DONO), [ZE]);
});
teste('dados privados: só o dono e o admin', () => {
  erro(`select * from public.estabelecimentos_privado`, null);
  assert.equal(q(`select count(*) from public.estabelecimentos_privado where estabelecimento_id = '${ZE}'`, DONO2), 0);
  assert.equal(q(`select to_json(documento) from public.estabelecimentos_privado where estabelecimento_id = '${ZE}'`, DONO), '11222333000181');
  assert.equal(q(`select count(*) from public.estabelecimentos_privado`, ADMIN), 2);
});
teste('dono muda o contato, mas não o documento', () => {
  q(`update public.estabelecimentos_privado set endereco = 'Rua Nova, 1' where estabelecimento_id = '${ZE}'`, DONO);
  erro(`update public.estabelecimentos_privado set documento = '52998224725' where estabelecimento_id = '${ZE}'`, DONO);
});
teste('dono não se aprova sozinho', () => {
  const r = erro(`update public.estabelecimentos set situacao = 'aprovado' where id = '${ZE}'`, DONO);
  assert.match(r.message, /administração/);
  erro(`select public.definir_situacao('${ZE}', 'aprovado')`, DONO);
  erro(`update public.estabelecimentos set nome = 'Outra Loja Famosa' where id = '${ZE}'`, DONO);
  q(`update public.estabelecimentos set descricao = 'Nova descrição' where id = '${ZE}'`, DONO);
});

console.log('\nCardápio');
teste('dono monta o cardápio da própria loja', () => {
  q(`insert into public.categorias (estabelecimento_id, id, nome, ordem) values ('${ZE}', 'lanches', 'Lanches', 0), ('${ZE}', 'bebidas', 'Bebidas', 1)`, DONO);
  q(`insert into public.produtos (estabelecimento_id, id, categoria_id, nome, preco, removiveis) values
     ('${ZE}', 'x-burger', 'lanches', 'X-Burger', 1800, '{Maionese}'),
     ('${ZE}', 'coca', 'bebidas', 'Coca 350', 600, '{}')`, DONO);
  q(`insert into public.grupos_opcao (estabelecimento_id, produto_id, chave, nome, tipo, max) values ('${ZE}', 'x-burger', 'adicionais', 'Adicionais', 'multipla', 3)`, DONO);
  q(`insert into public.opcoes (estabelecimento_id, grupo_id, chave, nome, preco)
     select '${ZE}', id, 'bacon', 'Bacon', 400 from public.grupos_opcao where estabelecimento_id = '${ZE}' and chave = 'adicionais'`, DONO);
});
teste('outra loja não mexe no cardápio do Zé', () => {
  erro(`insert into public.produtos (estabelecimento_id, id, categoria_id, nome, preco) values ('${ZE}', 'falso', 'lanches', 'Falso', 1)`, DONO2);
  assert.equal(q(`with u as (update public.produtos set preco = 1 where estabelecimento_id = '${ZE}' returning 1) select count(*) from u`, DONO2), 0);
  assert.equal(q(`with u as (delete from public.produtos where estabelecimento_id = '${ZE}' returning 1) select count(*) from u`, DONO2), 0);
});
teste('opção não pode apontar para grupo de outra loja', () => {
  q(`insert into public.categorias (estabelecimento_id, id, nome) values ('${MARIA}', 'lanches', 'Lanches')`, DONO2);
  const grupoDoZe = q(`select to_json(id) from public.grupos_opcao where estabelecimento_id = '${ZE}' limit 1`, 'postgres');
  const r = erro(`insert into public.opcoes (estabelecimento_id, grupo_id, chave, nome, preco) values ('${MARIA}', ${grupoDoZe}, 'hack', 'Hack', 0)`, DONO2);
  assert.equal(r.code, '23503');
});
teste('aprovar exige produto; admin aprova; visitante passa a ver loja e cardápio', () => {
  const r = erro(`select public.definir_situacao('${MARIA}', 'aprovado')`, ADMIN);
  assert.match(r.message, /produto/);
  q(`select public.definir_situacao('${ZE}', 'aprovado')`, ADMIN);
  assert.deepEqual(q(`select json_agg(id) from public.estabelecimentos`, null), [ZE]);
  assert.equal(q(`select count(*) from public.produtos`, null), 2);
  assert.equal(q(`select count(*) from public.opcoes`, null), 1);
});
teste('horários e entrega pelo painel do dono', () => {
  q(`select public.salvar_horarios('${ZE}', ${json([1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, abre: '00:00', fecha: '23:59' })))})`, DONO);
  q(`select public.salvar_entrega('${ZE}', ${json({ entregaAtiva: true, entregaTempo: '30 min', entregaMinimo: 1000, taxaTipo: 'fixa', taxaFixa: 500,
    retiradaAtiva: true, retiradaTempo: '15 min', retiradaMinimo: 0, bairros: [] })})`, DONO);
  erro(`select public.salvar_horarios('${ZE}', '[]'::jsonb)`, DONO2);
  q(`update public.estabelecimentos set pix_chave = '+5533988881111', pix_tipo = 'telefone' where id = '${ZE}'`, DONO);
});

console.log('\nPedido');
const PEDIDO = {
  modo: 'entrega', cliente: { nome: 'Ana Souza', telefone: '(33) 98765-4321' },
  entrega: { cep: '39600-000', cidade: 'Araçuaí', endereco: 'Rua A', numero: '10', bairro: 'Centro' },
  pagamento: { forma: 'pix' }, itens: [{ produtoId: 'x-burger', qtd: 2, escolhas: { adicionais: ['bacon'] }, remover: ['Maionese'], preco: 1 }],
};
let PED;
teste('visitante faz pedido; preço vem do banco (ignora o do navegador)', () => {
  PED = q(`select public.criar_pedido('${ZE}', ${json(PEDIDO)}, '${randomUUID()}')`, null);
  assert.equal(PED.subtotal, 2 * (1800 + 400));
  assert.equal(PED.taxa, 500);
  assert.equal(PED.total, 4900);
  assert.equal(PED.estabelecimento.id, ZE);
  assert.match(PED.token, /^[a-f0-9]{32}$/);
});
teste('total diferente do que o cliente viu: avisa para recarregar', () => {
  const r = erro(`select public.criar_pedido('${ZE}', ${json({ ...PEDIDO, cliente: { nome: 'Bia Lima', telefone: '33911112222' }, totalEsperado: 100 })}, '${randomUUID()}')`, null);
  assert.match(r.message, /preços mudaram/);
});
teste('produto de outra loja não entra no pedido', () => {
  q(`insert into public.produtos (estabelecimento_id, id, categoria_id, nome, preco) values ('${MARIA}', 'so-da-maria', 'lanches', 'Só da Maria', 100)`, DONO2);
  const r = erro(`select public.criar_pedido('${ZE}', ${json({ ...PEDIDO, cliente: { nome: 'Bia Lima', telefone: '33911112222' }, itens: [{ produtoId: 'so-da-maria', qtd: 1 }] })}, '${randomUUID()}')`, null);
  assert.match(r.message, /saiu do cardápio/);
});
teste('loja não aprovada não recebe pedido', () => {
  const r = erro(`select public.criar_pedido('${MARIA}', ${json({ ...PEDIDO, itens: [{ produtoId: 'so-da-maria', qtd: 1 }] })}, '${randomUUID()}')`, null);
  assert.match(r.message, /não está recebendo/);
});
teste('mesmo envio repetido devolve o mesmo pedido', () => {
  const chave = randomUUID();
  const dados = { ...PEDIDO, cliente: { nome: 'Caio Dias', telefone: '33933334444' } };
  const a = q(`select public.criar_pedido('${ZE}', ${json(dados)}, '${chave}')`, null);
  const b = q(`select public.criar_pedido('${ZE}', ${json(dados)}, '${chave}')`, null);
  assert.equal(a.codigo, b.codigo);
});
teste('limite: 3 pedidos do mesmo telefone em 10 minutos', () => {
  const dados = { ...PEDIDO, cliente: { nome: 'Davi Reis', telefone: '33955556666' } };
  for (let i = 0; i < 3; i++) q(`select public.criar_pedido('${ZE}', ${json(dados)}, '${randomUUID()}')`, null);
  const r = erro(`select public.criar_pedido('${ZE}', ${json(dados)}, '${randomUUID()}')`, null);
  assert.match(r.message, /vários pedidos/);
});

console.log('\nQuem vê os pedidos');
teste('visitante não lê pedido nenhum nem os segredos', () => {
  erro(`select * from public.pedidos`, null);
  erro(`select * from public.pedidos_acesso`, DONO);
});
teste('dono vê os pedidos da loja; outra loja não vê', () => {
  assert.ok(q(`select count(*) from public.pedidos`, DONO) >= 1);
  assert.equal(q(`select count(*) from public.pedidos`, DONO2), 0);
  assert.equal(q(`select count(*) from public.pedido_itens`, DONO2), 0);
});
teste('dono põe alguém na cozinha pelo e-mail', () => {
  q(`select public.adicionar_equipe('${ZE}', 'cozinha@teste.com', 'cozinha', 'Cozinheiro')`, DONO);
  erro(`select public.adicionar_equipe('${ZE}', 'estranho@teste.com', 'dono')`, DONO2);
  const r = erro(`select public.adicionar_equipe('${ZE}', 'naoexiste@teste.com')`, DONO);
  assert.match(r.message, /criar a conta/);
});
teste('cozinha muda status, esgotado e abre/fecha; não muda preço nem Pix', () => {
  q(`update public.pedidos set status = 'preparo' where codigo = '${PED.codigo}'`, COZINHA);
  q(`update public.produtos set disponivel = false where estabelecimento_id = '${ZE}' and id = 'coca'`, COZINHA);
  q(`update public.estabelecimentos set aberta_manual = true where id = '${ZE}'`, COZINHA);
  erro(`update public.produtos set preco = 1 where estabelecimento_id = '${ZE}' and id = 'x-burger'`, COZINHA);
  erro(`update public.estabelecimentos set pix_chave = 'golpe@x.com' where id = '${ZE}'`, COZINHA);
  erro(`update public.pedidos set total = 1 where codigo = '${PED.codigo}'`, COZINHA);
  erro(`select * from public.estabelecimentos_privado where estabelecimento_id = '${ZE}' and false`, null);
  assert.equal(q(`select count(*) from public.estabelecimentos_privado`, COZINHA), 0);
});
teste('estranho logado não vê nem muda pedido do Zé', () => {
  assert.equal(q(`select count(*) from public.pedidos`, ESTRANHO), 0);
  assert.equal(q(`with u as (update public.pedidos set status = 'cancelado' returning 1) select count(*) from u`, ESTRANHO), 0);
});

console.log('\nAcompanhar, avaliar e suporte');
teste('acompanhar só com o token certo', () => {
  assert.equal(q(`select public.acompanhar_pedido('${PED.codigo}', '${'0'.repeat(32)}')`, null), null);
  assert.equal(q(`select public.acompanhar_pedido('${PED.codigo}', 'curto')`, null), null);
  const r = q(`select public.acompanhar_pedido('${PED.codigo.toLowerCase()}', '${PED.token}')`, null);
  assert.equal(r.status, 'preparo');
  assert.equal(r.estabelecimento.telefone, '33988881111');
  assert.equal(r.cliente, undefined);
});
teste('avaliação só depois de entregue, uma vez, e entra na média', () => {
  let r = erro(`select public.avaliar_pedido('${PED.codigo}', '${PED.token}', 5, 'Ótimo')`, null);
  assert.match(r.message, /entregue/);
  q(`update public.pedidos set status = 'entregue' where codigo = '${PED.codigo}'`, DONO);
  erro(`select public.avaliar_pedido('${PED.codigo}', '${'0'.repeat(32)}', 5)`, null);
  q(`select public.avaliar_pedido('${PED.codigo}', '${PED.token}', 4, 'Muito bom')`, null);
  r = erro(`select public.avaliar_pedido('${PED.codigo}', '${PED.token}', 5)`, null);
  assert.match(r.message, /já foi avaliado/);
  assert.deepEqual(q(`select json_build_object('q', avaliacoes_qtd, 's', avaliacoes_soma) from public.estabelecimentos where id = '${ZE}'`, null), { q: 1, s: 4 });
  assert.equal(q(`select count(*) from public.avaliacoes`, DONO), 1);
  erro(`select * from public.avaliacoes`, null);
});
teste('chamado de suporte: cliente abre, só a administração lê', () => {
  const r = q(`select public.abrir_chamado('errado', 'Veio sem bacon', null, '${PED.codigo}', '${PED.token}')`, null);
  assert.ok(r.protocolo > 0);
  q(`select public.abrir_chamado('outro', 'Não consigo pedir', '(33) 97777-0000')`, null);
  erro(`select public.abrir_chamado('outro', 'oi', null)`, null);
  assert.equal(q(`select count(*) from public.chamados`, ADMIN), 2);
  assert.equal(q(`select count(*) from public.chamados`, DONO), 0);
  assert.equal(q(`select to_json(estabelecimento_id) from public.chamados where motivo = 'errado'`, ADMIN), ZE);
});

console.log('\nResumo, mensalidade e suspensão');
teste('resumo de vendas: dono vê a loja, admin vê todas', () => {
  const de = new Date(Date.now() - 30 * 86400000).toISOString(), ate =new Date(Date.now() + 86400000).toISOString();
  const r = q(`select public.resumo_vendas('${de}', '${ate}', '${ZE}')`, DONO);
  assert.equal(r.length, 1);
  assert.ok(r[0].pedidos >= 5);
  erro(`select public.resumo_vendas('2026-01-01', '2026-02-01', null)`, DONO);
  erro(`select public.resumo_vendas('2026-01-01', '2026-02-01', '${ZE}')`, DONO2);
  assert.equal(q(`select public.resumo_vendas('${de}', '${ate}', null)`, ADMIN).length, 1);
  erro(`select public.resumo_vendas('2000-01-01', '${ate}', null)`, ADMIN);   // mais de 400 dias
});
teste('mensalidade: admin lança; dono só vê', () => {
  q(`insert into public.mensalidades (estabelecimento_id, competencia, valor) values ('${ZE}', '2026-11-01', 5000)`, ADMIN);
  assert.equal(q(`select count(*) from public.mensalidades`, DONO), 1);
  assert.equal(q(`select count(*) from public.mensalidades`, DONO2), 0);
  erro(`insert into public.mensalidades (estabelecimento_id, competencia, valor) values ('${ZE}', '2026-12-01', 0)`, DONO);
});
teste('loja suspensa some e para de receber pedidos', () => {
  q(`select public.definir_situacao('${ZE}', 'suspenso', 'Mensalidade atrasada')`, ADMIN);
  assert.equal(q(`select count(*) from public.estabelecimentos`, null), 0);
  assert.equal(q(`select count(*) from public.produtos`, null), 0);
  erro(`select public.criar_pedido('${ZE}', ${json({ ...PEDIDO, cliente: { nome: 'Eva Melo', telefone: '33977778888' } })}, '${randomUUID()}')`, null);
  assert.equal(q(`select to_json(situacao_motivo) from public.estabelecimentos_privado where estabelecimento_id = '${ZE}'`, DONO), 'Mensalidade atrasada');
});
teste('LGPD: cliente pede exclusão; só o admin anonimiza; valores ficam', () => {
  q(`select public.abrir_chamado('dados', 'Quero apagar meus dados', '(33) 98765-4321')`, null);
  erro(`select public.anonimizar_cliente('33987654321')`, DONO);
  erro(`select public.anonimizar_cliente('33987654321')`, null);
  const r = q(`select public.anonimizar_cliente('(33) 98765-4321')`, ADMIN);
  assert.equal(r.pedidos, 1);
  assert.deepEqual(q(`select json_build_object('n', cliente_nome, 't', cliente_telefone, 'e', entrega, 'total', total) from public.pedidos where codigo = '${PED.codigo}'`, ADMIN),
    { n: 'Dados removidos', t: '', e: null, total: 4900 });
  assert.equal(q(`select to_json(comentario) from public.avaliacoes`, ADMIN), '');
  assert.ok(q(`select public.acompanhar_pedido('${PED.codigo}', '${PED.token}')`, null).total === 4900);
});
teste('visitante não chama funções internas nem de painel', () => {
  erro(`select public._texto('"a"'::jsonb, 'x', 1)`, null);
  erro(`select public.salvar_horarios('${ZE}', '[]'::jsonb)`, null);
  erro(`select public.resumo_vendas(now() - interval '1 day', now(), null)`, null);
});

console.log(`\n${ok} ok, ${falhas.length} falha(s)`);
process.exit(falhas.length ? 1 : 0);
