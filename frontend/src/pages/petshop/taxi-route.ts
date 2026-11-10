const MAPS_URL = 'https://www.google.com/maps/dir/?api=1';

export function isMobileMapsClient(userAgent: string, coarsePointer: boolean, viewportWidth: number): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || coarsePointer || viewportWidth <= 767;
}

/** Consecutive tasks at one address share a visit; a later return stays in the route. */
export function orderedRouteAddresses(addresses: Array<string | null | undefined>): string[] {
  let previousKey = '';
  return addresses.flatMap(value => {
    const address = value?.trim();
    if (!address || address.toLowerCase() === 'sem endereço') return [];
    const key = address.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
    if (key === previousKey) return [];
    previousKey = key;
    return [address];
  });
}

export function requireRouteAddresses(addresses: Array<string | null | undefined>): string[] {
  const missing = addresses.filter(address => !address?.trim() || address.trim().toLowerCase() === 'sem endereço').length;
  if (missing) throw new Error(`${missing} parada(s) sem endereço válido. Complete o cadastro antes de montar a rota.`);
  return orderedRouteAddresses(addresses);
}

export function buildGoogleMapsRoutes(addresses: string[], mobile: boolean): string[] {
  const stops = orderedRouteAddresses(addresses);
  const maxStops = mobile ? 4 : 10; // Maps URLs: 3 mobile or 9 desktop waypoints, plus destination.
  const routes: string[] = [];
  let previousDestination: string | undefined;
  let next = 0;
  while (next < stops.length) {
    let count = Math.min(maxStops, stops.length - next);
    let url = '';
    while (count > 0) {
      const segment = stops.slice(next, next + count);
      const destination = encodeURIComponent(segment[segment.length - 1]);
      const origin = previousDestination ? `&origin=${encodeURIComponent(previousDestination)}` : '';
      const waypoints = segment.length > 1 ? `&waypoints=${encodeURIComponent(segment.slice(0, -1).join('|'))}` : '';
      url = `${MAPS_URL}${origin}&destination=${destination}${waypoints}&travelmode=driving`;
      if (url.length <= 2048) break;
      count--;
    }
    if (count === 0) throw new Error('Endereço muito longo para abrir no Google Maps.');
    routes.push(url);
    previousDestination = stops[next + count - 1];
    next += count;
  }
  return routes;
}
