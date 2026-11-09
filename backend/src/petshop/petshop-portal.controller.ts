import { Body, Controller, Get, Headers, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { PetshopPortalService } from './petshop-portal.service';

@Controller('petshop/public')
export class PetshopPortalController {
  constructor(private readonly portal: PetshopPortalService) {}

  private token(header?: string) {
    const token = String(header || '').trim();
    if (!token) throw new UnauthorizedException('Token do portal não informado.');
    return token;
  }

  @Get(':shopId') getPortal(@Param('shopId') shopId: string, @Headers('x-pet-portal-token') header?: string) {
    return this.portal.getPortal(shopId, this.token(header));
  }

  @Post(':shopId/appointments') requestAppointment(@Param('shopId') shopId: string, @Headers('x-pet-portal-token') header: string | undefined, @Body() body: any) {
    return this.portal.requestAppointment(shopId, this.token(header), body);
  }

  @Patch(':shopId/appointments/:id/cancel') cancelAppointment(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @Headers('x-pet-portal-token') header: string | undefined,
    @Body() body: any,
  ) {
    return this.portal.cancelAppointment(shopId, this.token(header), id, body?.reason);
  }

  @Patch(':shopId/appointments/:id/reschedule') rescheduleAppointment(
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @Headers('x-pet-portal-token') header: string | undefined,
    @Body() body: any,
  ) {
    return this.portal.rescheduleAppointment(shopId, this.token(header), id, body);
  }
}
