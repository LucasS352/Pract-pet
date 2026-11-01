import { Injectable, Logger } from '@nestjs/common';
import { FiscalEventType } from '@prisma/client';

export interface SupplierResult {
  supplierId: string;
  created: boolean;
  name: string;
}

/**
 * SupplierStage — Resolve ou cria automaticamente o Fornecedor a partir dos dados do XML.
 *
 * Lógica:
 * 1. Busca por CNPJ exato na tabela suppliers
 * 2. Se encontrado: retorna o existente (sem modificar)
 * 3. Se não encontrado: cria com dados do XML (todos campos opcionais exceto nome)
 * 4. Emite FiscalEvent SUPPLIER_CREATED se novo
 */
@Injectable()
export class SupplierStage {
  private readonly logger = new Logger(SupplierStage.name);

  async resolve(
    prisma: any,
    fornecedor: {
      cnpj: string;
      nome: string;
      ie?: string;
      logradouro?: string;
      numero?: string;
      bairro?: string;
      municipio?: string;
      uf?: string;
      cep?: string;
    },
    nfeEntradaId: string,
    correlationId: string,
    userId?: string,
  ): Promise<SupplierResult> {
    const cnpjClean = fornecedor.cnpj.replace(/\D/g, '');

    // 1. Buscar fornecedor existente pelo CNPJ
    if (cnpjClean) {
      const existing = await prisma.supplier.findFirst({
        where: { cnpjCpf: cnpjClean },
      });

      if (existing) {
        this.logger.log(`[${correlationId}] Fornecedor encontrado: ${existing.name} (${cnpjClean})`);
        return { supplierId: existing.id, created: false, name: existing.name };
      }
    }

    // 2. Criar novo fornecedor com dados do XML
    const newSupplier = await prisma.supplier.create({
      data: {
        name:       fornecedor.nome || `Fornecedor ${cnpjClean}`,
        cnpjCpf:    cnpjClean || null,
        ie:         fornecedor.ie         || null,
        logradouro: fornecedor.logradouro || null,
        numero:     fornecedor.numero     || null,
        bairro:     fornecedor.bairro     || null,
        municipio:  fornecedor.municipio  || null,
        uf:         fornecedor.uf         || null,
        cep:        fornecedor.cep        || null,
      },
    });

    this.logger.log(`[${correlationId}] Fornecedor CRIADO automaticamente: ${newSupplier.name} (${cnpjClean})`);

    // 3. Registrar evento de auditoria
    await prisma.fiscalEvent.create({
      data: {
        nfeEntradaId,
        type:              FiscalEventType.SUPPLIER_CREATED,
        description:       `Fornecedor "${newSupplier.name}" (CNPJ: ${cnpjClean}) criado automaticamente a partir do XML.`,
        performedByUserId: userId || null,
        correlationId,
      },
    });

    return { supplierId: newSupplier.id, created: true, name: newSupplier.name };
  }
}
