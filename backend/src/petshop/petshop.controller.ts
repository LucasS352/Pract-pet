import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImageUploadAdmissionInterceptor } from '../images/image-upload.interceptor';
import { IMAGE_INPUT_BYTES } from '../images/product-image.optimizer';
import { PetshopAccessGuard } from './petshop-access.guard';
import { PetshopService } from './petshop.service';
import { PetshopPackagesService } from './petshop-packages.service';
import { PetshopWhatsappService } from './petshop-whatsapp.service';
import { PetshopCommissionsService } from './petshop-commissions.service';

@Controller('petshop')
@UseGuards(JwtAuthGuard, PetshopAccessGuard)
export class PetshopController {
  constructor(
    private readonly petshop: PetshopService,
    private readonly packages: PetshopPackagesService,
    private readonly whatsapp: PetshopWhatsappService,
    private readonly commissions: PetshopCommissionsService,
  ) {}

  @Get('overview') overview() { return this.petshop.overview(); }
  @Get('metrics') getMetrics(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) { return this.petshop.getMetrics(period, from, to); }

  @Post('uploads/photo')
  @UseInterceptors(ImageUploadAdmissionInterceptor, FileInterceptor('file', {
    limits: { fileSize: IMAGE_INPUT_BYTES, files: 1, fields: 0 },
  }))
  uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    return this.petshop.uploadPhoto(file);
  }

  @Get('reception/tutors') findReceptionTutor(@Query('phone') phone: string) { return this.petshop.findReceptionTutor(phone); }
  @Post('reception/registrations') registerReception(@Body() body: any) { return this.petshop.registerReception(body); }

  @Get('tutors') listTutors(@Query('search') search?: string) { return this.petshop.listTutors(search); }
  @Get('tutors/booking-search') searchTutorsForBooking(@Query('search') search?: string) { return this.petshop.searchTutorsForBooking(search); }
  @Post('tutors') createTutor(@Body() body: any) { return this.petshop.createTutor(body); }
  @Patch('tutors/:id') updateTutor(@Param('id') id: string, @Body() body: any) { return this.petshop.updateTutor(id, body); }
  @Post('tutors/:id/portal-link') createPortalLink(@Param('id') id: string, @Body() body?: any) { return this.petshop.createPortalLink(id, Boolean(body?.rotate)); }

  @Get('pets') listPets(@Query('search') search?: string, @Query('customerId') customerId?: string) { return this.petshop.listPets(search, customerId); }
  @Get('pets/:id') getPet(@Param('id') id: string) { return this.petshop.getPet(id); }
  @Post('pets') createPet(@Body() body: any) { return this.petshop.createPet(body); }
  @Patch('pets/:id') updatePet(@Param('id') id: string, @Body() body: any) { return this.petshop.updatePet(id, body); }

  @Post('pets/:petId/vaccinations') addVaccination(@Param('petId') petId: string, @Body() body: any) { return this.petshop.addVaccination(petId, body); }
  @Patch('vaccinations/:id') updateVaccination(@Param('id') id: string, @Body() body: any) { return this.petshop.updateVaccination(id, body); }
  @Delete('vaccinations/:id') removeVaccination(@Param('id') id: string) { return this.petshop.removeVaccination(id); }

  @Get('services') listServices(@Query('includeInactive') includeInactive?: string) { return this.petshop.listServices(includeInactive === 'true'); }
  @Get('stages') getStages() { return this.petshop.getTenantStages(); }
  @Put('stages') updateStages(@Body() body: any, @Req() req: any) { return this.petshop.updateTenantStages(body, req); }
  @Get('services/:id') getService(@Param('id') id: string) { return this.petshop.getService(id); }
  @Get('services/:id/calculate-price') calculateServicePrice(@Param('id') id: string, @Query() query: any) { return this.petshop.calculateServicePrice(id, query); }
  @Post('services') createService(@Body() body: any) { return this.petshop.createService(body); }
  @Patch('services/:id') updateService(@Param('id') id: string, @Body() body: any) { return this.petshop.updateService(id, body); }
  @Delete('services/:id') removeService(@Param('id') id: string) { return this.petshop.removeService(id); }

  @Get('pending-reservations') pendingReservations() { return this.petshop.pendingReservations(); }
  @Post('appointments/:id/receive') receivePayment(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.petshop.receivePayment(id, body, req); }
  @Get('appointments') listAppointments(@Query('from') from?: string, @Query('to') to?: string) { return this.petshop.listAppointments(from, to); }
  @Get('appointments/overdue-pickups') overduePickups(@Query('before') before?: string) { return this.petshop.listOverduePickups(before); }
  @Post('appointments') createAppointment(@Body() body: any) { return this.petshop.createAppointment(body); }
  @Post('appointments/:id/checkout') prepareCheckout(@Param('id') id: string) { return this.petshop.prepareCheckout(id); }
  @Patch('appointments/:id') updateAppointment(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.petshop.updateAppointment(id, body, req); }
  @Patch('appointments/:id/status') updateAppointmentStatus(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.petshop.updateAppointmentStatus(id, body, req); }
  @Post('appointments/:id/taxi-departure') taxiDeparture(@Param('id') id: string, @Body() body: any) { return this.whatsapp.sendTaxiDogDeparture(id, body?.direction); }

  @Get('commissions/rules') commissionRules(@Req() req: any) { return this.commissions.listRules(req); }
  @Post('commissions/rules') saveCommissionRule(@Req() req: any, @Body() body: any) { return this.commissions.saveRule(req, body); }
  @Get('commissions/report') commissionReport(@Req() req: any, @Query() query: any) { return this.commissions.report(req, query); }
  @Get('commissions/closings') commissionClosings(@Req() req: any) { return this.commissions.closings(req); }
  @Post('commissions/closings/:period/approve') approveCommissions(@Req() req: any, @Param('period') period: string) { return this.commissions.approve(req, period); }
  @Post('commissions/closings/:period/pay') payCommissions(@Req() req: any, @Param('period') period: string, @Body() body: any) { return this.commissions.pay(req, period, body?.reference); }
  @Post('commissions/:id/reverse') reverseCommission(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.commissions.reverse(req, id, body?.reason); }
  @Post('commissions/:id/correct') correctCommission(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.commissions.correct(req, id, body); }

  // ─── Módulo 1: Motor Avançado de Pacotes de Clientes ───────────────────────
  @Get('packages/plans')
  listPackagePlans(@Query('includeInactive') includeInactive?: string) {
    return this.packages.listPlans(includeInactive === 'true');
  }

  @Post('packages/plans')
  createPackagePlan(@Body() body: any) {
    return this.packages.createPlan(body);
  }

  @Patch('packages/plans/:id')
  updatePackagePlan(@Param('id') id: string, @Body() body: any) {
    return this.packages.updatePlan(id, body);
  }

  @Delete('packages/plans/:id')
  removePackagePlan(@Param('id') id: string) {
    return this.packages.removePlan(id);
  }

  @Get('packages/simulate-price')
  simulatePackagePrice(
    @Query('planId') planId: string,
    @Query('petId') petId?: string,
    @Query('species') species?: string,
    @Query('size') size?: string,
    @Query('coatType') coatType?: string,
  ) {
    return this.packages.simulatePrice({ planId, petId, species, size, coatType });
  }

  @Get('packages/financial-overview')
  getPackagesFinancialOverview() {
    return this.packages.getFinancialOverview();
  }

  @Get('packages/contracts')
  listPackageContracts(
    @Query('customerId') customerId?: string,
    @Query('petId') petId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.packages.listContracts({ customerId, petId, status, search });
  }

  @Get('packages/contracts/:id')
  getPackageContract(@Param('id') id: string) {
    return this.packages.getContractById(id);
  }

  @Get('packages/available/:petId')
  getAvailablePackagesForPet(
    @Param('petId') petId: string,
    @Query('date') date?: string,
  ) {
    return this.packages.getAvailablePackagesForPet(petId, date);
  }

  @Post('packages/contracts')
  createPackageContract(@Body() body: any, @Req() req: any) {
    return this.packages.createContract(body, {
      userId: req?.user?.id,
      operatorId: body?.operatorId,
      name: body?.operatorName || req?.user?.name,
    });
  }

  @Post('packages/contracts/:id/confirm-payment')
  confirmPackagePayment(@Param('id') id: string, @Body() body: any) {
    return this.packages.confirmContractPayment(id, body);
  }

  @Post('packages/contracts/:id/refund-session')
  refundPackageSession(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.packages.refundConsumedSession(id, body, {
      userId: req?.user?.id,
      operatorId: body?.operatorId,
      name: body?.operatorName || req?.user?.name,
    });
  }

  @Post('packages/contracts/:id/cancel')
  cancelPackageContract(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.packages.cancelContract(id, body, {
      userId: req?.user?.id,
      operatorId: body?.operatorId,
      name: body?.operatorName || req?.user?.name,
    });
  }

  // ─── Módulo 2: Central WhatsApp & Régua de Disparos ────────────────────────
  @Get('whatsapp/status')
  getWhatsappStatus() {
    return this.whatsapp.getSessionStatus();
  }

  @Post('whatsapp/connect')
  connectWhatsapp(@Body() body?: any) {
    return this.whatsapp.connectSession(Boolean(body?.forceReset));
  }

  @Post('whatsapp/disconnect')
  disconnectWhatsapp() {
    return this.whatsapp.disconnectSession(true);
  }

  @Post('whatsapp/test')
  sendTestWhatsapp(@Body() body: any) {
    return this.whatsapp.sendTestMessage(body);
  }

  @Get('whatsapp/rules')
  listWhatsappRules() {
    return this.whatsapp.listRules();
  }

  @Post('whatsapp/rules')
  createWhatsappRule(@Body() body: any) {
    return this.whatsapp.createRule(body);
  }

  @Patch('whatsapp/rules/:id')
  updateWhatsappRule(@Param('id') id: string, @Body() body: any) {
    return this.whatsapp.updateRule(id, body);
  }

  @Delete('whatsapp/rules/:id')
  deleteWhatsappRule(@Param('id') id: string) {
    return this.whatsapp.deleteRule(id);
  }

  @Get('whatsapp/jobs')
  listWhatsappJobs(
    @Query('status') status?: string,
    @Query('triggerType') triggerType?: string,
    @Query('search') search?: string,
  ) {
    return this.whatsapp.listJobs({ status, triggerType, search });
  }

  @Post('whatsapp/jobs/:id/retry')
  retryWhatsappJob(@Param('id') id: string) {
    return this.whatsapp.retryJob(id);
  }
}
