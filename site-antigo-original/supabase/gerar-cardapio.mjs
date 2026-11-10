// Gera o SQL que copia o cardápio (js/products.js) e os dados da loja (js/config.js) para o banco.
// Uso: node supabase/gerar-cardapio.mjs > supabase/cardapio.sql
// Depois cole supabase/cardapio.sql no SQL Editor do Supabase (depois do schema.sql) e rode.
// ATENÇÃO: o SQL gerado SUBSTITUI cardápio, bairros e horários que estiverem no banco
// (os pedidos não são tocados). Depois que o restaurante começar a mexer pelo painel,
// não rode de novo: o banco passa a ser o dono do cardápio.

import { CONFIG } from '../js/config.js';
import { PRODUTOS, CATEGORIAS } from '../js/products.js';
import { prefixoPedido } from '../js/utils.js';
import { numeroWhatsapp } from '../js/whatsapp.js';

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => `array[${(a || []).map(q).join(', ')}]::text[]`;
const bool = (v) => (v ? 'true' : 'false');
const int = (v) => {
  if (!Number.isInteger(v) || v < 0) throw new Error(`valor em centavos inválido: ${v}`);
  return String(v);
};

const linhas = [
  '-- Gerado por supabase/gerar-cardapio.mjs a partir de js/products.js e js/config.js.',
  '-- Rode DEPOIS do schema.sql. Substitui cardápio, bairros e horários (pedidos ficam).',
  'begin;',
  'delete from public.produtos;   -- apaga grupos e opções junto',
  'delete from public.categorias;',
  'delete from public.bairros;',
  'delete from public.horarios;',
  '',
];

CATEGORIAS.forEach((c, i) => {
  linhas.push(`insert into public.categorias (id, nome, ordem) values (${q(c.id)}, ${q(c.nome)}, ${i});`);
});
linhas.push('');

PRODUTOS.forEach((p, i) => {
  linhas.push(`insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values (${[
    q(p.id), q(p.categoria), q(p.nome), q(p.descricao || ''), int(p.preco), q(p.imagem || null), q(p.arte || null),
    bool(p.destaque), bool(!p.esgotado), arr(p.removiveis), i,
  ].join(', ')});`);
  (p.opcoes || []).forEach((g, gi) => {
    linhas.push(`with g as (insert into public.grupos_opcao (produto_id, chave, nome, tipo, obrigatorio, max, ordem) values (${[
      q(p.id), q(g.id), q(g.nome), q(g.tipo), bool(g.obrigatorio), g.max ? int(g.max) : 'null', gi,
    ].join(', ')}) returning id)`);
    linhas.push(`insert into public.opcoes (grupo_id, chave, nome, preco, ordem) select g.id, x.chave, x.nome, x.preco, x.ordem from g, (values ${
      g.escolhas.map((e, ei) => `(${q(e.id)}, ${q(e.nome)}, ${int(e.preco)}, ${ei})`).join(', ')
    }) as x(chave, nome, preco, ordem);`);
  });
});
linhas.push('');

const e = CONFIG.entrega;
const r = CONFIG.retirada;
for (const b of e.taxa?.tipo === 'bairro' ? e.taxa.bairros || [] : []) {
  linhas.push(`insert into public.bairros (nome, taxa) values (${q(b.nome)}, ${int(b.valor)});`);
}
['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].forEach((d, i) => {
  for (const [abre, fecha] of CONFIG.horario.semana[d] || []) {
    linhas.push(`insert into public.horarios (dia, abre, fecha) values (${i + 1}, ${q(abre)}, ${q(fecha)});`);
  }
});
linhas.push('');

const whats = numeroWhatsapp();
const loja = {
  prefixo_pedido: q(prefixoPedido()),
  whatsapp: whats.length >= 12 ? q(whats) : 'null',
  aberta_manual: 'true',
  bloquear_fechado: bool(CONFIG.horario.bloquearPedidoFechado),
  fuso: q(CONFIG.horario.fuso),
  entrega_ativa: bool(e.ativo),
  entrega_tempo: q(e.tempo),
  entrega_minimo: int(e.pedidoMinimo || 0),
  taxa_tipo: q(e.taxa?.tipo === 'bairro' ? 'bairro' : 'fixa'),
  taxa_fixa: int(e.taxa?.tipo === 'bairro' ? 0 : e.taxa?.valor || 0),
  bairros_sem_entrega: arr(e.bairrosSemEntrega),
  cidades_atendidas: arr(e.cidadesAtendidas),
  retirada_ativa: bool(r.ativo),
  retirada_tempo: q(r.tempo),
  retirada_minimo: int(r.pedidoMinimo || 0),
  retirada_local: q(r.local || ''),
  pix_chave: q(CONFIG.pix?.chave || ''),
  pix_tipo: CONFIG.pix?.tipo ? q(CONFIG.pix.tipo) : 'null',
  pix_nome: q(CONFIG.pix?.nome || ''),
  pix_cidade: q(CONFIG.pix?.cidade || ''),
  pagamentos: arr(CONFIG.pagamentos.map((p) => p.id)),
};
linhas.push(`insert into public.loja (id, ${Object.keys(loja).join(', ')})`);
linhas.push(`values (1, ${Object.values(loja).join(', ')})`);
linhas.push(`on conflict (id) do update set ${Object.keys(loja).map((k) => `${k} = excluded.${k}`).join(', ')};`);
linhas.push('commit;');

console.log(linhas.join('\n'));
