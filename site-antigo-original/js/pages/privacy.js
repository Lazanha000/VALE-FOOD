// Política de privacidade (LGPD, Lei 13.709/2018). Texto-modelo: os dados do controlador
// vêm de CONFIG.privacidade. Revisar com quem entende de LGPD antes de usar com clientes reais.

import { CONFIG } from '../config.js';
import { esc, el, salvo, CHAVES } from '../utils.js';
import { avisar } from '../ui.js';

// tudo que o site grava no aparelho (localStorage); gerado da mesma lista usada para gravar
export const CHAVES_LOCAIS = Object.values(CHAVES);

export function paginaPrivacidade(main) {
  const c = CONFIG.privacidade;
  // e-mail vira link mailto (só o endereço); telefone fica como texto
  const email = String(c.email || '').trim();
  const meios = [
    email ? `e-mail <a href="mailto:${esc(email)}">${esc(email)}</a>` : '',
    c.telefone ? `telefone ${esc(c.telefone)}` : '',
  ].filter(Boolean);
  // com o sistema de pedidos (Supabase) ligado, o pedido também é gravado fora do aparelho
  const banco = Boolean(CONFIG.api?.supabaseUrl && CONFIG.api?.chavePublica) && !CONFIG.modoDemonstracao;
  const ctt = meios.length ? meios.join(' ou ') : 'o WhatsApp do restaurante';
  const data = new Date(`${c.atualizadoEm}T12:00:00`).toLocaleDateString('pt-BR');
  const sec = el(`<section class="pagina pagina-texto" aria-labelledby="pg-h"><div class="wrap wrap--estreito">
    <header class="pagina-cab"><p class="olho">Seus dados</p><h1 id="pg-h" tabindex="-1">Política de privacidade</h1></header>
    <p class="campo-dica">Atualizada em ${esc(data)}.</p>
    ${CONFIG.modoDemonstracao ? '<p class="aviso aviso--demo"><strong>Modo demonstração.</strong> Este site é um exemplo: nenhum restaurante recebe os pedidos feitos aqui e o texto abaixo é um modelo.</p>' : ''}
    <h2>1. Quem cuida dos seus dados</h2>
    <p>${esc(c.controlador)}, CNPJ ${esc(c.cnpj)}, é a responsável (controladora) pelos dados tratados neste site. Contato para assuntos de privacidade: ${ctt}.</p>
    <h2>2. Quais dados coletamos</h2>
    <p>Só o que você digita para fazer o pedido: nome, telefone, e-mail (opcional), endereço de entrega (CEP, rua, número, complemento, bairro e cidade), itens, forma de pagamento, valor do troco e observações. O site <strong>não pede dados de cartão</strong> nem senhas.</p>
    <h2>3. Para que usamos</h2>
    <ul>
      <li>Preparar, entregar e cobrar o pedido, e falar com você sobre ele, pelo telefone ou pelo e-mail se você informar (base legal: execução do contrato, art. 7º, V).</li>
      <li>Cumprir obrigações legais, como registros fiscais (art. 7º, II).</li>
      <li>Lembrar seus dados e seus pedidos neste aparelho para a próxima vez, <strong>somente se você marcar a caixa</strong> “Lembrar meus dados e pedidos” (consentimento, art. 7º, I). Você pode desmarcar a qualquer momento.</li>
    </ul>
    <p>Não vendemos seus dados nem os usamos para propaganda de terceiros.</p>
    <h2>4. Com quem os dados são compartilhados</h2>
    <ul>
      ${banco ? '<li><strong>Sistema de pedidos (banco de dados na nuvem, Supabase):</strong> ao confirmar, o pedido (nome, telefone, e-mail se informado, endereço, itens, forma de pagamento, troco e observações) é gravado no sistema da loja para o restaurante receber, preparar e para você acompanhar o andamento. Só o restaurante e quem cuida do sistema têm acesso. Dependendo da região escolhida pelo restaurante, os servidores podem ficar fora do Brasil (transferência internacional de dados, art. 33 da LGPD).</li>' : ''}
      <li><strong>WhatsApp (Meta):</strong> ao confirmar o pedido, o site abre o WhatsApp sozinho com o resumo pronto para o restaurante: itens, seu nome, telefone, e-mail (se informado), endereço e um link do Google Maps com o endereço de entrega. A mensagem só sai quando você a envia no WhatsApp. O tratamento no WhatsApp segue a política da Meta.</li>
      <li><strong>Google Maps:</strong> o link do mapa vai dentro da mensagem; quem tocar nele (o restaurante ou o entregador) abre o endereço no Google Maps.</li>
      <li><strong>Pix:</strong> o QR Code e o código copia e cola são gerados no próprio navegador, sem enviar seus dados a ninguém. O pagamento acontece no app do seu banco, que segue a política do banco.</li>
      <li><strong>Entregador:</strong> recebe o que precisa para chegar até você (endereço, nome e código do pedido).</li>
      <li>Fora isso, só compartilhamos por ordem legal.</li>
    </ul>
    <h2>5. O que fica no seu aparelho</h2>
    <p>O site usa o armazenamento do navegador (não usa cookies de rastreamento nem ferramentas de análise) para guardar: o carrinho, o tema claro/escuro, o código, o horário e o telefone dos pedidos feitos neste aparelho (para você encontrar o pedido), a contagem de envios recentes (proteção contra pedidos falsos) e, só se você marcou “Lembrar meus dados e pedidos”, seus dados do formulário e o pedido completo (itens, nome e endereço). ${banco ? 'O código do pedido e um código secreto de acompanhamento ficam no aparelho e são enviados ao sistema de pedidos só para consultar o andamento. ' : 'Nada disso sai do aparelho por conta própria. '}O site também guarda uma cópia dos próprios arquivos (telas, cardápio e fotos) para abrir mais rápido e sem internet; essa cópia não tem dados seus.</p>
    <div class="apagar-box">
      <button type="button" class="btn btn-sec" data-apagar>Apagar meus dados deste aparelho</button>
      <p class="campo-dica">Limpa carrinho, tema, pedidos e dados lembrados guardados por este site neste navegador.${banco ? ' Para apagar o pedido do sistema da loja, fale com o restaurante (item 7).' : ''}</p>
    </div>
    <h2>6. Por quanto tempo guardamos</h2>
    <p>Os dados do pedido ficam pelo tempo necessário para atender e para cumprir obrigações legais e fiscais; depois são apagados ou anonimizados. Os dados guardados no seu aparelho ficam até você apagá-los.</p>
    <h2>7. Seus direitos</h2>
    <p>Pela LGPD (art. 18) você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização, eliminação, portabilidade, informação sobre com quem compartilhamos e a revogação do consentimento. Escreva para ${ctt}. Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
    <h2>8. Crianças e adolescentes</h2>
    <p>O site é feito para maiores de 18 anos. Menores devem pedir com ajuda de um responsável.</p>
    <h2>9. Mudanças nesta política</h2>
    <p>Se algo mudar, a data no topo desta página muda junto.</p>
    <p><a class="btn btn-primario" href="#cardapio">Voltar ao cardápio</a></p>
  </div></section>`);
  main.append(sec);
  sec.querySelector('[data-apagar]').addEventListener('click', () => {
    CHAVES_LOCAIS.forEach((k) => salvo.apagar(k));
    avisar('Dados deste aparelho apagados');
    setTimeout(() => location.reload(), 900); // o carrinho em memória some junto
  });
  return null;
}
