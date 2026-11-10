# Auditoria completa — 29/10/2026

Resposta curta: **o site funciona de verdade** (não é só aparência), mas **não basta trocar os dados do
cliente**. Antes de vender para uma empresa real faltam 3 decisões de infraestrutura e algumas tarefas que
só o dono do projeto pode fazer. Tudo está listado abaixo, com o que foi testado e como.

## 1. Como foi conferido

- Código lido inteiro: site (`js/`), painel (`painel/`), banco (`supabase/schema.sql`).
- 65 testes automáticos rodando o site e o painel de verdade no navegador, com o banco num Postgres
  local: **65 passam** (banco 30, site 9, painel 26). Três deles são novos desta auditoria.
- Banco real (Supabase, projeto `znlwiybqeyysawcttxkk`) conferido em modo só leitura: está no ar,
  com 18 produtos, 7 horários, 1 pessoa na equipe (dono) e 2 pedidos de teste. A segurança (RLS) está
  ligada em todas as tabelas. Os avisos do Supabase foram revisados: são funções públicas de propósito
  (criar e acompanhar pedido). O único aviso real é a proteção contra senha vazada, que só existe no
  plano pago.
- Celular simulado (Pixel 5, 393 px): nenhuma rolagem para o lado. O cardápio pesa cerca de 1,1 MB
  (fotos 640 px em webp), a finalização cerca de 0,4 MB. O site abre sem internet depois da 1ª visita.

## 2. O que funciona de verdade (testado)

| Função | Situação |
|---|---|
| Cardápio, busca, categorias, opções, adicionais, retirar ingrediente | funciona; vem do banco |
| Carrinho salvo no aparelho, editar item, desfazer remoção | funciona |
| Preço, taxa e total | **recalculados pelo banco**; o navegador não consegue mudar o valor |
| Preço mudou com a página aberta | o banco recusa e o cliente confirma o total novo |
| Horário de funcionamento (fuso de Brasília), "fechar agora" pelo painel | funciona no site e no banco |
| Entrega/retirada, pedido mínimo, taxa única ou por bairro, cidades atendidas | funciona |
| Pix com QR e "copia e cola" com o valor exato do pedido | funciona (formato oficial do Banco Central) |
| Pedido no WhatsApp do restaurante, com link do mapa | funciona |
| Acompanhamento do pedido pelo cliente (sozinho, a cada 15 s) | funciona; link seguro com token |
| Painel: pedidos em tempo real, som, andamento, pagamento, esgotado, abrir/fechar | funciona |
| Painel do dono: preços, opções, horários, entrega, bairros | funciona |
| Cozinha não consegue mudar preço, Pix nem horário (nem "por fora", pela API) | conferido |
| Anti-abuso: 3 pedidos por telefone e 10 por rede a cada 10 min, isca para robô | funciona |
| Política de privacidade (LGPD) e botão "apagar meus dados" | funciona; texto é modelo |

## 3. O que foi corrigido nesta auditoria

1. **Banco fora do ar = venda perdida.** Se o Supabase cair, pausar ou a internet falhar na hora de
   confirmar, o site agora oferece "Enviar o pedido pelo WhatsApp". A mensagem chega para a loja com o
   aviso de que o pedido NÃO está no painel e os valores precisam ser conferidos. Antes, o cliente só via
   um erro e desistia. (`js/services/api.js`, `js/pages/checkout.js`, `js/pages/tracking.js`)
2. **Rodapé com razão social, CNPJ e endereço** (o Decreto 7.962/2013 exige isso de quem vende pela
   internet). O CNPJ provisório não aparece. Campo novo: `privacidade.endereco` em `js/config.js`
   (vazio = usa o endereço de retirada).
3. **Painel na cozinha de verdade:**
   - o som de pedido novo **repete a cada 20 s** até alguém tocar em "Começar preparo" (antes tocava uma
     vez só) e o aparelho vibra, se tiver vibração;
   - o som **começa ligado**. Se o navegador bloquear o som (por exemplo, quando o tablet recarrega a
     página), o botão fica **vermelho piscando: "Toque aqui para ativar o som"**. Antes, a página ficava
     muda sem avisar ninguém;
   - **a tela não apaga** sozinha com o painel aberto (Wake Lock). Com a tela apagada, o pedido novo não
     chegava;
   - **resumo do dia**: "Hoje: 12 pedidos · R$ 480,00", separado por forma de pagamento, e quantos Pix
     ainda não foram confirmados. Serve para fechar o caixa.

