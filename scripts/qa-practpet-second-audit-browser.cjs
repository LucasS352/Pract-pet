const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Lucas Souza/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

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
const overdue = appointment('appointment-old', old, 'scheduled');
const packagePlan = {
  id: 'package-audit', planNameSnapshot: 'Pacote Audit', status: 'active', paymentStatus: 'paid',
  expiresAt: new Date(Date.now() + 86400000 * 10).toISOString(),
  transport: { enabled: true, mode: 'round_trip', address: customer.address },
  items: [{ serviceId: service.id, availableQuantity: 2, totalQuantity: 4 }],
};

const browser = async () => {
  const instance = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const results = [];
  try {
    for (const width of [390, 412, 768, 1280]) {
      let submittedBooking = null;
      let unfilteredPetRequests = 0;
      let scopedPetRequests = 0;
      let tutorSearchRequests = 0;
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
        else if (path === '/petshop/appointments') data = [current];
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
        else if (path === '/petshop/tutors/booking-directory') data = { items: url.searchParams.get('page') === '2' ? [customer] : Array.from({ length: 20 }, (_, index) => ({ id: `directory-${index}`, name: `Cliente Diretório ${index}`, phone: customer.phone })), page: Number(url.searchParams.get('page') || 1), hasMore: url.searchParams.get('page') !== '2' };
        else if (path === `/petshop/packages/available/${pet.id}`) data = [packagePlan];
        else if (path === '/products') data = { data: [], total: 0 };
        else if (path === '/categories') data = [{ id: 'category-audit', name: 'Audit' }];
        else if (path === '/tributacao') data = [];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const path of ['/petshop', '/petshop/agenda', '/petshop/taxidog', '/petshop/produtos']) {
        try {
          await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
        } catch (error) {
          console.error('navigation diagnostic', { width, path, currentUrl: page.url(), errors });
          throw error;
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
          await page.keyboard.press('Escape');
          await page.getByRole('dialog').first().waitFor({ state: 'detached' });
          await page.waitForTimeout(350);
          results.push({ width, path, modal: 'manifesto', escape: true });
        }
        if (width < 768 && path === '/petshop/produtos') {
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
