import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const labels: Record<string, string> = { WAITER: 'Garçons', KITCHEN: 'Cozinha', BAR: 'Bar', BAR_1: 'Bar 1', BAR_2: 'Bar 2', SERVICE: 'Separar / servir', CARVOARIA: 'Carvoaria' };
export function StationAccessLinks() {
  const [stations, setStations] = useState<string[]>([]);
  const [links, setLinks] = useState<{ id: string; station: string }[]>([]);
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/auth/access/config').then(async res => {
      setStations(res.data.stations);
      if (res.data.stations.length) setLinks((await api.get('/auth/access/links')).data);
    }).catch(() => setError('Não foi possível carregar os links de acesso.'));
  }, []);
  if (!stations.length) return error ? <p role="alert">{error}</p> : null;
  async function create(station: string) {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/access/links', { station });
      setCreated({ id: data.id, url: `${location.origin}/acesso#${data.token}` });
      setLinks((await api.get('/auth/access/links')).data);
      setError('');
    } catch { toast.error('Não foi possível gerar o link. Verifique a atualização dos bancos no Sys-Init.'); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      await api.delete(`/auth/access/links/${id}`);
      setLinks(old => old.filter(link => link.id !== id));
      if (created?.id === id) setCreated(null);
      toast.success('Link revogado. Os dispositivos vinculados perderam o acesso.');
    } catch { toast.error('Não foi possível revogar o link.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
    <h2 className="text-lg font-bold">Acesso dos dispositivos</h2>
    <p className="text-sm text-zinc-400">Envie o link ao tablet ou celular do setor. Garçons entram com seu PIN; estações abrem direto no KDS. O caixa continua com o acesso por usuário.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <div className="flex flex-wrap gap-2">{stations.map(station => <button key={station} disabled={busy} onClick={() => create(station)} className="rounded-xl bg-blue-600 px-4 py-2 disabled:opacity-50">Gerar link: {labels[station]}</button>)}</div>
    {created && <div className="space-y-2"><p className="text-sm text-amber-300">Copie agora: o link completo é exibido somente nesta sessão.</p><input aria-label="Link de acesso gerado" readOnly value={created.url} onFocus={e => e.target.select()} className="w-full rounded-lg bg-zinc-950 p-3" /><button className="text-blue-400" onClick={() => navigator.clipboard.writeText(created.url).then(() => toast.success('Link copiado.')).catch(() => toast.error('Selecione e copie o link acima.'))}>Copiar link</button></div>}
    {links.map(link => <div key={link.id} className="flex justify-between gap-3 border-t border-zinc-800 pt-3"><span>{labels[link.station] || link.station} · {link.id.slice(0, 8)}{!stations.includes(link.station) && ' (módulo desativado)'}</span><button disabled={busy} onClick={() => revoke(link.id)} className="text-red-400">Revogar</button></div>)}
  </section>;
}
