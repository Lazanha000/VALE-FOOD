-- ============================================================
-- BANCO DO SITE (Supabase / Postgres)
--
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo depois (para atualizar as funções): não apaga dados.
-- Depois rode o cardápio (supabase/cardapio.sql, gerado por gerar-cardapio.mjs).
-- Passo a passo completo: supabase/LEIAME.md
--
-- Quem pode o quê:
--   * visitante do site (papel "anon"): lê o cardápio e os dados públicos da loja;
--     cria pedido e acompanha pedido SÓ pelas funções criar_pedido e acompanhar_pedido.
--     Não lê nem altera pedido nenhum direto nas tabelas.
--   * equipe do restaurante (usuário logado que está na tabela "equipe"), com dois papéis:
--       - 'cozinha': lê os pedidos, muda status e pagamento, marca esgotado e abre/fecha a loja;
--       - 'dono': tudo isso e mais preços, cardápio, horários, entrega, bairros e dados da loja (Pix).
--   * o banco recalcula preço, taxa e total: o que vem do navegador é só o pedido, nunca valor.
-- ============================================================

set client_min_messages = warning;   -- menos avisos "já existe" ao rodar de novo

-- ---------- LOJA (uma linha só, id = 1) ----------
-- Tudo aqui é público (o site lê com select=*): não guarde segredo nesta tabela.
create table if not exists public.loja (
  id smallint primary key default 1 check (id = 1),
  prefixo_pedido text not null default 'PD' check (prefixo_pedido ~ '^[A-Z]{1,4}$'),
  whatsapp text check (whatsapp ~ '^[0-9]{12,13}$'),          -- com 55 na frente: 5533999999999
  aberta_manual boolean not null default true,               -- false = "fechada agora" (botão do painel)
  bloquear_fechado boolean not null default true,            -- fora do horário não aceita pedido
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
  atualizado_em timestamptz not null default now()
);
insert into public.loja (id) values (1) on conflict (id) do nothing;

-- ---------- CARDÁPIO ----------
create table if not exists public.categorias (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  nome text not null check (length(nome) between 1 and 40),
  ordem integer not null default 0,
  ativo boolean not null default true
);

create table if not exists public.produtos (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  categoria_id text not null references public.categorias (id) on update cascade,
  nome text not null check (length(nome) between 1 and 60),
  descricao text not null default '' check (length(descricao) <= 300),
  preco integer not null check (preco between 0 and 1000000),   -- centavos
  imagem text,              -- 'assets/produtos/x.webp' ou '<produto>/<arquivo>.webp' do Storage
  arte text,                -- ilustração de reserva (ver js/art.js)
  destaque boolean not null default false,
  disponivel boolean not null default true,   -- false = "Esgotado" (aparece, mas não vende)
  ativo boolean not null default true,        -- false = some do cardápio
  removiveis text[] not null default '{}',
  ordem integer not null default 0
);
create index if not exists produtos_categoria on public.produtos (categoria_id);

create table if not exists public.grupos_opcao (
  id bigint generated always as identity primary key,
  produto_id text not null references public.produtos (id) on update cascade on delete cascade,
  chave text not null check (chave ~ '^[a-z0-9-]{1,40}$'),
  nome text not null check (length(nome) between 1 and 40),
  tipo text not null check (tipo in ('unica', 'multipla')),
  obrigatorio boolean not null default false,
  max integer check (max between 1 and 20),
  ordem integer not null default 0,
  unique (produto_id, chave)
);

create table if not exists public.opcoes (
  id bigint generated always as identity primary key,
  grupo_id bigint not null references public.grupos_opcao (id) on delete cascade,
  chave text not null check (chave ~ '^[a-z0-9-]{1,40}$'),
  nome text not null check (length(nome) between 1 and 60),
  preco integer not null default 0 check (preco between 0 and 1000000),
  ativo boolean not null default true,
  ordem integer not null default 0,
  unique (grupo_id, chave)
);

-- taxa por bairro (só vale com loja.taxa_tipo = 'bairro')
create table if not exists public.bairros (
  id bigint generated always as identity primary key,
  nome text not null unique check (length(nome) between 1 and 60),
  taxa integer not null check (taxa between 0 and 1000000),
  ativo boolean not null default true
);

