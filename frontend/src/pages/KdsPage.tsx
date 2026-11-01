import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  Play,
  Volume2,
  VolumeX,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useKdsConfig } from '@/hooks/useKdsEnabled';
import { KdsStatus, KdsTicket, waitsForKitchen } from '@/lib/kds';

const columns = [
  {
    status: 'PENDING',
    title: 'Pendentes',
    subtitle: 'Novos pedidos',
    action: 'Iniciar preparo',
    next: 'PREPARING',
    color: '#fb6255',
    icon: Clock,
  },
  {
    status: 'PREPARING',
    title: 'Em preparo',
    subtitle: 'Sendo preparados',
    action: 'Marcar como pronto',
    next: 'READY',
    color: '#fbbf24',
    icon: ChefHat,
  },
  {
    status: 'READY',
    title: 'Prontos',
    subtitle: 'Aguardando retirada',
    action: 'Confirmar entrega',
    next: 'DELIVERED',
    color: '#4ade80',
    icon: CheckCircle2,
  },
] as const;

export function KdsPage() {
  const assignedStation = useAuthStore(state => state.user?.station);
  const { stations } = useKdsConfig();
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [station, setStation] = useState(assignedStation || new URLSearchParams(location.search).get('station') || 'ALL');
  const [filter, setFilter] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(false);
  const [confirm, setConfirm] = useState<{
    ids: string[];
    status: KdsStatus;
    label: string;
  } | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const fetching = useRef(false);
  const version = useRef(0);
  const soundRef = useRef(false);
  const mounted = useRef(true);
  const fetchTickets = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const request = ++version.current;
    try {
      const res = await api.get('/v1/kds/tickets', { timeout: 10000 });
      if (!mounted.current || request !== version.current) return;
      const list: KdsTicket[] = res.data;
      if (
        seen.current &&
        list.some(
          (i) => i.kdsStatus === 'PENDING' && !seen.current!.has(i.id),
        ) &&
        soundRef.current &&
        audio.current?.state === 'running'
      ) {
        const oscillator = audio.current.createOscillator();
        const gain = audio.current.createGain();
        oscillator.connect(gain);
        gain.connect(audio.current.destination);
        gain.gain.value = 0.12;
        oscillator.frequency.value = 740;
        oscillator.start();
        oscillator.stop(audio.current.currentTime + 0.18);
      }
      seen.current = new Set(list.map((i) => i.id));
      setTickets(list);
      setUpdated(new Date());
      setError('');
    } catch (err: any) {
      if (mounted.current && request === version.current)
        setError(
          err?.response?.data?.message ||
            'Sem conexão. A fila exibida pode estar desatualizada.',
        );
    } finally {
      if (request === version.current) fetching.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    fetchTickets();
    const interval = setInterval(() => {
      setNow(Date.now());
      fetchTickets();
    }, 5000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [fetchTickets]);
  useEffect(
    () => () => {
      audio.current?.close();
    },
    [],
  );

  async function advance() {
    if (!confirm || busy) return;
    setBusy(true);
    version.current++;
    try {
      await api.patch('/v1/kds/status', {
        itemIds: confirm.ids,
        status: confirm.status,
      });
      setConfirm(null);
      // Aguarda a leitura em andamento antes de buscar o resultado da mutação.
      fetching.current = false;
      await fetchTickets();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || 'Não foi possível atualizar o pedido.',
      );
      setConfirm(null);
    } finally {
      fetching.current = false;
      setBusy(false);
    }
  }

  const visible = tickets.filter(
    (i) => station === 'ALL' || i.kdsDestination === station,
  );
  return (
    <main className="min-h-screen bg-[#090f14] text-slate-100 p-3 sm:p-5 lg:p-7">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {!assignedStation && <Link
            to="/dashboard"
            aria-label="Voltar ao painel"
            className="p-2 rounded-xl bg-slate-800"
          >
            <ArrowLeft size={20} />
          </Link>}
          {assignedStation && <button className="text-sm text-slate-400" onClick={() => useAuthStore.getState().logout()}>Sair do dispositivo</button>}
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ChefHat className="text-amber-400" /> PDV · Produção
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Cozinha, bar e retirada de pedidos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Destino de preparo"
            value={station}
            onChange={(e) => setStation(e.target.value)}
            className="rounded-xl bg-slate-800 border border-slate-700 p-3 text-sm"
          >
            {!assignedStation && <option value="ALL">Todos os destinos</option>}
            {stations.includes('KITCHEN') && <option value="KITCHEN">Cozinha</option>}
            {stations.includes('BAR') && <option value="BAR">Bar</option>}
            {stations.includes('BAR_1') && <option value="BAR_1">Bar 1</option>}
            {stations.includes('BAR_2') && <option value="BAR_2">Bar 2</option>}
            {stations.includes('SERVICE') && <option value="SERVICE">Bebidas / acompanhamento</option>}
            {stations.includes('CARVOARIA') && <option value="CARVOARIA">Carvoaria</option>}
          </select>
          <button
            aria-label={sound ? 'Desativar som' : 'Ativar som'}
            onClick={async () => {
              try {
                if (!audio.current || audio.current.state === 'closed')
                  audio.current = new AudioContext();
                await audio.current.resume();
                soundRef.current = !sound;
                setSound(!sound);
              } catch {
                toast.error('Som indisponível neste dispositivo.');
              }
            }}
            className="p-3 bg-slate-800 rounded-xl"
          >
            {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            onClick={fetchTickets}
            aria-label="Atualizar fila"
            className="p-3 bg-slate-800 rounded-xl"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-500/40 bg-red-950/50 p-4 text-red-200"
        >
          {error}
        </div>
      )}
      <nav
        aria-label="Filtrar status"
        className="flex gap-2 overflow-x-auto pb-4 mb-2"
      >
        {[{ status: 'ALL', title: 'Todos' }, ...columns].map((c) => (
          <button
            key={c.status}
            onClick={() => setFilter(c.status)}
            aria-pressed={filter === c.status}
            className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold border ${filter === c.status ? 'bg-slate-700 border-slate-500' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
          >
            {c.title}
            <span className="rounded-lg bg-white/10 px-2">
              {
                visible.filter(
                  (i) => c.status === 'ALL' || i.kdsStatus === c.status,
                ).length
              }
            </span>
          </button>
        ))}
      </nav>
      {!updated && !error && (
        <p role="status" className="p-8 text-slate-400">
          Carregando pedidos…
        </p>
      )}
      <div
        className={`grid gap-4 ${filter === 'ALL' ? 'lg:grid-cols-3' : 'max-w-3xl mx-auto'}`}
      >
        {columns
          .filter((c) => filter === 'ALL' || c.status === filter)
          .map((column) => {
            const items = visible.filter((i) => i.kdsStatus === column.status);
            const groups = new Map<string, KdsTicket[]>();
            for (const item of items) {
              const key = `${item.comandaId}:${item.kdsDestination}:${item.serveImmediately}`;
              groups.set(key, [...(groups.get(key) || []), item]);
            }
            return (
              <section
                key={column.status}
                className="rounded-2xl border border-slate-800/70 p-3 bg-[#0d141a] min-h-64"
              >
                <div
                  className="flex gap-3 items-center mb-4"
                  style={{ color: column.color }}
                >
                  <column.icon size={25} />
                  <div>
                    <h2 className="font-bold">
                      {column.title} ({items.length})
                    </h2>
                    <p className="text-xs text-slate-400">{column.subtitle}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[...groups.entries()].map(([key, group]) => {
                    const first = group[0];
                    const minutes = Math.max(
                      0,
                      Math.floor(
                        (now - new Date(first.kdsSentAt).getTime()) / 60000,
                      ),
                    );
                    const waiting =
                      column.status === 'READY' &&
                      group.some((i) => waitsForKitchen(i, tickets));
                    const companions =
                      first.kdsDestination === 'KITCHEN'
                        ? tickets.filter(
                            (i) =>
                              i.comandaId === first.comandaId &&
                              i.kdsDestination !== 'KITCHEN' &&
                              i.kdsDestination !== 'CARVOARIA' &&
                              !i.serveImmediately,
                          )
                        : [];
                    const stationName =
                      first.kdsDestination === 'KITCHEN'
                        ? 'Cozinha'
                        : ['BAR', 'BAR_1', 'BAR_2'].includes(first.kdsDestination)
                          ? ({ BAR: 'Bar', BAR_1: 'Bar 1', BAR_2: 'Bar 2' } as Record<string, string>)[first.kdsDestination]
                          : first.kdsDestination === 'CARVOARIA' ? 'Carvoaria' : 'Separar / servir';
                    return (
                      <article
                        key={key}
                        className="rounded-xl border border-slate-700/40 bg-gradient-to-br from-[#202932] to-[#131c24] p-3 shadow-lg"
                        style={{ borderLeft: `5px solid ${column.color}` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-lg">
                              Mesa {first.comanda.number}
                            </h3>
                            <p className="text-xs text-slate-400">
                              {stationName} ·{' '}
                              {first.comanda.responsibleWaiter?.name ||
                                first.createdBy?.name ||
                                'Sem garçom'}
                            </p>
                          </div>
                          <span
                            className={`flex items-center gap-1 text-xs font-bold whitespace-nowrap ${minutes < 10 ? 'text-green-400' : minutes < 20 ? 'text-amber-400' : 'text-red-400'}`}
                          >
                            <Clock size={15} />
                            {minutes} min
                          </span>
                        </div>
                        <ul className="my-3 space-y-3 rounded-lg bg-black/10 p-2">
                          {group.map((item) => (
                            <li key={item.id}>
                              <div className="text-sm font-semibold">
                                {Number(item.quantity)}× {item.product.name}
                                {item.assetNumber != null && <strong className="ml-2 text-amber-300">Narguile #{String(item.assetNumber).padStart(2, '0')}</strong>}
                              </div>
                              {item.product.preparationIngredients?.trim() && (
                                <div className="mt-2 rounded-lg border border-slate-700/50 bg-black/10 px-3 py-2">
                                  <p className="text-xs font-semibold text-slate-300">
                                    Ingredientes
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">
                                    {item.product.preparationIngredients.trim()}
                                  </p>
                                </div>
                              )}
                              {item.notes && (
                                <p className="text-xs text-amber-100 mt-1 whitespace-pre-wrap">
                                  {item.notes}
                                </p>
                              )}
                              {item.modifiers?.map((m) => (
                                <p
                                  key={m.id}
                                  className="text-xs text-slate-400"
                                >
                                  {m.name}
                                </p>
                              ))}
                              {item.kdsDestination !== 'KITCHEN' && (
                                <p
                                  className={`text-xs mt-1 ${item.serveImmediately ? 'text-orange-300' : 'text-sky-300'}`}
                                >
                                  {item.serveImmediately
                                    ? 'Servir agora'
                                    : 'Servir junto com a comida'}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                        {companions.length > 0 && (
                          <div className="mb-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2">
                            <p className="text-xs font-bold text-sky-300 mb-1">
                              Para servir junto · acompanhamento da mesa
                            </p>
                            {companions.map((item) => (
                              <p key={item.id} className="text-xs text-sky-200">
                                {Number(item.quantity)}× {item.product.name}{' '}
                                <span className="text-slate-400">
                                  ·{' '}
                                  {item.kdsStatus === 'READY'
                                    ? 'separado'
                                    : 'aguardando bar'}
                                </span>
                              </p>
                            ))}
                          </div>
                        )}
                        {waiting && (
                          <p className="text-xs text-sky-300 mb-2">
                            Aguardando a comida da mesa ficar pronta.
                          </p>
                        )}
                        <button
                          disabled={busy || !!error || waiting}
                          onClick={() =>
                            setConfirm({
                              ids: group.map((i) => i.id),
                              status: column.next,
                              label: `${column.action} · Mesa ${first.comanda.number}`,
                            })
                          }
                          className="w-full flex justify-center items-center gap-2 rounded-lg py-3 text-sm font-bold text-slate-950 disabled:opacity-40"
                          style={{ background: column.color }}
                        >
                          {column.status === 'PENDING' ? (
                            <Play size={16} />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                          {column.action}
                        </button>
                      </article>
                    );
                  })}
                  {updated && !items.length && (
                    <p className="text-center text-sm text-slate-500 py-16">
                      Nenhum pedido nesta etapa
                    </p>
                  )}
                </div>
              </section>
            );
          })}
      </div>
      <footer className="mt-5 flex items-center gap-2 text-xs text-slate-500">
        <span
          className={`w-2 h-2 rounded-full ${error ? 'bg-red-400' : updated ? 'bg-green-400' : 'bg-amber-400'}`}
        />
        {error ? 'Conexão interrompida' : updated ? 'KDS online' : 'Conectando'}{' '}
        · Última atualização: {updated?.toLocaleTimeString('pt-BR') || '—'} ·
        Atualiza a cada 5 segundos
      </footer>
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kds-confirm"
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6"
          >
            <h2 id="kds-confirm" className="font-bold text-lg">
              {confirm.label}?
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              {confirm.ids.length} item(ns). A comanda permanece no fluxo do
              caixa.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="flex-1 p-3 rounded-xl bg-slate-800"
              >
                Voltar
              </button>
              <button
                disabled={busy}
                onClick={advance}
                className="flex-1 p-3 rounded-xl bg-amber-400 text-slate-950 font-bold"
              >
                {busy ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
