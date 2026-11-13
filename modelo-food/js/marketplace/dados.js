// ============================================================
// DADOS FICTÍCIOS DO PROTÓTIPO (Modelo Food)
// Estabelecimentos de exemplo. Tudo aqui sai do banco quando o Supabase for ligado
// (tabela `estabelecimentos`, ver docs/REAPROVEITAMENTO.md). Valores em centavos.
// ============================================================

import { PRODUTOS_BASE, CATEGORIAS } from '../products.js';

export const PLATAFORMA = { nome: 'Modelo Food', nomeCurto: 'MODELO', sufixo: 'FOOD', provisorio: true };
export const MIN_AVALIACOES = 5; // abaixo disso o estabelecimento não entra no ranking por nota

export const CIDADES = ['Araçuaí', 'Coronel Murta', 'Virgem da Lapa', 'Itaobim'];

export const CATEGORIAS_MKT = [
  { id: 'lanchonetes', nome: 'Lanchonetes e hamburguerias', icone: '🍔' },
  { id: 'restaurantes', nome: 'Restaurantes e pizzarias', icone: '🍝' },
  { id: 'farmacias', nome: 'Farmácias', icone: '💊', embreve: true },
  { id: 'mercados', nome: 'Supermercados e mercearias', icone: '🛒', embreve: true },
  { id: 'padarias', nome: 'Padarias e açougues', icone: '🥖', embreve: true },
  { id: 'outros', nome: 'Outros', icone: '📦', embreve: true },
];

const SEMANA = (faixa) => Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((d) => [d, faixa]));

// cardápio da lanchonete = produtos do site antigo (com as fotos reais), com preço ajustado
const dosBase = (ids, fator = 1) => ids
  .map((id) => PRODUTOS_BASE.find((p) => p.id === id))
  .filter(Boolean)
  .map((p) => ({ ...structuredClone(p), preco: Math.round((p.preco * fator) / 10) * 10 }));
const catsDe = (lista, extras = []) => {
  const usadas = new Set(lista.map((p) => p.categoria));
  return [...CATEGORIAS.filter((c) => usadas.has(c.id)), ...extras.filter((c) => usadas.has(c.id))];
};
const prato = (id, categoria, nome, descricao, preco, arte, extra = {}) => ({
  id, categoria, nome, descricao, preco, arte, imagem: null, opcoes: [], removiveis: [], ...extra,
});
const TODOS = PRODUTOS_BASE.map((p) => p.id);

const LANCH_ZE = dosBase(TODOS);
const LANCH_PRACA = dosBase(['x-burger', 'x-salada', 'x-bacon', 'x-duplo', 'fritas', 'coca-350', 'guarana-350', 'coca-2l', 'molho-maionese'], 0.95);
const LANCH_ESQ = dosBase(['x-salada', 'x-tudo', 'fritas', 'combo-x-salada', 'combo-x-tudo', 'coca-350', 'guarana-2l'], 1.05);

const TAMANHO_PIZZA = { id: 'tamanho', nome: 'Tamanho', tipo: 'unica', obrigatorio: true, escolhas: [
  { id: 'm', nome: 'Média · 6 fatias', preco: 0 },
  { id: 'g', nome: 'Grande · 8 fatias', preco: 1200 },
] };
const PIZZAS = [
  prato('pz-mussarela', 'pizzas', 'Pizza de mussarela', 'Molho de tomate, mussarela e orégano.', 3800, 'combo', { opcoes: [TAMANHO_PIZZA], imagem: 'assets/produtos/pizza-mussarela.webp' }),
  prato('pz-calabresa', 'pizzas', 'Pizza de calabresa', 'Calabresa fatiada, cebola e mussarela.', 4200, 'combo', { opcoes: [TAMANHO_PIZZA], removiveis: ['Cebola'], destaque: true, imagem: 'assets/produtos/pizza-calabresa.webp' }),
  prato('pz-frango', 'pizzas', 'Pizza de frango com catupiry', 'Frango desfiado e catupiry.', 4600, 'combo', { opcoes: [TAMANHO_PIZZA], imagem: 'assets/produtos/pizza-frango.webp' }),
  ...dosBase(['coca-2l', 'guarana-2l']),
  prato('pz-brownie', 'sobremesas', 'Brownie com sorvete', 'Brownie quente com uma bola de sorvete.', 1800, 'brownie', { imagem: 'assets/produtos/brownie.webp' }),
];
const PRATOS = [
  prato('pr-frango', 'pratos', 'Prato executivo de frango', 'Arroz, feijão, frango grelhado, salada e farofa.', 2400, 'combo', { destaque: true }),
  prato('pr-carne', 'pratos', 'Prato executivo de carne', 'Arroz, feijão, bife acebolado, salada e farofa.', 2700, 'combo'),
  prato('pr-tropeiro', 'pratos', 'Feijão tropeiro', 'Feijão tropeiro com linguiça, couve e ovo.', 2200, 'combo'),
  prato('pr-suco', 'bebidas', 'Suco natural', 'Laranja ou maracujá, 400 ml.', 700, 'copo', { imagem: 'assets/produtos/suco.webp' }),
  ...dosBase(['coca-350']),
  prato('pr-cookie', 'sobremesas', 'Cookie', 'Cookie com gotas de chocolate.', 600, 'cookie', { imagem: 'assets/produtos/cookie.webp' }),
];

