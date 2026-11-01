import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { allowedStations, isolatedModules, operatorAllowed, stationRouteAllowed } from './access-policy';
import { StationAccessService } from './station-access.service';

describe('Isolamento operacional opt-in', () => {
  it('preserva caixa legado sem módulos e restringe quando ativados', () => {
    expect(isolatedModules({ estoque: true, comandas: true })).toBe(false);
    expect(operatorAllowed({ active: true }, 'cashier', false)).toBe(true);
    expect(operatorAllowed({ active: true }, 'cashier', true)).toBe(false);
    for (const module of ['restaurante', 'kds', 'carvoaria']) expect(isolatedModules({ [module]: true })).toBe(true);
    for (const jobTitle of ['Caixa', 'Gerente', 'Admin']) expect(operatorAllowed({ jobTitle }, 'cashier', true)).toBe(true);
    expect(operatorAllowed({ isManager: true }, 'cashier', true)).toBe(true);
    expect(operatorAllowed({ jobTitle: 'Garçom' }, 'cashier', true)).toBe(false);
  });
  it('lista apenas garçons ativos, mesmo quando outros cargos têm flag de gerente', () => {
    for (const jobTitle of ['Garçom', 'GARCOM', ' garçom ']) expect(operatorAllowed({ jobTitle }, 'waiter', true)).toBe(true);
    for (const jobTitle of ['Caixa', 'Gerente', 'Atendente', 'Vizinho', 'Motoqueiro', '']) expect(operatorAllowed({ jobTitle, isManager: true }, 'waiter', true)).toBe(false);
    expect(operatorAllowed({ jobTitle: 'Garçom', active: false }, 'waiter', true)).toBe(false);
  });
  it('ativa Garçom e Carvoaria independentemente da cozinha', () => {
    expect(allowedStations({ restaurante: true })).toEqual(['WAITER']);
    expect(allowedStations({ carvoaria: true })).toEqual(['CARVOARIA']);
    expect(allowedStations({})).toEqual([]);
  });
  it('nega finanças, fechamento, usuários e alterações de produtos a todos os links', () => {
    for (const station of ['WAITER', 'KITCHEN', 'BAR_1', 'CARVOARIA']) {
      for (const path of ['/sales', '/cash-registers/open', '/dashboard', '/operators/x', '/tenants/me', '/auth/access/links', '/v1/comandas/123/close']) {
        for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) expect(stationRouteAllowed(station, method, path)).toBe(false);
      }
      expect(stationRouteAllowed(station, 'PATCH', '/products/123')).toBe(false);
    }
    expect(stationRouteAllowed('WAITER', 'POST', '/v1/comandas/x/items')).toBe(true);
    expect(stationRouteAllowed('WAITER', 'GET', '/products/combo/composition')).toBe(true);
    expect(stationRouteAllowed('WAITER', 'POST', '/products/combo/composition')).toBe(false);
    expect(stationRouteAllowed('WAITER', 'GET', '/products/settings')).toBe(false);
    expect(stationRouteAllowed('KITCHEN', 'GET', '/products/combo/composition')).toBe(false);
    expect(stationRouteAllowed('KITCHEN', 'POST', '/v1/comandas/x/items')).toBe(false);
  });
});

