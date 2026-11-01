import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private heartPrisma: HeartPrismaService) {}

  async findAll(tenantId: string) {
    return this.heartPrisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async create(tenantId: string, data: any) {
    // Verificar cota de usuários e módulo Pet Shop
    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { modulos: true }
    });
    let isPetshop = true;
    try {
      const mod = typeof tenant?.modulos === 'string' ? JSON.parse(tenant.modulos) : (tenant?.modulos || {});
      isPetshop = mod.petshop !== false;
    } catch {}

    const usersCount = await this.heartPrisma.user.count({
      where: { tenantId }
    });

    const maxUsers = isPetshop ? 50 : 2;

    if (usersCount >= maxUsers) {
      throw new BadRequestException(`Limite atingido: O plano atual permite no máximo ${maxUsers} usuários por loja.`);
    }

    if (data.role === 'admin') {
      const adminCount = await this.heartPrisma.user.count({
        where: { tenantId, role: 'admin' }
      });
      if (adminCount >= 1) {
        throw new BadRequestException('Limite atingido: Já existe 1 Administrador neste sistema.');
      }
    }

    const existingUser = await this.heartPrisma.user.findUnique({
      where: { email: data.email }
    });
    if (existingUser) {
      throw new BadRequestException('Já existe um usuário cadastrado com este e-mail.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.heartPrisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role || 'operator',
        pin: data.pin ? await bcrypt.hash(data.pin, 10) : null,
        tenantId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      }
    });
  }

  async toggleStatus(tenantId: string, id: string) {
    const user = await this.heartPrisma.user.findFirst({
      where: { id, tenantId }
    });

    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (user.role === 'admin') throw new BadRequestException('Não é possível inativar o Administrador principal.');

    return this.heartPrisma.user.update({
      where: { id },
      data: { active: !user.active },
      select: { id: true, active: true }
    });
  }

  async update(tenantId: string, id: string, data: any) {
    const user = await this.heartPrisma.user.findFirst({
      where: { id, tenantId }
    });

    if (!user) throw new NotFoundException('Usuário não encontrado.');

    // 1. Impedir alteração de role de admin para outra coisa
    if (user.role === 'admin' && data.role && data.role !== 'admin') {
      throw new BadRequestException('Não é possível alterar a função do Administrador principal.');
    }

    // 2. Impedir promoção de outro usuário para admin se já houver um admin
    if (data.role === 'admin' && user.role !== 'admin') {
      const adminCount = await this.heartPrisma.user.count({
        where: { tenantId, role: 'admin' }
      });
      if (adminCount >= 1) {
        throw new BadRequestException('Limite atingido: Já existe 1 Administrador neste sistema.');
      }
    }

    // 3. Impedir e-mail duplicado
    if (data.email && data.email !== user.email) {
      const existingUser = await this.heartPrisma.user.findUnique({
        where: { email: data.email }
      });
      if (existingUser) {
        throw new BadRequestException('Já existe um usuário cadastrado com este e-mail.');
      }
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }
    
    if (data.pin) {
      updateData.pin = await bcrypt.hash(data.pin, 10);
    }

    return this.heartPrisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      }
    });
  }

  async remove(tenantId: string, id: string) {
    const user = await this.heartPrisma.user.findFirst({
      where: { id, tenantId }
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (user.role === 'admin') throw new BadRequestException('Não é possível excluir o Administrador principal.');
    return this.heartPrisma.user.delete({
      where: { id }
    });
  }
}
