import * as crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeIdempotencyKey(rawKey: string | undefined | null, tenantId: string): string {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) return crypto.randomUUID();
  const trimmed = rawKey.trim();
  if (UUID_REGEX.test(trimmed)) return trimmed.toLowerCase();
  // Preserve the mapping introduced by the previous version for legacy keys.
  const hash = crypto.createHash('sha1').update(`7bar-sale-idempotency:${tenantId}:${trimmed}`).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), '5' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.slice(18, 20), hash.slice(20, 32)].join('-');
}

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined)
      .map(k => [k, canonical(value[k])]));
  }
  return value;
}

function normalizedRows(rows: any[], numbers: string[]): any[] {
  return (rows || []).map(row => {
    const result = { ...row };
    for (const key of numbers) if (result[key] != null) result[key] = Number(result[key]).toString();
    if (result.modifiers) result.modifiers = normalizedRows(result.modifiers, ['quantity', 'priceAdjustment']);
    return canonical(result);
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** Stored on Sale in the SAME transaction. Never reconstructed from a retry. */
export function computeSaleFingerprint(data: any): string {
  const payload = { ...data };
  // Transport metadata, not a new commercial instruction.
  for (const key of ['id', 'idempotencyKey', 'localId', 'offlineContingency', 'offlineCreatedAt', 'total', 'subtotal']) delete payload[key];
  payload.items = normalizedRows(data.items, ['quantity', 'priceUnit']);
  payload.extraItems = normalizedRows(data.extraItems, ['quantity', 'priceUnit']);
  payload.payments = normalizedRows(data.payments, ['value', 'troco']);
  payload.discount = Number(data.discount || 0).toString();
  payload.addition = Number(data.addition || 0).toString();
  payload.emitirNfce = Boolean(data.emitirNfce);
  payload.movimentarEstoque = data.movimentarEstoque !== false;
  payload.source = data.source || 'pdv';
  return 'v2:' + crypto.createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
}

/** Other unique constraints must remain errors. */
export function isSaleIdentityConflict(error: any): boolean {
  if (error?.code !== 'P2002') return false;
  const target = error.meta?.target;
  return target === 'PRIMARY' || target === 'id' ||
    (Array.isArray(target) && target.length === 1 && ['id', 'PRIMARY'].includes(target[0]));
}
