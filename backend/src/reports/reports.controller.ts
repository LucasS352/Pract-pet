import { Controller, ForbiddenException, Get, Header, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @Header('Cache-Control', 'private, no-store')
  sales(@CurrentUser() user: { role?: string },
    @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    if (!['admin', 'superadmin'].includes(user.role ?? '')) {
      throw new ForbiddenException('Relatórios disponíveis apenas para administradores.');
    }
    return this.reports.sales(startDate, endDate);
  }
}
