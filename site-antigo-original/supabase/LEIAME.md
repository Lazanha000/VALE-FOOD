# Banco de pedidos (Supabase) — passo a passo

Com o banco ligado, o site:

- lê **cardápio, preços, esgotados, horário, taxas e Pix** do banco (sem publicar o site de novo);
- **registra cada pedido no banco antes** de abrir o WhatsApp, com o preço recalculado lá
  (o navegador manda só o que foi pedido, nunca o valor);
- dá ao cliente um **link de acompanhamento** (código + token secreto) que mostra o andamento.

Sem o banco (`CONFIG.api` em `null`), tudo continua como hoje: cardápio do `js/products.js` e pedido pelo WhatsApp.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `schema.sql` | Tabelas, regras de acesso (RLS) e as funções `criar_pedido` e `acompanhar_pedido`. Pode rodar de novo para atualizar: não apaga dados. |
| `gerar-cardapio.mjs` | Gera o `cardapio.sql` a partir de `js/products.js` e `js/config.js`. |
| `cardapio.sql` | Cardápio, horários, taxa e dados da loja para colocar no banco (o deste repositório é o do modelo). |
| `testes/` | Testes locais (Postgres comum imitando o Supabase, inclusive login e tempo real). Não rode nada desta pasta no Supabase. |

## 1. Criar o projeto

1. Entre em <https://supabase.com> com a conta **do restaurante** (ou a sua, se você administra) e clique em **New project**.
2. Região: **South America (São Paulo)**. Anote a senha do banco num lugar seguro (não vai para o site).
3. Espere o projeto ficar pronto (1 a 2 minutos).

## 2. Criar as tabelas

1. **SQL Editor > New query**, cole o conteúdo inteiro de `supabase/schema.sql` e clique em **Run**.
2. Deve terminar com "Success. No rows returned".

## 3. Colocar o cardápio e os dados da loja

1. Confira `js/config.js` e `js/products.js` do cliente (WhatsApp, Pix, horário, taxa, cardápio).
2. No computador, na pasta do site: `node supabase/gerar-cardapio.mjs > supabase/cardapio.sql`
3. **SQL Editor > New query**, cole `supabase/cardapio.sql` e **Run**.

> O `cardapio.sql` **substitui** cardápio, bairros e horários do banco. Rode só na implantação:
> depois que o restaurante passar a mexer pelo painel, o banco é o dono do cardápio.

## 4. Ligar o site ao banco

1. **Project Settings > API Keys**: copie a **Project URL** e a chave **publishable** (`sb_publishable_...`).
   **Nunca** use a chave *secret* / *service_role* no site.
2. Em `js/config.js`:
   ```js
   api: { supabaseUrl: 'https://xxxxxxxx.supabase.co', chavePublica: 'sb_publishable_...' },
   ```
3. Publique e teste: faça um pedido e veja em **Table Editor > pedidos** se ele apareceu com o total certo.

O `index.html` já libera `https://*.supabase.co` na CSP (fotos e conexões): nada a mudar lá.

## 5. Dar acesso à equipe (painel do restaurante)

O painel fica em `<endereço do site>/admin.html` (ex.: `https://lazanha000.github.io/prototipo-hamburgueria/admin.html`).

1. **Authentication > Users > Add user**: e-mail e senha da pessoa (marque *Auto Confirm User*).
   Use uma senha forte e diferente para cada pessoa.
2. Copie o **UID** do usuário criado e rode no SQL Editor, escolhendo o papel:
   ```sql
   -- dono: tudo, inclusive preços, horários, entrega, bairros e Pix
   insert into public.equipe (user_id, nome, papel) values ('<UID>', 'Nome do dono', 'dono');
   -- cozinha/atendimento: pedidos, pagamento, esgotado e abrir/fechar a loja
   insert into public.equipe (user_id, nome, papel) values ('<UID>', 'Nome da pessoa', 'cozinha');
   ```
   Sem `papel`, a pessoa entra como `cozinha`. Trocar depois:
   `update public.equipe set papel = 'dono' where user_id = '<UID>';`
3. Em **Authentication > Sign In / Providers**, desligue **Allow new users to sign up**
   (só quem você cadastrar entra; quem se cadastrar sozinho não vê nada mesmo assim, mas é melhor fechar).
4. Tirar o acesso de alguém: apague a linha da pessoa em `equipe` (ou o usuário em Authentication > Users).

> Já tinha rodado uma versão antiga do `schema.sql`? Rode o arquivo novo de novo (não apaga nada).
> Quem já estava na equipe vira `cozinha`: dê `dono` a quem precisa com o `update` acima.

### O que o painel faz

