import { Injectable, NestInterceptor, ExecutionContext, CallHandler, UnauthorizedException } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { HeartPrismaService } from './heart-prisma.service';

export interface TenantContext {
  tenantId: string;
  databaseUrl: string;
  userId: string;
}

@Injectable()
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<TenantContext>();

  run<R>(context: TenantContext, callback: () => R): R {
    return TenantContextService.storage.run(context, callback);
  }

  get(): TenantContext {
    const context = TenantContextService.storage.getStore();
    if (!context) {
      throw new Error('TenantContext não inicializado para este request.');
    }
    return context;
  }
}

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private urlCache = new Map<string, { url: string; expiresAt: number }>();
  private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hora de cache

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly heartPrisma: HeartPrismaService
  ) {}

  private async getDatabaseUrl(tenantId: string): Promise<string> {
    if (tenantId === 'demo-tenant-001') {
      return process.env.DATABASE_URL_TENANT || 'mysql://root:7bar%402025@mysql:3306/demo_adega';
    }

    const cached = this.urlCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new UnauthorizedException('Acesso negado: Tenant inativo ou não encontrado.');
    }

    const databaseUrl = tenant.databaseUrl;
    this.urlCache.set(tenantId, {
      url: databaseUrl,
      expiresAt: Date.now() + this.CACHE_TTL
    });

    return databaseUrl;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return next.handle();

    // Use from() and switchMap to safely handle async fetch inside interceptor
    return from(this.getDatabaseUrl(user.tenantId)).pipe(
      switchMap((databaseUrl) => {
        const tenantContext: TenantContext = {
          tenantId: user.tenantId,
          databaseUrl,
          userId: user.id || user.sub,
        };

        return new Observable((observer) => {
          this.tenantContext.run(tenantContext, () => {
            next.handle().subscribe(observer);
          });
        });
      })
    );
  }
}
