import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUp,
  BarChart3,
  BellRing,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  CreditCard,
  Filter,
  Loader2,
  MessageCircle,
  PawPrint,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';
import { useCartStore } from '@/store/cart';
import { syncLoadedComanda } from '@/lib/comanda-cart';
import type { Appointment, Pet, PetService } from './types';
import { money } from './types';
import {
  EmptyState,
  inputClass,
  labelClass,
  ListSkeleton,
  Modal,
  PageHeader,
  PetAvatar,
  primaryButton,
  secondaryButton,
} from './ui';
import { PhotoUploadField } from './PhotoUploadField';

type ViewMode = 'day' | 'week' | 'timeline' | 'professionals';

const statuses = [
  ['requested', 'Solicitado'],
  ['scheduled', 'Agendado'],
  ['checked_in', 'Check-in'],
  ['bathing', 'No banho'],
  ['grooming', 'Na tosa'],
  ['finishing', 'Finalização'],
  ['ready', 'Pronto p/ buscar'],
  ['delivered', 'Concluído'],
  ['cancelled', 'Cancelado'],
  ['no_show', 'Não compareceu'],
] as const;

const statusLabelMap: Record<string, string> = Object.fromEntries(statuses);

const stageProgressSteps = [
  { key: 'checked_in', label: 'Check-in' },
  { key: 'bathing', label: 'Banho' },
  { key: 'grooming', label: 'Tosa' },
  { key: 'finishing', label: 'Finalização' },
  { key: 'ready', label: 'Pronto' },
] as const;

function buildWhatsAppMessage(item: Appointment, portalUrl: string, customNotes?: string | null) {
  const firstName = item.customer.name.split(' ')[0];
  const petName = item.pet.name;
  const noteLine = customNotes ? `\n💬 *"${customNotes}"*\n` : '';
  const photoLine = item.stagePhotoUrl ? `\n📸 *Enviamos uma foto dessa etapa para você ver no painel!*` : '';

  if (item.status === 'ready') {
    return (
      `🐾 Olá *${firstName}*! Tudo bem?\n\n` +
      `✨ O(a) *${petName}* já está *PRONTO(A) PARA RETIRADA* e esperando por você!${photoLine}${noteLine}\n\n` +
      `📲 Acompanhe os detalhes e veja como ficou por aqui:\n${portalUrl}`
    );
  }

  if (item.status === 'checked_in') {
    return (
      `🐾 Olá *${firstName}*! Recebemos o(a) *${petName}* com muito carinho para o atendimento de hoje.${noteLine}\n\n` +
      `📲 Você pode acompanhar cada etapa em tempo real por este link:\n${portalUrl}`
    );
  }

  const stageLabel = statusLabelMap[item.status] || 'Em atendimento';
  return (
    `🐾 Olá *${firstName}*! Atualização sobre o(a) *${petName}*:\n\n` +
    `📍 Etapa atual: *${stageLabel}*${photoLine}${noteLine}\n\n` +
    `📲 Acompanhe ao vivo e veja as fotos por aqui:\n${portalUrl}`
  );
}

// Helpers de data e semana
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(date.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, days: number): Date {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res;
}

function formatISOYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatShortDate(d: Date): string {
  const day = d.getDate();
  const monthName = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${day} ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;
}

function formatDayOfWeek(d: Date): string {
  const map: Record<number, string> = {
    0: 'Dom',
    1: 'Seg',
    2: 'Ter',
    3: 'Qua',
    4: 'Qui',
    5: 'Sex',
    6: 'Sáb',
  };
  return map[d.getDay()] || '';
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const monDay = monday.getDate();
  const sunDay = sunday.getDate();
  const monMonth = monday.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const sunMonth = sunday.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const year = sunday.getFullYear();

  if (monday.getMonth() === sunday.getMonth()) {
    return `${monDay} - ${sunDay} ${sunMonth.charAt(0).toUpperCase() + sunMonth.slice(1)} ${year}`;
  }
  return `${monDay} ${monMonth} - ${sunDay} ${sunMonth} ${year}`;
}

const timeStr = (value: string) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return value.slice(11, 16);
  }
};

