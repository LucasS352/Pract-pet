import { BadRequestException, HttpStatus } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { TenantContextService, TenantInterceptor } from '../../prisma/tenant-context.service';
import { clientIp, createRateLimiter, safeEqual } from './security';

describe('Security and reliability helpers', () => {
  it('safeEqual rejects undefined/empty and compares accurately', () => {
    expect(safeEqual('teltech352', undefined)).toBe(false);
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('my-secret-pin', 'my-secret-pin')).toBe(true);
  });

  it('clientIp picks rightmost public IP from X-Forwarded-For to prevent header spoofing', () => {
    const req = {
      headers: { 'x-forwarded-for': '9.9.9.9, 200.10.20.30, 172.18.0.5' },
      ip: '172.18.0.5',
    } as any;
    expect(clientIp(req)).toBe('200.10.20.30');
  });

  it('createRateLimiter blocks after exceeding max within window', () => {
    const limiter = createRateLimiter([
      {
        name: 'pin',
        match: req => req.path === '/api/tenants/setup/validate-pin',
        windowMs: 60_000,
        max: 2,
        message: 'Bloqueado',
      },
    ]);
    const makeRes = () => {
      const headers: Record<string, string> = {};
      return {
        statusCode: 200,
        body: null as any,
        setHeader: (k: string, v: string) => { headers[k] = v; },
        status(code: number) { this.statusCode = code; return this; },
        json(payload: any) { this.body = payload; return this; },
      };
    };
    const req = { method: 'POST', path: '/api/tenants/setup/validate-pin', headers: {}, ip: '1.2.3.4' } as any;
    const next = jest.fn();

    limiter(req, makeRes() as any, next);
    limiter(req, makeRes() as any, next);
    expect(next).toHaveBeenCalledTimes(2);

    const blockedRes = makeRes();
    limiter(req, blockedRes as any, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.body).toEqual({ statusCode: 429, message: 'Bloqueado' });
  });

  it('AllExceptionsFilter preserves HttpException, maps Prisma codes and hides raw errors', () => {
    const filter = new AllExceptionsFilter();
    const run = (err: unknown) => {
      let status = 200;
      let payload: any;
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({
            status: (code: number) => { status = code; return { json: (p: any) => { payload = p; } }; },
          }),
          getRequest: () => ({ method: 'POST', url: '/api/test', user: { tenantId: 't1' } }),
        }),
      } as any;
      filter.catch(err, host);
      return { status, payload };
    };

    expect(run(new BadRequestException('Campo inválido'))).toEqual({
      status: 400,
      payload: { message: 'Campo inválido', error: 'Bad Request', statusCode: 400 },
    });
    expect(run({ code: 'P2002' }).status).toBe(HttpStatus.CONFLICT);
    expect(run({ code: 'P2025' }).status).toBe(HttpStatus.NOT_FOUND);

    const fatal = run(new Error('mysql://root:secret@db:3306 failed'));
    expect(fatal.status).toBe(500);
    expect(fatal.payload.message).not.toContain('secret');
    expect(fatal.payload.message).not.toContain('mysql://');
  });

  it('TenantInterceptor denies suspended or inactive tenants', async () => {
    const contextService = new TenantContextService();
    const findUnique = jest.fn(async ({ where }: any) => ({
      id: where.id,
      databaseUrl: 'mysql://localhost/db',
      status: where.id === 't-suspended' ? 'suspended' : 'active',
    }));
    const interceptor = new TenantInterceptor(contextService, { tenant: { findUnique } } as any);

    const call = async (tenantId: string) => {
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { tenantId, sub: 'u1' } }),
        }),
      } as any;
      const obs = interceptor.intercept(ctx, { handle: () => of('ok') });
      return lastValueFrom(obs);
    };

    await expect(call('t-active')).resolves.toBe('ok');
    await expect(call('t-suspended')).rejects.toMatchObject({ status: 401 });
  });
});
