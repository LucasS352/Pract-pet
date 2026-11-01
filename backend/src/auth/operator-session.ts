import { createHmac } from 'crypto';

// A reset re-hashes the PIN (even if its digits are reused), revoking old sessions.
export function pinVersion(pinHash: string, secret: string) {
  return createHmac('sha256', secret).update(pinHash).digest('hex');
}
