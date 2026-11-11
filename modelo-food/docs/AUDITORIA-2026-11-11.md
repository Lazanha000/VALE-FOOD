# Auditoria geral: 11/11/2026

Cobre o site (`index.html`), o painel (`admin.html`) e o banco (`supabase/plataforma.sql`).
Testes feitos num "Supabase local" (Postgres + PostgREST no Docker). O Supabase de verdade ainda não foi testado de ponta a ponta.

## 0. Segunda rodada (11/11/2026, noite): fluxo completo testado

Percorri no navegador, com o "Supabase local", o caminho inteiro: vitrine, loja, produto com opções, carrinho, pedido com entrega e Pix, tela de acompanhamento e painel do restaurante.

| Área | Problema | Correção |
|---|---|---|
| Pedido | CEP era obrigatório. Em cidade pequena quase ninguém sabe o CEP, e o restaurante não usa | CEP opcional no site e no banco. Sem CEP, a mensagem e o painel simplesmente não mostram |
| Painel | Não existia "Esqueci minha senha": dono ou funcionário que esquecesse a senha ficava trancado | Botão no login; o e-mail traz um link para criar senha nova e já entrar |
| Painel | Com o painel em segundo plano (atendente no WhatsApp), só o som avisava | Aviso do sistema ("Pedido novo") ao chegar pedido; tocar no aviso traz o painel de volta |
| App | O `sw.js` existia mas nunca era ligado: o site não abria sem internet nem podia ser instalado | Ligado no site e no painel (rede primeiro: edição aparece na hora) |
| App | Nome do app instalado era "Modelo Burguer" | Agora "Modelo Food", igual ao site |
| LGPD | A política promete apagar dados com 5 anos, mas isso era manual | Limpeza automática diária no banco (pg_cron); marca do aparelho sai em 30 dias |
| Textos | Exemplo de telefone com DDD 11 | DDD 33 |
| Ferramenta | `conferir-modelo.mjs` conferia regras do site de uma loja só | Reescrito: lista só o que falta para operar (CNPJ, razão social, e-mail, endereço, nome definitivo, lojas aprovadas) |

Testes: 34 testes do banco ok (1 novo, da limpeza automática). O service worker foi conferido num Chromium; o navegador embutido do app não aceita service worker.

## 1. O que foi corrigido na primeira rodada

| Área | Problema | Correção |
|---|---|---|
| LGPD | Política de privacidade era a do site antigo (uma loja só) | Reescrita para a plataforma: quem trata, quais dados, bases legais, compartilhamento, prazo e direitos |
| LGPD | Não havia termos de uso, política de reembolso nem termo de adesão | Criados em `js/marketplace/legal.js` (`#termos-uso`, `#reembolso`, `#adesao`, `#cookies`) |
| LGPD | Cliente não tinha como pedir exclusão dos dados | Opção "Meus dados" no Suporte; a administração apaga com um botão (função `anonimizar_cliente`) |
| LGPD | Nenhum aviso sobre o que fica guardado no aparelho | Aviso único na primeira visita, com link para a explicação |
| Segurança | Dono podia trocar nome, categoria e cidade da loja depois de aprovada | Só a administração muda esses campos |
| Segurança | Chave Pix do tipo CPF fica visível para o cliente | Aviso no painel recomendando chave aleatória |
| Operação | Pedido esquecido pela loja não avisava ninguém | Administração mostra "Pedidos sem resposta" (mais de 10 minutos como recebido) |
| Acessibilidade | Etiqueta "Aberto" com contraste 4,4 (claro) e 1,7 (escuro) | Agora 7,8 e 10,9 (mínimo 4,5) |
| Acessibilidade | Quadros (avaliação, avisos) não fechavam com Esc e deixavam o foco escapar | Esc fecha, Tab fica dentro e o foco volta para onde estava |
| Bug | `index.html` pré-carregava um arquivo que não existe mais (erro 404) | Removido |
| Bug | Pedido anonimizado aparecia no painel com link de WhatsApp vazio | Corrigido |
| Textos | "Fale com a gente pelo WhatsApp" aparecia mesmo se a loja não tem WhatsApp | Trocado por "Fale com o estabelecimento" |
| Textos | Lojas de exemplo com notas inventadas (4,8 com 42 avaliações) | Zeradas. Só apareciam no modo demonstração, que está desligado |
| Código | Animação de abertura sem uso (`scene.js`, `box.js`, 760 linhas) | Removida |

## 2. O que foi verificado e está em ordem

