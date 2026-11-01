import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/dashboard/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   *
   * Retorna todos os KPIs e dados de analytics em uma única chamada.
   * Se startDate/endDate não fornecidos, usa o dia atual como padrão.
   */
  @Get('summary')
  getSummary(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const today = new Date().toISOString().split('T')[0];
    return this.dashboardService.getSummary(
      user.tenantId,
      startDate || today,
      endDate || today,
    );
  }
}
