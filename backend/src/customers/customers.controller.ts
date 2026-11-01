import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @Get('phone/:phone')
  findByPhone(@Param('phone') phone: string) {
    return this.customersService.findByPhone(phone);
  }

  @Post()
  create(@Body() body: any) {
    return this.customersService.create(body);
  }
}
