import { Controller, Post, Get, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NfceService } from './nfce.service';

@UseGuards(JwtAuthGuard)
@Controller('nfce')
export class NfceController {
  constructor(private nfceService: NfceService) {}

  /** Verifica se o microsserviço PHP está disponível */
  @Get('health')
  async health() {
    const ok = await this.nfceService.healthCheck();
    return { online: ok, service: process.env.NFCE_SERVICE_URL || 'http://nfce-service:8080' };
  }
}
