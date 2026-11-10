// Confere se o site está pronto para publicar para um cliente real.
// Uso: node conferir-modelo.mjs   (Node 18 ou mais novo, sem instalar nada)
// Sai com código 1 e lista o que falta. No modelo genérico ele FALHA de propósito:
// os placeholders (Sua Marca, SUA CIDADE, chave Pix vazia...) estão lá para serem trocados.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './js/config.js';
import { PRODUTOS } from './js/products.js';
import { CHAVES } from './js/utils.js';
import { validarPix } from './js/pix.js';
import { conferirConfig } from './js/delivery.js';
import { numeroWhatsapp } from './js/whatsapp.js';

const raiz = fileURLToPath(new URL('.', import.meta.url));
const ler = (f) => readFileSync(join(raiz, f), 'utf8');
const problemas = [];
const falha = (msg) => problemas.push(msg);

// ---- 1. Textos de exemplo esquecidos ----
// js/pix.js fica de fora: ele contém SUA MARCA / SUA CIDADE justamente para recusá-los.
const IGNORAR = new Set(['js/pix.js', 'js/vendor/qrcode.js']);
const PLACEHOLDERS = [
  [/sua marca/i, 'Sua Marca'], [/SUA\s*<b>\s*MARCA/i, 'SUA<b>MARCA</b>'], [/sua cidade/i, 'Sua Cidade / SUA CIDADE'],
  [/xx\.xxx\.xxx/i, 'CNPJ xx.xxx.xxx/0001-xx'], [/Rua Exemplo/i, 'Rua Exemplo'],
  [new RegExp(['exemplo', 'burguer'].join('-'), 'i'), 'prefixo antigo do site de exemplo'],
  [/suamarca/i, 'e-mail/domínio suamarca'], [/SEU-USUARIO|SEU-REPOSITORIO/, 'endereço de exemplo SEU-USUARIO'],
];
// O número de teste (WhatsApp e chave Pix da demonstração) não fica escrito aqui (é pessoal): guardamos só
// o sha256 dele e comparamos com o sha256 de cada número de telefone encontrado.
const NUMERO_TESTE_SHA256 = '2ceb2601b55afb9c1bd11208f12b22565d0840964c5fdd61f7a6e2d20f8ef010';
const temNumeroTeste = (linha) => (linha.match(/\+?\d[\d\s().-]{8,}\d/g) || [])
  .some((m) => createHash('sha256').update(m.replace(/\D/g, '').slice(-11)).digest('hex') === NUMERO_TESTE_SHA256);
const jsDe = (d) => readdirSync(join(raiz, d)).flatMap((f) => (statSync(join(raiz, d, f)).isDirectory() ? jsDe(`${d}/${f}`) : f.endsWith('.js') ? [`${d}/${f}`] : []));
for (const arq of ['index.html', 'manifest.webmanifest', 'sw.js', ...jsDe('js')]) {
  if (IGNORAR.has(arq)) continue;
  ler(arq).split('\n').forEach((linha, i) => {
    for (const [re, nome] of PLACEHOLDERS) if (re.test(linha)) falha(`${arq}:${i + 1}: ainda tem "${nome}"`);
    if (temNumeroTeste(linha)) falha(`${arq}:${i + 1}: ainda tem o número de teste (WhatsApp/Pix da demonstração)`);
  });
}

// ---- 2. Identidade do cliente (id, cache, tema, CSP) ----
const sw = ler('sw.js');
const html = ler('index.html');
const id = CONFIG.marca.id;
if (!/^[a-z0-9-]+$/.test(id || '')) falha(`js/config.js: marca.id "${id}" deve ter só minúsculas, números e hífen`);
if (id === 'modelo') falha('js/config.js: marca.id ainda é "modelo" (use um id próprio do cliente, ex.: "jeyjey")');
const prefixo = /const PREFIXO = '([^']*)'/.exec(sw)?.[1];
const versao = /const VERSAO = PREFIXO \+ '([^']*)'/.exec(sw)?.[1];
if (prefixo !== `${id}-`) falha(`sw.js: PREFIXO é '${prefixo}', deveria ser '${id}-' (igual ao marca.id)`);
if (prefixo === 'modelo-' && versao === 'v1') falha('sw.js: VERSAO ainda é a do modelo (modelo-v1)');
if (!html.includes(`localStorage.getItem("${CHAVES.tema}")`)) falha(`index.html: o script do tema deve ler "${CHAVES.tema}" (troque junto com marca.id)`);
const inline = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
if (inline != null) {
  const hash = createHash('sha256').update(inline, 'utf8').digest('base64');
  if (!html.includes(`'sha256-${hash}'`)) falha(`index.html: hash da CSP não confere com o script do tema; troque por 'sha256-${hash}'`);
}

