import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
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
  Bath,
  ChevronDown,
  Package,
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
    cleanDescription = rawDesc.replace(metaMatch[0], '').replace(/\[icon:[a-z_]+\].*/gi, '').trim();
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

const SIZES_ORDER = [
  { key: 'mini', label: 'Mini' },
  { key: 'small', label: 'P' },
  { key: 'medium', label: 'M' },
  { key: 'large', label: 'G' },
  { key: 'giant', label: 'GG' },
];

function getPricesBySize(service: PetService) {
  if (!service.pricingRules || service.pricingRules.length === 0) return null;
  const rules = service.pricingRules;
  return SIZES_ORDER.map(s => {
    const match = rules.find(r => r.size?.toLowerCase() === s.key);
    return {
      key: s.key,
      label: s.label,
      price: match ? money(match.price) : money(service.price),
    };
  });
}

function inferIconFromName(name: string, category?: string): string {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (n.includes('tosa') || n.includes('trim') || n.includes('máquina')) return 'scissors';
  if (n.includes('unha') || n.includes('pata') || n.includes('patas')) return 'nail';
  if (n.includes('pulga') || n.includes('carrapato') || n.includes('medicament') || n.includes('dermat') || n.includes('antipulga')) return 'flea';
  if (n.includes('hidrata') || n.includes('spa') || n.includes('cauteriz') || n.includes('ozônio') || n.includes('estética') || c.includes('spa')) return 'spa';
  if (n.includes('vacina') || n.includes('consulta') || n.includes('veterin') || n.includes('exame') || n.includes('saúde') || c.includes('saúde')) return 'health';
  if (n.includes('banho') || n.includes('ducha') || n.includes('higien') || c.includes('higiene')) return 'bath';
  return 'bath';
}