- **Pedidos em tempo real**: chegam sozinhos, com destaque e som. O som começa ligado e **repete a cada
  20 segundos** (e o aparelho vibra) até alguém tocar em "Começar preparo". O navegador só libera o som
  depois de um toque na tela: enquanto isso, o botão do som fica vermelho piscando ("Toque aqui para
  ativar o som"). Com o painel aberto, a tela do tablet/celular não apaga sozinha. Deixe o aparelho na tomada.
- **Resumo do dia**: no topo da lista, quantos pedidos e quanto vendeu hoje (sem os cancelados), por forma
  de pagamento, e quantos Pix ainda não foram confirmados. Serve para fechar o caixa. O indicador "Ao vivo" mostra a conexão; se cair, o painel avisa e
  confere os pedidos a cada 15 segundos até voltar.
- **Andamento**: um botão leva ao próximo passo (preparo, pronto, saiu para entrega, entregue). O seletor
  "Status" corrige ou cancela (pede confirmação). O cliente vê a mudança no link de acompanhamento.
- **Pagamento**: "Confirmar pagamento" depois de conferir o Pix no app do banco (ou ao receber na entrega).
  Pedido Pix ainda não pago mostra o valor grande e o nome do cliente, para comparar com o extrato.
  O cliente vê "pagamento confirmado" sozinho na tela do pedido (ela se atualiza a cada 15 segundos).
- **Cardápio**: marcar item **esgotado** e de volta **disponível**.
- **Só o dono — produtos e fotos** (aba Cardápio): "+ Produto novo" (nome, categoria, descrição, preço e foto) e,
  em cada produto, "Editar nome, descrição e foto" (também tira/volta o produto do cardápio do site). A foto
  pode vir direto da câmera do celular: o painel corta o centro e reduz para 640 x 640 (uns 50 KB) antes de
  enviar para o Storage (bucket `produtos`, criado pelo `schema.sql`; só o dono envia). Opções (tamanho,
  adicionais) de produto novo e categorias novas ainda são pelo Table Editor.
- **Loja**: "Fechar agora" para de aceitar pedidos na hora, até "Reabrir" (o horário continua valendo).
- **Imprimir comanda** de cada pedido.
- **Só o dono**:
  - **Preços** na aba Cardápio: digite o valor e aperte Enter. Também o preço a mais de cada opção
    (ex.: batata média), em "Preços das opções".
  - Aba **Loja**: horário de cada dia (mais de uma faixa por dia, faixa que passa da meia-noite),
    entrega (ligada/desligada, tempo, pedido mínimo, taxa única ou por bairro com a lista de bairros)
    e retirada (ligada/desligada, tempo, mínimo). Cada formulário salva tudo de uma vez; se algo estiver
    errado (ex.: entrega e retirada desligadas), o banco recusa e o painel mostra o motivo.

Preço mudou enquanto um cliente estava com o carrinho aberto? O site manda o total que o cliente viu;
se o banco calcular outro, recusa com "Os preços mudaram", o site busca o cardápio de novo e mostra o
total novo para o cliente confirmar. Ninguém paga diferente do que viu na tela.

O painel grava no banco com o login da pessoa, e quem decide o que pode é a RLS, não o painel:

| | cozinha | dono |
|---|---|---|
| Ver pedidos, mudar status e pagamento | sim | sim |
| Marcar esgotado, abrir/fechar a loja | sim | sim |
| Preços, opções, horários, entrega, bairros | não | sim |
| Dados da loja (WhatsApp, **chave Pix**), criar/apagar produto | não | sim (Table Editor) |
| Total e dados do cliente de um pedido | não | não |

Mesmo mandando a requisição "na mão" com o próprio login, a cozinha leva "sem permissão" do banco.
**Só dê `dono` a quem pode mexer na chave Pix.**

## Como funciona a segurança

- O visitante (chave publishable) **lê** só cardápio e dados públicos da loja. Não lê pedido nenhum,
  não muda preço, não troca a chave Pix: as tabelas têm RLS e as permissões foram fechadas.
- Pedido só entra pela função `criar_pedido`, que confere tudo de novo no banco: produto ativo e não
  esgotado, opções válidas, ingredientes removíveis, pedido mínimo, bairro/cidade atendidos, loja aberta
  (botão "fechada agora" + horário no fuso da loja), forma de pagamento, troco maior que o total.
- Mesma chave de envio = mesmo pedido: clique duplo ou nova tentativa não duplica.
- Limite contra pedido falso em massa: 3 pedidos por telefone e 10 por rede (IP) a cada 10 minutos
  (o IP vem da Cloudflare do Supabase, que o navegador não consegue falsificar).
- O link de acompanhamento usa um token aleatório de 32 caracteres. Ele mostra itens e andamento,
  **não** mostra nome, telefone nem endereço.
- A equipe (tabela `equipe`) lê pedidos e muda **só** status e situação do pagamento; total e dados
  do cliente não podem ser alterados. A `cozinha` muda só esgotado e loja aberta/fechada; o `dono`
  edita também cardápio, preços, horários, bairros e a loja (inclusive o Pix).
- O site manda o total que o cliente viu; se não bater com o do banco, o pedido é recusado
  ("Os preços mudaram") e o cliente confirma de novo com o total novo.
- Cupom ainda não existe: o banco recusa pedido com cupom.

## Mudar coisas direto no banco (o que o painel ainda não faz)

No **Table Editor** (valores em centavos: 2890 = R$ 28,90):

- **Produto novo, nome, descrição, foto, categoria**: tabelas `produtos` e `categorias`
  (`ativo = false` tira do cardápio sem apagar). Opções novas: `grupos_opcao` e `opcoes`.
- **Dados da loja**: tabela `loja` (WhatsApp, chave Pix, local de retirada, cidades atendidas,
  bairros sem entrega, formas de pagamento).
- Preço, horários, entrega, bairros, esgotado e abrir/fechar: use o painel (também dá pelo Table Editor).

## LGPD

Os pedidos guardam nome, telefone e endereço do cliente. Só a equipe vê. Combine com o restaurante
por quanto tempo guardar e apague os antigos de tempos em tempos, por exemplo:

```sql
delete from public.pedidos where criado_em < now() - interval '1 year';
```
