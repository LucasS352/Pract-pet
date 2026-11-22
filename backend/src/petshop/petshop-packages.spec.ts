import { BadRequestException, ConflictException } from '@nestjs/common';
import { PetshopPackagesService } from './petshop-packages.service';
import { PetshopWhatsappService } from './petshop-whatsapp.service';

describe('PetshopPackagesService & PetshopWhatsappService', () => {
  describe('PetshopPackagesService — Precificação Inteligente por Porte/Pelagem/Espécie', () => {
    let service: PetshopPackagesService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        petPackagePlan: {
          findUnique: jest.fn(),
        },
        pet: {
          findUnique: jest.fn(),
        },
      };
      const mockTenantManager = {
        getTenantClient: jest.fn().mockResolvedValue(mockPrisma),
      };
      const mockTenantContext = {
        get: jest.fn().mockReturnValue({ tenantId: 'tenant-1', databaseUrl: 'mysql://test' }),
      };
      service = new PetshopPackagesService(mockTenantManager as any, mockTenantContext as any);
    });

    it('retorna as datas reais das sessões vinculadas ao contrato', async () => {
      const appointment = {
        id: 'app-1', startsAt: new Date('2026-11-20T15:00:00Z'),
        endsAt: new Date('2026-11-20T16:00:00Z'), status: 'scheduled',
        updatedAt: new Date('2026-11-16T12:00:00Z'),
        pet: { id: 'pet-1', name: 'Lily' },
        services: [{ id: 'service-1', nameSnapshot: 'Banho', coverageStatus: 'reserved' }],
      };
      mockPrisma.customerPetPackage = {
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'pkg-1', notes: null }),
      };
      mockPrisma.petAppointment = { findMany: jest.fn().mockResolvedValue([appointment]) };

      const contract = await service.getContractById('pkg-1');

      expect(contract.scheduledAppointments).toEqual([appointment]);
      expect(mockPrisma.petAppointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { services: { some: {
          customerPackageId: 'pkg-1', coverageStatus: { in: ['reserved', 'consumed'] },
        } } },
      }));
    });

    it('deve selecionar a regra mais específica (espécie + porte + pelagem) em relação à genérica', async () => {
      mockPrisma.petPackagePlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Pacote Mensal 4 Banhos',
        basePrice: 160,
        validityDays: 30,
        allowSharedPets: false,
        items: [
          {
            id: 'item-1',
            serviceId: 'svc-banho',
            quantity: 4,
            service: { id: 'svc-banho', name: 'Banho Completo', price: 65 },
          },
        ],
        pricingRules: [
          { id: 'rule-generic-small', species: 'all', size: 'small', coatType: 'all', price: 180, label: 'Pequeno geral' },
          { id: 'rule-small-long', species: 'dog', size: 'small', coatType: 'long', price: 210, label: 'Cão Pequeno Pelo Longo' },
          { id: 'rule-large-long', species: 'dog', size: 'large', coatType: 'long', price: 290, label: 'Cão Grande Pelo Longo' },
        ],
      });

      mockPrisma.pet.findUnique.mockResolvedValue({
        id: 'pet-1',
        name: 'Mel',
        species: 'dog',
        size: 'small',
        coatType: 'long',
      });

      const quote = await service.simulatePrice({ planId: 'plan-1', petId: 'pet-1' });
      expect(quote.suggestedPrice).toBe(210);
      expect(quote.matchedRule?.id).toBe('rule-small-long');
      expect(quote.regularStandaloneTotal).toBe(260);
      expect(quote.estimatedSavings).toBe(50);
    });

    it('deve retornar o basePrice do plano quando nenhuma regra específica corresponder às características do pet', async () => {
      mockPrisma.petPackagePlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Pacote Mensal 4 Banhos',
        basePrice: 160,
        validityDays: 30,
        allowSharedPets: false,
        items: [],
        pricingRules: [
          { id: 'rule-large', species: 'dog', size: 'large', coatType: 'long', price: 290, label: null },
        ],
      });

      mockPrisma.pet.findUnique.mockResolvedValue({
        id: 'pet-cat',
        name: 'Mingau',
        species: 'cat',
        size: 'small',
        coatType: 'short',
      });

      const quote = await service.simulatePrice({ planId: 'plan-1', petId: 'pet-cat' });
      expect(quote.suggestedPrice).toBe(160);
      expect(quote.matchedRule).toBeNull();
    });
  });

  describe('PetshopPackagesService — Controle Transacional de Sessões (Reserva, Consumo, Liberação e Estorno)', () => {
    let service: PetshopPackagesService;
    let mockPrisma: any;
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        $queryRaw: jest.fn(),
        customerPetPackage: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn(),
        },
        customerPetPackageItem: {
          findMany: jest.fn(),
          update: jest.fn(),
        },
        customerPetPackageLedger: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
        },
        petAppointment: {
          findUnique: jest.fn(),
        },
        petAppointmentService: {
          findUnique: jest.fn(),
          findFirst: jest.fn().mockResolvedValue({ id: 'app-svc-1', priceSnapshot: 50 }),
          findMany: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      mockPrisma = {
        $transaction: jest.fn((cb: any) => cb(mockTx)),
      };
      const mockTenantManager = {
        getTenantClient: jest.fn().mockResolvedValue(mockPrisma),
      };
      const mockTenantContext = {
        get: jest.fn().mockReturnValue({ tenantId: 'tenant-1', databaseUrl: 'mysql://test' }),
      };
      service = new PetshopPackagesService(mockTenantManager as any, mockTenantContext as any);
    });

    it('deve ser idempotente ao reservar sessão caso a chave de idempotência já exista no ledger', async () => {
      mockTx.customerPetPackageLedger.findUnique.mockResolvedValue({
        id: 'ledger-existing',
        eventType: 'RESERVE',
      });

      const res = await service.reserveSessionsForAppointmentInTx(mockTx, {
        appointmentId: 'app-1',
        petId: 'pet-1',
        customerId: 'cust-1',
        startsAt: new Date(),
        packageSelections: { 'svc-1': 'pkg-1' },
      });

      expect(res).toHaveLength(0);
      expect(mockTx.customerPetPackageItem.update).not.toHaveBeenCalled();
    });

    it('deve impedir reserva se o saldo disponível (availableQuantity) for zero', async () => {
      mockTx.customerPetPackageLedger.findUnique.mockResolvedValue(null);
      mockTx.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'pkg-1',
            customerId: 'cust-1',
            petId: 'pet-1',
            isShared: false,
            status: 'active',
            paymentStatus: 'paid',
            expiresAt: new Date(Date.now() + 86400000),
            planNameSnapshot: 'Pacote 4 Banhos',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'item-1',
            totalQuantity: 4,
            reservedQuantity: 1,
            usedQuantity: 3,
            availableQuantity: 0,
            serviceNameSnapshot: 'Banho',
          },
        ]);

      await expect(
        service.reserveSessionsForAppointmentInTx(mockTx, {
          appointmentId: 'app-2',
          petId: 'pet-1',
          customerId: 'cust-1',
          startsAt: new Date(),
          packageSelections: { 'svc-1': 'pkg-1' },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejeita serviço de pacote ausente do agendamento antes de mexer no saldo', async () => {
      mockTx.customerPetPackageLedger.findUnique.mockResolvedValue(null);
      mockTx.petAppointmentService.findFirst.mockResolvedValue(null);

      await expect(service.reserveSessionsForAppointmentInTx(mockTx, {
        appointmentId: 'app-2', petId: 'pet-1', customerId: 'cust-1', startsAt: new Date(),
        packageSelections: { 'svc-intruso': 'pkg-1' },
      })).rejects.toThrow(BadRequestException);

      expect(mockTx.$queryRaw).not.toHaveBeenCalled();
      expect(mockTx.customerPetPackageItem.update).not.toHaveBeenCalled();
    });

    it('bloqueia pacote pendente no agendamento comum e preserva reserva interna na criação do contrato', async () => {
      const contract = {
        id: 'pkg-1', customerId: 'cust-1', petId: 'pet-1', isShared: false,
        status: 'active', paymentStatus: 'pending',
        expiresAt: new Date(Date.now() + 86400000), planNameSnapshot: 'Pacote pendente',
      };
      const item = { id: 'item-1', totalQuantity: 2, reservedQuantity: 0, usedQuantity: 0, availableQuantity: 2, serviceNameSnapshot: 'Banho' };
      const params = { appointmentId: 'app-3', petId: 'pet-1', customerId: 'cust-1', startsAt: new Date(), packageSelections: { 'svc-1': 'pkg-1' } };
      mockTx.customerPetPackageLedger.findUnique.mockResolvedValue(null);
      mockTx.$queryRaw.mockResolvedValueOnce([contract]);

      await expect(service.reserveSessionsForAppointmentInTx(mockTx, params)).rejects.toThrow(BadRequestException);
      expect(mockTx.customerPetPackageItem.update).not.toHaveBeenCalled();

      mockTx.$queryRaw.mockResolvedValueOnce([contract]).mockResolvedValueOnce([item]);
      mockTx.petAppointmentService.findFirst.mockResolvedValue({ id: 'app-svc-1', priceSnapshot: 50 });
      expect(await service.reserveSessionsForAppointmentInTx(mockTx, { ...params, allowPendingPayment: true })).toHaveLength(1);
      expect(mockTx.customerPetPackageItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reservedQuantity: 1, availableQuantity: 1 }) }));
    });

    it('lista para agendamento somente pacotes pagos do tutor do pet', async () => {
      mockPrisma.customerPetPackage = { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.pet = { findUnique: jest.fn().mockResolvedValue({ id: 'pet-1', customerId: 'cust-1' }) };

      await service.getAvailablePackagesForPet('pet-1');

      expect(mockPrisma.customerPetPackage.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ customerId: 'cust-1', paymentStatus: 'paid' }),
      }));
    });

    it('concede Táxi Dog somente pelo contrato da sessão reservada na mesma transação', async () => {
      await expect(service.assertTransportCoverageForReservationsInTx(mockTx, [], 'pickup_only')).rejects.toThrow(BadRequestException);
      expect(mockTx.customerPetPackage.findMany).not.toHaveBeenCalled();

      const reserved = [{ customerPackageId: 'pkg-1' }];
      mockTx.customerPetPackage.findMany.mockResolvedValue([{ id: 'pkg-1', notes: JSON.stringify({ transport: { enabled: true, mode: 'pickup_only' } }) }]);
      await expect(service.assertTransportCoverageForReservationsInTx(mockTx, reserved, 'dropoff_only')).rejects.toThrow(BadRequestException);
      await expect(service.assertTransportCoverageForReservationsInTx(mockTx, reserved, 'pickup_only')).resolves.toBeUndefined();
      expect(mockTx.customerPetPackage.findMany).toHaveBeenCalledWith({ where: { id: { in: ['pkg-1'] } }, select: { id: true, notes: true } });

      mockTx.customerPetPackage.findMany.mockResolvedValue([{ id: 'pkg-1', notes: JSON.stringify({ transport: { enabled: true, mode: 'round_trip' } }) }]);
      await expect(service.assertTransportCoverageForReservationsInTx(mockTx, reserved, 'round_trip')).resolves.toBeUndefined();
    });

    it('deve consumir sessão reservada ao concluir atendimento e marcar contrato como completed na última sessão', async () => {
      mockTx.petAppointment.findUnique.mockResolvedValue({
        id: 'app-1',
        petId: 'pet-1',
        services: [
          {
            id: 'appsvc-1',
            serviceId: 'svc-1',
            priceSnapshot: 65,
            customerPackageId: 'pkg-1',
            customerPackageItemId: 'item-1',
            coverageStatus: 'reserved',
          },
        ],
      });
      mockTx.customerPetPackageLedger.findUnique.mockResolvedValue(null);
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: 'item-1',
          customerPackageId: 'pkg-1',
          totalQuantity: 4,
          reservedQuantity: 1,
          usedQuantity: 3,
          availableQuantity: 0,
          serviceNameSnapshot: 'Banho',
        },
      ]);
      mockTx.customerPetPackageItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          totalQuantity: 4,
          reservedQuantity: 0,
          usedQuantity: 4,
          availableQuantity: 0,
        },
      ]);

      const result = await service.consumeReservedSessionsForAppointmentInTx(mockTx, 'app-1', {
        name: 'Lucas',
      });

      expect(result.consumedItems).toHaveLength(1);
      expect(result.consumedItems[0].remainingAvailable).toBe(0);
      expect(mockTx.customerPetPackageItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          reservedQuantity: 0,
          usedQuantity: 4,
          availableQuantity: 0,
        },
      });
      expect(mockTx.customerPetPackage.update).toHaveBeenCalledWith({
        where: { id: 'pkg-1' },
        data: { status: 'completed' },
      });
    });

    it('deve exigir motivo válido com pelo menos 3 caracteres para estornar sessão consumida', async () => {
      await expect(
        service.refundConsumedSession('pkg-1', {
          packageItemId: 'item-1',
          reason: 'ok',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('restringe pacote compartilhado aos allowedPetIds quando definidos na contratação', async () => {
      mockPrisma.pet = { findUnique: jest.fn().mockResolvedValue({ id: 'pet-outro', customerId: 'cust-1' }) };
      mockPrisma.customerPetPackage = {
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pkg-restrito',
            isShared: true,
            notes: JSON.stringify({ allowedPetIds: ['pet-1', 'pet-2'], userNotes: null }),
            items: [],
          },
          {
            id: 'pkg-livre',
            isShared: true,
            notes: null,
            items: [],
          },
        ]),
      };

      const res = await service.getAvailablePackagesForPet('pet-outro');
      expect(res.map((c: any) => c.id)).toEqual(['pkg-livre']);

      // Já para um pet autorizado, ambos aparecem
      mockPrisma.pet.findUnique.mockResolvedValue({ id: 'pet-2', customerId: 'cust-1' });
      const resAuth = await service.getAvailablePackagesForPet('pet-2');
      expect(resAuth.map((c: any) => c.id)).toEqual(['pkg-restrito', 'pkg-livre']);
    });

    it('cria contratos agrupados no modo per_pet com comanda única consolidada', async () => {
      const createdIds: string[] = [];
      mockPrisma.customer = { findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'Maria', address: 'Rua A, 10', reference: null }) };
      mockPrisma.petPackagePlan = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'plan-1',
          name: 'Pacote Mensal',
          active: true,
          basePrice: 120,
          validityDays: 30,
          items: [{ serviceId: 'svc-1', quantity: 2, service: { id: 'svc-1', name: 'Banho', price: 60, durationMinutes: 60, serviceType: 'SINGLE' } }],
          pricingRules: [
            { id: 'r1', species: 'dog', size: 'small', coatType: 'all', price: 100, label: 'P' },
            { id: 'r2', species: 'dog', size: 'large', coatType: 'all', price: 180, label: 'G' },
          ],
        }),
      };
      mockPrisma.pet = {
        findMany: jest.fn().mockResolvedValue([
          { id: 'pet-1', customerId: 'cust-1', name: 'Nick', species: 'dog', size: 'small', coatType: 'short' },
          { id: 'pet-2', customerId: 'cust-1', name: 'Thor', species: 'dog', size: 'large', coatType: 'long' },
        ]),
      };

      const groupTx = {
        customer: { update: jest.fn() },
        category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-pkg' }) },
        product: { upsert: jest.fn() },
        comanda: { create: jest.fn().mockResolvedValue({ id: 'cmd-grupo-1' }) },
        customerPetPackage: {
          create: jest.fn().mockImplementation(args => {
            const id = `pkg-${createdIds.length + 1}`;
            createdIds.push(id);
            return Promise.resolve({ id, ...args.data });
          }),
          updateMany: jest.fn(),
          findMany: jest.fn().mockImplementation(() =>
            Promise.resolve(
              createdIds.map((id, idx) => ({
                id,
                petId: idx === 0 ? 'pet-1' : 'pet-2',
                finalPrice: idx === 0 ? 100 : 180,
                notes: JSON.stringify({ packageGroup: { id: 'grp-1', mode: 'per_pet', petIds: ['pet-1', 'pet-2'], petNames: ['Nick', 'Thor'], totalGroupPrice: 280 } }),
              })),
            ),
          ),
        },
        customerPetPackageItem: { create: jest.fn().mockResolvedValue({ id: 'citem-1' }) },
        customerPetPackageLedger: { create: jest.fn() },
      };
      mockPrisma.$transaction = jest.fn(async cb => cb(groupTx));

      const out: any = await service.createContract({
        customerId: 'cust-1',
        packagePlanId: 'plan-1',
        petIds: ['pet-1', 'pet-2'],
        multiPetMode: 'per_pet',
        billingMode: 'comanda',
      });

      expect(groupTx.customerPetPackage.create).toHaveBeenCalledTimes(2);
      expect(groupTx.comanda.create).toHaveBeenCalledTimes(1);
      expect(groupTx.comanda.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          total: expect.anything(),
        }),
      }));
      expect(groupTx.customerPetPackage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: ['pkg-1', 'pkg-2'] } },
        data: { comandaId: 'cmd-grupo-1' },
      }));
      expect(out.groupContracts).toHaveLength(2);
    });

    it('grava stageHistory completo, customStages e professionalId ao criar pacote com sessões passadas concluídas', async () => {
      const { PetshopPricingService } = require('./petshop-pricing.service');
      const pricingService = new PetshopPricingService();
      const mockCommissions = { recordExecution: jest.fn().mockResolvedValue(undefined) };
      const svcWithPricing = new PetshopPackagesService(
        { getTenantClient: jest.fn().mockResolvedValue(mockPrisma) } as any,
        { get: jest.fn().mockReturnValue({ tenantId: 'tenant-1', databaseUrl: 'mysql://test' }) } as any,
        mockCommissions as any,
        pricingService,
      );

      const pastStart = '2026-11-01T18:00:00.000Z';
      mockPrisma.customer = {
        findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'Alesson Castro', address: null, reference: null }),
      };
      mockPrisma.petPackagePlan = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'plan-1',
          name: 'Pacote quinzenal (2 banhos)',
          active: true,
          basePrice: 90,
          validityDays: 30,
          items: [
            {
              serviceId: 'svc-1',
              quantity: 1,
              service: {
                id: 'svc-1',
                name: 'Banho + tosa higiênica',
                price: 50,
                durationMinutes: 70,
                serviceType: 'INDIVIDUAL',
                customStages: ['checked_in', 'bathing', 'finishing', 'ready'],
              },
            },
          ],
          pricingRules: [],
        }),
      };
      mockPrisma.pet = {
        findMany: jest.fn().mockResolvedValue([
          { id: 'pet-1', customerId: 'cust-1', name: 'Nina', species: 'dog', size: 'small', coatType: 'long' },
        ]),
      };

      const createdAppointments: any[] = [];
      const pastTx: any = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'pkg-1',
              customerId: 'cust-1',
              petId: 'pet-1',
              isShared: false,
              status: 'active',
              paymentStatus: 'paid',
              expiresAt: new Date('2026-12-30T23:59:59Z'),
              planNameSnapshot: 'Pacote quinzenal (2 banhos)',
              notes: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'citem-1',
              totalQuantity: 1,
              reservedQuantity: 0,
              usedQuantity: 0,
              availableQuantity: 1,
              serviceNameSnapshot: 'Banho + tosa higiênica',
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'citem-1',
              customerPackageId: 'pkg-1',
              totalQuantity: 1,
              reservedQuantity: 1,
              usedQuantity: 0,
              availableQuantity: 0,
              serviceNameSnapshot: 'Banho + tosa higiênica',
            },
          ]),
        operator: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'op-sara', name: 'Sara' },
            { id: 'op-miria', name: 'Miriã' },
          ]),
        },
        customerPetPackage: {
          create: jest.fn().mockResolvedValue({ id: 'pkg-1', status: 'active' }),
          update: jest.fn().mockResolvedValue({ id: 'pkg-1', status: 'completed' }),
          findUnique: jest.fn().mockResolvedValue({ id: 'pkg-1', status: 'completed', notes: null }),
        },
        customerPetPackageItem: {
          create: jest.fn().mockResolvedValue({ id: 'citem-1' }),
          update: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: 'citem-1', totalQuantity: 1, usedQuantity: 1, reservedQuantity: 0 }]),
        },
        customerPetPackageLedger: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue(null),
        },
        petAppointment: {
          create: jest.fn().mockImplementation(args => {
            const appt = { id: 'apt-past-1', ...args.data };
            createdAppointments.push(appt);
            return Promise.resolve(appt);
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const found = createdAppointments.find(a => a.id === where.id) || createdAppointments[0];
            return Promise.resolve({
              ...found,
              pet: { size: 'small' },
              services: [
                {
                  id: 'appsvc-1',
                  serviceId: 'svc-1',
                  priceSnapshot: 50,
                  customerPackageId: 'pkg-1',
                  customerPackageItemId: 'citem-1',
                  coverageStatus: 'reserved',
                  service: { id: 'svc-1', name: 'Banho + tosa higiênica', customStages: ['checked_in', 'bathing', 'finishing', 'ready'] },
                  customerPackageItem: { id: 'citem-1', unitValueSnapshot: 90 },
                },
              ],
            });
          }),
        },
        petAppointmentService: {
          findFirst: jest.fn().mockResolvedValue({ id: 'appsvc-1', serviceId: 'svc-1', priceSnapshot: 50 }),
          update: jest.fn(),
        },
      };

      mockPrisma.$transaction = jest.fn(async cb => cb(pastTx));

      await svcWithPricing.createContract(
        {
          customerId: 'cust-1',
          packagePlanId: 'plan-1',
          petIds: ['pet-1'],
          scheduledSessions: [
            {
              petId: 'pet-1',
              startsAt: pastStart,
              serviceIds: ['svc-1'],
              completed: true,
              stageOperators: { bathing: 'op-sara', grooming: 'op-miria', finishing: 'op-sara' },
            },
          ],
        },
        { userId: 'admin-1', name: 'Lucas' },
      );

      expect(createdAppointments).toHaveLength(1);
      const appt = createdAppointments[0];
      expect(appt.status).toBe('delivered');
      expect(appt.professionalId).toBe('op-sara');
      expect(appt.customStages).toEqual(['checked_in', 'bathing', 'finishing', 'ready']);
      expect(appt.stageHistory.map((h: any) => h.status)).toEqual([
        'checked_in',
        'bathing',
        'finishing',
        'ready',
        'delivered',
      ]);
      expect(appt.stageHistory.find((h: any) => h.status === 'bathing').userName).toBe('Sara');
      expect(appt.stageHistory.find((h: any) => h.status === 'finishing').userName).toBe('Sara');
      expect(appt.stageHistory.find((h: any) => h.status === 'delivered').userName).toBe('Lucas');
      expect(mockCommissions.recordExecution).toHaveBeenCalled();
    });

    it('reconstroi stageHistory e profissional em getContractById para sessões concluídas legadas com comissões', async () => {
      const legacyConcludedAppt = {
        id: 'apt-legacy-1',
        startsAt: new Date('2026-11-02T18:00:00Z'),
        endsAt: new Date('2026-11-02T19:10:00Z'),
        status: 'delivered',
        checkedInAt: new Date('2026-11-02T18:00:00Z'),
        readyAt: new Date('2026-11-02T19:10:00Z'),
        completedAt: new Date('2026-11-02T19:10:00Z'),
        updatedAt: new Date('2026-11-02T19:10:00Z'),
        stageHistory: null,
        professional: null,
        professionalId: null,
        pet: { id: 'pet-1', name: 'Nina' },
        services: [
          {
            id: 'svc-1',
            nameSnapshot: 'Banho + tosa higiênica',
            coverageStatus: 'consumed',
            service: { id: 's1', name: 'Banho + tosa higiênica', customStages: ['checked_in', 'bathing', 'finishing', 'ready'] },
          },
        ],
        commissions: [
          { stageKey: 'bathing', executedAt: new Date('2026-11-02T18:00:00Z'), operator: { id: 'op-sara', name: 'Sara' } },
          { stageKey: 'finishing', executedAt: new Date('2026-11-02T18:00:00Z'), operator: { id: 'op-sara', name: 'Sara' } },
        ],
      };

      mockPrisma.customerPetPackage = {
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'pkg-legacy', status: 'completed', notes: null }),
      };
      mockPrisma.petAppointment = {
        findMany: jest.fn().mockResolvedValue([legacyConcludedAppt]),
      };

      const contract: any = await service.getContractById('pkg-legacy');

      expect(contract.scheduledAppointments).toHaveLength(1);
      const enriched = contract.scheduledAppointments[0];
      expect(enriched.commissions).toBeUndefined();
      expect(enriched.professional).toEqual({ id: 'op-sara', name: 'Sara' });
      expect(Array.isArray(enriched.stageHistory)).toBe(true);
      expect(enriched.stageHistory.map((h: any) => h.status)).toEqual([
        'checked_in',
        'bathing',
        'finishing',
        'ready',
        'delivered',
      ]);
      expect(enriched.stageHistory.find((h: any) => h.status === 'bathing').userName).toBe('Sara');
    });
  });

  describe('PetshopPackagesService — Troca de Serviço & Cobrança de Diferença', () => {
    const buildExchangeHarness = (overrides?: {
      paymentStatus?: string;
      contractComandaId?: string | null;
      appointmentStatus?: string;
      settledCommission?: boolean;
    }) => {
      const paymentStatus = overrides?.paymentStatus ?? 'paid';
      const contractComandaId = overrides?.contractComandaId ?? 'cmd-pkg-1';
      const appointmentStatus = overrides?.appointmentStatus ?? 'scheduled';
      const { PetshopPricingService } = require('./petshop-pricing.service');
      const pricingService = new PetshopPricingService();

      const oldItemState = {
        id: 'citem-banho',
        customerPackageId: 'pkg-1',
        serviceId: 'svc-banho',
        serviceNameSnapshot: 'Banho',
        unitValueSnapshot: 50,
        totalQuantity: 4,
        reservedQuantity: 1,
        usedQuantity: 0,
        availableQuantity: 3,
      };
      const existingNewItem = {
        id: 'citem-tosa',
        customerPackageId: 'pkg-1',
        serviceId: 'svc-tosa',
        serviceNameSnapshot: 'Tosa',
        unitValueSnapshot: 80,
        totalQuantity: 0,
        reservedQuantity: 0,
        usedQuantity: 0,
        availableQuantity: 0,
      };

      const contractRow: any = {
        id: 'pkg-1',
        customerId: 'cust-1',
        petId: 'pet-1',
        comandaId: contractComandaId,
        status: 'active',
        paymentStatus,
        planNameSnapshot: 'Pacote 4 Banhos',
        basePriceSnapshot: 200,
        discountAmount: 0,
        finalPrice: 200,
        expiresAt: new Date('2026-12-31T23:59:59Z'),
        notes: JSON.stringify({
          packageGroup: { id: 'grp-1', mode: 'per_pet', petIds: ['pet-1'], petNames: ['Thor'], totalGroupPrice: 200 },
        }),
        items: [oldItemState],
      };

      const oldServiceRow = {
        id: 'asvc-banho-1',
        appointmentId: 'apt-1',
        serviceId: 'svc-banho',
        nameSnapshot: 'Banho',
        priceSnapshot: 50,
        durationMinutes: 45,
        customerPackageId: 'pkg-1',
        customerPackageItemId: 'citem-banho',
        coverageStatus: 'reserved',
        chargedSaleId: null,
        comboParentId: null,
        service: { id: 'svc-banho', name: 'Banho', customStages: ['checked_in', 'bathing', 'finishing', 'ready'] },
      };

      const createdServices: any[] = [];
      const createdLedgers: any[] = [];
      const updatedAppointmentCalls: any[] = [];
      const comandaItemCreates: any[] = [];
      const comandaUpdates: any[] = [];
      const contractUpdates: any[] = [];
      const deletedCommissions: any[] = [];

      const newServiceObj = {
        id: 'svc-tosa',
        name: 'Tosa Completa',
        active: true,
        price: 80,
        durationMinutes: 75,
        serviceType: 'INDIVIDUAL',
        customStages: ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'],
        pricingRules: [],
        comboItems: [],
      };

      const tx: any = {
        $queryRaw: jest.fn().mockImplementation((query: any) => {
          const sqlText = Array.isArray(query?.strings) ? query.strings.join('') : String(query || '');
          if (sqlText.includes('FROM operators')) {
            return Promise.resolve([{ id: 'op-tosa', name: 'Carla Tosadora', active: true }]);
          }
          return Promise.resolve([]);
        }),
        operator: {
          findMany: jest.fn().mockResolvedValue([{ id: 'op-tosa', name: 'Carla Tosadora', active: true }]),
        },
        customerPetPackage: {
          findUnique: jest.fn().mockResolvedValue(contractRow),
          update: jest.fn().mockImplementation(args => {
            contractUpdates.push(args);
            return Promise.resolve({ ...contractRow, ...args.data });
          }),
        },
        petAppointment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'apt-1',
            petId: 'pet-1',
            customerId: 'cust-1',
            professionalId: 'op-banho',
            status: appointmentStatus,
            startsAt: new Date('2026-11-25T14:00:00Z'),
            endsAt: new Date('2026-11-25T14:45:00Z'),
            checkInNotes: null,
            stageHistory: [],
            pet: { id: 'pet-1', name: 'Thor', species: 'dog', size: 'medium', coatType: 'short' },
            services: [oldServiceRow],
          }),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockImplementation(args => {
            updatedAppointmentCalls.push(args.data);
            return Promise.resolve({
              id: 'apt-1',
              startsAt: new Date('2026-11-25T14:00:00Z'),
              ...args.data,
              pet: { id: 'pet-1', name: 'Thor' },
              customer: { id: 'cust-1', name: 'Lucas' },
              professional: { id: 'op-tosa', name: 'Carla Tosadora' },
              services: createdServices,
            });
          }),
        },
        petCommission: {
          findFirst: jest.fn().mockResolvedValue(overrides?.settledCommission ? { id: 'comm-approved' } : null),
          deleteMany: jest.fn().mockImplementation(args => {
            deletedCommissions.push(args);
            return Promise.resolve({ count: 1 });
          }),
        },
        customerPetPackageItem: {
          update: jest.fn().mockImplementation(args => {
            const base = args.where.id === 'citem-banho' ? oldItemState : existingNewItem;
            return Promise.resolve({ ...base, ...args.data });
          }),
          create: jest.fn().mockImplementation(args => Promise.resolve({ id: 'citem-tosa-new', ...args.data })),
        },
        customerPetPackageLedger: {
          create: jest.fn().mockImplementation(args => {
            createdLedgers.push(args.data);
            return Promise.resolve(args.data);
          }),
        },
        petAppointmentService: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          delete: jest.fn().mockResolvedValue(oldServiceRow),
          create: jest.fn().mockImplementation(args => {
            const row = { id: args.data.id || `asvc-${createdServices.length + 1}`, ...args.data };
            createdServices.push(row);
            return Promise.resolve(row);
          }),
        },
        petService: { upsert: jest.fn().mockResolvedValue({ id: 'petshop-package-upgrade-fee' }) },
        category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-svc' }), create: jest.fn() },
        product: { upsert: jest.fn().mockResolvedValue({ id: 'petshop-package-upgrade-fee' }) },
        comanda: {
          findUnique: jest.fn().mockResolvedValue(
            contractComandaId ? { id: contractComandaId, status: 'open', saleId: null, total: 200 } : null,
          ),
          update: jest.fn().mockImplementation(args => {
            comandaUpdates.push(args);
            return Promise.resolve({ id: contractComandaId, ...args.data });
          }),
        },
        comandaItem: {
          create: jest.fn().mockImplementation(args => {
            comandaItemCreates.push(args.data);
            return Promise.resolve(args.data);
          }),
        },
      };

      const prismaMock: any = {
        customerPetPackage: {
          findUnique: jest.fn().mockResolvedValue({
            ...contractRow,
            items: [oldItemState],
            ledgerEvents: [],
            customer: { id: 'cust-1', name: 'Lucas' },
            pet: { id: 'pet-1', name: 'Thor' },
          }),
          updateMany: jest.fn(),
        },
        petService: { findUnique: jest.fn().mockResolvedValue(newServiceObj) },
        petAppointment: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async cb => cb(tx)),
      };

      const pkgService = new PetshopPackagesService(
        { getTenantClient: jest.fn().mockResolvedValue(prismaMock) } as any,
        { get: jest.fn().mockReturnValue({ tenantId: 'tenant-1', databaseUrl: 'mysql://test' }) } as any,
        undefined,
        pricingService,
      );

      return {
        pkgService,
        tx,
        prismaMock,
        createdServices,
        createdLedgers,
        updatedAppointmentCalls,
        comandaItemCreates,
        comandaUpdates,
        contractUpdates,
        deletedCommissions,
      };
    };

    it('troca serviço reservado sem diferença, recalcula etapas com tosa e preserva linha zerada no pacote', async () => {
      const h = buildExchangeHarness();

      const res = await h.pkgService.exchangeSessionService('pkg-1', {
        appointmentId: 'apt-1',
        oldAppointmentServiceId: 'asvc-banho-1',
        newServiceId: 'svc-tosa',
        differenceAmount: 0,
        chargeMode: 'none',
        professionalId: 'op-tosa',
        reason: 'Tutor pediu tosa',
      }, { userId: 'u-1', name: 'Admin Lucas' });

      expect(h.tx.customerPetPackageItem.update).toHaveBeenCalledWith({
        where: { id: 'citem-banho' },
        data: { totalQuantity: 3, reservedQuantity: 0, availableQuantity: 3 },
      });
      expect(h.tx.customerPetPackageItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          serviceId: 'svc-tosa',
          totalQuantity: 1,
          reservedQuantity: 1,
          availableQuantity: 0,
        }),
      });
      expect(h.createdLedgers.map(l => l.eventType)).toEqual(['SERVICE_SWAP_OUT', 'SERVICE_SWAP_IN']);
      expect(h.deletedCommissions).toHaveLength(1);
      expect(h.updatedAppointmentCalls[0].customStages).toContain('grooming');
      expect(h.updatedAppointmentCalls[0].professionalId).toBe('op-tosa');
      expect(h.updatedAppointmentCalls[0].stageHistory).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'service_swapped',
          label: 'Serviço trocado: Banho por Tosa Completa',
          operatorName: 'Carla Tosadora',
        }),
      ]));
      expect(h.createdLedgers[0].reason).toContain('Banho por Tosa Completa');
      expect(h.createdLedgers[0].reason).not.toContain('→');
      expect(res.appointment.resolvedStages).toContain('grooming');
    });

    it('bloqueia troca quando já existe comissão aprovada ou paga no serviço reservado', async () => {
      const h = buildExchangeHarness({ settledCommission: true });

      await expect(
        h.pkgService.exchangeSessionService('pkg-1', {
          appointmentId: 'apt-1',
          newServiceId: 'svc-tosa',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('soma diferença no contrato e na comanda PKG1 quando chargeMode=add_to_package', async () => {
      const h = buildExchangeHarness({ paymentStatus: 'pending', contractComandaId: 'cmd-pkg-1' });

      await h.pkgService.exchangeSessionService('pkg-1', {
        appointmentId: 'apt-1',
        newServiceId: 'svc-tosa',
        differenceAmount: 30,
        chargeMode: 'add_to_package',
        commissionRecipientId: 'op-tosa',
      }, { userId: 'u-1', name: 'Admin' });

      expect(h.contractUpdates).toHaveLength(1);
      expect(Number(h.contractUpdates[0].data.finalPrice)).toBe(230);
      expect(JSON.parse(h.contractUpdates[0].data.notes).packageGroup.totalGroupPrice).toBe(230);
      expect(h.comandaItemCreates).toHaveLength(1);
      expect(Number(h.comandaItemCreates[0].totalPrice)).toBe(30);
      expect(Number(h.comandaUpdates[0].data.total)).toBe(230);
      expect(h.createdLedgers.some(l => l.eventType === 'VALUE_ADJUSTMENT')).toBe(true);
      const diffSvc = h.createdServices.find(s => s.serviceId === 'petshop-package-upgrade-fee');
      expect(Number(diffSvc.priceSnapshot)).toBe(30);
      expect(Number(diffSvc.coveredAmount)).toBe(30);
    });

    it('cria linha cobrável avulsa de diferença quando chargeMode=charge_now', async () => {
      const h = buildExchangeHarness({ paymentStatus: 'paid' });

      await h.pkgService.exchangeSessionService('pkg-1', {
        appointmentId: 'apt-1',
        newServiceId: 'svc-tosa',
        differenceAmount: 35,
        chargeMode: 'charge_now',
        commissionRecipientId: 'op-tosa',
      }, { userId: 'u-1', name: 'Admin' });

      const diffSvc = h.createdServices.find(s => s.serviceId === 'petshop-package-upgrade-fee');
      expect(diffSvc).toBeDefined();
      expect(Number(diffSvc.priceSnapshot)).toBe(35);
      expect(Number(diffSvc.coveredAmount)).toBe(0);
      expect(h.updatedAppointmentCalls[0].stageHistory).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'service_added',
          operatorId: 'op-tosa',
          addedToPackage: false,
        }),
      ]));
    });

    it('converte créditos livres do contrato preservando histórico no ledger', async () => {
      const h = buildExchangeHarness();

      await h.pkgService.exchangeAvailableCredit('pkg-1', {
        oldServiceId: 'svc-banho',
        newServiceId: 'svc-tosa',
        quantity: 2,
        differenceAmount: 0,
        chargeMode: 'none',
        reason: 'Conversão de saldo',
      }, { userId: 'u-1', name: 'Admin' });

      expect(h.tx.customerPetPackageItem.update).toHaveBeenCalledWith({
        where: { id: 'citem-banho' },
        data: { totalQuantity: 2, availableQuantity: 1 },
      });
      expect(h.tx.customerPetPackageItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          serviceId: 'svc-tosa',
          totalQuantity: 2,
          availableQuantity: 2,
          reservedQuantity: 0,
        }),
      });
      expect(h.createdLedgers.map(l => l.eventType)).toEqual(['SERVICE_SWAP_OUT', 'SERVICE_SWAP_IN']);
    });

    it('permite trocar o mesmo agendamento mais de uma vez mesmo se chargedSaleId foi gravado indevidamente no item reservado', async () => {
      const h = buildExchangeHarness();
      const firstApt = await h.tx.petAppointment.findUnique({ where: { id: 'apt-1' } });
      firstApt.services[0].chargedSaleId = 'sale-addon-anterior';

      await h.pkgService.exchangeSessionService('pkg-1', {
        appointmentId: 'apt-1',
        oldAppointmentServiceId: 'asvc-banho-1',
        oldServiceId: 'svc-banho',
        newServiceId: 'svc-tosa',
        differenceAmount: 0,
        chargeMode: 'none',
        reason: 'Segunda troca consecutiva',
      }, { userId: 'u-1', name: 'Lucas' });

      expect(h.createdLedgers.map(l => l.eventType)).toEqual(['SERVICE_SWAP_OUT', 'SERVICE_SWAP_IN']);
      expect(h.updatedAppointmentCalls[0].customStages).toContain('grooming');
    });

    it('recalcula comissões das etapas já executadas para o novo serviço ao trocar no meio do atendimento', async () => {
      const h = buildExchangeHarness({ appointmentStatus: 'grooming' });
      const { PetshopPricingService } = require('./petshop-pricing.service');
      const mockCommissions = { recordExecution: jest.fn().mockResolvedValue(undefined) };
      const svcWithCommissions = new PetshopPackagesService(
        { getTenantClient: jest.fn().mockResolvedValue(h.prismaMock) } as any,
        { get: jest.fn().mockReturnValue({ tenantId: 'tenant-1', databaseUrl: 'mysql://test' }) } as any,
        mockCommissions as any,
        new PetshopPricingService(),
      );

      h.tx.petAppointment.findUnique.mockResolvedValueOnce({
        id: 'apt-1',
        petId: 'pet-1',
        customerId: 'cust-1',
        professionalId: 'op-tosa',
        status: 'grooming',
        startsAt: new Date('2026-11-25T14:00:00Z'),
        endsAt: new Date('2026-11-25T14:45:00Z'),
        checkInNotes: null,
        stageHistory: [
          { status: 'checked_in', at: '2026-11-25T14:00:00Z', skipped: false },
          { status: 'bathing', at: '2026-11-25T14:15:00Z', operatorId: 'op-banho', operatorName: 'Sara', skipped: false },
          { status: 'grooming', at: '2026-11-25T14:30:00Z', operatorId: 'op-antigo', operatorName: 'Antigo responsável', skipped: false },
        ],
        pet: { id: 'pet-1', name: 'Thor', species: 'dog', size: 'medium', coatType: 'short' },
        services: [
          {
            id: 'asvc-banho-1',
            appointmentId: 'apt-1',
            serviceId: 'svc-banho',
            nameSnapshot: 'Banho',
            priceSnapshot: 50,
            durationMinutes: 45,
            customerPackageId: 'pkg-1',
            customerPackageItemId: 'citem-banho',
            coverageStatus: 'reserved',
            chargedSaleId: null,
            comboParentId: null,
            service: { id: 'svc-banho', name: 'Banho', customStages: ['checked_in', 'bathing', 'finishing', 'ready'] },
          },
        ],
      });

      await svcWithCommissions.exchangeSessionService('pkg-1', {
        appointmentId: 'apt-1',
        newServiceId: 'svc-tosa',
        commissionRecipientId: 'op-tosa',
      }, { userId: 'u-1', name: 'Lucas' });

      expect(mockCommissions.recordExecution).toHaveBeenCalledTimes(2);
      expect(mockCommissions.recordExecution).toHaveBeenCalledWith(
        h.tx,
        expect.any(Object),
        'bathing',
        'op-banho',
        new Date('2026-11-25T14:15:00Z'),
      );
      expect(mockCommissions.recordExecution).toHaveBeenCalledWith(
        h.tx,
        expect.any(Object),
        'grooming',
        'op-tosa',
        new Date('2026-11-25T14:30:00Z'),
      );
      expect(h.updatedAppointmentCalls[h.updatedAppointmentCalls.length - 1].stageHistory).toEqual(expect.arrayContaining([
        expect.objectContaining({ status: 'grooming', operatorId: 'op-tosa', operatorName: 'Carla Tosadora' }),
      ]));
    });

    it('deve remover diferenças anteriores não pagas ao trocar mantendo o valor atual do pacote (replaceUnpaidUpgradeFees)', async () => {
      const h = buildExchangeHarness();

      h.tx.petAppointment.findUnique.mockResolvedValueOnce({
        id: 'apt-1',
        petId: 'pet-1',
        customerId: 'cust-1',
        professionalId: 'op-banho',
        status: 'scheduled',
        startsAt: new Date('2026-11-25T14:00:00Z'),
        endsAt: new Date('2026-11-25T14:45:00Z'),
        checkInNotes: null,
        stageHistory: [],
        pet: { id: 'pet-1', name: 'Thor', species: 'dog', size: 'medium', coatType: 'short' },
        services: [
          {
            id: 'asvc-banho-1',
            appointmentId: 'apt-1',
            serviceId: 'svc-banho',
            nameSnapshot: 'Banho',
            priceSnapshot: 50,
            durationMinutes: 45,
            customerPackageId: 'pkg-1',
            customerPackageItemId: 'citem-banho',
            coverageStatus: 'reserved',
            chargedSaleId: null,
            comboParentId: null,
            service: { id: 'svc-banho', name: 'Banho', customStages: ['checked_in', 'bathing', 'ready'] },
          },
          {
            id: 'asvc-upgrade-unpaid',
            appointmentId: 'apt-1',
            serviceId: 'petshop-package-upgrade-fee',
            nameSnapshot: 'Diferença (Banho por Banho + Tosa)',
            priceSnapshot: 50,
            durationMinutes: 0,
            customerPackageId: null,
            coverageStatus: 'none',
            coveredAmount: 0,
            chargedSaleId: null,
            comboParentId: null,
          },
        ],
      });

      await h.pkgService.exchangeSessionService('pkg-1', {
        appointmentId: 'apt-1',
        oldAppointmentServiceId: 'asvc-banho-1',
        newServiceId: 'svc-tosa',
        differenceAmount: 0,
        chargeMode: 'none',
        keepPackageValue: true,
        replaceUnpaidUpgradeFees: true,
        reason: 'Manter pacote sem custo adicional',
      }, { userId: 'u-1', name: 'Lucas' });

      expect(h.tx.petAppointmentService.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['asvc-upgrade-unpaid'] }, appointmentId: 'apt-1', chargedSaleId: null },
      });
      expect(h.createdServices.find(s => s.serviceId === 'petshop-package-upgrade-fee')).toBeUndefined();
      expect(h.updatedAppointmentCalls[0].stageHistory).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'service_swapped',
          notes: expect.stringContaining('Diferença anterior não paga de R$ 50,00 removida'),
        }),
      ]));
    });
  });

  describe('PetshopWhatsappService — Renderização Dinâmica de Templates', () => {
    let whatsappService: PetshopWhatsappService;

    beforeEach(() => {
      whatsappService = new PetshopWhatsappService({} as any, {} as any, {} as any);
    });

    it('deve substituir todas as variáveis dinâmicas de agendamento e pacote no template', () => {
      const template =
        'Olá *{nome_tutor}*! O atendimento de *{nome_pet}* ({servico}) está confirmado para {data} às {hora} na *{nome_loja}*. Saldo do pacote: {saldo_pacote} (válido até {validade_pacote}). Link: {link_portal}';

      const rendered = whatsappService.renderTemplate(template, {
        nome_tutor: 'Ana Paula',
        nome_pet: 'Thor',
        servico: 'Banho + Tosa Higiênica',
        data: '25/10/2026',
        hora: '14:30',
        nome_loja: 'Pract Pet Care',
        saldo_pacote: '2 de 4 sessões',
        validade_pacote: '25/11/2026',
        link_portal: 'https://practpet.com/cliente-pet/123',
      });

      expect(rendered).toBe(
        'Olá *Ana Paula*! O atendimento de *Thor* (Banho + Tosa Higiênica) está confirmado para 25/10/2026 às 14:30 na *Pract Pet Care*. Saldo do pacote: 2 de 4 sessões (válido até 25/11/2026). Link: https://practpet.com/cliente-pet/123',
      );
    });
  });
});
