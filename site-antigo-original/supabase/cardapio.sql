-- Gerado por supabase/gerar-cardapio.mjs a partir de js/products.js e js/config.js.
-- Rode DEPOIS do schema.sql. Substitui cardápio, bairros e horários (pedidos ficam).
begin;
delete from public.produtos;   -- apaga grupos e opções junto
delete from public.categorias;
delete from public.bairros;
delete from public.horarios;

insert into public.categorias (id, nome, ordem) values ('hamburgueres', 'Burguer', 0);
insert into public.categorias (id, nome, ordem) values ('bebidas', 'Bebidas', 1);
insert into public.categorias (id, nome, ordem) values ('porcoes', 'Porções', 2);
insert into public.categorias (id, nome, ordem) values ('combos', 'Combos', 3);
insert into public.categorias (id, nome, ordem) values ('molhos', 'Molhos', 4);

insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('x-burger', 'hamburgueres', 'X-Burger', 'Pão tostado na chapa, hambúrguer 150 g, queijo e maionese.', 1800, 'assets/produtos/x-burger.webp', 'burger-classic', false, true, array['Maionese']::text[], 0);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('x-salada', 'hamburgueres', 'X-Salada', 'Pão tostado na chapa, hambúrguer 150 g, queijo, alface, tomate e maionese.', 2200, 'assets/produtos/x-salada.webp', 'burger-classic', false, true, array['Alface', 'Tomate', 'Maionese']::text[], 1);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('x-bacon', 'hamburgueres', 'X-Bacon', 'Pão tostado na chapa, hambúrguer 150 g, queijo, bacon crocante e maionese.', 2600, 'assets/produtos/x-bacon.webp', 'burger-bacon', false, true, array['Bacon', 'Maionese']::text[], 2);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('x-tudo', 'hamburgueres', 'X-Tudo', 'Pão tostado na chapa, hambúrguer 150 g, queijo, bacon, ovo, presunto, alface, tomate, cebola roxa e maionese.', 2800, 'assets/produtos/x-tudo.webp', 'burger-cheddar', true, true, array['Bacon', 'Ovo', 'Presunto', 'Alface', 'Tomate', 'Cebola', 'Maionese']::text[], 3);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('x-duplo', 'hamburgueres', 'X-Duplo', 'Pão tostado na chapa, 2 hambúrgueres 150 g, 2 fatias de queijo cheddar e molho da casa.', 3400, 'assets/produtos/x-duplo.webp', 'burger-duplo', true, true, array[]::text[], 4);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('coca-2l', 'bebidas', 'Coca-Cola 2 L', '', 1500, 'assets/produtos/coca-2l.webp', 'lata', false, true, array[]::text[], 5);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('coca-350', 'bebidas', 'Coca-Cola lata 350 ml', '', 600, 'assets/produtos/coca-350.webp', 'lata', false, true, array[]::text[], 6);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('coca-zero-2l', 'bebidas', 'Coca-Cola Zero 2 L', 'Sem açúcar.', 1500, 'assets/produtos/coca-zero-2l.webp', 'lata', false, true, array[]::text[], 7);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('coca-zero-350', 'bebidas', 'Coca-Cola Zero lata 350 ml', 'Sem açúcar.', 600, 'assets/produtos/coca-zero-350.webp', 'lata', false, true, array[]::text[], 8);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('guarana-2l', 'bebidas', 'Guaraná Antarctica 2 L', '', 1400, 'assets/produtos/guarana-2l.webp', 'lata', false, true, array[]::text[], 9);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('guarana-350', 'bebidas', 'Guaraná Antarctica lata 350 ml', '', 600, 'assets/produtos/guarana-350.webp', 'lata', false, true, array[]::text[], 10);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('fritas', 'porcoes', 'Fritas', 'Batata frita crocante.', 1200, 'assets/produtos/fritas.webp', 'batata', false, true, array[]::text[], 11);
with g as (insert into public.grupos_opcao (produto_id, chave, nome, tipo, obrigatorio, max, ordem) values ('fritas', 'tamanho', 'Tamanho', 'unica', true, null, 0) returning id)
insert into public.opcoes (grupo_id, chave, nome, preco, ordem) select g.id, x.chave, x.nome, x.preco, x.ordem from g, (values ('p', 'Pequena 200 g', 0, 0), ('m', 'Média 400 g', 1000, 1)) as x(chave, nome, preco, ordem);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('combo-x-salada', 'combos', 'Combo X-Salada', 'X-Salada + fritas 200 g + refrigerante lata. Pão tostado na chapa, hambúrguer 150 g, queijo, alface, tomate e maionese.', 3500, 'assets/produtos/combo-x-salada.webp', 'combo', false, true, array['Alface', 'Tomate', 'Maionese']::text[], 12);
with g as (insert into public.grupos_opcao (produto_id, chave, nome, tipo, obrigatorio, max, ordem) values ('combo-x-salada', 'refri', 'Refrigerante lata', 'unica', true, null, 0) returning id)
insert into public.opcoes (grupo_id, chave, nome, preco, ordem) select g.id, x.chave, x.nome, x.preco, x.ordem from g, (values ('coca', 'Coca-Cola', 0, 0), ('zero', 'Coca-Cola Zero', 0, 1), ('guarana', 'Guaraná', 0, 2)) as x(chave, nome, preco, ordem);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('combo-x-bacon', 'combos', 'Combo X-Bacon', 'X-Bacon + fritas 200 g + refrigerante lata. Pão tostado na chapa, hambúrguer 150 g, queijo, bacon crocante e maionese.', 3900, 'assets/produtos/combo-x-bacon.webp', 'combo', false, true, array['Bacon', 'Maionese']::text[], 13);
with g as (insert into public.grupos_opcao (produto_id, chave, nome, tipo, obrigatorio, max, ordem) values ('combo-x-bacon', 'refri', 'Refrigerante lata', 'unica', true, null, 0) returning id)
insert into public.opcoes (grupo_id, chave, nome, preco, ordem) select g.id, x.chave, x.nome, x.preco, x.ordem from g, (values ('coca', 'Coca-Cola', 0, 0), ('zero', 'Coca-Cola Zero', 0, 1), ('guarana', 'Guaraná', 0, 2)) as x(chave, nome, preco, ordem);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('combo-x-tudo', 'combos', 'Combo X-Tudo', 'X-Tudo + fritas 200 g + refrigerante lata. Pão tostado na chapa, hambúrguer 150 g, queijo, bacon, ovo, presunto, alface, tomate, cebola roxa e maionese.', 4200, 'assets/produtos/combo-x-tudo.webp', 'combo', true, true, array['Bacon', 'Ovo', 'Presunto', 'Alface', 'Tomate', 'Cebola', 'Maionese']::text[], 14);
with g as (insert into public.grupos_opcao (produto_id, chave, nome, tipo, obrigatorio, max, ordem) values ('combo-x-tudo', 'refri', 'Refrigerante lata', 'unica', true, null, 0) returning id)
insert into public.opcoes (grupo_id, chave, nome, preco, ordem) select g.id, x.chave, x.nome, x.preco, x.ordem from g, (values ('coca', 'Coca-Cola', 0, 0), ('zero', 'Coca-Cola Zero', 0, 1), ('guarana', 'Guaraná', 0, 2)) as x(chave, nome, preco, ordem);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('molho-ketchup', 'molhos', 'Ketchup', 'Potinho.', 300, 'assets/produtos/ketchup.webp', 'molho-barbecue', false, true, array[]::text[], 15);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('molho-maionese', 'molhos', 'Maionese', 'Potinho.', 300, 'assets/produtos/maionese.webp', 'molho-casa', false, true, array[]::text[], 16);
insert into public.produtos (id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, removiveis, ordem) values ('molho-mostarda', 'molhos', 'Mostarda', 'Potinho.', 300, 'assets/produtos/mostarda.webp', 'molho-cheddar', false, true, array[]::text[], 17);

