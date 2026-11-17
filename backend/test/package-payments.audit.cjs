// Requires a schema-only disposable MySQL instance; never accepts the application database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { PetshopPackagesService } = require('../dist/petshop/petshop-packages.service');
const { PetshopService } = require('../dist/petshop/petshop.service');
const { PetshopPricingService } = require('../dist/petshop/petshop-pricing.service');
const url = process.env.PRACTPET_AUDIT_URL_A;
const parsed = new URL(url || 'https://invalid');
if (parsed.protocol !== 'mysql:' || parsed.hostname !== '127.0.0.1' || parsed.port !== '3311' || parsed.pathname !== '/practpet_audit') {
  throw new Error('Use only the disposable practpet_audit database on 127.0.0.1:3311.');
}

test('split receipts persist, reconcile, roll back and confirm exactly once', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const manager = { getTenantClient: async () => db };
  const context = { get: () => ({ tenantId: 'audit-a', databaseUrl: url }) };
  const packages = new PetshopPackagesService(manager, context);
  const petshop = new PetshopService(manager, context, {}, packages, {}, new PetshopPricingService(), {}, {});
  const cents = n => Math.round(Number(n) * 100);
  const mix = (m, key) => cents(m.paymentMix.find(p => p.key === key)?.amount || 0);
  try {
    const customer = await db.customer.create({ data: { name: '[AUDIT_TEST] Split receipts', phone: String(Date.now()) } });
    const pets = await Promise.all(['A', 'B', 'C'].map(name => db.pet.create({ data: { name: '[AUDIT_TEST] ' + name, customerId: customer.id, species: 'dog', size: 'small' } })));
    const service = await db.petService.create({ data: { name: '[AUDIT_TEST] Split bath', price: 30 } });
    const plan = await db.petPackagePlan.create({ data: { name: '[AUDIT_TEST] Split plan', basePrice: 90, allowSharedPets: true, items: { create: { serviceId: service.id, quantity: 3 } } } });
    const base = { customerId: customer.id, petId: pets[0].id, packagePlanId: plan.id };
    const payments = [{ method: 'dinheiro', amount: 52 }, { method: 'pix', amount: 38 }];
    const before = await petshop.getMetrics('today');
    const contract = await packages.createContract({ ...base, payments });
    assert.deepEqual(contract.receipt.payments, payments);
    assert.equal(contract.paymentMethod, 'mixed');
    const after = await petshop.getMetrics('today');
    assert.equal(cents(after.totals.totalRevenue) - cents(before.totals.totalRevenue), 9000);
    assert.equal(mix(after, 'dinheiro') - mix(before, 'dinheiro'), 5200);
    assert.equal(mix(after, 'pix') - mix(before, 'pix'), 3800);
    assert.equal(cents(after.cashDrawer.cashSalesAmount) - cents(before.cashDrawer.cashSalesAmount), 5200);

    const count = await db.customerPetPackage.count();
    for (const invalid of [[{ method: 'pix', amount: 89.99 }], [{ method: 'pix', amount: 90.01 }], [{ method: 'pix', amount: -90 }], []]) {
      await assert.rejects(packages.createContract({ ...base, payments: invalid }));
    }
    assert.equal(await db.customerPetPackage.count(), count);

    const groupPayments = [{ method: 'dinheiro', amount: 52 }, { method: 'pix', amount: 38 }, { method: 'credito', amount: 85 }];
    const group = await packages.createContract({ ...base, multiPetMode: 'per_pet', petIds: pets.map(p => p.id),
      perPetConfigs: pets.map((p, i) => ({ petId: p.id, customPrice: i === 2 ? 58.34 : 58.33 })), payments: groupPayments });
    const persisted = await db.customerPetPackage.findMany({ where: { id: { in: group.groupContracts.map(c => c.id) } } });
    const totals = {};
    for (const c of persisted) {
      const receipt = JSON.parse(c.notes).receipt;
      assert.equal(receipt.payments.reduce((sum, p) => sum + cents(p.amount), 0), cents(c.finalPrice));
      for (const p of receipt.payments) totals[p.method] = (totals[p.method] || 0) + cents(p.amount);
    }
    assert.deepEqual(totals, { dinheiro: 5200, pix: 3800, credito: 8500 });

    const shared = await packages.createContract({ ...base, multiPetMode: 'shared', petIds: pets.slice(0, 2).map(p => p.id), payments });
    assert.deepEqual(shared.receipt.payments, payments);
    const pending = await packages.createContract({ ...base, billingMode: 'comanda' });
    await db.customerPetPackage.update({ where: { id: pending.id }, data: { createdAt: new Date(Date.now() - 86400000) } });
    const yesterday = await petshop.getMetrics('yesterday');
    await Promise.all([1, 2].map(() => packages.confirmContractPayment(pending.id, { payments })));
    assert.equal(await db.customerPetPackageLedger.count({ where: { customerPackageId: pending.id, eventType: 'PAYMENT_RECEIVED' } }), 1);
    assert.equal((await petshop.getMetrics('yesterday')).totals.totalRevenue, yesterday.totals.totalRevenue);
    assert.equal((await db.comanda.findUnique({ where: { id: pending.comandaId } })).status, 'cancelled');

    const professional = await db.operator.create({ data: { name: '[AUDIT_TEST] Parallel package scheduler', pin: 'test-only' } });
    const scheduledSessions = [{ startsAt: new Date(Date.now() + 18 * 86400000).toISOString(), professionalId: professional.id }];
    const appointmentsBefore = await db.petAppointment.count({ where: { professionalId: professional.id } });
    const concurrent = await Promise.allSettled(pets.slice(0, 2).map(p => packages.createContract({ ...base, petId: p.id, scheduledSessions })));
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await db.petAppointment.count({ where: { professionalId: professional.id } }), appointmentsBefore + 1);

    const consumed = await packages.createContract({ ...base, scheduledSessions: [1, 2].map(day => ({
      startsAt: new Date(Date.now() - day * 86400000).toISOString(), completed: true,
    })) });
    const consumedRow = await db.petAppointmentService.findFirst({ where: { customerPackageId: consumed.id, coverageStatus: 'consumed' } });
    const refunds = await Promise.allSettled([1, 2].map(() => packages.refundConsumedSession(consumed.id, {
      packageItemId: consumedRow.customerPackageItemId, appointmentId: consumedRow.appointmentId, reason: '[AUDIT_TEST] Concurrent refund',
    })));
    assert.equal(refunds.filter(r => r.status === 'fulfilled').length, 1);
    const balance = await db.customerPetPackageItem.findUnique({ where: { id: consumedRow.customerPackageItemId } });
    assert.equal(balance.usedQuantity, 1);
    assert.equal(balance.availableQuantity, 2);

    const financialBefore = await packages.getFinancialOverview();
    const rounding = await packages.createContract({ ...base, customPrice: 175 });
    await db.customerPetPackageItem.updateMany({ where: { customerPackageId: rounding.id }, data: { usedQuantity: 3, availableQuantity: 0 } });
    const financialAfter = await packages.getFinancialOverview();
    assert.equal(cents(financialAfter.totals.recognizedRevenue) - cents(financialBefore.totals.recognizedRevenue), 17500);
    assert.equal(financialAfter.totals.deferredRevenue, financialBefore.totals.deferredRevenue);
    await assert.rejects(petshop.getMetrics('custom', '2026-02-30', '2026-03-01'));
    await assert.rejects(petshop.getMetrics('custom', '2026-11-17', '2026-11-01'));
    const week = await petshop.getMetrics('week');
    assert.equal(new Date(week.end).getTime() - new Date(week.start).getTime() + 1, 7 * 86400000);
  } finally { await db.$disconnect(); }
});
