// Node 20+, sem dependências. Execute somente contra um tenant de homologação.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

const configPath = process.argv[2];
if (!configPath) throw new Error('Uso: node backend/scripts/event-load.mjs caminho/config.json');
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
if (cfg.confirmTestTenant !== cfg.tenantId || !cfg.tenantId || cfg.integrationsDisabled !== true)
  throw new Error('Confirme o tenant exclusivo de testes e integrações externas desativadas na configuração.');
const base = new URL(cfg.baseUrl);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)
  throw new Error('baseUrl inválida. Informe a raiz da API sem credenciais.');
const count = cfg.orders ?? 300;
const maxSeconds = cfg.maxSeconds ?? 1800;
const actionMs = cfg.actionMs ?? 3000;
if (!Number.isInteger(count) || count < 1 || count > 3000 || !Number.isFinite(maxSeconds) || maxSeconds < 10 || maxSeconds > 7200 || !Number.isFinite(actionMs) || actionMs < 100)
  throw new Error('Limites: 1–3000 comandas, 10–7200 segundos e actionMs >= 100.');
if (!cfg.waiters?.length || !cfg.cashiers?.length || !cfg.kitchen || !cfg.productIds?.length)
  throw new Error('Informe garçons, caixas, cozinha e productIds.');
if (new Set(cfg.productIds).size !== cfg.productIds.length)
  throw new Error('Use IDs de produtos distintos.');
const actors = [...cfg.waiters, ...cfg.cashiers, cfg.kitchen];
for (const actor of actors) {
  actor.token = process.env[actor.tokenEnv];
  if (!actor.token) throw new Error(`Variável ausente: ${actor.tokenEnv}`);
  const payload = JSON.parse(Buffer.from(actor.token.split('.')[1], 'base64url').toString());
  if (payload.tenantId !== cfg.tenantId) throw new Error('Token pertence a outro tenant.');
}
if (cfg.waiters.some(a => !a.operatorId) || cfg.cashiers.some(a => !a.operatorId || !a.cashRegisterId))
  throw new Error('Informe operadores dos garçons e operadores/caixas abertos para os caixas.');

const runId = `LOAD-${Date.now()}`;
const started = performance.now();
const samples = new Map();
const orders = [];
const failures = [];
const saleCodes = new Set();
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
const cents = value => Math.round(Number(value) * 100);
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

async function request(actor, method, path, body, label = path.replace(/[0-9a-f-]{36}/g, ':id')) {
  const start = performance.now();
  let status = 0;
  let bytes = 0;
  let ok = false;
  try {
    const res = await fetch(base.href.replace(/\/$/, '') + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    status = res.status;
    const text = await res.text();
    bytes = Buffer.byteLength(text);
    // Não grava resposta: pode conter dados privados da loja.
    if (!res.ok) throw new Error(`${method} ${label}: HTTP ${status}`);
    const data = JSON.parse(text);
    ok = true;
    return data;
  } finally {
    const key = `${method} ${label}`;
    if (!samples.has(key)) samples.set(key, []);
    samples.get(key).push({ ms: performance.now() - start, status, bytes, ok });
  }
}

async function advance(actor, ids, status) {
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const result = await request(actor, 'PATCH', '/v1/kds/status', { itemIds: batch, status });
    ensure(result.updated === batch.length, 'Quantidade divergente na transição KDS.');
  }
}

async function productSnapshot(actor) {
  const found = [];
  for (let page = 1; ; page++) {
    const result = await request(actor, 'GET', `/products?limit=2000&includeInactive=true&page=${page}`, undefined, '/products?inventory-snapshot');
    ensure(Array.isArray(result.data), 'Catálogo inválido.');
    found.push(...result.data.filter(p => cfg.productIds.includes(p.id)));
    if (found.length === cfg.productIds.length) return found;
    if (!result.data.length) throw new Error('Produtos de teste ausentes no catálogo.');
  }
}

function validateOrder(order, actual, products) {
  ensure(actual.items.length === products.length, `Itens divergentes na comanda ${order.number}`);
  let total = 0;
  for (const product of products) {
    const items = actual.items.filter(i => i.productId === product.id);
    ensure(items.length === 1 && Number(items[0].quantity) === 1, `Item duplicado/ausente em ${order.number}`);
    ensure(cents(items[0].totalPrice) === cents(product.priceSell), `Preço divergente em ${order.number}`);
    total += cents(product.priceSell);
  }
  ensure(cents(actual.total) === total, `Total divergente em ${order.number}`);
  return total;
}

