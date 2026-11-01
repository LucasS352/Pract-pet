import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query, ForbiddenException } from '@nestjs/common';
import { StationAccessService } from '../auth/station-access.service';
import { operatorAllowed } from '../auth/access-policy';
import { OperatorsService } from './operators.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('operators')
export class OperatorsController {
  constructor(private readonly operatorsService: OperatorsService, private readonly access: StationAccessService) {}

  @Post()
  create(@Request() req: any, @Body() body: { name: string; pin: string; isManager?: boolean; jobTitle?: string }) {
    return this.operatorsService.create(req.user.tenantId, body);
  }

  @Get('consumptions')
  getConsumptions(@Request() req: any) {
    return this.operatorsService.getConsumptions(req.user.tenantId);
  }

  @Post('consumptions/manual')
  createManualConsumption(@Request() req: any, @Body() body: { operatorId: string; productId: string; quantity: number }) {
    return this.operatorsService.createManualConsumption(req.user.tenantId, body);
  }

  @Get('consumptions/:operatorId')
  getOperatorConsumptionHistory(@Request() req: any, @Param('operatorId') operatorId: string) {
    return this.operatorsService.getOperatorConsumptionHistory(req.user.tenantId, operatorId);
  }

  @Post('consumptions/:operatorId/settle')
  settleConsumptions(@Request() req: any, @Param('operatorId') operatorId: string, @Body() body?: { itemIds?: string[]; amount?: number }) {
    return this.operatorsService.settleConsumptions(req.user.tenantId, operatorId, body?.itemIds, body?.amount);
  }

  @Delete('consumptions/:id')
  deleteConsumption(@Request() req: any, @Param('id') id: string) {
    return this.operatorsService.deleteConsumption(req.user.tenantId, id);
  }

  @Get()
  async findAll(@Request() req: any, @Query('context') requested?: string) {
    const context = req.user.station === 'WAITER' ? 'waiter' : requested;
    const operators = await this.operatorsService.findAll(req.user.tenantId);
    if (!context) return operators;
    const config = await this.access.config(req.user.tenantId);
    if (context === 'waiter' && !config.waiter) throw new ForbiddenException('Modo Garçom não está ativo.');
    return operators.filter(op => operatorAllowed(op, context, config.isolated));
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.operatorsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() body: { name?: string; pin?: string; active?: boolean; isManager?: boolean; jobTitle?: string }) {
    if (body.pin && !['admin', 'superadmin'].includes(req.user.role)) throw new ForbiddenException('Apenas administradores podem trocar o PIN.');
    return this.operatorsService.update(req.user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.operatorsService.remove(req.user.tenantId, id);
  }
}
