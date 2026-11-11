-- ============================================================
-- BANCO DA PLATAFORMA (vários estabelecimentos) — Supabase / Postgres
--
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo depois (para atualizar funções e regras): não apaga dados.
-- Passo a passo: supabase/LEIAME-PLATAFORMA.md
--
-- Substitui o schema.sql do site antigo (que era de UMA loja). Não rode os dois no mesmo projeto.
--
-- Quem pode o quê:
--   * visitante (anon): lê estabelecimentos APROVADOS e os cardápios deles; cria pedido,
--     acompanha, avalia e abre chamado SÓ pelas funções. Não lê pedido nenhum direto.
--   * usuário logado sem loja: cadastra um estabelecimento (fica "pendente" até a aprovação).
--   * equipe de um estabelecimento (tabela equipe), por loja:
--       - 'cozinha': lê os pedidos DAQUELA loja, muda status e pagamento, esgotado, abre/fecha;
--       - 'dono': tudo isso e mais cardápio, preços, horários, entrega, Pix, equipe e documentos.
--   * administração da plataforma (tabela admins): vê e muda tudo, aprova e suspende lojas,
--     atende chamados e controla mensalidades.
--   * o banco recalcula preço, taxa e total: o navegador manda só o pedido, nunca valor.
-- ============================================================

set client_min_messages = warning;

-- ============================================================
-- TABELAS
-- ============================================================

-- ---------- ADMINISTRAÇÃO DA PLATAFORMA ----------
-- Para virar admin: crie sua conta e rode (troque o e-mail):
--   insert into public.admins (user_id, nome) select id, 'Seu nome' from auth.users where email = 'voce@exemplo.com';
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  criado_em timestamptz not null default now()
);

-- ---------- ESTABELECIMENTOS ----------
-- Tudo aqui é público quando a loja está aprovada: não guarde segredo nesta tabela
-- (documento, contato do dono etc. ficam em estabelecimentos_privado).
create table if not exists public.estabelecimentos (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),        -- vai no endereço: #loja/lanchonete-do-ze
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovado', 'recusado', 'suspenso')),
  nome text not null check (length(nome) between 2 and 60),
  nome_curto text not null default '' check (length(nome_curto) <= 20),   -- 1ª linha do logo (ex.: LANCHONETE)
  sufixo text not null default '' check (length(sufixo) <= 20),           -- 2ª linha do logo (ex.: DO ZÉ)
  categoria text not null check (categoria in ('lanchonetes', 'restaurantes', 'farmacias', 'mercados', 'padarias', 'outros')),
  cidade text not null check (length(cidade) between 2 and 60),
  descricao text not null default '' check (length(descricao) <= 160),
  telefone_publico text check (telefone_publico ~ '^[0-9]{10,11}$'),      -- usado no suporte ao cliente
  logo text,                                                               -- caminho no Storage (bucket produtos)
  prefixo_pedido text not null default 'PD' check (prefixo_pedido ~ '^[A-Z]{1,4}$'),
  whatsapp text check (whatsapp ~ '^[0-9]{12,13}$'),                      -- com 55 na frente
  aberta_manual boolean not null default true,
  bloquear_fechado boolean not null default true,
  fuso text not null default 'America/Sao_Paulo',
  entrega_ativa boolean not null default true,
  entrega_tempo text not null default '45 min' check (length(entrega_tempo) <= 30),
  entrega_minimo integer not null default 0 check (entrega_minimo between 0 and 1000000),
  taxa_tipo text not null default 'fixa' check (taxa_tipo in ('fixa', 'bairro')),
  taxa_fixa integer not null default 0 check (taxa_fixa between 0 and 1000000),
  bairros_sem_entrega text[] not null default '{}',
  cidades_atendidas text[] not null default '{}',
  retirada_ativa boolean not null default true,
  retirada_tempo text not null default '30 min' check (length(retirada_tempo) <= 30),
  retirada_minimo integer not null default 0 check (retirada_minimo between 0 and 1000000),
  retirada_local text not null default '' check (length(retirada_local) <= 160),
  pix_chave text not null default '' check (length(pix_chave) <= 77),
  pix_tipo text check (pix_tipo in ('telefone', 'cpf', 'cnpj', 'email', 'aleatoria')),
  pix_nome text not null default '' check (length(pix_nome) <= 25),
  pix_cidade text not null default '' check (length(pix_cidade) <= 15),
  pagamentos text[] not null default '{pix,credito,debito,dinheiro}',
  avaliacoes_qtd integer not null default 0,     -- mantidos pelo banco (gatilho das avaliações)
  avaliacoes_soma integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists estabelecimentos_vitrine on public.estabelecimentos (situacao, categoria, cidade);

-- Dados que só o dono e a administração veem
create table if not exists public.estabelecimentos_privado (
  estabelecimento_id text primary key references public.estabelecimentos (id) on update cascade on delete cascade,
  documento_tipo text not null check (documento_tipo in ('cpf', 'cnpj')),
  documento text not null check (documento ~ '^[0-9]{11}$|^[0-9]{14}$'),
  razao_social text not null default '' check (length(razao_social) <= 120),
  responsavel_nome text not null check (length(responsavel_nome) between 3 and 80),
  responsavel_telefone text not null check (responsavel_telefone ~ '^[0-9]{10,11}$'),
  responsavel_email text not null default '' check (length(responsavel_email) <= 100),
  endereco text not null default '' check (length(endereco) <= 200),
  aceites jsonb not null default '{}',            -- { termos: data, privacidade: data, ... } no momento do cadastro
  situacao_motivo text not null default '' check (length(situacao_motivo) <= 300)   -- motivo de recusa/suspensão
);

-- ---------- EQUIPE (quem entra no painel de cada loja) ----------
create table if not exists public.equipe (
  estabelecimento_id text not null references public.estabelecimentos (id) on update cascade on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null default '' check (length(nome) <= 80),
  papel text not null default 'cozinha' check (papel in ('dono', 'cozinha')),
  criado_em timestamptz not null default now(),
  primary key (estabelecimento_id, user_id)
);
create index if not exists equipe_usuario on public.equipe (user_id);

-- ---------- CARDÁPIO (cada linha é de um estabelecimento) ----------
create table if not exists public.categorias (
  estabelecimento_id text not null references public.estabelecimentos (id) on update cascade on delete cascade,
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  nome text not null check (length(nome) between 1 and 40),
  ordem integer not null default 0,
  ativo boolean not null default true,
  primary key (estabelecimento_id, id)
);

create table if not exists public.produtos (
  estabelecimento_id text not null references public.estabelecimentos (id) on update cascade on delete cascade,
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  categoria_id text not null,
  nome text not null check (length(nome) between 1 and 60),
  descricao text not null default '' check (length(descricao) <= 300),
  preco integer not null check (preco between 0 and 1000000),   -- centavos
  imagem text,
  arte text,
  destaque boolean not null default false,
  disponivel boolean not null default true,   -- false = "Esgotado"
  ativo boolean not null default true,        -- false = some do cardápio
  removiveis text[] not null default '{}',
  ordem integer not null default 0,
  primary key (estabelecimento_id, id),
  foreign key (estabelecimento_id, categoria_id) references public.categorias (estabelecimento_id, id) on update cascade
);

create table if not exists public.grupos_opcao (
  id bigint generated always as identity primary key,
  estabelecimento_id text not null,
  produto_id text not null,
  chave text not null check (chave ~ '^[a-z0-9-]{1,40}$'),
  nome text not null check (length(nome) between 1 and 40),
  tipo text not null check (tipo in ('unica', 'multipla')),
  obrigatorio boolean not null default false,
  max integer check (max between 1 and 20),
  ordem integer not null default 0,
  unique (estabelecimento_id, produto_id, chave),
  unique (id, estabelecimento_id),
  foreign key (estabelecimento_id, produto_id) references public.produtos (estabelecimento_id, id) on update cascade on delete cascade
);

create table if not exists public.opcoes (
  id bigint generated always as identity primary key,
  estabelecimento_id text not null,
  grupo_id bigint not null,
  chave text not null check (chave ~ '^[a-z0-9-]{1,40}$'),
  nome text not null check (length(nome) between 1 and 60),
  preco integer not null default 0 check (preco between 0 and 1000000),
  ativo boolean not null default true,
  ordem integer not null default 0,
  unique (grupo_id, chave),
  foreign key (grupo_id, estabelecimento_id) references public.grupos_opcao (id, estabelecimento_id) on update cascade on delete cascade
);

