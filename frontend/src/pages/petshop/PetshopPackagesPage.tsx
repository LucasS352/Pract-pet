import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  History,
  Layers,
  LayoutGrid,
  List,
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

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  CONTRACT_CREATED: { label: 'Contratação Inicial', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  RESERVE: { label: 'Reserva em Agenda', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  CONSUME: { label: 'Sessão Realizada', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RELEASE_RESERVATION: { label: 'Reserva Liberada', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  REFUND: { label: 'Estorno de Sessão', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  CANCEL: { label: 'Cancelamento', color: 'bg-rose-50 text-rose-700 border-rose-200' },
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
  const [savingContract, setSavingContract] = useState(false);
  const [priceSimulation, setPriceSimulation] = useState<any>(null);
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
    transportFee: '40',
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
    Array<{ date: string; time: string; serviceId: string; customEdited?: boolean }>
  >([]);

  // Modal de Detalhes / Histórico / Estorno de Contrato
  const [selectedContract, setSelectedContract] = useState<CustomerPetPackage | null>(null);
  const [refundTargetItem, setRefundTargetItem] = useState<CustomerPetPackageItem | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const loadAll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [contractsRes, plansRes, servicesRes, tutorsRes, petsRes, finRes] = await Promise.all([
        api.get('/petshop/packages/contracts'),
        api.get('/petshop/packages/plans?includeInactive=true'),
        api.get('/petshop/services'),
        api.get('/petshop/tutors'),
        api.get('/petshop/pets'),
        api.get('/petshop/packages/financial-overview'),
      ]);

      setContracts(Array.isArray(contractsRes.data) ? contractsRes.data : []);
      setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
      setServices(Array.isArray(servicesRes.data) ? servicesRes.data : []);
      setTutors(Array.isArray(tutorsRes.data) ? tutorsRes.data : []);
      setPets(Array.isArray(petsRes.data) ? petsRes.data : []);
      setFinancialOverview(finRes.data || null);
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
      setPriceSimulation(null);
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
        setPriceSimulation(res.data);
        setContractForm(prev => ({
          ...prev,
          customPrice: String(res.data.suggestedPrice ?? ''),
        }));
      })
      .catch(() => setPriceSimulation(null));
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
      let daysUntilFirst = (dayOfWeek - currentDow + 7) % 7;
      const firstSessionDate = new Date(baseDate);
      firstSessionDate.setDate(firstSessionDate.getDate() + daysUntilFirst);

      const generated: Array<{ date: string; time: string; serviceId: string; customEdited?: boolean }> = [];
      for (let i = 0; i < totalCount; i++) {
        const d = new Date(firstSessionDate);
        d.setDate(d.getDate() + i * 7);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        generated.push({
          date: `${yyyy}-${mm}-${dd}`,
          time: timeStr || '15:00',
          serviceId: expandedServiceIds[i] || plan.items[0].serviceId,
          customEdited: false,
        });
      }
      setScheduledSessions(generated);
    },
    [],
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
        const matchPlan = c.planNameSnapshot?.toLowerCase().includes(q);
        if (!matchTutor && !matchPet && !matchPlan) return false;
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
  const paginatedContracts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredContracts.slice(start, start + pageSize);
  }, [filteredContracts, safePage, pageSize]);

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
    const defaultTutor = tutors[0];
    const firstPet = pets.find(p => p.customerId === defaultTutor?.id) || pets[0];
    const plan = preselectedPlan || plans.find(p => p.active) || plans[0];

    if (!plan) {
      toast.error('Cadastre pelo menos um plano no Catálogo de Pacotes antes de vender.');
      setActiveTab('catalog');
      return;
    }

    setContractForm({
      customerId: firstPet?.customerId || defaultTutor?.id || '',
      petId: firstPet?.id || '',
      packagePlanId: plan.id,
      isShared: false,
      species: firstPet?.species || 'dog',
      size: firstPet?.size || 'small',
      coatType: firstPet?.coatType || 'short',
      customPrice: String(Number(plan.basePrice)),
      discountAmount: '0',
      validityDays: plan.validityDays,
      startDate: new Date().toISOString().slice(0, 10),
      billingMode: 'paid',
      paymentMethod: 'pix',
      notes: '',
      transportEnabled: false,
      transportMode: 'round_trip',
      transportFee: '40',
      customerStreet: parseAddressParts(defaultTutor?.address).street,
      customerNeighborhood: parseAddressParts(defaultTutor?.address).neighborhood,
      customerReference: defaultTutor?.reference || '',
      transportNotes: '',
      saveAddressToCustomer: !Boolean(defaultTutor?.address && defaultTutor.address.trim().length > 0),
      scheduleRecurring: true,
      fixedDayOfWeek: 5,
      fixedTime: '15:00',
    });
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
      transportFee: '40',
      customerStreet: parsedAddr.street,
      customerNeighborhood: parsedAddr.neighborhood,
      customerReference: tutorObj?.reference || '',
      transportNotes: '',
      saveAddressToCustomer: !hasAddr,
      scheduleRecurring: true,
      fixedDayOfWeek: 5,
      fixedTime: '15:00',
    });

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

    setSavingContract(true);
    try {
      const formattedSessions =
        contractForm.scheduleRecurring && contractForm.petId
          ? scheduledSessions
              .filter(s => s.date && s.time)
              .map(s => ({
                startsAt: new Date(`${s.date}T${s.time}:00`).toISOString(),
                serviceIds: s.serviceId ? [s.serviceId] : undefined,
              }))
          : [];

      const { data: created } = await api.post('/petshop/packages/contracts', {
        ...contractForm,
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
        toast.success('Pacote contratado e comanda gerada no Caixa (PDV)!', {
          description: 'O cliente pode realizar o pagamento na recepção/caixa.',
        });
      } else {
        toast.success('Pacote contratado e ativado com sucesso!');
      }

      setOpenContractModal(false);
      loadAll(false);
      if (created?.id) {
        setSelectedContract(created);
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
      setSelectedContract(prev => (prev?.id === contractId ? data : prev));
      loadAll(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao confirmar pagamento.');
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
          reason: refundReason,
          operatorId: operator?.id,
          operatorName: operator?.name,
        },
      );
      toast.success('Sessão estornada e devolvida ao saldo do pacote!');
      setSelectedContract(data);
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
      setSelectedContract(data);
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
  const computedFinalContractPrice = Math.max(
    0,
    Number(contractForm.customPrice || 0) + computedTransportFee - Number(contractForm.discountAmount || 0),
  );

  return (
    <div className={pageClass}>
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

          {filteredContracts.length === 0 ? (
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
                {paginatedContracts.map(contract => {
                  const totalSessions = contract.items.reduce((s, i) => s + i.totalQuantity, 0);
                  const usedSessions = contract.items.reduce((s, i) => s + i.usedQuantity, 0);
                  const reservedSessions = contract.items.reduce((s, i) => s + i.reservedQuantity, 0);
                  const availableSessions = contract.items.reduce((s, i) => s + i.availableQuantity, 0);
                  const usedPct =
                    totalSessions > 0
                      ? Math.min(100, Math.round((usedSessions / totalSessions) * 100))
                      : 0;
                  const expired = isContractExpired(contract);
                  const isPendingPayment = contract.paymentStatus === 'pending' && contract.status !== 'cancelled' && !expired;
                  const isLowBalance = contract.status === 'active' && !expired && availableSessions <= 1;

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

                  if (viewMode === 'grid') {
                    return (
                      <div
                        key={contract.id}
                        className="group relative rounded-2xl border border-zinc-200/90 bg-white px-4 py-3.5 shadow-2xs transition hover:border-[#0d6e5a]/40 hover:shadow-sm"
                      >
                        {/* Barra lateral de status */}
                        <span className={`absolute bottom-3 left-0 top-3 w-1 rounded-r-full ${accentBarColor}`} />

                        <div className="flex flex-col gap-3 pl-1 sm:flex-row sm:items-center sm:justify-between">
                          {/* Bloco Esquerdo: Avatar + Nome do Pacote + Badge Táxi + Tutor/Pet */}
                          <div
                            onClick={() => setSelectedContract(contract)}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                          >
                            {contract.pet ? (
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
                                {contract.transport?.enabled && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                    🚐 Táxi Dog (+{money(contract.transport.fee || 0)})
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
                                {contract.pet ? ` · Pet: ${contract.pet.name}` : ' · Todos os pets'}
                              </p>
                            </div>
                          </div>

                          {/* Bloco Central: Progresso de Sessões + Reservadas */}
                          <div
                            onClick={() => setSelectedContract(contract)}
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
                              onClick={() => setSelectedContract(contract)}
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
                                    {money(contract.finalPrice)}
                                  </p>
                                </>
                              ) : isPendingPayment ? (
                                <>
                                  <p className="mt-1 text-[10px] font-bold leading-tight text-amber-700">
                                    Pendente Caixa
                                  </p>
                                  <p className="text-xs font-black tabular-nums leading-tight text-amber-800">
                                    {money(contract.finalPrice)}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="mt-1 text-[10px] font-bold leading-tight text-emerald-700">
                                    Pago
                                  </p>
                                  <p className="text-xs font-black tabular-nums leading-tight text-emerald-800">
                                    {money(contract.finalPrice)}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* Botão de Ações (...) */}
                            <div className="relative" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                aria-label="Ações do contrato"
                                onClick={() => setOpenMenuId(prev => (prev === contract.id ? null : contract.id))}
                                className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800 cursor-pointer"
                              >
                                <MoreHorizontal size={17} />
                              </button>

                              {openMenuId === contract.id && (
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
                                      setSelectedContract(contract);
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
                                      <span>Confirmar Recebimento</span>
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
                      key={contract.id}
                      className="flex flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs transition hover:border-[#0d6e5a]/40"
                    >
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {contract.pet ? (
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
                                {contract.isShared && (
                                  <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                    Compartilhado
                                  </span>
                                )}
                                {contract.transport?.enabled && (
                                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                    🚐 Táxi Dog (+{money(contract.transport.fee || 0)})
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500">
                                Tutor: <strong className="text-zinc-800">{contract.customer?.name}</strong>
                                {contract.pet ? ` · Pet: ${contract.pet.name}` : ' · Todos os pets do tutor'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadge.cls}`}>
                              {statusBadge.label}
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                contract.paymentStatus === 'paid'
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {contract.paymentStatus === 'paid'
                                ? `Pago (${money(contract.finalPrice)})`
                                : `Pendente Caixa (${money(contract.finalPrice)})`}
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
                            {contract.items.map(item => (
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
                            onClick={() => setSelectedContract(contract)}
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
                  Mostrando <strong className="text-zinc-800">{paginatedContracts.length}</strong> de{' '}
                  <strong className="text-zinc-800">{filteredContracts.length}</strong> pacotes
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={15} />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
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
                              safePage === pageNum
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
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Tutor *</label>
                <select
                  required
                  value={contractForm.customerId}
                  onChange={e => {
                    const nextTutorId = e.target.value;
                    const firstPet = pets.find(p => p.customerId === nextTutorId);
                    setContractForm(prev => ({
                      ...prev,
                      customerId: nextTutorId,
                      petId: firstPet?.id || '',
                      species: firstPet?.species || prev.species,
                      size: firstPet?.size || prev.size,
                      coatType: firstPet?.coatType || prev.coatType,
                    }));
                  }}
                  className={inputClass}
                >
                  <option value="">Selecione o tutor...</option>
                  {tutors.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Pet Beneficiado {contractForm.isShared ? '(Opcional - Compartilhado)' : '*'}
                </label>
                <select
                  required={!contractForm.isShared}
                  value={contractForm.petId}
                  onChange={e => {
                    const nextPet = pets.find(p => p.id === e.target.value);
                    setContractForm(prev => ({
                      ...prev,
                      petId: e.target.value,
                      species: nextPet?.species || prev.species,
                      size: nextPet?.size || prev.size,
                      coatType: nextPet?.coatType || prev.coatType,
                    }));
                  }}
                  className={inputClass}
                >
                  <option value="">
                    {contractForm.isShared
                      ? 'Compartilhado entre todos os pets do tutor'
                      : 'Selecione o pet...'}
                  </option>
                  {tutorPets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.breed || p.species})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Plano de Pacote *</label>
              <select
                required
                value={contractForm.packagePlanId}
                onChange={e => {
                  const p = plans.find(pl => pl.id === e.target.value);
                  setContractForm(prev => ({
                    ...prev,
                    packagePlanId: e.target.value,
                    validityDays: p?.validityDays || prev.validityDays,
                    isShared: p?.allowSharedPets ? prev.isShared : false,
                  }));
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

            {/* Características do Pet para Precificação Inteligente */}
            <div className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--pc-text)]">
                  Parâmetros de Porte e Pelagem para Precificação
                </span>
                {priceSimulation?.matchedRule && (
                  <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900">
                    Regra aplicada: {money(priceSimulation.matchedRule.price)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[var(--pc-text-secondary)]">
                    Espécie
                  </label>
                  <select
                    value={contractForm.species}
                    onChange={e => setContractForm({ ...contractForm, species: e.target.value })}
                    className={inputClass}
                  >
                    <option value="dog">Cachorro</option>
                    <option value="cat">Gato</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[var(--pc-text-secondary)]">
                    Porte do Animal
                  </label>
                  <select
                    value={contractForm.size}
                    onChange={e => setContractForm({ ...contractForm, size: e.target.value })}
                    className={inputClass}
                  >
                    <option value="small">Pequeno (P)</option>
                    <option value="medium">Médio (M)</option>
                    <option value="large">Grande (G)</option>
                    <option value="giant">Gigante (GG)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[var(--pc-text-secondary)]">
                    Tipo de Pelagem
                  </label>
                  <select
                    value={contractForm.coatType}
                    onChange={e => setContractForm({ ...contractForm, coatType: e.target.value })}
                    className={inputClass}
                  >
                    <option value="short">Pelo Curto</option>
                    <option value="medium">Pelo Médio</option>
                    <option value="long">Pelo Longo</option>
                    <option value="double">Pelagem Dupla</option>
                  </select>
                </div>
              </div>

              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--pc-text)]">
                <input
                  type="checkbox"
                  checked={contractForm.isShared}
                  onChange={e => setContractForm({ ...contractForm, isShared: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--pc-action)]"
                />
                Permitir uso compartilhado deste pacote entre outros pets deste mesmo tutor
              </label>
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
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-amber-950">
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
                          className={inputClass}
                        >
                          <option value="round_trip">Buscar e Levar (Ida e Volta)</option>
                          <option value="pickup_only">Apenas Buscar (Leva por conta)</option>
                          <option value="dropoff_only">Apenas Levar (Traz por conta)</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-amber-950">
                          Taxa de Transporte no Pacote (R$ - Fixo ou Personalizado)
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
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Linha 2: Rua/Número + Bairro */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
                          className={inputClass}
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
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Linha 3: Ponto de Referência + Observação do Transporte */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                          className={inputClass}
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
                          className={inputClass}
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

            {/* Agendamento Recorrente Semanal com Exceções por Semana */}
            {contractForm.petId && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-950">
                    <input
                      type="checkbox"
                      checked={contractForm.scheduleRecurring}
                      onChange={e =>
                        setContractForm(prev => ({
                          ...prev,
                          scheduleRecurring: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-teal-400 text-teal-700"
                    />
                    <span>📅 Agendar Sessões Automaticamente (Dia e Horário Fixo na Semana)</span>
                  </label>
                  {contractForm.scheduleRecurring && (
                    <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-900">
                      {scheduledSessions.length} sessões programadas
                    </span>
                  )}
                </div>

                {contractForm.scheduleRecurring && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-teal-950">
                          Dia da Semana Fixo Padrão
                        </label>
                        <select
                          value={contractForm.fixedDayOfWeek}
                          onChange={e =>
                            setContractForm({
                              ...contractForm,
                              fixedDayOfWeek: Number(e.target.value),
                            })
                          }
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

                    {scheduledSessions.length > 0 && (
                      <div className="space-y-2 rounded-xl border border-teal-200/80 bg-white p-2.5">
                        {scheduledSessions.map((sess, idx) => {
                          const dObj = sess.date ? new Date(`${sess.date}T12:00:00`) : null;
                          const weekdayLabel =
                            dObj && !Number.isNaN(dObj.getTime())
                              ? new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(dObj)
                              : '';
                          return (
                            <div
                              key={idx}
                              className={`grid grid-cols-1 gap-2 rounded-lg border p-2 text-xs sm:grid-cols-12 sm:items-center ${
                                sess.customEdited
                                  ? 'border-amber-300 bg-amber-50/40'
                                  : 'border-slate-200 bg-slate-50/60'
                              }`}
                            >
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
                                  value={sess.date}
                                  onChange={e => {
                                    const next = [...scheduledSessions];
                                    next[idx] = {
                                      ...next[idx],
                                      date: e.target.value,
                                      customEdited: true,
                                    };
                                    setScheduledSessions(next);
                                  }}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                                />
                              </div>
                              <div className="sm:col-span-3">
                                <input
                                  type="time"
                                  value={sess.time}
                                  onChange={e => {
                                    const next = [...scheduledSessions];
                                    next[idx] = {
                                      ...next[idx],
                                      time: e.target.value,
                                      customEdited: true,
                                    };
                                    setScheduledSessions(next);
                                  }}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Condições Comerciais Snapshot */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Valor Tabelado / Personalizado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={contractForm.customPrice}
                  onChange={e => setContractForm({ ...contractForm, customPrice: e.target.value })}
                  className={inputClass}
                />
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
                <label className={labelClass}>Valor Final do Contrato</label>
                <div className="flex min-h-11 items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-base font-bold text-emerald-900">
                  {money(computedFinalContractPrice)}
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
              {contractForm.billingMode === 'paid' && (
                <div>
                  <label className={labelClass}>Meio de Pagamento</label>
                  <select
                    value={contractForm.paymentMethod}
                    onChange={e =>
                      setContractForm({ ...contractForm, paymentMethod: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="pix">PIX</option>
                    <option value="credito">Cartão de Crédito</option>
                    <option value="debito">Cartão de Débito</option>
                    <option value="dinheiro">Dinheiro</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenContractModal(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button type="submit" disabled={savingContract} className={primaryButton}>
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
          title={`Contrato: ${selectedContract.planNameSnapshot}`}
          onClose={() => {
            setSelectedContract(null);
            setRefundTargetItem(null);
            setShowCancelConfirm(false);
          }}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-3.5 text-xs">
              <div>
                <p className="font-bold text-sm text-[var(--pc-text)]">
                  {selectedContract.customer?.name} ·{' '}
                  {selectedContract.pet?.name || 'Compartilhado entre pets'}
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
                {selectedContract.paymentStatus === 'pending' && (
                  <button
                    type="button"
                    onClick={() => handleConfirmPayment(selectedContract.id)}
                    className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 size={12} /> Confirmar Recebimento
                  </button>
                )}
              </div>
            </div>

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
                          {dateTime(ev.createdAt)}
                        </p>
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
