import { Prisma } from '@prisma/client';
import { recordAddedServiceCommissions } from './petshop-checkout';

describe('additional service commission at checkout', () => {
  it('credits only additions still present and keeps the captured rule version', async () => {
    const tx: any = {
      petAppointmentService: { findMany: jest.fn().mockResolvedValue([{ id: 'kept', serviceId: 'flea', priceSnapshot: '30.00' }]) },
      petCommissionRule: { findUnique: jest.fn().mockResolvedValue({ id: 'rule-v1', serviceId: 'flea', kind: 'PERCENT', value: new Prisma.Decimal(10), version: 1 }) },
      petCommission: { createMany: jest.fn() },
    };
    const appointment = { id: 'appointment', stageHistory: [
      { kind: 'service_added', appointmentServiceId: 'kept', operatorId: 'operator-a', commissionRuleId: 'rule-v1' },
      { kind: 'service_added', appointmentServiceId: 'removed', operatorId: 'operator-a', commissionRuleId: 'rule-v1' },
      { kind: 'service_added', appointmentServiceId: 'tracked-only', operatorId: 'operator-a' },
    ] };
    await recordAddedServiceCommissions(tx, appointment, 'tenant', new Date('2026-11-09T12:00:00Z'));
    expect(tx.petCommission.createMany).toHaveBeenCalledTimes(1);
    expect(tx.petCommission.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      appointmentServiceId: 'kept', operatorId: 'operator-a', stageKey: 'service_added', amount: new Prisma.Decimal('3.00'), ruleVersion: 1,
    })], skipDuplicates: true });
  });
});
