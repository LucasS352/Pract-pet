import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Plus,
  UtensilsCrossed,
  ReceiptText,
  Clock,
  User,
  ArrowRight,
  Trash2,
  RefreshCw,
  Loader2,
  UnlockKeyhole,
  AlertTriangle,
  ChevronLeft,
  PawPrint,
  UserPlus,
  CalendarDays,
  FileText,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { readComandas, readComanda } from '@/lib/comandas-offline';
import { useCartStore } from '@/store/cart';
import { syncLoadedComanda } from '@/lib/comanda-cart';
import { kdsLabels, type KdsStatus } from '@/lib/kds';

type Item = {
  id: string;
  productId: string;
  product: { name: string; requiresKitchen?: boolean; requiresBar?: boolean; category?: string };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  createdBy?: { name: string };
  modifiers?: { id: string; name: string }[];
  kdsStatus?: KdsStatus | null;
  status?: 'active' | 'removed' | 'cancelled';
  removalReason?: string | null;
};
type Comanda = {
  id: string;
  number: string;
  customerName?: string;
  status: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  notes?: string | null;
  responsibleWaiter?: { name: string };
  items: Item[];
};
type PetshopTutor = { id: string; name: string; phone: string; pets?: PetshopPet[] };
type PetshopPet = { id: string; name: string; species: string; breed?: string | null };
export type PetshopComandaDraft = {
  tutor: { id?: string; name: string; phone?: string };
  pet: { id?: string; name: string; species: string };
  appointment?: {
    serviceId: string;
    serviceName: string;
    professionalId: string;
    professionalName: string;
    startsAt: string;
  };
};
type Props = {
  selectedId: string | null;
  initialRemoveItemId?: string | null;
  initialRemoveQuantity?: number | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCharge: (comanda: Comanda) => void;
  onUpdated: (comanda: Comanda) => void;
  isPetshopTheme?: boolean;
  isFoodTheme?: boolean;
  launch?: {
    number: string;
    customer: string;
    setNumber: (value: string) => void;
    setCustomer: (value: string) => void;
    quantity: number;
    total: number;
    busy: boolean;
    onConfirm: (petshop?: PetshopComandaDraft) => void;
  };
};
const money = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
function elapsed(date: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  return Number.isFinite(minutes)
    ? minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}min`
    : '—';
}

const PETSHOP_COMANDA_NOTE_PREFIX = 'PETSHOP_LINK_V1:';
const PETSHOP_COMANDA_COMPACT_PREFIX = 'PET2:';
function readPetshopComandaLink(notes?: string | null, customerName?: string | null): Record<string, any> | null {
  if (!notes) return null;
  if (notes.startsWith(PETSHOP_COMANDA_NOTE_PREFIX)) {
    try { return JSON.parse(notes.slice(PETSHOP_COMANDA_NOTE_PREFIX.length)); } catch { return null; }
  }
  if (notes.startsWith(PETSHOP_COMANDA_COMPACT_PREFIX)) {
    try {
      const data = JSON.parse(notes.slice(PETSHOP_COMANDA_COMPACT_PREFIX.length));
      const [tutorNameFallback, petNameFallback] = (customerName || '').split(' · ').map(s => s.trim());
      return {
        tutorId: data.t,
        tutorName: data.tn || tutorNameFallback || 'Tutor',
        petId: data.p,
        petName: data.pn || petNameFallback || 'Pet',
        appointment: data.a ? {
          id: data.a,
          serviceName: data.s || 'Serviço',
          professionalName: data.pr || 'Equipe',
          startsAt: data.at || new Date().toISOString(),
        } : null,
      };
    } catch { return null; }
  }
  return null;
}

export function ComandaWorkspaceModal({
  selectedId,
  initialRemoveItemId,
  initialRemoveQuantity,
  onSelect,
  onClose,
  onCharge,
  onUpdated,
  isPetshopTheme = true,
  isFoodTheme = false,
  launch,
}: Props) {
  const tenantId = useAuthStore(state => state.user?.tenant) || '';
  const [offlineAt, setOfflineAt] = useState<number | null>(null);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [detail, setDetail] = useState<Comanda | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [petshopDataLoading, setPetshopDataLoading] = useState(false);
  const [petshopDataError, setPetshopDataError] = useState('');
  const [petshopTutors, setPetshopTutors] = useState<PetshopTutor[]>([]);
  const [petshopServices, setPetshopServices] = useState<any[]>([]);
  const [petshopProfessionals, setPetshopProfessionals] = useState<any[]>([]);
  const [tutorMode, setTutorMode] = useState<'existing' | 'new'>('existing');
  const [selectedTutorId, setSelectedTutorId] = useState('');
  const [newTutorName, setNewTutorName] = useState('');
  const [newTutorPhone, setNewTutorPhone] = useState('');
  const [petMode, setPetMode] = useState<'existing' | 'new'>('existing');
  const [selectedPetId, setSelectedPetId] = useState('');
  const [newPetName, setNewPetName] = useState('');
  const [newPetSpecies, setNewPetSpecies] = useState('dog');
  const [scheduleService, setScheduleService] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [appointmentStartsAt, setAppointmentStartsAt] = useState('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    kind: 'remove' | 'decrease' | 'cancel' | 'reopen' | 'charge';
    comanda: Comanda;
    item?: Item;
  } | null>(null);
  const [authorizationPin, setAuthorizationPin] = useState('');
  const [authorizationReason, setAuthorizationReason] = useState('');
  const [mobileDetail, setMobileDetail] = useState(selectedId === 'new');
  const panel = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const selection = useRef(selectedId);
  selection.current = selectedId;
  const version = useRef(0);
  const detailVersion = useRef(0);
  const mutating = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const locked = useCartStore((state) => state.isOperationLocked);
  const disabled = busy || !!launch?.busy || locked;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const selected = detail?.id === selectedId ? detail : null;
  const selectedPetshopLink = readPetshopComandaLink(selected?.notes, selected?.customerName);
  const activeItems = selected?.items.filter((item) => !item.status || item.status === 'active') || [];
  const isNew = !!launch && selectedId === 'new';
  const promptedRemoval = useRef<string | null>(null);
  const selectedTutor = petshopTutors.find((tutor) => tutor.id === selectedTutorId);
  const canLoadPetshopComandaData = isPetshopTheme && Boolean(launch);
  const selectedPet = selectedTutor?.pets?.find((pet) => pet.id === selectedPetId);
  const selectedService = petshopServices.find((service) => service.id === selectedServiceId);
  const selectedProfessional = petshopProfessionals.find((person) => person.id === selectedProfessionalId);
  const tutorIsValid = tutorMode === 'existing'
    ? Boolean(selectedTutor)
    : Boolean(newTutorName.trim() && newTutorPhone.replace(/\D/g, '').length >= 10);
  const petIsValid = petMode === 'existing'
    ? Boolean(selectedPet)
    : Boolean(newPetName.trim());
  const appointmentIsValid = !scheduleService || Boolean(selectedService && appointmentStartsAt && selectedProfessional);
  const petshopLaunchIsValid = tutorIsValid && petIsValid && appointmentIsValid && !petshopDataLoading;

  const buildPetshopDraft = (): PetshopComandaDraft | undefined => {
    if (!isPetshopTheme || !isNew) return undefined;
    const tutor = tutorMode === 'existing' && selectedTutor
      ? { id: selectedTutor.id, name: selectedTutor.name, phone: selectedTutor.phone }
      : { name: newTutorName.trim(), phone: newTutorPhone.replace(/\D/g, '') };
    const pet = petMode === 'existing' && selectedPet
      ? { id: selectedPet.id, name: selectedPet.name, species: selectedPet.species }
      : { name: newPetName.trim(), species: newPetSpecies };
    if (!tutor.name || !pet.name) return undefined;
    return {
      tutor,
      pet,
      ...(scheduleService && selectedService && selectedProfessional && appointmentStartsAt ? {
        appointment: {
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          professionalId: selectedProfessional.id,
          professionalName: selectedProfessional.name,
          startsAt: appointmentStartsAt,
        },
      } : {}),
    };
  };

  useEffect(() => {
    if (!canLoadPetshopComandaData) return;
    let active = true;
    setPetshopDataLoading(true);
    setPetshopDataError('');
    Promise.all([api.get('/petshop/tutors'), api.get('/petshop/services'), api.get('/operators')])
      .then(([tutorsResponse, servicesResponse, professionalsResponse]) => {
        if (!active) return;
        const tutors = Array.isArray(tutorsResponse.data) ? tutorsResponse.data : [];
        setPetshopTutors(tutors);
        setPetshopServices(Array.isArray(servicesResponse.data) ? servicesResponse.data.filter((item: any) => item.active !== false) : []);
        setPetshopProfessionals(Array.isArray(professionalsResponse.data) ? professionalsResponse.data.filter((item: any) => item.active !== false) : []);
        if (!tutors.length) setTutorMode('new');
      })
      .catch(() => { if (active) setPetshopDataError('Não foi possível carregar tutores, serviços e equipe. Verifique a conexão e tente novamente.'); })
      .finally(() => { if (active) setPetshopDataLoading(false); });
    return () => { active = false; };
  }, [canLoadPetshopComandaData]);

  useEffect(() => {
    if (tutorMode === 'existing' && selectedTutor && !selectedTutor.pets?.length) setPetMode('new');
    if (tutorMode === 'new') {
      setSelectedPetId('');
      setPetMode('new');
    }
  }, [tutorMode, selectedTutorId, petshopTutors]);

  useEffect(() => {
    if (isPetshopTheme && isNew && launch && !launch.number.trim()) {
      const petName = selectedPet?.name || newPetName.trim();
      if (petName) {
        launch.setNumber(`Pet: ${petName}`);
      }
    }
  }, [isPetshopTheme, isNew, selectedPet?.name, newPetName]);

  useEffect(() => {
    if (!initialRemoveItemId || !selected || promptedRemoval.current === initialRemoveItemId) return;
    promptedRemoval.current = initialRemoveItemId;
    const item = activeItems.find((entry) => entry.id === initialRemoveItemId);
    if (item && selected.status === 'open') requestProtectedAction(initialRemoveQuantity === 1 ? 'decrease' : 'remove', selected, item);
    else toast.error('Este item não está mais ativo na comanda. Confira a lista atualizada.');
  }, [initialRemoveItemId, initialRemoveQuantity, selected]);

  const loadDetail = useCallback(async (id: string) => {
    const request = ++detailVersion.current;
    setDetailLoading(true);
    try {
      const res = await readComanda(tenantId, id);
      if (request === detailVersion.current && selection.current === id) {
        if (!['open', 'waiting_payment'].includes(res.data.status)) {
          setDetail(null);
          setError(isPetshopTheme ? 'Este atendimento foi encerrado. Selecione outro.' : 'Esta comanda foi encerrada. Selecione outra mesa.');
        } else {
          setDetail(res.data);
          setOfflineAt(res.offline ? res.savedAt : null);
          setError('');
        }
      }
    } catch (err: any) {
      if (request === detailVersion.current) {
        setDetail(null);
        setError(err.message || 'Não foi possível carregar os itens. Tente atualizar.');
      }
    } finally {
      if (request === detailVersion.current) setDetailLoading(false);
    }
  }, [tenantId]);

  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const request = ++version.current;
    try {
      const res = await readComandas(tenantId);
      if (request !== version.current) return;
      setComandas(res.items);
      setOfflineAt(res.offline ? res.savedAt : null);
      setError('');
      const id = selection.current;
      if (id && id !== 'new') await loadDetail(id);
    } catch (err: any) {
      if (request === version.current)
        setError(
          err?.message || 'Não foi possível atualizar as comandas. Verifique a conexão e tente novamente.',
        );
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [loadDetail, tenantId]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      clearInterval(timer);
      version.current++;
      detailVersion.current++;
    };
  }, [refresh]);
  useEffect(() => {
    setDetail(null);
    detailVersion.current++;
    if (selectedId && selectedId !== 'new') void loadDetail(selectedId);
    else setDetailLoading(false);
  }, [selectedId, loadDetail]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => before?.focus();
  }, []);
  useEffect(() => {
    if (confirm) confirmation.current?.focus();
    else panel.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!disabledRef.current) {
          if (confirm) setConfirm(null);
          else onCloseRef.current();
        }
      }
      if (event.key === 'Tab') {
        const root = confirm ? confirmation.current : panel.current;
        const focusable = Array.from(
          root?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === root)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === root)
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [confirm]);

  function choose(id: string) {
    if (disabled) return;
    onSelect(id);
    setMobileDetail(true);
  }

  function requestProtectedAction(action: 'remove' | 'decrease' | 'cancel', comanda: Comanda, item?: Item) {
    setAuthorizationPin('');
    setAuthorizationReason('');
    setConfirm({ kind: action, comanda, item });
  }

  async function runAction(action: NonNullable<typeof confirm>) {
    if (
      mutating.current ||
      disabled ||
      useCartStore.getState().isOperationLocked
    )
      return;
    if (action.kind === 'remove' || action.kind === 'decrease' || action.kind === 'cancel') {
      if (authorizationPin.length < 4) {
        toast.error('Informe o PIN do Caixa ou Gerente.');
        return;
      }
      if (authorizationReason.trim().length < 3) {
        toast.error('Informe o motivo da ação.');
        return;
      }
    }
    mutating.current = true;
    setBusy(true);
    version.current++;
    detailVersion.current++;
    try {
      if (action.kind === 'charge') {
        const res = await readComanda(tenantId, action.comanda.id);
        if (res.offline && !window.confirm(`Sem conexão: cópia de ${new Date(res.savedAt).toLocaleString('pt-BR')}. Confira os consumos com o garçom e concentre as cobranças em um único caixa durante a queda. Continuar com estes valores?`)) return;
        if (!['open', 'waiting_payment'].includes(res.data.status))
          throw new Error('Esta comanda já foi encerrada.');
        if (!res.data.items?.some((item: Item) => !item.status || item.status === 'active'))
          throw new Error('Esta comanda não possui itens ativos para cobrar.');
        onCharge(res.data);
      } else if (action.kind === 'remove' || action.kind === 'decrease' || action.kind === 'cancel') {
        if (offlineAt || !navigator.onLine) throw new Error('Reconecte para alterar a comanda.');
        const authorization = await api.post(`/v1/comandas/${action.comanda.id}/authorize`, {
          action: action.kind === 'cancel' ? 'cancel_comanda' : 'remove_item',
          itemId: action.item?.id,
          pin: authorizationPin,
        });
        const res = action.kind !== 'cancel'
          ? await api.post(
              `/v1/comandas/${action.comanda.id}/items/${action.item!.id}/remove`,
              { authorizationToken: authorization.data.authorizationToken, reason: authorizationReason.trim(), ...(action.kind === 'decrease' ? { quantity: 1, expectedQuantity: Number(action.item!.quantity) } : {}) },
            )
          : await api.post(
              `/v1/comandas/${action.comanda.id}/cancel`,
              { authorizationToken: authorization.data.authorizationToken, reason: authorizationReason.trim() },
            );
        setDetail(res.data);
        setComandas((list) => action.kind === 'cancel'
          ? list.filter((c) => c.id !== res.data.id)
          : list.map((c) => (c.id === res.data.id ? res.data : c)));
        if (action.kind !== 'cancel') syncLoadedComanda(res.data);
        onUpdated(res.data);
        toast.success(
          action.kind !== 'cancel'
            ? action.kind === 'decrease' ? 'Uma unidade removida com autorização. Total da comanda atualizado.' : 'Item removido com autorização. Total da comanda atualizado.'
            : 'Comanda cancelada e preservada no histórico.',
        );
        if (action.kind === 'cancel') {
          setDetail(null);
          onSelect(launch ? 'new' : '');
          setMobileDetail(false);
        }
      } else {
        if (offlineAt || !navigator.onLine) throw new Error('Reconecte para alterar a comanda.');
        const res = await api.post(`/v1/comandas/${action.comanda.id}/reopen`);
        setDetail(res.data);
        setComandas((list) => list.map((c) => (c.id === res.data.id ? res.data : c)));
        syncLoadedComanda(res.data);
        onUpdated(res.data);
        toast.success('Comanda reaberta para edição.');
      }
      setConfirm(null);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err.message ||
          'Não foi possível concluir a ação.',
      );
      setConfirm(null);
      if (selection.current && selection.current !== 'new')
        await loadDetail(selection.current);
    } finally {
      mutating.current = false;
      setBusy(false);
      setLoading(false);
      setDetailLoading(false);
    }
  }
  function charge() {
    if (!selected) return;
    const action = { kind: 'charge' as const, comanda: selected };
    if (useCartStore.getState().items.length > 0) setConfirm(action);
    else void runAction(action);
  }
  const waiting = comandas.filter((c) => c.status === 'waiting_payment').length;
  const normalize = (value: string) =>
    (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const searchTerms = normalize(search)
    .split(/\s+/)
    .filter(Boolean);

  const list = comandas
    .filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!searchTerms.length) return true;

      const petshopLink = readPetshopComandaLink(c.notes, c.customerName);
      const itemsText = (c.items || [])
        .map((i) => `${i.product?.name || ''} ${i.notes || ''} ${i.unitPrice || ''}`)
        .join(' ');

      const haystack = normalize(
        [
          c.number,
          c.number ? `#${c.number}` : '',
          c.number ? `mesa ${c.number}` : '',
          c.number ? `comanda ${c.number}` : '',
          c.customerName,
          c.responsibleWaiter?.name,
          petshopLink?.tutorName,
          petshopLink?.petName,
          petshopLink?.appointment?.serviceName,
          petshopLink?.appointment?.professionalName,
          itemsText,
          c.total ? String(c.total) : '',
        ]
          .filter(Boolean)
          .join(' '),
      );

      return searchTerms.every((term) => {
        const cleanTerm = term.startsWith('#') ? term.slice(1) : term;
        return haystack.includes(term) || (cleanTerm && haystack.includes(cleanTerm));
      });
    })
    .sort(
      (a, b) =>
        Number(b.status === 'waiting_payment') -
          Number(a.status === 'waiting_payment') ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  const isLightModal = isPetshopTheme || isFoodTheme;

  return createPortal(
    <div className={`fixed inset-0 z-[160] flex items-center justify-center p-2 sm:p-5 text-left ${isLightModal ? 'bg-zinc-900/60 backdrop-blur-sm' : 'bg-black/80 backdrop-blur-md'}`}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comanda-workspace-title"
        className={`w-full max-w-6xl h-[92dvh] max-h-[900px] overflow-hidden flex flex-col rounded-3xl outline-none shadow-2xl transition-all ${
          isLightModal
            ? 'border border-zinc-200/90 bg-white text-zinc-900'
            : 'border border-zinc-700/70 bg-[#101317] text-white'
        }`}
      >
        <header
          className={`flex items-center justify-between gap-3 px-5 sm:px-7 py-4 sm:py-5 border-b shrink-0 ${
            isLightModal
              ? 'border-zinc-100 bg-white'
              : 'border-white/5'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`hidden sm:grid w-11 h-11 place-items-center rounded-2xl shrink-0 ${
                isLightModal
                  ? isFoodTheme
                    ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border border-teal-100/90 bg-teal-50 text-teal-600'
                  : 'border border-amber-400/20 bg-amber-400/10 text-amber-400'
              }`}
            >
              {isPetshopTheme ? <PawPrint size={22} /> : <UtensilsCrossed size={22} />}
            </div>
            <div>
              <p
                className={`text-[10px] font-bold tracking-[0.18em] uppercase mb-0.5 ${
                  isLightModal ? (isFoodTheme ? 'text-[#C76A2A]' : 'text-teal-600') : 'text-amber-400'
                }`}
              >
                {isFoodTheme ? 'PRACT FOOD · ATENDIMENTO' : isPetshopTheme ? 'PET CARE · ATENDIMENTO' : 'PDV · Atendimento'}
              </p>
              <h2
                id="comanda-workspace-title"
                className={`text-lg sm:text-2xl font-bold tracking-tight ${
                  isLightModal ? 'text-zinc-900' : 'text-white'
                }`}
              >
                {isFoodTheme ? (launch ? 'Lançar em comanda' : 'Comandas e mesas do restaurante') : isPetshopTheme ? (launch ? 'Atendimento do pet' : 'Atendimentos do Petshop') : (launch ? 'Lançar em comanda' : 'Comandas e mesas')}
              </h2>
              <p className={`hidden sm:block text-xs mt-0.5 ${isLightModal ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {launch
                  ? isPetshopTheme ? 'Vincule tutor e pet, com agendamento opcional.' : 'Escolha o destino dos itens do carrinho.'
                  : 'Acompanhe o consumo, gerencie os itens e receba no caixa.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar comandas"
            onClick={onClose}
            disabled={disabled}
            className={`rounded-xl p-2.5 transition disabled:opacity-40 ${
              isLightModal
                ? 'border border-zinc-200/80 bg-zinc-50/80 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800'
                : 'bg-white/5 hover:bg-white/10 text-zinc-400'
            }`}
          >
            <X size={19} />
          </button>
        </header>
        {offlineAt && (
          <div role="status" className="bg-amber-500/15 px-5 py-3 text-sm text-amber-200">
            Sem conexão · cópia de {new Date(offlineAt).toLocaleString('pt-BR')}. Valores podem estar desatualizados. Use um único caixa para cobrar durante a queda.
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="px-5 py-3 text-sm text-red-200 bg-red-500/10 flex items-center justify-between gap-3"
          >
            {error}
            <button
              type="button"
              disabled={disabled}
              onClick={refresh}
              className="underline shrink-0 font-medium"
            >
              Tentar novamente
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[1.1fr_1fr]">
          <section
            aria-label={isLightModal ? "Atendimentos disponíveis" : "Mesas disponíveis"}
            className={`${mobileDetail ? 'hidden md:flex' : 'flex'} flex-col min-h-0 p-4 sm:p-5 gap-3.5 ${
              isLightModal
                ? 'border-r border-zinc-100 bg-white'
                : 'border-r border-white/5'
            }`}
          >
            {/* Top Stat Cards */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {isLightModal ? (
                <>
                  <div className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-3 sm:p-3.5 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <FileText size={15} />
                      </div>
                      <p className="text-[11px] font-medium text-zinc-500 truncate">Abertas</p>
                    </div>
                    <div>
                      <p className="text-base sm:text-xl font-bold text-zinc-900 mt-2 tabular-nums">
                        {comandas.length}
                      </p>
                      {isFoodTheme && <p className="text-[10px] text-zinc-400 mt-0.5">comandas ativas</p>}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-3 sm:p-3.5 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <Clock size={15} />
                      </div>
                      <p className="text-[11px] font-medium text-zinc-500 truncate">Aguardando caixa</p>
                    </div>
                    <div>
                      <p className="text-base sm:text-xl font-bold text-zinc-900 mt-2 tabular-nums">
                        {waiting}
                      </p>
                      {isFoodTheme && <p className="text-[10px] text-zinc-400 mt-0.5">prontas para fechar</p>}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-3 sm:p-3.5 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                        <CreditCard size={15} />
                      </div>
                      <p className="text-[11px] font-medium text-zinc-500 truncate">Consumo total</p>
                    </div>
                    <div>
                      <p className="text-base sm:text-xl font-bold text-zinc-900 mt-2 tabular-nums break-words">
                        {money(comandas.reduce((sum, c) => sum + Number(c.total), 0))}
                      </p>
                      {isFoodTheme && <p className="text-[10px] text-zinc-400 mt-0.5">soma em aberto</p>}
                    </div>
                  </div>
                </>
              ) : (
                [
                  ['Abertas', comandas.length],
                  ['Aguardando caixa', waiting],
                  [
                    'Consumo total',
                    money(comandas.reduce((sum, c) => sum + Number(c.total), 0)),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label as string}
                    className="min-w-0 rounded-xl bg-white/[0.03] border border-white/5 p-3"
                  >
                    <p className="text-[10px] sm:text-xs text-zinc-400">
                      {label}
                    </p>
                    <p className="text-sm sm:text-lg font-semibold mt-1 tabular-nums break-words">
                      {value}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Search and Refresh */}
            <div className="flex gap-2">
              <label className="flex-1 min-w-0 relative">
                <Search
                  size={16}
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${
                    isLightModal ? 'text-zinc-400' : 'text-zinc-500'
                  }`}
                />
                <input
                  aria-label="Buscar comanda"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isFoodTheme ? "Mesa, comanda ou garçom" : isPetshopTheme ? "Buscar por pet, tutor ou identificador" : "Mesa, cliente ou garçom"}
                  className={`w-full rounded-xl py-2.5 pl-10 pr-3 text-xs sm:text-sm outline-none transition ${
                    isLightModal
                      ? `border border-zinc-200/90 bg-zinc-50/80 text-zinc-800 placeholder-zinc-400 focus:bg-white ${
                          isFoodTheme ? 'focus:border-[#C76A2A] focus:ring-[#C76A2A]/15' : 'focus:border-teal-600 focus:ring-teal-600/15'
                        } focus:ring-2`
                      : 'border border-zinc-700/60 bg-black/25 text-white focus:border-amber-400/60'
                  }`}
                />
              </label>
              <button
                type="button"
                aria-label="Atualizar comandas"
                disabled={disabled}
                onClick={refresh}
                className={`p-2.5 rounded-xl border transition ${
                  isLightModal
                    ? 'border-zinc-200/90 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                    : 'border-zinc-700/60 text-zinc-400 hover:bg-white/5'
                }`}
              >
                <RefreshCw size={17} />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {[
                ['all', `Todas (${comandas.length})`],
                ['open', `Em atendimento (${comandas.filter((c) => c.status === 'open').length})`],
                ['waiting_payment', `Aguardando caixa (${comandas.filter((c) => c.status === 'waiting_payment').length})`],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    isLightModal
                      ? filter === value
                        ? `${isFoodTheme ? 'bg-[#C76A2A]' : 'bg-teal-700'} text-white shadow-xs`
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                      : filter === value
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Comandas Grid */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
              {loading ? (
                <p role="status" className={`py-12 text-center ${isPetshopTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  <Loader2 className="inline animate-spin mr-2" size={18} />
                  {isPetshopTheme ? 'Carregando atendimentos…' : 'Carregando comandas…'}
                </p>
              ) : !list.length ? (
                <div className="text-center py-14 text-zinc-400">
                  <ReceiptText size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">
                    {comandas.length
                      ? (isPetshopTheme ? 'Nenhum atendimento corresponde à busca.' : 'Nenhuma comanda corresponde à busca.')
                      : (isPetshopTheme ? 'Nenhum atendimento aberto no momento.' : 'Nenhuma comanda aberta no momento.')}
                  </p>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="mt-2 text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Limpar busca
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {list.map((c) => {
                    const cardPetshopLink = isPetshopTheme ? readPetshopComandaLink(c.notes, c.customerName) : null;
                    const isSelected = selectedId === c.id;

                    if (isLightModal) {
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={disabled ? -1 : 0}
                          aria-disabled={disabled}
                          onClick={() => { if (!disabled) choose(c.id); }}
                          onKeyDown={(event) => {
                            if (!disabled && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault();
                              choose(c.id);
                            }
                          }}
                          aria-pressed={isSelected}
                          aria-label={`Comanda ${c.number}`}
                          className={`relative text-left rounded-2xl p-4 transition outline-none cursor-pointer flex flex-col justify-between ${
                            disabled ? 'opacity-50 cursor-not-allowed' : ''
                          } ${
                            isSelected
                              ? isFoodTheme 
                                ? 'border-2 border-[#C76A2A] bg-[#F7E5D6]/30 shadow-xs ring-1 ring-[#C76A2A]/20'
                                : 'border-2 border-teal-600 bg-teal-50/20 shadow-xs ring-1 ring-teal-600/20'
                              : isFoodTheme
                                ? 'border border-[#E9DDD0] bg-white hover:border-[#E3A544] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-xs'
                                : 'border border-zinc-200/90 bg-white hover:border-teal-300 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-xs'
                          }`}
                        >
                          {/* Row 1: Dot + Title + Trash button */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  c.status === 'waiting_payment' ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                              />
                              <span className="font-bold text-sm sm:text-base text-zinc-900 truncate">
                                #{c.number}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={disabled || !!offlineAt}
                              onClick={(event) => {
                                event.stopPropagation();
                                requestProtectedAction('cancel', c);
                              }}
                              className="p-1.5 rounded-lg border border-red-100 bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 transition shrink-0 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                              aria-label={`Cancelar comanda ${c.number}`}
                              title="Cancelar comanda com autorização"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          {isFoodTheme ? (
                            <>
                              {/* Row 2: Status pill */}
                              <div className="mt-2.5">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                                    c.status === 'waiting_payment'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200/70'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'waiting_payment' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                  {c.status === 'waiting_payment' ? 'Aguardando caixa' : 'Em atendimento'}
                                </span>
                              </div>

                              {/* Row 3: Customer */}
                              <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600 min-w-0">
                                <User size={13} className="shrink-0 text-zinc-400" />
                                <span className="truncate">{c.customerName || 'Cliente não informado'}</span>
                              </div>

                              {/* Row 4: Total price + item count + elapsed time */}
                              <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-baseline justify-between gap-2">
                                <span className="text-base sm:text-lg font-black text-zinc-900 tabular-nums">
                                  {money(c.total)}
                                </span>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                  <span>{c.items.length} {c.items.length === 1 ? 'item' : 'itens'}</span>
                                  <span className="flex items-center gap-0.5">
                                    <Clock size={11} />
                                    {elapsed(c.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Middle Row: Paw avatar + Customer/Pet name + Status badge */}
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-teal-50 border border-teal-100/80 text-teal-600">
                                    <PawPrint size={14} />
                                  </div>
                                  <span className="text-xs font-semibold text-zinc-700 truncate">
                                    {c.customerName || (cardPetshopLink ? `${cardPetshopLink.tutorName} · ${cardPetshopLink.petName}` : 'Sem identificação')}
                                  </span>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                                    c.status === 'waiting_payment'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200/70'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                                  }`}
                                >
                                  {c.status === 'waiting_payment' ? 'Aguardando caixa' : 'Em atendimento'}
                                </span>
                              </div>

                              {/* Bottom Row: Total price + item count + elapsed time */}
                              <div className="mt-3.5 pt-3 border-t border-zinc-100 flex items-baseline justify-between gap-2">
                                <span className="text-base sm:text-lg font-black text-zinc-900 tabular-nums">
                                  {money(c.total)}
                                </span>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                  <span>{c.items.length} lançamento(s)</span>
                                  <span className="flex items-center gap-0.5">
                                    <Clock size={11} />
                                    {elapsed(c.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    }

                    // Restaurant Dark Theme Card
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-disabled={disabled}
                        onClick={() => { if (!disabled) choose(c.id); }}
                        onKeyDown={(event) => {
                          if (!disabled && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            choose(c.id);
                          }
                        }}
                        aria-pressed={selectedId === c.id}
                        aria-label={`Comanda ${c.number}`}
                        className={`relative text-left rounded-2xl border p-4 transition outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${selectedId === c.id ? 'bg-amber-400/10 border-amber-400 shadow-[inset_0_0_0_1px_#fbbf24]' : 'bg-[#191e23] border-zinc-700/50 hover:border-zinc-500'}`}
                      >
                        <button
                          type="button"
                          disabled={disabled || !!offlineAt}
                          onClick={(event) => {
                            event.stopPropagation();
                            requestProtectedAction('cancel', c);
                          }}
                          className="absolute top-3 right-3 p-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-25 disabled:cursor-not-allowed"
                          aria-label={`Cancelar comanda ${c.number}`}
                          title="Cancelar comanda com autorização"
                        >
                          <Trash2 size={15} />
                        </button>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'waiting_payment' ? 'bg-orange-400' : 'bg-emerald-400'}`}
                          />
                          <span className="font-bold text-lg truncate">
                            #{c.number}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400 truncate">
                          {c.customerName || 'Sem cliente informado'}
                        </p>
                        <p
                          className={`mt-3 text-[10px] font-semibold ${c.status === 'waiting_payment' ? 'text-orange-300' : 'text-emerald-400'}`}
                        >
                          {c.status === 'waiting_payment'
                            ? 'Aguardando caixa'
                            : 'Em atendimento'}
                        </p>
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <p className="text-lg font-bold tabular-nums">
                            {money(c.total)}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
                            <span>{c.items.length} lançamento(s)</span>
                            <span className="flex gap-1 items-center">
                              <Clock size={11} />
                              {elapsed(c.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {launch && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => choose('new')}
                className={`py-3 rounded-xl border border-dashed flex justify-center items-center gap-2 text-sm font-semibold transition ${
                  isNew
                    ? isPetshopTheme
                      ? 'text-teal-700 border-teal-500 bg-teal-50/50'
                      : 'text-amber-300 border-amber-400/60 bg-amber-400/5'
                    : isPetshopTheme
                      ? 'text-zinc-600 border-zinc-300 hover:bg-zinc-50'
                      : 'text-zinc-300 border-zinc-600 hover:bg-white/5'
                }`}
              >
                <Plus size={18} />
                {isPetshopTheme ? 'Novo atendimento' : 'Nova comanda'}
              </button>
            )}
          </section>
          <section
            aria-label={isLightModal ? (isPetshopTheme ? "Detalhes do atendimento" : "Detalhes da comanda") : "Detalhes da comanda"}
            className={`${mobileDetail ? 'flex' : 'hidden md:flex'} flex-col min-h-0 ${
              isLightModal
                ? 'bg-[#fafbfb] border-l border-zinc-100 text-zinc-900'
                : 'bg-[#14181d] text-white'
            }`}
          >
            <div className="md:hidden px-4 pt-3">
              <button
                type="button"
                onClick={() => setMobileDetail(false)}
                disabled={disabled}
                className={`text-sm flex gap-1 items-center py-2 ${isLightModal ? 'text-zinc-600' : 'text-zinc-300'}`}
              >
                <ChevronLeft size={18} />
                {isPetshopTheme ? 'Voltar aos atendimentos' : isFoodTheme ? 'Voltar às comandas' : 'Voltar às mesas'}
              </button>
            </div>
            {isNew ? (
              <div className={`flex-1 overflow-y-auto p-5 sm:p-7 ${isLightModal ? 'bg-white text-zinc-900' : ''}`}>
                <span className={`grid place-items-center w-12 h-12 rounded-xl mb-4 ${
                  isLightModal
                    ? isFoodTheme
                      ? 'bg-[#F7E5D6] text-[#C76A2A] border border-[#F8EBCF]'
                      : 'bg-teal-50 text-teal-600 border border-teal-100'
                    : 'bg-amber-400/10 text-amber-400'
                }`}>
                  {isPetshopTheme ? <PawPrint size={22} /> : <Plus size={24} />}
                </span>
                <h3 className={`text-xl font-bold ${isLightModal ? 'text-zinc-900' : 'text-white'}`}>
                  {isPetshopTheme ? 'Novo atendimento' : 'Abrir nova comanda'}
                </h3>
                <p className={`text-sm mt-1.5 mb-5 ${isLightModal ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {isPetshopTheme ? 'Identifique o tutor e o pet. Se houver serviço, já deixe o horário reservado.' : 'Identifique a mesa ou o cliente para começar o atendimento.'}
                </p>
                <label className={`block text-sm font-medium ${isLightModal ? 'text-zinc-700' : 'text-zinc-300'}`}>
                  {isPetshopTheme ? 'Identificação do atendimento' : 'Identificação da comanda'} <span className={isLightModal ? (isFoodTheme ? 'text-[#C76A2A]' : 'text-teal-600') : 'text-amber-400'}>*</span>
                  <input
                    value={launch.number}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !disabled && !error && launch.number.trim() && (!isPetshopTheme || petshopLaunchIsValid)) {
                        event.preventDefault();
                        launch.onConfirm(buildPetshopDraft());
                      }
                    }}
                    onChange={(e) => launch.setNumber(e.target.value)}
                    placeholder={isPetshopTheme ? 'Ex.: Atendimento da Mel · balcão' : 'Ex.: Mesa 05, Balcão 2, Marcos'}
                    className={`mt-2 mb-5 w-full p-3 rounded-xl outline-none transition ${
                      isLightModal
                        ? `bg-white border border-zinc-200/90 text-zinc-900 ${isFoodTheme ? 'focus:border-[#C76A2A] focus:ring-[#C76A2A]/15' : 'focus:border-teal-600 focus:ring-teal-600/15'} focus:ring-2`
                        : 'bg-black/25 border border-zinc-700 text-white focus:border-amber-400'
                    }`}
                  />
                </label>
                {isPetshopTheme ? (
                  <div className="space-y-4">
                    <section className="rounded-2xl border border-zinc-200/90 bg-[#fafbfb] p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                          <UserPlus size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-zinc-900 text-sm">Tutor do pet</h4>
                          <p className="mt-0.5 text-xs text-zinc-500">Selecione alguém cadastrado ou faça um cadastro rápido.</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          aria-pressed={tutorMode === 'existing'}
                          onClick={() => setTutorMode('existing')}
                          className={`py-2 rounded-xl text-xs font-semibold border transition ${
                            tutorMode === 'existing'
                              ? 'bg-teal-50 text-teal-800 border-teal-300'
                              : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                          }`}
                        >
                          Tutor cadastrado
                        </button>
                        <button
                          type="button"
                          aria-pressed={tutorMode === 'new'}
                          onClick={() => setTutorMode('new')}
                          className={`py-2 rounded-xl text-xs font-semibold border transition ${
                            tutorMode === 'new'
                              ? 'bg-teal-50 text-teal-800 border-teal-300'
                              : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                          }`}
                        >
                          Novo tutor
                        </button>
                      </div>
                      {tutorMode === 'existing' ? (
                        <label className="mt-3 block text-xs font-medium text-zinc-700">
                          Buscar tutor <span className="text-rose-600">*</span>
                          <select
                            value={selectedTutorId}
                            onChange={(event) => { setSelectedTutorId(event.target.value); setSelectedPetId(''); }}
                            className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                          >
                            <option value="">{petshopDataLoading ? 'Carregando tutores…' : 'Selecione o tutor'}</option>
                            {petshopTutors.map(tutor => (
                              <option key={tutor.id} value={tutor.id}>
                                {tutor.name}{tutor.phone ? ` · ${tutor.phone}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-medium text-zinc-700">
                            Nome do tutor <span className="text-rose-600">*</span>
                            <input
                              value={newTutorName}
                              onChange={event => setNewTutorName(event.target.value)}
                              autoComplete="name"
                              placeholder="Nome completo"
                              className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                            />
                          </label>
                          <label className="block text-xs font-medium text-zinc-700">
                            Celular com DDD <span className="text-rose-600">*</span>
                            <input
                              value={newTutorPhone}
                              onChange={event => setNewTutorPhone(event.target.value)}
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              placeholder="(11) 99999-9999"
                              className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                            />
                          </label>
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border border-zinc-200/90 bg-[#fafbfb] p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                          <PawPrint size={16} />
                        </span>
                        <div>
                          <h4 className="font-bold text-zinc-900 text-sm">Pet atendido</h4>
                          <p className="mt-0.5 text-xs text-zinc-500">O pet ficará associado ao tutor escolhido.</p>
                        </div>
                      </div>
                      {tutorMode === 'existing' && selectedTutor && (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            aria-pressed={petMode === 'existing'}
                            onClick={() => setPetMode('existing')}
                            disabled={!selectedTutor.pets?.length}
                            className={`py-2 rounded-xl text-xs font-semibold border transition disabled:opacity-40 ${
                              petMode === 'existing'
                                ? 'bg-teal-50 text-teal-800 border-teal-300'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                            }`}
                          >
                            Pet cadastrado
                          </button>
                          <button
                            type="button"
                            aria-pressed={petMode === 'new'}
                            onClick={() => setPetMode('new')}
                            className={`py-2 rounded-xl text-xs font-semibold border transition ${
                              petMode === 'new'
                                ? 'bg-teal-50 text-teal-800 border-teal-300'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                            }`}
                          >
                            Novo pet
                          </button>
                        </div>
                      )}
                      {tutorMode === 'existing' && petMode === 'existing' ? (
                        <label className="mt-3 block text-xs font-medium text-zinc-700">
                          Selecione o pet <span className="text-rose-600">*</span>
                          <select
                            value={selectedPetId}
                            onChange={event => setSelectedPetId(event.target.value)}
                            disabled={!selectedTutor}
                            className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                          >
                            <option value="">{selectedTutor ? 'Selecione o pet' : 'Escolha um tutor primeiro'}</option>
                            {(selectedTutor?.pets || []).map(pet => (
                              <option key={pet.id} value={pet.id}>
                                {pet.name}{pet.breed ? ` · ${pet.breed}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]">
                          <label className="block text-xs font-medium text-zinc-700">
                            Nome do pet <span className="text-rose-600">*</span>
                            <input
                              value={newPetName}
                              onChange={event => setNewPetName(event.target.value)}
                              placeholder="Ex.: Mel"
                              className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                            />
                          </label>
                          <label className="block text-xs font-medium text-zinc-700">
                            Espécie
                            <select
                              value={newPetSpecies}
                              onChange={event => setNewPetSpecies(event.target.value)}
                              className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                            >
                              <option value="dog">Cachorro</option>
                              <option value="cat">Gato</option>
                              <option value="bird">Ave</option>
                              <option value="other">Outro</option>
                            </select>
                          </label>
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border border-zinc-200/90 bg-[#fafbfb] p-4 sm:p-5">
                      <label className="flex min-h-11 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={scheduleService}
                          onChange={event => setScheduleService(event.target.checked)}
                          className="mt-1 h-4 w-4 accent-teal-700 rounded"
                        />
                        <span>
                          <strong className="flex items-center gap-2 text-zinc-900 text-sm">
                            <CalendarDays size={16} className="text-teal-600" /> Agendar um serviço agora
                          </strong>
                          <span className="mt-1 block text-xs text-zinc-500">
                            Opcional · o horário ficará na agenda Petshop e vinculado ao pet.
                          </span>
                        </span>
                      </label>
                      {scheduleService && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-medium text-zinc-700">
                            Serviço <span className="text-rose-600">*</span>
                            <select
                              value={selectedServiceId}
                              onChange={event => setSelectedServiceId(event.target.value)}
                              className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                            >
                              <option value="">{petshopDataLoading ? 'Carregando serviços…' : 'Selecione o serviço'}</option>
                              {petshopServices.map(service => (
                                <option key={service.id} value={service.id}>
                                  {service.name} · {service.durationMinutes} min
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs font-medium text-zinc-700">
                            Data e horário <span className="text-rose-600">*</span>
                            <input
                              type="datetime-local"
                              value={appointmentStartsAt}
                              onChange={event => setAppointmentStartsAt(event.target.value)}
                              className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                            />
                          </label>
                          <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                            Profissional responsável <span className="text-rose-600">*</span>
                            <select
                              value={selectedProfessionalId}
                              onChange={event => setSelectedProfessionalId(event.target.value)}
                              className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-zinc-900 text-xs sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                            >
                              <option value="">{petshopDataLoading ? 'Carregando equipe…' : 'Selecione quem fará o atendimento'}</option>
                              {petshopProfessionals.map(person => (
                                <option key={person.id} value={person.id}>
                                  {person.name}{person.jobTitle ? ` · ${person.jobTitle}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </section>
                    {petshopDataError && (
                      <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                        {petshopDataError}
                      </p>
                    )}
                  </div>
                ) : (
                  <label className={`block text-sm ${isLightModal ? 'text-zinc-700 font-medium' : 'text-zinc-300'}`}>
                    Nome do cliente <span className={isLightModal ? 'text-zinc-400' : 'text-zinc-500'}>(opcional)</span>
                    <input
                      value={launch.customer}
                      onChange={(e) => launch.setCustomer(e.target.value)}
                      placeholder="Como podemos chamar o cliente?"
                      className={`mt-2 w-full p-3 rounded-xl outline-none transition ${
                        isLightModal
                          ? `bg-white border border-zinc-200/90 text-zinc-900 ${isFoodTheme ? 'focus:border-[#C76A2A] focus:ring-[#C76A2A]/15' : 'focus:border-teal-600 focus:ring-teal-600/15'} focus:ring-2`
                          : 'bg-black/25 border border-zinc-700 text-white focus:border-amber-400'
                      }`}
                    />
                  </label>
                )}
              </div>
            ) : detailLoading && !selected ? (
              <div className={`flex-1 grid place-items-center ${isLightModal ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : !selected ? (
              <div className="flex-1 flex flex-col justify-center items-center p-10 text-center">
                <div className={`p-5 rounded-full mb-4 ${
                  isLightModal 
                    ? isFoodTheme 
                      ? 'bg-[#F7E5D6] text-[#C76A2A] border border-[#F8EBCF]' 
                      : 'bg-teal-50 text-teal-600 border border-teal-100' 
                    : 'bg-white/5 text-zinc-500'
                }`}>
                  {isPetshopTheme ? <PawPrint size={36} /> : <ReceiptText size={38} />}
                </div>
                <h3 className={`text-lg font-bold ${isLightModal ? 'text-zinc-800' : 'text-white'}`}>
                  {isPetshopTheme ? 'Selecione um atendimento' : 'Selecione uma comanda'}
                </h3>
                <p className={`text-sm mt-1.5 max-w-xs ${isLightModal ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {isPetshopTheme
                    ? 'Os serviços e produtos consumidos pelo pet aparecem aqui para conferência ou cobrança.'
                    : 'Os itens consumidos e as ações de atendimento aparecem aqui.'}
                </p>
              </div>
            ) : (
              <>
                <div className={`p-5 sm:p-6 border-b ${isLightModal ? 'border-zinc-100 bg-white' : 'border-white/5'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className={`text-xl sm:text-2xl font-black break-all ${isLightModal ? 'text-zinc-900' : 'text-white'}`}>
                        #{selected.number}
                      </h3>
                      {isFoodTheme && selected.number.toUpperCase().startsWith('WEB-') && (
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          Rastreio: {selected.number}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                        selected.status === 'waiting_payment'
                          ? isLightModal
                            ? 'bg-amber-50 text-amber-700 border-amber-200/80'
                            : 'bg-orange-400/10 text-orange-300 border-orange-400/20'
                          : isLightModal
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                            : 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${selected.status === 'waiting_payment' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      {selected.status === 'waiting_payment' ? 'Aguardando caixa' : 'Em atendimento'}
                    </span>
                  </div>
                  <div className={`flex flex-wrap gap-3 text-xs mt-2.5 ${isLightModal ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    <span className="flex items-center gap-1.5">
                      <User size={13} className={isLightModal ? 'text-zinc-400' : ''} />
                      Cliente: {selected.customerName || 'Não informado'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} className={isLightModal ? 'text-zinc-400' : ''} />
                      {elapsed(selected.createdAt)}
                    </span>
                    {selected.responsibleWaiter?.name && (
                      <span>Responsável: {selected.responsibleWaiter.name}</span>
                    )}
                  </div>
                  {isPetshopTheme && selectedPetshopLink && (
                    <div className="mt-4 rounded-2xl border border-teal-200/80 bg-teal-50/50 p-4">
                      <p className="flex items-center gap-2 text-xs font-bold text-teal-800">
                        <PawPrint size={15} className="text-teal-600" />
                        Vínculo Petshop
                      </p>
                      <p className="mt-1.5 text-sm font-bold text-zinc-900">
                        {selectedPetshopLink.tutorName} · {selectedPetshopLink.petName}
                      </p>
                      {selectedPetshopLink.appointment && (
                        <p className="mt-1 text-xs text-zinc-600">
                          {selectedPetshopLink.appointment.serviceName} ·{' '}
                          {new Date(selectedPetshopLink.appointment.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{' '}
                          · {selectedPetshopLink.appointment.professionalName}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {selected.status === 'waiting_payment' && (
                  <div className={`mx-5 sm:mx-6 mt-4 rounded-2xl p-3.5 flex items-start gap-3 text-xs ${
                    isLightModal
                      ? 'bg-amber-50/90 border border-amber-200/80 text-amber-900'
                      : 'bg-orange-500/10 border border-orange-500/20 text-orange-200'
                  }`}>
                    <AlertCircle size={16} className={`shrink-0 mt-0.5 ${isLightModal ? 'text-amber-600' : 'text-orange-400'}`} />
                    <div className="flex-1">
                      <p>
                        {isPetshopTheme
                          ? 'Comanda aguardando fechamento no caixa. Itens travados para evitar duplicidade.'
                          : 'Conta enviada ao caixa. Reabra para adicionar ou remover itens.'}
                      </p>
                      <button
                        type="button"
                        disabled={disabled || detailLoading || !!offlineAt}
                        onClick={() =>
                          setConfirm({ kind: 'reopen', comanda: selected })
                        }
                        className={`mt-1.5 font-bold inline-flex items-center gap-1.5 underline ${
                          isLightModal ? (isFoodTheme ? 'text-[#C76A2A] hover:text-[#B85E21]' : 'text-teal-700 hover:text-teal-800') : 'text-amber-300 hover:text-amber-200'
                        }`}
                      >
                        <UnlockKeyhole size={13} />
                        Reabrir para editar
                      </button>
                    </div>
                  </div>
                )}
                <div className={`flex items-center justify-between px-5 sm:px-6 pt-5 pb-2 text-xs font-bold uppercase tracking-wider ${
                  isLightModal ? 'text-zinc-400' : 'text-zinc-500'
                }`}>
                  <span>Itens consumidos</span>
                  <span>{activeItems.length} lançamento(s)</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 sm:px-6">
                  {!activeItems.length ? (
                    <p className={`py-12 text-center text-sm ${isLightModal ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      Esta comanda ainda não possui itens.
                    </p>
                  ) : (
                    <ul className={`divide-y ${isLightModal ? 'divide-zinc-100' : 'divide-white/5'}`}>
                      {activeItems.map((item) => {
                        const isService =
                          item.notes?.includes('SERVICO_PETSHOP') ||
                          (selectedPetshopLink?.appointment?.serviceName &&
                            item.product?.name?.toLowerCase().includes(selectedPetshopLink.appointment.serviceName.toLowerCase()));

                        return (
                          <li
                            key={item.id}
                            className="py-4 flex items-start gap-3"
                          >
                            <span className={`mt-0.5 w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 ${
                              isLightModal
                                ? isFoodTheme
                                  ? 'bg-emerald-50 border border-emerald-100/90 text-emerald-800'
                                  : 'bg-teal-50 border border-teal-100/90 text-teal-700'
                                : 'bg-white/5 text-zinc-300'
                            }`}>
                              {Number(item.quantity)}×
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-bold break-words ${isLightModal ? 'text-zinc-900' : 'text-white'}`}>
                                {item.product?.name || 'Produto'}
                              </p>
                              <p className={`mt-0.5 text-xs ${isLightModal ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                {money(item.unitPrice)} / unidade
                                {item.createdBy?.name
                                  ? ` · ${item.createdBy.name}`
                                  : ''}
                              </p>
                              {/* Food Badges */}
                              {isFoodTheme && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                    {item.product?.requiresKitchen ? 'Cozinha' : item.product?.requiresBar ? 'Bar' : (item.kdsStatus ? kdsLabels[item.kdsStatus] : 'Cozinha')}
                                  </span>
                                </div>
                              )}
                              {/* Petshop Badges */}
                              {isPetshopTheme && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {isService ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200/70">
                                      Serviço Pet Shop
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200/70">
                                      Produto
                                    </span>
                                  )}
                                  {selected.status === 'waiting_payment' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                      Pronto para levar
                                    </span>
                                  )}
                                </div>
                              )}
                              {item.modifiers?.map((m) => (
                                <p
                                  key={m.id}
                                  className={`mt-1 text-xs ${isLightModal ? 'text-zinc-600' : 'text-zinc-400'}`}
                                >
                                  + {m.name}
                                </p>
                              ))}
                              {item.notes && !item.notes.includes('SERVICO_PETSHOP') && (
                                <p className={`mt-1 text-xs whitespace-pre-wrap break-words ${isLightModal ? 'text-amber-800' : 'text-amber-200'}`}>
                                  {item.notes}
                                </p>
                              )}
                              {item.kdsStatus && (
                                <span
                                  className={`inline-block text-[10px] rounded-md px-2 py-1 mt-2 ${
                                    item.kdsStatus === 'READY'
                                      ? isLightModal ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' : 'bg-emerald-500/10 text-emerald-300'
                                      : isLightModal ? 'bg-zinc-100 text-zinc-600' : 'bg-white/5 text-zinc-400'
                                  }`}
                                >
                                  {kdsLabels[item.kdsStatus]}
                                </span>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={`text-sm font-bold tabular-nums ${isLightModal ? 'text-zinc-900' : 'text-white'}`}>
                                {money(item.totalPrice)}
                              </p>
                              {selected.status === 'open' && (
                                <button
                                  type="button"
                                  aria-label={`Remover ${item.product?.name || 'item'}`}
                                  disabled={
                                    disabled ||
                                    !!offlineAt ||
                                    detailLoading ||
                                    !!error
                                  }
                                  onClick={() => requestProtectedAction('remove', selected, item)}
                                  className={`p-1.5 -mr-1 mt-1 rounded-lg transition disabled:opacity-25 disabled:cursor-not-allowed ${
                                    isLightModal
                                      ? 'text-zinc-400 hover:text-red-500 hover:bg-red-50'
                                      : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
                                  }`}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className={`shrink-0 border-t p-5 sm:p-6 ${
                  isLightModal
                    ? 'border-zinc-100 bg-white'
                    : 'border-white/5 bg-black/10'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-sm ${isLightModal ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Total da comanda
                    </span>
                    <strong className={`text-2xl font-black tracking-tight tabular-nums ${
                      isLightModal ? 'text-zinc-900' : 'text-white'
                    }`}>
                      {money(selected.total)}
                    </strong>
                  </div>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      disabled={disabled || detailLoading || !!error || !!offlineAt}
                      onClick={() => requestProtectedAction('cancel', selected)}
                      className={`p-3.5 rounded-xl border transition disabled:opacity-35 shrink-0 ${
                        isLightModal
                          ? 'border-red-200 bg-red-50 text-red-500 hover:bg-red-100'
                          : 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                      }`}
                      title="Cancelar comanda com autorização"
                      aria-label="Cancelar comanda"
                    >
                      <Trash2 size={17} />
                    </button>
                    <button
                      type="button"
                      disabled={
                        disabled ||
                        detailLoading ||
                        !!error ||
                        !activeItems.length
                      }
                      onClick={charge}
                      className={`flex-1 flex justify-center items-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm shadow-sm transition disabled:opacity-35 ${
                        isLightModal
                          ? isFoodTheme
                            ? 'bg-[#047857] hover:bg-[#065f46] text-white'
                            : 'bg-teal-700 hover:bg-teal-800 text-white'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                      }`}
                    >
                      Cobrar no caixa
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
        {launch && (
          <footer className={`shrink-0 border-t px-5 sm:px-7 py-4 flex flex-wrap justify-between items-center gap-3 ${
            isLightModal
              ? 'border-zinc-100 bg-white text-zinc-900'
              : 'border-white/10 bg-[#191d22] text-white'
          }`}>
            <div>
              <p className={`text-xs ${isLightModal ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Adicionar do carrinho · {launch.quantity} item(ns)
              </p>
              <p className={`text-xl font-bold tabular-nums mt-0.5 ${
                isLightModal ? (isFoodTheme ? 'text-[#C76A2A]' : 'text-teal-700') : 'text-amber-300'
              }`}>
                {money(launch.total)}
              </p>
            </div>
            <button
              type="button"
              disabled={
                disabled ||
                !!offlineAt ||
                !!error ||
                detailLoading ||
                (isNew
                  ? (isPetshopTheme ? !petshopLaunchIsValid : !launch.number.trim())
                  : !selected || selected.status !== 'open')
              }
              onClick={() => launch.onConfirm(buildPetshopDraft())}
              className={`px-5 py-3 rounded-xl font-bold text-sm flex gap-2 items-center transition disabled:opacity-35 ${
                isLightModal
                  ? isFoodTheme
                    ? 'bg-[#047857] hover:bg-[#065f46] text-white shadow-sm'
                    : 'bg-teal-700 hover:bg-teal-800 text-white shadow-sm'
                  : 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
              }`}
            >
              {launch.busy ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Plus size={18} />
              )}
              {isPetshopTheme && isNew ? 'Criar atendimento e lançar' : 'Confirmar lançamento'}
            </button>
          </footer>
        )}
        {confirm && (
          <div className="absolute inset-0 z-10 flex justify-center items-center bg-black/60 backdrop-blur-xs p-4">
            <div
              ref={confirmation}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="comanda-confirm-title"
              className={`max-w-md w-full rounded-2xl p-6 shadow-2xl outline-none ${
                isPetshopTheme
                  ? 'border border-zinc-200/90 bg-white text-zinc-900'
                  : 'border border-zinc-700 bg-[#1a1e24] text-white'
              }`}
            >
              <AlertTriangle
                className={
                  confirm.kind === 'remove' || confirm.kind === 'decrease' || confirm.kind === 'cancel'
                    ? 'text-red-500'
                    : isPetshopTheme ? 'text-teal-600' : 'text-amber-400'
                }
                size={28}
              />
              <h3 id="comanda-confirm-title" className={`mt-4 text-xl font-bold ${isPetshopTheme ? 'text-zinc-900' : 'text-white'}`}>
                {confirm.kind === 'remove' || confirm.kind === 'decrease'
                  ? confirm.kind === 'decrease' ? 'Remover uma unidade da comanda?' : 'Remover item da comanda?'
                  : confirm.kind === 'cancel'
                    ? 'Cancelar comanda inteira?'
                  : confirm.kind === 'reopen'
                    ? 'Reabrir esta comanda?'
                    : 'Carregar comanda no caixa?'}
              </h3>
              <p className={`text-sm mt-2 ${isPetshopTheme ? 'text-zinc-600' : 'text-zinc-300'}`}>
                Comanda #{confirm.comanda.number}
                {confirm.item
                  ? ` · ${Number(confirm.item.quantity)}× ${confirm.item.product?.name} · ${money(confirm.item.totalPrice)}`
                  : ''}
              </p>
              <p className={`mt-2 text-xs ${isPetshopTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {confirm.kind === 'remove' || confirm.kind === 'decrease'
                  ? confirm.kind === 'decrease' ? 'Uma unidade será retirada deste lançamento, com estorno rastreável e recálculo da comanda.' : 'O lançamento será removido com estorno rastreável. A comanda continuará aberta.'
                  : confirm.kind === 'cancel'
                    ? 'A comanda não será apagada: itens, valores e auditoria serão preservados no histórico e não irão para o financeiro.'
                  : confirm.kind === 'reopen'
                    ? 'A conta voltará ao atendimento para permitir alterações nos itens.'
                    : 'Os itens desta comanda substituirão o carrinho atual para iniciar a cobrança.'}
              </p>
              {confirm.item?.kdsStatus && (
                <p className="mt-3 text-xs text-amber-600">
                  Produção: {kdsLabels[confirm.item.kdsStatus]}. A remoção também retira o item da fila do KDS.
                </p>
              )}
              {(confirm.kind === 'remove' || confirm.kind === 'decrease' || confirm.kind === 'cancel') && (
                <div className="mt-5 space-y-3">
                  <label className={`block text-[10px] font-bold uppercase tracking-wider ${isPetshopTheme ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    Motivo obrigatório
                    <input
                      value={authorizationReason}
                      onChange={(event) => setAuthorizationReason(event.target.value)}
                      maxLength={500}
                      placeholder="Ex.: lançamento duplicado"
                      className={`mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm outline-none transition ${
                        isPetshopTheme
                          ? 'border border-zinc-300 bg-white text-zinc-900 focus:border-red-500'
                          : 'border border-zinc-700 bg-black/25 text-white focus:border-red-400'
                      }`}
                    />
                  </label>
                  <label className={`block text-[10px] font-bold uppercase tracking-wider ${isPetshopTheme ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    PIN do Caixa ou Gerente
                    <input
                      type="password"
                      inputMode="numeric"
                      autoFocus
                      value={authorizationPin}
                      onChange={(event) => setAuthorizationPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                      placeholder="••••"
                      className={`mt-1.5 w-full rounded-xl px-3 py-2.5 text-center text-lg tracking-[0.4em] outline-none transition ${
                        isPetshopTheme
                          ? 'border border-zinc-300 bg-white text-zinc-900 focus:border-red-500'
                          : 'border border-zinc-700 bg-black/25 text-white focus:border-red-400'
                      }`}
                    />
                  </label>
                </div>
              )}
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => { setConfirm(null); setAuthorizationPin(''); setAuthorizationReason(''); }}
                  className={`flex-1 py-3 rounded-xl font-semibold transition ${
                    isPetshopTheme
                      ? 'border border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                      : 'bg-white/5 hover:bg-white/10 text-white'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => runAction(confirm)}
                  className={`flex-1 py-3 rounded-xl font-bold transition disabled:opacity-50 ${
                    confirm.kind === 'remove' || confirm.kind === 'decrease' || confirm.kind === 'cancel'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : isPetshopTheme
                        ? 'bg-teal-700 hover:bg-teal-800 text-white'
                        : 'bg-amber-400 text-zinc-950'
                  }`}
                >
                  {busy
                    ? 'Aguarde…'
                    : confirm.kind === 'remove' || confirm.kind === 'decrease'
                      ? confirm.kind === 'decrease' ? 'Remover uma unidade' : 'Autorizar remoção'
                      : confirm.kind === 'cancel'
                        ? 'Autorizar cancelamento'
                      : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    (isFoodTheme && document.getElementById('food-portals')) || document.body,
  );
}
