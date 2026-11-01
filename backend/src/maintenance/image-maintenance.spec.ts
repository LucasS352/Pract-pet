import { ImageMaintenanceGuard, ImageMaintenanceController } from './image-maintenance.controller';
import { authorizeImageRun, ImageJob, selectImageCandidates } from './image-maintenance.service';
import { PRODUCT_IMAGE_POLICY } from '../images/product-image.optimizer';
import { sha256 } from './product-image-package';
import { Test } from '@nestjs/testing';
import { ImageMaintenanceService } from './image-maintenance.service';
import request from 'supertest';

const tid = '11111111-1111-4111-8111-111111111111', oldId = '22222222-2222-4222-8222-222222222222';
const newId = '33333333-3333-4333-8333-333333333333', pid = '44444444-4444-4444-8444-444444444444';
function job(): ImageJob {
  const j: any = { prepared: true, databaseName: 'test_shop', simulations: {}, package: {
    version: 1, policy: PRODUCT_IMAGE_POLICY, tenantId: tid, databaseName: 'test_shop', createdAt: new Date().toISOString(),
    assets: [{ oldId, newId, oldHash: sha256('old'), newHash: sha256('new'), oldBytes: 500000, bytes: 2000, width: 800, height: 600 }],
    entries: [{ productId: pid, oldUrl: '/api/products/uploads/images/' + oldId, assetId: newId }],
  } };
  j.packageHash = sha256(JSON.stringify(j.package)); return j;
}
describe('Sys-Init image execution approvals', () => {
  it('selects every eligible image beyond 500, not just a sample; preserves small/oversized images', () => {
    const groups = Array.from({ length: 601 }, (_, n) => ({ oldId: String(n), bytes: 400000 + n, products: [] }));
    groups.push({ oldId: 'small', bytes: 10000, products: [] }, { oldId: 'huge', bytes: 9 * 1024 ** 2, products: [] });
    expect(selectImageCandidates(groups, 'all')).toHaveLength(601);
    expect(selectImageCandidates(groups, 'all')[0].oldId).toBe('600');
    expect(selectImageCandidates(groups, 10)).toHaveLength(10);
  });
  it('accepts a simple explicit confirmation without a fictitious backup, but still checks simulation and scope', () => {
    const j = job(); const approval = { confirmed: true, packageHash: j.packageHash, confirmDatabase: j.databaseName };
    expect(() => authorizeImageRun(j, 'apply', approval)).toThrow();
    j.simulations.apply = j.packageHash;
    expect(() => authorizeImageRun(j, 'apply', approval)).not.toThrow();
    expect(() => authorizeImageRun(j, 'apply', { ...approval, confirmed: false })).toThrow();
    expect(() => authorizeImageRun(j, 'apply', { ...approval, confirmDatabase: 'another_shop' })).toThrow();
  });
  it('permits simulation without execution authorization, but never unsealed preparation', () => {
    const j = job(); expect(() => authorizeImageRun(j, 'simulate_apply', {})).not.toThrow();
    j.prepared = false; expect(() => authorizeImageRun(j, 'simulate_apply', {})).toThrow('NOT_READY');
  });
  it('requires completed directional simulation, exact database/hash, review and backup', () => {
    const j = job(); const approval = { packageHash: j.packageHash, confirmDatabase: j.databaseName, reviewed: true, backupReference: 'verified-heart-and-shop' };
    expect(() => authorizeImageRun(j, 'apply', approval)).toThrow('REQUIRED');
    j.simulations.apply = j.packageHash;
    expect(() => authorizeImageRun(j, 'apply', approval)).not.toThrow();
    expect(() => authorizeImageRun(j, 'rollback', approval)).toThrow('REQUIRED');
    for (const changed of [{ packageHash: 'wrong' }, { confirmDatabase: 'another_shop' }, { reviewed: false }, { backupReference: '' }]) {
      expect(() => authorizeImageRun(j, 'apply', { ...approval, ...changed })).toThrow('REQUIRED');
    }
  });
  it('rejects a modified package even if the client resubmits the old approval', () => {
    const j = job(); j.package.assets[0].width = 799;
    expect(() => authorizeImageRun(j, 'simulate_apply', {})).toThrow('CHECKSUM');
  });
});

describe('Sys-Init authentication and routes', () => {
  const setup = process.env.SETUP_PIN, sql = process.env.SQL_PIN;
  afterEach(() => {
    if (setup === undefined) delete process.env.SETUP_PIN; else process.env.SETUP_PIN = setup;
    if (sql === undefined) delete process.env.SQL_PIN; else process.env.SQL_PIN = sql;
  });
  const context = (headers: any, query = {}): any => ({ switchToHttp: () => ({ getRequest: () => ({ headers, query, ip: 'test' }), getResponse: () => ({ setHeader: jest.fn() }) }) });
  it('does not accept query PIN, missing configured secrets or an ordinary user token', () => {
    delete process.env.SETUP_PIN; delete process.env.SQL_PIN;
    const guard = new ImageMaintenanceGuard();
    expect(() => guard.canActivate(context({ 'x-setup-pin': 'teltech352' }))).toThrow();
    process.env.SETUP_PIN = 'only-test-pin';
    expect(() => guard.canActivate(context({}, { pin: 'only-test-pin' }))).toThrow();
    expect(() => guard.canActivate(context({ Authorization: 'Bearer normal-shop-token' }))).toThrow();
    expect(guard.canActivate(context({ 'x-setup-pin': 'only-test-pin' }))).toBe(true);
  });
  it('rate limits repeated incorrect credentials', () => {
    process.env.SETUP_PIN = 'test'; const guard = new ImageMaintenanceGuard();
    for (let n = 0; n < 10; n++) expect(() => guard.canActivate(context({}))).toThrow();
    try { guard.canActivate(context({})); throw Error('should reject'); } catch (e: any) { expect(e.getStatus()).toBe(429); }
  });
  it('protects real Nest routes, passes exact scope and conceals SQL errors', async () => {
    process.env.SETUP_PIN = 'only-test-pin';
    const service = { list: jest.fn().mockReturnValue([]), step: jest.fn().mockRejectedValue(Error('SQL containing secret password')) };
    const module = await Test.createTestingModule({ controllers: [ImageMaintenanceController], providers: [ImageMaintenanceGuard, { provide: ImageMaintenanceService, useValue: service }] }).compile();
    const app = module.createNestApplication(); await app.init();
    try {
      const route = `/tenants/setup/${tid}/image-optimization/jobs`;
      await request(app.getHttpServer()).get(route).expect(401); expect(service.list).not.toHaveBeenCalled();
      await request(app.getHttpServer()).get(route).set('x-setup-pin', 'only-test-pin').expect(200, []);
      expect(service.list).toHaveBeenCalledWith(tid);
      const response = await request(app.getHttpServer()).post(route + `/${pid}/step`).set('x-setup-pin', 'only-test-pin').send({ cursor: 0, runId: newId }).expect(503);
      expect(response.text).not.toContain('password'); expect(response.body.code).toBe('MAINTENANCE_FAILED');
    } finally { await app.close(); }
  });
});
