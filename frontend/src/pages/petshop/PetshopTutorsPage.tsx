import { ReceptionRegistrationModal } from './ReceptionRegistrationModal';
import { FormEvent, useEffect, useState } from 'react';
import { Bell, BellOff, Link2, MapPin, MessageCircle, PackageCheck, PawPrint, Pencil, Phone, Plus, Users } from 'lucide-react';
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
  const [generatingId, setGeneratingId] = useState('');
  const [form, setForm] = useState(emptyTutor);
  const [editingTutor, setEditingTutor] = useState<Tutor | null>(null);

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
      const fullAddress = composeDetailedAddress(form.street, form.number, form.neighborhood);
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

  const copyPortalLink = async (id: string) => {
    setGeneratingId(id);
    try {
      const { data } = await api.post(`/petshop/tutors/${id}/portal-link`, { rotate: false });
      const url = `${window.location.origin}${data.path}`;
      await navigator.clipboard.writeText(url);
      toast.success('Link da área do cliente copiado para a área de transferência!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível gerar o link.');
    } finally {
      setGeneratingId('');
    }
  };

  const sendPortalWhatsApp = async (tutor: Tutor) => {
    setGeneratingId(tutor.id);
    try {
      const { data } = await api.post(`/petshop/tutors/${tutor.id}/portal-link`, { rotate: false });
      const url = `${window.location.origin}${data.path}`;
      const cleanPhone = (tutor.phone || '').replace(/\D/g, '');
      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const firstName = tutor.name.split(' ')[0];
      const petNames = tutor.pets?.map(p => p.name).join(', ') || 'seu pet';
      const message =
        `Olá *${firstName}*! Aqui está o seu link exclusivo da Área do Tutor para acompanhar os atendimentos, fotos em tempo real e vacinas de *${petNames}*:\n\n` +
        `${url}`;
      window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
      toast.success('WhatsApp aberto com o link do tutor!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível preparar o WhatsApp.');
    } finally {
      setGeneratingId('');
    }
  };

  return <div className={pageClass}>
    <PageHeader eyebrow="Relacionamento" title="Tutores" description="Responsáveis, contatos e acesso à área do cliente." action={<button className={primaryButton} onClick={handleOpenNew}><Plus aria-hidden="true" className="mr-1.5 inline" size={17} />Novo tutor</button>} />

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
          <button onClick={() => sendPortalWhatsApp(tutor)} disabled={!tutor.pets?.length || generatingId === tutor.id} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--pc-action-soft)] px-3 text-xs font-semibold text-[var(--pc-action-hover)] transition hover:bg-[var(--pc-action)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50" title="Enviar link da área do cliente pelo WhatsApp"><MessageCircle aria-hidden="true" size={15} />WhatsApp</button>
          <button onClick={() => copyPortalLink(tutor.id)} disabled={!tutor.pets?.length || generatingId === tutor.id} className={secondaryButton + ' flex items-center justify-center gap-2 whitespace-nowrap px-3 text-xs'}><Link2 aria-hidden="true" size={15} />{generatingId === tutor.id ? 'Gerando…' : 'Copiar link'}</button>
        </div>
      </article>)}</div>}
    </section>

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

        {/* Bairro e Referência */}
        <label>
          <span className={labelClass}>Bairro</span>
          <input className={inputClass} placeholder="Ex: Vila Leozina" value={form.neighborhood} onChange={event => setForm({ ...form, neighborhood: event.target.value })} />
        </label>
        <label>
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
