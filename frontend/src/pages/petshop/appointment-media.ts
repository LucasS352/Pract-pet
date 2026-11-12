import type { Appointment, StageHistoryEntry } from './types';

export function uniqueStagePhotos(history: StageHistoryEntry[] = []) {
  const seen = new Set<string>();
  return history.filter(entry => {
    if (!entry.photoUrl || entry.skipped || seen.has(entry.photoUrl)) return false;
    seen.add(entry.photoUrl);
    return true;
  });
}

export function buildWhatsAppMessage(item: Appointment, portalUrl?: string | null, customNotes?: string | null) {
  const photos = new Set(uniqueStagePhotos(item.stageHistory || []).map(p => p.photoUrl));
  if (item.stagePhotoUrl) photos.add(item.stagePhotoUrl);
  const labels: Record<string, string> = { checked_in: 'Check-in', bathing: 'Banho', grooming: 'Tosa', finishing: 'Finalização', ready: 'Pronto para retirada', delivered: 'Concluído' };
  const intro = `Olá *${item.customer.name.split(' ')[0]}*! Atualização sobre o(a) *${item.pet.name}*:\n\n`;
  const taxiReturn = item.transport?.enabled && ['round_trip', 'both', 'dropoff_only', 'dropoff'].includes(item.transport.mode);
  const status = item.status === 'ready'
    ? taxiReturn ? 'Já está *PRONTO(A)*! O Táxi Dog fará a entrega; avisaremos quando sair.' : 'Já está *PRONTO(A) PARA RETIRADA*!'
    : `Etapa atual: *${labels[item.status] || item.status}*`;
  const album = portalUrl
    ? photos.size > 1
      ? `\n📸 Registramos ${photos.size} fotos das etapas de cuidados! Veja o álbum completo no link abaixo:`
      : photos.size
        ? '\n📸 Veja a foto do atendimento no link abaixo:'
        : ''
    : '';
  const footer = portalUrl ? `\n\nAcompanhe os cuidados por aqui:\n${portalUrl}` : '';
  return `${intro}${status}${customNotes ? `\n${customNotes}` : ''}${album}${footer}`;
}