insert into public.horarios (dia, abre, fecha) values (1, '11:00', '23:00');
insert into public.horarios (dia, abre, fecha) values (2, '11:00', '23:00');
insert into public.horarios (dia, abre, fecha) values (3, '11:00', '23:00');
insert into public.horarios (dia, abre, fecha) values (4, '11:00', '23:00');
insert into public.horarios (dia, abre, fecha) values (5, '11:00', '23:00');
insert into public.horarios (dia, abre, fecha) values (6, '11:00', '23:00');
insert into public.horarios (dia, abre, fecha) values (7, '11:00', '23:00');

insert into public.loja (id, prefixo_pedido, whatsapp, aberta_manual, bloquear_fechado, fuso, entrega_ativa, entrega_tempo, entrega_minimo, taxa_tipo, taxa_fixa, bairros_sem_entrega, cidades_atendidas, retirada_ativa, retirada_tempo, retirada_minimo, retirada_local, pix_chave, pix_tipo, pix_nome, pix_cidade, pagamentos)
values (1, 'MO', '5533999785853', true, true, 'America/Sao_Paulo', true, '45 min', 2000, 'fixa', 500, array[]::text[], array[]::text[], true, '30 min', 0, 'Rua Exemplo, 100, Centro, Sua Cidade', '33999785853', 'telefone', 'MODELO BURGUER', 'TEOFILO OTONI', array['pix', 'credito', 'debito', 'dinheiro']::text[])
on conflict (id) do update set prefixo_pedido = excluded.prefixo_pedido, whatsapp = excluded.whatsapp, aberta_manual = excluded.aberta_manual, bloquear_fechado = excluded.bloquear_fechado, fuso = excluded.fuso, entrega_ativa = excluded.entrega_ativa, entrega_tempo = excluded.entrega_tempo, entrega_minimo = excluded.entrega_minimo, taxa_tipo = excluded.taxa_tipo, taxa_fixa = excluded.taxa_fixa, bairros_sem_entrega = excluded.bairros_sem_entrega, cidades_atendidas = excluded.cidades_atendidas, retirada_ativa = excluded.retirada_ativa, retirada_tempo = excluded.retirada_tempo, retirada_minimo = excluded.retirada_minimo, retirada_local = excluded.retirada_local, pix_chave = excluded.pix_chave, pix_tipo = excluded.pix_tipo, pix_nome = excluded.pix_nome, pix_cidade = excluded.pix_cidade, pagamentos = excluded.pagamentos;
commit;
