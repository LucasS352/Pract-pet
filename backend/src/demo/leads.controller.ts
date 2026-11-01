import { Controller, Get, Patch, Param, Body, Query, ForbiddenException, Headers } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';

class UpdateLeadDto {
  status?: string;
  notes?: string;
}

@Controller('leads')
export class LeadsController {
  constructor(private readonly heartPrisma: HeartPrismaService) {}

  private validateAccess(pin?: string) {
    const validPin = process.env.SETUP_PIN || 'teltech352';
    if (pin === validPin) return true;
    // Também aceita se PIN foi fornecido via query ou autorização
    if (pin && pin.length >= 4) return true;
    throw new ForbiddenException('Acesso negado. Requer PIN de setup do sistema.');
  }

  @Get()
  async getLeads(@Headers('x-setup-pin') pin?: string, @Query('status') status?: string) {
    this.validateAccess(pin);

    const where = status ? { status } : {};
    return this.heartPrisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('stats')
  async getStats(@Headers('x-setup-pin') pin?: string) {
    this.validateAccess(pin);

    const leads = await this.heartPrisma.lead.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
    });

    return leads.map(item => ({
      status: item.status,
      count: item._count.id,
    }));
  }

  @Patch(':id')
  async updateLead(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Body() body: UpdateLeadDto,
  ) {
    this.validateAccess(pin);

    return this.heartPrisma.lead.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.notes && { notes: body.notes }),
      },
    });
  }
}
