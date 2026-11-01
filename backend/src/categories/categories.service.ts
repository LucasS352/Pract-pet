import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';

@Injectable()
export class CategoriesService {
  constructor(
    private tenantManager: TenantConnectionManager,
    private tenantContext: TenantContextService
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  async findAll() {
    const prisma = await this.getPrisma();
    return prisma.category.findMany({
      include: { grupoTributacao: true }
    });
  }

  async create(data: any) {
    const prisma = await this.getPrisma();
    return prisma.category.create({
      data: {
        name: data.name,
        grupoTributacaoId: data.grupoTributacaoId || null
      }
    });
  }

  async update(id: string, data: any) {
    const prisma = await this.getPrisma();
    return prisma.category.update({
      where: { id },
      data: {
        name: data.name,
        grupoTributacaoId: data.grupoTributacaoId !== undefined ? (data.grupoTributacaoId || null) : undefined
      }
    });
  }

  async remove(id: string) {
    const prisma = await this.getPrisma();
    // Check if category has products
    const products = await prisma.product.findFirst({ where: { categoryId: id } });
    if (products) {
      throw new Error('Não é possível excluir uma categoria que possui produtos vinculados.');
    }
    return prisma.category.delete({ where: { id } });
  }
}
