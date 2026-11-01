import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { SalesService } from './sales.service';

@Injectable()
export class SalesCronService {
  private readonly logger = new Logger(SalesCronService.name);
  private isRunning = false; // Lock para evitar sobreposição se a execução demorar mais de 5min

  constructor(
    private readonly heartPrisma: HeartPrismaService,
    private readonly tenantManager: TenantConnectionManager,
    private readonly salesService: SalesService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleNfceRetries() {
    if (this.isRunning) {
      this.logger.warn('Cron de NFC-e ignorado pois a execução anterior ainda está rodando.');
      return;
    }

    this.isRunning = true;
    this.logger.log('Iniciando varredura CRON de NFC-es travadas (Self-Healing)...');

    try {
      // 1. Busca todos os Tenants que estão com NFC-e Ativa E com o AutoSync habilitado
      const tenants = await this.heartPrisma.tenant.findMany({
        where: {
          nfceAtivo: true,
          nfceAutoSync: true, // FLAG DE PROTEÇÃO
          status: 'active',
        },
      });

      for (const tenant of tenants) {
        try {
          const tenantPrisma = await this.tenantManager.getTenantClient(tenant.id, tenant.databaseUrl);

          // 2. Busca apenas as vendas que o usuário pediu para emitir mas que estão presas no status 'pendente'
          const pendingSales = await tenantPrisma.sale.findMany({
            where: {
              emitirNfce: true,
              nfceStatus: 'pendente',
              deliveryJobs: { none: { kind: 'NFCE' } },
            },
            include: {
              items: true,
              payments: true,
              customer: true,
            },
          });

          if (pendingSales.length > 0) {
            this.logger.log(`Tenant [${tenant.name || tenant.id}]: Encontradas ${pendingSales.length} notas pendentes. Tentando reemitir...`);
          }

          // 3. Processa cada nota isoladamente (try/catch individual)
          for (const sale of pendingSales) {
            try {
              // Reutiliza a mesma lógica de emissão do SalesService
              await this.salesService.dispararNfce(tenant.id, tenant.databaseUrl, sale);
              // Pequeno delay (1s) para não afogar o servidor PHP da SEFAZ
              await new Promise(res => setTimeout(res, 1000));
            } catch (err: any) {
              this.logger.error(`Falha ao reemitir Venda ${sale.id} do Tenant ${tenant.id}: ${err.message}`);
              // Continua para a próxima nota, não quebra o loop principal!
            }
          }
        } catch (tenantErr: any) {
          this.logger.error(`Erro ao conectar no banco do Tenant ${tenant.id}: ${tenantErr.message}`);
          // Continua para o próximo tenant
        }
      }
    } catch (globalErr: any) {
      this.logger.error(`Falha crítica no CRON de NFC-e: ${globalErr.message}`);
    } finally {
      this.logger.log('Varredura CRON de NFC-e finalizada.');
      this.isRunning = false;
    }
  }
}
