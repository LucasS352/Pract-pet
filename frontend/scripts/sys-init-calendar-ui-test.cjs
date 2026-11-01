const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', error => console.error('PAGE_ERROR', error.message));
    page.on('console', message => { if (message.type() === 'error') console.error('CONSOLE_ERROR', message.text()); });
    const today = new Date();
    const iso = (offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12).toISOString();
    const tenants = [
      { id: 'due', name: 'Adega da Praça', databaseName: 'adega_praca', status: 'active', mensalidadeValor: 149.9, mensalidadeVencimento: iso(2), modulos: { estoque: true } },
      { id: 'late', name: 'Bar do Centro', databaseName: 'bar_centro', status: 'active', mensalidadeValor: 199.9, mensalidadeVencimento: iso(-3), modulos: { comandas: true } },
      { id: 'empty', name: 'Nova Loja', databaseName: 'nova_loja', status: 'active', mensalidadeValor: 99.9, mensalidadeVencimento: null, modulos: {} },
    ];
    let paymentId = null;
    await page.addInitScript(() => sessionStorage.setItem('7bar_sysinit_pin', '1234567890'));
    await page.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (path.endsWith('/validate-pin')) return route.fulfill({ json: { valid: true } });
      if (path.endsWith('/setup/list')) return route.fulfill({ json: tenants });
      if (path.includes('/registrar-pagamento')) { paymentId = path.split('/')[4]; return route.fulfill({ json: { ok: true } }); }
      return route.fulfill({ json: [] });
    });
    await page.goto('http://127.0.0.1:4179/sys-init');
    await page.waitForTimeout(500);
    await page.getByRole('heading', { name: 'Gestão de Tenants' }).waitFor();
    await page.getByRole('button', { name: 'Calendário' }).waitFor();
    await page.getByText('Adega da Praça', { exact: true }).waitFor();
    await page.getByText('Bar do Centro', { exact: true }).first().waitFor();
    await page.getByText('Sem vencimento (1)', { exact: true }).waitFor();
    await page.getByText('Em atraso (1)', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Selecionar resultados' }).click();
    await page.getByRole('button', { name: /Atualizar Bancos 3/ }).waitFor();
    assert.ok((await page.locator('[aria-label="Ações administrativas"]').boundingBox()).width > 1800);
    await page.screenshot({ path: 'dist/sys-init-calendar-desktop.png', fullPage: true });
    await page.locator('[title="Registrar pagamento"]').first().click();
    await page.waitForTimeout(100);
    assert.ok(paymentId === 'due' || paymentId === 'late');
    await page.getByRole('button', { name: 'Clientes', exact: true }).click();
    await page.locator('article').first().waitFor();
    assert.equal(await page.locator('[title="Editar"]').count(), 3);
    assert.equal(await page.locator('[title="Excluir"]').count(), 3);
    await page.screenshot({ path: 'dist/sys-init-cards-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'dist/sys-init-cards-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Calendário', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Clientes', exact: true }).click();
    await page.getByRole('button', { name: 'Gerenciar módulos', exact: true }).first().click();
    await page.getByText('KDS — Cozinha e Bar', { exact: true }).waitFor();
    console.log('Sys-Init: largura desktop, ações visíveis, cartões, calendário, pagamento e atalho de módulos mobile OK (API simulada).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
