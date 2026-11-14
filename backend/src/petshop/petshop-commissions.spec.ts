import { Prisma } from '@prisma/client';
import { PetshopCommissionsService } from './petshop-commissions.service';

const D = (value: string | number) => new Prisma.Decimal(value);
const service = new PetshopCommissionsService({} as any, { get: () => ({ tenantId: 'tenant-a' }) } as any, {} as any, { suggestStages: () => ['bathing'] } as any);
const rule = (kind: string, value: string, serviceId: string | null = null, operatorId: string | null = null) => ({ id: `${kind}-${serviceId}-${operatorId}`, stageKey: 'bathing', kind, value: D(value), version: 1, serviceId, operatorId });

describe('PetshopCommissionsService', () => {
  it('aplica precedência serviço+profissional, profissional, serviço, etapa', () => {
    const rules = [rule('NONE', '0'), rule('PERCENT', '5', 'bath'), rule('PERCENT', '8', null, 'ana'), rule('FIXED', '12', 'bath', 'ana')];
    const choose = (service as any).resolveRule.bind(service);
    expect(choose(rules, 'bath', 'ana').kind).toBe('FIXED');
    expect(choose(rules, 'other', 'ana').value.toString()).toBe('8');
    expect(choose(rules, 'bath', 'other').value.toString()).toBe('5');
    expect(choose(rules, 'other', 'other').kind).toBe('NONE');
  });

  it('distribui combo sem contar valor no item pai e preserva centavos', () => {
    const bases = (service as any).bases([
      { id: 'combo', isCombo: true, priceSnapshot: D('100.00') },
      { id: 'bath', comboParentId: 'combo', commissionWeightSnapshot: D('60.00') },
      { id: 'groom', comboParentId: 'combo', commissionWeightSnapshot: D('40.00') },
    ]);
    expect(bases.has('combo')).toBe(false);
    expect(bases.get('bath').toString()).toBe('60');
    expect(bases.get('groom').toString()).toBe('40');
  });

  it.each(['reserved', 'consumed'])('usa valor contratual da sessão %s e arredonda percentual em decimal', async (coverageStatus) => {
    const created: any[] = [];
    const tx = { petCommissionRule: { findMany: jest.fn().mockResolvedValue([rule('PERCENT', '7.5')]) }, petCommission: { createMany: jest.fn().mockImplementation(({ data }) => { created.push(...data); }) } } as any;
    await service.recordExecution(tx, { id: 'appointment', services: [{ id: 'session', serviceId: 'bath', priceSnapshot: D('0'), coverageStatus, customerPackageItem: { unitValueSnapshot: D('33.33') } }] }, 'bathing', 'ana', new Date());
    expect(created[0].baseAmount.toString()).toBe('33.33');
    expect(created[0].amount.toString()).toBe('2.5');
    expect(created[0].tenantId).toBe('tenant-a');
  });

  it('registra produtividade sem valor e comissão fixa por execução', async () => {
    const created: any[] = [];
    const tx = { petCommissionRule: { findMany: jest.fn().mockResolvedValue([rule('NONE', '0'), rule('FIXED', '9.50', 'bath')]) }, petCommission: { createMany: jest.fn().mockImplementation(({ data }) => { created.push(...data); }) } } as any;
    await service.recordExecution(tx, { id: 'a', services: [{ id: 's1', serviceId: 'bath', priceSnapshot: D('100') }, { id: 's2', serviceId: 'other', priceSnapshot: D('20') }] }, 'bathing', 'ana', new Date());
    expect(created.map(c => c.amount.toString())).toEqual(['9.5', '0']);
    expect(tx.petCommission.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('gera ajuste auditável ao cancelar e não duplica estorno', async () => {
    const tx = {
      petCommission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'commission', state: 'PAID', amount: D('12.50') }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      petCommissionAdjustment: { create: jest.fn() },
    } as any;
    await service.reverseAppointmentInTx(tx, 'appointment', 'admin', 'cancelado');
    expect(tx.petCommissionAdjustment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ commissionId: 'commission', amount: D('-12.50'), actorId: 'admin' }) });
    tx.petCommission.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.reverseAppointmentInTx(tx, 'appointment', 'admin', 'cancelado');
    expect(tx.petCommissionAdjustment.create).toHaveBeenCalledTimes(1);
  });

  it('atribui etapas do mesmo atendimento a profissionais diferentes', async () => {
    const created: any[] = [];
    const tx = { petCommissionRule: { findMany: jest.fn().mockResolvedValue([rule('FIXED', '5')]) }, petCommission: { createMany: jest.fn().mockImplementation(({ data }) => created.push(...data)) } } as any;
    const appointment = { id: 'a', services: [{ id: 's', serviceId: 'bath', priceSnapshot: D('50'), service: { customStages: ['bathing', 'grooming'] } }] };
    await service.recordExecution(tx, appointment, 'bathing', 'ana', new Date());
    await service.recordExecution(tx, appointment, 'grooming', 'bia', new Date());
    expect(created.map(row => row.operatorId)).toEqual(['ana', 'bia']);
    expect(created.map(row => row.stageKey)).toEqual(['bathing', 'grooming']);
    expect(created.every(row => row.appointmentId === 'a')).toBe(true);
  });

  it('recusa regras monetárias inválidas', () => {
    const validate = (service as any).validateRule.bind(service);
    expect(() => validate({ stageKey: 'bathing', kind: 'PERCENT', value: '100.1' })).toThrow();
    expect(() => validate({ stageKey: 'bathing', kind: 'FIXED', value: '1.001' })).toThrow();
    expect(() => validate({ stageKey: 'bathing', kind: 'NONE', value: '1' })).toThrow();
  });

  it('restringe todas as ações financeiras à administração', () => {
    expect(() => service.assertAdmin({ user: { role: 'operator' } })).toThrow();
    expect(() => service.assertAdmin({ user: { role: 'station', type: 'station-session' } })).toThrow();
    expect(() => service.assertAdmin({ user: { role: 'admin' } })).not.toThrow();
  });

  it('aprova lançamentos e registra pagamento apenas em operação separada', async () => {
    const tx = {
      petCommissionClosing: { upsert: jest.fn().mockResolvedValue({ id: 'closing', state: 'DRAFT' }), update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ id: 'closing', state: 'APPROVED', approvedAmount: D('10') }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      petCommission: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([{ amount: D('10') }]), count: jest.fn().mockResolvedValue(0) },
      petCommissionAdjustment: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    } as any;
    const db = { $transaction: (callback: any) => callback(tx) };
    const target = new PetshopCommissionsService({} as any, {} as any, {} as any, {} as any);
    (target as any).db = async () => db;
    const actor = { user: { role: 'admin', id: 'admin' } };
    await target.approve(actor, '2020-01');
    expect(tx.petCommission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'APPROVED' }) }));
    await target.pay(actor, '2020-01', 'pix-123');
    expect(tx.petCommissionClosing.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ state: 'APPROVED' }), data: expect.objectContaining({ state: 'PAID', paymentRef: 'pix-123', paidAmount: D('10') }) }));
    expect(tx.petCommission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'PAID' }) }));
  });

  it('salva e desativa regra de serviço extra adicionado mantendo settings sincronizados', async () => {
    const upsertedSettings: any[] = [];
    const createdRules: any[] = [];
    const updatedRules: any[] = [];
    const tx = {
      tenantSettings: {
        upsert: jest.fn().mockImplementation(arg => { upsertedSettings.push(arg); }),
        findUnique: jest.fn().mockResolvedValue({ paymentMethodsConfig: { trackAddedBy: true, commissionOnAdd: true, commissionAmount: 5 } }),
      },
      petCommissionRule: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(arg => { createdRules.push(arg.data); return { id: 'rule-addon-1', ...arg.data }; }),
        update: jest.fn().mockImplementation(arg => { updatedRules.push(arg); return { id: arg.where.id, ...arg.data }; }),
      },
    } as any;
    const db = {
      petService: { findUnique: jest.fn().mockResolvedValue({ id: 'svc-1', serviceType: 'INDIVIDUAL' }) },
      tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      petCommissionRule: { findUnique: jest.fn().mockResolvedValue({ id: 'rule-addon-1', stageKey: 'service_added', serviceId: 'svc-1', active: true }) },
      $transaction: (callback: any) => callback(tx),
    } as any;

    const target = new PetshopCommissionsService({} as any, {} as any, {} as any, {} as any);
    (target as any).db = async () => db;
    const actor = { user: { role: 'admin', id: 'admin' } };

    const saved = await target.saveRule(actor, { stageKey: 'service_added', serviceId: 'svc-1', kind: 'FIXED', value: '7.50' });
    expect(saved.stageKey).toBe('service_added');
    expect(upsertedSettings[0]).toEqual(expect.objectContaining({ where: { id: 'petshop_addon:svc-1' } }));
    expect(createdRules[0]).toEqual(expect.objectContaining({ scopeKey: 'service_added:svc-1:*', kind: 'FIXED', value: D(7.5) }));

    await target.deleteRule(actor, 'rule-addon-1');
    expect(updatedRules[0]).toEqual({ where: { id: 'rule-addon-1' }, data: { active: false } });
    expect(upsertedSettings[1].update.paymentMethodsConfig).toEqual(expect.objectContaining({ commissionOnAdd: false, commissionAmount: 0 }));
  });
});
