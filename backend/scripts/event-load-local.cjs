// Fixture exclusiva do banco local autorizado rei_adegas. Rodar dentro de 7bar_backend.
// Não altera schema nem produtos/operadores existentes. Mantém evidências identificadas por LOAD.
const { PrismaClient: Heart } = require('/app/src/generated/heart-client');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { JwtService } = require('/app/node_modules/@nestjs/jwt');
const bcrypt = require('/app/node_modules/bcrypt');
const { randomUUID } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { spawn } = require('node:child_process');

(async () => {
  if (process.env.LOAD_LOCAL_REI_ADEGAS !== 'yes') throw new Error('Fixture local não habilitada.');
  const heart = new Heart();
  let db;
  try {
    const tenant = await heart.tenant.findFirst({ where: { databaseName: 'rei_adegas' } });
    if (!tenant || new URL(tenant.databaseUrl).hostname !== 'mysql') throw new Error('Banco local incorreto.');
    if (await heart.tenantIntegration.count({ where: { tenantId: tenant.id } })) throw new Error('Há integrações no tenant; revisar antes do teste.');
    const user = await heart.user.findFirst({ where: { tenantId: tenant.id, active: true } });
    if (!user) throw new Error('Usuário de teste ausente.');
    db = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } });
    const label = `LOAD-${Date.now()}`;
    const category = await db.category.create({ data: { name: label } });
    const productIds = [];
    for (const [name, price, kitchen, bar] of [['Comida', 25, true, false], ['Bar', 15, false, true], ['Bebida', 5, false, false]]) {
      const p = await db.product.create({ data: {
        name: `${label} ${name}`, categoryId: category.id, priceCost: 1, priceSell: price,
        stock: 10000, requiresKitchen: kitchen, requiresBar: bar, emiteNfce: false,
      } });
      productIds.push(p.id);
    }
    const tokenEnv = {};
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    function actor(index, extra = {}) {
      const key = `LOAD_TOKEN_${index}`;
      tokenEnv[key] = jwt.sign({ sub: user.id, tenantId: tenant.id, email: user.email, role: user.role, jti: randomUUID() }, { expiresIn: '2h' });
      return { tokenEnv: key, ...extra };
    }
    const waiters = [], cashiers = [];
    const scale = Number(process.env.LOAD_SCALE || 1);
    if (![1, 2].includes(scale)) throw new Error('LOAD_SCALE deve ser 1 ou 2.');
    const pin = await bcrypt.hash(randomUUID(), 10);
    for (let i = 0; i < 6 * scale; i++) {
      const isWaiter = i < 4 * scale;
      const operator = await db.operator.create({ data: { name: `${label} ${isWaiter ? 'Garçom' : 'Caixa'} ${i + 1}`, pin, jobTitle: isWaiter ? 'Garçom' : 'Caixa' } });
      const session = actor(i, { operatorId: operator.id });
      if (isWaiter) waiters.push(session);
      else {
        const res = await fetch('http://127.0.0.1:3520/api/cash-registers/open', {
          method: 'POST', headers: { Authorization: `Bearer ${tokenEnv[session.tokenEnv]}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ openingValue: 0, operatorId: operator.id }),
        });
        if (!res.ok) throw new Error(`Abrir caixa: HTTP ${res.status}`);
        session.cashRegisterId = (await res.json()).id;
        cashiers.push(session);
      }
    }
    const config = {
      baseUrl: 'http://127.0.0.1:3520/api', tenantId: tenant.id, confirmTestTenant: tenant.id,
      integrationsDisabled: true, orders: Number(process.env.LOAD_ORDERS || 300),
      backlog: process.env.LOAD_BACKLOG === 'yes',
      actionMs: Number(process.env.LOAD_ACTION_MS || 3000), maxSeconds: 1800,
      productIds, waiters, cashiers, kitchen: actor(6 * scale), reportPath: `/tmp/${label}-report.json`,
    };
    const path = `/tmp/${label}-config.json`;
    writeFileSync(path, JSON.stringify(config, null, 2));
    console.log(JSON.stringify({ fixture: label, configPath: path, reportPath: config.reportPath, productIds }));
    await db.$disconnect(); db = null;
    await heart.$disconnect();
    const runner = process.env.LOAD_NARGUILARIA === 'yes' ? '/tmp/narguilaria-local.mjs' : process.env.LOAD_PROBE === 'yes' ? '/tmp/event-concurrency.mjs' : '/tmp/event-load.mjs';
    const child = spawn(process.execPath, [runner, path], { stdio: 'inherit', env: { ...process.env, ...tokenEnv } });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } finally {
    if (db) await db.$disconnect();
    await heart.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
