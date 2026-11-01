"use client";
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, History, ArrowLeft, LogOut, Settings, FileText, Building2, Banknote, Store, CreditCard, CalendarClock } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const [expiryEnabled, setExpiryEnabled] = useState(false);

  useEffect(() => {
    // Verifica se o modulo de validade esta ativo para mostrar o link no menu
    import('@/lib/api').then(({ api }) => {
      api.get('/products/settings')
        .then(res => setExpiryEnabled(res.data?.enableExpiryControl ?? false))
        .catch(() => {});
    });
  }, []);

  const navItems = [
    { name: 'Analytics', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Frente de Caixa (PDV)', href: '/', icon: Store },
    { name: 'Contas a Pagar', href: '/dashboard/finance/payables', icon: Banknote },
    { name: 'Catalogo e Estoque', href: '/dashboard/inventory', icon: Package },
    ...(expiryEnabled ? [{ name: 'Validades de Lotes', href: '/dashboard/inventory/expiry-alerts', icon: CalendarClock }] : []),
    { name: 'Historico de Caixas', href: '/dashboard/registers', icon: History },
  ];

  const configItems = [
    { name: 'Empresa', href: '/dashboard/configuracoes/empresa', icon: Building2 },
    { name: 'Grupos Tributários', href: '/dashboard/configuracoes/tributacao', icon: FileText },
    { name: 'Formas de Pagamento', href: '/dashboard/configuracoes/payment-methods', icon: CreditCard },
  ];

  return (
    <div className="flex h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent drop-shadow-sm">
            7bar Admin
          </h1>
          <p className="text-zinc-500 text-sm mt-1">{user?.tenant || 'Carregando...'}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
              >
                <item.icon size={20} />
                <span className="font-semibold">{item.name}</span>
              </Link>
            )
          })}

          {/* Seção Configurações */}
          <div className="pt-4 pb-1">
            <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest px-4 mb-2 flex items-center gap-2">
              <Settings size={12} /> Configurações
            </p>
            {configItems.map(item => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors text-sm ${isActive ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
                >
                  <item.icon size={17} />
                  <span className="font-semibold">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-zinc-800 space-y-2">
          <Link to="/" className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={20} />
            <span className="font-semibold">Voltar ao PDV</span>
          </Link>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left">
            <LogOut size={20} />
            <span className="font-semibold">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-zinc-950 p-8 custom-scrollbar">
        {children}
      </main>
    </div>
  );
}
