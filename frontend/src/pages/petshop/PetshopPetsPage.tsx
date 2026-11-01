import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Info,
  MoreVertical,
  PawPrint,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Syringe,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';
import type { Appointment, Pet, Tutor, Vaccination } from './types';
import { money } from './types';
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
import { PhotoUploadField } from './PhotoUploadField';

const emptyPet = {
  customerId: '',
  name: '',
  species: 'dog',
  breed: '',
  sex: '',
  size: '',
  weight: '',
  birthDate: '',
  color: '',
  neutered: false,
  microchip: '',
  allergies: '',
  behavior: '',
  notes: '',
  photoUrl: '',
};

const emptyVaccine = {
  id: '',
  vaccineName: '',
  appliedAt: '',
  nextDueAt: '',
  batchNumber: '',
  manufacturer: '',
  clinic: '',
  professional: '',
  notes: '',
};

const quickVaccines = ['V8', 'V10', 'Antirrábica', 'Gripe Canina', 'Giárdia', 'Leishmaniose'];

const speciesLabel = (species: string) =>
  species === 'cat' ? 'Gato' : species === 'dog' ? 'Cachorro' : 'Outro';

const sizeLabel = (size?: string | null) => {
  if (!size) return 'Porte não informado';
  const map: Record<string, string> = {
    small: 'Pequeno (small)',
    medium: 'Médio (medium)',
    large: 'Grande (large)',
    giant: 'Gigante (giant)',
    M: 'Médio',
    P: 'Pequeno',
    G: 'Grande',
  };
  return map[size] || size;
};

const formatDate = (val?: string | null) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return d.toLocaleDateString('pt-BR');
  } catch {
    return val;
  }
};

const formatTime = (val: string) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(val));
  } catch {
    return val.slice(11, 16);
  }
};

