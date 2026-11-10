const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PetshopPackagesService } = require('../dist/petshop/petshop-packages.service');
const { PetshopService } = require('../dist/petshop/petshop.service');
const { ProductsService } = require('../dist/products/products.service');
const { PetshopPricingService } = require('../dist/petshop/petshop-pricing.service');

const urlA = process.env.PRACTPET_AUDIT_URL_A;
const urlB = process.env.PRACTPET_AUDIT_URL_B;
if (!urlA || !urlB || ![urlA, urlB].every(value => {
  const url = new URL(value);
  return url.protocol === 'mysql:' && ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    url.port === '3311' && ['practpet_audit', 'practpet_audit_b'].includes(url.pathname.slice(1));
}) || new URL(urlA).pathname === new URL(urlB).pathname) {
  throw new Error('Use apenas duas bases MySQL locais e isoladas na porta 3311.');
}

test('persistência de pacotes e isolamento entre duas bases de teste', async () => {
  const clients = {
    a: new PrismaClient({ datasources: { db: { url: urlA } } }),
    b: new PrismaClient({ datasources: { db: { url: urlB } } }),
  };
  let currentTenant = 'a';
  const packages = new PetshopPackagesService(
    { getTenantClient: async tenantId => clients[tenantId] },
    { get: () => ({ tenantId: currentTenant, databaseUrl: currentTenant === 'a' ? urlA : urlB }) },
  );
  const petshop = new PetshopService(
    { getTenantClient: async tenantId => clients[tenantId] },
    { get: () => ({ tenantId: currentTenant, databaseUrl: currentTenant === 'a' ? urlA : urlB }) },
    {}, packages, {}, { resolveAppointmentStages: () => [] }, {}, {},
  );
  const stockSyncCalls = [];
  const products = new ProductsService(
    { getTenantClient: async tenantId => clients[tenantId] },
    { get: () => ({ tenantId: currentTenant, databaseUrl: currentTenant === 'a' ? urlA : urlB }) },
    {}, { syncProductStock: async (tenantId, ids) => { stockSyncCalls.push({ tenantId, ids }); } },
  );
  try {
    await Promise.all(Object.values(clients).map(client => client.$connect()));
    const petId = randomUUID();
    const serviceId = randomUUID();
    const fixture = async (client, suffix, paymentStatus) => {
      const customer = await client.customer.create({ data: { name: `Tutor audit ${suffix}`, phone: `119${randomUUID().replace(/\D/g, '').padEnd(12, '0').slice(0, 12)}` } });
      await client.pet.create({ data: { id: petId, customerId: customer.id, name: `Pet audit ${suffix}` } });
      await client.petService.create({ data: { id: serviceId, name: 'Banho audit', price: 50 } });
      const contract = await client.customerPetPackage.create({ data: {
        customerId: customer.id, petId, planNameSnapshot: `Plano audit ${suffix}`,
        basePriceSnapshot: 50, finalPrice: 50, expiresAt: new Date(Date.now() + 86400000),
        status: 'active', paymentStatus,
        notes: JSON.stringify({ transport: { enabled: true, mode: 'round_trip' }, userNotes: null }),
      } });
      const item = await client.customerPetPackageItem.create({ data: {
        customerPackageId: contract.id, serviceId, serviceNameSnapshot: 'Banho audit',
        totalQuantity: 2, availableQuantity: 2,
      } });
      const appointment = await client.petAppointment.create({ data: {
        customerId: customer.id, petId, startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000), status: 'scheduled',
      } });
      await client.petAppointmentService.create({ data: {
        appointmentId: appointment.id, serviceId, nameSnapshot: 'Banho audit',
        priceSnapshot: 50, durationMinutes: 60,
      } });
      return { customer, contract, item, appointment };
    };
    const a = await fixture(clients.a, 'A', 'pending');
    const b = await fixture(clients.b, 'B', 'paid');
    const oldDate = new Date(Date.now() - 2 * 86400000);
    const oldAppointment = async (client, customerId, mode, status = 'scheduled') => client.petAppointment.create({ data: {
      customerId, petId, startsAt: oldDate, endsAt: new Date(oldDate.getTime() + 3600000), status,
      checkInNotes: JSON.stringify({ transport: { enabled: true, mode, address: 'Rua audit, 10', fee: 0 } }),
    } });
    const oldA = await oldAppointment(clients.a, a.customer.id, 'pickup_only');
    await oldAppointment(clients.a, a.customer.id, 'dropoff_only');
    await oldAppointment(clients.a, a.customer.id, 'pickup_only', 'cancelled');
    const oldB = await oldAppointment(clients.b, b.customer.id, 'pickup_only');

    assert.equal((await packages.getAvailablePackagesForPet(petId)).length, 0);
    assert.deepEqual((await petshop.listOverduePickups(new Date().toISOString()))
      .filter(item => item.customerId === a.customer.id).map(item => item.id), [oldA.id]);
    const reserve = (client, selection, mode) => client.$transaction(async tx => {
      const rows = await packages.reserveSessionsForAppointmentInTx(tx, {
        appointmentId: a.appointment.id, petId, customerId: a.customer.id,
        startsAt: new Date(), packageSelections: selection,
      });
      if (mode) await packages.assertTransportCoverageForReservationsInTx(tx, rows, mode);
      return rows;
    });
    await assert.rejects(reserve(clients.a, {}, 'round_trip'), /sessão de pacote reservada/);
    await assert.rejects(reserve(clients.a, { [serviceId]: a.contract.id }), /ainda não está pago/);
    await assert.rejects(reserve(clients.a, { [randomUUID()]: a.contract.id }), /não pertence ao agendamento/);
    assert.equal((await clients.a.customerPetPackageItem.findUnique({ where: { id: a.item.id } })).availableQuantity, 2);
    assert.equal(await clients.a.customerPetPackageLedger.count({ where: { customerPackageId: a.contract.id } }), 0);

    currentTenant = 'b';
    const availableB = await packages.getAvailablePackagesForPet(petId);
    assert.deepEqual(availableB.map(contract => contract.id), [b.contract.id]);
    assert.deepEqual((await petshop.listOverduePickups(new Date().toISOString()))
      .filter(item => item.customerId === b.customer.id).map(item => item.id), [oldB.id]);
    assert.equal(await clients.b.customerPetPackageLedger.count({ where: { customerPackageId: b.contract.id } }), 0);

    currentTenant = 'a';
    await clients.a.customerPetPackage.update({ where: { id: a.contract.id }, data: { paymentStatus: 'paid' } });
    const result = await reserve(clients.a, { [serviceId]: a.contract.id }, 'round_trip');
    assert.equal(result.length, 1);
    assert.equal((await clients.a.customerPetPackageItem.findUnique({ where: { id: a.item.id } })).availableQuantity, 1);
    assert.equal(await clients.a.customerPetPackageLedger.count({ where: { customerPackageId: a.contract.id } }), 1);
    assert.equal((await clients.b.customerPetPackageItem.findUnique({ where: { id: b.item.id } })).availableQuantity, 2);
    assert.equal(await clients.b.customerPetPackageLedger.count({ where: { customerPackageId: b.contract.id } }), 0);

    const barcode = randomUUID().replace(/\D/g, '').padEnd(13, '0').slice(0, 13);
    const categoryA = await clients.a.category.create({ data: { name: `Categoria audit ${randomUUID()}` } });
    const productA = await products.create({
      name: `Produto audit ${randomUUID()}`, categoryId: categoryA.id, barcode,
      unit: 'UN', priceCost: 5, priceSell: 12.34, stock: 2,
    });
    const persistedA = await clients.a.product.findUnique({ where: { id: productA.id } });
    assert.equal(persistedA.barcode, barcode);
    assert.equal(persistedA.unit, 'UN');
    assert.equal(Number(persistedA.priceSell), 12.34);
    assert.equal(Number(persistedA.stock), 2);
    assert.equal(await clients.a.stockLot.count({ where: { productId: productA.id } }), 1);
    await products.update(productA.id, { unit: 'PCT', priceSell: 14.5, stock: 3 });
    const editedA = await clients.a.product.findUnique({ where: { id: productA.id } });
    assert.equal(editedA.unit, 'PCT');
    assert.equal(Number(editedA.priceSell), 14.5);
    assert.equal(Number(editedA.stock), 3);
    assert.deepEqual(stockSyncCalls, [{ tenantId: 'a', ids: [productA.id] }]);
    await assert.rejects(products.create({
      name: productA.name, categoryId: categoryA.id, priceSell: 12.34,
    }), /Já existe um produto/);

    currentTenant = 'b';
    const categoryB = await clients.b.category.create({ data: { name: `Categoria audit ${randomUUID()}` } });
    const productB = await products.create({
      name: `Produto audit ${randomUUID()}`, categoryId: categoryB.id, barcode,
      unit: 'UN', priceCost: 5, priceSell: 17, stock: 1,
    });
    assert.equal(await clients.b.product.findUnique({ where: { id: productA.id } }), null);
    assert.equal((await clients.b.product.findUnique({ where: { id: productB.id } })).barcode, barcode);

    currentTenant = 'a';
    const professional = await clients.a.operator.create({ data: { name: 'Profissional audit', pin: 'audit-pin' } });
    let checks = 0;
    let releaseGate;
    const gate = new Promise(resolve => { releaseGate = resolve; });
    const wrapAppointment = delegate => new Proxy(delegate, {
      get(target, property) {
        if (property === 'findFirst') return async args => {
          const result = await target.findFirst(args);
          if (args?.where?.professionalId === professional.id && !result) {
            checks++;
            if (checks === 2) releaseGate();
            await gate;
          }
          return result;
        };
        return Reflect.get(target, property);
      },
    });
    const gatedClient = new Proxy(clients.a, {
      get(target, property) {
        if (property === 'petAppointment') return wrapAppointment(target.petAppointment);
        if (property === '$transaction') return callback => target.$transaction(tx => callback(new Proxy(tx, {
          get(transaction, key) {
            return key === 'petAppointment' ? wrapAppointment(transaction.petAppointment) : Reflect.get(transaction, key);
          },
        })));
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const racePetshop = new PetshopService(
      { getTenantClient: async () => gatedClient },
      { get: () => ({ tenantId: 'a', databaseUrl: urlA }) },
      {}, packages, { enqueueAppointmentEvent: async () => {} }, new PetshopPricingService(), {}, {},
    );
    const concurrentStart = new Date(Date.now() + 3 * 86400000);
    const booking = () => racePetshop.createAppointment({ petId, serviceIds: [serviceId], startsAt: concurrentStart.toISOString(), professionalId: professional.id });
    const gateTimeout = setTimeout(() => releaseGate(), 250);
    const results = await Promise.allSettled([booking(), booking()]);
    clearTimeout(gateTimeout);
    assert.ok(checks >= 1);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, 'o mesmo profissional não pode receber dois agendamentos simultâneos');
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);

    const originalA = await clients.a.petAppointment.create({ data: {
      customerId: a.customer.id, petId, startsAt: new Date(Date.now() + 6 * 86400000),
      endsAt: new Date(Date.now() + 6 * 86400000 + 3600000), status: 'scheduled',
    } });
    const originalB = await clients.a.petAppointment.create({ data: {
      customerId: a.customer.id, petId, startsAt: new Date(Date.now() + 7 * 86400000),
      endsAt: new Date(Date.now() + 7 * 86400000 + 3600000), status: 'scheduled',
    } });
    const sameNewTime = new Date(Date.now() + 5 * 86400000).toISOString();
    const rescheduled = await Promise.allSettled([
      racePetshop.updateAppointment(originalA.id, { startsAt: sameNewTime, professionalId: professional.id }),
      racePetshop.updateAppointment(originalB.id, { startsAt: sameNewTime, professionalId: professional.id }),
    ]);
    assert.equal(rescheduled.filter(result => result.status === 'fulfilled').length, 1, 'reagendamentos concorrentes não podem ocupar o mesmo profissional');
    assert.equal(rescheduled.filter(result => result.status === 'rejected').length, 1);
  } finally {
    await Promise.all(Object.values(clients).map(client => client.$disconnect()));
  }
});
