// Imita as poucas rotas da API do Supabase (PostgREST e Auth) que o site e o painel usam,
// rodando o SQL num Postgres local pelo psql. Serve para testar schema.sql + js/services/*.js
// + painel/*.js juntos. Quem está logado (token) roda como "authenticated", com a RLS valendo.
// Conexão: variáveis PGHOST, PGPORT, PGUSER, PGDATABASE (ver PENDENCIAS.md).

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const lit = (s) => {
  const tag = `$q${randomBytes(4).toString('hex')}$`;
  return `${tag}${s}${tag}`;
};

// Roda SQL como um papel (anon/authenticated/postgres). Devolve { ok, saida } ou { ok:false, code, message }.
export function sql(comando, { papel = 'anon', uid = null, headers = null } = {}) {
  const partes = ['\\set VERBOSITY verbose', 'begin;'];
  if (papel !== 'postgres') partes.push(`set local role ${papel};`);
  if (uid) partes.push(`select set_config('teste.uid', ${lit(uid)}, true) is null;`);
  if (headers) partes.push(`select set_config('request.headers', ${lit(JSON.stringify(headers))}, true) is null;`);
  partes.push(comando.trim().replace(/;?$/, ';'), 'commit;');
  const r = spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: partes.join('\n'), encoding: 'utf8' });
  if (r.status !== 0) {
    const m = /ERROR:\s+([0-9A-Z]{5}): (.*)/.exec(r.stderr || '');
    const dica = /^HINT:\s+(.*)$/m.exec(r.stderr || '');
    return { ok: false, code: m?.[1] || 'XX000', message: m?.[2] || r.stderr, hint: dica?.[1] || null };
  }
  // as linhas "f" dos set_config acima vêm antes; o resultado é a última linha
  const linhas = r.stdout.split('\n').filter((l) => l !== '');
  return { ok: true, saida: linhas.slice(uid ? 1 : 0).slice(headers ? 1 : 0).join('\n') };
}