const CATS_PIZZA = [{ id: 'pizzas', nome: 'Pizzas' }, { id: 'bebidas', nome: 'Bebidas' }, { id: 'sobremesas', nome: 'Sobremesas' }];
const CATS_PRATO = [{ id: 'pratos', nome: 'Pratos' }, { id: 'bebidas', nome: 'Bebidas' }, { id: 'sobremesas', nome: 'Sobremesas' }];

const base = (o) => ({
  retirada: { ativo: true, tempo: '25 min', pedidoMinimo: 0 },
  ...o,
});

export const ESTABS = [
  base({
    id: 'ze', nome: 'Lanchonete do Zé', nomeCurto: 'LANCHONETE', sufixo: 'DO ZÉ', cat: 'lanchonetes', cidade: 'Araçuaí',
    nota: 0, avaliacoes: 0, descricao: 'Hambúrguer feito na hora, entregue na caixa da casa.',
    entrega: { ativo: true, tempo: '30 min', pedidoMinimo: 1500, taxa: { tipo: 'fixa', valor: 500 } },
    retirada: { ativo: true, tempo: '20 min', pedidoMinimo: 0, local: 'Rua das Flores, 120, Centro, Araçuaí' },
    horario: SEMANA([['07:00', '23:59']]), whatsapp: null,
    pix: { chave: '00000000-0000-4000-8000-000000000001', tipo: 'aleatoria', nome: 'LANCHONETE DO ZE', cidade: 'ARACUAI' },
    produtos: LANCH_ZE, categorias: catsDe(LANCH_ZE),
  }),
  base({
    id: 'vale-bom', nome: 'Pizzaria Vale Bom', nomeCurto: 'PIZZARIA', sufixo: 'VALE BOM', cat: 'restaurantes', cidade: 'Araçuaí',
    nota: 0, avaliacoes: 0, descricao: 'Pizzas no forno a lenha, todas as noites.',
    entrega: { ativo: true, tempo: '45 min', pedidoMinimo: 3000, taxa: { tipo: 'fixa', valor: 600 } },
    retirada: { ativo: true, tempo: '30 min', pedidoMinimo: 0, local: 'Av. Principal, 45, Rio Branco, Araçuaí' },
    horario: SEMANA([['07:00', '23:59']]), whatsapp: null,
    pix: { chave: '00000000-0000-4000-8000-000000000002', tipo: 'aleatoria', nome: 'PIZZARIA VALE BOM', cidade: 'ARACUAI' },
    produtos: PIZZAS, categorias: CATS_PIZZA, fotosDeExemplo: true,
  }),
  base({
    id: 'praca', nome: 'Burguer da Praça', nomeCurto: 'BURGUER', sufixo: 'DA PRAÇA', cat: 'lanchonetes', cidade: 'Coronel Murta',
    nota: 0, avaliacoes: 0, descricao: 'Lanches artesanais na praça central.',
    entrega: { ativo: true, tempo: '25 min', pedidoMinimo: 1200, taxa: { tipo: 'fixa', valor: 400 } },
    retirada: { ativo: true, tempo: '15 min', pedidoMinimo: 0, local: 'Praça Central, 10, Coronel Murta' },
    horario: SEMANA([['07:00', '23:59']]), whatsapp: null,
    pix: { chave: '00000000-0000-4000-8000-000000000003', tipo: 'aleatoria', nome: 'BURGUER DA PRACA', cidade: 'CORONEL MURTA' },
    produtos: LANCH_PRACA, categorias: catsDe(LANCH_PRACA),
  }),
  base({
    id: 'sabor-rio', nome: 'Sabor do Rio', nomeCurto: 'SABOR', sufixo: 'DO RIO', cat: 'restaurantes', cidade: 'Itaobim',
    nota: 0, avaliacoes: 0, descricao: 'Comida caseira, prato feito todo dia.',
    entrega: { ativo: true, tempo: '50 min', pedidoMinimo: 2000, taxa: { tipo: 'fixa', valor: 700 } },
    retirada: { ativo: true, tempo: '30 min', pedidoMinimo: 0, local: 'Rua do Comércio, 8, Centro, Itaobim' },
    horario: SEMANA([['10:30', '14:30']]), whatsapp: null, // aberto só no almoço
    pix: { chave: '00000000-0000-4000-8000-000000000004', tipo: 'aleatoria', nome: 'SABOR DO RIO', cidade: 'ITAOBIM' },
    produtos: PRATOS, categorias: CATS_PRATO, fotosDeExemplo: true,
  }),
  base({
    id: 'esquina', nome: 'Espetinho da Esquina', nomeCurto: 'ESPETINHO', sufixo: 'DA ESQUINA', cat: 'lanchonetes', cidade: 'Virgem da Lapa',
    nota: 0, avaliacoes: 0, descricao: 'Lanches e porções para a noite.',
    entrega: { ativo: true, tempo: '35 min', pedidoMinimo: 1500, taxa: { tipo: 'fixa', valor: 500 } },
    retirada: { ativo: true, tempo: '20 min', pedidoMinimo: 0, local: 'Rua Nova, 77, Bairro Alto, Virgem da Lapa' },
    horario: SEMANA([['17:00', '23:59']]), whatsapp: null,
    pix: { chave: '00000000-0000-4000-8000-000000000005', tipo: 'aleatoria', nome: 'ESPETINHO DA ESQUINA', cidade: 'VIRGEM DA LAPA' },
    produtos: LANCH_ESQ, categorias: catsDe(LANCH_ESQ),
  }),
];

export const estabPorId = (id) => ESTABS.find((e) => e.id === id);
