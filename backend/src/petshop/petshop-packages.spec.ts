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
