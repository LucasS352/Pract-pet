const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [390, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390, isMobile: width === 390, serviceWorkers: 'block' });
      const errors = [], writes = [];
      page.on('pageerror', error => errors.push(error.message));
      const option = { id: 'option-a', name: 'Sabor escolhido', priceAdjustment: 2, quantity: 1, componentProductId: 'ingredient' };
      const product = { id: 'combo', name: 'Composto teste', priceSell: 10, stock: 100, unit: 'UN', isComposite: true };
      const groups = [{ id: 'group', name: 'Escolha o sabor', minSelected: 1, maxSelected: 1, options: [option, { ...option, id: 'option-b', name: 'Outro sabor' }] }];
      const comanda = { id: 'c', number: '123', status: 'open', total: 0, items: [], createdAt: new Date().toISOString() };
      let details = 0;
      const token = `e30.${Buffer.from(JSON.stringify({ type: 'op', context: 'waiter', opId: 'w' })).toString('base64url')}.test`;
      await page.addInitScript(({ token }) => {
        localStorage.setItem('7bar-auth', JSON.stringify({ state: { token: 'mock-shop-token', user: { id: 'qa', name: 'QA', role: 'station', station: 'WAITER', tenant: 'qa', termsAccepted: true } }, version: 0 }));
        localStorage.setItem('garcom_operator', JSON.stringify({ id: 'w', name: 'Garçom teste' }));
        localStorage.setItem('pdv_waiter_session', JSON.stringify({ token, operatorId: 'w', tenantId: 'qa', expiresAt: null }));
      }, { token });
      await page.route('**/api/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        let data;
        if (path === '/api/auth/access/config') data = { waiter: true, isolated: true, stations: ['WAITER'] };
        else if (path === '/api/v1/kds/config') data = { enabled: false, stations: [] };
        else if (path === '/api/v1/comandas') data = [comanda];
        else if (path === '/api/products') data = { data: [product] };
        else if (path === '/api/products/combo/composition') {
          details++;
          data = groups;
        }
        else if (path === '/api/v1/comandas/c/items' && req.method() === 'POST') {
          const body = req.postDataJSON(); writes.push(body);
          comanda.items.push({ id: `i${writes.length}`, productId: product.id, product, quantity: 1, unitPrice: 12, totalPrice: 12, modifiers: [option] });
          comanda.total += 12; data = comanda;
        } else { throw Error(`Unexpected API call: ${req.method()} ${path}`); }
        await route.fulfill({ json: data });
      });
      await page.goto(process.env.GARCOM_TEST_URL || 'http://127.0.0.1:4178/garcom');
      await page.getByRole('button').filter({ hasText: '#123' }).first().click();
      await page.getByRole('button', { name: 'Adicionar Item', exact: true }).click();
      await page.getByRole('button').filter({ hasText: product.name }).first().click();
      const choice = page.getByRole('button', { name: /Sabor escolhido/ });
      await choice.waitFor();
      const onTop = await choice.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return top === el || el.contains(top);
      });
      assert.equal(onTop, true, 'Popup de adicionais deve estar acima de Adicionar Item e receber toques');
      assert.equal(writes.length, 0, 'Não pode lançar antes da escolha');
      await choice.click();
      await page.getByRole('button', { name: 'Adicionar à comanda', exact: true }).click();
      await page.waitForFunction(() => document.body.textContent.includes('lançado!'));
      assert.equal(details, 1, 'Detalhes ausentes no catálogo devem ser carregados');
      assert.deepEqual(writes[0].items[0].modifiers, [{ optionId: option.id }]);
      assert.equal(writes[0].items[0].createdById, 'w');
      assert.equal(writes.length, 1);
      // Even with one option, the waiter sees and confirms the popup.
      groups[0].options = [option];
      await page.getByRole('button').filter({ hasText: product.name }).first().click();
      await page.getByRole('button', { name: 'Adicionar à comanda', exact: true }).waitFor();
      assert.equal(writes.length, 1, 'Uma opção não deve lançar automaticamente no Garçom');
      await page.getByRole('button', { name: 'Fechar adicionais', exact: true }).click();
      assert.equal(writes.length, 1, 'Cancelar não lança o produto');
      await page.getByRole('button', { name: /Lançar 1x/ }).click();
      await page.getByRole('button', { name: 'Adicionar à comanda', exact: true }).waitFor();
      assert.equal(writes.length, 1, 'Botão inferior de composto também deve pedir confirmação');
      await page.getByRole('button', { name: 'Adicionar à comanda', exact: true }).click();
      await page.getByRole('button', { name: /Lançar 1x/ }).waitFor({ state: 'hidden' });
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[1].items[0].modifiers, [{ optionId: option.id }]);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`Garçom ${width}px: popup, escolha, envio único e cancelamento OK (API simulada).`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
