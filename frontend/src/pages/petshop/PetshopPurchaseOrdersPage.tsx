import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  ShoppingCart, Plus, Check, Clock, X, Phone, Trash2,
  Copy, Package, Box, ChevronDown, ChevronUp, Loader2, ArrowRight
} from 'lucide-react';
import { CatalogTabs, PageHeader, pageClass, primaryButton, secondaryButton, inputClass, labelClass, Modal } from './ui';
import ManagePackagingsModal, { PackagingItem } from '@/components/ManagePackagingsModal';
import { money } from './types';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  expectedCost: number;
  realCost?: number;
  unitMultiplier?: number;
  unitName?: string;
  product: {
    id: string;
    name: string;
    unit: string;
    priceCost: number;
    stock: number;
    minStock?: number | null;
    imageUrl?: string | null;
  };
}

interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: 'DRAFT' | 'SENT' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  supplier: {
    id: string;
    name: string;
    whatsapp?: string | null;
  };
  items: OrderItem[];
}

export default function PetshopPurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // New Order State
  const [showNewModal, setShowNewModal] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [packagings, setPackagings] = useState<PackagingItem[]>([]);
  const [showPackagingsModal, setShowPackagingsModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Receive Order State
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receiving, setReceiving] = useState(false);

  // Expanded Order
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  useEffect(() => {
    void fetchOrders();
    void fetchSuppliers();
    void fetchPackagings();
  }, []);

  const fetchPackagings = async () => {
    try {
      const { data } = await api.get('/purchase-orders/packagings/all');
      setPackagings(data || []);
    } catch {
      // ignore
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/purchase-orders');
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao buscar pedidos de compra.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data } = await api.get('/suppliers');
      setSuppliers(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao buscar fornecedores.');
    }
  };

  const handleSupplierSelect = (supId: string) => {
    const sup = suppliers.find(s => s.id === supId);
    setSelectedSupplier(sup || null);

    if (sup && sup.products) {
      setOrderItems(
        sup.products.map((sp: any) => {
          const base = Number(sp.expectedCost || sp.product?.priceCost || 0);
          const currentStock = Number(sp.product?.stock || 0);
          const minStock = Number(sp.product?.minStock ?? 5);
          // Sugestão automática se estoque estiver baixo
          const suggestedQty = currentStock < minStock ? Math.max(1, minStock - currentStock) : 0;

          return {
            productId: sp.productId,
            product: sp.product,
            quantity: suggestedQty,
            baseUnitCost: base,
            expectedCost: base,
            unitMultiplier: 1,
            unitName: 'UN',
            suggested: suggestedQty > 0,
          };
        })
      );
    } else {
      setOrderItems([]);
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedSupplier) {
      toast.error('Selecione um fornecedor.');
      return;
    }
    const activeItems = orderItems.filter(i => Number(i.quantity) > 0);
    if (activeItems.length === 0) {
      toast.error('Informe a quantidade de pelo menos um produto.');
      return;
    }

    setCreating(true);
    try {
      await api.post('/purchase-orders', {
        supplierId: selectedSupplier.id,
        items: activeItems.map(i => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          expectedCost: Number(i.expectedCost),
          unitMultiplier: Number(i.unitMultiplier || 1),
          unitName: i.unitName || 'UN',
        })),
      });
      toast.success('Pedido de compra criado com sucesso!');
      setShowNewModal(false);
      setSelectedSupplier(null);
      setOrderItems([]);
      void fetchOrders();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao criar pedido.');
    } finally {
      setCreating(false);
    }
  };

  const handleSendWhatsapp = async (order: PurchaseOrder) => {
    let text = `Olá ${order.supplier?.name || ''}! Gostaria de fazer um pedido de reposição:\n\n`;

    order.items.forEach(item => {
      text += `• ${item.product.name}: ${Number(item.quantity)} ${item.unitName || item.product.unit || 'UN'}\n`;
    });

    text += `\nPoderia me confirmar a disponibilidade e o valor final? Obrigado!`;

    const encodedText = encodeURIComponent(text);
    const phone = order.supplier?.whatsapp ? order.supplier.whatsapp.replace(/\D/g, '') : '';
    const url = `https://wa.me/55${phone}?text=${encodedText}`;
    window.open(url, '_blank');

    if (order.status === 'DRAFT') {
      try {
        await api.patch(`/purchase-orders/${order.id}/status`, { status: 'SENT' });
        void fetchOrders();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleReceiveOrder = async () => {
    if (!receivingOrder) return;
    setReceiving(true);
    try {
      const itemsPayload = receivingOrder.items.map(i => ({
        id: i.id,
        realCost: i.realCost || i.expectedCost,
      }));

      await api.post(`/purchase-orders/${receivingOrder.id}/receive`, { items: itemsPayload });
      toast.success('Estoque atualizado e pedido recebido com sucesso!');
      setShowReceiveModal(false);
      setReceivingOrder(null);
      void fetchOrders();
    } catch {
      toast.error('Erro ao confirmar recebimento do pedido.');
    } finally {
      setReceiving(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Deseja realmente excluir este pedido?')) return;
    try {
      await api.delete(`/purchase-orders/${orderId}`);
      toast.success('Pedido excluído.');
      void fetchOrders();
    } catch {
      toast.error('Erro ao excluir pedido.');
    }
  };

  const isOrderReceived = (status: string) => status === 'RECEIVED' || status === 'COMPLETED';

  const filteredOrders = orders.filter(o => {
    if (filterStatus === 'ALL') return true;
    if (filterStatus === 'RECEIVED') return isOrderReceived(o.status);
    return o.status === filterStatus;
  });

  const counts = useMemo(() => {
    const draft = orders.filter(o => o.status === 'DRAFT').length;
    const sent = orders.filter(o => o.status === 'SENT').length;
    const received = orders.filter(o => isOrderReceived(o.status)).length;
    return { all: orders.length, draft, sent, received };
  }, [orders]);

  return (
    <div className={pageClass}>
      <PageHeader
        eyebrow="Reposição Inteligente"
        title="Pedidos de Compra"
        description="Gere pedidos automáticos com base no estoque de segurança/mínimo, envie por WhatsApp e dê entrada no estoque com 1 clique."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPackagingsModal(true)}
              className={`${secondaryButton} flex items-center gap-2`}
            >
              <Box size={16} />
              <span>Embalagens</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSupplier(null);
                setOrderItems([]);
                setShowNewModal(true);
              }}
              className={`${primaryButton} flex items-center gap-2`}
            >
              <Plus size={16} />
              <span>Novo Pedido</span>
            </button>
          </div>
        }
      />

      <CatalogTabs />

      {/* Filtros de Status */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { key: 'ALL', label: `Todos os Pedidos (${counts.all})` },
          { key: 'DRAFT', label: `Rascunhos (${counts.draft})` },
          { key: 'SENT', label: `Enviados (${counts.sent})` },
          { key: 'RECEIVED', label: `Recebidos / Concluídos (${counts.received})` },
        ].map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilterStatus(item.key)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              filterStatus === item.key
                ? 'bg-[var(--pc-text)] text-white shadow-xs'
                : 'border border-[var(--pc-border)] bg-white text-[var(--pc-text-secondary)] hover:bg-[var(--pc-surface-subtle)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Lista de Pedidos */}
      <section className="space-y-4" aria-label="Lista de pedidos">
        {loading ? (
          <div className="pc-panel flex h-60 items-center justify-center gap-2 text-sm text-[var(--pc-text-secondary)]">
            <Loader2 size={20} className="animate-spin text-[var(--pc-action)]" />
            <span>Carregando pedidos de compra…</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="pc-panel flex min-h-60 flex-col items-center justify-center p-8 text-center">
            <ShoppingCart size={40} className="mb-3 text-[var(--pc-border-strong)]" />
            <h3 className="text-base font-semibold text-[var(--pc-text)]">Nenhum pedido encontrado</h3>
            <p className="mt-1 max-w-sm text-xs text-[var(--pc-text-muted)]">
              Crie um novo pedido selecionando um fornecedor para repor produtos com estoque baixo automaticamente.
            </p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const isExpanded = expandedOrderId === order.id;
            const total = order.items.reduce(
              (acc, i) => acc + Number(i.quantity) * Number(i.realCost || i.expectedCost || 0),
              0
            );

            return (
              <article key={order.id} className="pc-panel overflow-hidden transition-all hover:border-[var(--pc-border-strong)]">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--pc-text)]">
                        {order.supplier?.name || 'Fornecedor'}
                      </h3>
                      <span
                        className={`pc-status ${
                          isOrderReceived(order.status)
                            ? 'pc-status--success'
                            : order.status === 'SENT'
                            ? 'pc-status--info'
                            : 'pc-status--neutral'
                        }`}
                      >
                        {isOrderReceived(order.status)
                          ? 'Recebido / Concluído'
                          : order.status === 'SENT'
                          ? 'Enviado'
                          : 'Rascunho'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--pc-text-muted)]">
                      Criado em {new Date(order.createdAt).toLocaleDateString('pt-BR')} às{' '}
                      {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      <strong>{order.items.length} produto(s)</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right">
                      <p className="text-[11px] text-[var(--pc-text-muted)]">Total Estimado</p>
                      <strong className="text-base font-bold tabular-nums text-[var(--pc-text)]">
                        {money(total)}
                      </strong>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleSendWhatsapp(order)}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        title="Enviar detalhes do pedido por WhatsApp"
                      >
                        <Phone size={13} />
                        <span>WhatsApp</span>
                      </button>

                      {!isOrderReceived(order.status) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReceivingOrder(order);
                            setShowReceiveModal(true);
                          }}
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--pc-action)] px-3 text-xs font-semibold text-white transition hover:bg-[var(--pc-action-hover)] shadow-xs"
                        >
                          <Check size={14} />
                          <span>Receber Estoque</span>
                        </button>
                      ) : (
                        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
                          <Check size={13} />
                          <span>Estoque Recebido</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pc-border)] text-[var(--pc-text-secondary)] transition hover:bg-[var(--pc-surface-subtle)]"
                        title={isExpanded ? 'Recolher itens' : 'Ver itens do pedido'}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {!isOrderReceived(order.status) && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteOrder(order.id)}
                          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pc-border)] text-[var(--pc-text-muted)] transition hover:bg-[var(--pc-danger-soft)] hover:text-[var(--pc-danger)]"
                          title="Excluir pedido"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Itens do Pedido Expandido */}
                {isExpanded && (
                  <div className="border-t border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-4 sm:p-5">
                    <h4 className="mb-2 text-xs font-bold text-[var(--pc-text-secondary)] uppercase tracking-wider">
                      Itens do Pedido
                    </h4>
                    <div className="divide-y divide-[var(--pc-border)] overflow-hidden rounded-xl border border-[var(--pc-border)] bg-white text-xs">
                      {order.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[var(--pc-text)]">{item.product.name}</p>
                            <p className="text-[11px] text-[var(--pc-text-muted)]">
                              Quantidade: <strong>{item.quantity} {item.unitName || item.product.unit || 'UN'}</strong>
                              {item.unitMultiplier && item.unitMultiplier > 1 && (
                                <span> (total: {Number(item.quantity) * item.unitMultiplier} {item.product.unit})</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-[var(--pc-text-muted)]">Custo Unit.</p>
                            <strong className="text-xs font-bold tabular-nums text-[var(--pc-text)]">
                              {money(item.expectedCost)}
                            </strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* Modal: Novo Pedido de Compra */}
      {showNewModal && (
        <Modal title="Novo Pedido de Compra" onClose={() => setShowNewModal(false)}>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Selecione o Fornecedor *</label>
              <select
                value={selectedSupplier?.id || ''}
                onChange={e => handleSupplierSelect(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecione um fornecedor cadastrado…</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {selectedSupplier && (
              <>
                <div className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-3 text-xs text-[var(--pc-text-secondary)]">
                  Produtos vinculados a <strong>{selectedSupplier.name}</strong>. Produtos com estoque abaixo do mínimo já receberam sugestão automática de quantidade.
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-[var(--pc-border)] rounded-xl border border-[var(--pc-border)] bg-white">
                  {orderItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[var(--pc-text-muted)]">
                      Nenhum produto cadastrado para este fornecedor. Cadastre os produtos fornecidos na aba Fornecedores.
                    </div>
                  ) : (
                    orderItems.map((item, idx) => (
                      <div key={item.productId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[var(--pc-text)]">{item.product.name}</p>
                          <p className="text-[11px] text-[var(--pc-text-muted)]">
                            Estoque atual: <strong>{item.product.stock} {item.product.unit}</strong> · Custo: {money(item.expectedCost)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={`${item.unitName || 'UN'}|${item.unitMultiplier || 1}`}
                            onChange={e => {
                              const [uName, mult] = e.target.value.split('|');
                              const next = [...orderItems];
                              next[idx].unitName = uName;
                              next[idx].unitMultiplier = Number(mult);
                              setOrderItems(next);
                            }}
                            className="rounded-lg border border-[var(--pc-border)] bg-white px-2 py-1 text-xs"
                          >
                            <option value="UN|1">UN (1 {item.product.unit || 'un'})</option>
                            {packagings.map(p => (
                              <option key={p.id} value={`${p.name}|${p.multiplier}`}>{p.name}</option>
                            ))}
                          </select>

                          <input
                            type="number"
                            min="0"
                            placeholder="Qtd"
                            value={item.quantity || ''}
                            onChange={e => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              const next = [...orderItems];
                              next[idx].quantity = val;
                              setOrderItems(next);
                            }}
                            className="w-16 rounded-lg border border-[var(--pc-border)] bg-white px-2 py-1 text-center font-bold text-[var(--pc-action)]"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--pc-border)] pt-4">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className={secondaryButton}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateOrder}
                    disabled={creating}
                    className={`${primaryButton} flex items-center gap-2`}
                  >
                    {creating && <Loader2 size={15} className="animate-spin" />}
                    <span>Gerar Pedido de Compra</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Modal: Receber Pedido */}
      {showReceiveModal && receivingOrder && (
        <Modal title="Confirmar Recebimento de Mercadorias" onClose={() => setShowReceiveModal(false)}>
          <div className="space-y-4 text-xs">
            <p className="text-[var(--pc-text-secondary)]">
              Ao confirmar, o estoque dos produtos abaixo será atualizado automaticamente no PDV e na loja.
            </p>

            <div className="max-h-80 overflow-y-auto divide-y divide-[var(--pc-border)] rounded-xl border border-[var(--pc-border)] bg-white">
              {receivingOrder.items.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--pc-text)]">{item.product.name}</p>
                    <p className="text-[11px] text-[var(--pc-text-muted)]">
                      Entrada: <strong>+{Number(item.quantity) * Number(item.unitMultiplier || 1)} {item.product.unit}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-[var(--pc-text-muted)]">Custo Final</p>
                    <strong className="font-bold tabular-nums text-[var(--pc-text)]">{money(item.expectedCost)}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--pc-border)] pt-4">
              <button
                type="button"
                onClick={() => setShowReceiveModal(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReceiveOrder}
                disabled={receiving}
                className={`${primaryButton} flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700`}
              >
                {receiving && <Loader2 size={15} className="animate-spin" />}
                <span>Confirmar Entrada no Estoque</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Embalagens */}
      {showPackagingsModal && (
        <ManagePackagingsModal
          isOpen={showPackagingsModal}
          onClose={() => {
            setShowPackagingsModal(false);
            void fetchPackagings();
          }}
        />
      )}
    </div>
  );
}
