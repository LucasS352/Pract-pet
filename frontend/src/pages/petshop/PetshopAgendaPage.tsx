import { ReceptionRegistrationModal } from './ReceptionRegistrationModal';
import { PaymentModal } from '@/components/PaymentModal';
import { CancelAppointmentModal } from './CancelAppointmentModal';
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal';
import { buildWhatsAppMessage } from './appointment-media';
import { usePetshopContext } from '@/layouts/PetshopLayout';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUp,
  BarChart3,
  BellRing,
  Building2,
  CalendarDays,
  Car,
  MapPin,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Coins,
  MessageSquare,
  CreditCard,
  Filter,
  History,
  Loader2,
  MessageCircle,
  PackageCheck,
  PawPrint,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';


import type { Appointment, CustomerPetPackage, Pet, PetService, Tutor } from './types';
import { money, resolveAppointmentStages, resolveAppointmentSteps, getStageLabel } from './types';
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
import { TaxiDogWidget } from './TaxiDogWidget';
import { packageTransportCovers, packageTransportUiMode } from './taxi-operations';

type ViewMode = 'day' | 'week' | 'timeline' | 'professionals';
type FrequentBookingTutor = Pick<Tutor, 'id' | 'name' | 'phone'> & {
  pet: Pick<Pet, 'id' | 'name' | 'species' | 'photoUrl'> | null;
  appointmentsCount: number;
  lastVisitAt: string;
};
type BookingTutorDirectory = { items: Array<Pick<Tutor, 'id' | 'name' | 'phone'>>; page: number; hasMore: boolean };

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

const STAGE_LABELS: Record<string, string> = {
  checked_in: 'Check-in',
  bathing: 'Banho',
  grooming: 'Tosa',
  finishing: 'Finalização',
  ready: 'Pronto',
};

function getAppointmentSteps(apt: Appointment) {
  return resolveAppointmentSteps(apt);
}

function hasTaxiDogReturn(apt: Appointment) {
  return Boolean(apt.transport?.enabled && ['round_trip', 'both', 'dropoff_only', 'dropoff'].includes(apt.transport.mode));
}

function normalizeSizeKey(rawSize?: string | null): string {
  if (!rawSize) return 'small';
  const s = rawSize.toLowerCase().trim();
  if (s.includes('mini')) return 'mini';
  if (s.includes('pequeno') || s === 'small' || s === 'p') return 'small';
  if (s.includes('médio') || s.includes('medio') || s === 'medium' || s === 'm') return 'medium';
  if (s.includes('grande') || s === 'large' || s === 'g') return 'large';
  if (s.includes('gigante') || s === 'giant' || s === 'gg') return 'giant';
  return s;
}

function sizeLabel(size?: string | null): string {
  if (!size) return 'Não informado';
  const s = normalizeSizeKey(size);
  const map: Record<string, string> = {
    mini: 'Mini (< 5kg)',
    small: 'Pequeno (5-10kg)',
    medium: 'Médio (10-20kg)',
    large: 'Grande (20-35kg)',
    giant: 'Gigante (> 35kg)',
  };
  return map[s] || size;
}

