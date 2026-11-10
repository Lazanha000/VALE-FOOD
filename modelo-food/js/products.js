// ============================================================
// CARDÁPIO DE RESERVA — vale quando o site não tem Supabase ou o banco não responde.
// Com Supabase, o cardápio vem do banco (js/services/cardapio.js) e substitui este.
// Preços em CENTAVOS (3290 = R$ 32,90). Cardápio-modelo genérico:
// troque nomes, descrições, fotos e preços pelos do cliente.
//
// Cada produto:
//   id, categoria, nome, descricao, preco (preço base)
//   imagem: caminho da foto real, ex.: 'assets/produtos/x-tudo.webp'.
//           Enquanto for null (ou se o arquivo faltar), aparece a
//           ilustração indicada em "arte".
//   opcoes: grupos de escolha
//     tipo 'unica'  -> escolhe 1 (ex.: tamanho); obrigatorio: true/false
//     tipo 'multipla' -> escolhe várias, até "max"
//     cada escolha tem "preco" a somar (0 se não muda)
//   removiveis: ingredientes que o cliente pode tirar
//   esgotado: true -> aparece no cardápio com o selo "Esgotado" e não pode ser pedido.
// ============================================================

import { AJUSTES } from './ajustes.js';
import { aplicarProdutos } from './ajustar.js';

export const CATEGORIAS = [
  { id: 'hamburgueres', nome: 'Burguer' },
  { id: 'bebidas', nome: 'Bebidas' },
  { id: 'porcoes', nome: 'Porções' },
  { id: 'combos', nome: 'Combos' },
  { id: 'molhos', nome: 'Molhos' },
];

const PAO = 'Pão tostado na chapa';
const REFRI_LATA = {
  id: 'refri', nome: 'Refrigerante lata', tipo: 'unica', obrigatorio: true,
  escolhas: [
    { id: 'coca', nome: 'Coca-Cola', preco: 0 },
    { id: 'zero', nome: 'Coca-Cola Zero', preco: 0 },
    { id: 'guarana', nome: 'Guaraná', preco: 0 },
  ],
};

const burger = (id, nome, arte, preco, descricao, extra = {}) => ({
  id, categoria: 'hamburgueres', nome, descricao, preco, arte, imagem: null, opcoes: [], removiveis: [], ...extra,
});
const simples = (id, categoria, nome, arte, preco, descricao = '') => ({
  id, categoria, nome, descricao, preco, arte, imagem: null, opcoes: [], removiveis: [],
});

const X_SALADA = `${PAO}, hambúrguer 150 g, queijo, alface, tomate e maionese.`;
const X_BACON = `${PAO}, hambúrguer 150 g, queijo, bacon crocante e maionese.`;
const X_TUDO = `${PAO}, hambúrguer 150 g, queijo, bacon, ovo, presunto, alface, tomate, cebola roxa e maionese.`;
const REM_TUDO = ['Bacon', 'Ovo', 'Presunto', 'Alface', 'Tomate', 'Cebola', 'Maionese'];

