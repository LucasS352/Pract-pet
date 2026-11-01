// Real MySQL service integration. Creates and drops ONLY uniquely named local QA databases.
// Run after backend build: node scripts/group-portal-mysql.cjs
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const mysql = require(path.join(backend, 'node_modules/mysql2/promise'));
const { PrismaClient } = require(path.join(backend, 'node_modules/@prisma/client'));
const { GroupsService } = require(path.join(backend, 'dist/groups/groups.service'));
const passed = [];
const blockers = [];
async function test(name, fn) { await fn(); passed.push(name); console.log(`PASS ${name}`); }
(async () => {
  const container = JSON.parse(cp.execFileSync('docker', ['inspect', '7bar_backend'], { encoding: 'utf8' }))[0];
  const raw = container.Config.Env.find(v => v.startsWith('DATABASE_URL_TENANT='));
  assert(raw, 'Local backend container must declare DATABASE_URL_TENANT');
  const url = new URL(raw.slice(raw.indexOf('=') + 1));
  assert.equal(url.hostname, 'mysql', 'Only the local Docker MySQL server is allowed');
  url.hostname = '127.0.0.1'; url.port = '3308';
  const admin = await mysql.createConnection({ host: '127.0.0.1', port: 3308, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) });
  const names = ['a', 'b'].map(s => `portal_qa_${Date.now()}_${s}`);
  const created = []; const clients = [];
  try {
    const urls = [];
    for (const name of names) {
      assert(/^portal_qa_\d+_[ab]$/.test(name));
      await admin.query(`CREATE DATABASE \`${name}\``); created.push(name);
      const target = new URL(url); target.pathname = `/${name}`; urls.push(target.toString());
      cp.execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { cwd: backend, env: { ...process.env, DATABASE_URL_TENANT: target.toString() }, stdio: 'pipe' });
      clients.push(new PrismaClient({ datasources: { db: { url: target.toString() } } }));
    }
    const [a, b] = clients;
    const heart = { tenantGroup: { findUnique: async () => ({ id: 'qa', name: 'QA local', members: urls.map((databaseUrl, i) => ({ tenantId: i ? 'b' : 'a', alias: i ? 'B' : 'A', tenant: { id: i ? 'b' : 'a', name: i ? 'B' : 'A', databaseUrl } })) }) } };
    const service = new GroupsService(heart, { invalidateCache() {} });
    const body = { name: 'Produto QA', barcode: '7890000000001', unit: 'UN', categoryName: 'QA', priceCost: 4, tenantPrices: [{ tenantId: 'a', priceSell: 10 }, { tenantId: 'b', priceSell: 12 }] };
    let pa, pb;
    await test('create selected stores with independent prices and zero stock', async () => {
      const result = await service.createProductInTenants('qa', body); assert(result.results.every(r => r.success));
      pa = await a.product.findFirstOrThrow(); pb = await b.product.findFirstOrThrow();
      assert.equal(Number(pa.stock), 0); assert.equal(Number(pb.stock), 0); assert.equal(Number(pa.priceSell), 10); assert.equal(Number(pb.priceSell), 12);
    });
    await test('duplicate barcode cannot change unit or prices', async () => {
      const result = await service.createProductInTenants('qa', { ...body, unit: 'KG', priceCost: 99 });
      assert(result.results.every(r => !r.success)); const p = await a.product.findUniqueOrThrow({ where: { id: pa.id } }); assert.equal(p.unit, 'UN'); assert.equal(Number(p.priceCost), 4);
    });
    await test('reject creation outside group and invalid cost', async () => {
      const result = await service.createProductInTenants('qa', { ...body, tenantPrices: [{ tenantId: 'outside', priceSell: 1 }] }); assert.equal(result.results[0].success, false);
      await assert.rejects(service.createProductInTenants('qa', { ...body, priceCost: -1 }));
    });
    await test('concurrent entries preserve stock, lots and history including zero cost', async () => {
      await Promise.all(Array.from({ length: 5 }, () => service.stockEntry('qa', { tenantId: 'a', productId: pa.id, quantity: 2, costPrice: 0 })));
      assert.equal(Number((await a.product.findUniqueOrThrow({ where: { id: pa.id } })).stock), 10);
      const lots = await a.stockLot.findMany(); assert.equal(lots.reduce((sum, lot) => sum + Number(lot.remaining), 0), 10); assert(lots.every(lot => Number(lot.costPrice) === 0)); assert.equal(await a.inventoryLog.count(), 5);
      await assert.rejects(service.stockEntry('qa', { tenantId: 'a', productId: pa.id, quantity: -2 }));
    });
    const transfer = { fromTenantId: 'a', toTenantId: 'b', productId: pa.id, quantity: 3 };
    await test('transfer commits both databases and FIFO with common receipt', async () => {
      const result = await service.stockTransfer('qa', transfer);
      assert.equal(Number((await a.product.findUniqueOrThrow({ where: { id: pa.id } })).stock), 7);
      assert.equal(Number((await b.product.findUniqueOrThrow({ where: { id: pb.id } })).stock), 3);
      assert.equal((await a.inventoryLog.findUniqueOrThrow({ where: { id: result.transferId } })).type, 'transfer_out');
      assert.equal((await b.inventoryLog.findUniqueOrThrow({ where: { id: result.transferId } })).type, 'transfer_in');
      assert.equal((await service.getRecentTransfers('qa')).transfers[0].status, 'completed');
    });
    await test('concurrent transfers cannot overspend source', async () => {
      const outcomes = await Promise.allSettled([service.stockTransfer('qa', { ...transfer, quantity: 5 }), service.stockTransfer('qa', { ...transfer, quantity: 5 })]);
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
      assert.equal(Number((await a.product.findUniqueOrThrow({ where: { id: pa.id } })).stock), 2); assert.equal(Number((await b.product.findUniqueOrThrow({ where: { id: pb.id } })).stock), 8);
    });
    await test('stale stock adjustment rejected, current adjustment reconciles FIFO', async () => {
      await assert.rejects(service.stockAdjust('qa', { tenantId: 'a', productId: pa.id, newStock: 20, expectedStock: 7 }), /saldo mudou/);
      await service.stockAdjust('qa', { tenantId: 'a', productId: pa.id, newStock: 1, expectedStock: 2 });
      assert.equal(Number((await a.product.findUniqueOrThrow({ where: { id: pa.id } })).stock), 1);
      assert.equal((await a.stockLot.findMany()).reduce((sum, lot) => sum + Number(lot.remaining), 0), 1);
    });
    await test('price update affects only selected product and store', async () => {
      const result = await service.updatePricePerTenant('qa', { productName: body.name, updates: [{ tenantId: 'b', productId: pb.id, priceSell: 15 }] }); assert(result.results[0].success);
      assert.equal(Number((await a.product.findUniqueOrThrow({ where: { id: pa.id } })).priceSell), 10); assert.equal(Number((await b.product.findUniqueOrThrow({ where: { id: pb.id } })).priceSell), 15);
    });
    await test('sync copies missing product at zero stock, never overwrites existing prices', async () => {
      const result = await service.createProductInTenants('qa', { ...body, name: 'Somente A', barcode: '7890000000002', tenantPrices: [{ tenantId: 'a', priceSell: 20 }] });
      const item = { name: 'Somente A', sourceTenantId: 'a', sourceProductId: result.results[0].productId, targetTenantIds: ['b'] };
      assert((await service.syncProductsToTenants('qa', { products: [item] })).results[0].success);
      const copied = await b.product.findUniqueOrThrow({ where: { barcode: '7890000000002' } }); assert.equal(Number(copied.stock), 0);
      await b.product.update({ where: { id: copied.id }, data: { priceSell: 22 } });
      assert.equal((await service.syncProductsToTenants('qa', { products: [item] })).results[0].success, false);
      assert.equal(Number((await b.product.findUniqueOrThrow({ where: { id: copied.id } })).priceSell), 22);
    });
    await test('destination log failure rolls back receiving and restores source and lots', async () => {
      const factory = service.createTenantClient.bind(service);
      service.createTenantClient = databaseUrl => {
        const client = factory(databaseUrl);
        if (databaseUrl === urls[1]) {
          const transaction = client.$transaction.bind(client);
          client.$transaction = fn => transaction(tx => fn(new Proxy(tx, { get(target, key) { return key === 'inventoryLog' ? { create: async () => { throw new Error('QA injected log failure'); } } : target[key]; } })));
        }
        return client;
      };
      try { await assert.rejects(service.stockTransfer('qa', { ...transfer, quantity: 0.5 }), /restaurado/); }
      finally { service.createTenantClient = factory; }
      assert.equal(Number((await a.product.findUniqueOrThrow({ where: { id: pa.id } })).stock), 1);
      assert.equal(Number((await b.product.findUniqueOrThrow({ where: { id: pb.id } })).stock), 8);
      assert.equal((await a.stockLot.findMany()).reduce((sum, lot) => sum + Number(lot.remaining), 0), 1);
    });
    await test('entry log failure rolls back stock and new FIFO lot', async () => {
      const factory = service.createTenantClient.bind(service);
      service.createTenantClient = databaseUrl => {
        const client = factory(databaseUrl); const transaction = client.$transaction.bind(client);
        client.$transaction = fn => transaction(tx => fn(new Proxy(tx, { get(target, key) { return key === 'inventoryLog' ? { create: async () => { throw new Error('QA injected log failure'); } } : target[key]; } })));
        return client;
      };
      const count = await a.stockLot.count();
      try { await assert.rejects(service.stockEntry('qa', { tenantId: 'a', productId: pa.id, quantity: 1 }), /QA injected/); }
      finally { service.createTenantClient = factory; }
      assert.equal(Number((await a.product.findUniqueOrThrow({ where: { id: pa.id } })).stock), 1); assert.equal(await a.stockLot.count(), count);
    });
    // Release probes record problems rather than declaring unsafe behavior a passing regression.
    const retryBody = { ...transfer, quantity: 0.1, requestId: '00000000-0000-4000-8000-000000000001' };
    const first = await service.stockTransfer('qa', retryBody);
    const retry = await service.stockTransfer('qa', retryBody);
    if (first.transferId !== retry.transferId) blockers.push({ issue: 'Transfer retry duplicates movement', evidence: 'Same requestId submitted twice produces two different receipts and two debits of 0.1.' });
    const receivedLot = await b.stockLot.findFirst({ where: { lotNumber: `TRANSF-${first.transferId}` } });
    if (Number(receivedLot.costPrice) !== 0) blockers.push({ issue: 'Transfer loses FIFO valuation', evidence: `Source lots cost zero; received lot cost is ${Number(receivedLot.costPrice)} (product default).` });
    const composite = await a.product.create({ data: { name: 'Composite QA', categoryId: pa.categoryId, priceSell: 5, priceCost: 1, unit: 'UN', isComposite: true, requiresKitchen: true } });
    await service.syncProductsToTenants('qa', { products: [{ name: composite.name, sourceTenantId: 'a', sourceProductId: composite.id, targetTenantIds: ['b'] }] });
    const copy = await b.product.findFirst({ where: { name: composite.name } });
    if (copy && (!copy.isComposite || !copy.requiresKitchen)) blockers.push({ issue: 'Sync loses product behavior', evidence: 'Composite kitchen product copied as simple product without kitchen routing.' });
    const output = path.join(root, 'docs', 'group-portal-mysql-results.json');
    fs.writeFileSync(output, JSON.stringify({ date: new Date().toISOString(), engine: 'local MySQL, real Prisma and GroupsService; group membership fixture', passed, blockers, releaseReady: blockers.length === 0 }, null, 2));
    console.log(`${passed.length} integration scenarios passed`);
    for (const blocker of blockers) console.log(`RELEASE BLOCKER: ${blocker.issue}: ${blocker.evidence}`);
    if (blockers.length) process.exitCode = 2;
  } finally {
    await Promise.allSettled(clients.map(client => client.$disconnect()));
    for (const name of created) { assert(/^portal_qa_\d+_[ab]$/.test(name)); await admin.query(`DROP DATABASE \`${name}\``); }
    await admin.end(); console.log('Isolated QA databases removed');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
