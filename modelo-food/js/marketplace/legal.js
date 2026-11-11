// ============================================================
// DOCUMENTOS DA PLATAFORMA: privacidade (LGPD), termos de uso, cancelamento e reembolso,
// armazenamento no aparelho ("cookies") e termo de adesão do estabelecimento.
// Os dados da empresa vêm de CONFIG.privacidade (js/config.js). Enquanto o CNPJ não estiver
// preenchido, as páginas avisam que a operação comercial ainda não começou.
// Textos escritos para a plataforma real; peça revisão de um advogado antes do lançamento.
// Leis consideradas: LGPD (Lei 13.709/2018), Código de Defesa do Consumidor (Lei 8.078/1990),
// Decreto 7.962/2013 (comércio eletrônico) e Marco Civil da Internet (Lei 12.965/2014).
// ============================================================

import { CONFIG } from '../config.js';
import { esc, el, salvo, CHAVES } from '../utils.js';
import { avisar } from '../ui.js';
import { PLATAFORMA } from './dados.js';

export const CHAVE_AVISO = `${CONFIG.marca.id}:aviso-armazenamento:v1`;
// tudo que o site grava no aparelho (o botão "apagar" limpa esta lista)
export const CHAVES_LOCAIS = [...Object.values(CHAVES), CHAVE_AVISO, 'modelo:loja:v1', 'modelo:avaliacao:v1'];

