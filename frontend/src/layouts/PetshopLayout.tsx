import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Package,
  PawPrint,
  Scissors,
  ShieldAlert,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserCheck,
  UserPlus,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useShift } from '@/contexts/ShiftContext';
import { PetshopOperatorLoginModal } from '@/pages/petshop/PetshopOperatorLoginModal';
import { CollaboratorAccessModal } from '@/pages/petshop/CollaboratorAccessModal';
import '@/pages/petshop/petshop.css';

// Itens de navegação completos para Administrador / Gerente
const allDesktopNav = [
  { to: '/petshop', label: 'Hoje', icon: LayoutDashboard, end: true },
  { to: '/petshop/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/petshop/pets', label: 'Pets', icon: PawPrint },
  { to: '/petshop/tutores', label: 'Tutores', icon: Users },
  { to: '/petshop/servicos', label: 'Serviços', icon: Scissors },
  { to: '/petshop/produtos', label: 'Produtos', icon: Package },
  { to: '/petshop/fornecedores', label: 'Fornecedores', icon: Truck },
  { to: '/petshop/pedidos-compra', label: 'Pedidos Compra', icon: ShoppingCart },
  { to: '/petshop/equipe', label: 'Equipe', icon: UserRoundCog },
  { to: '/petshop/metricas', label: 'Métricas & Vendas', icon: TrendingUp },
];

// Rotas restritas para colaboradores operacionais sem isManager
const restrictedPaths = [
  '/petshop/servicos',
  '/petshop/produtos',
  '/petshop/fornecedores',
  '/petshop/pedidos-compra',
  '/petshop/equipe',
  '/petshop/metricas',
  '/petshop/edicao-massa',
  '/petshop/entrada-estoque',
  '/petshop/alertas-validade',
];

