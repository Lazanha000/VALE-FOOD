// ============================================================
// CONVERSA DO PAINEL COM O SUPABASE (sem biblioteca externa)
//
// * login por e-mail e senha:   POST /auth/v1/token?grant_type=password
// * renovar a sessão:           POST /auth/v1/token?grant_type=refresh_token
// * ler e gravar nas tabelas:   /rest/v1/... com o token da pessoa logada
//   (quem decide o que ela pode fazer é a RLS do banco: supabase/schema.sql)
// * pedidos em tempo real:      WebSocket da Realtime (protocolo Phoenix)
//
// A CSP do admin.html só aceita script do próprio site: por isso não usamos o
// supabase-js por CDN. Tudo aqui aceita fetch/WebSocket falsos para os testes.
// ============================================================

const TEMPO_LIMITE = 15000;
const MARGEM_RENOVAR_MS = 60_000;   // renova o token 1 min antes de vencer

export class ErroPainel extends Error {
  constructor(mensagem, status = 0, dados = null) {
    super(mensagem);
    this.status = status;
    this.dados = dados;
  }
}

// mensagem para a equipe a partir do erro do Supabase (nunca mostra detalhe interno)
function mensagemDoErro(status, dados) {
  if (status === 0) return 'Sem conexão com o banco. Confira a internet.';
  // o Storage responde 400 com statusCode '403' quando a política do bucket recusa
  if (status === 401 || status === 403 || dados?.code === '42501' || String(dados?.statusCode) === '403') return 'Sem permissão para isso. Entre de novo ou peça acesso ao dono.';
  if (status === 413 || String(dados?.statusCode) === '413') return 'Foto grande demais.';
  if (dados?.code === '23505') return 'Já existe um item com esse nome.';
  if (status === 429) return 'Muitas tentativas seguidas. Espere alguns minutos.';
  // regra do banco (funções do dono): a mensagem já vem pronta para a equipe
  if (dados?.code === 'P0001' && typeof dados.message === 'string') return dados.message.slice(0, 200);
  if (dados?.code === '23514' || dados?.code === '22P02') return 'Valor recusado pelo banco.';
  return 'O banco não respondeu como esperado. Tente de novo.';
}

// armazenamento da sessão (localStorage pode falhar: aba anônima, bloqueio)
export function guardaLocal(chave, armazenamento = globalThis.localStorage) {
  return {
    ler() { try { return JSON.parse(armazenamento.getItem(chave) || 'null'); } catch { return null; } },
    gravar(v) { try { armazenamento.setItem(chave, JSON.stringify(v)); } catch { /* fica só na memória */ } },
    apagar() { try { armazenamento.removeItem(chave); } catch { /* nada */ } },
  };
}

// sessão no formato que guardamos: só o necessário
function sessaoDe(r) {
  if (!r?.access_token || !r?.refresh_token) return null;
  const venceEm = Number.isFinite(r.expires_at) ? r.expires_at * 1000 : Date.now() + (Number(r.expires_in) || 3600) * 1000;
  return { access_token: r.access_token, refresh_token: r.refresh_token, vence_em: venceEm, user: { id: r.user?.id, email: r.user?.email } };
}

