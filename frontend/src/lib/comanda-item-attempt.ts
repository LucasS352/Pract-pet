const memory = new Map<string, { payload: string; key: string }>();

function storageKey(scope: string) { return `7bar-comanda-item-attempt:${scope}`; }

export function getComandaItemAttempt(scope: string, body: unknown): string {
  const payload = JSON.stringify(body);
  const name = storageKey(scope);
  let existing = memory.get(name);
  if (!existing) {
    try { existing = JSON.parse(sessionStorage.getItem(name) || 'null'); } catch { /* memória basta nesta aba */ }
  }
  if (existing?.payload === payload) return existing.key;
  const attempt = { payload, key: crypto.randomUUID() };
  memory.set(name, attempt);
  try { sessionStorage.setItem(name, JSON.stringify(attempt)); } catch { /* memória basta nesta aba */ }
  return attempt.key;
}

export function clearComandaItemAttempt(scope: string): void {
  const name = storageKey(scope);
  memory.delete(name);
  try { sessionStorage.removeItem(name); } catch { /* nenhuma persistência disponível */ }
}
