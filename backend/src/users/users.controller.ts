import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Somente administradores podem gerenciar a equipe.');
    }
    return this.usersService.findAll(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Somente administradores podem gerenciar a equipe.');
    }
    return this.usersService.create(user.tenantId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Somente administradores podem gerenciar a equipe.');
    }
    return this.usersService.update(user.tenantId, id, body);
  }

  @Patch(':id/toggle-status')
  toggleStatus(@CurrentUser() user: any, @Param('id') id: string) {
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Somente administradores podem gerenciar a equipe.');
    }
    return this.usersService.toggleStatus(user.tenantId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Somente administradores podem gerenciar a equipe.');
    }
    return this.usersService.remove(user.tenantId, id);
  }
}
