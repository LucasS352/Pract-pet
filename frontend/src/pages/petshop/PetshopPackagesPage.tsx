import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  History,
  Layers,
  PackageCheck,
  PawPrint,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Users,
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
  SearchField,
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

  // Filtros de contratos
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

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
  });

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

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTutor = c.customer?.name?.toLowerCase().includes(q);
        const matchPet = c.pet?.name?.toLowerCase().includes(q);
        const matchPlan = c.planNameSnapshot?.toLowerCase().includes(q);
        if (!matchTutor && !matchPet && !matchPlan) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, search]);

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
    });
    setOpenContractModal(true);
  };

  const handleSubmitContract = async (e: FormEvent) => {
    e.preventDefault();
    setSavingContract(true);
    try {
      const { data: created } = await api.post('/petshop/packages/contracts', {
        ...contractForm,
        customPrice: Number(contractForm.customPrice || 0),
        discountAmount: Number(contractForm.discountAmount || 0),
        validityDays: Number(contractForm.validityDays || 30),
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
      setSelectedContract(data);
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

  const computedFinalContractPrice = Math.max(
    0,
    Number(contractForm.customPrice || 0) - Number(contractForm.discountAmount || 0),
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

      {/* Cards Executivos de Gestão Financeira & Operacional de Pacotes */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--pc-border)] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--pc-text-muted)]">
              Faturamento de Pacotes Pagos
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <DollarSign size={18} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--pc-text)]">
            {money(financialOverview?.totals?.totalSoldPaid || 0)}
          </p>
          <p className="mt-1 text-xs text-[var(--pc-text-secondary)]">
            {financialOverview?.totals?.activeContractsCount || 0} contratos ativos em andamento
          </p>
        </div>

        <div className="rounded-xl border border-[var(--pc-border)] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--pc-text-muted)]">
              Saldo de Sessões a Realizar
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <PackageCheck size={18} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--pc-text)]">
            {financialOverview?.totals?.totalSessionsAvailable || 0}{' '}
            <span className="text-sm font-medium text-[var(--pc-text-secondary)]">
              disponíveis
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--pc-text-secondary)]">
            {financialOverview?.totals?.totalSessionsReserved || 0} reservadas na agenda ·{' '}
            {financialOverview?.totals?.totalSessionsUsed || 0} já concluídas
          </p>
        </div>

        <div className="rounded-xl border border-[var(--pc-border)] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--pc-text-muted)]">
              Receita Apropriada (Realizada)
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-700">
              <TrendingUp size={18} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--pc-text)]">
            {money(financialOverview?.totals?.recognizedRevenue || 0)}
          </p>
          <p className="mt-1 text-xs text-[var(--pc-text-secondary)]">
            A realizar: {money(financialOverview?.totals?.deferredRevenue || 0)}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              Oportunidades de Renovação
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-100 text-amber-800">
              <RefreshCw size={18} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-950">
            {financialOverview?.renewalOpportunities?.length || 0}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Pacotes na última sessão ou vencendo em até 7 dias
          </p>
        </div>
      </div>

      {/* Navegação de Abas */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pc-border)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('contracts')}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'contracts'
                ? 'bg-[var(--pc-text)] text-white shadow-xs'
                : 'bg-white text-[var(--pc-text-secondary)] hover:bg-[var(--pc-surface-subtle)]'
            }`}
          >
            <PackageCheck size={16} />
            Contratos & Saldos ({contracts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'catalog'
                ? 'bg-[var(--pc-text)] text-white shadow-xs'
                : 'bg-white text-[var(--pc-text-secondary)] hover:bg-[var(--pc-surface-subtle)]'
            }`}
          >
            <Layers size={16} />
            Catálogo de Planos & Preços ({plans.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('renewals')}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'renewals'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-[var(--pc-text-secondary)] hover:bg-[var(--pc-surface-subtle)]'
            }`}
          >
            <AlertTriangle size={16} />
            Fila de Renovação ({financialOverview?.renewalOpportunities?.length || 0})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--pc-border)] bg-white">
          <ListSkeleton rows={5} />
        </div>
      ) : activeTab === 'contracts' ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--pc-border)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-md">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Buscar por tutor, pet ou nome do pacote..."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'active', label: 'Ativos' },
                { key: 'completed', label: 'Concluídos' },
                { key: 'expired', label: 'Vencidos' },
                { key: 'cancelled', label: 'Cancelados' },
                { key: 'all', label: 'Todos' },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === tab.key
                      ? 'bg-[var(--pc-action)] text-white'
                      : 'border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] text-[var(--pc-text-secondary)] hover:bg-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredContracts.length === 0 ? (
            <div className="rounded-xl border border-[var(--pc-border)] bg-white">
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filteredContracts.map(contract => {
                const totalSessions = contract.items.reduce((s, i) => s + i.totalQuantity, 0);
                const usedSessions = contract.items.reduce((s, i) => s + i.usedQuantity, 0);
                const reservedSessions = contract.items.reduce((s, i) => s + i.reservedQuantity, 0);
                const availableSessions = contract.items.reduce((s, i) => s + i.availableQuantity, 0);
                const progressPct =
                  totalSessions > 0
                    ? Math.min(100, Math.round(((usedSessions + reservedSessions) / totalSessions) * 100))
                    : 0;
                const isLowBalance = contract.status === 'active' && availableSessions <= 1;

                return (
                  <div
                    key={contract.id}
                    className="flex flex-col justify-between rounded-xl border border-[var(--pc-border)] bg-white p-5 shadow-2xs transition hover:border-[var(--pc-border-strong)]"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
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
                              <h3 className="text-base font-bold text-[var(--pc-text)]">
                                {contract.planNameSnapshot}
                              </h3>
                              {contract.isShared && (
                                <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                  Compartilhado
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--pc-text-secondary)]">
                              Tutor: <strong className="text-[var(--pc-text)]">{contract.customer?.name}</strong>
                              {contract.pet ? ` · Pet: ${contract.pet.name}` : ' · Todos os pets do tutor'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              contract.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : contract.status === 'completed'
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {contract.status === 'active'
                              ? 'Ativo'
                              : contract.status === 'completed'
                                ? 'Concluído'
                                : contract.status === 'expired'
                                  ? 'Expirado'
                                  : 'Cancelado'}
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
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

                      {/* Barra Visual de Saldo de Sessões */}
                      <div className="mt-4 rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-3.5">
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-semibold text-[var(--pc-text)]">
                            Saldo Disponível: {availableSessions} de {totalSessions} sessões
                          </span>
                          <span className="text-[var(--pc-text-secondary)]">
                            {usedSessions} usadas · {reservedSessions} agendadas
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isLowBalance ? 'bg-amber-500' : 'bg-[var(--pc-action)]'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>

                        <div className="mt-3 space-y-1.5">
                          {contract.items.map(item => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs border border-[var(--pc-border)]"
                            >
                              <span className="font-medium text-[var(--pc-text)]">
                                {item.serviceNameSnapshot}
                              </span>
                              <div className="flex items-center gap-2">
                                {item.reservedQuantity > 0 && (
                                  <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                                    {item.reservedQuantity} reservada(s)
                                  </span>
                                )}
                                <span className="font-semibold text-[var(--pc-action)]">
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

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--pc-border)] pt-3 text-xs text-[var(--pc-text-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={13} />
                        Válido até {new Date(contract.expiresAt).toLocaleDateString('pt-BR')}
                      </span>

                      <div className="flex items-center gap-2">
                        {contract.status === 'active' && availableSessions > 0 && (
                          <button
                            type="button"
                            onClick={() => navigate('/petshop/agenda?new=1')}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-800 transition hover:bg-teal-100"
                          >
                            Agendar Sessão
                            <ArrowRight size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedContract(contract)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--pc-border-strong)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--pc-text)] transition hover:bg-[var(--pc-surface-subtle)]"
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
                      onClick={() => {
                        setContractForm(prev => ({
                          ...prev,
                          customerId: op.customer?.id || '',
                          petId: op.pet?.id || '',
                        }));
                        setOpenContractModal(true);
                      }}
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
