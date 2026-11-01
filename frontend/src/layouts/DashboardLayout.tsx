import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Package, History, ArrowLeft, LogOut, Settings, FileText,
  Building2, Users, ChevronLeft, ChevronRight, AlertTriangle, Truck, ShoppingCart,
  Banknote, CreditCard, FileSpreadsheet, Images, FileDown, ReceiptText, Tv2, Menu, X,
  UtensilsCrossed
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useDemoMissionsStore } from '@/store/demoMissions';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';
import { BottomNavigation } from '@/components/BottomNavigation';
import { CapitaoGelada } from '@/components/CapitaoGelada';

export function DashboardLayout() {
  const { user, token, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [tenantConfig, setTenantConfig] = useState<any>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (import.meta.env.VITE_APP_MODE === 'demo') {
      useDemoMissionsStore.getState().completeMission('dashboardVisited');
    }
  }, []);

  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setIsCollapsed(true);
      else setIsCollapsed(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (token) {
      api.get(`/tenants/me?_t=${Date.now()}`).then(res => setTenantConfig(res.data)).catch(console.error);
    }
  }, [token]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const modules = (() => {
    try {
      if (tenantConfig?.modulos) {
        return typeof tenantConfig.modulos === 'string' ? JSON.parse(tenantConfig.modulos) : tenantConfig.modulos;
      }
    } catch (e) {
      console.error("Erro ao ler módulos do tenant:", e);
    }
    return { estoque: true, nfce: true, dashboardMobile: true };
  })();

  const isPetshop = modules?.petshop !== false;

  useEffect(() => {
    if (isPetshop) navigate('/petshop', { replace: true });
  }, [isPetshop, navigate]);

  if (isPetshop) {
    return <Navigate to="/petshop" replace />;
  }

  const isStockist = user?.role === 'stockist';

  const navItems = [
    ...(!isStockist ? [{ name: 'Analytics', to: '/dashboard', icon: LayoutDashboard }] : []),
    ...(modules.estoque !== false ? [
      { name: 'Catálogo e Estoque', to: '/dashboard/inventory',             icon: Package },
      ...(!isStockist ? [
        { name: 'Fornecedores',       to: '/dashboard/suppliers',             icon: Truck },
        { name: 'Pedidos de Compra',  to: '/dashboard/purchase-orders',       icon: ShoppingCart },
      ] : []),
    ] : []),
    ...(!isStockist ? [
      { name: 'Histórico de Caixas',to: '/dashboard/registers',             icon: History },
      ...(modules?.comandas === true ? [
        { name: 'Comandas & Mesas', to: '/dashboard/comandas',              icon: Users }
      ] : [
        { name: 'Cons. Colaborador', to: '/dashboard/comandas',         icon: Users }
      ]),
      { name: 'Contas a Pagar',     to: '/dashboard/finance/payables',      icon: Banknote },
      ...(modules?.kds === true || modules?.carvoaria === true ? [{ name: 'Produção (KDS)', to: '/kds', icon: UtensilsCrossed }] : []),    ] : []),
  ];
  const inventoryToolItems = [
    ...(modules.estoque !== false ? [
      { name: 'Edição em Massa',  to: '/dashboard/inventory/mass-edit',   icon: FileSpreadsheet },
    ] : []),
    { name: 'Contagem de Estoque', to: '/dashboard/inventory/stock-count', icon: FileSpreadsheet },
    ...(!isStockist ? [
      { name: 'Imagens em Massa',   to: '/dashboard/bulk-images',            icon: Images },
    ] : []),
    ...((modules.nfce !== false || modules.importacaoXml === true) ? [
      { name: 'Entrada por XML', to: '/dashboard/inventory/purchases/imports', icon: FileDown },
    ] : []),
    ...(!isStockist ? [
      ...(modules.nfce !== false ? [
        { name: 'Gestão & Relatório NFC-e', to: '/dashboard/fiscal/gestao',                 icon: ReceiptText },
        { name: 'Ajuste Fiscal',           to: '/dashboard/configuracoes/ajuste-fiscal',     icon: FileSpreadsheet },
      ] : []),
    ] : []),
  ];
  const configItems = isStockist ? [] : [
    { name: 'Empresa',            to: '/dashboard/configuracoes/empresa',           icon: Building2 },
    ...(modules.nfce !== false ? [
      { name: 'Grupos Tributários', to: '/dashboard/configuracoes/tributacao',        icon: FileText },
    ] : []),
    { name: 'Formas de Pagamento', to: '/dashboard/configuracoes/payment-methods',   icon: CreditCard },
    { name: 'Gestão de Equipe',   to: '/dashboard/equipe',                           icon: Users },
  ];

  const pathname = window.location.pathname;
  const isEstoqueBlocked = modules.estoque === false && pathname.startsWith('/dashboard/inventory');
  const isNfceBlocked = (modules.nfce === false && modules.importacaoXml !== true && pathname.startsWith('/dashboard/inventory/purchases/imports')) ||
  (modules.nfce === false && (
    pathname.startsWith('/dashboard/configuracoes/tributacao') ||
    pathname.startsWith('/dashboard/configuracoes/ajuste-fiscal') ||
    pathname.startsWith('/dashboard/fiscal/gestao')
  ));
  const isVitrineBlocked = modules?.vitrineDigital !== true && pathname.startsWith('/dashboard/vitrine');

  // Redirecionar estoquista para inventory se tentar acessar rotas proibidas
  const stockistAllowedPaths = ['/dashboard/inventory', '/dashboard/bulk-images'];
  const isStockistBlocked = isStockist && pathname !== '/dashboard' && !stockistAllowedPaths.some(p => pathname.startsWith(p));

  return (
    <div className="flex flex-col md:flex-row h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Mobile Top Navigation Bar with Safe Area for iOS Dynamic Island / Notch */}
      <header
        className="md:hidden flex items-center justify-between px-3.5 pb-2.5 bg-zinc-900 border-b border-zinc-800 shrink-0 select-none z-30 shadow-sm"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.625rem)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="p-2 text-zinc-300 hover:text-white bg-zinc-800/80 border border-zinc-700/80 rounded-xl transition active:scale-95 shrink-0 cursor-pointer"
            title="Menu do Administrador"
          >
            <Menu size={19} />
          </button>
          {tenantConfig?.logoUrl ? (
            <img src={getFullUrl(tenantConfig.logoUrl)} alt="Logo" className="h-8 w-8 object-contain drop-shadow-sm shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-xs shrink-0 shadow">
              {tenantConfig?.nomeFantasia?.substring(0, 2) || '7B'}
            </div>
          )}
          <span className="font-bold text-xs sm:text-sm text-white truncate max-w-[130px] sm:max-w-[200px]">
            {tenantConfig?.nomeFantasia || tenantConfig?.razaoSocial || 'Painel Admin'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <NavLink
            to="/"
            className="px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 font-bold text-xs rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm shrink-0"
          >
            <ArrowLeft size={14} /> PDV
          </NavLink>
        </div>
      </header>

      {/* Sidebar — hidden on mobile, visible md+ */}
      <aside className={`hidden md:flex flex-col ${isCollapsed ? 'w-20' : 'w-64'} bg-zinc-900 border-r border-zinc-800 transition-all duration-300 relative`}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 bg-zinc-800 border border-zinc-700 rounded-full p-1 hover:bg-zinc-700 transition-colors z-50 text-zinc-400"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className={`p-6 border-b border-zinc-800 flex flex-col items-center text-center min-h-[120px] justify-center ${isCollapsed ? 'px-2' : ''}`}>
          {tenantConfig === null ? (
            <div className="h-10 w-32 bg-zinc-800/50 animate-pulse rounded-lg" />
          ) : tenantConfig?.logoUrl ? (
            <img src={getFullUrl(tenantConfig.logoUrl)} alt="Logo" className={`${isCollapsed ? 'h-8' : 'h-20'} w-full object-contain drop-shadow-md transition-all`} />
          ) : (
            <h1 className={`${isCollapsed ? 'text-xs' : 'text-2xl'} font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent truncate w-full`}>
              {tenantConfig?.nomeFantasia || tenantConfig?.razaoSocial || 'Admin'}
            </h1>
          )}
          {!isCollapsed && <p className="text-zinc-500 text-sm mt-2">{user?.tenant || 'Carregando...'}</p>}
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'} title={isCollapsed ? item.name : ''}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            >
              <item.icon size={20} className="shrink-0" />
              {!isCollapsed && <span className="font-semibold whitespace-nowrap">{item.name}</span>}
            </NavLink>
          ))}
          <div className="pt-4 pb-1 hidden md:block">
            <p className={`text-xs font-bold text-zinc-600 uppercase tracking-widest mb-2 flex items-center gap-2 ${isCollapsed ? 'justify-center' : 'px-4'}`}>
              <FileSpreadsheet size={12} />{!isCollapsed && <span>Inventário</span>}
            </p>
            {inventoryToolItems.map(item => (
              <NavLink key={item.to} to={item.to} title={isCollapsed ? item.name : ''}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
              >
                <item.icon size={17} className="shrink-0" />
                {!isCollapsed && <span className="font-semibold whitespace-nowrap">{item.name}</span>}
              </NavLink>
            ))}
          </div>
          {!isStockist && modules?.vitrineDigital === true && (
            <div className="pt-4 pb-1">
              <p className={`text-xs font-bold text-sky-500 uppercase tracking-widest mb-2 flex items-center gap-2 ${isCollapsed ? 'justify-center' : 'px-4'}`}>
                <Tv2 size={12} />{!isCollapsed && <span>Vitrine Digital</span>}
              </p>
              <NavLink to="/dashboard/vitrine" title={isCollapsed ? 'Vitrine Digital' : ''}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
              >
                <Tv2 size={17} className="shrink-0 text-sky-400" />
                {!isCollapsed && <span className="font-semibold whitespace-nowrap">Painel Vitrine TV</span>}
              </NavLink>
            </div>
          )}
          <div className="pt-4 pb-1">
            <p className={`text-xs font-bold text-zinc-600 uppercase tracking-widest mb-2 flex items-center gap-2 ${isCollapsed ? 'justify-center' : 'px-4'}`}>
              <Settings size={12} />{!isCollapsed && <span>Configurações</span>}
            </p>
            {configItems.map(item => (
              <NavLink key={item.to} to={item.to} title={isCollapsed ? item.name : ''}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
              >
                <item.icon size={17} className="shrink-0" />
                {!isCollapsed && <span className="font-semibold whitespace-nowrap">{item.name}</span>}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-zinc-800 space-y-2">
          {!isStockist && (
            <NavLink to="/" className={`flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all ${isCollapsed ? 'justify-center' : ''}`}>
              <ArrowLeft size={20} className="shrink-0" />
              {!isCollapsed && <span className="font-semibold whitespace-nowrap">Voltar ao PDV</span>}
            </NavLink>
          )}
          <button onClick={handleLogout} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all text-left ${isCollapsed ? 'justify-center' : ''}`}>
            <LogOut size={20} className="shrink-0" />
            {!isCollapsed && <span className="font-semibold whitespace-nowrap">Sair</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Admin Navigation Drawer */}
      {isMobileDrawerOpen && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <aside
            className="fixed top-0 bottom-0 left-0 z-[90] md:hidden w-[85vw] max-w-[320px] bg-zinc-900 border-r border-zinc-800 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300 overflow-hidden"
          >
            {/* Drawer Header with Safe Area */}
            <div
              className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80"
              style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {tenantConfig?.logoUrl ? (
                  <img src={getFullUrl(tenantConfig.logoUrl)} alt="Logo" className="h-9 w-9 object-contain drop-shadow-sm shrink-0" />
                ) : (
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-sm shrink-0 shadow">
                    {tenantConfig?.nomeFantasia?.substring(0, 2) || '7B'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm truncate">{tenantConfig?.nomeFantasia || tenantConfig?.razaoSocial || 'Painel Admin'}</p>
                  <p className="text-zinc-500 text-[11px] truncate">{user?.tenant || ''}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Links scroll container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
              {/* Geral & Finanças */}
              <div>
                <p className="px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Geral & Finanças</p>
                <div className="space-y-1">
                  {navItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/dashboard'}
                      onClick={() => setIsMobileDrawerOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold ${
                          isActive
                            ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                        }`
                      }
                    >
                      <item.icon size={17} className="shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </NavLink>
                  ))}
                </div>
              </div>

              {/* Vitrine Digital */}
              {modules?.vitrineDigital === true && (
                <div>
                  <p className="px-3 text-[10px] font-bold text-sky-400 uppercase tracking-widest mb-1.5">Vitrine Digital TV</p>
                  <div className="space-y-1">
                    <NavLink
                      to="/dashboard/vitrine"
                      onClick={() => setIsMobileDrawerOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold ${
                          isActive
                            ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                        }`
                      }
                    >
                      <Tv2 size={17} className="shrink-0 text-sky-400" />
                      <span className="truncate">Painel Vitrine TV</span>
                      <span className="ml-auto text-[9px] bg-sky-500/20 text-sky-300 font-bold px-1.5 py-0.5 rounded uppercase">NOVO</span>
                    </NavLink>
                  </div>
                </div>
              )}

              {/* Ferramentas de Estoque */}
              <div>
                <p className="px-3 text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1.5">Estoque & Compras</p>
                <div className="space-y-1">
                  {inventoryToolItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileDrawerOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold ${
                          isActive
                            ? 'bg-purple-600/15 text-purple-400 border border-purple-500/20'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                        }`
                      }
                    >
                      <item.icon size={17} className="shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </NavLink>
                  ))}
                </div>
              </div>

              {/* Configurações */}
              {configItems.length > 0 && (
                <div>
                  <p className="px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Configurações</p>
                  <div className="space-y-1">
                    {configItems.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setIsMobileDrawerOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-xs font-semibold ${
                            isActive
                              ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                          }`
                        }
                      >
                        <item.icon size={17} className="shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer with Safe Area */}
            <div
              className="p-3 border-t border-zinc-800 bg-zinc-950/50 space-y-1.5 shrink-0"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
            >
              <NavLink
                to="/"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition active:scale-95"
              >
                <ArrowLeft size={16} /> Frente de Caixa (PDV)
              </NavLink>
              <button
                onClick={() => { setIsMobileDrawerOpen(false); handleLogout(); }}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold text-xs transition active:scale-95"
              >
                <LogOut size={15} /> Sair da Conta
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Main — pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] on mobile to clear BottomNav, p-3 on mobile */}
      <main className="flex-1 overflow-y-auto bg-zinc-950 p-3 md:p-8 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-8 custom-scrollbar">
        {isStockistBlocked ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl backdrop-blur-md animate-[fadeIn_0.3s_ease]">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 text-blue-500 shadow-lg shadow-blue-500/10">
              <Package size={32} />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">Acesso Restrito</h2>
            <p className="text-zinc-400 mt-2 max-w-md">Seu perfil de <strong className="text-blue-400">Estoquista</strong> possui acesso apenas ao Catálogo e Estoque.</p>
            <button onClick={() => navigate('/dashboard/inventory')} className="mt-6 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-5 rounded-xl transition-all">
              Ir para o Estoque
            </button>
          </div>
        ) : (isEstoqueBlocked || isNfceBlocked || isVitrineBlocked) ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl backdrop-blur-md animate-[fadeIn_0.3s_ease]">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 text-amber-500 shadow-lg shadow-amber-500/10">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">Módulo Desativado</h2>
            <p className="text-zinc-400 mt-2 max-w-md">Este recurso não está habilitado para o plano da sua empresa. Entre em contato com o suporte para ativá-lo.</p>
            <button onClick={() => navigate('/dashboard')} className="mt-6 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2 px-5 rounded-xl transition-all">
              Ir para o Analytics
            </button>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Bottom Navigation — mobile only (md:hidden inside component) */}
      <BottomNavigation tenantConfig={tenantConfig} />
      <CapitaoGelada />
    </div>
  );
}
