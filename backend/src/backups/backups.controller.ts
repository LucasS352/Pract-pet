import { Controller, Get, Post, Param, Delete, Res, BadRequestException, Request, UnauthorizedException, Body } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { TenantsService } from '../tenants/tenants.service';
import { Response } from 'express';

@Controller('sys-init/backups')
export class BackupsController {
  constructor(
    private readonly backupsService: BackupsService,
    private readonly tenantsService: TenantsService
  ) {}

  private async validateSetupPin(req: any) {
    const pin = (req.headers['x-setup-pin'] || req.query['pin']) as string;
    if (!pin) throw new UnauthorizedException('PIN inválido.');
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
  }

  @Get()
  async listBackups(@Request() req: any) {
    await this.validateSetupPin(req);
    return this.backupsService.listBackups();
  }

  @Get('schedule')
  async getSchedule(@Request() req: any) {
    await this.validateSetupPin(req);
    return this.backupsService.getSchedule();
  }

  @Post('schedule')
  async setSchedule(@Request() req: any, @Body() body: { enabled: boolean; time: string }) {
    await this.validateSetupPin(req);
    return this.backupsService.setSchedule(body);
  }

  @Get('download-all')
  async downloadAll(@Request() req: any, @Res() res: Response) {
    await this.validateSetupPin(req);
    return this.backupsService.downloadAll(res);
  }

  @Post('create')
  async createBackup(@Request() req: any, @Body() body: { type: 'heart' | 'tenant' | 'all', tenantId?: string }) {
    await this.validateSetupPin(req);
    if (!body.type) throw new BadRequestException('Tipo de backup não informado.');
    return this.backupsService.createBackup(body.type, body.tenantId);
  }

  @Post('restore/:folder/:filename')
  async restoreBackup(@Request() req: any, @Param('folder') folder: string, @Param('filename') filename: string) {
    await this.validateSetupPin(req);
    return this.backupsService.restoreBackup(folder, filename);
  }

  @Delete(':folder/:filename')
  async deleteBackup(@Request() req: any, @Param('folder') folder: string, @Param('filename') filename: string) {
    await this.validateSetupPin(req);
    return this.backupsService.deleteBackup(folder, filename);
  }

  @Get('download/:folder/:filename')
  async downloadBackup(@Request() req: any, @Param('folder') folder: string, @Param('filename') filename: string, @Res() res: Response) {
    await this.validateSetupPin(req);
    const filepath = this.backupsService.getBackupFilePath(folder, filename);
    res.download(filepath);
  }
}
