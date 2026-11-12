const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Lucas Souza/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require('../backend/node_modules/sharp');
const { randomBytes } = require('node:crypto');

const origin = process.env.PRACTPET_BROWSER_ORIGIN || 'http://127.0.0.1:5174';
const screenshotDir = process.env.PRACTPET_SCREENSHOT_DIR;
const now = new Date();
const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9).toISOString();
const old = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 9).toISOString();
const customer = { id: 'tutor-audit', name: 'Tutor Audit', phone: '11999990000', address: 'Rua Audit, 10 - Centro' };
const frequentTutors = Array.from({ length: 8 }, (_, index) => ({
  id: index === 0 ? customer.id : `tutor-frequent-${index}`,
  name: index === 0 ? customer.name : `Cliente Frequente ${index}`,
  phone: customer.phone,
  pet: { id: index === 0 ? 'pet-audit' : `pet-frequent-${index}`, name: index === 0 ? 'Pet Audit' : `Pet ${index}`, species: 'dog', photoUrl: null },
  appointmentsCount: 12 - index,
  lastVisitAt: new Date().toISOString(),
}));
const pet = { id: 'pet-audit', name: 'Pet Audit', customerId: customer.id, customer, species: 'dog', size: 'small', active: true };
const service = { id: 'service-audit', name: 'Banho Audit', durationMinutes: 60, price: 50, active: true, serviceType: 'INDIVIDUAL', pricingRules: [] };
const appointment = (id, startsAt, status) => ({
  id, startsAt, endsAt: new Date(new Date(startsAt).getTime() + 3600000).toISOString(),
  status, petId: pet.id, pet, customerId: customer.id, customer,
  services: [{ id: `${id}-svc`, serviceId: service.id, service, nameSnapshot: service.name, priceSnapshot: 50, durationMinutes: 60, coverageStatus: 'none' }],
  transport: { enabled: true, mode: 'round_trip', address: customer.address, fee: 40, coveredByPackage: false },
});
const current = appointment('appointment-today', local, 'ready');
const secondStop = appointment('appointment-second', new Date(new Date(local).getTime() + 3600000).toISOString(), 'ready');
secondStop.transport.address = 'Duque de Caxias, 21 - Jd Estoril';
const overdue = appointment('appointment-old', old, 'scheduled');
const packagePlan = {
  id: 'package-audit', planNameSnapshot: 'Pacote Audit', status: 'active', paymentStatus: 'paid',
  expiresAt: new Date(Date.now() + 86400000 * 10).toISOString(),
  transport: { enabled: true, mode: 'round_trip', address: customer.address },
  items: [{ serviceId: service.id, availableQuantity: 2, totalQuantity: 4 }],
};

