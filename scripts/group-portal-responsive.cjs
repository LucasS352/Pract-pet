// Run against a local frontend: PORTAL_URL=http://127.0.0.1:4173 node scripts/group-portal-responsive.cjs
// Requires Playwright (PLAYWRIGHT_MODULE may point to an external installation).
// Every API request is mocked; this test never writes to tenant databases.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const output = process.env.PORTAL_QA_OUTPUT || path.join(os.tmpdir(), 'pdv-group-portal-qa');
const labels = { a: 'Loja Centro', b: 'Loja Jardim' };
const stock = { tenantLabels: labels, rows: [{ name: 'Café especial 500g', tenants: { a: { qty: 30, productId: 'pa', unit: 'UN' }, b: { qty: 2, productId: 'pb', unit: 'UN' } } }, { name: 'Produto novo sem vendas', tenants: { a: { qty: 0, productId: 'new', unit: 'UN' } } }] };
const dashboard = { groupId: 'g', groupName: 'Grupo demonstração', tenants: [{ tenantId: 'a', alias: labels.a, salesToday: 180, salesMonth: 2100, countToday: 6, countPeriod: 70, topProducts: [{ productId: 'pa', name: stock.rows[0].name, totalQty: 80 }] }, { tenantId: 'b', alias: labels.b, salesToday: 269.85, salesMonth: 900, countToday: 9, countPeriod: 30, topProducts: [{ productId: 'pb', name: stock.rows[0].name, totalQty: 20 }] }], salesByDate: Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, total: 30 + i * 5 })), salesByHour: Array.from({ length: 24 }, (_, i) => ({ hour: `${i}h`, total: 15 + i * 3 })), salesByWeek: [{ name: '01/09 a 07/09', total: 600 }], salesByMonth: [{ name: 'Set', total: 3000 }], payments: [{ method: 'pix', total: 3000 }] };
const catalog = { tenantLabels: labels, rows: stock.rows.map(r => ({ name: r.name, tenants: Object.fromEntries(Object.entries(r.tenants).map(([id, c]) => [id, { id: c.productId, priceSell: 30, priceCost: 10, unit: c.unit, stock: c.qty }])) })) };

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PORTAL_BROWSER || 'msedge', headless: true });
  const report = [];
  try {
    for (const width of [360, 375, 390, 412, 420, 768, 1440]) {
      const mobile = width < 768;
      const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 1000 }, hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block' });
      await context.addInitScript(() => localStorage.setItem('7bar-auth', JSON.stringify({ state: { token: 'local-test-only', user: { id: 'qa', name: 'Lucas Soares', role: 'group_owner', groupId: 'g', tenant: 'a', termsAccepted: true } }, version: 0 })));
      let failTransfer = true;
      let transferred = false;
      let priceUpdates;
      let createdProduct;
      let adjustedStock;
      await context.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const p = url.pathname.replace('/api/groups/my/', '');
        let data = {}; let status = 200;
        if (p === 'dashboard') data = dashboard;
        else if (p === 'stock') data = stock;
        else if (p.startsWith('tenant-detail/')) data = { tenantId: 'a', alias: labels.a, criticalStock: [{ id: 'p', name: 'Água mineral', stock: 2, unit: 'UN' }], recentSales: Array.from({ length: 8 }, (_, i) => ({ id: String(i), total: 30, createdAt: '2026-10-09T15:00:00Z', itemsCount: 2, firstItems: ['Café', 'Água'], payments: [{ method: 'pix', value: 30 }] })) };
        else if (p === 'purchase-forecast') data = [{ productId: 'f', name: 'Café especial 500g', totalStock: 32, avgDailySales: 4, autonomyDays: 8, suggestion: 28 }, { productId: 'new', name: 'Produto novo sem vendas', totalStock: 0, avgDailySales: 0, autonomyDays: null, suggestion: 0 }];
        else if (p === 'products-catalog') data = catalog;
        else if (p === 'products/sync-status') data = { tenantLabels: labels, missingProducts: [{ name: 'Produto novo sem vendas', presentIn: ['a'], missingIn: ['b'] }] };
        else if (p === 'products/sync') data = { results: [{ tenantId: 'b', name: 'Produto novo sem vendas', success: false, error: 'Loja indisponível' }] };
        else if (p === 'products/price-per-tenant') { priceUpdates = request.postDataJSON().updates; data = { results: priceUpdates.map(u => ({ tenantId: u.tenantId, success: true })) }; }
        else if (p === 'products/create-in-tenants') { createdProduct = request.postDataJSON(); data = { results: createdProduct.tenantPrices.map(u => ({ tenantId: u.tenantId, success: true })) }; }
        else if (p === 'stock-adjust') { adjustedStock = request.postDataJSON(); data = { success: true }; }
        else if (p === 'stock-transfers') data = { transfers: transferred ? [{ id: 't', productName: stock.rows[0].name, unit: 'UN', quantity: 3, fromAlias: labels.a, toAlias: labels.b, createdAt: '2026-10-09T15:00:00Z', status: 'completed' }] : [], unavailableTenants: [] };
        else if (p === 'stock-transfer') { if (failTransfer) { status = 400; data = { message: 'Produto ausente no destino. Nenhum saldo foi debitado.' }; failTransfer = false; } else { transferred = true; data = { success: true }; } }
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const checkWidth = async label => {
        const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
        assert(dimensions.scroll <= dimensions.width + 1, `${width}px ${label}: overflow ${JSON.stringify(dimensions)}`);
        const dialog = page.locator('dialog[open]');
        if (await dialog.count()) {
          const bounds = await dialog.boundingBox();
          assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${label}: dialog out of viewport`);
          assert(await dialog.getByRole('button', { name: 'Fechar', exact: true }).isVisible(), `${label}: close missing`);
        }
      };
      const nav = page.locator(mobile ? '.gp-bottom-nav' : '.gp-sidebar nav');
      const tab = async name => { console.log(`${width}px: opening ${name}`); await nav.getByRole('button', { name, exact: true }).click(); };
      await page.goto(process.env.PORTAL_URL || 'http://127.0.0.1:4173/grupo-portal');
      await page.getByRole('heading', { name: 'Grupo demonstração' }).waitFor();
      await page.locator('.recharts-surface').first().waitFor();
      assert.equal(await page.locator('.gp-sidebar').isVisible(), !mobile);
      assert.equal(await page.locator('.gp-bottom-nav').isVisible(), mobile);
      assert((await page.locator('.gp-kpis').innerText()).includes('30,00'), 'Period average should be 3000 / 100');
      await checkWidth('dashboard');
      await page.screenshot({ path: path.join(output, `dashboard-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Ver detalhes de Loja Centro' }).click();
      await page.getByText('Vendas Recentes', { exact: true }).waitFor(); await checkWidth('store sheet');
      await page.screenshot({ path: path.join(output, `store-${width}.png`) });
      await page.keyboard.press('Escape');
      await tab(mobile ? 'Compras' : 'Previsão de compras');
      await page.getByRole('heading', { name: 'Previsão de compras' }).waitFor();
      await page.getByText('Produto novo sem vendas', { exact: true }).filter({ visible: true }).waitFor();
      if (mobile) await page.locator('summary').filter({ hasText: 'Produto novo' }).click();
      assert(await page.getByText('Sem histórico', { exact: true }).filter({ visible: true }).isVisible());
      await checkWidth('forecast'); await page.screenshot({ path: path.join(output, `forecast-${width}.png`), fullPage: true });
      await tab('Estoque'); await page.getByRole('heading', { name: 'Estoque consolidado' }).waitFor();
      await page.getByLabel('Buscar produto', { exact: true }).fill('Café');
      await page.waitForTimeout(220); await page.getByLabel('Loja', { exact: true }).selectOption('b');
      await checkWidth('stock'); await page.screenshot({ path: path.join(output, `stock-${width}.png`), fullPage: true });
      if (mobile) await page.locator('.gp-stock-badges button').filter({ visible: true }).first().click();
      else await page.locator('.gp-stock-table tbody button').first().click();
      await page.getByLabel('Novo saldo').fill('4.125');
      await page.getByRole('button', { name: 'Salvar saldo', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.equal(adjustedStock.tenantId, 'b'); assert.equal(adjustedStock.productId, 'pb'); assert.equal(adjustedStock.expectedStock, 2); assert.equal(adjustedStock.newStock, 4.125);
      await page.getByRole('button', { name: /Sincronizar produtos/ }).click();
      await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Sincronizar selecionados' }).click();
      await page.getByText('Loja Jardim · Produto novo sem vendas: Loja indisponível', { exact: false }).waitFor(); await checkWidth('sync result');
      await page.getByRole('button', { name: 'Fechar', exact: true }).click();
      await tab('Produtos'); await page.getByRole('heading', { name: 'Produtos do grupo' }).waitFor();
      if (mobile) await page.locator('.gp-product-card').first().click(); else await page.getByRole('button', { name: 'Editar / Equalizar' }).first().click();
      await page.getByRole('checkbox', { name: 'Loja Jardim' }).uncheck();
      await page.getByRole('spinbutton', { name: 'Preço em Loja Centro' }).fill('31.50');
      await checkWidth('price sheet'); await page.screenshot({ path: path.join(output, `prices-${width}.png`) });
      await page.getByRole('button', { name: 'Salvar preços selecionados' }).click();
      await page.getByText('Resultado por loja', { exact: true }).waitFor();
      assert.deepEqual(priceUpdates, [{ tenantId: 'a', productId: 'pa', priceSell: 31.5 }]);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Criar produto', exact: true }).click();
      await page.getByLabel('Nome do produto', { exact: true }).fill('Produto mobile QA');
      await page.getByLabel('Código de barras', { exact: true }).fill('7890000000003');
      await page.getByLabel('Preço de custo', { exact: true }).fill('0');
      await page.getByRole('checkbox', { name: 'Loja Jardim' }).uncheck();
      await page.getByRole('spinbutton', { name: 'Preço em Loja Centro' }).fill('9.90');
      await checkWidth('create product'); await page.screenshot({ path: path.join(output, `create-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Criar nas lojas selecionadas' }).click();
      await page.getByText('Resultado por loja', { exact: true }).waitFor();
      assert.equal(createdProduct.name, 'Produto mobile QA'); assert.equal(createdProduct.priceCost, 0); assert.deepEqual(createdProduct.tenantPrices, [{ tenantId: 'a', priceSell: 9.9 }]);
      await page.keyboard.press('Escape');
      await tab(mobile ? 'Transf.' : 'Transferências');
      await page.getByLabel('1. Loja de origem').selectOption('a'); await page.getByLabel('2. Loja de destino').selectOption('b');
      await page.getByLabel('3. Produto e saldo disponível').selectOption('pa');
      await page.getByLabel('4. Quantidade').fill('0'); assert(await page.getByRole('button', { name: 'Confirmar transferência' }).isDisabled());
      await page.getByLabel('4. Quantidade').fill('31'); assert(await page.getByRole('button', { name: 'Confirmar transferência' }).isDisabled());
      await page.getByLabel('4. Quantidade').fill('3'); await page.getByRole('button', { name: 'Confirmar transferência' }).click();
      await page.getByText('Produto ausente no destino. Nenhum saldo foi debitado.', { exact: true }).waitFor();
      assert.equal(await page.getByText('Transferência concluída.', { exact: false }).count(), 0);
      await page.getByRole('button', { name: 'Confirmar transferência' }).click();
      await page.getByText('Transferência concluída. Os saldos foram atualizados.', { exact: true }).waitFor();
      await page.getByText('Concluída', { exact: true }).waitFor(); await checkWidth('transfer');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `transfers-${width}.png`), fullPage: true });
      if (mobile) { await page.getByRole('button', { name: 'Abrir menu' }).click(); await checkWidth('account drawer'); await page.keyboard.press('Escape'); }
      else { await page.getByRole('button', { name: 'Recolher menu' }).click(); assert.equal(Math.round((await page.locator('.gp-sidebar').boundingBox()).width), 76); await checkWidth('collapsed'); }
      assert.deepEqual(errors, []);
      report.push({ width, status: 'passed', consoleErrors: errors.length });
      console.log(`${width}px: all five tabs, sheets, price selection, sync failure and transfer success/error passed`);
      await context.close();
    }
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Screenshots and report: ${output}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