export const PRODUTOS = [
  // ---------- Burguer ----------
  burger('x-burger', 'X-Burger', 'burger-classic', 1800, `${PAO}, hambúrguer 150 g, queijo e maionese.`, { removiveis: ['Maionese'] }),
  burger('x-salada', 'X-Salada', 'burger-classic', 2200, X_SALADA, { removiveis: ['Alface', 'Tomate', 'Maionese'] }),
  burger('x-bacon', 'X-Bacon', 'burger-bacon', 2600, X_BACON, { removiveis: ['Bacon', 'Maionese'] }),
  burger('x-tudo', 'X-Tudo', 'burger-cheddar', 2800, X_TUDO, { destaque: true, removiveis: REM_TUDO }),
  burger('x-duplo', 'X-Duplo', 'burger-duplo', 3400, `${PAO}, 2 hambúrgueres 150 g, 2 fatias de queijo cheddar e molho da casa.`, { destaque: true }),

  // ---------- Bebidas ----------
  simples('coca-2l', 'bebidas', 'Coca-Cola 2 L', 'lata', 1500),
  simples('coca-350', 'bebidas', 'Coca-Cola lata 350 ml', 'lata', 600),
  simples('coca-zero-2l', 'bebidas', 'Coca-Cola Zero 2 L', 'lata', 1500, 'Sem açúcar.'),
  simples('coca-zero-350', 'bebidas', 'Coca-Cola Zero lata 350 ml', 'lata', 600, 'Sem açúcar.'),
  simples('guarana-2l', 'bebidas', 'Guaraná Antarctica 2 L', 'lata', 1400),
  simples('guarana-350', 'bebidas', 'Guaraná Antarctica lata 350 ml', 'lata', 600),

  // ---------- Porções ----------
  {
    id: 'fritas', categoria: 'porcoes', nome: 'Fritas', descricao: 'Batata frita crocante.', preco: 1200, arte: 'batata', imagem: null,
    opcoes: [{ id: 'tamanho', nome: 'Tamanho', tipo: 'unica', obrigatorio: true, escolhas: [
      { id: 'p', nome: 'Pequena 200 g', preco: 0 },
      { id: 'm', nome: 'Média 400 g', preco: 1000 },
    ] }],
    removiveis: [],
  },

  // ---------- Combos ----------
  { ...simples('combo-x-salada', 'combos', 'Combo X-Salada', 'combo', 3500, `X-Salada + fritas 200 g + refrigerante lata. ${X_SALADA}`), opcoes: [REFRI_LATA], removiveis: ['Alface', 'Tomate', 'Maionese'] },
  { ...simples('combo-x-bacon', 'combos', 'Combo X-Bacon', 'combo', 3900, `X-Bacon + fritas 200 g + refrigerante lata. ${X_BACON}`), opcoes: [REFRI_LATA], removiveis: ['Bacon', 'Maionese'] },
  { ...simples('combo-x-tudo', 'combos', 'Combo X-Tudo', 'combo', 4200, `X-Tudo + fritas 200 g + refrigerante lata. ${X_TUDO}`), destaque: true, opcoes: [REFRI_LATA], removiveis: REM_TUDO },

  // ---------- Molhos ----------
  simples('molho-ketchup', 'molhos', 'Ketchup', 'molho-barbecue', 300, 'Potinho.'),
  simples('molho-maionese', 'molhos', 'Maionese', 'molho-casa', 300, 'Potinho.'),
  simples('molho-mostarda', 'molhos', 'Mostarda', 'molho-cheddar', 300, 'Potinho.'),
];

export const buscarProduto = (id) => PRODUTOS.find(p => p.id === id);

// Foto em assets/produtos/<arquivo>.webp; sem foto, aparece a ilustração (campo "arte").
const FOTOS = {
  'x-burger': 'x-burger', 'x-salada': 'x-salada', 'x-bacon': 'x-bacon', 'x-tudo': 'x-tudo', 'x-duplo': 'x-duplo', fritas: 'fritas',
  'guarana-2l': 'guarana-2l', 'guarana-350': 'guarana-350',
  'combo-x-salada': 'combo-x-salada', 'combo-x-bacon': 'combo-x-bacon', 'combo-x-tudo': 'combo-x-tudo',
  'coca-2l': 'coca-2l', 'coca-350': 'coca-350', 'coca-zero-2l': 'coca-zero-2l', 'coca-zero-350': 'coca-zero-350',
  'molho-ketchup': 'ketchup', 'molho-maionese': 'maionese', 'molho-mostarda': 'mostarda',
};
for (const p of PRODUTOS) if (FOTOS[p.id]) p.imagem = `assets/produtos/${FOTOS[p.id]}.webp`;

// ajustes à mão de js/ajustes.js (preço, foto, esgotado, oculto, produtos novos);
// PRODUTOS_BASE guarda o cardápio original (reserva de ilustrações do cardápio do banco)
export const PRODUTOS_BASE = structuredClone(PRODUTOS);
aplicarProdutos(PRODUTOS, CATEGORIAS, AJUSTES);