const browser = async () => {
  const largeCameraPhoto = await sharp(randomBytes(4000 * 3000 * 3), { raw: { width: 4000, height: 3000, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  const instance = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const results = [];
  try {
    for (const width of [390, 412, 768, 1280]) {
      let submittedBooking = null;
      let prepayRequests = 0;
      let unfilteredPetRequests = 0;
      let scopedPetRequests = 0;
      let tutorSearchRequests = 0;
      let reversedPayment = null;
      let editedProduct = null;
      let uploadedPhotoBytes = null;
      let updatedTaxiFee = null;
      const context = await instance.newContext({
        viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768,
        userAgent: width < 768 ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36' : undefined,
        timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block',
      });
      await context.addInitScript(() => localStorage.setItem('7bar-auth', JSON.stringify({ state: {
        token: 'audit-mock-token',
        user: { id: 'audit-user', name: 'Auditor', role: 'admin', tenant: 'audit-tenant', termsAccepted: true, modules: { petshop: true } },
      }, version: 0 })));
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        const path = url.pathname.replace(/^\/api/, '');
        if (path === '/petshop/appointments' && route.request().method() === 'POST') submittedBooking = route.request().postDataJSON();
        let data = [];
        if (path === '/tenants/me') data = { id: 'audit-tenant', nomeFantasia: 'Pract Pet Audit', modulos: { petshop: true } };
        else if (path === '/petshop/overview') data = { metrics: { pets: 1, tutors: 1, products: 1, services: 1, today: 1, inProgress: 0, vaccinesDue: 0 }, nextAppointments: [current] };
        else if (path === '/petshop/taxi-default-fee') { if (route.request().method() === 'PUT') updatedTaxiFee = route.request().postDataJSON()?.fee; data = { fee: updatedTaxiFee ?? 50 }; }
        else if (path === '/petshop/appointments') data = route.request().method() === 'POST' ? appointment('appointment-created', local, 'scheduled') : [current, secondStop];
        else if (path === '/petshop/appointments/appointment-created/checkout') { prepayRequests++; assert.equal(route.request().postDataJSON().prepay, true); data = { id: 'comanda-created', total: 50 }; }
        else if (path === '/petshop/appointments/appointment-today/payment') data = reversedPayment ? null : { saleId: 'sale-audit', total: 40, paidAt: local, nfceStatus: null };
        else if (path === '/petshop/appointments/appointment-today/reverse-payment') { reversedPayment = route.request().postDataJSON(); data = { id: 'sale-audit', status: 'cancelled' }; }
        else if (path === '/petshop/uploads/photo') { uploadedPhotoBytes = route.request().postDataBuffer()?.length; data = { imageUrl: '/api/products/uploads/images/audit-image' }; }
        else if (path === '/petshop/appointments/overdue-pickups') data = [overdue];
        else if (path === '/petshop/pending-reservations') data = [];
        else if (path === '/petshop/services') data = [service];
        else if (path === '/petshop/pets') {
          if (!url.searchParams.has('customerId')) unfilteredPetRequests++;
          else scopedPetRequests++;
          data = url.searchParams.get('customerId') === customer.id ? [pet] : [];
        }
        else if (path === `/petshop/pets/${pet.id}`) data = pet;
        else if (path === '/petshop/tutors/booking-search') { tutorSearchRequests++; data = [customer]; }
        else if (path === '/petshop/tutors/booking-frequent') data = frequentTutors;
        else if (path === '/users') data = [{ id: 'admin-audit', role: 'admin', email: 'admin@cliente.com' }];
        else if (path === '/petshop/packages/contracts') data = [];
        else if (path === '/petshop/packages/plans') data = [];
        else if (path === '/petshop/packages/financial-overview') data = {};
        else if (path === '/petshop/tutors') data = [customer];
        else if (path === '/petshop/tutors/booking-directory') data = { items: url.searchParams.get('page') === '2' ? [customer] : Array.from({ length: 20 }, (_, index) => ({ id: `directory-${index}`, name: `Cliente Diretório ${index}`, phone: customer.phone })), page: Number(url.searchParams.get('page') || 1), hasMore: url.searchParams.get('page') !== '2' };
        else if (path === `/petshop/packages/available/${pet.id}`) data = [packagePlan];
        else if (path === '/products') data = { data: [
          { id: 'product-shampoo', name: 'Shampoo de venda', categoryId: 'category-audit', category: { id: 'category-audit', name: 'Higiene' }, active: true, unit: 'UN', priceCost: 10, priceSell: 25, stock: 5 },
          { id: 'service-legacy', name: 'Banho legado', categoryId: 'category-service', category: { id: 'category-service', name: 'Serviços' }, active: true, unit: 'SV', priceCost: 0, priceSell: 60, stock: 99999 },
        ], total: 2 };
        else if (path === '/products/product-shampoo' && route.request().method() === 'PATCH') { editedProduct = route.request().postDataJSON(); data = { id: 'product-shampoo' }; }
        else if (path === '/categories') data = [{ id: 'category-audit', name: 'Higiene' }, { id: 'category-service', name: 'Serviços' }];
        else if (path === '/tributacao') data = [];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const path of ['/petshop', '/petshop/agenda', '/petshop/taxidog', '/petshop/produtos', '/petshop/servicos', '/petshop/pacotes']) {
        try {
          await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
        } catch (error) {
          if (!String(error).includes('ERR_ABORTED')) {
            console.error('navigation diagnostic', { width, path, currentUrl: page.url(), errors });
            throw error;
          }
          await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
        }
        await page.locator('#petcare-main').waitFor({ timeout: 20000 });
        await page.waitForTimeout(300);
        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          title: document.querySelector('#petcare-main h1')?.textContent?.trim() || '',
          contentLength: document.querySelector('#petcare-main')?.textContent?.length || 0,
        }));
        results.push({ width, path, ...layout, errors: [...errors] });
        assert.ok(layout.contentLength > 150, `conteúdo vazio em ${path} (${width}px)`);
        assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `overflow horizontal em ${path} (${width}px)`);
        assert.deepEqual(errors, [], `erro JavaScript em ${path} (${width}px)`);
        if (width >= 768 && path === '/petshop/agenda') {
          await page.getByRole('button', { name: /Novo agendamento/i }).first().click();
          await page.getByRole('dialog').first().waitFor();
          await page.getByRole('region', { name: 'Clientes com mais movimentação' }).getByRole('button', { name: /Cliente Frequente 7/ }).waitFor();
          assert.equal(await page.getByRole('region', { name: 'Clientes com mais movimentação' }).getByRole('button', { name: /atendimento/ }).count(), 8);
          const columns = await page.getByRole('region', { name: 'Clientes com mais movimentação' }).locator('div.grid').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
          assert.equal(columns, width >= 640 ? 2 : 1, 'grade responsiva de clientes frequentes');
          if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/booking-${width}.png` });
          await page.keyboard.press('Escape');
          await page.getByRole('dialog').first().waitFor({ state: 'detached' });
        }
        if (width < 768 && path === '/petshop/agenda') {
          const unfilteredBeforeBooking = unfilteredPetRequests;
          const open = page.getByRole('button', { name: /Novo agendamento/i }).first();
          await open.click();
          await page.getByRole('dialog').first().waitFor();
          await page.getByRole('region', { name: 'Clientes com mais movimentação' }).getByRole('button', { name: /Cliente Frequente 7/ }).waitFor();
          assert.equal(await page.getByRole('region', { name: 'Clientes com mais movimentação' }).getByRole('button', { name: /atendimento/ }).count(), 8);
          const columns = await page.getByRole('region', { name: 'Clientes com mais movimentação' }).locator('div.grid').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
          assert.equal(columns, 1, 'grade de clientes no celular');
          if (screenshotDir && width === 390) await page.screenshot({ path: `${screenshotDir}/booking-tutor.png` });
          assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
          await page.getByRole('button', { name: /Cadastrar tutor e pet/i }).click();
          await page.waitForTimeout(100);
          assert.equal(await page.locator('[role="dialog"]').count(), 2);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(100);
          assert.equal(await page.locator('[role="dialog"]').count(), 1);
          assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
          await page.keyboard.press('Escape');
          await page.getByRole('dialog').first().waitFor({ state: 'detached' });
          assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
          await open.click();
          await page.goBack();
          await page.getByRole('dialog').first().waitFor({ state: 'detached' });
          assert.equal(new URL(page.url()).pathname, '/petshop/agenda');
          results.push({ width, path, modal: 'novo agendamento', escape: true, historyBack: true });
          if (width === 412) {
            await open.click();
            const booking = page.getByRole('dialog').first();
            await booking.getByRole('button', { name: /Tutor Audit.*Pet Audit/ }).click();
            await booking.getByRole('button', { name: /Pet Audit/ }).click();
            await booking.getByText('Pacote Audit').waitFor();
            await booking.locator('fieldset').first().locator('input[type="checkbox"]').first().check();
            await booking.getByLabel('Cobrar agora após criar o agendamento').check();
            await booking.getByRole('button', { name: 'Confirmar agendamento' }).click();
            await page.waitForTimeout(400);
            assert.equal(prepayRequests, 1);
            await page.getByRole('heading', { name: 'Finalizar Pagamento' }).waitFor();
            results.push({ width, bookingFlow: 'criação → cobrança antecipada', passed: true });
          }
          if (width === 390) {
            await open.click();
            const booking = page.getByRole('dialog').first();
            await booking.getByRole('button', { name: /Ver todos os clientes/ }).click();
            await booking.getByRole('button', { name: /Carregar mais/ }).click();
            await booking.getByRole('button', { name: /Voltar/ }).click();
            await booking.getByRole('button', { name: /Ver todos os clientes/ }).click();
            await page.keyboard.press('Escape');
            await booking.waitFor({ state: 'detached' });
            await open.click();
            await booking.getByRole('button', { name: /Ver todos os clientes/ }).waitFor();
            await booking.getByRole('button', { name: /Tutor Audit.*Pet Audit/ }).click();
            await booking.getByRole('button', { name: /Pet Audit/ }).waitFor();
            await booking.getByRole('button', { name: 'Trocar' }).click();
            const tutorSearch = booking.getByPlaceholder('Ex.: Ana Souza ou (11) 99999-9999');
            await tutorSearch.fill('T');
            await page.waitForTimeout(350);
            assert.equal(tutorSearchRequests, 0, 'a busca não deve consultar o servidor com um caractere');
            await tutorSearch.fill('Tutor Audit');
            await booking.getByRole('button', { name: /Tutor Audit/ }).click();
            await booking.getByRole('button', { name: /Pet Audit/ }).click();
            if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/booking-pet.png` });
            await booking.getByText('Pacote Audit').waitFor();
            const taxiOption = booking.getByLabel(/Incluir Transporte do Animal/);
            await taxiOption.check();
            assert.equal(await booking.getByRole('spinbutton', { name: /Valor do Transporte/ }).inputValue(), '50');
            await booking.locator('fieldset').first().locator('input[type="checkbox"]').first().check();
            await booking.getByRole('button', { name: 'Confirmar agendamento' }).click();
            await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
            assert.equal(submittedBooking?.petId, pet.id);
            assert.deepEqual(submittedBooking?.serviceIds, [service.id]);
            assert.deepEqual(submittedBooking?.packageSelections, { [service.id]: packagePlan.id });
            assert.equal(submittedBooking?.transport?.coveredByPackage, true);
            assert.equal(unfilteredPetRequests, unfilteredBeforeBooking, 'o agendamento não deve buscar todos os pets');
            assert.equal(scopedPetRequests, 2, 'cada seleção de tutor deve buscar somente seus pets');
            results.push({ width, path, bookingFlow: 'tutor→pet→serviço/pacote→POST', passed: true });
          }
        }
        if (width < 768 && path === '/petshop/taxidog') {
          await page.getByRole('button', { name: 'Rota', exact: true }).first().click();
          await page.getByRole('dialog').first().waitFor();
          if (width === 390) {
            await page.evaluate(() => { window.open = url => { window.__auditRouteUrl = url; return null; }; });
            await page.getByRole('checkbox', { name: 'Incluir na rota' }).nth(1).check();
            await page.getByRole('checkbox', { name: 'Incluir na rota' }).nth(2).check();
            assert.equal(await page.getByRole('checkbox', { name: 'Incluir na rota' }).count(), 3);
            assert.equal(await page.getByRole('checkbox', { name: 'Incluir na rota' }).nth(1).isChecked(), true);
            assert.equal(await page.getByRole('checkbox', { name: 'Incluir na rota' }).nth(2).isChecked(), true);
            await page.getByRole('textbox', { name: 'Cidade e UF dos endereços' }).fill('Bauru, SP');
            await page.getByRole('button', { name: 'Abrir Rota no Maps' }).click();
            const routeUrl = await page.evaluate(() => window.__auditRouteUrl);
            assert.equal(new URL(routeUrl).searchParams.get('waypoints'), `${customer.address}, Bauru, SP`, routeUrl);
            assert.equal(new URL(routeUrl).searchParams.get('destination'), `${secondStop.transport.address}, Bauru, SP`);
            results.push({ width, path, route: 'duas paradas selecionadas com cidade/UF', passed: true });
          }
          await page.keyboard.press('Escape');
          await page.getByRole('dialog').first().waitFor({ state: 'detached' });
          await page.waitForTimeout(350);
          results.push({ width, path, modal: 'manifesto', escape: true });
          if (width === 390) {
            await page.getByRole('button', { name: /Levar para Casa|Levar/i }).first().click();
            await page.getByRole('button', { name: /Entrega realizada · Abrir cobrança/i }).first().click();
            await page.getByRole('dialog', { name: /Atendimento · Pet Audit/i }).waitFor();
            assert.equal(new URL(page.url()).pathname, '/petshop/agenda');
            await page.getByRole('button', { name: 'Enviar Foto' }).click();
            const photoDialog = page.getByRole('dialog', { name: /Foto e Recado/i });
            const photoStartedAt = Date.now();
            await photoDialog.locator('input[aria-label="Tirar foto com a câmera"]').setInputFiles({ name: 'camera.jpg', mimeType: 'image/jpeg', buffer: largeCameraPhoto });
            await photoDialog.getByText('Foto pronta para salvar').waitFor();
            assert.ok(uploadedPhotoBytes < 300 * 1024, `upload otimizado excedeu 300 KB: ${uploadedPhotoBytes}`);
            results.push({ width, photo: 'JPEG sintético 12 MP → WebP e upload simulado', uploadedPhotoBytes, elapsedMs: Date.now() - photoStartedAt, passed: true });
            await photoDialog.getByRole('button', { name: /Fechar/i }).first().click();
            await page.getByRole('button', { name: 'Estornar pagamento' }).click();
            await page.getByRole('dialog', { name: /Estornar pagamento/i }).getByRole('textbox', { name: 'Motivo do estorno' }).fill('Cancelamento solicitado pelo tutor');
            await page.getByRole('button', { name: 'Confirmar estorno' }).click();
            assert.equal(reversedPayment?.reason, 'Cancelamento solicitado pelo tutor');
            assert.equal(new URL(page.url()).pathname, '/petshop/agenda');
            results.push({ width, handoff: 'Táxi Dog → atendimento selecionado', passed: true });
          }
        }
        if (width < 768 && path === '/petshop/produtos') {
          await page.getByText('Shampoo de venda').waitFor();
          assert.equal(await page.getByText('Banho legado').count(), 0, 'serviço legado não deve aparecer como mercadoria');
          const open = page.getByRole('button', { name: /Novo produto/i }).first();
          await open.click();
          await page.getByRole('dialog').first().waitFor();
          assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
          await page.keyboard.press('Escape');
          await page.getByRole('dialog').first().waitFor({ state: 'detached' });
          assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
          await open.click();
          await page.goBack();
          await page.getByRole('dialog').first().waitFor({ state: 'detached' });
          assert.equal(new URL(page.url()).pathname, '/petshop/produtos');
          results.push({ width, path, modal: 'novo produto', escape: true, historyBack: true });
          if (width === 390) {
            await page.getByRole('button', { name: 'Editar', exact: true }).click();
            const edit = page.getByRole('dialog', { name: 'Editar produto' });
            await edit.waitFor();
            await edit.locator('[data-product-section="main"] input[required]').fill('Shampoo de venda atualizado');
            await edit.getByRole('button', { name: 'Salvar Alterações' }).click();
            assert.equal(editedProduct?.name, 'Shampoo de venda atualizado');
            assert.equal(editedProduct?.categoryId, 'category-audit');
            results.push({ width, path, edit: 'PATCH preserva categoria e atualiza nome', passed: true });
          }
        }
        if (width === 390 && path === '/petshop/servicos') {
          const fee = page.getByRole('spinbutton', { name: 'Valor padrão (R$)' });
          await fee.waitFor();
          assert.equal(await fee.inputValue(), '50');
          await fee.fill('55');
          await page.getByRole('button', { name: 'Salvar', exact: true }).click();
          assert.equal(updatedTaxiFee, 55);
          results.push({ width, path, taxiFee: 'GET 50 → PUT 55', passed: true });
        }
        if (width < 768 && path === '/petshop/pacotes') {
          for (const [buttonName, dialogName] of [
            ['Novo Plano no Catálogo', 'Novo plano de pacote'],
            ['Contratar Pacote p/ Cliente', 'Contratar Pacote para Cliente'],
          ]) {
            await page.getByRole('button', { name: buttonName }).click();
            const dialog = page.getByRole('dialog', { name: dialogName });
            await dialog.waitFor();
            const dimensions = await dialog.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, viewport: document.documentElement.clientWidth }));
            assert.ok(dimensions.width <= dimensions.viewport && dimensions.scrollWidth <= dimensions.width, JSON.stringify({ buttonName, dimensions }));
            await dialog.getByRole('button', { name: 'Fechar' }).click();
            results.push({ width, path, modal: dialogName, horizontalOverflow: false });
          }
        }
      }
      await context.close();
    }
  } finally {
    await instance.close();
  }
  console.log(JSON.stringify(results, null, 2));
};

browser().catch(error => { console.error(error); process.exitCode = 1; });
