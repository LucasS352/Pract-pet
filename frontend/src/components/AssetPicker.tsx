import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function AssetPicker({ productId, value, onChange, revision = 0 }: {
  productId: string; value?: number; onChange: (value: number | undefined) => void; revision?: number;
}) {
  const [data, setData] = useState<{ total: number; occupied: Array<{ assetNumber: number; comanda: { number: string } }> } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { onChange(undefined); }, [productId, onChange]);
  useEffect(() => {
    let active = true, loading = false;
    setData(null);
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const res = await api.get(`/v1/comandas/assets/${productId}`, { timeout: 10000 });
        if (active) { setData(res.data); setError(''); }
      } catch { if (active) setError('Não foi possível atualizar os equipamentos. Aguarde ou reabra o produto.'); }
      finally { loading = false; }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [productId, revision]);
  return <fieldset className="rounded-xl border border-amber-500/30 p-3">
    <legend className="text-sm font-bold text-amber-300">Escolha o narguile</legend>
    <p className="text-xs text-zinc-400 mb-3">Uma unidade por lançamento. A reserva é confirmada ao lançar.</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {!data && !error && <p className="text-sm">Consultando equipamentos…</p>}
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-52 overflow-y-auto">
      {Array.from({ length: data?.total || 0 }, (_, i) => i + 1).map(number => {
        const occupied = data?.occupied.find(item => item.assetNumber === number);
        return <button type="button" key={number} disabled={!!occupied || !!error} aria-pressed={value === number}
          onClick={() => onChange(number)}
          className={`min-h-12 rounded-lg border p-2 text-sm font-bold ${occupied ? 'border-red-500/30 bg-red-950/40 text-red-300' : value === number ? 'bg-emerald-400 border-white text-zinc-950 ring-2 ring-emerald-200' : 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'} disabled:opacity-60`}>
          #{String(number).padStart(2, '0')}
          {occupied && <span className="block text-[10px]">Mesa {occupied.comanda.number}</span>}
        </button>;
      })}
    </div>
  </fieldset>;
}
