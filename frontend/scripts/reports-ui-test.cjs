// APIs simuladas: não autentica em loja real nem altera dados.
// PLAYWRIGHT_MODULE pode apontar para a instalação compartilhada do Playwright.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const base = process.env.REPORTS_QA_URL || 'http://127.0.0.1:4186';
const output = path.join(os.tmpdir(), 'teltech-reports-qa');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
      await context.addInitScript(() => localStorage.setItem('7bar-auth', JSON.stringify({ state: {
        token: 'fixture', user: { id: 'qa', name: 'Teste', role: 'admin', tenant: 'qa', termsAccepted: true },
      }, version: 0 })));
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let mode = 'success', calls = 0;
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/reports/sales') {
          calls++; assert.equal(route.request().method(), 'GET');
          const startDate = url.searchParams.get('startDate'), endDate = url.searchParams.get('endDate');
          const dayMs = 86_400_000;
          const days = (Date.parse(endDate) - Date.parse(startDate)) / dayMs + 1;
          const dateAt = offset => new Date(Date.parse(startDate) + offset * dayMs).toISOString().slice(0, 10);
          if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'Fixture indisponível' } });
          if (mode === 'race' && startDate === '2026-01-01') await new Promise(resolve => setTimeout(resolve, 600));
          return route.fulfill({ json: {
            period: { startDate, endDate, days, timezone: 'UTC-03:00', includesOpenDays: true }, productLimit: 20,
            daily: Array.from({ length: days }, (_, index) => ({ date: dateAt(index),
              revenue: mode === 'empty' || index > 0 ? '0.00' : '120.01', transactions: mode === 'empty' || index > 0 ? 0 : 2 })),
            comparison: { startDate: dateAt(-days), endDate: dateAt(-1), days,
              revenue: mode === 'empty' ? '0.00' : '100.00', transactions: mode === 'empty' ? 0 : 2,
              averageTicket: mode === 'empty' ? '0.00' : '50.00', revenueDifference: mode === 'empty' ? '0.00' : '20.01',
              revenueChangePercent: mode === 'empty' ? null : '20.01', includesOpenDays: false },
            summary: { revenue: mode === 'empty' ? '0.00' : '120.01', transactions: mode === 'empty' ? 0 : 2,
              averageTicket: '60.01', saleDiscounts: '9.99', saleAdditions: '2.00' },
            products: mode === 'empty' ? [] : [{ productId: 'p', name: 'Café especial torrado e moído 500 g', unit: 'KG', quantity: '1.234', itemSubtotal: '108.00' }],
          } });
        }
        const data = url.pathname === '/api/tenants/me' ? { name: 'Empresa QA', status: 'active', modulos: { estoque: true, nfce: false } }
          : url.pathname === '/api/auth/tenant-status' ? { status: 'active' }
          : url.pathname.startsWith('/api/cash-registers/current') ? null : [];
        return route.fulfill({ json: data });
      });
      await page.goto(`${base}/dashboard/reports`);
      await page.getByRole('heading', { name: 'Maiores subtotais de produtos', exact: true }).waitFor();
      assert(await page.getByText('Café especial torrado e moído 500 g').isVisible());
      await page.getByRole('heading', { name: 'Evolução diária das vendas', exact: true }).waitFor();
      await page.getByText('Ver valores por dia', { exact: true }).click();
      assert(await page.getByRole('table', { name: 'Vendas diárias do período selecionado' }).isVisible());
      assert(await page.getByText(/Comparação parcial:/).isVisible());
      await page.getByRole('heading', { name: 'Evolução diária das vendas', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `reports-evolution-${width}.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow em ${width}`);
      await page.screenshot({ path: path.join(output, `reports-${width}.png`) });
      await page.getByText('Café especial torrado e moído 500 g').evaluate(element => element.scrollIntoView({ block: 'center' }));
      const productBox = await page.getByText('Café especial torrado e moído 500 g').boundingBox();
      assert(productBox && productBox.y >= 0 && productBox.y + productBox.height < 936, 'Produto acessível pela rolagem');
      await page.screenshot({ path: path.join(output, `reports-products-${width}.png`) });
      await page.getByLabel('Data inicial').fill('2026-01-01');
      await page.getByLabel('Data final').fill('2026-04-03');
      const previous = calls;
      await page.getByRole('button', { name: 'Consultar', exact: true }).click();
      await page.getByText('Selecione um período de 1 a 92 dias.').waitFor();
      assert.equal(calls, previous);
      await page.getByLabel('Data final').fill('2026-01-01');
      mode = 'error';
      await page.getByRole('button', { name: 'Consultar', exact: true }).click();
      await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
      assert.equal(await page.getByText('Café especial torrado e moído 500 g').count(), 0);
      mode = 'empty';
      await page.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText('Nenhum produto vendido neste período.').waitFor();
      assert(await page.getByText('Sem base positiva no período anterior para calcular o percentual.').isVisible());
      mode = 'success';
      await page.getByLabel('Data inicial').fill('2026-01-01');
      await page.getByLabel('Data final').fill('2026-04-02');
      await page.getByRole('button', { name: 'Consultar', exact: true }).click();
      await page.getByRole('heading', { name: 'De 01/01/2026 a 02/04/2026', exact: true }).waitFor();
      await page.getByText('Ver valores por dia', { exact: true }).click();
      const dailyTable = page.getByRole('table', { name: 'Vendas diárias do período selecionado' });
      assert.equal(await dailyTable.getByRole('row').count(), 93);
      await dailyTable.getByText('02/04/2026', { exact: true }).scrollIntoViewIfNeeded();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('heading', { name: 'Evolução diária das vendas', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `reports-92-days-${width}.png`) });
      await page.getByLabel('Data final').fill('2026-01-01');
      mode = 'race';
      await page.getByRole('button', { name: 'Consultar', exact: true }).click();
      await page.getByRole('status').waitFor();
      await page.getByLabel('Data inicial').fill('2026-01-02');
      await page.getByLabel('Data final').fill('2026-01-02');
      await page.getByRole('button', { name: 'Consultar', exact: true }).click();
      await page.getByRole('heading', { name: 'De 02/01/2026 a 02/01/2026', exact: true }).waitFor();
      await page.waitForTimeout(700); // Espera a resposta antiga da fixture.
      assert.equal(await page.getByRole('heading', { name: 'De 01/01/2026 a 01/01/2026', exact: true }).count(), 0);
      if (width === 360) {
        await page.getByRole('button', { name: 'Mais', exact: true }).click();
        await page.getByRole('button', { name: 'Relatórios', exact: true }).click();
      }
      assert.deepEqual(errors, []);
      console.log(`PASS UI ${width}px: conteúdo, responsividade, período inválido, erro/retry, vazio, resposta obsoleta e navegação.`);
      await context.close();
    }
    console.log(`Capturas: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