// ---- 3. Dados do comércio ----
if (numeroWhatsapp().length < 12) falha('js/config.js: whatsapp.numero não configurado (o pedido não chega a ninguém)');
const usaPix = CONFIG.pagamentos.some((p) => p.id === 'pix');
if (CONFIG.pix?.chave) validarPix(CONFIG.pix).forEach((e) => falha(`js/config.js: ${e}`));
else if (usaPix) falha('js/config.js: "Pix" está nas formas de pagamento, mas pix.chave está vazia (sem QR); preencha ou tire o Pix de pagamentos');
if (!CONFIG.horario?.bloquearPedidoFechado) falha('js/config.js: horario.bloquearPedidoFechado é false (só para demonstração; cliente real usa true)');
if (CONFIG.modoDemonstracao) falha('js/config.js: modoDemonstracao é true');
const pv = CONFIG.privacidade || {};
if (!pv.email && !pv.telefone) falha('js/config.js: privacidade sem e-mail nem telefone de contato');
if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(pv.cnpj || '') && !/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(pv.cnpj || '')) falha(`js/config.js: privacidade.cnpj "${pv.cnpj}" não parece um CNPJ (00.000.000/0000-00)`);
conferirConfig().forEach((e) => { if (!e.startsWith('Pix')) falha(`config: ${e}`); });

// ---- 4. Arquivos que precisam existir ----
const existe = (rel, onde) => { if (rel && !existsSync(join(raiz, rel))) falha(`${onde}: arquivo não existe: ${rel}`); };
for (const p of PRODUTOS) existe(p.imagem, `js/products.js (${p.id})`);
for (const [k, v] of Object.entries(CONFIG.fotosCena || {})) existe(v, `CONFIG.fotosCena.${k}`);
existe(CONFIG.embalagem?.frente, 'CONFIG.embalagem.frente');
existe(CONFIG.embalagem?.selo, 'CONFIG.embalagem.selo');
// todo arquivo .js precisa estar no cache do sw.js (senão o site não abre sem internet)
for (const arq of jsDe('js')) if (!sw.includes(`'${arq}'`)) falha(`sw.js: ${arq} não está na lista BASE (e suba a VERSAO)`);
for (const arq of jsDe('js')) if (arq !== 'js/vendor/qrcode.js' && !html.includes(`href="${arq}"`)) falha(`index.html: falta <link rel="modulepreload" href="${arq}">`);
const manifesto = JSON.parse(ler('manifest.webmanifest'));
for (const i of manifesto.icons || []) existe(i.src, 'manifest.webmanifest');

// ---- 5. Preços em centavos (inteiros) ----
for (const p of PRODUTOS) {
  if (!Number.isInteger(p.preco) || p.preco < 0) falha(`js/products.js (${p.id}): preço ${p.preco} não é inteiro em centavos (ex.: 1290 = R$ 12,90)`);
  for (const g of p.opcoes || []) for (const e of g.escolhas || []) if (!Number.isInteger(e.preco) || e.preco < 0) falha(`js/products.js (${p.id} > ${e.id}): preço ${e.preco} não é inteiro em centavos`);
}

// ---- 6. Dados da loja no banco (com Supabase ligado, o site usa os do banco, não os do config.js) ----
// A tabela loja é pública: lê com a chave publishable, como o site. Sem internet só avisa.
if (CONFIG.api?.supabaseUrl && CONFIG.api?.chavePublica && !CONFIG.modoDemonstracao) {
  try {
    const r = await fetch(`${String(CONFIG.api.supabaseUrl).replace(/\/+$/, '')}/rest/v1/loja?select=*`, {
      headers: { apikey: CONFIG.api.chavePublica, Authorization: `Bearer ${CONFIG.api.chavePublica}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`resposta ${r.status}`);
    const l = (await r.json())[0];
    if (!l) falha('banco: tabela loja vazia (rode supabase/instalar.sql)');
    else {
      if (temNumeroTeste(l.whatsapp || '')) falha('banco (Table Editor > loja): whatsapp ainda é o número de teste');
      if (temNumeroTeste(l.pix_chave || '')) falha('banco (Table Editor > loja): pix_chave ainda é a chave de teste');
      if (!l.whatsapp) falha('banco (Table Editor > loja): whatsapp vazio');
      if (l.pagamentos?.includes('pix') && !l.pix_chave) falha('banco (Table Editor > loja): Pix aceito, mas pix_chave vazia');
      for (const [campo, valor] of Object.entries({ retirada_local: l.retirada_local, pix_nome: l.pix_nome, pix_cidade: l.pix_cidade })) {
        for (const [re, nome] of PLACEHOLDERS) if (re.test(valor || '')) falha(`banco (Table Editor > loja): ${campo} ainda tem "${nome}"`);
      }
      if (/^MODELO/i.test(l.pix_nome || '')) falha('banco (Table Editor > loja): pix_nome ainda é o do modelo (use o nome do titular da chave)');
    }
  } catch (e) {
    console.log(`(aviso) não deu para conferir os dados da loja no banco: ${e.message}`);
  }
}

if (problemas.length) {
  console.log(`conferir-modelo: ${problemas.length} pendência(s) antes de publicar:\n`);
  for (const p of problemas) console.log(`  - ${p}`);
  console.log(`\n(${relative(process.cwd(), raiz) || '.'}) Corrija e rode de novo. No modelo genérico, estas falhas são esperadas.`);
  process.exit(1);
}
console.log('conferir-modelo: tudo certo para publicar.');
