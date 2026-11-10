import type { Appointment } from './types';

export const isPickupMode = (mode?: string | null) =>
  mode === 'pickup_only' || mode === 'pickup' || mode === 'round_trip' || mode === 'both';

export const isDropoffMode = (mode?: string | null) =>
  mode === 'dropoff_only' || mode === 'dropoff' || mode === 'round_trip' || mode === 'both';

export const packageTransportUiMode = (mode?: string | null): 'both' | 'pickup' | 'dropoff' =>
  mode === 'pickup_only' || mode === 'pickup' ? 'pickup' :
    mode === 'dropoff_only' || mode === 'dropoff' ? 'dropoff' : 'both';

export const packageTransportCovers = (requestedMode?: string | null, packageMode?: string | null) =>
  Boolean(packageMode) &&
  (!isPickupMode(requestedMode) || isPickupMode(packageMode)) &&
  (!isDropoffMode(requestedMode) || isDropoffMode(packageMode));

export const isPreCheckinStatus = (status: string) =>
  status === 'scheduled' || status === 'confirmed' || status === 'requested';

export const isInStoreStatus = (status: string) =>
  ['checked_in', 'in_progress', 'bathing', 'drying', 'grooming', 'finishing'].includes(status);

export const needsTaxiStop = (item: Appointment) =>
  Boolean(item.transport?.enabled) &&
  !['cancelled', 'no_show', 'delivered'].includes(item.status) &&
  ((isPickupMode(item.transport?.mode) && isPreCheckinStatus(item.status)) ||
    (isDropoffMode(item.transport?.mode) && (isPreCheckinStatus(item.status) || isInStoreStatus(item.status) || item.status === 'ready')));

export function summarizeTaxiAppointments(appointments: Appointment[]) {
  const all = [...new Map(appointments.map(item => [item.id, item])).values()]
    .filter(item => Boolean(item.transport?.enabled) && !['cancelled', 'no_show'].includes(item.status))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const pickups = all.filter(item => isPickupMode(item.transport?.mode) && isPreCheckinStatus(item.status));
  const inStore = all.filter(item => isInStoreStatus(item.status));
  const ready = all.filter(item => isDropoffMode(item.transport?.mode) && item.status === 'ready');
  const dropoffs = all.filter(item => isDropoffMode(item.transport?.mode) && item.status !== 'delivered')
    .sort((a, b) => {
      const score = (status: string) => status === 'ready' ? 1 : isInStoreStatus(status) ? 2 : 3;
      return score(a.status) - score(b.status) || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  const delivered = all.filter(item => item.status === 'delivered');
  return { all, pickups, inStore, ready, dropoffs, delivered };
}
