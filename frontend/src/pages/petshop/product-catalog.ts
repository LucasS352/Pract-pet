export function isPetshopServiceCategory(name?: string | null): boolean {
  const normalized = (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return normalized === 'servicos' || normalized === 'servico' || normalized === 'pacotes pet';
}
