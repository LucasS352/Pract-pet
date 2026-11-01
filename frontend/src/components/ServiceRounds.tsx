import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface Round {
  id: string; assetNumber: number | null; timerStartedAt: string | null;
  timerDueAt: string | null; timerMinutes: number | null; kdsStatus: string;
  product: { name: string }; comanda: { id: string; number: string; status: string };
}
export function ServiceRounds({ onNewRosh }: { onNewRosh: (comandaId: string) => void }) {
  const [items, setItems] = useState<Round[]>([]);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const alerted = useRef(new Set<string>());
  const loading = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const load = useCallback(async (refresh = false) => {
    if (loading.current) { await loading.current; if (!refresh) return; }
    const request = (async () => {
    const start = Date.now();
    try {
      const res = await api.get('/v1/comandas/service-rounds', { timeout: 10000 });
      if (mounted.current) {
        setOffset(new Date(res.data.serverTime).getTime() - (start + Date.now()) / 2);
        setItems(res.data.items); setError(false);
      }
    } catch { if (mounted.current) setError(true); }
    })();
    loading.current = request;
    try { await request; } finally { if (loading.current === request) loading.current = null; }
  }, []);
  useEffect(() => {
    mounted.current = true; load();
    const poll = setInterval(load, 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; clearInterval(poll); clearInterval(clock); audio.current?.close(); audio.current = null; };
  }, [load]);
  useEffect(() => {
    if (!sound || error || audio.current?.state !== 'running') return;
    const overdue = items.filter(item => item.timerDueAt && new Date(item.timerDueAt).getTime() <= now + offset);
    const fresh = overdue.filter(item => !alerted.current.has(item.id + item.timerDueAt));
    if (fresh.length) {
      const oscillator = audio.current.createOscillator(), gain = audio.current.createGain();
      oscillator.connect(gain); gain.connect(audio.current.destination);
      oscillator.frequency.value = 660; gain.gain.value = .1;
      oscillator.start(); oscillator.stop(audio.current.currentTime + .25);
      fresh.forEach(item => alerted.current.add(item.id + item.timerDueAt));
    }
  }, [items, now, offset, sound, error]);
  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try {
      audio.current ||= new AudioContext(); await audio.current.resume(); setSound(true);
    } catch { toast.error('Não foi possível ativar o som neste navegador.'); }
  }
  async function action(item: Round, minutes?: number) {
    if (busy || error) return;
    if (!minutes && !window.confirm(`Confirmar recolhimento ${item.assetNumber ? `do narguile #${item.assetNumber}` : 'do atendimento'} da Mesa ${item.comanda.number}?`)) return;
    setBusy(item.id);
    try {
      await api.post(`/v1/comandas/${item.comanda.id}/items/${item.id}/${minutes ? 'timer/snooze' : 'return-asset'}`,
        minutes ? { extraMinutes: minutes, expectedDueAt: item.timerDueAt } : {});
      toast.success(minutes ? 'Ronda prorrogada.' : 'Equipamento recolhido e liberado.');
      await load(true);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Não foi possível atualizar a ronda.'); await load(true); }
    finally { setBusy(null); }
  }
  const overdueCount = items.filter(i => i.timerDueAt && new Date(i.timerDueAt).getTime() <= now + offset).length;
  useEffect(() => { if (overdueCount > 0) setExpanded(true); }, [overdueCount]);
  return <section className="shrink-0 border-b border-amber-500/20 bg-amber-950/20 px-4 py-3">
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary className="font-bold text-sm text-amber-300 cursor-pointer">Rondas & Narguiles ({items.length}){overdueCount > 0 ? ` · ${overdueCount} para atender` : ''}</summary>
      <button onClick={toggleSound} className="my-2 rounded-lg border border-amber-500/30 px-3 py-2 text-xs">{sound ? 'Desativar som das rondas' : 'Ativar som das rondas'}</button>
      {error && <p role="alert" className="text-red-300 text-sm">Rondas desatualizadas. Aguarde a conexão.</p>}
      <div className="max-h-64 overflow-y-auto space-y-2">
        {items.map(item => {
          const remaining = item.timerDueAt ? Math.ceil((new Date(item.timerDueAt).getTime() - now - offset) / 60000) : null;
          const overdue = remaining != null && remaining <= 0;
          const delivered = item.kdsStatus === 'DELIVERED';
          return <article key={item.id} className={`rounded-xl border p-3 ${overdue ? 'border-amber-400 bg-amber-500/15' : 'border-zinc-700 bg-zinc-900'}`}>
            <p className="text-sm font-bold">Mesa {item.comanda.number}{item.assetNumber != null ? ` — Narguile #${String(item.assetNumber).padStart(2, '0')}` : ''}</p>
            <p className="text-xs text-zinc-400">{item.product.name}</p>
            <p className={`text-sm mt-1 ${overdue ? 'text-amber-300 font-bold' : ''}`}>
              {overdue ? 'Hora da ronda — atender a mesa' : remaining != null ? `${remaining} min restantes` : delivered ? 'Em uso · sem alerta de tempo' : 'Aguardando entrega — ronda ainda não iniciada'}
            </p>
            {item.timerDueAt && <progress className="w-full h-1 accent-amber-400" max={100}
              value={Math.max(0, Math.min(100, 100 * (now + offset - new Date(item.timerStartedAt!).getTime()) / (new Date(item.timerDueAt).getTime() - new Date(item.timerStartedAt!).getTime())))} />}
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              {item.timerDueAt && [15, 30].map(minutes => <button key={minutes} disabled={!!busy || error} onClick={() => action(item, minutes)} className="rounded-lg bg-zinc-800 p-2 disabled:opacity-40">+{minutes} min</button>)}
              <button disabled={!!busy || error || item.comanda.status !== 'open'} onClick={() => onNewRosh(item.comanda.id)} className="rounded-lg bg-orange-600 p-2 disabled:opacity-40">Novo Rosh</button>
              <button disabled={!!busy || error || !delivered} onClick={() => action(item)} className="rounded-lg bg-emerald-800 p-2 disabled:opacity-40">Recolher / liberar</button>
            </div>
          </article>;
        })}
        {!items.length && <p className="text-xs text-zinc-400">Nenhum atendimento ativo.</p>}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Mantenha esta tela aberta para ouvir os alertas.</p>
    </details>
  </section>;
}
