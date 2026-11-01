import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HeartPrismaService } from '../../prisma/heart-prisma.service';
import { DownloadStage } from './stages/download.stage';

@Injectable()
export class FiscalDistributionService {
  private readonly logger = new Logger(FiscalDistributionService.name);
  private isCronRunning = false;

  constructor(
    private readonly heart: HeartPrismaService,
    private readonly downloadStage: DownloadStage,
  ) {}

  /**
   * Cron job que roda a cada 30 minutos para verificar novas notas na SEFAZ.
   * Respeita a regra de backoff de 60 minutos da SEFAZ NT 2014.002.
   */
  @Cron('0 */30 * * * *')
  async handleCron() {
    if (this.isCronRunning) {
      this.logger.warn('Cron de distribuição DF-e ignorado, pois a execução anterior ainda está rodando.');
      return;
    }
    this.isCronRunning = true;
    this.logger.log('Iniciando rotina de distribuição DF-e para todos os tenants ativos.');

    try {
      // Busca todos os tenants ativos que têm certificado e CNPJ configurado
      const tenants = await this.heart.tenant.findMany({
        where: {
          status: 'active',
          cnpj: { not: null },
          certPfx: { not: null },
          certSenha: { not: null },
        },
      });

      this.logger.log(`Encontrados ${tenants.length} tenants para sincronizar DF-e.`);

      for (const tenant of tenants) {
        // Validação se o certificado está vencido, se sim, pular (ainda não temos a expiração persistida de forma confiável para pular, vamos deixar o PHP tentar)
        const empresaInfo = {
          razaoSocial: tenant.razaoSocial,
          cnpj: tenant.cnpj,
          ambiente: 1, // Notas fiscais de fornecedores (DF-e) só existem no ambiente de produção da SEFAZ
          endereco: { uf: tenant.uf || 'SP' },
          certificadoPfxBase64: tenant.certPfx ? Buffer.from(tenant.certPfx).toString('base64') : '',
          certificadoSenha: tenant.certSenha,
        };

        try {
          await this.downloadStage.syncTenant(tenant.id, tenant.databaseUrl, empresaInfo);
        } catch (error: any) {
          this.logger.error(`Erro ao sincronizar tenant ${tenant.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Falha geral no cron de distribuição DF-e: ${error.message}`);
    } finally {
      this.isCronRunning = false;
      this.logger.log('Rotina de distribuição DF-e finalizada.');
    }
  }

  /**
   * Sincronização manual acionada por demanda de um único tenant.
   */
  async syncSingleTenant(tenantId: string) {
    const tenant = await this.heart.tenant.findFirst({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error('Tenant não encontrado.');
    }
    if (!tenant.cnpj || !tenant.certPfx || !tenant.certSenha) {
      throw new Error('Certificado digital ou CNPJ do emitente não configurado.');
    }

    const empresaInfo = {
      razaoSocial: tenant.razaoSocial,
      cnpj: tenant.cnpj,
      ambiente: 1, // Notas fiscais de fornecedores (DF-e) só existem no ambiente de produção da SEFAZ
      endereco: { uf: tenant.uf || 'SP' },
      certificadoPfxBase64: tenant.certPfx ? Buffer.from(tenant.certPfx).toString('base64') : '',
      certificadoSenha: tenant.certSenha,
    };

    return this.downloadStage.syncTenant(tenant.id, tenant.databaseUrl, empresaInfo);
  }
}