create table if not exists public.bairros (
  id bigint generated always as identity primary key,
  estabelecimento_id text not null references public.estabelecimentos (id) on update cascade on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  taxa integer not null check (taxa between 0 and 1000000),
  ativo boolean not null default true,
  unique (estabelecimento_id, nome)
);

-- dia: 1 = segunda ... 7 = domingo. Faixa que passa da meia-noite: abre 18:00, fecha 02:00.
create table if not exists public.horarios (
  id bigint generated always as identity primary key,
  estabelecimento_id text not null references public.estabelecimentos (id) on update cascade on delete cascade,
  dia smallint not null check (dia between 1 and 7),
  abre time not null,
  fecha time not null,
  check (abre <> fecha)
);
create index if not exists horarios_estab on public.horarios (estabelecimento_id, dia);

-- ---------- PEDIDOS ----------
create table if not exists public.pedidos (
  id bigint generated always as identity primary key,
  estabelecimento_id text not null references public.estabelecimentos (id) on update cascade on delete restrict,
  codigo text not null unique check (codigo ~ '^[A-Z]{1,4}-[A-Z0-9]{5}$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  status text not null default 'recebido'
    check (status in ('recebido', 'preparo', 'pronto', 'saiu', 'entregue', 'cancelado')),
  pagamento_status text not null default 'pendente' check (pagamento_status in ('pendente', 'confirmado', 'cancelado')),
  modo text not null check (modo in ('entrega', 'retirada')),
  cliente_nome text not null,
  cliente_telefone text not null,
  cliente_email text,
  entrega jsonb,
  pagamento_forma text not null,
  troco_para integer,
  obs text not null default '',
  subtotal integer not null,
  desconto integer not null default 0,
  taxa integer not null,
  total integer not null
);
create index if not exists pedidos_estab_criado on public.pedidos (estabelecimento_id, criado_em desc);
create index if not exists pedidos_criado on public.pedidos (criado_em desc);
create index if not exists pedidos_telefone on public.pedidos (cliente_telefone, criado_em desc);

create table if not exists public.pedido_itens (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos (id) on delete cascade,
  ordem integer not null,
  produto_id text not null,
  nome text not null,
  qtd integer not null check (qtd between 1 and 20),
  preco_unitario integer not null,
  escolhas jsonb not null default '[]',
  remover text[] not null default '{}',
  obs text not null default ''
);
create index if not exists pedido_itens_pedido on public.pedido_itens (pedido_id, ordem);

-- Segredos do pedido (token do link e chave do envio). Ninguém lê pela API: só as funções.
create table if not exists public.pedidos_acesso (
  pedido_id bigint primary key references public.pedidos (id) on delete cascade,
  chave_envio uuid not null unique,
  token text not null,
  ip_hash text
);
create index if not exists pedidos_acesso_ip on public.pedidos_acesso (ip_hash);

-- ---------- AVALIAÇÕES (uma por pedido, depois de entregue) ----------
create table if not exists public.avaliacoes (
  pedido_id bigint primary key references public.pedidos (id) on delete cascade,
  estabelecimento_id text not null references public.estabelecimentos (id) on update cascade on delete cascade,
  nota smallint not null check (nota between 0 and 5),
  comentario text not null default '' check (length(comentario) <= 500),
  criado_em timestamptz not null default now()
);
create index if not exists avaliacoes_estab on public.avaliacoes (estabelecimento_id, criado_em desc);

-- ---------- CHAMADOS DE SUPORTE (atendidos pela administração) ----------
create table if not exists public.chamados (
  id bigint generated always as identity primary key,
  pedido_id bigint references public.pedidos (id) on delete set null,
  estabelecimento_id text references public.estabelecimentos (id) on update cascade on delete set null,
  motivo text not null check (motivo in ('nao_entregue', 'errado', 'demorando', 'outro')),
  descricao text not null default '' check (length(descricao) <= 1000),
  telefone text not null check (telefone ~ '^[0-9]{10,11}$'),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'resolvido')),
  resposta text not null default '' check (length(resposta) <= 1000),
  ip_hash text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists chamados_situacao on public.chamados (situacao, criado_em desc);
-- motivo 'dados' = pedido do titular sobre os próprios dados (LGPD, art. 18): acesso, correção ou exclusão
alter table public.chamados drop constraint if exists chamados_motivo_check;
alter table public.chamados add constraint chamados_motivo_check check (motivo in ('nao_entregue', 'errado', 'demorando', 'outro', 'dados'));

-- ---------- MENSALIDADES (controle da administração; o pagamento é feito por fora) ----------
create table if not exists public.mensalidades (
  id bigint generated always as identity primary key,
  estabelecimento_id text not null references public.estabelecimentos (id) on update cascade on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),   -- 1º dia do mês
  valor integer not null check (valor between 0 and 10000000),            -- centavos
  situacao text not null default 'aberta' check (situacao in ('aberta', 'paga', 'isenta')),
  pago_em date,
  obs text not null default '' check (length(obs) <= 300),
  unique (estabelecimento_id, competencia)
);

-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create or replace function public.eh_equipe(estab text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipe e where e.user_id = auth.uid() and e.estabelecimento_id = estab);
$$;

create or replace function public.eh_dono(estab text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipe e where e.user_id = auth.uid() and e.estabelecimento_id = estab and e.papel = 'dono');
$$;

-- loja aparece para o público?
create or replace function public.eh_publico(estab text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.estabelecimentos x where x.id = estab and x.situacao = 'aprovado');
$$;

