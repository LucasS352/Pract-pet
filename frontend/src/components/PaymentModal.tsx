import { ComandaWorkspaceModal, type PetshopComandaDraft } from './ComandaWorkspaceModal';
import { syncLoadedComanda } from '@/lib/comanda-cart';
import { getComandaItemAttempt, clearComandaItemAttempt } from '@/lib/comanda-item-attempt';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { useShift } from '@/contexts/ShiftContext';
import { api } from '@/lib/api';
import { useDemoMissionsStore } from '@/store/demoMissions';
import { toast } from 'sonner';
import { saveOfflineSale } from '@/lib/db';
import type { OfflineSale, OfflineSalePayment } from '@/lib/db';
import { submitDurableCheckout } from '@/lib/durable-checkout';
import { withSaleOperationLock } from '@/lib/sale-operation-lock';
import { sendCheckout } from '@/lib/checkout-api';
import {
  CreditCard, Banknote, QrCode, X, Loader2, Plus, Trash2, Delete,
  ShoppingBag, Receipt, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, User, WifiOff, Tag, Lock, Printer, Settings2, UtensilsCrossed, Search, PawPrint
} from 'lucide-react';

type PayMode = 'simple' | 'nfce';
type NfceStatus = 'pendente' | 'autorizada' | 'rejeitada' | 'nao_emitida' | null;

