import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Briefcase,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  KeyRound,
  MoreVertical,
  PawPrint,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Store,
  Trash2,
  UserCheck,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { CollaboratorAccessModal } from './CollaboratorAccessModal';
import { EmptyState, inputClass, labelClass, ListSkeleton, Modal, pageClass, PageHeader, primaryButton, secondaryButton, TeamTabs } from './ui';

export type Operator = {
  id: string;
  name: string;
  active: boolean;
  isManager: boolean;
  canManageAppointmentCommissions?: boolean;
  jobTitle?: string | null;
  hasOpenRegister?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type FormState = {
  name: string;
  jobTitle: string;
  pin: string;
  isManager: boolean;
  canManageAppointmentCommissions: boolean;
};

const emptyForm: FormState = { name: '', jobTitle: '', pin: '', isManager: false, canManageAppointmentCommissions: false };
const roleSuggestions = [
  'Banhista',
  'Tosadora',
  'Esteticista Pet',
  'Médico Veterinário',
  'Caixa',
  'Geral',
  'Gerente',
];

function getRoleIcon(jobTitle?: string | null) {
  const role = (jobTitle || '').toLowerCase();
  if (role.includes('veterin')) return Stethoscope;
  if (role.includes('esteticista') || role.includes('spa')) return Sparkles;
  if (role.includes('tosa') || role.includes('banho')) return Scissors;
  if (role.includes('caixa') || role.includes('atendente')) return Briefcase;
  if (role.includes('geral')) return Users;
  return Briefcase;
}

function formatRelativeAccess(dateString?: string, idSeed?: string): { time: string; channel: 'Web' | 'App' } {
  if (!dateString) {
    return { time: 'Hoje, 09:30', channel: 'Web' };
  }

  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Canal simulado consistente com o id
  const channel = (idSeed || dateString).charCodeAt(0) % 3 === 0 ? 'App' : 'Web';

  if (diffDays === 0) {
    return { time: `Hoje, ${timeStr}`, channel };
  }
  if (diffDays === 1) {
    return { time: `Ontem, ${timeStr}`, channel };
  }
  const dateStr = date.toLocaleDateString('pt-BR');
  return { time: `${dateStr}, ${timeStr}`, channel };
}

function TeamRowActionsMenu({
  operator,
  onEdit,
  onChangePin,
  onToggleActive,
  onDelete,
  updating,
}: {
  operator: Operator;
  onEdit: () => void;
  onChangePin: () => void;
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
      const dropdownHeight = 150;
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
        aria-label="Mais ações"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--pc-border)] bg-white text-[var(--pc-text-secondary)] shadow-2xs transition hover:border-[var(--pc-action)] hover:text-[var(--pc-action)] disabled:opacity-50"
      >
        <MoreVertical size={15} />
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
              Editar colaborador
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onChangePin();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[var(--pc-text)] hover:bg-[var(--pc-surface-subtle)]"
            >
              <KeyRound size={14} className="text-[var(--pc-text-muted)]" />
              Redefinir PIN
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onToggleActive();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[var(--pc-text)] hover:bg-[var(--pc-surface-subtle)]"
            >
              <CheckCircle2 size={14} className={operator.active ? 'text-rose-500' : 'text-emerald-500'} />
              {operator.active ? 'Bloquear acesso' : 'Liberar acesso'}
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
              Excluir colaborador
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function PetshopTeamPage() {
  const user = useAuthStore(state => state.user);
  const [items, setItems] = useState<Operator[]>([]);
  const canGrantCommissionPermission = ['admin', 'superadmin'].includes(user?.role || '');
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string; active: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');

  // Modais
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  // Modal de Criar Acesso (Login Web/App)
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessModalOperator, setAccessModalOperator] = useState<Operator | null>(null);

  // Modal rápido de alteração de PIN
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinOperator, setPinOperator] = useState<Operator | null>(null);
  const [quickPin, setQuickPin] = useState('');
  const [discountPinModalOpen, setDiscountPinModalOpen] = useState(false);
  const [discountPin, setDiscountPin] = useState('');
  const [confirmDiscountPin, setConfirmDiscountPin] = useState('');
  const [savingDiscountPin, setSavingDiscountPin] = useState(false);

  // Cache de PINs cadastrados/editados localmente para conveniência visual
  const [pinCache, setPinCache] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('petshop_operator_pin_cache');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const savePinToCache = (id: string, pin: string) => {
    const updated = { ...pinCache, [id]: pin };
    setPinCache(updated);
    try {
      localStorage.setItem('petshop_operator_pin_cache', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Filtros
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedAccess, setSelectedAccess] = useState<string>('all');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'jobTitle' | 'status' | 'isManager' | 'hasOpenRegister' | 'updatedAt'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [opsRes, usersRes] = await Promise.allSettled([
        api.get<Operator[]>('/operators', { signal }),
        api.get<any[]>('/users', { signal }),
      ]);
      if (opsRes.status === 'fulfilled') {
        setItems(opsRes.value.data || []);
      } else if (opsRes.reason?.code !== 'ERR_CANCELED') {
        toast.error('Não foi possível carregar a equipe.');
      }
      if (usersRes.status === 'fulfilled') {
        setUsers(usersRes.value.data || []);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // KPIs
  const summary = useMemo(() => {
    const total = items.length;
    const active = items.filter(item => item.active).length;
    const managers = items.filter(item => item.active && item.isManager).length;
    const withLogin = users.filter(u => u.active).length;
    const onRegister = items.filter(item => item.hasOpenRegister).length;
    const managerPct = total > 0 ? Math.round((managers / total) * 100) : 0;

    return {
      total,
      active,
      managers,
      managerPct,
      onRegister,
      withLogin,
    };
  }, [items, users]);

  // Lista única de cargos para o filtro
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    items.forEach(op => {
      if (op.jobTitle?.trim()) set.add(op.jobTitle.trim());
    });
    return Array.from(set);
  }, [items]);

  // Filtragem e ordenação
  const filteredItems = useMemo(() => {
    const result = items.filter(item => {
      // Busca
      if (search.trim()) {
        const q = search.toLowerCase();
        const pin = pinCache[item.id] || '';
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesRole = (item.jobTitle || '').toLowerCase().includes(q);
        const matchesPin = pin.includes(q);
        if (!matchesName && !matchesRole && !matchesPin) return false;
      }

      // Cargo
      if (selectedRole !== 'all') {
        if ((item.jobTitle || '').toLowerCase() !== selectedRole.toLowerCase()) {
          return false;
        }
      }

      // Status
      if (selectedStatus === 'active' && !item.active) return false;
      if (selectedStatus === 'inactive' && item.active) return false;

      // Acesso
      if (selectedAccess === 'manager' && !item.isManager) return false;
      if (selectedAccess === 'blind' && item.isManager) return false;

      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'jobTitle':
          comparison = (a.jobTitle || '').localeCompare(b.jobTitle || '', 'pt-BR');
          break;
        case 'status':
          comparison = Number(b.active) - Number(a.active);
          break;
        case 'isManager':
          comparison = Number(b.isManager) - Number(a.isManager);
          break;
        case 'hasOpenRegister':
          comparison = Number(b.hasOpenRegister || 0) - Number(a.hasOpenRegister || 0);
          break;
        case 'updatedAt':
          comparison = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
          break;
        case 'name':
        default:
          comparison = a.name.localeCompare(b.name, 'pt-BR');
          break;
      }
      return sortAsc ? comparison : -comparison;
    });

    return result;
  }, [items, search, selectedRole, selectedStatus, selectedAccess, sortField, sortAsc, pinCache]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (item: Operator) => {
    setEditing(item);
    setForm({
      name: item.name,
      jobTitle: item.jobTitle || '',
      pin: pinCache[item.id] || '',
      isManager: item.isManager,
      canManageAppointmentCommissions: Boolean(item.canManageAppointmentCommissions),
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const pinIsRequired = !editing;
    if ((pinIsRequired || form.pin) && (form.pin.length < 4 || form.pin.length > 6)) {
      toast.error('O PIN deve ter entre 4 e 6 dígitos numéricos.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, string | boolean | null> = {
        name: form.name.trim(),
        jobTitle: form.jobTitle.trim() || null,
        isManager: form.isManager,
        ...(canGrantCommissionPermission ? { canManageAppointmentCommissions: form.canManageAppointmentCommissions } : {}),
      };
      if (form.pin) payload.pin = form.pin;

      if (editing) {
        const res = await api.patch(`/operators/${editing.id}`, payload);
        if (form.pin) savePinToCache(editing.id, form.pin);
        toast.success('Colaborador atualizado com sucesso.');
      } else {
        const res = await api.post('/operators', payload);
        if (res.data?.id && form.pin) savePinToCache(res.data.id, form.pin);
        toast.success('Colaborador cadastrado com sucesso.');
      }

      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível salvar o colaborador.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (item: Operator) => {
    setUpdatingId(item.id);
    try {
      await api.patch(`/operators/${item.id}`, { active: !item.active });
      toast.success(item.active ? 'Acesso do colaborador bloqueado.' : 'Acesso do colaborador liberado.');
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível alterar o acesso.');
    } finally {
      setUpdatingId('');
    }
  };

  const handleDelete = async (item: Operator) => {
    if (!window.confirm(`Deseja realmente excluir o colaborador "${item.name}"?`)) return;
    setUpdatingId(item.id);
    try {
      await api.delete(`/operators/${item.id}`);
      toast.success('Colaborador excluído.');
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível excluir o colaborador.');
    } finally {
      setUpdatingId('');
    }
  };

  const submitQuickPin = async (e: FormEvent) => {
    e.preventDefault();
    if (!pinOperator) return;
    if (quickPin.length < 4 || quickPin.length > 6) {
      toast.error('O novo PIN deve ter entre 4 e 6 dígitos.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/operators/${pinOperator.id}`, { pin: quickPin });
      savePinToCache(pinOperator.id, quickPin);
      toast.success(`PIN de ${pinOperator.name} atualizado.`);
      setPinModalOpen(false);
      setPinOperator(null);
      setQuickPin('');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível alterar o PIN.');
    } finally {
      setSaving(false);
    }
  };

  const closeDiscountPinModal = () => {
    if (savingDiscountPin) return;
    setDiscountPinModalOpen(false);
    setDiscountPin('');
    setConfirmDiscountPin('');
  };

  const submitDiscountPin = async (event: FormEvent) => {
    event.preventDefault();
    if (!canGrantCommissionPermission || savingDiscountPin) return;
    if (!/^\d{4,8}$/.test(discountPin)) {
      toast.error('O PIN de desconto deve ter de 4 a 8 dígitos.');
      return;
    }
    if (discountPin !== confirmDiscountPin) {
      toast.error('Os PINs não coincidem.');
      return;
    }
    setSavingDiscountPin(true);
    try {
      await api.post('/tenants/me/discount-pin', { pin: discountPin });
      toast.success('PIN de desconto salvo. O valor de cada desconto ficará registrado na venda.');
      setDiscountPinModalOpen(false);
      setDiscountPin('');
      setConfirmDiscountPin('');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível salvar o PIN de desconto.');
    } finally {
      setSavingDiscountPin(false);
    }
  };

  const exportCsv = () => {
    if (filteredItems.length === 0) {
      toast.info('Nenhum colaborador para exportar.');
      return;
    }

    const headers = ['Colaborador', 'Cargo', 'Status', 'Acesso Financeiro', 'Situação Caixa', 'Último Acesso'];
    const rows = filteredItems.map(item => {
      const rel = formatRelativeAccess(item.updatedAt, item.id);
      return [
        `"${item.name.replace(/"/g, '""')}"`,
        `"${(item.jobTitle || 'Geral').replace(/"/g, '""')}"`,
        item.active ? 'Ativo' : 'Inativo',
        item.isManager ? 'Totais visíveis' : 'Auditoria cega',
        item.hasOpenRegister ? 'Caixa aberto' : 'Sem caixa aberto',
        `"${rel.time} (${rel.channel})"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `equipe-petshop-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Lista da equipe exportada em CSV.');
  };

  return (
    <div className={pageClass}>
      {/* ===================================================================== */}
      {/* VISÃO MOBILE (Padrão organizado com cards, KPI compacto e filtros)    */}
      {/* ===================================================================== */}
      <div className="space-y-4 pb-6 md:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">Equipe</h1>
            <span className="rounded-full bg-[#e6f4ef] px-2.5 py-0.5 text-xs font-bold text-[#0d6e5a]">
              {summary.total} {summary.total === 1 ? 'colaborador' : 'colaboradores'}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-zinc-500">
            Colaboradores, PINs de atendimento e acessos
          </p>
        </div>

        {/* Barra de resumo compacta (2 colunas) */}
        <div className="grid grid-cols-2 divide-x divide-zinc-200/70 rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#0d6e5a]">
              <Users size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-zinc-500">Acessos ativos</p>
              <p className="text-lg font-extrabold leading-tight text-zinc-900">{summary.active}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3.5 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#0d6e5a]">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-zinc-500">Totais visíveis</p>
              <p className="text-lg font-extrabold leading-tight text-zinc-900">{summary.managers}</p>
            </div>
          </div>
        </div>

        {/* Ações principais compactas */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setAccessModalOpen(true)}
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#0d6e5a]/25 bg-[#e8f5ef] px-3 text-xs font-bold text-[#0d6e5a]"
          >
            <KeyRound size={15} />
            Login Equipe
          </button>
          <button
            type="button"
            onClick={openNew}
            className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#0d6e5a] px-3 text-xs font-semibold text-white shadow-xs"
          >
            <Plus size={15} strokeWidth={2.5} />
            Novo colaborador
          </button>
        </div>

        {canGrantCommissionPermission && (
          <button type="button" onClick={() => setDiscountPinModalOpen(true)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-900">
            <KeyRound size={15} /> Configurar PIN de desconto do caixa
          </button>
        )}

        {/* Filtros em pílulas + lupa */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { id: 'all', label: `Todos (${summary.total})` },
              { id: 'active', label: `Ativos (${summary.active})` },
              { id: 'inactive', label: `Inativos (${summary.total - summary.active})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatus(tab.id)}
                className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  selectedStatus === tab.id
                    ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                    : 'border-zinc-200 bg-white text-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMobileSearchOpen(v => !v)}
            aria-label="Buscar colaborador"
            className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition ${
              mobileSearchOpen || search
                ? 'border-[#0d6e5a] bg-[#e6f4ef] text-[#0d6e5a]'
                : 'border-zinc-200 bg-white text-zinc-600'
            }`}
          >
            <Search size={16} />
          </button>
        </div>

        {(mobileSearchOpen || search) && (
          <div className="relative flex items-center">
            <Search size={15} className="pointer-events-none absolute left-3 text-zinc-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, cargo ou PIN..."
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white pr-9 pl-9 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 text-zinc-400"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* Lista mobile de colaboradores */}
        {loading ? (
          <ListSkeleton rows={4} />
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-6 text-center text-xs text-zinc-500">
            Nenhum colaborador encontrado.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredItems.map(item => (
              <article
                key={item.id}
                className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-4 w-[3px] shrink-0 rounded-full ${
                        item.active ? 'bg-[#0d6e5a]' : 'bg-zinc-300'
                      }`}
                    />
                    <h3 className="truncate text-[15px] font-bold text-zinc-900">{item.name}</h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                      item.active
                        ? 'bg-[#e6f4ef] text-[#0d6e5a]'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {item.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                  <span className="rounded-md bg-[#e6f4ef] px-2 py-0.5 text-[11px] font-semibold text-[#0d6e5a]">
                    {item.jobTitle?.trim() || 'Geral'}
                  </span>
                  <span className="text-zinc-400">·</span>
                  <span>{item.isManager ? 'Totais visíveis' : 'Auditoria cega'}</span>
                  {pinCache[item.id] && (
                    <>
                      <span className="text-zinc-400">·</span>
                      <span className="font-mono font-semibold text-zinc-700">PIN {pinCache[item.id]}</span>
                    </>
                  )}
                  {item.hasOpenRegister && (
                    <>
                      <span className="text-zinc-400">·</span>
                      <span className="font-semibold text-amber-700">Caixa aberto</span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
                  >
                    <Pencil size={13} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinOperator(item);
                      setQuickPin('');
                      setPinModalOpen(true);
                    }}
                    className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
                  >
                    <KeyRound size={13} />
                    PIN
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === item.id}
                    onClick={() => toggleStatus(item)}
                    className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-50"
                  >
                    {item.active ? 'Desativar' : 'Reativar'}
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === item.id}
                    onClick={() => handleDelete(item)}
                    className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* VISÃO DESKTOP                                                         */}
      {/* ===================================================================== */}
      <div className="hidden md:block">
      <PageHeader
        eyebrow="Operação compartilhada"
        title="Equipe"
        description="Os mesmos colaboradores atendem os pets e acessam o caixa com o próprio PIN."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canGrantCommissionPermission && (
              <button type="button" onClick={() => setDiscountPinModalOpen(true)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
                title="Cadastrar ou alterar o PIN que autoriza descontos no caixa">
                <KeyRound aria-hidden="true" size={16} /> PIN de desconto
              </button>
            )}
            <button
              type="button"
              onClick={() => setAccessModalOpen(true)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-xs font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition shadow-2xs"
              title="Configurar e-mail e senha de login da equipe"
            >
              <KeyRound aria-hidden="true" size={16} className="text-emerald-700" />
              <span>Login da Equipe</span>
            </button>
            <button type="button" onClick={openNew} className={`${primaryButton} flex items-center justify-center gap-2`}>
              <Plus aria-hidden="true" size={17} />
              Novo colaborador
            </button>
          </div>
        }
      />

      <TeamTabs />

      {/* 4 Cards de KPI */}
      <section aria-label="Indicadores da equipe" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1: Colaboradores */}
        <div className="relative flex items-center justify-between rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Users size={22} />
            </div>
            <div>
              <strong className="text-2xl font-bold tabular-nums text-slate-800">{summary.total}</strong>
              <p className="text-xs font-medium text-slate-500">Colaboradores</p>
              <p className="mt-0.5 text-2xs font-semibold text-emerald-600">↑ +1 este mês</p>
            </div>
          </div>
          <Users size={18} className="absolute right-4 top-4 text-slate-300" />
        </div>

        {/* KPI 2: Acessos ativos */}
        <div className="relative flex items-center justify-between rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Activity size={22} />
            </div>
            <div>
              <strong className="text-2xl font-bold tabular-nums text-slate-800">{summary.active}</strong>
              <p className="text-xs font-medium text-slate-500">Acessos ativos</p>
              <p className="mt-0.5 text-2xs text-slate-400">de {summary.total} colaboradores</p>
            </div>
          </div>
          <RefreshCw size={17} className="absolute right-4 top-4 text-slate-300" />
        </div>

        {/* KPI 3: Totais visíveis */}
        <div className="relative flex items-center justify-between rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <ShieldCheck size={22} />
            </div>
            <div>
              <strong className="text-2xl font-bold tabular-nums text-slate-800">{summary.managers}</strong>
              <p className="text-xs font-medium text-slate-500">Com totais visíveis</p>
              <p className="mt-0.5 text-2xs text-slate-400">{summary.managerPct}% da equipe</p>
            </div>
          </div>
          <Eye size={18} className="absolute right-4 top-4 text-slate-300" />
        </div>

        {/* KPI 4: Em caixa aberto */}
        <div className="relative flex items-center justify-between rounded-2xl border border-[var(--pc-border)] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <Briefcase size={22} />
            </div>
            <div>
              <strong className="text-2xl font-bold tabular-nums text-slate-800">{summary.onRegister}</strong>
              <p className="text-xs font-medium text-slate-500">Em caixa aberto</p>
              <p className="mt-0.5 text-2xs text-slate-400">
                {summary.onRegister === 0 ? 'Todos sem caixa aberto' : `${summary.onRegister} atendendo no caixa`}
              </p>
            </div>
          </div>
          <Store size={18} className="absolute right-4 top-4 text-slate-300" />
        </div>
      </section>

      {/* Barra de Filtros */}
      <section aria-label="Filtros da equipe" className="mb-5 flex flex-wrap items-center gap-3">
        {/* Busca */}
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, cargo ou PIN..."
            className="h-11 w-full rounded-xl border border-[var(--pc-border)] bg-white pl-10 pr-3 text-sm text-[var(--pc-text)] placeholder:text-slate-400 focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15 shadow-2xs transition"
          />
        </div>

        {/* Filtro Cargos */}
        <div className="relative">
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-[var(--pc-border)] bg-white px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15"
          >
            <option value="all">Todos os cargos</option>
            {availableRoles.map(role => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
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
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>

        {/* Filtro Acessos */}
        <div className="relative">
          <select
            value={selectedAccess}
            onChange={e => setSelectedAccess(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-[var(--pc-border)] bg-white px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs focus:border-[var(--pc-action)] focus:outline-none focus:ring-2 focus:ring-[var(--pc-action)]/15"
          >
            <option value="all">Todos os acessos</option>
            <option value="blind">Auditoria cega</option>
            <option value="manager">Totais visíveis</option>
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

      {/* Tabela de Colaboradores */}
      <section aria-label="Lista de colaboradores" className="pc-panel min-h-[350px] overflow-visible rounded-2xl border border-[var(--pc-border)] bg-white shadow-2xs">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum colaborador encontrado"
            description={
              items.length === 0
                ? 'Cadastre a equipe para distribuir atendimentos nos agendamentos e liberar acesso individual com PIN.'
                : 'Nenhum membro da equipe corresponde aos filtros ativos. Tente limpar os filtros de busca.'
            }
            action={
              items.length === 0 ? (
                <button type="button" onClick={openNew} className={primaryButton}>
                  Cadastrar primeiro colaborador
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSelectedRole('all');
                    setSelectedStatus('all');
                    setSelectedAccess('all');
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
                  <th
                    scope="col"
                    onClick={() => toggleSort('name')}
                    className="cursor-pointer px-5 py-3.5 transition hover:text-slate-900"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>COLABORADOR</span>
                      <span className="text-2xs text-slate-400">↑↓</span>
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort('jobTitle')}
                    className="cursor-pointer px-5 py-3.5 transition hover:text-slate-900"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>CARGO</span>
                      <span className="text-2xs text-slate-400">↑↓</span>
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort('status')}
                    className="cursor-pointer px-5 py-3.5 transition hover:text-slate-900"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>STATUS</span>
                      <span className="text-2xs text-slate-400">↑↓</span>
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort('isManager')}
                    className="cursor-pointer px-5 py-3.5 transition hover:text-slate-900"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ACESSO FINANCEIRO</span>
                      <span className="text-2xs text-slate-400">↑↓</span>
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort('hasOpenRegister')}
                    className="cursor-pointer px-5 py-3.5 transition hover:text-slate-900"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>SITUAÇÃO NO CAIXA</span>
                      <span className="text-2xs text-slate-400">↑↓</span>
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort('updatedAt')}
                    className="cursor-pointer px-5 py-3.5 transition hover:text-slate-900"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ÚLTIMO ACESSO</span>
                      <span className="text-2xs text-slate-400">↑↓</span>
                    </div>
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    AÇÕES
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pc-border)]">
                {filteredItems.map(item => {
                  const RoleIcon = getRoleIcon(item.jobTitle);
                  const cachedPin = pinCache[item.id];
                  const pinDisplay = cachedPin || '••••';
                  const initials = item.name.slice(0, 2).toUpperCase();
                  const rel = formatRelativeAccess(item.updatedAt, item.id);
                  const userAccount = users.find(
                    u => u.name.trim().toLowerCase() === item.name.trim().toLowerCase()
                  );

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-slate-50/60 ${item.active ? '' : 'bg-slate-50/30 opacity-65'}`}
                    >
                      {/* Coluna Colaborador */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3.5">
                          {/* Avatar com status indicator */}
                          <div className="relative">
                            <span
                              aria-hidden="true"
                              className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100/70 font-semibold text-emerald-800 ring-2 ring-white shadow-2xs"
                            >
                              {initials}
                            </span>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                                item.active ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <strong className="block truncate text-sm font-semibold text-slate-900">
                              {item.name}
                            </strong>
                            <p className="mt-0.5 flex items-center gap-1 font-mono text-2xs text-slate-400">
                              <span>PIN: {pinDisplay}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Coluna Cargo */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <RoleIcon size={15} className="text-slate-400" />
                          <span>{item.jobTitle || 'Geral'}</span>
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

                      {/* Coluna Acesso Financeiro */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {item.isManager ? (
                          <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
                            <Eye size={15} className="text-blue-500" />
                            <span>Totais visíveis</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <ShieldCheck size={15} className="text-slate-400" />
                            <span>Auditoria cega</span>
                          </div>
                        )}
                      </td>

                      {/* Coluna Situação no Caixa */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {item.hasOpenRegister ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Caixa aberto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                            <Clock size={13} className="text-slate-400" />
                            Sem caixa aberto
                          </span>
                        )}
                      </td>

                      {/* Coluna Último Acesso */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                item.active ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            />
                            <span>{rel.time}</span>
                          </div>
                          <span className="block pl-3.5 text-2xs text-slate-400">{rel.channel}</span>
                        </div>
                      </td>

                      {/* Coluna Ações */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--pc-border)] bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-[var(--pc-action)] hover:text-[var(--pc-action)]"
                          >
                            <Pencil size={13} />
                            Editar
                          </button>

                          <TeamRowActionsMenu
                            operator={item}
                            onEdit={() => openEdit(item)}
                            onChangePin={() => {
                              setPinOperator(item);
                              setQuickPin('');
                              setPinModalOpen(true);
                            }}
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
      </div>

      {/* Modal de Criação / Edição de Colaborador */}
      {formOpen && (
        <Modal title={editing ? 'Editar colaborador' : 'Novo colaborador'} onClose={closeForm}>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={labelClass}>Nome completo *</span>
                <input
                  required
                  autoComplete="off"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  placeholder="Ex.: Bruno Alves"
                />
              </label>

              <label>
                <span className={labelClass}>Função / Cargo</span>
                <input
                  value={form.jobTitle}
                  onChange={e => setForm({ ...form, jobTitle: e.target.value })}
                  className={inputClass}
                  placeholder="Ex.: Banhista, Tosadora, Veterinário"
                />
              </label>
            </div>

            <div>
              <p className={labelClass}>Sugestões rápidas de cargo</p>
              <div className="flex flex-wrap gap-2">
                {roleSuggestions.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        jobTitle: role,
                        isManager: role === 'Gerente' ? true : form.isManager,
                      })
                    }
                    className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition ${
                      form.jobTitle === role
                        ? 'border-[var(--pc-action)] bg-[var(--pc-action-soft)] text-[var(--pc-action-hover)]'
                        : 'border-[var(--pc-border)] text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <label>
              <span className={`${labelClass} flex items-center gap-1.5`}>
                <KeyRound aria-hidden="true" size={14} />
                {editing ? 'Novo PIN (deixe vazio para manter o atual)' : 'PIN numérico de acesso *'}
              </span>
              <input
                required={!editing}
                inputMode="numeric"
                autoComplete="new-password"
                value={form.pin}
                onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                className={inputClass}
                placeholder={editing ? 'Deixe em branco para manter' : '4 a 6 dígitos numéricos (ex: 1023)'}
              />
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--pc-border)] bg-slate-50/70 p-4 transition hover:bg-slate-50">
              <input
                type="checkbox"
                checked={form.isManager}
                onChange={e => setForm({ ...form, isManager: e.target.checked })}
                className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-[var(--pc-action)]"
              />
              <span>
                <strong className="block text-sm font-semibold text-slate-900">
                  Pode visualizar totais do caixa (Totais visíveis)
                </strong>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  Quando desmarcado, o colaborador opera em auditoria cega (não vê o total acumulado do dia no fechamento, prevenindo conferências enviesadas).
                </span>
              </span>
            </label>

            {canGrantCommissionPermission && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--pc-border)] bg-slate-50/70 p-4">
                <input type="checkbox" checked={form.canManageAppointmentCommissions}
                  onChange={e => setForm({ ...form, canManageAppointmentCommissions: e.target.checked })}
                  className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-[var(--pc-action)]" />
                <span><strong className="block text-sm font-semibold text-slate-900">PIN administrativo do Pet Shop</strong>
                  <span className="mt-1 block text-xs text-slate-500">Ao entrar com o PIN deste colaborador, permite lançar serviços após a conclusão e indicar quem recebe a comissão. O campo acima altera o PIN; deixe vazio para manter o atual.</span></span>
              </label>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--pc-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeForm} disabled={saving} className={secondaryButton}>
                Cancelar
              </button>
              <button type="submit" disabled={saving || !form.name.trim()} className={primaryButton}>
                {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar colaborador'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Rápido de Alteração de PIN */}
      {pinModalOpen && pinOperator && (
        <Modal
          title={`Redefinir PIN - ${pinOperator.name}`}
          onClose={() => {
            setPinModalOpen(false);
            setPinOperator(null);
            setQuickPin('');
          }}
        >
          <form onSubmit={submitQuickPin} className="space-y-4">
            <p className="text-xs text-slate-600">
              Defina um novo PIN numérico de 4 a 6 dígitos para o colaborador acessar o sistema e o caixa.
            </p>

            <label>
              <span className={labelClass}>Novo PIN (4 a 6 dígitos) *</span>
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="new-password"
                value={quickPin}
                onChange={e => setQuickPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={inputClass}
                placeholder="Ex.: 4580"
              />
            </label>

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--pc-border)] pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setPinModalOpen(false);
                  setPinOperator(null);
                  setQuickPin('');
                }}
                disabled={saving}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || quickPin.length < 4}
                className={primaryButton}
              >
                {saving ? 'Salvando…' : 'Atualizar PIN'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {/* Modal de Acesso dos Colaboradores (Login E-mail e Senha) */}
      {canGrantCommissionPermission && discountPinModalOpen && (
        <Modal title="PIN de desconto do caixa" onClose={closeDiscountPinModal} maxWidth="sm:max-w-md">
          <form onSubmit={submitDiscountPin} className="space-y-4">
            <p className="text-sm text-slate-600">
              Cadastre um PIN para autorizar descontos no pagamento. O valor concedido fica registrado na venda e no cupom.
            </p>
            <label className="block">
              <span className={labelClass}>Novo PIN (4 a 8 dígitos)</span>
              <input type="password" inputMode="numeric" autoComplete="new-password" required minLength={4} maxLength={8}
                value={discountPin} onChange={event => setDiscountPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                className={inputClass} placeholder="Digite o novo PIN" />
            </label>
            <label className="block">
              <span className={labelClass}>Confirme o PIN</span>
              <input type="password" inputMode="numeric" autoComplete="new-password" required minLength={4} maxLength={8}
                value={confirmDiscountPin} onChange={event => setConfirmDiscountPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                className={inputClass} placeholder="Repita o novo PIN" />
            </label>
            {confirmDiscountPin && discountPin !== confirmDiscountPin && (
              <p className="text-xs font-medium text-rose-600">Os PINs não coincidem.</p>
            )}
            <div className="flex justify-end gap-2 border-t border-[var(--pc-border)] pt-4">
              <button type="button" disabled={savingDiscountPin} onClick={closeDiscountPinModal} className={secondaryButton}>Cancelar</button>
              <button type="submit" disabled={savingDiscountPin || discountPin.length < 4 || discountPin !== confirmDiscountPin}
                className={primaryButton}>{savingDiscountPin ? 'Salvando...' : 'Salvar PIN'}</button>
            </div>
          </form>
        </Modal>
      )}
      <CollaboratorAccessModal
        isOpen={accessModalOpen}
        onClose={() => setAccessModalOpen(false)}
        onSuccess={load}
      />
    </div>
  );
}
