import { Injectable, Logger, BadGatewayException, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionManager } from '../../prisma/tenant-prisma.service';
import { TenantContextService } from '../../prisma/tenant-context.service';
import { HeartPrismaService } from '../../prisma/heart-prisma.service';
import { FiscalPhpService } from '../fiscal-php.service';
import { FiscalLoggerService } from '../audit/fiscal-logger.service';

@Injectable()
export class DanfeService {
  private readonly logger = new Logger(DanfeService.name);

  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly heartPrisma: HeartPrismaService,
    private readonly phpService: FiscalPhpService,
    private readonly fiscalLogger: FiscalLoggerService,
  ) {}

  private async getTenantConfig() {
    const context = this.tenantContext.get();
    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: context.tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado no Heart');
    if (!tenant.certPfx) throw new BadRequestException('Tenant sem certificado configurado');

    return {
      empresa: {
        razaoSocial: tenant.razaoSocial,
        cnpj: tenant.cnpj,
        ambiente: tenant.nfceAmbiente || 2,
        endereco: { uf: tenant.uf || 'SP' },
        csc: tenant.nfceCsc,
        idCsc: tenant.nfceIdCsc,
      },
      certPfxBase64: Buffer.from(tenant.certPfx).toString('base64'),
      certSenha: tenant.certSenha,
    };
  }

  async cancelarNfce(saleId: string, motivo: string, userId: string) {
    const context = this.tenantContext.get();
    const tenantPrisma = await this.tenantManager.getTenantClient(context.tenantId, context.databaseUrl);
    const config = await this.getTenantConfig();

    const sale = await tenantPrisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.nfceStatus !== 'autorizada') throw new BadRequestException('Apenas NFC-e autorizada pode ser cancelada');
    if (!sale.nfceChave || !sale.nfceProtocolo) throw new BadRequestException('Venda sem chave ou protocolo');

    const payload = {
      empresa: config.empresa,
      certPfxBase64: config.certPfxBase64,
      certSenha: config.certSenha,
      chave: sale.nfceChave,
      protocolo: sale.nfceProtocolo,
      motivo,
    };

    const correlationId = `cancel_${saleId}_${Date.now()}`;
    const result = await this.phpService.post('/cancelar', payload, correlationId);

    if (result.status === 'cancelada') {
      await tenantPrisma.sale.update({
        where: { id: saleId },
        data: {
          nfceStatus: 'cancelada',
        },
      });
      await tenantPrisma.fiscalEvent.create({
        data: {
          type: 'NFE_CANCELLED',
          description: `NFC-e ${sale.nfceChave} cancelada com protocolo ${result.protocolo}`,
          performedByUserId: userId,
          correlationId,
        }
      });
      return { status: 'success', data: result };
    }

    throw new BadGatewayException(`Falha ao cancelar NFC-e: ${result.mensagem}`);
  }

  async consultarStatus(saleId: string, userId: string) {
    const context = this.tenantContext.get();
    const tenantPrisma = await this.tenantManager.getTenantClient(context.tenantId, context.databaseUrl);
    const config = await this.getTenantConfig();

    const sale = await tenantPrisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (!sale.nfceChave) throw new BadRequestException('Venda sem chave NFC-e');

    const payload = {
      empresa: config.empresa,
      certPfxBase64: config.certPfxBase64,
      certSenha: config.certSenha,
      chave: sale.nfceChave,
    };

    const correlationId = `status_${saleId}_${Date.now()}`;
    const result = await this.phpService.post('/consultar-status', payload, correlationId);

    await tenantPrisma.fiscalEvent.create({
      data: {
        type: 'STATUS_CHECK',
        description: `Consulta de status para NFC-e ${sale.nfceChave}: ${result.status} - ${result.mensagem}`,
        performedByUserId: userId,
        correlationId,
      }
    });

    // Se a SEFAZ retornar que está cancelada, e no nosso banco não está, podemos sincronizar
    if (result.status === 'cancelada' && sale.nfceStatus !== 'cancelada') {
       await tenantPrisma.sale.update({
         where: { id: saleId },
         data: {
           nfceStatus: 'cancelada',
           status: 'cancelled',
           cancelledAt: new Date(),
           cancelReason: result.mensagem,
         },
       });
    }

    return { status: 'success', data: result };
  }

  async gerarDanfe(saleId: string) {
    const context = this.tenantContext.get();
    const tenantPrisma = await this.tenantManager.getTenantClient(context.tenantId, context.databaseUrl);
    const config = await this.getTenantConfig();

    const sale = await tenantPrisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (!sale.nfceXml) throw new BadRequestException('Venda sem XML da NFC-e');

    const payload = {
      empresa: config.empresa,
      xml: sale.nfceXml,
    };

    const correlationId = `danfe_${saleId}_${Date.now()}`;
    const result = await this.phpService.post('/gerar-danfe', payload, correlationId);

    if (result.status === 'sucesso' && result.pdf) {
      return result.pdf; // Base64
    }

    throw new BadGatewayException(`Falha ao gerar DANFE: ${result.mensagem}`);
  }
}