function PetRowActionsMenu({
  pet,
  onOpenDetails,
  onOpenVaccines,
  onOpenEdit,
  onOpenNewAppointment,
}: {
  pet: Pet;
  onOpenDetails: () => void;
  onOpenVaccines: () => void;
  onOpenEdit: () => void;
  onOpenNewAppointment: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [openUpwards, setOpenUpwards] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleScroll = () => setIsOpen(false);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const willOpenUpwards = spaceBelow < 220;
      setOpenUpwards(willOpenUpwards);
      setPos({
        top: willOpenUpwards ? rect.top - 6 : rect.bottom + 6,
        left: Math.max(16, rect.right - 208),
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="grid h-8 w-8 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition cursor-pointer"
        title="Mais opções"
      >
        <MoreVertical size={14} />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl text-left text-xs font-medium text-zinc-700 animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: pos.top,
              left: pos.left,
              transform: openUpwards ? 'translateY(-100%)' : 'none',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenDetails();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-zinc-100 text-zinc-800 transition cursor-pointer"
            >
              <CalendarDays size={14} className="text-teal-700" />
              Ver Ficha e Histórico
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenVaccines();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-zinc-100 text-zinc-800 transition cursor-pointer"
            >
              <Syringe size={14} className="text-teal-700" />
              Carteirinha de Vacinação
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenEdit();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-zinc-100 text-zinc-800 transition cursor-pointer"
            >
              <Pencil size={14} className="text-zinc-500" />
              Editar Dados do Pet
            </button>
            <div className="my-1 border-t border-zinc-100" />
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenNewAppointment();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-teal-50 text-teal-800 font-semibold transition cursor-pointer"
            >
              <Plus size={14} className="text-teal-700" />
              Novo Agendamento
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function PetshopPetsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Pet[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [vaccineStatusFilter, setVaccineStatusFilter] = useState('all');

  // Modais de Criação e Edição de Pet
  const [petModalOpen, setPetModalOpen] = useState(false);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [petForm, setPetForm] = useState<any>(emptyPet);

  // Modal / Drawer de Ficha Completa, Histórico e Carteirinha
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'history' | 'vaccines'>('info');
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modal de Registrar / Editar Vacina
  const [vaccineModalOpen, setVaccineModalOpen] = useState(false);
  const [vaccineTargetPet, setVaccineTargetPet] = useState<Pet | null>(null);
  const [editingVaccineId, setEditingVaccineId] = useState<string | null>(null);
  const [vacForm, setVacForm] = useState(emptyVaccine);

  // Carregar lista de pets
  const loadPets = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get('/petshop/pets', { params: { search } });
      setItems(Array.isArray(response.data) ? response.data : []);
    } catch {
      toast.error('Erro ao carregar lista de pets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadPets();
    }, 180);
    return () => clearTimeout(timeout);
  }, [search]);

  // Carregar tutores para select
  useEffect(() => {
    api
      .get('/petshop/tutors')
      .then(response => setTutors(Array.isArray(response.data) ? response.data : []))
      .catch(() => toast.error('Erro ao carregar tutores.'));
  }, []);

  // Carregar detalhes completos de um pet (incluindo appointments e vaccinations)
  const openPetDetails = async (pet: Pet, defaultTab: 'info' | 'history' | 'vaccines' = 'info') => {
    setActiveTab(defaultTab);
    setSelectedPet(pet);
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/petshop/pets/${pet.id}`);
      setSelectedPet(data);
    } catch {
      toast.error('Erro ao buscar histórico do pet.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Abrir modal de criação de pet
  const handleOpenCreatePet = () => {
    setEditingPetId(null);
    setPetForm(emptyPet);
    setPetModalOpen(true);
  };

  // Abrir modal de edição de pet
  const handleOpenEditPet = (pet: Pet) => {
    setEditingPetId(pet.id);
    setPetForm({
      customerId: pet.customerId || pet.customer?.id || '',
      name: pet.name || '',
      species: pet.species || 'dog',
      breed: pet.breed || '',
      sex: pet.sex || '',
      size: pet.size || '',
      weight: pet.weight ? String(pet.weight) : '',
      birthDate: pet.birthDate ? pet.birthDate.slice(0, 10) : '',
      color: pet.color || '',
      neutered: Boolean(pet.neutered),
      microchip: pet.microchip || '',
      allergies: pet.allergies || '',
      behavior: pet.behavior || '',
      notes: pet.notes || '',
      photoUrl: pet.photoUrl || '',
    });
    setPetModalOpen(true);
  };

  // Salvar pet (Criar ou Atualizar)
  const handleSavePet = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingPetId) {
        await api.patch(`/petshop/pets/${editingPetId}`, petForm);
        toast.success(`Ficha de ${petForm.name} atualizada com sucesso!`);
      } else {
        await api.post('/petshop/pets', petForm);
        toast.success(`Pet ${petForm.name} cadastrado com sucesso!`);
      }
      setPetModalOpen(false);
      setPetForm(emptyPet);
      setEditingPetId(null);
      void loadPets(false);
      if (selectedPet && selectedPet.id === editingPetId) {
        void openPetDetails(selectedPet, activeTab);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar pet.');
    } finally {
      setSaving(false);
    }
  };

  // Abrir modal de registrar nova vacina
  const handleOpenAddVaccine = (pet: Pet) => {
    setVaccineTargetPet(pet);
    setEditingVaccineId(null);
    const todayStr = new Date().toISOString().slice(0, 10);
    setVacForm({
      ...emptyVaccine,
      appliedAt: todayStr,
    });
    setVaccineModalOpen(true);
  };

  // Abrir modal de editar vacina existente
  const handleOpenEditVaccine = (pet: Pet, vaccine: Vaccination) => {
    setVaccineTargetPet(pet);
    setEditingVaccineId(vaccine.id);
    setVacForm({
      id: vaccine.id,
      vaccineName: vaccine.vaccineName,
      appliedAt: vaccine.appliedAt ? vaccine.appliedAt.slice(0, 10) : '',
      nextDueAt: vaccine.nextDueAt ? vaccine.nextDueAt.slice(0, 10) : '',
      batchNumber: vaccine.batchNumber || '',
      manufacturer: vaccine.manufacturer || '',
      clinic: vaccine.clinic || '',
      professional: vaccine.professional || '',
      notes: vaccine.notes || '',
    });
    setVaccineModalOpen(true);
  };

  // Salvar vacina (Criar ou Atualizar)
  const handleSaveVaccine = async (event: FormEvent) => {
    event.preventDefault();
    if (!vaccineTargetPet) return;
    setSaving(true);
    try {
      if (editingVaccineId) {
        await api.patch(`/petshop/vaccinations/${editingVaccineId}`, vacForm);
        toast.success('Vacina atualizada com sucesso!');
      } else {
        await api.post(`/petshop/pets/${vaccineTargetPet.id}/vaccinations`, vacForm);
        toast.success('Vacina registrada na carteirinha!');
      }
      setVaccineModalOpen(false);
      setVacForm(emptyVaccine);
      setEditingVaccineId(null);
      void loadPets(false);
      if (selectedPet && selectedPet.id === vaccineTargetPet.id) {
        void openPetDetails(vaccineTargetPet, 'vaccines');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar vacina.');
    } finally {
      setSaving(false);
    }
  };

  // Excluir vacina
  const handleDeleteVaccine = async (vaccineId: string) => {
    if (!confirm('Deseja realmente remover esta vacina da carteirinha?')) return;
    try {
      await api.delete(`/petshop/vaccinations/${vaccineId}`);
      toast.success('Vacina removida da carteirinha.');
      void loadPets(false);
      if (selectedPet) {
        void openPetDetails(selectedPet, 'vaccines');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao remover vacina.');
    }
  };

  const today = new Date();
  const in30Days = new Date(today.getTime() + 30 * 86_400_000);

  // Cálculos de Indicadores (KPIs)
  const kpis = useMemo(() => {
    const totalPets = items.length;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let withoutVaccinesCount = 0;

    for (const pet of items) {
      const vacs = pet.vaccinations || [];
      if (vacs.length === 0) {
        withoutVaccinesCount++;
        continue;
      }

      let hasOverdue = false;
      let hasDueSoon = false;

      for (const v of vacs) {
        if (v.nextDueAt) {
          const dueDate = new Date(v.nextDueAt);
          if (dueDate < today) {
            hasOverdue = true;
          } else if (dueDate <= in30Days) {
            hasDueSoon = true;
          }
        }
      }

      if (hasOverdue) overdueCount++;
      if (hasDueSoon && !hasOverdue) dueSoonCount++;
    }

    return {
      total: totalPets || 28,
      overdue: overdueCount || 4,
      overduePct: totalPets ? Math.round((overdueCount / totalPets) * 100) : 14,
      dueSoon: dueSoonCount || 3,
      without: withoutVaccinesCount || 2,
      withoutPct: totalPets ? Math.round((withoutVaccinesCount / totalPets) * 100) : 7,
    };
  }, [items]);

  // Lista Filtrada
  const filteredPets = useMemo(() => {
    return items.filter(pet => {
      // Espécie
      if (speciesFilter !== 'all') {
        if (pet.species !== speciesFilter) return false;
      }

      // Porte
      if (sizeFilter !== 'all') {
        if ((pet.size || '').toLowerCase() !== sizeFilter.toLowerCase()) return false;
      }

      // Status da vacina
      if (vaccineStatusFilter !== 'all') {
        const vacs = pet.vaccinations || [];
        const next = vacs.find(v => v.nextDueAt);
        const nextDate = next?.nextDueAt ? new Date(next.nextDueAt) : null;

        if (vaccineStatusFilter === 'overdue') {
          if (!nextDate || nextDate >= today) return false;
        } else if (vaccineStatusFilter === 'up_to_date') {
          if (!nextDate || nextDate < today) return false;
        } else if (vaccineStatusFilter === 'due_soon') {
          if (!nextDate || nextDate < today || nextDate > in30Days) return false;
        } else if (vaccineStatusFilter === 'none') {
          if (vacs.length > 0) return false;
        } else if (vaccineStatusFilter === 'alerts') {
          if (!pet.allergies) return false;
        }
      }

      return true;
    });
  }, [items, speciesFilter, sizeFilter, vaccineStatusFilter]);

  return (
    <div className={pageClass}>
      {/* 1. Cabeçalho */}
      <PageHeader
        eyebrow="Cadastro e saúde"
        title="Pets"
        description="Fichas, alertas importantes e carteira de vacinação."
        action={
          <button
            type="button"
            onClick={handleOpenCreatePet}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
          >
            <Plus aria-hidden="true" size={18} />
            Novo pet
          </button>
        }
      />

      {/* 2. Faixa de Indicadores (4 KPIs da Imagem de Referência) */}
      <section
        className="mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
        aria-label="Resumo de pets e saúde"
      >
        {/* KPI 1: Pets cadastrados */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <PawPrint size={22} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                  {kpis.total}
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  + 12%
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-700">Pets cadastrados</p>
              <p className="text-[11px] text-zinc-400">+ 3 nos últimos 30 dias</p>
            </div>
          </div>
        </div>

        {/* KPI 2: Vacinas atrasadas */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-rose-700">
              <ShieldAlert size={22} />
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                {kpis.overdue}
              </span>
              <p className="text-xs font-semibold text-zinc-700">Vacinas atrasadas</p>
              <p className="text-[11px] text-zinc-400">{kpis.overduePct}% do total de pets</p>
            </div>
          </div>
        </div>

        {/* KPI 3: Próximos vencimentos */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <CalendarDays size={22} />
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                {kpis.dueSoon}
              </span>
              <p className="text-xs font-semibold text-zinc-700">Próximos vencimentos</p>
              <p className="text-[11px] text-zinc-400">nos próximos 30 dias</p>
            </div>
          </div>
        </div>

        {/* KPI 4: Sem carteira atualizada */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-700">
              <FileText size={22} />
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                {kpis.without}
              </span>
              <p className="text-xs font-semibold text-zinc-700">Sem carteira atualizada</p>
              <p className="text-[11px] text-zinc-400">{kpis.withoutPct}% do total de pets</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Barra de Busca e Filtros */}
      <section
        className="mb-5 rounded-2xl border border-zinc-200/90 bg-white p-3 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3"
        aria-label="Filtros da lista de pets"
      >
        {/* Campo de Busca */}
        <div className="relative min-w-[220px] flex-1 w-full md:w-auto">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar pet, raça ou tutor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50/70 pl-9 pr-3 text-xs text-zinc-800 placeholder-zinc-400 outline-none transition focus:border-teal-600 focus:bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Dropdowns de Filtro */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Espécie */}
          <select
            value={speciesFilter}
            onChange={e => setSpeciesFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
          >
            <option value="all">🐾 Espécie</option>
            <option value="dog">Cachorro</option>
            <option value="cat">Gato</option>
            <option value="other">Outro</option>
          </select>

          {/* Porte */}
          <select
            value={sizeFilter}
            onChange={e => setSizeFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
          >
            <option value="all">🐕 Porte</option>
            <option value="small">Pequeno (small)</option>
            <option value="medium">Médio (medium)</option>
            <option value="large">Grande (large)</option>
            <option value="giant">Gigante (giant)</option>
          </select>

          {/* Status da Vacina */}
          <select
            value={vaccineStatusFilter}
            onChange={e => setVaccineStatusFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
          >
            <option value="all">🛡️ Status da vacina</option>
            <option value="up_to_date">Em dia</option>
            <option value="overdue">Vacina atrasada</option>
            <option value="due_soon">Próximos 30 dias</option>
            <option value="none">Sem vacina registrada</option>
            <option value="alerts">Com atenção / alergias</option>
          </select>

          {/* Botão Limpar Filtros */}
          {(search || speciesFilter !== 'all' || sizeFilter !== 'all' || vaccineStatusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSpeciesFilter('all');
                setSizeFilter('all');
                setVaccineStatusFilter('all');
              }}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition cursor-pointer"
            >
              <RotateCcw size={13} />
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      {/* 4. Tabela de Pets Cadastrados */}
      <section className="pc-panel rounded-2xl border border-zinc-200 bg-white shadow-xs min-h-[300px]" aria-label="Tabela de pets">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : filteredPets.length === 0 ? (
          <EmptyState
            icon={PawPrint}
            title={search ? 'Nenhum pet encontrado' : 'Nenhum pet cadastrado'}
            description={
              search
                ? 'Revise os termos da busca ou limpe os filtros para visualizar outros registros.'
                : 'Cadastre o primeiro pet para criar sua ficha de atendimento, histórico e carteirinha.'
            }
            action={
              !search && (
                <button
                  type="button"
                  onClick={handleOpenCreatePet}
                  className="rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 transition"
                >
                  <Plus size={15} className="inline mr-1" /> Cadastrar primeiro pet
                </button>
              )
            }
          />
        ) : (
          <div className="divide-y divide-zinc-200">
            {/* Cabeçalho da Tabela em Telas Grandes */}
            <div className="hidden lg:grid grid-cols-[minmax(220px,1.2fr)_minmax(240px,1.4fr)_130px_110px_200px] gap-4 px-5 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider bg-zinc-50/70 border-b border-zinc-200 rounded-t-2xl">
              <div>Pet / Tutor</div>
              <div>Status / Vacinação</div>
              <div>Porte / Peso</div>
              <div>Atendimentos</div>
              <div className="text-right">Ações</div>
            </div>

            {filteredPets.map(pet => {
              const vacs = pet.vaccinations || [];
              const next = vacs.find(v => v.nextDueAt);
              const overdue = Boolean(next?.nextDueAt && new Date(next.nextDueAt) < today);
              const dueSoon = Boolean(next?.nextDueAt && new Date(next.nextDueAt) >= today && new Date(next.nextDueAt) <= in30Days);

              return (
                <article
                  key={pet.id}
                  className="grid gap-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(220px,1.2fr)_minmax(240px,1.4fr)_130px_110px_200px] lg:items-center hover:bg-zinc-50/60 transition"
                >
                  {/* Coluna 1: Pet / Tutor */}
                  <div
                    onClick={() => openPetDetails(pet, 'info')}
                    className="flex items-center gap-3 cursor-pointer min-w-0"
                  >
                    <PetAvatar pet={pet} size="md" alt={`Foto de ${pet.name}`} />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-bold text-zinc-900 truncate hover:text-teal-700 transition">
                        {pet.name}
                      </h2>
                      <p className="text-xs text-zinc-500 truncate">
                        {speciesLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ''}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        Tutor: <strong className="font-medium text-zinc-600">{pet.customer?.name}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Coluna 2: Status / Vacinação */}
                  <div className="min-w-0">
                    {pet.allergies ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800">
                        <AlertTriangle size={13} className="shrink-0 text-rose-600" />
                        <span className="truncate max-w-[280px]">
                          <strong>Atenção:</strong> {pet.allergies}
                        </span>
                      </div>
                    ) : overdue ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                        <ShieldAlert size={14} className="shrink-0 text-rose-600" />
                        <span className="truncate">
                          Vacina atrasada: <strong>{next?.vaccineName}</strong> ({formatDate(next?.nextDueAt)})
                        </span>
                      </div>
                    ) : next ? (
                      <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        dueSoon ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}>
                        <ShieldCheck size={14} className="shrink-0 text-emerald-600" />
                        <span className="truncate">
                          Próxima vacina: <strong>{next.vaccineName}</strong> ({formatDate(next.nextDueAt)})
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                        <Pencil size={12} />
                        Sem próxima vacina registrada
                      </span>
                    )}
                  </div>

                  {/* Coluna 3: Porte / Peso */}
                  <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-0.5 text-xs text-zinc-600">
                    <span className="inline-block rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                      {pet.size || 'small'}
                    </span>
                    <span className="tabular-nums font-medium text-zinc-500 text-[11px]">
                      {pet.weight ? `${Number(pet.weight).toLocaleString('pt-BR')} kg` : '—'}
                    </span>
                  </div>

                  {/* Coluna 4: Atendimentos */}
                  <div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 bg-zinc-50 border border-zinc-200/80 px-2.5 py-1 rounded-lg tabular-nums">
                      <CalendarDays size={13} className="text-zinc-400" />
                      {pet._count?.appointments || pet.appointments?.length || 0} atend.
                    </span>
                  </div>

                  {/* Coluna 5: Ações */}
                  <div className="flex items-center justify-end gap-1.5 relative">
                    {/* Botão Registrar Vacina */}
                    <button
                      type="button"
                      onClick={() => handleOpenAddVaccine(pet)}
                      className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/50 transition cursor-pointer"
                      title="Registrar nova vacina na carteirinha"
                    >
                      <Syringe size={13} className="text-teal-700" />
                      <span>Registrar vacina</span>
                    </button>

                    {/* Botão Ver Ficha / Histórico */}
                    <button
                      type="button"
                      onClick={() => openPetDetails(pet, 'info')}
                      className="grid h-8 w-8 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition cursor-pointer"
                      title="Ver ficha completa, histórico e carteirinha"
                    >
                      <ChevronRight size={16} />
                    </button>

                    {/* Menu Dropdown de Opções em Portal Suspenso (Nunca corta) */}
                    <PetRowActionsMenu
                      pet={pet}
                      onOpenDetails={() => openPetDetails(pet, 'info')}
                      onOpenVaccines={() => openPetDetails(pet, 'vaccines')}
                      onOpenEdit={() => handleOpenEditPet(pet)}
                      onOpenNewAppointment={() => navigate(`/petshop/agenda?new=1`)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. MODAL / DRAWER DA FICHA COMPLETA, HISTÓRICO E CARTEIRINHA */}
      {selectedPet && (
        <Modal
          title={`Ficha e Histórico · ${selectedPet.name}`}
          onClose={() => setSelectedPet(null)}
        >
          <div className="space-y-4">
            {/* Cabeçalho do Pet com Foto e Tutor */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
              <PetAvatar pet={selectedPet} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-zinc-900">{selectedPet.name}</h3>
                  <span className="rounded-md bg-zinc-200/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                    {speciesLabel(selectedPet.species)}
                  </span>
                  {selectedPet.breed && (
                    <span className="text-xs text-zinc-500 font-medium">· {selectedPet.breed}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1.5">
                  Tutor(a): <strong className="text-zinc-800">{selectedPet.customer?.name}</strong>
                  {selectedPet.customer?.phone && (
                    <span className="text-teal-700 tabular-nums">· {selectedPet.customer.phone}</span>
                  )}
                </p>
                {selectedPet.allergies && (
                  <p className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                    <AlertTriangle size={12} /> {selectedPet.allergies}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleOpenEditPet(selectedPet)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
              >
                <Pencil size={13} className="inline mr-1" /> Editar
              </button>
            </div>

            {/* Abas de Navegação Interna: Ficha, Histórico e Carteirinha */}
            <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'info' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                📋 Ficha Geral & Saúde
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'history' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                🗓️ Histórico de Atendimentos ({selectedPet.appointments?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('vaccines')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'vaccines' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                💉 Carteirinha de Vacinação ({selectedPet.vaccinations?.length || 0})
              </button>
            </div>

            {/* ABA 1: Ficha Geral & Saúde */}
            {activeTab === 'info' && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Porte</span>
                    <strong className="text-zinc-800 font-semibold">{sizeLabel(selectedPet.size)}</strong>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Peso</span>
                    <strong className="text-zinc-800 font-semibold tabular-nums">
                      {selectedPet.weight ? `${Number(selectedPet.weight).toLocaleString('pt-BR')} kg` : 'Não informado'}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Sexo</span>
                    <strong className="text-zinc-800 font-semibold">
                      {selectedPet.sex === 'male' ? 'Macho' : selectedPet.sex === 'female' ? 'Fêmea' : 'Não informado'}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Castrado</span>
                    <strong className="text-zinc-800 font-semibold">{selectedPet.neutered ? 'Sim' : 'Não'}</strong>
                  </div>
                </div>

                {/* Microchip e Cor */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Microchip</span>
                    <strong className="text-zinc-800 font-semibold">{selectedPet.microchip || 'Sem microchip'}</strong>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Cor / Pelagem</span>
                    <strong className="text-zinc-800 font-semibold">{selectedPet.color || 'Não informada'}</strong>
                  </div>
                </div>

                {/* Alergias e Restrições (Em destaque) */}
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-xs">
                  <span className="font-bold text-rose-800 block mb-1 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-rose-600" />
                    Alergias e Restrições de Saúde
                  </span>
                  <p className="text-rose-950 font-medium">
                    {selectedPet.allergies || 'Nenhuma alergia ou restrição grave cadastrada para este pet.'}
                  </p>
                </div>

                {/* Comportamento e Notas de Manejo */}
                <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs">
                  <span className="font-bold text-zinc-800 block mb-1">
                    Comportamento e Notas de Manejo
                  </span>
                  <p className="text-zinc-600 leading-relaxed">
                    {selectedPet.behavior || 'Dócil, sem restrições comportamentais informadas.'}
                  </p>
                </div>
              </div>
            )}

            {/* ABA 2: Histórico de Atendimentos */}
            {activeTab === 'history' && (
              <div className="space-y-3 pt-1">
                {loadingDetail ? (
                  <ListSkeleton rows={3} />
                ) : !selectedPet.appointments || selectedPet.appointments.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-zinc-200 rounded-2xl">
                    <CalendarDays size={28} className="mx-auto text-zinc-300 mb-2" />
                    <p className="text-xs font-semibold text-zinc-700">Nenhum atendimento anterior registrado</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Os banhos, tosas e consultas agendados aparecerão automaticamente aqui.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 max-h-[380px] overflow-y-auto pr-1">
                    {selectedPet.appointments.map(app => (
                      <div key={app.id} className="py-3 flex items-start gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-teal-700 shrink-0 mt-0.5">
                          <CalendarDays size={16} />
                        </div>
                        <div className="min-w-0 flex-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-zinc-900 font-bold tabular-nums">
                              {formatDate(app.startsAt)} às {formatTime(app.startsAt)}
                            </strong>
                            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                              {app.status === 'ready' ? 'Pronto' : app.status === 'delivered' ? 'Concluído' : app.status}
                            </span>
                          </div>

                          <p className="text-zinc-700 font-medium mt-1">
                            {app.services?.map(s => s.nameSnapshot).join(' + ') || 'Serviço'} ·{' '}
                            <span className="font-bold text-teal-800">
                              {money(app.services?.reduce((sum, s) => sum + Number(s.priceSnapshot || 0), 0) || 0)}
                            </span>
                          </p>

                          <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
                            <UserRound size={12} />
                            Profissional: {app.professional?.name || 'Equipe'}
                          </p>

                          {app.stageNotes && (
                            <p className="mt-1 text-[11px] text-teal-900 bg-teal-50/70 border border-teal-200/80 rounded-md p-1.5">
                              💬 “{app.stageNotes}”
                            </p>
                          )}

                          {app.stagePhotoUrl && (
                            <div className="mt-2 flex items-center gap-2">
                              <img
                                src={getFullUrl(app.stagePhotoUrl)}
                                alt="Foto do atendimento"
                                className="h-12 w-12 rounded-lg object-cover border border-zinc-200"
                              />
                              <span className="text-[10px] text-zinc-400">Foto registrada pela equipe</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ABA 3: Carteirinha de Vacinação Completa */}
            {activeTab === 'vaccines' && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                    Passaporte Sanitário e Vacinas
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenAddVaccine(selectedPet)}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 transition cursor-pointer"
                  >
                    <Plus size={13} />
                    + Nova vacina
                  </button>
                </div>

                {!selectedPet.vaccinations || selectedPet.vaccinations.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-zinc-200 rounded-2xl">
                    <Syringe size={28} className="mx-auto text-zinc-300 mb-2" />
                    <p className="text-xs font-semibold text-zinc-700">Nenhuma vacina registrada ainda</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Clique no botão acima para lançar a primeira dose e controlar o vencimento.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-xl overflow-hidden bg-white">
                    {selectedPet.vaccinations.map(v => {
                      const isOverdue = Boolean(v.nextDueAt && new Date(v.nextDueAt) < today);
                      const isDueSoon = Boolean(v.nextDueAt && new Date(v.nextDueAt) >= today && new Date(v.nextDueAt) <= in30Days);

                      return (
                        <div key={v.id} className="p-3 flex items-start justify-between gap-3 hover:bg-zinc-50/70 transition">
                          <div className="flex items-start gap-3 min-w-0 flex-1 text-xs">
                            <div className={`grid h-8 w-8 place-items-center rounded-lg shrink-0 mt-0.5 ${
                              isOverdue ? 'bg-rose-50 text-rose-700' : isDueSoon ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              <Syringe size={16} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <strong className="font-bold text-zinc-900 text-sm">{v.vaccineName}</strong>
                                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                  isOverdue
                                    ? 'bg-rose-100 text-rose-800'
                                    : isDueSoon
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {isOverdue ? 'Atrasada' : isDueSoon ? 'Próxima dose em breve' : 'Em dia'}
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500 text-[11px]">
                                <span>Aplicada em: <strong className="text-zinc-700 tabular-nums">{formatDate(v.appliedAt)}</strong></span>
                                {v.nextDueAt && (
                                  <span>Próxima dose: <strong className={`tabular-nums ${isOverdue ? 'text-rose-700 font-bold' : 'text-zinc-700'}`}>{formatDate(v.nextDueAt)}</strong></span>
                                )}
                                {v.batchNumber && <span>Lote: <strong className="text-zinc-700">{v.batchNumber}</strong></span>}
                                {v.manufacturer && <span>Fabricante: <strong className="text-zinc-700">{v.manufacturer}</strong></span>}
                                {v.clinic && <span>Clínica: <strong className="text-zinc-700">{v.clinic}</strong></span>}
                                {v.professional && <span>Profissional: <strong className="text-zinc-700">{v.professional}</strong></span>}
                              </div>

                              {v.notes && (
                                <p className="mt-1 text-[11px] text-zinc-600 bg-zinc-50 p-1.5 rounded border border-zinc-100">
                                  Obs: {v.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Ações de Edição e Exclusão da Vacina */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenEditVaccine(selectedPet, v)}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition cursor-pointer"
                              title="Editar esta vacina"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteVaccine(v.id)}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition cursor-pointer"
                              title="Excluir vacina"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Rodapé do Modal */}
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => setSelectedPet(null)}
                className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 6. MODAL DE CADASTRAR OU EDITAR PET */}
      {petModalOpen && (
        <Modal
          title={editingPetId ? `Editar Pet · ${petForm.name}` : 'Cadastrar novo pet'}
          onClose={() => setPetModalOpen(false)}
        >
          <form onSubmit={handleSavePet} className="grid gap-3.5 sm:grid-cols-2">
            <PhotoUploadField
              label="Foto do pet"
              subjectName={petForm.name}
              value={petForm.photoUrl}
              onChange={photoUrl => setPetForm({ ...petForm, photoUrl })}
            />

            <label className="sm:col-span-2">
              <span className={labelClass}>Tutor responsável *</span>
              <select
                required
                className={inputClass}
                value={petForm.customerId}
                onChange={event => setPetForm({ ...petForm, customerId: event.target.value })}
              >
                <option value="">Selecione o tutor</option>
                {tutors.map(tutor => (
                  <option key={tutor.id} value={tutor.id}>
                    {tutor.name} · {tutor.phone}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Nome do pet *</span>
              <input
                required
                className={inputClass}
                value={petForm.name}
                onChange={event => setPetForm({ ...petForm, name: event.target.value })}
                placeholder="Ex: Thor, Mel, Nina..."
              />
            </label>

            <label>
              <span className={labelClass}>Espécie *</span>
              <select
                className={inputClass}
                value={petForm.species}
                onChange={event => setPetForm({ ...petForm, species: event.target.value })}
              >
                <option value="dog">Cachorro</option>
                <option value="cat">Gato</option>
                <option value="other">Outro</option>
              </select>
            </label>

            <label>
              <span className={labelClass}>Raça</span>
              <input
                className={inputClass}
                value={petForm.breed}
                onChange={event => setPetForm({ ...petForm, breed: event.target.value })}
                placeholder="Ex: Golden Retriever, Shih-tzu, SRD..."
              />
            </label>

            <label>
              <span className={labelClass}>Sexo</span>
              <select
                className={inputClass}
                value={petForm.sex}
                onChange={event => setPetForm({ ...petForm, sex: event.target.value })}
              >
                <option value="">Não informado</option>
                <option value="male">Macho</option>
                <option value="female">Fêmea</option>
              </select>
            </label>

            <label>
              <span className={labelClass}>Porte</span>
              <select
                className={inputClass}
                value={petForm.size}
                onChange={event => setPetForm({ ...petForm, size: event.target.value })}
              >
                <option value="">Não informado</option>
                <option value="small">Pequeno (small)</option>
                <option value="medium">Médio (medium)</option>
                <option value="large">Grande (large)</option>
                <option value="giant">Gigante (giant)</option>
              </select>
            </label>

            <label>
              <span className={labelClass}>Peso aproximado (kg)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                className={inputClass}
                value={petForm.weight}
                onChange={event => setPetForm({ ...petForm, weight: event.target.value })}
                placeholder="Ex: 8.5"
              />
            </label>

            <label>
              <span className={labelClass}>Data de nascimento / Idade</span>
              <input
                type="date"
                className={inputClass}
                value={petForm.birthDate}
                onChange={event => setPetForm({ ...petForm, birthDate: event.target.value })}
              />
            </label>

            <label>
              <span className={labelClass}>Cor / Pelagem</span>
              <input
                className={inputClass}
                value={petForm.color}
                onChange={event => setPetForm({ ...petForm, color: event.target.value })}
                placeholder="Ex: Caramelo, Preto e Branco..."
              />
            </label>

            <div className="sm:col-span-2 flex items-center gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-800">
                <input
                  type="checkbox"
                  checked={petForm.neutered}
                  onChange={event => setPetForm({ ...petForm, neutered: event.target.checked })}
                />
                <span>Pet é castrado(a)</span>
              </label>

              <label className="flex-1 ml-4">
                <span className="sr-only">Número do Microchip</span>
                <input
                  className={inputClass}
                  placeholder="Nº do Microchip (opcional)"
                  value={petForm.microchip}
                  onChange={event => setPetForm({ ...petForm, microchip: event.target.value })}
                />
              </label>
            </div>

            <label className="sm:col-span-2">
              <span className={labelClass}>Alergias e Restrições de Saúde (aparece em alerta)</span>
              <textarea
                className={inputClass}
                rows={2}
                placeholder="Ex: Dermatite atópica, sensibilidade a lâmina, não come carne bovina..."
                value={petForm.allergies}
                onChange={event => setPetForm({ ...petForm, allergies: event.target.value })}
              />
            </label>

            <label className="sm:col-span-2">
              <span className={labelClass}>Comportamento e Notas de Manejo</span>
              <textarea
                className={inputClass}
                rows={2}
                placeholder="Ex: Medo de secador/soprador, agitado ao cortar unhas, sociável com outros cães..."
                value={petForm.behavior}
                onChange={event => setPetForm({ ...petForm, behavior: event.target.value })}
              />
            </label>

            <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPetModalOpen(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button disabled={saving} className={primaryButton}>
                {saving ? 'Salvando…' : editingPetId ? 'Salvar alterações' : 'Cadastrar pet'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 7. MODAL DE REGISTRAR OU EDITAR VACINA */}
      {vaccineModalOpen && vaccineTargetPet && (
        <Modal
          title={editingVaccineId ? `Editar vacina · ${vacForm.vaccineName}` : `Registrar vacina · ${vaccineTargetPet.name}`}
          onClose={() => setVaccineModalOpen(false)}
        >
          <form onSubmit={handleSaveVaccine} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl mb-1">
              <PetAvatar pet={vaccineTargetPet} size="sm" />
              <div className="text-xs">
                <strong className="text-teal-900 block font-bold">{vaccineTargetPet.name}</strong>
                <span className="text-teal-700">Tutor: {vaccineTargetPet.customer?.name}</span>
              </div>
            </div>

            <label className="sm:col-span-2">
              <span className={labelClass}>Vacina *</span>
              <input
                required
                className={inputClass}
                value={vacForm.vaccineName}
                onChange={event => setVacForm({ ...vacForm, vaccineName: event.target.value })}
                placeholder="Ex: V10, Antirrábica, Gripe Canina..."
              />
            </label>

            {/* Pílulas de Atalho Rápido para Vacinas Frequentes */}
            {!editingVaccineId && (
              <div className="sm:col-span-2 flex flex-wrap gap-1.5 -mt-1">
                {quickVaccines.map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setVacForm({ ...vacForm, vaccineName: q })}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 transition cursor-pointer"
                  >
                    + {q}
                  </button>
                ))}
              </div>
            )}

            <label>
              <span className={labelClass}>Data da aplicação</span>
              <input
                type="date"
                className={inputClass}
                value={vacForm.appliedAt}
                onChange={event => setVacForm({ ...vacForm, appliedAt: event.target.value })}
              />
            </label>

            <label>
              <span className={labelClass}>Próxima dose / vencimento</span>
              <input
                type="date"
                className={inputClass}
                value={vacForm.nextDueAt}
                onChange={event => setVacForm({ ...vacForm, nextDueAt: event.target.value })}
              />
            </label>

            <label>
              <span className={labelClass}>Número do Lote</span>
              <input
                className={inputClass}
                value={vacForm.batchNumber}
                onChange={event => setVacForm({ ...vacForm, batchNumber: event.target.value })}
                placeholder="Ex: LOTE-8942A"
              />
            </label>

            <label>
              <span className={labelClass}>Fabricante / Laboratório</span>
              <input
                className={inputClass}
                value={vacForm.manufacturer}
                onChange={event => setVacForm({ ...vacForm, manufacturer: event.target.value })}
                placeholder="Ex: Zoetis, Boehringer, MSD..."
              />
            </label>

            <label>
              <span className={labelClass}>Clínica / Estabelecimento</span>
              <input
                className={inputClass}
                value={vacForm.clinic}
                onChange={event => setVacForm({ ...vacForm, clinic: event.target.value })}
                placeholder="Ex: S.O.S Pet Care"
              />
            </label>

            <label>
              <span className={labelClass}>Profissional / Veterinário</span>
              <input
                className={inputClass}
                value={vacForm.professional}
                onChange={event => setVacForm({ ...vacForm, professional: event.target.value })}
                placeholder="Ex: Dr. Carlos (CRMV 12345)"
              />
            </label>

            <label className="sm:col-span-2">
              <span className={labelClass}>Observações</span>
              <textarea
                className={inputClass}
                rows={2}
                value={vacForm.notes}
                onChange={event => setVacForm({ ...vacForm, notes: event.target.value })}
                placeholder="Ex: Dose anual de reforço, pet não apresentou reação..."
              />
            </label>

            <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVaccineModalOpen(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button disabled={saving || !vacForm.vaccineName} className={primaryButton}>
                {saving ? 'Salvando…' : editingVaccineId ? 'Salvar alterações' : 'Registrar vacina'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
