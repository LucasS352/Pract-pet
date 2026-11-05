import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';

// Páginas
import { LoginPage } from './pages/LoginPage';
import { PosPage } from './pages/PosPage';
import { DashboardPage } from './pages/DashboardPage';
const ReportsPage = React.lazy(() => import('./pages/dashboard/ReportsPage'));
import { DemoRegisterPage } from './pages/DemoRegisterPage';

// Layouts
import { DashboardLayout } from './layouts/DashboardLayout';
import { PetshopLayout } from './layouts/PetshopLayout';

// Páginas do Dashboard
import { InventoryPage } from './pages/dashboard/InventoryPage';
import { RegistersPage } from './pages/dashboard/RegistersPage';
import { EmpresaPage } from './pages/dashboard/EmpresaPage';
import { TributacaoPage } from './pages/dashboard/TributacaoPage';
import { ComandasPage } from './pages/dashboard/ComandasPage';
import UsersPage from './app/dashboard/users/page';
import CategoriesPage from './app/dashboard/inventory/categories/page';
import MassEntryPage from './app/dashboard/inventory/purchases/page';
import XmlImportPage from './app/dashboard/inventory/purchases/imports/page';
import MassEditPage from './app/dashboard/inventory/mass-edit/page';
import StockEntryPage from './app/dashboard/inventory/stock-entry/page';
import StockCountPage from './app/dashboard/inventory/stock-count/page';
import SysInitPage from './app/sys-init/page';
import GroupPortalPage from './pages/GroupPortalPage';
import SuppliersPage from './app/dashboard/suppliers/page';
import PurchaseOrdersPage from './app/dashboard/purchase-orders/page';
import PayablesPage from './app/dashboard/finance/payables/page';
import PaymentMethodsPage from './app/dashboard/configuracoes/payment-methods/page';
import AjusteFiscalPage from './app/dashboard/configuracoes/ajuste-fiscal/page';
import FiscalManagementPage from './app/dashboard/fiscal/gestao/page';
import BulkImagesPage from './pages/dashboard/BulkImagesPage';
import VitrinePage from './pages/dashboard/VitrinePage';
import VitrineTvPage from './pages/VitrineTvPage';
import { KdsPage } from './pages/KdsPage';
import { GarcomPage } from './pages/GarcomPage';
import { StationAccessPage } from './pages/StationAccessPage';
import { OperationalRoute } from './components/OperationalRoute';
import PetshopDashboardPage from './pages/petshop/PetshopDashboardPage';
import PetshopAgendaPage from './pages/petshop/PetshopAgendaPage';
import PetshopPetsPage from './pages/petshop/PetshopPetsPage';
import PetshopTutorsPage from './pages/petshop/PetshopTutorsPage';
import PetshopServicesPage from './pages/petshop/PetshopServicesPage';
import PetshopProductsPage from './pages/petshop/PetshopProductsPage';
import PetshopTeamPage from './pages/petshop/PetshopTeamPage';
import PetshopCommissionsPage from './pages/petshop/PetshopCommissionsPage';
import PetClientPortalPage from './pages/petshop/PetClientPortalPage';
import PetshopMassEditPage from './pages/petshop/PetshopMassEditPage';
import PetshopStockEntryPage from './pages/petshop/PetshopStockEntryPage';
import PetshopExpiryPage from './pages/petshop/PetshopExpiryPage';
import PetshopSuppliersPage from './pages/petshop/PetshopSuppliersPage';
import PetshopPurchaseOrdersPage from './pages/petshop/PetshopPurchaseOrdersPage';
import PetshopMetricsPage from './pages/petshop/PetshopMetricsPage';
import PetshopPackagesPage from './pages/petshop/PetshopPackagesPage';
import PetshopWhatsappPage from './pages/petshop/PetshopWhatsappPage';
import ExpiryAlertsPage from './app/dashboard/inventory/expiry-alerts/page';

// Stores
import { useAuthStore } from './store/auth';
import { useOperatorTokenStore } from './store/operatorToken';
import { isWaiterSession } from './lib/operatorAccess';
import { ShiftProvider } from './contexts/ShiftContext';

// Estilos globais
import './app/globals.css';
import { TermsAcceptanceModal } from './components/TermsAcceptanceModal';
import { OverduePaymentBanner } from './components/OverduePaymentBanner';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';

// ── PWA Service Worker ──────────────────────────────────────────────────────
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    console.log('[7bar PWA] App pronto para uso offline!');
  },
});

import { recordTelemetry } from './lib/telemetry';

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  navigator.serviceWorker.ready.then((reg) => {
    const swFileName = reg.active?.scriptURL ? reg.active.scriptURL.split('/').pop() : 'sw.js';
    const swVersionId = `pwa-v1.3.0#${swFileName}`;
    recordTelemetry({
      type: 'sw_version',
      path: swVersionId,
    });
  }).catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updateSW();
  }
});

