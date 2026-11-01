import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { KdsTicket, waitsForKitchen } from '@/lib/kds';

export function KdsReadyOrders({ onDelivered }: { onDelivered: () => void }) {
  const [items, setItems] = useState<KdsTicket[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<KdsTicket | null>(null);
  const version = useRef(0);
  const load = useCallback(async () => {
    const request = ++version.current;
    try {
      const res = await api.get('/v1/kds/tickets', { timeout: 10000 });
      if (request === version.current) {
        setItems(res.data);
        setError(false);
      }
    } catch {
      if (request === version.current) setError(true);
    }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => {
      clearInterval(timer);
      version.current++;
    };
  }, [load]);
  const ready = items.filter((i) => i.kdsStatus === 'READY');
  async function deliver() {
    if (!confirm || busy) return;
    setBusy(true);
    version.current++;
    try {
      await api.patch('/v1/kds/status', {
        itemIds: [confirm.id],
        status: 'DELIVERED',
      });
      setItems((current) => current.filter((i) => i.id !== confirm.id));
      setConfirm(null);
      onDelivered();
      await load();
      toast.success('Entrega confirmada. A comanda continua disponível.');
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || 'Não foi possível confirmar a entrega.',
      );
      setConfirm(null);
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="shrink-0 border-b border-emerald-500/20 bg-emerald-950/20 px-4 py-3">
      <details>
        <summary className="cursor-pointer text-sm font-bold text-emerald-300">
          <BellRing size={15} className="inline mr-2" />
          Prontos para levar ({ready.length})
        </summary>
        {error && (
          <p role="alert" className="text-xs text-red-300 mt-2">
            Não foi possível atualizar a fila. Aguarde a conexão.
          </p>
        )}
        <div className="max-h-56 overflow-y-auto space-y-2 mt-3">
          {ready.map((item) => {
            const waiting = waitsForKitchen(item, items);
            return (
              <div
                key={item.id}
                className="rounded-xl bg-zinc-900 p-3 border border-zinc-800"
              >
                <p className="text-sm font-bold">
                  Mesa {item.comanda.number} · {Number(item.quantity)}×{' '}
                  {item.product.name}
                  {item.assetNumber != null && <strong className="ml-2 text-amber-300">Narguile #{String(item.assetNumber).padStart(2, '0')}</strong>}
                </p>
                <p className="text-xs text-zinc-400">
                  {item.createdBy?.name || item.comanda.responsibleWaiter?.name}
                  {item.notes ? ` · ${item.notes}` : ''}
                </p>
                <button
                  disabled={busy || error || waiting}
                  onClick={() => setConfirm(item)}
                  className="mt-2 w-full rounded-lg bg-emerald-500 py-2.5 text-xs font-bold text-zinc-950 disabled:opacity-40"
                >
                  <CheckCircle2 size={14} className="inline mr-1" />
                  {waiting
                    ? 'Aguardando comida para servir junto'
                    : 'Confirmar entrega'}
                </button>
              </div>
            );
          })}
          {!ready.length && !error && (
            <p className="text-xs text-zinc-400">
              Nenhum pedido pronto no momento.
            </p>
          )}
        </div>
      </details>
      {confirm && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-title"
            className="max-w-sm w-full rounded-2xl bg-zinc-900 p-5 border border-zinc-700"
          >
            <h2 id="delivery-title" className="font-bold">
              Confirmar entrega na Mesa {confirm.comanda.number}?
            </h2>
            <p className="text-sm text-zinc-400 mt-2">
              {Number(confirm.quantity)}× {confirm.product.name}
            </p>
            <div className="flex gap-3 mt-5">
              <button
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="flex-1 py-3 bg-zinc-800 rounded-xl"
              >
                Voltar
              </button>
              <button
                disabled={busy}
                onClick={deliver}
                className="flex-1 py-3 bg-emerald-500 text-black font-bold rounded-xl"
              >
                {busy ? 'Salvando…' : 'Entregue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
