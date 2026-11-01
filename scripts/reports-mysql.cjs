// Fixtures exclusivas em bancos temporários locais. Não usa migrate/db push.
// Executar após build do backend: node scripts/reports-mysql.cjs
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const backend = path.resolve(__dirname, '../backend');
const mysql = require(path.join(backend, 'node_modules/mysql2/promise'));
const { PrismaClient } = require(path.join(backend, 'node_modules/@prisma/client'));
const { ReportsService } = require(path.join(backend, 'dist/reports/reports.service'));
const { TenantContextService } = require(path.join(backend, 'dist/prisma/tenant-context.service'));

(async () => {
  const inspect = JSON.parse(cp.execFileSync('docker', ['inspect', '7bar_backend'], { encoding: 'utf8' }))[0];
  const entry = inspect.Config.Env.find(v => v.startsWith('DATABASE_URL_TENANT='));
  assert(entry, 'Container local não encontrado/configurado');
  const base = new URL(entry.slice(entry.indexOf('=') + 1));
  assert.equal(base.hostname, 'mysql');
  // Jamais usar host/porta vindos de configuração de produção.
  base.hostname = '127.0.0.1'; base.port = '3308';
  const admin = await mysql.createConnection({ host: '127.0.0.1', port: 3308,
    user: decodeURIComponent(base.username), password: decodeURIComponent(base.password) });
  const created = [], clients = new Map();
  const context = new TenantContextService();
  const service = new ReportsService({ getTenantClient: async id => {
    assert(clients.has(id)); return clients.get(id);
  } }, context);
  const names = ['a', 'b'].map(suffix => `reports_qa_${Date.now()}_${suffix}`);
  const read = id => context.run({ tenantId: id, databaseUrl: 'fixture', userId: 'test' },
    () => service.sales('2026-01-01', '2026-01-01'));
  try {
    for (const name of names) {
      assert(/^reports_qa_\d+_[ab]$/.test(name));
      await admin.query(`CREATE DATABASE \`${name}\``); created.push(name);
      await admin.query(`CREATE TABLE \`${name}\`.sales (
        id VARCHAR(191) PRIMARY KEY, total DECIMAL(10,2), discount DECIMAL(10,2),
        addition DECIMAL(10,2), status VARCHAR(191), source VARCHAR(191),
        createdAt DATETIME(3), INDEX(createdAt))`);
      await admin.query(`CREATE TABLE \`${name}\`.sale_items (
        id VARCHAR(191) PRIMARY KEY, saleId VARCHAR(191), productId VARCHAR(191),
        productName VARCHAR(191), unit VARCHAR(191), quantity DECIMAL(10,3),
        subtotal DECIMAL(10,2), INDEX(saleId))`);
      const url = new URL(base); url.pathname = `/${name}`;
      clients.set(name, new PrismaClient({ datasources: { db: { url: url.toString() } } }));
    }
    const [a, b] = names;
    const rows = [
      ['first', '100.01', '9.99', '2.00', 'completed', 'pdv', '2026-01-01 03:00:00.000'],
      ['last', '20.00', '0.00', '0.00', 'completed', 'pdv', '2026-01-02 02:59:59.999'],
      ['before', '999.00', '0', '0', 'completed', 'pdv', '2026-01-01 02:59:59.999'],
      ['after', '999.00', '0', '0', 'completed', 'pdv', '2026-01-02 03:00:00.000'],
      ['cancel', '999.00', '0', '0', 'cancelled', 'pdv', '2026-01-01 12:00:00.000'],
      ['fiscal', '999.00', '0', '0', 'completed', 'ajuste_fiscal', '2026-01-01 12:00:00.000'],
      ['pending', '999.00', '0', '0', 'pending', 'pdv', '2026-01-01 12:00:00.000'],
    ];
    await admin.query(`INSERT INTO \`${a}\`.sales VALUES ?`, [rows]);
    await admin.query(`INSERT INTO \`${a}\`.sale_items VALUES ?`, [rows.map((row, i) =>
      [row[0], row[0], 'p', i === 0 ? 'Nome antigo' : 'Nome novo', 'KG', i === 0 ? '1.234' : '2.000', i === 0 ? '108.00' : row[1]])]);
    const snapshot = async () => JSON.stringify(await Promise.all([
      admin.query(`SELECT * FROM \`${a}\`.sales ORDER BY id`).then(([rows]) => rows),
      admin.query(`SELECT * FROM \`${a}\`.sale_items ORDER BY id`).then(([rows]) => rows),
    ]));
    const before = await snapshot();
    const [report, empty] = await Promise.all([read(a), read(b)]);
    assert.deepEqual(report.summary, { revenue: '120.01', transactions: 2, averageTicket: '60.01', saleDiscounts: '9.99', saleAdditions: '2.00' });
    assert.equal(report.products.length, 2);
    assert.deepEqual(report.products[0], { productId: 'p', name: 'Nome antigo', unit: 'KG', quantity: '1.234', itemSubtotal: '108.00' });
    assert.equal(empty.summary.transactions, 0); assert.equal(empty.summary.averageTicket, '0.00');
    assert.deepEqual(empty.products, []);
    assert.deepEqual(report.daily, [{ date: '2026-01-01', revenue: '120.01', transactions: 2 }]);
    assert.deepEqual(report.comparison, { startDate: '2025-12-31', endDate: '2025-12-31', days: 1,
      revenue: '999.00', transactions: 1, averageTicket: '999.00', revenueDifference: '-878.99',
      revenueChangePercent: '-87.99', includesOpenDays: false });
    assert.deepEqual(empty.daily, [{ date: '2026-01-01', revenue: '0.00', transactions: 0 }]);
    assert.equal(empty.comparison.revenueChangePercent, null);
    const multiDay = await context.run({ tenantId: a, databaseUrl: 'fixture', userId: 'test' },
      () => service.sales('2026-01-01', '2026-01-03'));
    assert.deepEqual(multiDay.daily, [
      { date: '2026-01-01', revenue: '120.01', transactions: 2 },
      { date: '2026-01-02', revenue: '999.00', transactions: 1 },
      { date: '2026-01-03', revenue: '0.00', transactions: 0 },
    ]);
    assert.equal(multiDay.summary.revenue, '1119.01');
    console.log('PASS MySQL: agregação diária UTC-03, dia vazio, comparação sem sobreposição e reconciliação com total.');
    assert.equal(await snapshot(), before, 'Consulta não pode modificar dados');
    console.log('PASS MySQL: limites UTC-03, milissegundos, cancelamentos, ajustes fiscais, pendentes, decimais, snapshots, isolamento concorrente, vazio e somente leitura.');
    await admin.query(`INSERT INTO \`${a}\`.sale_items VALUES ?`, [Array.from({ length: 25 }, (_, i) =>
      [`extra-${i}`, 'first', `p-${i}`, `Produto ${i}`, 'UN', '1', String(200 + i)])]);
    const ranked = await read(a);
    assert.equal(ranked.products.length, 20);
    assert.equal(ranked.products[0].itemSubtotal, '224.00');
    assert.equal(ranked.summary.revenue, '120.01', 'Itens não podem multiplicar total de vendas');
    console.log('PASS MySQL: ranking limitado/ordenado e total sem multiplicação por itens.');
  } finally {
    for (const client of clients.values()) await client.$disconnect();
    for (const name of created) {
      assert(names.includes(name) && /^reports_qa_\d+_[ab]$/.test(name));
      await admin.query(`DROP DATABASE \`${name}\``);
    }
    await admin.end();
    console.log('Bancos temporários removidos.');
  }
})().catch(() => { console.error('FAIL reports MySQL (detalhes de conexão omitidos).'); process.exitCode = 1; });
