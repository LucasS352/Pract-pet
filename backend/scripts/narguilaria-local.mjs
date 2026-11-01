// Somente fixture local criada por event-load-local.cjs; nunca executar em produção.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { PrismaClient: Heart } = require('/app/src/generated/heart-client');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(process.env.LOAD_LOCAL_REI_ADEGAS, 'yes');
assert.equal(cfg.baseUrl, 'http://127.0.0.1:3520/api');
assert.equal(cfg.confirmTestTenant, cfg.tenantId);
const heart = new Heart();
const tenant = await heart.tenant.findUnique({ where: { id: cfg.tenantId } });
assert.equal(tenant.databaseName, 'rei_adegas');
assert.equal(new URL(tenant.databaseUrl).hostname, 'mysql');
assert.equal(await heart.tenantIntegration.count({ where: { tenantId: tenant.id } }), 0);
const db = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } });
const modules = typeof tenant.modulos === 'string' ? JSON.parse(tenant.modulos) : tenant.modulos;
const results = [], prefix = `NARG-${Date.now()}`, orders = [];
const waiter = cfg.waiters[0];
async function call(method, path, body, actor = waiter) {
  const token = process.env[actor.tokenEnv];
  assert.equal(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).tenantId, tenant.id);
  const res = await fetch(cfg.baseUrl + path, { method, signal: AbortSignal.timeout(15000), redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, ok: res.ok, data: await res.json() };
}
async function good(method, path, body, actor) {
  const res = await call(method, path, body, actor);
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(res.data)}`); return res.data;
}
const check = name => { results.push({ scenario: name, passed: true }); console.log(name + ': OK'); };
async function create() {
  const c = await good('POST', '/v1/comandas', { number: `${prefix}-${orders.length}`, responsibleWaiterId: waiter.operatorId });
  orders.push(c.id); return c;
}
const path = c => `/v1/comandas/${c.id}`;
const addBody = (assetNumber, productId = cfg.productIds[0], quantity = 1) => ({ items: [{ productId, quantity, assetNumber, serveImmediately: true }] });
const available = () => good('GET', `/v1/comandas/assets/${cfg.productIds[0]}`);
const hasAsset = async n => (await available()).occupied.some(i => i.assetNumber === n);
async function current(c) { return good('GET', path(c)); }
async function deliver(item) {
  for (const status of ['PREPARING', 'READY', 'DELIVERED']) {
    await good('PATCH', '/v1/kds/status', { itemIds: [item.id], status });
    const saved = await db.comandaItem.findUnique({ where: { id: item.id } });
    if (status !== 'DELIVERED') assert.equal(saved.timerStartedAt, null);
    else { assert.ok(saved.timerStartedAt); assert.equal(saved.timerDueAt.getTime() - saved.timerStartedAt.getTime(), 1800000); }
  }
}
try {
  for (const id of cfg.productIds.slice(0, 2)) {
    const product = await db.product.findUnique({ where: { id } });
    assert.ok(product.name.startsWith('LOAD-'));
    await db.product.update({ where: { id }, data: { requiresKitchen: false, requiresBar: false, requiresCarvoaria: true, serviceTimerMinutes: 30, assetTrackingTotal: 500 } });
  }
  // Números livres são escolhidos sem alterar reservas pré-existentes.
  await heart.tenant.update({ where: { id: tenant.id }, data: { modulos: { ...modules, carvoaria: true, kds: false } } });
  assert.deepEqual((await good('GET', '/v1/kds/config')).stations, ['CARVOARIA']);
  const occupied = new Set((await available()).occupied.map(i => i.assetNumber));
  const assets = Array.from({ length: 500 }, (_, i) => i + 1).filter(n => !occupied.has(n)).slice(-8);
  assert.equal(assets.length, 8);
  const a = await create(), b = await create();
  const races = await Promise.all([
    call('POST', path(a) + '/items', addBody(assets[0])),
    call('POST', path(b) + '/items', addBody(assets[0], cfg.productIds[1]), cfg.waiters[1]),
  ]);
  assert.deepEqual(races.map(r => r.status).sort(), [201, 409]);
  const winner = races[0].ok ? a : b, loser = races[0].ok ? b : a;
  assert.equal((await current(loser)).items.length, 0);
  assert.equal(await db.comandaAssetReservation.count({ where: { assetNumber: assets[0] } }), 1);
  const item = (await current(winner)).items[0];
  assert.equal(item.kdsDestination, 'CARVOARIA'); assert.equal(item.timerStartedAt, null);
  assert.equal(item.serveImmediately, false);
  check('Reserva concorrente global entre produtos: uma aceita, outra 409 sem item parcial');
  assert.equal((await call('POST', path(loser) + '/items', addBody(assets[1], cfg.productIds[0], 2))).status, 400);
  assert.equal((await call('POST', path(loser) + '/items', addBody(501))).status, 400);
  assert.equal((await call('POST', path(winner) + `/items/${item.id}/return-asset`, {})).status, 400);
  await deliver(item); check('Timer inicia somente na entrega; quantidade e recolhimento antecipado protegidos');
  // Backdate only this fixture to validate a truly overdue timer without waiting 40 minutes.
  const oldDue = new Date(Date.now() - 600000);
  await db.comandaItem.update({ where: { id: item.id }, data: { timerStartedAt: new Date(Date.now() - 2400000), timerDueAt: oldDue } });
  const before = Date.now();
  const extensions = await Promise.all(cfg.waiters.slice(0, 2).map(actor => call('POST', path(winner) + `/items/${item.id}/timer/snooze`, { extraMinutes: 15, expectedDueAt: oldDue.toISOString() }, actor)));
  assert.deepEqual(extensions.map(r => r.status).sort(), [201, 409]);
  const due = new Date(extensions.find(r => r.ok).data.timerDueAt).getTime();
  assert.ok(due >= before + 900000 && due <= Date.now() + 900000);
  assert.equal((await call('POST', path(loser) + `/items/${item.id}/return-asset`, {})).status, 404);
  check('Ronda vencida recebe 15 minutos reais; prorrogação concorrente não duplica e item exige comanda correta');
  await good('POST', path(winner) + `/items/${item.id}/return-asset`, {});
  await good('POST', path(winner) + `/items/${item.id}/return-asset`, {});
  assert.equal(await hasAsset(assets[0]), false);
  await good('POST', path(loser) + '/items', addBody(assets[0]));
  check('Recolhimento idempotente libera número para nova comanda');
  for (const [index, operation] of ['cancel', 'remove', 'close', 'checkout'].entries()) {
    const c = await create(), asset = assets[index + 1];
    await good('POST', path(c) + '/items', addBody(asset));
    const full = await current(c), tracked = full.items[0];
    assert.equal(await hasAsset(asset), true);
    if (operation === 'cancel') await good('DELETE', path(c));
    if (operation === 'remove') await good('DELETE', path(c) + `/items/${tracked.id}`);
    if (operation === 'close') await good('POST', path(c) + '/close', {});
    if (operation === 'checkout') {
      const cashier = cfg.cashiers[0], key = randomUUID();
      const body = { idempotencyKey: key, comandaId: c.id, operatorId: cashier.operatorId, cashRegisterId: cashier.cashRegisterId, emitirNfce: false,
        items: full.items.map(i => ({ productId: i.productId, quantity: Number(i.quantity), priceUnit: Number(i.unitPrice) })), payments: [{ method: 'dinheiro', value: Number(full.total) }] };
      const sale = await good('POST', '/sales/checkout', body, cashier);
      assert.equal((await good('POST', '/sales/checkout', body, cashier)).id, sale.id);
    }
    assert.equal(await hasAsset(asset), false);
    check(`Liberação automática: ${operation}`);
  }
  await heart.tenant.update({ where: { id: tenant.id }, data: { modulos: { ...modules, carvoaria: false, kds: true } } });
  assert.equal((await call('GET', '/v1/comandas/service-rounds')).status, 403);
  assert.equal((await call('POST', path(loser) + '/items', addBody(assets[7]))).status, 400);
  check('Módulo desativado bloqueia Carvoaria no backend');
} catch (error) { results.push({ passed: false, error: error.message }); process.exitCode = 1; }
finally {
  await heart.tenant.update({ where: { id: tenant.id }, data: { modulos: modules } });
  for (const id of orders) {
    const c = await db.comanda.findUnique({ where: { id } });
    if (c && ['open', 'waiting_payment'].includes(c.status)) await good('DELETE', `/v1/comandas/${id}`);
  }
  await db.$disconnect(); await heart.$disconnect();
  const report = { prefix, results, passed: results.length === 9 && results.every(r => r.passed) };
  writeFileSync(cfg.reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
