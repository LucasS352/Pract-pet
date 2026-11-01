// node --test tests/sales-resilience.test.cjs — no browser database, server or real sales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
function load(file, dependencies = {}, globals = {}) {
  const context = { exports: {}, console, crypto, ...globals, require: id => {
    if (id in dependencies) return dependencies[id];
    if (id === 'zustand') return require('zustand');
    throw new Error(`Unexpected dependency: ${id}`);
  } };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
function checkoutHarness({ failSave = false, failAck = false } = {}) {
  const rows = [];
  const db = {
    saveOfflineSale: async sale => { if (failSave) throw new Error('QuotaExceededError'); rows.push({ ...sale }); },
    markSaleSynced: async () => { if (failAck) throw new Error('IndexedDB unavailable'); rows[0].syncStatus = 'SYNCED'; },
    markSaleError: async () => { rows[0].syncStatus = 'ERROR'; },
    markSaleReview: async () => { rows[0].syncStatus = 'REVIEW'; },
  };
  const { submitDurableCheckout } = load('lib/durable-checkout.ts', {
    './db': db, './sale-operation-lock': { withSaleOperationLock: async (_t, _id, work) => work() },
  });
  return { rows, submit: send => submitDurableCheckout({ tenantId: 'shop', localId: 'operation', syncStatus: 'SYNCING' }, send) };
}
test('IndexedDB failure: no POST and no successful contingency', async () => {
  const h = checkoutHarness({ failSave: true }); let sends = 0;
  await assert.rejects(h.submit(async () => { sends++; }), /QuotaExceededError/);
  assert.equal(sends, 0); assert.equal(h.rows.length, 0);
});
test('persist before POST, then acknowledge same operation', async () => {
  const h = checkoutHarness();
  const result = await h.submit(async () => { assert.equal(h.rows.length, 1); return { data: { id: 'server-sale' } }; });
  assert.equal(result.kind, 'confirmed'); assert.equal(h.rows[0].syncStatus, 'SYNCED');
});
test('lost response retains the original identity and pending snapshot', async () => {
  const h = checkoutHarness();
  const result = await h.submit(async () => { throw { code: 'ERR_NETWORK' }; });
  assert.equal(result.kind, 'pending'); assert.equal(h.rows[0].localId, 'operation'); assert.equal(h.rows[0].syncStatus, 'ERROR');
});
test('business refusal is retained for review, not automatic resend', async () => {
  const h = checkoutHarness();
  const result = await h.submit(async () => { throw { response: { status: 409, data: { message: 'Comanda alterada' } } }; });
  assert.equal(result.kind, 'review'); assert.equal(h.rows[0].syncStatus, 'REVIEW');
});
test('local programming error is not announced as a successful offline sale', async () => {
  const h = checkoutHarness();
  assert.equal((await h.submit(async () => { throw new TypeError('bug'); })).kind, 'review');
});
test('acknowledgement storage failure keeps SYNCING recoverable, without another POST', async () => {
  const h = checkoutHarness({ failAck: true }); let sends = 0;
  assert.equal((await h.submit(async () => { sends++; return { data: { id: 'server-sale' } }; })).kind, 'confirmed');
  assert.equal(sends, 1); assert.equal(h.rows[0].syncStatus, 'SYNCING');
});
test('cross-tab lock skips an active sender; browser without locks falls back gracefully', async () => {
  let runs = 0;
  const locks = load('lib/sale-operation-lock.ts', {}, { navigator: { locks: { request: async (_name, options, callback) => {
    assert.equal(options.ifAvailable, true); return callback(null);
  } } } });
  await assert.rejects(locks.withSaleOperationLock('shop', 'operation', async () => runs++), /outra aba/);
  assert.equal(runs, 0);
  const unavailable = load('lib/sale-operation-lock.ts', {}, { navigator: {} });
  await unavailable.withSaleOperationLock('shop', 'operation', async () => runs++);
  assert.equal(runs, 1);
});
test('F5 reload restores scoped draft identity and items; another operator gets another draft', () => {
  const memory = new Map(); const sessionStorage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) };
  const first = load('store/cart.ts', {}, { sessionStorage }).useCartStore;
  first.getState().selectScope('shop', 'operator');
  first.getState().addItem({ id: 'product', name: 'Test', priceSell: 10 }, 1);
  const key = first.getState().cartOperationId;
  const reloaded = load('store/cart.ts', {}, { sessionStorage }).useCartStore;
  reloaded.getState().selectScope('shop', 'operator');
  assert.equal(reloaded.getState().cartOperationId, key); assert.equal(reloaded.getState().items.length, 1);
  reloaded.getState().selectScope('shop', 'another-operator');
  assert.equal(reloaded.getState().items.length, 0); assert.notEqual(reloaded.getState().cartOperationId, key);
});
test('recovery query includes interrupted SYNCING but excludes other shops/operators and REVIEW', async () => {
  const source = fs.readFileSync(path.join(root, 'lib/db.ts'), 'utf8');
  const ast = ts.createSourceFile('db.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'getPendingSales');
  const rows = ['SYNCING', 'PENDING', 'REVIEW', 'SYNCED'].map(syncStatus => ({ syncStatus, tenantId: 'shop', operatorId: 'op' }));
  rows.push({ syncStatus: 'SYNCING', tenantId: 'another', operatorId: 'op' });
  let selected = rows;
  const query = { anyOf: statuses => { selected = selected.filter(r => statuses.includes(r.syncStatus)); return query; },
    filter: predicate => { selected = selected.filter(predicate); return query; }, sortBy: async () => selected };
  const ctx = { exports: {}, db: { offline_sales: { where: () => query } } };
  vm.createContext(ctx);
  vm.runInContext(ts.transpileModule(declaration.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  const result = await ctx.exports.getPendingSales('shop', 'op');
  assert.equal(result.length, 2); assert(result.some(r => r.syncStatus === 'SYNCING'));
  assert.equal((await ctx.exports.getPendingSales()).length, 0);
});

test('optimized direct checkout has explicit timeout of 35s and expected identity', async () => {
  let config;
  const module = load('lib/checkout-api.ts', { './api': {
    api: { post: async (_url, _body, options) => { config = options; return { data: { id: 'sale' } }; } },
  } });
  await module.sendCheckout({}, 'shop', 'op');
  assert.equal(config.timeout, 35000); assert.equal(config.expectedTenantId, 'shop'); assert.equal(config.expectedOperatorId, 'op');
});

test('unresponsive HTTP checkout times out and preserves the operation (loopback only)', async () => {
  const http = require('node:http');
  const axios = require('axios');
  const sockets = new Set(); let posts = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (req.url.includes('checkout-capabilities')) {
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"protocol":2}');
      } else { posts++; /* Deliberately no response, simulating a stalled connection. */ }
    });
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}` });
    const module = load('lib/checkout-api.ts', { './api': { api, apiGet: (url, config) => api.get(url, { ...config, timeout: 10000 }) } });
    const h = checkoutHarness(); const started = Date.now();
    const result = await h.submit(() => module.sendCheckout({ idempotencyKey: 'operation' }, 'shop', 'op'));
    assert.equal(result.kind, 'pending'); assert.equal(h.rows[0].localId, 'operation');
    assert.equal(h.rows[0].syncStatus, 'ERROR'); assert.equal(posts, 1);
    assert(Date.now() - started >= 9000);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
