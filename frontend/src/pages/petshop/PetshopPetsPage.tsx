import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  Cat,
  Dog,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Info,
  MoreVertical,
  PackageCheck,
  PawPrint,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Scale,
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
import { usePetshopContext } from '@/layouts/PetshopLayout';
import { getFullUrl } from '@/lib/getFullUrl';
import type { Appointment, Pet, Tutor, Vaccination } from './types';
import { coatLabels, money } from './types';
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
  coatType: '',
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

const shortSizeLabel = (size?: string | null) => {
  if (!size) return 'Porte não informado';
  const map: Record<string, string> = {
    mini: 'Porte Mini',
    small: 'Porte Pequeno',
    medium: 'Porte Médio',
    large: 'Porte Grande',
    giant: 'Porte Gigante',
    p: 'Porte Pequeno',
    m: 'Porte Médio',
    g: 'Porte Grande',
    gg: 'Porte Gigante',
  };
  return map[size.toLowerCase()] || map[size] || `Porte ${size}`;
};

const sizeBadgeStyle = (size?: string | null) => {
  switch ((size || '').toLowerCase()) {
    case 'mini':
      return 'bg-purple-50 text-purple-700 border-purple-200/90';
    case 'small':
    case 'p':
      return 'bg-sky-50 text-sky-700 border-sky-200/90';
    case 'medium':
    case 'm':
      return 'bg-teal-50 text-teal-700 border-teal-200/90';
    case 'large':
    case 'g':
      return 'bg-amber-50 text-amber-700 border-amber-200/90';
    case 'giant':
    case 'gg':
      return 'bg-rose-50 text-rose-700 border-rose-200/90';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200/90';
  }
};

