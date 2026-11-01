import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Check, Clock, X, Phone, Save, Trash, Edit2, Copy, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import ManagePackagingsModal from '@/components/ManagePackagingsModal';

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Order State
  const [showNewModal, setShowNewModal] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [packagings, setPackagings] = useState<any[]>([]);
  const [showPackagingsModal, setShowPackagingsModal] = useState(false);
  
  // Receive Order State
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<any>(null);

  useEffect(() => {
    fetchOrders();
    fetchSuppliers();
    fetchPackagings();
  }, []);

  const fetchPackagings = async () => {
    try {
      const { data } = await api.get('/purchase-orders/packagings/all');
      setPackagings(data);
    } catch {
      // toast.error('Erro ao buscar embalagens.');
    }
  };

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/purchase-orders');
      setOrders(data);
    } catch {
      toast.error('Erro ao buscar pedidos.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data } = await api.get('/suppliers');
      setSuppliers(data);
    } catch {
      toast.error('Erro ao buscar fornecedores.');
    }
  };

  const handleSupplierSelect = (supId: string) => {
    const sup = suppliers.find(s => s.id === supId);
    setSelectedSupplier(sup);
    // Auto-fill order items with all catalog products with qty 0
    if (sup && sup.products) {
      setOrderItems(sup.products.map((sp: any) => {
        const base = Number(sp.expectedCost || sp.product.priceCost || 0);
        return {
          productId: sp.productId,
          product: sp.product,
          quantity: 0,
          baseUnitCost: base,
          expectedCost: base,
          unitMultiplier: 1,
          unitName: 'UN'
        };
      }));
    } else {
      setOrderItems([]);
    }
  };

  const updateOrderItemPack = (productId: string, unitName: string, unitMultiplier: number) => {
    setOrderItems(prev => prev.map(item => {
      if (item.productId === productId) {
        return { 
          ...item, 
          unitName, 
          unitMultiplier
          // REMOVED expectedCost multiplication so it remains UNIT cost
        };
      }
      return item;
    }));
  };

  const handleCreateOrder = async () => {
    const activeItems = orderItems.filter(i => i.quantity > 0);
    if (activeItems.length === 0) return toast.error('Selecione pelo menos um item.');

    try {
      const { data } = await api.post('/purchase-orders', {
        supplierId: selectedSupplier.id,
        items: activeItems.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          expectedCost: i.expectedCost,
          unitMultiplier: i.unitMultiplier,
          unitName: i.unitName
        }))
      });
      toast.success('Pedido criado!');
      setShowNewModal(false);
      setSelectedSupplier(null);
      setOrderItems([]);
      fetchOrders();
    } catch {
      toast.error('Erro ao criar pedido.');
    }
  };

  const handleSendWhatsapp = async (order: any) => {
    let text = `Olá ${order.supplier.name}! Gostaria de fazer um pedido:\n\n`;
    
    order.items.forEach((item: any) => {
      text += `- ${item.product.name} x ${Number(item.quantity)} ${item.unitName || item.product.unit || 'UN'}\n`;
    });
    
    text += `\nPor favor, me confirme quando puder!`;

    const encodedText = encodeURIComponent(text);
    const phone = order.supplier.whatsapp ? order.supplier.whatsapp.replace(/\D/g, '') : '';
    
    const url = `https://wa.me/55${phone}?text=${encodedText}`;
    window.open(url, '_blank');

    // Update status to SENT if it was DRAFT
    if (order.status === 'DRAFT') {
      try {
        await api.patch(`/purchase-orders/${order.id}/status`, { status: 'SENT' });
        fetchOrders();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleReceiveOrder = async () => {
    try {
      const itemsPayload = receivingOrder.items.map((i: any) => ({
        id: i.id,
        realCost: i.realCost || i.expectedCost
      }));

      await api.post(`/purchase-orders/${receivingOrder.id}/receive`, { items: itemsPayload });
      toast.success('Estoque atualizado e pedido concluído com sucesso!');
      setShowReceiveModal(false);
      setReceivingOrder(null);
      fetchOrders();
    } catch {
      toast.error('Erro ao confirmar recebimento.');
    }
  };

  const handleMarkAsSent = async (orderId: string) => {
    try {
      await api.patch(`/purchase-orders/${orderId}/status`, { status: 'SENT' });
      toast.success('Pedido marcado como enviado!');
      fetchOrders();
    } catch (error) {
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!confirm('Deseja realmente excluir este pedido? Essa ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/purchase-orders/${orderId}`);
      toast.success('Pedido excluído com sucesso!');
      fetchOrders();
    } catch (error) {
      toast.error('Erro ao excluir pedido.');
    }
  };

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<number>(0);

  const handleDeleteOrderItem = async (orderId: string, itemId: string) => {
    if (!confirm('Deseja remover este item do pedido?')) return;
    try {
      await api.delete(`/purchase-orders/${orderId}/items/${itemId}`);
      toast.success('Item removido com sucesso!');
      setEditingItemId(null);
      fetchOrders();
    } catch (error) {
      toast.error('Erro ao remover item.');
    }
  };

  const handleUpdateItemQuantity = async (orderId: string, itemId: string) => {
    if (editingQuantity <= 0) {
      return handleDeleteOrderItem(orderId, itemId);
    }
    try {
      await api.patch(`/purchase-orders/${orderId}/items/${itemId}`, { quantity: editingQuantity });
      toast.success('Quantidade atualizada com sucesso!');
      setEditingItemId(null);
      fetchOrders();
    } catch (error) {
      toast.error('Erro ao atualizar quantidade.');
    }
  };

  const handleDuplicateOrder = async (order: any) => {
    try {
      await api.post('/purchase-orders', {
        supplierId: order.supplierId,
        items: order.items.map((i: any) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          expectedCost: Number(i.expectedCost),
          unitMultiplier: Number(i.unitMultiplier || 1),
          unitName: i.unitName || 'UN'
        }))
      });
      toast.success('Pedido duplicado com sucesso!');
      fetchOrders();
    } catch (error) {
      toast.error('Erro ao duplicar pedido.');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedOrderId(prev => prev === id ? null : id);
    setEditingItemId(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <ShoppingCart className="text-emerald-500" /> Pedidos de Compra
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Crie pedidos, envie pelo WhatsApp e dê entrada no estoque.</p>
        </div>
        <div className="flex overflow-x-auto gap-2 pb-2 md:pb-0 custom-scrollbar w-full md:w-auto snap-x">
          <button
            onClick={() => setShowPackagingsModal(true)}
            className="snap-start shrink-0 bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-xl font-bold transition border border-zinc-700 text-sm whitespace-nowrap"
          >
            Gerenciar Embalagens
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="snap-start shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition text-sm whitespace-nowrap"
          >
            <Plus size={18} /> Novo Pedido
          </button>
        </div>
      </div>

      <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-900/50 border-b border-zinc-800">
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Data</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Fornecedor</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Itens</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Estimado/Real</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-zinc-500">Carregando...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-zinc-500">Nenhum pedido de compra encontrado.</td></tr>
            ) : (
              orders.map(order => (
                <React.Fragment key={order.id}>
                  <tr 
                    className="hover:bg-zinc-800/30 transition cursor-pointer"
                    onClick={() => toggleExpand(order.id)}
                  >
                    <td className="px-6 py-4 text-sm text-zinc-300">
                      {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <strong className="block text-sm text-zinc-200">{order.supplier.name}</strong>
                      <span className="text-xs text-zinc-500">{order.supplier.whatsapp}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-emerald-400 font-medium">
                      {order.items.length} produto(s) <span className="text-zinc-500 text-xs ml-1">(clique para ver)</span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {order.status === 'COMPLETED' ? (
                        <span className="text-emerald-400 font-bold">R$ {Number(order.totalReal).toFixed(2)}</span>
                      ) : (
                        <span className="text-zinc-300">R$ {Number(order.totalEstimated).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {order.status === 'DRAFT' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-zinc-800 text-zinc-400 border border-zinc-700"><Clock size={12}/> Rascunho</span>}
                      {order.status === 'SENT' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30"><Phone size={12}/> Enviado</span>}
                      {order.status === 'COMPLETED' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"><Check size={12}/> Recebido</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {(order.status === 'DRAFT' || order.status === 'SENT') && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleSendWhatsapp(order); }}
                            className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition flex items-center gap-1.5"
                          >
                            <Phone size={14} /> WhatsApp
                          </button>
                        )}
                        {order.status === 'DRAFT' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleMarkAsSent(order.id); }}
                            className="bg-zinc-700 hover:bg-zinc-600 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white transition flex items-center justify-center border border-zinc-600"
                            title="Marcar como Enviado (sem abrir WhatsApp)"
                          >
                            <Check size={14} />
                          </button>
                        )}
                        {order.status === 'SENT' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setReceivingOrder({
                                ...order,
                                items: order.items.map((i: any) => ({...i, realCost: Number(i.expectedCost)}))
                              });
                              setShowReceiveModal(true);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition flex items-center gap-1.5"
                          >
                            <Check size={14} /> Receber
                          </button>
                        )}
                        {(order.status === 'DRAFT' || order.status === 'SENT') && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-center border border-red-500/20"
                            title="Excluir Pedido"
                          >
                            <Trash size={14} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDuplicateOrder(order); }}
                          className="bg-zinc-700 hover:bg-zinc-600 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white transition flex items-center justify-center border border-zinc-600"
                          title="Duplicar Pedido"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedOrderId === order.id && (
                    <tr className="bg-zinc-900/40 border-b border-zinc-800/60">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50 shadow-inner">
                          <h4 className="text-sm font-bold text-white mb-3">Itens do Pedido</h4>
                          <div className="space-y-2">
                            {order.items.map((item: any) => (
                              <div key={item.id} className="flex justify-between items-center text-sm bg-zinc-900/80 border border-zinc-800 px-4 py-2.5 rounded-lg hover:bg-zinc-800 transition">
                                <span className="text-zinc-200 font-medium">{item.product.name}</span>
                                <div className="flex items-center gap-4 text-zinc-400">
                                  {editingItemId === item.id ? (
                                    <div className="flex items-center gap-2 bg-zinc-800/50 p-1 rounded">
                                      <input
                                        type="number"
                                        min="1"
                                        value={editingQuantity}
                                        onChange={(e) => setEditingQuantity(Number(e.target.value))}
                                        className="w-16 bg-zinc-900 border border-zinc-700 text-white px-2 py-1 text-sm rounded outline-none focus:border-emerald-500"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleUpdateItemQuantity(order.id, item.id); }}
                                        className="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 p-1.5 rounded transition"
                                        title="Salvar"
                                      >
                                        <Check size={14} />
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setEditingItemId(null); }}
                                        className="text-zinc-400 hover:text-zinc-300 bg-zinc-800 p-1.5 rounded transition"
                                        title="Cancelar"
                                      >
                                        <X size={14} />
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteOrderItem(order.id, item.id); }}
                                        className="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded transition"
                                        title="Remover Item"
                                      >
                                        <Trash size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="font-medium text-zinc-300 bg-zinc-800/50 px-2 py-1 rounded flex items-center gap-2">
                                      Qtd: {item.quantity} {item.unitName || item.product.unit || 'UN'}
                                      {item.unitMultiplier > 1 && <span className="text-zinc-500 text-[10px]">({Number(item.quantity) * Number(item.unitMultiplier)} un)</span>}
                                      {order.status !== 'COMPLETED' && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setEditingItemId(item.id); setEditingQuantity(item.quantity); }}
                                          className="text-zinc-500 hover:text-blue-400 transition ml-1"
                                          title="Editar quantidade"
                                        >
                                          <Edit2 size={12} />
                                        </button>
                                      )}
                                    </span>
                                  )}
                                  <span className="text-xs">Custo Estimado: <strong className="text-white">R$ {Number(item.expectedCost).toFixed(2)}</strong></span>
                                  {order.status === 'COMPLETED' && item.realCost && (
                                    <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Real: R$ {Number(item.realCost).toFixed(2)}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Visão Mobile dos Pedidos */}
      <div className="md:hidden flex flex-col space-y-3">
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Carregando...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 bg-zinc-900 rounded-2xl border border-zinc-800">Nenhum pedido de compra encontrado.</div>
        ) : (
          orders.map(order => (
            <div key={order.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  <div className="text-xs text-zinc-500 mb-1">{new Date(order.createdAt).toLocaleDateString('pt-BR')}</div>
                  <strong className="block text-base text-zinc-100">{order.supplier.name}</strong>
                  <span className="text-xs text-zinc-500">{order.supplier.whatsapp}</span>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {order.status === 'DRAFT' && <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase"><Clock size={10}/> Rascunho</span>}
                  {order.status === 'SENT' && <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 uppercase"><Phone size={10}/> Enviado</span>}
                  {order.status === 'COMPLETED' && <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase"><Check size={10}/> Recebido</span>}
                  
                  <div className="text-right mt-1">
                    {order.status === 'COMPLETED' ? (
                      <div className="text-emerald-400 font-bold text-lg leading-none">R$ {Number(order.totalReal).toFixed(2)}</div>
                    ) : (
                      <div className="text-zinc-300 font-bold text-lg leading-none">R$ {Number(order.totalEstimated).toFixed(2)}</div>
                    )}
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => toggleExpand(order.id)}
                className="bg-zinc-950/50 hover:bg-zinc-950 border border-zinc-800/60 rounded-xl p-3 flex justify-between items-center transition"
              >
                <span className="text-sm font-medium text-emerald-400">{order.items.length} produto(s)</span>
                <span className="text-xs font-bold text-zinc-500 flex items-center gap-1">{expandedOrderId === order.id ? 'Ocultar itens' : 'Ver itens'}</span>
              </button>

              {expandedOrderId === order.id && (
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50 shadow-inner space-y-2 mt-1">
                  {order.items.map((item: any) => (
                    <div key={item.id} className="flex flex-col text-sm bg-zinc-900/80 border border-zinc-800 p-3 rounded-lg">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <span className="text-zinc-200 font-medium leading-tight">{item.product.name}</span>
                        {order.status !== 'COMPLETED' && (
                          <div className="flex gap-1 shrink-0">
                             <button
                               onClick={() => { setEditingItemId(item.id); setEditingQuantity(item.quantity); }}
                               className="text-zinc-400 hover:text-blue-400 p-1 bg-zinc-800 rounded"
                             >
                               <Edit2 size={14} />
                             </button>
                             <button
                               onClick={() => handleDeleteOrderItem(order.id, item.id)}
                               className="text-zinc-400 hover:text-red-400 p-1 bg-zinc-800 rounded"
                             >
                               <Trash size={14} />
                             </button>
                          </div>
                        )}
                      </div>
                      
                      {editingItemId === item.id ? (
                        <div className="flex items-center gap-2 bg-zinc-800/50 p-2 rounded mb-2">
                          <input
                            type="number"
                            min="1"
                            value={editingQuantity}
                            onChange={(e) => setEditingQuantity(Number(e.target.value))}
                            className="w-16 bg-zinc-900 border border-zinc-700 text-white px-2 py-1 text-sm rounded outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={() => handleUpdateItemQuantity(order.id, item.id)}
                            className="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-3 py-1 rounded font-bold text-xs"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => setEditingItemId(null)}
                            className="text-zinc-400 hover:text-zinc-300 bg-zinc-800 px-3 py-1 rounded font-bold text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-between items-end text-xs">
                          <span className="text-zinc-400">
                            Qtd: <strong className="text-zinc-200">{item.quantity} {item.unitName || item.product.unit || 'UN'}</strong>
                            {item.unitMultiplier > 1 && ` (${Number(item.quantity) * Number(item.unitMultiplier)} un)`}
                          </span>
                          <span className="text-zinc-400">Est: <strong className="text-white">R$ {Number(item.expectedCost).toFixed(2)}</strong></span>
                        </div>
                      )}
                      
                      {order.status === 'COMPLETED' && item.realCost && (
                         <div className="mt-2 flex justify-end">
                           <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-xs">Real: R$ {Number(item.realCost).toFixed(2)}</span>
                         </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-800">
                {(order.status === 'DRAFT' || order.status === 'SENT') && (
                  <button 
                    onClick={() => handleSendWhatsapp(order)}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 py-2 rounded-xl text-xs font-bold text-white transition flex justify-center items-center gap-1.5"
                  >
                    <Phone size={14} /> WhatsApp
                  </button>
                )}
                {order.status === 'DRAFT' && (
                  <button 
                    onClick={() => handleMarkAsSent(order.id)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-xl text-xs font-bold text-zinc-300 transition flex justify-center items-center gap-1.5 border border-zinc-700"
                  >
                    <Check size={14} /> Marcar Enviado
                  </button>
                )}
                {order.status === 'SENT' && (
                  <button 
                    onClick={() => {
                      setReceivingOrder({
                        ...order,
                        items: order.items.map((i: any) => ({...i, realCost: Number(i.expectedCost)}))
                      });
                      setShowReceiveModal(true);
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2 rounded-xl text-xs font-bold text-white transition flex justify-center items-center gap-1.5"
                  >
                    <Check size={14} /> Receber
                  </button>
                )}
                <div className="flex gap-2 w-full mt-1">
                  {(order.status === 'DRAFT' || order.status === 'SENT') && (
                    <button 
                      onClick={() => handleDelete(order.id)}
                      className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 py-2 rounded-xl text-xs font-bold transition flex justify-center items-center gap-1.5 border border-red-500/20"
                    >
                      <Trash size={14} /> Excluir
                    </button>
                  )}
                  <button
                    onClick={() => handleDuplicateOrder(order)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-xl text-xs font-bold text-zinc-300 transition flex justify-center items-center gap-1.5 border border-zinc-700"
                  >
                    <Copy size={14} /> Duplicar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL GERENCIAR EMBALAGENS */}
      <ManagePackagingsModal
        isOpen={showPackagingsModal}
        onClose={() => setShowPackagingsModal(false)}
        onPackagingsChange={fetchPackagings}
      />

      {/* MODAL NOVO PEDIDO */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/80 backdrop-blur-sm z-10 sticky top-0">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Plus size={18} className="text-emerald-500" /> Novo Pedido de Compra
              </h2>
              <button onClick={() => setShowNewModal(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            
            <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-2">Selecione o Fornecedor</label>
                <select 
                  onChange={e => handleSupplierSelect(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {selectedSupplier && (
                <div>
                  <h3 className="text-sm font-bold text-white mb-3">Catálogo do Fornecedor</h3>
                  {orderItems.length === 0 ? (
                    <p className="text-sm text-zinc-500 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                      Este fornecedor ainda não possui produtos vinculados no seu catálogo. Vá em "Fornecedores" e vincule produtos primeiro.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {orderItems.map((item, index) => (
                        <div key={item.productId} className="flex items-center gap-4 bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                          {item.product.imageUrl ? (
                            <img src={item.product.imageUrl} alt={item.product.name} className="w-12 h-12 object-cover rounded-lg border border-zinc-800" />
                          ) : (
                            <div className="w-12 h-12 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800">
                              <Package size={20} className="text-zinc-600" />
                            </div>
                          )}
                          <div className="flex-1 space-y-1">
                            <strong className="block text-sm text-zinc-200">{item.product.name}</strong>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-zinc-500">Custo Ref Unitário: R$</span>
                              <input 
                                type="number" 
                                step="0.01" 
                                min="0"
                                className="bg-zinc-900 border border-zinc-700 rounded text-xs px-2 py-1 text-white w-20 outline-none focus:border-emerald-500"
                                value={(item as any)._rawExpectedCost ?? (item.expectedCost === 0 ? '' : Number(item.expectedCost).toFixed(2))}
                                onChange={(e) => {
                                  const newItems = [...orderItems];
                                  (newItems[index] as any)._rawExpectedCost = e.target.value;
                                  newItems[index].expectedCost = Number(e.target.value);
                                  setOrderItems(newItems);
                                }}
                                onBlur={() => {
                                  const newItems = [...orderItems];
                                  (newItems[index] as any)._rawExpectedCost = undefined;
                                  setOrderItems(newItems);
                                }}
                              />
                            </div>
                          </div>
                          <div className="w-40">
                            <select 
                              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-xs text-white outline-none focus:border-emerald-500 mb-2"
                              value={`${item.unitName}|${item.unitMultiplier}`}
                              onChange={(e) => {
                                const [name, multiplier] = e.target.value.split('|');
                                updateOrderItemPack(item.productId, name, Number(multiplier));
                              }}
                            >
                              <option value="UN|1">Unidade (1)</option>
                              {packagings.map(p => (
                                <option key={p.id} value={`${p.name}|${p.multiplier}`}>{p.name}</option>
                              ))}
                            </select>
                            <input 
                              type="number" 
                              step="0.01"
                              min="0"
                              placeholder="Qtd"
                              value={(item as any)._rawQuantity ?? (item.quantity === 0 ? '' : item.quantity)}
                              onChange={e => {
                                const newItems = [...orderItems];
                                (newItems[index] as any)._rawQuantity = e.target.value;
                                newItems[index].quantity = Number(e.target.value);
                                setOrderItems(newItems);
                              }}
                              onBlur={() => {
                                const newItems = [...orderItems];
                                (newItems[index] as any)._rawQuantity = undefined;
                                setOrderItems(newItems);
                              }}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white text-center"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 bg-zinc-900/50 border-t border-zinc-800 sticky bottom-0">
              <button 
                onClick={handleCreateOrder}
                disabled={!selectedSupplier || orderItems.every(i => i.quantity === 0)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2"
              >
                <Save size={18} /> Salvar e Criar Pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RECEBER PEDIDO */}
      {showReceiveModal && receivingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/80 backdrop-blur-sm z-10 sticky top-0">
              <div>
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Check size={18} className="text-emerald-500" /> Confirmar Recebimento
                </h2>
                <p className="text-xs text-zinc-400 mt-1">Fornecedor: {receivingOrder.supplier.name}</p>
              </div>
              <button onClick={() => setShowReceiveModal(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
                <p className="text-sm text-blue-400">
                  Verifique os valores reais pagos para cada item. Isso irá atualizar o Custo de Compra do seu estoque e adicionar a quantidade registrada no estoque automaticamente!
                </p>
              </div>

              <div className="space-y-3">
                {receivingOrder.items.map((item: any, index: number) => (
                  <div key={item.id} className="flex items-center gap-4 bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                    {item.product?.imageUrl ? (
                      <img src={item.product.imageUrl} alt={item.product?.name || 'Produto'} className="w-12 h-12 object-cover rounded-lg border border-zinc-800" />
                    ) : (
                      <div className="w-12 h-12 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800">
                        <Package size={20} className="text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1">
                      <strong className="block text-sm text-zinc-200">{item.product.name}</strong>
                      <span className="text-xs text-zinc-500">Qtd: {Number(item.quantity)} {item.unitName || item.product.unit} | Est. Unit: R$ {Number(item.expectedCost).toFixed(2)}</span>
                    </div>
                    <div className="w-32 flex flex-col">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 ml-1">Custo Real Unit. (R$)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        value={item.realCost}
                        onChange={e => {
                          const newItems = [...receivingOrder.items];
                          newItems[index].realCost = Number(e.target.value);
                          setReceivingOrder({...receivingOrder, items: newItems});
                        }}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 bg-zinc-900/50 border-t border-zinc-800 sticky bottom-0">
              <button 
                onClick={handleReceiveOrder}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2"
              >
                <Check size={18} /> Confirmar Entrada de Estoque
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
