type ExperienceUser = { role?: string; groupId?: string | null; station?: string; modules?: Record<string, boolean> };

/** Rotas de destino padrão da plataforma Pract Pet */
export function loginDestination(user: ExperienceUser) {
  if (user.role === 'group_owner' || user.groupId) return '/grupo-portal';
  if (user.role === 'stockist') return '/petshop/produtos';
  if (user.modules?.petshop !== false) return '/petshop';
  return ['admin', 'superadmin'].includes(user.role || '') ? '/dashboard' : '/';
}
