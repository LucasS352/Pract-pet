import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

type Tenant = { id: string; name?: string; databaseName: string };
type Mode = 'prepare' | 'simulate_apply' | 'apply' | 'simulate_rollback' | 'rollback';
interface Job {
  id: string; tenantId: string; databaseName: string; createdAt: string; prepared: boolean; packageHash?: string;
  run: { id: string; mode: Mode; cursor: number; complete: boolean; counts: Record<string, number> };
  simulations: { apply?: string; rollback?: string }; total: number;
  assetOffset?: number;
  diagnosis: { inspected: number; selected: number; external: number; missing: number; oversized: number; totalBytes: number };
  assets: { newId: string; oldId: string; oldBytes: number; bytes: number; width: number; height: number; names: string[] }[];
}
// Sys-Init PIN only. Does not send cashier credentials or run shop logout interceptors.
const maintenance = axios.create({ baseURL: '/api', timeout: 60000 });
const size = (bytes: number) => bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MiB` : `${Math.round(bytes / 1024)} KiB`;
const titles: Record<Mode, string> = { prepare: 'Otimização das fotos', simulate_apply: 'Verificação de segurança', apply: 'Aplicação', simulate_rollback: 'Verificação da restauração', rollback: 'Restauração' };
const outcomeNames: Record<string, string> = { prepared: 'Fotos otimizadas', applied: 'Vínculos salvos', already_applied: 'Já salvos', reverted: 'Restaurados', already_reverted: 'Já restaurados', conflict: 'Fotos alteradas pelo cliente (preservadas)', source_changed: 'Originais alterados (preservados)', target_changed: 'Versões divergentes (preservadas)', unsupported_or_invalid_image: 'Formato inválido/não suportado', missing_or_too_large: 'Ausentes ou grandes demais', less_than_10_percent_saving: 'Sem ganho suficiente', eligible_apply: 'Vínculos verificados', eligible_rollback: 'Reversões verificadas' };
const button = 'rounded-lg border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed';

function TenantImagePanel({ tenant, pin, onBusy }: { tenant: Tenant; pin: string; onBusy: (value: boolean) => void }) {
  const base = `/tenants/setup/${tenant.id}/image-optimization`;
  const headers = { 'x-setup-pin': pin };
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<{ id: string; createdAt: string }[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');



  const [previewIndex, setPreviewIndex] = useState(0);
  const [preview, setPreview] = useState<{ original?: string; optimized?: string }>({});
  const previewUrls = useRef<string[]>([]);
  const mounted = useRef(true), stop = useRef(false), busyRef = useRef(false);
  const previewAbort = useRef<AbortController | null>(null);
  const clearPreview = () => {
    previewAbort.current?.abort(); previewUrls.current.forEach(URL.revokeObjectURL); previewUrls.current = [];
    if (mounted.current) setPreview({});
  };
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    maintenance.get(`${base}/jobs`, { headers, signal: controller.signal, timeout: 15000 })
      .then(r => { if (mounted.current) setHistory(r.data); }).catch(e => { if (!axios.isCancel(e) && mounted.current) setError('Não foi possível carregar os lotes. Verifique a conexão e o PIN.'); });
    return () => { mounted.current = false; stop.current = true; controller.abort(); clearPreview(); };
  }, [base, pin]);

  const updateJob = (next: Job) => { if (mounted.current) setJob(next); };
  const fail = (e: any) => {
    if (mounted.current) setError(e?.response?.data?.message || 'Conexão interrompida. A última etapa pode ter terminado. Consulte o lote; não crie outro para repetir a operação.');
  };
  const task = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; stop.current = false; setBusy(true); onBusy(true); setError(''); clearPreview();
    try { await action(); } catch (e) { fail(e); }
    finally { busyRef.current = false; if (mounted.current) { setBusy(false); onBusy(false); } }
  };
  const openJob = (id: string) => task(async () => {
    const { data } = await maintenance.get<Job>(`${base}/jobs/${id}`, { headers });
    updateJob(data); setPreviewIndex(0);
  });
  const create = () => task(async () => {
    const id = crypto.randomUUID();
    // Expose the stable ID locally before POST so even a lost response is recoverable.
    setHistory(old => [{ id, createdAt: new Date().toISOString() }, ...old]);
    const { data } = await maintenance.post<Job>(`${base}/jobs`, { id, limit: 'all' }, { headers });
    updateJob(data); setPreviewIndex(0);
  });
  const drain = async (initial: Job, confirmation: object = {}) => {
    let current = initial;
    while (!current.run.complete && !stop.current && mounted.current) {
      const { data } = await maintenance.post<Job>(`${base}/jobs/${current.id}/step`, {
        ...confirmation, runId: current.run.id, cursor: current.run.cursor, assetCursor: current.assets.length,
      }, { headers });
      // Progress only carries new photo metadata, not the complete gallery on every step.
      const offset = data.assetOffset || 0;
      if (offset > current.assets.length) throw Error('Progress mismatch; reload saved operation');
      current = { ...data, assets: [...current.assets.slice(0, offset), ...data.assets] }; updateJob(current);
      if (!current.run.complete && !stop.current) await new Promise(resolve => setTimeout(resolve, 300));
    }
    return current;
  };
  const optimize = () => task(async () => { if (job && !job.prepared) await drain(job); });
  const save = (direction: 'apply' | 'rollback' = 'apply') => {
    if (!job || busyRef.current) return;
    if (!window.confirm(direction === 'apply'
      ? `Salvar as imagens otimizadas na loja ${tenant.name || job.databaseName} (${job.databaseName})? Os originais serão preservados. Mantenha backup atualizado de Heart e loja.`
      : `Restaurar os vínculos originais desta operação na loja ${tenant.name || job.databaseName}? Fotos trocadas depois pelo cliente serão preservadas.`)) return;
    void task(async () => {
      let current = (await maintenance.get<Job>(`${base}/jobs/${job.id}`, { headers })).data;
      const confirmation = { confirmed: true, packageHash: current.packageHash, confirmDatabase: current.databaseName };
      const start = async (mode: Mode) => {
        current = (await maintenance.post<Job>(`${base}/jobs/${current.id}/start`, { ...confirmation, mode }, { headers })).data;
        updateJob(current);
      };
      // Resume an interrupted write; otherwise simulate before starting writes.
      if (!(current.run.mode === direction && !current.run.complete)) {
        const simulation = direction === 'apply' ? 'simulate_apply' : 'simulate_rollback';
        if (!(current.run.mode === simulation && !current.run.complete)) {
          if (stop.current || !mounted.current) return;
          await start(simulation);
        }
        current = await drain(current);
        if (stop.current || !mounted.current || !current.run.complete) return;
        await start(direction);
      }
      if (!stop.current && mounted.current) await drain(current, confirmation);
    });
  };
  const loadPreview = async (original: boolean) => {
    const asset = job?.assets[previewIndex]; if (!job || !asset || busy) return;
    previewAbort.current?.abort(); const controller = new AbortController(); previewAbort.current = controller;
    try {
      const { data } = await maintenance.get(`${base}/jobs/${job.id}/preview/${asset.newId}`, {
        headers, params: { original }, responseType: 'blob', signal: controller.signal,
      });
      if (controller.signal.aborted || !mounted.current) return;
      const url = URL.createObjectURL(data); previewUrls.current.push(url);
      setPreview(old => ({ ...old, [original ? 'original' : 'optimized']: url }));
    } catch (e) { if (!axios.isCancel(e)) fail(e); }
  };

  const asset = job?.assets[previewIndex];

  const before = job?.assets.reduce((n, a) => n + a.oldBytes, 0) || 0;
  const after = job?.assets.reduce((n, a) => n + a.bytes, 0) || 0;
  const saved = job?.run.mode === 'apply' && job.run.complete;
  const issues = job ? (job.run.counts.conflict || 0) + (job.run.counts.source_changed || 0) + (job.run.counts.target_changed || 0) : 0;
  return <div className="space-y-4">
    <p className="text-sm text-zinc-300">Loja: <strong>{tenant.name || tenant.databaseName}</strong> · Banco: <code>{tenant.databaseName}</code></p>
    <p className="rounded-lg border border-cyan-900 p-3 text-sm text-zinc-300">
      Todas as fotos que precisam de redução serão processadas, uma por vez. As originais ficam preservadas.
      Nada muda no catálogo até você clicar em “Salvar aplicação”. Vendas, estoque e estrutura do banco não são alterados.
    </p>
    <button className={button} disabled={busy} onClick={create}>1. Analisar todas as imagens</button>
    {error && <p role="alert" className="rounded bg-red-950 p-3 text-sm text-red-200">{error}</p>}
    {job && <>
      <div className="rounded-lg bg-zinc-800 p-4 text-sm space-y-3">
        <div className="grid sm:grid-cols-3 gap-4">
          <div><p className="text-zinc-400">Peso atual na análise</p><strong className="text-2xl">{size(job.diagnosis.totalBytes)}</strong></div>
          <div><p className="text-zinc-400">Fotos para reduzir</p><strong className="text-2xl">{job.diagnosis.selected}</strong></div>
          <div><p className="text-zinc-400">{job.prepared ? 'Peso estimado após salvar' : 'Produtos com imagem'}</p><strong className="text-2xl">{job.prepared ? size(Math.max(0, job.diagnosis.totalBytes - before + after)) : job.diagnosis.inspected}</strong></div>
        </div>
        {!!(job.diagnosis.external + job.diagnosis.missing + job.diagnosis.oversized) && <p className="text-amber-200">Não processadas automaticamente: {job.diagnosis.external} referências externas/incompatíveis, {job.diagnosis.missing} ausentes, {job.diagnosis.oversized} acima de 8 MiB.</p>}
        <p>{titles[job.run.mode]}: {job.run.cursor}/{job.total} — {busy ? 'em andamento' : job.run.complete ? 'concluído' : 'pronto para continuar'}</p>
        <progress className="w-full" value={job.run.cursor} max={job.total || 1} />
        {job.prepared && before > 0 && <p className="text-emerald-300">{job.assets.length} fotos preparadas: {size(before)} → {size(after)} ({((1 - after / before) * 100).toFixed(1)}% menos dados nessas fotos).</p>}
        {saved && <p className={issues ? 'text-amber-200' : 'text-emerald-300'}>{issues ? `Aplicação concluída com ${issues} vínculo(s) preservado(s) por conflito. Consulte os detalhes.` : 'Aplicação salva. Atualize o catálogo para ver as imagens leves.'}</p>}
        {job.prepared && !job.assets.length && <p>Nenhuma foto preparada para salvar. Confira os detalhes se houve arquivos recusados.</p>}
        {job.prepared && job.diagnosis.selected > job.assets.length && <p className="text-amber-200">{job.diagnosis.selected - job.assets.length} foto(s) mantida(s) sem alteração por formato inválido, mudança no arquivo ou ganho insuficiente.</p>}
      </div>
      <div className="flex gap-2 flex-wrap">
        {!job.prepared && <button className={button + ' bg-cyan-900'} disabled={busy} onClick={optimize}>2. {job.run.cursor ? 'Continuar otimização' : 'Otimizar todas'}</button>}
        {job.prepared && !!job.assets.length && !saved && <button className={button + ' bg-emerald-900'} disabled={busy} onClick={() => save()}>3. Salvar aplicação</button>}
        {busy && <button className={button} onClick={() => { stop.current = true; }}>Pausar</button>}
      </div>
      {job.prepared && !!job.assets.length && <>
        <p className="text-xs text-zinc-400">O peso estimado é o das fotos usadas no catálogo, não espaço liberado em disco. Originais permanecem guardados e conflitos podem alterar o resultado final.</p>
        <details><summary className="cursor-pointer text-sm text-zinc-300">Comparar qualidade das fotos (opcional)</summary>
        {asset && <div className="border border-zinc-700 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-3">
            <button className={button} disabled={busy || previewIndex === 0} onClick={() => { clearPreview(); setPreviewIndex(n => n - 1); }}>Anterior</button>
            <span className="text-sm">Foto {previewIndex + 1}/{job.assets.length}</span>
            <button className={button} disabled={busy || previewIndex >= job.assets.length - 1} onClick={() => { clearPreview(); setPreviewIndex(n => n + 1); }}>Próxima</button>
          </div>
          <p className="text-sm">{asset.names.join(' / ')} · {size(asset.oldBytes)} → {size(asset.bytes)} · {asset.width}×{asset.height}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><button disabled={busy || !!preview.original} className={button} onClick={() => loadPreview(true)}>Carregar original (maior)</button>{preview.original && <img className="w-full h-64 object-contain" src={preview.original} alt="Original preservado" />}</div>
            <div><button disabled={busy || !!preview.optimized} className={button} onClick={() => loadPreview(false)}>Carregar versão otimizada</button>{preview.optimized && <img className="w-full h-64 object-contain" src={preview.optimized} alt="Prévia otimizada" />}</div>
          </div>
        </div>}

        </details>
      </>}
    </>}
    <details className="border-t border-zinc-700 pt-3 space-y-3">
      <summary className="cursor-pointer text-sm text-zinc-400">Histórico, detalhes e restauração</summary>
      <select aria-label="Operações anteriores" disabled={busy} value={job?.id || ''} onChange={e => { if (e.target.value) void openJob(e.target.value); }} className="max-w-full bg-zinc-800 p-2 rounded text-sm">
        <option value="">Retomar operação anterior…</option>
        {history.map(h => <option key={h.id} value={h.id}>{new Date(h.createdAt).toLocaleString('pt-BR')} · {h.id.slice(0, 8)}</option>)}
      </select>
      {job && <>
        <p className="text-xs text-zinc-400 break-all">Operação {job.id} · {job.packageHash}</p>
        <p className="text-sm">{Object.entries(job.run.counts).map(([key, n]) => `${outcomeNames[key] || key}: ${n}`).join(' · ') || 'Nenhum resultado ainda'}</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy} onClick={() => openJob(job.id)}>Atualizar estado</button>
          {!!job.assets.length && job.prepared && <button className={button} disabled={busy} onClick={() => save('rollback')}>Restaurar fotos desta operação</button>}
        </div>
      </>}
      <p className="text-xs text-zinc-400">A verificação de segurança é feita ao salvar, antes da gravação. Fechar ou pausar permite concluir apenas a requisição atual. Em falha de rede, atualize o estado e retome a mesma operação. Nenhum trabalho retoma sozinho.</p>
    </details>
  </div>;
}

export default function ImageOptimizationPanel({ tenants, pin, onClose }: { tenants: Tenant[]; pin: string; onClose: () => void }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const tenant = tenants.find(t => t.id === tenantId);
  return <div className="fixed inset-0 z-[100] bg-black/80 p-3 sm:p-8 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Otimização segura de imagens">
    <div className="mx-auto max-w-4xl rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 p-5 space-y-4">
      <div className="flex justify-between items-center gap-2"><h2 className="text-xl font-bold">Otimizar imagens · Sys-Init</h2><button className={button} onClick={onClose}>Fechar / pausar</button></div>
      <p className="text-sm text-zinc-400">Todas as imagens elegíveis da loja, sem escolher lotes. Esta ação é independente de “Atualizar Bancos”.</p>
      <select aria-label="Loja para otimizar" disabled={busy} className="bg-zinc-800 p-2 rounded w-full" value={tenantId} onChange={e => setTenantId(e.target.value)}>
        {tenants.map(t => <option key={t.id} value={t.id}>{t.name || t.databaseName} · {t.databaseName}</option>)}
      </select>
      {tenant && <TenantImagePanel key={tenant.id} tenant={tenant} pin={pin} onBusy={setBusy} />}
    </div>
  </div>;
}
