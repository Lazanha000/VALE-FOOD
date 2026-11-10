// Service worker: deixa o site abrir sem internet (cardápio e telas já visitadas).
// Estratégia: rede primeiro, cache como reserva. Assim uma edição no site aparece
// na hora para quem está online e nunca fica preso a versão velha.
// Ao mudar a lista abaixo, suba VERSAO para limpar o cache antigo.

// PREFIXO = CONFIG.marca.id + '-' (o service worker não lê o config.js). O cache é
// dividido por endereço (lazanha000.github.io), não por pasta: cada cliente apaga só
// os caches com o próprio prefixo, nunca os de outro site publicado no mesmo endereço.
const PREFIXO = 'modelo-';
const VERSAO = PREFIXO + 'v2';
const ESPERA_MS = 4000;
const BASE = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  'assets/fonts/archivo-latin-wght-normal.woff2', 'assets/fonts/big-shoulders-display-latin-700-normal.woff2',
  'assets/fonts/big-shoulders-display-latin-800-normal.woff2', 'assets/fonts/big-shoulders-display-latin-900-normal.woff2',
  'assets/fonts/ibm-plex-mono-latin-400-normal.woff2', 'assets/fonts/ibm-plex-mono-latin-600-normal.woff2',
  'js/main.js', 'js/ajustar.js', 'js/ajustes.js', 'js/art.js', 'js/box.js', 'js/antifraude.js', 'js/comanda.js', 'js/config.js',
  'js/delivery.js', 'js/horario.js', 'js/mensagem.js', 'js/pix.js', 'js/products.js',
  'js/router.js', 'js/scene.js', 'js/store.js', 'js/ui.js', 'js/utils.js', 'js/whatsapp.js',
  'js/pages/cart.js', 'js/pages/checkout.js', 'js/pages/menu.js', 'js/pages/privacy.js',
  'js/pages/product.js', 'js/pages/tracking.js', 'js/services/api.js', 'js/services/cardapio.js', 'js/vendor/qrcode.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIXO) && k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // só GET do próprio site; WhatsApp, Google Maps e backend passam direto
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // no-cache: confere com o servidor a cada vez (o GitHub Pages deixa o navegador reutilizar arquivos por 10 min)
  const rede = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
    return res;
  });
  const doCache = () => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  // internet ruim (conecta mas não carrega): depois de ESPERA_MS usa o cache, se tiver;
  // sem cópia guardada, continua esperando a rede
  const prazo = new Promise((ok) => setTimeout(() => doCache().then((r) => r && ok(r)), ESPERA_MS));
  e.respondWith(Promise.race([rede, prazo]).catch(() => doCache().then((r) => r || Response.error())));
});
