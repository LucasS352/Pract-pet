import { PetshopService } from './petshop.service';
import { parseTaxiDefaultFee, readTaxiDefaultFee, TAXI_DEFAULT_FEE_SETTINGS_ID } from './taxi-default-fee';

describe('preço padrão do Táxi Dog', () => {
  it('usa R$ 40 quando não há configuração e preserva R$ 0 quando configurado', async () => {
    const findUnique = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ paymentMethodsConfig: { fee: 0 } });
    const prisma = { tenantSettings: { findUnique } };
    expect(await readTaxiDefaultFee(prisma)).toBe(40);
    expect(await readTaxiDefaultFee(prisma)).toBe(0);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: TAXI_DEFAULT_FEE_SETTINGS_ID }, select: { paymentMethodsConfig: true } });
    expect(() => parseTaxiDefaultFee(50.123)).toThrow();
  });

  it('grava somente no banco do tenant e bloqueia perfil operacional', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const manager = { getTenantClient: jest.fn().mockResolvedValue({ tenantSettings: { upsert } }) };
    const service = new PetshopService(manager as any, { get: () => ({ tenantId: 'tenant-a', databaseUrl: 'db-a' }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.updateTaxiDefaultFee(50, { user: { role: 'operator' } })).rejects.toThrow('Apenas administradores');
    expect(upsert).not.toHaveBeenCalled();
    await expect(service.updateTaxiDefaultFee(50, { user: { role: 'admin' } })).resolves.toEqual({ fee: 50 });
    expect(manager.getTenantClient).toHaveBeenCalledWith('tenant-a', 'db-a');
    expect(upsert).toHaveBeenCalledWith({ where: { id: TAXI_DEFAULT_FEE_SETTINGS_ID }, update: { paymentMethodsConfig: { fee: 50 } }, create: { id: TAXI_DEFAULT_FEE_SETTINGS_ID, paymentMethodsConfig: { fee: 50 } } });
  });

  it('não mistura preços entre tenants', async () => {
    const clients = {
      a: { tenantSettings: { findUnique: jest.fn().mockResolvedValue({ paymentMethodsConfig: { fee: 50 } }) } },
      b: { tenantSettings: { findUnique: jest.fn().mockResolvedValue({ paymentMethodsConfig: { fee: 75 } }) } },
    };
    const manager = { getTenantClient: jest.fn((id: 'a' | 'b') => clients[id]) };
    const makeService = (id: 'a' | 'b') => new PetshopService(manager as any, { get: () => ({ tenantId: id, databaseUrl: `db-${id}` }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(makeService('a').getTaxiDefaultFee()).resolves.toEqual({ fee: 50 });
    await expect(makeService('b').getTaxiDefaultFee()).resolves.toEqual({ fee: 75 });
    expect(manager.getTenantClient).toHaveBeenCalledWith('a', 'db-a');
    expect(manager.getTenantClient).toHaveBeenCalledWith('b', 'db-b');
  });
});
