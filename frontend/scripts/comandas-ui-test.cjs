const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const now = new Date().toISOString();
  let deleted = 0,
    failDelete = false,
    reopened = 0,
    added = null;
  const item = (id, name, price, quantity = 1) => ({
    id,
    productId: id,
    product: {
      id,
      name,
      priceSell: price,
      stock: 100,
      barcode: null,
      shortCode: null,
    },
    unitPrice: price,
    totalPrice: price * quantity,
    quantity,
    notes: id === 'i1' ? 'Sem cebola · molho à parte' : null,
    createdBy: { name: 'João' },
    kdsStatus: id === 'i1' ? 'PREPARING' : null,
    modifiers:
      id === 'i1'
        ? [
            {
              id: 'm',
              optionId: 'o',
              name: 'Queijo extra',
              priceAdjustment: 4,
              consumedQuantity: 1,
              componentProductId: 'cheese',
            },
          ]
        : [],
  });
  let comandas = [
    {
      id: 'c1',
      number: '04',
      customerName: 'Mariana Silva',
      status: 'open',
      total: 64,
      items: [
        item('i1', 'Hambúrguer artesanal', 40),
        item('i2', 'Refrigerante Coca-Cola', 12, 2),
      ],
    },
    {
      id: 'c2',
      number: '08',
      customerName: 'Pedro Almeida',
      status: 'waiting_payment',
      total: 29,
      items: [item('i3', 'Porção de batata', 29)],
    },
    ...['12', 'Balcão 1', '18', '21'].map((number, i) => ({
      id: 'c' + (i + 3),
      number,
      customerName: i === 0 ? 'Ana Souza' : null,
      status: 'open',
      total: 0,
      items: [],
    })),
  ].map((c) => ({
    ...c,
    createdAt: now,
    updatedAt: now,
    responsibleWaiter: { name: 'João' },
  }));
  await page.addInitScript(() => {
    localStorage.setItem(
      '7bar-auth',
      JSON.stringify({
        state: {
          token: 'test',
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
      'currentOperator',
      JSON.stringify({
        id: 'op',
        name: 'Caixa',
        role: 'admin',
        isManager: true,
      }),
    );
    localStorage.setItem('7bar_promptQuantity', 'false');
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    let data = [];
    if (path.endsWith('/tenants/me'))
      data = {
        modulos: { comandas: true, kds: true, nfce: false },
        status: 'active',
        name: 'PDV Teste',
      };
    else if (path.endsWith('/auth/tenant-status'))
      data = { status: 'active', diasAtraso: -1 };
    else if (path.includes('/cash-registers/current'))
      data = { id: 'reg', status: 'open' };
    else if (path.endsWith('/operators/op'))
      data = { id: 'op', name: 'Caixa', active: true, isManager: true };
    else if (path.endsWith('/v1/kds/config')) data = { enabled: true };
    else if (path.endsWith('/products'))
      data = {
        data: [
          {
            id: 'p',
            name: 'Água mineral',
            priceSell: 5,
            stock: 50,
            barcode: null,
            shortCode: '1',
          },
        ],
        meta: { total: 1, lastPage: 1 },
      };
    else if (path.endsWith('/payment-methods/settings')) data = {};
    else if (path.endsWith('/v1/comandas') && req.method() === 'GET')
      data = comandas;
    else if (path.includes('/v1/comandas/')) {
      const parts = path.split('/');
      let c = comandas.find((c) => c.id === parts[4]);
      if (req.method() === 'DELETE') {
        deleted++;
        if (failDelete)
          return route.fulfill({
            status: 409,
            json: { message: 'Item alterado em outra tela' },
          });
        c.items = c.items.filter((i) => i.id !== parts[6]);
        c.total = c.items.reduce((sum, i) => sum + i.totalPrice, 0);
      } else if (path.endsWith('/reopen')) {
        reopened++;
        c.status = 'open';
      } else if (path.endsWith('/items')) added = req.postDataJSON();
      data = c;
    }
    await route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:4178/');
  await page.waitForFunction(() => document.body.innerText.includes('PDV'));
  await page.keyboard.press('F1');
  const dialog = page.getByRole('dialog', { name: 'Comandas e mesas' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Comanda 04', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Remover Hambúrguer artesanal', exact: true })
    .waitFor();
  const out = process.env.COMANDA_SCREENSHOT_DIR;
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({
      path: out + '/comandas-desktop.png',
      fullPage: true,
    });
  }
  await dialog.getByLabel('Buscar comanda').fill('mariana');
  assert.equal(
    await dialog.getByRole('button', { name: /^Comanda / }).count(),
    1,
  );
  await dialog.getByLabel('Buscar comanda').fill('');
  await dialog
    .getByRole('button', { name: 'Remover Hambúrguer artesanal', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  assert.equal(deleted, 0);
  failDelete = true;
  await dialog
    .getByRole('button', { name: 'Remover Hambúrguer artesanal', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remover item', exact: true })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal(comandas[0].items.length, 2);
  failDelete = false;
  await dialog
    .getByRole('button', {
      name: 'Remover Refrigerante Coca-Cola',
      exact: true,
    })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remover item', exact: true })
    .click();
  await dialog
    .getByRole('button', {
      name: 'Remover Refrigerante Coca-Cola',
      exact: true,
    })
    .waitFor({ state: 'hidden' });
  assert.equal(comandas[0].total, 40);
  assert.equal(comandas[0].status, 'open');
  await dialog.getByRole('button', { name: 'Comanda 08', exact: true }).click();
  const remove = dialog.getByRole('button', {
    name: 'Remover Porção de batata',
    exact: true,
  });
  await remove.waitFor();
  assert.equal(await remove.isDisabled(), true);
  await dialog
    .getByRole('button', { name: 'Reabrir para editar', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal(reopened, 1);
  assert.equal(await remove.isEnabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  if (out) {
    await page.waitForTimeout(2300);
    await page.screenshot({
      path: out + '/comandas-mobile.png',
      fullPage: true,
    });
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await dialog.getByRole('button', { name: 'Voltar às mesas' }).click();
  await dialog.getByRole('button', { name: 'Comanda 04', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Cobrar no caixa', exact: true })
    .click();
  await dialog.waitFor({ state: 'hidden' });
  const cart = () =>
    page.evaluate(async () => {
      const { useCartStore } = await import('/src/store/cart.ts');
      return {
        total: useCartStore.getState().total,
        items: useCartStore.getState().items,
        active: useCartStore.getState().activeComandaId,
      };
    });
  assert.equal((await cart()).total, 40);
  assert.equal((await cart()).active, 'c1');
  // Edit a comanda already loaded for charging; preserve extra cart items.
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { useCartStore } = await import('/src/store/cart.ts');
    useCartStore
      .getState()
      .addItem(
        {
          id: 'extra',
          name: 'Água extra',
          priceSell: 5,
          stock: 50,
          barcode: null,
          shortCode: '2',
        },
        1,
      );
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('F1');
  const editing = page.getByRole('dialog', {
    name: 'Lançar em comanda',
    exact: true,
  });
  await editing.waitFor();
  await editing
    .getByRole('button', { name: 'Comanda 04', exact: true })
    .click();
  await editing
    .getByRole('button', { name: 'Remover Hambúrguer artesanal', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remover item', exact: true })
    .click();
  await editing.getByText('Esta comanda ainda não possui itens.').waitFor();
  assert.equal((await cart()).total, 5);
  assert.equal((await cart()).items.length, 1);
  assert.equal((await cart()).items[0].id, 'extra');
  await editing
    .getByRole('button', { name: 'Fechar comandas', exact: true })
    .click();
  await page.keyboard.press('Escape');
  comandas[0].items = [item('i1', 'Hambúrguer artesanal', 40)];
  comandas[0].total = 40;
  await page.setViewportSize({ width: 390, height: 844 });
  // Exercise the same modal from PaymentModal with new cart items, preserving launch payload.
  await page.reload();
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const { useCartStore } = await import('/src/store/cart.ts');
    useCartStore.getState().clearCart();
    useCartStore
      .getState()
      .addItem(
        {
          id: 'p',
          name: 'Água mineral',
          priceSell: 5,
          stock: 50,
          barcode: null,
          shortCode: '1',
        },
        2,
      );
  });
  await page.keyboard.press('F1');
  const launch = page.getByRole('dialog', {
    name: 'Lançar em comanda',
    exact: true,
  });
  await launch.waitFor();
  await launch.getByRole('button', { name: 'Voltar às mesas' }).click();
  await launch.getByRole('button', { name: 'Comanda 04', exact: true }).click();
  await launch
    .getByRole('button', { name: 'Remover Hambúrguer artesanal', exact: true })
    .waitFor();
  if (out)
    await page.screenshot({
      path: out + '/comandas-launch-mobile.png',
      fullPage: true,
    });
  await launch
    .getByRole('button', { name: 'Remover Hambúrguer artesanal', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remover item', exact: true })
    .click();
  await launch.getByText('Esta comanda ainda não possui itens.').waitFor();
  assert.equal((await cart()).total, 10);
  assert.equal(comandas[0].status, 'open');
  await launch
    .getByRole('button', { name: 'Confirmar lançamento', exact: true })
    .click();
  await launch.waitFor({ state: 'hidden' });
  assert.equal(added.items[0].quantity, 2);
  assert.equal(added.items[0].unitPrice, 5);
  assert.deepEqual(errors, []);
  console.log(
    'Comandas UI: busca, detalhes, confirmação/cancelamento/erro de remoção, estorno retornado, reabertura, mobile, preço composto, carrinho preservado e lançamento OK.',
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