function getEffectiveServicePrice(svc: PetService, pet?: Pet | null): { price: number; duration: number; variantLabel?: string } {
  if (!pet || !svc.pricingRules || svc.pricingRules.length === 0) {
    return { price: Number(svc.price), duration: svc.durationMinutes };
  }
  const rules = svc.pricingRules;
  const petSize = normalizeSizeKey(pet.size);
  const match1 = rules.find(r => r.size === petSize && r.coatType === pet.coatType);
  if (match1) return { price: Number(match1.price), duration: match1.durationMinutes || svc.durationMinutes, variantLabel: match1.label || sizeLabel(petSize) };

  const match2 = rules.find(r => r.size === petSize && (!r.coatType || r.coatType === 'all'));
  if (match2) return { price: Number(match2.price), duration: match2.durationMinutes || svc.durationMinutes, variantLabel: match2.label || sizeLabel(petSize) };

  const match3 = rules.find(r => (!r.size || r.size === 'all') && r.coatType === pet.coatType);
  if (match3) return { price: Number(match3.price), duration: match3.durationMinutes || svc.durationMinutes, variantLabel: match3.label || `Pelo ${pet.coatType}` };

  return { price: Number(svc.price), duration: svc.durationMinutes };
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
  const { tenant, isRestrictedStaff } = usePetshopContext();
  const [searchParams, setSearchParams] = useSearchParams();

  // Estados principais
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [showAllWeekMobile, setShowAllWeekMobile] = useState(false);
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const linkedDate = searchParams.get('date');
    if (linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate)) return new Date(`${linkedDate}T12:00:00`);
    // Se a data do sistema for 2026, usa a data atual, se não, 24 Outubro 2026
    const now = new Date();
    return now;
  });

  const [items, setItems] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedTutor, setSelectedTutor] = useState<Pick<Tutor, 'id' | 'name' | 'phone'> | null>(null);
  const [tutorQuery, setTutorQuery] = useState('');
  const [tutorResults, setTutorResults] = useState<Array<Pick<Tutor, 'id' | 'name' | 'phone'>>>([]);
  const [searchingTutors, setSearchingTutors] = useState(false);
  const [searchedTutorQuery, setSearchedTutorQuery] = useState('');
  const [tutorSearchError, setTutorSearchError] = useState(false);
  const [frequentTutors, setFrequentTutors] = useState<FrequentBookingTutor[]>([]);
  const [loadingFrequentTutors, setLoadingFrequentTutors] = useState(false);
  const [frequentTutorsError, setFrequentTutorsError] = useState(false);
  const [frequentRetry, setFrequentRetry] = useState(0);
  const [showTutorDirectory, setShowTutorDirectory] = useState(false);
  const [directoryTutors, setDirectoryTutors] = useState<BookingTutorDirectory['items']>([]);
  const [directoryPage, setDirectoryPage] = useState(0);
  const [directoryHasMore, setDirectoryHasMore] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState(false);
  const [loadingBookingPets, setLoadingBookingPets] = useState(false);
  const [bookingPetsError, setBookingPetsError] = useState(false);
  const petsRequest = useRef(0);
  const bookingPetsController = useRef<AbortController | null>(null);
  const directoryController = useRef<AbortController | null>(null);
  const directoryRequest = useRef(0);
  const transportEdited = useRef(false);
  const [taxiDefaultFee, setTaxiDefaultFee] = useState('40');
  useEffect(() => {
    api.get<{ fee: number }>('/petshop/taxi-default-fee')
      .then(({ data }) => {
        const fee = String(data.fee);
        setTaxiDefaultFee(fee);
        if (!transportEdited.current) setForm(current => ({ ...current, transportFee: fee }));
      })
      .catch(() => toast.error('Não foi possível carregar o preço padrão do Táxi Dog.'));
  }, []);
  const [services, setServices] = useState<PetService[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const appointmentsRequest = useRef(0);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('all');
  const [selectedService, setSelectedService] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSex, setSelectedSex] = useState('all');
  const [selectedSize, setSelectedSize] = useState('all');
  const [hideCompleted, setHideCompleted] = useState(false);

  // Modais e ações
  const [openReception, setOpenReception] = useState(false);
  const [openNew, setOpenNew] = useState(searchParams.get('new') === '1');
  useEffect(() => {
    if (openNew) return;
    ++petsRequest.current;
    bookingPetsController.current?.abort();
    ++directoryRequest.current;
    directoryController.current?.abort();
    setLoadingBookingPets(false);
    setLoadingDirectory(false);
    setShowTutorDirectory(false);
    setDirectoryTutors([]);
    setDirectoryPage(0);
    setDirectoryHasMore(false);
  }, [openNew]);

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentPayment, setAppointmentPayment] = useState<{ saleId: string; total: number; paidAt: string; nfceStatus?: string | null } | null>(null);
  const [reversePaymentOpen, setReversePaymentOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [reversingPayment, setReversingPayment] = useState(false);
  useEffect(() => {
    setAppointmentPayment(null);
    if (!selectedAppointment?.id || isRestrictedStaff) return;
    const controller = new AbortController();
    api.get(`/petshop/appointments/${selectedAppointment.id}/payment`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setAppointmentPayment(data?.saleId ? data : null); })
      .catch(() => { if (!controller.signal.aborted) setAppointmentPayment(null); });
    return () => controller.abort();
  }, [selectedAppointment?.id, isRestrictedStaff]);
  const [updatingId, setUpdatingId] = useState('');
  const [notifyingId, setNotifyingId] = useState('');
  const [paymentItem, setPaymentItem] = useState<{ appointment: Appointment; total: number; prepay?: boolean } | null>(null);
  const [chargeNow, setChargeNow] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [receiving, setReceiving] = useState(false);
  const [chargingId, setChargingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Modais de cancelamento e reagendamento fácil
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<Appointment | null>(null);

  // Atribuição de profissional, reagendamento e adição de serviços no meio do atendimento
  const [editingProfessional, setEditingProfessional] = useState(false);
  const [selectedProfId, setSelectedProfId] = useState('');
  const [savingProfessional, setSavingProfessional] = useState(false);

  const [editingReschedule, setEditingReschedule] = useState(false);
  const [rescheduleStartsAt, setRescheduleStartsAt] = useState('');
  const [savingReschedule, setSavingReschedule] = useState(false);

  const [addingExtraService, setAddingExtraService] = useState(false);
  const [extraServiceId, setExtraServiceId] = useState('');
  const [extraServicePrice, setExtraServicePrice] = useState('');
  const [savingExtraService, setSavingExtraService] = useState(false);

  useEffect(() => {
    if (selectedAppointment) {
      setSelectedProfId(selectedAppointment.professional?.id || selectedAppointment.professionalId || '');
      setEditingProfessional(false);
      setEditingReschedule(false);
      setAddingExtraService(false);
      setExtraServiceId('');
      setExtraServicePrice('');
      try {
        const dt = new Date(selectedAppointment.startsAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        setRescheduleStartsAt(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
      } catch {
        setRescheduleStartsAt('');
      }
    }
  }, [selectedAppointment]);

  // Modal Foto / Recado da Etapa
  const [stageModalItem, setStageModalItem] = useState<Appointment | null>(null);
  const [stageForm, setStageForm] = useState({
    status: 'bathing',
    stagePhotoUrl: '',
    stageNotes: '',
    notifyTutor: false,
  });
  const [savingStage, setSavingStage] = useState(false);

  // Formulário de novo agendamento
  const [form, setForm] = useState({
    petId: '',
    startsAt: '',
    professionalId: '',
    serviceIds: [] as string[],
    notes: '',
    transportEnabled: false,
    transportMode: 'both' as 'pickup' | 'dropoff' | 'both',
    transportFee: taxiDefaultFee,
    transportCoveredByPackage: false,
    customerStreet: '',
    customerNeighborhood: '',
    customerReference: '',
    transportNotes: '',
    saveAddressToCustomer: true,
  });
  const [availablePackages, setAvailablePackages] = useState<CustomerPetPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState(false);
  const [packagesRequest, retryPackages] = useState(0);
  const coveredServiceIds = useMemo(() => new Set(availablePackages.flatMap(pkg => pkg.items.filter(item => Number(item.availableQuantity) > 0).map(item => item.serviceId))), [availablePackages]);
  const [packageSelections, setPackageSelections] = useState<Record<string, string>>({});
  const selectedTransportPackages = useMemo(() => availablePackages.filter(pkg =>
    pkg.transport?.enabled && form.serviceIds.some(serviceId => packageSelections[serviceId] === pkg.id),
  ), [availablePackages, form.serviceIds, packageSelections]);

  const parseAddressParts = (addr?: string | null) => {
    if (!addr) return { street: '', neighborhood: '' };
    if (addr.includes(' - ')) {
      const parts = addr.split(' - ');
      return { street: parts[0].trim(), neighborhood: parts.slice(1).join(' - ').trim() };
    }
    return { street: addr.trim(), neighborhood: '' };
  };

  // A troca de pet/data invalida a consulta anterior e sua cobertura.
  useEffect(() => {
    setAvailablePackages([]);
    setPackageSelections({});
    setPackagesError(false);
    if (!openNew || !form.petId) { setLoadingPackages(false); return; }
    const controller = new AbortController();
    setLoadingPackages(true);
    const date = new Date(form.startsAt);
    const dateParam = Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
    api.get(`/petshop/packages/available/${form.petId}`, { params: { date: dateParam }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const pkgs: CustomerPetPackage[] = (Array.isArray(data) ? data : []).filter((pkg: CustomerPetPackage) => pkg.status === 'active' && pkg.paymentStatus === 'paid' && pkg.items?.some(item => Number(item.availableQuantity) > 0));
        setAvailablePackages(pkgs);
        const selections: Record<string, string> = {};
        for (const serviceId of form.serviceIds) {
          const pkg = pkgs.find(p => p.items.some(item => item.serviceId === serviceId && Number(item.availableQuantity) > 0));
          if (pkg) selections[serviceId] = pkg.id;
        }
        setPackageSelections(selections);
      })
      .catch(() => { if (!controller.signal.aborted) setPackagesError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoadingPackages(false); });
    return () => controller.abort();
  }, [openNew, form.petId, form.startsAt, packagesRequest]);

  useEffect(() => {
    if (!openNew) return;
    const first = selectedTransportPackages[0]?.transport;
    setForm(prev => {
      if (!first) {
        return prev.transportCoveredByPackage
          ? { ...prev, transportCoveredByPackage: false, transportFee: prev.transportFee === '0' ? taxiDefaultFee : prev.transportFee }
          : prev;
      }
      const mode = transportEdited.current ? prev.transportMode : packageTransportUiMode(first.mode);
      const covered = selectedTransportPackages.some(pkg => packageTransportCovers(mode, pkg.transport?.mode));
      const parsed = parseAddressParts(first.address);
      return {
        ...prev,
        transportEnabled: transportEdited.current ? prev.transportEnabled : true,
        transportMode: mode as typeof prev.transportMode,
        transportCoveredByPackage: Boolean(covered),
        transportFee: covered ? '0' : prev.transportFee === '0' ? taxiDefaultFee : prev.transportFee,
        customerStreet: prev.customerStreet || first.street || parsed.street || '',
        customerNeighborhood: prev.customerNeighborhood || first.neighborhood || parsed.neighborhood || '',
        customerReference: prev.customerReference || first.reference || '',
        transportNotes: prev.transportNotes || first.notes || '',
      };
    });
  }, [openNew, selectedTransportPackages, form.transportMode, taxiDefaultFee]);

  // Cálculo da semana ativa
  const monday = useMemo(() => getMonday(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(monday, i)), [monday]);

  // Carregar dados de apoio
  useEffect(() => {
    Promise.all([
      api.get('/petshop/services'),
      api.get('/operators'),
    ])
      .then(([svcRes, opRes]) => {
        setServices(Array.isArray(svcRes.data) ? svcRes.data : []);
        setOperators(Array.isArray(opRes.data) ? opRes.data : []);
      })
      .catch(() => toast.error('Erro ao carregar dados auxiliares.'));
  }, []);

  useEffect(() => {
    if (!openNew) return;
    const controller = new AbortController();
    setLoadingFrequentTutors(true);
    setFrequentTutorsError(false);
    api.get<FrequentBookingTutor[]>('/petshop/tutors/booking-frequent', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setFrequentTutors(Array.isArray(data) ? data.slice(0, 8) : []); })
      .catch(() => { if (!controller.signal.aborted) setFrequentTutorsError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoadingFrequentTutors(false); });
    return () => controller.abort();
  }, [openNew, frequentRetry]);

  const loadBookingTutorDirectory = async (page: number) => {
    const request = ++directoryRequest.current;
    directoryController.current?.abort();
    const controller = new AbortController();
    directoryController.current = controller;
    setLoadingDirectory(true);
    setDirectoryError(false);
    if (page === 1) {
      setDirectoryTutors([]);
      setDirectoryPage(0);
      setDirectoryHasMore(false);
    }
    try {
      const { data } = await api.get<BookingTutorDirectory>('/petshop/tutors/booking-directory', { params: { page }, signal: controller.signal });
      if (request !== directoryRequest.current || controller.signal.aborted) return;
      const items = Array.isArray(data.items) ? data.items : [];
      setDirectoryTutors(current => page === 1 ? items : [...current, ...items.filter(item => !current.some(existing => existing.id === item.id))]);
      setDirectoryPage(page);
      setDirectoryHasMore(Boolean(data.hasMore));
    } catch {
      if (request === directoryRequest.current && !controller.signal.aborted) setDirectoryError(true);
    } finally {
      if (request === directoryRequest.current) setLoadingDirectory(false);
    }
  };

  useEffect(() => {
    if (!openNew || selectedTutor || tutorQuery.trim().length < 2) {
      setTutorResults([]);
      setSearchingTutors(false);
      return;
    }
    const controller = new AbortController();
    const query = tutorQuery.trim();
    setSearchingTutors(true);
    setTutorSearchError(false);
    const timer = window.setTimeout(() => {
      api.get('/petshop/tutors/booking-search', { params: { search: query }, signal: controller.signal })
        .then(({ data }) => {
          if (controller.signal.aborted) return;
          setTutorResults(Array.isArray(data) ? data : []);
          setSearchedTutorQuery(query);
        })
        .catch(() => { if (!controller.signal.aborted) setTutorSearchError(true); })
        .finally(() => { if (!controller.signal.aborted) setSearchingTutors(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [openNew, selectedTutor, tutorQuery]);

  const chooseTutor = async (tutor: Pick<Tutor, 'id' | 'name' | 'phone'>) => {
    const request = ++petsRequest.current;
    bookingPetsController.current?.abort();
    const controller = new AbortController();
    bookingPetsController.current = controller;
    transportEdited.current = false;
    setSelectedTutor(tutor);
    setShowTutorDirectory(false);
    setTutorResults([]);
    setPets([]);
    setLoadingBookingPets(true);
    setBookingPetsError(false);
    setAvailablePackages([]);
    setPackageSelections({});
    setForm(current => ({ ...current, petId: '', serviceIds: [], transportEnabled: false, transportMode: 'both', transportFee: taxiDefaultFee, transportCoveredByPackage: false, transportNotes: '' }));
    try {
      const { data } = await api.get<Pet[]>('/petshop/pets', { params: { customerId: tutor.id }, signal: controller.signal });
      if (request === petsRequest.current && !controller.signal.aborted) setPets(Array.isArray(data) ? data.filter(pet => pet.customerId === tutor.id) : []);
    } catch {
      if (request === petsRequest.current && !controller.signal.aborted) setBookingPetsError(true);
    } finally {
      if (request === petsRequest.current) setLoadingBookingPets(false);
    }
  };

  const selectBookingPet = (pet: Pet) => {
    if (pet.customerId !== selectedTutor?.id) return;
    transportEdited.current = false;
    const parsedAddr = parseAddressParts(pet.customer?.address);
    const hasAddr = Boolean(pet.customer?.address?.trim());
    setAvailablePackages([]);
    setPackageSelections({});
    setForm(current => ({
      ...current,
      petId: pet.id,
      serviceIds: [],
      transportEnabled: false,
      transportMode: 'both',
      transportFee: taxiDefaultFee,
      transportCoveredByPackage: false,
      customerStreet: parsedAddr.street,
      customerNeighborhood: parsedAddr.neighborhood,
      customerReference: pet.customer?.reference || '',
      transportNotes: '',
      saveAddressToCustomer: !hasAddr,
    }));
  };

  // Carregar atendimentos do período
  const loadAppointments = (showLoading = true) => {
    const request = ++appointmentsRequest.current;
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
        if (request === appointmentsRequest.current) setItems(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => { if (request === appointmentsRequest.current) toast.error('Erro ao carregar agendamentos.'); })
      .finally(() => { if (request === appointmentsRequest.current) setLoading(false); });
  };

  useEffect(() => {
    loadAppointments();
  }, [monday, anchorDate, viewMode]);

  useEffect(() => {
    const targetId = searchParams.get('appointment');
    const found = targetId && items.find(item => item.id === targetId);
    if (found) { setSelectedAppointment(found); const next = new URLSearchParams(searchParams); next.delete('appointment'); setSearchParams(next, { replace: true }); }
  }, [items, searchParams]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      bookingPetsController.current?.abort();
      setLoadingBookingPets(false);
      setBookingPetsError(false);
      setSelectedTutor(null);
      setTutorQuery('');
      setPets([]);
      transportEdited.current = false;
      const pid = searchParams.get('petId') || '';
      if (pid) {
        const request = ++petsRequest.current;
        api.get<Pet>(`/petshop/pets/${pid}`).then(({ data: pet }) => {
          if (request !== petsRequest.current) return;
          setPets([pet]);
          setSelectedTutor({ id: pet.customer.id, name: pet.customer.name, phone: pet.customer.phone });
          const address = parseAddressParts(pet.customer.address);
          setForm(current => current.petId === pid ? {
            ...current,
            customerStreet: address.street,
            customerNeighborhood: address.neighborhood,
            customerReference: pet.customer.reference || '',
            saveAddressToCustomer: !pet.customer.address?.trim(),
          } : current);
        }).catch(() => { if (request === petsRequest.current) toast.error('Não foi possível carregar o pet do agendamento.'); });
      }
      const petObj = pets.find(p => p.id === pid);
      const parsedAddr = parseAddressParts(petObj?.customer?.address);
      const hasAddr = Boolean(petObj?.customer?.address && petObj.customer.address.trim().length > 0);
      setForm({
        petId: pid,
        startsAt: `${formatISOYMD(new Date())}T09:00`,
        professionalId: '',
        serviceIds: [],
        notes: '',
        transportEnabled: false,
        transportMode: 'both',
        transportFee: taxiDefaultFee,
        transportCoveredByPackage: false,
        customerStreet: parsedAddr.street,
        customerNeighborhood: parsedAddr.neighborhood,
        customerReference: petObj?.customer?.reference || '',
        transportNotes: '',
        saveAddressToCustomer: !hasAddr,
      });
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
    setAnchorDate(now);
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

      // Ocultar concluídos e cancelados
      if (hideCompleted && (item.status === 'delivered' || item.status === 'cancelled')) {
        return false;
      }

      // Status
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'in_progress') {
          if (!['checked_in', 'bathing', 'grooming', 'finishing'].includes(item.status)) return false;
        } else if (item.status !== selectedStatus) {
          return false;
        }
      }

      // Sexo (Macho / Fêmea)
      if (selectedSex !== 'all') {
        if (item.pet?.sex !== selectedSex) return false;
      }

      // Porte do Animal
      if (selectedSize !== 'all') {
        if (normalizeSizeKey(item.pet?.size) !== selectedSize) return false;
      }

      return true;
    });
  }, [items, searchTerm, selectedProfessional, selectedService, selectedStatus, selectedSex, selectedSize, hideCompleted]);

  // Agrupamento por dia (para visualização em colunas na semana)
  const completedCount = useMemo(
    () => items.filter(i => i.status === 'delivered' || i.status === 'cancelled').length,
    [items]
  );

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const d of weekDays) {
      map.set(formatISOYMD(d), []);
    }
    for (const item of filteredItems) {
      const dayKey = formatISOYMD(new Date(item.startsAt));
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

    return { total, inCare, pending, ready };
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
      count: maxCount,

    };
  }, [weekDays, appointmentsByDay]);

  // Abertura do modal de criação pré-preenchendo data e horário
  const handleOpenNewForDay = (day: Date, timeStrPrefill = '09:00') => {
    ++petsRequest.current;
    bookingPetsController.current?.abort();
    transportEdited.current = false;
    setSelectedTutor(null);
    setChargeNow(false);
    setTutorQuery('');
    setPets([]);
    setLoadingBookingPets(false);
    setBookingPetsError(false);
    const dStr = formatISOYMD(day);
    setForm({
      petId: '',
      startsAt: `${dStr}T${timeStrPrefill}`,
      professionalId: '',
      serviceIds: [],
      notes: '',
      transportEnabled: false,
      transportMode: 'both',
      transportFee: taxiDefaultFee,
      transportCoveredByPackage: false,
      customerStreet: '',
      customerNeighborhood: '',
      customerReference: '',
      transportNotes: '',
      saveAddressToCustomer: true,
    });
    setOpenNew(true);
  };

  // Submissão do novo agendamento
  const submitNew = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.serviceIds.length || loadingPackages || packagesError) { toast.error('Selecione os serviços e aguarde a consulta dos pacotes.'); return; }

    const street = form.customerStreet.trim();
    const neighborhood = form.customerNeighborhood.trim();
    const fullAddress = [street, neighborhood].filter(Boolean).join(' - ');

    if (form.transportEnabled && !street) {
      toast.error('Informe a rua e número do cliente para o transporte (Táxi Dog).');
      return;
    }
    if (form.transportEnabled && !neighborhood) {
      toast.error('Informe o bairro do cliente para o transporte (Táxi Dog).');
      return;
    }

    setSaving(true);
    try {
      const activeSelections: Record<string, string> = {};
      for (const svcId of form.serviceIds) {
        if (packageSelections[svcId]) {
          activeSelections[svcId] = packageSelections[svcId];
        }
      }
      const { data: created } = await api.post<Appointment>('/petshop/appointments', {
        petId: form.petId,
        startsAt: new Date(form.startsAt).toISOString(),
        professionalId: form.professionalId || undefined,
        serviceIds: form.serviceIds,
        notes: form.notes,
        packageSelections: Object.keys(activeSelections).length > 0 ? activeSelections : undefined,
        saveAddressToCustomer: form.saveAddressToCustomer,
        customerAddress: fullAddress || undefined,
        customerReference: form.customerReference.trim() || undefined,
        transport: form.transportEnabled
          ? {
              enabled: true,
              mode: form.transportMode,
              fee: form.transportCoveredByPackage ? 0 : Math.max(0, Number(form.transportFee || 0)),
              coveredByPackage: form.transportCoveredByPackage,
              street,
              neighborhood,
              reference: form.customerReference.trim() || undefined,
              notes: form.transportNotes.trim() || undefined,
              address: fullAddress,
            }
          : undefined,
      });
      if (form.saveAddressToCustomer && fullAddress) {
        setPets(curr =>
          curr.map(p =>
            p.id === form.petId && p.customer
              ? { ...p, customer: { ...p.customer, address: fullAddress, reference: form.customerReference.trim() } }
              : p,
          ),
        );
      }
      toast.success('Agendamento criado com sucesso!');
      setOpenNew(false);
      if (chargeNow && created) void handleChargeAppointment(created, true);
      setChargeNow(false);
      transportEdited.current = false;
      setForm({
        petId: '',
        startsAt: '',
        professionalId: '',
        serviceIds: [],
        notes: '',
        transportEnabled: false,
        transportMode: 'both',
        transportFee: taxiDefaultFee,
        transportCoveredByPackage: false,
        customerStreet: '',
        customerNeighborhood: '',
        customerReference: '',
        transportNotes: '',
        saveAddressToCustomer: true,
      });
      setPackageSelections({});
      loadAppointments(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao criar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  // Reagendar atendimento (data e hora)
  const handleSaveReschedule = async () => {
    if (!selectedAppointment || !rescheduleStartsAt) return;
    setSavingReschedule(true);
    try {
      const { data: updated } = await api.patch(`/petshop/appointments/${selectedAppointment.id}`, {
        startsAt: new Date(rescheduleStartsAt).toISOString(),
      });
      setItems(curr => curr.map(row => (row.id === selectedAppointment.id ? updated : row)));
      setSelectedAppointment(updated);
      setEditingReschedule(false);
      toast.success('Atendimento reagendado com sucesso!');
      loadAppointments(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao reagendar atendimento.');
    } finally {
      setSavingReschedule(false);
    }
  };

  // Adicionar serviço extra no meio do atendimento (ex: banho anti-pulgas, desembolo, hidratação)
  const handleAddExtraService = async () => {
    if (!selectedAppointment || !extraServiceId) {
      toast.error('Selecione o serviço a ser adicionado.');
      return;
    }
    setSavingExtraService(true);
    try {
      const customPriceNum = extraServicePrice.trim() !== '' ? Number(extraServicePrice) : undefined;
      const { data: updated } = await api.patch(`/petshop/appointments/${selectedAppointment.id}`, {
        addServices: [
          {
            serviceId: extraServiceId,
            priceSnapshot: Number.isFinite(customPriceNum) ? customPriceNum : undefined,
          },
        ],
      });
      setItems(curr => curr.map(row => (row.id === selectedAppointment.id ? updated : row)));
      setSelectedAppointment(updated);
      setAddingExtraService(false);
      setExtraServiceId('');
      setExtraServicePrice('');
      toast.success('Serviço adicional incluído no atendimento!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao adicionar serviço.');
    } finally {
      setSavingExtraService(false);
    }
  };

  // Remover serviço extra avulso
  const handleRemoveAppointmentService = async (appointmentServiceId: string) => {
    if (!selectedAppointment) return;
    setSavingExtraService(true);
    try {
      const { data: updated } = await api.patch(`/petshop/appointments/${selectedAppointment.id}`, {
        removeAppointmentServiceId: appointmentServiceId,
      });
      setItems(curr => curr.map(row => (row.id === selectedAppointment.id ? updated : row)));
      setSelectedAppointment(updated);
      toast.success('Serviço removido do atendimento.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao remover serviço.');
    } finally {
      setSavingExtraService(false);
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
  const handleChargeAppointment = async (item: Appointment, prepay = false) => {
    if (item.status === 'delivered') {
      toast.info('Atendimento já foi cobrado e concluído!', {
        description: `O atendimento de ${item.pet?.name} já foi finalizado. Não é permitida cobrança em duplicidade.`,
      });
      return;
    }
    setChargingId(item.id);
    try {
      // Filtra apenas os serviços que NÃO estão cobertos por pacote (avulsos/extras)
      const billableServices = (item.services || []).filter(
        s => !s.comboParentId && s.coverageStatus !== 'reserved' && s.coverageStatus !== 'consumed',
      );
      const hasCoveredServices = (item.services || []).some(
        s => s.coverageStatus === 'reserved' || s.coverageStatus === 'consumed',
      );

      const transportExtra =
        item.transport?.enabled && !item.transport.coveredByPackage && Number(item.transport.fee || 0) > 0
          ? Number(item.transport.fee)
          : 0;

      // Se TODOS os serviços do agendamento são cobertos por pacote e não há taxa avulsa de transporte:
      if (billableServices.length === 0 && hasCoveredServices && transportExtra === 0) {
        if (prepay) { toast.info('Este agendamento já está coberto pelo pacote; não há valor avulso para cobrar agora.'); return; }
        const { data: completed } = await api.patch(`/petshop/appointments/${item.id}/status`, { status: 'delivered' });
        setItems(curr => curr.map(row => row.id === item.id ? completed : row));
        setSelectedAppointment(completed);
        toast.success('Atendimento concluído via pacote!', {
          description: `Sessão abatida do pacote de ${item.pet?.name}. Nenhum valor avulso adicional a cobrar.`,
        });
        return;
      }

      const { data: comanda } = await api.post(`/petshop/appointments/${item.id}/checkout`, { prepay });
      if (comanda?.prepaid) {
        if (!prepay) {
          await api.patch(`/petshop/appointments/${item.id}/status`, { status: 'delivered' });
          setSelectedAppointment(null);
          loadAppointments(false);
          toast.success('Entrega concluída. Pagamento antecipado já registrado.');
        }
        return;
      }
      if (!comanda || Number(comanda.total) <= 0) {
        toast.error('Não foi encontrado valor avulso para este atendimento.');
        return;
      }
      setSelectedAppointment(null);
      setPaymentItem({ appointment: item, total: Number(comanda.total), prepay });
      setPaymentMethod('pix');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao preparar cobrança no caixa.');
    } finally {
      setChargingId('');
    }
  };

  //Alterar etapa / status
  const changeStatus = async (item: Appointment, newStatus: string) => {
    setUpdatingId(item.id);
    try {
      const { data: updated } = await api.patch(`/petshop/appointments/${item.id}/status`, { status: newStatus });
      setItems(curr => curr.map(row => (row.id === item.id ? updated : row)));
      if (selectedAppointment?.id === item.id) {
        setSelectedAppointment(updated);
      }

      if (newStatus === 'ready') {
        toast.success(`${item.pet.name} está pronto(a) para retirada!`, {
          description: `Clique em "Avisar Tutor" para preparar a mensagem. Automações dependem da configuração da loja.`,
          duration: 5000,
        });
      } else {
        toast.success(`Etapa de ${item.pet.name} atualizada para "${newStatus === 'ready' && hasTaxiDogReturn(item) ? 'Pronto p/ levar' : statusLabelMap[newStatus] || newStatus}".`);
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
          ? `Aviso "${hasTaxiDogReturn(item) ? 'Pronto para entrega' : 'Pronto para buscar'}" preparado para ${item.customer.name}!`
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
      status: item.status === 'scheduled' || item.status === 'confirmed' || item.status === 'requested' ? 'bathing' : item.status,
      stagePhotoUrl: item.stagePhotoUrl || '',
      stageNotes: item.stageNotes || '',
      notifyTutor: false,
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
        notifyTutor: stageForm.notifyTutor && Boolean(stageForm.stagePhotoUrl),
      });
      setItems(curr => curr.map(row => (row.id === stageModalItem.id ? updated : row)));
      if (selectedAppointment?.id === stageModalItem.id) {
        setSelectedAppointment(updated);
      }
      toast.success('Foto e etapa salvas no painel do cliente!');
      setStageModalItem(null);
      if (stageForm.notifyTutor && stageForm.stagePhotoUrl) toast.success('Foto colocada na fila do WhatsApp do tutor.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar foto.');
    } finally {
      setSavingStage(false);
    }
  };

  // Badge visual de status dos cards
  const renderStatusBadge = (status: string, appointment?: Appointment) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 shadow-2xs">
            <Sparkles size={10} /> {appointment && hasTaxiDogReturn(appointment) ? 'Pronto p/ levar' : 'Pronto p/ buscar'}
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
      {/* 1. Hero Banner no Mobile (conforme Imagem 2) */}
      <div className="relative mb-3.5 overflow-hidden rounded-3xl bg-[#0d6e5a] p-4 sm:p-5 text-white shadow-sm md:hidden">
        {/* Marca d'água de patinha decorativa e traços de alegria */}
        <PawPrint
          size={120}
          className="pointer-events-none absolute -right-6 -top-8 text-white/10 rotate-12"
          aria-hidden="true"
        />
        <svg
          className="pointer-events-none absolute right-24 sm:right-28 top-3 h-5 w-7 text-white/30"
          viewBox="0 0 32 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="4" y1="20" x2="10" y2="6" />
          <line x1="16" y1="20" x2="16" y2="4" />
          <line x1="28" y1="20" x2="22" y2="6" />
        </svg>

        <div className="flex items-center justify-between gap-1.5">
          {/* Textos à esquerda */}
          <div className="relative z-10 min-w-0 flex-1 pr-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-200">
              Operação do Pet Shop
            </span>
            <h1 className="mt-1 text-lg font-bold leading-tight text-white">
              Agenda e etapas dos pets
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-emerald-100/90 max-w-[215px]">
              Visualize, organize e acompanhe os atendimentos da sua equipe em um só lugar.
            </p>
            <button
              type="button"
              onClick={() => handleOpenNewForDay(anchorDate)}
              className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-teal-900 shadow-xs transition hover:bg-emerald-50 active:scale-95 cursor-pointer"
            >
              <Plus size={15} className="text-teal-800" strokeWidth={2.5} />
              <span>Novo agendamento</span>
            </button>
          </div>

          {/* Imagem do Cão e Gato à direita */}
          <div className="relative shrink-0 w-28 sm:w-32 h-28 sm:h-32 self-end -mb-4 -mr-1 overflow-hidden flex items-end justify-center pointer-events-none">
            <img
              src="/petcare/hero-dog-cat.webp"
              alt="Pets"
              className="h-full w-full object-contain object-bottom drop-shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Header Desktop (mantido limpo no desktop) */}
      <div className="hidden md:block">
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
      </div>

      {/* 2. Barra de Modos de Visão no Mobile (Dia | Semana | Timeline | Profissionais) — Conforme Imagem 2 */}
      <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xs md:hidden">
        <button
          type="button"
          onClick={() => setViewMode('day')}
          className={`flex items-center justify-center gap-1 rounded-xl py-2 px-1 text-xs font-bold transition ${
            viewMode === 'day' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <CalendarDays size={14} />
          <span>Dia</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('week')}
          className={`flex items-center justify-center gap-1 rounded-xl py-2 px-1 text-xs font-bold transition ${
            viewMode === 'week' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <CalendarDays size={14} />
          <span>Semana</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('timeline')}
          className={`flex items-center justify-center gap-1 rounded-xl py-2 px-1 text-xs font-bold transition ${
            viewMode === 'timeline' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <BarChart3 size={14} />
          <span>Timeline</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('professionals')}
          className={`flex items-center justify-center gap-1 rounded-xl py-2 px-1 text-xs font-bold transition ${
            viewMode === 'professionals' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <UserRound size={14} />
          <span>Profissionais</span>
        </button>
      </div>

      {/* 3. Filtros no Mobile (Busca + 2x2 Seletores + Ocultar Concluídos) — Conforme Imagem 2 */}
      <div className="mb-3.5 space-y-2.5 md:hidden">
        {/* Campo de Busca */}
        <div className="relative w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por pet, tutor ou serviço..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-11 w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 text-xs text-zinc-800 placeholder-zinc-400 outline-none focus:border-teal-600 shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Dropdowns em Grid 2x2 (Profissional, Serviço, Status e Ocultar Concluídos) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <select
              value={selectedProfessional}
              onChange={e => setSelectedProfessional(e.target.value)}
              className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-zinc-200 bg-white px-3 pr-8 text-xs font-medium text-zinc-700 outline-none shadow-2xs"
            >
              <option value="all">Profissional</option>
              {operators.map(op => (
                <option key={op.id} value={op.id}>
                  {op.name}
                </option>
              ))}
            </select>
            <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={selectedService}
              onChange={e => setSelectedService(e.target.value)}
              className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-zinc-200 bg-white px-3 pr-8 text-xs font-medium text-zinc-700 outline-none shadow-2xs"
            >
              <option value="all">Serviço</option>
              {services.map(svc => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </select>
            <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-zinc-200 bg-white px-3 pr-8 text-xs font-medium text-zinc-700 outline-none shadow-2xs"
            >
              <option value="all">Status</option>
              <option value="scheduled">Agendado</option>
              <option value="in_progress">Em atendimento</option>
              <option value="ready">Pronto</option>
              <option value="requested">Pendente</option>
              <option value="delivered">Concluído</option>
              <option value="cancelled">Cancelado</option>
            </select>
            <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={() => setHideCompleted(prev => !prev)}
            className={`h-10 w-full rounded-xl border px-2.5 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer select-none shadow-2xs whitespace-nowrap ${
              hideCompleted
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            <CheckCircle2 size={14} className={hideCompleted ? 'text-emerald-600 shrink-0' : 'text-zinc-400 shrink-0'} />
            <span className="truncate">{hideCompleted ? 'Concluídos ocultos' : 'Ocultar concluídos'}</span>
            {completedCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                hideCompleted ? 'bg-emerald-200 text-emerald-900' : 'bg-zinc-100 text-zinc-600'
              }`}>
                {completedCount}
              </span>
            )}
          </button>
        </div>

        {/* Botão Limpar Filtros (quando algum filtro está ativo) */}
        {(searchTerm || selectedProfessional !== 'all' || selectedService !== 'all' || selectedStatus !== 'all') && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedProfessional('all');
                setSelectedService('all');
                setSelectedStatus('all');
              }}
              title="Limpar todos os filtros"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition cursor-pointer shadow-2xs"
            >
              <RotateCcw size={13} />
              <span>Limpar filtros</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Barra de Navegação Desktop (2 linhas alinhadas: Data/Filtros em cima, Visualização/Ocultar concluídos embaixo) */}
      <section
        className="mb-5 hidden md:flex flex-col gap-2.5 rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-xs"
        aria-label="Controles da agenda desktop"
      >
        {/* Linha 1: Data + Hoje à esquerda | Busca + Dropdowns de Filtro à direita */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 shrink-0">
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
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
            {/* Busca por Pet, Tutor ou Serviço */}
            <div className="relative min-w-[200px] lg:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por pet, tutor ou serviço..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50/70 pl-8 pr-7 text-xs text-zinc-800 placeholder-zinc-400 outline-none transition focus:border-teal-600 focus:bg-white"
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

            {/* Profissional */}
            <div className="relative">
              <select
                value={selectedProfessional}
                onChange={e => setSelectedProfessional(e.target.value)}
                className="h-10 max-w-[145px] truncate cursor-pointer rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
              >
                <option value="all">Profissional</option>
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
                className="h-10 max-w-[145px] truncate cursor-pointer rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
              >
                <option value="all">Serviço</option>
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
                <option value="all">Status</option>
                <option value="scheduled">Agendado</option>
                <option value="in_progress">Em atendimento</option>
                <option value="ready">Pronto</option>
                <option value="requested">Pendente</option>
                <option value="delivered">Concluído</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Linha 2: Modos de Visualização à esquerda | Ocultar Concluídos + Limpar Filtros alinhados à direita */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-zinc-100">
          {/* Seletor Segmentado de Visualização (Dia, Semana, Timeline, Profissionais) */}
          <div className="flex items-center overflow-x-auto no-scrollbar max-w-full rounded-xl border border-zinc-200 bg-zinc-100/80 p-1">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'day' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Dia
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'week' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'timeline' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('professionals')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'professionals' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Profissionais
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Alternar Ocultar Concluídos */}
            <button
              type="button"
              onClick={() => setHideCompleted(prev => !prev)}
              className={`h-9 px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer select-none ${
                hideCompleted
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
              title="Ocultar atendimentos já entregues/concluídos para despoluir a agenda"
            >
              <CheckCircle2 size={14} className={hideCompleted ? 'text-emerald-600' : 'text-zinc-400'} />
              <span>{hideCompleted ? 'Concluídos ocultos' : 'Ocultar concluídos'}</span>
              {completedCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  hideCompleted ? 'bg-emerald-200/80 text-emerald-900' : 'bg-zinc-100 text-zinc-600'
                }`}>
                  {completedCount}
                </span>
              )}
            </button>

            {/* Botão de Limpar Filtros */}
            {(searchTerm || selectedProfessional !== 'all' || selectedService !== 'all' || selectedStatus !== 'all' || selectedSex !== 'all' || selectedSize !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedProfessional('all');
                  setSelectedService('all');
                  setSelectedStatus('all');
                  setSelectedSex('all');
                  setSelectedSize('all');
                }}
                title="Limpar todos os filtros"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>Limpar filtros</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 5. Cards de Indicadores Operacionais — Conforme Imagem 2 */}
      <section className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5" aria-label="Indicadores operacionais">
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 flex items-center gap-3 shadow-2xs">
          <div className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <CalendarDays size={20} />
          </div>
          <div className="min-w-0">
            <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">{metrics.total}</strong>
            <p className="text-[11px] sm:text-xs text-zinc-500 font-medium truncate">Agendamentos</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 flex items-center gap-3 shadow-2xs">
          <div className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <Clock3 size={20} />
          </div>
          <div className="min-w-0">
            <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">{metrics.inCare}</strong>
            <p className="text-[11px] sm:text-xs text-zinc-500 font-medium truncate">Em atendimento</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 flex items-center gap-3 shadow-2xs">
          <div className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
            <BellRing size={20} />
          </div>
          <div className="min-w-0">
            <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">{metrics.pending}</strong>
            <p className="text-[11px] sm:text-xs text-zinc-500 font-medium truncate">Confirmações pendentes</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 flex items-center gap-3 shadow-2xs">
          <div className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
            <CheckCircle2 size={20} />
          </div>
          <div className="min-w-0">
            <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">{metrics.ready}</strong>
            <p className="text-[11px] sm:text-xs text-zinc-500 font-medium truncate">Pets prontos</p>
          </div>
        </div>
      </section>

      {/* 6. Conteúdo Principal da Agenda (Semana + Sidebar lateral direita) */}
      {viewMode === 'week' && (
        <div className="flex flex-col 2xl:flex-row gap-4 items-stretch">
          {/* Grade de 7 Colunas (Segunda a Domingo) */}
          <div className="flex-1 min-w-0 w-full flex flex-col overflow-x-auto">
            {/* Seletor Rápido de Dias no Mobile (< md) — Conforme Imagem 2 */}
            <div className="mb-3.5 md:hidden">
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-xs font-black uppercase tracking-wider text-zinc-900">
                  Visão da semana
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAllWeekMobile(prev => !prev)}
                  className="text-xs font-bold text-teal-800 hover:text-teal-900 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {showAllWeekMobile ? 'Ver apenas dia selecionado →' : 'Ver agenda completa →'}
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 rounded-2xl border border-zinc-200/90 bg-white p-1.5 shadow-2xs">
                {weekDays.map(d => {
                  const dKey = formatISOYMD(d);
                  const isSelected = formatISOYMD(anchorDate) === dKey;
                  return (
                    <button
                      key={`mob-strip-${dKey}`}
                      type="button"
                      onClick={() => setAnchorDate(d)}
                      className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 transition cursor-pointer ${
                        isSelected
                          ? 'bg-teal-800 text-white shadow-xs font-bold'
                          : 'text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <span className={`text-[10px] font-bold uppercase ${isSelected ? 'text-teal-100' : 'text-zinc-400'}`}>
                        {formatDayOfWeek(d).slice(0, 3)}
                      </span>
                      <strong className="text-sm font-extrabold tabular-nums mt-0.5">{d.getDate()}</strong>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3 flex-1 items-stretch md:min-h-[calc(100vh-250px)]">
              {weekDays.map(dayDate => {
                const dayKey = formatISOYMD(dayDate);
                const dayList = appointmentsByDay.get(dayKey) || [];
                const isTodayActive = isCurrentDay(dayDate);
                const isSelected = formatISOYMD(anchorDate) === dayKey;
                const isVisibleOnMobile = showAllWeekMobile || isSelected;

                return (
                  <div
                    key={dayKey}
                    className={`${isVisibleOnMobile ? 'flex' : 'hidden md:flex'} flex-col h-full rounded-2xl border transition-all ${
                      isTodayActive
                        ? 'border-emerald-300 bg-emerald-50/20 shadow-xs'
                        : 'border-zinc-200/90 bg-zinc-50/50'
                    }`}
                  >
                    {/* Cabeçalho do Dia */}
                    <div
                      className={`sticky top-0 z-10 flex items-center justify-between p-3 border-b rounded-t-2xl backdrop-blur-xs ${
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
                    <div className="p-2.5 flex-1 space-y-2 pr-1.5 xl:min-h-[820px] xl:max-h-[1200px] xl:overflow-y-auto xl:overscroll-contain focus:outline-none custom-scrollbar">
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
                                <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                                  <h4 className="text-xs font-bold text-zinc-900 truncate">
                                    {item.pet?.name}
                                  </h4>
                                  {item.pet?.sex === 'male' && (
                                    <span className="inline-flex items-center rounded-md bg-sky-100 border border-sky-300 px-1.5 py-0.5 text-[9px] font-extrabold text-sky-900 shrink-0" title="Macho (Gravatinha)">Macho</span>
                                  )}
                                  {item.pet?.sex === 'female' && (
                                    <span className="inline-flex items-center rounded-md bg-pink-100 border border-pink-300 px-1.5 py-0.5 text-[9px] font-extrabold text-pink-900 shrink-0" title="Fêmea (Lacinho)">Fêmea</span>
                                  )}
                                </div>
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

                                {/* Badges informativos de Serviços */}
                                {item.services && item.services.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-1.5">
                                    {item.services.filter(s => !s.comboParentId).slice(0, 3).map(s => (
                                      <span
                                        key={s.id}
                                        className="inline-block rounded bg-zinc-100 border border-zinc-200/80 px-1.5 py-0.2 text-[9px] font-semibold text-zinc-700 truncate max-w-[140px]"
                                        title={s.nameSnapshot}
                                      >
                                        {s.nameSnapshot}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Rodapé: Badge de Status + Pacote + Transporte + Ações Rápidas */}
                                <div className="flex items-center justify-between pt-1 border-t border-zinc-100 gap-1">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {renderStatusBadge(item.status, item)}
                                    {item.services?.some(s => s.coverageStatus === 'reserved' || s.coverageStatus === 'consumed') && (
                                      <span
                                        title="Serviço coberto por pacote de cliente"
                                        className="inline-flex items-center gap-0.5 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-800"
                                      >
                                        <PackageCheck size={9} /> Pacote
                                      </span>
                                    )}
                                    {item.transport?.enabled && (
                                      <span
                                        title={`Transporte (${item.transport.mode === 'pickup' ? 'Apenas Buscar' : item.transport.mode === 'dropoff' ? 'Apenas Levar' : 'Buscar e Levar'})${item.transport.address ? ` · ${item.transport.address}` : ''}`}
                                        className="inline-flex items-center gap-0.5 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800"
                                      >
                                        🚐 Táxi Dog
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {item.stagePhotoUrl && (
                                      <span
                                        title="Foto da etapa registrada"
                                        className="text-teal-700 text-[10px] flex items-center gap-0.5"
                                      >
                                        <Camera size={11} />
                                      </span>
                                    )}
                                    {item.status !== 'delivered' && (
                                      <button
                                        type="button"
                                        onClick={e => {
                                          e.stopPropagation();
                                          setAppointmentToReschedule(item);
                                        }}
                                        title="Reagendar horário"
                                        className="h-5 w-5 grid place-items-center rounded text-zinc-400 hover:text-teal-800 hover:bg-teal-50 transition cursor-pointer"
                                      >
                                        <CalendarDays size={11} />
                                      </button>
                                    )}
                                    {item.status !== 'delivered' && item.status !== 'cancelled' && (
                                      <button
                                        type="button"
                                        onClick={e => {
                                          e.stopPropagation();
                                          setAppointmentToCancel(item);
                                        }}
                                        title="Cancelar agendamento"
                                        className="h-5 w-5 grid place-items-center rounded text-zinc-400 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                                      >
                                        <XCircle size={11} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                            </article>
                          );
                        })
                      )}
                      {!loading && dayList.length > 0 && <p className="py-2 text-center text-[10px] text-zinc-500">Exibindo todos os {dayList.length} agendamentos ↕</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Barra Lateral Direita: Insights, Visão da Semana e Horários Livres */}
          <aside className="w-full 2xl:w-72 shrink-0 space-y-4">
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
                  const heightPct = Math.min(100, (count / (busiestDayInsight.count || 1)) * 100);

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
                      {busiestDayInsight.count} agendamentos no período selecionado
                    </p>
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
                    <p className="text-[11px] text-zinc-500">No período selecionado</p>
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
                      {metrics.ready} pets prontos
                    </p>
                    <p className="text-[11px] text-zinc-500">{items.filter(i => i.status === 'ready').map(i => i.pet.name).join(', ') || 'Nenhum pet aguardando retirada'}</p>
                  </div>
                  <ChevronRight size={14} className="text-zinc-400 mt-1" />
                </div>

              </div>
            </div>

            <TaxiDogWidget
              appointments={filteredItems}
              onSelectAppointment={setSelectedAppointment}
              onChangeStatus={changeStatus}
              title="Táxi Dog · Coletas & Entregas"
              subtitle="Coletas e entregas agendadas na semana"
            />
          </aside>
        </div>
      )}

      {/* 5. Visualização em Modo DIA */}
      {viewMode === 'day' && (
        <div className="flex flex-col 2xl:flex-row gap-4 items-stretch">
          <section className="flex-1 min-w-0 w-full pc-panel overflow-hidden bg-white rounded-2xl border border-zinc-200" aria-label="Atendimentos do dia">
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
                          {item.pet?.sex === 'male' && (
                            <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200" title="Macho (gravata/adereço azul)">
                              ♂ Macho
                            </span>
                          )}
                          {item.pet?.sex === 'female' && (
                            <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title="Fêmea (laço/adereço rosa)">
                              ♀ Fêmea
                            </span>
                          )}
                          <span className="text-xs text-zinc-500">Tutor: {item.customer?.name}</span>
                          {renderStatusBadge(item.status, item)}
                        </div>

                        <p className="mt-1 text-xs text-zinc-600 truncate">
                          {item.services.map(s => s.nameSnapshot).join(' + ') || 'Serviço'} ·{' '}
                          <strong className="font-semibold text-zinc-800">
                            {money(
                              item.services
                                .filter(s => s.coverageStatus !== 'reserved' && s.coverageStatus !== 'consumed')
                                .reduce((sum, s) => sum + Number(s.priceSnapshot || 0), 0),
                            )}
                          </strong>
                          {item.services.some(s => s.coverageStatus === 'reserved' || s.coverageStatus === 'consumed') && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                              <PackageCheck size={10} /> Pacote
                            </span>
                          )}
                          {item.transport?.enabled && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                              🚐 Táxi Dog ({item.transport.mode === 'pickup' ? 'Buscar' : item.transport.mode === 'dropoff' ? 'Levar' : 'Buscar/Levar'})
                              {!item.transport.coveredByPackage && item.transport.fee > 0 ? ` + ${money(item.transport.fee)}` : ''}
                            </span>
                          )}
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <UserRound size={13} /> {item.professional?.name || 'Profissional a definir'}
                          </span>
                          {item.stageNotes && (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 truncate max-w-md">
                              Recado: "{item.stageNotes}"
                            </span>
                          )}
                        </div>

                        {/* Barra de Etapas Operacionais Dinâmicas do Serviço */}
                        {isInCare ? (() => {
                          const steps = getAppointmentSteps(item);
                          const currentStepIdx = steps.findIndex(s => s.key === item.status);
                          return (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              {steps.map((step, idx) => {
                                const done = currentStepIdx !== -1 && idx <= currentStepIdx;
                                const current = idx === currentStepIdx;
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
                          );
                        })() : (item.status === 'scheduled' || item.status === 'confirmed' || item.status === 'requested') ? (
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={updatingId === item.id}
                              onClick={() => changeStatus(item, 'checked_in')}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-50"
                            >
                              <CheckCircle2 size={14} /> Fazer Check-in (Receber Pet)
                            </button>
                          </div>
                        ) : null}
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

                      {!(item.status === 'ready' && hasTaxiDogReturn(item)) && <button
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
                      </button>}

                      <select
                        value={item.status}
                        disabled={updatingId === item.id}
                        onChange={e => changeStatus(item, e.target.value)}
                        className="h-10 rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-700 outline-none cursor-pointer"
                      >
                        {statuses.map(([val, label]) => (
                          <option key={val} value={val}>
                            {val === 'ready' && hasTaxiDogReturn(item) ? 'Pronto p/ levar' : label}
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
          <aside className="w-full 2xl:w-80 shrink-0">
            <TaxiDogWidget
              appointments={filteredItems}
              onSelectAppointment={setSelectedAppointment}
              onChangeStatus={changeStatus}
              title="Táxi Dog do Dia"
              subtitle={`Coletas e entregas em ${formatShortDate(anchorDate)}`}
              dateLabel={formatShortDate(anchorDate)}
            />
          </aside>
        </div>
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
                          {renderStatusBadge(item.status, item)}
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
                          {renderStatusBadge(item.status, item)}
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
                  {renderStatusBadge(selectedAppointment.status, selectedAppointment)}
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
            {appointmentPayment && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div><strong className="text-emerald-900">Pagamento registrado: {money(appointmentPayment.total)}</strong><p className="text-xs text-emerald-800">PIX e cartão exigem devolução pelo meio de pagamento.</p></div>
              <button type="button" className="min-h-11 rounded-lg border border-emerald-300 bg-white px-3 font-semibold text-emerald-900 hover:bg-emerald-100" onClick={() => setReversePaymentOpen(true)}>Estornar pagamento</button>
            </div>}

            {/* Barra de Etapas Dinâmicas Configuradas para este Atendimento */}
            {(() => {
              const steps = getAppointmentSteps(selectedAppointment);
              const stepIdx = steps.findIndex(s => s.key === selectedAppointment.status);
              const gridColsClass =
                steps.length <= 3
                  ? 'grid-cols-3'
                  : steps.length === 4
                  ? 'grid-cols-4'
                  : steps.length === 5
                  ? 'grid-cols-5'
                  : 'grid-cols-3 sm:grid-cols-6';

              return (
                <div className="rounded-xl border border-zinc-200 bg-white p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                      Progresso do Atendimento
                    </p>
                    <span className="text-[10px] text-teal-700 font-bold bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                      {steps.length} etapas para este serviço
                    </span>
                  </div>
                  {(selectedAppointment.status === 'scheduled' || selectedAppointment.status === 'confirmed' || selectedAppointment.status === 'requested') && (
                    <button
                      type="button"
                      disabled={updatingId === selectedAppointment.id}
                      onClick={() => changeStatus(selectedAppointment, 'checked_in')}
                      className="mb-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-700 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} /> Fazer Check-in (Receber Pet no Estabelecimento)
                    </button>
                  )}
                  <div className={`grid ${gridColsClass} gap-1.5`}>
                    {steps.map((step, idx) => {
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
              );
            })()}

            {/* Serviços e Valores + Adicionar Serviço no Meio do Atendimento */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                  Serviços Contratados & Cobertura
                </p>
                {selectedAppointment.status !== 'delivered' && selectedAppointment.status !== 'cancelled' && !addingExtraService && (
                  <button
                    type="button"
                    onClick={() => setAddingExtraService(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-800 hover:bg-teal-100 transition cursor-pointer"
                    title="Adicionar serviço extra durante o atendimento (ex: Banho Anti-Pulgas, Hidratação, Desembolo)"
                  >
                    <Plus size={12} /> Adicionar serviço ao atendimento
                  </button>
                )}
              </div>

              {addingExtraService && (
                <div className="mb-3 rounded-xl border border-teal-300 bg-teal-50/70 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-900">
                      Incluir Serviço Adicional (ex: Anti-pulgas, Hidratação, Tosa Higiênica)
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddingExtraService(false)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-800"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-zinc-600 mb-1">Serviço *</label>
                      <select
                        value={extraServiceId}
                        onChange={e => {
                          const sid = e.target.value;
                          setExtraServiceId(sid);
                          const svcObj = services.find(s => s.id === sid);
                          if (svcObj) {
                            const eff = getEffectiveServicePrice(svcObj, selectedAppointment.pet);
                            setExtraServicePrice(String(eff.price));
                          } else {
                            setExtraServicePrice('');
                          }
                        }}
                        className="w-full rounded-lg border border-teal-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800"
                      >
                        <option value="">Selecione o serviço extra...</option>
                        {services.map(svc => {
                          const eff = getEffectiveServicePrice(svc, selectedAppointment.pet);
                          return (
                            <option key={svc.id} value={svc.id}>
                              {svc.name} ({money(eff.price)})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-600 mb-1">Valor a cobrar (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={extraServicePrice}
                        onChange={e => setExtraServicePrice(e.target.value)}
                        placeholder="0,00"
                        className="w-full rounded-lg border border-teal-300 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-900"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={savingExtraService || !extraServiceId}
                      onClick={handleAddExtraService}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
                    >
                      {savingExtraService ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Confirmar inclusão no atendimento
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-zinc-100">
                {selectedAppointment.services.map(svc => {
                  const isCovered = svc.coverageStatus === 'reserved' || svc.coverageStatus === 'consumed';
                  const isComboChild = Boolean(svc.comboParentId);
                  const isComboParent = Boolean(svc.isCombo);
                  const canRemove =
                    selectedAppointment.status !== 'delivered' &&
                    selectedAppointment.status !== 'cancelled' &&
                    !isCovered &&
                    !isComboChild &&
                    selectedAppointment.services.filter(s => !s.comboParentId).length > 1;
                  return (
                    <div
                      key={svc.id}
                      className={`py-2 flex items-center justify-between gap-2 text-xs ${
                        isComboChild ? 'pl-4 bg-zinc-50/60 rounded-lg' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isComboChild && <span className="text-zinc-400 font-mono">↳</span>}
                          <strong className="font-semibold text-zinc-800">{svc.nameSnapshot}</strong>
                          <span className="text-zinc-400">({svc.durationMinutes} min)</span>
                          {selectedAppointment.stageHistory?.find(h => h.kind === 'service_added' && h.appointmentServiceId === svc.id)?.userName && (
                            <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                              Incluído por {selectedAppointment.stageHistory.find(h => h.kind === 'service_added' && h.appointmentServiceId === svc.id)?.userName}
                            </span>
                          )}
                          {isComboParent && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                              Combo
                            </span>
                          )}
                          {isComboChild && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                              Item do combo
                            </span>
                          )}
                          {svc.coverageStatus === 'reserved' && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                              <PackageCheck size={10} /> Sessão Reservada no Pacote
                            </span>
                          )}
                          {svc.coverageStatus === 'consumed' && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <PackageCheck size={10} /> Sessão Consumida do Pacote
                            </span>
                          )}
                        </div>
                        {svc.customerPackage && (
                          <p className="text-[10px] text-teal-700 mt-0.5">
                            Pacote: {svc.customerPackage.planNameSnapshot}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-bold tabular-nums ${isCovered || isComboChild ? 'text-teal-700' : 'text-zinc-900'}`}>
                          {isCovered ? 'Coberto (R$ 0,00)' : isComboChild ? 'Incluso (R$ 0,00)' : money(Number(svc.priceSnapshot || 0))}
                        </span>
                        {canRemove && (
                          <button
                            type="button"
                            disabled={savingExtraService}
                            onClick={() => handleRemoveAppointmentService(svc.id)}
                            title="Remover este serviço do atendimento"
                            className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {selectedAppointment.transport?.enabled && (
                  <div className="py-2.5 px-3 rounded-xl border border-amber-200 bg-amber-50/70 text-xs mt-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-950">
                        <Car size={14} className="text-amber-700" />
                        <span>
                          Transporte (Táxi Dog · {selectedAppointment.transport.mode === 'pickup' || selectedAppointment.transport.mode === 'pickup_only' ? 'Apenas Buscar' : selectedAppointment.transport.mode === 'dropoff' || selectedAppointment.transport.mode === 'dropoff_only' ? 'Apenas Levar' : 'Buscar e Levar'})
                        </span>
                      </div>
                      <span className="font-extrabold tabular-nums text-amber-900 shrink-0">
                        {selectedAppointment.transport.coveredByPackage
                          ? 'Incluso no Pacote'
                          : money(Number(selectedAppointment.transport.fee || 0))}
                      </span>
                    </div>
                    {(selectedAppointment.transport.address || selectedAppointment.customer?.address) && (
                      <p className="text-[11px] text-amber-900 flex items-start gap-1">
                        <MapPin size={12} className="text-amber-700 shrink-0 mt-0.5" />
                        <span>
                          {selectedAppointment.transport.street || selectedAppointment.transport.address || selectedAppointment.customer?.address}
                          {selectedAppointment.transport.neighborhood ? ` · Bairro ${selectedAppointment.transport.neighborhood}` : ''}
                          {selectedAppointment.transport.reference ? ` (${selectedAppointment.transport.reference})` : ''}
                        </span>
                      </p>
                    )}
                    {selectedAppointment.transport.notes && (
                      <p className="text-[11px] text-amber-800 italic bg-amber-100/70 rounded px-1.5 py-0.5 border border-amber-200 font-medium">
                        Obs: {selectedAppointment.transport.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-zinc-200 flex justify-between items-center text-xs">
                <span className="font-bold text-zinc-700">Total adicional a receber:</span>
                <span className="text-sm font-bold text-teal-800 tabular-nums">
                  {money(
                    selectedAppointment.services
                      .filter(s => s.coverageStatus !== 'reserved' && s.coverageStatus !== 'consumed')
                      .reduce((sum, s) => sum + Number(s.priceSnapshot || 0), 0) +
                      (selectedAppointment.transport?.enabled && !selectedAppointment.transport.coveredByPackage
                        ? Number(selectedAppointment.transport.fee || 0)
                        : 0),
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
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-zinc-500 font-medium">Horário agendado</span>
                  {!['ready', 'delivered', 'cancelled'].includes(selectedAppointment.status) && !editingReschedule && (
                    <button
                      type="button"
                      onClick={() => setEditingReschedule(true)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors shadow-xs cursor-pointer"
                      title="Reagendar data e horário deste atendimento"
                    >
                      <CalendarDays size={12} />
                      Reagendar
                    </button>
                  )}
                </div>

                {editingReschedule ? (
                  <div className="space-y-2 mt-1">
                    <input
                      type="datetime-local"
                      value={rescheduleStartsAt}
                      onChange={e => setRescheduleStartsAt(e.target.value)}
                      disabled={savingReschedule}
                      className="w-full rounded-lg border border-teal-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 shadow-xs outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={savingReschedule}
                        onClick={() => setEditingReschedule(false)}
                        className="rounded px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/60"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={savingReschedule || !rescheduleStartsAt}
                        onClick={handleSaveReschedule}
                        className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50 shadow-xs cursor-pointer"
                      >
                        {savingReschedule ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Confirmar data
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <strong className="font-semibold text-zinc-800 block tabular-nums text-sm">
                      {new Date(selectedAppointment.startsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {timeStr(selectedAppointment.startsAt)} às {timeStr(selectedAppointment.endsAt)}
                    </strong>
                    <span className="text-[10px] text-zinc-400 block">
                      Duração estimada: {selectedAppointment.services.reduce((acc, s) => acc + (s.durationMinutes || 0), 0)} min
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Recado ou Foto da Etapa */}
            {selectedAppointment.stageNotes && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-xs text-teal-900">
                <strong className="block mb-1 font-semibold">Último recado enviado:</strong>
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

            {/* Galeria de Fotos de Todas as Etapas */}
            {(() => {
              const historyPhotos = Array.isArray(selectedAppointment.stageHistory)
                ? (selectedAppointment.stageHistory as any[]).filter(h => h.photoUrl)
                : [];
              const allPhotos: Array<{ url: string; label: string }> = [];
              historyPhotos.forEach(h => {
                if (h.photoUrl && !allPhotos.some(p => p.url === h.photoUrl)) {
                  allPhotos.push({
                    url: h.photoUrl,
                    label: h.label || statusLabelMap[h.status] || h.status,
                  });
                }
              });
              if (selectedAppointment.stagePhotoUrl && !allPhotos.some(p => p.url === selectedAppointment.stagePhotoUrl)) {
                allPhotos.push({
                  url: selectedAppointment.stagePhotoUrl,
                  label: 'Foto atual',
                });
              }

              if (allPhotos.length === 0) return null;

              return (
                <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                      <Camera size={14} className="text-teal-700" />
                      Galeria de Fotos do Atendimento ({allPhotos.length})
                    </span>
                    <span className="text-[10px] text-teal-700 font-medium">Fotos de cada etapa registrada</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allPhotos.map((photo, pIdx) => (
                      <a
                        key={pIdx}
                        href={getFullUrl(photo.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative rounded-lg overflow-hidden border border-teal-200 bg-white shadow-2xs hover:shadow-md transition"
                        title={`Clique para ampliar foto de ${photo.label}`}
                      >
                        <img
                          src={getFullUrl(photo.url)}
                          alt={`Foto etapa ${photo.label}`}
                          className="h-16 w-16 object-cover group-hover:scale-105 transition"
                        />
                        <span className="absolute bottom-0 inset-x-0 bg-black/65 text-[9px] text-white text-center py-0.5 truncate px-1 font-semibold">
                          {photo.label}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Histórico Completo de Transições & Auditoria */}
            {Array.isArray(selectedAppointment.stageHistory) && selectedAppointment.stageHistory.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                    <History size={14} className="text-teal-700" />
                    Histórico do Atendimento
                  </span>
                  <span className="text-[10px] text-zinc-500 font-semibold">
                    {selectedAppointment.stageHistory.length} registros
                  </span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedAppointment.stageHistory.map((h, hIdx) => {
                    const stageLabel = h.label || statusLabelMap[h.status] || getStageLabel(h.status, selectedAppointment.customStages) || h.status;
                    const timeFormatted = new Date(h.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    const dateFormatted = new Date(h.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

                    return (
                      <div
                        key={hIdx}
                        className={`flex items-start justify-between gap-2 rounded-lg p-2 text-xs border ${
                          h.skipped
                            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                            : 'bg-white border-zinc-200 text-zinc-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <strong className="font-bold">{stageLabel}</strong>
                            {h.kind === 'service_added' ? (
                              <span className="rounded bg-sky-50 border border-sky-200 text-sky-800 px-1.5 py-0.5 text-[10px] font-semibold">Adicionado</span>
                            ) : h.skipped ? (
                              <span className="rounded bg-amber-100 border border-amber-300 text-amber-900 px-1.5 py-0.2 text-[10px] font-bold">
                                Etapa Pulada
                              </span>
                            ) : (
                              <span className="rounded bg-teal-50 border border-teal-200 text-teal-800 px-1.5 py-0.2 text-[10px] font-semibold">
                                Concluída
                              </span>
                            )}
                            {h.userName && (
                              <span className="text-[11px] text-zinc-500">
                                por <strong className="text-zinc-700">{h.userName}</strong>
                              </span>
                            )}
                          </div>
                          {h.reason && <p className="text-[10px] text-amber-800 mt-0.5">{h.reason}</p>}
                          {h.notes && <p className="text-[11px] text-zinc-600 mt-0.5 italic">"{h.notes}"</p>}
                          {h.photoUrl && (
                            <div className="mt-2">
                              <a
                                href={getFullUrl(h.photoUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/80 p-1.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 transition"
                              >
                                <img
                                  src={getFullUrl(h.photoUrl)}
                                  alt="Foto da etapa"
                                  className="h-10 w-10 rounded object-cover border border-teal-200"
                                />
                                <span className="flex items-center gap-1">
                                  <Camera size={12} /> Foto da etapa ({stageLabel})
                                </span>
                              </a>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-zinc-400 tabular-nums shrink-0 mt-0.5">
                          {timeFormatted} · {dateFormatted}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            {/* Rodapé de Ações do Modal de Detalhes */}
            <div className={`flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-200 ${selectedAppointment.status === 'ready' ? '' : 'justify-between'}`}>
              <div className={selectedAppointment.status === 'ready' ? 'contents' : 'flex items-center gap-1.5 flex-wrap'}>
                <button
                  type="button"
                  onClick={() => openStageModal(selectedAppointment)}
                  className="order-1 flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
                >
                  <Camera size={14} className="text-teal-700" />
                  {selectedAppointment.stagePhotoUrl ? 'Trocar Foto' : 'Enviar Foto'}
                </button>

                {!(selectedAppointment.status === 'ready' && hasTaxiDogReturn(selectedAppointment)) && <button
                  type="button"
                  disabled={notifyingId === selectedAppointment.id}
                  onClick={() => notifyTutorWhatsApp(selectedAppointment)}
                  className={`order-2 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition cursor-pointer ${
                    selectedAppointment.status === 'ready'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                      : 'border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
                  }`}
                >
                  {selectedAppointment.status === 'ready' ? <BellRing size={14} /> : <MessageCircle size={14} />}
                  {notifyingId === selectedAppointment.id
                    ? 'Preparando…'
                    : selectedAppointment.status === 'ready'
                      ? 'Avisar: Pode Buscar!'
                      : 'Avisar Tutor'}
                </button>}

                {/* Botão de Reagendar Fácil */}
                {!['ready', 'delivered'].includes(selectedAppointment.status) && (
                  <button
                    type="button"
                    onClick={() => setAppointmentToReschedule(selectedAppointment)}
                    className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50/70 px-3 py-2 text-xs font-bold text-teal-900 hover:bg-teal-100 transition cursor-pointer"
                    title="Mudar data, horário ou profissional"
                  >
                    <CalendarDays size={14} className="text-teal-700" />
                    Reagendar
                  </button>
                )}

                {/* Botão de Cancelar Fácil */}
                {selectedAppointment.status !== 'delivered' && selectedAppointment.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => setAppointmentToCancel(selectedAppointment)}
                    className="order-5 flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50/60 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                    title="Cancelar agendamento ou marcar no-show"
                  >
                    <XCircle size={14} className="text-rose-600" />
                    Cancelar
                  </button>
                )}
              </div>

              <div className={selectedAppointment.status === 'ready' ? 'contents' : 'flex items-center gap-2'}>
                {selectedAppointment.status === 'delivered' ? (
                  <div className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 shadow-2xs">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>✓ Já Cobrado e Concluído</span>
                  </div>
                ) : selectedAppointment.status === 'cancelled' ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 shadow-2xs">
                      <XCircle size={14} className="text-rose-600" />
                      <span>Atendimento Cancelado</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAppointmentToReschedule(selectedAppointment)}
                      className="flex items-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-900 hover:bg-teal-100 transition cursor-pointer"
                    >
                      <CalendarDays size={13} />
                      Reativar / Reagendar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={chargingId === selectedAppointment.id || !['requested', 'scheduled', 'ready'].includes(selectedAppointment.status)}
                    onClick={() => handleChargeAppointment(selectedAppointment, ['requested', 'scheduled'].includes(selectedAppointment.status))}
                    className={`order-3 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 ${
                      ['requested', 'scheduled', 'ready'].includes(selectedAppointment.status)
                        ? 'bg-teal-600 text-white hover:bg-teal-700 ring-2 ring-teal-400/40'
                        : 'bg-zinc-800 text-white hover:bg-zinc-900'
                    }`}
                    title="Cobrar atendimento no Frente de Caixa (PDV) ou concluir via pacote"
                  >
                    {chargingId === selectedAppointment.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : selectedAppointment.status === 'ready' && selectedAppointment.services.filter(s => !s.comboParentId).every(s => s.coverageStatus === 'reserved' || s.coverageStatus === 'consumed') && !(selectedAppointment.transport?.enabled && !selectedAppointment.transport.coveredByPackage && Number(selectedAppointment.transport.fee || 0) > 0) ? (
                      <PackageCheck size={15} />
                    ) : (
                      <CreditCard size={15} />
                    )}
                    <span>
                      {selectedAppointment.status === 'ready' && selectedAppointment.services.filter(s => !s.comboParentId).every(s => s.coverageStatus === 'reserved' || s.coverageStatus === 'consumed') && !(selectedAppointment.transport?.enabled && !selectedAppointment.transport.coveredByPackage && Number(selectedAppointment.transport.fee || 0) > 0)
                        ? 'Concluir (Pacote)'
                        : ['requested', 'scheduled'].includes(selectedAppointment.status) ? 'Cobrar agora' : 'Cobrar'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedAppointment(null)}
                  className="order-4 rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {reversePaymentOpen && selectedAppointment && appointmentPayment && (
        <Modal title={`Estornar pagamento · ${selectedAppointment.pet?.name || 'Atendimento'}`} onClose={() => { if (!reversingPayment) { setReversePaymentOpen(false); setReverseReason(''); } }} maxWidth="sm:max-w-lg">
          <form className="grid gap-4" onSubmit={async event => {
            event.preventDefault();
            if (reverseReason.trim().length < 15 || reversingPayment) return;
            setReversingPayment(true);
            try {
              await api.post(`/petshop/appointments/${selectedAppointment.id}/reverse-payment`, { reason: reverseReason.trim() });
              setAppointmentPayment(null);
              setReversePaymentOpen(false);
              setReverseReason('');
              await loadAppointments(false);
              toast.success('Venda cancelada no sistema. Confirme separadamente a devolução de PIX ou cartão ao cliente.');
            } catch (error: any) {
              toast.error(error.response?.data?.message || 'Não foi possível estornar o pagamento.');
            } finally { setReversingPayment(false); }
          }}>
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950">Venda de <strong>{money(appointmentPayment.total)}</strong>. Cancelar a venda aqui não devolve PIX ou cartão automaticamente. Após confirmar, faça e confira a devolução ao cliente no meio de pagamento.</p>
            {appointmentPayment.nfceStatus === 'autorizada' && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Cancele primeiro a NFC-e autorizada na Gestão Fiscal.</p>}
            <label className="grid gap-1 text-sm font-semibold text-zinc-800">Motivo do estorno
              <textarea value={reverseReason} onChange={event => setReverseReason(event.target.value)} minLength={15} required rows={3} className="w-full rounded-lg border border-zinc-300 p-3 font-normal" placeholder="Descreva o motivo (mínimo de 15 caracteres)" />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={secondaryButton} onClick={() => { setReversePaymentOpen(false); setReverseReason(''); }} disabled={reversingPayment}>Voltar</button>
              <button type="submit" className="min-h-11 rounded-lg bg-rose-700 px-4 font-semibold text-white disabled:opacity-50" disabled={reversingPayment || reverseReason.trim().length < 15 || appointmentPayment.nfceStatus === 'autorizada'}>{reversingPayment ? 'Processando...' : 'Confirmar estorno'}</button>
            </div>
          </form>
        </Modal>
      )}

      {paymentItem && <PaymentModal isOpen onClose={() => setPaymentItem(null)} isOnline={navigator.onLine} tenantConfig={tenant}
        petshopReceipt={{ customer: paymentItem.appointment.customer.name, total: paymentItem.total, submit: async payments => { const { data } = await api.post(`/petshop/appointments/${paymentItem.appointment.id}/receive`, { payments, prepay: paymentItem.prepay }); return data; } }}
        onSuccess={() => { setSelectedAppointment(null); loadAppointments(false); toast.success('Pagamento registrado.'); }} />}

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
                    {val === 'ready' && hasTaxiDogReturn(stageModalItem) ? 'Pronto p/ levar' : label}
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
                placeholder="Ex: Tomou banho quentinho, comportou super bem e já está secando!"
                value={stageForm.stageNotes}
                onChange={e => setStageForm({ ...stageForm, stageNotes: e.target.value })}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-medium text-zinc-800">
              <input
                type="checkbox"
                checked={stageForm.notifyTutor}
                onChange={e => setStageForm({ ...stageForm, notifyTutor: e.target.checked })}
                disabled={!stageForm.stagePhotoUrl}
              />
              <span>
                Enviar a foto desta etapa pelo WhatsApp conectado para <strong>{stageModalItem.customer?.name?.split(' ')[0]}</strong>
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
      {openReception && <ReceptionRegistrationModal includePet onClose={() => setOpenReception(false)} onSaved={({ pet }) => {
        if (pet) {
          ++petsRequest.current;
          transportEdited.current = false;
          setPets([pet]);
          setSelectedTutor({ id: pet.customer.id, name: pet.customer.name, phone: pet.customer.phone });
          setAvailablePackages([]);
          setPackageSelections({});
          setForm(current => ({ ...current, petId: pet.id, serviceIds: [], transportEnabled: false, transportMode: 'both', transportFee: taxiDefaultFee, transportCoveredByPackage: false, transportNotes: '' }));
        }
        setOpenReception(false);
      }} />}
      {openNew && (
        <Modal title="Novo agendamento" onClose={() => setOpenNew(false)} suspended={openReception} maxWidth="sm:max-w-5xl">
          <div className="mx-auto -mt-2 mb-3 h-1 w-12 rounded-full bg-zinc-300 sm:hidden" />

          <form onSubmit={submitNew} className="space-y-4">
            {/* 1. TOPO: CLIENTE OU PET NOVO? */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                <UserRound size={15} className="text-[#0d6e5a]" />
                <span>Cliente ou pet novo?</span>
              </div>
              <button
                type="button"
                className="text-xs font-bold text-[#0d6e5a] hover:underline cursor-pointer"
                onClick={() => setOpenReception(true)}
              >
                + Cadastrar tutor e pet
              </button>
            </div>

            <section aria-label="Seleção de tutor" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0d6e5a] text-xs font-bold text-white">1</span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Encontre o tutor</h3>
                  <p className="text-xs text-zinc-500">Busque pelo nome ou telefone cadastrado</p>
                </div>
              </div>
              {selectedTutor ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-[#0d6e5a]">{selectedTutor.name.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-zinc-900">{selectedTutor.name}</p>
                    <p className="text-xs text-zinc-600">{selectedTutor.phone}</p>
                  </div>
                  <button type="button" className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-[#0d6e5a] hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d6e5a]" onClick={() => {
                    ++petsRequest.current;
                    bookingPetsController.current?.abort();
                    setSelectedTutor(null);
                    setTutorQuery('');
                    setSearchedTutorQuery('');
                    setPets([]);
                    setLoadingBookingPets(false);
                    setBookingPetsError(false);
                    setAvailablePackages([]);
                    setPackageSelections({});
                    setForm(current => ({ ...current, petId: '', serviceIds: [], transportEnabled: false, transportCoveredByPackage: false }));
                  }}>Trocar</button>
                </div>
              ) : (
                <>
                  <label htmlFor="booking-tutor-search" className="mb-1.5 block text-sm font-medium text-zinc-700">Nome ou telefone</label>
                  <div className="relative">
                    <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input id="booking-tutor-search" type="search" inputMode="search" autoComplete="off" className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white py-3 pl-11 pr-4 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0d6e5a] focus:ring-2 focus:ring-emerald-100" value={tutorQuery} onChange={event => {
                      setTutorQuery(event.target.value);
                      setSearchedTutorQuery('');
                      setTutorResults([]);
                      setTutorSearchError(false);
                    }} placeholder="Ex.: Ana Souza ou (11) 99999-9999" />
                  </div>
                  {tutorQuery.trim().length < 2 && <p className="mt-2 text-xs text-zinc-500">Digite pelo menos 2 caracteres para buscar.</p>}
                  <div aria-live="polite" className="mt-2 text-xs text-zinc-600">
                    {searchingTutors && <span className="inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Buscando tutores…</span>}
                    {tutorSearchError && <span className="text-rose-700">Não foi possível buscar. Edite a busca e tente novamente.</span>}
                    {!searchingTutors && !tutorSearchError && tutorQuery.trim().length >= 2 && searchedTutorQuery === tutorQuery.trim() && tutorResults.length === 0 && <span>Nenhum tutor encontrado. Confira o nome ou cadastre um novo tutor.</span>}
                  </div>
                  {tutorResults.length > 0 && <div className="mt-2 space-y-1" aria-label="Resultados da busca de tutores">
                    {tutorResults.map(tutor => <button key={tutor.id} type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d6e5a]" onClick={() => void chooseTutor(tutor)}>
                      <div aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-[#0d6e5a]">{tutor.name.slice(0, 2).toUpperCase()}</div>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{tutor.name}</span><span className="block text-xs text-zinc-600">{tutor.phone}</span></span>
                      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-zinc-400" />
                    </button>)}
                  </div>}
                </>
              )}
            </section>

            {!selectedTutor && tutorQuery.trim().length < 2 && <section aria-label="Clientes com mais movimentação" className="space-y-3">
              {!showTutorDirectory ? <>
                <div className="flex items-center gap-3 text-[#0d6e5a]">
                  <span className="h-px min-w-4 flex-1 bg-zinc-200" />
                  <PawPrint size={19} aria-hidden="true" className="shrink-0" />
                  <h3 className="text-center text-sm font-bold text-zinc-800 sm:text-base">Clientes com mais movimentação</h3>
                  <span className="h-px min-w-4 flex-1 bg-zinc-200" />
                </div>
                {loadingFrequentTutors && <div role="status" className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />)}</div>}
                {!loadingFrequentTutors && frequentTutorsError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Não foi possível carregar os clientes frequentes. <button type="button" className="font-semibold underline" onClick={() => setFrequentRetry(current => current + 1)}>Tentar novamente</button></div>}
                {!loadingFrequentTutors && !frequentTutorsError && frequentTutors.length === 0 && <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">Ainda não há atendimentos registrados para sugerir clientes.</p>}
                {!loadingFrequentTutors && !frequentTutorsError && frequentTutors.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
                  {frequentTutors.map(tutor => <button key={tutor.id} type="button" onClick={() => void chooseTutor(tutor)} className="flex min-h-24 min-w-0 items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d6e5a]">
                    <div className="relative shrink-0">
                      {tutor.pet ? <PetAvatar pet={tutor.pet} size="lg" /> : <div aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-[#0d6e5a]"><UserRound size={22} /></div>}
                      <span aria-hidden="true" className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-[#0d6e5a] text-[9px] font-bold text-white">{tutor.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-zinc-900">{tutor.name}</span>
                      <span className="flex items-center gap-1 truncate text-sm font-semibold text-[#0d6e5a]"><PawPrint size={14} aria-hidden="true" className="shrink-0" />{tutor.pet?.name || 'Pet não informado'}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600"><span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-900">{tutor.appointmentsCount} {tutor.appointmentsCount === 1 ? 'atendimento' : 'atendimentos'}</span><span>Última visita: {new Date(tutor.lastVisitAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')}</span></span>
                    </span>
                    <ChevronRight size={19} aria-hidden="true" className="shrink-0 text-[#0d6e5a]" />
                  </button>)}
                </div>}
                <button type="button" onClick={() => { setShowTutorDirectory(true); void loadBookingTutorDirectory(1); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 text-sm font-bold text-[#0d6e5a] hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d6e5a]"><UserRound size={17} aria-hidden="true" />Ver todos os clientes<ChevronRight size={17} aria-hidden="true" /></button>
              </> : <>
                <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-zinc-900">Todos os clientes</h3><button type="button" className="min-h-11 px-2 text-sm font-semibold text-[#0d6e5a]" onClick={() => { directoryController.current?.abort(); setShowTutorDirectory(false); }}>Voltar</button></div>
                {directoryTutors.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{directoryTutors.map(tutor => <button key={tutor.id} type="button" onClick={() => void chooseTutor(tutor)} className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left hover:border-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d6e5a]"><span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-[#0d6e5a]">{tutor.name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{tutor.name}</span><span className="block text-xs text-zinc-600">{tutor.phone}</span></span><ChevronRight size={18} aria-hidden="true" className="shrink-0 text-zinc-400" /></button>)}</div>}
                {loadingDirectory && <p role="status" className="flex items-center gap-2 text-sm text-zinc-600"><Loader2 size={16} className="animate-spin" />Carregando clientes…</p>}
                {directoryError && <div className="text-sm text-rose-800">Não foi possível carregar os clientes. <button type="button" className="font-semibold underline" onClick={() => void loadBookingTutorDirectory(directoryPage || 1)}>Tentar novamente</button></div>}
                {!loadingDirectory && !directoryError && directoryTutors.length === 0 && <p className="text-sm text-zinc-600">Nenhum cliente cadastrado.</p>}
                {!loadingDirectory && !directoryError && directoryHasMore && <button type="button" onClick={() => void loadBookingTutorDirectory(directoryPage + 1)} className="min-h-11 w-full rounded-xl border border-zinc-200 text-sm font-semibold text-[#0d6e5a] hover:bg-emerald-50">Carregar mais</button>}
              </>}
            </section>}

            {selectedTutor && <section aria-label="Seleção de pet" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0d6e5a] text-xs font-bold text-white">2</span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Escolha o pet</h3>
                  <p className="text-xs text-zinc-500">Pets de {selectedTutor.name}</p>
                </div>
              </div>
              {loadingBookingPets && <p role="status" className="flex items-center gap-2 py-3 text-sm text-zinc-600"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Carregando pets…</p>}
              {!loadingBookingPets && bookingPetsError && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><span>Não foi possível carregar os pets.</span><button type="button" className="min-h-11 font-semibold underline" onClick={() => void chooseTutor(selectedTutor)}>Tentar novamente</button></div>}
              {!loadingBookingPets && !bookingPetsError && pets.length === 0 && <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">Nenhum pet ativo encontrado para este tutor. Use “Cadastrar tutor e pet” acima para adicionar um pet.</p>}
              {!loadingBookingPets && !bookingPetsError && pets.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
                {pets.map(pet => {
                  const selected = form.petId === pet.id;
                  return <button key={pet.id} type="button" aria-pressed={selected} onClick={() => selectBookingPet(pet)} className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d6e5a] ${selected ? 'border-[#0d6e5a] bg-emerald-50 ring-1 ring-[#0d6e5a]' : 'border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'}`}>
                    <PetAvatar pet={pet} size="md" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-zinc-900">{pet.name}</span><span className="block truncate text-xs text-zinc-600">{pet.breed || (pet.species === 'cat' ? 'Gato' : 'Cão')}{pet.size ? ` · ${sizeLabel(pet.size)}` : ''}</span></span>
                    <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white' : 'border-zinc-300 text-transparent'}`}><Check size={14} /></span>
                  </button>;
                })}
              </div>}
            </section>}

            {form.petId && <>
            {/* 3. CARD DE DETALHES DO PET SELECIONADO (Fiel ao Mockup Image 3) */}
            {form.petId && (() => {
              const selectedPetObj = pets.find(p => p.id === form.petId);
              if (!selectedPetObj || selectedPetObj.size) return null;
              return (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-3 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <PetAvatar pet={selectedPetObj} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-zinc-900 font-bold text-sm truncate">{selectedPetObj.name}</strong>
                        {selectedPetObj.sex === 'male' && (
                          <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                            ♂ Macho
                          </span>
                        )}
                        {selectedPetObj.sex === 'female' && (
                          <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold bg-pink-50 text-pink-800 border border-pink-200">
                            ♀ Fêmea
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {selectedPetObj.breed || 'SRD'} · Tutor: {selectedPetObj.customer?.name || 'Tutor não informado'}
                      </p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <span className="block text-[11px] font-medium text-zinc-500 mb-1">Porte para cobrança:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-800 font-semibold text-[11px]">Sem porte!</span>
                        <select
                          className="rounded-lg border border-amber-400 bg-white px-2 py-1 text-xs font-semibold text-zinc-800"
                          defaultValue=""
                          onChange={async e => {
                            const val = e.target.value;
                            if (!val) return;
                            try {
                              await api.patch(`/petshop/pets/${selectedPetObj.id}`, { size: val });
                              toast.success(`Porte do pet atualizado para ${sizeLabel(val)}!`);
                              setPets(current => current.map(pet => pet.id === selectedPetObj.id ? { ...pet, size: val } : pet));
                              loadAppointments(false);
                            } catch {
                              toast.error('Erro ao salvar porte do pet.');
                            }
                          }}
                        >
                          <option value="">Definir porte agora...</option>
                          <option value="mini">Mini (até 5kg)</option>
                          <option value="small">Pequeno (5 a 10kg)</option>
                          <option value="medium">Médio (10 a 20kg)</option>
                          <option value="large">Grande (20 a 35kg)</option>
                          <option value="giant">Gigante (acima de 35kg)</option>
                        </select>
                      </div>
                  </div>
                </div>
              );
            })()}

            {/* 4. DATA/HORA & PROFISSIONAL (2 colunas) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                <span className="block text-xs font-bold text-zinc-700 mb-1 flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-teal-700" />
                  <span>Data e hora *</span>
                </span>
                <input
                  required
                  type="datetime-local"
                  className={inputClass}
                  value={form.startsAt}
                  onChange={e => setForm({ ...form, startsAt: e.target.value })}
                />
              </label>

              <label>
                <span className="block text-xs font-bold text-zinc-700 mb-1 flex items-center gap-1.5">
                  <UserRound size={13} className="text-teal-700" />
                  <span>Profissional</span>
                </span>
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
            </div>

            {/* 5. PACOTES PAGOS DESTE PET */}
            {form.petId && (
              <section className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3" aria-label="Pacotes pagos disponíveis">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-950">
                  <PackageCheck size={16} className="text-teal-700" aria-hidden="true" />
                  <span>Pacotes pagos deste pet</span>
                </div>
                {loadingPackages ? (
                  <p className="mt-1 flex items-center gap-2 text-xs text-teal-800" role="status">
                    <Loader2 size={13} className="animate-spin" /> Consultando saldo e validade…
                  </p>
                ) : packagesError ? (
                  <div className="mt-1 text-xs text-rose-700" role="alert">
                    Não foi possível consultar os pacotes.{' '}
                    <button type="button" className="font-semibold underline" onClick={() => retryPackages(n => n + 1)}>
                      Tentar novamente
                    </button>
                  </div>
                ) : availablePackages.length ? (
                  <div className="mt-2.5 grid gap-2">
                    {availablePackages.map(pkg => (
                      <article key={pkg.id} className="min-w-0 rounded-lg border border-teal-200 bg-white p-2.5 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <h3 className="text-xs font-bold text-slate-900">{pkg.planNameSnapshot}</h3>
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.2 text-[10px] font-bold text-emerald-800">
                            Pago
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Válido até {new Date(pkg.expiresAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                          {pkg.isShared ? ' · Compartilhado entre pets do tutor' : ''}
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {pkg.items.filter(item => Number(item.availableQuantity) > 0).map(item => (
                            <li key={item.id} className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-700">{item.serviceNameSnapshot || item.service?.name || 'Serviço do pacote'}</span>
                              <span className="font-bold tabular-nums text-teal-800">{item.availableQuantity} de {item.totalQuantity} sessões disponíveis</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Nenhum pacote pago com saldo disponível para esta data escolhida.
                  </p>
                )}
              </section>
            )}

            {/* 6. LISTA DE SERVIÇOS (Fiel ao Mockup Image 3) */}
            <fieldset className="space-y-2">
              <legend className="block text-xs font-bold text-zinc-700 mb-1 flex items-center gap-1.5">
                <Scissors size={13} className="text-teal-700" />
                <span>Serviços *</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 max-h-52 overflow-y-auto pr-1">
                {[...services].sort((a, b) => Number(coveredServiceIds.has(b.id)) - Number(coveredServiceIds.has(a.id))).map(svc => {
                  const isSelected = form.serviceIds.includes(svc.id);
                  const selectedPetObj = pets.find(p => p.id === form.petId);
                  const eff = getEffectiveServicePrice(svc, selectedPetObj);
                  const isCombo = svc.serviceType === 'COMBO';
                  const eligiblePackages = availablePackages.filter(pkg =>
                    pkg.items?.some(it => it.serviceId === svc.id && it.availableQuantity > 0),
                  );
                  const selectedPkgId = packageSelections[svc.id] || '';

                  return (
                    <div
                      key={svc.id}
                      className={`rounded-xl border p-2.5 transition ${
                        isSelected
                          ? isCombo
                            ? 'border-purple-500 bg-purple-50/70 ring-1 ring-purple-500'
                            : 'border-teal-500 bg-teal-50/70 ring-1 ring-teal-500'
                          : 'border-zinc-200 bg-white hover:border-zinc-300'
                      }`}
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          className="h-4 w-4 rounded accent-[#0d6e5a]"
                          onChange={e => {
                            const checked = e.target.checked;
                            setForm({
                              ...form,
                              serviceIds: checked
                                ? [...form.serviceIds, svc.id]
                                : form.serviceIds.filter(id => id !== svc.id),
                            });
                            if (checked && eligiblePackages.length > 0 && !packageSelections[svc.id]) {
                              setPackageSelections(prev => ({
                                ...prev,
                                [svc.id]: eligiblePackages[0].id,
                              }));
                            } else if (!checked && packageSelections[svc.id]) {
                              setPackageSelections(prev => {
                                const next = { ...prev };
                                delete next[svc.id];
                                return next;
                              });
                            }
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-zinc-900 block truncate">
                            {svc.name}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {eff.duration} min ·{' '}
                            {isSelected && selectedPkgId ? (
                              <span className="font-bold text-teal-700">Coberto por pacote (R$ 0,00)</span>
                            ) : (
                              <>
                                <strong className="font-bold text-zinc-800">{money(eff.price)}</strong>
                                {eff.variantLabel && (
                                  <span className="ml-1 text-[10px] text-teal-700 font-semibold">({eff.variantLabel})</span>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                      </label>

                      {isSelected && eligiblePackages.length > 0 && (
                        <div className="mt-2 border-t border-teal-200/80 pt-2">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-800 mb-1">
                            Cobertura de Pacote Disponível
                          </label>
                          <select
                            aria-label={`Cobertura de ${svc.name}`}
                            className="min-h-10 w-full min-w-0 rounded-lg border border-teal-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 outline-none"
                            value={selectedPkgId}
                            onChange={e =>
                              setPackageSelections(prev => ({
                                ...prev,
                                [svc.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Cobrar avulso ({money(eff.price)})</option>
                            {eligiblePackages.map(pkg => {
                              const item = pkg.items?.find(i => i.serviceId === svc.id);
                              return (
                                <option key={pkg.id} value={pkg.id}>
                                  Abater de: {pkg.planNameSnapshot} ({item?.availableQuantity} de {item?.totalQuantity} livres)
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {/* 7. TRANSPORTE DO ANIMAL (TÁXI DOG - Fiel ao Mockup Image 3) */}
            {form.petId && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-800">
                    <input
                      type="checkbox"
                      checked={form.transportEnabled}
                      onChange={e => {
                        transportEdited.current = true;
                        setForm(prev => ({
                          ...prev,
                          transportEnabled: e.target.checked,
                        }));
                      }}
                      className="h-4 w-4 rounded accent-[#0d6e5a]"
                    />
                    <span>🚐 Incluir Transporte do Animal (Táxi Dog) neste agendamento</span>
                  </label>
                  {form.transportEnabled && (
                    <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                      {form.transportCoveredByPackage ? 'Incluso no Pacote' : `+ ${money(Number(form.transportFee || 0))}`}
                    </span>
                  )}
                </div>

                {form.transportEnabled && (() => {
                  const selectedPetObj = pets.find(p => p.id === form.petId);
                  const customerHasSavedAddress = Boolean(selectedPetObj?.customer?.address && selectedPetObj.customer.address.trim().length > 0);

                  return (
                    <div className="space-y-3 pt-2.5 border-t border-amber-200/70">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label>
                          <span className="block text-xs font-medium text-zinc-600 mb-1">Modalidade do Transporte *</span>
                          <select
                            value={form.transportMode}
                            onChange={e => { transportEdited.current = true; setForm(prev => ({ ...prev, transportMode: e.target.value as any })); }}
                            className={inputClass}
                          >
                            <option value="both">Buscar e Levar (Ida e Volta)</option>
                            <option value="pickup">Apenas Buscar (Coleta)</option>
                            <option value="dropoff">Apenas Levar (Entrega)</option>
                          </select>
                        </label>

                        <label>
                          <span className="block text-xs font-medium text-zinc-600 mb-1">Valor do Transporte (R$) – Fixo ou por Distância</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={form.transportCoveredByPackage}
                            value={form.transportCoveredByPackage ? '0' : form.transportFee}
                            onChange={e => { transportEdited.current = true; setForm(prev => ({ ...prev, transportFee: e.target.value })); }}
                            className={inputClass}
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <label className="sm:col-span-2">
                          <span className="block text-xs font-medium text-zinc-600 mb-1">Endereço (Rua, Av. e Número) *</span>
                          <input
                            type="text"
                            required={form.transportEnabled}
                            placeholder="Ex: Heitor de Andrada campos, 274"
                            value={form.customerStreet}
                            onChange={e => setForm(prev => ({ ...prev, customerStreet: e.target.value }))}
                            className={inputClass}
                          />
                        </label>
                        <label>
                          <span className="block text-xs font-medium text-zinc-600 mb-1">Bairro *</span>
                          <input
                            type="text"
                            required={form.transportEnabled}
                            placeholder="Ex: Jd prudencia"
                            value={form.customerNeighborhood}
                            onChange={e => setForm(prev => ({ ...prev, customerNeighborhood: e.target.value }))}
                            className={inputClass}
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label>
                          <span className="block text-xs font-medium text-zinc-600 mb-1">Ponto de Referência / Compl.</span>
                          <input
                            type="text"
                            placeholder="Ex: Próximo ao Campo Orlandão, Ap 12"
                            value={form.customerReference}
                            onChange={e => setForm(prev => ({ ...prev, customerReference: e.target.value }))}
                            className={inputClass}
                          />
                        </label>
                        <label>
                          <span className="block text-xs font-medium text-zinc-600 mb-1">Observação do Transporte</span>
                          <input
                            type="text"
                            placeholder="Ex: Interfone estragado, chamar no portão..."
                            value={form.transportNotes}
                            onChange={e => setForm(prev => ({ ...prev, transportNotes: e.target.value }))}
                            className={inputClass}
                          />
                        </label>
                      </div>

                      {!customerHasSavedAddress && (
                        <div className="pt-2 border-t border-amber-200/60">
                          <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-50/90 border border-amber-300 cursor-pointer text-xs text-amber-950 font-medium hover:bg-amber-100/70 transition">
                            <input
                              type="checkbox"
                              checked={form.saveAddressToCustomer}
                              onChange={e => setForm(prev => ({ ...prev, saveAddressToCustomer: e.target.checked }))}
                              className="mt-0.5 rounded text-teal-800 focus:ring-teal-700"
                            />
                            <div>
                              <span className="font-bold block text-[11px]">
                                Cadastrar este endereço na ficha de {selectedPetObj?.customer?.name || 'cliente'}?
                              </span>
                              <span className="text-[10px] text-amber-800 leading-tight block">
                                Este cliente ainda não possui endereço registrado. Marque para salvar permanentemente no cadastro dele.
                              </span>
                            </div>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 8. VALOR ADICIONAL A RECEBER (Fiel ao Mockup Image 3) */}
            {form.petId && (
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3 shadow-2xs flex items-center justify-between" aria-live="polite">
                <div className="flex items-center gap-2">
                  <Coins size={16} className="text-[#0d6e5a] shrink-0" />
                  <span className="font-bold text-xs text-zinc-800">Valor adicional a receber:</span>
                </div>
                <strong className="text-base font-black tabular-nums text-teal-900">
                  {money(
                    form.serviceIds.reduce((sum, serviceId) => {
                      if (packageSelections[serviceId]) return sum;
                      const service = services.find(s => s.id === serviceId);
                      return sum + (service ? getEffectiveServicePrice(service, pets.find(p => p.id === form.petId)).price : 0);
                    }, 0) + (form.transportEnabled && !form.transportCoveredByPackage ? Math.max(0, Number(form.transportFee || 0)) : 0)
                  )}
                </strong>
              </div>
            )}

            {/* 9. OBSERVAÇÕES */}
            <label className="block">
              <span className="block text-xs font-bold text-zinc-700 mb-1 flex items-center gap-1.5">
                <MessageSquare size={13} className="text-teal-700" />
                <span>Observações</span>
              </span>
              <textarea
                className={inputClass}
                rows={2}
                placeholder="Ex: Alergia a lâmina, pelo embolado, pet agitado..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </label>

            {/* 10. BOTÃO DE CONFIRMAR AGENDAMENTO */}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
              <input type="checkbox" checked={chargeNow} onChange={event => setChargeNow(event.target.checked)} className="h-5 w-5 accent-[#0d6e5a]" />
              Cobrar agora após criar o agendamento
            </label>
            <button
              disabled={saving || loadingPackages || packagesError || !form.petId || !form.startsAt || form.serviceIds.length === 0}
              className="w-full rounded-xl bg-[#0d6e5a] hover:bg-[#0a5747] text-white font-bold py-3.5 text-sm shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CalendarDays size={16} />
              <span>{saving ? 'Agendando…' : 'Confirmar agendamento'}</span>
            </button>
            </>}
          </form>
        </Modal>
      )}

      {/* MODAL DE CANCELAMENTO FÁCIL */}
      {appointmentToCancel && (
        <CancelAppointmentModal
          appointment={appointmentToCancel}
          onClose={() => setAppointmentToCancel(null)}
          onSuccess={updated => {
            setItems(curr => curr.map(row => (row.id === updated.id ? updated : row)));
            if (selectedAppointment?.id === updated.id) {
              setSelectedAppointment(updated);
            }
            loadAppointments(false);
          }}
        />
      )}

      {/* MODAL DE REAGENDAMENTO FÁCIL */}
      {appointmentToReschedule && (
        <RescheduleAppointmentModal
          appointment={appointmentToReschedule}
          operators={operators}
          onClose={() => setAppointmentToReschedule(null)}
          onSuccess={updated => {
            setItems(curr => curr.map(row => (row.id === updated.id ? updated : row)));
            if (selectedAppointment?.id === updated.id) {
              setSelectedAppointment(updated);
            }
            loadAppointments(false);
          }}
        />
      )}
    </div>
  );
}