const emp = () => {
  const c = CONFIG.privacidade || {};
  const cnpj = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(c.cnpj || '') ? c.cnpj : '';
  return { nome: PLATAFORMA.nome, razao: c.controlador || '', cnpj, email: String(c.email || '').trim(), telefone: c.telefone || '', endereco: c.endereco || '',
    data: new Date(`${c.atualizadoEm}T12:00:00`).toLocaleDateString('pt-BR') };
};
const quem = (e) => (e.cnpj ? `${esc(e.razao || e.nome)}, CNPJ ${esc(e.cnpj)}${e.endereco ? `, ${esc(e.endereco)}` : ''}` : `a equipe responsável pelo ${esc(e.nome)}`);
const contato = (e) => {
  const meios = [e.email ? `e-mail <a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : '', e.telefone ? `telefone ${esc(e.telefone)}` : ''].filter(Boolean);
  return `${meios.length ? `${meios.join(' ou ')}, ou ` : ''}a página <a href="#suporte">Suporte</a> (opção “Meus dados”)`;
};
const semEmpresa = (e) => (e.cnpj ? '' : `<p class="aviso"><strong>Plataforma em fase de testes.</strong> A razão social, o CNPJ e o endereço da empresa responsável serão publicados aqui antes do início da operação comercial.</p>`);

function pagina(main, olho, titulo, corpo) {
  const e = emp();
  const sec = el(`<section class="pagina pagina-texto" aria-labelledby="pg-h"><div class="wrap wrap--estreito">
    <header class="pagina-cab"><p class="olho">${esc(olho)}</p><h1 id="pg-h" tabindex="-1">${esc(titulo)}</h1></header>
    <p class="campo-dica">Atualizado em ${esc(e.data)}.</p>
    ${semEmpresa(e)}
    ${corpo(e)}
    <p><a class="btn btn-sec" href="#termos">Todos os documentos</a> <a class="btn btn-primario" href="#inicio">Voltar ao início</a></p>
  </div></section>`);
  main.append(sec);
  return sec;
}

// ---------- índice ----------
export function paginaTermos(main) {
  const docs = [['termos-uso', 'Termos de uso', 'Regras para usar a plataforma e fazer pedidos.'],
    ['privacidade', 'Política de privacidade', 'Quais dados usamos, para quê e os seus direitos (LGPD).'],
    ['reembolso', 'Cancelamento e reembolso', 'Como cancelar um pedido e quando há devolução.'],
    ['cookies', 'Armazenamento no aparelho (cookies)', 'O que o site guarda no seu navegador.'],
    ['adesao', 'Termo de adesão do estabelecimento', 'Regras para lojas que vendem pela plataforma.']];
  pagina(main, 'Documentos', 'Termos e políticas', () => `<ul class="lista-docs">${docs.map(([r, t, d]) => `<li><a href="#${r}"><strong>${t}</strong></a><br><span class="campo-dica">${d}</span></li>`).join('')}</ul>`);
  return null;
}

// ---------- privacidade ----------
export function paginaPrivacidade(main) {
  const sec = pagina(main, 'Seus dados', 'Política de privacidade', (e) => `
    <h2>1. Quem cuida dos seus dados</h2>
    <p>O ${esc(e.nome)} é uma plataforma que liga clientes a lanchonetes e restaurantes da região. Quem responde pela plataforma é ${quem(e)}.</p>
    <p>Em cada pedido há dois responsáveis: a <strong>plataforma</strong>, que registra o pedido e o repassa, e o <strong>estabelecimento</strong> que você escolheu, que usa seus dados para preparar, cobrar e entregar. Contato para assuntos de privacidade: ${contato(e)}.</p>
    <h2>2. Quais dados coletamos</h2>
    <ul>
      <li><strong>De quem pede:</strong> nome, telefone, e-mail (opcional), endereço de entrega (só na entrega), itens, forma de pagamento, valor do troco e observações. É o mínimo para o pedido chegar. Não pedimos CPF, data de nascimento, dados de cartão nem senha.</li>
      <li><strong>De quem avalia ou pede ajuda:</strong> a nota, o comentário, o telefone e o que você escrever.</li>
      <li><strong>De quem cadastra um estabelecimento:</strong> e-mail e senha da conta, dados da loja, CPF ou CNPJ, nome, telefone e e-mail do responsável e endereço.</li>
      <li><strong>Automaticamente:</strong> um identificador embaralhado do seu endereço de rede (IP), usado só para barrar pedidos falsos em massa. Não dá para chegar a você por ele.</li>
    </ul>
    <h2>3. Para que usamos e com que base legal</h2>
    <ul>
      <li>Registrar, preparar, entregar e cobrar o pedido, e falar com você sobre ele (execução de contrato, LGPD art. 7º, V).</li>
      <li>Atender pedidos de ajuda e mostrar a nota média dos estabelecimentos (legítimo interesse, art. 7º, IX).</li>
      <li>Evitar fraude e pedidos falsos (legítimo interesse e segurança, art. 7º, IX).</li>
      <li>Cumprir obrigações legais e guardar registros exigidos por lei (art. 7º, II).</li>
      <li>Lembrar seus dados neste aparelho, só se você marcar a caixa “Lembrar meus dados e pedidos” (consentimento, art. 7º, I).</li>
    </ul>
    <p>Não vendemos seus dados, não fazemos propaganda de terceiros e não usamos ferramentas de análise ou rastreamento (como Google Analytics ou pixels de redes sociais).</p>
    <h2>4. Com quem os dados são compartilhados</h2>
    <ul>
      <li><strong>O estabelecimento que você escolheu</strong> e os entregadores dele: recebem o pedido com nome, telefone e endereço.</li>
      <li><strong>Supabase</strong> (banco de dados em nuvem): guarda os pedidos e os cadastros. O banco fica em servidores na região de São Paulo; a empresa que presta o serviço é estrangeira e pode acessar os dados para suporte técnico (transferência internacional, LGPD art. 33).</li>
      <li><strong>GitHub</strong> (hospedagem das páginas): entrega os arquivos do site e, como todo servidor, registra o endereço de rede de quem acessa.</li>
      <li><strong>WhatsApp (Meta):</strong> só se você tocar em “Mandar o resumo no WhatsApp”. A mensagem sai do seu aparelho quando você a envia.</li>
      <li><strong>Google Maps:</strong> o estabelecimento pode abrir o seu endereço no mapa para fazer a entrega.</li>
      <li><strong>Pix:</strong> o QR Code é gerado no seu navegador. O pagamento acontece no aplicativo do seu banco, direto para o estabelecimento.</li>
      <li>Autoridades, quando a lei ou uma ordem judicial exigir.</li>
    </ul>
    <h2>5. O que fica no seu aparelho</h2>
    <p>Veja em <a href="#cookies">Armazenamento no aparelho</a>. Você pode apagar tudo agora:</p>
    <div class="apagar-box">
      <button type="button" class="btn btn-sec" data-apagar>Apagar meus dados deste aparelho</button>
      <p class="campo-dica">Limpa carrinho, tema, pedidos e dados lembrados guardados por este site neste navegador. Para apagar o que está no sistema, veja o item 7.</p>
    </div>
    <h2>6. Por quanto tempo guardamos</h2>
    <p>Os dados do pedido ficam guardados pelo tempo necessário para atender você e para a defesa em eventual reclamação, por até 5 anos (prazo do art. 27 do Código de Defesa do Consumidor). Depois disso, ou antes, a seu pedido, nome, telefone, e-mail, endereço e observações são apagados e ficam só os itens e os valores, sem identificar ninguém. O que está no seu aparelho fica até você apagar.</p>
    <h2>7. Seus direitos</h2>
    <p>Pela LGPD (art. 18) você pode pedir, sem custo: confirmação de que tratamos seus dados, acesso, correção, anonimização, <strong>exclusão</strong>, portabilidade, informação sobre com quem compartilhamos e a revogação do consentimento.</p>
    <p><a class="btn btn-primario" href="#suporte?m=dados">Pedir acesso ou exclusão dos meus dados</a></p>
    <p>Respondemos em até 15 dias. Pedidos em andamento só podem ser apagados depois de entregues ou cancelados. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
    <h2>8. Segurança</h2>
    <p>A conexão é criptografada (HTTPS). Cada estabelecimento só enxerga os próprios pedidos, e os valores são sempre calculados no servidor. Nenhum sistema é totalmente imune; se houver incidente que possa causar risco a você, avisaremos você e a ANPD.</p>
    <h2>9. Crianças e adolescentes</h2>
    <p>A plataforma é feita para maiores de 18 anos. Menores devem pedir com a ajuda de um responsável.</p>
    <h2>10. Mudanças nesta política</h2>
    <p>Se algo mudar, a data no topo desta página muda junto. Mudanças importantes serão avisadas na página inicial.</p>`);
  sec.querySelector('[data-apagar]').addEventListener('click', () => {
    CHAVES_LOCAIS.forEach((k) => salvo.apagar(k));
    avisar('Dados deste aparelho apagados');
    setTimeout(() => location.reload(), 900);
  });
  return null;
}

// ---------- termos de uso ----------
export function paginaTermosUso(main) {
  pagina(main, 'Regras', 'Termos de uso', (e) => `
    <h2>1. O que é o ${esc(e.nome)}</h2>
    <p>É uma plataforma que mostra o cardápio de estabelecimentos da região e leva o seu pedido até eles. <strong>Quem vende, prepara, entrega e recebe o pagamento é o estabelecimento.</strong> A plataforma não produz alimentos, não faz entregas e não recebe o valor dos pedidos. Responsável pela plataforma: ${quem(e)}.</p>
    <h2>2. Quem pode usar</h2>
    <p>Maiores de 18 anos, ou menores com a ajuda de um responsável. Ao pedir, você declara que os dados informados (nome, telefone e endereço) são verdadeiros.</p>
    <h2>3. Como funciona o pedido</h2>
    <ul>
      <li>Você escolhe um estabelecimento, monta o carrinho e confirma. O pedido é de um estabelecimento por vez.</li>
      <li>O total mostrado antes de confirmar inclui os produtos e a taxa de entrega. Preços, taxa, área de entrega, horário e tempo estimado são definidos por cada estabelecimento.</li>
      <li>O tempo de entrega é uma estimativa do estabelecimento e pode variar com o movimento e o clima.</li>
      <li>O estabelecimento pode recusar ou cancelar um pedido (por falta de produto ou endereço fora da área, por exemplo). Nesse caso você é avisado na tela de acompanhamento.</li>
    </ul>
    <h2>4. Pagamento</h2>
    <p>O pagamento é feito direto ao estabelecimento: Pix para a chave dele, dinheiro ou cartão na maquininha, na entrega ou na retirada. A plataforma não guarda dados de cartão nem cobra nada do cliente.</p>
    <h2>5. Cancelamento e reembolso</h2>
    <p>Veja a <a href="#reembolso">política de cancelamento e reembolso</a>.</p>
    <h2>6. Avaliações</h2>
    <p>Só quem recebeu o pedido pode avaliar, uma vez por pedido. A nota média aparece na página do estabelecimento depois de 5 avaliações. Não publicamos avaliações inventadas nem pagas. Comentários com ofensas, dados de terceiros ou conteúdo ilegal podem ser removidos.</p>
    <h2>7. O que não é permitido</h2>
    <p>Fazer pedidos falsos ou em nome de outra pessoa sem autorização, tentar burlar preços ou o sistema, usar robôs e copiar o conteúdo da plataforma para fins comerciais. Quem fizer isso pode ser bloqueado e responder pelos danos.</p>
    <h2>8. Responsabilidades</h2>
    <ul>
      <li><strong>Do estabelecimento:</strong> qualidade e segurança dos alimentos, informações do cardápio (incluindo ingredientes e alergênicos), preço, prazo, entrega e reembolso.</li>
      <li><strong>Da plataforma:</strong> manter o site funcionando, registrar e repassar o pedido corretamente, proteger seus dados e ajudar a resolver problemas pelo <a href="#suporte">Suporte</a>.</li>
    </ul>
    <p>Nada nestes termos limita os direitos que o Código de Defesa do Consumidor garante a você.</p>
    <h2>9. Alergias e restrições alimentares</h2>
    <p>Se você tem alergia ou restrição, confirme os ingredientes direto com o estabelecimento antes de pedir. O telefone dele aparece na tela de acompanhamento.</p>
    <h2>10. Disponibilidade</h2>
    <p>O site pode ficar fora do ar por manutenção ou falha técnica. Fazemos o possível para evitar, mas não garantimos funcionamento sem interrupções.</p>
    <h2>11. Mudanças e foro</h2>
    <p>Estes termos podem mudar; a data no topo indica a versão. Vale a lei brasileira. O consumidor pode recorrer à Justiça da cidade onde mora.</p>
    <h2>12. Contato</h2>
    <p>Fale com a plataforma por ${contato(e)}.</p>`);
  return null;
}

// ---------- cancelamento e reembolso ----------
export function paginaReembolso(main) {
  pagina(main, 'Pedidos', 'Cancelamento e reembolso', (e) => `
    <p>O pagamento vai direto para o estabelecimento, então <strong>é ele quem devolve o dinheiro</strong>. A plataforma acompanha e ajuda a resolver.</p>
    <h2>1. Cancelar o pedido</h2>
    <ul>
      <li><strong>Antes de o preparo começar</strong> (situação “Pedido recebido”): ligue para o estabelecimento ou abra um chamado no <a href="#suporte">Suporte</a>. O cancelamento é sem custo e, se você já pagou por Pix, o valor é devolvido inteiro.</li>
      <li><strong>Depois que o preparo começou:</strong> por ser alimento feito na hora, o cancelamento depende do estabelecimento.</li>
    </ul>
    <h2>2. Quando você tem direito à devolução ou à troca</h2>
    <ul>
      <li>O pedido não chegou.</li>
      <li>Veio item errado, faltando ou impróprio para consumo.</li>
      <li>O estabelecimento cancelou depois de você ter pago.</li>
      <li>Você foi cobrado a mais.</li>
    </ul>
    <p>Nesses casos você pode escolher entre refazer o pedido, devolver o valor pago (total ou da parte com problema) ou abater o preço, como prevê o Código de Defesa do Consumidor (arts. 18 a 20 e 35).</p>
    <h2>3. Como pedir</h2>
    <ol>
      <li>Fale com o estabelecimento: o telefone aparece na tela “Acompanhar pedido”.</li>
      <li>Se não resolver, abra um chamado no <a href="#suporte">Suporte</a> com o código do pedido. Respondemos em até 2 dias úteis.</li>
      <li>Guarde o comprovante do Pix e, se puder, fotos do problema.</li>
    </ol>
    <h2>4. Prazo e forma da devolução</h2>
    <p>O estabelecimento devolve pelo mesmo meio do pagamento: Pix de volta para a sua conta, dinheiro, ou estorno na maquininha. O prazo combinado com os estabelecimentos é de até 7 dias corridos depois de reconhecido o problema.</p>
    <h2>5. Direito de arrependimento</h2>
    <p>O art. 49 do Código de Defesa do Consumidor dá 7 dias para desistir de compras feitas fora da loja. Para alimentos preparados na hora e já entregues em boas condições, a devolução do produto não é possível; por isso, peça o cancelamento antes de o preparo começar. Se o produto chegar com problema, vale o item 2.</p>
    <h2>6. Se nada resolver</h2>
    <p>Você pode procurar o Procon do seu município ou registrar a reclamação em <strong>consumidor.gov.br</strong>. Contato da plataforma: ${contato(e)}.</p>`);
  return null;
}

// ---------- armazenamento no aparelho ("cookies") ----------
export function paginaCookies(main) {
  pagina(main, 'Seu navegador', 'Armazenamento no aparelho (cookies)', () => `
    <p><strong>Este site não usa cookies de propaganda nem de rastreamento</strong>, e não carrega ferramentas de análise de terceiros. Por isso não pedimos consentimento de cookies: tudo o que guardamos é necessário para o site funcionar, e fica no seu aparelho.</p>
    <h2>O que é guardado</h2>
    <ul>
      <li><strong>Carrinho e estabelecimento escolhido:</strong> para você não perder o pedido ao fechar a página.</li>
      <li><strong>Código e chave de acompanhamento dos seus pedidos, e o telefone usado:</strong> para você achar o pedido e ver o andamento.</li>
      <li><strong>Tema claro ou escuro</strong> e o aviso de que você já leu esta informação.</li>
      <li><strong>Contagem de envios recentes:</strong> proteção contra pedidos falsos.</li>
      <li><strong>Pedidos que já pedimos para você avaliar:</strong> para não perguntar duas vezes.</li>
      <li><strong>Seus dados do formulário e o pedido completo:</strong> somente se você marcar “Lembrar meus dados e pedidos”.</li>
      <li><strong>No painel dos estabelecimentos:</strong> a sessão de quem entrou com e-mail e senha.</li>
    </ul>
    <h2>Como apagar</h2>
    <p>Use o botão “Apagar meus dados deste aparelho” na <a href="#privacidade">Política de privacidade</a> ou limpe os dados do site nas configurações do navegador.</p>
    <h2>Se isso mudar</h2>
    <p>Se um dia a plataforma passar a usar ferramentas de medição ou propaganda, elas só serão ligadas depois do seu consentimento, com opção de recusar.</p>`);
  return null;
}

// ---------- termo de adesão do estabelecimento ----------
export function paginaAdesao(main) {
  pagina(main, 'Estabelecimentos', 'Termo de adesão', (e) => `
    <p>Vale para lanchonetes, restaurantes e outros estabelecimentos que vendem pelo ${esc(e.nome)}. Ao enviar o cadastro, o responsável declara que leu e aceita este termo.</p>
    <h2>1. Cadastro e aprovação</h2>
    <p>O estabelecimento informa dados verdadeiros (CPF ou CNPJ, responsável, endereço e telefone) e mantém em dia as licenças exigidas para vender alimentos, como o alvará sanitário. A equipe da plataforma confere o cadastro e pode pedir documentos, aprovar, recusar ou suspender.</p>
    <h2>2. O que a plataforma oferece</h2>
    <p>Página com cardápio, recebimento de pedidos com aviso sonoro, acompanhamento para o cliente, link próprio da loja, avaliações e suporte. A plataforma não faz entregas nem recebe o pagamento dos pedidos.</p>
    <h2>3. Obrigações do estabelecimento</h2>
    <ul>
      <li>Manter cardápio, preços, horário, taxa e área de entrega atualizados, e marcar como esgotado o que acabou.</li>
      <li>Deixar o painel aberto no horário de funcionamento e responder aos pedidos. Pedido sem resposta prejudica o cliente e pode levar à suspensão.</li>
      <li>Preparar e entregar o que foi pedido, no prazo informado, com higiene e segurança.</li>
      <li>Informar ingredientes e alergênicos quando o cliente perguntar.</li>
      <li>Resolver problemas e devolver valores conforme a <a href="#reembolso">política de cancelamento e reembolso</a> e o Código de Defesa do Consumidor.</li>
      <li>Emitir os documentos fiscais das próprias vendas.</li>
    </ul>
    <h2>4. Pagamentos e mensalidade</h2>
    <p>O cliente paga direto ao estabelecimento (Pix na chave cadastrada, dinheiro ou maquininha). A plataforma cobra uma mensalidade fixa por estabelecimento, sem comissão por pedido. O valor e a data de vencimento são informados antes da aprovação do cadastro e qualquer reajuste é avisado com 30 dias de antecedência. Mensalidade em atraso pode levar à suspensão da loja até a regularização.</p>
    <h2>5. Dados dos clientes (LGPD)</h2>
    <p>O estabelecimento recebe nome, telefone e endereço do cliente <strong>somente para preparar, cobrar e entregar o pedido</strong>. É proibido usar esses dados para propaganda, repassá-los a terceiros ou guardá-los fora do painel sem base legal. O estabelecimento responde pelo uso que fizer deles e deve avisar a plataforma se houver vazamento.</p>
    <h2>6. Avaliações</h2>
    <p>As notas vêm de clientes que receberam o pedido. É proibido criar avaliações falsas ou oferecer vantagem em troca de nota.</p>
    <h2>7. Suspensão e saída</h2>
    <p>A plataforma pode suspender a loja em caso de dados falsos, reclamações graves ou repetidas, risco ao consumidor ou atraso na mensalidade, informando o motivo no painel. O estabelecimento pode sair quando quiser, pedindo pelo Suporte; os pedidos em andamento devem ser concluídos e os registros são guardados pelo prazo legal.</p>
    <h2>8. Responsabilidade</h2>
    <p>O estabelecimento responde pelos produtos, pela entrega e pelo atendimento. A plataforma responde pelo funcionamento do sistema e não garante volume de vendas.</p>
    <h2>9. Contato</h2>
    <p>${contato(e)}.</p>`);
  return null;
}

// ---------- aviso único sobre armazenamento (não é pedido de consentimento: só há itens essenciais) ----------
export function avisoArmazenamento() {
  let visto = false;
  try { visto = localStorage.getItem(CHAVE_AVISO) === '1'; } catch { visto = true; }
  if (visto) return;
  const b = el(`<aside class="aviso-arm" aria-label="Aviso sobre dados guardados no aparelho">
    <p>Este site guarda no seu aparelho só o necessário para funcionar (carrinho e seus pedidos). Não usamos cookies de propaganda nem rastreamento. <a href="#cookies">Saiba mais</a></p>
    <button type="button" class="btn btn-primario">Entendi</button></aside>`);
  b.querySelector('button').addEventListener('click', () => {
    try { localStorage.setItem(CHAVE_AVISO, '1'); } catch { /* fica só nesta visita */ }
    b.remove();
  });
  document.body.append(b);
}
