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

## 3. Configurar o login (uma vez)

Sem isso, o link de confirmação que chega por e-mail para o dono da loja leva para um endereço errado.

1. No Supabase, abra **Authentication > URL Configuration**.
2. Em **Site URL**, coloque o endereço do painel:
   `https://lazanha000.github.io/VALE-FOOD/modelo-food/admin.html`
3. Em **Redirect URLs**, adicione o mesmo endereço e clique em **Save**.

Quando o site mudar de endereço (domínio próprio ou Cloudflare Pages), troque nos dois lugares.

O e-mail grátis do Supabase manda **poucos e-mails por hora**. Para muitos cadastros no mesmo dia, configure um SMTP próprio em **Authentication > Emails > SMTP Settings**.

## 4. Como uma loja entra na plataforma

1. O dono abre o site e toca em **Cadastrar meu estabelecimento**.
2. Cria a conta (e-mail e senha), confirma o e-mail e preenche os dados da loja. A loja fica **Em análise**.
3. No painel, ele monta o cardápio (categorias e produtos) e preenche Pix, horários e entrega na aba **Loja**.
4. Você entra no mesmo painel (`admin.html`) com a sua conta de admin. Na aba **Administração**, confere os dados e clica em **Aprovar**. A loja aparece no site na hora.
5. Para a cozinha: o funcionário cria uma conta no painel e você o põe na equipe da loja, no SQL Editor:
   `insert into public.equipe (estabelecimento_id, user_id, papel) select 'id-da-loja', id, 'cozinha' from auth.users where email = 'email@dofuncionario.com';`
   O id da loja aparece no link dela (`#loja?e=id-da-loja`).

## 5. O que o banco já faz

| Quem | O que pode |
|---|---|
| Visitante | Ver lojas aprovadas e cardápios; fazer, acompanhar e avaliar pedido; abrir chamado |
| Dono de loja | Cadastrar a loja (fica pendente); montar o cardápio; mudar horários, entrega e Pix; pôr pessoas na equipe; ver pedidos, avaliações e vendas da própria loja |
| Cozinha | Ver pedidos da loja; mudar o status; marcar esgotado; abrir e fechar a loja |
| Administração | Tudo: aprovar, recusar e suspender lojas; atender chamados; lançar mensalidades; ver as vendas de todas as lojas |

O pagamento é feito direto ao estabelecimento (Pix da loja, dinheiro ou maquininha). O banco não guarda cartão.

## 6. Testar no computador (opcional)

Com o Docker ligado:

```bash
docker run -d --name valefood-pg -e POSTGRES_PASSWORD=teste -p 5499:5432 postgres:17
node supabase/testes/testar-plataforma.mjs
```

São 32 testes de permissão, pedido, avaliação, suporte e suspensão.

Para testar o site e o painel no navegador, com um "Supabase local" (PostgREST no Docker), veja as instruções no começo de `supabase/testes/supabase-local.mjs`.

Os arquivos `schema.sql`, `instalar.sql`, `cardapio.sql`, `gerar-cardapio.mjs`, `virar-dono.sql`, `LEIAME.md` e os testes `testar-banco.mjs`, `testar-painel.mjs` e `testar-site.mjs` são do site antigo, de uma loja só. Eles não servem para esta plataforma.

## Ainda falta

- Textos jurídicos (termos de uso, privacidade, adesão), revisados por advogado.
- Telas do painel para criar opções dos produtos (tamanho, adicionais) e para pôr pessoas na equipe. Hoje as duas coisas são feitas no Supabase.
- Conta de cliente por SMS (custa por mensagem). Por enquanto, o cliente pede só com nome e telefone, como no site antigo.
- Hospedagem comercial (Cloudflare Pages) e o aplicativo para a Play Store.
