import { PetshopService } from './petshop.service';

function fixture(status = 'finishing', commissionState = 'PENDING') {
  const current = {
    id: 'appointment-1', status, updatedAt: new Date('2026-11-17T12:00:00Z'),
    stageHistory: [{ status: 'bathing', label: 'Banho', at: '2026-11-17T11:00:00Z', userName: 'Administradora' }],
    pet: { size: 'small' }, services: [{ id: 'service-1', serviceId: 'bath', priceSnapshot: 50 }],
  };
  const tx = {
    $queryRaw: jest.fn(),
    petAppointment: {
      findUnique: jest.fn().mockImplementation(({ include }) => include ? current : { updatedAt: current.updatedAt, status: current.status }),
      update: jest.fn().mockImplementation(({ data }) => ({ ...current, ...data })),
    },
    petCommission: { findMany: jest.fn().mockResolvedValue(commissionState ? [{ state: commissionState, operatorId: 'admin-op' }] : []), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    petAppointment: { findUnique: jest.fn().mockResolvedValue(current) },
    operator: { findFirst: jest.fn().mockResolvedValue({ id: 'banhista', name: 'Banhista' }) },
    comanda: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn().mockImplementation(callback => callback(tx)),
  };
  const service = Object.create(PetshopService.prototype) as any;
  service.stationAccess = { assertPetshopCommissionAdmin: jest.fn().mockResolvedValue(undefined) };
  service.prisma = jest.fn().mockResolvedValue(prisma);
  service.pricing = { resolveAppointmentStages: jest.fn().mockReturnValue([{ key: 'checked_in', label: 'Check-in' }, { key: 'bathing', label: 'Banho' }, { key: 'finishing', label: 'Finalização' }, { key: 'ready', label: 'Pronto' }]), getSkippedStages: jest.fn().mockReturnValue([]) };
  service.getTenantStages = jest.fn().mockResolvedValue([{ key: 'bathing', trackProfessional: true }]);
  service.commissions = { sessionOperator: jest.fn().mockResolvedValue({ id: 'admin-op', name: 'Administradora' }), recordExecution: jest.fn() };
  service.tenantContext = { get: () => ({ userId: 'admin-user' }) };
  service.resolveUserDisplayName = jest.fn().mockResolvedValue('Administradora');
  return { service, prisma, tx, current };
}

describe('Apontamento administrativo de etapas', () => {
  const req = { user: { role: 'admin', id: 'admin-user' }, headers: { 'x-operator-token': 'admin-pin-token' } };

  it('atribui Banho ao funcionário, registra auditoria e mantém o status', async () => {
    const { service, tx } = fixture();
    const result = await service.assignAppointmentStage('appointment-1', 'bathing', { operatorId: 'banhista' }, req);
    expect(service.commissions.recordExecution).toHaveBeenCalledWith(tx, expect.anything(), 'bathing', 'banhista', new Date('2026-11-17T11:00:00Z'));
    expect(tx.petAppointment.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(result.stageHistory).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: 'stage_assigned', status: 'bathing', operatorId: 'banhista', operatorName: 'Banhista',
      userName: 'Administradora', previousOperatorId: 'admin-op',
    })]));
  });

  it('não altera comissão aprovada ou paga', async () => {
    const { service, tx } = fixture('delivered', 'APPROVED');
    await expect(service.assignAppointmentStage('appointment-1', 'bathing', { operatorId: 'banhista' }, req)).rejects.toThrow('aprovada');
    expect(service.commissions.recordExecution).not.toHaveBeenCalled();
    expect(tx.petAppointment.update).not.toHaveBeenCalled();
  });

  it('não aponta etapa futura nem aceita sessão sem PIN administrativo', async () => {
    const { service, prisma } = fixture('checked_in');
    await expect(service.assignAppointmentStage('appointment-1', 'bathing', { operatorId: 'banhista' }, req)).rejects.toThrow('Avance');
    service.stationAccess.assertPetshopCommissionAdmin.mockRejectedValueOnce(new Error('PIN administrativo obrigatório'));
    await expect(service.assignAppointmentStage('appointment-1', 'checked_in', { operatorId: 'banhista' }, req)).rejects.toThrow('PIN administrativo');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('avança Banho e registra a comissão para o banhista, com autoria da administradora', async () => {
    const { service, tx, current } = fixture('checked_in', null);
    current.stageHistory = [];
    const result = await service.updateAppointmentStatus('appointment-1', { status: 'bathing', commissionOperatorId: 'banhista' }, req);
    expect(service.commissions.recordExecution).toHaveBeenCalledWith(tx, current, 'bathing', 'banhista', expect.any(Date));
    expect(result.status).toBe('bathing');
    expect(result.stageHistory).toEqual(expect.arrayContaining([expect.objectContaining({
      status: 'bathing', userName: 'Administradora', operatorId: 'banhista', operatorName: 'Banhista',
    })]));
  });

  it('bloqueia entrega direta enquanto há serviço avulso a cobrar', async () => {
    const { service, prisma } = fixture('ready', null);
    await expect(service.updateAppointmentStatus('appointment-1', { status: 'delivered' }, req)).rejects.toThrow('Há serviços ou Táxi Dog a cobrar');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bloqueia entrega após venda anterior quando um serviço novo segue sem cobrança', async () => {
    const { service, prisma, current } = fixture('ready', null);
    current.stageHistory.push({ kind: 'service_added', appointmentServiceId: 'service-1', at: '2026-11-17T13:00:00Z' } as any);
    prisma.comanda.findFirst.mockResolvedValue({ sale: { createdAt: new Date('2026-11-17T12:00:00Z') } });
    await expect(service.updateAppointmentStatus('appointment-1', { status: 'delivered' }, req)).rejects.toThrow('Há serviços ou Táxi Dog a cobrar');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
