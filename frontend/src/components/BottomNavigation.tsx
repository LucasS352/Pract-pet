import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart2, Package, User, LogOut, X, History, Banknote, Store, Download,
  Tv2, Save, FileDown, FileSpreadsheet, Images, Truck, ShoppingCart,
  Building2, FileText, CreditCard, Users, LayoutGrid, ArrowRight
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { ExportXmlModal } from '@/components/ExportXmlModal';

const navItems = [
  {
    label: 'Analytics',
    to: '/dashboard',
    icon: BarChart2,
    exact: true,
  },
  {
    label: 'Estoque',
    to: '/dashboard/inventory',
    icon: Package,
    exact: false,
  },
  {
    label: 'Caixas',
    to: '/dashboard/registers',
    icon: History,
    exact: false,
  },
  {
    label: 'Despesas',
    to: '/dashboard/finance/payables',
    icon: Banknote,
    exact: false,
  },
];

interface BottomNavigationProps {
  tenantConfig?: any;
}

export function BottomNavigation({ tenantConfig }: BottomNavigationProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setProfileOpen(false);
  };

  const modules = (() => {
    try {
      if (tenantConfig?.modulos) {
        return typeof tenantConfig.modulos === 'string' ? JSON.parse(tenantConfig.modulos) : tenantConfig.modulos;
      }
    } catch (e) {
      console.error("Erro ao ler módulos no BottomNavigation:", e);
    }
    return { estoque: true, nfce: true, dashboardMobile: true };
  })();

  const activeNavItems = navItems.filter((item) => {
    if (item.to === '/dashboard/inventory' && modules.estoque === false) {
      return false;
    }
    return true;
  });

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav
        className="
          fixed bottom-0 inset-x-0 z-50
          md:hidden
          bg-zinc-900/95 backdrop-blur-xl
          border-t border-zinc-800
          flex items-center justify-around
          h-16
          safe-area-bottom
        "
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {activeNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200 ${
                isActive
                  ? 'text-blue-400'
                  : 'text-zinc-500 hover:text-zinc-300 active:scale-90'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`relative p-1 rounded-xl transition-all ${isActive ? 'bg-blue-500/15' : ''}`}>
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-400 rounded-full" />
                  )}
                </div>
                <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'text-blue-400' : 'text-zinc-500'}`}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}

        {/* Menu / Mais Tab */}
        <button
          onClick={() => setProfileOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-all duration-200 cursor-pointer ${
            profileOpen ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <div className={`p-1 rounded-xl ${profileOpen ? 'bg-blue-500/15' : ''}`}>
            <LayoutGrid size={22} strokeWidth={profileOpen ? 2.5 : 1.8} />
          </div>
          <span className="text-[10px] font-semibold tracking-wide">Mais</span>
        </button>
      </nav>

      {/* Admin Modules & Profile Drawer (bottom sheet) */}
      {profileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
            onClick={() => setProfileOpen(false)}
          />

          {/* Sheet */}
          <div
            className="
              fixed bottom-0 inset-x-0 z-[90]
              md:hidden
              bg-zinc-900 border-t border-zinc-800
              rounded-t-[2rem]
              p-5
              max-h-[90vh] overflow-y-auto custom-scrollbar
              shadow-2xl
              animate-in slide-in-from-bottom duration-300
            "
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.2rem)' }}
          >
            {/* Handle */}
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />

            {/* Profile Info Header */}
            <div className="flex items-center justify-between p-3.5 bg-zinc-950 rounded-2xl border border-zinc-800 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg text-white font-black text-sm">
                  {user?.name?.substring(0, 2).toUpperCase() || 'AD'}
                </div>
                <div>
                  <p className="font-bold text-white text-sm leading-tight">{user?.name || 'Administrador'}</p>
                  <p className="text-zinc-500 text-xs capitalize">{user?.role || 'Admin'} · {user?.tenant || ''}</p>
                </div>
              </div>
              <button
                onClick={() => setProfileOpen(false)}
                className="p-2 text-zinc-400 hover:text-white bg-zinc-900 rounded-xl border border-zinc-800"
              >
                <X size={16} />
              </button>
            </div>

            {/* Links organizados por módulos */}
            <div className="space-y-4 mb-4">
              {/* Vitrine Digital TV */}
              {modules?.vitrineDigital === true && (
                <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-blue-500/10 rounded-2xl border border-amber-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <Tv2 size={16} /> Vitrine Digital TV
                    </span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                      NOVO
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mb-3">Gerencie e publique os produtos em destaque na TV do seu estabelecimento.</p>
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); navigate('/dashboard/vitrine'); }}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-amber-500/20 cursor-pointer"
                  >
                    Abrir Vitrine Digital <ArrowRight size={14} />
                  </button>
                </div>
              )}

              {/* Estoque & Compras */}
              {modules.estoque !== false && (
                <div>
                  <p className="px-1 text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Package size={14} className="text-blue-400" /> Estoque & Compras
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setProfileOpen(false); navigate('/dashboard/inventory/mass-edit'); }}
                      className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                    >
                      <Save size={16} />
                      <span>Edição em Massa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setProfileOpen(false); navigate('/dashboard/inventory/stock-entry'); }}
                      className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                    >
                      <Package size={16} />
                      <span>Entrada de Estoque</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setProfileOpen(false); navigate('/dashboard/suppliers'); }}
                      className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                    >
                      <Truck size={16} />
                      <span>Fornecedores</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setProfileOpen(false); navigate('/dashboard/purchase-orders'); }}
                      className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                    >
                      <ShoppingCart size={16} />
                      <span>Pedidos Compra</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Ferramentas de Inventário & Fiscal */}
              <div>
                <p className="px-1 text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileSpreadsheet size={14} className="text-purple-400" /> Ferramentas & Fiscal
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); navigate('/dashboard/inventory/purchases/imports'); }}
                    className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                  >
                    <FileDown size={16} />
                    <span>Importar XML</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); navigate('/dashboard/inventory/stock-count'); }}
                    className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                  >
                    <FileSpreadsheet size={16} />
                    <span>Contagem Estoque</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); navigate('/dashboard/bulk-images'); }}
                    className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                  >
                    <Images size={16} />
                    <span>Imagens em Massa</span>
                  </button>
                  {modules.nfce !== false && (
                    <button
                      type="button"
                      onClick={() => { setProfileOpen(false); navigate('/dashboard/fiscal/gestao'); }}
                      className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                    >
                      <FileText size={16} />
                      <span>Gestão NFC-e</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Configurações do Sistema */}
              {['admin', 'superadmin'].includes(user?.role ?? '') && <button
                type="button"
                onClick={() => { setProfileOpen(false); navigate('/dashboard/reports'); }}
                className="w-full p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold text-sm flex items-center gap-2"
              ><BarChart2 size={18} /> Relatórios</button>}
              <div>
                <p className="px-1 text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Building2 size={14} className="text-zinc-400" /> Configurações
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); navigate('/dashboard/configuracoes/empresa'); }}
                    className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                  >
                    <Building2 size={16} />
                    <span>Empresa & A1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); navigate('/dashboard/equipe'); }}
                    className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                  >
                    <Users size={16} />
                    <span>Gestão de Equipe</span>
                  </button>
                  {modules.nfce !== false && (
                    <button
                      type="button"
                      onClick={() => { setProfileOpen(false); navigate('/dashboard/configuracoes/tributacao'); }}
                      className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                    >
                      <FileText size={16} />
                      <span>Tributação</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); navigate('/dashboard/configuracoes/payment-methods'); }}
                    className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs flex items-center gap-2 text-left active:scale-95 transition"
                  >
                    <CreditCard size={16} />
                    <span>Pagamentos</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Ações Rápidas & Sessão */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => { setProfileOpen(false); navigate('/'); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs active:scale-[0.98] transition shadow-md shadow-blue-600/20"
              >
                <Store size={18} />
                Ir para o Frente de Caixa (PDV)
              </button>

              <div className="flex gap-2">
                {modules.nfce !== false && (
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); setIsExportModalOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-semibold text-xs active:scale-[0.98] transition"
                  >
                    <Download size={15} />
                    Exportar XML
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-semibold text-xs active:scale-[0.98] transition"
                >
                  <LogOut size={15} />
                  Sair da conta
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <ExportXmlModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />
    </>
  );
}
