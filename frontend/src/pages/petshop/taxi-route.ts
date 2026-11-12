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

/**
 * Detecta se o endereço já possui UF explícita (ex: - SP, , SP, /SP) ou CEP brasileiro.
 */
export function addressHasCityOrState(address: string): boolean {
  return /(-|\/|,)\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i.test(address)
    || /\b\d{5}-?\d{3}\b/.test(address);
}

/**
 * Qualifica um endereço de forma inteligente:
 * 1. Se o endereço já tiver indicação de UF/estado ou CEP, preserva sem alterar (evita misturar cidades diferentes).
 * 2. Se for fornecida uma cidade/UF padrão (ex.: da loja), enriquece apenas os endereços que ainda não possuem cidade.
 * 3. Se nenhuma cidade for fornecida, mantém o endereço limpo para o Google Maps resolver por proximidade/GPS do motorista.
 * Nunca bloqueia nem lança erro exigindo UF digitada.
 */
export function qualifyRouteAddress(address: string, fallbackCityState?: string | null): string {
  const clean = (address || '').trim();
  if (!clean) return '';
  if (addressHasCityOrState(clean)) {
    return clean;
  }
  const fallback = (fallbackCityState || '').trim();
  if (fallback) {
    const cityName = fallback.split(',')[0].trim().toLowerCase();
    if (cityName && clean.toLowerCase().endsWith(cityName)) {
      const uf = fallback.includes(',') ? fallback.split(',')[1].trim() : '';
      return uf ? `${clean}, ${uf}` : clean;
    }
    return `${clean}, ${fallback}`;
  }
  return clean;
}

export function qualifyRouteAddresses(addresses: string[], fallbackCityState?: string | null): string[] {
  return addresses.map(address => qualifyRouteAddress(address, fallbackCityState));
}

export function buildGoogleMapsRoutes(
  addresses: string[],
  mobile: boolean,
  originAddress?: string | null,
): string[] {
  const stops = orderedRouteAddresses(addresses);
  const maxStops = mobile ? 4 : 10; // Maps URLs: 3 mobile or 9 desktop waypoints, plus destination.
  const routes: string[] = [];
  let previousDestination = originAddress?.trim() || undefined;
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
