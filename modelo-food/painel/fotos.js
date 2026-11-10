// Foto do produto tirada no celular do dono -> quadrado de 640 x 640 px, leve, pronto para o cardápio.
// Corta o centro (as fotos do cardápio são quadradas) e respeita a foto "deitada" do celular.
// Sai em WEBP; navegador que não gera WEBP (Safari antigo) sai em JPG com fundo branco.

export const LADO_FOTO = 640;
const MAX_ARQUIVO = 25 * 1024 * 1024;

async function abrirImagem(arquivo) {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    // navegador sem createImageBitmap com opções: usa uma <img>
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const gerar = (canvas, tipo, qualidade) => new Promise((ok) => canvas.toBlob(ok, tipo, qualidade));

// -> { blob, ext: 'webp' | 'jpg' }. Lança Error com mensagem pronta para o dono.
export async function prepararFoto(arquivo, lado = LADO_FOTO) {
  if (!arquivo || !/^image\//.test(arquivo.type || 'image/')) throw new Error('Escolha uma foto (JPG, PNG ou WEBP).');
  if (arquivo.size > MAX_ARQUIVO) throw new Error('Foto grande demais (máximo 25 MB).');
  let img;
  try {
    img = await abrirImagem(arquivo);
  } catch {
    throw new Error('Não deu para abrir esta foto. Tente outra (JPG ou PNG).');
  }
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  if (!w || !h) throw new Error('Não deu para abrir esta foto. Tente outra (JPG ou PNG).');
  const s = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  const desenhar = (fundo) => {
    ctx.clearRect(0, 0, lado, lado);
    if (fundo) { ctx.fillStyle = fundo; ctx.fillRect(0, 0, lado, lado); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, lado, lado);
  };
  desenhar(null);
  let blob = await gerar(canvas, 'image/webp', 0.82);
  if (blob?.type === 'image/webp') return { blob, ext: 'webp' };
  desenhar('#FFFFFF');   // JPG não tem transparência
  blob = await gerar(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new Error('Não deu para preparar a foto neste aparelho.');
  return { blob, ext: 'jpg' };
}
