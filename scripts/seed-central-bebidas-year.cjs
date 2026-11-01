// Carga sintética reversível para o tenant local central_bebidas.
// Uso para criar/recriar: node scripts/seed-central-bebidas-year.cjs --apply
// Uso para remover somente a carga: node scripts/seed-central-bebidas-year.cjs --clean
// Remove/recria SOMENTE registros cujo ID começa com qa-year-.
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const mysql = require(path.resolve(__dirname, '../backend/node_modules/mysql2/promise'));

const DATABASE = 'central_bebidas';
const PREFIX = 'qa-year-';
const DAY = 86_400_000;
const apply = process.argv.includes('--apply');
const clean = process.argv.includes('--clean');
if (apply === clean) {
  console.error('Escolha exatamente uma ação: --apply ou --clean.');
  process.exit(2);
}

function rngFactory(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = rngFactory(0x7ba42026);
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
const round4 = value => Math.round((value + Number.EPSILON) * 10_000) / 10_000;
const pad = value => String(value).padStart(2, '0');
const dateOnly = time => new Date(time).toISOString().slice(0, 10);
const monthKey = date => date.slice(0, 7);
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const weightedPick = (values, weight) => {
  const weights = values.map(weight);
  let cursor = rng() * weights.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < values.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return values[i];
  }
  return values[values.length - 1];
};
const chunks = (values, size = 750) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));
async function bulkInsert(connection, table, columns, rows) {
  for (const batch of chunks(rows)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    await connection.query(`INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(',')}) VALUES ${placeholders}`, batch.flat());
  }
}