## 4. O que NÃO é automático (é preciso saber antes de vender)

- **Pagamento Pix é conferido à mão.** O QR já vem com o valor certo, mas alguém da loja precisa olhar o
  app do banco e tocar em "Confirmar pagamento". Para ser automático, é preciso integrar Mercado Pago ou
  Asaas (taxa por Pix; ver PENDENCIAS.md, etapa 3).
- **Cartão é só na maquininha**, na entrega. Não existe pagamento com cartão online.
- **Taxa de entrega por bairro ou fixa**, não por distância. O CEP não preenche o endereço sozinho.
- **Cupom não existe** (o banco recusa). Também não há programa de fidelidade.
- **Produto novo, nome, descrição e foto: resolvido** (o dono faz pelo painel, com foto da câmera do
  celular). Ainda pelo Table Editor: opções (tamanho/adicionais) de produto novo e categorias novas.
- **Chave Pix e WhatsApp** também se mudam só pelo Table Editor (de propósito, por segurança).
- **Sem aviso no celular do dono com o painel fechado.** O painel precisa ficar aberto num aparelho
  ligado (tablet ou celular no balcão). A mensagem no WhatsApp da loja serve de reserva.
- **Relatório** só do dia e das últimas 24 h. Não há histórico mensal no painel (dá para ver no Supabase).

## 5. Informações que hoje NÃO são verdadeiras (trocar antes de publicar)

`node conferir-modelo.mjs` lista 14 pendências; as principais:

- WhatsApp e chave Pix são **números de teste**, no `config.js` **e** no banco (tabela `loja`).
  Nome do Pix "MODELO BURGUER" e endereço "Rua Exemplo, Sua Cidade" também.
- CNPJ `xx.xxx.xxx/0001-xx`, e-mail `contato@suamarca.com.br`, cidade "Sua Cidade, UF".
- **Fotos e descrições do cardápio são do modelo.** Para um cliente real, use fotos dos lanches dele e
  descrições fiéis (peso, ingredientes). Pelo Código de Defesa do Consumidor, a foto não pode prometer
  mais do que é entregue. Isso vale também para as frases da abertura ("Ingredientes de verdade...").
- O pedido mínimo do `config.js` (R$ 20,00) é diferente do banco (R$ 6,00). O site usa o do banco; o
  `config.js` só vale se o banco não responder. **Deixe o `config.js` igual ao banco** (WhatsApp, Pix,
  horário, taxa), porque ele é a reserva quando o banco cai.
- 2 pedidos de teste no banco real (MO-DDFB4 e MO-WMGCB), com endereço real: apagar antes de entregar.

## 6. Publicar num domínio pago: dá, com uma mudança

- **Não use o GitHub Pages para o cliente.** As regras do GitHub proíbem usar o Pages para um negócio
  online ou para um site cujo objetivo principal é vender. Para o modelo de demonstração tudo bem; para
  o restaurante, não. Alternativas gratuitas que permitem uso comercial: **Cloudflare Pages** (melhor
  opção: rápido no Brasil e permite cabeçalhos de segurança) ou Netlify. Não use o plano grátis da
  Vercel: ele é só para uso pessoal.
- O site é só arquivos (sem servidor próprio): a troca é copiar a pasta e apontar o domínio
  (`.com.br` no Registro.br, cerca de R$ 40 por ano).
- Ao trocar o endereço: `og:url` e `og:image` no `index.html` (prévia do link no WhatsApp), `marca.id`,
  `PREFIXO` do `sw.js`, `manifest.webmanifest` (lista completa em `COMO-CONFIGURAR.md`).

## 7. Banco (Supabase) para um cliente real

