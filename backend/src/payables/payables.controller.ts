import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { PayablesService } from './payables.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('payables')
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) {}

  @Post()
  createPayable(@Request() req: any, @Body() body: any) {
    return this.payablesService.createPayable(body);
  }

  @Get()
  getPayables(@Request() req: any, @Query('month') month?: string, @Query('year') year?: string) {
    return this.payablesService.getPayables(month, year);
  }

  @Get('dashboard')
  getPayablesDashboard(@Request() req: any, @Query('month') month?: string, @Query('year') year?: string) {
    return this.payablesService.getPayablesDashboard(month, year);
  }

  @Get(':id')
  getPayableById(@Request() req: any, @Param('id') id: string) {
    return this.payablesService.getPayableById(id);
  }

  @Patch(':id')
  updatePayable(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.payablesService.updatePayable(id, body);
  }

  @Delete(':id')
  deletePayable(@Request() req: any, @Param('id') id: string) {
    return this.payablesService.deletePayable(id);
  }

  @Patch(':id/pay')
  payPayable(@Request() req: any, @Param('id') id: string) {
    return this.payablesService.payPayable(id);
  }
}
