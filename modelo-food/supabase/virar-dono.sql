-- Passo final: torna VOCÊ o dono do painel.
-- 1) No Supabase: Authentication > Users > Add user (e-mail + senha, marque "Auto Confirm User").
-- 2) Troque o e-mail abaixo pelo MESMO e-mail que você acabou de cadastrar, cole no SQL Editor e Run.
insert into public.equipe (user_id, nome, papel)
select id, 'Dono', 'dono' from auth.users where email = 'TROQUE-PELO-SEU-EMAIL@exemplo.com'
on conflict (user_id) do update set papel = 'dono';
-- Deve aparecer "Success. 1 row affected". Se aparecer 0 rows, o e-mail não confere.