const sizeLabel = (size?: string | null) => {
  if (!size) return 'Porte não informado';
  const map: Record<string, string> = {
    mini: 'Mini (< 5kg)',
    small: 'Pequeno (5-10kg)',
    medium: 'Médio (10-20kg)',
    large: 'Grande (20-35kg)',
    giant: 'Gigante (> 35kg)',
    M: 'Médio',
    P: 'Pequeno',
    G: 'Grande',
    GG: 'Gigante',
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
  hasVaccines = true,
  onOpenDetails,
  onOpenVaccines,
  onOpenEdit,
  onOpenNewAppointment,
}: {
  pet: Pet;
  hasVaccines?: boolean;
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
            {hasVaccines && (
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
            )}
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
  const { hasVaccines } = usePetshopContext();
  const [items, setItems] = useState<Pet[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Visualização: Lista Operacional vs Relatório de Pets & Clientes
  const [viewMode, setViewMode] = useState<'list' | 'report'>('list');

  // Filtros
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [sexFilter, setSexFilter] = useState('all');
  const [vaccineStatusFilter, setVaccineStatusFilter] = useState('all');
  const [inactivityFilter, setInactivityFilter] = useState('all');

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
      coatType: pet.coatType || '',
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
    let dogsCount = 0;
    let catsCount = 0;
    let specialCareCount = 0;
    let malesCount = 0;
    let femalesCount = 0;
    let smallCount = 0;
    let mediumCount = 0;
    let largeCount = 0;

    for (const pet of items) {
      if (pet.species === 'dog') dogsCount++;
      if (pet.species === 'cat') catsCount++;
      if (pet.sex === 'male') malesCount++;
      if (pet.sex === 'female') femalesCount++;
      const sz = (pet.size || '').toLowerCase();
      if (sz === 'mini' || sz === 'small' || sz === 'p') smallCount++;
      else if (sz === 'medium' || sz === 'm') mediumCount++;
      else if (sz === 'large' || sz === 'giant' || sz === 'g' || sz === 'gg') largeCount++;
      if (pet.allergies || pet.behavior || pet.notes) specialCareCount++;

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
      total: totalPets,
      dogs: dogsCount,
      dogsPct: totalPets ? Math.round((dogsCount / totalPets) * 100) : 0,
      cats: catsCount,
      catsPct: totalPets ? Math.round((catsCount / totalPets) * 100) : 0,
      males: malesCount,
      malesPct: totalPets ? Math.round((malesCount / totalPets) * 100) : 0,
      females: femalesCount,
      femalesPct: totalPets ? Math.round((femalesCount / totalPets) * 100) : 0,
      smallCount,
      mediumCount,
      largeCount,
      specialCare: specialCareCount,
      specialCarePct: totalPets ? Math.round((specialCareCount / totalPets) * 100) : 0,
      overdue: overdueCount,
      overduePct: totalPets ? Math.round((overdueCount / totalPets) * 100) : 0,
      dueSoon: dueSoonCount,
      without: withoutVaccinesCount,
      withoutPct: totalPets ? Math.round((withoutVaccinesCount / totalPets) * 100) : 0,
    };
  }, [items]);

  useEffect(() => {
    if (!hasVaccines && activeTab === 'vaccines') {
      setActiveTab('info');
    }
  }, [hasVaccines, activeTab]);

  const getDaysSinceLastVisit = (pet: Pet): { days: number | null; lastDateStr: string | null } => {
    const lastAppt = Array.isArray(pet.appointments) && pet.appointments.length > 0 ? pet.appointments[0] : null;
    if (!lastAppt?.startsAt) return { days: null, lastDateStr: null };
    const d = new Date(lastAppt.startsAt);
    if (Number.isNaN(d.getTime())) return { days: null, lastDateStr: null };
    const diffDays = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
    return {
      days: diffDays,
      lastDateStr: d.toLocaleDateString('pt-BR'),
    };
  };

  // Lista Filtrada
  const filteredPets = useMemo(() => {
    return items.filter(pet => {
      // Espécie
      if (speciesFilter !== 'all') {
        if (pet.species !== speciesFilter) return false;
      }

      // Porte
      if (sizeFilter !== 'all') {
        const petSize = (pet.size || '').toLowerCase();
        const filterSize = sizeFilter.toLowerCase();
        const matchesSize =
          filterSize === 'small' ? ['small', 'mini', 'p'].includes(petSize) :
          filterSize === 'medium' ? ['medium', 'm'].includes(petSize) :
          filterSize === 'large' ? ['large', 'giant', 'g', 'gg'].includes(petSize) :
          petSize === filterSize;
        if (!matchesSize) return false;
      }

      // Sexo (Macho / Fêmea - Brinde e Adereços)
      if (sexFilter !== 'all') {
        if (pet.sex !== sexFilter) return false;
      }

      // Filtro de Inatividade / Retorno
      if (inactivityFilter !== 'all') {
        const { days } = getDaysSinceLastVisit(pet);
        if (inactivityFilter === '15plus') {
          if (days === null || days < 15) return false;
        } else if (inactivityFilter === '30plus') {
          if (days === null || days < 30) return false;
        } else if (inactivityFilter === 'never') {
          if (days !== null) return false;
        } else if (inactivityFilter === 'with_package') {
          if (!pet.petPackages?.length) return false;
        }
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
  }, [items, speciesFilter, sizeFilter, sexFilter, vaccineStatusFilter, inactivityFilter]);

  const reportSummary = useMemo(() => {
    let males = 0;
    let females = 0;
    let smallCount = 0;
    let mediumCount = 0;
    let largeCount = 0;
    let withPackage = 0;
    let inactive15Plus = 0;
    const uniqueTutors = new Set<string>();

    for (const p of filteredPets) {
      if (p.customerId) uniqueTutors.add(p.customerId);
      if (p.sex === 'male') males++;
      else if (p.sex === 'female') females++;

      const sz = (p.size || '').toLowerCase();
      if (sz === 'mini' || sz === 'small' || sz === 'p') smallCount++;
      else if (sz === 'medium' || sz === 'm') mediumCount++;
      else if (sz === 'large' || sz === 'giant' || sz === 'g' || sz === 'gg') largeCount++;

      if (p.petPackages && p.petPackages.length > 0) withPackage++;
      const { days } = getDaysSinceLastVisit(p);
      if (days !== null && days >= 15) inactive15Plus++;
    }

    return {
      totalPets: filteredPets.length,
      totalTutors: uniqueTutors.size,
      males,
      females,
      smallCount,
      mediumCount,
      largeCount,
      withPackage,
      inactive15Plus,
    };
  }, [filteredPets]);

  const exportReportCsv = () => {
    const header = [
      'Pet',
      'Espécie',
      'Raça',
      'Sexo',
      'Porte',
      'Pelagem',
      'Peso (kg)',
      'Tutor',
      'Telefone / WhatsApp',
      'Endereço do Cliente',
      'Total Atendimentos',
      'Última Visita',
      'Dias sem Vir',
      'Pacote Ativo',
    ];
    const rows = filteredPets.map(p => {
      const { days, lastDateStr } = getDaysSinceLastVisit(p);
      const activePkg = p.petPackages?.[0]?.planNameSnapshot || 'Avulso';
      return [
        p.name,
        speciesLabel(p.species),
        p.breed || 'SRD',
        p.sex === 'male' ? 'Macho' : p.sex === 'female' ? 'Fêmea' : 'Não inf.',
        shortSizeLabel(p.size),
        coatLabels[p.coatType || ''] || p.coatType || '—',
        p.weight || '',
        p.customer?.name || '',
        p.customer?.phone || '',
        p.customer?.address || 'Sem endereço',
        p._count?.appointments ?? 0,
        lastDateStr || 'Nunca veio',
        days !== null ? (days <= 0 ? 'Agendado / Hoje' : `${days} dias`) : '—',
        activePkg,
      ];
    });
    const csv = [header, ...rows]
      .map(line => line.map(val => `"${String(val ?? '').replaceAll('"', '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-pets-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={pageClass}>
      {/* 1. Cabeçalho - Desktop */}
      <div className="hidden md:block">
        <PageHeader
          eyebrow="Cadastro e saúde"
          title="Pets"
          description={hasVaccines ? "Fichas, alertas importantes e carteira de vacinação." : "Fichas cadastrais, histórico de atendimentos e perfil dos pets."}
          action={
            <button
              type="button"
              onClick={handleOpenCreatePet}
              className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0d6e5a] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a5747]"
            >
              <Plus aria-hidden="true" size={18} />
              Novo pet
            </button>
          }
        />
      </div>

      {/* 1. Cabeçalho - Mobile (Layout nativo do iPhone/Android) */}
      <div className="md:hidden relative mb-4">
        {/* Marca d'água suave de patinha no topo direito */}
        <div className="absolute right-0 -top-1 text-emerald-200/40 pointer-events-none select-none">
          <PawPrint size={76} strokeWidth={1.5} />
        </div>
        <div className="relative pr-16">
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">
            Pets
          </h1>
          <p className="mt-1 text-xs text-zinc-600 leading-snug">
            {hasVaccines ? "Fichas, alertas importantes e carteira de vacinação." : "Fichas cadastrais, histórico de atendimentos e perfil dos pets."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreatePet}
          className="mt-3.5 flex w-full min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#0d6e5a] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0a5747] active:scale-[0.99]"
        >
          <Plus aria-hidden="true" size={18} strokeWidth={2.5} />
          Novo pet
        </button>
      </div>

      {/* 2. Faixa Principal de Indicadores: Total de Pets, Machos, Fêmeas e Porte */}
      <section
        className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5"
        aria-label="Resumo de pets, machos, fêmeas e portes"
      >
        {/* KPI 1: Pets cadastrados */}
        <button
          type="button"
          onClick={() => { setSexFilter('all'); setSizeFilter('all'); setSpeciesFilter('all'); }}
          className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xs flex items-center justify-between text-left hover:border-teal-300 transition cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
              <PawPrint size={22} />
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
                {kpis.total}
              </span>
              <p className="text-xs font-semibold text-zinc-700">Pets cadastrados</p>
              <p className="text-[11px] text-zinc-400">
                {kpis.dogs} cães · {kpis.cats} gatos
              </p>
            </div>
          </div>
        </button>

        {/* KPI 2: Quantidade de Machos */}
        <button
          type="button"
          onClick={() => setSexFilter(sexFilter === 'male' ? 'all' : 'male')}
          className={`rounded-2xl border p-3.5 shadow-2xs flex items-center justify-between text-left transition cursor-pointer ${
            sexFilter === 'male'
              ? 'border-sky-400 bg-sky-50/70 ring-1 ring-sky-400/30'
              : 'border-zinc-200/90 bg-white hover:border-sky-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-600 font-extrabold text-2xl shrink-0">
              ♂
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-sky-900 tabular-nums">
                  {kpis.males}
                </span>
                <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                  {kpis.malesPct}%
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-700">Machos cadastrados</p>
              <p className="text-[11px] text-zinc-400">
                {sexFilter === 'male' ? 'Filtro ativo (clique p/ todos)' : 'Clique para filtrar machos'}
              </p>
            </div>
          </div>
        </button>

        {/* KPI 3: Quantidade de Fêmeas */}
        <button
          type="button"
          onClick={() => setSexFilter(sexFilter === 'female' ? 'all' : 'female')}
          className={`rounded-2xl border p-3.5 shadow-2xs flex items-center justify-between text-left transition cursor-pointer ${
            sexFilter === 'female'
              ? 'border-pink-400 bg-pink-50/70 ring-1 ring-pink-400/30'
              : 'border-zinc-200/90 bg-white hover:border-pink-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-pink-100 text-pink-600 font-extrabold text-2xl shrink-0">
              ♀
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-pink-900 tabular-nums">
                  {kpis.females}
                </span>
                <span className="rounded-md bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold text-pink-800">
                  {kpis.femalesPct}%
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-700">Fêmeas cadastradas</p>
              <p className="text-[11px] text-zinc-400">
                {sexFilter === 'female' ? 'Filtro ativo (clique p/ todos)' : 'Clique para filtrar fêmeas'}
              </p>
            </div>
          </div>
        </button>

        {/* KPI 4: Distribuição por Porte (P, M, G) */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-center">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
              <Scale size={14} className="text-teal-700" /> Pets por Porte
            </span>
            {sizeFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSizeFilter('all')}
                className="text-[10px] font-bold text-teal-700 hover:underline cursor-pointer"
              >
                Todos
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <button
              type="button"
              onClick={() => setSizeFilter(sizeFilter === 'small' ? 'all' : 'small')}
              className={`rounded-lg border py-1 px-1.5 transition cursor-pointer ${
                sizeFilter === 'small' ? 'border-sky-400 bg-sky-100 font-bold' : 'border-zinc-100 bg-zinc-50 hover:bg-zinc-100'
              }`}
            >
              <strong className="block text-sm font-extrabold text-zinc-900 tabular-nums">{kpis.smallCount}</strong>
              <span className="block text-[9px] text-zinc-500 font-semibold">Peq / Mini</span>
            </button>
            <button
              type="button"
              onClick={() => setSizeFilter(sizeFilter === 'medium' ? 'all' : 'medium')}
              className={`rounded-lg border py-1 px-1.5 transition cursor-pointer ${
                sizeFilter === 'medium' ? 'border-teal-400 bg-teal-100 font-bold' : 'border-zinc-100 bg-zinc-50 hover:bg-zinc-100'
              }`}
            >
              <strong className="block text-sm font-extrabold text-teal-800 tabular-nums">{kpis.mediumCount}</strong>
              <span className="block text-[9px] text-zinc-500 font-semibold">Médio (M)</span>
            </button>
            <button
              type="button"
              onClick={() => setSizeFilter(sizeFilter === 'large' ? 'all' : 'large')}
              className={`rounded-lg border py-1 px-1.5 transition cursor-pointer ${
                sizeFilter === 'large' ? 'border-amber-400 bg-amber-100 font-bold' : 'border-zinc-100 bg-zinc-50 hover:bg-zinc-100'
              }`}
            >
              <strong className="block text-sm font-extrabold text-amber-800 tabular-nums">{kpis.largeCount}</strong>
              <span className="block text-[9px] text-zinc-500 font-semibold">Grande / GG</span>
            </button>
          </div>
        </div>
      </section>

      {/* Abas de Alternância: Mobile */}
      <div className="md:hidden grid grid-cols-2 gap-2.5 mb-3.5">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition shadow-xs ${
            viewMode === 'list'
              ? 'bg-[#0d6e5a] text-white'
              : 'bg-white text-zinc-700 border border-zinc-200/90 hover:bg-zinc-50'
          }`}
        >
          <PawPrint size={15} />
          <span className="truncate">Fichas de Pets ({filteredPets.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('report')}
          className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition shadow-xs ${
            viewMode === 'report'
              ? 'bg-[#0d6e5a] text-white font-bold'
              : 'bg-white text-zinc-700 border border-zinc-200/90 hover:bg-zinc-50'
          }`}
        >
          <FileText size={15} />
          <span className="truncate">Relatório de Pets & Clientes</span>
        </button>
      </div>

      {/* Abas de Alternância: Desktop */}
      <div className="hidden md:flex mb-4 items-center justify-between gap-3 border-b border-zinc-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
              viewMode === 'list'
                ? 'bg-[#0d6e5a] text-white shadow-xs'
                : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <PawPrint size={16} />
            Fichas de Pets ({filteredPets.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('report')}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
              viewMode === 'report'
                ? 'bg-[#0d6e5a] text-white shadow-xs'
                : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <FileText size={16} />
            Relatório de Pets & Clientes
          </button>
        </div>

        {viewMode === 'report' && (
          <button
            type="button"
            onClick={exportReportCsv}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-bold text-teal-900 hover:bg-teal-100 transition"
          >
            <FileText size={15} />
            Exportar Relatório (CSV / Excel)
          </button>
        )}
      </div>

      {/* 3. Barra de Busca e Filtros - Mobile (Idêntico ao layout nativo) */}
      <section
        className="md:hidden mb-4 rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xs space-y-2.5"
        aria-label="Filtros da lista de pets mobile"
      >
        {/* Linha 1: Campo de Busca */}
        <div className="relative w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar pet, raça ou tutor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50/70 pl-9 pr-8 text-xs text-zinc-800 placeholder-zinc-400 outline-none transition focus:border-teal-600 focus:bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Linha 2: Espécie e Portes (2 colunas) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <select
              value={speciesFilter}
              onChange={e => setSpeciesFilter(e.target.value)}
              className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-3 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">Espécie</option>
              <option value="dog">Cachorro</option>
              <option value="cat">Gato</option>
              <option value="other">Outro</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={sizeFilter}
              onChange={e => setSizeFilter(e.target.value)}
              className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-3 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">Todos os Portes</option>
              <option value="mini">Mini</option>
              <option value="small">Pequeno (P)</option>
              <option value="medium">Médio (M)</option>
              <option value="large">Grande (G)</option>
              <option value="giant">Gigante (GG)</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
        </div>

        {/* Linha 3: Macho e Fêmea (Largura total) */}
        <div className="relative">
          <select
            value={sexFilter}
            onChange={e => setSexFilter(e.target.value)}
            className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-3 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
          >
            <option value="all">Macho e Fêmea</option>
            <option value="male">♂ Somente Machos</option>
            <option value="female">♀ Somente Fêmeas</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>

        {/* Linha 4: Frequência / Retorno (Largura total) */}
        <div className="relative">
          <select
            value={inactivityFilter}
            onChange={e => setInactivityFilter(e.target.value)}
            className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-3 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
          >
            <option value="all">Frequência / Retorno</option>
            <option value="15plus">Ausentes há +15 dias</option>
            <option value="30plus">Ausentes há +30 dias</option>
            <option value="with_package">Com pacote ativo</option>
            <option value="never">Sem atendimento registrado</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>

        {/* Linha 5: Status da Vacina (se disponível) */}
        {hasVaccines && (
          <div className="relative">
            <select
              value={vaccineStatusFilter}
              onChange={e => setVaccineStatusFilter(e.target.value)}
              className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-3 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">Status da vacina</option>
              <option value="up_to_date">Em dia</option>
              <option value="overdue">Vacina atrasada</option>
              <option value="due_soon">Próximos 30 dias</option>
              <option value="none">Sem vacina registrada</option>
              <option value="alerts">Com atenção / alergias</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
        )}

        {/* Limpar Filtros Mobile */}
        {(search || speciesFilter !== 'all' || sizeFilter !== 'all' || sexFilter !== 'all' || vaccineStatusFilter !== 'all' || inactivityFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSpeciesFilter('all');
              setSizeFilter('all');
              setSexFilter('all');
              setVaccineStatusFilter('all');
              setInactivityFilter('all');
            }}
            className="flex w-full min-h-9 items-center justify-center gap-1.5 rounded-xl border border-dashed border-rose-300 bg-rose-50/50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100/60 transition cursor-pointer"
          >
            <RotateCcw size={13} />
            Limpar todos os filtros
          </button>
        )}
      </section>

      {/* 3. Barra de Busca e Filtros - Desktop */}
      <section
        className="hidden md:flex mb-5 rounded-2xl border border-zinc-200/90 bg-white p-3 shadow-xs items-center justify-between gap-3"
        aria-label="Filtros da lista de pets desktop"
      >
        {/* Campo de Busca */}
        <div className="relative min-w-[220px] flex-1">
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
        <div className="flex flex-wrap items-center gap-2">
          {/* Espécie */}
          <select
            value={speciesFilter}
            onChange={e => setSpeciesFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
          >
            <option value="all">Espécie</option>
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
            <option value="all">Todos os Portes</option>
            <option value="mini">Mini</option>
            <option value="small">Pequeno (P)</option>
            <option value="medium">Médio (M)</option>
            <option value="large">Grande (G)</option>
            <option value="giant">Gigante (GG)</option>
          </select>

          {/* Sexo (Macho / Fêmea) */}
          <select
            value={sexFilter}
            onChange={e => setSexFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            title="Filtrar por sexo (Macho / Fêmea)"
          >
            <option value="all">Macho e Fêmea</option>
            <option value="male">♂ Somente Machos</option>
            <option value="female">♀ Somente Fêmeas</option>
          </select>

          {/* Filtro de Frequência / Retorno */}
          <select
            value={inactivityFilter}
            onChange={e => setInactivityFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
          >
            <option value="all">Frequência / Retorno</option>
            <option value="15plus">Ausentes há +15 dias</option>
            <option value="30plus">Ausentes há +30 dias</option>
            <option value="with_package">Com pacote ativo</option>
            <option value="never">Sem atendimento registrado</option>
          </select>

          {/* Status da Vacina */}
          {hasVaccines && (
            <select
              value={vaccineStatusFilter}
              onChange={e => setVaccineStatusFilter(e.target.value)}
              className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">Status da vacina</option>
              <option value="up_to_date">Em dia</option>
              <option value="overdue">Vacina atrasada</option>
              <option value="due_soon">Próximos 30 dias</option>
              <option value="none">Sem vacina registrada</option>
              <option value="alerts">Com atenção / alergias</option>
            </select>
          )}

          {/* Botão Limpar Filtros */}
          {(search || speciesFilter !== 'all' || sizeFilter !== 'all' || sexFilter !== 'all' || vaccineStatusFilter !== 'all' || inactivityFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSpeciesFilter('all');
                setSizeFilter('all');
                setSexFilter('all');
                setVaccineStatusFilter('all');
                setInactivityFilter('all');
              }}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-rose-300 bg-rose-50/50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100/60 transition cursor-pointer"
            >
              <RotateCcw size={13} />
              Limpar
            </button>
          )}
        </div>
      </section>

      {/* 4. Aba de Relatório Consolidado de Pets & Clientes */}
      {viewMode === 'report' ? (
        <div className="space-y-5">
          {/* Cards de Distribuição do Relatório (Macho/Fêmea, Porte, Pacotes e Ausentes) */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Distribuição por Sexo
              </span>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <span className="text-xl font-bold text-sky-700">♂ {reportSummary.males}</span>
                  <p className="text-[11px] text-zinc-500">Machos (Gravatas)</p>
                </div>
                <div className="h-8 w-px bg-zinc-200" />
                <div className="text-right">
                  <span className="text-xl font-bold text-pink-600">♀ {reportSummary.females}</span>
                  <p className="text-[11px] text-zinc-500">Fêmeas (Laços)</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Distribuição por Porte
              </span>
              <div className="mt-2 flex items-center justify-between text-xs">
                <div>
                  <strong className="block text-base font-bold text-zinc-900">{reportSummary.smallCount}</strong>
                  <span className="text-zinc-500">Mini / P</span>
                </div>
                <div>
                  <strong className="block text-base font-bold text-teal-700">{reportSummary.mediumCount}</strong>
                  <span className="text-zinc-500">Médio (M)</span>
                </div>
                <div>
                  <strong className="block text-base font-bold text-amber-700">{reportSummary.largeCount}</strong>
                  <span className="text-zinc-500">Grande / GG</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Tutores & Pacotes Ativos
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <div>
                  <strong className="text-xl font-bold text-zinc-900">{reportSummary.totalTutors}</strong>
                  <p className="text-[11px] text-zinc-500">Tutores no filtro</p>
                </div>
                <div className="text-right">
                  <strong className="text-xl font-bold text-emerald-700">{reportSummary.withPackage}</strong>
                  <p className="text-[11px] text-zinc-500">Pets com pacote</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Alerta de Retorno (+15 dias)
              </span>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <strong className="text-2xl font-bold text-amber-950">{reportSummary.inactive15Plus}</strong>
                  <p className="text-[11px] text-amber-800">Pets sem agendar há 15+ dias</p>
                </div>
                <button
                  type="button"
                  onClick={() => setInactivityFilter(inactivityFilter === '15plus' ? 'all' : '15plus')}
                  className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
                >
                  {inactivityFilter === '15plus' ? 'Ver Todos' : 'Filtrar Ausentes'}
                </button>
              </div>
            </div>
          </div>

          {/* Tabela Completa do Relatório de Pets & Clientes */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                  <tr>
                    <th className="px-4 py-3.5">Pet / Raça</th>
                    <th className="px-4 py-3.5">Sexo & Porte</th>
                    <th className="px-4 py-3.5">Tutor & Contato</th>
                    <th className="px-4 py-3.5">Endereço Cadastrado</th>
                    <th className="px-4 py-3.5 text-center">Visitas</th>
                    <th className="px-4 py-3.5">Último Atendimento / Dias</th>
                    <th className="px-4 py-3.5">Modalidade / Pacote</th>
                    <th className="px-4 py-3.5 text-right">Ação Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredPets.map(pet => {
                    const { days, lastDateStr } = getDaysSinceLastVisit(pet);
                    const activePkg = pet.petPackages?.[0];
                    return (
                      <tr key={pet.id} className="hover:bg-zinc-50/80 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <PetAvatar pet={pet} size="sm" />
                            <div>
                              <strong className="block text-xs font-bold text-zinc-900">{pet.name}</strong>
                              <span className="text-[11px] text-zinc-500">
                                {speciesLabel(pet.species)} · {pet.breed || 'SRD'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {pet.sex === 'male' ? (
                              <span className="rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                                ♂ Macho
                              </span>
                            ) : pet.sex === 'female' ? (
                              <span className="rounded-md bg-pink-50 border border-pink-200 px-2 py-0.5 text-[11px] font-bold text-pink-700">
                                ♀ Fêmea
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${sizeBadgeStyle(pet.size)}`}>
                              {shortSizeLabel(pet.size)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <strong className="block text-zinc-900">{pet.customer?.name}</strong>
                          <span className="text-[11px] text-zinc-500">{pet.customer?.phone}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          {pet.customer?.address ? (
                            <span className="line-clamp-2 text-zinc-700" title={pet.customer.address}>
                              {pet.customer.address}
                            </span>
                          ) : (
                            <span className="text-[11px] italic text-amber-700">Sem endereço</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-zinc-800">
                          {pet._count?.appointments ?? 0}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {lastDateStr ? (
                            <div>
                              <span className="block font-medium text-zinc-800">{lastDateStr}</span>
                              {days !== null && days >= 15 ? (
                                <span className="inline-block mt-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                  Há {days} dias sem vir
                                </span>
                              ) : days !== null && days > 0 ? (
                                <span className="text-[11px] text-emerald-700 font-medium">Há {days} dia(s)</span>
                              ) : (
                                <span className="text-[11px] text-teal-700 font-semibold">Agendado / Recente</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-400">Sem histórico</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {activePkg ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800">
                              <PackageCheck size={12} /> {activePkg.planNameSnapshot}
                            </span>
                          ) : (
                            <span className="text-zinc-500">Cliente Avulso</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/petshop/agenda?new=1&petId=${pet.id}`)}
                            className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-800 cursor-pointer"
                          >
                            + Agendar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
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
            {hasVaccines ? (
              <div className="hidden lg:grid grid-cols-[minmax(200px,1.1fr)_minmax(210px,1.1fr)_170px_170px_160px] gap-4 px-5 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider bg-zinc-50/70 border-b border-zinc-200 rounded-t-2xl">
                <div>Pet & Tutor</div>
                <div>Status / Vacinação</div>
                <div>Porte & Peso</div>
                <div>Atendimentos & Pacotes</div>
                <div className="text-right">Ações</div>
              </div>
            ) : (
              <div className="hidden lg:grid grid-cols-[minmax(220px,1.2fr)_minmax(210px,1.1fr)_180px_180px_100px] gap-4 px-5 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider bg-zinc-50/70 border-b border-zinc-200 rounded-t-2xl">
                <div>Pet & Tutor</div>
                <div>Cuidados & Observações</div>
                <div>Porte & Peso</div>
                <div>Atendimentos & Pacotes</div>
                <div className="text-right">Ações</div>
              </div>
            )}

            {filteredPets.map(pet => {
              const vacs = pet.vaccinations || [];
              const next = vacs.find(v => v.nextDueAt);
              const overdue = Boolean(next?.nextDueAt && new Date(next.nextDueAt) < today);
              const dueSoon = Boolean(next?.nextDueAt && new Date(next.nextDueAt) >= today && new Date(next.nextDueAt) <= in30Days);

              return (
                <article
                  key={pet.id}
                  className={`grid gap-3 px-4 py-3.5 sm:px-5 ${
                    hasVaccines
                      ? 'lg:grid-cols-[minmax(200px,1.1fr)_minmax(210px,1.1fr)_170px_170px_160px]'
                      : 'lg:grid-cols-[minmax(220px,1.2fr)_minmax(210px,1.1fr)_180px_180px_100px]'
                  } lg:items-center hover:bg-zinc-50/60 transition`}
                >
                  {/* Coluna 1: Pet / Tutor */}
                  <div
                    onClick={() => openPetDetails(pet, 'info')}
                    className="flex items-center gap-3.5 cursor-pointer min-w-0 group"
                  >
                    <PetAvatar pet={pet} size="md" alt={`Foto de ${pet.name}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h2 className="text-sm font-bold text-zinc-900 truncate group-hover:text-teal-700 transition">
                          {pet.name}
                        </h2>
                        {pet.sex === 'male' && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200"
                            title="Macho (adereços e gravatinhas)"
                          >
                            ♂ Macho
                          </span>
                        )}
                        {pet.sex === 'female' && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                            title="Fêmea (adereços e lacinhos)"
                          >
                            ♀ Fêmea
                          </span>
                        )}
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200/60">
                          {speciesLabel(pet.species)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {pet.breed || 'Raça não informada'}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5 flex items-center gap-1">
                        <UserRound size={11} className="text-zinc-400 shrink-0" />
                        <span>Tutor: <strong className="font-semibold text-zinc-700">{pet.customer?.name}</strong></span>
                      </p>
                    </div>
                  </div>

                  {/* Coluna 2: Status / Vacinação OU Cuidados & Observações */}
                  <div className="min-w-0">
                    {hasVaccines ? (
                      pet.allergies ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                          <AlertTriangle size={13} className="shrink-0 text-rose-600" />
                          <span className="truncate max-w-[260px]">
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
                      )
                    ) : (
                      pet.allergies ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                          <AlertTriangle size={13} className="shrink-0 text-rose-600" />
                          <span className="truncate max-w-[260px]">
                            <strong>Alergia:</strong> {pet.allergies}
                          </span>
                        </div>
                      ) : pet.behavior ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          <Info size={13} className="shrink-0 text-amber-600" />
                          <span className="truncate max-w-[260px]">
                            <strong>Comportamento:</strong> {pet.behavior}
                          </span>
                        </div>
                      ) : pet.notes ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600">
                          <FileText size={13} className="shrink-0 text-zinc-400" />
                          <span className="truncate max-w-[260px]">{pet.notes}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-2.5 py-1 text-xs font-medium text-emerald-800">
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                          Sem restrições no atendimento
                        </span>
                      )
                    )}
                  </div>

                  {/* Coluna 3: Porte & Características */}
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${sizeBadgeStyle(pet.size)}`}>
                        {shortSizeLabel(pet.size)}
                      </span>
                      {pet.coatType && (
                        <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                          {coatLabels[pet.coatType] || pet.coatType}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-medium">
                      <Scale size={12} className="text-zinc-400 shrink-0" />
                      <span>{pet.weight ? `${Number(pet.weight).toLocaleString('pt-BR')} kg` : 'Peso não informado'}</span>
                    </div>
                  </div>

                  {/* Coluna 4: Atendimentos & Pacotes */}
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays size={13} className="text-zinc-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-800 tabular-nums">
                        {(pet._count?.appointments || pet.appointments?.length || 0) > 0
                          ? `${pet._count?.appointments || pet.appointments?.length} ${
                              (pet._count?.appointments || pet.appointments?.length) === 1 ? 'atendimento' : 'atendimentos'
                            }`
                          : 'Nenhum atendimento'}
                      </span>
                    </div>
                    {pet.petPackages && pet.petPackages.length > 0 ? (
                      <div className="flex items-center">
                        <span
                          title={`${pet.petPackages.length} pacote(s) ativo(s)`}
                          className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800"
                        >
                          <PackageCheck size={12} className="shrink-0 text-teal-600" />
                          <span>
                            {pet.petPackages.length} {pet.petPackages.length === 1 ? 'pacote ativo' : 'pacotes ativos'}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-zinc-400 pl-4.5">Sem pacote ativo</span>
                    )}
                  </div>

                  {/* Coluna 5: Ações */}
                  <div className="flex items-center justify-end gap-1.5 relative">
                    {/* Botão Registrar Vacina (só se módulo estiver ativo) */}
                    {hasVaccines && (
                      <button
                        type="button"
                        onClick={() => handleOpenAddVaccine(pet)}
                        className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/50 transition cursor-pointer"
                        title="Registrar nova vacina na carteirinha"
                      >
                        <Syringe size={13} className="text-teal-700" />
                        <span>Registrar vacina</span>
                      </button>
                    )}

                    {/* Botão Ver Ficha / Histórico */}
                    <button
                      type="button"
                      onClick={() => openPetDetails(pet, 'info')}
                      className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/40 transition cursor-pointer shadow-2xs"
                      title="Ver ficha completa e histórico"
                    >
                      <span>Ficha</span>
                      <ChevronRight size={14} className="text-zinc-400" />
                    </button>

                    {/* Menu Dropdown de Opções */}
                    <PetRowActionsMenu
                      pet={pet}
                      hasVaccines={hasVaccines}
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
      )}

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
                Ficha Geral & Saúde
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'history' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Histórico de Atendimentos ({selectedPet.appointments?.length || 0})
              </button>
              {hasVaccines && (
                <button
                  type="button"
                  onClick={() => setActiveTab('vaccines')}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'vaccines' ? 'bg-teal-700 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Carteirinha de Vacinação ({selectedPet.vaccinations?.length || 0})
                </button>
              )}
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
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Tipo de Pelagem</span>
                    <strong className="text-zinc-800 font-semibold">
                      {selectedPet.coatType ? coatLabels[selectedPet.coatType] || selectedPet.coatType : 'Não informada'}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Peso</span>
                    <strong className="text-zinc-800 font-semibold tabular-nums">
                      {selectedPet.weight ? `${Number(selectedPet.weight).toLocaleString('pt-BR')} kg` : 'Não informado'}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5">
                    <span className="text-zinc-400 block text-[11px] mb-0.5">Castrado / Sexo</span>
                    <strong className="text-zinc-800 font-semibold">
                      {selectedPet.sex === 'male' ? 'Macho' : selectedPet.sex === 'female' ? 'Fêmea' : '—'} · {selectedPet.neutered ? 'Castrado' : 'Inteiro'}
                    </strong>
                  </div>
                </div>

                {/* Pacotes Contratados Ativos */}
                <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5">
                      <PackageCheck size={14} className="text-teal-700" />
                      Pacotes de Banho e Tosa Ativos
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/petshop/pacotes?petId=${selectedPet.id}`)}
                      className="text-teal-700 font-bold hover:underline cursor-pointer"
                    >
                      + Contratar / Ver pacotes
                    </button>
                  </div>
                  {selectedPet.petPackages && selectedPet.petPackages.length > 0 ? (
                    <div className="space-y-1.5">
                      {selectedPet.petPackages.map(pkg => (
                        <div key={pkg.id} className="flex items-center justify-between rounded-lg bg-white border border-teal-100 px-3 py-2">
                          <div>
                            <strong className="font-semibold text-zinc-900">{pkg.planNameSnapshot}</strong>
                            <p className="text-[11px] text-zinc-500">
                              {pkg.items?.map(it => `${it.serviceNameSnapshot}: ${it.availableQuantity}/${it.totalQuantity} disp.`).join(' · ')}
                            </p>
                          </div>
                          <span className="text-[11px] text-teal-800 font-semibold">
                            Até {formatDate(pkg.expiresAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-[11px]">
                      Este pet não possui pacotes recorrentes ativos no momento.
                    </p>
                  )}
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
                              Recado: “{app.stageNotes}”
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
            {activeTab === 'vaccines' && hasVaccines && (
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
                <option value="mini">Mini (até 5kg)</option>
                <option value="small">Pequeno (5 a 10kg)</option>
                <option value="medium">Médio (10 a 20kg)</option>
                <option value="large">Grande (20 a 35kg)</option>
                <option value="giant">Gigante (acima de 35kg)</option>
              </select>
            </label>

            <label>
              <span className={labelClass}>Tipo de Pelagem (precificação de pacotes)</span>
              <select
                className={inputClass}
                value={petForm.coatType}
                onChange={event => setPetForm({ ...petForm, coatType: event.target.value })}
              >
                <option value="">Não informada</option>
                <option value="short">Pelo Curto (short)</option>
                <option value="medium">Pelo Médio (medium)</option>
                <option value="long">Pelo Longo (long)</option>
                <option value="double">Pelagem Dupla / Densa (double)</option>
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
      {hasVaccines && vaccineModalOpen && vaccineTargetPet && (
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
