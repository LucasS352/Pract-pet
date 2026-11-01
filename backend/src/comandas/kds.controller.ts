import { Body, Controller, Get, Patch, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KdsService } from './kds.service';

@Controller('v1/kds')
@UseGuards(JwtAuthGuard)
export class KdsController {
  constructor(private readonly kds: KdsService) {}
  @Get('config') config(@Request() req: any) {
    return this.kds.config(req.user.station);
  }
  @Get('tickets') tickets(@Request() req: any) {
    return this.kds.tickets(req.user.station);
  }
  @Patch('status') update(@Body() body: { itemIds: string[]; status: string }, @Request() req: any) {
    return this.kds.update(body.itemIds, body.status, req.user.station);
  }
}
