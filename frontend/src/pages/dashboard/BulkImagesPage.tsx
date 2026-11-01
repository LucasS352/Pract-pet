import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, ImageIcon, CheckCircle, XCircle, AlertCircle, Loader2, FolderOpen, Zap, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { IMAGE_BATCH_BYTES, IMAGE_PAGE_SIZE, imageFormData, uploadImageBatches, type ImageUploadItem } from '@/lib/bulk-images';
import { useAuthStore } from '@/store/auth';

// ── Types ──────────────────────────────────────────────────────────────────────

type FilePreviewItem = ImageUploadItem;

interface BulkResult {
  total: number;
  matched: number;
  notFound: number;
  errors: number;
  details: {
    matched: { fileName: string }[];
    notFound: { fileName: string }[];
    errors: { fileName: string; error: string }[];
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ImageThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return url ? <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : null;
}

function fileNameWithoutExt(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BulkImagesPage() {
  const [files, setFiles] = useState<FilePreviewItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasResult, setHasResult] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const uploadController = useRef<AbortController | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => () => uploadController.current?.abort(), []);
  const result: BulkResult | null = hasResult ? {
    total: files.length,
    matched: files.filter(f => f.status === 'success').length,
    notFound: files.filter(f => f.status === 'no-match').length,
    errors: files.filter(f => f.status === 'error').length,
    details: {
      matched: files.filter(f => f.status === 'success').map(f => ({ fileName: f.file.name })),
      notFound: files.filter(f => f.status === 'no-match').map(f => ({ fileName: f.file.name })),
      errors: files.filter(f => f.status === 'error').map(f => ({ fileName: f.file.name, error: f.errorMsg || 'Erro no envio' })),
    },
  } : null;

