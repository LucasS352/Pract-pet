import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';

@Injectable()
export class CustomersService {
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
    return prisma.customer.findMany();
  }

  async findByPhone(phone: string) {
    const prisma = await this.getPrisma();
    return prisma.customer.findUnique({ where: { phone } });
  }

  async create(data: any) {
    const prisma = await this.getPrisma();
    return prisma.customer.create({ data });
  }
}
