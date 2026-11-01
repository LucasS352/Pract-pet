import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImageUploadAdmissionInterceptor } from '../images/image-upload.interceptor';
import { IMAGE_INPUT_BYTES } from '../images/product-image.optimizer';
import { PetshopAccessGuard } from './petshop-access.guard';
import { PetshopService } from './petshop.service';

@Controller('petshop')
@UseGuards(JwtAuthGuard, PetshopAccessGuard)
export class PetshopController {
  constructor(private readonly petshop: PetshopService) {}

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

  @Get('tutors') listTutors(@Query('search') search?: string) { return this.petshop.listTutors(search); }
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
  @Post('services') createService(@Body() body: any) { return this.petshop.createService(body); }
  @Patch('services/:id') updateService(@Param('id') id: string, @Body() body: any) { return this.petshop.updateService(id, body); }
  @Delete('services/:id') removeService(@Param('id') id: string) { return this.petshop.removeService(id); }

  @Get('appointments') listAppointments(@Query('from') from?: string, @Query('to') to?: string) { return this.petshop.listAppointments(from, to); }
  @Post('appointments') createAppointment(@Body() body: any) { return this.petshop.createAppointment(body); }
  @Patch('appointments/:id') updateAppointment(@Param('id') id: string, @Body() body: any) { return this.petshop.updateAppointment(id, body); }
  @Patch('appointments/:id/status') updateAppointmentStatus(@Param('id') id: string, @Body() body: any) { return this.petshop.updateAppointmentStatus(id, body); }
}
