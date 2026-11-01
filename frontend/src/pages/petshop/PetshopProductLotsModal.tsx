import { useState, useEffect, FormEvent } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  CalendarClock, AlertTriangle, Check, X, Plus,
  Split, Loader2, Package, Truck, Layers, Box
} from 'lucide-react';
import { Modal, primaryButton, secondaryButton, inputClass, labelClass } from './ui';
import { money } from './types';

interface Lot {
  id: string;
  lotNumber?: string | null;
  quantity: number;
  remaining: number;
  costPrice: number;
  expiresAt?: string | null;
  isExpired?: boolean;
  daysUntilExpiry?: number | null;
  createdAt: string;
  supplier?: {
    id: string;
    name: string;
  } | null;
}

interface ProductInfo {
  id: string;
  name: string;
  unit: string;
  stock: number | string;
  category?: { id: string; name: string } | null;
  barcode?: string | null;
  priceCost: number | string;
}

interface PetshopProductLotsModalProps {
  product: ProductInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function PetshopProductLotsModal({
  product,
  isOpen,
  onClose,
  onUpdate,
}: PetshopProductLotsModalProps) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Expiration Date inline
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');

  // Register New Lot
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerQty, setRegisterQty] = useState('');
  const [registerCost, setRegisterCost] = useState('');
  const [registerLotNumber, setRegisterLotNumber] = useState('');
  const [registerExpiry, setRegisterExpiry] = useState('');
  const [registering, setRegistering] = useState(false);

  // Split Lot
  const [splittingLot, setSplittingLot] = useState<Lot | null>(null);
  const [splitQty, setSplitQty] = useState('');
  const [splitExpiry, setSplitExpiry] = useState('');
  const [splitLotNumber, setSplitLotNumber] = useState('');
  const [splitting, setSplitting] = useState(false);

  const fetchLots = async () => {
    if (!product) return;
    setLoading(true);
    try {
      const res = await api.get(`/products/${product.id}/lots`);
      setLots(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('Erro ao buscar lotes do produto.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && product) {
      void fetchLots();
      setIsRegisterOpen(false);
      setSplittingLot(null);
      setEditingLotId(null);
      setRegisterCost(product.priceCost ? String(product.priceCost) : '');

      // Gera um número de lote sugerido automaticamente
      const autoLot = `L${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
      setRegisterLotNumber(autoLot);
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const currentStock = Number(product.stock || 0);
  const totalLotsRemaining = lots.reduce((acc, lot) => acc + Number(lot.remaining || 0), 0);
  const unassignedStock = Math.max(0, currentStock - totalLotsRemaining);

  const handleUpdateExpiry = async (lotId: string) => {
    try {
      await api.patch(`/products/lots/${lotId}`, {
        expiresAt: editDate ? new Date(editDate) : null,
      });
      toast.success('Data de validade atualizada!');
      setEditingLotId(null);
      void fetchLots();
      onUpdate?.();
    } catch {
      toast.error('Erro ao atualizar validade do lote.');
    }
  };

  const handleRegisterLot = async (e: FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(registerQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Informe uma quantidade válida.');
      return;
    }

    const costNum = parseFloat(registerCost) || Number(product.priceCost || 0);

    setRegistering(true);
    try {
      await api.post(`/products/lots/register-existing/${product.id}`, {
        quantity: qty,
        lotNumber: registerLotNumber.trim() || undefined,
        expiresAt: registerExpiry || undefined,
        costPrice: costNum,
      });

      toast.success('Lote registrado com sucesso!');
      setIsRegisterOpen(false);
      setRegisterQty('');
      setRegisterExpiry('');
      setRegisterCost('');
      void fetchLots();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao registrar lote.');
    } finally {
      setRegistering(false);
    }
  };

  const handleSplitLot = async (e: FormEvent) => {
    e.preventDefault();
    if (!splittingLot) return;

    const qty = parseFloat(splitQty);
    if (isNaN(qty) || qty <= 0 || qty >= Number(splittingLot.remaining)) {
      toast.error('A quantidade a separar deve ser menor que o saldo do lote.');
      return;
    }

    setSplitting(true);
    try {
      await api.post(`/products/lots/${splittingLot.id}/split`, {
        splitQty: qty,
        newExpiresAt: splitExpiry ? new Date(splitExpiry) : undefined,
        newLotNumber: splitLotNumber.trim() || undefined,
      });

      toast.success('Lote dividido com sucesso!');
      setSplittingLot(null);
      setSplitQty('');
      setSplitExpiry('');
      void fetchLots();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao dividir lote.');
    } finally {
      setSplitting(false);
    }
  };

  return (
    <Modal title="Lotes & Validades do Produto" onClose={onClose}>
      <div className="space-y-5">
        {/* Cabeçalho do Produto */}
        <div className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-[var(--pc-action)] uppercase tracking-wider">
                {product.category?.name || 'Sem categoria'}
              </span>
              <h3 className="truncate text-base font-bold text-[var(--pc-text)]">{product.name}</h3>
              {product.barcode && (
                <p className="text-xs text-[var(--pc-text-muted)] font-mono">Cód. Barras: {product.barcode}</p>
              )}
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-[11px] text-[var(--pc-text-muted)]">Estoque Total</p>
                <strong className="text-base font-black tabular-nums text-[var(--pc-text)]">
                  {currentStock.toLocaleString('pt-BR')} {product.unit}
                </strong>
              </div>
              <div className="border-l border-[var(--pc-border)] pl-4">
                <p className="text-[11px] text-[var(--pc-text-muted)]">Em Lotes</p>
                <strong className="text-base font-black tabular-nums text-[var(--pc-action)]">
                  {totalLotsRemaining.toLocaleString('pt-BR')} {product.unit}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Alerta de estoque sem lote vinculado */}
        {unassignedStock > 0 && !isRegisterOpen && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-amber-700 shrink-0" />
              <span>
                Há <strong>{unassignedStock} {product.unit}</strong> de estoque físico sem lote/validade atribuído.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setRegisterQty(String(unassignedStock));
                setIsRegisterOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 whitespace-nowrap self-start sm:self-auto"
            >
              <Plus size={14} />
              <span>Atribuir Lote ao Estoque</span>
            </button>
          </div>
        )}

        {/* Formulário: Registrar Lote no Estoque Não Vinculado */}
        {isRegisterOpen && (
          <form onSubmit={handleRegisterLot} className="rounded-xl border border-[var(--pc-action)]/30 bg-[var(--pc-action-soft)]/50 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--pc-border)] pb-2">
              <h4 className="text-xs font-bold text-[var(--pc-text)] uppercase tracking-wider flex items-center gap-1.5">
                <Plus size={14} className="text-[var(--pc-action)]" />
                <span>Registrar Lote no Estoque</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="text-[var(--pc-text-muted)] hover:text-[var(--pc-text)]"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className={labelClass}>Quantidade ({product.unit}) *</label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0.001"
                  max={unassignedStock > 0 ? unassignedStock : undefined}
                  value={registerQty}
                  onChange={e => setRegisterQty(e.target.value)}
                  placeholder={`Ex: ${unassignedStock || 1}`}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Preço de Custo (R$) *</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={registerCost}
                  onChange={e => setRegisterCost(e.target.value)}
                  placeholder="0,00"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Número do Lote *</label>
                <input
                  required
                  type="text"
                  value={registerLotNumber}
                  onChange={e => setRegisterLotNumber(e.target.value)}
                  placeholder="Ex: LT-2610-A1"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Data de Validade</label>
                <input
                  type="date"
                  value={registerExpiry}
                  onChange={e => setRegisterExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={registering}
                className={`${primaryButton} flex items-center gap-2`}
              >
                {registering && <Loader2 size={14} className="animate-spin" />}
                <span>Salvar Lote</span>
              </button>
            </div>
          </form>
        )}

        {/* Formulário: Dividir Lote */}
        {splittingLot && (
          <form onSubmit={handleSplitLot} className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-blue-200 pb-2">
              <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <Split size={14} />
                <span>Dividir Lote ({splittingLot.lotNumber || 'Sem número'})</span>
              </h4>
              <button
                type="button"
                onClick={() => setSplittingLot(null)}
                className="text-blue-700 hover:text-blue-900"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Quantidade a Separar *</label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0.001"
                  max={Number(splittingLot.remaining) - 0.001}
                  value={splitQty}
                  onChange={e => setSplitQty(e.target.value)}
                  placeholder={`Max: ${Number(splittingLot.remaining) - 1}`}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Novo Nº do Lote (opcional)</label>
                <input
                  type="text"
                  value={splitLotNumber}
                  onChange={e => setSplitLotNumber(e.target.value)}
                  placeholder="Ex: LT-DIV-01"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Nova Data de Validade</label>
                <input
                  type="date"
                  value={splitExpiry}
                  onChange={e => setSplitExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSplittingLot(null)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={splitting}
                className={`${primaryButton} flex items-center gap-2`}
              >
                {splitting && <Loader2 size={14} className="animate-spin" />}
                <span>Confirmar Divisão</span>
              </button>
            </div>
          </form>
        )}

        {/* Lista de Lotes Cadastrados */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-[var(--pc-text-secondary)] uppercase tracking-wider">
            Lotes Registrados ({lots.length})
          </h4>

          {loading ? (
            <div className="flex h-36 items-center justify-center gap-2 text-xs text-[var(--pc-text-secondary)]">
              <Loader2 size={18} className="animate-spin text-[var(--pc-action)]" />
              <span>Carregando histórico de lotes…</span>
            </div>
          ) : lots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--pc-border-strong)] p-8 text-center text-xs text-[var(--pc-text-muted)]">
              <Package size={32} className="mx-auto mb-2 text-[var(--pc-border-strong)]" />
              <p className="font-semibold text-[var(--pc-text)]">Nenhum lote registrado para este produto</p>
              <p className="mt-1">
                Você pode dar entrada de novos lotes na aba "Entrada / Lotes" ou atribuir o estoque existente a um lote acima.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--pc-border)] overflow-hidden rounded-xl border border-[var(--pc-border)] bg-white text-xs">
              {lots.map(lot => {
                const remaining = Number(lot.remaining || 0);
                const quantity = Number(lot.quantity || 0);
                const isExhausted = remaining <= 0;

                return (
                  <div
                    key={lot.id}
                    className={`p-3.5 sm:p-4 transition-colors ${
                      isExhausted ? 'bg-[var(--pc-surface-subtle)]/60 opacity-60' : 'hover:bg-[var(--pc-surface-subtle)]'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold bg-[var(--pc-surface-subtle)] border border-[var(--pc-border)] px-2 py-0.5 rounded text-[var(--pc-text)]">
                            Lote: {lot.lotNumber || lot.id.slice(0, 8).toUpperCase()}
                          </span>

                          <span className="font-semibold text-xs text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded">
                            Custo: {money(lot.costPrice || 0)}
                          </span>

                          {lot.supplier && (
                            <span className="flex items-center gap-1 rounded bg-[var(--pc-surface-subtle)] border border-[var(--pc-border)] px-2 py-0.5 text-[11px] text-[var(--pc-text-secondary)]">
                              <Truck size={12} />
                              <span>{lot.supplier.name}</span>
                            </span>
                          )}

                          <span className="text-[11px] text-[var(--pc-text-muted)]">
                            {new Date(lot.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>

                        {/* Validade */}
                        <div className="flex items-center gap-2">
                          {editingLotId === lot.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="date"
                                value={editDate}
                                onChange={e => setEditDate(e.target.value)}
                                className="rounded border border-[var(--pc-border-strong)] bg-white px-2 py-1 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => void handleUpdateExpiry(lot.id)}
                                className="grid h-7 w-7 place-items-center rounded bg-[var(--pc-action)] text-white hover:bg-[var(--pc-action-hover)]"
                                title="Salvar validade"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingLotId(null)}
                                className="grid h-7 w-7 place-items-center rounded border border-[var(--pc-border)] text-[var(--pc-text-muted)] hover:bg-[var(--pc-surface-subtle)]"
                                title="Cancelar"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : lot.expiresAt ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLotId(lot.id);
                                setEditDate(new Date(lot.expiresAt!).toISOString().slice(0, 10));
                              }}
                              className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                                lot.isExpired
                                  ? 'bg-[var(--pc-danger-soft)] text-[var(--pc-danger)] hover:brightness-95'
                                  : typeof lot.daysUntilExpiry === 'number' && lot.daysUntilExpiry <= 30
                                  ? 'bg-[var(--pc-warning-soft)] text-[var(--pc-warning)] hover:brightness-95'
                                  : 'bg-[var(--pc-success-soft)] text-[var(--pc-success)] hover:brightness-95'
                              }`}
                              title="Clique para editar a data de validade"
                            >
                              <CalendarClock size={12} />
                              <span>
                                {lot.isExpired
                                  ? 'VENCIDO'
                                  : typeof lot.daysUntilExpiry === 'number' && lot.daysUntilExpiry <= 30
                                  ? `Vence em ${lot.daysUntilExpiry}d`
                                  : `Validade: ${new Date(lot.expiresAt).toLocaleDateString('pt-BR')}`}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLotId(lot.id);
                                setEditDate('');
                              }}
                              className="cursor-pointer inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--pc-border-strong)] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[var(--pc-text-muted)] hover:border-[var(--pc-action)] hover:text-[var(--pc-action)] transition"
                              title="Clique para inserir uma data de validade"
                            >
                              <CalendarClock size={12} />
                              <span>Inserir Validade</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quantidades e Ações */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-[11px] text-[var(--pc-text-muted)]">Saldo / Original</p>
                          <strong className="text-sm font-bold tabular-nums text-[var(--pc-text)]">
                            <span className={remaining <= 0 ? 'text-[var(--pc-text-muted)]' : 'text-[var(--pc-action)]'}>
                              {remaining}
                            </span>
                            {' '}/ {quantity} {product.unit}
                          </strong>
                          {remaining > 0 && Number(lot.costPrice || 0) > 0 && (
                            <p className="text-[10px] text-slate-500 tabular-nums font-medium">
                              Subtotal: {money(remaining * Number(lot.costPrice))}
                            </p>
                          )}
                        </div>

                        <span
                          className={`pc-status ${
                            isExhausted ? 'pc-status--neutral' : 'pc-status--success'
                          }`}
                        >
                          {isExhausted ? 'Esgotado' : 'Ativo'}
                        </span>

                        {!isExhausted && remaining > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSplittingLot(lot);
                              setSplitQty('');
                              setSplitExpiry(lot.expiresAt ? new Date(lot.expiresAt).toISOString().slice(0, 10) : '');
                              setSplitLotNumber(`${lot.lotNumber || 'LT'}-B`);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--pc-border)] text-[var(--pc-text-secondary)] transition hover:bg-[var(--pc-surface-subtle)] hover:text-[var(--pc-action)]"
                            title="Dividir este lote em duas partes com validades ou números diferentes"
                          >
                            <Split size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
