import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';
import { toast } from 'sonner';
import {
  FileSpreadsheet, Search, Plus, Trash2, Loader2, ArrowLeft,
  Package, CheckCircle2, XCircle, AlertTriangle, ReceiptText,
  Info, Printer, Download, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  shortCode?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  priceSell: number;
  priceCost: number;
  stock: number;
  unit: string;
  ncm?: string | null;
  origem?: number;
  grupoTributacao?: {
    id: string;
    nome: string;
    csosn?: string | null;
    cfop?: string | null;
    cstPis?: string | null;
    cstCofins?: string | null;
    aliqIcms?: number;
    aliqPis?: number;
    aliqCofins?: number;
  } | null;
  category?: {
    grupoTributacao?: Product['grupoTributacao'];
  } | null;
}

interface AdjustmentItem {
  uid: string; // UUID local para key
  product: Product;
  quantity: number;
  priceUnit: number;
  ncm: string;
  csosn: string;
  cfop: string;
}

type TransmissionPhase =
  | 'idle'
  | 'preparing'
  | 'signing'
  | 'transmitting'
  | 'polling'
  | 'done_success'
  | 'done_error';

// ─── Page Component ─────────────────────────────────────────────────────────
export default function AjusteFiscalPage() {
  const navigate = useNavigate();

  // ── Estado da busca de produtos ────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Lista de itens do ajuste ───────────────────────────────────────────────
  const [items, setItems] = useState<AdjustmentItem[]>([]);

  // ── Configurações do ajuste ────────────────────────────────────────────────
  const [movimentarEstoque, setMovimentarEstoque] = useState(false);
  const [customerCpf, setCustomerCpf] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [discountValue, setDiscountValue] = useState(0);

  // ── Estado da transmissão ──────────────────────────────────────────────────
  const [transmissionPhase, setTransmissionPhase] = useState<TransmissionPhase>('idle');
  const [saleResult, setSaleResult] = useState<any>(null);
  const [nfceError, setNfceError] = useState<string | null>(null);

  // ── Cálculos ───────────────────────────────────────────────────────────────
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.priceUnit, 0);
  const total = Math.max(0, subtotal - discountValue);

  // ── Fechar dropdown ao clicar fora ─────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Busca de produtos (debounced) ──────────────────────────────────────────
  useEffect(() => {
    if (searchTerm.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get('/products', { params: { search: searchTerm, limit: 15 } });
        const products = (res.data.data ?? res.data) as Product[];
        setSearchResults(products);
        setShowDropdown(true);
      } catch {
        toast.error('Erro ao buscar produtos.');
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ── Adicionar produto à lista ──────────────────────────────────────────────
  const addProduct = useCallback((product: Product) => {
    const existing = items.find(i => i.product.id === product.id);
    if (existing) {
      setItems(prev => prev.map(i =>
        i.uid === existing.uid ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      const gt = product.grupoTributacao || product.category?.grupoTributacao;
      const cleanNcm = (product.ncm || '').replace(/\D/g, '');
      const cleanCfop = (gt?.cfop || '').replace(/\D/g, '');
      setItems(prev => [...prev, {
        uid: crypto.randomUUID(),
        product,
        quantity: 1,
        priceUnit: Number(product.priceSell) || 0,
        ncm: cleanNcm,
        csosn: gt?.csosn || '102',
        cfop: cleanCfop.length === 4 ? cleanCfop : '5102',
      }]);
    }
    setSearchTerm('');
    setShowDropdown(false);
    searchInputRef.current?.focus();
  }, [items]);

  // ── Remover item ───────────────────────────────────────────────────────────
  const removeItem = useCallback((uid: string) => {
    setItems(prev => prev.filter(i => i.uid !== uid));
  }, []);

  // ── Atualizar campo de um item ─────────────────────────────────────────────
  const updateItem = useCallback((uid: string, field: keyof AdjustmentItem, value: any) => {
    setItems(prev => prev.map(i =>
      i.uid === uid ? { ...i, [field]: value } : i
    ));
  }, []);

  // ── Transmitir Ajuste ──────────────────────────────────────────────────────
  const handleTransmit = async () => {
    if (items.length === 0) { toast.error('Adicione pelo menos um produto.'); return; }
    if (total <= 0) { toast.error('O total da nota deve ser maior que zero.'); return; }

    // Validação fiscal pré-transmissão com mensagens amigáveis
    for (const item of items) {
      const cleanNcm = (item.ncm || '').replace(/\D/g, '');
      if (!cleanNcm) {
        toast.error(`⚠️ NCM não inserido: O produto "${item.product.name}" está sem NCM. Preencha o campo NCM na tabela antes de transmitir.`, { duration: 6000 });
        return;
      }
      if (cleanNcm.length !== 8) {
        toast.error(`⚠️ NCM inválido: O produto "${item.product.name}" possui NCM com ${cleanNcm.length} dígitos. O NCM deve conter exatamente 8 dígitos (ex: 22030000).`, { duration: 6000 });
        return;
      }
      const cleanCfop = (item.cfop || '').replace(/\D/g, '');
      if (cleanCfop.length !== 4) {
        toast.error(`⚠️ CFOP inválido: O produto "${item.product.name}" requer CFOP de 4 dígitos (ex: 5102).`, { duration: 5000 });
        return;
      }
      const cleanCsosn = (item.csosn || '').replace(/\D/g, '');
      if (cleanCsosn.length !== 3) {
        toast.error(`⚠️ CSOSN inválido: O produto "${item.product.name}" requer CSOSN de 3 dígitos (ex: 102).`, { duration: 5000 });
        return;
      }
    }

    setTransmissionPhase('preparing');
    setNfceError(null);
    setSaleResult(null);

    try {
      // Fase 1: Montando payload
      await new Promise(r => setTimeout(r, 400));
      setTransmissionPhase('signing');

      const body = {
        items: items.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          priceUnit: item.priceUnit,
          fiscalSnapshot: {
            productName: item.product.name,
            unit: item.product.unit || 'UN',
            ncm: item.ncm.replace(/\D/g, ''),
            cfop: item.cfop.replace(/\D/g, ''),
            csosn: item.csosn.replace(/\D/g, ''),
            origem: item.product.origem ?? 0,
            discount: 0,
            subtotal: +(item.quantity * item.priceUnit).toFixed(2),
          }
        })),
        payments: [{ method: 'dinheiro', value: total, troco: 0 }],
        discount: discountValue,
        emitirNfce: true,
        movimentarEstoque,
        source: 'ajuste_fiscal',
        customerCpf: customerCpf || undefined,
        customerName: customerName || undefined,
        idempotencyKey: `ajuste_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      };

      // Fase 2: Enviando checkout
      setTransmissionPhase('transmitting');
      const res = await api.post('/sales/checkout', body);
      const sale = res.data;
      setSaleResult(sale);

      // Fase 3: Polling de status NFC-e
      setTransmissionPhase('polling');
      let attempts = 0;
      const maxAttempts = 45; // até 90 segundos de polling
      await new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await api.get(`/sales/${sale.id}/nfce-status`);
            const status = statusRes.data.nfceStatus;
            setSaleResult((prev: any) => ({ ...prev, ...statusRes.data }));

            if (status === 'autorizada') {
              clearInterval(interval);
              setTransmissionPhase('done_success');
              toast.success('Nota fiscal autorizada com sucesso!');
              resolve();
            } else if (status === 'rejeitada' || status === 'nao_emitida') {
              clearInterval(interval);
              setTransmissionPhase('done_error');
              setNfceError(statusRes.data.nfceMotivoRejeicao || 'Nota não emitida.');
              toast.error('Nota rejeitada pela SEFAZ.');
              resolve();
            } else if (attempts >= maxAttempts) {
              clearInterval(interval);
              setTransmissionPhase('done_error');
              setNfceError('Timeout: A SEFAZ não respondeu a tempo. Verifique o status manualmente.');
              resolve();
            }
          } catch {
            if (attempts >= maxAttempts) {
              clearInterval(interval);
              setTransmissionPhase('done_error');
              setNfceError('Erro de comunicação durante o polling.');
              resolve();
            }
          }
        }, 2000);
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Erro ao transmitir ajuste fiscal.';
      setTransmissionPhase('done_error');
      setNfceError(msg);
      toast.error(msg);
    }
  };

  // ── Resetar para nova emissão ──────────────────────────────────────────────
  const handleReset = () => {
    setItems([]);
    setCustomerCpf('');
    setCustomerName('');
    setDiscountValue(0);
    setSaleResult(null);
    setNfceError(null);
    setTransmissionPhase('idle');
  };

  // ── Download XML ───────────────────────────────────────────────────────────
  const handleDownloadXml = () => {
    if (!saleResult?.nfceXml) { toast.error('XML não disponível.'); return; }
    const blob = new Blob([saleResult.nfceXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfce_ajuste_${saleResult.nfceNumero || 'sem_numero'}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Formatar CPF ───────────────────────────────────────────────────────────
  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const isTransmitting = ['preparing', 'signing', 'transmitting', 'polling'].includes(transmissionPhase);
  const isDone = transmissionPhase.startsWith('done_');

  // ── Mensagens de fase ──────────────────────────────────────────────────────
  const phaseMessages: Record<string, string> = {
    preparing: 'Preparando dados da nota...',
    signing: 'Assinando XML com certificado A1...',
    transmitting: 'Transmitindo à SEFAZ...',
    polling: 'Aguardando autorização da SEFAZ...',
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-[1400px] mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-zinc-500 hover:text-blue-400 flex items-center gap-2 text-sm font-semibold mb-2 transition-colors"
          >
            <ArrowLeft size={16} /> Voltar ao Dashboard
          </button>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <FileSpreadsheet className="text-amber-400" size={22} />
            </div>
            Ajuste Fiscal
          </h1>
          <p className="text-zinc-400 text-sm mt-1.5 max-w-xl">
            Emita notas fiscais de ajuste para faturar produtos vendidos sem nota durante o período.
            Ideal para declaração mensal de faturamento.
          </p>
        </div>

        {isDone && (
          <button
            onClick={handleReset}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all text-sm border border-zinc-700"
          >
            <Plus size={16} /> Novo Ajuste
          </button>
        )}
      </div>

      {/* ── Layout principal: Itens (esquerda) + Controle (direita) ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* COLUNA ESQUERDA — Seletor de Produtos e Tabela de Itens          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-2 space-y-4">
          {/* ── Barra de Busca ─────────────────────────────────────────────── */}
          {!isDone && (
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar produto por nome, código ou código de barras..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-sm"
                  disabled={isTransmitting}
                />
                {searchLoading && (
                  <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-400 animate-spin" />
                )}
              </div>

              {/* Dropdown de resultados */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-50 mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto custom-scrollbar">
                  {searchResults.map(product => {
                    const gt = product.grupoTributacao || product.category?.grupoTributacao;
                    return (
                      <button
                        key={product.id}
                        onClick={() => addProduct(product)}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors flex items-center justify-between gap-3 border-b border-zinc-800/50 last:border-b-0"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
                            {product.imageUrl ? (
                              <img src={getFullUrl(product.imageUrl)} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package size={18} className="text-zinc-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-semibold text-sm truncate">{product.name}</p>
                            <p className="text-zinc-500 text-xs mt-0.5">
                              {product.shortCode ? `#${product.shortCode}` : ''}{' '}
                              {product.barcode ? `· ${product.barcode}` : ''}{' '}
                              {gt?.nome ? `· ${gt.nome}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-amber-400 font-bold text-sm">
                            R$ {Number(product.priceSell).toFixed(2)}
                          </p>
                          <p className="text-zinc-500 text-xs">{Number(product.stock).toFixed(0)} un</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tabela de Itens ─────────────────────────────────────────────── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
                  <Package size={28} className="text-zinc-600" />
                </div>
                <p className="text-zinc-500 font-semibold text-sm">Nenhum produto adicionado</p>
                <p className="text-zinc-600 text-xs mt-1">Use a busca acima para adicionar itens ao ajuste.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[700px]">
                  <thead className="bg-zinc-950 text-zinc-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Produto</th>
                      <th className="px-3 py-3 font-semibold text-center w-20">Qtd</th>
                      <th className="px-3 py-3 font-semibold text-center w-28">Valor Unit.</th>
                      <th className="px-3 py-3 font-semibold text-center w-24">NCM</th>
                      <th className="px-3 py-3 font-semibold text-center w-20">CSOSN</th>
                      <th className="px-3 py-3 font-semibold text-center w-20">CFOP</th>
                      <th className="px-3 py-3 font-semibold text-right w-28">Subtotal</th>
                      <th className="px-3 py-3 font-semibold text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {items.map(item => (
                      <tr key={item.uid} className="hover:bg-zinc-800/30 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
                              {item.product.imageUrl ? (
                                <img src={getFullUrl(item.product.imageUrl)} alt={item.product.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package size={16} className="text-zinc-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white font-semibold text-sm truncate max-w-[200px]">{item.product.name}</p>
                              <p className="text-zinc-500 text-xs">{item.product.shortCode ? `#${item.product.shortCode}` : item.product.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number" min="1" step="1"
                            value={item.quantity}
                            onChange={e => updateItem(item.uid, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-center text-sm focus:outline-none focus:border-amber-500 transition-colors"
                            disabled={isTransmitting || isDone}
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number" min="0.01" step="0.01"
                            value={item.priceUnit}
                            onChange={e => updateItem(item.uid, 'priceUnit', Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-center text-sm focus:outline-none focus:border-amber-500 transition-colors"
                            disabled={isTransmitting || isDone}
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          {(() => {
                            const isNcmInvalid = (item.ncm || '').replace(/\D/g, '').length !== 8;
                            return (
                              <div>
                                <input
                                  type="text" maxLength={10}
                                  value={item.ncm}
                                  placeholder="00000000"
                                  onChange={e => updateItem(item.uid, 'ncm', e.target.value)}
                                  className={`w-20 rounded-lg px-2 py-1.5 text-center text-xs font-mono focus:outline-none transition-colors ${
                                    isNcmInvalid
                                      ? 'bg-red-950/50 border border-red-500/80 text-red-200 placeholder:text-red-500/50 focus:border-red-400'
                                      : 'bg-zinc-950 border border-zinc-700 text-white focus:border-amber-500'
                                  }`}
                                  disabled={isTransmitting || isDone}
                                />
                                {isNcmInvalid && (
                                  <span className="text-[10px] text-red-400 font-bold block mt-0.5 animate-pulse">
                                    Sem NCM
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="text" maxLength={4}
                            value={item.csosn}
                            onChange={e => updateItem(item.uid, 'csosn', e.target.value)}
                            className="w-16 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-center text-xs font-mono focus:outline-none focus:border-amber-500 transition-colors"
                            disabled={isTransmitting || isDone}
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="text" maxLength={4}
                            value={item.cfop}
                            onChange={e => updateItem(item.uid, 'cfop', e.target.value)}
                            className="w-16 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-center text-xs font-mono focus:outline-none focus:border-amber-500 transition-colors"
                            disabled={isTransmitting || isDone}
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-amber-300 font-bold text-sm">
                            R$ {(item.quantity * item.priceUnit).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {!isTransmitting && !isDone && (
                            <button
                              onClick={() => removeItem(item.uid)}
                              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              title="Remover"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* COLUNA DIREITA — Painel de Controle                              */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          {/* ── Toggle Movimentar Estoque ───────────────────────────────────── */}
          {!isDone && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Package size={14} /> Opções de Estoque
              </h3>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm">Movimentar Estoque</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {movimentarEstoque
                      ? 'Quantidades serão reduzidas do estoque.'
                      : 'Estoque físico não será alterado.'}
                  </p>
                </div>
                <button
                  onClick={() => setMovimentarEstoque(!movimentarEstoque)}
                  disabled={isTransmitting}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                    movimentarEstoque
                      ? 'bg-amber-500 shadow-lg shadow-amber-500/30'
                      : 'bg-zinc-700'
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                    movimentarEstoque ? 'left-[26px]' : 'left-0.5'
                  }`} />
                </button>
              </div>
              {!movimentarEstoque && (
                <div className="mt-3 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 flex gap-2.5">
                  <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-200/70 text-xs leading-relaxed">
                    A nota será emitida apenas para fins de faturamento fiscal. 
                    As quantidades de estoque não serão alteradas.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Consumidor ──────────────────────────────────────────────────── */}
          {!isDone && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ReceiptText size={14} /> Consumidor (Opcional)
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-1.5 block">CPF</label>
                  <input
                    type="text"
                    value={customerCpf}
                    onChange={e => setCustomerCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/50 transition-colors"
                    disabled={isTransmitting}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-1.5 block">Nome</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Nome do consumidor"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/50 transition-colors"
                    disabled={isTransmitting}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Resumo Financeiro ───────────────────────────────────────────── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">
              Resumo
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Itens</span>
                <span className="text-zinc-300 font-semibold">{items.length} produto(s)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Subtotal</span>
                <span className="text-white font-semibold">R$ {subtotal.toFixed(2)}</span>
              </div>
              {!isDone && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-400">Desconto</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={discountValue || ''}
                    onChange={e => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0.00"
                    className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-red-400 text-right text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    disabled={isTransmitting}
                  />
                </div>
              )}
              <div className="border-t border-zinc-800 pt-3 mt-3 flex justify-between text-lg">
                <span className="text-white font-bold">Total</span>
                <span className="text-amber-400 font-black text-xl">R$ {total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ── Botão de Transmissão ────────────────────────────────────────── */}
          {!isDone && (
            <button
              onClick={handleTransmit}
              disabled={isTransmitting || items.length === 0}
              className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all shadow-lg active:scale-[0.98] ${
                isTransmitting
                  ? 'bg-amber-500/20 text-amber-300 cursor-wait border border-amber-500/20'
                  : items.length === 0
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-amber-500/30 border border-amber-400/30'
              }`}
            >
              {isTransmitting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {phaseMessages[transmissionPhase] || 'Processando...'}
                </>
              ) : (
                <>
                  <FileSpreadsheet size={20} />
                  Emitir Ajuste Fiscal
                </>
              )}
            </button>
          )}

          {/* ── Resultado: Sucesso ──────────────────────────────────────────── */}
          {transmissionPhase === 'done_success' && saleResult && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 size={22} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-emerald-400 font-bold">Nota Autorizada!</p>
                  <p className="text-zinc-500 text-xs">NFC-e nº {saleResult.nfceNumero || '—'}</p>
                </div>
              </div>

              {saleResult.nfceChave && (
                <div className="bg-zinc-950/50 rounded-xl p-3 mb-3">
                  <p className="text-zinc-500 text-xs mb-1">Chave de Acesso</p>
                  <p className="text-zinc-300 text-xs font-mono break-all select-all">{saleResult.nfceChave}</p>
                </div>
              )}

              {saleResult.nfceProtocolo && (
                <div className="bg-zinc-950/50 rounded-xl p-3 mb-4">
                  <p className="text-zinc-500 text-xs mb-1">Protocolo</p>
                  <p className="text-zinc-300 text-xs font-mono">{saleResult.nfceProtocolo}</p>
                </div>
              )}

              <div className="flex gap-2">
                {saleResult.nfceXml && (
                  <button
                    onClick={handleDownloadXml}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download size={15} /> Baixar XML
                  </button>
                )}
                {saleResult.nfceUrl && (
                  <a
                    href={saleResult.nfceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <Printer size={15} /> DANFE
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Resultado: Erro ─────────────────────────────────────────────── */}
          {transmissionPhase === 'done_error' && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <XCircle size={22} className="text-red-400" />
                </div>
                <div>
                  <p className="text-red-400 font-bold">Erro na Emissão</p>
                  <p className="text-zinc-500 text-xs">A nota não foi autorizada.</p>
                </div>
              </div>
              <div className="bg-zinc-950/50 rounded-xl p-3">
                <p className="text-red-300/80 text-xs leading-relaxed">{nfceError}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
