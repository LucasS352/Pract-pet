export const IMAGE_BATCH_FILES = 10;
export const IMAGE_BATCH_BYTES = 5 * 1024 * 1024;
export const IMAGE_PAGE_SIZE = 20;
export interface ImageUploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'no-match';
  productName?: string;
  errorMsg?: string;
}
export interface BulkImageResponse {
  details: {
    matched: { fileId?: string; fileName: string; productName: string }[];
    notFound: { fileId?: string; fileName: string }[];
    errors: { fileId?: string; fileName: string; error: string }[];
  };
}

export function imageBatches(items: ImageUploadItem[]): ImageUploadItem[][] {
  const batches: ImageUploadItem[][] = [];
  let batch: ImageUploadItem[] = [], bytes = 0;
  for (const item of items) {
    if (item.file.size > IMAGE_BATCH_BYTES) throw new Error('Imagem maior que 5 MB.');
    if (batch.length && (batch.length === IMAGE_BATCH_FILES || bytes + item.file.size > IMAGE_BATCH_BYTES)) {
      batches.push(batch); batch = []; bytes = 0;
    }
    batch.push(item); bytes += item.file.size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function imageFormData(batch: ImageUploadItem[]): FormData {
  const form = new FormData();
  // UTF-8 JSON preserves the original name; ASCII wire names avoid multipart charset ambiguity.
  form.append('manifest', JSON.stringify(batch.map(item => ({ fileId: item.id, fileName: item.file.name }))));
  batch.forEach(item => form.append('files', item.file, item.id));
  return form;
}

export function imageResults(batch: ImageUploadItem[], data: BulkImageResponse): ImageUploadItem[] {
  return batch.map(item => {
    const matches = (entry: { fileId?: string; fileName: string }) => entry.fileId === item.id;
    const matched = data?.details?.matched?.filter(matches) || [];
    const notFound = data?.details?.notFound?.filter(matches) || [];
    const errors = data?.details?.errors?.filter(matches) || [];
    if (matched.length + notFound.length + errors.length !== 1) {
      return { ...item, status: 'error', errorMsg: 'Resposta sem confirmação individual. Confira o catálogo antes de reenviar.' };
    }
    if (matched.length) return { ...item, status: 'success', productName: matched[0].productName };
    if (notFound.length) return { ...item, status: 'no-match' };
    return { ...item, status: 'error', errorMsg: errors[0].error };
  });
}

// No retry of writes. A failed/lost response stops subsequent batches, which stay pending.
export async function uploadImageBatches(
  items: ImageUploadItem[],
  send: (batch: ImageUploadItem[]) => Promise<BulkImageResponse>,
  update: (items: ImageUploadItem[]) => void,
  completed: (count: number) => void,
  signal: AbortSignal,
): Promise<boolean> {
  let count = 0;
  for (const batch of imageBatches(items)) {
    if (signal.aborted) return false;
    update(batch.map(item => ({ ...item, status: 'uploading' })));
    let outcomes: ImageUploadItem[];
    try { outcomes = imageResults(batch, await send(batch)); }
    catch (error: any) {
      const message = error?.response?.data?.message;
      outcomes = batch.map(item => ({ ...item, status: 'error', errorMsg: message
        ? String(message)
        : 'Envio sem confirmação. Confira o catálogo antes de reenviar; algumas imagens podem ter sido vinculadas.' }));
      if (!signal.aborted) update(outcomes);
      return false;
    }
    if (signal.aborted) return false;
    update(outcomes);
    count += batch.length;
    completed(count);
  }
  return true;
}