create or replace function public._sem_acento(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(trim(translate(coalesce(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')));
$$;

create or replace function public._texto(v jsonb, campo text, max int) returns text
language plpgsql immutable set search_path = '' as $$
declare t text;
begin
  if v is null or jsonb_typeof(v) = 'null' then return ''; end if;
  if jsonb_typeof(v) <> 'string' then raise exception 'Confira o campo %.', campo; end if;
  t := trim(v #>> '{}');
  if length(t) > max then raise exception 'O campo % passou do tamanho máximo (% letras).', campo, max; end if;
  if t ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Confira o campo %.', campo; end if;
  return t;
end;
$$;

create or replace function public._inteiro(v jsonb, campo text) returns integer
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,9}$' then
    raise exception 'Confira o valor de %.', campo;
  end if;
  if (v #>> '{}')::bigint > 1000000 then raise exception 'O valor de % passou de R$ 10.000,00.', campo; end if;
  return (v #>> '{}')::int;
end;
$$;

create or replace function public._sim_nao(v jsonb, campo text) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) <> 'boolean' then raise exception 'Confira o campo %.', campo; end if;
  return (v #>> '{}')::boolean;
end;
$$;

-- telefone brasileiro com DDD, só dígitos (10 ou 11); inválido -> null
create or replace function public._telefone(t text) returns text
language sql immutable set search_path = '' as $$
  select case when d ~ '^[1-9][1-9][0-9]{8}$' or d ~ '^[1-9][1-9]9[0-9]{8}$' then d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x;
$$;

-- hash do IP de quem chamou (cf-connecting-ip, posto pela Cloudflare do Supabase)
create or replace function public._ip_hash() returns text
language plpgsql stable set search_path = '' as $$
declare v_ip text;
begin
  begin
    v_ip := coalesce(
      nullif(trim(current_setting('request.headers', true)::json ->> 'cf-connecting-ip'), ''),
      trim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)));
  exception when others then v_ip := null;
  end;
  if coalesce(v_ip, '') = '' then return null; end if;
  return encode(sha256(convert_to('ip:' || v_ip, 'UTF8')), 'hex');
end;
$$;

-- CPF/CNPJ com dígitos verificadores certos
create or replace function public._documento_ok(d text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  s int; r int; i int;
  p1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  p2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if d is null or d ~ '^(\d)\1+$' then return false; end if;
  if d ~ '^[0-9]{11}$' then
    s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  elsif d ~ '^[0-9]{14}$' then
    s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * p1[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * p2[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  end if;
  return false;
end;
$$;

-- loja aberta neste instante? (botão "fechada agora" + horários, no fuso da loja)
create or replace function public._loja_aberta(estab text, agora timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.estabelecimentos;
  local_ts timestamp;
  hoje int;
  ontem int;
  h time;
begin
  select * into l from public.estabelecimentos where id = estab;
  if not found or not l.aberta_manual then return false; end if;
  local_ts := agora at time zone l.fuso;
  hoje := extract(isodow from local_ts)::int;
  ontem := case when hoje = 1 then 7 else hoje - 1 end;
  h := local_ts::time;
  return exists (
    select 1 from public.horarios x
    where x.estabelecimento_id = estab and (
          (x.dia = hoje and x.abre < x.fecha and h >= x.abre and h < x.fecha)
       or (x.dia = hoje and x.fecha < x.abre and h >= x.abre)
       or (x.dia = ontem and x.fecha < x.abre and h < x.fecha))
  );
end;
$$;

-- pedido no formato do site (js/services/api.js). Sem nome, telefone nem endereço do cliente.
create or replace function public._pedido_json(pid bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'codigo', p.codigo,
    'criadoEm', p.criado_em,
    'status', p.status,
    'pagamentoStatus', p.pagamento_status,
    'modo', p.modo,
    'pagamentoForma', p.pagamento_forma,
    'trocoPara', p.troco_para,
    'cupom', null,
    'subtotal', p.subtotal,
    'desconto', p.desconto,
    'taxa', p.taxa,
    'total', p.total,
    'estabelecimento', jsonb_build_object('id', e.id, 'nome', e.nome, 'telefone', e.telefone_publico, 'whatsapp', e.whatsapp),
    'avaliado', exists (select 1 from public.avaliacoes a where a.pedido_id = p.id),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', i.nome, 'qtd', i.qtd, 'precoUnitario', i.preco_unitario,
        'escolhas', i.escolhas, 'remover', to_jsonb(i.remover), 'obs', i.obs) order by i.ordem)
      from public.pedido_itens i where i.pedido_id = p.id), '[]'::jsonb)
  )
  from public.pedidos p join public.estabelecimentos e on e.id = p.estabelecimento_id
  where p.id = pid;
$$;

-- id do pedido pelo código + token do link (null se não bater)
create or replace function public._pedido_do_link(codigo text, token text) returns bigint
language sql stable security definer set search_path = '' as $$
  select p.id from public.pedidos p join public.pedidos_acesso a on a.pedido_id = p.id
  -- nomes qualificados: sem isso "token" seria a coluna a.token (e bateria sempre)
  where _pedido_do_link.token ~ '^[A-Za-z0-9]{32}$' and length(_pedido_do_link.codigo) <= 12
    and p.codigo = upper(trim(_pedido_do_link.codigo)) and a.token = _pedido_do_link.token;
$$;

-- ============================================================
-- criar_pedido(estabelecimento, dados, chave) — o site chama ao confirmar o pedido
--   dados = paraServidor(pedido) de js/services/api.js
--   chave = uuid do envio: repetir com a mesma chave devolve o MESMO pedido
-- ============================================================
create or replace function public.criar_pedido(estabelecimento text, dados jsonb, chave uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.estabelecimentos;
  existente bigint;
  v_modo text;
  v_nome text;
  v_tel text;
  v_email text;
  v_entrega jsonb;
  v_bairro text;
  v_cidade text;
  v_forma text;
  v_troco integer;
  v_obs text;
  v_taxa integer := 0;
  v_minimo integer;
  v_subtotal integer := 0;
  v_itens jsonb := '[]'::jsonb;
  it jsonb;
  prod public.produtos;
  g record;
  sel jsonb;
  op public.opcoes;
  v_unit integer;
  v_qtd integer;
  v_escolhas jsonb;
  v_remover text[];
  v_item_obs text;
  ch text;
  v_ip_hash text;
  v_codigo text;
  v_token text;
  v_id bigint;
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  n int;
begin
  if chave is null then raise exception 'Envio sem identificação. Atualize a página e tente de novo.'; end if;
  if dados is null or jsonb_typeof(dados) <> 'object' then raise exception 'Pedido inválido. Atualize a página e tente de novo.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(chave::text, 0));
  select a.pedido_id into existente from public.pedidos_acesso a where a.chave_envio = chave;
  if existente is not null then
    return public._pedido_json(existente)
      || jsonb_build_object('token', (select a.token from public.pedidos_acesso a where a.pedido_id = existente));
  end if;

  select * into l from public.estabelecimentos x where x.id = estabelecimento and x.situacao = 'aprovado';
  if not found then raise exception 'Este estabelecimento não está recebendo pedidos pelo site.'; end if;

  if l.bloquear_fechado and not public._loja_aberta(l.id) then
    raise exception 'O estabelecimento está fechado no momento. Confira o horário na página dele.';
  end if;

  -- ---- cliente ----
  v_nome := public._texto(dados #> '{cliente,nome}', 'nome', 80);
  if (select count(*) from regexp_split_to_table(v_nome, '\s+') p where length(p) >= 2) < 2 then
    raise exception 'Digite nome e sobrenome.';
  end if;
  v_tel := public._telefone(public._texto(dados #> '{cliente,telefone}', 'telefone', 20));
  if v_tel is null then raise exception 'Digite um telefone com DDD, como (33) 98765-4321.'; end if;
  v_email := nullif(public._texto(dados #> '{cliente,email}', 'e-mail', 100), '');
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Digite um e-mail válido ou deixe em branco.';
  end if;

  -- ---- limite de pedidos (contra pedido falso em massa) ----
  if (select count(*) from public.pedidos p
      where p.cliente_telefone = v_tel and p.criado_em > now() - interval '10 minutes') >= 3 then
    raise exception 'Você já enviou vários pedidos há pouco. Tente de novo em alguns minutos.';
  end if;
  v_ip_hash := public._ip_hash();
  if v_ip_hash is not null and (select count(*) from public.pedidos_acesso a join public.pedidos p on p.id = a.pedido_id
      where a.ip_hash = v_ip_hash and p.criado_em > now() - interval '10 minutes') >= 10 then
    raise exception 'Muitos pedidos saíram desta rede há pouco. Tente de novo em alguns minutos.';
  end if;

  -- ---- entrega ou retirada ----
  v_modo := public._texto(dados -> 'modo', 'modo', 10);
  if v_modo = 'entrega' and l.entrega_ativa then
    v_entrega := dados -> 'entrega';
    if v_entrega is null or jsonb_typeof(v_entrega) <> 'object' then raise exception 'Preencha o endereço de entrega.'; end if;
    v_entrega := jsonb_build_object(
      'cep', regexp_replace(public._texto(v_entrega -> 'cep', 'CEP', 9), '\D', '', 'g'),
      'cidade', public._texto(v_entrega -> 'cidade', 'cidade', 60),
      'endereco', public._texto(v_entrega -> 'endereco', 'rua', 100),
      'numero', public._texto(v_entrega -> 'numero', 'número', 15),
      'complemento', public._texto(v_entrega -> 'complemento', 'complemento', 60),
      'bairro', public._texto(v_entrega -> 'bairro', 'bairro', 60));
    if length(v_entrega ->> 'cep') <> 8 then raise exception 'O CEP tem 8 números.'; end if;
    if length(v_entrega ->> 'cidade') < 2 then raise exception 'Digite a cidade.'; end if;
    if length(v_entrega ->> 'endereco') < 3 then raise exception 'Digite a rua ou avenida.'; end if;
    if v_entrega ->> 'numero' = '' then raise exception 'Digite o número ou “s/n”.'; end if;
    v_bairro := v_entrega ->> 'bairro';
    v_cidade := v_entrega ->> 'cidade';
    if cardinality(l.cidades_atendidas) > 0
       and not exists (select 1 from unnest(l.cidades_atendidas) c where public._sem_acento(c) = public._sem_acento(v_cidade)) then
      raise exception 'Este estabelecimento não entrega nesta cidade.';
    end if;
    if exists (select 1 from unnest(l.bairros_sem_entrega) b
               where public._sem_acento(b) <> '' and position(public._sem_acento(b) in public._sem_acento(v_bairro)) > 0) then
      raise exception 'Este estabelecimento não entrega neste bairro.';
    end if;
    if l.taxa_tipo = 'bairro' then
      v_bairro := coalesce(nullif(public._texto(dados -> 'bairro', 'bairro', 60), ''), v_bairro);
      select b.taxa into v_taxa from public.bairros b where b.estabelecimento_id = l.id and b.ativo and b.nome = v_bairro;
      if not found then raise exception 'Escolha um bairro da lista.'; end if;
      v_entrega := jsonb_set(v_entrega, '{bairro}', to_jsonb(v_bairro));
    else
      if length(v_bairro) < 2 then raise exception 'Digite o bairro.'; end if;
      v_taxa := l.taxa_fixa;
    end if;
    v_minimo := l.entrega_minimo;
  elsif v_modo = 'retirada' and l.retirada_ativa then
    v_entrega := null;
    v_taxa := 0;
    v_minimo := l.retirada_minimo;
  else
    raise exception 'Escolha entrega ou retirada.';
  end if;

  -- ---- itens: preço SEMPRE do cardápio do banco, só desta loja ----
  if jsonb_typeof(dados -> 'itens') <> 'array' or jsonb_array_length(dados -> 'itens') = 0 then
    raise exception 'Seu carrinho está vazio.';
  end if;
  if jsonb_array_length(dados -> 'itens') > 30 then raise exception 'O pedido aceita até 30 itens diferentes.'; end if;
  for it in select value from jsonb_array_elements(dados -> 'itens') loop
    if jsonb_typeof(it) <> 'object' then raise exception 'Pedido inválido. Atualize a página e tente de novo.'; end if;
    select * into prod from public.produtos p
      where p.estabelecimento_id = l.id and p.id = public._texto(it -> 'produtoId', 'produto', 60);
    if not found or not prod.ativo or not exists (select 1 from public.categorias c
        where c.estabelecimento_id = l.id and c.id = prod.categoria_id and c.ativo) then
      raise exception 'Um item do carrinho saiu do cardápio. Atualize a página e confira o carrinho.';
    end if;
    if not prod.disponivel then raise exception 'Item esgotado: %. Remova do carrinho para continuar.', prod.nome; end if;
    v_qtd := case when jsonb_typeof(it -> 'qtd') = 'number' and (it ->> 'qtd') ~ '^[0-9]{1,2}$' then (it ->> 'qtd')::int end;
    if v_qtd is null or v_qtd not between 1 and 20 then raise exception 'Quantidade inválida em %.', prod.nome; end if;
    v_unit := prod.preco;
    v_escolhas := '[]'::jsonb;

    if it ? 'escolhas' and jsonb_typeof(it -> 'escolhas') not in ('object', 'null') then
      raise exception 'Opções inválidas em %.', prod.nome;
    end if;
    if jsonb_typeof(it -> 'escolhas') = 'object' and exists (
      select 1 from jsonb_object_keys(it -> 'escolhas') k
      where not exists (select 1 from public.grupos_opcao gg
                        where gg.estabelecimento_id = l.id and gg.produto_id = prod.id and gg.chave = k)) then
      raise exception 'As opções de % mudaram. Atualize a página e confira o carrinho.', prod.nome;
    end if;
    for g in select * from public.grupos_opcao gg where gg.estabelecimento_id = l.id and gg.produto_id = prod.id order by gg.ordem, gg.id loop
      sel := coalesce(it -> 'escolhas' -> g.chave, '[]'::jsonb);
      if jsonb_typeof(sel) <> 'array' then raise exception 'Opções inválidas em %.', prod.nome; end if;
      n := jsonb_array_length(sel);
      if n <> (select count(distinct x) from jsonb_array_elements(sel) x) then raise exception 'Opção repetida em %.', prod.nome; end if;
      if g.obrigatorio and n = 0 then raise exception 'Escolha %: %.', lower(g.nome), prod.nome; end if;
      if g.tipo = 'unica' and n > 1 then raise exception 'Escolha só uma opção de % em %.', lower(g.nome), prod.nome; end if;
      if g.max is not null and n > g.max then raise exception 'Escolha até % em % (%).', g.max, lower(g.nome), prod.nome; end if;
      for ch in select x #>> '{}' from jsonb_array_elements(sel) x loop
        select * into op from public.opcoes o where o.grupo_id = g.id and o.chave = ch and o.ativo;
        if not found then raise exception 'As opções de % mudaram. Atualize a página e confira o carrinho.', prod.nome; end if;
        v_unit := v_unit + op.preco;
        v_escolhas := v_escolhas || jsonb_build_array(jsonb_build_object('grupo', g.nome, 'opcao', op.nome));
      end loop;
    end loop;

    v_remover := '{}';
    if it ? 'remover' and jsonb_typeof(it -> 'remover') <> 'null' then
      if jsonb_typeof(it -> 'remover') <> 'array' then raise exception 'Pedido inválido em %.', prod.nome; end if;
      select coalesce(array_agg(distinct x #>> '{}'), '{}') into v_remover from jsonb_array_elements(it -> 'remover') x;
      if not v_remover <@ prod.removiveis then
        raise exception 'Os ingredientes de % mudaram. Atualize a página e confira o carrinho.', prod.nome;
      end if;
    end if;
    v_item_obs := public._texto(it -> 'obs', 'observação do item', 140);

    v_subtotal := v_subtotal + v_unit * v_qtd;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'produto_id', prod.id, 'nome', prod.nome, 'qtd', v_qtd, 'preco_unitario', v_unit,
      'escolhas', v_escolhas, 'remover', to_jsonb(v_remover), 'obs', v_item_obs));
  end loop;

  -- ---- total que o cliente viu na tela ----
  if jsonb_typeof(dados -> 'totalEsperado') = 'number' then
    if (dados ->> 'totalEsperado') !~ '^[0-9]{1,8}$' then raise exception 'Pedido inválido. Atualize a página e tente de novo.'; end if;
    if (dados ->> 'totalEsperado')::bigint <> v_subtotal + v_taxa then
      raise exception 'Os preços mudaram desde que você abriu a página. Confira o novo total e confirme de novo.' using hint = 'precos';
    end if;
  elsif coalesce(jsonb_typeof(dados -> 'totalEsperado'), 'null') <> 'null' then
    raise exception 'Pedido inválido. Atualize a página e tente de novo.';
  end if;

  if v_subtotal < v_minimo then
    raise exception 'Para % o pedido mínimo é R$ %.', v_modo,
      replace(to_char(v_minimo / 100.0, 'FM999990.00'), '.', ',');
  end if;

  -- ---- pagamento (feito direto ao estabelecimento) ----
  v_forma := public._texto(dados #> '{pagamento,forma}', 'pagamento', 20);
  if not (v_forma = any (l.pagamentos)) then raise exception 'Escolha como vai pagar.'; end if;
  if v_forma = 'pix' and l.pix_chave = '' then raise exception 'Este estabelecimento ainda não aceita Pix pelo site. Escolha outra forma.'; end if;
  v_troco := null;
  if v_forma = 'dinheiro' and jsonb_typeof(dados #> '{pagamento,trocoPara}') = 'number' then
    if (dados #>> '{pagamento,trocoPara}') !~ '^[0-9]{1,7}$' then raise exception 'Valor do troco inválido.'; end if;
    v_troco := (dados #>> '{pagamento,trocoPara}')::int;
    if v_troco <= v_subtotal + v_taxa then
      raise exception 'O troco precisa ser para um valor maior que o total (R$ %).',
        replace(to_char((v_subtotal + v_taxa) / 100.0, 'FM999990.00'), '.', ',');
    end if;
  end if;

  if coalesce(public._texto(dados -> 'cupom', 'cupom', 30), '') <> '' then
    raise exception 'Cupons ainda não são aceitos pelo site.';
  end if;
  v_obs := public._texto(dados -> 'obs', 'observações', 240);

  -- ---- grava ----
  for tentativa in 1..20 loop
    v_codigo := l.prefixo_pedido || '-';
    for k in 1..5 loop
      v_codigo := v_codigo || substr(letras, 1 + floor(random() * length(letras))::int, 1);
    end loop;
    exit when not exists (select 1 from public.pedidos p where p.codigo = v_codigo);
    v_codigo := null;
  end loop;
  if v_codigo is null then raise exception 'Não foi possível registrar agora. Tente de novo.'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into public.pedidos (estabelecimento_id, codigo, modo, cliente_nome, cliente_telefone, cliente_email, entrega,
    pagamento_forma, troco_para, obs, subtotal, desconto, taxa, total)
  values (l.id, v_codigo, v_modo, v_nome, v_tel, v_email, v_entrega,
    v_forma, v_troco, v_obs, v_subtotal, 0, v_taxa, v_subtotal + v_taxa)
  returning id into v_id;

  insert into public.pedido_itens (pedido_id, ordem, produto_id, nome, qtd, preco_unitario, escolhas, remover, obs)
  select v_id, x.ord, x.v ->> 'produto_id', x.v ->> 'nome', (x.v ->> 'qtd')::int, (x.v ->> 'preco_unitario')::int,
         x.v -> 'escolhas', array(select jsonb_array_elements_text(x.v -> 'remover')), x.v ->> 'obs'
  from jsonb_array_elements(v_itens) with ordinality as x(v, ord);

  insert into public.pedidos_acesso (pedido_id, chave_envio, token, ip_hash) values (v_id, chave, v_token, v_ip_hash);

  return public._pedido_json(v_id) || jsonb_build_object('token', v_token);
end;
$$;

-- acompanhar_pedido(codigo, token): código e token errados -> null
create or replace function public.acompanhar_pedido(codigo text, token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._pedido_json(public._pedido_do_link(codigo, token));
$$;

-- avaliar_pedido: nota 0 a 5 e comentário opcional, uma vez, só depois de entregue
create or replace function public.avaliar_pedido(codigo text, token text, nota integer, comentario text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid bigint; p public.pedidos;
begin
  pid := public._pedido_do_link(codigo, token);
  if pid is null then raise exception 'Pedido não encontrado.'; end if;
  select * into p from public.pedidos x where x.id = pid for update;
  if p.status <> 'entregue' then raise exception 'Você pode avaliar quando o pedido for entregue.'; end if;
  if nota is null or nota not between 0 and 5 then raise exception 'Escolha de 0 a 5 estrelas.'; end if;
  if exists (select 1 from public.avaliacoes a where a.pedido_id = pid) then raise exception 'Este pedido já foi avaliado. Obrigado!'; end if;
  insert into public.avaliacoes (pedido_id, estabelecimento_id, nota, comentario)
  values (pid, p.estabelecimento_id, nota, public._texto(to_jsonb(coalesce(comentario, '')), 'comentário', 500));
  return jsonb_build_object('ok', true);
end;
$$;

-- nota média do estabelecimento (só somas; o site divide e aplica o mínimo de 5 avaliações)
create or replace function public._avaliacao_soma() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.estabelecimentos set avaliacoes_qtd = avaliacoes_qtd + 1, avaliacoes_soma = avaliacoes_soma + new.nota
  where id = new.estabelecimento_id;
  return new;
end;
$$;
drop trigger if exists avaliacoes_soma on public.avaliacoes;
create trigger avaliacoes_soma after insert on public.avaliacoes for each row execute function public._avaliacao_soma();

-- abrir_chamado: com código + token liga ao pedido e à loja; sem eles, só o telefone
create or replace function public.abrir_chamado(motivo text, descricao text, telefone text,
  codigo text default null, token text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid bigint; v_estab text; v_tel text; v_ip text; v_id bigint;
begin
  if motivo is null or motivo not in ('nao_entregue', 'errado', 'demorando', 'outro', 'dados') then raise exception 'Escolha o motivo.'; end if;
  v_tel := public._telefone(telefone);
  if codigo is not null and token is not null then
    pid := public._pedido_do_link(codigo, token);
    if pid is null then raise exception 'Pedido não encontrado.'; end if;
    select p.estabelecimento_id, coalesce(v_tel, p.cliente_telefone) into v_estab, v_tel from public.pedidos p where p.id = pid;
  end if;
  if v_tel is null then raise exception 'Digite um telefone com DDD para a gente falar com você.'; end if;
  if motivo = 'outro' and length(trim(coalesce(descricao, ''))) < 5 then raise exception 'Conte em poucas palavras o que aconteceu.'; end if;
  v_ip := public._ip_hash();
  if (select count(*) from public.chamados c where c.criado_em > now() - interval '1 hour'
      and (c.telefone = v_tel or (v_ip is not null and c.ip_hash = v_ip))) >= 5 then
    raise exception 'Você já abriu vários chamados há pouco. Aguarde o nosso contato.';
  end if;
  insert into public.chamados (pedido_id, estabelecimento_id, motivo, descricao, telefone, ip_hash)
  values (pid, v_estab, motivo, public._texto(to_jsonb(coalesce(descricao, '')), 'descrição', 1000), v_tel, v_ip)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'protocolo', v_id);
end;
$$;

-- LGPD (art. 18, VI): apaga os dados pessoais dos pedidos JÁ ENCERRADOS de um telefone.
-- Ficam só itens e valores (sem nome, telefone, e-mail, endereço e observações), para o caixa da loja.
-- Pedido em andamento não muda (a loja ainda precisa entregar). Só a administração chama.
create or replace function public.anonimizar_cliente(telefone text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_tel text; n_ped integer; n_cham integer;
begin
  if not public.eh_admin() then raise exception 'Só a administração pode fazer isso.' using errcode = '42501'; end if;
  v_tel := public._telefone(telefone);
  if v_tel is null then raise exception 'Telefone inválido.'; end if;
  update public.pedidos p set cliente_nome = 'Dados removidos', cliente_telefone = '', cliente_email = null, entrega = null, obs = ''
  where p.cliente_telefone = v_tel and p.status in ('entregue', 'cancelado');
  get diagnostics n_ped = row_count;
  update public.pedido_itens i set obs = '' where i.obs <> '' and i.pedido_id in (select p.id from public.pedidos p where p.cliente_nome = 'Dados removidos');
  update public.avaliacoes a set comentario = '' where a.comentario <> '' and a.pedido_id in (select p.id from public.pedidos p where p.cliente_nome = 'Dados removidos');
  update public.chamados c set telefone = '0000000000', descricao = '' where c.telefone = v_tel and c.situacao = 'resolvido';
  get diagnostics n_cham = row_count;
  return jsonb_build_object('pedidos', n_ped, 'chamados', n_cham,
    'em_andamento', (select count(*) from public.pedidos p where p.cliente_telefone = v_tel));
end;
$$;

-- ============================================================
-- CADASTRO DO ESTABELECIMENTO (usuário logado) e APROVAÇÃO (administração)
-- dados = { nome, nomeCurto, sufixo, categoria, cidade, descricao, telefonePublico, whatsapp,
--           documentoTipo, documento, razaoSocial, responsavelNome, responsavelTelefone,
--           responsavelEmail, endereco, aceites: { termos: true, privacidade: true, adesao: true } }
-- Devolve { id } da loja nova, em situação 'pendente'. Quem cadastrou vira 'dono'.
-- ============================================================
create or replace function public.cadastrar_estabelecimento(dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_nome text; v_base text; v_id text; v_doc text; v_tipo text; v_tel text; v_resp_tel text; v_zap text;
  v_cat text; i int := 1;
begin
  if uid is null then raise exception 'Entre na sua conta para cadastrar o estabelecimento.' using errcode = '42501'; end if;
  if dados is null or jsonb_typeof(dados) <> 'object' then raise exception 'Dados inválidos. Atualize a página.'; end if;
  if (select count(*) from public.equipe e join public.estabelecimentos x on x.id = e.estabelecimento_id
      where e.user_id = uid and x.situacao = 'pendente') >= 3 then
    raise exception 'Você já tem cadastros esperando aprovação. Aguarde o nosso contato.';
  end if;
  if coalesce(dados #>> '{aceites,termos}', '') <> 'true' or coalesce(dados #>> '{aceites,privacidade}', '') <> 'true'
     or coalesce(dados #>> '{aceites,adesao}', '') <> 'true' then
    raise exception 'Para continuar, aceite os termos de uso, a política de privacidade e o termo de adesão.';
  end if;

  v_nome := public._texto(dados -> 'nome', 'nome do estabelecimento', 60);
  if length(v_nome) < 2 then raise exception 'Digite o nome do estabelecimento.'; end if;
  v_cat := public._texto(dados -> 'categoria', 'categoria', 20);
  if v_cat not in ('lanchonetes', 'restaurantes', 'farmacias', 'mercados', 'padarias', 'outros') then raise exception 'Escolha a categoria.'; end if;
  if length(public._texto(dados -> 'cidade', 'cidade', 60)) < 2 then raise exception 'Digite a cidade.'; end if;
  v_tel := public._telefone(public._texto(dados -> 'telefonePublico', 'telefone do estabelecimento', 20));
  if v_tel is null then raise exception 'Digite o telefone do estabelecimento com DDD.'; end if;
  v_zap := public._telefone(public._texto(dados -> 'whatsapp', 'WhatsApp', 20));
  v_zap := case when v_zap is null then null else '55' || v_zap end;

  v_tipo := public._texto(dados -> 'documentoTipo', 'tipo de documento', 4);
  v_doc := regexp_replace(public._texto(dados -> 'documento', 'documento', 20), '\D', '', 'g');
  if v_tipo not in ('cpf', 'cnpj') or (v_tipo = 'cpf' and length(v_doc) <> 11) or (v_tipo = 'cnpj' and length(v_doc) <> 14)
     or not public._documento_ok(v_doc) then
    raise exception 'Confira o CPF ou CNPJ.';
  end if;
  v_resp_tel := public._telefone(public._texto(dados -> 'responsavelTelefone', 'telefone do responsável', 20));
  if v_resp_tel is null then raise exception 'Digite o telefone do responsável com DDD.'; end if;
  if length(public._texto(dados -> 'responsavelNome', 'nome do responsável', 80)) < 3 then raise exception 'Digite o nome do responsável.'; end if;

  -- id para o endereço: nome sem acento, minúsculo, com hífens (lanchonete-do-ze, lanchonete-do-ze-2...)
  v_base := trim(both '-' from regexp_replace(public._sem_acento(v_nome), '[^a-z0-9]+', '-', 'g'));
  v_base := left(case when length(v_base) < 2 then 'loja-' || v_base else v_base end, 36);
  v_id := v_base;
  while exists (select 1 from public.estabelecimentos x where x.id = v_id) loop
    i := i + 1; v_id := v_base || '-' || i;
  end loop;

  insert into public.estabelecimentos (id, nome, nome_curto, sufixo, categoria, cidade, descricao, telefone_publico, whatsapp,
    cidades_atendidas, pix_nome, pix_cidade)
  values (v_id, v_nome,
    upper(public._texto(dados -> 'nomeCurto', 'nome curto', 20)), upper(public._texto(dados -> 'sufixo', 'sufixo', 20)),
    v_cat, public._texto(dados -> 'cidade', 'cidade', 60), public._texto(dados -> 'descricao', 'descrição', 160),
    v_tel, v_zap, array[public._texto(dados -> 'cidade', 'cidade', 60)],
    left(upper(public._sem_acento(v_nome)), 25), left(upper(public._sem_acento(public._texto(dados -> 'cidade', 'cidade', 60))), 15));

  insert into public.estabelecimentos_privado (estabelecimento_id, documento_tipo, documento, razao_social,
    responsavel_nome, responsavel_telefone, responsavel_email, endereco, aceites)
  values (v_id, v_tipo, v_doc, public._texto(dados -> 'razaoSocial', 'razão social', 120),
    public._texto(dados -> 'responsavelNome', 'nome do responsável', 80), v_resp_tel,
    public._texto(dados -> 'responsavelEmail', 'e-mail do responsável', 100), public._texto(dados -> 'endereco', 'endereço', 200),
    jsonb_build_object('termos', now(), 'privacidade', now(), 'adesao', now()));

  insert into public.equipe (estabelecimento_id, user_id, nome, papel)
  values (v_id, uid, public._texto(dados -> 'responsavelNome', 'nome do responsável', 80), 'dono');

  return jsonb_build_object('id', v_id, 'situacao', 'pendente');
end;
$$;

-- administração: aprovar, recusar, suspender ou voltar para pendente
create or replace function public.definir_situacao(estabelecimento text, situacao text, motivo text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Só a administração pode fazer isso.' using errcode = '42501'; end if;
  if situacao not in ('pendente', 'aprovado', 'recusado', 'suspenso') then raise exception 'Situação inválida.'; end if;
  if situacao = 'aprovado' and not exists (select 1 from public.produtos p where p.estabelecimento_id = estabelecimento and p.ativo) then
    raise exception 'Cadastre pelo menos um produto antes de aprovar.';
  end if;
  update public.estabelecimentos x set situacao = definir_situacao.situacao where x.id = estabelecimento;
  if not found then raise exception 'Estabelecimento não encontrado.'; end if;
  update public.estabelecimentos_privado x set situacao_motivo = left(coalesce(motivo, ''), 300) where x.estabelecimento_id = estabelecimento;
  return jsonb_build_object('ok', true);
end;
$$;

-- dono: pôr na equipe alguém que já criou conta (pelo e-mail)
create or replace function public.adicionar_equipe(estabelecimento text, email text, papel text default 'cozinha', nome text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if not (public.eh_dono(estabelecimento) or public.eh_admin()) then raise exception 'Só o dono pode mudar a equipe.' using errcode = '42501'; end if;
  if papel not in ('dono', 'cozinha') then raise exception 'Papel inválido.'; end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(adicionar_equipe.email));
  if v_uid is null then raise exception 'Não achamos conta com este e-mail. Peça para a pessoa criar a conta primeiro.'; end if;
  insert into public.equipe (estabelecimento_id, user_id, nome, papel)
  values (estabelecimento, v_uid, left(coalesce(nome, ''), 80), papel)
  on conflict (estabelecimento_id, user_id) do update set papel = excluded.papel, nome = excluded.nome;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remover_equipe(estabelecimento text, usuario uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (public.eh_dono(estabelecimento) or public.eh_admin()) then raise exception 'Só o dono pode mudar a equipe.' using errcode = '42501'; end if;
  if usuario = auth.uid() and not public.eh_admin() then raise exception 'Você não pode tirar a si mesmo da equipe.'; end if;
  delete from public.equipe e where e.estabelecimento_id = estabelecimento and e.user_id = usuario;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- PAINEL DO DONO: horários e entrega (uma chamada troca tudo de uma vez)
-- ============================================================
create or replace function public.salvar_horarios(estabelecimento text, faixas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb;
  hora_ok constant text := '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$';
  nomes constant text[] := array['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
begin
  if not (public.eh_dono(estabelecimento) or public.eh_admin()) then raise exception 'Só o dono pode mudar os horários.' using errcode = '42501'; end if;
  if faixas is null or jsonb_typeof(faixas) <> 'array' then raise exception 'Horários inválidos. Atualize a página.'; end if;
  delete from public.horarios h where h.estabelecimento_id = estabelecimento;
  for f in select value from jsonb_array_elements(faixas) loop
    if jsonb_typeof(f) <> 'object' or jsonb_typeof(f -> 'dia') <> 'number' or (f ->> 'dia') !~ '^[1-7]$' then
      raise exception 'Horários inválidos. Atualize a página.';
    end if;
    if coalesce(f ->> 'abre', '') !~ hora_ok or coalesce(f ->> 'fecha', '') !~ hora_ok then
      raise exception 'Confira os horários de %: use hora e minuto, como 18:00.', nomes[(f ->> 'dia')::int];
    end if;
    if (f ->> 'abre')::time = (f ->> 'fecha')::time then
      raise exception 'Na % a loja abre e fecha no mesmo horário (%). Para o dia todo, use 00:00 até 23:59.',
        nomes[(f ->> 'dia')::int], left(f ->> 'abre', 5);
    end if;
    insert into public.horarios (estabelecimento_id, dia, abre, fecha)
    values (estabelecimento, (f ->> 'dia')::int, (f ->> 'abre')::time, (f ->> 'fecha')::time);
  end loop;
  if exists (select 1 from public.horarios h where h.estabelecimento_id = estabelecimento group by dia having count(*) > 4) then
    raise exception 'No máximo 4 faixas de horário por dia.';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('dia', h.dia, 'abre', h.abre, 'fecha', h.fecha) order by h.dia, h.abre), '[]'::jsonb)
          from public.horarios h where h.estabelecimento_id = estabelecimento);
end;
$$;

create or replace function public.salvar_entrega(estabelecimento text, dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  b jsonb; v_ent boolean; v_ret boolean; v_tipo text; v_tempo_ent text; v_tempo_ret text; v_nome text;
begin
  if not (public.eh_dono(estabelecimento) or public.eh_admin()) then raise exception 'Só o dono pode mudar entrega e taxas.' using errcode = '42501'; end if;
  if dados is null or jsonb_typeof(dados) <> 'object' then raise exception 'Dados inválidos. Atualize a página.'; end if;
  v_ent := public._sim_nao(dados -> 'entregaAtiva', 'entrega');
  v_ret := public._sim_nao(dados -> 'retiradaAtiva', 'retirada');
  if not v_ent and not v_ret then raise exception 'Deixe a entrega ou a retirada ligada: sem as duas, ninguém consegue pedir.'; end if;
  v_tipo := public._texto(dados -> 'taxaTipo', 'tipo de taxa', 10);
  if v_tipo not in ('fixa', 'bairro') then raise exception 'Escolha taxa fixa ou por bairro.'; end if;
  v_tempo_ent := public._texto(dados -> 'entregaTempo', 'tempo de entrega', 30);
  v_tempo_ret := public._texto(dados -> 'retiradaTempo', 'tempo de retirada', 30);
  if v_tempo_ent = '' or v_tempo_ret = '' then raise exception 'Digite o tempo de entrega e de retirada (ex.: 45 min).'; end if;

  update public.estabelecimentos set
    entrega_ativa = v_ent, entrega_tempo = v_tempo_ent,
    entrega_minimo = public._inteiro(dados -> 'entregaMinimo', 'pedido mínimo da entrega'),
    taxa_tipo = v_tipo, taxa_fixa = public._inteiro(dados -> 'taxaFixa', 'taxa de entrega'),
    retirada_ativa = v_ret, retirada_tempo = v_tempo_ret,
    retirada_minimo = public._inteiro(dados -> 'retiradaMinimo', 'pedido mínimo da retirada')
  where id = estabelecimento;

  if jsonb_typeof(dados -> 'bairros') <> 'array' then raise exception 'Lista de bairros inválida. Atualize a página.'; end if;
  if jsonb_array_length(dados -> 'bairros') > 200 then raise exception 'No máximo 200 bairros.'; end if;
  delete from public.bairros x where x.estabelecimento_id = estabelecimento;
  for b in select value from jsonb_array_elements(dados -> 'bairros') loop
    if jsonb_typeof(b) <> 'object' then raise exception 'Lista de bairros inválida. Atualize a página.'; end if;
    v_nome := public._texto(b -> 'nome', 'nome do bairro', 60);
    if length(v_nome) < 2 then raise exception 'Digite o nome de cada bairro.'; end if;
    if exists (select 1 from public.bairros x where x.estabelecimento_id = estabelecimento and public._sem_acento(x.nome) = public._sem_acento(v_nome)) then
      raise exception 'Bairro repetido na lista: %.', v_nome;
    end if;
    insert into public.bairros (estabelecimento_id, nome, taxa, ativo)
    values (estabelecimento, v_nome, public._inteiro(b -> 'taxa', 'taxa de ' || v_nome), public._sim_nao(b -> 'ativo', 'ativo de ' || v_nome));
  end loop;
  if v_ent and v_tipo = 'bairro' and not exists (select 1 from public.bairros x where x.estabelecimento_id = estabelecimento and x.ativo) then
    raise exception 'Com taxa por bairro, cadastre pelo menos um bairro ativo.';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- RESUMO DE VENDAS (painel do estabelecimento e administração). Pedidos cancelados não contam.
--   estabelecimento = null -> todas as lojas (só administração)
-- ============================================================
create or replace function public.resumo_vendas(de timestamptz, ate timestamptz, estabelecimento text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if estabelecimento is null and not public.eh_admin() then raise exception 'Só a administração vê o resumo geral.' using errcode = '42501'; end if;
  if estabelecimento is not null and not (public.eh_equipe(estabelecimento) or public.eh_admin()) then
    raise exception 'Sem acesso a este estabelecimento.' using errcode = '42501';
  end if;
  if de is null or ate is null or ate <= de or ate - de > interval '400 days' then raise exception 'Período inválido.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('estabelecimento', e.id, 'nome', e.nome, 'cidade', e.cidade,
      'pedidos', r.pedidos, 'total', r.total, 'taxas', r.taxas) order by r.total desc)
    from (select p.estabelecimento_id, count(*) as pedidos, sum(p.total) as total, sum(p.taxa) as taxas
          from public.pedidos p
          where p.criado_em >= de and p.criado_em < ate and p.status <> 'cancelado'
            and (estabelecimento is null or p.estabelecimento_id = estabelecimento)
          group by p.estabelecimento_id) r
    join public.estabelecimentos e on e.id = r.estabelecimento_id), '[]'::jsonb);
end;
$$;

-- ============================================================
-- GATILHOS
-- ============================================================

-- estabelecimentos: situação e avaliações só a administração; cozinha só abre/fecha
create or replace function public._estab_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' or public.eh_admin() then return new; end if;
  if new.id is distinct from old.id or new.situacao is distinct from old.situacao
     or new.avaliacoes_qtd is distinct from old.avaliacoes_qtd or new.avaliacoes_soma is distinct from old.avaliacoes_soma
     or new.criado_em is distinct from old.criado_em
     -- nome, categoria e cidade foram conferidos na aprovação: trocar depois permitiria se passar por outra loja
     or new.nome is distinct from old.nome or new.categoria is distinct from old.categoria or new.cidade is distinct from old.cidade then
    raise exception 'Só a administração muda isso. Peça pelo Suporte.' using errcode = '42501';
  end if;
  if not public.eh_dono(old.id)
     and (to_jsonb(new) - 'aberta_manual' - 'atualizado_em') is distinct from (to_jsonb(old) - 'aberta_manual' - 'atualizado_em') then
    raise exception 'Só o dono pode mudar isso.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists estabelecimentos_protege on public.estabelecimentos;
create trigger estabelecimentos_protege before update on public.estabelecimentos for each row execute function public._estab_protege();

-- produtos: a cozinha só marca esgotado; ninguém muda a loja do produto
create or replace function public._produto_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' or public.eh_admin() then return new; end if;
  if new.estabelecimento_id is distinct from old.estabelecimento_id then
    raise exception 'O produto não pode mudar de estabelecimento.' using errcode = '42501';
  end if;
  if not public.eh_dono(old.estabelecimento_id)
     and (to_jsonb(new) - 'disponivel') is distinct from (to_jsonb(old) - 'disponivel') then
    raise exception 'Só o dono pode mudar isso.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists produtos_protege on public.produtos;
create trigger produtos_protege before update on public.produtos for each row execute function public._produto_protege();

create or replace function public._tocar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists pedidos_tocar on public.pedidos;
create trigger pedidos_tocar before update on public.pedidos for each row execute function public._tocar();
drop trigger if exists estabelecimentos_tocar on public.estabelecimentos;
create trigger estabelecimentos_tocar before update on public.estabelecimentos for each row execute function public._tocar();
drop trigger if exists chamados_tocar on public.chamados;
create trigger chamados_tocar before update on public.chamados for each row execute function public._tocar();

-- ============================================================
-- PERMISSÕES E RLS
-- O Supabase dá acesso total às tabelas novas para anon/authenticated; aqui
-- tiramos tudo e devolvemos só o necessário. RLS ligada em todas as tabelas.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['admins', 'estabelecimentos', 'estabelecimentos_privado', 'equipe', 'categorias', 'produtos',
    'grupos_opcao', 'opcoes', 'bairros', 'horarios', 'pedidos', 'pedido_itens', 'pedidos_acesso', 'avaliacoes',
    'chamados', 'mensalidades'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists insere on public.%I', t);
    execute format('drop policy if exists altera on public.%I', t);
    execute format('drop policy if exists apaga on public.%I', t);
  end loop;
end $$;

-- admins: cada admin vê a própria linha (o painel usa para saber se a pessoa é admin)
grant select on public.admins to authenticated;
create policy ler on public.admins for select to authenticated using (user_id = auth.uid());

-- estabelecimentos: público vê os aprovados; equipe vê a própria loja; admin vê todas
grant select on public.estabelecimentos to anon, authenticated;
grant update on public.estabelecimentos to authenticated;
create policy ler on public.estabelecimentos for select to anon, authenticated
  using (situacao = 'aprovado' or public.eh_equipe(id) or public.eh_admin());
create policy altera on public.estabelecimentos for update to authenticated
  using (public.eh_equipe(id) or public.eh_admin()) with check (public.eh_equipe(id) or public.eh_admin());

-- dados privados: só dono e admin; o dono muda contato e endereço (documento e aceites não)
grant select on public.estabelecimentos_privado to authenticated;
grant update (razao_social, responsavel_nome, responsavel_telefone, responsavel_email, endereco) on public.estabelecimentos_privado to authenticated;
create policy ler on public.estabelecimentos_privado for select to authenticated
  using (public.eh_dono(estabelecimento_id) or public.eh_admin());
create policy altera on public.estabelecimentos_privado for update to authenticated
  using (public.eh_dono(estabelecimento_id) or public.eh_admin()) with check (public.eh_dono(estabelecimento_id) or public.eh_admin());

-- equipe: cada um vê as próprias linhas; o dono vê a equipe da loja; mudanças pelas funções
grant select on public.equipe to authenticated;
create policy ler on public.equipe for select to authenticated
  using (user_id = auth.uid() or public.eh_dono(estabelecimento_id) or public.eh_admin());

-- cardápio, bairros e horários: público lê o que é ativo de loja aprovada; dono e admin mexem
do $$
declare t text;
begin
  foreach t in array array['categorias', 'produtos', 'grupos_opcao', 'opcoes', 'bairros', 'horarios'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('create policy insere on public.%I for insert to authenticated with check (public.eh_dono(estabelecimento_id) or public.eh_admin())', t);
    execute format('create policy apaga on public.%I for delete to authenticated using (public.eh_dono(estabelecimento_id) or public.eh_admin())', t);
    if t = 'produtos' then
      -- a cozinha também altera produto (só "esgotado", conferido no gatilho)
      execute 'create policy altera on public.produtos for update to authenticated
        using (public.eh_equipe(estabelecimento_id) or public.eh_admin()) with check (public.eh_equipe(estabelecimento_id) or public.eh_admin())';
    else
      execute format('create policy altera on public.%I for update to authenticated
        using (public.eh_dono(estabelecimento_id) or public.eh_admin()) with check (public.eh_dono(estabelecimento_id) or public.eh_admin())', t);
    end if;
  end loop;
end $$;
create policy ler on public.categorias for select to anon, authenticated
  using ((ativo and public.eh_publico(estabelecimento_id)) or public.eh_equipe(estabelecimento_id) or public.eh_admin());
create policy ler on public.produtos for select to anon, authenticated
  using ((ativo and public.eh_publico(estabelecimento_id)) or public.eh_equipe(estabelecimento_id) or public.eh_admin());
create policy ler on public.grupos_opcao for select to anon, authenticated
  using (public.eh_publico(estabelecimento_id) or public.eh_equipe(estabelecimento_id) or public.eh_admin());
create policy ler on public.opcoes for select to anon, authenticated
  using (public.eh_publico(estabelecimento_id) or public.eh_equipe(estabelecimento_id) or public.eh_admin());
create policy ler on public.bairros for select to anon, authenticated
  using ((ativo and public.eh_publico(estabelecimento_id)) or public.eh_equipe(estabelecimento_id) or public.eh_admin());
create policy ler on public.horarios for select to anon, authenticated
  using (public.eh_publico(estabelecimento_id) or public.eh_equipe(estabelecimento_id) or public.eh_admin());

-- pedidos: só a equipe da loja (e admin) lê; muda só status e pagamento
grant select on public.pedidos, public.pedido_itens to authenticated;
grant update (status, pagamento_status) on public.pedidos to authenticated;
create policy ler on public.pedidos for select to authenticated
  using (public.eh_equipe(estabelecimento_id) or public.eh_admin());
create policy altera on public.pedidos for update to authenticated
  using (public.eh_equipe(estabelecimento_id) or public.eh_admin()) with check (public.eh_equipe(estabelecimento_id) or public.eh_admin());
create policy ler on public.pedido_itens for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id and (public.eh_equipe(p.estabelecimento_id) or public.eh_admin())));
-- pedidos_acesso: sem política nenhuma = ninguém lê pela API

-- avaliações: a loja vê as próprias; admin vê todas (o público vê só a média, em estabelecimentos)
grant select on public.avaliacoes to authenticated;
create policy ler on public.avaliacoes for select to authenticated
  using (public.eh_equipe(estabelecimento_id) or public.eh_admin());

-- chamados: só a administração
grant select, update (situacao, resposta) on public.chamados to authenticated;
create policy ler on public.chamados for select to authenticated using (public.eh_admin());
create policy altera on public.chamados for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- mensalidades: admin cuida; o dono vê as da própria loja
grant select, insert, update, delete on public.mensalidades to authenticated;
create policy ler on public.mensalidades for select to authenticated using (public.eh_dono(estabelecimento_id) or public.eh_admin());
create policy insere on public.mensalidades for insert to authenticated with check (public.eh_admin());
create policy altera on public.mensalidades for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy apaga on public.mensalidades for delete to authenticated using (public.eh_admin());

-- funções: fecha todas e abre só as que o site e os painéis chamam
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.criar_pedido(text, jsonb, uuid), public.acompanhar_pedido(text, text),
  public.avaliar_pedido(text, text, integer, text), public.abrir_chamado(text, text, text, text, text)
  to anon, authenticated;
-- usadas nas políticas: o visitante precisa poder chamar (dão false para ele)
grant execute on function public.eh_publico(text), public.eh_equipe(text), public.eh_dono(text), public.eh_admin()
  to anon, authenticated;
grant execute on function public.cadastrar_estabelecimento(jsonb), public.definir_situacao(text, text, text),
  public.adicionar_equipe(text, text, text, text), public.remover_equipe(text, uuid),
  public.salvar_horarios(text, jsonb), public.salvar_entrega(text, jsonb),
  public.resumo_vendas(timestamptz, timestamptz, text), public.anonimizar_cliente(text) to authenticated;

-- pedidos em tempo real para o painel (a Realtime respeita a RLS acima)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos') then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;

-- ============================================================
-- ARQUIVOS (Supabase Storage)
--   produtos   (público): fotos e logo em "<id da loja>/<arquivo>"; só dono e admin enviam
--   documentos (privado): alvará, contrato etc. em "<id da loja>/<arquivo>"; só dono e admin
-- No Postgres de teste (sem Storage) este bloco não faz nada.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'buckets') then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('produtos', 'produtos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documentos', 'documentos', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists plataforma_fotos_envia on storage.objects;
  drop policy if exists plataforma_fotos_troca on storage.objects;
  drop policy if exists plataforma_fotos_apaga on storage.objects;
  drop policy if exists plataforma_docs_le on storage.objects;
  drop policy if exists plataforma_docs_envia on storage.objects;
  drop policy if exists plataforma_docs_apaga on storage.objects;

  create policy plataforma_fotos_envia on storage.objects for insert to authenticated
    with check (bucket_id = 'produtos' and (public.eh_dono((storage.foldername(name))[1]) or public.eh_admin()));
  create policy plataforma_fotos_troca on storage.objects for update to authenticated
    using (bucket_id = 'produtos' and (public.eh_dono((storage.foldername(name))[1]) or public.eh_admin()))
    with check (bucket_id = 'produtos' and (public.eh_dono((storage.foldername(name))[1]) or public.eh_admin()));
  create policy plataforma_fotos_apaga on storage.objects for delete to authenticated
    using (bucket_id = 'produtos' and (public.eh_dono((storage.foldername(name))[1]) or public.eh_admin()));

  create policy plataforma_docs_le on storage.objects for select to authenticated
    using (bucket_id = 'documentos' and (public.eh_dono((storage.foldername(name))[1]) or public.eh_admin()));
  create policy plataforma_docs_envia on storage.objects for insert to authenticated
    with check (bucket_id = 'documentos' and (public.eh_dono((storage.foldername(name))[1]) or public.eh_admin()));
  create policy plataforma_docs_apaga on storage.objects for delete to authenticated
    using (bucket_id = 'documentos' and public.eh_admin());
end $$;
