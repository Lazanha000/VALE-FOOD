// Navegação entre páginas pelo endereço (#cardapio, #carrinho...).
// Funciona sem servidor especial e dentro de páginas publicadas.

const rotas = new Map();
let atual = null;
let estadoPendente = null;
let aoMudar = () => {};

export function rota(nome, render) {
  rotas.set(nome, render);
}

export function iniciar(callback) {
  aoMudar = callback;
  window.addEventListener('hashchange', () => abrir(lerHash()));
  abrir(lerHash());
}

// link com % solto (ex.: #%) faz decodeURIComponent lançar erro e derrubaria o site
// inteiro; nesse caso cai na página 404
export function lerHash() {
  const bruto = (location.hash || '').replace(/^#\/?/, '');
  try {
    return decodeURIComponent(bruto).trim();
  } catch {
    return bruto.trim() || '404';
  }
}

export function ir(nome, estado = null) {
  estadoPendente = estado;
  const alvo = nome ? `#${nome}` : '#inicio';
  if (location.hash === alvo) {
    abrir(nome);
    return;
  }
  try {
    location.hash = alvo;
  } catch {
    abrir(nome);
  }
}

function abrir(bruto) {
  // "#pedido?c=MB-XXXXX&t=..." -> rota "pedido" com { params: { c, t } }
  const [nome, busca] = String(bruto).split('?');
  const chave = rotas.has(nome) ? nome : nome === '' || nome === 'inicio' ? 'inicio' : '404';
  const estado = estadoPendente ?? (busca ? { params: Object.fromEntries(new URLSearchParams(busca)) } : null);
  estadoPendente = null;
  if (atual?.destruir) atual.destruir();
  atual = null;
  atual = aoMudar(chave, rotas.get(chave), estado) || null;
}