export function clienteSupabase({ url, chave, guarda, fetchFn = (...a) => fetch(...a), agora = () => Date.now() }) {
  const base = String(url || '').replace(/\/+$/, '');
  let sessao = guarda?.ler() || null;
  if (sessao && (!sessao.access_token || !sessao.refresh_token || !sessao.user?.id)) sessao = null;
  let renovando = null;
  const ouvintes = new Set();

  function trocar(nova) {
    sessao = nova;
    if (nova) guarda?.gravar(nova); else guarda?.apagar();
    ouvintes.forEach((fn) => fn(nova?.access_token || null));
  }

  // arquivo = Blob enviado como está (foto); body = objeto enviado como JSON
  async function chamar(caminho, { method = 'GET', body, arquivo, headers = {}, token } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);
    let r;
    try {
      r = await fetchFn(base + caminho, {
        method,
        headers: { apikey: chave, Authorization: `Bearer ${token || chave}`, 'Content-Type': arquivo ? arquivo.type : 'application/json', ...headers },
        body: arquivo || (body === undefined ? undefined : JSON.stringify(body)),
        signal: ctrl.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch {
      throw new ErroPainel(mensagemDoErro(0), 0);
    } finally {
      clearTimeout(timer);
    }
    let dados = null;
    try { const t = await r.text(); dados = t ? JSON.parse(t) : null; } catch { /* não-JSON */ }
    if (!r.ok) throw new ErroPainel(mensagemDoErro(r.status, dados), r.status, dados);
    return dados;
  }

  async function entrar(email, senha) {
    let r;
    try {
      r = await chamar('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: String(email).trim(), password: String(senha) } });
    } catch (e) {
      if (e.status === 400 || e.status === 401) throw new ErroPainel('E-mail ou senha errados.', e.status);
      throw e;
    }
    const s = sessaoDe(r);
    if (!s?.user.id) throw new ErroPainel('O login não devolveu uma sessão válida.', 500);
    trocar(s);
    return s.user;
  }

  // uma renovação por vez, mesmo com várias chamadas pedindo ao mesmo tempo
  function renovar() {
    if (!sessao) return Promise.reject(new ErroPainel('Entre de novo.', 401));
    renovando ||= (async () => {
      try {
        const r = await chamar('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: sessao.refresh_token } });
        const s = sessaoDe(r);
        if (!s) throw new ErroPainel('Sessão inválida.', 401);
        trocar({ ...s, user: s.user.id ? s.user : sessao.user });
        return sessao.access_token;
      } catch (e) {
        // sem internet: mantém a sessão e tenta depois. Token recusado: precisa entrar de novo.
        if (e.status >= 400 && e.status < 500) {
          trocar(null);
          throw new ErroPainel('Sua sessão expirou. Entre de novo.', 401);
        }
        throw e;
      } finally {
        renovando = null;
      }
    })();
    return renovando;
  }

  async function token() {
    if (!sessao) throw new ErroPainel('Entre de novo.', 401);
    if (sessao.vence_em - agora() < MARGEM_RENOVAR_MS) return renovar();
    return sessao.access_token;
  }

  // chamada com o token da pessoa. Token vencido no meio do caminho (relógio do aparelho errado,
  // aba dormindo): renova e tenta 1 vez
  async function comToken(caminho, opcoes = {}) {
    const t = await token();
    try {
      return await chamar(caminho, { ...opcoes, token: t });
    } catch (e) {
      if (e.status === 401 && sessao) return chamar(caminho, { ...opcoes, token: await renovar() });
      if (e.status === 401) trocar(null);
      throw e;
    }
  }
  // REST: caminho = parte depois de /rest/v1/
  const rest = (caminho, opcoes = {}) => comToken(`/rest/v1/${caminho}`, opcoes);
  // fotos (Storage): caminho = '<bucket>/<pasta>/<arquivo>'. Quem pode é decidido pela política do bucket.
  const enviarArquivo = (caminho, arquivo) => comToken(`/storage/v1/object/${caminho}`, {
    method: 'POST', arquivo, headers: { 'x-upsert': 'false', 'Cache-Control': 'max-age=31536000' },
  });
  const apagarArquivo = (caminho) => comToken(`/storage/v1/object/${caminho}`, { method: 'DELETE' });

  async function sair() {
    const t = sessao?.access_token;
    trocar(null);
    if (t) await chamar('/auth/v1/logout', { method: 'POST', token: t }).catch(() => {});
  }

  return {
    entrar, sair, rest, enviarArquivo, apagarArquivo, token, renovar,
    usuario: () => sessao?.user || null,
    // fn(token | null): token novo depois de renovar, null ao sair/expirar
    aoTrocarToken(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
  };
}

// ============================================================
// REALTIME: avisa quando a tabela "pedidos" muda (pedido novo, status...).
// A Realtime confere a RLS: só quem é da equipe recebe as mudanças.
// aoMudar({ type, record, old_record }) e aoEstado('conectando' | 'ao-vivo' | 'caiu').
// Cai a conexão: tenta de novo sozinho, com espera crescente.
// ============================================================
const ESPERAS = [1000, 2000, 5000, 10000, 30000];
const BATIMENTO_MS = 25000;

export function tempoRealPedidos({ url, chave, token, aoMudar, aoEstado = () => {}, WebSocketImpl = globalThis.WebSocket }) {
  const wsUrl = `${String(url).replace(/\/+$/, '').replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(chave)}&vsn=1.0.0`;
  const TOPICO = 'realtime:painel-pedidos';
  let ws = null;
  let ref = 0;
  let refEntrada = null;
  let batimento = null;
  let esperandoBatida = null;
  let tentativa = 0;
  let religar = null;
  let fechado = false;

  const enviar = (topic, event, payload, extra = {}) => {
    if (ws?.readyState !== 1) return null;
    const r = String(++ref);
    ws.send(JSON.stringify({ topic, event, payload, ref: r, ...extra }));
    return r;
  };

  function limpar() {
    clearInterval(batimento);
    batimento = null;
    esperandoBatida = null;
  }

  function agendar() {
    limpar();
    if (fechado) return;
    aoEstado('caiu');
    clearTimeout(religar);
    religar = setTimeout(conectar, ESPERAS[Math.min(tentativa++, ESPERAS.length - 1)]);
  }

  async function conectar() {
    if (fechado) return;
    aoEstado('conectando');
    let t;
    try { t = await token(); } catch { agendar(); return; }
    if (fechado) return;
    try { ws = new WebSocketImpl(wsUrl); } catch { agendar(); return; }
    const este = ws;
    este.onopen = () => {
      refEntrada = String(ref + 1);
      enviar(TOPICO, 'phx_join', {
        config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'pedidos' }], private: false },
        access_token: t,
      }, { join_ref: refEntrada });
      batimento = setInterval(() => {
        // a batida anterior não voltou: conexão morta sem aviso (Wi-Fi caiu, aba dormiu)
        if (esperandoBatida) { este.close(); return; }
        esperandoBatida = enviar('phoenix', 'heartbeat', {});
      }, BATIMENTO_MS);
    };
    este.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.topic === 'phoenix' && m.ref === esperandoBatida) { esperandoBatida = null; return; }
      if (m.topic !== TOPICO) return;
      if (m.event === 'phx_reply' && m.ref === refEntrada) {
        if (m.payload?.status === 'ok') { tentativa = 0; aoEstado('ao-vivo'); } else este.close();
      } else if (m.event === 'postgres_changes' && m.payload?.data) {
        aoMudar(m.payload.data);
      } else if (m.event === 'phx_error' || m.event === 'phx_close' || (m.event === 'system' && m.payload?.status === 'error')) {
        este.close();
      }
    };
    este.onclose = () => { if (ws === este) { ws = null; agendar(); } };
    este.onerror = () => { /* o onclose vem logo depois */ };
  }

  conectar();
  return {
    // token renovado: avisa o canal aberto (senão a Realtime corta quando o antigo vencer)
    trocarToken(novo) { if (novo) enviar(TOPICO, 'access_token', { access_token: novo }); },
    fechar() {
      fechado = true;
      clearTimeout(religar);
      limpar();
      const w = ws;
      ws = null;
      try { w?.close(); } catch { /* nada */ }
    },
  };
}
