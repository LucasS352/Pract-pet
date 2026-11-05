import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Droplets,
  FlaskConical,
  Layers,
  MoreHorizontal,
  PawPrint,
  Pencil,
  Plus,
  Scissors,
  Search,
  Smile,
  Sparkles,
  Stethoscope,
  Syringe,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { PetService } from './types';
import { money } from './types';
import { CatalogTabs, EmptyState, ListSkeleton, pageClass, PageHeader, primaryButton, secondaryButton } from './ui';
import { ServiceEditorModal } from './ServiceEditorModal';
import { ManageStoreStagesModal } from './ManageStoreStagesModal';
import { Workflow } from 'lucide-react';

type ServiceCategory = 'Higiene e Estética' | 'Saúde' | 'Estética e Spa' | 'Outros';
type TargetPetGroup = 'Cães e Gatos' | 'Cães' | 'Gatos';

interface ParsedServiceMeta {
  cleanDescription: string;
  category: ServiceCategory;
  targetPets: TargetPetGroup;
}

function parseServiceMetadata(service: PetService): ParsedServiceMeta {
  const rawDesc = service.description || '';
  let category: ServiceCategory = 'Higiene e Estética';
  let targetPets: TargetPetGroup = 'Cães e Gatos';

  const metaMatch = rawDesc.match(/\[(cat|categoria):\s*([^|\]]+)(?:\|\s*(pets|porte):\s*([^\]]+))?\]/i);
  let cleanDescription = rawDesc;

  if (metaMatch) {
    cleanDescription = rawDesc.replace(metaMatch[0], '').trim();
    const parsedCat = metaMatch[2]?.trim();
    const parsedPets = metaMatch[4]?.trim();

    if (parsedCat) {
      if (/sa[uú]de/i.test(parsedCat)) category = 'Saúde';
      else if (/spa|est[eé]tica/i.test(parsedCat)) category = 'Estética e Spa';
      else if (/higiene/i.test(parsedCat)) category = 'Higiene e Estética';
      else category = parsedCat as ServiceCategory;
    }

    if (parsedPets) {
      if (/gato/i.test(parsedPets) && !/c[aã]o/i.test(parsedPets)) targetPets = 'Gatos';
      else if (/c[aã]o/i.test(parsedPets) && !/gato/i.test(parsedPets)) targetPets = 'Cães';
      else targetPets = 'Cães e Gatos';
    }
  } else {
    // Inferência inteligente automática caso o serviço tenha sido cadastrado sem tags explícitas
    const lowerName = (service.name || '').toLowerCase();
    const lowerDesc = rawDesc.toLowerCase();

    if (/vacina|consulta|exame|veterin[aá]ri|laborat|dent|soro|rem[eé]dio|atestado/i.test(lowerName) || /vacina|consulta|m[eé]dic/i.test(lowerDesc)) {
      category = 'Saúde';
    } else if (/hidrata|hidratação|spa|oz[oô]nio|cauteriza/i.test(lowerName)) {
      category = 'Higiene e Estética';
    } else {
      category = 'Higiene e Estética';
    }

    if (/felin|gato/i.test(lowerName) && !/c[aã]o|canin/i.test(lowerName)) {
      targetPets = 'Gatos';
    } else if (/canin|c[aã]o|v10|v8/i.test(lowerName) && !/gato|felin/i.test(lowerName)) {
      targetPets = 'Cães';
    } else {
      targetPets = 'Cães e Gatos';
    }
  }

  return { cleanDescription, category, targetPets };
}

function encodeServiceDescription(cleanDescription: string, category: ServiceCategory, targetPets: TargetPetGroup): string {
  const metaTag = `[cat:${category}|pets:${targetPets}]`;
  const trimmed = cleanDescription.trim();
  return trimmed ? `${trimmed}\n\n${metaTag}` : metaTag;
}

