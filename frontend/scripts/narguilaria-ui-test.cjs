const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const product = { id: 'narg', name: 'Narguile Love 66', priceSell: 30, stock: 100, unit: 'UN', requiresCarvoaria: true, assetTrackingTotal: 40 };
    const comanda = { id: 'c', number: '03', status: 'open', total: 0, items: [], createdAt: new Date().toISOString(), responsibleWaiter: { id: 'w', name: 'Lucas' } };
    let lastAdd, lastSnooze, item;
    await page.addInitScript(() => {
      localStorage.setItem('7bar-auth', JSON.stringify({ state: { token: 'test', user: { id: 'qa', name: 'QA', role: 'admin', tenant: 'qa', termsAccepted: true } }, version: 0 }));
      localStorage.setItem('garcom_operator', JSON.stringify({ id: 'w', name: 'Lucas' }));
    });
    await page.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      let data = {};
      if (path.endsWith('/v1/kds/config')) data = { enabled: true, kdsEnabled: false, carvoariaEnabled: true, stations: ['CARVOARIA'] };
      else if (path.endsWith('/tenants/me')) data = { modulos: { carvoaria: true, restaurante: true }, status: 'active' };
      else if (path.endsWith('/auth/tenant-status')) data = { status: 'active', diasAtraso: -1 };
      else if (path.endsWith('/operators')) data = [{ id: 'w', name: 'Lucas', active: true }];
      else if (path.endsWith('/products')) data = { data: [product] };
      else if (path.endsWith('/assets/narg')) data = { total: 40, occupied: [{ assetNumber: 7, comanda: { number: '02' } }] };
      else if (path.endsWith('/service-rounds')) data = { serverTime: new Date().toISOString(), items: item && !item.assetReturnedAt ? [item] : [] };
      else if (path.endsWith('/timer/snooze')) {
        lastSnooze = req.postDataJSON();
        item.timerDueAt = new Date(Date.now() + lastSnooze.extraMinutes * 60000).toISOString(); data = item;
      } else if (path.endsWith('/return-asset')) { item.assetReturnedAt = new Date().toISOString(); data = item; }
      else if (path.endsWith('/v1/kds/tickets')) data = item && item.kdsStatus !== 'DELIVERED' ? [item] : [];
      else if (path.endsWith('/v1/kds/status')) {
        item.kdsStatus = req.postDataJSON().status;
        if (item.kdsStatus === 'DELIVERED') {
          item.timerStartedAt = new Date().toISOString(); item.timerDueAt = new Date(Date.now() + 1800000).toISOString();
        }
        data = { updated: 1 };
      } else if (path.endsWith('/items') && req.method() === 'POST') {
        lastAdd = req.postDataJSON();
        item = { id: 'i', comandaId: 'c', quantity: 1, unitPrice: 30, totalPrice: 30, productId: 'narg', product,
          assetNumber: lastAdd.items[0].assetNumber, kdsStatus: 'PENDING', kdsDestination: 'CARVOARIA', kdsSentAt: new Date().toISOString(),
          timerMinutes: 30, timerStartedAt: null, timerDueAt: null, serveImmediately: false, modifiers: [], comanda: { id: 'c', number: '03', status: 'open' } };
        comanda.items = [item]; comanda.total = 30; data = comanda;
      } else if (path.endsWith('/v1/comandas')) data = [comanda];
      else if (path.endsWith('/v1/comandas/c')) data = comanda;
      else if (path.includes('cash-register')) data = [];
      await route.fulfill({ json: data });
    });
    await page.goto('http://127.0.0.1:4178/garcom');
    await page.getByRole('button').filter({ hasText: '#03' }).first().click();
    await page.getByRole('button', { name: 'Adicionar Item', exact: true }).click();
    await page.getByRole('button').filter({ hasText: 'Narguile Love 66' }).last().click();
    const field = page.getByRole('group', { name: 'Escolha o narguile' });
    await field.getByRole('button', { name: '#07 Mesa 02' }).waitFor();
    assert.equal(await field.getByRole('button', { name: '#07 Mesa 02' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: /Lançar 1x/ }).isDisabled(), true);
    await field.getByRole('button', { name: '#05', exact: true }).tap();
    assert.equal(await field.evaluate(e => getComputedStyle(e).touchAction), 'pan-x pan-y');
    const scale = await page.evaluate(() => visualViewport.scale);
    await field.getByRole('button', { name: '#05', exact: true }).tap();
    assert.equal(await page.evaluate(() => visualViewport.scale), scale);
    const out = process.env.NARG_SCREENSHOT_DIR;
    if (out) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: out + '/asset-picker-mobile.png', fullPage: true }); }
    await page.getByRole('button', { name: /Lançar 1x/ }).click();
    await page.getByRole('button', { name: /Lançar 1x/ }).waitFor({ state: 'hidden' });
    assert.equal(lastAdd.items[0].assetNumber, 5);
    assert.equal(lastAdd.items[0].quantity, 1);
    await page.goto('http://127.0.0.1:4178/kds');
    await page.getByText('Narguile #05', { exact: true }).waitFor();
    assert.equal(await page.locator('option[value="KITCHEN"]').count(), 0);
    await page.getByLabel('Destino de preparo').selectOption('CARVOARIA');
    for (const action of ['Iniciar preparo', 'Marcar como pronto', 'Confirmar entrega']) {
      await page.locator('article').getByRole('button', { name: action }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      if (action !== 'Confirmar entrega') assert.equal(item.timerStartedAt, null);
    }
    assert.ok(item.timerStartedAt);
    item.timerStartedAt = new Date(Date.now() - 2400000).toISOString();
    item.timerDueAt = new Date(Date.now() - 600000).toISOString();
    await page.goto('http://127.0.0.1:4178/garcom');
    await page.getByText('Hora da ronda — atender a mesa').waitFor();
    if (out) await page.screenshot({ path: out + '/round-overdue-mobile.png', fullPage: true });
    await page.getByRole('button', { name: '+15 min', exact: true }).click();
    await page.getByText('15 min restantes', { exact: true }).waitFor();
    assert.equal(lastSnooze.extraMinutes, 15); assert.ok(lastSnooze.expectedDueAt);
    await page.getByRole('button', { name: 'Recolher / liberar' }).click();
    await page.getByText('Nenhum atendimento ativo.').waitFor();
    assert.ok(item.assetReturnedAt);
    assert.deepEqual(errors, []);
    console.log('Narguilaria UI: reserva visual, toque, Carvoaria isolada, entrega, ronda atrasada, prorrogação e recolhimento OK (API simulada).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
