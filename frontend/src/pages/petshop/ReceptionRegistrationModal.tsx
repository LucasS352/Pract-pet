import { useRef, useState, type FormEvent } from 'react';
import { PawPrint, Search, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Pet } from './types';
import { Modal, inputClass, labelClass, primaryButton, secondaryButton } from './ui';
import { PhotoUploadField } from './PhotoUploadField';

type ReceptionTutor = { id: string; name: string; phone: string };
export type ReceptionResult = { tutor: ReceptionTutor; pet: Pet | null };

export function ReceptionRegistrationModal({ includePet = false, onClose, onSaved }: {
  includePet?: boolean;
  onClose: () => void;
  onSaved: (result: ReceptionResult) => void;
}) {
  const [tutor, setTutor] = useState({ name: '', phone: '', email: '', cpfCnpj: '', address: '', notes: '', photoUrl: '', whatsappOptIn: true });
  const [pet, setPet] = useState({ name: '', species: 'dog', breed: '', sex: '', size: '', coatType: '', weight: '', birthDate: '', allergies: '', behavior: '', photoUrl: '' });
  const [withPet, setWithPet] = useState(includePet);
  const [existing, setExisting] = useState<ReceptionTutor | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const lookupSequence = useRef(0);
  const lookup = async () => {
    const phone = tutor.phone.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) { toast.error('Informe o telefone completo com DDD.'); return; }
    const sequence = ++lookupSequence.current;
    setSearching(true);
    try {
      const { data } = await api.get<ReceptionTutor | null>('/petshop/reception/tutors', { params: { phone } });
      if (sequence !== lookupSequence.current) return;
      if (data) { setExisting(data); setWithPet(true); setTutor(current => ({ ...current, name: data.name })); }
      else { setExisting(null); toast.info('Telefone ainda não cadastrado. Preencha o nome do tutor.'); }
    } catch (error: any) { if (sequence === lookupSequence.current) toast.error(error.response?.data?.message || 'Não foi possível consultar o telefone.'); }
    finally { if (sequence === lookupSequence.current) setSearching(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current || searching) return;
    if (tutor.phone.replace(/\D/g, '').length < 10) { toast.error('Informe um telefone válido com DDD.'); return; }
    savingRef.current = true; setSaving(true);
    try {
      const { data } = await api.post<ReceptionResult>('/petshop/reception/registrations', {
        ...(existing ? { customerId: existing.id } : { tutor }),
        ...(withPet ? { pet } : {}),
      });
      toast.success(data.pet ? 'Tutor e pet prontos para atendimento!' : 'Tutor cadastrado com sucesso!');
      onSaved(data);
    } catch (error: any) { toast.error(error.response?.data?.message || 'Não foi possível salvar o cadastro.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <Modal title={includePet ? 'Cadastrar tutor e pet' : 'Novo tutor'} onClose={() => { if (!saving) onClose(); }} maxWidth="sm:max-w-3xl">
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm leading-6 text-slate-500">Cadastre o responsável e, se desejar, o pet no mesmo atendimento. Para um tutor existente, busque pelo telefone.</p>
      <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><UserRound size={16} /> Dados do tutor</legend>
        <div className="sm:col-span-2">
          <label htmlFor="reception-phone" className={labelClass}>WhatsApp / telefone com DDD *</label>
          <div className="flex flex-wrap gap-2">
            <input id="reception-phone" type="tel" autoComplete="tel" required className={`${inputClass} min-w-0 flex-1 basis-48`} value={tutor.phone}
              onChange={e => { lookupSequence.current++; setSearching(false); setExisting(null); setTutor({ ...tutor, phone: e.target.value, ...(existing ? { name: '' } : {}) }); }} />
            <button type="button" disabled={searching} onClick={() => void lookup()} className={`${secondaryButton} inline-flex shrink-0 items-center gap-2`}><Search size={15} />{searching ? 'Buscando…' : 'Buscar por telefone'}</button>
          </div>
        </div>
        {existing && <div className="sm:col-span-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900" role="status"><strong>{existing.name}</strong> já está cadastrado. O novo pet será vinculado a esse tutor. Os dados atuais do tutor serão preservados.</div>}
        <label className="sm:col-span-2"><span className={labelClass}>Nome completo do tutor *</span><input required autoComplete="name" className={inputClass} disabled={Boolean(existing)} value={tutor.name} onChange={e => setTutor({ ...tutor, name: e.target.value })} /></label>
        {!existing && <>
          <label><span className={labelClass}>E-mail</span><input type="email" autoComplete="email" className={inputClass} value={tutor.email} onChange={e => setTutor({ ...tutor, email: e.target.value })} /></label>
          <label><span className={labelClass}>CPF</span><input className={inputClass} value={tutor.cpfCnpj} onChange={e => setTutor({ ...tutor, cpfCnpj: e.target.value })} /></label>
          <details className="sm:col-span-2 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Endereço, foto e observações do tutor</summary><div className="mt-3 grid gap-3">
            <PhotoUploadField label="Foto do tutor" value={tutor.photoUrl} onChange={photoUrl => setTutor(current => ({ ...current, photoUrl }))} />
            <label><span className={labelClass}>Endereço</span><input autoComplete="street-address" className={inputClass} value={tutor.address} onChange={e => setTutor({ ...tutor, address: e.target.value })} /></label>
            <label><span className={labelClass}>Observações do tutor</span><textarea className={inputClass} value={tutor.notes} onChange={e => setTutor({ ...tutor, notes: e.target.value })} /></label>
          </div></details>
          <label className="sm:col-span-2 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700"><input type="checkbox" className="mt-1" checked={tutor.whatsappOptIn} onChange={e => setTutor({ ...tutor, whatsappOptIn: e.target.checked })} />Autoriza confirmações e lembretes automáticos via WhatsApp</label>
        </>}
      </fieldset>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-sm font-semibold text-teal-900"><input type="checkbox" checked={withPet} disabled={saving || Boolean(existing)} onChange={e => setWithPet(e.target.checked)} /><PawPrint size={18} />Cadastrar o pet junto com o tutor</label>
      {withPet && <fieldset disabled={saving} className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-slate-900">Dados do pet</legend>
        <label><span className={labelClass}>Nome do pet *</span><input required className={inputClass} value={pet.name} onChange={e => setPet({ ...pet, name: e.target.value })} /></label>
        <label><span className={labelClass}>Espécie *</span><select className={inputClass} value={pet.species} onChange={e => setPet({ ...pet, species: e.target.value })}><option value="dog">Cachorro</option><option value="cat">Gato</option><option value="bird">Ave</option><option value="other">Outro</option></select></label>
        <label><span className={labelClass}>Raça</span><input className={inputClass} value={pet.breed} onChange={e => setPet({ ...pet, breed: e.target.value })} /></label>
        <label><span className={labelClass}>Sexo</span><select className={inputClass} value={pet.sex} onChange={e => setPet({ ...pet, sex: e.target.value })}><option value="">Não informado</option><option value="male">Macho</option><option value="female">Fêmea</option></select></label>
        <label><span className={labelClass}>Porte</span><select className={inputClass} value={pet.size} onChange={e => setPet({ ...pet, size: e.target.value })}><option value="">Não informado</option><option value="mini">Mini</option><option value="small">Pequeno</option><option value="medium">Médio</option><option value="large">Grande</option><option value="giant">Gigante</option></select></label>
        <label><span className={labelClass}>Pelagem</span><select className={inputClass} value={pet.coatType} onChange={e => setPet({ ...pet, coatType: e.target.value })}><option value="">Não informada</option><option value="short">Curta</option><option value="medium">Média</option><option value="long">Longa</option><option value="double">Dupla</option></select></label>
        <label className="sm:col-span-2"><span className={labelClass}>Alergias e cuidados importantes</span><textarea rows={2} className={inputClass} value={pet.allergies} onChange={e => setPet({ ...pet, allergies: e.target.value })} /></label>
        <details className="sm:col-span-2 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Foto, peso, nascimento e comportamento</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PhotoUploadField label="Foto do pet" value={pet.photoUrl} onChange={photoUrl => setPet(current => ({ ...current, photoUrl }))} />
          <label><span className={labelClass}>Peso (kg)</span><input type="number" min="0.01" step="0.01" className={inputClass} value={pet.weight} onChange={e => setPet({ ...pet, weight: e.target.value })} /></label>
          <label><span className={labelClass}>Nascimento</span><input type="date" className={inputClass} value={pet.birthDate} onChange={e => setPet({ ...pet, birthDate: e.target.value })} /></label>
          <label className="sm:col-span-2"><span className={labelClass}>Comportamento e manejo</span><textarea className={inputClass} value={pet.behavior} onChange={e => setPet({ ...pet, behavior: e.target.value })} /></label>
        </div></details>
      </fieldset>}
      <div className="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
        <button type="button" className={secondaryButton} disabled={saving} onClick={onClose}>Cancelar</button>
        <button className={primaryButton} disabled={saving || searching}>{saving ? 'Salvando…' : withPet ? 'Salvar tutor e pet' : 'Cadastrar somente tutor'}</button>
      </div>
    </form>
  </Modal>;
}
