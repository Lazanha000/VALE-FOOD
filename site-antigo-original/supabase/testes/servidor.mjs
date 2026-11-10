// Servidor estático para os testes no navegador. O js/config.js sai com o Supabase de teste ligado (SUPA).

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPA = 'https://teste.supabase.co';
const raiz = fileURLToPath(new URL('../../', import.meta.url));
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

export async function servirSite() {
  const servidor = createServer(async (req, res) => {
    const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
    try {
      let corpo = await readFile(join(raiz, caminho));
      if (caminho === 'js/config.js') {
        const antes = corpo.toString();
        const depois = antes.replace(/api: \{ supabaseUrl: [^}]*\}/, `api: { supabaseUrl: '${SUPA}', chavePublica: 'sb_publishable_teste' }`);
        assert.notEqual(antes, depois, 'não achei a linha api: no config.js');
        corpo = depois;
      }
      res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(corpo);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${servidor.address().port}/`, fechar: () => servidor.close() };
}
