import { timingSafeEqual, createHash } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/** Comparação em tempo constante (evita timing attack). Retorna false se o esperado não estiver definido. */
export function safeEqual(received: unknown, expected: string | undefined | null): boolean {
  if (typeof received !== 'string' || !expected) return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Cabeçalhos de segurança básicos (equivalente enxuto ao helmet, sem dependência extra). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.removeHeader('X-Powered-By');
  next();
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitRule {
  /** Identificador da regra (separa contadores). */
  name: string;
  /** Testa se a requisição pertence à regra. */
  match: (req: Request) => boolean;
  windowMs: number;
  max: number;
  message: string;
}

function isPrivateIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '');
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean)
  );
}

export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const list = (Array.isArray(fwd) ? fwd.join(',') : fwd || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  // Da direita para a esquerda, pega o primeiro IP público inserido pelo proxy confiável (evita spoofing à esquerda).
  for (let i = list.length - 1; i >= 0; i--) {
    if (!isPrivateIp(list[i])) return list[i];
  }
  return list[list.length - 1] || req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Rate limiter em memória por IP (instância única de backend).
 * Protege login, endpoints de setup (PIN) e rotas públicas contra força bruta/abuso.
 */
export function createRateLimiter(rules: RateLimitRule[]) {
  const buckets = new Map<string, Bucket>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }, 60_000);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') return next();
    const now = Date.now();
    const ip = clientIp(req);
    for (const rule of rules) {
      if (!rule.match(req)) continue;
      const key = `${rule.name}:${ip}`;
      let b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + rule.windowMs };
        buckets.set(key, b);
      }
      b.count += 1;
      if (b.count > rule.max) {
        res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000).toString());
        res.status(429).json({ statusCode: 429, message: rule.message });
        return;
      }
    }
    next();
  };
}