async function run() {
  // Preflight somente leitura, antes de criar a primeira comanda.
  for (const actor of actors) {
    const tenant = await request(actor, 'GET', '/tenants/me');
    ensure(tenant.id === cfg.tenantId, 'API retornou outro tenant.');
  }
  const kds = await request(cfg.kitchen, 'GET', '/v1/kds/config');
  ensure(kds.enabled === true, 'Ative KDS no tenant de teste.');
  const products = await productSnapshot(cfg.waiters[0]);
  for (const product of products) {
    ensure(!product.isComposite && product.active !== false && Number(product.priceSell) > 0, 'Use produtos simples ativos com preço positivo.');
    ensure(Number(product.stock) >= count, `Estoque insuficiente no produto de teste ${product.id}`);
  }
  ensure(products.some(p => p.requiresKitchen), 'Inclua pelo menos um produto da cozinha.');
  for (const actor of cfg.cashiers) {
    const register = await request(actor, 'GET', `/cash-registers/current?operatorId=${encodeURIComponent(actor.operatorId)}`, undefined, '/cash-registers/current');
    ensure(register?.id === actor.cashRegisterId && register.status === 'open', 'Caixa incorreto ou fechado.');
  }
  console.log(`${runId}: preparando ${count} comandas; ${cfg.waiters.length} garçons, ${cfg.cashiers.length} caixas, 1 cozinha.`);
  // Prepara volume de dados antes do pico, com 4 (ou N) escritores simultâneos.
  const preparation = await Promise.allSettled(cfg.waiters.map(async (actor, worker) => {
    for (let i = worker; i < count && !stopped; i += cfg.waiters.length) {
      const number = `${runId}-${i + 1}`;
      const data = await request(actor, 'POST', '/v1/comandas', {
        number, customerName: 'TESTE DE CARGA', responsibleWaiterId: actor.operatorId,
      });
      ensure(data.id && data.status === 'open', 'Falha ao preparar comanda.');
      const order = { id: data.id, number, worker, sent: false, readyForCashier: false, closed: false };
      orders.push(order);
      if (cfg.backlog === true) {
        const actual = await request(actor, 'POST', `/v1/comandas/${order.id}/items`, {
          items: products.map(p => ({ productId: p.id, quantity: 1, createdById: actor.operatorId, serveImmediately: false })),
        });
        order.totalCents = validateOrder(order, actual, products);
        order.itemIds = actual.items.map(i => i.id);
        order.sent = true;
      }
    }
  }));
  for (const result of preparation) if (result.status === 'rejected') throw result.reason;
  ensure(orders.length === count, 'Preparação interrompida.');
  const deadline = performance.now() + maxSeconds * 1000;
  const progress = setInterval(() => console.log(JSON.stringify({ runId,
    sent: orders.filter(o => o.sent).length, closed: orders.filter(o => o.closed).length,
    planned: count })), 30000);
  const shouldRun = () => !stopped && performance.now() < deadline && orders.some(o => !o.closed);
  const guarded = work => work().catch(error => { stopped = true; failures.push(error.message); });
  const workers = cfg.waiters.map((actor, worker) => guarded(async () => {
    let nextPoll = 0, nextTables = 0, nextAction = 0;
    while (shouldRun()) {
      const own = orders.filter(o => o.worker === worker);
      if (performance.now() >= nextTables) {
        const list = await request(actor, 'GET', '/v1/comandas?status=open');
        ensure(Array.isArray(list), 'Lista de comandas inválida.');
        nextTables = performance.now() + 15000;
      }
      if (performance.now() >= nextPoll) {
        const tickets = await request(actor, 'GET', '/v1/kds/tickets');
        const ids = new Set(own.filter(o => o.sent && !o.readyForCashier).map(o => o.id));
        const ready = tickets.filter(t => ids.has(t.comandaId) && t.kdsStatus === 'READY' &&
          (t.kdsDestination === 'KITCHEN' || t.serveImmediately || !tickets.some(other => other.comandaId === t.comandaId && other.kdsDestination === 'KITCHEN' && ['PENDING', 'PREPARING'].includes(other.kdsStatus))));
        await advance(actor, ready.map(t => t.id), 'DELIVERED');
        const delivered = new Set(ready.map(t => t.id));
        for (const order of own.filter(o => o.sent && !o.readyForCashier)) {
          if (order.itemIds.every(id => delivered.has(id) || !tickets.some(t => t.id === id))) {
            await request(actor, 'POST', `/v1/comandas/${order.id}/request-payment`);
            order.readyForCashier = true;
          }
        }
        nextPoll = performance.now() + 5000;
      }
      if (performance.now() >= nextAction) {
        const order = own.find(o => !o.sent);
        if (order) {
          await request(actor, 'GET', '/products?limit=2000&active=true');
          const actual = await request(actor, 'POST', `/v1/comandas/${order.id}/items`, {
            items: products.map(p => ({ productId: p.id, quantity: 1, createdById: actor.operatorId, serveImmediately: false })),
          });
          order.totalCents = validateOrder(order, actual, products);
          order.itemIds = actual.items.map(i => i.id);
          order.sent = true;
        }
        nextAction = performance.now() + actionMs;
      }
      await sleep(100);
    }
  }));
  workers.push(guarded(async () => {
    while (shouldRun()) {
      const tickets = await request(cfg.kitchen, 'GET', '/v1/kds/tickets');
      const owned = new Set(orders.filter(o => o.sent).map(o => o.id));
      // Serviço acelerado: cada etapa avança na próxima consulta (5 s).
      for (const [from, to] of [['PREPARING', 'READY'], ['PENDING', 'PREPARING']]) {
        await advance(cfg.kitchen, tickets.filter(t => owned.has(t.comandaId) && t.kdsStatus === from).map(t => t.id), to);
      }
      await sleep(5000);
    }
  }));
  cfg.cashiers.forEach(actor => workers.push(guarded(async () => {
    let nextTables = 0;
    while (shouldRun()) {
      if (performance.now() >= nextTables) {
        await request(actor, 'GET', '/v1/comandas?status=open');
        nextTables = performance.now() + 15000;
      }
      const order = orders.find(o => o.readyForCashier && !o.claimed);
      if (order) {
        order.claimed = true;
        const actual = await request(actor, 'GET', `/v1/comandas/${order.id}`);
        validateOrder(order, actual, products);
        ensure(actual.items.every(i => i.kdsStatus === 'DELIVERED'), 'Caixa recebeu item não entregue.');
        const body = {
          idempotencyKey: randomUUID(), comandaId: order.id, operatorId: actor.operatorId,
          cashRegisterId: actor.cashRegisterId, emitirNfce: false,
          items: actual.items.map(i => ({ productId: i.productId, quantity: Number(i.quantity), priceUnit: Number(i.unitPrice) })),
          payments: [{ method: 'dinheiro', value: order.totalCents / 100 }],
        };
        const sale = await request(actor, 'POST', '/sales/checkout', body);
        ensure(sale.id && cents(sale.total) === order.totalCents, 'Venda com total divergente.');
        ensure(Number.isInteger(sale.code) && !saleCodes.has(sale.code), 'Código sequencial de venda duplicado/ausente.');
        saleCodes.add(sale.code);
        // Reenvio após resposta: verifica idempotência, não simula corrida de dois caixas na mesma comanda.
        const replay = await request(actor, 'POST', '/sales/checkout', body, '/sales/checkout (replay)');
        ensure(replay.id === sale.id, 'Reenvio duplicou a venda.');
        const closed = await request(actor, 'GET', `/v1/comandas/${order.id}`);
        ensure(closed.status === 'closed', 'Comanda permaneceu aberta após pagamento.');
        order.closed = true;
      }
      await sleep(actionMs);
    }
  })));
  await Promise.all(workers);
  clearInterval(progress);
  ensure(!stopped && orders.every(o => o.closed), 'Execução interrompida ou prazo excedido; há comandas não concluídas.');
  const finalProducts = await productSnapshot(cfg.waiters[0]);
  for (const before of products) {
    const after = finalProducts.find(p => p.id === before.id);
    ensure(Math.abs(Number(after.stock) - (Number(before.stock) - count)) < 0.0001, `Estoque divergente no produto ${before.id}`);
  }
}