function getServiceIconInfo(serviceName: string, category: string, defaultColor?: string) {
  const name = serviceName.toLowerCase();
  if (name.includes('consulta') || name.includes('veterin')) {
    return { icon: Stethoscope, bg: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-200/60' };
  }
  if (name.includes('vacina')) {
    return { icon: Syringe, bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-200/60' };
  }
  if (name.includes('exame') || name.includes('laborat')) {
    return { icon: FlaskConical, bg: 'bg-purple-50', text: 'text-purple-600', ring: 'ring-purple-200/60' };
  }
  if (name.includes('dent') || name.includes('escova')) {
    return { icon: Smile, bg: 'bg-pink-50', text: 'text-pink-600', ring: 'ring-pink-200/60' };
  }
  if (name.includes('hidrata') || name.includes('spa') || name.includes('brilho')) {
    return { icon: Sparkles, bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-200/60' };
  }
  if (name.includes('unha') || name.includes('pat')) {
    return { icon: PawPrint, bg: 'bg-teal-50', text: 'text-teal-600', ring: 'ring-teal-200/60' };
  }
  if (name.includes('banho essencial') || name.includes('banho simples')) {
    return { icon: Droplets, bg: 'bg-cyan-50', text: 'text-cyan-600', ring: 'ring-cyan-200/60' };
  }
  if (name.includes('tosa') || name.includes('banho')) {
    return { icon: Scissors, bg: 'bg-sky-50', text: 'text-sky-600', ring: 'ring-sky-200/60' };
  }

  return { icon: Scissors, bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200/60' };
}

interface ServiceFormState {
  name: string;
  category: ServiceCategory;
  durationMinutes: number;
  price: string;
  targetPets: TargetPetGroup;
  color: string;
  description: string;
}

const emptyServiceForm: ServiceFormState = {
  name: '',
  category: 'Higiene e Estética',
  durationMinutes: 60,
  price: '',
  targetPets: 'Cães e Gatos',
  color: '#0d9488',
  description: '',
};

function ServiceRowActionsMenu({
  service,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  updating,
}: {
  service: PetService;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  updating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [openUpwards, setOpenUpwards] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 130;
      const dropdownWidth = 190;
      const spaceBelow = window.innerHeight - rect.bottom;
      const shouldOpenUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setOpenUpwards(shouldOpenUp);
      setPos({
        top: shouldOpenUp ? rect.top - 6 : rect.bottom + 6,
        left: Math.max(12, Math.min(rect.right - dropdownWidth, window.innerWidth - dropdownWidth - 16)),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        disabled={updating}
        onClick={e => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-label="Mais opções"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--pc-border)] bg-white text-[var(--pc-text-secondary)] shadow-2xs transition hover:border-[var(--pc-action)] hover:text-[var(--pc-action)] disabled:opacity-50"
      >
        <MoreHorizontal size={15} />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-48 rounded-xl border border-[var(--pc-border)] bg-white p-1.5 text-xs font-medium text-[var(--pc-text)] shadow-xl animate-in fade-in zoom-in-95 duration-100"
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
                onEdit();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[var(--pc-text)] hover:bg-[var(--pc-surface-subtle)]"
            >
              <Pencil size={14} className="text-[var(--pc-text-muted)]" />
              Editar serviço
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onDuplicate();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[var(--pc-text)] hover:bg-[var(--pc-surface-subtle)]"
            >
              <Copy size={14} className="text-[var(--pc-text-muted)]" />
              Duplicar serviço
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onToggleActive();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[var(--pc-text)] hover:bg-[var(--pc-surface-subtle)]"
            >
              <CheckCircle2 size={14} className={service.active ? 'text-rose-500' : 'text-emerald-500'} />
              {service.active ? 'Inativar serviço' : 'Ativar serviço'}
            </button>
            <div className="my-1 border-t border-[var(--pc-border)]" />
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={14} />
              Excluir serviço
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function PetshopServicesPage() {
  const [items, setItems] = useState<PetService[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [stagesModalOpen, setStagesModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPet, setSelectedPet] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name_asc');

  const load = (showLoading = true) => {
    if (showLoading) setLoading(true);
    return api
      .get<PetService[]>('/petshop/services', { params: { includeInactive: true } })
      .then(response => setItems(response.data))
      .catch(() => toast.error('Erro ao carregar serviços.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  // KPIs
  const kpis = useMemo(() => {
    const total = items.length;
    const active = items.filter(s => s.active).length;
    const combos = items.filter(s => s.serviceType === 'COMBO').length;
    const activeItems = items.filter(s => s.active);

    const avgMinutes =
      activeItems.length > 0
        ? Math.round(activeItems.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0) / activeItems.length)
        : 0;

    const avgTicket =
      activeItems.length > 0
        ? activeItems.reduce((acc, curr) => acc + Number(curr.price || 0), 0) / activeItems.length
        : 0;

    return { total, active, combos, avgMinutes, avgTicket };
  }, [items]);

  // Lista de serviços com metadados parseados
  const parsedItems = useMemo(() => {
    return items.map(item => {
      const meta = parseServiceMetadata(item);
      return {
        ...item,
        meta: {
          ...meta,
          category: item.category || meta.category,
        },
      };
    });
  }, [items]);

  // Lista filtrada e ordenada
  const filteredItems = useMemo(() => {
    let result = parsedItems.filter(item => {
      // Tipo (Individual vs Combo)
      if (selectedType !== 'all') {
        const itType = item.serviceType || 'INDIVIDUAL';
        if (itType !== selectedType) return false;
      }

      // Busca
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = (item.description || item.meta.cleanDescription || '').toLowerCase().includes(query);
        const matchesCat = (item.category || item.meta.category).toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesCat) return false;
      }

      // Categoria
      if (selectedCategory !== 'all') {
        const itCat = item.category || item.meta.category;
        if (itCat !== selectedCategory) return false;
      }

      // Pets
      if (selectedPet !== 'all') {
        if (selectedPet === 'Cães' && item.meta.targetPets !== 'Cães' && item.meta.targetPets !== 'Cães e Gatos') {
          return false;
        }
        if (selectedPet === 'Gatos' && item.meta.targetPets !== 'Gatos' && item.meta.targetPets !== 'Cães e Gatos') {
          return false;
        }
      }

      // Status
      if (selectedStatus === 'active' && !item.active) return false;
      if (selectedStatus === 'inactive' && item.active) return false;

      return true;
    });

    // Ordenação
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_desc':
          return b.name.localeCompare(a.name, 'pt-BR');
        case 'price_asc':
          return Number(a.price) - Number(b.price);
        case 'price_desc':
          return Number(b.price) - Number(a.price);
        case 'duration_asc':
          return a.durationMinutes - b.durationMinutes;
        case 'duration_desc':
          return b.durationMinutes - a.durationMinutes;
        case 'name_asc':
        default:
          return a.name.localeCompare(b.name, 'pt-BR');
      }
    });

    return result;
  }, [parsedItems, search, selectedType, selectedCategory, selectedPet, selectedStatus, sortBy]);

  const openNew = () => {
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (item: typeof parsedItems[number]) => {
    setEditingId(item.id);
    setModalOpen(true);
  };

  const handleDuplicate = async (item: typeof parsedItems[number]) => {
    try {
      const payload: any = {
        name: `${item.name} (Cópia)`,
        description: item.description || item.meta.cleanDescription,
        category: item.category || item.meta.category,
        targetSpecies: item.targetSpecies || 'all',
        durationMinutes: item.durationMinutes,
        price: Number(item.price),
        color: item.color || '#0d9488',
        serviceType: item.serviceType || 'INDIVIDUAL',
        comboPricingType: item.comboPricingType,
        comboDiscountValue: item.comboDiscountValue ? Number(item.comboDiscountValue) : undefined,
      };

      if (Array.isArray(item.comboItems) && item.comboItems.length > 0) {
        payload.comboItems = item.comboItems.map((ci, idx) => ({
          componentServiceId: ci.componentServiceId,
          quantity: ci.quantity,
          order: idx,
        }));
      }

      if (Array.isArray(item.pricingRules) && item.pricingRules.length > 0) {
        payload.pricingRules = item.pricingRules.map(r => ({
          species: r.species,
          size: r.size,
          coatType: r.coatType,
          price: Number(r.price),
          durationMinutes: r.durationMinutes,
          label: r.label,
        }));
      }

      await api.post('/petshop/services', payload);
      toast.success('Serviço duplicado com sucesso!');
      void load(false);
    } catch {
      toast.error('Erro ao duplicar serviço.');
    }
  };

  const toggleStatus = async (item: PetService) => {
    setUpdatingId(item.id);
    try {
      await api.patch(`/petshop/services/${item.id}`, { active: !item.active });
      toast.success(item.active ? 'Serviço inativado.' : 'Serviço ativado.');
      void load(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao alterar status do serviço.');
    } finally {
      setUpdatingId('');
    }
  };

  const handleDelete = async (item: PetService) => {
    if (!window.confirm(`Deseja realmente excluir o serviço "${item.name}"?`)) return;
    setUpdatingId(item.id);
    try {
      await api.delete(`/petshop/services/${item.id}`);
      toast.success('Serviço excluído.');
      void load(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível excluir o serviço.');
    } finally {
      setUpdatingId('');
    }
  };

  const exportCsv = () => {
    if (filteredItems.length === 0) {
      toast.info('Nenhum serviço para exportar.');
      return;
    }

    const headers = ['Serviço', 'Categoria', 'Duração (min)', 'Preço (R$)', 'Para quais pets', 'Status'];
    const rows = filteredItems.map(item => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.meta.category}"`,
      item.durationMinutes,
      Number(item.price).toFixed(2),
      `"${item.meta.targetPets}"`,
      item.active ? 'Ativo' : 'Inativo',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `catalogo-servicos-petshop-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Arquivo CSV exportado com sucesso.');
  };

  return (
    <div className={pageClass}>
      <PageHeader
        eyebrow="Catálogo operacional"
        title="Serviços"
        description="Duração e preço utilizados nos agendamentos."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setStagesModalOpen(true)}
              title="Personalizar nomes das etapas e criar etapas adicionais para o Pet Shop"
            >
              <Workflow aria-hidden="true" className="mr-1.5 inline text-teal-700" size={17} />
              Etapas da Loja
            </button>
            <button type="button" className={primaryButton} onClick={openNew}>
              <Plus aria-hidden="true" className="mr-1.5 inline" size={17} />
              Novo serviço
            </button>
          </div>
        }
      />

      {/* 4 Cards de KPI */}
      <section aria-label="Indicadores de serviços" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1: Cadastrados */}
        <div className="flex items-center gap-4 rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <ClipboardList size={22} />
          </div>
          <div>
            <strong className="text-2xl font-bold tabular-nums text-slate-800">{kpis.total}</strong>
            <p className="text-xs font-medium text-slate-500">
              {kpis.combos > 0 ? `${kpis.combos} combos ativos` : 'serviços cadastrados'}
            </p>
          </div>
        </div>

        {/* KPI 2: Ativos */}
        <div className="flex items-center gap-4 rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <strong className="text-2xl font-bold tabular-nums text-slate-800">{kpis.active}</strong>
            <p className="text-xs font-medium text-slate-500">ativos</p>
          </div>
        </div>

        {/* KPI 3: Tempo Médio */}
        <div className="flex items-center gap-4 rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <Clock size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Tempo médio</p>
            <strong className="text-2xl font-bold tabular-nums text-slate-800">{kpis.avgMinutes} min</strong>
          </div>
        </div>

        {/* KPI 4: Ticket Médio */}
        <div className="flex items-center gap-4 rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-purple-50 text-purple-600 ring-1 ring-purple-100">
            <Tag size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Ticket médio</p>
            <strong className="text-2xl font-bold tabular-nums text-slate-800">{money(kpis.avgTicket)}</strong>
          </div>
        </div>
      </section>

      {/* Abas do Catálogo */}
      <CatalogTabs />

      {/* Barra de Filtros */}
      <section aria-label="Filtros de serviços" className="mb-5 flex flex-wrap items-center gap-3">
        {/* Campo de Busca */}
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar serviço..."
            className="h-11 w-full rounded-xl border border-[var(--pc-border)] bg-white pl-10 pr-3 text-sm text-[var(--pc-text)] placeholder:text-slate-400 focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15 shadow-2xs transition"
          />
        </div>

        {/* Filtro Tipo de Serviço (Individual vs Combo) */}
        <div className="relative">
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-[var(--pc-border)] bg-white px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15"
          >
            <option value="all">Todos os tipos</option>
            <option value="INDIVIDUAL">Serviços individuais</option>
            <option value="COMBO">Combos de serviços</option>
          </select>
        </div>

        {/* Filtro Categoria */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-[var(--pc-border)] bg-white px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15"
          >
            <option value="all">Todas as categorias</option>
            <option value="Higiene e Estética">Higiene e Estética</option>
            <option value="Saúde">Saúde</option>
            <option value="Estética e Spa">Estética e Spa</option>
            <option value="Outros">Outros</option>
          </select>
        </div>

        {/* Filtro Portes / Pets */}
        <div className="relative">
          <select
            value={selectedPet}
            onChange={e => setSelectedPet(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-[var(--pc-border)] bg-white px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15"
          >
            <option value="all">Todos os portes</option>
            <option value="Cães e Gatos">Cães e Gatos</option>
            <option value="Cães">Apenas Cães</option>
            <option value="Gatos">Apenas Gatos</option>
          </select>
        </div>

        {/* Filtro Status */}
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-[var(--pc-border)] bg-white px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15"
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>

        {/* Ordenação */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-[var(--pc-border)] bg-white px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15"
          >
            <option value="name_asc">Ordenar por nome (A-Z)</option>
            <option value="name_desc">Ordenar por nome (Z-A)</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
            <option value="duration_asc">Menor duração</option>
            <option value="duration_desc">Maior duração</option>
          </select>
        </div>

        {/* Botão Exportar */}
        <button
          type="button"
          onClick={exportCsv}
          className="flex h-11 items-center gap-2 rounded-xl border border-[var(--pc-border)] bg-white px-4 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-[var(--pc-action)]"
        >
          <Download size={16} />
          Exportar
        </button>
      </section>

      {/* Tabela de Serviços */}
      <section aria-label="Lista de serviços" className="pc-panel min-h-[350px] overflow-visible rounded-2xl border border-[var(--pc-border)] bg-white shadow-2xs">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Scissors}
            title="Nenhum serviço encontrado"
            description={
              items.length === 0
                ? 'Cadastre os serviços oferecidos para disponibilizá-los na agenda e atendimentos.'
                : 'Nenhum serviço corresponde aos filtros selecionados. Tente ajustar os termos de busca.'
            }
            action={
              items.length === 0 ? (
                <button type="button" className={primaryButton} onClick={openNew}>
                  <Plus aria-hidden="true" className="mr-1.5 inline" size={16} />
                  Cadastrar serviço
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSelectedCategory('all');
                    setSelectedPet('all');
                    setSelectedStatus('all');
                  }}
                  className={secondaryButton}
                >
                  Limpar filtros
                </button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[var(--pc-text)]">
              <thead>
                <tr className="border-b border-[var(--pc-border)] bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th scope="col" className="px-5 py-3.5">
                    Serviço
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Categoria
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Duração
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Preço
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Para quais pets?
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pc-border)]">
                {filteredItems.map(item => {
                  const iconInfo = getServiceIconInfo(item.name, item.meta.category, item.color);
                  const IconComponent = iconInfo.icon;
                  const isSaude = item.meta.category === 'Saúde';
                  const isCombo = item.serviceType === 'COMBO';
                  const hasVariants = (item.pricingRules && item.pricingRules.length > 0) || Boolean(item.priceRange?.hasVariants);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-slate-50/60 ${item.active ? '' : 'bg-slate-50/30 opacity-65'}`}
                    >
                      {/* Coluna Serviço */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3.5">
                          <div
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                              isCombo
                                ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200/60'
                                : `${iconInfo.bg} ${iconInfo.text} ring-1 ${iconInfo.ring}`
                            }`}
                          >
                            {isCombo ? <Layers size={18} /> : <IconComponent size={18} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="block truncate text-sm font-semibold text-slate-900">{item.name}</strong>
                              {isCombo && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                                  <Layers size={11} /> Combo ({item.comboItems?.length || 0} serviços)
                                </span>
                              )}
                              {hasVariants && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                                  5 Portes Configurados
                                </span>
                              )}
                            </div>
                            {/* Pílulas de valores rápidos por porte */}
                            {Array.isArray(item.pricingRules) && item.pricingRules.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {['mini', 'small', 'medium', 'large', 'giant'].map(sz => {
                                  const rule = item.pricingRules?.find(r => r.size === sz && (!r.coatType || r.coatType === 'all'));
                                  if (!rule) return null;
                                  const shortNames: Record<string, string> = { mini: 'Mini', small: 'P', medium: 'M', large: 'G', giant: 'GG' };
                                  return (
                                    <span
                                      key={sz}
                                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 border border-slate-200/80"
                                      title={`Porte ${shortNames[sz]}: ${money(rule.price)}`}
                                    >
                                      <span className="font-bold text-slate-600">{shortNames[sz]}:</span>
                                      <span className="font-semibold text-teal-800 tabular-nums">{money(rule.price)}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                              {item.meta.cleanDescription || 'Sem descrição cadastrada.'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Coluna Categoria */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            isCombo
                              ? 'border border-purple-200/80 bg-purple-50 text-purple-700'
                              : isSaude
                              ? 'border border-rose-200/80 bg-rose-50 text-rose-700'
                              : 'border border-emerald-200/80 bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <Tag size={12} className={isCombo ? 'text-purple-500' : isSaude ? 'text-rose-500' : 'text-emerald-500'} />
                          {isCombo ? 'Combo Promocional' : item.meta.category}
                        </span>
                      </td>

                      {/* Coluna Duração */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <Clock size={14} className="text-slate-400" />
                          {item.priceRange?.minDuration !== undefined &&
                          item.priceRange.maxDuration !== undefined &&
                          item.priceRange.minDuration !== item.priceRange.maxDuration
                            ? `${item.priceRange.minDuration} a ${item.priceRange.maxDuration} min`
                            : `${item.durationMinutes} min`}
                        </span>
                      </td>

                      {/* Coluna Preço */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <strong className="text-sm font-bold tabular-nums text-slate-900">
                            {item.priceRange?.formattedRange || money(item.price)}
                          </strong>
                          {hasVariants && (
                            <span className="text-[10px] font-medium text-slate-400">
                              por porte/pelagem
                            </span>
                          )}
                          {isCombo && item.comboDiscountValue && (
                            <span className="text-[10px] font-bold text-emerald-600">
                              {item.comboPricingType === 'PERCENT_DISCOUNT'
                                ? `${item.comboDiscountValue}% OFF`
                                : item.comboPricingType === 'FIXED_DISCOUNT'
                                ? `Economia de ${money(item.comboDiscountValue)}`
                                : 'Preço Especial'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Coluna Para quais pets? */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                          <span className="flex items-center gap-1 text-slate-400">
                            <PawPrint size={15} className="text-amber-600/70" />
                          </span>
                          <span>{item.meta.targetPets}</span>
                        </div>
                      </td>

                      {/* Coluna Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.active
                              ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-700'
                              : 'border border-rose-200/80 bg-rose-50 text-rose-700'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          />
                          {item.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      {/* Coluna Ações */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {/* Editar */}
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            title="Editar serviço"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--pc-border)] bg-white text-slate-600 shadow-2xs transition hover:border-[var(--pc-action)] hover:text-[var(--pc-action)]"
                          >
                            <Pencil size={14} />
                          </button>

                          {/* Duplicar */}
                          <button
                            type="button"
                            onClick={() => handleDuplicate(item)}
                            title="Duplicar serviço"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--pc-border)] bg-white text-slate-600 shadow-2xs transition hover:border-[var(--pc-action)] hover:text-[var(--pc-action)]"
                          >
                            <Copy size={14} />
                          </button>

                          {/* Menu suspenso em portal */}
                          <ServiceRowActionsMenu
                            service={item}
                            onEdit={() => openEdit(item)}
                            onDuplicate={() => handleDuplicate(item)}
                            onToggleActive={() => toggleStatus(item)}
                            onDelete={() => handleDelete(item)}
                            updating={updatingId === item.id}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ManageStoreStagesModal
        isOpen={stagesModalOpen}
        onClose={() => setStagesModalOpen(false)}
        onUpdated={() => void load(false)}
      />

      {/* Modal Avançado de Criação / Edição de Serviço e Combos */}
      {modalOpen && (
        <ServiceEditorModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingId(null);
          }}
          serviceId={editingId}
          existingServices={items}
          onSaved={() => {
            setModalOpen(false);
            setEditingId(null);
            void load(false);
          }}
        />
      )}
    </div>
  );
}
