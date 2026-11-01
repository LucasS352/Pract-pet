import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (cfg.confirmTestTenant !== cfg.tenantId || !cfg.tenantId || cfg.integrationsDisabled !== true)
  throw new Error('Tenant de teste não confirmado.');
const prefix = `RACE-${Date.now()}`;
const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function call(actor, method, path, body) {
  const token = process.env[actor.tokenEnv];
  assert(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).tenantId === cfg.tenantId, 'Token incorreto');
  const res = await fetch(cfg.baseUrl + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, ok: res.ok, data: await res.json() };
}
const waiter = cfg.waiters[0];
const item = productId => ({ productId, quantity: 1, serveImmediately: true });
const saleBody = (order, cashier) => ({ idempotencyKey: randomUUID(), comandaId: order.id,
  operatorId: cashier.operatorId, cashRegisterId: cashier.cashRegisterId, emitirNfce: false,
  items: order.items.map(i => ({ productId: i.productId, quantity: Number(i.quantity), priceUnit: Number(i.unitPrice) })),
  payments: [{ method: 'dinheiro', value: Number(order.total) }] });
const me = await call(waiter, 'GET', '/tenants/me');
assert(me.ok && me.data.id === cfg.tenantId, 'Tenant da API incorreto');
try {
  for (let round = 0; round < 10; round++) {
    const created = await call(waiter, 'POST', '/v1/comandas', { number: `${prefix}-${round}`, responsibleWaiterId: waiter.operatorId });
    assert(created.ok, 'Falha ao criar comanda');
    const path = `/v1/comandas/${created.data.id}`;
    const launches = await Promise.all(cfg.productIds.map((id, i) => call(cfg.waiters[i % cfg.waiters.length], 'POST', path + '/items', { items: [item(id)] })));
    assert(launches.every(r => r.ok), `Falha no lançamento concorrente: ${launches.map(r => r.status)}`);
    const current = (await call(waiter, 'GET', path)).data;
    const sum = current.items.reduce((v, i) => v + Number(i.totalPrice), 0);
    assert(current.items.length === cfg.productIds.length && Math.abs(Number(current.total) - sum) < .001,
      `TOTAL_DIVERGENTE: ${current.items.length} itens somam ${sum}, comanda.total=${current.total}`);
    results.push({ round, scenario: 'lançamentos simultâneos na mesma comanda', passed: true });
    const checkouts = await Promise.all(cfg.cashiers.slice(0, 2).map(actor => call(actor, 'POST', '/sales/checkout', saleBody(current, actor))));
    assert(checkouts.filter(r => r.ok).length === 1 && checkouts.filter(r => r.status === 400 || r.status === 409).length === 1,
      `FECHAMENTO_CONCORRENTE: ${checkouts.map(r => r.status)}`);
    const final = (await call(waiter, 'GET', path)).data;
    assert(final.status === 'closed' && final.saleId === checkouts.find(r => r.ok).data.id, 'Venda/comanda sem vínculo correto');
    results.push({ round, scenario: 'dois caixas fechando a mesma comanda', passed: true });
  }
} catch (error) {
  results.push({ passed: false, error: error.message });
  process.exitCode = 1;
}
const report = { prefix, results, passed: results.length === 20 && results.every(r => r.passed) };
writeFileSync(cfg.reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