describe('Links de estação e credenciais', () => {
  const previousSecret = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = 'test-only-station-access-secret'; });
  afterAll(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  const user = { tenantId: 'tenant-a', role: 'admin' };
  function setup(modulos: any = { kds: true, restaurante: true }) {
    const tenant = { id: 'tenant-a', name: 'Loja A', status: 'active', modulos, databaseUrl: 'db-a' };
    const link = { id: 'link-a', tenantId: tenant.id, station: 'KITCHEN', active: true, tenant };
    const heart = {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      stationAccessLink: { findUnique: jest.fn().mockResolvedValue(link), create: jest.fn().mockResolvedValue(link), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    const op = { id: 'op-a', jobTitle: 'Garçom', active: true, pin: 'test-bcrypt-hash' };
    const manager = { getTenantClient: jest.fn().mockResolvedValue({ operator: { findUnique: jest.fn().mockResolvedValue(op) } }) };
    const jwt = new JwtService({ secret: 'test-only-station-access-secret' });
    return { service: new StationAccessService(heart as any, jwt, manager as any), heart, link, tenant, jwt, op };
  }
  it('gera entropia e persiste somente hash; token emitido é restrito', async () => {
    const { service, heart, jwt } = setup();
    const result = await service.create(user, 'KITCHEN');
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(heart.stationAccessLink.create.mock.calls[0][0].data.tokenHash).toBe(createHash('sha256').update(result.token).digest('hex'));
    expect(heart.stationAccessLink.create.mock.calls[0][0].data.token).toBeUndefined();
    const session = await service.exchange(result.token);
    expect(jwt.verify(session.access_token)).toMatchObject({ type: 'station-session', tenantId: 'tenant-a', station: 'KITCHEN', role: 'station' });
  });
  it('nega link revogado, tenant diferente, loja suspensa e módulo desligado', async () => {
    const { service, link, tenant } = setup();
    await expect(service.validateLink(link.id, 'tenant-b')).rejects.toThrow();
    link.active = false;
    await expect(service.validateLink(link.id)).rejects.toThrow();
    link.active = true; tenant.status = 'suspended';
    await expect(service.validateLink(link.id)).rejects.toThrow();
    tenant.status = 'active'; tenant.modulos = {};
    await expect(service.validateLink(link.id)).rejects.toThrow();
  });
  it('somente administrador gera/revoga links e revogação é limitada ao tenant', async () => {
    const { service, heart } = setup();
    await expect(service.create({ ...user, role: 'station' }, 'KITCHEN')).rejects.toThrow();
    await expect(service.create(user, 'CARVOARIA')).rejects.toThrow();
    await service.revoke(user, 'link-a');
    expect(heart.stationAccessLink.updateMany).toHaveBeenCalledWith({ where: { id: 'link-a', tenantId: 'tenant-a' }, data: { active: false } });
  });
  it('adega não consulta a tabela nova de links quando módulos estão desligados', async () => {
    const { service, heart } = setup({});
    expect(await service.list(user)).toEqual([]);
    expect(heart.stationAccessLink.findMany).not.toHaveBeenCalled();
  });
  it('estação bloqueia APIs administrativas e exige PIN no garçom', async () => {
    const { service } = setup();
    const req = { user: { type: 'station-session', station: 'KITCHEN', tenantId: 'tenant-a' }, originalUrl: '/api/sales', method: 'GET', headers: {} };
    await expect(service.authorizeRequest(req)).rejects.toThrow();
    req.user.station = 'WAITER'; req.originalUrl = '/api/v1/comandas';
    await expect(service.authorizeRequest(req)).rejects.toThrow('Informe o PIN');
  });
  it('rejeita PIN token de outro tenant e sobrescreve autoria enviada pelo dispositivo', async () => {
    const { service, jwt, op } = setup();
    const req = { user: { type: 'station-session', station: 'WAITER', tenantId: 'tenant-a' }, originalUrl: '/api/v1/comandas/c1/items', method: 'POST', body: { items: [{ createdById: 'outro' }] }, headers: { 'x-operator-token': jwt.sign({ type: 'op', tenantId: 'tenant-b', context: 'waiter', opId: 'op-a' }) } };
    await expect(service.authorizeRequest(req)).rejects.toThrow();
    req.headers['x-operator-token'] = service.signWaiterSession('tenant-a', op);
    await service.authorizeRequest(req);
    expect(req.body.items[0].createdById).toBe('op-a');
  });
  it('alteração posterior de cargo impede sessão existente de continuar operando', async () => {
    const { service, op } = setup();
    expect(await service.assertOperator('tenant-a', 'op-a', 'waiter')).toBe(op);
    op.jobTitle = 'Caixa';
    await expect(service.assertOperator('tenant-a', 'op-a', 'waiter')).rejects.toThrow();
  });
  it('sessão não expira por tempo e trocar o PIN revoga a credencial anterior', async () => {
    const { service, jwt, op } = setup();
    const token = service.signWaiterSession('tenant-a', op);
    const payload = jwt.verify(token, { clockTimestamp: Math.floor(Date.now() / 1000) + 365 * 86400 });
    expect(payload.exp).toBeUndefined();
    await expect(service.validateWaiterSession(payload, 'tenant-a')).resolves.toBe(op);
    op.pin = 'new-bcrypt-hash';
    await expect(service.validateWaiterSession(payload, 'tenant-a')).rejects.toThrow('PIN alterado');
    await expect(service.validateWaiterSession(jwt.verify(service.signWaiterSession('tenant-a', op)), 'tenant-a')).resolves.toBe(op);
  });
  it('abertura e checkout exigem identidade de caixa somente com módulos ativados', async () => {
    const { service, jwt, op, tenant } = setup();
    const req = { user, method: 'POST', originalUrl: '/api/cash-registers/open', body: { operatorId: 'op-a' }, headers: {} as Record<string, string> };
    await expect(service.authorizeRequest(req)).rejects.toThrow('PIN do caixa');
    req.headers['x-operator-token'] = jwt.sign({ type: 'op', tenantId: 'tenant-a', context: 'cashier', opId: 'op-a' });
    await expect(service.authorizeRequest(req)).rejects.toThrow('não autorizado');
    op.jobTitle = 'Caixa';
    await expect(service.authorizeRequest(req)).resolves.toBeUndefined();
    req.originalUrl = '/api/sales/checkout'; req.body.operatorId = 'outro';
    await expect(service.authorizeRequest(req)).rejects.toThrow('Operador diferente');
    tenant.modulos = {}; req.headers = {};
    await expect(service.authorizeRequest(req)).resolves.toBeUndefined();
  });
});