  // Adiciona arquivos à lista
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    if (uploadingRef.current) return;
    const arr = Array.from(newFiles).filter(f => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type));
    if (arr.length === 0) {
      toast.error('Selecione apenas arquivos de imagem (jpg, png, webp...)');
      return;
    }
    const items: FilePreviewItem[] = arr.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: file.size > IMAGE_BATCH_BYTES ? 'error' : 'pending',
      errorMsg: file.size > IMAGE_BATCH_BYTES ? 'Imagem maior que 5 MB. Reduza o tamanho antes de enviar.' : undefined,
    }));
    setFiles(prev => {
      // Evitar duplicatas pelo nome
      const existing = new Set(prev.map(f => f.file.name));
      return [...prev, ...items.filter(i => {
        if (existing.has(i.file.name)) return false;
        existing.add(i.file.name);
        return true;
      })];
    });
    setHasResult(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const removeFile = (name: string) => {
    if (uploadingRef.current) return;
    setFiles(prev => {
      return prev.filter(f => f.file.name !== name);
    });
  };

  const reset = () => {
    if (uploadingRef.current) return;
    setFiles([]);
    setHasResult(false);
    setPage(0);
    setProgress(0);
    setIsUploading(false);
  };

  // Upload em massa
  const handleUpload = async () => {
    const pending = files.filter(f => f.status === 'pending');
    if (!pending.length || uploadingRef.current) return;
    const originalUser = useAuthStore.getState().user;
    if (!originalUser?.tenant) {
      toast.error('Confirme sua sessão e loja antes de enviar imagens.');
      return;
    }
    uploadingRef.current = true;
    const controller = new AbortController();
    uploadController.current = controller;
    setIsUploading(true);
    setProgress(0);
    setHasResult(false);

    try {
      const complete = await uploadImageBatches(pending, async batch => {
        const currentUser = useAuthStore.getState().user;
        if (currentUser?.id !== originalUser.id || currentUser?.tenant !== originalUser.tenant) {
          throw { response: { data: { message: 'A sessão ou loja mudou. Este lote não foi enviado.' } } };
        }
        const config = {
          signal: controller.signal,
          timeout: 120_000,
          expectedTenantId: originalUser.tenant,
        };
        const response = await api.post('/products/bulk-images', imageFormData(batch), config);
        return response.data;
      }, outcomes => {
        const byId = new Map(outcomes.map(item => [item.id, item]));
        setFiles(prev => prev.map(item => byId.get(item.id) || item));
      }, count => setProgress(Math.round(count / pending.length * 100)), controller.signal);
      if (!controller.signal.aborted) {
        setHasResult(true);
        if (complete) toast.success('Processamento concluído. Confira os resultados de cada imagem.');
        else toast.warning('Envio interrompido. Confira o lote sem confirmação; os próximos arquivos continuam pendentes.');
      }
    } catch {
      if (!controller.signal.aborted) {
        toast.error('Não foi possível preparar o envio. Os arquivos foram preservados.');
      }
    } finally {
      uploadingRef.current = false;
      if (!controller.signal.aborted) {
        setIsUploading(false);
        uploadController.current = null;
      }
    }
  };

  const statusIcon = (status: FilePreviewItem['status']) => {
    if (status === 'pending') return <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />;
    if (status === 'uploading') return <Loader2 size={20} className="text-blue-400 animate-spin" />;
    if (status === 'success') return <CheckCircle size={20} className="text-emerald-400" />;
    if (status === 'error') return <XCircle size={20} className="text-red-400" />;
    if (status === 'no-match') return <AlertCircle size={20} className="text-amber-400" />;
  };

  const statusBg = (status: FilePreviewItem['status']) => {
    if (status === 'success') return 'border-emerald-500/30 bg-emerald-500/5';
    if (status === 'error') return 'border-red-500/30 bg-red-500/5';
    if (status === 'no-match') return 'border-amber-500/30 bg-amber-500/5';
    if (status === 'uploading') return 'border-blue-500/30 bg-blue-500/5';
    return 'border-zinc-800 bg-zinc-900/50';
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const noMatchCount = files.filter(f => f.status === 'no-match').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const pageCount = Math.max(1, Math.ceil(files.length / IMAGE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <ImageIcon size={22} />
            </div>
            Upload de Imagens em Massa
          </h1>
          <p className="text-zinc-500 mt-1.5 text-sm">
            Selecione imagens com o mesmo nome do produto. O sistema faz o match automaticamente.
          </p>
        </div>
        {files.length > 0 && (
          <button
            onClick={reset}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 transition-all"
          >
            <RefreshCw size={16} /> Limpar tudo
          </button>
        )}
      </div>

      {/* Instrução */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex gap-4 items-start">
        <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
          <Zap size={16} />
        </div>
        <div className="text-sm text-zinc-400 leading-relaxed">
          <span className="text-zinc-200 font-semibold">Como funciona:</span> nomeie cada imagem igual ao produto
          (ex: <code className="text-violet-400 bg-zinc-800 px-1.5 py-0.5 rounded-md text-xs">Coca-Cola 350ml.jpg</code>).
          O sistema ignora acentos, maiúsculas e caracteres especiais para fazer o match.
          Você pode selecionar centenas de arquivos de uma vez. Enviamos em lotes pequenos, sem sobrecarregar o computador.
          Máximo de 5 MB por imagem. Nomes ambíguos não são vinculados automaticamente.
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => { if (!uploadingRef.current) inputRef.current?.click(); }}
        className={`relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300
          ${isDragging
            ? 'border-violet-500 bg-violet-500/10 scale-[1.01]'
            : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900/50 bg-zinc-900/30'
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          disabled={isUploading}
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileInput}
        />
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-300
          ${isDragging ? 'bg-violet-500/20 border-violet-500/40' : 'bg-zinc-800 border-zinc-700'} border`}>
          <FolderOpen size={28} className={isDragging ? 'text-violet-400' : 'text-zinc-400'} />
        </div>
        <p className="text-zinc-200 font-semibold text-lg mb-1">
          {isDragging ? 'Solte as imagens aqui!' : 'Arraste imagens ou clique para selecionar'}
        </p>
        <p className="text-zinc-500 text-sm">
          JPG, PNG, WEBP, GIF — múltiplos arquivos simultaneamente
        </p>
        <input ref={folderRef} type="file" multiple disabled={isUploading} className="hidden"
          {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={handleFileInput} />
        <button type="button" disabled={isUploading}
          onClick={e => { e.stopPropagation(); if (!uploadingRef.current) folderRef.current?.click(); }}
          className="mt-4 px-4 py-2 rounded-xl border border-zinc-600 text-zinc-200 disabled:opacity-50">
          Selecionar pasta de imagens
        </button>
        <p className="text-zinc-500 text-xs mt-2">Importa as imagens da pasta; não cria sincronização automática. Arquivos de outros tipos são ignorados.</p>
      </div>

      {/* Estatísticas rápidas */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: files.length, color: 'blue', icon: ImageIcon },
            { label: 'Pendentes', value: pendingCount, color: 'zinc', icon: Upload },
            { label: 'Vinculados', value: successCount, color: 'emerald', icon: CheckCircle },
            { label: 'Sem match', value: noMatchCount, color: 'amber', icon: AlertCircle },
            { label: 'Erros', value: errorCount, color: 'red', icon: XCircle },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className={`bg-zinc-900/60 border border-${color}-500/20 rounded-2xl p-4 text-center`}>
              <p className={`text-2xl font-black text-${color}-400`}>{value}</p>
              <p className="text-zinc-500 text-xs font-semibold mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-zinc-400">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-violet-400" />
              Processando lotes — aguarde a confirmação do servidor...
            </span>
            <span className="font-bold text-violet-400">{progress}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Resultado resumido */}
      {result && !isUploading && (
        <div className={`rounded-2xl border p-5 ${result.matched === result.total ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {result.matched === result.total
                ? <CheckCircle size={24} className="text-emerald-400" />
                : <AlertCircle size={24} className="text-amber-400" />
              }
              <div>
                <p className="font-bold text-zinc-100">
                  {result.matched === result.total
                    ? 'Todas as imagens foram vinculadas!'
                    : `${result.matched} de ${result.total} imagens vinculadas`
                  }
                </p>
                <p className="text-sm text-zinc-500">
                  {result.notFound > 0 && `${result.notFound} sem match · `}
                  {result.errors > 0 && `${result.errors} com erro`}
                  {pendingCount > 0 && ` · ${pendingCount} ainda não enviadas`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              Detalhes {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showDetails && (
            <div className="mt-4 space-y-3 max-h-48 overflow-y-auto">
              {result.details.notFound.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Sem correspondência</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.details.notFound.slice(0, IMAGE_PAGE_SIZE).map(n => (
                      <span key={n.fileName} className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 px-2 py-0.5 rounded-lg">
                        {n.fileName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.details.errors.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Erros</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.details.errors.slice(0, IMAGE_PAGE_SIZE).map(e => (
                      <span key={e.fileName} className="text-xs bg-red-500/10 border border-red-500/20 text-red-300 px-2 py-0.5 rounded-lg">
                        {e.fileName}: {e.error}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-zinc-500">Resumo limitado a 20 nomes por categoria. Consulte todos os resultados na lista paginada abaixo.</p>
            </div>
          )}
        </div>
      )}

      {/* Lista de arquivos */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{files.length} arquivo(s) selecionado(s)</p>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
            {files.slice(currentPage * IMAGE_PAGE_SIZE, (currentPage + 1) * IMAGE_PAGE_SIZE).map(item => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${statusBg(item.status)}`}
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                  <ImageThumbnail file={item.file} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-200 truncate">{fileNameWithoutExt(item.file.name)}</p>
                  {item.status === 'success' && item.productName && (
                    <p className="text-xs text-emerald-400 truncate">→ {item.productName}</p>
                  )}
                  {item.status === 'no-match' && (
                    <p className="text-xs text-amber-400">Nenhum produto encontrado com este nome</p>
                  )}
                  {item.status === 'error' && (
                    <p className="text-xs text-red-400">{item.errorMsg || 'Erro no upload'}</p>
                  )}
                  {item.status === 'pending' && (
                    <p className="text-xs text-zinc-500">{(item.file.size / 1024).toFixed(0)} KB</p>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 shrink-0">
                  {statusIcon(item.status)}
                  {!isUploading && (
                    <button
                      onClick={() => removeFile(item.file.name)}
                      className="text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <XCircle size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm text-zinc-400">
            <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="px-3 py-2 disabled:opacity-30">Anterior</button>
            <span>Página {currentPage + 1} de {pageCount} · até 20 miniaturas por página</span>
            <button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className="px-3 py-2 disabled:opacity-30">Próxima</button>
          </div>
        </div>
      )}

      {/* Botão Upload */}
      {(pendingCount > 0 || isUploading) && (
        <div className="sticky bottom-0 bg-zinc-950/90 backdrop-blur-md py-4 border-t border-zinc-800 -mx-3 px-3 md:-mx-8 md:px-8">
          <button
            onClick={handleUpload}
            disabled={isUploading || pendingCount === 0}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 shadow-lg shadow-violet-500/20 text-lg"
          >
            {isUploading ? (
              <>
                <Loader2 size={22} className="animate-spin" />
                Processando imagens em lotes...
              </>
            ) : (
              <>
                <Upload size={22} />
                Enviar {pendingCount} imagem(ns) pendente(s) e vincular aos produtos
              </>
            )}
          </button>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && (
        <div className="text-center py-8 text-zinc-600">
          <ImageIcon size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma imagem selecionada ainda</p>
        </div>
      )}
    </div>
  );
}
