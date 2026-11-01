import { Injectable, ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { allowedStations, isolatedModules, operatorAllowed, parseModules, stationRouteAllowed } from './access-policy';
import { pinVersion } from './operator-session';

@Injectable()
export class StationAccessService {
  constructor(private readonly heart: HeartPrismaService, private readonly jwt: JwtService,
    private readonly manager: TenantConnectionManager) {}

  signWaiterSession(tenantId: string, operator: { id: string; pin: string }) {
    return this.jwt.sign({ type: 'op', opId: operator.id, tenantId, context: 'waiter',
      pinVersion: pinVersion(operator.pin, process.env.JWT_SECRET!), persistent: true });
  }

  async validateWaiterSession(payload: any, tenantId: string) {
    if (payload.type !== 'op' || payload.tenantId !== tenantId || payload.context !== 'waiter') throw new ForbiddenException('Identificação do garçom inválida.');
    const operator = await this.assertOperator(tenantId, payload.opId, 'waiter');
    if (!payload.pinVersion || payload.pinVersion !== pinVersion(operator.pin || '', process.env.JWT_SECRET!)) {
      throw new UnauthorizedException({ message: 'PIN alterado pelo administrador. Entre com o novo PIN.', errorSource: 'operator_token' });
    }
    return operator;
  }

  async config(tenantId: string) {
    const tenant = await this.heart.tenant.findUnique({ where: { id: tenantId }, select: { modulos: true } });
    const modules = parseModules(tenant?.modulos);
    return { isolated: isolatedModules(modules), waiter: modules.restaurante === true, stations: allowedStations(modules) };
  }

  private admin(user: any) {
    if (user.type || !['admin', 'superadmin'].includes(user.role)) throw new ForbiddenException('Apenas administradores podem gerenciar links.');
  }

  async list(user: any) {
    this.admin(user);
    const config = await this.config(user.tenantId);
    if (!config.stations.length) return [];
    return this.heart.stationAccessLink.findMany({ where: { tenantId: user.tenantId, active: true },
      select: { id: true, station: true, createdAt: true } });
  }

  async create(user: any, station: string) {
    this.admin(user);
    if (!(await this.config(user.tenantId)).stations.includes(station)) throw new ForbiddenException('Módulo desta estação não está ativo.');
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const link = await this.heart.stationAccessLink.create({ data: { tenantId: user.tenantId, station, tokenHash } });
    return { id: link.id, station, token };
  }

  async revoke(user: any, id: string) {
    this.admin(user);
    await this.heart.stationAccessLink.updateMany({ where: { id, tenantId: user.tenantId }, data: { active: false } });
    return { success: true };
  }

  async validateLink(id: string, tenantId?: string) {
    const link = await this.heart.stationAccessLink.findUnique({ where: { id }, include: { tenant: true } });
    if (!link?.active || (tenantId && link.tenantId !== tenantId) || link.tenant.status !== 'active') throw new UnauthorizedException('Link revogado ou loja indisponível.');
    if (!allowedStations(parseModules(link.tenant.modulos)).includes(link.station)) throw new ForbiddenException('Módulo desativado para esta estação.');
    return link;
  }

  async exchange(token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new BadRequestException('Link inválido.');
    const found = await this.heart.stationAccessLink.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } });
    if (!found) throw new UnauthorizedException('Link inválido.');
    const link = await this.validateLink(found.id);
    const user = { id: link.id, name: link.station, role: 'station', tenant: link.tenant.name, station: link.station, termsAccepted: true };
    return { access_token: this.jwt.sign({ sub: link.id, tenantId: link.tenantId, role: 'station', type: 'station-session', linkId: link.id, station: link.station }), user };
  }

  async assertOperator(tenantId: string, operatorId: string, context: string) {
    const config = await this.config(tenantId);
    if (context === 'waiter' && !config.waiter) throw new ForbiddenException('Modo Garçom não está ativo.');
    const tenant = await this.heart.tenant.findUnique({ where: { id: tenantId }, select: { databaseUrl: true } });
    if (!tenant) throw new UnauthorizedException();
    const prisma = await this.manager.getTenantClient(tenantId, tenant.databaseUrl);
    const op = await prisma.operator.findUnique({ where: { id: operatorId || '' } });
    if (!op || !operatorAllowed(op, context, config.isolated)) throw new ForbiddenException('Colaborador não autorizado neste módulo.');
    return op;
  }

  async authorizeRequest(req: any) {
    const user = req.user;
    const path = (req.originalUrl || req.url).split('?')[0].replace(/^\/api(?=\/)/, '').replace(/\/$/, '') || '/';
    if (user.type === 'station-session') {
      if (!stationRouteAllowed(user.station, req.method, path)) throw new ForbiddenException('Acesso restrito ao módulo deste dispositivo.');
      if (user.station !== 'WAITER') return;
      if (['/auth/access/config', '/auth/operator-login', '/operators', '/v1/kds/config'].includes(path)) return;
      const token = req.headers['x-operator-token'];
      let payload: any;
      try { payload = this.jwt.verify(token); } catch { throw new UnauthorizedException({ message: 'Informe o PIN do garçom.', errorSource: 'operator_token' }); }
      const operator = await this.validateWaiterSession(payload, user.tenantId);
      // A identidade da sessão do garçom é anexada pelo servidor; o cliente não
      // pode escolher quem solicitou uma operação sensível.
      req.comandaActor = { operatorId: operator.id, name: operator.name };
      if (req.method === 'POST' && path === '/v1/comandas') req.body.responsibleWaiterId = req.body.waiterId = payload.opId;
      if (req.method === 'POST' && /^\/v1\/comandas\/[^/]+\/items$/.test(path) && Array.isArray(req.body?.items)) {
        req.body.items.forEach((item: any) => { item.createdById = payload.opId; });
      }
      if (path === '/v1/kds/status' && req.body?.status !== 'DELIVERED') throw new ForbiddenException('Garçom pode apenas confirmar entregas.');
      return;
    }
    // Apply the new cashier policy only to establishments using operational modules.
    if (req.method === 'POST' && ['/cash-registers/open', '/sales/checkout'].includes(path)) {
      if ((await this.config(user.tenantId)).isolated) {
        let cashier: any;
        try { cashier = this.jwt.verify(req.headers['x-operator-token']); }
        catch { throw new UnauthorizedException({ message: 'Entre com o PIN do caixa.', errorSource: 'operator_token' }); }
        if (cashier.type !== 'op' || cashier.tenantId !== user.tenantId || cashier.context === 'waiter') throw new ForbiddenException('Credencial de caixa inválida.');
        if (req.body?.operatorId && req.body.operatorId !== cashier.opId) throw new ForbiddenException('Operador diferente da sessão autenticada.');
        await this.assertOperator(user.tenantId, cashier.opId, 'cashier');
        req.body.operatorId = cashier.opId;
      }
    }
    if (req.headers['x-operator-token']) {
      let op: any;
      try { op = this.jwt.verify(req.headers['x-operator-token']); } catch { return; }
      if (op.context === 'waiter' && path !== '/auth/operator-login') {
        await this.validateWaiterSession(op, user.tenantId);
        if (!stationRouteAllowed('WAITER', req.method, path)) throw new ForbiddenException('Sessão de garçom não permite acesso ao caixa ou administração.');
      }
    }
  }
}
