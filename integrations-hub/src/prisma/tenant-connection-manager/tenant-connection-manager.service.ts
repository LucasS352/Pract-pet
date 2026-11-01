import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

interface CachedClient {
  client: PrismaClient;
  lastUsed: number;
}

@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly logger = new Logger(TenantConnectionManager.name);
  private clients = new Map<string, CachedClient>();
  private readonly MAX_CLIENTS = 100;
  private readonly IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutos

  async getTenantClient(tenantId: string, databaseUrl: string): Promise<PrismaClient> {
    this.runCleanup();

    if (this.clients.has(tenantId)) {
      const entry = this.clients.get(tenantId)!;
      entry.lastUsed = Date.now();
      return entry.client;
    }

    if (this.clients.size >= this.MAX_CLIENTS) {
      this.evictOldest();
    }

    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '3');
    url.searchParams.set('pool_timeout', '20'); // segundos
    const optimizedUrl = url.toString();

    this.logger.log(`Iniciando novo Pool Prisma para Tenant: ${tenantId} (limit=3)`);

    const client = new PrismaClient({
      datasources: {
        db: {
          url: optimizedUrl,
        },
      },
    });

    try {
      await client.$connect();
      this.clients.set(tenantId, { client, lastUsed: Date.now() });
      return client;
    } catch (error: any) {
      this.logger.error(`Falha ao conectar no banco do tenant ${tenantId}: ${error.message}`);
      throw error;
    }
  }

  private runCleanup() {
    const now = Date.now();
    for (const [id, entry] of this.clients.entries()) {
      if (now - entry.lastUsed > this.IDLE_TIMEOUT) {
        this.logger.log(`Limpando conexão ociosa do Tenant: ${id}`);
        entry.client.$disconnect().catch(() => {});
        this.clients.delete(id);
      }
    }
  }

  private evictOldest() {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.clients.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.logger.log(`Limite de cache atingido. Removendo cliente mais antigo: ${oldestId}`);
      const entry = this.clients.get(oldestId)!;
      entry.client.$disconnect().catch(() => {});
      this.clients.delete(oldestId);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Encerrando todas as conexões de tenants...');
    const disconnectPromises = Array.from(this.clients.values()).map((entry) =>
      entry.client.$disconnect(),
    );
    await Promise.all(disconnectPromises);
    this.clients.clear();
  }
}