export function PetshopLayout() {
  const { user, logout } = useAuthStore();
  const { operator, logoutOperator } = useShift();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [tenant, setTenant] = useState<any>(null);
  const [tenantError, setTenantError] = useState(false);
  const [showOpModal, setShowOpModal] = useState(false);
  const [showCreateAccessModal, setShowCreateAccessModal] = useState(false);

  const modules = useMemo(() => {
    const raw = tenant?.modulos;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    } catch {
      return {};
    }
  }, [tenant]);

  const loadTenant = useCallback(() => {
    setTenantError(false);
    setTenant(null);
    api
      .get('/tenants/me')
      .then(({ data }) => setTenant(data))
      .catch(() => setTenantError(true));
  }, []);

  useEffect(loadTenant, [loadTenant]);

  // Se a conta logada for de operador OU o colaborador em turno não for gerente, restringe menus
  const isOperatorAccount = user?.role === 'operator';
  const isRestrictedStaff = isOperatorAccount || Boolean(operator && !operator.isManager);

  // Se a conta do sistema for de operador e ainda não tiver selecionado quem está no turno, abre o modal de PIN
  useEffect(() => {
    if (isOperatorAccount && !operator) {
      setShowOpModal(true);
    }
  }, [isOperatorAccount, operator]);

  const currentNav = useMemo(() => {
    if (isRestrictedStaff) {
      // Colaborador comum acessa apenas Hoje, Agenda, Pets e Tutores
      return [
        { to: '/petshop', label: 'Hoje', icon: LayoutDashboard, end: true },
        { to: '/petshop/agenda', label: 'Agenda', icon: CalendarDays },
        { to: '/petshop/pets', label: 'Pets', icon: PawPrint },
        { to: '/petshop/tutores', label: 'Tutores', icon: Users },
      ];
    }
    return allDesktopNav;
  }, [isRestrictedStaff]);

  const isAccessBlocked = isRestrictedStaff && restrictedPaths.some(p => pathname.startsWith(p));

  if (tenantError) {
    return (
      <div className="petcare-shell grid min-h-screen place-items-center p-6">
        <div className="pc-panel max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold">Não foi possível carregar o Pet Care</h1>
          <p className="mt-2 text-sm text-[var(--pc-text-secondary)]">Verifique sua conexão e tente novamente.</p>
          <button
            onClick={loadTenant}
            className="mt-5 min-h-11 rounded-lg bg-[var(--pc-action)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--pc-action-hover)]"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="petcare-shell grid min-h-screen place-items-center" role="status">
        <div className="flex items-center gap-3 text-sm font-medium text-[var(--pc-text-secondary)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--pc-border-strong)] border-t-[var(--pc-action)]" />
          Preparando o Pet Care…
        </div>
      </div>
    );
  }

  if (modules.petshop === false) {
    return (
      <div className="petcare-shell grid min-h-screen place-items-center p-6 text-center">
        <div className="pc-panel max-w-md p-7">
          <PawPrint className="mx-auto mb-4 text-[var(--pc-text-muted)]" size={36} />
          <h1 className="text-xl font-semibold">Módulo Pet Shop não habilitado</h1>
          <p className="mt-2 text-sm text-[var(--pc-text-secondary)]">Este estabelecimento ainda não possui acesso ao Pet Care.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-5 min-h-11 rounded-lg bg-[var(--pc-action)] px-5 text-sm font-semibold text-white hover:bg-[var(--pc-action-hover)]"
          >
            Voltar ao painel
          </button>
        </div>
      </div>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-[var(--pc-action-soft)] text-[var(--pc-action-hover)] font-semibold'
        : 'text-[var(--pc-text-secondary)] hover:bg-[var(--pc-surface-subtle)] hover:text-[var(--pc-text)]'
    }`;

  const exit = () => {
    logout();
    navigate('/login');
  };

  const tenantName = tenant.nomeFantasia || tenant.name;

  return (
    <div className="petcare-shell min-h-screen">
      <a
        href="#petcare-main"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-[var(--pc-text)] px-4 py-2 text-sm font-semibold text-white focus:translate-y-0"
      >
        Ir para o conteúdo
      </a>

      {/* Sidebar Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--pc-border)] bg-[var(--pc-surface)] lg:flex lg:flex-col">
        {/* Cabeçalho Loja */}
        <div className="border-b border-[var(--pc-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--pc-text)] text-white">
              <PawPrint size={19} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--pc-action)]">pract. pet</p>
              <p className="truncate text-sm font-semibold text-[var(--pc-text)]" title={tenantName}>
                {tenantName}
              </p>
            </div>
          </div>
        </div>

        {/* Card do Colaborador Ativo na Sidebar */}
        <div className="border-b border-[var(--pc-border)] p-3">
          {operator ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-200 font-bold text-xs text-emerald-800">
                  {operator.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-emerald-950">{operator.name}</p>
                  <p className="truncate text-2xs text-emerald-700 font-medium">
                    {(operator as any)?.jobTitle || (operator.isManager ? 'Gerente' : 'Colaborador')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOpModal(true)}
                className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-2xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                title="Trocar colaborador"
              >
                Trocar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowOpModal(true)}
              className="flex w-full items-center justify-between rounded-xl border border-dashed border-[var(--pc-border-strong)] bg-white p-2.5 text-left text-xs font-semibold text-slate-700 hover:border-[var(--pc-action)] hover:text-[var(--pc-action)] transition shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <KeyRound size={15} className="text-slate-400" />
                <span>Entrar com PIN de Colaborador</span>
              </div>
              <span className="text-2xs text-[var(--pc-action)] font-bold">Entrar</span>
            </button>
          )}
        </div>

        {/* Links de Navegação */}
        <nav aria-label="Navegação do Pet Care" className="flex-1 space-y-1 p-3 overflow-y-auto custom-scrollbar">
          {currentNav.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              <item.icon aria-hidden="true" size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="border-t border-[var(--pc-border)] p-3 space-y-2">
          <button
            onClick={() => navigate('/')}
            className="flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-[var(--pc-border)] bg-white px-3 text-xs font-semibold text-[var(--pc-text)] shadow-2xs transition hover:bg-[var(--pc-surface-subtle)]"
          >
            <ShoppingCart aria-hidden="true" size={16} />
            <span>Ir para o PDV Caixa</span>
          </button>

          <div className="flex items-center gap-2.5 border-t border-[var(--pc-border)] px-2 pt-2.5">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--pc-surface-subtle)] text-xs font-semibold text-slate-700">
              {user?.name?.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-900">{user?.name}</p>
              <p className="text-2xs text-slate-400">Administrador</p>
            </div>
            <button
              onClick={exit}
              aria-label="Sair da conta"
              title="Sair"
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
            >
              <LogOut aria-hidden="true" size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--pc-border)] bg-white/95 px-4 backdrop-blur lg:ml-64 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--pc-text)] text-white lg:hidden">
            <PawPrint aria-hidden="true" size={17} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold lg:hidden">{tenantName}</p>
            <p className="hidden text-sm text-[var(--pc-text-secondary)] lg:block">Área de atendimento e gestão</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Botão Acesso da Equipe (gerencia a credencial de login dos colaboradores) */}
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <button
              type="button"
              onClick={() => setShowCreateAccessModal(true)}
              className="flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/80 px-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition shadow-2xs"
              title="Configurar e-mail e senha de login da equipe"
            >
              <KeyRound size={14} className="text-emerald-700" />
              <span className="hidden sm:inline">Acesso da Equipe</span>
            </button>
          )}

          {operator ? (
            <div className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/90 px-2.5 py-1 text-xs font-semibold text-emerald-900 shadow-2xs">
              <button
                type="button"
                onClick={() => setShowOpModal(true)}
                className="flex items-center gap-1.5 hover:opacity-80 transition"
                title="Clique para trocar ou sair do perfil do colaborador"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="max-w-[100px] truncate">{operator.name}</span>
                <span className="text-2xs text-emerald-700 font-normal hidden md:inline">
                  ({(operator as any)?.jobTitle || 'Atendimento'})
                </span>
              </button>
              <span className="text-emerald-300 mx-0.5">|</span>
              <button
                type="button"
                onClick={() => setShowOpModal(true)}
                className="text-2xs font-bold text-emerald-800 hover:underline px-1 py-0.5"
                title="Trocar colaborador"
              >
                Trocar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowOpModal(true)}
              className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--pc-border-strong)] bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              <KeyRound size={14} className="text-slate-400" />
              <span>Login PIN</span>
            </button>
          )}

          <button
            onClick={() => navigate('/')}
            className="flex min-h-9 items-center gap-2 rounded-lg border border-[var(--pc-border-strong)] px-3 text-xs font-semibold text-[var(--pc-text)] transition hover:bg-[var(--pc-surface-subtle)]"
          >
            <ShoppingCart aria-hidden="true" size={14} />
            <span className="hidden sm:inline">PDV Caixa</span>
          </button>

          <button
            onClick={exit}
            aria-label="Sair"
            title="Sair"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 lg:hidden"
          >
            <LogOut aria-hidden="true" size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main id="petcare-main" tabIndex={-1} className="pb-24 lg:ml-64 lg:pb-8">
        {isAccessBlocked ? (
          <div className="mx-auto max-w-lg p-6 pt-16 text-center">
            <div className="pc-panel p-8 shadow-md">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <ShieldAlert size={26} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Acesso Restrito ao Perfil</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                O colaborador <strong>{operator?.name}</strong> está com perfil operacional ({(operator as any)?.jobTitle || 'Sem gerência'}).
                Para acessar módulos administrativos, financeiros e fornecedores, identifique-se como Gerente ou Administrador.
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => navigate('/petshop/agenda')}
                  className="rounded-xl border border-[var(--pc-border-strong)] bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Ir para a Agenda
                </button>
                <button
                  type="button"
                  onClick={() => setShowOpModal(true)}
                  className="rounded-xl bg-[var(--pc-action)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--pc-action-hover)]"
                >
                  Trocar para Gerente
                </button>
              </div>
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Navegação Mobile */}
      <nav
        aria-label="Navegação mobile"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--pc-border)] bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <NavLink
          to="/petshop"
          end
          className={({ isActive }) =>
            `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
              isActive ? 'text-[var(--pc-action-hover)] font-bold' : 'text-slate-400'
            }`
          }
        >
          <LayoutDashboard size={18} strokeWidth={2} />
          <span>Hoje</span>
        </NavLink>
        <NavLink
          to="/petshop/agenda"
          className={({ isActive }) =>
            `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
              isActive ? 'text-[var(--pc-action-hover)] font-bold' : 'text-slate-400'
            }`
          }
        >
          <CalendarDays size={18} strokeWidth={2} />
          <span>Agenda</span>
        </NavLink>
        <NavLink
          to="/petshop/pets"
          className={({ isActive }) =>
            `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
              isActive ? 'text-[var(--pc-action-hover)] font-bold' : 'text-slate-400'
            }`
          }
        >
          <PawPrint size={18} strokeWidth={2} />
          <span>Pets</span>
        </NavLink>
        <NavLink
          to="/"
          className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-400"
        >
          <ShoppingCart size={18} strokeWidth={2} />
          <span>PDV</span>
        </NavLink>
      </nav>

      {/* Modal de Login de Colaborador */}
      <PetshopOperatorLoginModal
        isOpen={showOpModal}
        isMandatory={Boolean(isOperatorAccount && !operator)}
        onClose={() => setShowOpModal(false)}
      />

      {/* Modal de Acesso dos Colaboradores (Login E-mail e Senha) */}
      <CollaboratorAccessModal
        isOpen={showCreateAccessModal}
        onClose={() => setShowCreateAccessModal(false)}
      />
    </div>
  );
}
