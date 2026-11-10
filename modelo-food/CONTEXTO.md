# Modelo Food: contexto do projeto

Documento de apoio gerado em 10/11/2026. Resume as decisões, o estado do protótipo e as pendências
levantadas na conversa. É uma versão de análise: nada aqui está ligado a banco, pagamento ou WhatsApp reais.

## 1. O que é

Plataforma regional de pedidos (estilo iFood/Vale Food) para lanchonetes e restaurantes do Vale do
Jequitinhonha e do Vale do Mucuri. Nome provisório: **Modelo Food**.

- Lançamento: Araçuaí, Coronel Murta, Virgem da Lapa e Itaobim. Depois, o restante do Vale.
- Primeiro site, depois empacotado como aplicativo.
- Entrega feita pelos entregadores do próprio estabelecimento (informada na proposta comercial).

## 2. Decisões tomadas

**Cadastro do estabelecimento**
- Cinco etapas: dados, funcionamento, proprietário, cardápio e revisão.
- Telefone público do estabelecimento (usado no suporte) separado do contato do proprietário.
- Contato do proprietário fica só com a equipe, com aviso fixo na tela.
- Aprovação pela equipe antes de publicar. Documentos e aceites obrigatórios.

**Cadastro do cliente**
- Entrada por telefone com código de verificação; nome; senha (8+ caracteres, letras e números).
- E-mail opcional. Consentimento para promoções desmarcado por padrão.
- Endereço só no primeiro pedido.
- Aceites obrigatórios: termos de uso, privacidade, cookies e cancelamento.

**Pedido e avaliação**
- Quadro de avaliação aparece após a entrega: 0 a 5 estrelas e comentário opcional, uma vez por pedido.
- Ranking por nota média dentro de cada categoria, só com no mínimo 5 avaliações. Abaixo disso, ordem alfabética.
- Preço e total são sempre calculados no servidor, nunca no navegador.

**Suporte**
- Quatro opções prontas: pedido não entregue, pedido errado, pedido demorando e outro problema.
- A equipe (dono do projeto) recebe notificação e atende os casos específicos. Respostas automáticas para os comuns.
- Contato com o estabelecimento sempre pelo telefone público dele.

**Painéis**
- Estabelecimento: pedidos do dia, semana e mês, e valor líquido recebido (já descontada a taxa da plataforma).
- Administração (sócios): total vendido, pedidos e taxa da plataforma, somando todos os estabelecimentos.
- Aviso sonoro de pedido novo no celular ou tablet do estabelecimento.

**Mensalidade**
- Proposta inicial de R$ 50/mês por estabelecimento. Valor a confirmar com o cálculo de custos.

**Sociedade**
- Tratada como uma pessoa só, a pedido do usuário.

## 3. Estado do protótipo (pasta `modelo-food/`)

- Reaproveita o site antigo (`Lazanha000/prototipo-hamburgueria`): cardápio, carrinho, finalização,
  Pix (QR Code e copia e cola), acompanhamento, horário, visual e fotos.
- Acrescenta a camada de vários estabelecimentos (`js/marketplace/`) com 5 estabelecimentos de exemplo.
- Modo demonstração ligado (`CONFIG.modoDemonstracao = true`). Sem banco, sem WhatsApp real, chave Pix fictícia.
- Testado no navegador em tela de celular: pedido completo, avaliação, suporte, cadastros e painéis, sem erros no console.
- Não testado em aparelho físico.
- Mapa completo do que veio, do que mudou e do que falta: `docs/REAPROVEITAMENTO.md`.

## 4. Pendências para o lançamento

**Decisões de negócio (dependem dos sócios)**
- Nome definitivo da marca (checagem no INPI e domínio).
- Valor da mensalidade e da comissão por pedido.
- Quem paga a taxa do gateway.
- Plano de visitas e cadastro dos primeiros estabelecimentos (cerca de 10 antes da divulgação).
- Estratégia de divulgação e canal de atendimento (horário e tempo de resposta).
- Motivo real do encerramento do Vale Food. Não foi encontrada fonte pública; o relato ouvido não foi confirmado.

**Arquitetura e tecnologia**
- Backend: Supabase recomendado. Criar projeto novo em São Paulo (não usar o do site antigo).
- Adaptar `supabase/schema.sql` do site antigo para vários estabelecimentos (tabela `estabelecimentos` e `estabelecimento_id` nas demais).
- Novas tabelas: clientes, avaliações, chamados, proprietários, documentos e aceites.
- Login por telefone (código por SMS ou WhatsApp) e login com verificação em duas etapas para a administração.
- Painel real do site antigo (pedidos em tempo real, som, resumo do dia) a trazer para o painel do estabelecimento.
- Hospedagem: GitHub Pages não pode ser usado comercialmente. Opções: Cloudflare Pages ou similar.
- Empacotar como aplicativo (Android e iPhone) depois que o site funcionar.

**Pagamentos**
- Gateway com split automático: Asaas (recomendado) ou Pagar.me.
- Subconta por estabelecimento, comissão por pedido e mensalidade recorrente.
- Dinheiro nunca passa pela conta de vocês.
- Estorno com devolução da comissão.
- Confirmar a taxa de Pix, de split e de subconta no site de cada gateway antes de decidir.

**Jurídico e fiscal**
- CNPJ da empresa de vocês (MEI ou outro, conforme o contador).
- Contador: nota fiscal dos pedidos e da comissão.
- Termos de uso, privacidade (LGPD), cookies e cancelamento: textos finais revisados por advogado.
- Encarregado pelos dados, prazo de guarda e processo de exclusão.
- Documentos exigidos no cadastro (alvará sanitário, por exemplo).
- Contrato ou termo de adesão do estabelecimento.

**Operação**
- Regras de área de entrega por bairro, em cada cidade.
- Tempo para alerta de pedido sem aceite.
- Regra para pedido recusado e para fechamento inesperado.
- Pedido mínimo (já previsto no protótipo, a confirmar).

**Conteúdo e testes**
- Textos finais de todas as telas e mensagens.
- Logo, paleta, tipografia e fotos reais dos produtos (o protótipo usa fotos de exemplo).
- Testes em celulares comuns com internet lenta.
- Teste de segurança: tentativa de alterar preço pelo navegador.
- Piloto com 2 ou 3 estabelecimentos antes do lançamento geral.

**Marketing**
- Perfis em Instagram e TikTok.
- Página de apresentação e vídeo para estabelecimentos.
- Material para clientes (cartaz e divulgação local).

## 5. Próximos passos sugeridos

1. Escolher o nome (dois ou três finalistas para checar no INPI e no registro.br).
2. Confirmar o Supabase.
3. Adaptar o banco para vários estabelecimentos.
4. Ligar o protótipo ao banco, tela por tela.
5. Revisão jurídica e fiscal em paralelo.

## 6. Alertas importantes

- O projeto ainda não tem valor de comissão, gateway escolhido nem revisão jurídica. Não lançar com dinheiro real antes disso.
- Não copiar do site antigo: chaves do Supabase de teste, WhatsApp e chaves Pix de teste.
- Os números dos painéis do protótipo são fictícios.
