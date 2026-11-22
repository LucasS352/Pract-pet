import { normalizeTransport, parseAppointmentTransport, serializeAppointmentTransport, taxiNotificationText } from './petshop-transport';
import { PetshopService } from './petshop.service';
import { PetshopPortalService } from './petshop-portal.service';
import { PetshopPricingService } from './petshop-pricing.service';
import { ForbiddenException } from '@nestjs/common';

const vars = { tutor: 'Luc', pet: 'Bolinha', service: 'Banho', date: '10/11/2026', time: '10:00', shop: 'PetSh' };

describe('comunicação Táxi Dog', () => {
  const create = (mode: string) => normalizeTransport({ enabled: true, mode, address: 'Rua Teste, 1' })!;

  it('persiste as modalidades avulsas e reconhece os códigos dos pacotes', () => {
    expect(parseAppointmentTransport(serializeAppointmentTransport(create('both')))?.mode).toBe('round_trip');
    expect(create('pickup').mode).toBe('pickup_only');
    expect(create('dropoff').mode).toBe('dropoff_only');
  });

  it('avisa a busca para ida e volta e apenas busca', () => {
    for (const mode of ['both', 'pickup_only']) {
      const reminder = taxiNotificationText('BEFORE_APPOINTMENT', create(mode), { ...vars, minutesBefore: 120 })!;
      expect(reminder).toContain('programado para buscar');
      expect(reminder).toContain('Avisaremos quando o motorista sair');
      expect(reminder).not.toContain('está a caminho');
    }
  });

  it('pede que o tutor traga o pet quando só há entrega', () => {
    const reminder = taxiNotificationText('BEFORE_APPOINTMENT', create('dropoff_only'), vars)!;
    expect(reminder).toContain('Traga Bolinha à loja');
    expect(reminder).not.toContain('buscar Bolinha');
  });

  it('orienta a entrega ou retirada no aviso de pronto', () => {
    expect(taxiNotificationText('PET_READY', create('both'), vars)).toContain('entrega pelo Táxi Dog');
    expect(taxiNotificationText('PET_READY', create('dropoff_only'), vars)).toContain('entrega pelo Táxi Dog');
    expect(taxiNotificationText('PET_READY', create('pickup_only'), vars)).toContain('para você retirar');
    expect(taxiNotificationText('PET_READY', create('both'), { ...vars, portalLink: 'https://x/p' })).not.toContain('Acompanhe pelo portal');
    expect(taxiNotificationText('APPOINTMENT_CONFIRMED', create('both'), { ...vars, portalLink: 'https://x/p' })).not.toContain('Acompanhe pelo portal');
    expect(taxiNotificationText('PET_READY', null, vars)).toBeNull();
  });

  it('impede removeCashMovement de excluir movimentação de caixa do PDV', async () => {
    const svc = Object.create(PetshopService.prototype) as any;
    const del = jest.fn();
    svc.prisma = async () => ({
      cashMovement: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mov-1', cashRegisterId: 'pdv-register-1', createdAt: new Date() }),
        delete: del,
      },
    });
    await expect(svc.removeCashMovement('mov-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(del).not.toHaveBeenCalled();
  });

  it('sobrescreve fee e coveredByPackage enviados pelo portal público com a taxa oficial da loja', async () => {
    const createdArgs: any[] = [];
    const tx = {
      $queryRaw: jest.fn(),
      petAppointment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(args => { createdArgs.push(args); return { id: 'apt-1' }; }),
      },
    };
    const prisma = {
      pet: { findFirst: jest.fn().mockResolvedValue({ id: 'pet-1', species: 'dog', size: 'small', coatType: 'short' }) },
      petService: { findMany: jest.fn().mockResolvedValue([{ id: 'svc-1', name: 'Banho', price: 50, durationMinutes: 45, pricingRules: [] }]) },
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ paymentMethodsConfig: { fee: 35 } }) },
      $transaction: jest.fn(cb => cb(tx)),
    };
    const portal = new PetshopPortalService({} as any, {} as any, new PetshopPricingService(), {} as any);
    (portal as any).session = jest.fn().mockResolvedValue({ prisma, customerId: 'cust-1' });

    const futureDate = new Date(Date.now() + 86_400_000).toISOString();
    await portal.requestAppointment('SHOP1', 'token-valid', {
      petId: 'pet-1',
      serviceIds: ['svc-1'],
      startsAt: futureDate,
      transport: { enabled: true, mode: 'round_trip', address: 'Rua A, 10', fee: 0, coveredByPackage: true },
    });

    const saved = parseAppointmentTransport(createdArgs[0].data.checkInNotes);
    expect(saved?.fee).toBe(35);
    expect(saved?.coveredByPackage).toBe(false);
  });
});