const BASE_METHOD_CONFIG = [
  { id: 'dinheiro', icon: Banknote,   label: 'Dinheiro', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 ring-emerald-500 hover:border-emerald-500' },
  { id: 'pix',     icon: QrCode,     label: 'Pix',      color: 'bg-teal-500/10 text-teal-400 border-teal-500/20 ring-teal-500 hover:border-teal-500' },
  { id: 'credito', icon: CreditCard, label: 'Crédito',  color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 ring-indigo-500 hover:border-indigo-500' },
  { id: 'debito',  icon: CreditCard, label: 'Débito',   color: 'bg-sky-500/10 text-sky-400 border-sky-500/20 ring-sky-500 hover:border-sky-500' },
  { id: 'consumo_funcionario', icon: User, label: 'Consumo Colaborador', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20 ring-amber-500 hover:border-amber-500' }
];

const CUSTOM_COLOR = 'bg-purple-500/10 text-purple-400 border-purple-500/20 ring-purple-500 hover:border-purple-500';

const METHOD_NAMES: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Crédito', debito: 'Débito', consumo_funcionario: 'Consumo Colaborador' };

const TPAG_MAP: Record<string, string> = { dinheiro: '01', credito: '03', debito: '04', pix: '17', consumo_funcionario: '99', outros: '99' };

interface PaymentModalProps {
  experience?: 'food';
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  onPendingCountChange?: () => void;
  tenantConfig?: any;
  onSuccess?: () => void;
  initialOpenComanda?: boolean;
}

export function PaymentModal({ isOpen, onClose, isOnline, onPendingCountChange, tenantConfig, onSuccess, initialOpenComanda, experience }: PaymentModalProps) {
  const {
    total,
    items,
    clearCart,
    activeComandaId,
    activeComandaNumber,
    setActiveComanda,
    cartOperationId,
    getOrCreateOperationId,
    setOperationLocked,
  } = useCartStore();
  const { user } = useAuthStore();
  const { cashRegister, operator } = useShift();

  const modules = (() => {
    try {
      if (tenantConfig?.modulos) {
        return typeof tenantConfig.modulos === 'string' ? JSON.parse(tenantConfig.modulos) : tenantConfig.modulos;
      }
    } catch (e) {
      console.error("Erro ao ler módulos no PaymentModal:", e);
    }
    return { estoque: true, nfce: true, dashboardMobile: true };
  })();

  const isPetshopTheme = modules?.petshop !== false;
  const activeBaseMethods = useMemo(() => {
    if (isPetshopTheme) {
      return BASE_METHOD_CONFIG.filter(m => m.id !== 'consumo_funcionario');
    }
    return BASE_METHOD_CONFIG;
  }, [isPetshopTheme]);
  const isNfceEnabled = modules.nfce !== false && Boolean(tenantConfig?.nfceAtivo);

  const [payments, setPayments] = useState<{ id: string; method: string; label?: string; value: number; given: number }[]>([]);
  const [method, setMethod] = useState<string>('dinheiro');
  const [customMethods, setCustomMethods] = useState<{ id: string; name: string; hasVariablePricing?: boolean; emitirNfce?: boolean }[]>([]);
  const [fixedMethodsSettings, setFixedMethodsSettings] = useState<Record<string, { emitirNfce: boolean }>>({
    dinheiro: { emitirNfce: false },
    pix: { emitirNfce: false },
    credito: { emitirNfce: false },
    debito: { emitirNfce: false },
    consumo_funcionario: { emitirNfce: false },
  });
  const [operatorsList, setOperatorsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [variablePrices, setVariablePrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [payMode, setPayMode] = useState<PayMode>('simple');
  const [showConsumerForm, setShowConsumerForm] = useState(false);
  const [customerCpf, setCustomerCpf] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [saleResult, setSaleResult] = useState<Record<string, unknown> | null>(null);
  const [nfcePolling, setNfcePolling] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [savedOfflineTotal, setSavedOfflineTotal] = useState(0);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // ── Mutex anti-duplicação (useRef é síncrono — imune a race condition de state) ──
  const isSubmittingRef = useRef(false);
  // ── Chave canônica de idempotência: estável e vinculada ao ciclo do carrinho atual ──
  const operationId = cartOperationId || getOrCreateOperationId();

  // --- Desconto via PIN ---
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountPinInput, setDiscountPinInput] = useState('');
  const [discountValue, setDiscountValue] = useState(0); // valor de desconto em R$
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pendingDiscountStr, setPendingDiscountStr] = useState('');

  // ── Comandas Lançamento ───────────────────────────────────────────────────
  const [comandasModalOpen, setComandasModalOpen] = useState(false);
  const [selectedComandaId, setSelectedComandaId] = useState<string>('new');
  const [newComandaNumber, setNewComandaNumber] = useState('');
  const [newComandaCustomer, setNewComandaCustomer] = useState('');
  const [launchingComanda, setLaunchingComanda] = useState(false);
  const [petshopLaunchCache, setPetshopLaunchCache] = useState<{
    fingerprint: string;
    tutorId?: string;
    petId?: string;
    appointmentId?: string;
  } | null>(null);
  const handleOpenComandaPicker = useCallback(() => {
    if (items.length === 0) {
      toast.error('O carrinho está vazio.');
      return;
    }
    setNewComandaNumber('');
    setNewComandaCustomer('');
    setSelectedComandaId('new');
    setPetshopLaunchCache(null);
    setComandasModalOpen(true);
  }, [items.length]);

  const initialComandaOpenedRef = useRef(false);
  // Se aberto com a flag initialOpenComanda (acionada pelo F1 direto do PDV)
  useEffect(() => {
    if (!isOpen || !initialOpenComanda) initialComandaOpenedRef.current = false;
    if (isOpen && initialOpenComanda && !initialComandaOpenedRef.current) {
      initialComandaOpenedRef.current = true;
      handleOpenComandaPicker();
    }
  }, [isOpen, initialOpenComanda, handleOpenComandaPicker]);

  // Atalhos de teclado no modal de pagamento (F1 para comanda, Escape para fechar submodal)
  useEffect(() => {
    if (!isOpen) return;

    const handleModalKeyDown = (e: KeyboardEvent) => {
      // Se submodal de comandas estiver aberto
      if (comandasModalOpen) return;

      // Atalho F1: abrir Lançar em Comanda direto
      if (e.key === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        if (modules?.comandas === true && items.length > 0) {
          handleOpenComandaPicker();
        }
      }
    };

    window.addEventListener('keydown', handleModalKeyDown, true);
    return () => window.removeEventListener('keydown', handleModalKeyDown, true);
  }, [isOpen, comandasModalOpen, items.length, modules?.comandas, handleOpenComandaPicker]);

  const handleConfirmLaunchComanda = async (petshopDraft?: PetshopComandaDraft) => {
    if (items.length === 0 || launchingComanda || useCartStore.getState().isOperationLocked) return;
    if (items.some(item => item.fromComanda)) { toast.error('O carrinho já contém itens de uma comanda. Conclua ou cancele a cobrança antes de lançar novamente.'); return; }
    setLaunchingComanda(true);
    try {
      let comandaIdToUse = selectedComandaId;
      let petshopLink: Record<string, any> | undefined;

      if (isPetshopTheme && selectedComandaId === 'new') {
        if (!petshopDraft) throw new Error('Vincule um tutor e um pet para abrir o atendimento.');
        const fingerprint = JSON.stringify(petshopDraft);
        let created = petshopLaunchCache?.fingerprint === fingerprint
          ? { ...petshopLaunchCache }
          : { fingerprint };

        let tutorId = petshopDraft.tutor.id || created.tutorId;
        if (!tutorId) {
          const { data } = await api.post('/petshop/tutors', {
            name: petshopDraft.tutor.name,
            phone: petshopDraft.tutor.phone,
          });
          tutorId = data.id;
          created = { ...created, tutorId };
          setPetshopLaunchCache(created);
        }

        let petId = petshopDraft.pet.id || created.petId;
        if (!petId) {
          const { data } = await api.post('/petshop/pets', {
            customerId: tutorId,
            name: petshopDraft.pet.name,
            species: petshopDraft.pet.species,
          });
          petId = data.id;
          created = { ...created, tutorId, petId };
          setPetshopLaunchCache(created);
        }

        let appointmentId = created.appointmentId;
        let createdAppointmentThisRun = false;
        if (petshopDraft.appointment && !appointmentId) {
          const { data } = await api.post('/petshop/appointments', {
            petId,
            serviceIds: [petshopDraft.appointment.serviceId],
            professionalId: petshopDraft.appointment.professionalId,
            startsAt: new Date(petshopDraft.appointment.startsAt).toISOString(),
          });
          appointmentId = data.id;
          createdAppointmentThisRun = true;
          created = { ...created, tutorId, petId, appointmentId };
          setPetshopLaunchCache(created);
        }

        petshopLink = {
          tutorId,
          tutorName: petshopDraft.tutor.name,
          petId,
          petName: petshopDraft.pet.name,
          appointment: petshopDraft.appointment ? {
            id: appointmentId,
            serviceId: petshopDraft.appointment.serviceId,
            serviceName: petshopDraft.appointment.serviceName,
            professionalId: petshopDraft.appointment.professionalId,
            professionalName: petshopDraft.appointment.professionalName,
            startsAt: new Date(petshopDraft.appointment.startsAt).toISOString(),
          } : null,
        };
      }

      // Criar nova comanda se selecionado 'new'
      if (selectedComandaId === 'new') {
        const finalNumber = newComandaNumber.trim() || (petshopLink ? `Atendimento: ${petshopLink.petName} #${Date.now().toString().slice(-4)}` : '');
        if (!finalNumber) {
          toast.error(isPetshopTheme ? 'Informe uma identificação para o atendimento.' : 'Informe o número ou identificador da comanda/mesa (ex: 01, Mesa Sinuca 1).');
          setLaunchingComanda(false);
          return;
        }

        // Serialização ultra-compacta (<= 135 chars, segura contra limite varchar 191)
        let comandaNotes: string | undefined;
        if (petshopLink) {
          const compact = {
            v: 2,
            a: petshopLink.appointment?.id || undefined,
            t: !petshopLink.appointment?.id ? petshopLink.tutorId : undefined,
            p: !petshopLink.appointment?.id ? petshopLink.petId : undefined,
            s: petshopLink.appointment?.serviceName ? petshopLink.appointment.serviceName.slice(0, 24) : undefined,
            pr: petshopLink.appointment?.professionalName ? petshopLink.appointment.professionalName.slice(0, 18) : undefined,
            at: petshopLink.appointment?.startsAt ? new Date(petshopLink.appointment.startsAt).toISOString().slice(0, 16) : undefined,
          };
          comandaNotes = `PET2:${JSON.stringify(compact)}`;
        }

        const createRes = await api.post('/v1/comandas', {
          number: finalNumber,
          customerName: petshopLink ? `${petshopLink.tutorName} · ${petshopLink.petName}` : newComandaCustomer.trim() || undefined,
          notes: comandaNotes,
        });
        comandaIdToUse = createRes.data.id;
        setSelectedComandaId(comandaIdToUse);
      }

      // Enviar itens para a comanda
      const itemsPayload = items.map(i => ({
        productId: i.id,
        quantity: i.quantity,
        unitPrice: i.effectivePriceSell ?? i.priceSell,
        modifiers: i.modifiers && i.modifiers.length > 0
          ? i.modifiers.map(m => ({ optionId: m.optionId }))
          : undefined,
      }));

      const body = { items: itemsPayload };
      const attemptScope = `pdv:${comandaIdToUse}`;
      const attemptKey = getComandaItemAttempt(attemptScope, body);
      await api.post(`/v1/comandas/${comandaIdToUse}/items`, body, { headers: { 'Idempotency-Key': attemptKey } });

      toast.success(isPetshopTheme ? 'Atendimento criado e itens lançados com sucesso!' : 'Itens lançados na comanda com sucesso!');
      clearCart();
      clearComandaItemAttempt(attemptScope);
      setPetshopLaunchCache(null);
      setComandasModalOpen(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || (isPetshopTheme ? 'Erro ao abrir atendimento do pet.' : 'Erro ao lançar itens na comanda.');
      toast.error(msg);
    } finally {
      setLaunchingComanda(false);
    }
  };

  const handleChargeComandaFromModal = (comanda: any) => {
    if (!comanda.items || comanda.items.length === 0) {
      toast.error('Esta comanda não possui itens para cobrar.');
      return;
    }
    clearCart();
    setActiveComanda(comanda.id, comanda.number);

    syncLoadedComanda(comanda);
    setPayments([]);
    setDiscountValue(0);
    setInputValue('');

    toast.info(`Comanda #${comanda.number} carregada para cobrança no caixa!`);
    setComandasModalOpen(false);
  };

  const totalPaid = payments.reduce((acc, p) => acc + p.value, 0);
  const effectiveTotal = Math.max(0, total - discountValue);
  const remaining = Math.max(0, Math.round((effectiveTotal - totalPaid) * 100) / 100);
  const change = payments.filter(p => p.method === 'dinheiro').reduce((acc, p) => acc + (p.given - p.value), 0);

  // Determina dinamicamente se a venda atual exige emissão de NFC-e conforme a Regra de Prevalência Fiscal
  const willEmitNfce = useMemo(() => {
    if (!isNfceEnabled) return false;
    const listToCheck = payments.length > 0 ? payments : [{ method }];
    return listToCheck.some(p => {
      const norm = (p.method || '').toLowerCase().trim();
      if (norm in fixedMethodsSettings) {
        return fixedMethodsSettings[norm]?.emitirNfce !== false;
      }
      const custom = customMethods.find(cm => cm.id === p.method);
      if (custom) {
        return custom.emitirNfce !== false;
      }
      return true;
    });
  }, [isNfceEnabled, payments, method, fixedMethodsSettings, customMethods]);

  const [autoNfce, setAutoNfce] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('7bar_auto_nfce') === 'true';
    return false;
  });

  const [autoPrint, setAutoPrint] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('7bar_auto_print') === 'true';
    return false;
  });

  // ── Impressão de cupom 80mm ────────────────────────────────────────────
  const printReceipt = (saleData: Record<string, unknown>) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const companyName = tenantConfig?.name || tenantConfig?.razaoSocial || 'Estabelecimento';
    const cnpj        = tenantConfig?.cnpj  || '';
    const address     = tenantConfig?.address || tenantConfig?.endereco || '';
    const phone       = tenantConfig?.phone  || tenantConfig?.telefone  || '';
    const footerMsg   = tenantConfig?.receiptFooter || 'Obrigado pela preferência! Volte sempre!';

    const itemsHtml = items.map((item, idx) => `
      <div class="item">
        <div class="item-header">
          <span class="item-num">${String(idx + 1).padStart(2, '0')}</span>
          <span class="item-name">${item.name}</span>
          <span class="item-total">R$ ${item.subtotal.toFixed(2)}</span>
        </div>
        <div class="item-detail">
          ${item.quantity} UN x R$ ${Number(item.priceSell).toFixed(2)}
        </div>
      </div>
    `).join('');

    const paymentsHtml = payments.map(p => `
      <div class="payment-row">
        <span>${{ dinheiro: 'DINHEIRO', pix: 'PIX', credito: 'CRÉDITO', debito: 'DÉBITO' }[p.method] || p.method}</span>
        <span>R$ ${p.value.toFixed(2)}</span>
      </div>
    `).join('');

    const changeVal = payments
      .filter(p => p.method === 'dinheiro')
      .reduce((acc, p) => acc + (p.given - p.value), 0);

    const receiptHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Cupom</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 4mm 3mm; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 15px;
      font-weight: normal;
      width: 75mm;
      color: #000;
      background: #fff;
      line-height: 1.4;
    }
    .center  { text-align: center; }
    .bold    { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 7px 0; }
    .header  { text-align: center; margin-bottom: 7px; }
    .header .company { font-size: 19px; font-weight: bold; text-transform: uppercase; line-height: 1.2; }
    .header .subtitle { font-size: 13px; font-weight: normal; margin-top: 2px; }
    .meta { display: flex; justify-content: space-between; font-size: 13.5px; margin: 4px 0; font-weight: normal; }
    .label-row { text-align: center; font-weight: bold; font-size: 16px; margin: 6px 0; letter-spacing: 1px; }
    .item { margin: 6px 0; }
    .item-header { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; }
    .item-num   { min-width: 24px; font-weight: bold; }
    .item-name  { flex: 1; margin: 0 5px; word-break: break-word; font-weight: bold; }
    .item-total { white-space: nowrap; font-weight: bold; }
    .item-detail { font-size: 13px; font-weight: normal; color: #000; padding-left: 26px; margin-top: 2px; }
    .totals { margin-top: 6px; }
    .totals-row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 15px; font-weight: normal; }
    .totals-row.grand { font-size: 19px; font-weight: bold; margin-top: 6px; }
    .payment-row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 15px; font-weight: normal; }
    .change-row  { display: flex; justify-content: space-between; font-weight: bold; font-size: 17px; margin-top: 5px; }
    .footer { text-align: center; font-size: 13px; font-weight: normal; margin-top: 10px; line-height: 1.4; }
    @media print {
      html, body { width: 80mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">${companyName}</div>
    ${cnpj    ? `<div class="subtitle">CNPJ: ${cnpj}</div>` : ''}
    ${address ? `<div class="subtitle">${address}</div>`  : ''}
    ${phone   ? `<div class="subtitle">Tel: ${phone}</div>` : ''}
  </div>
  <div class="divider"></div>
  <div class="label-row">CUPOM NÃO FISCAL</div>
  <div class="meta"><span>${dateStr} ${timeStr}</span><span>Venda #${String(saleData.id || '—').slice(0, 8)}</span></div>
  <div class="meta"><span>Operador: ${ (operator?.name || user?.name || 'Operador') }</span></div>
  <div class="divider"></div>
  ${itemsHtml}
  <div class="divider"></div>
  <div class="totals">
    <div class="totals-row"><span>SUBTOTAL:</span><span>R$ ${total.toFixed(2)}</span></div>
    ${ effectiveTotal < total ? `<div class="totals-row"><span>DESCONTO:</span><span>-R$ ${discountValue.toFixed(2)}</span></div>` : '' }
    <div class="totals-row grand"><span>TOTAL:</span><span>R$ ${effectiveTotal.toFixed(2)}</span></div>
  </div>
  <div class="divider"></div>
  ${paymentsHtml}
  ${ changeVal > 0 ? `<div class="change-row"><span>TROCO:</span><span>R$ ${changeVal.toFixed(2)}</span></div>` : '' }
  <div class="divider"></div>
  <div class="footer">${footerMsg}</div>
  <br/><br/>
</body>
</html>`;

    const printWin = window.open('', '_blank', 'width=340,height=600,toolbar=0,menubar=0,scrollbars=0');
    if (!printWin) { toast.error('Popup bloqueado. Permita pop-ups para imprimir.'); return; }
    printWin.document.open();
    printWin.document.write(receiptHtml);
    printWin.document.close();
    printWin.onload = () => {
      setTimeout(() => {
        printWin.print();
        setTimeout(() => printWin.close(), 800);
      }, 300);
    };
  };



  // ── Detecta viewport mobile via matchMedia ──────────────────────────────
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPayments([]); setMethod('dinheiro'); setInputValue('');
      setPayMode('simple'); setShowConsumerForm(false); setCustomerCpf('');
      const cachedCustomer = sessionStorage.getItem('petshop_checkout_customer_name');
      if (cachedCustomer) {
        setCustomerName(cachedCustomer);
        setShowConsumerForm(true);
      } else {
        setCustomerName('');
      }
      setSaleResult(null); setNfcePolling(false); setSavedOffline(false);
      setDiscountValue(0); setDiscountPinInput(''); setPinVerified(false); setPendingDiscountStr('');
      setSelectedOperatorId(''); setAdvancedOpen(false);
      if (!isNfceEnabled) setAutoNfce(false);
      
      api.get('/operators')
        .then(res => setOperatorsList(res.data || []))
        .catch(console.error);

      api.get('/payment-methods')
        .then(res => {
          const standardKeys = ['dinheiro', 'pix', 'crédito', 'credito', 'débito', 'debito', 'consumo colaborador', 'consumo_funcionario'];
          setCustomMethods((res.data || []).filter((m: any) => 
            m.active && 
            !standardKeys.includes((m.name || '').toLowerCase().trim()) && 
            !standardKeys.includes((m.id || '').toLowerCase().trim())
          ));
        })
        .catch(console.error);

      api.get('/payment-methods/settings')
        .then(res => {
          if (res.data) setFixedMethodsSettings(res.data);
        })
        .catch(console.error);

      // Remove focus from the background search bar to prevent accidental typing
      setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 10);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  useEffect(() => { 
    if (method === 'dinheiro') {
      setInputValue('');
    } else {
      setInputValue(remaining > 0 ? remaining.toFixed(2) : '');
    }
  }, [remaining, method]);

  useEffect(() => {
    const selectedCustom = customMethods.find(cm => cm.id === method);
    if (selectedCustom?.hasVariablePricing) {
      api.get(`/payment-methods/${method}/prices`).then(res => {
        const priceMap: Record<string, number> = {};
        // Use standard cart price as fallback, override with saved prices if any
        items.forEach(item => { priceMap[item.id] = Number(item.priceSell); });
        res.data.forEach((p: any) => {
          if (priceMap[p.productId] !== undefined) priceMap[p.productId] = Number(p.price);
        });
        setVariablePrices(priceMap);
      }).catch(console.error);
    } else {
      setVariablePrices({});
    }
  }, [method, customMethods, items]);

  // Reopening the modal must not replace the operation identity or release an active sender.

  useEffect(() => {
    if (isOpen && (saleResult || savedOffline) && !nfcePolling) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [isOpen, saleResult, savedOffline, nfcePolling, onClose]);

  useEffect(() => {
    if (!isOpen || comandasModalOpen || saleResult || savedOffline) return;
    const handler = (e: KeyboardEvent) => {
      const activeIsInput = document.activeElement?.tagName.toLowerCase() === 'input';
      const activeIsSelect = document.activeElement?.tagName.toLowerCase() === 'select';

      if (!activeIsInput && !activeIsSelect) {
        // Atalhos numéricos para métodos padrão
        if (e.key === '1') { e.preventDefault(); setMethod('dinheiro'); document.getElementById('value-input')?.focus(); }
        if (e.key === '2') { e.preventDefault(); setMethod('pix');      document.getElementById('value-input')?.focus(); }
        if (e.key === '3') { e.preventDefault(); setMethod('credito');  document.getElementById('value-input')?.focus(); }
        if (e.key === '4') { e.preventDefault(); setMethod('debito');   document.getElementById('value-input')?.focus(); }

        // Navegação por setas entre métodos de pagamento
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const allMethods = [
            ...activeBaseMethods.map(m => m.id),
            ...customMethods.map(m => m.id)
          ];
          const currentIdx = allMethods.indexOf(method);
          if (currentIdx === -1) return;
          const cols = 2; // grid tem 2 colunas
          let next = currentIdx;
          if (e.key === 'ArrowRight') next = Math.min(currentIdx + 1, allMethods.length - 1);
          else if (e.key === 'ArrowLeft') next = Math.max(currentIdx - 1, 0);
          else if (e.key === 'ArrowDown') {
            // Se estiver na última linha vai direto para o input de valor
            const nextIdx = currentIdx + cols;
            if (nextIdx >= allMethods.length) {
              document.getElementById('value-input')?.focus();
              return;
            }
            next = nextIdx;
          }
          else if (e.key === 'ArrowUp') next = Math.max(currentIdx - cols, 0);
          if (next !== currentIdx) setMethod(allMethods[next]);
        }

        // Tab move foco para o campo de valor
        if (e.key === 'Tab') {
          e.preventDefault();
          document.getElementById('value-input')?.focus();
        }
        // Enter: se ainda tem valor a pagar, vai para o campo de valor
        // Se já está pago (remaining=0), deixa cair no handler de finalizar abaixo
        if (e.key === 'Enter' && remaining > 0) {
          e.preventDefault();
          document.getElementById('value-input')?.focus();
          return;
        }
        if (e.key === 'Enter' && remaining <= 0) {
          e.preventDefault();
          if (isSubmittingRef.current) return;
          if (isOnline) handleConfirm(isNfceEnabled && autoNfce ? 'nfce' : 'simple');
          else handleSaveOffline();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, comandasModalOpen, remaining, saleResult, savedOffline, isOnline, autoNfce, isNfceEnabled, method, customMethods]);

  useEffect(() => {
    if (!nfcePolling || !saleResult?.id) return;

    // ── Polling sequencial seguro do status NFC-e ──────────────────────────
    // Usa mesmo padrão: destroyed flag + AbortController.
    // X-Silent-Poll: 401 aqui não derruba sessão.
    let destroyed = false;
    let isFinished = false;
    let nfceAbortController: AbortController | null = null;
    let attempts = 0;

    const pollNfce = async () => {
      if (destroyed || isFinished) return;
      attempts++;

      nfceAbortController = new AbortController();
      try {
        const res = await api.get(`/sales/${saleResult.id}/nfce-status`, {
          timeout: 10_000,
          signal: nfceAbortController.signal,
          headers: { 'X-Silent-Poll': 'true' },
        });
        if (!destroyed && !isFinished) {
          const status: NfceStatus = res.data.nfceStatus as NfceStatus;
          setSaleResult(prev => ({ ...prev, ...res.data }));
          if (status === 'autorizada' || status === 'rejeitada' || status === 'nao_emitida') {
            isFinished = true;
            setNfcePolling(false);
            return; // encerra o ciclo
          }
        }
      } catch {
        // Silenciado — polling fiscal nunca derruba sessão
      } finally {
        if (!destroyed && !isFinished) {
          if (attempts < 15) {
            setTimeout(pollNfce, 2_000);
          } else {
            // Esgotou orçamento de tentativas (ex: oscilação de rede ou SEFAZ lenta)
            isFinished = true;
            setNfcePolling(false);
            toast.warning(
              'Não foi possível confirmar o status da NFC-e em tempo real. A venda foi registrada e a nota pode ser consultada no Gestor Fiscal.',
              { duration: 6000 }
            );
          }
        }
      }
    };

    pollNfce();
    return () => {
      destroyed = true;
      isFinished = true;
      nfceAbortController?.abort();
    };

  }, [nfcePolling, saleResult?.id]);

  const handleAddPayment = () => {
    let val = parseFloat(inputValue.toString().replace(',', '.'));
    if (isNaN(val) || inputValue === '') val = remaining;
    if (val <= 0) { toast.error('Digite um valor válido.'); return; }
    if (remaining <= 0) { toast.error('Total já atingido.'); return; }
    // Métodos custom: permitem valor livre (ex: iFood com 12% a mais)
    const isCustomMethod = customMethods.some(cm => cm.id === method);
    if (!isCustomMethod && method !== 'dinheiro' && val > remaining) { toast.error('Cartão/Pix: valor não pode exceder o saldo devedor.'); return; }
    const actualValue = (!isCustomMethod && method === 'dinheiro' && val > remaining) ? remaining : val;
    const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const customLabel = customMethods.find(cm => cm.id === method)?.name;
    setPayments([...payments, { id, method, label: customLabel, value: actualValue, given: val }]);
  };

  // ── Salva venda offline no IndexedDB (OFFLINE_CONTINGENCY) ──────────────
  const handleSaveOffline = async () => {
    if (customMethods.find(cm => cm.id === method)?.hasVariablePricing) {
      toast.error('Preços Variáveis não são suportados no modo Offline.');
      return;
    }
    await handleConfirm('simple', true);
  };

  const handleVerifyDiscountPin = async () => {
    if (!discountPinInput) { toast.error('Digite o PIN.'); return; }
    setVerifyingPin(true);
    try {
      await api.post('/tenants/me/verify-discount-pin', { pin: discountPinInput });
      setPinVerified(true);
      setDiscountPinInput('');
    } catch {
      toast.error('PIN incorreto. Tente novamente.');
      setDiscountPinInput('');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleApplyDiscount = () => {
    const val = parseFloat(pendingDiscountStr);
    if (isNaN(val) || val < 0) { toast.error('Valor inválido.'); return; }
    if (val >= total) { toast.error('Desconto não pode ser igual ou maior que o total.'); return; }
    setDiscountValue(val);
    setPayments([]);
    setInputValue((total - val).toFixed(2));
    setDiscountModalOpen(false);
    setPinVerified(false);
    setPendingDiscountStr('');
    toast.success(`Desconto de R$ ${val.toFixed(2)} aplicado!`);
  };

  const handleConfirm = async (mode: PayMode, offlineOnly = false) => {
    const releaseOwnCart = () => {
      const cart = useCartStore.getState();
      if (cart.cartOperationId === operationId && cart.scope === `7bar-cart-v2:${user?.tenant}:${operator?.id}`) cart.setOperationLocked(false);
    };
    const clearOwnCart = () => {
      const cart = useCartStore.getState();
      if (cart.cartOperationId === operationId && cart.scope === `7bar-cart-v2:${user?.tenant}:${operator?.id}`) cart.clearCart();
    };
    const selectedCustom = customMethods.find(cm => cm.id === method);
    const isVariablePricingActive = selectedCustom?.hasVariablePricing;

    if (!isVariablePricingActive && remaining > 0) { 
      toast.error(`Falta R$ ${remaining.toFixed(2)} para finalizar.`); 
      return; 
    }
    if (isVariablePricingActive && payments.length > 0) {
      toast.error('Pagamentos parciais não são permitidos usando Preços na Plataforma. Limpe os pagamentos e tente novamente.');
      return;
    }
    
    let finalPayments = [...payments];
    if (isVariablePricingActive) {
      const val = items.reduce((acc, item) => acc + (variablePrices[item.id] || Number(item.priceSell)) * item.quantity, 0);
      finalPayments = [{
        id: 'var_price_payment',
        method: method,
        label: selectedCustom.name,
        value: val,
        given: val
      }];
    }

    const isConsumo = finalPayments.some(p => p.method === 'consumo_funcionario');
    if (isConsumo && !selectedOperatorId) {
      toast.error('Por favor, selecione o funcionário que está consumindo.');
      return;
    }

    if (!isConsumo && !cashRegister?.id) {
      toast.error('Nenhum caixa aberto detectado. Abra ou selecione um caixa antes de finalizar a venda.');
      return;
    }

    // ── MUTEX: bloqueia qualquer segundo disparo antes do React atualizar o estado ──
    if (isSubmittingRef.current) {
      console.warn('[PaymentModal] handleConfirm bloqueado — já está em processamento.');
      return;
    }
    isSubmittingRef.current = true;

    setLoading(true);
    setOperationLocked(true);
    const actualMode = isConsumo ? 'simple' : (isNfceEnabled ? mode : 'simple');
    setPayMode(actualMode);
    try {
      const body = {
        items: items.map(i => ({ 
          productId: i.id, 
          quantity: i.quantity, 
          // Quando há preço variável (ex: iFood), usa o preço da plataforma configurado;
          // caso contrário, usa o preço efetivo/normal do produto.
          priceUnit: isVariablePricingActive
            ? (variablePrices[i.id] ?? Number(i.priceSell))
            : (i.effectivePriceSell ?? i.priceSell),
          modifiers: i.modifiers ? i.modifiers.map(m => ({
            optionId: m.optionId,
            componentProductId: m.componentProductId,
          })) : undefined
        })),
        payments: finalPayments.map(p => ({ method: p.method, label: p.label, value: p.value, troco: Math.max(0, p.given - p.value) })),
        discount: discountValue,
        cashRegisterId: cashRegister?.id,
        operatorId: operator?.id ?? user?.id,
        consumedByOperatorId: isConsumo ? selectedOperatorId : undefined,
        emitirNfce: isConsumo ? false : (actualMode === 'nfce'),
        idempotencyKey: operationId, // Chave canônica estável do ciclo atual do carrinho
        petshopAppointmentId: sessionStorage.getItem('petshop_checkout_appointment_id') || undefined,
        // Quando há comanda ativa, separa os itens extras adicionados no balcão para baixa normal
        ...(activeComandaId ? {
          comandaId: activeComandaId,
          expectedComandaItems: items.filter(i => i.fromComanda).map(i => ({
            id: i.comandaItemId, quantity: Number(i.quantity), totalPrice: Number(i.subtotal),
          })),
          extraItems: items
            .filter(i => !i.fromComanda)
            .map(i => ({
              productId: i.id,
              quantity: i.quantity,
              priceUnit: isVariablePricingActive
                ? (variablePrices[i.id] ?? Number(i.priceSell))
                : (i.effectivePriceSell ?? i.priceSell),
              modifiers: i.modifiers && i.modifiers.length > 0
                ? i.modifiers.map(m => ({
                    optionId: m.optionId,
                    componentProductId: m.componentProductId,
                  }))
                : undefined,
            })),
        } : {}),
        ...(actualMode === 'nfce' ? { customerCpf: customerCpf || undefined, customerName: customerName || undefined } : {}),
      };

      // ── PERSISTÊNCIA DURÁVEL ANTES DO PRIMEIRO POST ─────────────────────────
      // A operação fica imutável no IndexedDB com chave e snapshot completo antes do envio
      const localSale = {
        localId:        operationId,
        idempotencyKey: operationId,
        createdAt:      new Date().toISOString(),
        operatorId:     operator?.id ?? user?.id ?? 'unknown',
        tenantId:       user?.tenant ?? 'unknown',
        cashRegisterId: cashRegister?.id,
        comandaId:      activeComandaId || undefined,
        consumedByOperatorId: isConsumo ? selectedOperatorId : undefined,
        subtotal:       items.reduce((acc, i) => acc + i.subtotal, 0),
        discount:       discountValue,
        total,
        items:          items.map(item => ({
          productId:   item.id,
          productName: item.name,
          unit:        'UN',
          quantity:    item.quantity,
          priceUnit:   Number(item.priceSell),
          discount:    0,
          subtotal:    item.subtotal,
          ncm: null, cest: null, cfop: '5102', origem: 0,
          csosn: null, cstIcms: null,
          aliqIcms: 0, valorIcms: 0,
          cstPis: '99', aliqPis: 0, valorPis: 0,
          cstCofins: '99', aliqCofins: 0, valorCofins: 0,
          modifiers: item.modifiers ? item.modifiers.map(m => ({
            optionId: m.optionId,
            componentProductId: m.componentProductId,
            name: m.optionName,
            quantity: m.quantity,
            priceAdjustment: m.priceAdjustment,
          })) : undefined,
          fromComanda: item.fromComanda,
        })),
        payments:       finalPayments.map(p => ({
          method: p.method as OfflineSalePayment['method'],
          label:  p.label,
          tPag:   TPAG_MAP[p.method] ?? '99',
          value:  p.value,
          troco:  Math.max(0, p.given - p.value),
        })),
        customerCpf:    customerCpf || undefined,
        customerName:   customerName || undefined,
        emitirNfce:     false,
        rawPayload:     body,
        syncStatus:     'SYNCING',
      } satisfies Omit<OfflineSale, 'id'>;

      if (offlineOnly) {
        await withSaleOperationLock(localSale.tenantId, operationId, () => saveOfflineSale({ ...localSale, syncStatus: 'PENDING' }));
        setSavedOfflineTotal(localSale.total);
        releaseOwnCart();
        clearOwnCart();
        setSavedOffline(true);
        toast.success('Pedido salvo neste dispositivo. A confirmação do servidor está pendente.');
        onPendingCountChange?.();
        return;
      }

      const outcome = await submitDurableCheckout(localSale, () => sendCheckout(body, localSale.tenantId, localSale.operatorId));
      releaseOwnCart();
      if (outcome.kind === 'review') {
        toast.error(outcome.message || 'Operação exige conferência. Não reenvie como outra venda.');
        return;
      }
      if (outcome.kind === 'pending') {
        setSavedOfflineTotal(localSale.total);
        clearOwnCart();
        setSavedOffline(true);
        toast.warning('Pedido preservado. Resultado do servidor ainda não confirmado; acompanhe as pendências.');
        onPendingCountChange?.();
        return;
      }
      const res = { data: outcome.data };
      if (isVariablePricingActive) {
        api.put(`/payment-methods/${method}/prices`, {
          prices: Object.entries(variablePrices).map(([productId, price]) => ({ productId, price }))
        }).catch(console.error); // Executa em background
      }



      releaseOwnCart();
      setSaleResult(res.data);
      clearOwnCart();
      onSuccess?.();
      useDemoMissionsStore.getState().completeMission('saleCompleted');
      const petshopApptId = sessionStorage.getItem('petshop_checkout_appointment_id');
      if (petshopApptId) {
        sessionStorage.removeItem('petshop_checkout_appointment_id');
        sessionStorage.removeItem('petshop_checkout_customer_name');
        sessionStorage.removeItem('petshop_checkout_customer_phone');
        api.patch('/petshop/appointments/' + petshopApptId + '/status', { status: 'delivered' }).catch(console.error);
      }
      if (actualMode === 'nfce') { toast.info('NFC-e em processamento...', { duration: 3000 }); setNfcePolling(true); }
      else toast.success('Venda finalizada!', { duration: 1500 });
      // Impressão automática do cupom
      if (autoPrint) {
        setTimeout(() => printReceipt(res.data), 300);
      }
    } catch (err: unknown) {
      // Storage/lock/local failures are NOT successful contingency.
      // Keep all inputs so the operator can fix storage or inspect the existing operation.
      releaseOwnCart();
      toast.error((err as Error)?.message || 'Não foi possível preservar a operação. O carrinho foi mantido.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // ── Numpad handler para mobile ──────────────────────────────────────────
  const handleNumpadPress = useCallback((key: string) => {
    if (key === 'backspace') {
      setInputValue(prev => prev.slice(0, -1));
    } else if (key === '.') {
      setInputValue(prev => prev.includes('.') ? prev : prev + '.');
    } else {
      setInputValue(prev => prev + key);
    }
  }, []);

  if (!isOpen) return null;

  // ── Modal de desconto via PIN ────────────────────────────────────────────
  const DiscountModal = discountModalOpen ? (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xs shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Tag size={18} className="text-amber-400" />
          </div>
          <div>
            <h4 className="font-bold text-white">Aplicar Desconto</h4>
            <p className="text-xs text-zinc-500">{pinVerified ? 'Digite o valor do desconto' : 'Digite o PIN de autorização'}</p>
          </div>
          <button onClick={() => setDiscountModalOpen(false)} className="ml-auto text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        {!pinVerified ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 justify-center text-zinc-400 text-sm">
              <Lock size={14} /> PIN do Gerente necessário
            </div>
            <input
              type="password"
              value={discountPinInput}
              onChange={e => setDiscountPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleVerifyDiscountPin(); } }}
              placeholder="••••"
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              maxLength={8}
            />
            <button
              onClick={handleVerifyDiscountPin}
              disabled={verifyingPin || !discountPinInput}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold transition active:scale-95"
            >
              {verifyingPin ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Confirmar PIN'}
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 justify-center text-emerald-400 text-sm font-semibold">
              <CheckCircle2 size={14} /> PIN correto! Autorizado.
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">R$</span>
              <input
                type="number"
                value={pendingDiscountStr}
                onChange={e => setPendingDiscountStr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApplyDiscount(); } }}
                placeholder="0,00"
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xl font-bold text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <p className="text-xs text-zinc-500 text-center">
              Total atual: <strong className="text-white">R$ {total.toFixed(2)}</strong>
            </p>
            <button
              onClick={handleApplyDiscount}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition active:scale-95"
            >
              Aplicar Desconto
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;


  // ── Tela: Venda salva offline ────────────────────────────────────────────
  if (savedOffline) {
    return (
      <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 ${isPetshopTheme ? 'petcare-payment-theme' : ''}`}>
        <div className={`bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden ${isPetshopTheme ? 'petcare-payment-card' : ''}`}>
          <div className="p-8 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center mx-auto">
              <WifiOff className="text-orange-400" size={36} />
            </div>
            <h3 className="text-2xl font-bold text-white">Venda em Contingência!</h3>
            <p className="text-zinc-400 text-sm">Salva localmente. Será sincronizada automaticamente quando a conexão retornar.</p>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
              <p className="text-orange-400 font-bold text-xl">R$ {savedOfflineTotal.toFixed(2)}</p>
              <p className="text-orange-400/70 text-xs mt-1">OFFLINE_CONTINGENCY</p>
            </div>
          </div>
          <div className="p-6 border-t border-zinc-800">
            <button onClick={onClose} className={`w-full py-3.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white transition active:scale-95 relative ${isPetshopTheme ? 'petcare-payment-submit' : ''}`}>
              Nova Venda
              <span className="absolute top-1/2 -translate-y-1/2 right-4 text-[10px] font-mono bg-black/20 text-blue-200 px-1.5 py-0.5 rounded">Enter</span>
            </button>
          </div>
        </div>
      </div>
    );
  }


  // ── Tela: Resultado online ───────────────────────────────────────────────
  if (saleResult) {
    const status = saleResult.nfceStatus as NfceStatus;
    return (
      <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 ${isPetshopTheme ? 'petcare-payment-theme' : ''}`}>
        <div className={`bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${isPetshopTheme ? 'petcare-payment-card' : ''}`}>
          <div className="p-8 text-center">
            {saleResult.emitirNfce ? (
              <>
                {status === 'pendente' && (
                  <div className="space-y-4">
                    <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center mx-auto"><Clock className="text-amber-400 animate-pulse" size={36} /></div>
                    <h3 className="text-2xl font-bold text-white">Aguardando SEFAZ...</h3>
                    <div className="flex gap-1 justify-center">{[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                  </div>
                )}
                {status === 'autorizada' && (
                  <div className="space-y-4">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto"><CheckCircle2 className="text-emerald-400" size={40} /></div>
                    <h3 className="text-2xl font-bold text-emerald-400">NFC-e Autorizada! ✓</h3>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-left space-y-2">
                      <p className="text-xs text-zinc-500 font-mono break-all"><span className="text-zinc-400 font-semibold">Chave: </span>{saleResult.nfceChave as string}</p>
                      <p className="text-xs text-zinc-500 font-mono"><span className="text-zinc-400 font-semibold">Protocolo: </span>{saleResult.nfceProtocolo as string}</p>
                    </div>
                  </div>
                )}
                {status === 'rejeitada' && (
                  <div className="space-y-4">
                    <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto"><XCircle className="text-red-400" size={40} /></div>
                    <h3 className="text-2xl font-bold text-red-400">NFC-e Rejeitada</h3>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 w-full overflow-hidden">
                      <p className="text-red-400 font-mono text-sm break-all" style={{ wordBreak: 'break-all', whiteSpace: 'normal', width: '100%' }}>{saleResult.nfceMotivoRejeicao as string}</p>
                    </div>
                  </div>
                )}
                {status === 'nao_emitida' && (
                  <div className="space-y-4">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="text-emerald-400" size={40} />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Venda Concluída!</h3>
                    <p className="text-zinc-400 text-sm">
                      {(saleResult as any)?.nfceMotivoRejeicao?.includes('SNF') || (saleResult as any)?.nfceMotivoRejeicao?.includes('sem nota')
                        ? 'Venda finalizada com sucesso (Produtos sem nota fiscal).'
                        : 'Venda finalizada com sucesso.'}
                    </p>

                    {change > 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                        <p className="text-emerald-400 font-bold text-xl">Troco: R$ {change.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto"><CheckCircle2 className="text-emerald-400" size={40} /></div>
                <h3 className="text-2xl font-bold text-white">Venda Finalizada!</h3>
                <p className="text-zinc-400">Total cobrado: <span className="text-white font-bold">R$ {Number(saleResult.total).toFixed(2)}</span></p>
                {change > 0 && <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-emerald-400 font-bold text-xl">Troco: R$ {change.toFixed(2)}</p></div>}
              </div>
            )}
          </div>
          <div className={`p-6 border-t border-zinc-800 bg-zinc-900/50 ${isPetshopTheme ? 'petcare-payment-footer' : ''}`}>
            <button onClick={onClose} disabled={nfcePolling} className={`w-full py-3.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition active:scale-95 flex items-center justify-center gap-2 relative ${isPetshopTheme ? 'petcare-payment-submit' : ''}`}>
              {nfcePolling ? <><Loader2 className="animate-spin" size={18} /> Aguardando...</> : (
                <>
                  Nova Venda
                  <span className="absolute top-1/2 -translate-y-1/2 right-4 text-[10px] font-mono bg-black/20 text-blue-200 px-1.5 py-0.5 rounded">Enter</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tela principal ───────────────────────────────────────────────────────
  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 ${isPetshopTheme ? 'petcare-payment-theme' : ''}`}>

      <div className={`bg-zinc-900 border border-zinc-800 w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col ${isMobile ? 'rounded-none max-w-none max-h-none h-full' : 'rounded-3xl max-w-2xl max-h-[95vh]'} ${isPetshopTheme ? 'petcare-payment-card' : ''}`}>
        <div className={`flex justify-between items-center p-4 md:p-6 border-b border-zinc-800 bg-zinc-900/50 shrink-0 ${isPetshopTheme ? 'petcare-payment-header' : ''}`}>
          {isPetshopTheme && (
            <div className="petcare-payment-hero" aria-hidden="true">
              <img src="/petcare/hero-dog-cat.webp" alt="" />
            </div>
          )}
          <div className={isPetshopTheme ? 'relative z-10 min-w-0' : ''}>
            <h2 className={`text-2xl font-bold text-white tracking-tight ${isPetshopTheme ? 'petcare-payment-title' : ''}`}>Finalizar Pagamento</h2>
            {!isOnline && (
              <p className="text-orange-400 text-xs font-semibold flex items-center gap-1 mt-1">
                <WifiOff size={12} /> Modo offline — venda será salva localmente
              </p>
            )}
          </div>

          <div className={`flex items-center gap-2.5 ${isPetshopTheme ? 'relative z-10 shrink-0' : ''}`}>
            {modules?.comandas === true && (
              <button
                type="button"
                onClick={handleOpenComandaPicker}
                className={`flex items-center justify-center gap-2 px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold rounded-xl text-xs sm:text-sm transition active:scale-95 cursor-pointer shadow-sm shadow-amber-500/10 ${isPetshopTheme ? 'petcare-payment-comanda' : ''}`}
                title={isPetshopTheme ? "Atalho: F1 · Atendimento do Pet" : "Atalho: F1"}
              >
                {isPetshopTheme ? <PawPrint size={16} /> : <UtensilsCrossed size={16} />}
                {!isPetshopTheme && <span className="hidden sm:inline bg-amber-500/20 text-amber-300 text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 font-bold">F1</span>}
                <span>{isPetshopTheme ? 'Lançar em Atendimento' : 'Lançar em Comanda / Mesa'}</span>
              </button>
            )}
            <button onClick={onClose} aria-label="Fechar pagamento" className={`p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full transition text-zinc-400 hover:text-white ${isPetshopTheme ? 'petcare-payment-close' : ''}`}><X size={20} /></button>
          </div>
        </div>

        <div className={`p-4 md:p-6 flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-8 flex-1 overflow-y-auto custom-scrollbar ${isPetshopTheme ? 'petcare-payment-body' : ''}`}>
          {/* Painel Esquerdo */}
          <div className="space-y-5">
            <div>
              <span className={`text-zinc-400 font-medium block mb-3 text-sm ${isPetshopTheme ? 'petcare-payment-label' : ''}`}>Selecione o Método</span>
              <div className="grid grid-cols-2 gap-2">
                {activeBaseMethods.map((m, index) => (
                  <button key={m.id} onClick={() => { setMethod(m.id); if (!isMobile) document.getElementById('value-input')?.focus(); }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-sm relative overflow-hidden ${isMobile ? 'min-h-[52px]' : ''} ${method === m.id ? `${m.color} ring-2 ring-offset-2 ring-offset-zinc-900` : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:bg-zinc-800'} ${isPetshopTheme ? `petcare-payment-method ${method === m.id ? 'is-selected' : ''}` : ''}`}>
                    {!isMobile && <div className="absolute top-0 right-0 bg-zinc-800/50 px-1.5 py-0.5 rounded-bl-lg text-[10px] font-bold text-zinc-500">{index + 1}</div>}
                    <m.icon size={18} /><span className="font-semibold">{m.label}</span>
                    {isPetshopTheme && method === m.id && <CheckCircle2 className="petcare-method-check" size={16} aria-hidden="true" />}
                  </button>
                ))}
                {customMethods.map((cm) => (
                  <button key={cm.id} onClick={() => { setMethod(cm.id); if (!isMobile) document.getElementById('value-input')?.focus(); }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-sm relative overflow-hidden ${isMobile ? 'min-h-[52px]' : ''} ${method === cm.id ? `${CUSTOM_COLOR} ring-2 ring-offset-2 ring-offset-zinc-900` : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:bg-zinc-800'} ${isPetshopTheme ? `petcare-payment-method ${method === cm.id ? 'is-selected' : ''}` : ''}`}>
                    <CreditCard size={18} /><span className="font-semibold truncate">{cm.name}</span>
                    {isPetshopTheme && method === cm.id && <CheckCircle2 className="petcare-method-check" size={16} aria-hidden="true" />}
                  </button>
                ))}
              </div>

              {!isPetshopTheme && method === 'consumo_funcionario' && (
                <div className="mt-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-zinc-400 text-xs font-semibold block">Qual colaborador está consumindo?</label>
                  <select
                    value={selectedOperatorId}
                    onChange={e => setSelectedOperatorId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Selecione o colaborador...</option>
                    {operatorsList.map(op => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {customMethods.find(cm => cm.id === method)?.hasVariablePricing ? null : (
              <div>
                <label className="text-zinc-400 text-sm font-medium mb-2 block">Deseja passar qual valor?</label>
                <form onSubmit={e => { e.preventDefault(); handleAddPayment(); }} className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">R$</span>
                    <input
                      type="number"
                      id="value-input"
                      step="any"
                      min="0"
                      className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xl font-bold text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isPetshopTheme ? 'petcare-payment-input' : ''}`}
                      placeholder="0.00" value={inputValue} onChange={e => setInputValue(e.target.value)}
                      disabled={remaining <= 0}
                    />
                  </div>
                  <button type="submit" disabled={remaining <= 0} className={`bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white p-3.5 rounded-xl transition flex-shrink-0 ${isPetshopTheme ? 'petcare-payment-add' : ''}`}><Plus size={22} /></button>
                  <button
                    type="button"
                    onClick={() => { setDiscountModalOpen(true); setPinVerified(false); setDiscountPinInput(''); }}
                    className={`bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 p-3.5 rounded-xl transition flex-shrink-0 ${isPetshopTheme ? 'petcare-payment-discount' : ''}`}
                    title="Aplicar desconto (requer PIN)"
                  >
                    <Tag size={20} />
                  </button>
                </form>
                {method === 'dinheiro' && parseFloat(inputValue) > remaining && remaining > 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mt-4 animate-in zoom-in-95 duration-200 shadow-inner">
                    <p className="text-emerald-400 text-sm font-bold mb-1 uppercase tracking-wider">Troco a devolver</p>
                    <p className="text-emerald-400 font-black text-3xl">R$ {(parseFloat(inputValue) - remaining).toFixed(2)}</p>
                  </div>
                )}

              </div>
            )}

            <div className="border-t border-zinc-800 pt-4">
              <button onClick={() => setShowConsumerForm(!showConsumerForm)}
                className={`flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm font-medium transition w-full ${isPetshopTheme ? 'petcare-payment-consumer-toggle' : ''}`}>
                <User size={15} /><span>Identificar consumidor (CPF/Nome)</span>
                {showConsumerForm ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
              </button>
              {showConsumerForm && (
                <div className="mt-3 space-y-3">
                  <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-blue-500" placeholder="CPF (opcional)" value={customerCpf} onChange={e => setCustomerCpf(e.target.value)} maxLength={14} />
                  <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" placeholder="Nome do consumidor (opcional)" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {/* Painel Direito: Resumo */}
          <div className={`bg-zinc-950 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between relative shrink-0 h-fit md:h-auto ${isPetshopTheme ? 'petcare-payment-summary' : ''}`}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-2xl" />
            
            {customMethods.find(cm => cm.id === method)?.hasVariablePricing ? (
              <div className="flex flex-col h-full">
                <label className="text-amber-400 text-sm font-bold flex items-center gap-2 mb-3"><Tag size={16}/> Preços na Plataforma</label>
                <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
                  {items.map(item => (
                    <div key={item.id} className="flex flex-col gap-2 bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-300 font-medium truncate">{item.name}</p>
                        <p className="text-xs text-zinc-500">{item.quantity} UN <span className="mx-1">•</span> Padrão: R$ {Number(item.priceSell).toFixed(2)}</p>
                      </div>
                      <div className="relative w-full shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">R$</span>
                        <input type="number"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-2 pl-9 pr-3 text-sm font-bold text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          value={variablePrices[item.id] ?? ''}
                          onChange={e => setVariablePrices({...variablePrices, [item.id]: parseFloat(e.target.value) || 0})}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 mt-auto">
                  <span className="text-amber-400 font-bold text-sm">Novo Total:</span>
                  <span className="text-2xl font-black text-amber-400">
                    R$ {items.reduce((acc, item) => acc + (variablePrices[item.id] || Number(item.priceSell)) * item.quantity, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <span className="text-zinc-400 font-medium">Total da Venda</span>
                      {discountValue > 0 && (
                        <p className="text-xs text-zinc-500 line-through">R$ {total.toFixed(2)}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {discountValue > 0 && (
                        <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded mr-2">-R$ {discountValue.toFixed(2)}</span>
                      )}
                      <span className="text-2xl font-black text-white">R$ {effectiveTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                    {payments.length === 0 && <p className="text-zinc-600 text-sm text-center py-4 border border-dashed border-zinc-800 rounded-lg">Nenhum pagamento lançado</p>}
                    {payments.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm group">
                        <span className="font-semibold text-zinc-300 flex items-center gap-2">
                          {p.method === 'dinheiro' ? <Banknote size={14} className="text-emerald-500" /> :
                           p.method === 'consumo_funcionario' ? <User size={14} className="text-amber-400" /> :
                           <CreditCard size={14} className="text-blue-500" />}
                          {p.label || METHOD_NAMES[p.method] || p.method}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">R$ {p.value.toFixed(2)}</span>
                          <button onClick={() => setPayments(payments.filter(x => x.id !== p.id))} className="text-zinc-500 hover:text-red-400 transition opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 pt-4 border-t border-zinc-800">
                  {change > 0 && (
                    <div className="flex justify-between items-center bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                      <span className="text-emerald-400 font-medium text-sm">Troco</span>
                      <span className="text-xl font-black text-emerald-400">R$ {change.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-end gap-3">
                    <span className="text-zinc-400 text-sm font-bold uppercase tracking-wider shrink-0">Falta Pagar</span>
                    <span className={`text-3xl sm:text-4xl font-black whitespace-nowrap tabular-nums text-right shrink-0 flex items-baseline justify-end gap-1.5 ${remaining > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                      <span className="text-lg sm:text-2xl font-bold opacity-80">R$</span>
                      <span>{remaining.toFixed(2)}</span>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 md:p-6 border-t border-zinc-800 bg-zinc-900/50 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 ${isPetshopTheme ? 'petcare-payment-footer' : ''}`}>
          <div className="flex-1 w-full flex flex-col gap-2">
            {isMobile && (
              <button 
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex items-center justify-between w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-semibold text-zinc-300"
              >
                <div className="flex items-center gap-2">
                  <Settings2 size={16} className="text-zinc-400" />
                  Opções avançadas
                </div>
                {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}

            {(!isMobile || advancedOpen) && (
              <div className="flex flex-col gap-2 p-3 md:p-0 bg-zinc-950 md:bg-transparent border md:border-none border-zinc-800 rounded-xl mt-1 md:mt-0 animate-in fade-in slide-in-from-top-2 duration-200">
                {isNfceEnabled && (
                  <label className={`flex items-center gap-2 font-medium transition ${isOnline ? 'cursor-pointer text-zinc-300 hover:text-white' : 'cursor-not-allowed text-zinc-600'}`}>
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500 accent-blue-600 disabled:opacity-50" 
                      checked={autoNfce} 
                      onChange={(e) => {
                          setAutoNfce(e.target.checked);
                          localStorage.setItem('7bar_auto_nfce', String(e.target.checked));
                      }} 
                      disabled={!isOnline}
                    />
                    Emitir NFC-e automaticamente
                  </label>
                )}
                <label className="flex items-center gap-2 font-medium cursor-pointer text-zinc-300 hover:text-white transition">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500 accent-emerald-600" 
                    checked={autoPrint} 
                    onChange={(e) => {
                        setAutoPrint(e.target.checked);
                        localStorage.setItem('7bar_auto_print', String(e.target.checked));
                    }} 
                  />
                  <Printer size={15} className="text-emerald-400" />
                  Imprimir Cupom automaticamente
                </label>
                {!isOnline && isNfceEnabled && <span className="text-xs text-orange-400 font-bold bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-lg w-fit">NFC-e Indisponível Offline</span>}
              </div>
            )}
          </div>
          
          <div className="w-full sm:w-auto">
            {isOnline ? (
              <button type="button" onClick={() => handleConfirm(isNfceEnabled && autoNfce ? 'nfce' : 'simple')} disabled={loading || !(customMethods.find(cm => cm.id === method)?.hasVariablePricing ? payments.length === 0 : remaining <= 0)}
                className={`w-full sm:w-64 rounded-xl font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.2)] disabled:shadow-none relative ${isMobile ? 'py-5' : 'py-4'} ${isPetshopTheme ? 'petcare-payment-submit' : ''}`}>
                {loading ? <Loader2 className="animate-spin" size={20} /> : <ShoppingBag size={20} />}
                Finalizar Venda
                {!isMobile && <span className="absolute top-1.5 right-2 text-[10px] font-mono bg-black/20 text-blue-200 px-1.5 py-0.5 rounded">Enter</span>}
              </button>
            ) : (
              <button type="button" onClick={handleSaveOffline} disabled={loading || !(customMethods.find(cm => cm.id === method)?.hasVariablePricing ? payments.length === 0 : remaining <= 0)}
                className={`w-full sm:w-64 rounded-xl font-bold text-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(234,88,12,0.2)] disabled:shadow-none relative ${isMobile ? 'py-5' : 'py-4'} ${isPetshopTheme ? 'petcare-payment-submit petcare-payment-submit--offline' : ''}`}>
                {loading ? <Loader2 className="animate-spin" size={20} /> : <ShoppingBag size={20} />}
                Salvar Offline
                {!isMobile && <span className="absolute top-1.5 right-2 text-[10px] font-mono bg-black/20 text-orange-200 px-1.5 py-0.5 rounded">Enter</span>}
              </button>
            )}
          </div>
        </div>
      </div>
      {comandasModalOpen && (
        <ComandaWorkspaceModal
          isPetshopTheme={isPetshopTheme}
          isFoodTheme={experience === 'food'}
          selectedId={selectedComandaId}
          onSelect={setSelectedComandaId}
          onClose={() => setComandasModalOpen(false)}
          onCharge={handleChargeComandaFromModal}
          onUpdated={updated => {
            if (activeComandaId === updated.id) {
              setPayments([]);
              setDiscountValue(0);
              setInputValue('');
            }
          }}
          launch={{ number: newComandaNumber, customer: newComandaCustomer,
            setNumber: setNewComandaNumber, setCustomer: setNewComandaCustomer,
            quantity: items.reduce((sum, item) => sum + item.quantity, 0), total,
            busy: launchingComanda, onConfirm: handleConfirmLaunchComanda }}
        />
      )}
      {DiscountModal}
    </div>
  );
}