- **Crie um projeto para cada restaurante, na região São Paulo (sa-east-1).** O projeto atual está nos
  EUA (`us-east-1`): fica mais lento no Brasil e os dados saem do país (a política de privacidade já
  avisa, mas o ideal é ficar no Brasil). Ele também está na conta pessoal de quem o criou.
  Decida no contrato quem é o dono da conta.
- **Plano grátis:** serve para começar, mas não tem cópia de segurança (backup) e o projeto pode
  **pausar** depois de cerca de 7 dias sem uso (férias coletivas, por exemplo). Para cliente pagante,
  recomendo o plano **Pro (US$ 25 por mês)**: backup diário, sem pausa e proteção contra senha vazada.
  Com a correção 1, mesmo com o banco fora do ar a loja continua recebendo pedidos pelo WhatsApp.
- **O preço do README ("Hospedagem R$ 12/mês") não cobre o Supabase Pro** (cerca de R$ 140 por mês).
  Refaça a conta antes de oferecer.
- Desligar **"Allow new users to sign up"** (Authentication > Sign In / Providers). Sem isso, qualquer
  pessoa cria uma conta (não vê nada, mas é melhor fechar).

## 8. Virar app

- O site **já é instalável** no celular ("Adicionar à tela inicial") e abre sem internet (PWA).
- **Google Play:** dá para publicar o próprio site como app (TWA, com o PWABuilder). A conta de
  desenvolvedor custa US$ 25 uma vez só, e o app se atualiza sozinho junto com o site.
- **App Store (iPhone):** a Apple costuma recusar app que é só um site embrulhado. Para restaurante,
  não compensa no começo: o link no Instagram e o WhatsApp já levam o cliente ao site.

## 9. Uso no dia a dia (cliente e equipe)

- **Cliente no celular:** o fluxo está pensado para o celular (botões grandes, barra fixa do total,
  teclado numérico no telefone/CEP, "Copiar código Pix" grande, dados lembrados se a pessoa quiser).
- **Resolvido:** com o banco ligado, o site não abre mais o WhatsApp sozinho (vira botão opcional); o
  cliente fica na tela do Pix. Era assim: ao confirmar, o site abria o WhatsApp numa aba nova. No celular,
  quem paga com Pix sai da tela do Pix para o WhatsApp e pode não achar o caminho de volta. Com o banco
  ligado, o pedido já chega no painel, então dá para **não abrir o WhatsApp sozinho** e deixar só o botão
  "Enviar pelo WhatsApp" na tela de confirmação. Testar num celular real, inclusive abrindo pelo
  Instagram, antes de decidir.
- **Equipe:** deixar um tablet ou celular **na tomada**, com o painel aberto e o som ligado (o painel
  agora mantém a tela acesa e repete o som). Cada pessoa com o próprio login. Só o dono com papel `dono`.
- **Rotina:** a cada Pix, conferir o app do banco antes de "Confirmar pagamento" (o painel mostra o valor
  em destaque). No fim do dia, conferir o "Hoje" do painel com o caixa.

## 10. Para vender oficialmente

- Contrato simples com o restaurante: o que está incluso, mensalidade, quem paga Supabase e domínio,
  prazo de suporte e o que acontece com os dados se o contrato acabar.
- LGPD: o restaurante é o **controlador**; quem mantém o sistema é o **operador**. Isso vai no contrato.
  A política de privacidade deve ser revisada por alguém da área.
- Para emitir nota da sua parte, você precisa de MEI ou CNPJ.

## Checklist antes de entregar ao cliente

1. Dados reais no `js/config.js` **e** na tabela `loja` do banco; `node conferir-modelo.mjs` sem pendências.
2. Projeto Supabase do cliente em São Paulo; `instalar.sql`; equipe cadastrada; cadastro aberto desligado.
3. Hospedagem comercial (Cloudflare Pages) + domínio; `og:url`/`og:image` com o endereço novo.
4. Fotos e descrições reais do cardápio.
5. Pedido real num celular (também pelo Instagram); Pix de centavos caindo na conta certa; painel tocando
   num tablet com a tela travada há 10 minutos.
6. Apagar os pedidos de teste.