- **Rastreamento:** nenhum Google Analytics, pixel ou script de terceiros. O site só fala com o Supabase. WhatsApp e Google Maps são links que a pessoa abre.
- **Cookies:** o site não usa cookies. Usa o armazenamento do navegador só para itens essenciais, por isso não precisa de banner de consentimento.
- **Coleta mínima:** o pedido pede nome, telefone e endereço (só na entrega). E-mail é opcional. Não pede CPF, nascimento nem cartão.
- **Depoimentos e promessas:** não há depoimentos. As notas só vêm de clientes com pedido entregue, uma por pedido. As frases promocionais da animação antiga saíram junto com ela.
- **Botões falsos:** as categorias "Em breve" não são clicáveis. As telas de demonstração do painel foram trocadas pelas reais.
- **Imagens:** todas as fotos de produto têm texto alternativo (o nome do produto).
- **Teclado:** todos os controles são botões, links e campos nativos, com nome acessível. Há link "pular para o conteúdo" e foco visível.
- **Contraste:** medido por script em 7 telas do site e 5 do painel, nos temas claro e escuro. Sem falhas depois da correção acima.
- **Segurança do banco:** 33 testes automáticos. Cada loja só vê os próprios dados, visitante não lê pedidos, preço é recalculado no servidor, há limite contra pedidos e chamados em massa.
- **Segurança do site:** política de conteúdo (CSP) restrita, sem script externo; todo texto vindo do banco é escapado antes de ir para a tela.

## 3. Pendências que dependem de você

1. **Rodar o `plataforma.sql` de novo no Supabase** (SQL Editor). Sem isso, pedido sem CEP dá erro e a limpeza automática não é agendada.
2. **Configurar a Site URL** no Supabase (Authentication > URL Configuration). Sem isso, o e-mail de confirmação da conta do dono leva a um endereço errado.
3. **Senha mínima:** em Authentication > Sign In / Providers > Email, pôr mínimo de 8 caracteres. O site já exige, mas o servidor aceita 6.
4. **Dados da empresa:** preencher `privacidade` em `js/config.js` (razão social, CNPJ, e-mail de contato, endereço). Enquanto estiver vazio, as páginas legais mostram "Plataforma em fase de testes". O Decreto 7.962/2013 exige esses dados no site.
5. **Prazos prometidos nos textos:** confira se você consegue cumprir: resposta a chamados em 2 dias úteis, resposta a pedidos de dados em 15 dias, devolução pelo estabelecimento em até 7 dias.
6. **Revisão por advogado** dos cinco documentos antes de cobrar mensalidade.
7. **Backup:** o arquivo `backup/backup-diario.yml` já faz cópia diária criptografada. Precisa de um repositório privado no GitHub e de dois segredos (instruções no próprio arquivo).
8. **Nome definitivo:** "Modelo Food" aparece em `js/marketplace/dados.js` (`PLATAFORMA`) e no `index.html`.

## 4. Pendências técnicas (não feitas)

| Item | Por que importa | Tamanho |
|---|---|---|
| Teste de ponta a ponta no Supabase real | Tempo real, envio de fotos e e-mail só existem lá | Pequeno, depois dos itens 1 e 2 acima |
| Verificação em duas etapas para a conta de administração | Essa conta vê CPF, CNPJ e telefones de todos | Médio. Não fiz porque não dá para testar sem a sua conta e um erro trancaria você para fora |
| Hospedagem fora do GitHub Pages | O GitHub Pages não permite uso comercial | Pequeno (Cloudflare Pages), precisa de conta sua |
| Supabase grátis pausa sem uso | Projeto parado cerca de 7 dias é pausado e o site para. Confirme a regra atual no site do Supabase | Plano pago ou acesso automático |
| Aviso de pedido novo com o navegador fechado | Com o navegador aberto já há som e aviso do sistema; fechado, nada chega | Grande (notificação push, precisa de servidor) |
| Logo da loja na vitrine | Visual | Pequeno |
| Conta de cliente | Histórico de pedidos em vários aparelhos | Grande e custa por SMS |
| Testes antigos (`testar-banco`, `testar-painel`, `testar-site`) | São do site de uma loja só e não rodam mais | Apagar ou reescrever |

## 5. Leis consideradas

- **LGPD (Lei 13.709/2018):** bases legais, direitos do titular, compartilhamento, transferência internacional, incidente.
- **Código de Defesa do Consumidor (Lei 8.078/1990):** informação clara, vício do produto e do serviço, arrependimento (art. 49), prazo de 5 anos (art. 27).
- **Decreto 7.962/2013:** identificação do fornecedor, atendimento e informações no comércio eletrônico.
- **Marco Civil da Internet (Lei 12.965/2014):** guarda de registros e privacidade.
- **Vigilância sanitária:** o termo de adesão exige que a loja tenha as licenças; a conferência do alvará ainda é manual.

Não sou advogado: os textos seguem essas leis no que consegui aplicar, mas a revisão jurídica continua necessária.