-- dia: 1 = segunda ... 7 = domingo. Faixa que passa da meia-noite: abre 18:00, fecha 02:00.
-- Dia sem nenhuma linha = fechado.
create table if not exists public.horarios (
  id bigint generated always as identity primary key,
  dia smallint not null check (dia between 1 and 7),
  abre time not null,
  fecha time not null,
  check (abre <> fecha)
);

-- ---------- EQUIPE (quem entra no painel) ----------
-- Para liberar alguém: crie o usuário em Authentication > Users e rode
--   insert into public.equipe (user_id, nome, papel) values ('<id do usuário>', 'Fulano', 'cozinha');
-- papel 'dono' muda preços, horários, entrega e a loja; 'cozinha' (o padrão) só o dia a dia.
create table if not exists public.equipe (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  criado_em timestamptz not null default now()
);
-- coluna nova: quem já estava na equipe antes dela vira 'cozinha' (dê 'dono' a quem precisa)
alter table public.equipe add column if not exists papel text not null default 'cozinha' check (papel in ('dono', 'cozinha'));

-- ---------- PEDIDOS ----------
create table if not exists public.pedidos (
  id bigint generated always as identity primary key,
  codigo text not null unique check (codigo ~ '^[A-Z]{1,4}-[A-Z0-9]{5}$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  status text not null default 'recebido'
    check (status in ('recebido', 'preparo', 'pronto', 'saiu', 'entregue', 'cancelado')),
  pagamento_status text not null default 'pendente' check (pagamento_status in ('pendente', 'confirmado', 'cancelado')),
  modo text not null check (modo in ('entrega', 'retirada')),
  cliente_nome text not null,
  cliente_telefone text not null,     -- só dígitos
  cliente_email text,
  entrega jsonb,                      -- { cep, cidade, endereco, numero, complemento, bairro } ou null (retirada)
  pagamento_forma text not null,
  troco_para integer,
  obs text not null default '',
  subtotal integer not null,
  desconto integer not null default 0,
  taxa integer not null,
  total integer not null
);
create index if not exists pedidos_criado on public.pedidos (criado_em desc);
create index if not exists pedidos_telefone on public.pedidos (cliente_telefone, criado_em desc);

create table if not exists public.pedido_itens (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos (id) on delete cascade,
  ordem integer not null,
  produto_id text not null,           -- sem chave estrangeira: o produto pode sair do cardápio depois
  nome text not null,                 -- nome e preço do momento do pedido
  qtd integer not null check (qtd between 1 and 20),
  preco_unitario integer not null,
  escolhas jsonb not null default '[]',   -- [{ grupo, opcao }] com os nomes
  remover text[] not null default '{}',
  obs text not null default ''
);
create index if not exists pedido_itens_pedido on public.pedido_itens (pedido_id, ordem);

-- Segredos do pedido: token do link de acompanhamento e a chave do envio (evita pedido em dobro).
-- Ninguém lê esta tabela pela API (nem a equipe): só as funções abaixo.
create table if not exists public.pedidos_acesso (
  pedido_id bigint primary key references public.pedidos (id) on delete cascade,
  chave_envio uuid not null unique,
  token text not null,
  ip_hash text
);
create index if not exists pedidos_acesso_ip on public.pedidos_acesso (ip_hash);

-- ============================================================
-- FUNÇÕES AUXILIARES (internas: o site não chama)
-- ============================================================

create or replace function public.eh_equipe() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipe e where e.user_id = auth.uid());
$$;

create or replace function public.eh_dono() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipe e where e.user_id = auth.uid() and e.papel = 'dono');
$$;

