// Validação visual isolada: APIs simuladas, sem autenticar em loja real ou alterar dados.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const base = process.env.PETCARE_QA_URL || 'http://127.0.0.1:3521';
const output = path.join(os.tmpdir(), 'petcare-ui-qa');
fs.mkdirSync(output, { recursive: true });

const appointments = [
  {
    id: 'a1',
    startsAt: '2026-10-21T09:00:00-03:00',
    endsAt: '2026-10-21T10:00:00-03:00',
    status: 'scheduled',
    pet: { id: 'p1', customerId: 'c1', name: 'Mel', species: 'dog', customer: { id: 'c1', name: 'Mariana Costa', phone: '11999999999' } },
    customer: { id: 'c1', name: 'Mariana Costa', phone: '11999999999' },
    professional: { id: 'o1', name: 'Camila' },
    services: [{ id: 's1', nameSnapshot: 'Banho e hidratação', priceSnapshot: '75', durationMinutes: 60 }],
  },
  {
    id: 'a2',
    startsAt: '2026-10-21T10:30:00-03:00',
    endsAt: '2026-10-21T11:45:00-03:00',
    status: 'bathing',
    pet: { id: 'p2', customerId: 'c2', name: 'Bento', species: 'dog', customer: { id: 'c2', name: 'Rafael Lima', phone: '11999999998' } },
    customer: { id: 'c2', name: 'Rafael Lima', phone: '11999999998' },
    professional: { id: 'o2', name: 'Juliana' },
    services: [{ id: 's2', nameSnapshot: 'Banho e tosa higiênica', priceSnapshot: '95', durationMinutes: 75 }],
  },
  {
    id: 'a3',
    startsAt: '2026-10-21T11:00:00-03:00',
    endsAt: '2026-10-21T12:00:00-03:00',
    status: 'requested',
    pet: { id: 'p3', customerId: 'c3', name: 'Nina', species: 'cat', customer: { id: 'c3', name: 'Paula Mendes', phone: '11999999997' } },
    customer: { id: 'c3', name: 'Paula Mendes', phone: '11999999997' },
    professional: null,
    services: [{ id: 's1', nameSnapshot: 'Banho', priceSnapshot: '60', durationMinutes: 60 }],
  },
  {
    id: 'a4',
    startsAt: '2026-10-21T13:30:00-03:00',
    endsAt: '2026-10-21T14:30:00-03:00',
    status: 'ready',
    pet: { id: 'p4', customerId: 'c4', name: 'Thor', species: 'dog', customer: { id: 'c4', name: 'Bruno Alves', phone: '11999999996' } },
    customer: { id: 'c4', name: 'Bruno Alves', phone: '11999999996' },
    professional: { id: 'o1', name: 'Camila' },
    services: [{ id: 's3', nameSnapshot: 'Tosa completa', priceSnapshot: '110', durationMinutes: 60 }],
  },
];

