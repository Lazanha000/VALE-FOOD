# Como configurar o site para um cliente

O site já funciona de ponta a ponta no modo **pedido pelo WhatsApp**: o cliente monta o
carrinho, preenche os dados, vê o QR do Pix com o valor certo e envia o pedido pronto
para o WhatsApp do restaurante. O que falta é só trocar os **dados da empresa**.

Depois de trocar tudo, rode no terminal, dentro da pasta do site:

```
node conferir-modelo.mjs
```

Ele lista o que ainda está provisório. Só publique quando aparecer
`tudo certo para publicar`.

## 1. `js/config.js` (quase tudo fica aqui)

| Campo | O que pôr |
|---|---|
| `marca.id` | id curto do cliente, sem acento nem espaço (ex.: `jeyjey`) |
| `marca.nome`, `nomeCurto`, `sufixo`, `slogan`, `descricao` | nome e frases da marca (cabeçalho e rodapé saem daqui) |
| `marca.local` | cidade do rodapé (ex.: `Teófilo Otoni, MG`) |
| `whatsapp.numero` | WhatsApp do restaurante com DDD. **Hoje está o número de teste 33999785853** |
| `pix.chave`, `tipo`, `nome`, `cidade` | chave Pix e nome/cidade do **titular**. **Hoje está a chave de teste 33999785853** |
| `entrega` / `retirada` | tempo, pedido mínimo, taxa (fixa ou por bairro), cidades atendidas e endereço de retirada |
| `horario.semana` | horário real de cada dia (`bloquearPedidoFechado` já está `true`) |
| `pagamentos` | tire as formas que o restaurante não aceita |
| `privacidade` | razão social, CNPJ, e-mail/telefone do responsável pelos dados, a data e `endereco` (vai no rodapé com o CNPJ, exigência do Decreto 7.962/2013; vazio = endereço de retirada) |

## 2. `js/products.js`: o cardápio

Nomes, descrições, preços (em **centavos**: 2890 = R$ 28,90) e opções.
As fotos ficam em `assets/produtos/` (formato `.webp`, quadradas).

## 3. Arquivos que o `config.js` não alcança

Quando trocar o `marca.id`, troque nos três lugares juntos:

- `index.html`: no script do tema, `"modelo:tema:v1"` vira `"<id>:tema:v1"`. Depois rode
  `node conferir-modelo.mjs`, que mostra o novo `sha256` para colar na linha da CSP.
- `sw.js`: `const PREFIXO = '<id>-'` e suba a `VERSAO`.
- `index.html`: `<title>`, `description`, `og:*` (nome e **endereço real** do site) e as cores do selo SVG.
- `manifest.webmanifest`: `name`, `short_name`, `description` e as cores.
- `assets/icons/`: ícones 192 e 512 px com a logo do cliente.

## 4. Antes de entregar

- Faça um pedido de verdade num celular, inclusive abrindo o link pelo Instagram, e confira se a mensagem chega no WhatsApp do restaurante.
- Pague o Pix de teste (centavos) e confira se cai na conta certa.
- Peça para alguém que entenda de LGPD revisar a política de privacidade.
- Combine com o restaurante: **conferir o total e o Pix no app do banco** antes de preparar.
  No modo WhatsApp o cliente pode editar a mensagem antes de enviar.

## Hospedagem

Para cliente real, publique no **Cloudflare Pages** (ou Netlify) com o domínio do cliente: as regras do
GitHub Pages não permitem site de vendas. Detalhes e custos em `AUDITORIA.md` (itens 6 e 7).

## Opcional: banco de pedidos (Supabase)

Pronto em `supabase/` (passo a passo em `supabase/LEIAME.md`): pedido registrado no banco com preço
recalculado lá, link de acompanhamento, cardápio/esgotado/horário mudados sem publicar o site.
Enquanto `CONFIG.api` estiver em `null`, o site segue 100% no modo WhatsApp.
Com o banco ligado, **mantenha o `config.js` igual ao banco** (WhatsApp, Pix, horário, taxa): se o banco não
responder, o site usa o `config.js` e oferece mandar o pedido só pelo WhatsApp.

Com o banco ligado, o restaurante usa o **painel** em `<endereço do site>/admin.html` (login por e-mail e
senha da equipe): pedidos chegando na hora com som, andamento e pagamento, itens esgotados, abrir e fechar
a loja. Quem tem papel `dono` também muda preços (e das opções), horários, entrega, retirada, taxa e
bairros. Como dar acesso e escolher o papel (`dono` ou `cozinha`): `supabase/LEIAME.md`, passo 5.
