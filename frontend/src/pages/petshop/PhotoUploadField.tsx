import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';

type Props = {
  value?: string | null;
  onChange: (value: string) => void;
  label: string;
  subjectName?: string;
  circular?: boolean;
};

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(source);
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(new File([blob], 'pet-care-photo.webp', { type: 'image/webp' })) : reject(new Error('Falha ao preparar a foto.')), 'image/webp', 0.82);
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error('Não foi possível abrir a imagem.'));
    };
    image.src = source;
  });
}

export function PhotoUploadField({ value, onChange, label, subjectName, circular = true }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const selectPhoto = async (file?: File) => {
    if (!file) return;
    if (!acceptedTypes.has(file.type)) {
      toast.error('Use uma foto JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('A foto deve ter no máximo 15 MB.');
      return;
    }

    setUploading(true);
    try {
      const prepared = await compressImage(file);
      const body = new FormData();
      body.append('file', prepared);
      const { data } = await api.post('/petshop/uploads/photo', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      onChange(data.imageUrl);
      toast.success('Foto adicionada.');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Não foi possível enviar a foto.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  return <fieldset className="sm:col-span-2">
    <legend className="mb-2 text-xs font-medium text-[var(--pc-text-secondary)]">{label}</legend>
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-4 sm:flex-row sm:items-center">
      <div className={`grid h-24 w-24 shrink-0 place-items-center overflow-hidden border border-[var(--pc-border-strong)] bg-white ${circular ? 'rounded-full' : 'rounded-xl'}`}>
        {value ? <img src={getFullUrl(value)} alt={subjectName ? `Foto de ${subjectName}` : 'Foto selecionada'} className="h-full w-full object-cover" /> : <Camera aria-hidden="true" size={28} className="text-[var(--pc-text-muted)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{value ? 'Foto pronta para salvar' : 'Adicione uma foto de identificação'}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--pc-text-muted)]">JPG, PNG ou WebP. A imagem é redimensionada e otimizada automaticamente.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => void selectPhoto(event.target.files?.[0])} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Tirar foto com a câmera" onChange={event => void selectPhoto(event.target.files?.[0])} />
          <button type="button" disabled={uploading} onClick={() => cameraRef.current?.click()} className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--pc-action)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--pc-action-hover)] disabled:cursor-wait disabled:opacity-60">{uploading ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : <Camera aria-hidden="true" size={16} />}{uploading ? 'Enviando…' : 'Tirar foto'}</button>
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--pc-border-strong)] bg-white px-4 text-sm font-semibold text-[var(--pc-action)] transition hover:bg-[var(--pc-action-soft)] disabled:cursor-wait disabled:opacity-60"><Upload aria-hidden="true" size={16} />Escolher da galeria</button>
          {value && <button type="button" disabled={uploading} onClick={() => onChange('')} className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--pc-border-strong)] bg-white px-3 text-sm font-semibold text-[var(--pc-danger)] transition hover:bg-[var(--pc-danger-soft)]"><Trash2 aria-hidden="true" size={16} />Remover</button>}
        </div>
      </div>
    </div>
  </fieldset>;
}