(async () => {
  const inspect = JSON.parse(cp.execFileSync('docker', ['inspect', '7bar_mysql'], { encoding: 'utf8' }))[0];
  const passwordEntry = inspect.Config.Env.find(value => value.startsWith('MYSQL_ROOT_PASSWORD='));
  assert(passwordEntry, 'MySQL local sem credencial configurada');
  const published = inspect.NetworkSettings.Ports['3306/tcp'];
  assert(published?.some(binding => binding.HostPort === '3308'), 'Carga permitida somente no MySQL Docker local da porta 3308');
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3308, user: 'root',
    password: passwordEntry.slice(passwordEntry.indexOf('=') + 1), database: DATABASE, charset: 'utf8mb4',
    decimalNumbers: true, multipleStatements: false });

  try {
    const [[database]] = await connection.query('SELECT DATABASE() AS name');
    assert.equal(database.name, DATABASE);
    if (clean) {
      await connection.beginTransaction();
      try {
        const [deletedSales] = await connection.execute('DELETE FROM sales WHERE id LIKE ?', [`${PREFIX}%`]);
        const [deletedLots] = await connection.execute('DELETE FROM stock_lots WHERE id LIKE ?', [`${PREFIX}%`]);
        await connection.commit();
        console.log(JSON.stringify({ database: DATABASE, removedSyntheticSales: deletedSales.affectedRows,
          removedSyntheticLots: deletedLots.affectedRows }, null, 2));
        return;
      } catch (error) {
        await connection.rollback(); throw error;
      }
    }
    const [productsRaw] = await connection.query(`
      SELECT p.id, p.name, p.unit, p.priceCost, p.priceSell, p.salesCount,
        c.id AS categoryId, c.name AS categoryName
      FROM products p JOIN categories c ON c.id = p.categoryId
      WHERE p.active = 1 AND p.isComposite = 0 AND p.priceCost > 0 AND p.priceSell > 0
        AND p.name NOT LIKE '%Apenas o Líquido%'
      ORDER BY p.salesCount DESC, p.name
    `);
    assert(productsRaw.length >= 40, 'São necessários pelo menos 40 produtos ativos com custo e venda');

    // Amostra estratificada: até quatro líderes de cada categoria, limitada a 60 produtos.
    const perCategory = new Map();
    for (const product of productsRaw) {
      const list = perCategory.get(product.categoryId) || [];
      if (list.length < 4) list.push({ ...product, category: normalize(product.categoryName) });
      perCategory.set(product.categoryId, list);
    }
    const products = [...perCategory.values()].flat().slice(0, 60);
    assert(products.length >= 40);

    const todaySp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const endTime = Date.parse(`${todaySp}T00:00:00Z`) - DAY;
    const startTime = endTime - 364 * DAY;
    const startDate = dateOnly(startTime), endDate = dateOnly(endTime);
    const months = [...new Set(Array.from({ length: 365 }, (_, i) => monthKey(dateOnly(startTime + i * DAY))))];

    const sales = [], items = [], payments = [], consumptions = [];
    const lotUsage = new Map();
    const monthlySaleStats = new Map();
    const methods = [
      { method: 'dinheiro', label: 'Dinheiro', tPag: '01', weight: 28 },
      { method: 'pix', label: 'PIX', tPag: '17', weight: 34 },
      { method: 'debito', label: 'Cartão de débito', tPag: '04', weight: 20 },
      { method: 'credito', label: 'Cartão de crédito', tPag: '03', weight: 18 },
    ];

    let saleSequence = 0, itemSequence = 0, paymentSequence = 0, consumptionSequence = 0;
    for (let dayIndex = 0; dayIndex < 365; dayIndex++) {
      const dayTime = startTime + dayIndex * DAY;
      const date = dateOnly(dayTime);
      const utcDate = new Date(dayTime);
      const weekday = utcDate.getUTCDay();
      const month = utcDate.getUTCMonth() + 1;
      const monthIndex = months.indexOf(monthKey(date));
      const warm = [11, 12, 1, 2, 3].includes(month);
      const weekendBase = [15, 10, 11, 13, 16, 25, 31][weekday];
      const special = (date.endsWith('-12-23') || date.endsWith('-12-24') || date.endsWith('-12-30') || date.endsWith('-12-31')) ? 18
        : (date.endsWith('-06-12') || date.endsWith('-09-06') || date.endsWith('-09-07')) ? 10 : 0;
      const dailySales = Math.max(4, Math.round((weekendBase + special) * (warm ? 1.12 : 0.94) * (0.85 + rng() * 0.3)));
      const spotlight = products[(monthIndex * 7) % products.length];

      for (let saleOfDay = 0; saleOfDay < dailySales; saleOfDay++) {
        saleSequence++;
        const saleId = `${PREFIX}sale-${date.replaceAll('-', '')}-${String(saleOfDay).padStart(3, '0')}`;
        const localHour = weightedPick([10, 12, 14, 16, 18, 19, 20, 21, 22, 23], hour => hour >= 18 ? 4 : hour >= 14 ? 2 : 1);
        const minute = Math.floor(rng() * 60), second = Math.floor(rng() * 60);
        const createdAt = new Date(dayTime + (localHour + 3) * 3_600_000 + minute * 60_000 + second * 1_000)
          .toISOString().slice(0, 23).replace('T', ' ');
        const itemCount = weightedPick([1, 2, 3, 4, 5], value => [0, 42, 32, 16, 7, 3][value]);
        const selected = new Set();
        while (selected.size < itemCount) {
          const product = weightedPick(products, candidate => {
            let weight = 1 + Math.min(3, Number(candidate.salesCount || 0) / 100);
            if (candidate.id === spotlight.id) weight *= 11;
            if (warm && /(cerveja|gelo|refrigerante|energetico|agua)/.test(candidate.category)) weight *= 2.2;
            if (!warm && /(whisky|vinho|licor|chocolate)/.test(candidate.category)) weight *= 2.3;
            if (weekday >= 5 && /(cerveja|vodka|gin|ice|energetico)/.test(candidate.category)) weight *= 1.7;
            return weight;
          });
          selected.add(product);
        }

        const cancelled = rng() < 0.022;
        let subtotal = 0;
        const saleItems = [];
        for (const product of selected) {
          itemSequence++;
          const bulkCategory = /(cerveja|refrigerante|agua|gelo)/.test(product.category);
          const quantity = bulkCategory ? weightedPick([1, 2, 3, 6, 12], value => ({ 1: 35, 2: 25, 3: 15, 6: 18, 12: 7 })[value]) : weightedPick([1, 2, 3], value => ({ 1: 70, 2: 23, 3: 7 })[value]);
          const costFactor = 0.84 + monthIndex * 0.0125 + Math.sin((monthIndex + products.indexOf(product)) * 1.7) * 0.035;
          const cost = round4(Math.max(0.01, Number(product.priceCost) * costFactor));
          const sellFactor = 0.88 + monthIndex * 0.009 + Math.sin((monthIndex + products.indexOf(product)) * 0.9) * 0.018;
          const unitPrice = round4(Math.max(cost * 1.18, Number(product.priceSell) * sellFactor));
          const lineSubtotal = round2(unitPrice * quantity);
          subtotal = round2(subtotal + lineSubtotal);
          const itemId = `${PREFIX}item-${String(itemSequence).padStart(8, '0')}`;
          saleItems.push([itemId, saleId, product.id, product.name, product.unit, quantity, unitPrice, 0, lineSubtotal, cost, 0]);

          if (!cancelled) {
            const key = `${product.id}|${monthKey(date)}`;
            const usage = lotUsage.get(key) || { product, month: monthKey(date), cost, quantity: 0 };
            usage.quantity += quantity; lotUsage.set(key, usage);
            consumptions.push([`${PREFIX}cons-${String(++consumptionSequence).padStart(8, '0')}`, itemId,
              `${PREFIX}lot-${product.id}-${monthKey(date).replace('-', '')}`, quantity]);
            const statKey = `${monthKey(date)}|${product.id}`;
            const stat = monthlySaleStats.get(statKey) || { month: monthKey(date), product: product.name, quantity: 0, revenue: 0 };
            stat.quantity += quantity; stat.revenue = round2(stat.revenue + lineSubtotal); monthlySaleStats.set(statKey, stat);
          }
        }
        items.push(...saleItems);

        const discount = rng() < 0.16 ? round2(subtotal * (0.02 + rng() * 0.08)) : 0;
        const addition = rng() < 0.035 ? round2(subtotal * (0.01 + rng() * 0.035)) : 0;
        const total = round2(Math.max(0.01, subtotal - discount + addition));
        sales.push([saleId, subtotal, discount, addition, total, cancelled ? 'cancelled' : 'completed', 'pdv', 0,
          createdAt, createdAt, cancelled ? 'Cancelamento sintético para análise' : null, cancelled ? createdAt : null,
          `synthetic-year-v1|${saleId}`]);

        const primary = weightedPick(methods, method => method.weight);
        if (!cancelled && rng() < 0.045 && total >= 20) {
          const secondary = weightedPick(methods.filter(method => method.method !== primary.method), method => method.weight);
          const firstValue = round2(total * (0.3 + rng() * 0.4));
          payments.push([`${PREFIX}pay-${String(++paymentSequence).padStart(8, '0')}`, saleId, primary.tPag, primary.method, primary.label, firstValue, 0]);
          payments.push([`${PREFIX}pay-${String(++paymentSequence).padStart(8, '0')}`, saleId, secondary.tPag, secondary.method, secondary.label, round2(total - firstValue), 0]);
        } else if (!cancelled) {
          payments.push([`${PREFIX}pay-${String(++paymentSequence).padStart(8, '0')}`, saleId, primary.tPag, primary.method, primary.label, total, 0]);
        }
      }
    }

    const lots = [...lotUsage.values()].map(usage => [`${PREFIX}lot-${usage.product.id}-${usage.month.replace('-', '')}`,
      usage.product.id, usage.cost, round4(usage.quantity), 0, `QA-${usage.month}-${usage.product.id.slice(0, 6)}`,
      `${usage.month}-01 12:00:00.000`, `${usage.month}-01 12:00:00.000`]);

    await connection.beginTransaction();
    try {
      // Limpeza estritamente limitada à carga anterior deste script.
      await connection.execute('DELETE FROM sales WHERE id LIKE ?', [`${PREFIX}%`]);
      await connection.execute('DELETE FROM stock_lots WHERE id LIKE ?', [`${PREFIX}%`]);
      await bulkInsert(connection, 'sales', ['id', 'subtotal', 'discount', 'addition', 'total', 'status', 'source', 'emitirNfce',
        'createdAt', 'updatedAt', 'cancelReason', 'cancelledAt', 'requestFingerprint'], sales);
      await bulkInsert(connection, 'sale_items', ['id', 'saleId', 'productId', 'productName', 'unit', 'quantity', 'priceUnit',
        'discount', 'subtotal', 'priceCost', 'settled'], items);
      await bulkInsert(connection, 'payments', ['id', 'saleId', 'tPag', 'method', 'label', 'value', 'troco'], payments);
      await bulkInsert(connection, 'stock_lots', ['id', 'productId', 'costPrice', 'quantity', 'remaining', 'lotNumber', 'createdAt', 'updatedAt'], lots);
      await bulkInsert(connection, 'stock_lot_consumptions', ['id', 'saleItemId', 'lotId', 'quantity'], consumptions);
      await connection.commit();
    } catch (error) {
      await connection.rollback(); throw error;
    }

    const completed = sales.filter(row => row[5] === 'completed');
    const revenue = completed.reduce((sum, row) => sum + row[4], 0);
    const topByMonth = months.map(month => [...monthlySaleStats.values()].filter(stat => stat.month === month)
      .sort((a, b) => b.revenue - a.revenue)[0]).filter(Boolean);
    console.log(JSON.stringify({ database: DATABASE, period: { startDate, endDate, days: 365 }, selectedProducts: products.length,
      sales: sales.length, completedSales: completed.length, cancelledSales: sales.length - completed.length,
      saleItems: items.length, payments: payments.length, historicalLots: lots.length, lotConsumptions: consumptions.length,
      revenue: round2(revenue), averageTicket: round2(revenue / completed.length),
      monthlyLeaders: topByMonth.map(stat => ({ month: stat.month, product: stat.product, quantity: stat.quantity, revenue: stat.revenue })) }, null, 2));
  } finally {
    await connection.end();
  }
})().catch(error => {
  console.error(`Falha na carga sintética: ${error.message}`);
  process.exitCode = 1;
});
