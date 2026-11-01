const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  try {
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

  await page.goto('http://127.0.0.1:4179/');
  await page.waitForFunction(() => document.body.innerText.includes('PDV'));
  // A cópia deve existir sem abrir o painel de comandas.
  await page.waitForFunction(async () => {
    const { db } = await import('/src/lib/db.ts');
    return (await db.comandas_cache.get('qa'))?.items.length === 6;
  });
  // Importa os módulos antes de cortar também o acesso ao servidor de desenvolvimento.
  await page.evaluate(async () => {
    window.qaDb = await import('/src/lib/db.ts');
    window.qaComandas = await import('/src/lib/comandas-offline.ts');
    window.qaCart = await import('/src/store/cart.ts');
    window.qaAuth = await import('/src/store/auth.ts');
  });
  await page.waitForFunction(() => window.qaCart.useCartStore.getState().scope === '7bar-cart-v2:qa:op');
  await page.context().setOffline(true);
  page.on('dialog', d => d.accept());
  await page.keyboard.press('F1');
  const panel = page.getByRole('dialog', { name: 'Comandas e mesas' });
  await panel.waitFor();
  await panel.getByText(/Sem conexão · cópia de/).waitFor();
  await panel.getByRole('button', { name: 'Comanda 04', exact: true }).click();
  const remove = panel.getByRole('button', { name: 'Remover Hambúrguer artesanal', exact: true });
  await remove.waitFor(); assert.equal(await remove.isDisabled(), true);
  await panel.getByRole('button', { name: 'Cobrar no caixa', exact: true }).click();
  await panel.waitFor({ state: 'hidden' });
  const loaded = await page.evaluate(() => window.qaCart.useCartStore.getState().items);
  if (!loaded.length) console.log(await page.locator('body').innerText(), errors);
  assert.equal(loaded.length, 2); assert.equal(loaded[0].comandaItemId, 'i1');
  assert.equal(await page.evaluate(() => window.qaCart.useCartStore.getState().total), 64);
  // Exercita gravação atômica usada pelo checkout: duas chaves/abas não cobram a mesma mesa.
  const result = await page.evaluate(async () => {
    const { db, saveOfflineSale } = window.qaDb;
    const sale = { localId: crypto.randomUUID(), tenantId: 'qa', operatorId: 'op', comandaId: 'c1',
      total: 64, subtotal: 64, discount: 0, items: [], payments: [], emitirNfce: false, syncStatus: 'PENDING', createdAt: new Date().toISOString() };
    const attempts = await Promise.allSettled([saveOfflineSale(sale), saveOfflineSale({ ...sale, localId: crypto.randomUUID(), operatorId: 'op2' })]);
    const offline = await window.qaComandas.readComandas('qa');
    let blocked = false;
    try { await window.qaComandas.readComanda('qa', 'c1'); } catch { blocked = true; }
    const before = window.qaAuth.useAuthStore.getState().user;
    window.qaAuth.useAuthStore.setState({ user: { ...before, tenant: 'other' } });
    let isolated = false;
    try { await window.qaComandas.readComandas('other'); } catch { isolated = true; }
    window.qaAuth.useAuthStore.setState({ user: before });
    return { accepted: attempts.filter(a => a.status === 'fulfilled').length, absent: !offline.items.some(c => c.id === 'c1'), blocked, isolated };
  });
  assert.deepEqual(result, { accepted: 1, absent: true, blocked: true, isolated: true });
  assert.deepEqual(errors, []);
  console.log('Comandas offline: cópia automática, consulta/total sem rede, carregamento no caixa, bloqueio de edição, cobrança única local e isolamento por loja OK.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
