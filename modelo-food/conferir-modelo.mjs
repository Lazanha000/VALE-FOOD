// Confere se a PLATAFORMA está pronta para operar com clientes reais.
// Uso: node conferir-modelo.mjs   (Node 18 ou mais novo, sem instalar nada)
// Sai com código 1 e lista o que falta. Enquanto CNPJ, nome definitivo e lojas reais
// não forem preenchidos, ele FALHA de propósito: a lista é o que ainda depende de você.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './js/config.js';
import { PRODUTOS_BASE } from './js/products.js';
import { CHAVES } from './js/utils.js';
import { PLATAFORMA } from './js/marketplace/dados.js';

const raiz = fileURLToPath(new URL('.', import.meta.url));
const ler = (f) => readFileSync(join(raiz, f), 'utf8');
const problemas = [];
const falha = (onde, msg) => problemas.push(`${onde}: ${msg}`);
const avisos = [];

// ---- 1. Dados da empresa (Decreto 7.962/2013 e LGPD) ----
const pv = CONFIG.privacidade || {};
if (!pv.controlador) falha('js/config.js', 'privacidade.controlador vazio (razão social da empresa)');
if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(pv.cnpj || '')) falha('js/config.js', `privacidade.cnpj "${pv.cnpj || ''}" vazio ou fora do formato 00.000.000/0000-00`);
if (!pv.email) falha('js/config.js', 'privacidade.email vazio (contato para dados pessoais e suporte)');
if (!pv.endereco) falha('js/config.js', 'privacidade.endereco vazio (endereço da empresa, obrigatório no rodapé)');

// ---- 2. Nome da marca: o mesmo em todo lugar ----
const html = ler('index.html');
const manifesto = JSON.parse(ler('manifest.webmanifest'));
if (PLATAFORMA.provisorio) falha('js/marketplace/dados.js', `PLATAFORMA.provisorio é true (nome "${PLATAFORMA.nome}" ainda é provisório)`);
if (!html.includes(`<title>${PLATAFORMA.nome}</title>`)) falha('index.html', `<title> não é "${PLATAFORMA.nome}" (igual a PLATAFORMA.nome)`);
if (!html.includes(`og:site_name" content="${PLATAFORMA.nome}"`)) falha('index.html', `og:site_name não é "${PLATAFORMA.nome}"`);
if (manifesto.name !== PLATAFORMA.nome) falha('manifest.webmanifest', `name é "${manifesto.name}", deveria ser "${PLATAFORMA.nome}"`);

// ---- 3. Sistema ligado de verdade ----
if (CONFIG.modoDemonstracao) falha('js/config.js', 'modoDemonstracao é true (pedidos não chegam a ninguém)');
if (!CONFIG.api?.supabaseUrl || !CONFIG.api?.chavePublica) falha('js/config.js', 'api sem supabaseUrl ou chavePublica');
if (/sb_secret_\w{8,}/.test(ler('js/config.js'))) falha('js/config.js', 'tem uma chave SECRETA do Supabase. Tire na hora e troque a chave no Supabase');

// ---- 4. Arquivos e segurança do site ----
const sw = ler('sw.js');
const prefixo = /const PREFIXO = '([^']*)'/.exec(sw)?.[1];
if (prefixo !== `${CONFIG.marca.id}-`) falha('sw.js', `PREFIXO é '${prefixo}', deveria ser '${CONFIG.marca.id}-' (igual a marca.id em js/config.js)`);
if (!html.includes(`localStorage.getItem("${CHAVES.tema}")`)) falha('index.html', `o script do tema deve ler "${CHAVES.tema}"`);
const inline = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
if (inline != null) {
  const hash = createHash('sha256').update(inline, 'utf8').digest('base64');
  if (!html.includes(`'sha256-${hash}'`)) falha('index.html', `hash da CSP não confere com o script do tema; troque por 'sha256-${hash}'`);
}
const jsDe = (d) => readdirSync(join(raiz, d)).flatMap((f) => (statSync(join(raiz, d, f)).isDirectory() ? jsDe(`${d}/${f}`) : f.endsWith('.js') ? [`${d}/${f}`] : []));
for (const arq of jsDe('js')) if (!sw.includes(`'${arq}'`)) falha('sw.js', `${arq} não está na lista BASE (e suba a VERSAO)`);
for (const i of manifesto.icons || []) if (!existsSync(join(raiz, i.src))) falha('manifest.webmanifest', `ícone não existe: ${i.src}`);
for (const p of PRODUTOS_BASE) if (p.imagem && !existsSync(join(raiz, p.imagem))) falha(`js/products.js (${p.id})`, `foto não existe: ${p.imagem}`);

// ---- 5. Banco: lojas aprovadas (lê com a chave pública, como o site). Sem internet só avisa. ----
if (CONFIG.api?.supabaseUrl && CONFIG.api?.chavePublica && !CONFIG.modoDemonstracao) {
  const base = `${String(CONFIG.api.supabaseUrl).replace(/\/+$/, '')}/rest/v1`;
  const h = { apikey: CONFIG.api.chavePublica, Authorization: `Bearer ${CONFIG.api.chavePublica}` };
  try {
    const r = await fetch(`${base}/estabelecimentos?select=id,nome`, { headers: h, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`resposta ${r.status} (rodou o supabase/plataforma.sql?)`);
    const lojas = await r.json();
    if (!lojas.length) falha('banco', 'nenhum estabelecimento aprovado (o site abre vazio)');
    else console.log(`banco: ${lojas.length} estabelecimento(s) aprovado(s): ${lojas.map((l) => l.nome).join(', ')}`);
  } catch (e) {
    avisos.push(`não deu para conferir o banco: ${e.message}`);
  }
}

for (const a of avisos) console.log(`(aviso) ${a}`);
if (problemas.length) {
  console.log(`\nconferir-modelo: ${problemas.length} pendência(s) antes de operar:\n`);
  for (const p of problemas) console.log(`  - ${p}`);
  console.log('\nCorrija e rode de novo.');
  process.exit(1);
}
console.log('\nconferir-modelo: tudo certo para operar.');