const sel = (cols, de) => `select coalesce(json_agg(t), '[]') from (select ${cols} from ${de}) t`;
const ANDAMENTO = /^pedidos\?select=[^&]*pedido_itens\([^&]*&or=\(status\.in\.\(([a-z,]+)\),criado_em\.gte\.([0-9T:.\-Z]+)\)/;
// [rota, sql] ou [rota, (achado) => sql]. As do painel vêm antes das do site (mesma tabela, outra consulta).
const GETS = [
  // ---- painel (usuário logado) ----
  [/^equipe\?select=nome,papel&user_id=eq\.([0-9a-f-]{36})$/, (m) => sel('nome, papel', `public.equipe where user_id = '${m[1]}'`)],
  [ANDAMENTO, (m) => sel(`p.*, (select coalesce(json_agg(i order by i.ordem), '[]') from (select ordem, nome, qtd, preco_unitario, escolhas, remover, obs, pedido_id
        from public.pedido_itens) i where i.pedido_id = p.id) as pedido_itens`,
    `public.pedidos p where p.status = any (string_to_array('${m[1]}', ',')) or p.criado_em >= '${m[2]}'::timestamptz order by p.criado_em desc limit 300`)],
  [/^loja\?select=aberta_manual,bloquear_fechado,fuso,entrega_ativa,[a-z_,]+&id=eq\.1$/, sel(`aberta_manual, bloquear_fechado, fuso, entrega_ativa, entrega_tempo,
      entrega_minimo, taxa_tipo, taxa_fixa, retirada_ativa, retirada_tempo, retirada_minimo`, 'public.loja where id = 1')],
  [/^categorias\?select=id,nome,ordem&order=ordem$/, sel('id, nome, ordem', 'public.categorias order by ordem')],
  [/^produtos\?select=id,nome,categoria_id,preco,disponivel,ativo,ordem,descricao,imagem,grupos_opcao\(/, sel(`id, nome, categoria_id, preco, disponivel, ativo, ordem, descricao, imagem,
      (select coalesce(json_agg(g), '[]') from (select gg.id, gg.nome, gg.ordem,
        (select coalesce(json_agg(o), '[]') from (select id, nome, preco, ativo, ordem from public.opcoes where grupo_id = gg.id) o) as opcoes
        from public.grupos_opcao gg where gg.produto_id = pp.id) g) as grupos_opcao`, 'public.produtos pp order by ordem')],
  [/^bairros\?select=nome,taxa,ativo&order=nome$/, sel('nome, taxa, ativo', 'public.bairros order by nome')],
  // ---- site (visitante) ----
  [/^categorias\?/, sel('id, nome, ordem, ativo', 'public.categorias where ativo')],
  [/^produtos\?/, sel(`id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, ativo, removiveis, ordem,
      (select coalesce(json_agg(g), '[]') from (select gg.chave, gg.nome, gg.tipo, gg.obrigatorio, gg.max, gg.ordem,
        (select coalesce(json_agg(o), '[]') from (select chave, nome, preco, ativo, ordem from public.opcoes where grupo_id = gg.id) o) as opcoes
        from public.grupos_opcao gg where gg.produto_id = pp.id) g) as grupos_opcao`, 'public.produtos pp where ativo')],
  [/^loja\?/, sel('*', 'public.loja where id = 1')],
  [/^bairros\?/, sel('nome, taxa, ativo', 'public.bairros where ativo')],
  [/^horarios\?/, sel('dia, abre, fecha', 'public.horarios')],
];
// PATCH tabela?id=eq.X (painel): só as colunas do corpo; a permissão de cada coluna é do banco
const PATCH = /^(pedidos|produtos|opcoes|loja)\?id=eq\.([A-Za-z0-9%-]{1,80})$/;

const resposta = (status, corpo) => ({ status, corpo: corpo === undefined ? '' : JSON.stringify(corpo) });
// como o PostgREST: sem permissão = 401 para visitante, 403 para quem está logado
const statusDoErro = (code, logado) => (code === 'P0001' ? 400 : code === '42501' ? (logado ? 403 : 401) : code.startsWith('22') || code.startsWith('23') ? 400 : 500);

// ---------- Auth (/auth/v1) ----------
// senha em texto puro na coluna auth.users.senha (só existe no supabase-falso.sql)
const sessoes = new Map();     // access_token -> { uid, vence }
const renovacoes = new Map();  // refresh_token -> uid
export const auth = { duracao: 3600, renovadas: 0, logins: 0 };
function novaSessao(uid, email) {
  const access = `teste-acesso-${randomBytes(12).toString('hex')}`;
  const refresh = `teste-renova-${randomBytes(12).toString('hex')}`;
  sessoes.set(access, { uid, vence: Date.now() + auth.duracao * 1000 });
  renovacoes.set(refresh, uid);
  return { access_token: access, token_type: 'bearer', expires_in: auth.duracao, refresh_token: refresh, user: { id: uid, email } };
}
export const uidDoToken = (token) => {
  const s = sessoes.get(token);
  return s && s.vence > Date.now() ? s.uid : null;
};
export function atenderAuth(metodo, caminho, corpo, token) {
  const c = JSON.parse(corpo || '{}');
  if (metodo === 'POST' && caminho === 'token?grant_type=password') {
    const r = sql(`select json_build_object('id', id, 'email', email) from auth.users where email = ${lit(String(c.email))} and senha = ${lit(String(c.password))}`, { papel: 'postgres' });
    if (!r.ok || !r.saida) return resposta(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    auth.logins++;
    const u = JSON.parse(r.saida);
    return resposta(200, novaSessao(u.id, u.email));
  }
  if (metodo === 'POST' && caminho === 'token?grant_type=refresh_token') {
    const uid = renovacoes.get(c.refresh_token);
    if (!uid) return resposta(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    renovacoes.delete(c.refresh_token);   // como no Supabase: cada refresh_token vale uma vez
    auth.renovadas++;
    return resposta(200, novaSessao(uid, null));
  }
  if (metodo === 'POST' && caminho === 'logout') {
    sessoes.delete(token);
    return resposta(204);
  }
  return resposta(404, { msg: 'rota de auth não imitada' });
}

// Atende uma requisição. caminho = parte depois de /rest/v1/. token = Bearer (chave pública ou sessão)
// cf = cf-connecting-ip (no Supabase de verdade vem da Cloudflare; aqui só quando o teste passar)
export function atender(metodo, caminho, corpo, { ip = '203.0.113.7', cf = null, token = null } = {}) {
  const headers = { 'x-forwarded-for': `${ip}, 10.0.0.1`, ...(cf ? { 'cf-connecting-ip': cf } : {}) };
  const uid = token ? uidDoToken(token) : null;
  if (token && token.startsWith('teste-acesso-') && !uid) return resposta(401, { code: 'PGRST303', message: 'JWT expired' });
  const papel = uid ? { papel: 'authenticated', uid } : {};
  const erro = (r) => resposta(statusDoErro(r.code, Boolean(uid)), { code: r.code, message: r.message, details: null, hint: r.hint });
  if (metodo === 'POST' && caminho.startsWith('rpc/')) {
    const nome = caminho.slice(4);
    if (!/^[a-z_]+$/.test(nome)) return resposta(404, { message: 'rota' });
    const args = Object.entries(JSON.parse(corpo || '{}'))
      .map(([k, v]) => `${k} => ${v === null ? 'null' : lit(typeof v === 'string' ? v : JSON.stringify(v))}`);
    const r = sql(`select coalesce(public.${nome}(${args.join(', ')})::text, 'null')`, { headers, ...papel });
    if (!r.ok) return erro(r);
    return { status: 200, corpo: r.saida };
  }
  if (metodo === 'GET') {
    let m = null;
    const achado = GETS.find(([re]) => (m = re.exec(caminho)));
    if (!achado) return resposta(404, { message: `rota não imitada: ${caminho}` });
    const r = sql(typeof achado[1] === 'function' ? achado[1](m) : achado[1], papel);
    if (!r.ok) return erro(r);
    return { status: 200, corpo: r.saida };
  }
  // POST tabela (painel do dono: produto novo). A permissão é da RLS.
  if (metodo === 'POST' && /^produtos$/.test(caminho)) {
    const r = sql(`with i as (insert into public.produtos select * from jsonb_populate_record(null::public.produtos,
        ${lit(JSON.stringify({ descricao: '', destaque: false, disponivel: true, ativo: true, removiveis: [], ordem: 0, ...JSON.parse(corpo || '{}') }))}) returning *)
      select coalesce(json_agg(i), '[]') from i`, papel);
    if (!r.ok) return erro(r);
    return { status: 201, corpo: r.saida };
  }
  if (metodo === 'PATCH') {
    const m = PATCH.exec(caminho);
    const campos = JSON.parse(corpo || '{}');
    const cols = Object.keys(campos);
    if (!m || !cols.length || !cols.every((k) => /^[a-z_]{1,40}$/.test(k))) return resposta(400, { message: 'patch não imitado' });
    const r = sql(`with u as (update public.${m[1]} t set (${cols.join(', ')}) = (select ${cols.join(', ')} from jsonb_populate_record(null::public.${m[1]}, ${lit(JSON.stringify(campos))}))
      where t.id::text = ${lit(decodeURIComponent(m[2]))} returning t.*) select coalesce(json_agg(u), '[]') from u`, papel);
    if (!r.ok) return erro(r);
    return { status: 200, corpo: r.saida };
  }
  return resposta(405, { message: 'método' });
}

// fetch falso para usar direto nos módulos (criarPedido, consultarPedido, buscarDoBanco, painel)
export function fetchFalso(opcoes) {
  return async (url, init = {}) => {
    const u = String(url);
    const token = String(init.headers?.Authorization || '').replace(/^Bearer /, '') || null;
    const r = /\/auth\/v1\//.test(u)
      ? atenderAuth(init.method || 'GET', u.replace(/^https?:\/\/[^/]+\/auth\/v1\//, ''), init.body, token)
      : atender(init.method || 'GET', u.replace(/^https?:\/\/[^/]+\/rest\/v1\//, ''), init.body, { ...opcoes, token });
    return new Response(r.corpo || null, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
}
