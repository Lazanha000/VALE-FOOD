# PENDÊNCIAS — leia isto primeiro

Arquivo de passagem entre sessões. **Toda sessão deve:** ler este arquivo, fazer a próxima
etapa, testar, atualizar este arquivo (mover o feito para "Feito", anotar o que descobriu),
fazer commit e publicar no `main` (o GitHub Pages publica o `main`).

Site no ar: https://lazanha000.github.io/prototipo-hamburgueria/
Tipo: HTML/JS puro, sem build. Dados do restaurante em `js/config.js`, cardápio em `js/products.js`.
Guia para configurar um cliente: `COMO-CONFIGURAR.md`. Verificador: `node conferir-modelo.mjs`.

## Estado atual (2026-10-29)

Site publicado e **ligado ao Supabase** (projeto `znlwiybqeyysawcttxkk`). Conferido no banco real
(registros do Supabase, 29/10): o dono entrou no painel, o tempo real conectou, fez 2 pedidos de teste,
mudou status e pagamento (PATCH) e salvou entrega (`rpc/salvar_entrega`); o cliente acompanhou o pedido.
Ainda com dados de TESTE (no `config.js` E na tabela `loja` do banco): WhatsApp e Pix = número do dono
do projeto, nome do Pix "MODELO BURGUER", endereço de retirada "Rua Exemplo". `node conferir-modelo.mjs`
agora lista também o que está no banco.

**Auditoria completa (29/10): `AUDITORIA.md`** (o que funciona, o que não é automático, o que ainda é
de teste, hospedagem comercial, Supabase do cliente, app, venda). Ler antes de vender.

## Próximas etapas (na ordem)

1. **Só o dono pode fazer** (passo a passo em "Depende do dono", abaixo): desligar o cadastro aberto no
   Supabase; testar num celular real e abrindo o link pelo Instagram; ver se o pedido novo chega sozinho no
   painel com som (painel aberto num aparelho, pedido feito em outro); trocar no banco o que é de teste.
2. Conferir no banco real o que ainda falta (precisa do login do dono, não dá pelo conector sem senha):
   preço por produto/opção pelo painel (PATCH em `produtos`/`opcoes`) e a aba Loja > horários
   (`salvar_horarios` já foi conferida por SQL simulando o login do dono, com desfazer).
3. **Pagamento automático** (decidir com o dono; a versão barata já está feita, ver "Feito"):
   b. Automática (quando o restaurante estiver vendendo): Mercado Pago ou Asaas gerando um Pix por pedido e
      avisando por webhook (função Edge do Supabase) para marcar `pagamento_status = 'confirmado'` sozinho.
      Precisa de conta do restaurante no provedor, chave secreta guardada como secret da função (nunca no site)
      e taxa por pagamento. Não existe "botão que abre o banco do cliente" universal: o que funciona é o copia e cola.
4. Testar num celular real (inclusive abrindo pelo Instagram) e no painel do dono: criar produto com foto
   tirada na hora pela câmera. Testado só em celular simulado.
5. Hospedagem do cliente: Hostinger (o dono escolheu) ou Cloudflare Pages; o GitHub Pages proíbe uso comercial.
6. Supabase de cada cliente: conta do restaurante, região São Paulo (ver AUDITORIA.md item 7).
7. Opcional: vibração/som no celular do cliente quando o status mudar (hoje aparece um aviso na tela).
8. Painel, terceira parte (só se o restaurante pedir): criar/renomear produto, trocar foto, editar
   WhatsApp/Pix/local de retirada pelo painel (hoje: Table Editor, só o dono pela RLS) e gerenciar
   a equipe pelo painel (hoje: SQL Editor). Ideia: Pix pelo painel com confirmação dupla, já que
   é o dado mais sensível.

## Depende do dono (passo a passo)

- **Fechar o cadastro aberto** (hoje qualquer pessoa consegue criar conta; não vê nada, mas é melhor fechar):
  Supabase > Authentication > Sign In / Providers > desligar **Allow new users to sign up** > Save.
  Conferido em 29/10 pela API: o cadastro ainda está aberto.
- Opcional (plano pago do Supabase): Authentication > Policies (ou Attack Protection) > ligar
  **Leaked password protection** (recusa senha que já vazou na internet).