try { await run(); } catch (error) { stopped = true; failures.push(error.message); }
const percentile = (values, p) => values[Math.max(0, Math.ceil(values.length * p) - 1)];
const endpoints = Object.fromEntries([...samples].map(([key, values]) => {
  const times = values.map(v => v.ms).sort((a, b) => a - b);
  return [key, { requests: values.length, errors: values.filter(v => !v.ok).length,
    p50Ms: percentile(times, .5), p95Ms: percentile(times, .95), p99Ms: percentile(times, .99),
    maxMs: times.at(-1), bytes: values.reduce((sum, v) => sum + v.bytes, 0) }];
}));
const slow = Object.entries(endpoints).filter(([, m]) => m.p95Ms > (cfg.p95LimitMs ?? 2000)).map(([name]) => name);
const report = { runId, mode: 'API real; sem emissão fiscal; cozinha acelerada; produtos simples',
  waiters: cfg.waiters.length, cashiers: cfg.cashiers.length, kitchens: 1,
  backlog: cfg.backlog === true, actionMs, productsPerOrder: cfg.productIds.length,
  elapsedSeconds: (performance.now() - started) / 1000, planned: count,
  created: orders.length, closed: orders.filter(o => o.closed).length,
  failures, slowEndpoints: slow, endpoints, passed: !stopped && !failures.length && !slow.length && orders.length === count && orders.every(o => o.closed) };
writeFileSync(cfg.reportPath ?? `${runId}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
