export function parseModules(value: unknown): Record<string, boolean> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, boolean> : {};
  }
  catch { return {}; }
}

export function isolatedModules(modules: Record<string, boolean>) {
  return modules.restaurante === true || modules.kds === true || modules.carvoaria === true;
}

export function allowedStations(modules: Record<string, boolean>) {
  return [
    ...(modules.restaurante === true ? ['WAITER'] : []),
    ...(modules.kds === true ? ['KITCHEN', 'BAR', 'BAR_1', 'BAR_2', 'SERVICE'] : []),
    ...(modules.carvoaria === true ? ['CARVOARIA'] : []),
  ];
}

export function operatorAllowed(op: { active?: boolean; jobTitle?: string | null; isManager?: boolean }, context: string, isolated: boolean) {
  if (op.active === false) return false;
  const title = (op.jobTitle || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (context === 'waiter') return title === 'garcom';
  if (context === 'cashier') return isolated
    ? ['caixa', 'gerente', 'admin'].includes(title) || (!title && op.isManager === true)
    : Boolean(op.isManager || !title || ['caixa', 'gerente'].includes(title));
  return false;
}

// Exact routes only: a station credential must never authorize financial/admin APIs.
export function stationRouteAllowed(station: string, method: string, path: string) {
  if (method === 'GET' && ['/auth/access/config', '/v1/kds/config', '/v1/kds/tickets'].includes(path)) return true;
  if (method === 'PATCH' && path === '/v1/kds/status') return true;
  if (station !== 'WAITER') return false;
  if (method === 'GET' && path === '/operators') return true;
  if (method === 'POST' && path === '/auth/operator-login') return true;
  if (method === 'GET' && (path === '/products' || /^\/products\/[^/]+\/composition$/.test(path))) return true;
  if (method === 'GET' && /^\/v1\/comandas(?:\/[^/]+|\/assets\/[^/]+)?$/.test(path)) return true;
  if (method === 'POST' && (path === '/v1/comandas' || /^\/v1\/comandas\/[^/]+\/(items|request-payment|reopen|authorize|cancel)$/.test(path))) return true;
  if (method === 'POST' && /^\/v1\/comandas\/[^/]+\/items\/[^/]+\/(timer\/snooze|return-asset)$/.test(path)) return true;
  return method === 'POST' && /^\/v1\/comandas\/[^/]+\/items\/[^/]+\/remove$/.test(path);
}