- Pedidos de teste no banco: MO-DDFB4 (cancelado) e MO-WMGCB (entregue), ambos "Davi Lisboa", com endereço real.
  Antes de entregar ao cliente, apagar (SQL Editor): `delete from public.pedidos where codigo in ('MO-DDFB4', 'MO-WMGCB');`
  (apaga os 2 pedidos e os itens deles; não mexe em mais nada).
- Ao ter os dados reais: Table Editor > `loja`: `whatsapp` (com 55), `pix_chave`, `pix_tipo`, `pix_nome`
  (titular, até 25 letras), `pix_cidade`, `retirada_local`. Depois `node conferir-modelo.mjs`.

## Depende do cliente (não fazer sem os dados)

Lista completa em `COMO-CONFIGURAR.md`: WhatsApp e Pix reais, `marca.id`, nome/local,
endereço de retirada, horário, CNPJ e e-mail da privacidade, cardápio e fotos, ícones.

## Feito

- 2026-10-29: auditoria; WhatsApp/Pix de teste; `bloquearPedidoFechado: true`; trava sem canal;
  `sw.js` e `conferir-modelo.mjs` restaurados do histórico; marca do rodapé via config;
  hora em Brasília no acompanhamento; `og:url` real; `COMO-CONFIGURAR.md`; publicado no main (PR #1).
- 2026-10-29: **Fase 2a (banco)**. `supabase/schema.sql`: tabelas loja, categorias, produtos,
  grupos_opcao, opcoes, bairros, horarios, equipe, pedidos, pedido_itens, pedidos_acesso (token +
  chave do envio, sem acesso pela API); RLS em tudo; `criar_pedido(dados, chave)` recalcula preço,
  taxa e total, confere esgotado/opções/mínimo/bairro/cidade/horário no fuso/pagamento/troco,
  não duplica com a mesma chave, limita 3 pedidos por telefone e 10 por IP em 10 min, devolve
  `codigo` + `token` de 32; `acompanhar_pedido(codigo, token)` sem dados pessoais. Cupom: recusado
  (não existe ainda). `gerar-cardapio.mjs` + `cardapio.sql` + `LEIAME.md`. Testes em
  `supabase/testes/` (22 de banco/RLS + 6 de ponta a ponta no navegador), todos passando.
- 2026-10-29: **Fase 2b (painel do restaurante)**. `admin.html` + `painel/` (`supabase.js`: login,
  renovação do token e REST por `fetch`, Realtime por WebSocket com batimento e religar; `logica.js`:
  regras sem tela; `painel.js`: telas; `painel.css`). Login por e-mail/senha do Supabase Auth, só quem
  está em `equipe` entra. Pedidos em tempo real com som e destaque (e consulta a cada 15 s se o tempo
  real cair), botão de próximo passo, seletor de status/cancelar, confirmar/desfazer pagamento,
  imprimir comanda, esgotado/disponível, fechar/reabrir a loja. CSP do admin.html: só `'self'`, sem
  script inline, `connect-src` com `wss://*.supabase.co`. Tirado do `config.js` o bloco `admin` e o
  `CONFIG_BASE` (desenho antigo que salvava no GitHub). Testes: `supabase/testes/testar-painel.mjs`
  (15, no navegador) com Auth, PATCH e Realtime imitados em `postgrest-falso.mjs` e `routeWebSocket`;
  servidor de teste comum em `supabase/testes/servidor.mjs`.

- 2026-10-29: fotos da abertura (8 camadas do lanche) só são baixadas quando a pessoa entra pelo
  início (`/`, `#inicio`). Os `<link rel="preload">` fixos saíram do `index.html`; agora o script do
  tema (o único inline) cria esses preloads só nessas rotas (hash da CSP atualizado). Testado no
  navegador: início e `#inicio` pedem as 8 e mostram as fotos; `#cardapio`, `#cardapio?...` e
  `#carrinho` pedem 0; de `#cardapio` para `#inicio` as fotos carregam normalmente; sem erro no
  console (CSP ok). Testes do banco/site/painel continuam passando (22 + 6 + 15).

- 2026-10-29: **Total esperado + papéis + painel do dono**.
  - Site manda `totalEsperado` em `paraServidor`; `criar_pedido` recusa se o total dele for outro
    ("Os preços mudaram…", `hint = 'precos'`). `rpc()` põe o hint em `erro.motivo`; o checkout então
    busca o cardápio de novo (`carregarDoBanco`), atualiza comanda, total e botão e o cliente confirma
    de novo (mesma chave de envio), com a lista de bairros refeita se a taxa mudou. Ninguém paga
    diferente do que viu.
  - `equipe.papel` ('dono' | 'cozinha', padrão 'cozinha', `alter table ... add column if not exists`
    para quem já rodou o schema antigo) + `eh_dono()`. Cozinha: pedidos, pagamento, `produtos.disponivel`
    e `loja.aberta_manual` (gatilho `_so_dono(colunas livres)` em produtos e loja dá 42501 para o resto).
    Criar/apagar no cardápio e alterar categorias/opções/bairros/horários: só dono (RLS).
  - Funções do dono `salvar_horarios(faixas)` e `salvar_entrega(dados)` (tudo ou nada, mensagens P0001
    prontas, 42501 para quem não é dono). Helpers `_inteiro`, `_sim_nao`.
  - Painel: consulta da equipe traz `papel`; dono vê campo de preço por produto e por opção ("Preços das
    opções de …", Enter ou Tab salva por PATCH) e a aba **Loja** (horários por dia com várias faixas;
    entrega/retirada, mínimo, tempo, taxa única ou por bairro com lista). Cozinha vê o preço só como texto.
    `mensagemDoErro` repassa mensagens P0001. Campos com `aria-label` (com `<label>` em volta o nome
    acessível incluía o valor). Celular: nome do produto numa linha, preço e chave na de baixo.
  - Testes: banco 29 (novos: schema roda 2 vezes, total esperado, cozinha não muda preço/Pix/horário/papel,
    dono muda preço/opção/Pix, `salvar_horarios` e `salvar_entrega` com validações), site 6 (o de preço
    agora passa pela recusa e confirma o total novo), painel 25 (novos: regras sem tela, cozinha sem aba
    Loja, dono muda preço/opção, horários, entrega com bairros, erro do banco na tela, cozinha recusada
    pela API direta). `conferir-modelo.mjs` igual ao de antes (só dados do cliente). Telas conferidas em
    1100 px e 390 px, sem rolagem lateral.

- 2026-10-29: `supabase/instalar.sql` (schema + cardápio num arquivo só, testado do zero num Postgres limpo:
  18 produtos, 5 categorias) e `supabase/virar-dono.sql` (cadastra o e-mail do dono na equipe). O dono já criou
  conta e organização no Supabase; falta rodar os dois arquivos e preencher `CONFIG.api` em `js/config.js`
  (Project URL + chave publishable, que é pública). Nunca usar a chave secret/service_role.

- 2026-10-29: **Supabase LIGADO** (projeto `znlwiybqeyysawcttxkk`, us-east-1). `instalar.sql` já rodado (18 produtos,
  5 categorias, equipe vazia). `CONFIG.api` preenchido em `js/config.js` com URL + chave publishable. Conferido no
  banco real: visitante lê cardápio, não lê `pedidos`; `criar_pedido` calculou R$ 28,00 sozinho. Um pedido de teste
  ("Teste Robo", MO-2HU2U) ficou no banco: apagar (`delete from public.pedidos where cliente_nome = 'Teste Robo'`).
  Falta: criar o usuário do dono em Authentication > Users e rodar `virar-dono.sql`; depois testar o painel de verdade.

- 2026-10-29: login do dono criado no Supabase (davideaguilarvieira@gmail.com, papel `dono`, vinculado na `equipe`).
  Apagar o usuário no Authentication APAGA o vínculo (on delete cascade): se recriar, rodar de novo
  `insert into public.equipe (user_id, nome, papel) select id, 'Dono', 'dono' from auth.users where email = '...'`.
  AINDA NÃO conferido: login no painel pelo site publicado (o dono relatou que não entrou; vínculo refeito, aguardando novo teste).
  O pedido de teste "Teste Robo" já não está no banco. Conector Supabase disponível nas sessões (projeto `znlwiybqeyysawcttxkk`).

- 2026-10-29: **auditoria com o banco real + pagamento mais fácil + acompanhamento automático**.
  - Banco real conferido pelo conector: RLS ligada nas 11 tabelas; visitante não lê `pedidos`, `equipe`,
    `pedidos_acesso`, não muda `loja`, não chama `eh_dono`/`_loja_aberta`; as 14 funções do banco são
    idênticas às do `schema.sql` (só muda o fim de linha). `hint: "precos"` chega no JSON de erro do PostgREST
    de verdade; a consulta embutida `produtos?select=...,grupos_opcao(...opcoes(...))` funciona; `salvar_horarios`
    roda com o login do dono (testado com desfazer). Avisos do Supabase: as funções públicas do site
    (`criar_pedido`, `acompanhar_pedido`, `eh_equipe`) são assim de propósito; `pedidos_acesso` sem política
    também (ninguém lê pela API).
  - Corrigido: o limite de 10 pedidos por rede usava o 1º IP do `x-forwarded-for`, que o navegador pode
    inventar. Agora usa `cf-connecting-ip` (Cloudflare) e só cai no outro se faltar. Aplicado no banco real
    (migração `criar_pedido_ip_cloudflare`) e no `schema.sql`/`instalar.sql`. Teste novo no banco.
  - Pagamento (versão barata): no site, botão "Copiar código Pix" grande e aviso "Depois de pagar, volte aqui"
    (sem banco: "envie pelo WhatsApp"); "Pagamento: Pix" em vez de "Pagamento na entrega: Pix". No painel,
    pedido Pix não pago mostra um quadro com o valor grande e o nome do cliente para comparar com o extrato.
  - Acompanhamento: a tela do pedido consulta sozinha a cada 15 s (`INTERVALO_ACOMPANHAR` em
    `js/pages/tracking.js`) só com a aba visível e até o pedido terminar; ao voltar para a aba confere na hora;
    para ao sair da tela (`destruir`). Aviso na tela quando muda etapa/pagamento; a lista de itens aberta
    continua aberta; erro de internet na atualização não apaga o cartão. Corrigido: "Atualizar status" dizia
    "Status atualizado" mesmo quando dava erro.
  - `conferir-modelo.mjs` lê a tabela `loja` do banco (pública) e acusa WhatsApp/Pix de teste, "Rua Exemplo",
    "Sua Cidade" e nome do Pix "MODELO".
  - Testes: banco 30, site 8 (novo: atualiza sozinho, para com aba escondida e com pedido entregue), painel 25
    (quadro do Pix). `FOTOS=<pasta>` nos testes do site e do painel guarda as telas; conferidas em 390 px.

- 2026-10-29: **auditoria completa** (`AUDITORIA.md`).
  - Banco fora do ar/pausado ao confirmar (sem resposta ou 5xx): `rpc()` marca `erro.semConexao`; o checkout
    mostra "Enviar o pedido pelo WhatsApp" (`pedidoSoWhatsapp` em `js/services/api.js`, registro com
    `semSistema: true`, guardado no aparelho). A mensagem abre com "ATENÇÃO: o sistema de pedidos estava fora
    do ar..."; a tela do pedido trata como sem acompanhamento; consulta posterior dá `erro: 'sem-sistema'`.
  - Rodapé com razão social, CNPJ (só se tiver formato real) e endereço (Decreto 7.962/2013):
    `[data-empresa]` no `index.html`, campo novo `privacidade.endereco` (vazio = `retirada.local`).
  - Painel: som começa LIGADO (só desliga se alguém desligar no aparelho); botão vermelho piscando
    "Toque aqui para ativar o som" quando o navegador bloqueia o áudio; som + vibração repetem a cada 20 s
    enquanto houver pedido "Novo"; Wake Lock (tela não apaga) pedido de novo ao voltar para a aba;
    resumo do dia `#pn-resumo` (`resumoDoDia` em `painel/logica.js`, fuso da loja, sem cancelados).
  - Testes: banco 30, site 9 (novo: banco cai ao confirmar), painel 26 (novo: resumo do dia). Todos passam.
  - Banco real (só leitura): 2 pedidos de teste ainda lá; `loja` ainda com dados de teste; região us-east-1;
    sem bucket de Storage; `entrega_minimo` = 600 no banco e 2000 no `config.js` (deixar iguais: o config é a reserva).

- 2026-10-29: **produtos e fotos pelo painel + WhatsApp opcional**.
  - Cadastro aberto conferido pela API: desligado ("signup_disabled"). Pedidos de teste MO-DDFB4 e MO-WMGCB apagados.
  - Storage: bucket público `produtos` (2 MB, webp/jpeg/png) + políticas "só o dono" em `storage.objects`
    (fim do `schema.sql`; bloco ignorado onde não há Storage). Aplicado no banco real (migração
    `fotos_produtos_storage`) e conferido por SQL: visitante e fora da equipe recusados, dono aceito.
  - Painel (`painel/painel.js`, `painel/fotos.js`, `painel/supabase.js` com `enviarArquivo`/`apagarArquivo`):
    "+ Produto novo" e "Editar nome, descrição e foto" (só dono); foto cortada/reduzida a 640x640 webp
    (jpg se o navegador não gerar webp); caminho `<id>/<16 letras>.<ext>`; foto antiga do Storage apagada.
    CSP do admin.html: img-src com `blob:` e `https://*.supabase.co`.
  - `CONFIG.whatsapp.abrirSozinhoComBanco` (false): com o banco ligado o WhatsApp não abre sozinho ao confirmar;
    vira o botão opcional "Mandar o resumo no WhatsApp da loja". Sem banco continua abrindo.
  - Testes: banco 30, site 10 (novo: iPhone com navegador do Instagram), painel 29 (novos: criar produto com foto
    e ver no site; trocar foto/descrição/tirar do cardápio; cozinha recusada). Storage falso nos testes do painel.

## Cuidados

- Trocou as fotos das camadas (`CINE_LAYERS` em `js/art.js`)? Atualize a lista no script do tema do
  `index.html` (ele faz o preload) e rode `node conferir-modelo.mjs` para o hash novo da CSP.
- Mudou o script inline do `index.html`? Rode `node conferir-modelo.mjs`, que mostra o novo hash da CSP.
- Arquivo `.js` novo: adicionar no `sw.js` (lista BASE, subir VERSAO) e no `modulepreload` do `index.html`.
- Testar com `python3 -m http.server <porta livre>` + Playwright (já instalado na nuvem).
- Mudou `supabase/schema.sql`, `js/services/` ou `painel/`? Rode os testes do banco. Postgres 16 já vem na nuvem
  (`/usr/lib/postgresql/16/bin`), mas parado. Para subir:
  `mkdir -p /var/lib/postgresql && chown postgres /var/lib/postgresql && su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/teste -A trust -E UTF8 --locale=C.UTF-8 && /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/teste -o '-p 5499 -k /tmp' -l /var/lib/postgresql/teste/log start"`
  e depois `export PGHOST=/tmp PGPORT=5499 PGUSER=postgres; node supabase/testes/testar-banco.mjs && node supabase/testes/testar-site.mjs && node supabase/testes/testar-painel.mjs`
  (o primeiro recria o banco `teste_supabase` do zero; os outros usam esse banco).
  Baixar o binário do PostgREST foi bloqueado na nuvem: `supabase/testes/postgrest-falso.mjs` imita as rotas usadas.
- Mudou o cardápio/loja do modelo? Gere de novo: `node supabase/gerar-cardapio.mjs > supabase/cardapio.sql`.
- `loja` é pública (o site lê com `select=*`): nunca pôr segredo nela. Segredo de pedido fica em `pedidos_acesso`.
- O painel fica FORA de `js/` de propósito: assim não entra no `sw.js` nem no `modulepreload` do site
  (o `conferir-modelo.mjs` exige isso só para `js/`). Consulta nova do painel ao `/rest/v1`? Imite a rota
  em `supabase/testes/postgrest-falso.mjs` (ele não interpreta o PostgREST, só reconhece as consultas usadas).
- Coluna nova que a cozinha pode mexer em `produtos` ou `loja`? Acrescente o nome no gatilho
  (`_so_dono('disponivel')` / `_so_dono('aberta_manual')`); senão ela leva "sem permissão".
- Mudou a conta do total no site (`js/store.js`, `js/delivery.js`)? Tem de bater com `criar_pedido`,
  senão TODO pedido cai em "Os preços mudaram". O teste do site pega isso.
