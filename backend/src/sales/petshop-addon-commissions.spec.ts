import { Prisma } from '@prisma/client';
import { recordAddedServiceCommissions } from './petshop-checkout';

describe('additional service commission at checkout', () => {
  it('credits only additions still present and keeps the captured rule version', async () => {
    const tx: any = {
      petAppointmentService: { findMany: jest.fn().mockResolvedValue([{ id: 'kept', serviceId: 'flea', priceSnapshot: '30.00' }]) },
      petCommissionRule: { findUnique: jest.fn().mockResolvedValue({ id: 'rule-v2', serviceId: 'flea', kind: 'FIXED', value: new Prisma.Decimal(5), version: 2 }) },
      petCommission: { createMany: jest.fn() },
    };
    const appointment = { id: 'appointment', stageHistory: [
      { kind: 'service_added', appointmentServiceId: 'kept', operatorId: 'operator-a', commissionRuleId: 'rule-v2' },
      { kind: 'service_added', appointmentServiceId: 'removed', operatorId: 'operator-a', commissionRuleId: 'rule-v2' },
      { kind: 'service_added', appointmentServiceId: 'tracked-only', operatorId: 'operator-a' },
    ] };
    await recordAddedServiceCommissions(tx, appointment, 'tenant', new Date('2026-11-09T12:00:00Z'));
    expect(tx.petCommission.createMany).toHaveBeenCalledTimes(1);
    expect(tx.petCommission.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      appointmentServiceId: 'kept', operatorId: 'operator-a', stageKey: 'service_added', amount: new Prisma.Decimal('5.00'), ruleVersion: 2, ruleKind: 'FIXED',
    })], skipDuplicates: true });
  });

  it('honors a percentage rule captured before the fixed-value change', async () => {
    const tx: any = {
      petAppointmentService: { findMany: jest.fn().mockResolvedValue([{ id: 'old', serviceId: 'flea', priceSnapshot: '30.00' }]) },
      petCommissionRule: { findUnique: jest.fn().mockResolvedValue({ id: 'old-rule', serviceId: 'flea', kind: 'PERCENT', value: new Prisma.Decimal(10), version: 1 }) },
      petCommission: { createMany: jest.fn() },
    };
    await recordAddedServiceCommissions(tx, { id: 'appointment', stageHistory: [
      { kind: 'service_added', appointmentServiceId: 'old', operatorId: 'operator-a', commissionRuleId: 'old-rule' },
    ] }, 'tenant', new Date('2026-11-09T12:00:00Z'));
    expect(tx.petCommission.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      amount: new Prisma.Decimal('3.00'), ruleKind: 'PERCENT',
    })], skipDuplicates: true });
  });

  it('confirma uma comissão aguardando cobrança uma única vez', async () => {
    const tx: any = {
      petAppointmentService: { findMany: jest.fn().mockResolvedValue([{ id: 'extra', serviceId: 'svc', priceSnapshot: '15.00' }]) },
      petCommissionRule: { findUnique: jest.fn().mockResolvedValue({ id: 'rule', serviceId: 'svc', kind: 'FIXED', value: new Prisma.Decimal(5), version: 1 }) },
      petCommission: { findUnique: jest.fn().mockResolvedValue({ id: 'commission', state: 'AWAITING_PAYMENT' }), update: jest.fn(), createMany: jest.fn() },
    };
    await recordAddedServiceCommissions(tx, { id: 'appointment', stageHistory: [
      { kind: 'service_added', appointmentServiceId: 'extra', operatorId: 'worker', commissionRuleId: 'rule' },
    ] }, 'tenant', new Date('2026-11-17T18:00:00Z'), ['extra'], true);
    expect(tx.petCommission.update).toHaveBeenCalledWith({ where: { id: 'commission' }, data: expect.objectContaining({ state: 'PENDING' }) });
    expect(tx.petCommission.createMany).not.toHaveBeenCalled();
  });
});
