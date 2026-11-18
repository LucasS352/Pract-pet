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
    petCommission: {
      findMany: jest.fn().mockResolvedValue(commissionState ? [{ id: 'comm-1', state: commissionState, operatorId: 'admin-op' }] : []),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
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
    expect(result.stageHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'bathing',
        operatorId: 'banhista',
        operatorName: 'Banhista',
        previousOperatorId: 'admin-op',
        previousOperatorName: 'Administradora',
      }),
      expect.objectContaining({
        kind: 'stage_assigned', status: 'bathing', operatorId: 'banhista', operatorName: 'Banhista',
        userName: 'Administradora', previousOperatorId: 'admin-op',
      }),
    ]));
  });

  it('corrige e transfere comissão de serviço adicional (service_added) no histórico apenas com PIN administrativo', async () => {
    const { service, tx, current } = fixture('finishing', 'AWAITING_PAYMENT');
    current.stageHistory.push({
      kind: 'service_added',
      status: 'finishing',
      label: 'Serviço adicionado: Antipulga',
      appointmentServiceId: 'service-1',
      at: '2026-11-17T11:30:00Z',
      userName: 'Bruno',
      operatorId: 'admin-op',
      commissionRecipientName: 'Bruno',
      commissionAmount: 5,
      commissionState: 'AWAITING_PAYMENT',
    } as any);
    const result = await service.assignAppointmentStage(
      'appointment-1',
      'service_added',
      { operatorId: 'banhista', appointmentServiceId: 'service-1' },
      req,
    );
    expect(tx.petCommission.updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: 'appointment-1',
        stageKey: 'service_added',
        appointmentServiceId: 'service-1',
        state: { in: ['PENDING', 'AWAITING_PAYMENT'] },
      },
      data: { operatorId: 'banhista' },
    });
    expect(result.stageHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'service_added',
        appointmentServiceId: 'service-1',
        operatorId: 'banhista',
        commissionRecipientName: 'Banhista',
        previousOperatorId: 'admin-op',
        previousOperatorName: 'Bruno',
      }),
      expect.objectContaining({
        kind: 'stage_assigned',
        status: 'service_added',
        appointmentServiceId: 'service-1',
        operatorId: 'banhista',
        operatorName: 'Banhista',
      }),
    ]));
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

  it('reabre um concluído somente com autorização, registra motivo e preserva a sessão do pacote', async () => {
    const { service, tx, current } = fixture('delivered', null);
    (current as any).completedAt = new Date('2026-11-17T12:00:00Z');
    service.packages = { consumeReservedSessionsForAppointmentInTx: jest.fn() };
    const result = await service.updateAppointmentStatus('appointment-1', {
      status: 'ready', reopen: true, reopenReason: 'Incluir Táxi Dog solicitado após a entrega',
    }, req);
    expect(service.stationAccess.assertPetshopCommissionAdmin).toHaveBeenCalledWith(req);
    expect(tx.petAppointment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ready', completedAt: null }),
    }));
    expect(result.stageHistory).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: 'reopened', status: 'ready', notes: 'Incluir Táxi Dog solicitado após a entrega', userName: 'Administradora',
    })]));
    expect(service.packages.consumeReservedSessionsForAppointmentInTx).not.toHaveBeenCalled();
  });

  it('não reabre concluído sem PIN administrativo nem motivo auditável', async () => {
    const { service, prisma } = fixture('delivered', null);
    await expect(service.updateAppointmentStatus('appointment-1', { status: 'ready' }, req)).rejects.toThrow('finalizado');
    await expect(service.updateAppointmentStatus('appointment-1', { status: 'ready', reopen: true, reopenReason: 'curto' }, req)).rejects.toThrow('motivo');
    service.stationAccess.assertPetshopCommissionAdmin.mockRejectedValueOnce(new Error('PIN administrativo obrigatório'));
    await expect(service.updateAppointmentStatus('appointment-1', { status: 'ready', reopen: true, reopenReason: 'Corrigir atendimento concluído' }, req)).rejects.toThrow('PIN administrativo');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('impede nova conclusão quando Táxi Dog foi acrescentado após uma venda já paga', async () => {
    const { service, prisma, current } = fixture('ready', null);
    (current as any).checkInNotes = JSON.stringify({ transport: { enabled: true, mode: 'round_trip', fee: 20, coveredByPackage: false, address: 'Rua A, 10' } });
    current.stageHistory.push({ kind: 'taxi_added', status: 'ready', at: '2026-11-17T13:00:00Z' } as any);
    prisma.comanda.findFirst.mockResolvedValue({ sale: { createdAt: new Date('2026-11-17T12:00:00Z') } });
    await expect(service.updateAppointmentStatus('appointment-1', { status: 'delivered' }, req)).rejects.toThrow('Há serviços ou Táxi Dog a cobrar');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('gera comanda apenas para o Táxi Dog incluído após a última venda', async () => {
    const { service, prisma, current } = fixture('ready', null);
    const appointment = {
      ...current, pet: { name: 'Nick' }, customer: { name: 'Tutor' }, services: [],
      checkInNotes: JSON.stringify({ transport: { enabled: true, mode: 'round_trip', fee: 20, coveredByPackage: false, address: 'Rua A, 10' } }),
      stageHistory: [{ kind: 'taxi_added', at: '2026-11-17T13:00:00Z' }],
    };
    prisma.petAppointment.findUnique.mockResolvedValue(appointment);
    prisma.comanda.findFirst.mockResolvedValueOnce({ sale: { createdAt: new Date('2026-11-17T12:00:00Z') } }).mockResolvedValue(null);
    prisma.comanda.create = jest.fn().mockImplementation(({ data }) => data);
    service.ensureServiceProductBacking = jest.fn();
    await service.ensureComandaForAppointment(prisma, 'appointment-1', true, true);
    expect(prisma.comanda.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        total: expect.objectContaining({}),
        items: { create: [expect.objectContaining({ productId: 'petshop-taxi-dog-fee', notes: 'Táxi Dog Pet Shop' })] },
      }),
    }));
    expect(prisma.comanda.create.mock.calls[0][0].data.total.toString()).toBe('20');

    prisma.comanda.create.mockClear();
    prisma.comanda.findFirst.mockReset().mockResolvedValueOnce({ sale: { createdAt: new Date('2026-11-17T14:00:00Z') } });
    expect(await service.ensureComandaForAppointment(prisma, 'appointment-1', true, true)).toBeNull();
    expect(prisma.comanda.create).not.toHaveBeenCalled();
  });

  it('inclui Táxi Dog após pagamento somente com PIN administrativo e registra autoria', async () => {
    const { service, prisma, tx, current } = fixture('ready', null);
    (current as any).services = [];
    (current as any).startsAt = new Date('2026-11-17T11:00:00Z');
    (current as any).endsAt = new Date('2026-11-17T12:00:00Z');
    (current as any).professionalId = null;
    (current as any).checkInNotes = null;
    prisma.comanda.findFirst.mockResolvedValue({ sale: { id: 'sale-original', createdAt: new Date('2026-11-17T12:00:00Z') } });
    const transport = { enabled: true, mode: 'round_trip', fee: 20, address: 'Rua A, 10', coveredByPackage: false };
    const result = await service.updateAppointment('appointment-1', { transport }, req);
    expect(service.stationAccess.assertPetshopCommissionAdmin).toHaveBeenCalledWith(req);
    expect(result.transport.fee).toBe(20);
    expect(tx.petAppointment.update.mock.calls[0][0].data.stageHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'taxi_added', userName: 'Administradora' }),
    ]));

    service.stationAccess.assertPetshopCommissionAdmin.mockRejectedValueOnce(new Error('PIN administrativo obrigatório'));
    await expect(service.updateAppointment('appointment-1', { transport }, req)).rejects.toThrow('PIN administrativo');
    expect(tx.petAppointment.update).toHaveBeenCalledTimes(1);
  });
});
