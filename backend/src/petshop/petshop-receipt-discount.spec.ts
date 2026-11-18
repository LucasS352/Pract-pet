import * as bcrypt from 'bcrypt';
import { PetshopPackagesService } from './petshop-packages.service';
import { PetshopService } from './petshop.service';

describe('Discounted Pet Shop receipts', () => {
  const pin = '2468';
  let hashedPin: string;

  beforeAll(async () => { hashedPin = await bcrypt.hash(pin, 4); });

  it('records an appointment discount in the sale and rejects a wrong PIN or amount', async () => {
    const checkout = jest.fn().mockResolvedValue({ id: 'sale-1', discount: 20, total: 30 });
    const db = { tenantSettings: { findUnique: jest.fn().mockResolvedValue({ discountPin: hashedPin }) } };
    const manager = { getTenantClient: jest.fn().mockResolvedValue(db) };
    const context = { get: () => ({ tenantId: 'tenant-1', databaseUrl: 'test' }) };
    const service = new PetshopService(manager as any, context as any, {} as any, {} as any, {} as any, {} as any, {} as any, { checkout } as any);
    jest.spyOn(service, 'prepareCheckout').mockResolvedValue({ id: 'comanda-1', total: 50 } as any);
    const req = { headers: {}, user: { role: 'admin' } };

    await service.receivePayment('appointment-1', { payments: [{ method: 'credito', value: 30 }], discount: 20, discountPin: pin }, req);
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ discount: 20, payments: [{ method: 'credito', value: 30 }] }), true);
    await expect(service.receivePayment('appointment-1', { payments: [{ method: 'credito', value: 30 }], discount: 20, discountPin: '0000' }, req)).rejects.toMatchObject({ status: 403 });
    await expect(service.receivePayment('appointment-1', { payments: [{ method: 'credito', value: 50 }], discount: 20, discountPin: pin }, req)).rejects.toThrow('total com desconto');
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it('stores package discount in the receipt without changing the contracted price', async () => {
    const contract = { id: 'contract-1', customerId: 'customer-1', notes: null, status: 'active', paymentStatus: 'pending', finalPrice: 50,
      comandaId: null, items: [{ id: 'item-1', availableQuantity: 1, usedQuantity: 0, reservedQuantity: 0 }] };
    const tx = {
      $queryRaw: jest.fn(),
      customerPetPackage: { findMany: jest.fn().mockResolvedValue([contract]), update: jest.fn() },
      customerPetPackageLedger: { create: jest.fn() },
    };
    const db = {
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ discountPin: hashedPin }) },
      customerPetPackage: { findUnique: jest.fn().mockResolvedValue(contract) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const manager = { getTenantClient: jest.fn().mockResolvedValue(db) };
    const context = { get: () => ({ tenantId: 'tenant-1', databaseUrl: 'test' }) };
    const service = new PetshopPackagesService(manager as any, context as any);
    jest.spyOn(service, 'getContractById').mockResolvedValue({ id: contract.id } as any);

    await service.confirmContractPayment(contract.id, { discountAmount: 20, discountPin: pin, payments: [{ method: 'pix', amount: 30 }] }, { userId: 'admin-1' });
    const updated = tx.customerPetPackage.update.mock.calls[0][0].data;
    expect(updated).not.toHaveProperty('finalPrice');
    expect(updated.paymentStatus).toBe('paid');
    expect(JSON.parse(updated.notes).receipt).toMatchObject({ discountAmount: 20, payments: [{ method: 'pix', amount: 30 }], discountAuthorizedBy: { userId: 'admin-1' } });
    expect(tx.customerPetPackageLedger.create).toHaveBeenCalledTimes(1);

    await expect(service.confirmContractPayment(contract.id, { discountAmount: 20, discountPin: '0000', payments: [{ method: 'pix', amount: 30 }] })).rejects.toMatchObject({ status: 403 });
    expect(tx.customerPetPackage.update).toHaveBeenCalledTimes(1);
  });
});