function getServiceIconInfo(service: PetService) {
  const rawDesc = service.description || '';
  const match = rawDesc.match(/\[icon:([a-z_]+)\]/i);
  const iconKey = match ? match[1] : inferIconFromName(service.name, service.category);

  switch (iconKey) {
    case 'bath':
      return { icon: Bath, bg: 'bg-emerald-50', text: 'text-teal-700', border: 'border-emerald-200/80', ring: 'ring-emerald-200/60', label: 'Banho' };
    case 'scissors':
      return { icon: Scissors, bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200/80', ring: 'ring-sky-200/60', label: 'Tosa' };
    case 'nail':
      return { icon: PawPrint, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/80', ring: 'ring-amber-200/60', label: 'Corte de Unha' };
    case 'flea':
      return { icon: Droplets, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/80', ring: 'ring-emerald-200/60', label: 'Antipulga' };
    case 'spa':
      return { icon: Sparkles, bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200/80', ring: 'ring-purple-200/60', label: 'Hidratação & Spa' };
    case 'health':
      return { icon: Stethoscope, bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200/80', ring: 'ring-rose-200/60', label: 'Saúde / Vacina' };
    default:
      return { icon: Bath, bg: 'bg-emerald-50', text: 'text-teal-700', border: 'border-emerald-200/80', ring: 'ring-emerald-200/60', label: 'Serviço' };
  }
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
      {/* 1. Cabeçalho - Mobile (Idêntico ao layout solicitado com arte no topo) */}
      <div className="md:hidden relative mb-4 rounded-3xl border border-zinc-200/90 bg-white p-4 shadow-2xs overflow-hidden">
        {/* Arte vetorial suave de cão e gato ao fundo à direita */}
        <div className="pointer-events-none absolute -right-2 -top-2 w-36 h-32 select-none text-emerald-600">
          <svg viewBox="0 0 160 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full opacity-60">
            <ellipse cx="120" cy="50" rx="14" ry="16" fill="currentColor" fillOpacity="0.15" />
            <ellipse cx="98" cy="38" rx="8" ry="10" fill="currentColor" fillOpacity="0.15" />
            <ellipse cx="118" cy="22" rx="7" ry="9" fill="currentColor" fillOpacity="0.15" />
            <ellipse cx="140" cy="30" rx="7" ry="9" fill="currentColor" fillOpacity="0.15" />
            <path d="M75 110 C70 85 90 70 105 70 C120 70 135 85 130 110" stroke="#0d6e5a" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.45" />
            <path d="M80 82 C75 75 72 65 78 60 C85 55 90 68 90 75" stroke="#0d6e5a" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.45" />
            <path d="M125 80 C130 75 138 62 132 58 C125 54 120 68 120 75" stroke="#0d6e5a" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.45" />
            <circle cx="95" cy="88" r="2.5" fill="#0d6e5a" fillOpacity="0.6" />
            <circle cx="115" cy="88" r="2.5" fill="#0d6e5a" fillOpacity="0.6" />
            <path d="M102 96 C105 99 107 99 110 96" stroke="#0d6e5a" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
            <path d="M135 45 C132 40 138 35 142 38 C146 35 152 40 149 45 L142 52 Z" fill="#0d6e5a" fillOpacity="0.4" />
          </svg>
        </div>

        <div className="relative pr-20">
          <span className="text-xs font-semibold text-teal-800">Catálogo operacional</span>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 mt-0.5">
            Serviços
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 leading-snug">
            Duração e preço utilizados nos agendamentos.
          </p>
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStagesModalOpen(true)}
            className="flex-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2.5 px-3 text-xs font-bold text-zinc-700 shadow-2xs hover:bg-zinc-50 transition cursor-pointer"
          >
            <Workflow size={15} className="text-teal-700" />
            <span>Etapas da Loja</span>
          </button>
          <button
            type="button"
            onClick={openNew}
            className="flex-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0d6e5a] py-2.5 px-3 text-xs font-bold text-white shadow-xs hover:bg-[#0a5747] transition cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Novo serviço</span>
          </button>
        </div>
      </div>

      {/* 1. Cabeçalho - Desktop */}
      <div className="hidden md:block">
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
      </div>

      {/* 2. KPIs - Mobile (4 colunas compactas com ícones e valores rigorosamente alinhados) */}
      <section aria-label="Indicadores mobile" className="md:hidden mb-4 grid grid-cols-4 gap-1.5">
        <div className="rounded-2xl border border-zinc-200/90 bg-white px-2 py-2.5 shadow-2xs flex flex-col items-start">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ClipboardList size={16} />
          </div>
          <div className="mt-2.5 w-full min-w-0">
            <strong className="flex h-5 items-center text-[13.5px] font-black tracking-tight text-zinc-900 tabular-nums leading-none whitespace-nowrap">
              {kpis.total}
            </strong>
            <p className="mt-1 text-[10px] text-zinc-500 leading-tight">serviços cadastrados</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white px-2 py-2.5 shadow-2xs flex flex-col items-start">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={16} />
          </div>
          <div className="mt-2.5 w-full min-w-0">
            <strong className="flex h-5 items-center text-[13.5px] font-black tracking-tight text-zinc-900 tabular-nums leading-none whitespace-nowrap">
              {kpis.active}
            </strong>
            <p className="mt-1 text-[10px] text-zinc-500 leading-tight">ativos</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white px-2 py-2.5 shadow-2xs flex flex-col items-start">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
            <Clock size={16} />
          </div>
          <div className="mt-2.5 w-full min-w-0">
            <strong className="flex h-5 items-center text-[13.5px] font-black tracking-tight text-zinc-900 tabular-nums leading-none whitespace-nowrap">
              {kpis.avgMinutes} min
            </strong>
            <p className="mt-1 text-[10px] text-zinc-500 leading-tight">Tempo médio</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white px-2 py-2.5 shadow-2xs flex flex-col items-start">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-700">
            <Tag size={16} />
          </div>
          <div className="mt-2.5 w-full min-w-0">
            <strong className="flex h-5 items-center text-[13.5px] font-black tracking-tight text-zinc-900 tabular-nums leading-none whitespace-nowrap">
              {money(kpis.avgTicket)}
            </strong>
            <p className="mt-1 text-[10px] text-zinc-500 leading-tight">Ticket médio</p>
          </div>
        </div>
      </section>

      {/* 2. KPIs - Desktop */}
      <section aria-label="Indicadores desktop" className="hidden md:grid mb-6 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

        <div className="flex items-center gap-4 rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <strong className="text-2xl font-bold tabular-nums text-slate-800">{kpis.active}</strong>
            <p className="text-xs font-medium text-slate-500">ativos</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <Clock size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Tempo médio</p>
            <strong className="text-2xl font-bold tabular-nums text-slate-800">{kpis.avgMinutes} min</strong>
          </div>
        </div>

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

      {/* Abas do Catálogo - Mobile (Exato mockup) */}
      <nav aria-label="Seções do catálogo mobile" className="md:hidden mb-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <NavLink
          to="/petshop/servicos"
          className={({ isActive }) =>
            `flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap shadow-xs ${
              isActive ? 'bg-[#0d6e5a] text-white' : 'bg-white border border-zinc-200/90 text-zinc-600 hover:text-zinc-900'
            }`
          }
        >
          <PawPrint size={15} />
          <span>Serviços</span>
        </NavLink>
        <NavLink
          to="/petshop/produtos"
          className={({ isActive }) =>
            `flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition whitespace-nowrap ${
              isActive ? 'bg-[#0d6e5a] text-white font-bold' : 'text-zinc-600 hover:text-zinc-900'
            }`
          }
        >
          <Package size={15} />
          <span>Produtos</span>
        </NavLink>
        <NavLink
          to="/petshop/edicao-massa"
          className={({ isActive }) =>
            `flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition whitespace-nowrap ${
              isActive ? 'bg-[#0d6e5a] text-white font-bold' : 'text-zinc-600 hover:text-zinc-900'
            }`
          }
        >
          <Layers size={15} />
          <span>Edição em Massa</span>
        </NavLink>
        <NavLink
          to="/petshop/entrada-estoque"
          className={({ isActive }) =>
            `flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition whitespace-nowrap ${
              isActive ? 'bg-[#0d6e5a] text-white font-bold' : 'text-zinc-600 hover:text-zinc-900'
            }`
          }
        >
          <Download size={15} />
          <span>Entrada / Lotes</span>
        </NavLink>
      </nav>

      {/* Abas do Catálogo - Desktop */}
      <div className="hidden md:block">
        <CatalogTabs />
      </div>

      {/* 3. Filtros - Mobile (Estruturado em card idêntico ao mockup) */}
      <section
        className="md:hidden mb-4 rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xs space-y-2.5"
        aria-label="Filtros de serviços mobile"
      >
        {/* Linha 1: Busca */}
        <div className="relative w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar serviço..."
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

        {/* Linha 2: Tipos e Categorias */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-700 pointer-events-none" />
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-8 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">Todos os tipos</option>
              <option value="INDIVIDUAL">Serviços individuais</option>
              <option value="COMBO">Combos de serviços</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative">
            <Layers size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-700 pointer-events-none" />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-8 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">Todas as categorias</option>
              <option value="Higiene e Estética">Higiene e Estética</option>
              <option value="Saúde">Saúde</option>
              <option value="Estética e Spa">Estética e Spa</option>
              <option value="Outros">Outros</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
        </div>

        {/* Linha 3: Portes e Status */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <PawPrint size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-700 pointer-events-none" />
            <select
              value={selectedPet}
              onChange={e => setSelectedPet(e.target.value)}
              className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-8 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">Todos os portes</option>
              <option value="Cães e Gatos">Cães e Gatos</option>
              <option value="Cães">Apenas Cães</option>
              <option value="Gatos">Apenas Gatos</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative">
            <CheckCircle2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-700 pointer-events-none" />
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-8 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
        </div>

        {/* Linha 4: Ordenação e Botão Exportar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <ArrowUpDown size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-700 pointer-events-none" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="h-10 w-full appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white pl-8 pr-8 text-xs font-medium text-zinc-700 outline-none hover:bg-zinc-50"
            >
              <option value="name_asc">Ordenar por nome (A-Z)</option>
              <option value="name_desc">Ordenar por nome (Z-A)</option>
              <option value="price_asc">Menor preço</option>
              <option value="price_desc">Maior preço</option>
              <option value="duration_asc">Menor duração</option>
              <option value="duration_desc">Maior duração</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-teal-200/80 bg-emerald-50/80 px-3 text-xs font-bold text-teal-900 shadow-2xs hover:bg-emerald-100 transition cursor-pointer shrink-0"
          >
            <Download size={14} className="text-teal-800" />
            <span>Exportar</span>
          </button>
        </div>
      </section>

      {/* 3. Filtros - Desktop */}
      <section aria-label="Filtros de serviços desktop" className="hidden md:flex mb-5 flex-wrap items-center gap-3">
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

        {/* Filtro Tipo de Serviço */}
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

      {/* 4. Lista de Serviços - Mobile (Cards fieis ao layout solicitado) */}
      <div className="md:hidden space-y-3 mb-6">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Scissors}
            title="Nenhum serviço encontrado"
            description="Nenhum serviço corresponde aos filtros selecionados."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedType('all');
                  setSelectedCategory('all');
                  setSelectedPet('all');
                  setSelectedStatus('all');
                }}
                className="mt-2 rounded-xl bg-teal-50 px-4 py-2 text-xs font-bold text-teal-800 border border-teal-200"
              >
                Limpar filtros
              </button>
            }
          />
        ) : (
          filteredItems.map(item => {
            const iconInfo = getServiceIconInfo(item);
            const IconComp = iconInfo.icon;
            const sizePrices = getPricesBySize(item);

            return (
              <div
                key={item.id}
                onClick={() => openEdit(item)}
                className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 shadow-2xs space-y-3 cursor-pointer hover:border-teal-300 transition"
              >
                {/* Linha superior: Ícone grande + Nome/Categoria + Duração e Ações */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-teal-700 shrink-0 border border-emerald-100/80">
                      <IconComp size={28} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-zinc-900 truncate">
                          {item.name}
                        </h3>
                        {!item.active && (
                          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                            Inativo
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 border border-emerald-200/60 mt-1">
                        <Tag size={10} />
                        {item.category || item.meta.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                      <Clock size={12} />
                      {item.durationMinutes} min
                    </span>
                    <ServiceRowActionsMenu
                      service={item}
                      onEdit={() => openEdit(item)}
                      onDuplicate={() => void handleDuplicate(item)}
                      onToggleActive={() => void toggleStatus(item)}
                      onDelete={() => void handleDelete(item)}
                      updating={updatingId === item.id}
                    />
                  </div>
                </div>

                {/* Linha inferior: Preços por Porte ou Preço Único */}
                {sizePrices ? (
                  <div className="rounded-xl bg-zinc-50/80 p-2.5 border border-zinc-100/90">
                    <span className="text-[11px] font-bold text-zinc-600 flex items-center gap-1.5 mb-2">
                      <PawPrint size={13} className="text-teal-700" /> Preços por porte
                    </span>
                    <div className="grid grid-cols-5 gap-1.5 text-center">
                      {sizePrices.map((sp: { key: string; label: string; price: string }) => (
                        <div key={sp.key} className="rounded-lg bg-white border border-zinc-200/80 p-1.5 shadow-2xs">
                          <span className="block text-[9px] font-bold text-zinc-500 uppercase">{sp.label}</span>
                          <strong className="block text-[11px] sm:text-xs font-black text-teal-800 tabular-nums">
                            {sp.price}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl bg-zinc-50/80 px-3 py-2 border border-zinc-100/90 text-xs">
                    <span className="text-zinc-500 font-medium">Preço individual</span>
                    <strong className="text-sm font-black text-teal-800 tabular-nums">
                      {money(item.price)}
                    </strong>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 4. Tabela de Serviços - Desktop */}
      <section aria-label="Lista de serviços desktop" className="hidden md:block pc-panel min-h-[350px] overflow-visible rounded-2xl border border-[var(--pc-border)] bg-white shadow-2xs">
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
                    Para quais pets
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
                  const iconInfo = getServiceIconInfo(item);
                  const IconComponent = iconInfo.icon;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => openEdit(item)}
                      className="cursor-pointer transition hover:bg-[var(--pc-surface-subtle)]/60"
                    >
                      {/* Coluna Serviço */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`grid h-10 w-10 place-items-center rounded-xl ${iconInfo.bg} ${iconInfo.text} ring-1 ${iconInfo.border} shrink-0`}
                          >
                            <IconComponent size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[var(--pc-text)]">{item.name}</span>
                              {item.serviceType === 'COMBO' && (
                                <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                                  Combo
                                </span>
                              )}
                            </div>
                            {item.meta.cleanDescription && (
                              <p className="line-clamp-1 max-w-xs text-xs text-[var(--pc-text-muted)]">
                                {item.meta.cleanDescription}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Coluna Categoria */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md bg-[var(--pc-surface-subtle)] px-2 py-1 text-xs font-medium text-[var(--pc-text-secondary)]">
                          {item.meta.category}
                        </span>
                      </td>

                      {/* Coluna Duração */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Clock size={13} className="text-slate-400" />
                          {item.durationMinutes} min
                        </span>
                      </td>

                      {/* Coluna Preço */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <strong className="text-sm font-bold text-teal-800 tabular-nums">
                          {money(item.price)}
                        </strong>
                      </td>

                      {/* Coluna Pets */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-600">
                          {item.meta.targetPets}
                        </span>
                      </td>

                      {/* Coluna Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      {/* Coluna Ações */}
                      <td className="px-5 py-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            title="Editar serviço"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--pc-border)] bg-white text-slate-600 shadow-2xs transition hover:border-[var(--pc-action)] hover:text-[var(--pc-action)]"
                          >
                            <Pencil size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDuplicate(item)}
                            title="Duplicar serviço"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--pc-border)] bg-white text-slate-600 shadow-2xs transition hover:border-[var(--pc-action)] hover:text-[var(--pc-action)]"
                          >
                            <Copy size={14} />
                          </button>

                          <ServiceRowActionsMenu
                            service={item}
                            onEdit={() => openEdit(item)}
                            onDuplicate={() => void handleDuplicate(item)}
                            onToggleActive={() => void toggleStatus(item)}
                            onDelete={() => void handleDelete(item)}
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
