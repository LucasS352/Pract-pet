import { PackagePaymentFields, type PackagePaymentRow, packagePaymentLabels, paymentAmount, packagePaymentsValid } from './PackagePaymentFields';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  History,
  Layers,
  LayoutGrid,
  List,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  PawPrint,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useShift } from '@/contexts/ShiftContext';
import type {
  CustomerPetPackage,
  CustomerPetPackageItem,
  Pet,
  PetPackagePlan,
  PetPackagePricingRule,
  PetService,
  Tutor,
} from './types';
import { dateTime, money } from './types';
import {
  EmptyState,
  inputClass,
  labelClass,
  ListSkeleton,
  Modal,
  pageClass,
  PageHeader,
  PetAvatar,
  primaryButton,
  secondaryButton,
} from './ui';

type ActiveTab = 'contracts' | 'catalog' | 'renewals';

const SIZE_LABELS: Record<string, string> = {
  all: 'Todos os portes',
  small: 'Pequeno (P)',
  medium: 'Médio (M)',
  large: 'Grande (G)',
  giant: 'Gigante (GG)',
};

const COAT_LABELS: Record<string, string> = {
  all: 'Todas as pelagens',
  short: 'Pelo Curto',
  medium: 'Pelo Médio',
  long: 'Pelo Longo',
  double: 'Pelagem Dupla',
};

const SPECIES_LABELS: Record<string, string> = {
  all: 'Cães e Gatos',
  dog: 'Cachorro',
  cat: 'Gato',
};