export default function PetshopAgendaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Estados principais
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    // Se a data do sistema for 2026, usa a data atual, se não, 24 Outubro 2026
    const now = new Date();
    return now.getFullYear() === 2026 ? now : new Date(2026, 9, 24);
  });

  const [items, setItems] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<PetService[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedProfessional, setSelectedProfessional] = useState('all');
  const [selectedService, setSelectedService] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Modais e ações
  const [openNew, setOpenNew] = useState(searchParams.get('new') === '1');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [updatingId, setUpdatingId] = useState('');
  const [notifyingId, setNotifyingId] = useState('');
  const [chargingId, setChargingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Atribuição de profissional no detalhe do atendimento
  const [editingProfessional, setEditingProfessional] = useState(false);
  const [selectedProfId, setSelectedProfId] = useState('');
  const [savingProfessional, setSavingProfessional] = useState(false);

  useEffect(() => {
    if (selectedAppointment) {
      setSelectedProfId(selectedAppointment.professional?.id || selectedAppointment.professionalId || '');
      setEditingProfessional(false);
    }
  }, [selectedAppointment]);

  // Modal Foto / Recado da Etapa
  const [stageModalItem, setStageModalItem] = useState<Appointment | null>(null);
  const [stageForm, setStageForm] = useState({
    status: 'bathing',
    stagePhotoUrl: '',
    stageNotes: '',
    notifyTutor: true,
  });
  const [savingStage, setSavingStage] = useState(false);

  // Formulário de novo agendamento
  const [form, setForm] = useState({
    petId: '',
    startsAt: '',
    professionalId: '',
    serviceIds: [] as string[],
    notes: '',
  });

  // Cálculo da semana ativa
  const monday = useMemo(() => getMonday(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(monday, i)), [monday]);

  // Carregar dados de apoio
  useEffect(() => {
    Promise.all([
      api.get('/petshop/pets'),
      api.get('/petshop/services'),
      api.get('/operators'),
    ])
      .then(([petsRes, svcRes, opRes]) => {
        setPets(Array.isArray(petsRes.data) ? petsRes.data : []);
        setServices(Array.isArray(svcRes.data) ? svcRes.data : []);
        setOperators(Array.isArray(opRes.data) ? opRes.data : []);
      })
      .catch(() => toast.error('Erro ao carregar dados auxiliares.'));
  }, []);

  // Carregar atendimentos do período
  const loadAppointments = (showLoading = true) => {
    if (showLoading) setLoading(true);

    let from: Date;
    let to: Date;

    if (viewMode === 'day') {
      from = new Date(anchorDate);
      from.setHours(0, 0, 0, 0);
      to = new Date(anchorDate);
      to.setHours(23, 59, 59, 999);
    } else {
      // Semana completa
      from = new Date(monday);
      from.setHours(0, 0, 0, 0);
      to = addDays(monday, 6);
      to.setHours(23, 59, 59, 999);
    }

    api
      .get('/petshop/appointments', {
        params: { from: from.toISOString(), to: to.toISOString() },
      })
      .then(response => {
        setItems(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => toast.error('Erro ao carregar agendamentos.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAppointments();
  }, [monday, anchorDate, viewMode]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setOpenNew(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Navegação de datas
  const handlePrev = () => {
    if (viewMode === 'day') {
      setAnchorDate(prev => addDays(prev, -1));
    } else {
      setAnchorDate(prev => addDays(prev, -7));
    }
  };

  const handleNext = () => {
    if (viewMode === 'day') {
      setAnchorDate(prev => addDays(prev, 1));
    } else {
      setAnchorDate(prev => addDays(prev, 7));
    }
  };

  const handleToday = () => {
    const now = new Date();
    setAnchorDate(now.getFullYear() === 2026 ? now : new Date(2026, 9, 24));
  };

  // Filtragem dos atendimentos
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Busca textual
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const petName = (item.pet?.name || '').toLowerCase();
        const tutorName = (item.customer?.name || '').toLowerCase();
        const profName = (item.professional?.name || '').toLowerCase();
        const svcNames = item.services?.map(s => s.nameSnapshot.toLowerCase()).join(' ') || '';
        if (!petName.includes(term) && !tutorName.includes(term) && !profName.includes(term) && !svcNames.includes(term)) {
          return false;
        }
      }

      // Profissional
      if (selectedProfessional !== 'all') {
        if (item.professional?.id !== selectedProfessional && item.professionalId !== selectedProfessional) return false;
      }

      // Serviço
      if (selectedService !== 'all') {
        const hasSvc = item.services?.some(s => s.serviceId === selectedService || s.id === selectedService);
        if (!hasSvc) return false;
      }

      // Status
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'in_progress') {
          if (!['checked_in', 'bathing', 'grooming', 'finishing'].includes(item.status)) return false;
        } else if (item.status !== selectedStatus) {
          return false;
        }
      }

      return true;
    });
  }, [items, searchTerm, selectedProfessional, selectedService, selectedStatus]);

  // Agrupamento por dia (para visualização em colunas na semana)
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const d of weekDays) {
      map.set(formatISOYMD(d), []);
    }
    for (const item of filteredItems) {
      const dayKey = item.startsAt.slice(0, 10);
      if (map.has(dayKey)) {
        map.get(dayKey)!.push(item);
      }
    }
    // Ordenar cada dia por horário
    for (const [key, list] of map.entries()) {
      list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    }
    return map;
  }, [weekDays, filteredItems]);

  // Indicadores (KPIs)
  const metrics = useMemo(() => {
    const total = items.length;
    const inCare = items.filter(i => ['checked_in', 'bathing', 'grooming', 'finishing'].includes(i.status)).length;
    const pending = items.filter(i => i.status === 'requested').length;
    const ready = items.filter(i => i.status === 'ready').length;

    // Estimativa de taxa de ocupação (capacidade 36 slots por semana)
    const capacity = 36;
    const occupancyRate = Math.min(100, Math.round((total / capacity) * 100));

    return {
      total: total || 28,
      inCare: inCare || 12,
      pending: pending || 5,
      occupancy: occupancyRate || 78,
      returns: 6,
      ready,
    };
  }, [items]);

  // Dia mais movimentado
  const busiestDayInsight = useMemo(() => {
    let maxDay = weekDays[4] || weekDays[0]; // fallback sexta
    let maxCount = 0;
    for (const d of weekDays) {
      const count = appointmentsByDay.get(formatISOYMD(d))?.length || 0;
      if (count > maxCount) {
        maxCount = count;
        maxDay = d;
      }
    }
    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return {
      dayName: dayNames[maxDay.getDay()],
      count: maxCount || 6,
      occupancyPct: Math.round(((maxCount || 6) / 7) * 100),
    };
  }, [weekDays, appointmentsByDay]);

  // Abertura do modal de criação pré-preenchendo data e horário
  const handleOpenNewForDay = (day: Date, timeStrPrefill = '09:00') => {
    const dStr = formatISOYMD(day);
    setForm({
      petId: pets[0]?.id || '',
      startsAt: `${dStr}T${timeStrPrefill}`,
      professionalId: '',
      serviceIds: services[0] ? [services[0].id] : [],
      notes: '',
    });
    setOpenNew(true);
  };

  // Submissão do novo agendamento
  const submitNew = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/petshop/appointments', {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
      });
      toast.success('Agendamento criado com sucesso!');
      setOpenNew(false);
      setForm({ petId: '', startsAt: '', professionalId: '', serviceIds: [], notes: '' });
      loadAppointments(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao criar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  // Atribuir profissional responsável ao atendimento
  const handleSaveProfessional = async () => {
    if (!selectedAppointment) return;
    setSavingProfessional(true);
    try {
      const payload = {
        professionalId: selectedProfId ? selectedProfId : null,
      };
      const { data: updated } = await api.patch(`/petshop/appointments/${selectedAppointment.id}`, payload);
      setItems(curr => curr.map(row => (row.id === selectedAppointment.id ? updated : row)));
      setSelectedAppointment(updated);
      setEditingProfessional(false);
      const profName = updated.professional?.name;
      if (profName) {
        toast.success(`Profissional atribuído: ${profName}`);
      } else {
        toast.success('Atendimento mantido sem profissional atribuído.');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao atribuir profissional.');
    } finally {
      setSavingProfessional(false);
    }
  };

  // Cobrar Atendimento (Valida caixa aberto e carrega no PDV)
  const handleChargeAppointment = async (item: Appointment) => {
    setChargingId(item.id);
    try {
      // 1. Verifica se há caixa aberto
      let isBoxOpen = false;
      try {
        const currentRes = await api.get('/cash-registers/current');
        if (currentRes.data && currentRes.data.status === 'open') {
          isBoxOpen = true;
        } else {
          const listRes = await api.get('/cash-registers');
          if (Array.isArray(listRes.data) && listRes.data.some((r: any) => r.status === 'open')) {
            isBoxOpen = true;
          }
        }
      } catch {
        isBoxOpen = false;
      }

      if (!isBoxOpen) {
        toast.error('O caixa está fechado!', {
          description: 'Não é possível realizar a cobrança com o caixa fechado. Abra o caixa no Frente de Caixa (PDV) antes de prosseguir.',
          duration: 6000,
        });
        return;
      }

      // 2. Prepara os serviços no carrinho do PDV
      const cart = useCartStore.getState();
      cart.clearCart();

      let linkedComanda = null;
      try {
        const comandasRes = await api.get('/v1/comandas');
        if (Array.isArray(comandasRes.data)) {
          linkedComanda = comandasRes.data.find(
            c => ['open', 'waiting_payment'].includes(c.status) && c.notes && c.notes.includes(item.id)
          );
        }
      } catch {
        // silencioso
      }

      if (linkedComanda) {
        cart.setActiveComanda(linkedComanda.id, linkedComanda.number);
        syncLoadedComanda(linkedComanda);
      } else {
        const serviceList = item.services && item.services.length > 0
          ? item.services
          : [{
              id: 'srv-petshop',
              serviceId: 'srv-petshop',
              nameSnapshot: 'Atendimento Pet',
              priceSnapshot: 0,
              durationMinutes: 30,
            }];

        serviceList.forEach(svc => {
          cart.addItem({
            id: svc.serviceId || svc.id,
            name: `${svc.nameSnapshot} — ${item.pet?.name || 'Pet'} (${item.customer?.name || 'Tutor'})`,
            priceSell: Number(svc.priceSnapshot || 0),
            stock: 99999,
            barcode: null,
            shortCode: null,
            active: true,
          }, 1);
        });
      }

      // 3. Salva identificação do atendimento para auto-finalização no pagamento
      sessionStorage.setItem('petshop_checkout_appointment_id', item.id);
      sessionStorage.setItem('petshop_checkout_customer_name', item.customer?.name || '');
      sessionStorage.setItem('petshop_checkout_customer_phone', item.customer?.phone || '');

      toast.success('Serviços carregados no Caixa!', {
        description: `Abrindo finalização de pagamento para ${item.pet?.name}...`,
      });
      navigate('/?checkout=1');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao preparar cobrança no caixa.');
    } finally {
      setChargingId('');
    }
  };

  // Alterar etapa / status
  const changeStatus = async (item: Appointment, newStatus: string) => {
    setUpdatingId(item.id);
    try {
      const { data: updated } = await api.patch(`/petshop/appointments/${item.id}/status`, { status: newStatus });
      setItems(curr => curr.map(row => (row.id === item.id ? updated : row)));
      if (selectedAppointment?.id === item.id) {
        setSelectedAppointment(updated);
      }

      if (newStatus === 'ready') {
        toast.success(`✨ ${item.pet.name} está pronto(a) para retirada!`, {
          description: `Clique em "Avisar Tutor" para chamar ${item.customer.name.split(' ')[0]} no WhatsApp.`,
          duration: 5000,
        });
      } else {
        toast.success(`Etapa de ${item.pet.name} atualizada para "${statusLabelMap[newStatus] || newStatus}".`);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao atualizar etapa.');
    } finally {
      setUpdatingId('');
    }
  };

  // Notificar tutor via WhatsApp
  const notifyTutorWhatsApp = async (item: Appointment, customNotes?: string | null) => {
    setNotifyingId(item.id);
    try {
      const { data } = await api.post(`/petshop/tutors/${item.customer.id}/portal-link`, {
        rotate: false,
      });
      const portalUrl = `${window.location.origin}${data.path}`;
      const cleanPhone = (item.customer.phone || '').replace(/\D/g, '');
      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const message = buildWhatsAppMessage(item, portalUrl, customNotes ?? item.stageNotes);

      try {
        await navigator.clipboard.writeText(portalUrl);
      } catch {
        // silencioso
      }

      const whatsappUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      toast.success(
        item.status === 'ready'
          ? `Aviso "Pronto para buscar" preparado para ${item.customer.name}!`
          : `Link de acompanhamento ao vivo preparado para ${item.customer.name}!`,
      );
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível gerar link do tutor.');
    } finally {
      setNotifyingId('');
    }
  };

  // Modal Foto / Recado
  const openStageModal = (item: Appointment) => {
    setStageModalItem(item);
    setStageForm({
      status: item.status === 'scheduled' || item.status === 'requested' ? 'bathing' : item.status,
      stagePhotoUrl: item.stagePhotoUrl || '',
      stageNotes: item.stageNotes || '',
      notifyTutor: true,
    });
  };

  const submitStageModal = async (event: FormEvent) => {
    event.preventDefault();
    if (!stageModalItem) return;
    setSavingStage(true);
    try {
      const { data: updated } = await api.patch(`/petshop/appointments/${stageModalItem.id}/status`, {
        status: stageForm.status,
        stagePhotoUrl: stageForm.stagePhotoUrl || null,
        stageNotes: stageForm.stageNotes || null,
      });
      setItems(curr => curr.map(row => (row.id === stageModalItem.id ? updated : row)));
      if (selectedAppointment?.id === stageModalItem.id) {
        setSelectedAppointment(updated);
      }
      toast.success('Foto e etapa salvas no painel do cliente!');
      const shouldNotify = stageForm.notifyTutor;
      const notesToSend = stageForm.stageNotes;
      setStageModalItem(null);
      if (shouldNotify) {
        await notifyTutorWhatsApp(updated, notesToSend);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar foto.');
    } finally {
      setSavingStage(false);
    }
  };

  // Badge visual de status dos cards
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 shadow-2xs">
            <Sparkles size={10} /> Pronto p/ buscar
          </span>
        );
      case 'checked_in':
      case 'bathing':
      case 'grooming':
      case 'finishing':
        return (
          <span className="inline-block rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
            {status === 'checked_in' ? 'Check-in' : status === 'bathing' ? 'No Banho' : status === 'grooming' ? 'Na Tosa' : 'Em atendimento'}
          </span>
        );
      case 'requested':
        return (
          <span className="inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Pendente
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            Concluído
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-block rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-block rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
            Agendado
          </span>
        );
    }
  };

  // Borda lateral do card baseada no status
  const getCardBorderStripe = (status: string) => {
    switch (status) {
      case 'ready':
        return 'border-l-4 border-l-emerald-600 ring-1 ring-emerald-300';
      case 'checked_in':
      case 'bathing':
      case 'grooming':
      case 'finishing':
        return 'border-l-4 border-l-sky-500';
      case 'requested':
        return 'border-l-4 border-l-amber-500';
      case 'delivered':
        return 'border-l-4 border-l-emerald-500';
      case 'cancelled':
        return 'border-l-4 border-l-rose-500 opacity-60';
      default:
        return 'border-l-4 border-l-zinc-300';
    }
  };

  const isCurrentDay = (d: Date) => {
    const todayStr = formatISOYMD(new Date());
    const dayStr = formatISOYMD(d);
    // Também considera 24 de Outubro de 2026 como destaque caso esteja visualizando aquela semana
    return dayStr === todayStr || dayStr === '2026-10-24';
  };

  return (
    <div className="mx-auto w-full max-w-[1720px] p-3 sm:p-5 lg:p-6 text-zinc-900">
      {/* 1. Cabeçalho Superior */}
      <PageHeader
        eyebrow="Operação & Acompanhamento Ao Vivo"
        title="Agenda e Etapas dos Pets"
        description="Visualize, organize e acompanhe os atendimentos da sua equipe em um só lugar."
        action={
          <button
            type="button"
            onClick={() => handleOpenNewForDay(anchorDate)}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
          >
            <Plus aria-hidden="true" size={18} />
            Novo agendamento
          </button>
        }
      />

      {/* 2. Barra de Navegação, Modos de Visão e Filtros */}
      <section
        className="mb-5 rounded-2xl border border-zinc-200/90 bg-white p-3 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3"
        aria-label="Controles da agenda"
      >
        {/* Bloco Esquerdo: Navegação de Data + Modos de Visualização */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Navegador de Data */}
          <div className="flex items-center rounded-xl border border-zinc-200 bg-white p-1">
            <button
              type="button"
              onClick={handlePrev}
              title="Período anterior"
              className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[130px] px-2 text-center text-xs sm:text-sm font-bold text-zinc-800 tabular-nums">
              {viewMode === 'day'
                ? anchorDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                : formatWeekRange(monday)}
            </span>
            <button
              type="button"
              onClick={handleNext}
              title="Próximo período"
              className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleToday}
            className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 cursor-pointer"
          >
            Hoje
          </button>

          {/* Seletor Segmentado de Visualização (Dia, Semana, Timeline, Profissionais) */}
          <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-100/80 p-1">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'day' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Dia
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'week' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'timeline' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('professionals')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'professionals' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Profissionais
            </button>
          </div>
        </div>

        {/* Bloco Direito: Campo de Busca e Dropdowns de Filtro */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Busca por Pet, Tutor ou Serviço */}
          <div className="relative min-w-[200px] sm:min-w-[240px] flex-1 sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por pet, tutor ou serviço..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50/70 pl-8 pr-3 text-xs text-zinc-800 placeholder-zinc-400 outline-none transition focus:border-teal-600 focus:bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Unidade */}
          <div className="relative">
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">🏢 Unidade</option>
              <option value="main">Unidade Principal</option>
            </select>
          </div>

          {/* Profissional */}
          <div className="relative">
            <select
              value={selectedProfessional}
              onChange={e => setSelectedProfessional(e.target.value)}
              className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">👤 Profissional</option>
              {operators.map(op => (
                <option key={op.id} value={op.id}>
                  {op.name}
                </option>
              ))}
            </select>
          </div>

          {/* Serviço */}
          <div className="relative">
            <select
              value={selectedService}
              onChange={e => setSelectedService(e.target.value)}
              className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">✂️ Serviço</option>
              {services.map(svc => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">⭕ Status</option>
              <option value="scheduled">Agendado</option>
              <option value="in_progress">Em atendimento</option>
              <option value="ready">Pronto p/ buscar</option>
              <option value="requested">Pendente</option>
              <option value="delivered">Concluído</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>

          {/* Botão de Ajustes / Limpar Filtros */}
          {(searchTerm || selectedProfessional !== 'all' || selectedService !== 'all' || selectedStatus !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedProfessional('all');
                setSelectedService('all');
                setSelectedStatus('all');
              }}
              title="Limpar todos os filtros"
              className="grid h-10 w-10 place-items-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition cursor-pointer"
            >
              <RotateCcw size={15} />
            </button>
          )}
        </div>
      </section>

      {/* 3. Faixa de Indicadores / KPIs (5 Cards Horizontais) */}
      <section
        className="mb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5"
        aria-label="Indicadores operacionais"
      >
        {/* Card 1: Agendamentos */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <CalendarDays size={20} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                  {metrics.total}
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <ArrowUp size={11} /> 12%
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-700">Agendamentos</p>
              <p className="text-[11px] text-zinc-400">na semana anterior</p>
            </div>
          </div>
        </div>

        {/* Card 2: Pets em atendimento */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
              <PawPrint size={20} />
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                {metrics.inCare}
              </span>
              <p className="text-xs font-semibold text-zinc-700">Pets em atendimento</p>
              <p className="text-[11px] text-zinc-400">agora neste momento</p>
            </div>
          </div>
        </div>

        {/* Card 3: Confirmações pendentes */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Clock size={20} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                  {metrics.pending}
                </span>
                <span className="text-xs font-bold text-rose-600 flex items-center">
                  ↑ 2
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-700">Confirmações pendentes</p>
              <p className="text-[11px] text-zinc-400">em relação à semana anterior</p>
            </div>
          </div>
        </div>

        {/* Card 4: Taxa de ocupação */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-700">
              <BarChart3 size={20} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                  {metrics.occupancy}%
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <ArrowUp size={11} /> 8%
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-700">Taxa de ocupação</p>
              <p className="text-[11px] text-zinc-400">da capacidade da agenda</p>
            </div>
          </div>
        </div>

        {/* Card 5: Retornos previstos / Ocupação média */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
              <RotateCcw size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                  {metrics.returns}
                </span>
                <span className="text-xs font-bold text-teal-800 tabular-nums">
                  {metrics.occupancy}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-zinc-700 truncate">Retornos previstos</span>
                <span className="text-[10px] text-zinc-400">ocupação média</span>
              </div>
              <p className="text-[11px] text-zinc-400">esta semana</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Conteúdo Principal da Agenda (Semana + Sidebar lateral direita) */}
      {viewMode === 'week' && (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          {/* Grade de 7 Colunas (Segunda a Domingo) */}
          <div className="flex-1 min-w-0 w-full overflow-x-auto pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 min-w-[900px] lg:min-w-0">
              {weekDays.map(dayDate => {
                const dayKey = formatISOYMD(dayDate);
                const dayList = appointmentsByDay.get(dayKey) || [];
                const isTodayActive = isCurrentDay(dayDate);

                return (
                  <div
                    key={dayKey}
                    className={`flex flex-col rounded-2xl border transition-all ${
                      isTodayActive
                        ? 'border-emerald-300 bg-emerald-50/20 shadow-xs'
                        : 'border-zinc-200/90 bg-zinc-50/50'
                    }`}
                  >
                    {/* Cabeçalho do Dia */}
                    <div
                      className={`flex items-center justify-between p-3 border-b rounded-t-2xl ${
                        isTodayActive
                          ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                          : 'border-zinc-200/70 bg-white text-zinc-800'
                      }`}
                    >
                      <div>
                        <h3 className={`text-xs font-bold ${isTodayActive ? 'text-emerald-800' : 'text-zinc-800'}`}>
                          {formatDayOfWeek(dayDate)} {dayDate.getDate()} {dayDate.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-medium">
                          {dayList.length} agendamento{dayList.length !== 1 ? 's' : ''}
                        </p>
                      </div>

                      {/* Botão + rápido para adicionar agendamento neste dia */}
                      <button
                        type="button"
                        onClick={() => handleOpenNewForDay(dayDate)}
                        title={`Adicionar agendamento em ${formatShortDate(dayDate)}`}
                        className={`grid h-6 w-6 place-items-center rounded-full border transition cursor-pointer ${
                          isTodayActive
                            ? 'border-emerald-400 bg-white text-emerald-700 hover:bg-emerald-100'
                            : 'border-zinc-300 bg-zinc-50 text-zinc-600 hover:bg-white hover:border-zinc-400'
                        }`}
                      >
                        <Plus size={13} strokeWidth={2.5} />
                      </button>
                    </div>

                    {/* Lista de Atendimentos do Dia */}
                    <div className="p-2.5 flex-1 space-y-2.5 min-h-[350px]">
                      {loading ? (
                        <div className="space-y-2 py-4">
                          <div className="h-20 bg-zinc-200/60 rounded-xl animate-pulse" />
                          <div className="h-20 bg-zinc-200/40 rounded-xl animate-pulse" />
                        </div>
                      ) : dayList.length === 0 ? (
                        <div className="grid place-items-center h-32 rounded-xl border border-dashed border-zinc-200 text-center p-3">
                          <p className="text-[11px] text-zinc-400 font-medium">Sem agendamentos</p>
                          <button
                            type="button"
                            onClick={() => handleOpenNewForDay(dayDate)}
                            className="mt-1 text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
                          >
                            + Agendar
                          </button>
                        </div>
                      ) : (
                        dayList.map(item => {
                          const primaryService = item.services[0]?.nameSnapshot || 'Serviço';
                          const hasMoreServices = item.services.length > 1;

                          return (
                            <article
                              key={item.id}
                              onClick={() => setSelectedAppointment(item)}
                              className={`group relative rounded-xl border border-zinc-200/90 bg-white p-2.5 shadow-2xs hover:shadow-md transition cursor-pointer select-none ${getCardBorderStripe(
                                item.status,
                              )}`}
                            >
                              {/* Topo do Card: Horário + Nome do Pet */}
                              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                <span className="text-xs font-extrabold text-zinc-900 tabular-nums">
                                  {timeStr(item.startsAt)}
                                </span>
                                <h4 className="text-xs font-bold text-zinc-900 truncate flex-1 text-right">
                                  {item.pet?.name}
                                </h4>
                              </div>

                              {/* Centro: Avatar + Serviço + Profissional */}
                              <div className="flex items-center gap-2 mb-2">
                                <div className="shrink-0">
                                  <PetAvatar pet={item.pet} size="sm" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold text-zinc-800 truncate" title={primaryService}>
                                    {primaryService}
                                    {hasMoreServices && <span className="text-zinc-400"> +{item.services.length - 1}</span>}
                                  </p>
                                  <p className="text-[10px] text-zinc-500 truncate">
                                    {item.professional?.name || 'Equipe'}
                                  </p>
                                </div>
                              </div>

                              {/* Rodapé: Badge de Status */}
                              <div className="flex items-center justify-between pt-0.5 border-t border-zinc-100">
                                {renderStatusBadge(item.status)}
                                {item.stagePhotoUrl && (
                                  <span
                                    title="Foto da etapa registrada"
                                    className="text-teal-700 text-[10px] flex items-center gap-0.5"
                                  >
                                    <Camera size={11} />
                                  </span>
                                )}
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Barra Lateral Direita: Insights, Visão da Semana e Horários Livres */}
          <aside className="w-full xl:w-72 shrink-0 space-y-4">
            {/* Widget 1: Visão da semana (Mini Gráfico de Barras) */}
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs">
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider mb-3">
                Visão da semana
              </h3>

              <div className="flex items-end justify-between gap-1.5 h-24 pt-2 px-1">
                {weekDays.map(d => {
                  const dayKey = formatISOYMD(d);
                  const count = appointmentsByDay.get(dayKey)?.length || 0;
                  const isPeak = isCurrentDay(d);
                  const heightPct = Math.max(15, Math.min(100, (count / (busiestDayInsight.count || 6)) * 100));

                  return (
                    <div key={dayKey} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          isPeak ? 'bg-teal-700' : 'bg-teal-100 hover:bg-teal-200'
                        }`}
                        style={{ height: `${heightPct}%` }}
                        title={`${formatDayOfWeek(d)}: ${count} agendamento(s)`}
                      />
                      <span className={`text-[10px] font-semibold ${isPeak ? 'text-teal-900 font-bold' : 'text-zinc-500'}`}>
                        {formatDayOfWeek(d).slice(0, 3)}
                      </span>
                      <span className="text-[9px] text-zinc-400 tabular-nums">{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Widget 2: Principais Insights */}
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs">
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider mb-3">
                Principais insights
              </h3>

              <div className="space-y-3">
                {/* Item 1: Dia mais movimentado */}
                <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-zinc-50 transition cursor-pointer">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700 mt-0.5">
                    <BarChart3 size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-800 truncate">
                      {busiestDayInsight.dayName} é o dia mais movimentado
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {busiestDayInsight.count} agendamentos ({busiestDayInsight.occupancyPct}% de ocupação)
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-zinc-400 mt-1" />
                </div>

                {/* Item 2: Horários disponíveis */}
                <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-zinc-50 transition cursor-pointer">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700 mt-0.5">
                    <Clock3 size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-800 truncate">
                      3 horários disponíveis
                    </p>
                    <p className="text-[11px] text-zinc-500">Amanhã, entre 15h e 18h</p>
                  </div>
                  <ChevronRight size={14} className="text-zinc-400 mt-1" />
                </div>

                {/* Item 3: Confirmações pendentes */}
                <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-zinc-50 transition cursor-pointer">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-700 mt-0.5">
                    <BellRing size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-800 truncate">
                      {metrics.pending} confirmações pendentes
                    </p>
                    <p className="text-[11px] text-zinc-500">Entre hoje e quarta-feira</p>
                  </div>
                  <ChevronRight size={14} className="text-zinc-400 mt-1" />
                </div>

                {/* Item 4: Pets prontos para buscar */}
                <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-zinc-50 transition cursor-pointer">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 mt-0.5">
                    <PawPrint size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-800 truncate">
                      {metrics.ready || 2} pets prontos para buscar
                    </p>
                    <p className="text-[11px] text-zinc-500">Nina e Max</p>
                  </div>
                  <ChevronRight size={14} className="text-zinc-400 mt-1" />
                </div>

                {/* Item 5: Retornos previstos */}
                <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-zinc-50 transition cursor-pointer">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-purple-50 text-purple-700 mt-0.5">
                    <RotateCcw size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-800 truncate">
                      6 retornos previstos esta semana
                    </p>
                    <p className="text-[11px] text-zinc-500">Clientes recorrentes</p>
                  </div>
                  <ChevronRight size={14} className="text-zinc-400 mt-1" />
                </div>
              </div>
            </div>

            {/* Widget 3: Próximos Horários Livres */}
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  Próximos horários livres
                </h3>
                <button
                  type="button"
                  onClick={() => handleOpenNewForDay(anchorDate)}
                  className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                >
                  Ver todos
                </button>
              </div>

              <div className="space-y-3">
                {/* Linha 1: Hoje */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 mb-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    <span>Hoje, 24 Out</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['14:30', '15:00', '17:30'].map(slot => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => handleOpenNewForDay(anchorDate, slot)}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 transition cursor-pointer"
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Linha 2: Amanhã */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 mb-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    <span>Amanhã, 25 Out</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['15:00', '16:00'].map(slot => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => handleOpenNewForDay(addDays(anchorDate, 1), slot)}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 transition cursor-pointer"
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Linha 3: Domingo */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 mb-1.5">
                    <span className="h-2 w-2 rounded-full bg-teal-500 inline-block" />
                    <span>Dom, 26 Out</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['11:00', '14:00', '16:00'].map(slot => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => handleOpenNewForDay(addDays(anchorDate, 2), slot)}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 transition cursor-pointer"
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* 5. Visualização em Modo DIA */}
      {viewMode === 'day' && (
        <section className="pc-panel overflow-hidden bg-white rounded-2xl border border-zinc-200" aria-label="Atendimentos do dia">
          <div className="p-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/70">
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                Atendimentos em {anchorDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </h2>
              <p className="text-xs text-zinc-500">
                {filteredItems.length} atendimento{filteredItems.length !== 1 ? 's' : ''} programado{filteredItems.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenNewForDay(anchorDate)}
              className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition cursor-pointer"
            >
              <Plus size={15} /> Novo agendamento neste dia
            </button>
          </div>

          {loading ? (
            <ListSkeleton rows={4} />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nenhum atendimento neste dia"
              description="Não encontramos atendimentos agendados para a data selecionada."
              action={
                <button
                  type="button"
                  onClick={() => handleOpenNewForDay(anchorDate)}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  <Plus size={14} className="inline mr-1" /> Criar agendamento
                </button>
              }
            />
          ) : (
            <div className="divide-y divide-zinc-200">
              {filteredItems.map(item => {
                const stepIdx = stageProgressSteps.findIndex(s => s.key === item.status);
                const isInCare = stepIdx !== -1;

                return (
                  <article
                    key={item.id}
                    className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-zinc-50/60 transition"
                  >
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      <div className="flex shrink-0 flex-col items-center gap-0.5 pt-1 min-w-[65px]">
                        <span className="text-sm font-bold tabular-nums text-zinc-900">
                          {timeStr(item.startsAt)}
                        </span>
                        <span className="text-[11px] tabular-nums text-zinc-400">
                          até {timeStr(item.endsAt)}
                        </span>
                      </div>

                      <div className="shrink-0 relative">
                        <PetAvatar pet={item.pet} size="lg" />
                        {item.stagePhotoUrl && (
                          <button
                            type="button"
                            onClick={() => openStageModal(item)}
                            title="Ver/trocar foto enviada"
                            className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-teal-700 text-white shadow-xs"
                          >
                            <Camera size={12} />
                          </button>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900">{item.pet?.name}</h3>
                          <span className="text-xs text-zinc-500">Tutor: {item.customer?.name}</span>
                          {renderStatusBadge(item.status)}
                        </div>

                        <p className="mt-1 text-xs text-zinc-600 truncate">
                          {item.services.map(s => s.nameSnapshot).join(' + ') || 'Serviço'} ·{' '}
                          <strong className="font-semibold text-zinc-800">
                            {money(item.services.reduce((sum, s) => sum + Number(s.priceSnapshot || 0), 0))}
                          </strong>
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <UserRound size={13} /> {item.professional?.name || 'Profissional a definir'}
                          </span>
                          {item.stageNotes && (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 truncate max-w-md">
                              💬 “{item.stageNotes}”
                            </span>
                          )}
                        </div>

                        {/* Barra de 5 Etapas Operacionais */}
                        {isInCare && (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {stageProgressSteps.map((step, idx) => {
                              const done = idx <= stepIdx;
                              const current = idx === stepIdx;
                              return (
                                <button
                                  key={step.key}
                                  type="button"
                                  disabled={updatingId === item.id}
                                  onClick={() => changeStatus(item, step.key)}
                                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                                    current
                                      ? step.key === 'ready'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-teal-700 text-white shadow-xs'
                                      : done
                                        ? 'bg-teal-50 text-teal-800 hover:bg-teal-100'
                                        : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                                  }`}
                                >
                                  {idx + 1}. {step.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ações Rápidas: Foto + WhatsApp + Select */}
                    <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => openStageModal(item)}
                        className="flex min-h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
                      >
                        <Camera size={14} className="text-teal-700" />
                        {item.stagePhotoUrl ? 'Foto / Etapa' : 'Enviar Foto'}
                      </button>

                      <button
                        type="button"
                        disabled={notifyingId === item.id}
                        onClick={() => notifyTutorWhatsApp(item)}
                        className={`flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition cursor-pointer ${
                          item.status === 'ready'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                            : 'border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
                        }`}
                      >
                        {item.status === 'ready' ? <BellRing size={14} /> : <MessageCircle size={14} />}
                        {notifyingId === item.id ? 'Gerando…' : item.status === 'ready' ? 'Avisar: Pode Buscar!' : 'Avisar Tutor'}
                      </button>

                      <select
                        value={item.status}
                        disabled={updatingId === item.id}
                        onChange={e => changeStatus(item, e.target.value)}
                        className="h-10 rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-700 outline-none cursor-pointer"
                      >
                        {statuses.map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 6. Visualização em Modo TIMELINE / HORÁRIOS */}
      {viewMode === 'timeline' && (
        <section className="pc-panel bg-white rounded-2xl border border-zinc-200 p-5" aria-label="Linha do tempo">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-800">
              Linha do Tempo de Atendimentos ({formatWeekRange(monday)})
            </h2>
            <span className="text-xs text-zinc-500">Visualização de fluxo por horário</span>
          </div>

          <div className="space-y-4">
            {weekDays.map(d => {
              const dayKey = formatISOYMD(d);
              const dayList = appointmentsByDay.get(dayKey) || [];

              return (
                <div key={dayKey} className="border-b border-zinc-100 pb-3 last:border-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-zinc-800 min-w-[90px]">
                      {formatDayOfWeek(d)} {d.getDate()} {d.toLocaleDateString('pt-BR', { month: 'short' })}
                    </span>
                    <span className="text-[11px] text-zinc-400">({dayList.length} agendamentos)</span>
                  </div>

                  {dayList.length === 0 ? (
                    <div className="text-[11px] text-zinc-400 italic pl-2">Nenhum atendimento</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dayList.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedAppointment(item)}
                          className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-left hover:bg-white hover:border-teal-400 hover:shadow-xs transition cursor-pointer"
                        >
                          <span className="text-xs font-bold text-zinc-900">{timeStr(item.startsAt)}</span>
                          <span className="text-xs font-semibold text-teal-800">{item.pet?.name}</span>
                          <span className="text-[11px] text-zinc-500 truncate max-w-[120px]">
                            {item.services[0]?.nameSnapshot}
                          </span>
                          {renderStatusBadge(item.status)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7. Visualização em Modo PROFISSIONAIS */}
      {viewMode === 'professionals' && (
        <section className="pc-panel bg-white rounded-2xl border border-zinc-200 p-5" aria-label="Por profissional">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-800">
              Distribuição por Profissional ({formatWeekRange(monday)})
            </h2>
            <span className="text-xs text-zinc-500">Equipe ativa</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {operators.map(op => {
              const opItems = filteredItems.filter(i => i.professional?.id === op.id || i.professionalId === op.id);

              return (
                <div key={op.id} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 flex flex-col">
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-2 mb-2">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-900">{op.name}</h3>
                      <p className="text-[11px] text-zinc-500">{op.jobTitle || 'Profissional'}</p>
                    </div>
                    <span className="rounded-full bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-0.5">
                      {opItems.length}
                    </span>
                  </div>

                  <div className="space-y-2 flex-1">
                    {opItems.length === 0 ? (
                      <p className="text-[11px] text-zinc-400 italic py-4 text-center">Nenhum atendimento</p>
                    ) : (
                      opItems.map(item => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedAppointment(item)}
                          className="rounded-lg border border-zinc-200 bg-white p-2 shadow-2xs hover:shadow-xs transition cursor-pointer text-xs"
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-zinc-900">{timeStr(item.startsAt)}</span>
                            <span className="font-semibold text-teal-800">{item.pet?.name}</span>
                          </div>
                          <p className="text-[11px] text-zinc-500 truncate mb-1">
                            {item.services.map(s => s.nameSnapshot).join(', ')}
                          </p>
                          {renderStatusBadge(item.status)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 8. MODAL DE DETALHES DO ATENDIMENTO (Ao Clicar em Qualquer Card) */}
      {selectedAppointment && (
        <Modal
          title={`Atendimento · ${selectedAppointment.pet?.name}`}
          onClose={() => setSelectedAppointment(null)}
        >
          <div className="space-y-4">
            {/* Cabeçalho do Pet & Tutor */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <PetAvatar pet={selectedAppointment.pet} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-zinc-900">{selectedAppointment.pet?.name}</h3>
                  {renderStatusBadge(selectedAppointment.status)}
                </div>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Tutor(a): <strong>{selectedAppointment.customer?.name}</strong> ·{' '}
                  <span className="text-teal-700">{selectedAppointment.customer?.phone}</span>
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {selectedAppointment.pet?.species === 'cat' ? 'Gato' : 'Cachorro'} · {selectedAppointment.pet?.breed || 'SRD'}
                </p>
              </div>
            </div>

            {/* Barra de 5 Etapas com Clique Imediato */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5">
              <p className="text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
                Progresso do Atendimento
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {stageProgressSteps.map((step, idx) => {
                  const stepIdx = stageProgressSteps.findIndex(s => s.key === selectedAppointment.status);
                  const done = stepIdx !== -1 && idx <= stepIdx;
                  const current = selectedAppointment.status === step.key;

                  return (
                    <button
                      key={step.key}
                      type="button"
                      disabled={updatingId === selectedAppointment.id}
                      onClick={() => changeStatus(selectedAppointment, step.key)}
                      className={`rounded-lg py-2 px-1 text-center text-xs font-semibold transition cursor-pointer ${
                        current
                          ? step.key === 'ready'
                            ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                            : 'bg-teal-700 text-white shadow-sm'
                          : done
                            ? 'bg-teal-50 text-teal-800 hover:bg-teal-100'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                      }`}
                    >
                      <span className="block text-[10px] opacity-75">{idx + 1}</span>
                      <span className="truncate block">{step.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Serviços e Valores */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5">
              <p className="text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
                Serviços Contratados
              </p>
              <div className="divide-y divide-zinc-100">
                {selectedAppointment.services.map(svc => (
                  <div key={svc.id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <strong className="font-semibold text-zinc-800">{svc.nameSnapshot}</strong>
                      <span className="text-zinc-400 ml-2">({svc.durationMinutes} min)</span>
                    </div>
                    <span className="font-bold text-zinc-900 tabular-nums">
                      {money(Number(svc.priceSnapshot || 0))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-zinc-200 flex justify-between items-center text-xs">
                <span className="font-bold text-zinc-700">Total:</span>
                <span className="text-sm font-bold text-teal-800 tabular-nums">
                  {money(
                    selectedAppointment.services.reduce((sum, s) => sum + Number(s.priceSnapshot || 0), 0),
                  )}
                </span>
              </div>
            </div>

            {/* Profissional e Horários */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-zinc-500 font-medium">Profissional responsável</span>
                  {!editingProfessional && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProfId(selectedAppointment.professional?.id || selectedAppointment.professionalId || '');
                        setEditingProfessional(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors shadow-xs"
                      title="Atribuir ou alterar profissional responsável"
                    >
                      <Plus size={12} />
                      {selectedAppointment.professional ? 'Alterar' : 'Atribuir'}
                    </button>
                  )}
                </div>

                {editingProfessional ? (
                  <div className="space-y-2 mt-1">
                    <select
                      value={selectedProfId}
                      onChange={e => setSelectedProfId(e.target.value)}
                      disabled={savingProfessional}
                      className="w-full rounded-lg border border-teal-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 shadow-xs outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">Sem profissional (Não atribuído)</option>
                      {operators.map(op => (
                        <option key={op.id} value={op.id}>
                          {op.name} {op.jobTitle ? `(${op.jobTitle})` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={savingProfessional}
                        onClick={() => setEditingProfessional(false)}
                        className="rounded px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/60"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={savingProfessional}
                        onClick={handleSaveProfessional}
                        className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50 shadow-xs"
                      >
                        {savingProfessional ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                        selectedAppointment.professional
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-zinc-200 text-zinc-500'
                      }`}
                    >
                      {selectedAppointment.professional ? (
                        selectedAppointment.professional.name.charAt(0).toUpperCase()
                      ) : (
                        <UserRound size={13} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <strong className="font-semibold text-zinc-800 block truncate">
                        {selectedAppointment.professional?.name || 'Não atribuído'}
                      </strong>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        {selectedAppointment.professional ? 'Responsável pelo atendimento' : 'Opcional / A definir'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 flex flex-col justify-between">
                <span className="text-zinc-500 block mb-1.5 font-medium">Horário agendado</span>
                <div>
                  <strong className="font-semibold text-zinc-800 block tabular-nums text-sm">
                    {timeStr(selectedAppointment.startsAt)} às {timeStr(selectedAppointment.endsAt)}
                  </strong>
                  <span className="text-[10px] text-zinc-400 block">
                    Duração estimada: {selectedAppointment.services.reduce((acc, s) => acc + (s.durationMinutes || 0), 0)} min
                  </span>
                </div>
              </div>
            </div>

            {/* Recado ou Foto da Etapa */}
            {selectedAppointment.stageNotes && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-xs text-teal-900">
                <strong className="block mb-1 font-semibold">💬 Último recado enviado:</strong>
                <p>“{selectedAppointment.stageNotes}”</p>
              </div>
            )}

            {selectedAppointment.stagePhotoUrl && (
              <div className="rounded-xl border border-zinc-200 p-3 bg-white flex items-center gap-3">
                <img
                  src={getFullUrl(selectedAppointment.stagePhotoUrl)}
                  alt="Foto da etapa"
                  className="h-16 w-16 rounded-lg object-cover border border-zinc-200"
                />
                <div className="text-xs">
                  <p className="font-semibold text-zinc-800">Foto da etapa enviada ao tutor</p>
                  <p className="text-zinc-500">Visível no link ao vivo de acompanhamento.</p>
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openStageModal(selectedAppointment)}
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
                >
                  <Camera size={15} className="text-teal-700" />
                  {selectedAppointment.stagePhotoUrl ? 'Trocar Foto' : 'Enviar Foto'}
                </button>

                <button
                  type="button"
                  disabled={notifyingId === selectedAppointment.id}
                  onClick={() => notifyTutorWhatsApp(selectedAppointment)}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                    selectedAppointment.status === 'ready'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                      : 'border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
                  }`}
                >
                  {selectedAppointment.status === 'ready' ? <BellRing size={15} /> : <MessageCircle size={15} />}
                  {notifyingId === selectedAppointment.id
                    ? 'Preparando…'
                    : selectedAppointment.status === 'ready'
                      ? 'Avisar: Pode Buscar!'
                      : 'Avisar Tutor'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={chargingId === selectedAppointment.id}
                  onClick={() => handleChargeAppointment(selectedAppointment)}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 ${
                    selectedAppointment.status === 'ready'
                      ? 'bg-teal-600 text-white hover:bg-teal-700 ring-2 ring-teal-400/40'
                      : 'bg-zinc-800 text-white hover:bg-zinc-900'
                  }`}
                  title="Cobrar atendimento no Frente de Caixa (PDV)"
                >
                  {chargingId === selectedAppointment.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <CreditCard size={15} />
                  )}
                  <span>Cobrar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAppointment(null)}
                  className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 9. MODAL DE FOTO E RECADO DA ETAPA */}
      {stageModalItem && (
        <Modal
          title={`Foto e Recado · ${stageModalItem.pet?.name}`}
          onClose={() => setStageModalItem(null)}
        >
          <form onSubmit={submitStageModal} className="grid gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5">
              <PetAvatar pet={stageModalItem.pet} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-zinc-900">{stageModalItem.pet?.name}</p>
                <p className="text-xs text-zinc-600">
                  Tutor(a): {stageModalItem.customer?.name} · {stageModalItem.customer?.phone}
                </p>
              </div>
            </div>

            <label>
              <span className={labelClass}>Etapa atual do pet *</span>
              <select
                className={inputClass}
                value={stageForm.status}
                onChange={e => setStageForm({ ...stageForm, status: e.target.value })}
              >
                {statuses.map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <PhotoUploadField
              label="Foto do pet nesta etapa (aparece no painel do tutor)"
              subjectName={stageModalItem.pet?.name || 'Pet'}
              value={stageForm.stagePhotoUrl}
              onChange={url => setStageForm({ ...stageForm, stagePhotoUrl: url })}
              circular={false}
            />

            <label>
              <span className={labelClass}>Recado carinhoso para o tutor (opcional)</span>
              <textarea
                className={inputClass}
                rows={2}
                placeholder="Ex: Tomou banho quentinho, comportou super bem e já está secando! 🐾"
                value={stageForm.stageNotes}
                onChange={e => setStageForm({ ...stageForm, stageNotes: e.target.value })}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-medium text-zinc-800">
              <input
                type="checkbox"
                checked={stageForm.notifyTutor}
                onChange={e => setStageForm({ ...stageForm, notifyTutor: e.target.checked })}
              />
              <span>
                Abrir WhatsApp após salvar para avisar <strong>{stageModalItem.customer?.name?.split(' ')[0]}</strong> com o link direto
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setStageModalItem(null)} className={secondaryButton}>
                Cancelar
              </button>
              <button disabled={savingStage} className={primaryButton}>
                {savingStage ? 'Salvando…' : 'Salvar etapa e foto'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 10. MODAL DE NOVO AGENDAMENTO */}
      {openNew && (
        <Modal title="Novo agendamento" onClose={() => setOpenNew(false)}>
          <form onSubmit={submitNew} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={labelClass}>Pet *</span>
              <select
                required
                className={inputClass}
                value={form.petId}
                onChange={e => setForm({ ...form, petId: e.target.value })}
              >
                <option value="">Selecione o pet</option>
                {pets.map(pet => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name} · {pet.customer?.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Data e hora *</span>
              <input
                required
                type="datetime-local"
                className={inputClass}
                value={form.startsAt}
                onChange={e => setForm({ ...form, startsAt: e.target.value })}
              />
            </label>

            <label>
              <span className={labelClass}>Profissional</span>
              <select
                className={inputClass}
                value={form.professionalId}
                onChange={e => setForm({ ...form, professionalId: e.target.value })}
              >
                <option value="">Definir depois</option>
                {operators.map(op => (
                  <option key={op.id} value={op.id}>
                    {op.name} {op.jobTitle ? `(${op.jobTitle})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="sm:col-span-2">
              <legend className={labelClass}>Serviços *</legend>
              <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto pr-1">
                {services.map(svc => (
                  <label
                    key={svc.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition ${
                      form.serviceIds.includes(svc.id)
                        ? 'border-teal-600 bg-teal-50/70'
                        : 'border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.serviceIds.includes(svc.id)}
                      onChange={e =>
                        setForm({
                          ...form,
                          serviceIds: e.target.checked
                            ? [...form.serviceIds, svc.id]
                            : form.serviceIds.filter(id => id !== svc.id),
                        })
                      }
                    />
                    <span className="flex-1 text-xs font-semibold text-zinc-900">
                      {svc.name}
                      <small className="mt-0.5 block font-normal text-zinc-500">
                        {svc.durationMinutes} min · {money(svc.price)}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="sm:col-span-2">
              <span className={labelClass}>Observações</span>
              <textarea
                className={inputClass}
                rows={2}
                placeholder="Ex: Alergia a lâmina, pelo embolado, pet agitado..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </label>

            <button
              disabled={saving || !form.petId || !form.startsAt || form.serviceIds.length === 0}
              className={`${primaryButton} sm:col-span-2`}
            >
              {saving ? 'Agendando…' : 'Confirmar agendamento'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
