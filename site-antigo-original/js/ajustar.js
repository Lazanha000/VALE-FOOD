// Aplica os ajustes à mão (js/ajustes.js) sobre CONFIG e PRODUTOS.
// Funções puras, sem importar config.js nem products.js (são eles que chamam daqui).
// Regra: valor fora do formato esperado é ignorado e vira aviso no console; o site
// nunca quebra por causa de um ajuste errado.

export const AVISOS_AJUSTES = [];
const aviso = (m) => AVISOS_AJUSTES.push(`Ajuste ignorado: ${m}`);

const ehObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// texto de uma linha, sem caracteres de controle, até "max"
export const texto = (v, max) => (typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v.trim() : undefined);
// valores em centavos: inteiro de 0 a R$ 10.000,00
export const centavos = (v) => (Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : undefined);
// fotos só da pasta de produtos do próprio site
export const caminhoFoto = (v) => (typeof v === 'string' && /^assets\/produtos\/[a-z0-9][a-z0-9._-]{0,80}\.(webp|jpe?g|png)$/i.test(v) && !v.includes('..') ? v : undefined);
export const idValido = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(v);
const hora = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const TIPOS_PIX = ['telefone', 'cpf', 'cnpj', 'email', 'aleatoria'];

// copia campo a campo só o que passou na conferência
function usar(destino, chave, valor) {
  if (valor !== undefined) destino[chave] = valor;
}
function campo(origem, chave, conferir, nome) {
  if (!ehObj(origem) || !(chave in origem)) return undefined;
  const v = conferir(origem[chave]);
  if (v === undefined) aviso(`${nome} (${JSON.stringify(origem[chave]).slice(0, 40)})`);
  return v;
}

export function aplicarConfig(cfg, aj) {
  if (!ehObj(aj)) return cfg;
  const loja = aj.loja;
  if (ehObj(loja)) {
    usar(cfg.whatsapp, 'numero', campo(loja, 'whatsapp', (v) => (typeof v === 'string' && /^\+?[\d\s().-]{10,20}$/.test(v) && [10, 11, 12, 13].includes(v.replace(/\D/g, '').length) ? v.replace(/\D/g, '') : undefined), 'loja.whatsapp'));
    usar(cfg.whatsapp, 'mensagemPadrao', campo(loja, 'mensagemPadrao', (v) => texto(v, 300), 'loja.mensagemPadrao'));
    if (ehObj(loja.mensagens)) {
      cfg.whatsapp.mensagens = { ...cfg.whatsapp.mensagens };
      for (const k of ['carrinho', 'finalizar', 'pedido']) usar(cfg.whatsapp.mensagens, k, campo(loja.mensagens, k, (v) => texto(v, 300), `loja.mensagens.${k}`));
    }
    if (ehObj(loja.pedido)) {
      cfg.whatsapp.pedido = { ...cfg.whatsapp.pedido };
      usar(cfg.whatsapp.pedido, 'titulo', campo(loja.pedido, 'titulo', (v) => texto(v, 60), 'loja.pedido.titulo'));
      usar(cfg.whatsapp.pedido, 'abertura', campo(loja.pedido, 'abertura', (v) => texto(v, 200), 'loja.pedido.abertura'));
      usar(cfg.whatsapp.pedido, 'fechamento', campo(loja.pedido, 'fechamento', (v) => texto(v, 200), 'loja.pedido.fechamento'));
    }
  }
  if (ehObj(aj.pix)) {
    usar(cfg.pix, 'chave', campo(aj.pix, 'chave', (v) => texto(v, 77), 'pix.chave'));
    usar(cfg.pix, 'tipo', campo(aj.pix, 'tipo', (v) => (TIPOS_PIX.includes(v) ? v : undefined), 'pix.tipo'));
    usar(cfg.pix, 'nome', campo(aj.pix, 'nome', (v) => texto(v, 25), 'pix.nome'));
    usar(cfg.pix, 'cidade', campo(aj.pix, 'cidade', (v) => texto(v, 15), 'pix.cidade'));
  }
  if (ehObj(aj.entrega)) {
    const e = aj.entrega;
    usar(cfg.entrega, 'ativo', campo(e, 'ativo', (v) => (typeof v === 'boolean' ? v : undefined), 'entrega.ativo'));
    usar(cfg.entrega, 'tempo', campo(e, 'tempo', (v) => texto(v, 30), 'entrega.tempo'));
    usar(cfg.entrega, 'pedidoMinimo', campo(e, 'pedidoMinimo', centavos, 'entrega.pedidoMinimo'));
    if ('taxa' in e) {
      if (cfg.entrega.taxa?.tipo === 'fixa') usar(cfg.entrega.taxa, 'valor', campo(e, 'taxa', centavos, 'entrega.taxa'));
      else aviso('entrega.taxa (só vale para taxa fixa; taxa por bairro é editada em config.js)');
    }
  }
  if (ehObj(aj.retirada)) {
    const r = aj.retirada;
    usar(cfg.retirada, 'ativo', campo(r, 'ativo', (v) => (typeof v === 'boolean' ? v : undefined), 'retirada.ativo'));
    usar(cfg.retirada, 'tempo', campo(r, 'tempo', (v) => texto(v, 30), 'retirada.tempo'));
    usar(cfg.retirada, 'local', campo(r, 'local', (v) => texto(v, 150), 'retirada.local'));
    usar(cfg.retirada, 'pedidoMinimo', campo(r, 'pedidoMinimo', centavos, 'retirada.pedidoMinimo'));
  }
  if (ehObj(aj.horario)) {
    usar(cfg.horario, 'bloquearPedidoFechado', campo(aj.horario, 'bloquearPedidoFechado', (v) => (typeof v === 'boolean' ? v : undefined), 'horario.bloquearPedidoFechado'));
    if (ehObj(aj.horario.semana)) {
      cfg.horario.semana = { ...cfg.horario.semana };
      for (const d of DIAS) {
        if (!(d in aj.horario.semana)) continue;
        const v = aj.horario.semana[d];
        const ok = v === null || (Array.isArray(v) && v.length >= 1 && v.length <= 3 && v.every((f) => Array.isArray(f) && f.length === 2 && hora(f[0]) && hora(f[1]) && f[0] !== f[1]));
        if (ok) cfg.horario.semana[d] = v === null ? null : v.map((f) => [f[0], f[1]]);
        else aviso(`horario.semana.${d}`);
      }
    }
  }
  return cfg;
}

