const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let enabled = true,
    failed = false,
    lastAdd = null;
  const now = Date.now();
  const make = (id, number, name, status, destination, immediate, minutes) => ({
    id,
    comandaId: 'c' + number,
    quantity: 1,
    kdsStatus: status,
    kdsDestination: destination,
    kdsSentAt: new Date(now - minutes * 60000).toISOString(),
    serveImmediately: immediate,
    product: { name, preparationIngredients: id === 'a' ? 'Pão brioche\nHambúrguer 180g\nQueijo e tomate' : id === 'b' ? '   ' : null },
    createdBy: { name: 'João' },
    comanda: { id: 'c' + number, number, responsibleWaiter: { name: 'João' } },
    notes: id === 'a' ? 'Sem cebola · molho à parte' : '',
    modifiers: [],
  });
  let tickets = [
    make('a', '04', 'Hambúrguer Clássico', 'PENDING', 'KITCHEN', false, 2),
    make('b', '03', 'Batata Frita', 'PREPARING', 'KITCHEN', false, 12),
    make('c', '02', 'Picanha', 'READY', 'KITCHEN', false, 18),
    make('d', '04', 'Refrigerante Coca-Cola', 'READY', 'SERVICE', false, 2),
    make('e', '07', 'Caipirinha', 'PENDING', 'BAR', true, 4),
    make('f', '11', 'Pizza Calabresa', 'PREPARING', 'KITCHEN', false, 22),
  ];
  const comandas = () =>
    ['04', '03', '02', '07', '11'].map((number) => ({
      id: 'c' + number,
      number,
      status: 'open',
      total: 30,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      items: tickets
        .filter((i) => i.comandaId === 'c' + number)
        .map((i) => ({ ...i, productId: i.id, unitPrice: 30, totalPrice: 30 })),
      responsibleWaiter: { id: 'w', name: 'João' },
    }));
  await page.addInitScript(() => {
    localStorage.setItem(
      '7bar-auth',
      JSON.stringify({
        state: {
          token: 'qa-token',
          user: {
            id: 'qa',
            name: 'Teste',
            role: 'admin',
            tenant: 'qa',
            termsAccepted: true,
          },
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      'garcom_operator',
      JSON.stringify({ id: 'w', name: 'João' }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    let data = {};
    if (url.pathname.endsWith('/v1/kds/config')) data = { enabled };
    else if (url.pathname.endsWith('/v1/kds/tickets')) {
      if (failed)
        return route.fulfill({
          status: 503,
          json: { message: 'Sem conexão de teste' },
        });
      data = tickets.filter((i) => i.kdsStatus !== 'DELIVERED');
    } else if (url.pathname.endsWith('/v1/kds/status')) {
      const body = req.postDataJSON();
      tickets = tickets.map((i) =>
        body.itemIds.includes(i.id) ? { ...i, kdsStatus: body.status } : i,
      );
      data = { updated: body.itemIds.length };
    } else if (url.pathname.endsWith('/auth/tenant-status'))
      data = { status: 'active', diasAtraso: -1 };
    else if (req.method() === 'POST' && url.pathname.endsWith('/items')) {
      lastAdd = req.postDataJSON();
      data = comandas().find((c) => url.pathname.includes(c.id));
    } else if (url.pathname.endsWith('/v1/comandas')) data = comandas();
    else if (/\/v1\/comandas\/c/.test(url.pathname))
      data = comandas().find((c) => url.pathname.endsWith(c.id));
    else if (url.pathname.endsWith('/tenants/me'))
      data = { modulos: { kds: enabled, restaurante: true }, status: 'active' };
    else if (url.pathname.endsWith('/operators'))
      data = [{ id: 'w', name: 'João', active: true }];
    else if (url.pathname.endsWith('/products'))
      data = {
        data: [
          {
            id: 'drink',
            name: 'Refrigerante',
            priceSell: 8,
            stock: 10,
            unit: 'UN',
            requiresKitchen: false,
            requiresBar: false,
          },
        ],
      };
    else if (url.pathname.includes('cash-register')) data = [];
    return route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:4178/kds');
  await page.getByRole('heading', { name: 'PDV · Produção' }).waitFor();
  await page.getByText('Hambúrguer Clássico', { exact: false }).waitFor();
  assert.equal(await page.locator('article').count(), 6);
  assert.equal(await page.getByText('Ingredientes', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Pão brioche\nHambúrguer 180g\nQueijo e tomate', { exact: true }).textContent(), 'Pão brioche\nHambúrguer 180g\nQueijo e tomate');
  const waiting = page
    .locator('article')
    .filter({ hasText: 'Refrigerante Coca-Cola' })
    .filter({ hasText: 'Separar / servir' });
  assert.equal(
    await waiting
      .getByRole('button', { name: 'Confirmar entrega' })
      .isDisabled(),
    true,
  );
  const out = process.env.KDS_SCREENSHOT_DIR;
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: out + '/kds-desktop.png', fullPage: true });
  }
  await page
    .locator('article')
    .filter({ hasText: 'Hambúrguer Clássico' })
    .getByRole('button', { name: 'Iniciar preparo' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await page
    .locator('article')
    .filter({ hasText: 'Hambúrguer Clássico' })
    .getByRole('button', { name: 'Marcar como pronto' })
    .waitFor();
  await page
    .locator('article')
    .filter({ hasText: 'Hambúrguer Clássico' })
    .getByRole('button', { name: 'Marcar como pronto' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await page
    .locator('article')
    .filter({ hasText: 'Hambúrguer Clássico' })
    .getByRole('button', { name: 'Confirmar entrega' })
    .waitFor();
  assert.equal(
    await waiting
      .getByRole('button', { name: 'Confirmar entrega' })
      .isEnabled(),
    true,
  );
  await page.getByLabel('Destino de preparo').selectOption('BAR');
  assert.equal(await page.locator('article').count(), 1);
  await page.getByLabel('Destino de preparo').selectOption('ALL');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  if (out)
    await page.screenshot({ path: out + '/kds-mobile.png', fullPage: true });
  failed = true;
  await page.getByLabel('Atualizar fila').click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Sem conexão de teste' })
    .waitFor();
  assert.equal(await page.locator('article button:enabled').count(), 0);
  failed = false;
  await page.goto('http://127.0.0.1:4178/garcom');
  await page.getByText('Prontos para levar', { exact: false }).waitFor();
  await page
    .locator('summary')
    .filter({ hasText: 'Prontos para levar' })
    .click();
  const ready = page
    .locator('section')
    .filter({ hasText: 'Prontos para levar' });
  await ready
    .getByRole('button', { name: 'Confirmar entrega' })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Entregue', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(comandas().find((c) => c.id === 'c04').status, 'open');
  assert.equal(tickets.find((i) => i.id === 'a').kdsStatus, 'DELIVERED');
  if (out)
    await page.screenshot({ path: out + '/garcom-ready.png', fullPage: true });
  await page.getByRole('button').filter({ hasText: '#04' }).first().click();
  await page
    .getByRole('button', { name: 'Adicionar Item', exact: true })
    .click();
  await page
    .getByRole('button')
    .filter({ hasText: 'Refrigerante' })
    .last()
    .click();
  const check = page.getByRole('checkbox', { name: /Servir agora/ });
  assert.equal(await check.isChecked(), false);
  if (out)
    await page.screenshot({
      path: out + '/garcom-serve-now.png',
      fullPage: true,
    });
  await page.getByRole('button', { name: /Lançar 1x/ }).click();
  await page
    .getByRole('button', { name: /Lançar 1x/ })
    .waitFor({ state: 'hidden' });
  assert.equal(lastAdd.items[0].serveImmediately, false);
  await page
    .getByRole('button')
    .filter({ hasText: 'Refrigerante' })
    .last()
    .click();
  await check.check();
  await page.getByRole('button', { name: /Lançar 1x/ }).click();
  await page
    .getByRole('button', { name: /Lançar 1x/ })
    .waitFor({ state: 'hidden' });
  assert.equal(lastAdd.items[0].serveImmediately, true);
  enabled = false;
  await page.reload();
  await page.getByText('mesa', { exact: false }).first().waitFor();
  assert.equal(
    await page.getByText('Prontos para levar', { exact: false }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    'KDS UI: desktop/mobile, filtros, transições, bebida junto, falha de rede, retirada do garçom e módulo desligado OK.',
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
