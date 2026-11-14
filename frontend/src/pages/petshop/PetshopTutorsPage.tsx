import { ReceptionRegistrationModal } from './ReceptionRegistrationModal';
import { FormEvent, useEffect, useState } from 'react';
import { Bell, BellOff, MapPin, MessageCircle, PackageCheck, PawPrint, Pencil, Phone, Plus, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';
import { composeDetailedAddress, parseDetailedAddress, type Tutor } from './types';
import { EmptyState, inputClass, labelClass, ListSkeleton, Modal, pageClass, PageHeader, primaryButton, SearchField, secondaryButton } from './ui';
import { PhotoUploadField } from './PhotoUploadField';

const emptyTutor = {
  name: '',
  phone: '',
  cpfCnpj: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  reference: '',
  notes: '',
  photoUrl: '',
  whatsappOptIn: true,
};

export default function PetshopTutorsPage() {
  const [items, setItems] = useState<Tutor[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyTutor);
  const [editingTutor, setEditingTutor] = useState<Tutor | null>(null);
  const [mobileFilter, setMobileFilter] = useState<'all' | 'package' | 'optin'>('all');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const handleOpenNew = () => {
    setEditingTutor(null);
    setForm(emptyTutor);
    setOpen(true);
  };

  const handleOpenEdit = (tutor: Tutor) => {
    const parsed = parseDetailedAddress(tutor.address);
    setEditingTutor(tutor);
    setForm({
      name: tutor.name || '',
      phone: tutor.phone || '',
      cpfCnpj: tutor.cpfCnpj || '',
      street: parsed.street,
      number: parsed.number,
      neighborhood: parsed.neighborhood,
      city: parsed.city,
      reference: tutor.reference || '',
      notes: tutor.notes || '',
      photoUrl: tutor.photoUrl || '',
      whatsappOptIn: tutor.whatsappOptIn !== false,
    });
    setOpen(true);
  };

  const load = (showLoading = true) => {
    if (showLoading) setLoading(true);
    return api.get('/petshop/tutors', { params: { search } }).then(response => setItems(response.data)).catch(() => toast.error('Não foi possível carregar os tutores.')).finally(() => setLoading(false));
  };
  useEffect(() => { const timeout = setTimeout(() => { void load(); }, 180); return () => clearTimeout(timeout); }, [search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const fullAddress = composeDetailedAddress(form.street, form.number, form.neighborhood, form.city);
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        cpfCnpj: form.cpfCnpj.trim() || undefined,
        address: fullAddress || undefined,
        reference: form.reference?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        photoUrl: form.photoUrl || undefined,
        whatsappOptIn: form.whatsappOptIn,
      };

      if (editingTutor) {
        await api.patch(`/petshop/tutors/${editingTutor.id}`, payload);
        toast.success('Tutor atualizado com sucesso!');
      } else {
        await api.post('/petshop/tutors', payload);
        toast.success('Tutor cadastrado com sucesso!');
      }
      setOpen(false);
      setEditingTutor(null);
      setForm(emptyTutor);
      void load(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar tutor.');
    } finally {
      setSaving(false);
    }
  };

  const openTutorWhatsApp = (tutor: Tutor) => {
    const cleanPhone = (tutor.phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      toast.error('Tutor sem telefone cadastrado.');
      return;
    }
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    window.open(`https://wa.me/${fullPhone}`, '_blank', 'noopener,noreferrer');
  };

  const withPackagesCount = items.filter(t => (t.petPackages?.length || 0) > 0).length;
  const optInCount = items.filter(t => t.whatsappOptIn !== false).length;
  const mobileFilteredTutors = items.filter(t => {
    if (mobileFilter === 'package') return (t.petPackages?.length || 0) > 0;
    if (mobileFilter === 'optin') return t.whatsappOptIn !== false;
    return true;
  });

  return <div className={pageClass}>
    {/* ===================================================================== */}
    {/* VISÃO MOBILE (Padrão organizado com cards, KPI compacto e filtros)    */}
    {/* ===================================================================== */}
    <div className="space-y-4 pb-6 md:hidden">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">Tutores</h1>
          <span className="rounded-full bg-[#e6f4ef] px-2.5 py-0.5 text-xs font-bold text-[#0d6e5a]">
            {items.length} {items.length === 1 ? 'tutor' : 'tutores'}
          </span>
        </div>
        <p className="mt-0.5 text-xs font-medium text-zinc-500">Responsáveis, contatos e endereços</p>
      </div>

      {/* Barra de resumo compacta (2 colunas) */}
      <div className="grid grid-cols-2 divide-x divide-zinc-200/70 rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#0d6e5a]">
            <Users size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-zinc-500">Tutores cadastrados</p>
            <p className="text-lg font-extrabold leading-tight text-zinc-900">{items.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3.5 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#0d6e5a]">
            <PackageCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-zinc-500">Com pacote ativo</p>
            <p className="text-lg font-extrabold leading-tight text-zinc-900">{withPackagesCount}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleOpenNew}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0d6e5a] px-4 text-sm font-semibold text-white shadow-xs"
      >
        <Plus size={16} strokeWidth={2.5} />
        Novo tutor
      </button>

      {/* Filtros em pílulas + lupa */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'all' as const, label: `Todos (${items.length})` },
            { id: 'package' as const, label: `Com pacote (${withPackagesCount})` },
            { id: 'optin' as const, label: `Auto-WhatsApp (${optInCount})` },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileFilter(tab.id)}
              className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                mobileFilter === tab.id
                  ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                  : 'border-zinc-200 bg-white text-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMobileSearchOpen(v => !v)}
          aria-label="Buscar tutor"
          className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition ${
            mobileSearchOpen || search
              ? 'border-[#0d6e5a] bg-[#e6f4ef] text-[#0d6e5a]'
              : 'border-zinc-200 bg-white text-zinc-600'
          }`}
        >
          <Search size={16} />
        </button>
      </div>

      {(mobileSearchOpen || search) && (
        <div className="relative flex items-center">
          <Search size={15} className="pointer-events-none absolute left-3 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou CPF..."
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pr-9 pl-9 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 text-zinc-400"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {/* Lista mobile de tutores */}
      {loading ? (
        <ListSkeleton />
      ) : mobileFilteredTutors.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'Nenhum tutor encontrado' : 'Nenhum tutor cadastrado'}
          description={search ? 'Revise o termo pesquisado ou limpe a busca.' : 'Cadastre o primeiro responsável para vincular seus pets.'}
          action={!search && <button className={primaryButton} onClick={handleOpenNew}><Plus aria-hidden="true" className="mr-1.5 inline" size={16} />Cadastrar tutor</button>}
        />
      ) : (
        <div className="space-y-2.5">
          {mobileFilteredTutors.map(tutor => (
            <article key={tutor.id} className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-4 w-[3px] shrink-0 rounded-full bg-[#0d6e5a]" />
                  <h2 className="truncate text-[15px] font-bold text-zinc-900">{tutor.name}</h2>
                </div>
                {tutor.whatsappOptIn === false ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
                    <BellOff size={11} /> Sem auto
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#e6f4ef] px-2 py-0.5 text-[11px] font-bold text-[#0d6e5a]">
                    <Bell size={11} /> Auto-Whats
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1 font-medium text-zinc-700">
                  <Phone size={12} className="text-zinc-400" />
                  {tutor.phone || 'Sem telefone'}
                </span>
                <span className="text-zinc-400">·</span>
                <span className="inline-flex items-center gap-1">
                  <PawPrint size={12} className="text-zinc-400" />
                  {tutor.pets?.length || 0} {tutor.pets?.length === 1 ? 'pet' : 'pets'}
                  {tutor.pets?.length ? ` (${tutor.pets.map(p => p.name).join(', ')})` : ''}
                </span>
                {tutor.petPackages && tutor.petPackages.length > 0 && (
                  <span className="rounded-md bg-[#e6f4ef] px-2 py-0.5 text-[11px] font-semibold text-[#0d6e5a]">
                    {tutor.petPackages.length} pacote(s)
                  </span>
                )}
              </div>

              {tutor.address && (
                <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
                  <MapPin size={12} className="shrink-0 text-zinc-400" />
                  <span className="truncate">{tutor.address}</span>
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(tutor)}
                  className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
                >
                  <Pencil size={13} />
                  Editar
                </button>
                <button
                  type="button"
                  disabled={!tutor.phone}
                  onClick={() => openTutorWhatsApp(tutor)}
                  className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#0d6e5a]/25 bg-[#e6f4ef] px-3 py-1.5 text-xs font-semibold text-[#0d6e5a] disabled:opacity-50"
                >
                  <MessageCircle size={13} />
                  WhatsApp
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>

    {/* ===================================================================== */}
    {/* VISÃO DESKTOP                                                         */}
    {/* ===================================================================== */}
    <div className="hidden md:block">
    <PageHeader eyebrow="Relacionamento" title="Tutores" description="Responsáveis e contatos dos pets." action={<button className={primaryButton} onClick={handleOpenNew}><Plus aria-hidden="true" className="mr-1.5 inline" size={17} />Novo tutor</button>} />

    <div className="mb-5 max-w-xl"><SearchField value={search} onChange={setSearch} label="Buscar tutores" placeholder="Buscar por nome, telefone ou CPF" /></div>

    <section className="pc-panel overflow-hidden" aria-label="Tutores cadastrados">
      {loading ? <ListSkeleton /> : items.length === 0 ? <EmptyState icon={Users} title={search ? 'Nenhum tutor encontrado' : 'Nenhum tutor cadastrado'} description={search ? 'Revise o termo pesquisado ou limpe a busca.' : 'Cadastre o primeiro responsável para vincular seus pets.'} action={!search && <button className={primaryButton} onClick={handleOpenNew}><Plus aria-hidden="true" className="mr-1.5 inline" size={16} />Cadastrar tutor</button>} /> : <div className="divide-y divide-[var(--pc-border)]">{items.map(tutor => <article key={tutor.id} className="pc-row grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[48px_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto] lg:items-center">
        {tutor.photoUrl ? <img src={getFullUrl(tutor.photoUrl)} alt={`Foto de ${tutor.name}`} className="h-11 w-11 rounded-full border border-[var(--pc-border)] object-cover" loading="lazy" /> : <div aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--pc-surface-subtle)] text-sm font-semibold text-[var(--pc-text-secondary)]">{tutor.name.slice(0, 2).toUpperCase()}</div>}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{tutor.name}</h2>
            {tutor.whatsappOptIn === false ? (
              <span title="Não autorizou WhatsApp automático" className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                <BellOff size={10} /> Sem auto-msg
              </span>
            ) : (
              <span title="WhatsApp automático habilitado" className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                <Bell size={10} /> Auto-WhatsApp
              </span>
            )}
          </div>
          {tutor.cpfCnpj && <p className="mt-1 truncate text-xs text-[var(--pc-text-muted)]">{tutor.cpfCnpj}</p>}
        </div>
        <div className="min-w-0 space-y-1"><p className="flex items-center gap-2 truncate text-xs text-[var(--pc-text-secondary)]"><Phone aria-hidden="true" size={14} className="shrink-0 text-[var(--pc-text-muted)]" />{tutor.phone}</p></div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-[var(--pc-text-secondary)]"><PawPrint aria-hidden="true" size={14} className="shrink-0 text-[var(--pc-text-muted)]" /><span className="truncate">{tutor.pets?.length || 0} pet(s){tutor.pets?.length ? ` · ${tutor.pets.map(pet => pet.name).join(', ')}` : ''}</span></p>
          {tutor.petPackages && tutor.petPackages.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-teal-700">
              <PackageCheck size={13} className="shrink-0" />
              <span>{tutor.petPackages.length} pacote(s) ativo(s)</span>
            </p>
          )}
          {tutor.address && <p className="mt-1 flex items-start gap-2 text-xs text-[var(--pc-text-muted)]"><MapPin aria-hidden="true" size={14} className="mt-0.5 shrink-0" /><span className="line-clamp-1">{tutor.address}</span></p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenEdit(tutor)}
            className={`${secondaryButton} flex items-center justify-center gap-1.5 whitespace-nowrap px-3 text-xs`}
            title="Editar dados e contatos do tutor"
          >
            <Pencil aria-hidden="true" size={14} />
            <span>Editar</span>
          </button>
          <button type="button" onClick={() => openTutorWhatsApp(tutor)} disabled={!tutor.phone} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--pc-action-soft)] px-3 text-xs font-semibold text-[var(--pc-action-hover)] transition hover:bg-[var(--pc-action)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50" title="Abrir conversa com o tutor no WhatsApp"><MessageCircle aria-hidden="true" size={15} />WhatsApp</button>
        </div>
      </article>)}</div>}
    </section>
    </div>

    {open && !editingTutor && <ReceptionRegistrationModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); void load(false); }} />}
    {open && editingTutor && <Modal title="Editar tutor" onClose={() => { setOpen(false); setEditingTutor(null); }} maxWidth="sm:max-w-2xl">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {/* 1. Imagem / Foto do tutor no topo */}
        <div className="sm:col-span-2">
          <PhotoUploadField label="Foto do tutor (opcional)" subjectName={form.name} value={form.photoUrl} onChange={photoUrl => setForm({ ...form, photoUrl })} />
        </div>

        {/* 2. Nome completo do tutor */}
        <label className="sm:col-span-2">
          <span className={labelClass}>Nome completo *</span>
          <input className={inputClass} required autoComplete="name" placeholder="Ex: Juliana Mantovani" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
        </label>

        {/* 3. WhatsApp / telefone com DDD */}
        <label className="sm:col-span-2">
          <span className={labelClass}>WhatsApp / telefone com DDD *</span>
          <input type="tel" className={inputClass} required autoComplete="tel" placeholder="Ex: (14) 99114-6769" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
        </label>

        {/* CPF opcional (sem e-mail) */}
        <label className="sm:col-span-2">
          <span className={labelClass}>CPF (opcional)</span>
          <input className={inputClass} placeholder="000.000.000-00" value={form.cpfCnpj} onChange={event => setForm({ ...form, cpfCnpj: event.target.value })} />
        </label>

        {/* 4. Endereço estruturado: Rua / Avenida e Número */}
        <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <label className="sm:col-span-8">
            <span className={labelClass}>Endereço (Rua / Avenida)</span>
            <input autoComplete="street-address" className={inputClass} placeholder="Ex: R. Hipólito Lopes" value={form.street} onChange={event => setForm({ ...form, street: event.target.value })} />
          </label>
          <label className="sm:col-span-4">
            <span className={labelClass}>Número</span>
            <input className={inputClass} placeholder="Ex: 103" value={form.number} onChange={event => setForm({ ...form, number: event.target.value })} />
          </label>
        </div>

        {/* Bairro e Cidade */}
        <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <label className="sm:col-span-6">
            <span className={labelClass}>Bairro</span>
            <input className={inputClass} placeholder="Ex: Vila Leozina" value={form.neighborhood} onChange={event => setForm({ ...form, neighborhood: event.target.value })} />
          </label>
          <label className="sm:col-span-6">
            <span className={labelClass}>Cidade (opcional)</span>
            <input className={inputClass} placeholder="Ex: Bauru ou cidade vizinha" value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} />
          </label>
        </div>
        <label className="sm:col-span-2">
          <span className={labelClass}>Ponto de referência / Complemento</span>
          <input className={inputClass} placeholder="Ex: Próximo ao Campo Orlandão" value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })} />
        </label>

        {/* Observações */}
        <label className="sm:col-span-2">
          <span className={labelClass}>Observações do tutor</span>
          <textarea className={inputClass} rows={2} placeholder="Preferências de contato, restrições ou notas gerais..." value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
        </label>

        {/* Checkbox WhatsApp */}
        <label className="sm:col-span-2 flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-medium text-zinc-800">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            checked={form.whatsappOptIn}
            onChange={event => setForm({ ...form, whatsappOptIn: event.target.checked })}
          />
          <span>Autoriza receber confirmações e lembretes automáticos via WhatsApp</span>
        </label>

        <button disabled={saving} className={`${primaryButton} sm:col-span-2 mt-2`}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
      </form>
    </Modal>}
  </div>;
}
