const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const HEIC_MIME_OR_EXT = /^image\/(heic|heif)$|\.(heic|heif)$/i;
const DIRECT_PASSTHROUGH_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export const MAX_CLIENT_UPLOAD_BYTES = 15 * 1024 * 1024;
export const SERVER_OPTIMIZER_MAX_BYTES = 8 * 1024 * 1024;

export interface CompressImageOptions {
  maxEdge?: number;
  targetBytes?: number;
  baseName?: string;
}

export function isSupportedImageFile(file: File): boolean {
  if (file.type && ACCEPTED_MIMES.has(file.type.toLowerCase())) return true;
  if (!file.type && IMAGE_EXT_REGEX.test(file.name || '')) return true;
  return false;
}

function isHeicFile(file: File): boolean {
  return HEIC_MIME_OR_EXT.test(file.type || '') || HEIC_MIME_OR_EXT.test(file.name || '');
}

async function decodeImageSource(
  file: File,
): Promise<{ width: number; height: number; source: CanvasImageSource; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return { width: bitmap.width, height: bitmap.height, source: bitmap, cleanup: () => bitmap.close() };
      }
      bitmap.close();
    } catch {
      // Safari/WebKit em alguns aparelhos falha em createImageBitmap; cai para <img>.
    }
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_DECODE_ERROR'));
    };
    image.src = url;
  });

  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    source: img,
    cleanup: () => {},
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => {
    try {
      canvas.toBlob(blob => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

function canPassthroughOriginal(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  return DIRECT_PASSTHROUGH_TYPES.has(mime) && file.size > 0 && file.size <= SERVER_OPTIMIZER_MAX_BYTES;
}

/**
 * Redimensiona e comprime fotos antes do upload.
 * No iPhone/Safari, `canvas.toBlob(..., 'image/webp')` não é suportado (retorna PNG),
 * então alterna automaticamente para JPEG (que todos os navegadores suportam) e,
 * como último recurso, envia o arquivo original válido até 8 MB para o backend otimizar.
 */
export async function compressImageForUpload(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  const maxEdge = options.maxEdge ?? 800;
  const targetBytes = options.targetBytes ?? 200 * 1024;
  const baseName = options.baseName ?? 'photo';

  if (file.size > MAX_CLIENT_UPLOAD_BYTES) {
    throw new Error('A foto deve ter no máximo 15 MB.');
  }

  let decoded: Awaited<ReturnType<typeof decodeImageSource>>;
  try {
    decoded = await decodeImageSource(file);
  } catch {
    if (canPassthroughOriginal(file)) return file;
    if (isHeicFile(file)) {
      throw new Error(
        'Não foi possível abrir esta foto HEIC neste navegador. Nos Ajustes da Câmera do iPhone, use "Mais Compatível" (JPG) ou envie um arquivo JPG/PNG.',
      );
    }
    throw new Error('Formato não reconhecido. Use uma foto JPG, PNG ou WebP.');
  }

  try {
    if (!decoded.width || !decoded.height) {
      if (canPassthroughOriginal(file)) return file;
      throw new Error('Não foi possível ler as dimensões da imagem.');
    }

    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      if (canPassthroughOriginal(file)) return file;
      throw new Error('Não foi possível preparar a foto neste aparelho.');
    }

    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    // 1. Tenta WebP (Chrome/Android/Desktop). Se o aparelho retornar outro tipo (ex: PNG no Safari/iOS), muda para JPEG.
    let blob: Blob | null = null;
    for (const quality of [0.76, 0.62, 0.48]) {
      const candidate = await canvasToBlob(canvas, 'image/webp', quality);
      if (!candidate || candidate.type !== 'image/webp') {
        blob = null;
        break;
      }
      blob = candidate;
      if (blob.size <= targetBytes) break;
    }

    if (blob && blob.type === 'image/webp') {
      return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
    }

    // 2. Fallback universal para iPhone/iOS/Safari: JPEG com fundo branco para transparências.
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';

    for (const quality of [0.82, 0.72, 0.58, 0.45]) {
      const candidate = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (candidate && candidate.size > 0) {
        blob = candidate;
        if (blob.size <= targetBytes) break;
      }
    }

    if (blob && blob.size > 0) {
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      return new File([blob], `${baseName}.${ext}`, { type: blob.type || 'image/jpeg' });
    }

    if (canPassthroughOriginal(file)) return file;
    throw new Error('Não foi possível otimizar a foto neste aparelho.');
  } finally {
    decoded.cleanup();
  }
}
