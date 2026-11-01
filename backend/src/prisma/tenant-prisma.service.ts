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
  private connectionPromises = new Map<string, Promise<PrismaClient>>();
  private readonly MAX_CLIENTS = 100;
  private readonly IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutos

  /**
   * Obtém ou cria uma conexão cacheada para um tenant em específico.
   * Agora com limites de pool e limpeza automática.
   */
  async getTenantClient(tenantId: string, databaseUrl: string): Promise<PrismaClient> {
    // 1. Executa limpeza de conexões ociosas periodicamente
    this.runCleanup();

    // 2. Verifica se já temos o cliente em cache
    if (this.clients.has(tenantId)) {
      const entry = this.clients.get(tenantId)!;
      entry.lastUsed = Date.now();
      return entry.client;
    }

    // 3. Se já existe uma promessa de conexão em andamento, espera por ela (evita race condition)
    if (this.connectionPromises.has(tenantId)) {
      return this.connectionPromises.get(tenantId)!;
    }

    // 4. Gerenciamento de capacidade (LRU simples)
    if (this.clients.size >= this.MAX_CLIENTS) {
      this.evictOldest();
    }

    // 5. Injeta limite de conexões na URL (Bulletproof para escalabilidade)
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '10');
    url.searchParams.set('pool_timeout', '20'); // segundos
    const optimizedUrl = url.toString();

    this.logger.log(`Iniciando novo Pool Prisma para Tenant: ${tenantId} (limit=10)`);

    const client = new PrismaClient({
      datasources: {
        db: {
          url: optimizedUrl,
        },
      },
    });

    const connectPromise = (async () => {
      try {
        await client.$connect();
        this.clients.set(tenantId, { client, lastUsed: Date.now() });
        return client;
      } catch (error) {
        this.logger.error(`Falha ao conectar no banco do tenant ${tenantId}: ${error.message}`);
        throw error;
      } finally {
        this.connectionPromises.delete(tenantId);
      }
    })();

    this.connectionPromises.set(tenantId, connectPromise);
    return connectPromise;
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
