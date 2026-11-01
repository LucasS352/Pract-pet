import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly productsService: ProductsService
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  async createSupplier(data: any) {
    const prisma = await this.getPrisma();
    const { id, createdAt, updatedAt, products, purchaseOrders, ...createData } = data;
    return prisma.supplier.create({
      data: createData,
    });
  }

  async getSuppliers() {
    const prisma = await this.getPrisma();
    return prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        products: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async getSupplierById(supplierId: string) {
    const prisma = await this.getPrisma();
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        products: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!supplier) throw new NotFoundException('Fornecedor não encontrado.');
    return supplier;
  }

  async updateSupplier(supplierId: string, data: any) {
    const prisma = await this.getPrisma();
    const { id, createdAt, updatedAt, products, purchaseOrders, ...updateData } = data;
    return prisma.supplier.update({
      where: { id: supplierId },
      data: updateData,
    });
  }

  async deleteSupplier(supplierId: string) {
    const prisma = await this.getPrisma();
    try {
      return await prisma.supplier.delete({
        where: { id: supplierId },
      });
    } catch (error: any) {
      if (error.code === 'P2003') {
        throw new BadRequestException('Não é possível excluir o fornecedor pois ele possui histórico de produtos ou pedidos vinculados.');
      }
      throw error;
    }
  }

  // --- Supplier Products ---

  async addSupplierProduct(supplierId: string, productId: string, expectedCost?: number) {
    const prisma = await this.getPrisma();
    const result = await prisma.supplierProduct.upsert({
      where: {
        supplierId_productId: {
          supplierId,
          productId,
        },
      },
      create: {
        supplierId,
        productId,
        expectedCost: expectedCost ? expectedCost : null,
      },
      update: {
        expectedCost: expectedCost ? expectedCost : null,
      },
    });
    this.productsService.clearCache();
    return result;
  }

  async removeSupplierProduct(supplierId: string, productId: string) {
    const prisma = await this.getPrisma();
    const result = await prisma.supplierProduct.delete({
      where: {
        supplierId_productId: {
          supplierId,
          productId,
        },
      },
    });
    this.productsService.clearCache();
    return result;
  }
}
