import { PetshopWhatsappService } from './petshop-whatsapp.service';

describe('PetshopWhatsappService — Confirmação Imediata de Agendamento (APPOINTMENT_CONFIRMED)', () => {
  const createService = (prismaMock: any) => {
    const manager = { getTenantClient: jest.fn().mockResolvedValue(prismaMock) };
    const ctx = { get: () => ({ tenantId: 'tenant-1', databaseUrl: 'db-1' }) };
    const heart = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Pet Chic',
          nomeFantasia: 'Pet Chic',
          logradouro: 'Rua A',
          numero: '10',
          bairro: 'Centro',
          municipio: 'Bauru',
          uf: 'SP',
          tvPublicId: null,
        }),
      },
    };
    return new PetshopWhatsappService(manager as any, ctx as any, heart as any);
  };

  it('enfileira confirmação com validade futura mesmo quando horário do agendamento é do mesmo dia/hora anterior', async () => {
    const pastSlotSameDay = new Date(Date.now() - 30 * 60_000);
    const createdJobs: any[] = [];
    const prismaMock = {
      petshopNotificationRule: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-conf',
            triggerType: 'APPOINTMENT_CONFIRMED',
            active: true,
            includePhoto: false,
            messageTemplate: 'Olá, {nome_tutor}! Confirmado {nome_pet} ({servico}) às {hora}.',
          },
        ]),
      },
      petAppointment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'app-1',
          customerId: 'cust-1',
          petId: 'pet-1',
          startsAt: pastSlotSameDay,
          checkInNotes: null,
          stagePhotoUrl: null,
          customer: { id: 'cust-1', name: 'Lucas Souza', phone: '14997603870', whatsappOptIn: true },
          pet: { id: 'pet-1', name: 'Thor' },
          services: [{ nameSnapshot: 'Banho' }],
        }),
      },
      petshopNotificationJob: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => {
          createdJobs.push(data);
          return Promise.resolve({ id: 'job-1', ...data });
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = createService(prismaMock);
    jest.spyOn(service, 'processTenantQueue').mockResolvedValue(undefined);

    await service.enqueueAppointmentEvent('APPOINTMENT_CONFIRMED', 'app-1');

    expect(createdJobs).toHaveLength(1);
    expect(createdJobs[0].triggerType).toBe('APPOINTMENT_CONFIRMED');
    expect(createdJobs[0].recipientPhone).toBe('5514997603870');
    expect(createdJobs[0].messageContent).toContain('Thor');
    // Garante janela futura (+12h) para não ser descartada imediatamente como CANCELLED_STALE
    expect(new Date(createdJobs[0].expiresAt).getTime()).toBeGreaterThan(Date.now() + 11 * 3600_000);
  });

  it('inicializa regras padrão automaticamente se o tenant nunca acessou a tela do WhatsApp', async () => {
    const futureSlot = new Date(Date.now() + 2 * 3600_000);
    const prismaMock = {
      petshopNotificationRule: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 8 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-conf-auto',
            triggerType: 'APPOINTMENT_CONFIRMED',
            active: true,
            includePhoto: false,
            messageTemplate: 'Confirmado {nome_pet}!',
          },
        ]),
      },
      petAppointment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'app-fresh',
          customerId: 'cust-1',
          petId: 'pet-1',
          startsAt: futureSlot,
          checkInNotes: null,
          customer: { id: 'cust-1', name: 'Ana', phone: '14999998888', whatsappOptIn: true },
          pet: { id: 'pet-1', name: 'Mel' },
          services: [{ nameSnapshot: 'Tosa' }],
        }),
      },
      petshopNotificationJob: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'job-fresh' }),
      },
    };

    const service = createService(prismaMock);
    jest.spyOn(service, 'processTenantQueue').mockResolvedValue(undefined);

    await service.enqueueAppointmentEvent('APPOINTMENT_CONFIRMED', 'app-fresh');

    expect(prismaMock.petshopNotificationRule.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.petshopNotificationJob.create).toHaveBeenCalledTimes(1);
  });

  it('NÃO cria nem dispara mensagem quando a regra de confirmação está desativada (active: false)', async () => {
    const prismaMock = {
      petshopNotificationRule: {
        count: jest.fn().mockResolvedValue(8),
        findMany: jest.fn().mockResolvedValue([]), // query filtra active: true
      },
      petAppointment: {
        findUnique: jest.fn(),
      },
      petshopNotificationJob: {
        create: jest.fn(),
      },
    };

    const service = createService(prismaMock);
    const queueSpy = jest.spyOn(service, 'processTenantQueue').mockResolvedValue(undefined);

    await service.enqueueAppointmentEvent('APPOINTMENT_CONFIRMED', 'app-paused');

    expect(prismaMock.petshopNotificationJob.create).not.toHaveBeenCalled();
    expect(prismaMock.petAppointment.findUnique).not.toHaveBeenCalled();
    expect(queueSpy).not.toHaveBeenCalled();
  });

  it('cancela job pendente sem disparar no WhatsApp se a automação tiver sido desativada antes do envio', async () => {
    const prismaMock = {
      petshopNotificationJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'job-pending-paused',
            triggerType: 'APPOINTMENT_CONFIRMED',
            attempts: 0,
            maxAttempts: 3,
            recipientPhone: '5514997603870',
            messageContent: 'Msg teste',
            mediaUrl: null,
            rule: { id: 'rule-conf', active: false },
            customer: { id: 'cust-1', whatsappOptIn: true },
            appointment: { id: 'app-1', status: 'scheduled', startsAt: new Date(Date.now() + 3600_000) },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const service = createService(prismaMock);
    // Simula WhatsApp conectado em memória
    const rt = (service as any).getOrCreateRuntime('tenant-1');
    rt.status = 'CONNECTED';
    rt.socket = { sendMessage: jest.fn(), onWhatsApp: jest.fn() };
    const sendSpy = jest.spyOn(service as any, 'sendViaBaileys');

    await service.processTenantQueue('tenant-1', 'db-1');

    expect(sendSpy).not.toHaveBeenCalled();
    expect(prismaMock.petshopNotificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-pending-paused' },
        data: expect.objectContaining({
          status: 'CANCELLED_STALE',
        }),
      }),
    );
  });
});
