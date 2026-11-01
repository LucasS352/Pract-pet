import { useState, useEffect, useMemo, FormEvent } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Truck, Plus, Edit, Trash2, Package, Search,
  Phone, Save, X, ExternalLink, Loader2, Building2
} from 'lucide-react';
import { CatalogTabs, PageHeader, pageClass, primaryButton, secondaryButton, inputClass, labelClass, Modal } from './ui';
import { money } from './types';

interface SupplierProduct {
  id: string;
  productId: string;
  supplierProductCode?: string | null;
  expectedCost?: number | null;
  product: {
    id: string;
    name: string;
    unit: string;
    priceCost: number;
    priceSell: number;
    stock: number;
    imageUrl?: string | null;
  };
}

interface Supplier {
  id: string;
  name: string;
  whatsapp?: string | null;
  cnpjCpf?: string | null;
  email?: string | null;
  products?: SupplierProduct[];
}

export default function PetshopSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({ name: '', whatsapp: '', cnpjCpf: '', email: '' });
  const [saving, setSaving] = useState(false);

  // Selected Supplier
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null);

  const fetchSuppliers = async () => {
    try {
      const { data } = await api.get('/suppliers');
      const list = Array.isArray(data) ? data : [];
      setSuppliers(list);
      if (activeSupplier) {
        const found = list.find((s: Supplier) => s.id === activeSupplier.id);
        setActiveSupplier(found || null);
      }
    } catch {
      toast.error('Erro ao carregar lista de fornecedores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSuppliers();
  }, []);

  const openNewModal = () => {
    setEditData(null);
    setFormData({ name: '', whatsapp: '', cnpjCpf: '', email: '' });
    setShowModal(true);
  };

  const openEditModal = (sup: Supplier) => {
    setEditData(sup);
    setFormData({
      name: sup.name || '',
      whatsapp: sup.whatsapp || '',
      cnpjCpf: sup.cnpjCpf || '',
      email: sup.email || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Informe o nome do fornecedor.');
      return;
    }
    setSaving(true);
    try {
      if (editData) {
        await api.patch(`/suppliers/${editData.id}`, formData);
        toast.success('Fornecedor atualizado com sucesso!');
      } else {
        await api.post('/suppliers', formData);
        toast.success('Fornecedor cadastrado com sucesso!');
      }
      setShowModal(false);
      void fetchSuppliers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao salvar fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o fornecedor "${name}"?`)) return;
    try {
      await api.delete(`/suppliers/${id}`);
      toast.success('Fornecedor excluído.');
      if (activeSupplier?.id === id) setActiveSupplier(null);
      void fetchSuppliers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao excluir fornecedor.');
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const term = search.toLowerCase().trim();
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(term) ||
      (s.cnpjCpf && s.cnpjCpf.includes(term)) ||
      (s.email && s.email.toLowerCase().includes(term)) ||
      (s.whatsapp && s.whatsapp.includes(term))
    );
  }, [suppliers, search]);

  return (
    <div className={pageClass}>
      <PageHeader
        eyebrow="Compras e Parcerias"
        title="Fornecedores"
        description="Gerencie os distribuidores de ração, vacinas, produtos veterinários e higiene com contatos e catálogos."
        action={
          <button
            type="button"
            onClick={openNewModal}
            className={`${primaryButton} flex items-center gap-2`}
          >
            <Plus size={16} />
            <span>Novo Fornecedor</span>
          </button>
        }
      />

      <CatalogTabs />

      {/* Grid: Lista de Fornecedores à Esquerda + Detalhes/Catálogo à Direita */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna 1: Lista de Fornecedores */}
        <div className="space-y-4 lg:col-span-1">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--pc-text-muted)]" />
            <input
              type="search"
              placeholder="Buscar fornecedor…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputClass} pl-10`}
            />
          </div>

          <div className="pc-panel overflow-hidden">
            {loading ? (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-[var(--pc-text-secondary)]">
                <Loader2 size={18} className="animate-spin text-[var(--pc-action)]" />
                <span>Carregando fornecedores…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--pc-text-muted)]">
                <Truck size={32} className="mx-auto mb-2 text-[var(--pc-border-strong)]" />
                <p className="font-semibold text-[var(--pc-text)]">Nenhum fornecedor encontrado</p>
                <p className="mt-1">Cadastre seus parceiros e distribuidores de produtos.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--pc-border)] max-h-[640px] overflow-y-auto">
                {filtered.map(sup => {
                  const isSelected = activeSupplier?.id === sup.id;
                  return (
                    <div
                      key={sup.id}
                      onClick={() => setActiveSupplier(sup)}
                      className={`cursor-pointer p-4 transition-colors ${
                        isSelected
                          ? 'bg-[var(--pc-action-soft)] border-l-4 border-l-[var(--pc-action)]'
                          : 'hover:bg-[var(--pc-surface-subtle)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold text-[var(--pc-text)]">
                            {sup.name}
                          </h4>
                          {sup.cnpjCpf && (
                            <p className="mt-0.5 text-xs text-[var(--pc-text-muted)] font-mono">
                              CNPJ/CPF: {sup.cnpjCpf}
                            </p>
                          )}
                          {sup.whatsapp && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--pc-action)] font-medium">
                              <Phone size={12} />
                              <span>{sup.whatsapp}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openEditModal(sup)}
                            className="grid h-7 w-7 place-items-center rounded-md text-[var(--pc-text-muted)] transition hover:bg-white hover:text-[var(--pc-text)]"
                            title="Editar fornecedor"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(sup.id, sup.name)}
                            className="grid h-7 w-7 place-items-center rounded-md text-[var(--pc-text-muted)] transition hover:bg-[var(--pc-danger-soft)] hover:text-[var(--pc-danger)]"
                            title="Excluir fornecedor"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Coluna 2: Detalhes do Fornecedor e Catálogo de Produtos */}
        <div className="lg:col-span-2">
          {activeSupplier ? (
            <div className="pc-panel p-5 sm:p-6 space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--pc-border)] pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--pc-action-soft)] text-[var(--pc-action)]">
                      <Truck size={17} />
                    </span>
                    <h3 className="text-lg font-bold text-[var(--pc-text)]">{activeSupplier.name}</h3>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--pc-text-secondary)]">
                    {activeSupplier.cnpjCpf && <span>CNPJ/CPF: <strong className="text-[var(--pc-text)]">{activeSupplier.cnpjCpf}</strong></span>}
                    {activeSupplier.email && <span>E-mail: <strong className="text-[var(--pc-text)]">{activeSupplier.email}</strong></span>}
                  </div>
                </div>

                {activeSupplier.whatsapp && (
                  <a
                    href={`https://wa.me/55${activeSupplier.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <Phone size={14} />
                    <span>Abrir WhatsApp</span>
                  </a>
                )}
              </div>

              {/* Catálogo de Produtos do Fornecedor */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--pc-text)]">
                    Catálogo de Produtos deste Fornecedor ({activeSupplier.products?.length || 0})
                  </h4>
                </div>

                {!activeSupplier.products || activeSupplier.products.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--pc-border-strong)] p-8 text-center text-xs text-[var(--pc-text-muted)]">
                    <Package size={32} className="mx-auto mb-2 text-[var(--pc-border-strong)]" />
                    <p className="font-semibold text-[var(--pc-text)]">Nenhum produto vinculado ainda</p>
                    <p className="mt-1">
                      Os produtos vinculam-se automaticamente ao registrar pedidos de compra ou entradas de estoque com este fornecedor.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--pc-border)] overflow-hidden rounded-xl border border-[var(--pc-border)] bg-white text-xs">
                    {activeSupplier.products.map(sp => (
                      <div key={sp.id} className="flex items-center justify-between p-3.5 hover:bg-[var(--pc-surface-subtle)] transition">
                        <div className="flex items-center gap-3 min-w-0">
                          {sp.product.imageUrl ? (
                            <img src={sp.product.imageUrl} alt="" className="h-9 w-9 rounded-lg border border-[var(--pc-border)] object-cover" />
                          ) : (
                            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--pc-surface-subtle)] text-[var(--pc-text-secondary)]">
                              <Package size={15} />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[var(--pc-text)]">{sp.product.name}</p>
                            <p className="text-[11px] text-[var(--pc-text-muted)]">
                              Estoque atual: <strong>{sp.product.stock} {sp.product.unit}</strong>
                              {sp.supplierProductCode ? ` · Cód. no Fornecedor: ${sp.supplierProductCode}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-[var(--pc-text-muted)]">Custo Negociado</p>
                          <strong className="text-xs font-bold tabular-nums text-[var(--pc-text)]">
                            {money(sp.expectedCost || sp.product.priceCost || 0)}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="pc-panel flex min-h-80 flex-col items-center justify-center p-8 text-center">
              <Building2 size={40} className="mb-3 text-[var(--pc-border-strong)]" />
              <h4 className="text-sm font-semibold text-[var(--pc-text)]">Nenhum fornecedor selecionado</h4>
              <p className="mt-1 max-w-sm text-xs text-[var(--pc-text-muted)]">
                Clique em um fornecedor na lista à esquerda para visualizar seus contatos, WhatsApp e produtos fornecidos.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Cadastro/Edição de Fornecedor */}
      {showModal && (
        <Modal
          title={editData ? 'Editar Fornecedor' : 'Novo Fornecedor'}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelClass}>Nome / Razão Social *</label>
              <input
                required
                type="text"
                placeholder="Ex: Distribuidora Pet Care Ltda"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>WhatsApp / Telefone</label>
                <input
                  type="text"
                  placeholder="(11) 99999-9999"
                  value={formData.whatsapp}
                  onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>CNPJ ou CPF</label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={formData.cnpjCpf}
                  onChange={e => setFormData({ ...formData, cnpjCpf: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>E-mail de Contato</label>
              <input
                type="email"
                placeholder="pedidos@fornecedor.com.br"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-[var(--pc-border)] pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`${primaryButton} flex items-center gap-2`}
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                <span>{editData ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
