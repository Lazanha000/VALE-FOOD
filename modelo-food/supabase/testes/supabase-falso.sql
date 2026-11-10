-- Imita o mínimo do Supabase num Postgres comum, só para testar o schema.sql fora da nuvem.
-- NÃO rode isto no Supabase de verdade.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
-- no Supabase, auth.uid() vem do token do usuário logado; aqui vem de set_config('teste.uid', ...)
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('teste.uid', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- como no Supabase: tabelas novas já nascem com acesso total para anon/authenticated (o schema.sql tira)
alter default privileges in schema public grant all on tables to anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
-- senha do login de teste (no Supabase de verdade a senha fica cifrada no Auth, fora do alcance da API)
alter table auth.users add column if not exists senha text;