const services = [
  { id: 's1', name: 'Banho', description: 'Higiene completa e secagem.', durationMinutes: 60, price: '60', color: '#0f766e', active: true },
  { id: 's2', name: 'Banho e tosa', description: 'Banho com tosa higiênica.', durationMinutes: 90, price: '95', color: '#1d4ed8', active: true },
  { id: 's3', name: 'Hidratação', description: 'Tratamento de pelagem.', durationMinutes: 30, price: '45', color: '#92400e', active: false },
];
const tutors = [
  { id: 'c1', name: 'Mariana Costa', phone: '11999999999', email: 'mariana@example.com', address: 'Rua das Flores, 120', pets: [{ id: 'p1', name: 'Mel' }] },
  { id: 'c2', name: 'Rafael Lima', phone: '11999999998', email: 'rafael@example.com', address: 'Avenida Central, 45', pets: [{ id: 'p2', name: 'Bento' }] },
];
const pets = [
  { ...appointments[0].pet, breed: 'Golden Retriever', size: 'Grande', weight: '28.5', allergies: 'Sensibilidade a perfume forte', vaccinations: [{ id: 'v1', vaccineName: 'V10', status: 'active', nextDueAt: '2026-12-10' }], _count: { appointments: 8 } },
  { ...appointments[1].pet, breed: 'Shih-tzu', size: 'Pequeno', weight: '6.2', allergies: null, vaccinations: [{ id: 'v2', vaccineName: 'Antirrábica', status: 'active', nextDueAt: '2026-09-10' }], _count: { appointments: 12 } },
  { ...appointments[2].pet, breed: 'SRD', size: 'Médio', weight: '4.8', allergies: null, vaccinations: [], _count: { appointments: 3 } },
];
const products = [
  { id: 'pr1', name: 'Ração Premium Cães Adultos 15 kg', shortCode: 'PET001', unit: 'UN', active: true, priceCost: '168', priceSell: '229.90', stock: '8', minStock: '3', category: { id: 'cat1', name: 'Alimentação' } },
  { id: 'pr2', name: 'Bifinho Petisco 500 g', shortCode: 'PET004', unit: 'UN', active: true, priceCost: '14', priceSell: '25.90', stock: '3', minStock: '5', category: { id: 'cat1', name: 'Alimentação' } },
  { id: 'pr3', name: 'Condicionador Desembaraçante 500 ml', shortCode: 'PET006', unit: 'UN', active: true, priceCost: '13.50', priceSell: '27.90', stock: '0', minStock: '3', category: { id: 'cat2', name: 'Higiene e Cuidados' } },
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [375, 768, 1440, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
      await context.addInitScript(() => localStorage.setItem('7bar-auth', JSON.stringify({ state: {
        token: 'fixture',
        user: { id: 'qa', name: 'Eduardo Martins', role: 'admin', tenant: 'qa', termsAccepted: true },
      }, version: 0 })));
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname === '/api/tenants/me') data = { id: 'qa', name: 'Clínica Jardim', nomeFantasia: 'Clínica Jardim', modulos: { petshop: true } };
        else if (url.pathname === '/api/petshop/overview') data = { metrics: { pets: 184, tutors: 132, products: 63, today: 4, inProgress: 2, vaccinesDue: 7 }, nextAppointments: appointments };
        else if (url.pathname === '/api/petshop/appointments') data = appointments;
        else if (url.pathname === '/api/petshop/pets') data = pets;
        else if (url.pathname === '/api/petshop/tutors') data = tutors;
        else if (url.pathname === '/api/petshop/services') data = services;
        else if (url.pathname === '/api/products') data = { data: products, meta: { total: products.length, page: 1, lastPage: 1 } };
        else if (url.pathname === '/api/operators') data = [
          { id: 'o1', name: 'Camila Martins', jobTitle: 'Banhista', active: true, isManager: false, hasOpenRegister: true },
          { id: 'o2', name: 'Juliana Rocha', jobTitle: 'Tosador(a)', active: true, isManager: true, hasOpenRegister: false },
        ];
        else if (url.pathname === '/api/petshop/public/qa') data = {
          shop: { name: 'Clínica Jardim', logoUrl: null },
          customer: { name: 'Mariana Costa', pets: [pets[0]] },
          appointments: appointments.slice(0, 2),
          services: services.filter(service => service.active),
        };
        return route.fulfill({ json: data });
      });

      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/petshop`);
      await page.getByRole('heading', { name: 'Operação de hoje', exact: true }).waitFor();

      assert.equal(await page.getByText(/TelTech/i).count(), 0, 'Nome removido da experiência');
      assert.equal(await page.getByText('Operação em tempo real', { exact: true }).count(), 0, 'Sem promessa incorreta de tempo real');
      assert(await page.getByRole('heading', { name: 'Agenda do dia', exact: true }).isVisible());
      assert(await page.getByText('Prontos para retirada', { exact: true }).isVisible());
      assert(await page.getByText('Aguardando confirmação', { exact: true }).isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow horizontal em ${width}px`);
      assert.deepEqual(errors, []);

      await page.screenshot({ path: path.join(output, `petcare-${width}.png`), fullPage: true });

      if (width === 1440) {
        await page.getByRole('link', { name: 'Novo atendimento', exact: true }).click();
        await page.getByRole('dialog', { name: 'Novo agendamento' }).waitFor();
        assert(await page.getByLabel('Pet *').isVisible());
        await page.screenshot({ path: path.join(output, 'petcare-dialog-1440.png'), fullPage: false });
        await page.getByRole('button', { name: 'Fechar', exact: true }).click();
      }

      for (const screen of [
        { path: '/petshop/agenda', heading: 'Agenda', expected: 'Mel', file: 'agenda' },
        { path: '/petshop/pets', heading: 'Pets', expected: 'Golden Retriever', file: 'pets' },
        { path: '/petshop/tutores', heading: 'Tutores', expected: 'mariana@example.com', file: 'tutores' },
        { path: '/petshop/servicos', heading: 'Serviços', expected: 'Higiene completa e secagem.', file: 'servicos' },
        { path: '/petshop/produtos', heading: 'Produtos', expected: 'Ração Premium Cães Adultos 15 kg', file: 'produtos' },
        { path: '/petshop/equipe', heading: 'Equipe', expected: 'Camila Martins', file: 'equipe' },
      ]) {
        await page.goto(`${base}${screen.path}`);
        await page.getByRole('heading', { name: screen.heading, exact: true }).waitFor();
        await page.getByText(screen.expected, { exact: false }).first().waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow em ${screen.file} com ${width}px`);
        if (width === 375 || width === 1440) await page.screenshot({ path: path.join(output, `petcare-${screen.file}-${width}.png`), fullPage: true });
      }

      if (width === 1440) {
        await page.goto(`${base}/petshop/produtos`);
        await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
        await page.getByRole('dialog', { name: 'Novo Produto' }).waitFor();
        assert(await page.getByText('Foto do Produto', { exact: true }).isVisible());
        await page.screenshot({ path: path.join(output, 'petcare-produto-novo-1440.png'), fullPage: false });
        await page.getByRole('button', { name: 'Fechar cadastro de produto' }).click();
        await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
        await page.getByRole('dialog', { name: 'Editar Produto' }).waitFor();
        await page.screenshot({ path: path.join(output, 'petcare-produto-editar-1440.png'), fullPage: false });

        await page.goto(`${base}/petshop/pets`);
        await page.getByRole('button', { name: 'Novo pet', exact: true }).click();
        assert(await page.getByText('Foto do pet', { exact: true }).isVisible());
        assert(await page.getByRole('button', { name: 'Escolher foto', exact: true }).isVisible());

        await page.goto(`${base}/petshop/tutores`);
        await page.getByRole('button', { name: 'Novo tutor', exact: true }).click();
        assert(await page.getByText('Foto do tutor', { exact: true }).isVisible());
        assert(await page.getByRole('button', { name: 'Escolher foto', exact: true }).isVisible());

        await page.goto(`${base}/`);
        await page.getByRole('heading', { name: 'Seleção de Operador', exact: true }).waitFor();
        const modalBackground = await page.locator('.petcare-operator-modal > div').evaluate(element => getComputedStyle(element).backgroundColor);
        const posBackground = await page.locator('.petcare-pos-theme').evaluate(element => getComputedStyle(element).backgroundColor);
        assert.equal(modalBackground, 'rgb(255, 255, 255)', 'Modal do operador deve usar superfície clara no Pet Care');
        assert.equal(posBackground, 'rgb(246, 247, 249)', 'PDV deve usar o canvas do Pet Care');
        assert(await page.getByRole('button', { name: /Voltar ao Pet Care/ }).isVisible());
        await page.screenshot({ path: path.join(output, 'petcare-pdv-operador-1440.png'), fullPage: false });
      }

      await page.goto(`${base}/cliente-pet/qa#token=fixture`);
      await page.getByRole('heading', { name: 'Cuidados dos seus pets', exact: true }).waitFor();
      assert(await page.getByRole('heading', { name: 'Solicitar agendamento', exact: true }).isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow no portal com ${width}px`);
      if (width === 375 || width === 1440) await page.screenshot({ path: path.join(output, `petcare-portal-${width}.png`), fullPage: true });

      assert.deepEqual(errors, []);
      console.log(`PASS Pet Care ${width}px: painel, agenda, pets, tutores, serviços, produtos, equipe, PDV, portal e responsividade.`);
      await context.close();
    }
    console.log(`Capturas: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