// ── Componentes de Rota Protegida ────────────────────────────────────────────
const IS_DEMO = import.meta.env.VITE_APP_MODE === 'demo';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  const waiterSession = useOperatorTokenStore(state => isWaiterSession(state.token));
  if (!token) return <Navigate to={IS_DEMO ? '/demo' : '/login'} replace />;
  if (user?.station) return <Navigate to={user.station === 'WAITER' ? '/garcom' : '/kds'} replace />;
  if (waiterSession) return <Navigate to="/garcom" replace />;
  if (user?.role === 'stockist') return <Navigate to="/dashboard/inventory" replace />;
  return <><NetworkStatusBanner /><OverduePaymentBanner />{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  const waiterSession = useOperatorTokenStore(state => isWaiterSession(state.token));
  if (!token) return <Navigate to="/login" replace />;
  if (user?.station) return <Navigate to={user.station === 'WAITER' ? '/garcom' : '/kds'} replace />;
  const allowedRoles = ['admin', 'superadmin', 'stockist', 'operator'];
  if (waiterSession) return <Navigate to="/garcom" replace />;
  if (!allowedRoles.includes(user?.role || '')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ── Root App ─────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
        <Routes>
        {/* Rotas públicas */}
        <Route path="/acesso" element={<StationAccessPage />} />
        <Route path="/login" element={IS_DEMO ? <Navigate to="/demo" replace /> : <LoginPage />} />
        <Route path="/demo" element={<DemoRegisterPage />} />
        <Route path="/sys-init" element={<SysInitPage />} />
        <Route path="/grupo-portal" element={<GroupPortalPage />} />
        {/* Vitrine Digital — rotas públicas para TV (sem autenticação) */}
        <Route path="/vitrine/:tvPublicId" element={<VitrineTvPage />} />
        <Route path="/v/:tvPublicId" element={<VitrineTvPage />} />
        <Route path="/cliente-pet/:shopId" element={<PetClientPortalPage />} />

        {/* PDV — rota raiz protegida */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <ShiftProvider><PosPage /></ShiftProvider>
            </PrivateRoute>
          }
        />

        {/* Modo Garçom — interface dedicada mobile-first (sem caixa obrigatório) */}
        <Route
          path="/garcom"
          element={
            <OperationalRoute module="waiter">
              <GarcomPage />
            </OperationalRoute>
          }
        />

        <Route path="/kds" element={<OperationalRoute module="kds"><KdsPage /></OperationalRoute>} />

        {/* Vertical Pet Shop — layout e navegação independentes do PDV */}
        <Route
          path="/petshop"
          element={
            <AdminRoute>
              <ShiftProvider>
                <PetshopLayout />
              </ShiftProvider>
            </AdminRoute>
          }
        >
          <Route index element={<PetshopDashboardPage />} />
          <Route path="agenda" element={<PetshopAgendaPage />} />
          <Route path="pacotes" element={<PetshopPackagesPage />} />
          <Route path="pets" element={<PetshopPetsPage />} />
          <Route path="tutores" element={<PetshopTutorsPage />} />
          <Route path="servicos" element={<PetshopServicesPage />} />
          <Route path="produtos" element={<PetshopProductsPage />} />
          <Route path="whatsapp" element={<PetshopWhatsappPage />} />
          <Route path="equipe" element={<PetshopTeamPage />} />
          <Route path="equipe/comissoes" element={<PetshopCommissionsPage />} />
          <Route path="comissoes" element={<PetshopCommissionsPage />} />
          <Route path="fornecedores" element={<PetshopSuppliersPage />} />
          <Route path="pedidos-compra" element={<PetshopPurchaseOrdersPage />} />
          <Route path="edicao-massa" element={<PetshopMassEditPage />} />
          <Route path="entrada-estoque" element={<PetshopStockEntryPage />} />
          <Route path="alertas-validade" element={<PetshopExpiryPage />} />
          <Route path="metricas" element={<PetshopMetricsPage />} />
        </Route>

        {/* Dashboard e sub-rotas */}
        <Route
          path="/dashboard"
          element={
            <AdminRoute>
              <ShiftProvider><DashboardLayout /></ShiftProvider>
            </AdminRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="reports" element={<React.Suspense fallback={<p className="p-6">Carregando relatórios…</p>}><ReportsPage /></React.Suspense>} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="inventory/categories" element={<CategoriesPage />} />
          <Route path="inventory/purchases" element={<MassEntryPage />} />
          <Route path="inventory/purchases/imports" element={<XmlImportPage />} />
          <Route path="inventory/mass-edit" element={<MassEditPage />} />
          <Route path="inventory/stock-entry" element={<StockEntryPage />} />
          <Route path="inventory/expiry-alerts" element={<ExpiryAlertsPage />} />
          <Route path="inventory/stock-count" element={<StockCountPage />} />
          <Route path="registers" element={<RegistersPage />} />
          <Route path="configuracoes/empresa" element={<EmpresaPage />} />
          <Route path="configuracoes/tributacao" element={<TributacaoPage />} />
          <Route path="equipe" element={<UsersPage />} />
          <Route path="comandas" element={<ComandasPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="finance/payables" element={<PayablesPage />} />
          <Route path="configuracoes/payment-methods" element={<PaymentMethodsPage />} />
          <Route path="configuracoes/ajuste-fiscal" element={<AjusteFiscalPage />} />
          <Route path="fiscal/gestao" element={<FiscalManagementPage />} />
          <Route path="bulk-images" element={<BulkImagesPage />} />
          <Route path="vitrine" element={<VitrinePage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Toast global */}
      <Toaster 
        theme="dark" 
        position="top-center" 
        richColors 
        duration={2000}
        toastOptions={{
          style: { 
            fontSize: '0.95rem', 
            padding: '16px', 
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)'
          }
        }} 
      />
        <TermsAcceptanceModal />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
