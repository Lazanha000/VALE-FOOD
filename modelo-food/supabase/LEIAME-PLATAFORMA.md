# Banco da plataforma (várias lojas): instalação

Projeto Supabase: **Vale Food**, região São Paulo.
URL: `https://yuwkozekhanioglycsdx.supabase.co`. Chave publishable: `sb_publishable_XaucN9CFXU0iUbVdwAJE_Q_EFCE3rj1`.
Essa chave pode ficar no site. A chave *secret* / *service_role* nunca vai para o site nem para o chat.

## 1. Criar as tabelas (uma vez)

1. No Supabase, abra **SQL Editor** (barra da esquerda) e clique em **New query**.
2. Cole o conteúdo inteiro de `supabase/plataforma.sql` e clique em **Run**.
3. O resultado deve ser "Success. No rows returned".

Pode rodar de novo depois, para atualizar as regras: não apaga dados.
**Não rode o `schema.sql` nem o `instalar.sql` neste projeto.** Eles são do site antigo, de uma loja só.

## 2. Virar administrador

1. Abra **Authentication > Users > Add user > Create new user**.
2. Use o seu e-mail e uma senha forte, e marque **Auto Confirm User**.
3. No **SQL Editor**, rode o comando abaixo, trocando o nome e o e-mail:

```sql
insert into public.admins (user_id, nome)
select id, 'Seu nome' from auth.users where email = 'seu-email@exemplo.com';
```

## 3. O que o banco já faz

| Quem | O que pode |
|---|---|
| Visitante | Ver lojas aprovadas e cardápios; fazer, acompanhar e avaliar pedido; abrir chamado |
| Dono de loja | Cadastrar a loja (fica pendente); montar o cardápio; mudar horários, entrega e Pix; pôr pessoas na equipe; ver pedidos, avaliações e vendas da própria loja |
| Cozinha | Ver pedidos da loja; mudar o status; marcar esgotado; abrir e fechar a loja |
| Administração | Tudo: aprovar, recusar e suspender lojas; atender chamados; lançar mensalidades; ver as vendas de todas as lojas |

O pagamento é feito direto ao estabelecimento (Pix da loja, dinheiro ou maquininha). O banco não guarda cartão.

## 4. Testar no computador (opcional)

Com o Docker ligado:

```bash
docker run -d --name valefood-pg -e POSTGRES_PASSWORD=teste -p 5499:5432 postgres:17
node supabase/testes/testar-plataforma.mjs
```

São 32 testes de permissão, pedido, avaliação, suporte e suspensão.

## Ainda falta (próximas fases)

- Ligar o site e os painéis a este banco (hoje o site ainda usa os dados de exemplo).
- Conta de cliente por SMS (custa por mensagem). Por enquanto, o cliente pede só com nome e telefone, como no site antigo.
- Hospedagem comercial (Cloudflare Pages) e o aplicativo para a Play Store.
