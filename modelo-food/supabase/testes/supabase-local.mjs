// "Supabase local" para testar o site e o painel no navegador, sem tocar no projeto de verdade.
//   * serve o site (pasta modelo-food) em http://localhost:8790
//   * /rest/v1  -> PostgREST de verdade (Docker), com a RLS do plataforma.sql valendo
//   * /auth/v1  -> login, cadastro e renovação imitados (senha em texto puro, só para teste)
//   * js/config.js sai com a URL deste servidor no lugar da do Supabase
// Sem tempo real e sem Storage: o painel cai no "atualizando a cada 15 s" e não envia fotos.
//
// Preparar (uma vez):
//   docker network create valefood-net
//   docker network connect valefood-net valefood-pg
//   docker exec -i valefood-pg psql -U postgres -c "create database local_site"
//   docker exec -i valefood-pg psql -U postgres -d local_site < supabase/testes/supabase-local.sql
//   docker exec -i valefood-pg psql -U postgres -d local_site < supabase/plataforma.sql
//   docker run -d --name valefood-rest --network valefood-net -p 5480:3000 \
//     -e PGRST_DB_URI=postgres://authenticator:teste@valefood-pg:5432/local_site -e PGRST_DB_SCHEMAS=public \
//     -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=segredo-de-teste-local-com-32-caracteres postgrest/postgrest:v12.2.3
// Rodar: node supabase/testes/supabase-local.mjs

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, normalize, extname } from 'node:path';

const PORTA = Number(process.env.PORTA || 8790);
const REST = process.env.REST || 'http://localhost:5480';
const SEGREDO = 'segredo-de-teste-local-com-32-caracteres';
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const URL_REAL = /https:\/\/[a-z0-9]+\.supabase\.co/g;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(uid, email) {
  const corpo = b64({ sub: uid, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  const cab = b64({ alg: 'HS256', typ: 'JWT' });
  return `${cab}.${corpo}.${createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest('base64url')}`;
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
function psql(sql) {
  const r = spawnSync('docker', ['exec', '-i', 'valefood-pg', 'psql', '-U', 'postgres', '-d', 'local_site', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
const renovacoes = new Map();
function sessao(id, email) {
  const refresh = randomBytes(16).toString('hex');
  renovacoes.set(refresh, { id, email });
  return { access_token: jwt(id, email), token_type: 'bearer', expires_in: 3600, refresh_token: refresh, user: { id, email } };
}

async function auth(req, res, caminho, corpo) {
  const c = JSON.parse(corpo || '{}');
  const enviar = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
  if (caminho.startsWith('token?grant_type=password')) {
    const linha = psql(`select id || '|' || email from auth.users where lower(email) = lower(${lit(c.email)}) and senha = ${lit(c.password)}`);
    if (!linha) return enviar(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    const [id, email] = linha.split('|');
    return enviar(200, sessao(id, email));
  }
  if (caminho.startsWith('token?grant_type=refresh_token')) {
    const u = renovacoes.get(c.refresh_token);
    if (!u) return enviar(400, { error_code: 'refresh_token_not_found' });
    renovacoes.delete(c.refresh_token);
    return enviar(200, sessao(u.id, u.email));
  }
  if (caminho === 'signup') {
    if (psql(`select 1 from auth.users where lower(email) = lower(${lit(c.email)})`)) return enviar(422, { error_code: 'user_already_exists' });
    const id = psql(`insert into auth.users (email, senha) values (${lit(c.email)}, ${lit(c.password)}) returning id`);
    // CONFIRMAR=1 imita o Supabase com confirmação de e-mail ligada (não devolve sessão)
    return enviar(200, process.env.CONFIRMAR === '1' ? { id, email: c.email } : sessao(id, c.email));
  }
  // "Esqueci minha senha": em vez do e-mail, escreve o link no terminal
  if (caminho.startsWith('recover')) {
    const volta = new URL(caminho, 'http://x/').searchParams.get('redirect_to') || `http://localhost:${PORTA}/admin.html`;
    const linha = psql(`select id || '|' || email from auth.users where lower(email) = lower(${lit(c.email)})`);
    if (linha) {
      const [id, email] = linha.split('|');
      const s = sessao(id, email);
      console.log(`[e-mail imitado] link de senha nova para ${email}: ${volta}#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&type=recovery`);
    }
    return enviar(200, {});
  }
  if (caminho === 'user' && req.method === 'PUT') {
    const t = String(req.headers.authorization || '').replace(/^Bearer /, '').split('.');
    if (t.length !== 3 || createHmac('sha256', SEGREDO).update(`${t[0]}.${t[1]}`).digest('base64url') !== t[2]) return enviar(401, { msg: 'token inválido' });
    const { sub, email } = JSON.parse(Buffer.from(t[1], 'base64url').toString());
    psql(`update auth.users set senha = ${lit(c.password)} where id = ${lit(sub)}`);
    return enviar(200, { id: sub, email });
  }
  if (caminho === 'logout') return enviar(204);
  return enviar(404, { msg: 'rota não imitada' });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const corpo = await new Promise((ok) => { let d = ''; req.on('data', (x) => { d += x; }); req.on('end', () => ok(d)); });
  try {
    if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url.pathname.slice(9) + url.search, corpo);
    if (url.pathname.startsWith('/rest/v1/')) {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const headers = { 'Content-Type': req.headers['content-type'] || 'application/json', Accept: req.headers.accept || 'application/json' };
      if (req.headers.prefer) headers.Prefer = req.headers.prefer;
      if (token.split('.').length === 3) headers.Authorization = `Bearer ${token}`;   // chave pública = visitante
      const r = await fetch(`${REST}/${url.pathname.slice(9)}${url.search}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo });
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (url.pathname.startsWith('/realtime/') || url.pathname.startsWith('/storage/')) { res.writeHead(404); return res.end(); }
    let arq = normalize(join(RAIZ, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!arq.startsWith(normalize(RAIZ))) { res.writeHead(403); return res.end(); }
    let dados = await readFile(arq);
    if (arq.endsWith(join('js', 'config.js'))) dados = Buffer.from(String(dados).replace(URL_REAL, `http://localhost:${PORTA}`));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(e.code === 'ENOENT' ? 'não encontrado' : String(e.message));
  }
}).listen(PORTA, () => console.log(`Supabase local: http://localhost:${PORTA}`));
