export function isWaiterSession(token: string | null) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.type === 'op' && payload.context === 'waiter';
  } catch { return false; }
}
