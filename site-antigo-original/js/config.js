// ============================================================
// CONFIGURAÇÃO DO SITE — dados do restaurante (nome, WhatsApp,
// taxa, horário, Pix, textos). O nome no cabeçalho e no rodapé sai daqui;
// título da aba, prévia do link, cores e ícones ficam no index.html e no
// manifest: veja a lista completa em COMO-CONFIGURAR.md.
// Depois de configurar, rode: node conferir-modelo.mjs
// ============================================================
// Ajustes pontuais em js/ajustes.js valem por cima dos valores abaixo (ver aplicarConfig no fim).
// Com o banco ligado (api, abaixo), loja, horário e cardápio vêm do banco e o restaurante
// muda pelo painel (admin.html): pedidos, esgotados, abrir/fechar a loja.

import { AJUSTES } from './ajustes.js';
import { aplicarConfig } from './ajustar.js';

export const CONFIG = {
  marca: {
    // Identificador único do cliente: minúsculas, sem espaço nem acento (ex.: 'jeyjey').
    // Separa os dados guardados no navegador e o cache entre sites publicados no mesmo
    // endereço (ex.: dois clientes em lazanha000.github.io). Ao trocar, troque também
    // a chave do tema no script do index.html e o PREFIXO do sw.js.
    id: 'modelo',
    // Letras do código do pedido (ex.: 'JJ' -> JJ-7K2QX). Vazio = 2 primeiras letras do id.
    prefixoPedido: '',
    nome: 'Modelo Burguer',
    nomeCurto: 'MODELO',
    sufixo: 'BURGUER',
    slogan: 'Feito na hora, do seu jeito.',
    // frase curta do rodapé, abaixo do nome
    descricao: 'Hambúrguer feito na hora, entregue na caixa da casa.',
    // cidade do rodapé (ex.: 'Teófilo Otoni, MG')
    local: 'Sua Cidade, UF',
  },

  // WhatsApp do restaurante: só números, com DDD (ex.: '33999999999').
  // O DDI 55 é acrescentado sozinho se faltar. null = botão mostra aviso de demonstração
  // (e, fora do modo demonstração, o site não deixa finalizar: o pedido não teria para onde ir).
  whatsapp: {
    numero: '33999785853',   // NÚMERO DE TESTE: troque pelo WhatsApp do restaurante
    mensagemPadrao: 'Olá! Vim pelo site e quero fazer um pedido.',
    // Com o banco ligado o pedido já chega no painel: false = ao confirmar, o cliente fica na tela do
    // pedido (com o Pix) e o WhatsApp vira um botão opcional. true = abre o WhatsApp sozinho, como sem banco.
    // (Sem banco o WhatsApp sempre abre sozinho: é o único caminho do pedido até a loja.)
    abrirSozinhoComBanco: false,
    // mensagem do botão do WhatsApp em cada página
    mensagens: {
      carrinho: 'Olá! Estou montando um pedido pelo site e tenho uma dúvida.',
      finalizar: 'Olá! Estou finalizando um pedido pelo site e tenho uma dúvida.',
      pedido: 'Olá! Quero saber sobre o meu pedido.',
    },
    // textos da mensagem do pedido: título (em negrito), frase antes dos itens e frase final.
    // Itens, valores, cliente e endereço são montados pelo site e não mudam.
    pedido: {
      titulo: 'NOVO PEDIDO',
      abertura: '',
      fechamento: '',
    },
  },

  // ----------------------------------------------------------
  // DELIVERY — configure por empresa contratante.
  // Valores em centavos (ex.: 790 = R$ 7,90).
  // ativo: false desliga o modo (o cliente não vê a opção).
  // Se os dois estiverem ativos, o cliente escolhe ao finalizar.
  // ----------------------------------------------------------
  entrega: {
    ativo: true,
    tempo: '45 min',
    pedidoMinimo: 2000,
    // Taxa fixa:   { tipo: 'fixa', valor: 790 }
    // Por bairro:  { tipo: 'bairro', bairros: [{ nome: 'Centro', valor: 500 }, ...] }
    // (com taxa por bairro o cliente escolhe o bairro numa lista; bairro fora
    //  da lista não recebe entrega pelo site e é orientado a falar no WhatsApp)
    taxa: { tipo: 'fixa', valor: 500 },
    // Bairros onde NÃO entregamos (taxa fixa/grátis não distingue bairro). Basta o trecho do nome,
    // sem acento/maiúscula: 'centro' pega 'Centro Histórico'. Vale só para o bairro digitado.
    bairrosSemEntrega: [],
    // Cidades atendidas na entrega (sem acento/maiúscula conta igual: 'sao paulo' = 'São Paulo').
    // Vazia = qualquer cidade. Cidade fora da lista é orientada a falar no WhatsApp.
    cidadesAtendidas: [],
  },
  retirada: {
    ativo: true,
    tempo: '30 min',
    pedidoMinimo: 0,
    local: 'Rua Exemplo, 100, Centro, Sua Cidade',   // troque pelo endereço real
  },

  // ----------------------------------------------------------
  // HORÁRIO DE FUNCIONAMENTO — vale o horário de Brasília,
  // não o do celular do cliente. Cada dia: lista de faixas
  // ['abre', 'fecha'] ou null (fechado). Faixa que passa da meia-noite
  // é aceita (ex.: ['18:00', '02:00']). Dias: seg ter qua qui sex sab dom.
  // O rodapé e o aviso "aberto/fechado" saem daqui.
  // ----------------------------------------------------------
  horario: {
    fuso: 'America/Sao_Paulo',
    semana: {
      seg: [['11:00', '23:00']],
      ter: [['11:00', '23:00']],
      qua: [['11:00', '23:00']],
      qui: [['11:00', '23:00']],
      sex: [['11:00', '23:00']],
      sab: [['11:00', '23:00']],
      dom: [['11:00', '23:00']],
    },
    // true = com a loja fechada o cliente monta o carrinho, mas não finaliza.
    // false = só mostra o aviso "fechado". Use false SÓ na demonstração: cliente real = true
    // (o conferir-modelo.mjs reprova false).
    bloquearPedidoFechado: true,
  },

  // Pix estático: QR e "copia e cola" gerados no site com o valor do pedido.
  // Nome (até 25 letras) e cidade (até 15) são obrigatórios no BR Code e devem
  // ser os do titular da chave. Os abaixo são de TESTE: troque antes de vender.
  // tipo: telefone | cpf | cnpj | email | aleatoria. Chave vazia = sem QR: o pedido
  // segue só pelo WhatsApp. Chave, nome ou cidade inválidos também desligam o QR e
  // aparecem no console do navegador como [config] (ver validarPix em js/pix.js).
  pix: {
    chave: '33999785853',   // CHAVE DE TESTE (telefone): troque pela chave do restaurante
    tipo: 'telefone',
    nome: 'MODELO BURGUER',   // troque: tem de ser o nome do titular da chave
    cidade: 'TEOFILO OTONI',   // troque: cidade do titular
  },

  // Formas de pagamento oferecidas. Todas são pagas NA ENTREGA nesta versão
  // (nenhum dado de cartão é pedido no site). Para pagar online, conecte
  // um provedor de pagamento em js/services/api.js.
  pagamentos: [
    { id: 'pix', nome: 'Pix', detalhe: 'QR Code e copia e cola após o pedido' },
    { id: 'credito', nome: 'Cartão de crédito', detalhe: 'Na maquininha, na entrega' },
    { id: 'debito', nome: 'Cartão de débito', detalhe: 'Na maquininha, na entrega' },
    { id: 'dinheiro', nome: 'Dinheiro', detalhe: 'Informe se precisa de troco' },
  ],

  // Fotos da cena de abertura. As camadas do lanche já vêm recortadas da foto real
  // (assets/cena/camadas/*.webp, lista em js/art.js > CINE_LAYERS).
  // Para trocar uma camada sem mexer no código, ponha o caminho aqui.
  // Ex.: carne: 'assets/cena/carne-nova.webp'
  // batatas e pote: fotos reais (se faltar o arquivo, volta para a ilustração).
  fotosCena: {
    paoTopo: null,
    picles: null,
    cebola: null,
    bacon: null,
    queijo: null,
    carne: null,
    salada: null,
    paoBase: null,
    batatas: 'assets/cena/batatas.webp',
    lata: 'assets/cena/lata.webp',   // bebida na caixa (null = milkshake desenhado)
    pote: 'assets/cena/pote.webp',
  },

  // Arte da embalagem (fotos fornecidas pela marca). null = arte desenhada.
  // frente: foto da frente da caixa, já sem perspectiva; proporcaoFrente = largura / altura.
  // selo: selo redondo com fundo transparente, usado na tampa.
  embalagem: {
    frente: null,   // era a arte da marca-modelo; ponha a arte da marca aqui
    proporcaoFrente: 1200 / 336,
    selo: null,
  },

  // Política de privacidade (LGPD): quem responde pelos dados e como falar com essa pessoa.
  // Valores abaixo são PROVISÓRIOS (marca fictícia): troque pelos do comércio e peça
  // revisão de quem entende de LGPD antes de publicar para clientes reais.
  privacidade: {
    controlador: 'Modelo Burguer',
    cnpj: 'xx.xxx.xxx/0001-xx',   // trocar pelo CNPJ real antes de publicar
    // contato do titular dos dados: troque pelos reais (vazio = não aparece)
    email: 'contato@suamarca.com.br',
    telefone: '',   // ex.: '(11) 98765-4321'
    // endereço físico da empresa, mostrado no rodapé com a razão social e o CNPJ (exigido pelo
    // Decreto 7.962/2013 para quem vende pela internet). Vazio = usa o endereço de retirada.
    endereco: '',
    atualizadoEm: '2026-10-26',
  },

  // Sistema de pedidos (Supabase) e painel do restaurante (admin.html). Os dois ficam em
  // Supabase > Project Settings > API.
  // supabaseUrl: ex.: 'https://abcdefgh.supabase.co'
  // chavePublica: a chave "publishable" (sb_publishable_...). Pode ficar no site.
  // NUNCA ponha aqui a chave "secret"/"service_role". Crie o banco antes (supabase/LEIAME.md);
  // enquanto estiver null, o cardápio sai de products.js e o pedido segue só pelo WhatsApp.
  api: { supabaseUrl: 'https://znlwiybqeyysawcttxkk.supabase.co', chavePublica: 'sb_publishable_UUK-N6cpKeaamQwJufgJjA_EWvgUCxX' },

  // Modo demonstração: pedidos não são enviados a nenhum restaurante.
  // true ignora o Supabase acima. Cliente real = false.
  modoDemonstracao: false,

  textos: {
    cena1Titulo: 'FEITO PARA SER LENDÁRIO.',
    cena1Sub: 'Ingredientes de verdade. Sabor sem limites.',
    cena2Olho: 'Hambúrguer',
    cena2Titulo: 'Camada por camada.',
    cena3Titulo: 'Montado na hora. Embalado com cuidado.',
    cena4Titulo: 'SEU PRÓXIMO FAVORITO ESTÁ AQUI.',
    ctaCardapio: 'EXPLORAR CARDÁPIO',
    avisoDemo: '',
  },
};

aplicarConfig(CONFIG, AJUSTES);