// produtos: { [id]: { nome, descricao, preco, esgotado, destaque, oculto, imagem, opcoes: { 'grupo:escolha': centavos } } }
// novos: [{ id, categoria, nome, descricao, preco, imagem }] (produtos simples, sem opções)
export function aplicarProdutos(lista, categorias, aj) {
  if (!ehObj(aj)) return lista;
  if (ehObj(aj.produtos)) {
    for (const [id, m] of Object.entries(aj.produtos)) {
      const idx = lista.findIndex((p) => p.id === id);
      if (idx < 0 || !ehObj(m)) { aviso(`produtos.${id} (produto não existe)`); continue; }
      if (m.oculto === true) { lista.splice(idx, 1); continue; }
      const p = lista[idx];
      usar(p, 'nome', campo(m, 'nome', (v) => { const t = texto(v, 60); return t ? t : undefined; }, `produtos.${id}.nome`));
      usar(p, 'descricao', campo(m, 'descricao', (v) => texto(v, 300), `produtos.${id}.descricao`));
      usar(p, 'preco', campo(m, 'preco', centavos, `produtos.${id}.preco`));
      usar(p, 'esgotado', campo(m, 'esgotado', (v) => (typeof v === 'boolean' ? v : undefined), `produtos.${id}.esgotado`));
      usar(p, 'destaque', campo(m, 'destaque', (v) => (typeof v === 'boolean' ? v : undefined), `produtos.${id}.destaque`));
      usar(p, 'imagem', campo(m, 'imagem', caminhoFoto, `produtos.${id}.imagem`));
      if (ehObj(m.opcoes)) {
        for (const [chave, preco] of Object.entries(m.opcoes)) {
          const [g, e] = chave.split(':');
          const esc = p.opcoes.find((x) => x.id === g)?.escolhas.find((x) => x.id === e);
          const v = centavos(preco);
          if (!esc || v === undefined) { aviso(`produtos.${id}.opcoes.${chave}`); continue; }
          // os grupos de opção são compartilhados entre produtos (ex.: refrigerante do combo): copia antes de mudar
          const gi = p.opcoes.findIndex((x) => x.id === g);
          p.opcoes = p.opcoes.map((x, i) => (i === gi ? { ...x, escolhas: x.escolhas.map((y) => ({ ...y })) } : x));
          p.opcoes[gi].escolhas.find((x) => x.id === e).preco = v;
        }
      }
    }
  }
  if (Array.isArray(aj.novos)) {
    for (const n of aj.novos.slice(0, 100)) {
      const ok = ehObj(n) && idValido(n.id) && !lista.some((p) => p.id === n.id) && categorias.some((c) => c.id === n.categoria)
        && texto(n.nome, 60) && centavos(n.preco) !== undefined;
      if (!ok) { aviso(`novos (${JSON.stringify(n?.id ?? n).slice(0, 40)})`); continue; }
      const parecido = lista.find((p) => p.categoria === n.categoria);
      lista.push({
        id: n.id, categoria: n.categoria, nome: texto(n.nome, 60), descricao: texto(n.descricao ?? '', 300) ?? '',
        preco: n.preco, arte: parecido?.arte || 'lata', imagem: caminhoFoto(n.imagem) ?? null,
        opcoes: [], removiveis: [], esgotado: n.esgotado === true,
      });
    }
  }
  return lista;
}
