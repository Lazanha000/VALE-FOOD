# Modelo Food: o que veio do site antigo

Base: repositório `Lazanha000/prototipo-hamburgueria` (site de uma lanchonete, HTML/JS puro + Supabase).
Esta versão é uma **versão de análise**: dados fictícios, sem banco, nada é enviado nem cobrado
(`CONFIG.modoDemonstracao = true`, `api` vazio). O banco do site antigo NÃO está ligado aqui.

## 1. Reaproveitado sem mudar

| Parte | Arquivos |
|---|---|
| Cardápio: busca, categorias, opções, adicionais, retirar ingrediente, esgotado | `js/pages/menu.js`, `js/pages/product.js` |
| Carrinho salvo no aparelho, editar, desfazer | `js/store.js`, `js/pages/cart.js` |
| Finalizar: entrega/retirada, bairro/taxa, mínimo, troco, antifraude | `js/pages/checkout.js`, `js/delivery.js`, `js/antifraude.js` |
| Pix com QR e copia e cola (formato do Banco Central) | `js/pix.js`, `js/vendor/qrcode.js` |
| Acompanhamento do pedido (etapas, atualização sozinha, link com token) | `js/pages/tracking.js`, `js/services/api.js` |
| Horário de funcionamento no fuso de Brasília, aberto/fechado | `js/horario.js` |
| Comanda, mensagem de WhatsApp, política de privacidade (modelo) | `js/comanda.js`, `js/mensagem.js`, `js/whatsapp.js`, `js/pages/privacy.js` |
| Visual: fontes, cores, tema claro/escuro, acessibilidade | `css/styles.css`, `assets/fonts` |
| Fotos reais dos lanches (usadas na Lanchonete do Zé e nas outras lanchonetes) | `assets/produtos`, `assets/cena` |
| Abertura animada do lanche | `js/scene.js`, `js/box.js`, `js/art.js` (só na Lanchonete do Zé) |
| Navegação por `#página` | `js/router.js` |

## 2. Reaproveitado com adaptação

| Parte | O que mudou |
|---|---|
| `js/main.js` | Cabeçalho e rodapé são da plataforma; abertura animada virou a página da loja do Zé; guarda que manda para o início se não há loja escolhida |
| `js/config.js` | `modoDemonstracao: true`, sem Supabase, sem WhatsApp e sem chave Pix reais (chave fictícia) |
| `js/pages/tracking.js` | Avisa a camada de avaliação quando o pedido é entregue; botões "Preciso de ajuda" e "Avaliar pedido" |
| `index.html` | Marca, menu, rodapé com as áreas; hash da CSP refeito |
| Troca de loja | `js/marketplace/loja.js` coloca a loja escolhida em `CONFIG` e `PRODUTOS` (mesmo jeito que `services/cardapio.js` faz com o banco) |

## 3. Novo (só nesta versão)

`js/marketplace/dados.js` (5 estabelecimentos de exemplo), `loja.js`, `paginas.js`, `css/marketplace.css`:
início com categorias, busca e cidade; ranking por nota (mínimo de 5 avaliações); cadastro do cliente
(e-mail opcional + consentimento de promoções); cadastro do estabelecimento em 5 etapas; suporte com
quatro opções; quadro de avaliação com 0 a 5 estrelas; termos e políticas; painel do estabelecimento
(pedidos, cardápio, configurações); administração (totais, por estabelecimento, por cidade, aprovação,
chamados, contato dos proprietários).

## 4. Fica para a próxima etapa (já existe no site antigo, falta adaptar)

| Parte do site antigo | O que falta para vários estabelecimentos |
|---|---|
| `supabase/schema.sql` (`criar_pedido` recalcula preço, taxa e total; RLS; limite por telefone e rede; `acompanhar_pedido`) | Trocar a tabela única `loja` por `estabelecimentos`; pôr `estabelecimento_id` em categorias, produtos, opções, bairros, horários, equipe e pedidos; `criar_pedido(estabelecimento_id, ...)`; regras de acesso por estabelecimento. Tabelas novas: clientes, avaliações, chamados, proprietários, documentos, aceites |
| `admin.html` + `painel/` (pedidos em tempo real, som que repete, tela acesa, resumo do dia, Pix a confirmar, produto com foto, horários, entrega) | Painel de cada estabelecimento: filtrar tudo por `estabelecimento_id`. A administração de vocês é nova |
| `supabase/testes/` (30 de banco, 10 de site, 29 de painel) | Reescrever os de banco para o modelo com vários estabelecimentos |
| Pix conferido à mão; cartão só na maquininha | Pagamento automático e comissão: gateway com split (decisão pendente) |
| Hospedagem | GitHub Pages proíbe uso comercial: usar Cloudflare Pages ou similar |

## 5. Não copiar do site antigo

- Projeto Supabase `znlwiybqeyysawcttxkk` (banco de teste do site antigo, região EUA): criar um projeto novo, em São Paulo.
- WhatsApp, chave Pix e e-mails de teste do `config.js` antigo.
- Textos de privacidade (modelo): precisam de advogado.

Documentos do site antigo: `docs-site-antigo/` (AUDITORIA, PENDENCIAS, COMO-CONFIGURAR).
