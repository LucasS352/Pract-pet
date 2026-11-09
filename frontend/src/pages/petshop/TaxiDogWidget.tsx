import { useMemo, useState } from 'react';
import {
  Car,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Hourglass,
  MapPin,
  MessageCircle,
  Navigation,
  Printer,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Appointment } from './types';
import { PetAvatar } from './ui';

interface TaxiDogWidgetProps {
  appointments: Appointment[];
  onSelectAppointment?: (item: Appointment) => void;
  onChangeStatus?: (item: Appointment, newStatus: string) => void | Promise<void>;
  title?: string;
  subtitle?: string;
  className?: string;
  variant?: 'sidebar' | 'dashboard';
  dateLabel?: string;
}

export function TaxiDogWidget({
  appointments,
  onSelectAppointment,
  onChangeStatus,
  title = 'Táxi Dog · Coletas & Entregas',
  subtitle,
  className = '',
  dateLabel,
}: TaxiDogWidgetProps) {
  const [filterTab, setFilterTab] = useState<'pickup' | 'dropoff' | 'all'>('all');
  const [manifestFilter, setManifestFilter] = useState<'all' | 'pickup' | 'in_store' | 'ready'>('all');
  const [openManifestModal, setOpenManifestModal] = useState(false);
  const [checkedStops, setCheckedStops] = useState<Record<string, boolean>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Helpers de modalidade e fase do ciclo de vida do Táxi Dog
  const isPickupMode = (mode?: string | null) =>
    mode === 'pickup_only' || mode === 'pickup' || mode === 'round_trip' || mode === 'both';

  const isDropoffMode = (mode?: string | null) =>
    mode === 'dropoff_only' || mode === 'dropoff' || mode === 'round_trip' || mode === 'both';

  const isPreCheckinStatus = (status: string) =>
    status === 'scheduled' || status === 'confirmed' || status === 'requested';

  const isInStoreStatus = (status: string) =>
    status === 'checked_in' ||
    status === 'in_progress' ||
    status === 'bathing' ||
    status === 'drying' ||
    status === 'grooming' ||
    status === 'finishing';

  // Filtra apenas agendamentos ativos (não cancelados) com transporte ativo
  const transportItems = useMemo(() => {
    return appointments
      .filter(item => Boolean(item.transport?.enabled) && item.status !== 'cancelled')
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [appointments]);

  // 1. FALTA BUSCAR: Apenas agendamentos com coleta que AINDA NÃO FIZERAM CHECK-IN
  // Assim que o motorista/recepção dá Check-in, o pet sai imediatamente desta lista!
  const pendingPickups = useMemo(() => {
    return transportItems.filter(
      item => isPickupMode(item.transport?.mode) && isPreCheckinStatus(item.status),
    );
  }, [transportItems]);

  // 2. JÁ COLETADOS / NA LOJA (Check-in feito, em banho/tosa aguardando finalizar para levar)
  const inStoreWaitingDropoff = useMemo(() => {
    return transportItems.filter(
      item => isDropoffMode(item.transport?.mode) && isInStoreStatus(item.status),
    );
  }, [transportItems]);

  // 3. PRONTOS PARA LEVAR AGORA (Finalizados na loja, aguardando motorista levar)
  const readyDropoffs = useMemo(() => {
    return transportItems.filter(
      item => isDropoffMode(item.transport?.mode) && item.status === 'ready',
    );
  }, [transportItems]);

  // 4. FILA DA ABA "LEVAR": Todos que terão entrega (e ainda não foram entregues),
  // priorizando no topo quem já está PRONTO P/ LEVAR, depois quem JÁ FEZ CHECK-IN (aguardando finalizar)
  const dropoffQueue = useMemo(() => {
    const list = transportItems.filter(
      item => isDropoffMode(item.transport?.mode) && item.status !== 'delivered',
    );
    const priorityScore = (status: string) => {
      if (status === 'ready') return 1; // 1º: Pronto para levar agora!
      if (isInStoreStatus(status)) return 2; // 2º: Já coletado (Check-in), aguardando finalizar banho
      return 3; // 3º: Ainda nem foi coletado
    };
    return [...list].sort((a, b) => {
      const diff = priorityScore(a.status) - priorityScore(b.status);
      if (diff !== 0) return diff;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }, [transportItems]);

  // Itens exibidos conforme a aba selecionada no widget
  const displayedItems = useMemo(() => {
    if (filterTab === 'pickup') return pendingPickups;
    if (filterTab === 'dropoff') return dropoffQueue;
    return transportItems;
  }, [filterTab, transportItems, pendingPickups, dropoffQueue]);

  // Itens exibidos no modal de Manifesto conforme filtro interno
  const manifestDisplayedItems = useMemo(() => {
    if (manifestFilter === 'pickup') return pendingPickups;
    if (manifestFilter === 'in_store') return inStoreWaitingDropoff;
    if (manifestFilter === 'ready') return readyDropoffs;
    return transportItems;
  }, [manifestFilter, transportItems, pendingPickups, inStoreWaitingDropoff, readyDropoffs]);

  const handleQuickStatusChange = async (item: Appointment, nextStatus: string) => {
    if (updatingId) return;
    setUpdatingId(item.id);
    try {
      if (onChangeStatus) {
        await onChangeStatus(item, nextStatus);
      } else {
        await api.patch(`/petshop/appointments/${item.id}/status`, { status: nextStatus });
        toast.success(
          nextStatus === 'checked_in'
            ? `Check-in confirmado! ${item.pet?.name} já consta como coletado na loja.`
            : `Status de ${item.pet?.name} atualizado!`,
        );
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Não foi possível atualizar o status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const copyAddress = (address: string, petName?: string) => {
    if (!address) {
      toast.error('Endereço não informado para este cliente.');
      return;
    }
    navigator.clipboard.writeText(address);
    toast.success(`Endereço de ${petName || 'cliente'} copiado!`);
  };

  const openGoogleMaps = (address: string) => {
    if (!address) {
      toast.error('Endereço não cadastrado.');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openWhatsAppDriver = (item: Appointment, type: 'pickup' | 'dropoff') => {
    const rawPhone = item.customer?.phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (!cleanPhone) {
      toast.error('Telefone do tutor não cadastrado.');
      return;
    }
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const tutorName = item.customer?.name || 'Tutor';
    const petName = item.pet?.name || 'Pet';
    const street = item.transport?.street || item.transport?.address || item.customer?.address || '';
    const neighborhood = item.transport?.neighborhood || '';
    const reference = item.transport?.reference || item.customer?.reference || '';
    const fullAddr = [street, neighborhood ? `Bairro ${neighborhood}` : ''].filter(Boolean).join(' - ');
    const refText = reference ? ` (Ref: ${reference})` : '';
    const locText = fullAddr ? ` no endereço: ${fullAddr}${refText}` : '';

    const text =
      type === 'dropoff'
        ? `Olá ${tutorName}! Aqui é da equipe do Pet Shop. O(a) ${petName} já está cheiroso(a) e pronto(a)! Estamos saindo agora no Táxi Dog para levá-lo(a) para casa${locText}.`
        : `Olá ${tutorName}! Aqui é da equipe de transporte do Pet Shop. Estamos a caminho para buscar o(a) ${petName}${locText}. Pode confirmar se está tudo pronto?`;

    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const selectedRouteItems = useMemo(
    () => transportItems.filter(item => Boolean(checkedStops[item.id])),
    [transportItems, checkedStops],
  );

  const openMultiStopGoogleMaps = () => {
    if (selectedRouteItems.length === 0) {
      toast.error('Marque (flegue) pelo menos 1 endereço na lista para montar a rota.');
      return;
    }

    const addresses = selectedRouteItems
      .map(item => {
        const street = item.transport?.street || item.transport?.address || item.customer?.address || '';
        const neighborhood = item.transport?.neighborhood || '';
        return [street, neighborhood].filter(Boolean).join(', ').trim();
      })
      .filter(Boolean);

    if (addresses.length === 0) {
      toast.error('Os agendamentos selecionados não possuem endereço cadastrado.');
      return;
    }

    if (addresses.length === 1) {
      const dest = encodeURIComponent(addresses[0]);
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
        '_blank',
        'noopener,noreferrer',
      );
      toast.success('Abrindo rota no Google Maps (1 parada)!');
      return;
    }

    const destination = encodeURIComponent(addresses[addresses.length - 1]);
    const waypoints = encodeURIComponent(addresses.slice(0, -1).join('|'));
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success(`Rota inteligente montada com ${addresses.length} paradas no Google Maps!`);
  };

  const formatTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(iso),
      );
    } catch {
      return iso.slice(11, 16);
    }
  };

  const getModeInfo = (mode?: string) => {
    if (mode === 'pickup_only' || mode === 'pickup') {
      return {
        label: 'Só Buscar',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        icon: '📥',
      };
    }
    if (mode === 'dropoff_only' || mode === 'dropoff') {
      return {
        label: 'Só Levar',
        badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
        icon: '📤',
      };
    }
    return {
      label: 'Buscar e Levar',
      badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
      icon: '🚐',
    };
  };

  // Badge principal no canto superior direito do card
  const getTransportStatusBadge = (item: Appointment) => {
    const mode = item.transport?.mode;
    const hasPickup = isPickupMode(mode);
    const hasDropoff = isDropoffMode(mode);

    if (item.status === 'delivered') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
          <CheckCircle2 size={10} /> Entregue
        </span>
      );
    }

    if (item.status === 'ready' && hasDropoff) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 border border-emerald-700 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-2xs animate-pulse">
          <Truck size={10} /> Pronto p/ Levar!
        </span>
      );
    }

    if (isPreCheckinStatus(item.status) && hasPickup) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
          <Clock size={10} /> Falta Buscar
        </span>
      );
    }

    if (isInStoreStatus(item.status)) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-300 px-1.5 py-0.5 text-[10px] font-bold text-teal-900">
          <Check size={10} className="text-teal-700" /> Check-in Feito
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
        Na Loja
      </span>
    );
  };

  // Faixa de Rastreio Operacional (mostra claramente o que já foi feito e o que falta fazer)
  const renderTransportStepTracker = (item: Appointment) => {
    const mode = item.transport?.mode;
    const hasPickup = isPickupMode(mode);
    const hasDropoff = isDropoffMode(mode);
    const preCheckin = isPreCheckinStatus(item.status);
    const inStore = isInStoreStatus(item.status);
    const ready = item.status === 'ready';
    const delivered = item.status === 'delivered';

    if (delivered) {
      return (
        <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2 py-1 text-[10px] font-bold text-emerald-900">
          <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
          <span>Transporte finalizado · Pet entregue ao tutor</span>
        </div>
      );
    }

    // Caso 1: Falta buscar (antes do check-in)
    if (preCheckin && hasPickup) {
      return (
        <div className="mb-1.5 flex flex-wrap items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1 text-[10px]">
          <span className="font-extrabold text-amber-900 flex items-center gap-1">
            <Clock size={11} className="text-amber-700 shrink-0" />
            1. Coleta Pendente: buscar no endereço
          </span>
          {hasDropoff && (
            <span className="text-amber-700/80 font-medium">• 2. Levar após banho</span>
          )}
        </div>
      );
    }

    // Caso 2: Já coletado (Check-in feito / Em atendimento na loja)
    if (inStore) {
      if (hasPickup && hasDropoff) {
        return (
          <div className="mb-1.5 flex flex-wrap items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/70 px-2 py-1 text-[10px]">
            <span className="inline-flex items-center gap-0.5 font-extrabold text-teal-900">
              <CheckCircle2 size={11} className="text-teal-600 shrink-0" />
              Coletado (Check-in)
            </span>
            <span className="text-teal-400">•</span>
            <span className="inline-flex items-center gap-1 font-semibold text-sky-900">
              <Hourglass size={10} className="text-sky-600 shrink-0" />
              Aguardando finalizar p/ levar
            </span>
          </div>
        );
      }
      if (hasPickup && !hasDropoff) {
        return (
          <div className="mb-1.5 flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/70 px-2 py-1 text-[10px] font-bold text-teal-900">
            <CheckCircle2 size={11} className="text-teal-600 shrink-0" />
            <span>Coletado (Check-in feito) · Somente busca concluída</span>
          </div>
        );
      }
      return (
        <div className="mb-1.5 flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50/70 px-2 py-1 text-[10px] font-bold text-sky-900">
          <Hourglass size={11} className="text-sky-600 shrink-0" />
          <span>Check-in na loja · Aguardando finalizar p/ levar</span>
        </div>
      );
    }

    // Caso 3: Pronto para levar agora!
    if (ready && hasDropoff) {
      return (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-100/90 px-2 py-1 text-[10px]">
          {hasPickup && (
            <span className="inline-flex items-center gap-0.5 font-bold text-emerald-800">
              <Check size={11} /> Coletado
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-extrabold text-emerald-950">
            <Truck size={12} className="text-emerald-700 shrink-0" />
            PRONTO! Levar para o cliente agora
          </span>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={`rounded-2xl border border-amber-200/90 bg-gradient-to-b from-amber-50/40 via-white to-white p-4 shadow-xs ${className}`}
    >
      {/* 1. Cabeçalho do Card */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-amber-900 shrink-0 shadow-2xs">
            <Car size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-zinc-900 truncate flex items-center gap-1.5">
              <span>{title}</span>
              {transportItems.length > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-extrabold text-white">
                  {transportItems.length}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-zinc-500 truncate">
              {subtitle ||
                (dateLabel ? `Agendados para ${dateLabel}` : 'Controle de coletas, check-in e entregas')}
            </p>
          </div>
        </div>

        {transportItems.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenManifestModal(true)}
            title="Ver manifesto e montar rota no Google Maps"
            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer shadow-2xs shrink-0"
          >
            <Navigation size={12} />
            <span>Rota</span>
          </button>
        )}
      </div>

      {/* 2. Três Indicadores Operacionais Clicáveis (Falta Buscar | Coletados na Loja | Prontos p/ Levar) */}
      {transportItems.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setFilterTab('pickup')}
            title="Filtrar pets que ainda precisam ser buscados"
            className={`rounded-xl border p-1.5 text-center transition cursor-pointer ${
              filterTab === 'pickup'
                ? 'border-amber-400 bg-amber-100/90 ring-1 ring-amber-400/40'
                : 'border-amber-200 bg-amber-50/70 hover:bg-amber-100/50'
            }`}
          >
            <span className="block text-sm font-extrabold text-amber-950 tabular-nums">
              {pendingPickups.length}
            </span>
            <span className="block text-[9px] font-bold text-amber-800 truncate">
              Falta buscar
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('dropoff')}
            title="Pets já coletados com Check-in feito, aguardando finalizar banho para levar"
            className="rounded-xl border border-teal-200 bg-teal-50/70 p-1.5 text-center hover:bg-teal-100/50 transition cursor-pointer"
          >
            <span className="block text-sm font-extrabold text-teal-950 tabular-nums">
              {inStoreWaitingDropoff.length}
            </span>
            <span className="block text-[9px] font-bold text-teal-800 truncate">
              Check-in / Loja
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('dropoff')}
            title="Pets prontos para o motorista levar agora"
            className={`rounded-xl border p-1.5 text-center transition cursor-pointer ${
              readyDropoffs.length > 0
                ? 'border-emerald-400 bg-emerald-100/90 ring-1 ring-emerald-400/40'
                : 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/50'
            }`}
          >
            <span className="block text-sm font-extrabold text-emerald-950 tabular-nums">
              {readyDropoffs.length}
            </span>
            <span className="block text-[9px] font-bold text-emerald-800 truncate">
              Prontos p/ levar
            </span>
          </button>
        </div>
      )}

      {/* 3. Abas de Filtro: Buscar (só pendentes), Levar (fila de entrega) e Todos */}
      {transportItems.length > 0 && (
        <div className="flex items-center gap-1 border-b border-zinc-100 pb-2 mb-2.5">
          <button
            type="button"
            onClick={() => setFilterTab('pickup')}
            className={`rounded-lg px-2 py-1 text-[11px] font-bold transition cursor-pointer flex-1 text-center ${
              filterTab === 'pickup'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            📥 Buscar ({pendingPickups.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('dropoff')}
            className={`rounded-lg px-2 py-1 text-[11px] font-bold transition cursor-pointer flex-1 text-center ${
              filterTab === 'dropoff'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            📤 Levar ({dropoffQueue.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`rounded-lg px-2 py-1 text-[11px] font-bold transition cursor-pointer ${
              filterTab === 'all'
                ? 'bg-zinc-800 text-white shadow-2xs'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            Todos ({transportItems.length})
          </button>
        </div>
      )}

      {/* 4. Lista de Atendimentos com Transporte */}
      {transportItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center">
          <Car size={24} className="mx-auto text-zinc-300 mb-1.5" />
          <p className="text-xs font-semibold text-zinc-700">Nenhum Táxi Dog no período</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Ao agendar ou contratar pacote, marque "Táxi Dog" para listar as coletas e entregas aqui.
          </p>
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-3.5 text-center">
          {filterTab === 'pickup' ? (
            <>
              <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-1" />
              <p className="text-xs font-bold text-zinc-700">Todas as coletas já foram feitas!</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Os pets já receberam Check-in e estão na aba <strong>"📤 Levar"</strong> aguardando finalização.
              </p>
              {dropoffQueue.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterTab('dropoff')}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-teal-800 cursor-pointer"
                >
                  Ver fila de entrega ({dropoffQueue.length}) →
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-zinc-400">Nenhum transporte pendente nesta aba.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
          {displayedItems.map(item => {
            const modeInfo = getModeInfo(item.transport?.mode);
            const address = item.transport?.address || item.customer?.address || '';
            const reference = item.transport?.reference || item.customer?.reference || '';
            const hasPickup = isPickupMode(item.transport?.mode);
            const hasDropoff = isDropoffMode(item.transport?.mode);
            const preCheckin = isPreCheckinStatus(item.status);
            const isReadyForDropoff = item.status === 'ready' && hasDropoff;
            const isBusy = updatingId === item.id;

            return (
              <div
                key={item.id}
                className={`group rounded-xl border p-2.5 shadow-2xs transition ${
                  isReadyForDropoff
                    ? 'border-emerald-300 bg-emerald-50/20 hover:border-emerald-400'
                    : preCheckin
                      ? 'border-amber-200/90 bg-white hover:border-amber-300'
                      : 'border-zinc-200/90 bg-white hover:border-teal-300'
                }`}
              >
                {/* Topo: Horário + Pet + Badge de Status Principal */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-extrabold text-zinc-900 tabular-nums">
                      {formatTime(item.startsAt)}
                    </span>
                    <PetAvatar pet={item.pet} size="sm" />
                    <span
                      onClick={() => onSelectAppointment?.(item)}
                      className="text-xs font-bold text-zinc-900 truncate hover:text-teal-700 hover:underline cursor-pointer"
                    >
                      {item.pet?.name}
                    </span>
                  </div>
                  <div className="shrink-0">{getTransportStatusBadge(item)}</div>
                </div>

                {/* Linha de Modalidade e Tutor */}
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <span
                    className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold border ${modeInfo.badgeClass}`}
                  >
                    {modeInfo.icon} {modeInfo.label}
                  </span>
                  <span className="text-[10px] text-zinc-500 truncate">
                    Tutor: <strong className="text-zinc-700">{item.customer?.name}</strong>
                  </span>
                </div>

                {/* Faixa de Rastreio Operacional (Coleta -> Check-in -> Pronto p/ Levar) */}
                {renderTransportStepTracker(item)}

                {/* Caixa de Endereço */}
                <div className="rounded-lg bg-zinc-50 p-2 text-xs border border-zinc-100 mb-2">
                  <div className="flex items-start gap-1.5">
                    <MapPin size={13} className="text-rose-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      {address ? (
                        <>
                          <p className="font-semibold text-zinc-800 text-[11px] leading-tight">
                            {item.transport?.street || address}
                            {item.transport?.neighborhood && (
                              <span className="text-zinc-500 font-normal">
                                {' '}
                                · Bairro {item.transport.neighborhood}
                              </span>
                            )}
                          </p>
                          {reference && (
                            <p className="text-[10px] text-zinc-500 mt-0.5 italic">Ref: {reference}</p>
                          )}
                          {item.transport?.notes && (
                            <p className="text-[10px] text-amber-800 font-medium mt-0.5 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                              Obs: {item.transport.notes}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-rose-600 font-bold">Endereço não informado!</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Botões de Ação Contextual para o Motorista / Equipe */}
                <div className="flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-zinc-100">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openGoogleMaps(address)}
                      title="Abrir endereço no Google Maps"
                      disabled={!address}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer disabled:opacity-40"
                    >
                      <Navigation size={11} className="text-teal-700" />
                      Maps
                    </button>
                    <button
                      type="button"
                      onClick={() => copyAddress(address, item.pet?.name)}
                      title="Copiar endereço"
                      disabled={!address}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50 transition cursor-pointer disabled:opacity-40"
                    >
                      <Copy size={11} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* FASE 1: Ainda não coletado -> Avisar Coleta + Dar Check-in direto */}
                    {preCheckin && hasPickup && (
                      <>
                        <button
                          type="button"
                          onClick={() => openWhatsAppDriver(item, 'pickup')}
                          title="Avisar tutor no WhatsApp que está indo buscar"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                        >
                          <MessageCircle size={11} className="text-emerald-700" />
                          Indo Buscar
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleQuickStatusChange(item, 'checked_in')}
                          title="Confirmar coleta do pet (dar Check-in e mover para a loja)"
                          className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-teal-800 transition cursor-pointer disabled:opacity-50"
                        >
                          <Check size={11} />
                          {isBusy ? '...' : 'Coletado (Check-in)'}
                        </button>
                      </>
                    )}

                    {/* FASE 2: Já coletado (Check-in / Em banho) -> Mostra que aguarda finalizar */}
                    {isInStoreStatus(item.status) && (
                      <button
                        type="button"
                        onClick={() => onSelectAppointment?.(item)}
                        title="Abrir detalhes do atendimento na agenda"
                        className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 hover:bg-sky-100 transition cursor-pointer"
                      >
                        <Hourglass size={10} />
                        Em cuidado · Ver ficha
                      </button>
                    )}

                    {/* FASE 3: Pronto para levar agora -> Avisar Entrega + Abrir/Concluir */}
                    {isReadyForDropoff && (
                      <>
                        <button
                          type="button"
                          onClick={() => openWhatsAppDriver(item, 'dropoff')}
                          title="Avisar tutor no WhatsApp que está saindo para entregar o pet"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-400 bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 transition cursor-pointer shadow-2xs"
                        >
                          <MessageCircle size={11} />
                          Avisar Entrega
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectAppointment?.(item)}
                          title="Abrir atendimento para concluir entrega/recebimento"
                          className="inline-flex items-center gap-1 rounded-md border border-teal-300 bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-900 hover:bg-teal-100 transition cursor-pointer"
                        >
                          Concluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modal de Manifesto / Rota Completa de Entregas */}
      {openManifestModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-3">
          <div className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-5 shadow-2xl max-h-[92dvh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Cabeçalho do Modal */}
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-900">
                  <Navigation size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-900">
                    Manifesto de Rota · Táxi Dog
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Controle claro do que falta buscar, do que já teve Check-in e do que está pronto para levar
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpenManifestModal(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filtros por Fase dentro do Manifesto */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => setManifestFilter('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  manifestFilter === 'all'
                    ? 'bg-zinc-800 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                Todos ({transportItems.length})
              </button>
              <button
                type="button"
                onClick={() => setManifestFilter('pickup')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  manifestFilter === 'pickup'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                📥 Falta Buscar ({pendingPickups.length})
              </button>
              <button
                type="button"
                onClick={() => setManifestFilter('in_store')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  manifestFilter === 'in_store'
                    ? 'bg-teal-700 text-white'
                    : 'bg-teal-50 text-teal-900 border border-teal-200 hover:bg-teal-100'
                }`}
              >
                ✅ Já Coletados / Na Loja ({inStoreWaitingDropoff.length})
              </button>
              <button
                type="button"
                onClick={() => setManifestFilter('ready')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  manifestFilter === 'ready'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                🚀 Prontos p/ Levar ({readyDropoffs.length})
              </button>
            </div>

            {/* Ações de Seleção Rápida para Rota */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-700">
                  Marcados p/ rota:{' '}
                  <strong className="text-teal-800 font-extrabold">
                    {selectedRouteItems.length}
                  </strong>
                </span>
                {pendingPickups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      pendingPickups.forEach(it => {
                        next[it.id] = true;
                      });
                      setCheckedStops(next);
                    }}
                    className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-200 cursor-pointer"
                  >
                    Marcar só Falta Buscar ({pendingPickups.length})
                  </button>
                )}
                {readyDropoffs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      readyDropoffs.forEach(it => {
                        next[it.id] = true;
                      });
                      setCheckedStops(next);
                    }}
                    className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-200 cursor-pointer"
                  >
                    Marcar só Prontos p/ Levar ({readyDropoffs.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedRouteItems.length > 0) {
                      setCheckedStops({});
                    } else {
                      const all: Record<string, boolean> = {};
                      manifestDisplayedItems.forEach(it => {
                        all[it.id] = true;
                      });
                      setCheckedStops(all);
                    }
                  }}
                  className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                >
                  {selectedRouteItems.length > 0 ? 'Limpar seleção' : 'Marcar visíveis'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const sourceList =
                      selectedRouteItems.length > 0 ? selectedRouteItems : manifestDisplayedItems;
                    const lines = sourceList.map((item, idx) => {
                      const street =
                        item.transport?.street ||
                        item.transport?.address ||
                        item.customer?.address ||
                        'Sem endereço';
                      const b = item.transport?.neighborhood
                        ? ` (Bairro ${item.transport.neighborhood})`
                        : '';
                      const ref = item.transport?.reference
                        ? ` [Ref: ${item.transport.reference}]`
                        : '';
                      const obs = item.transport?.notes ? ` {Obs: ${item.transport.notes}}` : '';
                      const mode =
                        item.transport?.mode === 'dropoff_only'
                          ? 'LEVAR'
                          : item.transport?.mode === 'pickup_only'
                            ? 'BUSCAR'
                            : 'BUSCAR/LEVAR';
                      return `${idx + 1}. [${formatTime(item.startsAt)}] ${item.pet?.name} (${mode}) - ${street}${b}${ref}${obs} - Tutor: ${item.customer?.name} (${item.customer?.phone || ''})`;
                    });
                    navigator.clipboard.writeText(lines.join('\n'));
                    toast.success(
                      selectedRouteItems.length > 0
                        ? `${selectedRouteItems.length} parada(s) selecionada(s) copiada(s)!`
                        : 'Lista de paradas copiada!',
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
                >
                  <Copy size={13} />
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1 text-xs font-bold text-white hover:bg-teal-800 transition cursor-pointer"
                >
                  <Printer size={13} />
                  Imprimir
                </button>
              </div>
            </div>

            {/* Lista de Paradas */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {manifestDisplayedItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500">
                  Nenhum pet encontrado neste filtro do manifesto.
                </div>
              ) : (
                manifestDisplayedItems.map((item, index) => {
                  const address = item.transport?.address || item.customer?.address || '';
                  const reference = item.transport?.reference || item.customer?.reference || '';
                  const modeInfo = getModeInfo(item.transport?.mode);
                  const isChecked = Boolean(checkedStops[item.id]);
                  const preCheckin = isPreCheckinStatus(item.status);
                  const hasPickup = isPickupMode(item.transport?.mode);
                  const isBusy = updatingId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3.5 transition flex items-start gap-3 ${
                        isChecked
                          ? 'border-teal-500 bg-teal-50/30 ring-1 ring-teal-500/20 shadow-xs'
                          : 'border-zinc-200 bg-white shadow-2xs hover:border-amber-300'
                      }`}
                    >
                      {/* Checkbox para incluir na rota */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e =>
                          setCheckedStops(prev => ({
                            ...prev,
                            [item.id]: e.target.checked,
                          }))
                        }
                        className="mt-1 h-5 w-5 rounded border-zinc-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />

                      {/* Número da parada */}
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-700 shrink-0">
                        {index + 1}
                      </span>

                      {/* Informações da Parada */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-900 tabular-nums">
                              {formatTime(item.startsAt)}
                            </span>
                            <span className="text-sm font-extrabold text-zinc-900">
                              {item.pet?.name}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${modeInfo.badgeClass}`}
                            >
                              {modeInfo.icon} {modeInfo.label}
                            </span>
                          </div>
                          {getTransportStatusBadge(item)}
                        </div>

                        {/* Faixa de Rastreio Operacional */}
                        {renderTransportStepTracker(item)}

                        <p className="text-xs text-zinc-600 mb-1.5">
                          Tutor(a): <strong>{item.customer?.name}</strong> •{' '}
                          <span className="text-teal-800 font-semibold">{item.customer?.phone}</span>
                        </p>

                        <div className="flex items-start gap-1 text-xs text-zinc-800 bg-zinc-50 p-2 rounded-lg border border-zinc-200/80">
                          <MapPin size={14} className="text-rose-500 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold">
                              {item.transport?.street || address || 'Endereço não cadastrado'}
                            </span>
                            {item.transport?.neighborhood && (
                              <span className="text-zinc-600 block text-[11px]">
                                Bairro: {item.transport.neighborhood}
                              </span>
                            )}
                            {reference && (
                              <span className="text-zinc-500 block text-[11px]">
                                Ref: {reference}
                              </span>
                            )}
                            {item.transport?.notes && (
                              <span className="text-amber-800 font-medium block text-[11px] bg-amber-50 px-1 py-0.5 rounded mt-0.5">
                                Obs: {item.transport.notes}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => openGoogleMaps(address)}
                            disabled={!address}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
                          >
                            <Navigation size={12} className="text-teal-700" />
                            Abrir GPS Individual
                          </button>

                          {preCheckin && hasPickup && (
                            <>
                              <button
                                type="button"
                                onClick={() => openWhatsAppDriver(item, 'pickup')}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                              >
                                <MessageCircle size={12} className="text-emerald-700" />
                                Avisar Coleta no WhatsApp
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleQuickStatusChange(item, 'checked_in')}
                                className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-teal-800 transition cursor-pointer disabled:opacity-50"
                              >
                                <Check size={12} />
                                {isBusy ? 'Salvando...' : 'Dar Check-in (Coletado)'}
                              </button>
                            </>
                          )}

                          {item.status === 'ready' && (
                            <button
                              type="button"
                              onClick={() => openWhatsAppDriver(item, 'dropoff')}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition cursor-pointer"
                            >
                              <MessageCircle size={12} />
                              Avisar que está levando
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-zinc-100 mt-3">
              <span className="text-[11px] text-zinc-500">
                {selectedRouteItems.length === 0
                  ? '💡 Flegue nas caixinhas acima os endereços deste horário para gerar a rota.'
                  : `✅ ${selectedRouteItems.length} endereço(s) selecionado(s) para compor a rota.`}
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                <button
                  type="button"
                  onClick={openMultiStopGoogleMaps}
                  disabled={selectedRouteItems.length === 0}
                  title={
                    selectedRouteItems.length === 0
                      ? 'Flegue pelo menos 1 endereço na lista acima para montar a rota'
                      : 'Abrir rota com múltiplas paradas no Google Maps'
                  }
                  className="flex-1 sm:flex-initial justify-center inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-4 py-2.5 sm:py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-900 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Navigation size={14} />
                  Montar Rota {selectedRouteItems.length > 0 ? `(${selectedRouteItems.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenManifestModal(false)}
                  className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2.5 sm:py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