-- sem acento e minúscula, para comparar bairro/cidade como o site faz
create or replace function public._sem_acento(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(trim(translate(coalesce(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')));
$$;

-- loja aberta neste instante? (botão "fechada agora" + horários, no fuso da loja)
create or replace function public._loja_aberta(agora timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.loja;
  local_ts timestamp;
  hoje int;
  ontem int;
  h time;
begin
  select * into l from public.loja where id = 1;
  if not found or not l.aberta_manual then return false; end if;
  local_ts := agora at time zone l.fuso;
  hoje := extract(isodow from local_ts)::int;
  ontem := case when hoje = 1 then 7 else hoje - 1 end;
  h := local_ts::time;
  return exists (
    select 1 from public.horarios x
    where (x.dia = hoje and x.abre < x.fecha and h >= x.abre and h < x.fecha)
       or (x.dia = hoje and x.fecha < x.abre and h >= x.abre)      -- vira a meia-noite, parte de hoje
       or (x.dia = ontem and x.fecha < x.abre and h < x.fecha)     -- vira a meia-noite, parte que veio de ontem
  );
end;
$$;

-- pedido no formato que o site entende (js/services/api.js > doServidor).
-- Não devolve nome, telefone nem endereço: quem tem o link vê só o andamento e os itens.
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
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', i.nome, 'qtd', i.qtd, 'precoUnitario', i.preco_unitario,
        'escolhas', i.escolhas, 'remover', to_jsonb(i.remover), 'obs', i.obs) order by i.ordem)
      from public.pedido_itens i where i.pedido_id = p.id), '[]'::jsonb)
  )
  from public.pedidos p where p.id = pid;
$$;

-- texto opcional do JSON: ausente/null -> '', não-texto ou longo demais -> erro para o cliente
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

-- ============================================================
-- criar_pedido(dados, chave) — chamada pelo site ao confirmar o pedido
--   dados = paraServidor(pedido) de js/services/api.js
--   chave = uuid do envio: repetir a chamada com a mesma chave devolve o MESMO pedido
-- Devolve o pedido (ver _pedido_json) + token de 32 caracteres para o link de acompanhamento.
-- Erros de regra saem com código P0001 e mensagem pronta para mostrar ao cliente.
-- ============================================================
create or replace function public.criar_pedido(dados jsonb, chave uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.loja;
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
  v_ip text;
  v_ip_hash text;
  v_codigo text;
  v_token text;
  v_id bigint;
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  n int;
begin
  if chave is null then raise exception 'Envio sem identificação. Atualize a página e tente de novo.'; end if;
  if dados is null or jsonb_typeof(dados) <> 'object' then raise exception 'Pedido inválido. Atualize a página e tente de novo.'; end if;

  -- mesma chave = mesmo envio (clique repetido, nova tentativa depois de cair a internet)
  perform pg_advisory_xact_lock(hashtextextended(chave::text, 0));
  select a.pedido_id into existente from public.pedidos_acesso a where a.chave_envio = chave;
  if existente is not null then
    return public._pedido_json(existente)
      || jsonb_build_object('token', (select a.token from public.pedidos_acesso a where a.pedido_id = existente));
  end if;

  select * into l from public.loja where id = 1;
  if not found then raise exception 'A loja ainda não foi configurada.'; end if;

  -- ---- loja aberta? ----
  if l.bloquear_fechado and not public._loja_aberta() then
    raise exception 'Estamos fechados no momento. Confira o horário no fim da página.';
  end if;

  -- ---- cliente ----
  v_nome := public._texto(dados #> '{cliente,nome}', 'nome', 80);
  if (select count(*) from regexp_split_to_table(v_nome, '\s+') p where length(p) >= 2) < 2 then
    raise exception 'Digite nome e sobrenome.';
  end if;
  v_tel := regexp_replace(public._texto(dados #> '{cliente,telefone}', 'telefone', 20), '\D', '', 'g');
  if length(v_tel) not in (10, 11) or substr(v_tel, 1, 1) = '0' or substr(v_tel, 2, 1) = '0'
     or (length(v_tel) = 11 and substr(v_tel, 3, 1) <> '9') then
    raise exception 'Digite um telefone com DDD, como (11) 98765-4321.';
  end if;
  v_email := nullif(public._texto(dados #> '{cliente,email}', 'e-mail', 100), '');
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Digite um e-mail válido ou deixe em branco.';
  end if;

  -- ---- limite de pedidos (contra pedido falso em massa) ----
  if (select count(*) from public.pedidos p
      where p.cliente_telefone = v_tel and p.criado_em > now() - interval '10 minutes') >= 3 then
    raise exception 'Você já enviou vários pedidos há pouco. Tente de novo em alguns minutos ou fale com a gente pelo WhatsApp.';
  end if;
  -- IP de quem pediu: cf-connecting-ip (posto pela Cloudflare do Supabase, o navegador não consegue
  -- inventar); sem ele, o 1º do x-forwarded-for (esse o navegador pode mandar falso).
  begin
    v_ip := coalesce(
      nullif(trim(current_setting('request.headers', true)::json ->> 'cf-connecting-ip'), ''),
      trim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)));
  exception when others then v_ip := null;
  end;
  if coalesce(v_ip, '') <> '' then
    v_ip_hash := encode(sha256(convert_to('ip:' || v_ip, 'UTF8')), 'hex');
    if (select count(*) from public.pedidos_acesso a join public.pedidos p on p.id = a.pedido_id
        where a.ip_hash = v_ip_hash and p.criado_em > now() - interval '10 minutes') >= 10 then
      raise exception 'Muitos pedidos saíram desta rede há pouco. Tente de novo em alguns minutos ou fale com a gente pelo WhatsApp.';
    end if;
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
      raise exception 'Não entregamos nesta cidade pelo site. Fale com a gente pelo WhatsApp.';
    end if;
    if exists (select 1 from unnest(l.bairros_sem_entrega) b
               where public._sem_acento(b) <> '' and position(public._sem_acento(b) in public._sem_acento(v_bairro)) > 0) then
      raise exception 'Não entregamos neste bairro pelo site. Fale com a gente pelo WhatsApp.';
    end if;
    if l.taxa_tipo = 'bairro' then
      v_bairro := coalesce(nullif(public._texto(dados -> 'bairro', 'bairro', 60), ''), v_bairro);
      select b.taxa into v_taxa from public.bairros b where b.ativo and b.nome = v_bairro;
      if not found then raise exception 'Escolha um bairro da lista. Não achou o seu? Fale com a gente pelo WhatsApp.'; end if;
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

  -- ---- itens: preço SEMPRE do cardápio do banco ----
  if jsonb_typeof(dados -> 'itens') <> 'array' or jsonb_array_length(dados -> 'itens') = 0 then
    raise exception 'Seu carrinho está vazio.';
  end if;
  if jsonb_array_length(dados -> 'itens') > 30 then raise exception 'O pedido aceita até 30 itens diferentes.'; end if;
  for it in select value from jsonb_array_elements(dados -> 'itens') loop
    if jsonb_typeof(it) <> 'object' then raise exception 'Pedido inválido. Atualize a página e tente de novo.'; end if;
    select * into prod from public.produtos p where p.id = public._texto(it -> 'produtoId', 'produto', 60);
    if not found or not prod.ativo or not exists (select 1 from public.categorias c where c.id = prod.categoria_id and c.ativo) then
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
    -- grupo que não existe neste produto = carrinho velho
    if jsonb_typeof(it -> 'escolhas') = 'object' and exists (
      select 1 from jsonb_object_keys(it -> 'escolhas') k
      where not exists (select 1 from public.grupos_opcao gg where gg.produto_id = prod.id and gg.chave = k)) then
      raise exception 'As opções de % mudaram. Atualize a página e confira o carrinho.', prod.nome;
    end if;
    for g in select * from public.grupos_opcao gg where gg.produto_id = prod.id order by gg.ordem, gg.id loop
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

  -- ---- total que o cliente viu na tela (opcional) ----
  -- O preço mudou entre abrir a página e confirmar: não cobra diferente do que ele viu.
  -- hint 'precos' avisa o site para buscar o cardápio de novo (js/pages/checkout.js).
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

  -- ---- pagamento ----
  v_forma := public._texto(dados #> '{pagamento,forma}', 'pagamento', 20);
  if not (v_forma = any (l.pagamentos)) then raise exception 'Escolha como vai pagar.'; end if;
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
  if v_codigo is null then raise exception 'A loja não conseguiu registrar agora. Tente de novo.'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '');   -- 32 caracteres, aleatório forte

  insert into public.pedidos (codigo, modo, cliente_nome, cliente_telefone, cliente_email, entrega,
    pagamento_forma, troco_para, obs, subtotal, desconto, taxa, total)
  values (v_codigo, v_modo, v_nome, v_tel, v_email, v_entrega,
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

-- ============================================================
-- acompanhar_pedido(codigo, token) — página "Acompanhar pedido" e link de acompanhamento.
-- Código e token errados -> null (o site mostra "não encontrado").
-- ============================================================
create or replace function public.acompanhar_pedido(codigo text, token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pid bigint;
begin
  if acompanhar_pedido.codigo is null or acompanhar_pedido.token is null
     or acompanhar_pedido.token !~ '^[A-Za-z0-9]{32}$' or length(acompanhar_pedido.codigo) > 12 then
    return null;
  end if;
  select p.id into pid
  from public.pedidos p join public.pedidos_acesso a on a.pedido_id = p.id
  where p.codigo = upper(trim(acompanhar_pedido.codigo)) and a.token = acompanhar_pedido.token;
  if pid is null then return null; end if;
  return public._pedido_json(pid);
end;
$$;

-- ============================================================
-- PAINEL DO DONO: horários e entrega (admin.html, aba "Loja")
-- Uma chamada troca tudo de uma vez (ou nada, se algo estiver errado).
-- Erros de regra saem com P0001 e mensagem pronta para o painel; quem não é dono leva 42501.
-- ============================================================

-- número inteiro >= 0 do JSON (centavos), com mensagem para o painel
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

-- faixas = [{ dia: 1..7, abre: 'HH:MM', fecha: 'HH:MM' }]. Substitui TODOS os horários.
-- Lista vazia = loja fechada todos os dias (o painel pede confirmação).
create or replace function public.salvar_horarios(faixas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  f jsonb;
  hora_ok constant text := '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$';
  nomes constant text[] := array['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
begin
  if not public.eh_dono() then raise exception 'Só o dono pode mudar os horários.' using errcode = '42501'; end if;
  if faixas is null or jsonb_typeof(faixas) <> 'array' then raise exception 'Horários inválidos. Atualize a página.'; end if;
  delete from public.horarios where true;
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
    insert into public.horarios (dia, abre, fecha) values ((f ->> 'dia')::int, (f ->> 'abre')::time, (f ->> 'fecha')::time);
  end loop;
  if exists (select 1 from public.horarios group by dia having count(*) > 4) then
    raise exception 'No máximo 4 faixas de horário por dia.';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('dia', h.dia, 'abre', h.abre, 'fecha', h.fecha) order by h.dia, h.abre), '[]'::jsonb)
          from public.horarios h);
end;
$$;

-- dados = { entregaAtiva, entregaTempo, entregaMinimo, taxaTipo, taxaFixa,
--           retiradaAtiva, retiradaTempo, retiradaMinimo, bairros: [{ nome, taxa, ativo }] }
-- Valores em centavos. Substitui a lista de bairros inteira.
create or replace function public.salvar_entrega(dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  b jsonb;
  v_ent boolean;
  v_ret boolean;
  v_tipo text;
  v_tempo_ent text;
  v_tempo_ret text;
  v_nome text;
begin
  if not public.eh_dono() then raise exception 'Só o dono pode mudar entrega e taxas.' using errcode = '42501'; end if;
  if dados is null or jsonb_typeof(dados) <> 'object' then raise exception 'Dados inválidos. Atualize a página.'; end if;
  v_ent := public._sim_nao(dados -> 'entregaAtiva', 'entrega');
  v_ret := public._sim_nao(dados -> 'retiradaAtiva', 'retirada');
  if not v_ent and not v_ret then raise exception 'Deixe a entrega ou a retirada ligada: sem as duas, ninguém consegue pedir.'; end if;
  v_tipo := public._texto(dados -> 'taxaTipo', 'tipo de taxa', 10);
  if v_tipo not in ('fixa', 'bairro') then raise exception 'Escolha taxa fixa ou por bairro.'; end if;
  v_tempo_ent := public._texto(dados -> 'entregaTempo', 'tempo de entrega', 30);
  v_tempo_ret := public._texto(dados -> 'retiradaTempo', 'tempo de retirada', 30);
  if v_tempo_ent = '' or v_tempo_ret = '' then raise exception 'Digite o tempo de entrega e de retirada (ex.: 45 min).'; end if;

  update public.loja set
    entrega_ativa = v_ent,
    entrega_tempo = v_tempo_ent,
    entrega_minimo = public._inteiro(dados -> 'entregaMinimo', 'pedido mínimo da entrega'),
    taxa_tipo = v_tipo,
    taxa_fixa = public._inteiro(dados -> 'taxaFixa', 'taxa de entrega'),
    retirada_ativa = v_ret,
    retirada_tempo = v_tempo_ret,
    retirada_minimo = public._inteiro(dados -> 'retiradaMinimo', 'pedido mínimo da retirada')
  where id = 1;

  if jsonb_typeof(dados -> 'bairros') <> 'array' then raise exception 'Lista de bairros inválida. Atualize a página.'; end if;
  if jsonb_array_length(dados -> 'bairros') > 200 then raise exception 'No máximo 200 bairros.'; end if;
  delete from public.bairros where true;
  for b in select value from jsonb_array_elements(dados -> 'bairros') loop
    if jsonb_typeof(b) <> 'object' then raise exception 'Lista de bairros inválida. Atualize a página.'; end if;
    v_nome := public._texto(b -> 'nome', 'nome do bairro', 60);
    if length(v_nome) < 2 then raise exception 'Digite o nome de cada bairro.'; end if;
    if exists (select 1 from public.bairros x where public._sem_acento(x.nome) = public._sem_acento(v_nome)) then
      raise exception 'Bairro repetido na lista: %.', v_nome;
    end if;
    insert into public.bairros (nome, taxa, ativo)
    values (v_nome, public._inteiro(b -> 'taxa', 'taxa de ' || v_nome), public._sim_nao(b -> 'ativo', 'ativo de ' || v_nome));
  end loop;
  if v_ent and v_tipo = 'bairro' and not exists (select 1 from public.bairros x where x.ativo) then
    raise exception 'Com taxa por bairro, cadastre pelo menos um bairro ativo.';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- A cozinha pode mexer só em algumas colunas (tg_argv); o resto é do dono.
-- Vale para o papel "authenticated" (painel/API). SQL Editor e as funções acima passam direto.
create or replace function public._so_dono() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' or public.eh_dono() then return new; end if;
  if (to_jsonb(new) - tg_argv - 'atualizado_em') is distinct from (to_jsonb(old) - tg_argv - 'atualizado_em') then
    raise exception 'Só o dono pode mudar isso.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists produtos_so_dono on public.produtos;
create trigger produtos_so_dono before update on public.produtos for each row execute function public._so_dono('disponivel');
drop trigger if exists loja_so_dono on public.loja;
create trigger loja_so_dono before update on public.loja for each row execute function public._so_dono('aberta_manual');

-- atualizado_em sozinho em cada mudança de pedido e da loja
create or replace function public._tocar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists pedidos_tocar on public.pedidos;
create trigger pedidos_tocar before update on public.pedidos for each row execute function public._tocar();
drop trigger if exists loja_tocar on public.loja;
create trigger loja_tocar before update on public.loja for each row execute function public._tocar();

-- ============================================================
-- PERMISSÕES E RLS
-- O Supabase dá acesso total às tabelas novas para anon/authenticated; aqui
-- tiramos tudo e devolvemos só o necessário. RLS ligada em todas as tabelas.
-- ============================================================
revoke all on public.loja, public.categorias, public.produtos, public.grupos_opcao, public.opcoes,
  public.bairros, public.horarios, public.equipe, public.pedidos, public.pedido_itens, public.pedidos_acesso
  from anon, authenticated;

alter table public.loja enable row level security;
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.grupos_opcao enable row level security;
alter table public.opcoes enable row level security;
alter table public.bairros enable row level security;
alter table public.horarios enable row level security;
alter table public.equipe enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
alter table public.pedidos_acesso enable row level security;   -- sem nenhuma política: ninguém lê pela API

-- cardápio e loja: leitura pública; escrita só da equipe
grant select on public.loja, public.categorias, public.produtos, public.grupos_opcao, public.opcoes,
  public.bairros, public.horarios to anon, authenticated;
grant insert, update, delete on public.categorias, public.produtos, public.grupos_opcao, public.opcoes,
  public.bairros, public.horarios to authenticated;
grant update on public.loja to authenticated;

do $$
declare t text;
begin
  foreach t in array array['loja', 'categorias', 'produtos', 'grupos_opcao', 'opcoes', 'bairros', 'horarios',
                           'equipe', 'pedidos', 'pedido_itens'] loop
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists equipe_altera on public.%I', t);
    execute format('drop policy if exists equipe_insere on public.%I', t);
    execute format('drop policy if exists equipe_apaga on public.%I', t);
  end loop;
end $$;

create policy ler on public.loja for select to anon, authenticated using (true);
create policy ler on public.categorias for select to anon, authenticated using (ativo or public.eh_equipe());
create policy ler on public.produtos for select to anon, authenticated using (ativo or public.eh_equipe());
create policy ler on public.grupos_opcao for select to anon, authenticated using (true);
create policy ler on public.opcoes for select to anon, authenticated using (true);
create policy ler on public.bairros for select to anon, authenticated using (ativo or public.eh_equipe());
create policy ler on public.horarios for select to anon, authenticated using (true);

-- loja e produtos: a equipe toda altera, mas a cozinha só aberta_manual / disponivel (gatilho _so_dono)
create policy equipe_altera on public.loja for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy equipe_altera on public.produtos for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
-- criar e apagar no cardápio, e mexer em categorias, opções, bairros e horários: só o dono
do $$
declare t text;
begin
  foreach t in array array['categorias', 'produtos', 'grupos_opcao', 'opcoes', 'bairros', 'horarios'] loop
    execute format('create policy equipe_insere on public.%I for insert to authenticated with check (public.eh_dono())', t);
    if t <> 'produtos' then
      execute format('create policy equipe_altera on public.%I for update to authenticated using (public.eh_dono()) with check (public.eh_dono())', t);
    end if;
    execute format('create policy equipe_apaga on public.%I for delete to authenticated using (public.eh_dono())', t);
  end loop;
end $$;

-- equipe: cada um vê só a própria linha (o painel usa isso para saber se a pessoa tem acesso e o papel).
-- Ninguém muda a equipe pela API: só no SQL Editor (ver supabase/LEIAME.md, passo 5).
grant select on public.equipe to authenticated;
create policy ler on public.equipe for select to authenticated using (user_id = auth.uid());

-- pedidos: só a equipe lê; muda só status e pagamento (valores e dados do cliente não mudam)
grant select on public.pedidos, public.pedido_itens to authenticated;
grant update (status, pagamento_status) on public.pedidos to authenticated;
create policy ler on public.pedidos for select to authenticated using (public.eh_equipe());
create policy equipe_altera on public.pedidos for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy ler on public.pedido_itens for select to authenticated using (public.eh_equipe());

-- funções: o site chama só criar_pedido e acompanhar_pedido; as internas ficam fechadas
revoke execute on function public.criar_pedido(jsonb, uuid), public.acompanhar_pedido(text, text),
  public._loja_aberta(timestamptz), public._pedido_json(bigint), public._texto(jsonb, text, int),
  public._sem_acento(text), public._tocar(), public.eh_equipe(), public.eh_dono(),
  public._inteiro(jsonb, text), public._sim_nao(jsonb, text), public._so_dono(),
  public.salvar_horarios(jsonb), public.salvar_entrega(jsonb) from public, anon, authenticated;
grant execute on function public.criar_pedido(jsonb, uuid), public.acompanhar_pedido(text, text) to anon, authenticated;
-- eh_equipe aparece nas políticas de leitura do cardápio: o visitante precisa poder chamá-la (dá false)
grant execute on function public.eh_equipe() to anon, authenticated;
-- painel: eh_dono nas políticas de escrita; as funções do dono conferem o papel lá dentro
grant execute on function public.eh_dono(), public.salvar_horarios(jsonb), public.salvar_entrega(jsonb) to authenticated;

-- pedidos em tempo real para o painel (admin.html). A Realtime respeita a RLS acima.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos') then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;

-- ============================================================
-- FOTOS DOS PRODUTOS (Supabase Storage, bucket "produtos")
-- O painel do dono sobe a foto já reduzida (640 x 640) em "<id do produto>/<nome aleatório>.webp|jpg"
-- e grava esse caminho em produtos.imagem. Todo mundo vê (bucket público); só o dono envia,
-- troca ou apaga. No Postgres de teste (sem Storage) este bloco não faz nada.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage')
     or not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'buckets') then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('produtos', 'produtos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists produtos_fotos_dono_le on storage.objects;
  drop policy if exists produtos_fotos_dono_envia on storage.objects;
  drop policy if exists produtos_fotos_dono_troca on storage.objects;
  drop policy if exists produtos_fotos_dono_apaga on storage.objects;
  create policy produtos_fotos_dono_le on storage.objects for select to authenticated
    using (bucket_id = 'produtos' and public.eh_dono());
  create policy produtos_fotos_dono_envia on storage.objects for insert to authenticated
    with check (bucket_id = 'produtos' and public.eh_dono());
  create policy produtos_fotos_dono_troca on storage.objects for update to authenticated
    using (bucket_id = 'produtos' and public.eh_dono()) with check (bucket_id = 'produtos' and public.eh_dono());
  create policy produtos_fotos_dono_apaga on storage.objects for delete to authenticated
    using (bucket_id = 'produtos' and public.eh_dono());
end $$;