const TAXI_MODE_LABELS: Record<string, string> = {
  round_trip: 'Buscar e Levar (Ida e Volta)',
  pickup_only: 'Somente Buscar (Ida)',
  dropoff_only: 'Somente Levar (Volta)',
};

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  CONTRACT_CREATED: { label: 'Contratação Inicial', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  RESERVE: { label: 'Reserva em Agenda', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  CONSUME: { label: 'Sessão Realizada', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RELEASE_RESERVATION: { label: 'Reserva Liberada', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  REFUND: { label: 'Estorno de Sessão', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  CANCEL: { label: 'Cancelamento', color: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const localDateTimeInput = (value: string) => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function PetshopPackagesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { operator } = useShift();

  const [activeTab, setActiveTab] = useState<ActiveTab>('contracts');
  const [loading, setLoading] = useState(true);

  const [contracts, setContracts] = useState<CustomerPetPackage[]>([]);
  const [plans, setPlans] = useState<PetPackagePlan[]>([]);
  const [services, setServices] = useState<PetService[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [financialOverview, setFinancialOverview] = useState<any>(null);

  // Filtros de contratos e controles de visualização/paginação
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Modal de Criação / Edição de Plano do Catálogo
  const [openPlanModal, setOpenPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PetPackagePlan | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planForm, setPlanForm] = useState<{
    name: string;
    description: string;
    basePrice: string;
    validityDays: number;
    allowSharedPets: boolean;
    active: boolean;
    items: Array<{ serviceId: string; quantity: number }>;
    pricingRules: Array<{
      species: string;
      size: string;
      coatType: string;
      price: string;
      label: string;
    }>;
  }>({
    name: '',
    description: '',
    basePrice: '',
    validityDays: 30,
    allowSharedPets: false,
    active: true,
    items: [],
    pricingRules: [],
  });

  // Modal de Nova Contratação de Pacote
  const [openContractModal, setOpenContractModal] = useState(false);
  const contractOpenRef = useRef(false);
  contractOpenRef.current = openContractModal;
  const [taxiDefaultFee, setTaxiDefaultFee] = useState('40');
  useEffect(() => {
    api.get<{ fee: number }>('/petshop/taxi-default-fee')
      .then(({ data }) => {
        const fee = String(data.fee);
        setTaxiDefaultFee(fee);
        if (!contractOpenRef.current) setContractForm(current => ({ ...current, transportFee: fee }));
      })
      .catch(() => toast.error('Não foi possível carregar o preço padrão do Táxi Dog.'));
  }, []);
  const [savingContract, setSavingContract] = useState(false);
  const [paymentRows, setPaymentRows] = useState<PackagePaymentRow[]>([{ method: 'pix', amount: '0,00' }]);
  const [contractForm, setContractForm] = useState({
    customerId: '',
    petId: '',
    packagePlanId: '',
    isShared: false,
    species: 'dog',
    size: 'small',
    coatType: 'short',
    customPrice: '',
    discountAmount: '0',
    validityDays: 30,
    startDate: new Date().toISOString().slice(0, 10),
    billingMode: 'paid' as 'paid' | 'comanda',
    paymentMethod: 'pix',
    notes: '',
    transportEnabled: false,
    transportMode: 'round_trip' as 'round_trip' | 'pickup_only' | 'dropoff_only',
    transportFee: taxiDefaultFee,
    customerStreet: '',
    customerNeighborhood: '',
    customerReference: '',
    transportNotes: '',
    saveAddressToCustomer: true,
    scheduleRecurring: true,
    fixedDayOfWeek: 5, // 5 = Sexta-feira
    fixedTime: '15:00',
  });
  const [scheduledSessions, setScheduledSessions] = useState<
    Array<{
      date: string;
      time: string;
      serviceId: string;
      petId?: string;
      customEdited?: boolean;
      completed?: boolean;
      stageOperators?: { bathing?: string; grooming?: string; finishing?: string };
    }>
  >([]);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [multiPetMode, setMultiPetMode] = useState<'shared' | 'per_pet'>('per_pet');
  const [activeSchedulePetId, setActiveSchedulePetId] = useState<string>('all');
  const [perPetCustomPrices, setPerPetCustomPrices] = useState<Record<string, string>>({});
  const [perPetOverrides, setPerPetOverrides] = useState<
    Record<
      string,
      Record<
        number,
        {
          date?: string;
          time?: string;
          stageOperators?: { bathing?: string; grooming?: string; finishing?: string };
        }
      >
    >
  >({});
  const [tutorSearchQuery, setTutorSearchQuery] = useState('');
  const [tutorSearchOpen, setTutorSearchOpen] = useState(false);
  const [operators, setOperators] = useState<Array<{ id: string; name: string; jobTitle?: string | null; active?: boolean }>>([]);
  const [defaultPastOperators, setDefaultPastOperators] = useState<{
    bathing: string;
    grooming: string;
    finishing: string;
  }>({ bathing: '', grooming: '', finishing: '' });

  // Modal de Detalhes / Histórico / Estorno de Contrato
  const [selectedContract, setSelectedContract] = useState<CustomerPetPackage | null>(null);
  const [selectedGroupContracts, setSelectedGroupContracts] = useState<CustomerPetPackage[]>([]);
  const [loadingContractDetails, setLoadingContractDetails] = useState(false);
  const [contractDetailsError, setContractDetailsError] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [rescheduleStartsAt, setRescheduleStartsAt] = useState('');
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [refundTargetItem, setRefundTargetItem] = useState<CustomerPetPackageItem | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundAppointmentId, setRefundAppointmentId] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [submittingCancel, setSubmittingCancel] = useState(false);

  useEffect(() => {
    const contractId = selectedContract?.id;
    if (!contractId) return;
    let active = true;
    setLoadingContractDetails(true);
    setContractDetailsError(false);
    api.get<CustomerPetPackage>(`/petshop/packages/contracts/${contractId}`)
      .then(({ data }) => {
        if (active) setSelectedContract(data);
      })
      .catch(() => {
        if (active) setContractDetailsError(true);
      })
      .finally(() => {
        if (active) setLoadingContractDetails(false);
      });
    return () => { active = false; };
  }, [selectedContract?.id]);

  const loadAll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [contractsRes, plansRes, servicesRes, tutorsRes, petsRes, finRes, opsRes] = await Promise.all([
        api.get('/petshop/packages/contracts'),
        api.get('/petshop/packages/plans?includeInactive=true'),
        api.get('/petshop/services'),
        api.get('/petshop/tutors'),
        api.get('/petshop/pets'),
        api.get('/petshop/packages/financial-overview'),
        api.get('/operators').catch(() => ({ data: [] })),
      ]);

      setContracts(Array.isArray(contractsRes.data) ? contractsRes.data : []);
      setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
      setServices(Array.isArray(servicesRes.data) ? servicesRes.data : []);
      setTutors(Array.isArray(tutorsRes.data) ? tutorsRes.data : []);
      setPets(Array.isArray(petsRes.data) ? petsRes.data : []);
      setFinancialOverview(finRes.data || null);
      const activeOps = (Array.isArray(opsRes.data) ? opsRes.data : []).filter((o: any) => o.active !== false);
      setOperators(activeOps);
      if (activeOps.length > 0) {
        const banhista = activeOps.find((o: any) => (o.jobTitle || '').toLowerCase().includes('banh')) || activeOps[0];
        const tosador = activeOps.find((o: any) => (o.jobTitle || '').toLowerCase().includes('tosa')) || activeOps[0];
        setDefaultPastOperators(prev => ({
          bathing: prev.bathing || banhista?.id || '',
          grooming: prev.grooming || tosador?.id || '',
          finishing: prev.finishing || banhista?.id || '',
        }));
      }
    } catch {
      toast.error('Não foi possível carregar os dados de pacotes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Se vier ?petId=... ou ?newContract=1 pela URL, abre o modal de contratação pré-selecionado
  useEffect(() => {
    const prePetId = searchParams.get('petId');
    const preTutorId = searchParams.get('customerId');
    if ((prePetId || preTutorId) && pets.length > 0 && plans.length > 0) {
      const foundPet = prePetId ? pets.find(p => p.id === prePetId) : null;
      const resolvedTutorId = foundPet?.customerId || preTutorId || tutors[0]?.id || '';
      const activePlan = plans.find(p => p.active) || plans[0];

      if (activePlan) {
        setContractForm(prev => ({
          ...prev,
          customerId: resolvedTutorId,
          petId: foundPet?.id || '',
          packagePlanId: activePlan.id,
          validityDays: activePlan.validityDays,
          species: foundPet?.species || 'dog',
          size: foundPet?.size || 'small',
          coatType: foundPet?.coatType || 'short',
        }));
        setSelectedPetIds(foundPet?.id ? [foundPet.id] : []);
        setMultiPetMode('per_pet');
        setPerPetCustomPrices({});
        setPerPetOverrides({});
        setTutorSearchQuery('');
        setTutorSearchOpen(!resolvedTutorId);
        setOpenContractModal(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, pets, plans, tutors, setSearchParams]);

  // Garante que o modal de contratação nunca fique com plano vazio ao abrir
  useEffect(() => {
    if (openContractModal && !contractForm.packagePlanId && plans.length > 0) {
      const activePlan = plans.find(p => p.active) || plans[0];
      if (activePlan) {
        setContractForm(prev => ({
          ...prev,
          packagePlanId: activePlan.id,
          validityDays: activePlan.validityDays,
        }));
      }
    }
  }, [openContractModal, contractForm.packagePlanId, plans]);

  // Simula preço automático sempre que plano, pet, porte ou pelagem mudam no modal de contratação
  useEffect(() => {
    if (!openContractModal || !contractForm.packagePlanId) {
      return;
    }
    api
      .get('/petshop/packages/simulate-price', {
        params: {
          planId: contractForm.packagePlanId,
          petId: contractForm.petId || undefined,
          species: contractForm.species,
          size: contractForm.size,
          coatType: contractForm.coatType,
        },
      })
      .then(res => {
        setContractForm(prev => ({
          ...prev,
          customPrice: String(res.data.suggestedPrice ?? ''),
        }));
      })
      .catch(() => {});
  }, [
    openContractModal,
    contractForm.packagePlanId,
    contractForm.petId,
    contractForm.species,
    contractForm.size,
    contractForm.coatType,
  ]);

  const tutorPets = useMemo(
    () => pets.filter(p => p.customerId === contractForm.customerId),
    [pets, contractForm.customerId],
  );

  const selectedTutorObj = useMemo(
    () => tutors.find(t => t.id === contractForm.customerId) || null,
    [tutors, contractForm.customerId],
  );

  const selectedPlanObj = useMemo(
    () => plans.find(p => p.id === contractForm.packagePlanId) || null,
    [plans, contractForm.packagePlanId],
  );

  const filteredModalTutors = useMemo(() => {
    const q = tutorSearchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    if (!q) return tutors.slice(0, 30);
    return tutors
      .filter(t => {
        const nameMatch = (t.name || '').toLowerCase().includes(q);
        const phoneStr = String(t.phone || '');
        const phoneMatch =
          phoneStr.toLowerCase().includes(q) ||
          (qDigits.length >= 2 && phoneStr.replace(/\D/g, '').includes(qDigits));
        return nameMatch || phoneMatch;
      })
      .slice(0, 30);
  }, [tutors, tutorSearchQuery]);

  const selectedPetsList = useMemo(
    () => selectedPetIds.map(id => pets.find(p => p.id === id)).filter((p): p is Pet => Boolean(p)),
    [selectedPetIds, pets],
  );

  const computeSuggestedPlanPriceForPet = useCallback(
    (plan: PetPackagePlan | null, petObj: Pet | null) => {
      if (!plan) return 0;
      const sp = (petObj?.species || contractForm.species || 'all').toLowerCase();
      const sz = (petObj?.size || contractForm.size || 'all').toLowerCase();
      const ct = (petObj?.coatType || contractForm.coatType || 'all').toLowerCase();
      let bestRule: PetPackagePricingRule | null = null;
      let bestScore = -1;
      for (const r of plan.pricingRules || []) {
        const spMatch = r.species === 'all' || r.species === sp;
        const szMatch = r.size === 'all' || r.size === sz;
        const ctMatch = r.coatType === 'all' || r.coatType === ct;
        if (!spMatch || !szMatch || !ctMatch) continue;
        let score = 0;
        if (r.size === sz && sz !== 'all') score += 4;
        if (r.coatType === ct && ct !== 'all') score += 2;
        if (r.species === sp && sp !== 'all') score += 1;
        if (score > bestScore) {
          bestScore = score;
          bestRule = r;
        }
      }
      return bestRule ? Number(bestRule.price) : Number(plan.basePrice);
    },
    [contractForm.species, contractForm.size, contractForm.coatType],
  );

  useEffect(() => {
    if (!openContractModal || !selectedPlanObj || selectedPetsList.length < 2 || multiPetMode !== 'per_pet') return;
    setPerPetCustomPrices(prev => {
      const next: Record<string, string> = {};
      for (const p of selectedPetsList) {
        next[p.id] = prev[p.id] !== undefined ? prev[p.id] : String(computeSuggestedPlanPriceForPet(selectedPlanObj, p));
      }
      return next;
    });
  }, [openContractModal, selectedPlanObj, selectedPetsList, multiPetMode, computeSuggestedPlanPriceForPet]);

  const recalcAllPerPetPricesFromPlan = useCallback(
    (plan: PetPackagePlan | null, petsList: Pet[]) => {
      if (!plan) return;
      const next: Record<string, string> = {};
      for (const p of petsList) {
        next[p.id] = String(computeSuggestedPlanPriceForPet(plan, p));
      }
      setPerPetCustomPrices(next);
    },
    [computeSuggestedPlanPriceForPet],
  );

  const parseAddressParts = (addr?: string | null) => {
    if (!addr) return { street: '', neighborhood: '' };
    if (addr.includes(' - ')) {
      const parts = addr.split(' - ');
      return { street: parts[0].trim(), neighborhood: parts.slice(1).join(' - ').trim() };
    }
    return { street: addr.trim(), neighborhood: '' };
  };

  // Sincroniza endereço do tutor selecionado
  useEffect(() => {
    if (!openContractModal || !selectedTutorObj) return;
    const parsedAddr = parseAddressParts(selectedTutorObj.address);
    const hasAddr = Boolean(selectedTutorObj.address && selectedTutorObj.address.trim().length > 0);
    setContractForm(prev => ({
      ...prev,
      customerStreet: parsedAddr.street,
      customerNeighborhood: parsedAddr.neighborhood,
      customerReference: selectedTutorObj.reference || '',
      transportNotes: '',
      saveAddressToCustomer: !hasAddr,
    }));
  }, [openContractModal, selectedTutorObj]);

  // Gera automaticamente o cronograma semanal recorrente (respeitando a quantidade de sessões do pacote, ex: 30 dias = 4 sessões, 90 dias = 12 sessões)
  const regenerateRecurringSchedule = useCallback(
    (plan: PetPackagePlan | null, startStr: string, dayOfWeek: number, timeStr: string) => {
      if (!plan || !Array.isArray(plan.items) || plan.items.length === 0) {
        setScheduledSessions([]);
        return;
      }
      // Expande a fila de sessões do plano
      const expandedServiceIds: string[] = [];
      for (const item of plan.items) {
        for (let q = 0; q < item.quantity; q++) {
          expandedServiceIds.push(item.serviceId);
        }
      }
      const totalCount = Math.min(24, expandedServiceIds.length);
      const baseDate = startStr ? new Date(`${startStr}T12:00:00`) : new Date();
      if (Number.isNaN(baseDate.getTime())) return;

      // Encontra a primeira ocorrência do dia da semana escolhido a partir da data de início
      const currentDow = baseDate.getDay();
      const daysUntilFirst = (dayOfWeek - currentDow + 7) % 7;
      const firstSessionDate = new Date(baseDate);
      firstSessionDate.setDate(firstSessionDate.getDate() + daysUntilFirst);

      const now = new Date();
      const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      setScheduledSessions(prev => {
        const generated: Array<{
          date: string;
          time: string;
          serviceId: string;
          customEdited?: boolean;
          completed?: boolean;
          stageOperators?: { bathing?: string; grooming?: string; finishing?: string };
        }> = [];
        for (let i = 0; i < totalCount; i++) {
          const existing = prev[i];
          if (existing?.customEdited && existing.date) {
            generated.push(existing);
            continue;
          }
          const d = new Date(firstSessionDate);
          d.setDate(d.getDate() + i * 7);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dateYMD = `${yyyy}-${mm}-${dd}`;
          const isPast = dateYMD < todayYMD;
          generated.push({
            date: dateYMD,
            time: timeStr || '15:00',
            serviceId: expandedServiceIds[i] || plan.items[0].serviceId,
            customEdited: false,
            completed: isPast,
            stageOperators: {
              bathing: defaultPastOperators.bathing,
              grooming: defaultPastOperators.grooming,
              finishing: defaultPastOperators.finishing,
            },
          });
        }
        return generated;
      });
    },
    [defaultPastOperators],
  );

  useEffect(() => {
    if (!openContractModal || !selectedPlanObj) return;
    regenerateRecurringSchedule(
      selectedPlanObj,
      contractForm.startDate,
      contractForm.fixedDayOfWeek,
      contractForm.fixedTime,
    );
  }, [
    openContractModal,
    selectedPlanObj,
    contractForm.startDate,
    contractForm.fixedDayOfWeek,
    contractForm.fixedTime,
    regenerateRecurringSchedule,
  ]);

  const isContractExpired = useCallback((c: CustomerPetPackage) => {
    return c.status === 'expired' || (c.status === 'active' && Boolean(c.expiresAt) && new Date(c.expiresAt) < new Date());
  }, []);

  const contractCounts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let expired = 0;
    contracts.forEach(c => {
      if (isContractExpired(c)) {
        expired += 1;
      } else if (c.status === 'active') {
        active += 1;
        if (c.paymentStatus === 'pending') pending += 1;
      } else if (c.paymentStatus === 'pending' && c.status !== 'cancelled') {
        pending += 1;
      }
    });
    return { all: contracts.length, active, pending, expired };
  }, [contracts, isContractExpired]);

  const contractServiceOptions = useMemo(() => {
    const map = new Map<string, string>();
    services.forEach(s => map.set(s.id, s.name));
    contracts.forEach(c => {
      c.items?.forEach(it => {
        if (it.serviceId && it.serviceNameSnapshot) {
          map.set(it.serviceId, it.serviceNameSnapshot);
        }
      });
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [services, contracts]);

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const expired = isContractExpired(c);
      if (statusFilter === 'active') {
        if (c.status !== 'active' || expired) return false;
      } else if (statusFilter === 'pending_payment') {
        if (c.paymentStatus !== 'pending' || c.status === 'cancelled') return false;
      } else if (statusFilter === 'expired') {
        if (!expired) return false;
      } else if (statusFilter !== 'all' && c.status !== statusFilter) {
        return false;
      }

      if (serviceFilter !== 'all') {
        const hasService = c.items?.some(it => it.serviceId === serviceFilter || it.serviceNameSnapshot === serviceFilter);
        if (!hasService) return false;
      }

      if (sizeFilter !== 'all') {
        const petSize = (c.sizeSnapshot || c.pet?.size || '').toLowerCase();
        if (petSize !== sizeFilter) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTutor = c.customer?.name?.toLowerCase().includes(q);
        const matchPet = c.pet?.name?.toLowerCase().includes(q);
        const matchGroupPets = c.packageGroup?.petNames?.some(n => n.toLowerCase().includes(q));
        const matchPlan = c.planNameSnapshot?.toLowerCase().includes(q);
        if (!matchTutor && !matchPet && !matchGroupPets && !matchPlan) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, serviceFilter, sizeFilter, search, isContractExpired]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, serviceFilter, sizeFilter, pageSize]);

  useEffect(() => {
    if (!openMenuId) return;
    const handleOutside = () => setOpenMenuId(null);
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, [openMenuId]);

  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  type ContractCardEntry = {
    key: string;
    primary: CustomerPetPackage;
    members: CustomerPetPackage[];
    isMultiPetGroup: boolean;
  };

  const groupedContractEntries = useMemo<ContractCardEntry[]>(() => {
    const entries: ContractCardEntry[] = [];
    const byGroupId = new Map<string, ContractCardEntry>();
    for (const c of filteredContracts) {
      const grp = c.packageGroup;
      if (grp?.id && grp.mode === 'per_pet') {
        const existing = byGroupId.get(grp.id);
        if (existing) {
          existing.members.push(c);
        } else {
          const entry: ContractCardEntry = {
            key: `grp:${grp.id}`,
            primary: c,
            members: [c],
            isMultiPetGroup: true,
          };
          byGroupId.set(grp.id, entry);
          entries.push(entry);
        }
      } else {
        entries.push({
          key: c.id,
          primary: c,
          members: [c],
          isMultiPetGroup: false,
        });
      }
    }
    return entries.map(e => ({
      ...e,
      isMultiPetGroup: e.members.length > 1,
    }));
  }, [filteredContracts]);

  const groupedTotalPages = Math.max(1, Math.ceil(groupedContractEntries.length / pageSize));
  const groupedSafePage = Math.min(currentPage, groupedTotalPages);
  const paginatedContractEntries = useMemo(() => {
    const start = (groupedSafePage - 1) * pageSize;
    return groupedContractEntries.slice(start, start + pageSize);
  }, [groupedContractEntries, groupedSafePage, pageSize]);

  const openContractDetailsModal = useCallback(
    (contract: CustomerPetPackage, groupMembers?: CustomerPetPackage[]) => {
      const siblings =
        groupMembers && groupMembers.length > 1
          ? groupMembers
          : contract.packageGroup?.id && contract.packageGroup.mode === 'per_pet'
            ? contracts.filter(c => c.packageGroup?.id === contract.packageGroup?.id)
            : [contract];
      const finalMembers = siblings.length > 0 ? siblings : [contract];
      setSelectedGroupContracts(finalMembers);
      setSelectedContract(contract);
    },
    [contracts],
  );

  const handleOpenNewPlan = () => {
    setEditingPlan(null);
    setPlanForm({
      name: '',
      description: '',
      basePrice: '',
      validityDays: 30,
      allowSharedPets: false,
      active: true,
      items: services[0] ? [{ serviceId: services[0].id, quantity: 4 }] : [],
      pricingRules: [
        { species: 'dog', size: 'small', coatType: 'short', price: '', label: 'Pequeno · Pelo Curto' },
        { species: 'dog', size: 'small', coatType: 'long', price: '', label: 'Pequeno · Pelo Longo' },
        { species: 'dog', size: 'medium', coatType: 'all', price: '', label: 'Porte Médio' },
        { species: 'dog', size: 'large', coatType: 'all', price: '', label: 'Porte Grande' },
      ],
    });
    setOpenPlanModal(true);
  };

  const handleOpenEditPlan = (plan: PetPackagePlan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description || '',
      basePrice: String(Number(plan.basePrice)),
      validityDays: plan.validityDays,
      allowSharedPets: plan.allowSharedPets,
      active: plan.active,
      items: plan.items.map(i => ({ serviceId: i.serviceId, quantity: i.quantity })),
      pricingRules: plan.pricingRules.map(r => ({
        species: r.species,
        size: r.size,
        coatType: r.coatType,
        price: String(Number(r.price)),
        label: r.label || '',
      })),
    });
    setOpenPlanModal(true);
  };

  const handleSubmitPlan = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPlan(true);
    try {
      const validRules = planForm.pricingRules
        .filter(r => r.price !== '' && Number(r.price) >= 0)
        .map(r => ({
          species: r.species,
          size: r.size,
          coatType: r.coatType,
          price: Number(r.price),
          label: r.label || null,
        }));

      const payload = {
        name: planForm.name,
        description: planForm.description,
        basePrice: Number(planForm.basePrice),
        validityDays: Number(planForm.validityDays),
        allowSharedPets: planForm.allowSharedPets,
        active: planForm.active,
        items: planForm.items,
        pricingRules: validRules,
      };

      if (editingPlan) {
        await api.patch(`/petshop/packages/plans/${editingPlan.id}`, payload);
        toast.success('Plano de pacote atualizado com sucesso!');
      } else {
        await api.post('/petshop/packages/plans', payload);
        toast.success('Novo plano de pacote cadastrado!');
      }
      setOpenPlanModal(false);
      loadAll(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar plano de pacote.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleOpenNewContract = (preselectedPlan?: PetPackagePlan) => {
    const plan = preselectedPlan || plans.find(p => p.active) || plans[0];

    if (!plan) {
      toast.error('Cadastre pelo menos um plano no Catálogo de Pacotes antes de vender.');
      setActiveTab('catalog');
      return;
    }

    setContractForm({
      customerId: '',
      petId: '',
      packagePlanId: plan.id,
      isShared: false,
      species: 'dog',
      size: 'small',
      coatType: 'short',
      customPrice: String(Number(plan.basePrice)),
      discountAmount: '0',
      validityDays: plan.validityDays,
      startDate: new Date().toISOString().slice(0, 10),
      billingMode: 'paid',
      paymentMethod: 'pix',
      notes: '',
      transportEnabled: false,
      transportMode: 'round_trip',
      transportFee: taxiDefaultFee,
      customerStreet: '',
      customerNeighborhood: '',
      customerReference: '',
      transportNotes: '',
      saveAddressToCustomer: false,
      scheduleRecurring: true,
      fixedDayOfWeek: 5,
      fixedTime: '15:00',
    });
    setSelectedPetIds([]);
    setMultiPetMode('per_pet');
    setActiveSchedulePetId('all');
    setPerPetCustomPrices({});
    setPerPetOverrides({});
    setTutorSearchQuery('');
    setTutorSearchOpen(true);
    setOpenContractModal(true);
  };

  const handleRenewContract = (op: any) => {
    const petObj = pets.find(p => p.id === op.pet?.id) || op.pet;
    const tutorId = op.customer?.id || petObj?.customerId || '';
    const tutorObj = tutors.find(t => t.id === tutorId) || op.customer;

    const matchedPlan =
      plans.find(p => p.id === op.packagePlanId) ||
      plans.find(p => p.name?.trim().toLowerCase() === op.planName?.trim().toLowerCase()) ||
      plans.find(p => p.active) ||
      plans[0];

    if (!matchedPlan) {
      toast.error('Nenhum plano de pacote ativo encontrado.');
      return;
    }

    const species = petObj?.species || 'dog';
    const size = petObj?.size || 'small';
    const coatType = petObj?.coatType || 'short';
    const parsedAddr = parseAddressParts(tutorObj?.address);
    const hasAddr = Boolean(tutorObj?.address && tutorObj.address.trim().length > 0);

    setContractForm({
      customerId: tutorId,
      petId: petObj?.id || '',
      packagePlanId: matchedPlan.id,
      isShared: Boolean(op.isShared),
      species,
      size,
      coatType,
      customPrice: String(Number(matchedPlan.basePrice || 0)),
      discountAmount: '0',
      validityDays: matchedPlan.validityDays,
      startDate: new Date().toISOString().slice(0, 10),
      billingMode: 'paid',
      paymentMethod: 'pix',
      notes: `Renovação de pacote (${op.planName || matchedPlan.name})`,
      transportEnabled: false,
      transportMode: 'round_trip',
      transportFee: taxiDefaultFee,
      customerStreet: parsedAddr.street,
      customerNeighborhood: parsedAddr.neighborhood,
      customerReference: tutorObj?.reference || '',
      transportNotes: '',
      saveAddressToCustomer: !hasAddr,
      scheduleRecurring: true,
      fixedDayOfWeek: 5,
      fixedTime: '15:00',
    });
    setSelectedPetIds(petObj?.id ? [petObj.id] : []);
    setMultiPetMode(op.isShared ? 'shared' : 'per_pet');
    setPerPetCustomPrices({});
    setPerPetOverrides({});
    setTutorSearchQuery('');
    setTutorSearchOpen(!tutorId);

    regenerateRecurringSchedule(
      matchedPlan,
      new Date().toISOString().slice(0, 10),
      5,
      '15:00',
    );

    setOpenContractModal(true);
  };
  const handleSubmitContract = async (e: FormEvent) => {
    e.preventDefault();
    if (!contractForm.customerId) {
      toast.error('Busque e selecione o tutor antes de confirmar.');
      setTutorSearchOpen(true);
      return;
    }
    const effectivePetIds = selectedPetIds.length > 0 ? selectedPetIds : contractForm.petId ? [contractForm.petId] : [];
    if (effectivePetIds.length === 0 && !contractForm.isShared) {
      toast.error('Selecione pelo menos um pet para vincular ao pacote.');
      return;
    }
    const isPerPetGroup = effectivePetIds.length >= 2 && multiPetMode === 'per_pet';
    const isSharedMulti = effectivePetIds.length >= 2 && multiPetMode === 'shared';

    const street = contractForm.customerStreet.trim();
    const neighborhood = contractForm.customerNeighborhood.trim();
    const fullAddress = [street, neighborhood].filter(Boolean).join(' - ');

    if (contractForm.transportEnabled && !street) {
      toast.error('Informe a rua e número do cliente para o transporte (Táxi Dog).');
      return;
    }
    if (contractForm.transportEnabled && !neighborhood) {
      toast.error('Informe o bairro do cliente para o transporte (Táxi Dog).');
      return;
    }

    if (contractForm.billingMode === 'paid' && !packagePaymentsValid(paymentRows, computedFinalContractPrice)) {
      toast.error('Confira os pagamentos: a soma precisa fechar o total do pacote.');
      return;
    }
    setSavingContract(true);
    try {
      const now = new Date();
      const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const perPetConfigs = isPerPetGroup
        ? effectivePetIds.map(pid => {
            const pOverrides = perPetOverrides[pid] || {};
            const petSessions = contractForm.scheduleRecurring
              ? scheduledSessions
                  .map((s, idx) => {
                    const ov = pOverrides[idx];
                    const d = ov?.date || s.date;
                    const t = ov?.time || s.time;
                    if (!d || !t) return null;
                    const isPast = Boolean(d < todayYMD);
                    return {
                      petId: pid,
                      startsAt: new Date(`${d}T${t}:00`).toISOString(),
                      serviceIds: s.serviceId ? [s.serviceId] : undefined,
                      completed: isPast,
                      stageOperators: isPast ? (ov?.stageOperators || s.stageOperators) : undefined,
                    };
                  })
                  .filter(Boolean)
              : [];
            const petPriceRaw = perPetCustomPrices[pid];
            return {
              petId: pid,
              customPrice: petPriceRaw !== undefined && petPriceRaw !== '' ? Number(petPriceRaw) : undefined,
              scheduledSessions: petSessions,
            };
          })
        : undefined;

      const formattedSessions =
        !isPerPetGroup && contractForm.scheduleRecurring && effectivePetIds.length > 0
          ? scheduledSessions
              .filter(s => s.date && s.time)
              .map((s, idx) => {
                const isPast = Boolean(s.date && s.date < todayYMD);
                const fallbackPetId = effectivePetIds[idx % effectivePetIds.length];
                const resolvedPetId = s.petId && effectivePetIds.includes(s.petId) ? s.petId : fallbackPetId;
                return {
                  petId: resolvedPetId,
                  startsAt: new Date(`${s.date}T${s.time}:00`).toISOString(),
                  serviceIds: s.serviceId ? [s.serviceId] : undefined,
                  completed: isPast,
                  stageOperators: isPast ? s.stageOperators : undefined,
                };
              })
          : [];

      const { data: created } = await api.post('/petshop/packages/contracts', {
        ...contractForm,
        payments: contractForm.billingMode === 'paid' ? (computedFinalContractPrice === 0 ? [] : paymentRows.map(row => ({ method: row.method, amount: paymentAmount(row.amount) }))) : undefined,
        petId: effectivePetIds[0] || contractForm.petId || '',
        petIds: effectivePetIds,
        multiPetMode: effectivePetIds.length >= 2 ? multiPetMode : undefined,
        isShared: isSharedMulti ? true : isPerPetGroup ? false : contractForm.isShared,
        perPetConfigs,
        customPrice: Number(contractForm.customPrice || 0),
        discountAmount: Number(contractForm.discountAmount || 0),
        validityDays: Number(contractForm.validityDays || 30),
        saveAddressToCustomer: contractForm.saveAddressToCustomer,
        customerAddress: fullAddress || undefined,
        customerReference: contractForm.customerReference.trim() || undefined,
        transport: contractForm.transportEnabled
          ? {
              enabled: true,
              mode: contractForm.transportMode,
              fee: Number(contractForm.transportFee || 0),
              street,
              neighborhood,
              reference: contractForm.customerReference.trim() || null,
              notes: contractForm.transportNotes.trim() || null,
              address: fullAddress,
            }
          : { enabled: false },
        scheduledSessions: formattedSessions,
        operatorId: operator?.id,
        operatorName: operator?.name,
      });

      if (contractForm.billingMode === 'comanda') {
        toast.success(
          isPerPetGroup
            ? `Grupo de ${effectivePetIds.length} pacotes criado com comanda única no Caixa!`
            : 'Pacote contratado e comanda gerada no Caixa (PDV)!',
          { description: 'O cliente pode realizar o pagamento na recepção/caixa.' },
        );
      } else {
        toast.success(
          isPerPetGroup
            ? `Pacotes contratados e agrupados para os ${effectivePetIds.length} pets!`
            : 'Pacote contratado e ativado com sucesso!',
        );
      }

      setOpenContractModal(false);
      await loadAll(false);
      if (created?.id) {
        const groupList = Array.isArray(created.groupContracts) && created.groupContracts.length
          ? created.groupContracts
          : [created];
        openContractDetailsModal(created, groupList);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao contratar pacote.');
    } finally {
      setSavingContract(false);
    }
  };

  const handleConfirmPayment = async (contractId: string) => {
    try {
      const { data } = await api.post(`/petshop/packages/contracts/${contractId}/confirm-payment`, {
        paymentMethod: 'pix',
      });
      toast.success('Pagamento do pacote confirmado!');
      setSelectedContract(prev => (prev?.id === contractId ? { ...data, scheduledAppointments: prev.scheduledAppointments } : prev));
      api.get<CustomerPetPackage>(`/petshop/packages/contracts/${contractId}`)
        .then(({ data: details }) => setSelectedContract(prev => prev?.id === contractId ? details : prev))
        .catch(() => {});
      loadAll(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao confirmar pagamento.');
    }
  };

  const handleSavePackageReschedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedContract || !editingAppointmentId || !rescheduleStartsAt) return;
    const appointment = selectedContract.scheduledAppointments?.find(item => item.id === editingAppointmentId);
    if (!appointment || !['scheduled', 'requested'].includes(appointment.status) ||
        !appointment.services.some(service => service.coverageStatus === 'reserved')) {
      toast.error('Esta sessão não está mais disponível para reagendamento.');
      return;
    }
    const nextStart = new Date(rescheduleStartsAt);
    if (Number.isNaN(nextStart.getTime()) || nextStart <= new Date()) {
      toast.error('Escolha uma data e horário futuros.');
      return;
    }
    if (nextStart > new Date(selectedContract.expiresAt)) {
      toast.error('A nova data precisa estar dentro da validade do pacote.');
      return;
    }
    if (nextStart.getTime() === new Date(appointment.startsAt).getTime()) {
      setEditingAppointmentId(null);
      return;
    }
    setSavingReschedule(true);
    try {
      const { data: updated } = await api.patch(`/petshop/appointments/${appointment.id}`, {
        startsAt: nextStart.toISOString(),
        packageContractId: selectedContract.id,
        expectedUpdatedAt: appointment.updatedAt,
      });
      setSelectedContract(current => current ? {
        ...current,
        scheduledAppointments: current.scheduledAppointments?.map(item =>
          item.id === appointment.id
            ? { ...item, startsAt: updated.startsAt, endsAt: updated.endsAt, updatedAt: updated.updatedAt }
            : item),
      } : current);
      setEditingAppointmentId(null);
      toast.success('Sessão reagendada na agenda.');
      const refreshed = await api.get<CustomerPetPackage>(`/petshop/packages/contracts/${selectedContract.id}`).catch(() => null);
      if (refreshed) setSelectedContract(current => current?.id === selectedContract.id ? refreshed.data : current);
      loadAll(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Não foi possível reagendar a sessão.');
    } finally {
      setSavingReschedule(false);
    }
  };

  const handleSubmitRefund = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedContract || !refundTargetItem) return;
    setSubmittingRefund(true);
    try {
      const { data } = await api.post(
        `/petshop/packages/contracts/${selectedContract.id}/refund-session`,
        {
          packageItemId: refundTargetItem.id,
          appointmentId: refundAppointmentId,
          reason: refundReason,
          operatorId: operator?.id,
          operatorName: operator?.name,
        },
      );
      toast.success('Sessão estornada e devolvida ao saldo do pacote!');
      setSelectedContract(prev => ({ ...data, scheduledAppointments: prev?.scheduledAppointments }));
      api.get<CustomerPetPackage>(`/petshop/packages/contracts/${selectedContract.id}`)
        .then(({ data: details }) => setSelectedContract(prev => prev?.id === details.id ? details : prev))
        .catch(() => {});
      setRefundTargetItem(null);
      setRefundReason('');
      loadAll(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao realizar estorno da sessão.');
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handleSubmitCancelContract = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    setSubmittingCancel(true);
    try {
      const { data } = await api.post(
        `/petshop/packages/contracts/${selectedContract.id}/cancel`,
        {
          reason: cancelReason,
          operatorId: operator?.id,
          operatorName: operator?.name,
        },
      );
      toast.success('Contrato de pacote cancelado.');
      setSelectedContract(prev => ({ ...data, scheduledAppointments: prev?.scheduledAppointments }));
      api.get<CustomerPetPackage>(`/petshop/packages/contracts/${selectedContract.id}`)
        .then(({ data: details }) => setSelectedContract(prev => prev?.id === details.id ? details : prev))
        .catch(() => {});
      setShowCancelConfirm(false);
      setCancelReason('');
      loadAll(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao cancelar pacote.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const computedTransportFee = contractForm.transportEnabled
    ? Math.max(0, Number(contractForm.transportFee || 0))
    : 0;
  const computedBaseForMode =
    selectedPetIds.length >= 2 && multiPetMode === 'per_pet'
      ? selectedPetsList.reduce((sum, p) => {
          const val = perPetCustomPrices[p.id];
          const num = val !== undefined && val !== '' ? Number(val) : computeSuggestedPlanPriceForPet(selectedPlanObj, p);
          return sum + (Number.isFinite(num) ? num : 0);
        }, 0)
      : Number(contractForm.customPrice || 0);
  const computedFinalContractPrice = Math.max(
    0,
    computedBaseForMode + computedTransportFee - Number(contractForm.discountAmount || 0),
  );

  const wasContractOpen = useRef(false);
  useEffect(() => {
    if (openContractModal) {
      const justOpened = !wasContractOpen.current;
      setPaymentRows(rows => justOpened || rows.length === 1
        ? [{ method: justOpened ? 'pix' : rows[0].method, amount: computedFinalContractPrice.toFixed(2).replace('.', ',') }]
        : rows);
    }
    wasContractOpen.current = openContractModal;
  }, [computedFinalContractPrice, openContractModal]);

  return (
    <div className={pageClass}>
      {/* ===================================================================== */}
      {/* VISÃO MOBILE: Cabeçalho, KPI compacto e navegação por pílulas         */}
      {/* ===================================================================== */}
      <div className="space-y-3.5 pb-4 md:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">Pacotes</h1>
            <span className="rounded-full bg-[#e6f4ef] px-2.5 py-0.5 text-xs font-bold text-[#0d6e5a]">
              {contracts.length} {contracts.length === 1 ? 'contrato' : 'contratos'}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-zinc-500">
            Planos recorrentes, saldos e renovações
          </p>
        </div>

        {/* Barra de resumo compacta (2 colunas) */}
        <div className="grid grid-cols-2 divide-x divide-zinc-200/70 rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#0d6e5a]">
              <Wallet size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-zinc-500">Pacotes pagos</p>
              <p className="truncate text-base font-extrabold leading-tight text-zinc-900 tabular-nums">
                {money(financialOverview?.totals?.totalSoldPaid || 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3.5 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#0d6e5a]">
              <Box size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-zinc-500">Ativos / Renovar</p>
              <p className="text-base font-extrabold leading-tight text-zinc-900 tabular-nums">
                {financialOverview?.totals?.activeContractsCount || 0}{' '}
                <span className="text-xs font-semibold text-amber-700">
                  · {financialOverview?.renewalOpportunities?.length || 0}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Ações principais compactas */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleOpenNewPlan}
            className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#0d6e5a]/25 bg-[#e8f5ef] px-3 text-xs font-bold text-[#0d6e5a]"
          >
            <Layers size={15} />
            Novo Plano
          </button>
          <button
            type="button"
            onClick={() => handleOpenNewContract()}
            className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#0d6e5a] px-3 text-xs font-semibold text-white shadow-xs"
          >
            <Plus size={15} strokeWidth={2.5} />
            Contratar Pacote
          </button>
        </div>

        {/* Pílulas de aba horizontais */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('contracts')}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'contracts'
                ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                : 'border-zinc-200 bg-white text-zinc-700'
            }`}
          >
            <PackageCheck size={14} />
            Contratos ({contracts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'catalog'
                ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                : 'border-zinc-200 bg-white text-zinc-700'
            }`}
          >
            <Layers size={14} />
            Catálogo ({plans.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('renewals')}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'renewals'
                ? 'border-amber-600 bg-amber-600 text-white shadow-2xs'
                : 'border-zinc-200 bg-white text-zinc-700'
            }`}
          >
            <AlertTriangle size={14} />
            Renovação ({financialOverview?.renewalOpportunities?.length || 0})
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VISÃO DESKTOP: Cabeçalho, 4 KPIs e Abas                              */}
      {/* ===================================================================== */}
      <div className="hidden md:block">
      <PageHeader
        eyebrow="Recorrência, Fidelização & Controle de Sessões"
        title="Pacotes de Clientes"
        description="Gerencie planos recorrentes com precificação por porte e pelagem, controle saldos de sessões com rastreabilidade e acompanhe renovações."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={handleOpenNewPlan} className={secondaryButton}>
              <span className="inline-flex items-center gap-2">
                <Layers size={16} />
                Novo Plano no Catálogo
              </span>
            </button>
            <button type="button" onClick={() => handleOpenNewContract()} className={primaryButton}>
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                Contratar Pacote p/ Cliente
              </span>
            </button>
          </div>
        }
      />

      {/* Cards Executivos de Gestão Financeira & Operacional de Pacotes (Fiel ao Mockup Web) */}
      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#cce6dc] bg-gradient-to-br from-[#ecf8f3] via-[#f6fbf9] to-white p-4 shadow-2xs">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-emerald-200/70 bg-white/90 text-[#0d6e5a] shadow-2xs">
            <Wallet size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-600 truncate">
              Faturamento de pacotes pagos
            </p>
            <p className="mt-0.5 text-2xl font-black tracking-tight text-zinc-900 tabular-nums">
              {money(financialOverview?.totals?.totalSoldPaid || 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500 truncate">
              {financialOverview?.totals?.activeContractsCount || 0} contratos ativos em andamento
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-[#cde3ec] bg-gradient-to-br from-[#eef7fa] via-[#f7fbfc] to-white p-4 shadow-2xs">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-teal-200/70 bg-white/90 text-teal-700 shadow-2xs">
            <Box size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-600 truncate">
              Saldo de sessões a realizar
            </p>
            <p className="mt-0.5 text-2xl font-black tracking-tight text-zinc-900 tabular-nums">
              {financialOverview?.totals?.totalSessionsAvailable || 0}{' '}
              <span className="text-sm font-semibold text-zinc-600">
                disponíveis
              </span>
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
              {financialOverview?.totals?.totalSessionsReserved || 0} reservadas na agenda ·{' '}
              {financialOverview?.totals?.totalSessionsUsed || 0} já concluídas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-[#dedcf5] bg-gradient-to-br from-[#f3f2fc] via-[#faf9fe] to-white p-4 shadow-2xs">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-indigo-200/70 bg-white/90 text-indigo-600 shadow-2xs">
            <TrendingUp size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-600 truncate">
              Receita apropriada (realizada)
            </p>
            <p className="mt-0.5 text-2xl font-black tracking-tight text-zinc-900 tabular-nums">
              {money(financialOverview?.totals?.recognizedRevenue || 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500 truncate">
              A realizar: {money(financialOverview?.totals?.deferredRevenue || 0)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('renewals')}
          className="flex items-center gap-3.5 rounded-2xl border border-[#f3dfa9] bg-gradient-to-br from-[#fef7e6] via-[#fffbf0] to-white p-4 text-left shadow-2xs transition hover:border-amber-400 cursor-pointer"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-200/80 bg-white/90 text-amber-700 shadow-2xs">
            <RefreshCw size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-900 truncate">
              Oportunidades de renovação
            </p>
            <p className="mt-0.5 text-2xl font-black tracking-tight text-amber-950 tabular-nums">
              {financialOverview?.renewalOpportunities?.length || 0}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-amber-800">
              Pacotes na última sessão ou vencendo em até 7 dias
            </p>
          </div>
        </button>
      </div>

      {/* Navegação de Abas (Pílulas Institucionais) */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setActiveTab('contracts')}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'contracts'
              ? 'bg-[#0d6e5a] text-white shadow-xs'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
          }`}
        >
          <PackageCheck size={16} />
          <span>Contratos & Saldos ({contracts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-[#0d6e5a] text-white shadow-xs'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
          }`}
        >
          <Layers size={16} />
          <span>Catálogo de Planos & Preços ({plans.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('renewals')}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'renewals'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
          }`}
        >
          <AlertTriangle size={16} />
          <span>Fila de Renovação ({financialOverview?.renewalOpportunities?.length || 0})</span>
        </button>
      </div>

      </div>

      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white">
          <ListSkeleton rows={5} />
        </div>
      ) : activeTab === 'contracts' ? (
        <div className="space-y-4">
          {/* Barra Unificada de Busca, Dropdowns, Filtros Rápidos e Alternância Grid/Lista */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200/90 bg-white p-2.5 sm:p-3 shadow-2xs">
            {/* Busca */}
            <div className="relative min-w-[175px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por tutor, pet ou nome do pacote..."
                className="h-9 w-full rounded-xl border border-zinc-200 bg-zinc-50/60 pl-8 pr-3 text-xs text-zinc-800 placeholder-zinc-400 outline-none transition focus:border-[#0d6e5a] focus:bg-white"
              />
            </div>

            {/* Dropdowns Labeled (Status / Serviço / Porte) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative w-[88px] rounded-xl border border-zinc-200 bg-zinc-50/60 px-2 py-1">
                <span className="block text-[9px] font-medium leading-none text-zinc-400">Status</span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="mt-0.5 w-full cursor-pointer appearance-none bg-transparent pr-4 text-[11px] font-bold leading-tight text-zinc-800 outline-none"
                >
                  <option value="all">Todos</option>
                  <option value="active">Ativos</option>
                  <option value="pending_payment">Pendentes</option>
                  <option value="completed">Concluídos</option>
                  <option value="expired">Vencidos</option>
                  <option value="cancelled">Cancelados</option>
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute bottom-1.5 right-1.5 text-zinc-500" />
              </div>

              <div className="relative w-[98px] rounded-xl border border-zinc-200 bg-zinc-50/60 px-2 py-1">
                <span className="block text-[9px] font-medium leading-none text-zinc-400">Serviço</span>
                <select
                  value={serviceFilter}
                  onChange={e => setServiceFilter(e.target.value)}
                  className="mt-0.5 w-full cursor-pointer appearance-none bg-transparent pr-4 text-[11px] font-bold leading-tight text-zinc-800 outline-none truncate"
                >
                  <option value="all">Todos</option>
                  {contractServiceOptions.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute bottom-1.5 right-1.5 text-zinc-500" />
              </div>

              <div className="relative w-[88px] rounded-xl border border-zinc-200 bg-zinc-50/60 px-2 py-1">
                <span className="block text-[9px] font-medium leading-none text-zinc-400">Porte</span>
                <select
                  value={sizeFilter}
                  onChange={e => setSizeFilter(e.target.value)}
                  className="mt-0.5 w-full cursor-pointer appearance-none bg-transparent pr-4 text-[11px] font-bold leading-tight text-zinc-800 outline-none"
                >
                  <option value="all">Todos</option>
                  <option value="mini">Mini</option>
                  <option value="small">Pequeno (P)</option>
                  <option value="medium">Médio (M)</option>
                  <option value="large">Grande (G)</option>
                  <option value="giant">Gigante (GG)</option>
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute bottom-1.5 right-1.5 text-zinc-500" />
              </div>
            </div>

            {/* Pílulas Rápidas de Status */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { key: 'all', label: `Todos (${contractCounts.all})` },
                { key: 'active', label: `Ativos (${contractCounts.active})` },
                { key: 'pending_payment', label: `Pendentes (${contractCounts.pending})` },
                { key: 'expired', label: `Vencidos (${contractCounts.expired})` },
              ].map(pill => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setStatusFilter(pill.key)}
                  className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                    statusFilter === pill.key
                      ? 'bg-[#0d6e5a] text-white shadow-2xs'
                      : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Botões de Alternância Grid / Lista */}
            <div className="ml-auto flex items-center rounded-xl border border-zinc-200 bg-zinc-100/70 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Visualização em Grade Compacta"
                className={`grid h-8 w-8 place-items-center rounded-lg transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#0d6e5a] text-white shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Visualização Detalhada"
                className={`grid h-8 w-8 place-items-center rounded-lg transition cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#0d6e5a] text-white shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <List size={15} />
              </button>
            </div>
          </div>

          {groupedContractEntries.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white">
              <EmptyState
                icon={PackageCheck}
                title="Nenhum pacote encontrado neste filtro"
                description="Vincule um pacote de banho e tosa a um tutor e pet para controlar sessões, reservas e renovações automáticas."
                action={
                  <button
                    type="button"
                    onClick={() => handleOpenNewContract()}
                    className={primaryButton}
                  >
                    Contratar Primeiro Pacote
                  </button>
                }
              />
            </div>
          ) : (
            <>
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-3 xl:grid-cols-2' : 'space-y-3'}>
                {paginatedContractEntries.map(entry => {
                  const contract = entry.primary;
                  const members = entry.members;
                  const isGroup = entry.isMultiPetGroup;
                  const totalSessions = members.reduce(
                    (sumM, m) => sumM + m.items.reduce((s, i) => s + i.totalQuantity, 0),
                    0,
                  );
                  const usedSessions = members.reduce(
                    (sumM, m) => sumM + m.items.reduce((s, i) => s + i.usedQuantity, 0),
                    0,
                  );
                  const reservedSessions = members.reduce(
                    (sumM, m) => sumM + m.items.reduce((s, i) => s + i.reservedQuantity, 0),
                    0,
                  );
                  const availableSessions = members.reduce(
                    (sumM, m) => sumM + m.items.reduce((s, i) => s + i.availableQuantity, 0),
                    0,
                  );
                  const consolidatedFinalPrice = isGroup
                    ? members.reduce((sumM, m) => sumM + Number(m.finalPrice || 0), 0)
                    : Number(contract.finalPrice || 0);
                  const groupPetNames = isGroup
                    ? members.map(m => m.pet?.name).filter(Boolean).join(', ')
                    : contract.packageGroup?.petNames?.length
                      ? contract.packageGroup.petNames.join(', ')
                      : '';
                  const usedPct =
                    totalSessions > 0
                      ? Math.min(100, Math.round((usedSessions / totalSessions) * 100))
                      : 0;
                  const expired = members.every(m => isContractExpired(m));
                  const isPendingPayment = members.some(
                    m => m.paymentStatus === 'pending' && m.status !== 'cancelled' && !isContractExpired(m),
                  );
                  const isLowBalance = members.some(
                    m => m.status === 'active' && !isContractExpired(m) && m.items.reduce((s, i) => s + i.availableQuantity, 0) <= 1,
                  );

                  const accentBarColor = isPendingPayment
                    ? 'bg-amber-400'
                    : expired
                      ? 'bg-rose-500'
                      : contract.status === 'completed'
                        ? 'bg-sky-500'
                        : contract.status === 'cancelled'
                          ? 'bg-zinc-400'
                          : 'bg-[#0d6e5a]';

                  const statusBadge = expired
                    ? { label: 'Vencido', cls: 'bg-rose-50 text-rose-700 border border-rose-200/70' }
                    : contract.status === 'cancelled'
                      ? { label: 'Cancelado', cls: 'bg-zinc-100 text-zinc-600 border border-zinc-200' }
                      : contract.status === 'completed'
                        ? { label: 'Concluído', cls: 'bg-sky-50 text-sky-700 border border-sky-200/70' }
                        : isPendingPayment
                          ? { label: 'Pendente', cls: 'bg-amber-50 text-amber-800 border border-amber-200/70' }
                          : { label: 'Ativo', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' };

                  const groupTaxiFee = isGroup
                    ? members.reduce((s, m) => s + Number(m.transport?.fee || 0), 0)
                    : Number(contract.transport?.fee || 0);
                  const hasGroupTaxi = members.some(m => m.transport?.enabled);

                  if (viewMode === 'grid') {
                    return (
                      <div
                        key={entry.key}
                        className="group relative rounded-2xl border border-zinc-200/90 bg-white px-4 py-3.5 shadow-2xs transition hover:border-[#0d6e5a]/40 hover:shadow-sm"
                      >
                        {/* Barra lateral de status */}
                        <span className={`absolute bottom-3 left-0 top-3 w-1 rounded-r-full ${accentBarColor}`} />

                        <div className="flex flex-col gap-3 pl-1 sm:flex-row sm:items-center sm:justify-between">
                          {/* Bloco Esquerdo: Avatar + Nome do Pacote + Badge Táxi + Tutor/Pet */}
                          <div
                            onClick={() => openContractDetailsModal(contract, members)}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                          >
                            {!isGroup && contract.pet ? (
                              <PetAvatar pet={contract.pet} size="md" />
                            ) : (
                              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700 ring-2 ring-white shadow-xs">
                                <Users size={18} />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-sm font-bold text-zinc-900 group-hover:text-[#0d6e5a] transition-colors">
                                {contract.planNameSnapshot}
                              </h3>

                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                {isGroup && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                                    <PawPrint size={10} className="shrink-0" />
                                    Grupo · {members.length} pets
                                  </span>
                                )}
                                {hasGroupTaxi && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                    🚐 Táxi Dog {groupTaxiFee > 0 ? `(+${money(groupTaxiFee)})` : '(Incluso)'}
                                  </span>
                                )}
                                {contract.isShared && (
                                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                                    Compartilhado
                                  </span>
                                )}
                              </div>

                              <p className="mt-0.5 truncate text-xs text-zinc-500">
                                Tutor: <strong className="font-semibold text-zinc-800">{contract.customer?.name}</strong>
                                {groupPetNames
                                  ? ` · Pets: ${groupPetNames}`
                                  : contract.pet
                                    ? ` · Pet: ${contract.pet.name}`
                                    : ' · Todos os pets'}
                              </p>
                            </div>
                          </div>

                          {/* Bloco Central: Progresso de Sessões + Reservadas */}
                          <div
                            onClick={() => openContractDetailsModal(contract, members)}
                            className="w-full shrink-0 cursor-pointer sm:w-[138px]"
                          >
                            <div className="mb-1 flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-zinc-700">
                                {usedSessions} de {totalSessions} sessões
                              </span>
                              <span className="font-bold tabular-nums text-zinc-900">
                                {usedPct}%
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  usedPct >= 100
                                    ? 'bg-emerald-500'
                                    : isLowBalance
                                      ? 'bg-amber-500'
                                      : 'bg-[#0d6e5a]'
                                }`}
                                style={{ width: `${usedPct}%` }}
                              />
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                              <Calendar size={11} className="shrink-0 text-zinc-400" />
                              <span>{reservedSessions} reservadas</span>
                            </div>
                          </div>

                          {/* Bloco Direito: Pílula Status + Pagamento/Data + Valor + Menu (...) */}
                          <div className="flex items-center justify-between gap-2.5 border-t border-zinc-100 pt-2 sm:justify-end sm:border-t-0 sm:pt-0 shrink-0">
                            <div
                              onClick={() => openContractDetailsModal(contract, members)}
                              className="cursor-pointer text-left sm:min-w-[82px] sm:text-right"
                            >
                              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>
                                {statusBadge.label}
                              </span>

                              {expired ? (
                                <>
                                  <p className="mt-1 text-[10px] font-bold leading-tight text-rose-600">
                                    Vencido em
                                  </p>
                                  <p className="text-xs font-black tabular-nums leading-tight text-rose-700">
                                    {new Date(contract.expiresAt).toLocaleDateString('pt-BR')}
                                  </p>
                                </>
                              ) : contract.status === 'cancelled' ? (
                                <>
                                  <p className="mt-1 text-[10px] font-bold leading-tight text-zinc-500">
                                    Cancelado
                                  </p>
                                  <p className="text-xs font-bold tabular-nums leading-tight text-zinc-500 line-through">
                                    {money(consolidatedFinalPrice)}
                                  </p>
                                </>
                              ) : isPendingPayment ? (
                                <>
                                  <p className="mt-1 text-[10px] font-bold leading-tight text-amber-700">
                                    Pendente Caixa
                                  </p>
                                  <p className="text-xs font-black tabular-nums leading-tight text-amber-800">
                                    {money(consolidatedFinalPrice)}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="mt-1 text-[10px] font-bold leading-tight text-emerald-700">
                                    Pago
                                  </p>
                                  <p className="text-xs font-black tabular-nums leading-tight text-emerald-800">
                                    {money(consolidatedFinalPrice)}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* Botão de Ações (...) */}
                            <div className="relative" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                aria-label="Ações do contrato"
                                onClick={() => setOpenMenuId(prev => (prev === entry.key ? null : entry.key))}
                                className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800 cursor-pointer"
                              >
                                <MoreHorizontal size={17} />
                              </button>

                              {openMenuId === entry.key && (
                                <div className="absolute bottom-9 right-0 z-30 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl sm:bottom-auto sm:top-9">
                                  {contract.status === 'active' && !expired && availableSessions > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        navigate(`/petshop/agenda?new=1${contract.petId ? `&petId=${encodeURIComponent(contract.petId)}` : ''}`);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-teal-800 hover:bg-teal-50 cursor-pointer"
                                    >
                                      <Calendar size={14} />
                                      <span>Agendar Sessão</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      openContractDetailsModal(contract, members);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                                  >
                                    <History size={14} />
                                    <span>Extrato, Detalhes & Estorno</span>
                                  </button>
                                  {isPendingPayment && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        handleConfirmPayment(contract.id);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                    >
                                      <CheckCircle2 size={14} />
                                      <span>{isGroup ? 'Confirmar Recebimento (Grupo)' : 'Confirmar Recebimento'}</span>
                                    </button>
                                  )}
                                  {(isLowBalance || expired || contract.status === 'completed') && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        handleRenewContract({
                                          customer: contract.customer,
                                          pet: contract.pet,
                                          packagePlanId: contract.packagePlanId,
                                          planName: contract.planNameSnapshot,
                                        });
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-amber-800 hover:bg-amber-50 cursor-pointer"
                                    >
                                      <RefreshCw size={14} />
                                      <span>Renovar Pacote</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  /* Modo Lista Detalhada (Alternado pelo botão de visualização) */
                  return (
                    <div
                      key={entry.key}
                      className="flex flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs transition hover:border-[#0d6e5a]/40"
                    >
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {!isGroup && contract.pet ? (
                              <PetAvatar pet={contract.pet} size="md" />
                            ) : (
                              <div className="grid h-11 w-11 place-items-center rounded-full bg-teal-50 text-teal-700">
                                <Users size={18} />
                              </div>
                            )}
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-bold text-zinc-900">
                                  {contract.planNameSnapshot}
                                </h3>
                                {isGroup && (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                                    <PawPrint size={11} className="shrink-0" />
                                    Grupo · {members.length} pets
                                  </span>
                                )}
                                {contract.isShared && (
                                  <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                    Compartilhado
                                  </span>
                                )}
                                {hasGroupTaxi && (
                                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                    🚐 Táxi Dog {groupTaxiFee > 0 ? `(+${money(groupTaxiFee)})` : '(Incluso)'}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500">
                                Tutor: <strong className="text-zinc-800">{contract.customer?.name}</strong>
                                {groupPetNames
                                  ? ` · Pets: ${groupPetNames}`
                                  : contract.pet
                                    ? ` · Pet: ${contract.pet.name}`
                                    : ' · Todos os pets do tutor'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadge.cls}`}>
                              {statusBadge.label}
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                !isPendingPayment
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {!isPendingPayment
                                ? `Pago (${money(consolidatedFinalPrice)})`
                                : `Pendente Caixa (${money(consolidatedFinalPrice)})`}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3.5">
                          <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="font-semibold text-zinc-800">
                              Saldo Disponível: {availableSessions} de {totalSessions} sessões
                            </span>
                            <span className="text-zinc-500">
                              {usedSessions} usadas · {reservedSessions} agendadas
                            </span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isLowBalance ? 'bg-amber-500' : 'bg-[#0d6e5a]'
                              }`}
                              style={{ width: `${totalSessions > 0 ? Math.min(100, Math.round(((usedSessions + reservedSessions) / totalSessions) * 100)) : 0}%` }}
                            />
                          </div>

                          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                            {isGroup
                              ? members.map(member => {
                                  const mAvail = member.items.reduce((s, i) => s + i.availableQuantity, 0);
                                  const mTotal = member.items.reduce((s, i) => s + i.totalQuantity, 0);
                                  const mRes = member.items.reduce((s, i) => s + i.reservedQuantity, 0);
                                  return (
                                    <div
                                      key={member.id}
                                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs"
                                    >
                                      <span className="font-medium text-zinc-800">
                                        {member.pet?.name || 'Pet'} ({money(member.finalPrice)})
                                        {Number(member.transport?.fee || 0) > 0 && (
                                          <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                            +{money(member.transport?.fee || 0)} frete
                                          </span>
                                        )}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        {mRes > 0 && (
                                          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                                            {mRes} reservada(s)
                                          </span>
                                        )}
                                        <span className="font-bold text-[#0d6e5a]">
                                          {mAvail}/{mTotal} livres
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              : contract.items.map(item => (
                                  <div
                                    key={item.id}
                                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-zinc-800">
                                      {item.serviceNameSnapshot}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      {item.reservedQuantity > 0 && (
                                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                                          {item.reservedQuantity} reservada(s)
                                        </span>
                                      )}
                                      <span className="font-bold text-[#0d6e5a]">
                                        {item.availableQuantity}/{item.totalQuantity} livres
                                      </span>
                                    </div>
                                  </div>
                                ))}
                          </div>
                        </div>

                        {isLowBalance && (
                          <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <span className="inline-flex items-center gap-1.5 font-semibold">
                              <AlertTriangle size={14} className="text-amber-600" />
                              {availableSessions === 0
                                ? 'Saldo livre esgotado — Oferecer renovação ao tutor'
                                : 'Última sessão disponível — Oferecer renovação ao tutor'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar size={13} />
                          Válido até {new Date(contract.expiresAt).toLocaleDateString('pt-BR')}
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          {contract.status === 'active' && !expired && availableSessions > 0 && (
                            <button
                              type="button"
                              onClick={() => navigate(`/petshop/agenda?new=1${contract.petId ? `&petId=${encodeURIComponent(contract.petId)}` : ''}`)}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-800 transition hover:bg-teal-100 cursor-pointer"
                            >
                              Agendar Sessão
                              <ArrowRight size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openContractDetailsModal(contract, members)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 cursor-pointer"
                          >
                            <History size={13} />
                            Extrato & Estorno
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Barra de Paginação Inferior (Fiel ao Mockup Web) */}
              <div className="flex flex-col items-center justify-between gap-3 pt-2 text-xs text-zinc-500 sm:flex-row">
                <p className="font-medium">
                  Mostrando <strong className="text-zinc-800">{paginatedContractEntries.length}</strong> de{' '}
                  <strong className="text-zinc-800">{groupedContractEntries.length}</strong> pacotes
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={groupedSafePage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={15} />
                  </button>

                  {Array.from({ length: groupedTotalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === groupedTotalPages || Math.abs(p - groupedSafePage) <= 1)
                    .map((pageNum, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && pageNum - prev > 1;
                      return (
                        <div key={pageNum} className="flex items-center gap-1.5">
                          {showEllipsis && <span className="px-1 text-zinc-400">...</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(pageNum)}
                            className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold transition cursor-pointer ${
                              groupedSafePage === pageNum
                                ? 'bg-[#0d6e5a] text-white shadow-2xs'
                                : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        </div>
                      );
                    })}

                  <button
                    type="button"
                    disabled={groupedSafePage >= groupedTotalPages}
                    onClick={() => setCurrentPage(p => Math.min(groupedTotalPages, p + 1))}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>

                <div className="relative">
                  <select
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                    className="h-8 cursor-pointer appearance-none rounded-xl border border-zinc-200 bg-white pl-3 pr-7 text-xs font-semibold text-zinc-700 outline-none hover:bg-zinc-50"
                  >
                    <option value={10}>10 por página</option>
                    <option value={20}>20 por página</option>
                    <option value={50}>50 por página</option>
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'catalog' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {plans.length === 0 ? (
            <div className="col-span-full rounded-xl border border-[var(--pc-border)] bg-white">
              <EmptyState
                icon={Layers}
                title="Nenhum plano cadastrado no catálogo"
                description="Crie planos mensais ou quinzenais (ex: 4 Banhos + 1 Tosa Higiênica) com preços diferenciados por porte e pelagem."
                action={
                  <button type="button" onClick={handleOpenNewPlan} className={primaryButton}>
                    Criar Primeiro Plano
                  </button>
                }
              />
            </div>
          ) : (
            plans.map(plan => (
              <div
                key={plan.id}
                className="flex flex-col justify-between rounded-xl border border-[var(--pc-border)] bg-white p-5 shadow-2xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-[var(--pc-text)]">{plan.name}</h3>
                        {!plan.active && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Inativo
                          </span>
                        )}
                        {plan.allowSharedPets && (
                          <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                            Permite compartilhar entre pets
                          </span>
                        )}
                      </div>
                      {plan.description && (
                        <p className="mt-1 text-xs text-[var(--pc-text-secondary)]">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-[var(--pc-text-muted)]">Preço Base</span>
                      <p className="text-xl font-bold text-[var(--pc-action)]">
                        {money(plan.basePrice)}
                      </p>
                      <span className="text-[11px] text-[var(--pc-text-secondary)]">
                        Validade: {plan.validityDays} dias
                      </span>
                    </div>
                  </div>

                  {/* Itens inclusos no plano */}
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--pc-text-muted)]">
                      Serviços e Sessões Inclusas
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {plan.items.map(item => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-1.5 text-xs font-semibold text-teal-900"
                        >
                          <Scissors size={13} className="text-teal-700" />
                          {item.quantity}x {item.service?.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Tabela de Precificação Variável por Porte / Pelagem */}
                  {plan.pricingRules.length > 0 && (
                    <div className="mt-4 rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-3">
                      <p className="mb-2 text-xs font-semibold text-[var(--pc-text)]">
                        Tabela de Preços por Porte & Pelagem ({plan.pricingRules.length} variações)
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {plan.pricingRules.map((rule, idx) => (
                          <div
                            key={rule.id || idx}
                            className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs border border-[var(--pc-border)]"
                          >
                            <span className="text-[var(--pc-text-secondary)]">
                              {rule.label ||
                                `${SIZE_LABELS[rule.size] || rule.size} · ${COAT_LABELS[rule.coatType] || rule.coatType}`}
                            </span>
                            <strong className="text-[var(--pc-text)]">{money(rule.price)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[var(--pc-border)] pt-3">
                  <span className="text-xs text-[var(--pc-text-secondary)]">
                    {plan._count?.contracts || 0} contratos vendidos
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditPlan(plan)}
                      className={secondaryButton}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Pencil size={14} />
                        Editar Plano
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenNewContract(plan)}
                      className={primaryButton}
                    >
                      Vender este Pacote
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Aba Fila de Renovação */
        <div className="rounded-xl border border-[var(--pc-border)] bg-white p-5">
          {!financialOverview?.renewalOpportunities?.length ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nenhuma renovação urgente no momento"
              description="Quando um pacote atingir a última sessão disponível ou estiver a menos de 7 dias do vencimento, ele aparecerá aqui para ação rápida da recepção."
            />
          ) : (
            <div className="space-y-3">
              {financialOverview.renewalOpportunities.map((op: any) => (
                <div
                  key={op.contractId}
                  className="flex flex-col justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    {op.pet ? (
                      <PetAvatar pet={op.pet} size="md" />
                    ) : (
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-800">
                        <PawPrint size={18} />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-[var(--pc-text)]">{op.planName}</h4>
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          {op.reason === 'LAST_SESSION'
                            ? `Restam ${op.availableSessions} de ${op.totalSessions} sessões`
                            : 'Próximo do Vencimento'}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--pc-text-secondary)]">
                        Tutor: <strong>{op.customer?.name}</strong> ({op.customer?.phone}) · Vence em{' '}
                        {new Date(op.expiresAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRenewContract(op)}
                      className={primaryButton}
                    >
                      Renovar Pacote Agora
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CRIAR / EDITAR PLANO DO CATÁLOGO (COM PRECIFICAÇÃO VARIÁVEL)
         ===================================================================== */}
      {openPlanModal && (
        <Modal
          title={editingPlan ? 'Editar plano de pacote' : 'Novo plano de pacote'}
          maxWidth="sm:max-w-3xl"
          onClose={() => setOpenPlanModal(false)}
        >
          <form onSubmit={handleSubmitPlan} className="space-y-5">
            <p className="text-sm leading-6 text-slate-500">Defina os serviços, a quantidade de sessões e o valor do pacote para seus clientes.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="plan-name" className={labelClass}>Nome do plano *</label>
                <input
                  required
                  id="plan-name" value={planForm.name}
                  onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
                  placeholder="Ex: Pacote Mensal — 4 Banhos + 1 Tosa Higiênica"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="plan-validity" className={labelClass}>Validade (dias) *</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  required
                  id="plan-validity" value={planForm.validityDays}
                  onChange={e =>
                    setPlanForm({ ...planForm, validityDays: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="plan-price" className={labelClass}>Valor do pacote (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  id="plan-price" value={planForm.basePrice}
                  onChange={e => setPlanForm({ ...planForm, basePrice: e.target.value })}
                  placeholder="180.00"
                  className={inputClass}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-[var(--pc-text)]">
                  <input
                    type="checkbox"
                    checked={planForm.allowSharedPets}
                    onChange={e =>
                      setPlanForm({ ...planForm, allowSharedPets: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-[var(--pc-action)]"
                  />
                  Permitir compartilhar sessões entre pets do mesmo tutor
                </label>
              </div>
            </div>

            <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5" aria-labelledby="plan-services-title">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="plan-services-title" className="text-sm font-semibold text-slate-900">Serviços incluídos</h3>
                  <p className="mt-1 text-xs text-slate-500">Escolha os serviços e quantas sessões de cada um o pacote oferece.</p>
                </div>
                <button type="button" disabled={!services.some(s => !planForm.items.some(i => i.serviceId === s.id))}
                  onClick={() => {
                    const available = services.find(s => !planForm.items.some(i => i.serviceId === s.id));
                    if (available) setPlanForm(prev => ({ ...prev, items: [...prev.items, { serviceId: available.id, quantity: 1 }] }));
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50">
                  <Plus size={15} /> Adicionar serviço
                </button>
              </div>
              <div className="space-y-3">
                {planForm.items.map((item, idx) => {
                  const selected = services.find(s => s.id === item.serviceId) || editingPlan?.items.find(i => i.serviceId === item.serviceId)?.service;
                  return <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-testid="package-service-row">
                    <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_2.75rem]">
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <label htmlFor={`plan-service-${idx}`} className={labelClass}>Serviço {idx + 1}</label>
                        <select id={`plan-service-${idx}`} required value={item.serviceId}
                          onChange={e => setPlanForm(prev => ({ ...prev, items: prev.items.map((row, i) => i === idx ? { ...row, serviceId: e.target.value } : row) }))}
                          className={`${inputClass} min-w-0`}>
                          {!services.some(s => s.id === item.serviceId) && <option value={item.serviceId}>{selected?.name || 'Serviço indisponível'}</option>}
                          {services.map(s => <option key={s.id} value={s.id} disabled={planForm.items.some((row, i) => i !== idx && row.serviceId === s.id)}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`plan-quantity-${idx}`} className={labelClass}>Sessões</label>
                        <input id={`plan-quantity-${idx}`} required type="number" min={1} max={100} step={1} value={item.quantity}
                          onChange={e => setPlanForm(prev => ({ ...prev, items: prev.items.map((row, i) => i === idx ? { ...row, quantity: Number(e.target.value) } : row) }))}
                          className={`${inputClass} text-center font-semibold tabular-nums`} />
                      </div>
                      <button type="button" disabled={planForm.items.length === 1} aria-label={`Remover serviço ${idx + 1}`}
                        onClick={() => setPlanForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))}
                        className="grid h-11 w-11 justify-self-end place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-3 flex items-start gap-2 border-t border-slate-100 pt-3">
                      <Scissors size={15} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-800">{selected?.name || 'Selecione um serviço'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.quantity} {item.quantity === 1 ? 'sessão incluída' : 'sessões incluídas'}{selected && <> · Avulso: {money(selected.price)} por sessão</>}</p>
                      </div>
                    </div>
                  </div>;
                })}
                {!planForm.items.length && <p className="rounded-xl border border-dashed border-teal-200 bg-white p-4 text-sm text-slate-600">Adicione pelo menos um serviço ao pacote.</p>}
              </div>
              <p className="mt-4 text-sm font-semibold text-teal-900" aria-live="polite">{planForm.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} sessões no total · {planForm.items.length} {planForm.items.length === 1 ? 'serviço' : 'serviços'}</p>
            </section>

            {/* Regras de Precificação por Porte e Pelagem */}
            <details className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" open={Boolean(editingPlan?.pricingRules.length)}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">Preços por porte e pelagem <span className="ml-1 text-xs font-normal text-slate-500">Opcional</span></summary>
              <div className="mt-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-sm font-semibold text-[var(--pc-text)]">
                    Valores específicos para cada perfil
                  </span>
                  <p className="text-[11px] text-[var(--pc-text-secondary)]">
                    Ao selecionar o pet na venda, o sistema aplica automaticamente o valor correspondente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPlanForm(prev => ({
                      ...prev,
                      pricingRules: [
                        ...prev.pricingRules,
                        { species: 'dog', size: 'small', coatType: 'short', price: '', label: '' },
                      ],
                    }))
                  }
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[var(--pc-action)] shadow-2xs border border-[var(--pc-border)]"
                >
                  <Plus size={13} /> Nova Regra
                </button>
              </div>

              <div className="space-y-2">
                {planForm.pricingRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--pc-border)] bg-white p-2.5 sm:grid-cols-12 sm:items-center"
                  >
                    <div className="sm:col-span-3">
                      <select
                        aria-label={`Espécie da regra ${idx + 1}`} value={rule.species}
                        onChange={e => {
                          const next = [...planForm.pricingRules];
                          next[idx] = { ...next[idx], species: e.target.value };
                          setPlanForm({ ...planForm, pricingRules: next });
                        }}
                        className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--pc-border)] px-2 py-1.5 text-xs"
                      >
                        <option value="all">Cães e Gatos</option>
                        <option value="dog">Cachorro</option>
                        <option value="cat">Gato</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <select
                        aria-label={`Porte da regra ${idx + 1}`} value={rule.size}
                        onChange={e => {
                          const next = [...planForm.pricingRules];
                          next[idx] = { ...next[idx], size: e.target.value };
                          setPlanForm({ ...planForm, pricingRules: next });
                        }}
                        className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--pc-border)] px-2 py-1.5 text-xs"
                      >
                        <option value="all">Qualquer Porte</option>
                        <option value="small">Pequeno (P)</option>
                        <option value="medium">Médio (M)</option>
                        <option value="large">Grande (G)</option>
                        <option value="giant">Gigante (GG)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <select
                        aria-label={`Pelagem da regra ${idx + 1}`} value={rule.coatType}
                        onChange={e => {
                          const next = [...planForm.pricingRules];
                          next[idx] = { ...next[idx], coatType: e.target.value };
                          setPlanForm({ ...planForm, pricingRules: next });
                        }}
                        className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--pc-border)] px-2 py-1.5 text-xs"
                      >
                        <option value="all">Qualquer Pelagem</option>
                        <option value="short">Pelo Curto</option>
                        <option value="medium">Pelo Médio</option>
                        <option value="long">Pelo Longo</option>
                        <option value="double">Pelagem Dupla</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1 sm:col-span-3">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        aria-label={`Preço da regra ${idx + 1}`} placeholder="R$ Valor"
                        value={rule.price}
                        onChange={e => {
                          const next = [...planForm.pricingRules];
                          next[idx] = { ...next[idx], price: e.target.value };
                          setPlanForm({ ...planForm, pricingRules: next });
                        }}
                        className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--pc-border-strong)] px-2 py-1.5 text-xs font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPlanForm({
                            ...planForm,
                            pricingRules: planForm.pricingRules.filter((_, i) => i !== idx),
                          })
                        }
                        aria-label={`Remover regra ${idx + 1}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            </details>

            <div>
              <label className={labelClass}>Observações comerciais do plano</label>
              <textarea
                rows={2}
                value={planForm.description}
                onChange={e => setPlanForm({ ...planForm, description: e.target.value })}
                placeholder="Ex: Inclui corte de unhas e limpeza de ouvidos em todas as sessões."
                className={inputClass}
              />
            </div>

            <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setOpenPlanModal(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button type="submit" disabled={savingPlan} className={primaryButton}>
                {savingPlan ? 'Salvando...' : 'Salvar Plano de Pacote'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================================================
          MODAL 2: CONTRATAÇÃO E VINCULAÇÃO DE PACOTE AO TUTOR & PET
         ===================================================================== */}
      {openContractModal && (
        <Modal
          title="Contratar Pacote para Cliente"
          onClose={() => setOpenContractModal(false)}
        >
          <form onSubmit={handleSubmitContract} className="space-y-4">
            {/* Seleção de Tutor com Busca Rápida por Nome ou Telefone */}
            <div className="space-y-2">
              <label className={labelClass}>Tutor *</label>
              {selectedTutorObj && !tutorSearchOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-900">
                      {selectedTutorObj.name}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {selectedTutorObj.phone || 'Sem telefone'} · {tutorPets.length}{' '}
                      {tutorPets.length === 1 ? 'pet cadastrado' : 'pets cadastrados'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTutorSearchQuery('');
                      setTutorSearchOpen(true);
                    }}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50 transition"
                  >
                    <Search size={13} />
                    Trocar tutor
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-2.5 space-y-2">
                  <div className="relative flex items-center">
                    <Search size={15} className="pointer-events-none absolute left-3 text-zinc-400" />
                    <input
                      type="text"
                      value={tutorSearchQuery}
                      onChange={e => setTutorSearchQuery(e.target.value)}
                      placeholder="Digite o nome ou telefone do tutor..."
                      className={`${inputClass} pl-9 pr-9`}
                    />
                    {tutorSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setTutorSearchQuery('')}
                        aria-label="Limpar busca de tutor"
                        className="absolute right-2.5 text-zinc-400 hover:text-zinc-700"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
                    {filteredModalTutors.map(t => {
                      const countPets = pets.filter(p => p.customerId === t.id).length;
                      const isSel = t.id === contractForm.customerId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            const nextTutorPets = pets.filter(p => p.customerId === t.id);
                            const firstPet = nextTutorPets[0];
                            setContractForm(prev => ({
                              ...prev,
                              customerId: t.id,
                              petId: firstPet?.id || '',
                              species: firstPet?.species || prev.species,
                              size: firstPet?.size || prev.size,
                              coatType: firstPet?.coatType || prev.coatType,
                            }));
                            setSelectedPetIds(firstPet?.id ? [firstPet.id] : []);
                            setPerPetCustomPrices({});
                            setPerPetOverrides({});
                            setTutorSearchOpen(false);
                          }}
                          className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs transition hover:bg-teal-50/70 ${
                            isSel ? 'bg-teal-50 font-semibold text-teal-900' : 'text-zinc-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-bold">{t.name}</p>
                            <p className="text-[11px] text-zinc-500">{t.phone || 'Sem telefone'}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                            {countPets} {countPets === 1 ? 'pet' : 'pets'}
                          </span>
                        </button>
                      );
                    })}
                    {filteredModalTutors.length === 0 && (
                      <p className="p-3 text-center text-xs text-zinc-500">
                        Nenhum tutor encontrado com "{tutorSearchQuery}".
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Seleção Múltipla de Pets do Tutor */}
            {contractForm.customerId && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-[var(--pc-text-secondary)]">
                    Pets Beneficiados *{' '}
                    <span className="text-[11px] text-zinc-500">
                      (marque 1 ou mais pets deste tutor)
                    </span>
                  </label>
                  {tutorPets.length > 1 && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = tutorPets.map(p => p.id);
                          setSelectedPetIds(allIds);
                          const first = tutorPets[0];
                          setContractForm(prev => ({
                            ...prev,
                            petId: first?.id || '',
                            species: first?.species || prev.species,
                            size: first?.size || prev.size,
                            coatType: first?.coatType || prev.coatType,
                          }));
                          recalcAllPerPetPricesFromPlan(selectedPlanObj, tutorPets);
                        }}
                        className="cursor-pointer font-bold text-[#0d6e5a] hover:underline"
                      >
                        Selecionar todos ({tutorPets.length})
                      </button>
                      {selectedPetIds.length > 0 && (
                        <>
                          <span className="text-zinc-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPetIds([]);
                              setContractForm(prev => ({ ...prev, petId: '' }));
                            }}
                            className="cursor-pointer font-semibold text-zinc-500 hover:underline"
                          >
                            Limpar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {tutorPets.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">
                    Este tutor ainda não possui pets cadastrados.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {tutorPets.map(p => {
                      const checked = selectedPetIds.includes(p.id);
                      const sizeTxt = SIZE_LABELS[p.size || ''] || p.size || 'Porte N/I';
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            const nextIds = checked
                              ? selectedPetIds.filter(id => id !== p.id)
                              : [...selectedPetIds, p.id];
                            setSelectedPetIds(nextIds);
                            const primaryPet = pets.find(pt => pt.id === nextIds[0]) || p;
                            setContractForm(prev => ({
                              ...prev,
                              petId: nextIds[0] || '',
                              species: primaryPet?.species || prev.species,
                              size: primaryPet?.size || prev.size,
                              coatType: primaryPet?.coatType || prev.coatType,
                            }));
                            if (!checked && selectedPlanObj) {
                              setPerPetCustomPrices(prev => ({
                                ...prev,
                                [p.id]: String(computeSuggestedPlanPriceForPet(selectedPlanObj, p)),
                              }));
                            }
                          }}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${
                            checked
                              ? 'border-[#0d6e5a] bg-[#eef8f4] ring-1 ring-[#0d6e5a]/25'
                              : 'border-zinc-200 bg-white hover:border-zinc-300'
                          }`}
                        >
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-white transition ${
                              checked
                                ? 'border-[#0d6e5a] bg-[#0d6e5a]'
                                : 'border-zinc-300 bg-white'
                            }`}
                          >
                            {checked && <Check size={13} strokeWidth={3} />}
                          </span>
                          <PetAvatar pet={p} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-zinc-900">{p.name}</p>
                            <p className="truncate text-[11px] text-zinc-500">
                              {p.breed || (p.species === 'cat' ? 'Gato' : 'Cachorro')} · {sizeTxt}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Escolha de Modo Multi-Pet (quando 2+ pets marcados) */}
            {selectedPetIds.length >= 2 && (
              <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-teal-950">
                    Como deseja aplicar o pacote para estes {selectedPetIds.length} pets?
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMultiPetMode('per_pet')}
                    className={`flex h-full cursor-pointer flex-col justify-between gap-2 rounded-xl border p-3.5 text-left transition ${
                      multiPetMode === 'per_pet'
                        ? 'border-[#0d6e5a] bg-white ring-2 ring-[#0d6e5a]/20 shadow-xs'
                        : 'border-zinc-200 bg-white/80 hover:border-zinc-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                          multiPetMode === 'per_pet'
                            ? 'bg-[#0d6e5a] text-white'
                            : 'bg-teal-50 text-teal-800'
                        }`}
                      >
                        <Layers size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold leading-snug text-zinc-900">
                            1 pacote igual p/ cada pet (Agrupado)
                          </p>
                          <span
                            className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition ${
                              multiPetMode === 'per_pet'
                                ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white'
                                : 'border-zinc-300 bg-white'
                            }`}
                          >
                            {multiPetMode === 'per_pet' && <Check size={10} strokeWidth={3} />}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                          Cada pet recebe seu saldo completo, clona os horários juntos e fica tudo no mesmo card com 1 cobrança.
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMultiPetMode('shared')}
                    className={`flex h-full cursor-pointer flex-col justify-between gap-2 rounded-xl border p-3.5 text-left transition ${
                      multiPetMode === 'shared'
                        ? 'border-[#0d6e5a] bg-white ring-2 ring-[#0d6e5a]/20 shadow-xs'
                        : 'border-zinc-200 bg-white/80 hover:border-zinc-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                          multiPetMode === 'shared'
                            ? 'bg-[#0d6e5a] text-white'
                            : 'bg-teal-50 text-teal-800'
                        }`}
                      >
                        <Users size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold leading-snug text-zinc-900">
                            Dividir 1 único pacote entre os {selectedPetIds.length} pets
                          </p>
                          <span
                            className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition ${
                              multiPetMode === 'shared'
                                ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white'
                                : 'border-zinc-300 bg-white'
                            }`}
                          >
                            {multiPetMode === 'shared' && <Check size={10} strokeWidth={3} />}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                          Cria 1 pacote com saldo compartilhado entre os pets selecionados (ex: 4 banhos divididos entre eles).
                        </p>
                      </div>
                    </div>
                  </button>
                </div>

                {multiPetMode === 'per_pet' && (
                  <div className="rounded-xl border border-teal-200/80 bg-white p-3 space-y-2">
                    <p className="text-[11px] font-bold text-teal-950">
                      Valor individual por pet (calculado por porte/pelagem — editável)
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {selectedPetsList.map(p => (
                        <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-zinc-900">{p.name}</p>
                            <p className="truncate text-[10px] text-zinc-500">
                              {SIZE_LABELS[p.size || ''] || p.size || 'Pequeno (P)'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-semibold text-zinc-500">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={perPetCustomPrices[p.id] ?? ''}
                              onChange={e =>
                                setPerPetCustomPrices(prev => ({ ...prev, [p.id]: e.target.value }))
                              }
                              className="h-9 w-24 rounded-lg border border-zinc-300 bg-white px-2.5 text-right text-xs font-bold text-zinc-900 outline-none focus:border-[#0d6e5a]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className={labelClass}>Plano de Pacote *</label>
              <select
                required
                value={contractForm.packagePlanId}
                onChange={e => {
                  const p = plans.find(pl => pl.id === e.target.value) || null;
                  setContractForm(prev => ({
                    ...prev,
                    packagePlanId: e.target.value,
                    validityDays: p?.validityDays || prev.validityDays,
                    isShared: p?.allowSharedPets ? prev.isShared : false,
                  }));
                  if (selectedPetsList.length >= 2) {
                    recalcAllPerPetPricesFromPlan(p, selectedPetsList);
                  }
                }}
                className={inputClass}
              >
                {plans
                  .filter(p => p.active)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — Base {money(p.basePrice)} ({p.validityDays} dias)
                    </option>
                  ))}
              </select>
            </div>

            {/* Transporte do Animal (Táxi Dog) & Endereço do Tutor */}
            <div className="rounded-xl border border-amber-200/90 bg-amber-50/40 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-950">
                  <input
                    type="checkbox"
                    checked={contractForm.transportEnabled}
                    onChange={e =>
                      setContractForm(prev => ({
                        ...prev,
                        transportEnabled: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-amber-400 text-amber-700"
                  />
                  <span>🚐 Incluir Transporte do Animal (Táxi Dog) no Pacote</span>
                </label>
                {contractForm.transportEnabled && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                    +{money(Number(contractForm.transportFee || 0))} no pacote
                  </span>
                )}
              </div>

              {contractForm.transportEnabled && (() => {
                const tutorHasSavedAddress = Boolean(selectedTutorObj?.address && selectedTutorObj.address.trim().length > 0);

                return (
                  <div className="space-y-3 pt-1">
                    {/* Linha 1: Modalidade + Valor */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-amber-950 whitespace-nowrap">
                          Modalidade de Transporte *
                        </label>
                        <select
                          value={contractForm.transportMode}
                          onChange={e =>
                            setContractForm({
                              ...contractForm,
                              transportMode: e.target.value as any,
                            })
                          }
                          className={`${inputClass} h-11`}
                        >
                          <option value="round_trip">Buscar e Levar (Ida e Volta)</option>
                          <option value="pickup_only">Apenas Buscar (Leva por conta)</option>
                          <option value="dropoff_only">Apenas Levar (Traz por conta)</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-amber-950 whitespace-nowrap">
                          Taxa de Transporte (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={contractForm.transportFee}
                          onChange={e =>
                            setContractForm({ ...contractForm, transportFee: e.target.value })
                          }
                          placeholder="Ex: 40.00"
                          className={`${inputClass} h-11`}
                        />
                      </div>
                    </div>

                    {/* Linha 2: Rua/Número + Bairro */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[11px] font-semibold text-amber-950">
                          Endereço (Rua, Av. e Número) *
                        </label>
                        <input
                          type="text"
                          required={contractForm.transportEnabled}
                          value={contractForm.customerStreet}
                          onChange={e =>
                            setContractForm({ ...contractForm, customerStreet: e.target.value })
                          }
                          placeholder="Ex: R. Hipólito Lopes, 103"
                          className={`${inputClass} h-11`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-amber-950">
                          Bairro *
                        </label>
                        <input
                          type="text"
                          required={contractForm.transportEnabled}
                          value={contractForm.customerNeighborhood}
                          onChange={e =>
                            setContractForm({ ...contractForm, customerNeighborhood: e.target.value })
                          }
                          placeholder="Ex: Vila Leozina"
                          className={`${inputClass} h-11`}
                        />
                      </div>
                    </div>

                    {/* Linha 3: Ponto de Referência + Observação do Transporte */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-amber-950">
                          Ponto de Referência / Compl.
                        </label>
                        <input
                          type="text"
                          value={contractForm.customerReference}
                          onChange={e =>
                            setContractForm({ ...contractForm, customerReference: e.target.value })
                          }
                          placeholder="Ex: Próximo ao Campo Orlandão, Ap 12"
                          className={`${inputClass} h-11`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-amber-950">
                          Observação do Transporte
                        </label>
                        <input
                          type="text"
                          value={contractForm.transportNotes}
                          onChange={e =>
                            setContractForm({ ...contractForm, transportNotes: e.target.value })
                          }
                          placeholder="Ex: Interfone estragado, chamar no portão..."
                          className={`${inputClass} h-11`}
                        />
                      </div>
                    </div>

                    {/* Opção condicional: apenas se o tutor NÃO possuir endereço cadastrado */}
                    {!tutorHasSavedAddress && (
                      <div className="pt-2 border-t border-amber-200/60">
                        <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-50/90 border border-amber-300 cursor-pointer text-xs text-amber-950 font-medium hover:bg-amber-100/70 transition">
                          <input
                            type="checkbox"
                            checked={contractForm.saveAddressToCustomer}
                            onChange={e => setContractForm({ ...contractForm, saveAddressToCustomer: e.target.checked })}
                            className="mt-0.5 rounded text-teal-800 focus:ring-teal-700"
                          />
                          <div>
                            <span className="font-bold block text-[11px]">
                              Cadastrar este endereço na ficha de {selectedTutorObj?.name || 'cliente'}?
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

            {/* Agendamento Recorrente Semanal com Exceções por Semana e Clonagem Multi-Pet */}
            {(selectedPetIds.length > 0 || contractForm.petId) && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-950">
                    <input
                      type="checkbox"
                      checked={contractForm.scheduleRecurring}
                      onChange={e =>
                        setContractForm(prev => ({
                          ...prev,
                          scheduleRecurring: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 shrink-0 rounded border-teal-400 text-teal-700"
                    />
                    <span>📅 Agendar Sessões Automaticamente</span>
                  </label>
                  {contractForm.scheduleRecurring && (
                    <span className="shrink-0 rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-900">
                      {selectedPetIds.length >= 2 && multiPetMode === 'per_pet'
                        ? `${scheduledSessions.length}×${selectedPetIds.length} = ${scheduledSessions.length * selectedPetIds.length} sessões`
                        : `${scheduledSessions.length} sessões`}
                    </span>
                  )}
                </div>

                {contractForm.scheduleRecurring && selectedPetIds.length >= 2 && multiPetMode === 'shared' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-[11px] text-sky-950">
                    <span>
                      <strong>Pacote dividido:</strong> escolha qual pet vai em cada sessão ou clone o mesmo horário para todos (dentro do limite de sessões do pacote).
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setScheduledSessions(prev => {
                          if (!prev.length || selectedPetIds.length === 0) return prev;
                          const totalSlots = prev.length;
                          const next: typeof prev = [];
                          let slotIdx = 0;
                          let weekCursor = 0;
                          while (slotIdx < totalSlots) {
                            const baseRow = prev[weekCursor] || prev[0];
                            for (const pid of selectedPetIds) {
                              if (slotIdx >= totalSlots) break;
                              next.push({
                                ...baseRow,
                                petId: pid,
                                customEdited: true,
                              });
                              slotIdx += 1;
                            }
                            weekCursor += 1;
                          }
                          return next;
                        });
                        toast.success('Mesma data e horário clonados entre os pets selecionados!');
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100 transition"
                    >
                      <Copy size={12} /> Clonar dia/horário p/ todos
                    </button>
                  </div>
                )}

                {contractForm.scheduleRecurring && selectedPetIds.length >= 2 && multiPetMode === 'per_pet' && (
                  <div className="rounded-xl border border-teal-200 bg-white p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-bold text-teal-950">
                        <PawPrint size={13} className="text-teal-700" />
                        Selecione o pet para visualizar ou personalizar os agendamentos ({selectedPetsList.length} pets):
                      </span>
                      {Object.keys(perPetOverrides).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPerPetOverrides({})}
                          className="cursor-pointer font-bold text-[#0d6e5a] underline"
                        >
                          Reclonar padrão p/ todos
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveSchedulePetId('all')}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                          activeSchedulePetId === 'all' || !selectedPetIds.includes(activeSchedulePetId)
                            ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                            : 'border-teal-200 bg-teal-50/40 text-teal-900 hover:bg-teal-50'
                        }`}
                      >
                        <span>Todos (Padrão)</span>
                        <span className={`text-[10px] ${activeSchedulePetId === 'all' || !selectedPetIds.includes(activeSchedulePetId) ? 'text-emerald-100' : 'text-zinc-500'}`}>
                          ({scheduledSessions.length})
                        </span>
                      </button>
                      {selectedPetsList.map(p => {
                        const isActive = activeSchedulePetId === p.id;
                        const hasCustom = Boolean(perPetOverrides[p.id] && Object.keys(perPetOverrides[p.id]).length > 0);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setActiveSchedulePetId(p.id)}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                              isActive
                                ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                                : 'border-teal-200 bg-white text-teal-900 hover:bg-teal-50'
                            }`}
                          >
                            <span>{p.name}</span>
                            <span className={`inline-flex items-center gap-1 text-[10px] ${isActive ? 'text-emerald-100' : 'text-zinc-500'}`}>
                              ({scheduledSessions.length}){hasCustom && <Pencil size={10} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {contractForm.scheduleRecurring && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-teal-950">
                          Data da 1ª Sessão / Início *
                        </label>
                        <input
                          type="date"
                          required
                          value={contractForm.startDate}
                          onChange={e => {
                            const nextStart = e.target.value;
                            const dObj = nextStart ? new Date(`${nextStart}T12:00:00`) : null;
                            const nextDow = dObj && !Number.isNaN(dObj.getTime()) ? dObj.getDay() : contractForm.fixedDayOfWeek;
                            setScheduledSessions(prev => prev.map(s => ({ ...s, customEdited: false })));
                            setContractForm(prev => ({
                              ...prev,
                              startDate: nextStart,
                              fixedDayOfWeek: nextDow,
                            }));
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-teal-950">
                          Dia da Semana Fixo Padrão
                        </label>
                        <select
                          value={contractForm.fixedDayOfWeek}
                          onChange={e => {
                            setScheduledSessions(prev => prev.map(s => ({ ...s, customEdited: false })));
                            setContractForm({
                              ...contractForm,
                              fixedDayOfWeek: Number(e.target.value),
                            });
                          }}
                          className={inputClass}
                        >
                          <option value={1}>Toda Segunda-feira</option>
                          <option value={2}>Toda Terça-feira</option>
                          <option value={3}>Toda Quarta-feira</option>
                          <option value={4}>Toda Quinta-feira</option>
                          <option value={5}>Toda Sexta-feira</option>
                          <option value={6}>Todo Sábado</option>
                          <option value={0}>Todo Domingo</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-teal-950">
                          Horário Fixo Padrão
                        </label>
                        <input
                          type="time"
                          value={contractForm.fixedTime}
                          onChange={e =>
                            setContractForm({
                              ...contractForm,
                              fixedTime: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {(() => {
                      const now = new Date();
                      const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                      const hasPastSessions = scheduledSessions.some(s => Boolean(s.date && s.date < todayYMD));
                      if (!hasPastSessions || operators.length === 0) return null;
                      return (
                        <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-2.5 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-emerald-950">
                              ✓ Sessões passadas (já realizadas): atribua os colaboradores para gerar comissão e abater saldo automaticamente
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">
                                Quem fez o Banho (Padrão)
                              </label>
                              <select
                                value={defaultPastOperators.bathing}
                                onChange={e => {
                                  const val = e.target.value;
                                  setDefaultPastOperators(prev => ({ ...prev, bathing: val }));
                                  setScheduledSessions(prev =>
                                    prev.map(s =>
                                      s.date && s.date < todayYMD
                                        ? { ...s, stageOperators: { ...s.stageOperators, bathing: val } }
                                        : s,
                                    ),
                                  );
                                }}
                                className="w-full rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                              >
                                <option value="">Sem comissão de Banho</option>
                                {operators.map(op => (
                                  <option key={op.id} value={op.id}>
                                    {op.name} {op.jobTitle ? `(${op.jobTitle})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">
                                Quem fez a Tosa (Se houver)
                              </label>
                              <select
                                value={defaultPastOperators.grooming}
                                onChange={e => {
                                  const val = e.target.value;
                                  setDefaultPastOperators(prev => ({ ...prev, grooming: val }));
                                  setScheduledSessions(prev =>
                                    prev.map(s =>
                                      s.date && s.date < todayYMD
                                        ? { ...s, stageOperators: { ...s.stageOperators, grooming: val } }
                                        : s,
                                    ),
                                  );
                                }}
                                className="w-full rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                              >
                                <option value="">Sem comissão de Tosa</option>
                                {operators.map(op => (
                                  <option key={op.id} value={op.id}>
                                    {op.name} {op.jobTitle ? `(${op.jobTitle})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">
                                Quem fez a Finalização (Padrão)
                              </label>
                              <select
                                value={defaultPastOperators.finishing}
                                onChange={e => {
                                  const val = e.target.value;
                                  setDefaultPastOperators(prev => ({ ...prev, finishing: val }));
                                  setScheduledSessions(prev =>
                                    prev.map(s =>
                                      s.date && s.date < todayYMD
                                        ? { ...s, stageOperators: { ...s.stageOperators, finishing: val } }
                                        : s,
                                    ),
                                  );
                                }}
                                className="w-full rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                              >
                                <option value="">Sem comissão de Finalização</option>
                                {operators.map(op => (
                                  <option key={op.id} value={op.id}>
                                    {op.name} {op.jobTitle ? `(${op.jobTitle})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {scheduledSessions.length > 0 && (() => {
                      const isPerPetMode = selectedPetIds.length >= 2 && multiPetMode === 'per_pet';
                      const focusedPetObj = isPerPetMode && activeSchedulePetId !== 'all'
                        ? selectedPetsList.find(p => p.id === activeSchedulePetId) || null
                        : null;

                      return (
                        <div className="space-y-2 rounded-xl border border-teal-200/80 bg-white p-2.5">
                          {focusedPetObj && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-100 bg-teal-50/60 px-2.5 py-1.5 text-[11px] text-teal-950">
                              <span>
                                Agendamentos de <strong>{focusedPetObj.name}</strong> ({scheduledSessions.length}{' '}
                                {scheduledSessions.length === 1 ? 'sessão' : 'sessões'})
                              </span>
                              <div className="flex items-center gap-2">
                                {Boolean(perPetOverrides[focusedPetObj.id] && Object.keys(perPetOverrides[focusedPetObj.id]).length > 0) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPerPetOverrides(prev => {
                                        const next = { ...prev };
                                        delete next[focusedPetObj.id];
                                        return next;
                                      })
                                    }
                                    className="cursor-pointer font-semibold text-amber-800 underline"
                                  >
                                    Voltar p/ padrão
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {scheduledSessions.map((sess, idx) => {
                            const ov = focusedPetObj ? perPetOverrides[focusedPetObj.id]?.[idx] : undefined;
                            const effectiveDate = ov?.date ?? sess.date;
                            const effectiveTime = ov?.time ?? sess.time;
                            const effectiveOps = ov?.stageOperators ?? sess.stageOperators;

                            const dObj = effectiveDate ? new Date(`${effectiveDate}T12:00:00`) : null;
                            const weekdayLabel =
                              dObj && !Number.isNaN(dObj.getTime())
                                ? new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(dObj)
                                : '';
                            const now = new Date();
                            const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                            const isPastSession = Boolean(effectiveDate && effectiveDate < todayYMD);
                            const isModified = Boolean(focusedPetObj ? (ov?.date || ov?.time) : sess.customEdited);

                            return (
                              <div
                                key={`${focusedPetObj?.id || 'base'}-${idx}`}
                                className={`space-y-2 rounded-lg border p-2 text-xs ${
                                  isPastSession
                                    ? 'border-emerald-300 bg-emerald-50/40'
                                    : isModified
                                      ? 'border-amber-300 bg-amber-50/40'
                                      : 'border-slate-200 bg-slate-50/60'
                                }`}
                              >
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                                  <div className="sm:col-span-4 flex items-center gap-1.5 font-semibold text-slate-800">
                                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
                                      {idx + 1}ª
                                    </span>
                                    <span>Semana {idx + 1}</span>
                                    {weekdayLabel && (
                                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] uppercase text-teal-800 border border-slate-200">
                                        {weekdayLabel}
                                      </span>
                                    )}
                                  </div>
                                  <div className="sm:col-span-5">
                                    <input
                                      type="date"
                                      value={effectiveDate}
                                      onChange={e => {
                                        const nextDate = e.target.value;
                                        const isPastDate = Boolean(nextDate && nextDate < todayYMD);
                                        if (focusedPetObj) {
                                          setPerPetOverrides(prev => ({
                                            ...prev,
                                            [focusedPetObj.id]: {
                                              ...(prev[focusedPetObj.id] || {}),
                                              [idx]: {
                                                ...(prev[focusedPetObj.id]?.[idx] || {}),
                                                date: nextDate,
                                                stageOperators: prev[focusedPetObj.id]?.[idx]?.stageOperators || sess.stageOperators || {
                                                  bathing: defaultPastOperators.bathing,
                                                  grooming: defaultPastOperators.grooming,
                                                  finishing: defaultPastOperators.finishing,
                                                },
                                              },
                                            },
                                          }));
                                        } else {
                                          const next = [...scheduledSessions];
                                          next[idx] = {
                                            ...next[idx],
                                            date: nextDate,
                                            customEdited: true,
                                            completed: isPastDate,
                                            stageOperators: next[idx].stageOperators || {
                                              bathing: defaultPastOperators.bathing,
                                              grooming: defaultPastOperators.grooming,
                                              finishing: defaultPastOperators.finishing,
                                            },
                                          };
                                          setScheduledSessions(next);
                                        }
                                        if (idx === 0 && nextDate && nextDate < contractForm.startDate) {
                                          setContractForm(prev => ({ ...prev, startDate: nextDate }));
                                        }
                                      }}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                                    />
                                  </div>
                                  <div className="sm:col-span-3">
                                    <input
                                      type="time"
                                      value={effectiveTime}
                                      onChange={e => {
                                        const nextTime = e.target.value;
                                        if (focusedPetObj) {
                                          setPerPetOverrides(prev => ({
                                            ...prev,
                                            [focusedPetObj.id]: {
                                              ...(prev[focusedPetObj.id] || {}),
                                              [idx]: {
                                                ...(prev[focusedPetObj.id]?.[idx] || {}),
                                                time: nextTime,
                                              },
                                            },
                                          }));
                                        } else {
                                          const next = [...scheduledSessions];
                                          next[idx] = {
                                            ...next[idx],
                                            time: nextTime,
                                            customEdited: true,
                                          };
                                          setScheduledSessions(next);
                                        }
                                      }}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                                    />
                                  </div>
                                </div>

                                {selectedPetIds.length >= 2 && multiPetMode === 'shared' && (
                                  <div className="flex items-center gap-2 rounded-lg border border-sky-200/80 bg-white px-2.5 py-1.5">
                                    <span className="text-[11px] font-bold text-sky-900 shrink-0">
                                      Pet desta sessão:
                                    </span>
                                    <select
                                      value={sess.petId || selectedPetIds[idx % selectedPetIds.length] || ''}
                                      onChange={e => {
                                        const next = [...scheduledSessions];
                                        next[idx] = {
                                          ...next[idx],
                                          petId: e.target.value,
                                          customEdited: true,
                                        };
                                        setScheduledSessions(next);
                                      }}
                                      className="min-w-0 flex-1 rounded border border-sky-200 bg-sky-50/40 px-2 py-1 text-xs font-semibold text-zinc-800"
                                    >
                                      {selectedPetsList.map(p => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} ({SIZE_LABELS[p.size || ''] || p.size || 'P'})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {isPastSession && operators.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1 border-t border-emerald-200/70">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-semibold text-emerald-900 shrink-0 w-16">Banho:</span>
                                      <select
                                        value={effectiveOps?.bathing ?? ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          if (focusedPetObj) {
                                            setPerPetOverrides(prev => ({
                                              ...prev,
                                              [focusedPetObj.id]: {
                                                ...(prev[focusedPetObj.id] || {}),
                                                [idx]: {
                                                  ...(prev[focusedPetObj.id]?.[idx] || {}),
                                                  stageOperators: { ...(effectiveOps || {}), bathing: val },
                                                },
                                              },
                                            }));
                                          } else {
                                            const next = [...scheduledSessions];
                                            next[idx] = {
                                              ...next[idx],
                                              stageOperators: { ...next[idx].stageOperators, bathing: val },
                                            };
                                            setScheduledSessions(next);
                                          }
                                        }}
                                        className="min-w-0 flex-1 rounded border border-emerald-200 bg-white px-1.5 py-1 text-[11px]"
                                      >
                                        <option value="">Sem comissão</option>
                                        {operators.map(op => (
                                          <option key={op.id} value={op.id}>{op.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-semibold text-emerald-900 shrink-0 w-16">Tosa:</span>
                                      <select
                                        value={effectiveOps?.grooming ?? ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          if (focusedPetObj) {
                                            setPerPetOverrides(prev => ({
                                              ...prev,
                                              [focusedPetObj.id]: {
                                                ...(prev[focusedPetObj.id] || {}),
                                                [idx]: {
                                                  ...(prev[focusedPetObj.id]?.[idx] || {}),
                                                  stageOperators: { ...(effectiveOps || {}), grooming: val },
                                                },
                                              },
                                            }));
                                          } else {
                                            const next = [...scheduledSessions];
                                            next[idx] = {
                                              ...next[idx],
                                              stageOperators: { ...next[idx].stageOperators, grooming: val },
                                            };
                                            setScheduledSessions(next);
                                          }
                                        }}
                                        className="min-w-0 flex-1 rounded border border-emerald-200 bg-white px-1.5 py-1 text-[11px]"
                                      >
                                        <option value="">Sem comissão</option>
                                        {operators.map(op => (
                                          <option key={op.id} value={op.id}>{op.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-semibold text-emerald-900 shrink-0 w-16">Finaliz.:</span>
                                      <select
                                        value={effectiveOps?.finishing ?? ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          if (focusedPetObj) {
                                            setPerPetOverrides(prev => ({
                                              ...prev,
                                              [focusedPetObj.id]: {
                                                ...(prev[focusedPetObj.id] || {}),
                                                [idx]: {
                                                  ...(prev[focusedPetObj.id]?.[idx] || {}),
                                                  stageOperators: { ...(effectiveOps || {}), finishing: val },
                                                },
                                              },
                                            }));
                                          } else {
                                            const next = [...scheduledSessions];
                                            next[idx] = {
                                              ...next[idx],
                                              stageOperators: { ...next[idx].stageOperators, finishing: val },
                                            };
                                            setScheduledSessions(next);
                                          }
                                        }}
                                        className="min-w-0 flex-1 rounded border border-emerald-200 bg-white px-1.5 py-1 text-[11px]"
                                      >
                                        <option value="">Sem comissão</option>
                                        {operators.map(op => (
                                          <option key={op.id} value={op.id}>{op.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Condições Comerciais Snapshot */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>
                  {selectedPetIds.length >= 2 && multiPetMode === 'per_pet'
                    ? `Soma dos ${selectedPetIds.length} Pacotes (R$)`
                    : 'Valor Tabelado / Personalizado (R$)'}
                </label>
                {selectedPetIds.length >= 2 && multiPetMode === 'per_pet' ? (
                  <div className="flex min-h-11 items-center rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-bold text-zinc-900">
                    {money(computedBaseForMode)}
                  </div>
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={contractForm.customPrice}
                    onChange={e => setContractForm({ ...contractForm, customPrice: e.target.value })}
                    className={inputClass}
                  />
                )}
              </div>
              <div>
                <label className={labelClass}>Desconto Autorizado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={contractForm.discountAmount}
                  onChange={e =>
                    setContractForm({ ...contractForm, discountAmount: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {selectedPetIds.length >= 2 && multiPetMode === 'per_pet'
                    ? 'Valor Total do Grupo'
                    : 'Valor Final do Contrato'}
                </label>
                <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-base font-bold text-emerald-900">
                  <span>{money(computedFinalContractPrice)}</span>
                  {computedTransportFee > 0 && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                      +{money(computedTransportFee)} frete
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Início da Vigência</label>
                <input
                  type="date"
                  required
                  value={contractForm.startDate}
                  onChange={e => setContractForm({ ...contractForm, startDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Faturamento / Recebimento</label>
                <select
                  value={contractForm.billingMode}
                  onChange={e =>
                    setContractForm({
                      ...contractForm,
                      billingMode: e.target.value as 'paid' | 'comanda',
                    })
                  }
                  className={inputClass}
                >
                  <option value="paid">Recebido Agora (Ativar Pago)</option>
                  <option value="comanda">Enviar p/ Cobrança no Caixa (PDV)</option>
                </select>
              </div>
            </div>
            {contractForm.billingMode === 'paid' && (
              <PackagePaymentFields rows={paymentRows} total={computedFinalContractPrice} onChange={setPaymentRows} />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenContractModal(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button type="submit" disabled={savingContract || (contractForm.billingMode === 'paid' && !packagePaymentsValid(paymentRows, computedFinalContractPrice))} className={primaryButton}>
                {savingContract ? 'Processando...' : 'Confirmar Contratação'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================================================
          MODAL 3: EXTRATO AUDITÁVEL DE SESSÕES, ESTORNO E CANCELAMENTO
         ===================================================================== */}
      {selectedContract && (
        <Modal
          title={
            selectedGroupContracts.length > 1
              ? `Pacote Família (${selectedGroupContracts.length} pets): ${selectedContract.planNameSnapshot}`
              : `Contrato: ${selectedContract.planNameSnapshot}`
          }
          onClose={() => {
            setSelectedContract(null);
            setSelectedGroupContracts([]);
            setEditingAppointmentId(null);
            setRescheduleStartsAt('');
            setRefundTargetItem(null);
            setShowCancelConfirm(false);
          }}
        >
          <div className="space-y-4">
            {(() => {
              const isGroupModal = selectedGroupContracts.length > 1;
              const groupTotalValue = isGroupModal
                ? selectedGroupContracts.reduce((sum, m) => sum + Number(m.finalPrice || 0), 0)
                : Number(selectedContract.finalPrice || 0);
              const groupTaxiFeeTotal = isGroupModal
                ? selectedGroupContracts.reduce(
                    (sum, m) => sum + (m.transport?.enabled ? Number(m.transport.fee || 0) : 0),
                    0,
                  )
                : 0;
              const groupTaxiHolder = isGroupModal
                ? selectedGroupContracts.find(
                    m => m.transport?.enabled && Number(m.transport.fee || 0) > 0,
                  ) ||
                  selectedGroupContracts.find(m => m.transport?.enabled) ||
                  null
                : null;
              const groupPackageNet = Math.max(0, groupTotalValue - groupTaxiFeeTotal);
              const contractTaxiFee = selectedContract.transport?.enabled
                ? Number(selectedContract.transport.fee || 0)
                : 0;
              const contractPackageBase = Math.max(
                0,
                Number(selectedContract.basePriceSnapshot || 0) - contractTaxiFee,
              );
              const contractDiscount = Number(selectedContract.discountAmount || 0);
              const activeTransportInfo = selectedContract.transport?.enabled
                ? selectedContract.transport
                : groupTaxiHolder?.transport?.enabled
                  ? groupTaxiHolder.transport
                  : null;

              return (
                <>
                  {isGroupModal && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-bold text-teal-950">
                          <PawPrint size={14} className="text-teal-700" />
                          Grupo com {selectedGroupContracts.length} pets · Selecione o pet para gerenciar saldo e sessões:
                        </span>
                        <div className="text-right">
                          <span className="block font-black text-teal-900">
                            Total do Grupo: {money(groupTotalValue)}
                          </span>
                          {groupTaxiHolder && (
                            <span className="block text-[11px] font-semibold text-amber-800">
                              Pacotes: {money(groupPackageNet)} · Frete Táxi Dog:{' '}
                              {groupTaxiFeeTotal > 0
                                ? `${money(groupTaxiFeeTotal)}${groupTaxiHolder.pet?.name ? ` (em ${groupTaxiHolder.pet.name})` : ''}`
                                : 'Incluso (R$ 0,00)'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedGroupContracts.map(member => {
                          const active = selectedContract.id === member.id;
                          const avail = member.items.reduce((s, i) => s + i.availableQuantity, 0);
                          const total = member.items.reduce((s, i) => s + i.totalQuantity, 0);
                          return (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => {
                                setSelectedContract(member);
                                setEditingAppointmentId(null);
                                setRefundTargetItem(null);
                              }}
                              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                                active
                                  ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                                  : 'border-teal-200 bg-white text-teal-900 hover:bg-teal-50'
                              }`}
                            >
                              <span>{member.pet?.name || 'Pet'}</span>
                              <span className={`text-[10px] ${active ? 'text-emerald-100' : 'text-zinc-500'}`}>
                                ({avail}/{total})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-3.5 text-xs">
                    <div>
                      <p className="font-bold text-sm text-[var(--pc-text)]">
                        {selectedContract.customer?.name} ·{' '}
                        {selectedContract.pet?.name ||
                          (selectedContract.packageGroup?.petNames?.length
                            ? `Compartilhado (${selectedContract.packageGroup.petNames.join(', ')})`
                            : 'Compartilhado entre pets')}
                      </p>
                      <p className="text-[var(--pc-text-secondary)]">
                        Contratado em {new Date(selectedContract.startDate).toLocaleDateString('pt-BR')} ·
                        Vencimento: {new Date(selectedContract.expiresAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[var(--pc-action)]">
                        {money(selectedContract.finalPrice)}
                      </p>
                      {contractTaxiFee > 0 ? (
                        <p className="mt-0.5 text-[11px] font-semibold text-amber-800">
                          Pacote {money(contractPackageBase)} + Frete {money(contractTaxiFee)}
                          {contractDiscount > 0 ? ` − Desc. ${money(contractDiscount)}` : ''}
                        </p>
                      ) : isGroupModal && groupTaxiFeeTotal > 0 ? (
                        <p className="mt-0.5 text-[11px] text-[var(--pc-text-secondary)]">
                          Só pacote · Frete ({money(groupTaxiFeeTotal)}) em {groupTaxiHolder?.pet?.name || 'grupo'}
                        </p>
                      ) : contractDiscount > 0 ? (
                        <p className="mt-0.5 text-[11px] text-[var(--pc-text-secondary)]">
                          Pacote {money(contractPackageBase)} − Desc. {money(contractDiscount)}
                        </p>
                      ) : null}
                      {selectedContract.paymentStatus === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleConfirmPayment(selectedContract.id)}
                          className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 size={12} />{' '}
                          {isGroupModal
                            ? 'Confirmar Recebimento (Grupo)'
                            : 'Confirmar Recebimento'}
                        </button>
                      )}
                    </div>
                  </div>

                  {activeTransportInfo && (
                    <div className="rounded-xl border border-amber-200/90 bg-amber-50/45 p-3.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-bold text-amber-950">
                          <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-100 text-amber-800">
                            <Car size={14} />
                          </span>
                          <span>Frete / Táxi Dog do Pacote</span>
                        </div>
                        <span className="rounded-full border border-amber-200 bg-amber-100/80 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 tabular-nums">
                          {contractTaxiFee > 0
                            ? `Taxa única: +${money(contractTaxiFee)}`
                            : isGroupModal && groupTaxiFeeTotal > 0
                              ? `Frete único do grupo: ${money(groupTaxiFeeTotal)} (em ${groupTaxiHolder?.pet?.name || 'grupo'})`
                              : 'Incluso sem taxa adicional (R$ 0,00)'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-amber-950/90">
                        <span className="font-semibold">
                          Modalidade: {TAXI_MODE_LABELS[activeTransportInfo.mode] || activeTransportInfo.mode}
                        </span>
                        {(activeTransportInfo.address || activeTransportInfo.street) && (
                          <span className="inline-flex items-center gap-1 text-zinc-700">
                            <MapPin size={12} className="shrink-0 text-amber-700" />
                            <span>
                              {activeTransportInfo.address ||
                                [activeTransportInfo.street, activeTransportInfo.neighborhood]
                                  .filter(Boolean)
                                  .join(' - ')}
                            </span>
                          </span>
                        )}
                      </div>
                      {(activeTransportInfo.reference || activeTransportInfo.notes) && (
                        <p className="mt-1 text-[11px] text-zinc-600">
                          {[
                            activeTransportInfo.reference ? `Ref.: ${activeTransportInfo.reference}` : '',
                            activeTransportInfo.notes ? `Obs.: ${activeTransportInfo.notes}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {selectedContract.receipt && (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3" aria-label="Recebimento do contrato">
                <h4 className="text-sm font-semibold text-emerald-950">Recebido em {new Date(selectedContract.receipt.receivedAt).toLocaleString('pt-BR')}</h4>
                {selectedContract.receipt.payments.map((payment, index) => <p key={index} className="mt-1 flex justify-between gap-2 text-sm text-emerald-900"><span>{packagePaymentLabels[payment.method] || payment.method}</span><strong>{money(payment.amount)}</strong></p>)}
              </section>
            )}

            {/* Itens de Saldo com Botão de Estorno de Sessão */}
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--pc-text-muted)]">
                Saldo por Serviço e Ações de Estorno
              </h4>
              <div className="space-y-2">
                {selectedContract.items.map(item => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--pc-border)] bg-white p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--pc-text)]">
                        {item.serviceNameSnapshot}
                      </p>
                      <p className="text-xs text-[var(--pc-text-secondary)]">
                        Contratadas: <strong>{item.totalQuantity}</strong> · Realizadas:{' '}
                        <strong>{item.usedQuantity}</strong> · Reservadas:{' '}
                        <strong>{item.reservedQuantity}</strong> · Livres:{' '}
                        <strong className="text-[var(--pc-action)]">{item.availableQuantity}</strong>
                      </p>
                    </div>
                    {item.usedQuantity > 0 && selectedContract.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRefundTargetItem(item);
                          setRefundReason('');
                          setRefundAppointmentId('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        <RotateCcw size={13} />
                        Estornar 1 Sessão
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Formulário de Estorno Auditável */}
            {refundTargetItem && (
              <form
                onSubmit={handleSubmitRefund}
                className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-amber-950">
                    Estornar 1 sessão de: {refundTargetItem.serviceNameSnapshot}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRefundTargetItem(null)}
                    className="text-xs text-amber-900 underline"
                  >
                    Fechar
                  </button>
                </div>
                <label className="block space-y-1 text-sm text-amber-950">
                  <span>Sessão a estornar *</span>
                  <select required value={refundAppointmentId} onChange={e => setRefundAppointmentId(e.target.value)} className={inputClass}>
                    <option value="">Selecione a sessão concluída</option>
                    {(selectedContract.scheduledAppointments || []).filter(a => a.services.some(service => service.coverageStatus === 'consumed' && service.customerPackageItemId === refundTargetItem.id)).map(a => (
                      <option key={a.id} value={a.id}>{new Date(a.startsAt).toLocaleString('pt-BR')} · {a.pet.name}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <label className="mb-1 block text-xs font-medium text-amber-950">
                    Motivo obrigatório do estorno (registrado na auditoria) *
                  </label>
                  <input
                    required
                    minLength={3}
                    value={refundReason}
                    onChange={e => setRefundReason(e.target.value)}
                    placeholder="Ex: Baixa lançada no pet incorreto / Atendimento reagendado"
                    className={inputClass}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingRefund}
                    className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800"
                  >
                    {submittingRefund ? 'Estornando...' : 'Confirmar Estorno de Sessão'}
                  </button>
                </div>
              </form>
            )}

            {/* Datas atuais das sessões vinculadas à agenda */}
            <section aria-label="Sessões do pacote agendadas">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--pc-text-muted)]">
                Sessões na agenda
              </h4>
              {loadingContractDetails ? (
                <p className="rounded-xl border border-[var(--pc-border)] p-3 text-xs text-[var(--pc-text-secondary)]">
                  Carregando datas das sessões...
                </p>
              ) : contractDetailsError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  Não foi possível carregar as datas. Feche e abra o contrato para tentar novamente.
                </p>
              ) : selectedContract.scheduledAppointments?.length ? (
                <div className="space-y-2">
                  {selectedContract.scheduledAppointments.map((appointment, index) => {
                    const canReschedule = selectedContract.status === 'active' &&
                      ['scheduled', 'requested'].includes(appointment.status) &&
                      appointment.services.some(service => service.coverageStatus === 'reserved');
                    const isEditing = editingAppointmentId === appointment.id;
                    const latestReschedule = Array.isArray(appointment.stageHistory)
                      ? [...appointment.stageHistory].reverse().find(entry =>
                          entry && typeof entry.at === 'string' && typeof entry.rescheduledFrom === 'string')
                      : null;
                    return (
                      <div key={appointment.id} className="rounded-xl border border-[var(--pc-border)] bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--pc-text-secondary)]">
                              Sessão {index + 1} · {appointment.services.map(service => service.nameSnapshot).join(', ')}
                              {selectedContract.isShared ? ` · ${appointment.pet.name}` : ''}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[var(--pc-text)]">
                              <Calendar size={15} aria-hidden="true" /> {dateTime(appointment.startsAt)}
                            </p>
                            {latestReschedule && (
                              <p className="mt-1 text-[11px] text-[var(--pc-text-secondary)]">
                                Reagendado em {dateTime(latestReschedule.at)} · data anterior: {dateTime(latestReschedule.rescheduledFrom)}
                              </p>
                            )}
                            {appointment.status === 'delivered' || appointment.services.every(service => service.coverageStatus === 'consumed') ? (
                              <p className="mt-1 text-xs text-emerald-700">Realizada</p>
                            ) : !canReschedule ? (
                              <p className="mt-1 text-xs text-[var(--pc-text-secondary)]">Atendimento em andamento</p>
                            ) : null}
                          </div>
                          {canReschedule && !isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAppointmentId(appointment.id);
                                setRescheduleStartsAt(localDateTimeInput(appointment.startsAt));
                              }}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                              aria-label={`Alterar data da sessão ${index + 1}`}
                            >
                              <Pencil size={13} aria-hidden="true" /> Alterar data
                            </button>
                          )}
                        </div>
                        {isEditing && (
                          <form onSubmit={handleSavePackageReschedule} className="mt-3 border-t border-[var(--pc-border)] pt-3">
                            <label htmlFor="package-reschedule-date" className="mb-1 block text-xs font-semibold text-[var(--pc-text)]">
                              Nova data e horário
                            </label>
                            <input
                              id="package-reschedule-date"
                              type="datetime-local"
                              required
                              value={rescheduleStartsAt}
                              onChange={e => setRescheduleStartsAt(e.target.value)}
                              disabled={savingReschedule}
                              className={inputClass}
                            />
                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                              <button type="button" disabled={savingReschedule} onClick={() => setEditingAppointmentId(null)} className={secondaryButton}>
                                Cancelar
                              </button>
                              <button type="submit" disabled={savingReschedule} className={primaryButton}>
                                {savingReschedule ? 'Salvando...' : 'Salvar data'}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-[var(--pc-border)] p-3 text-xs text-[var(--pc-text-secondary)]">
                  Nenhuma sessão vinculada à agenda neste contrato.
                </p>
              )}
            </section>

            {/* Histórico de Movimentações (Ledger Imutável) */}
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--pc-text-muted)]">
                Histórico Auditável de Movimentações
              </h4>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {(selectedContract.ledgerEvents || []).map(ev => {
                  const meta = EVENT_TYPE_LABELS[ev.eventType] || {
                    label: ev.eventType,
                    color: 'bg-slate-100 text-slate-700 border-slate-200',
                  };
                  return (
                    <div
                      key={ev.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-2.5 text-xs"
                    >
                      <div>
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                        <p className="mt-1 font-medium text-[var(--pc-text)]">
                          {ev.reason || 'Movimentação registrada'}
                        </p>
                        <p className="text-[11px] text-[var(--pc-text-secondary)]">
                          {ev.operatorName ? `Operador: ${ev.operatorName} · ` : ''}
                          Registrado em {dateTime(ev.createdAt)}
                        </p>
                        {ev.eventType === 'RESERVE' && ev.appointment && (
                          <p className="mt-1 text-[11px] text-sky-800">
                            Data atual da sessão: {dateTime(ev.appointment.startsAt)}
                          </p>
                        )}
                      </div>
                      <div className="text-right font-mono text-xs">
                        <span className="block font-bold text-[var(--pc-text)]">
                          Saldo livre: {ev.balanceAfter}
                        </span>
                        <span className="text-[11px] text-[var(--pc-text-muted)]">
                          Usadas: {ev.usedAfter} · Reserv.: {ev.reservedAfter}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cancelamento de Contrato */}
            {selectedContract.status === 'active' && (
              <div className="border-t border-[var(--pc-border)] pt-3">
                {!showCancelConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline"
                  >
                    <XCircle size={14} />
                    Cancelar este contrato de pacote
                  </button>
                ) : (
                  <form
                    onSubmit={handleSubmitCancelContract}
                    className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-2"
                  >
                    <label className="block text-xs font-semibold text-rose-900">
                      Informe o motivo do cancelamento do contrato *
                    </label>
                    <input
                      required
                      minLength={3}
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="Ex: Solicitação de cancelamento pelo tutor"
                      className={inputClass}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="text-xs text-slate-600 px-2 py-1"
                      >
                        Voltar
                      </button>
                      <button
                        type="submit"
                        disabled={submittingCancel}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        {submittingCancel ? 'Cancelando...' : 'Confirmar Cancelamento'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
