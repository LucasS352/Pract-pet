import { StationAccessService } from './station-access.service';

describe('revogação da sessão da loja', () => {
  it('nega usuário desativado ou movido de loja após expirar a consulta curta', async () => {
    jest.useFakeTimers();
    try {
      const row: any = { id: 'user', tenantId: 'tenant-a', email: 'qa@example.test', role: 'operator', groupId: null,
        active: true, tenant: { status: 'active' } };
      const findUnique = jest.fn().mockImplementation(async () => ({ ...row }));
      const access = new StationAccessService({ user: { findUnique } } as any, {} as any, {} as any);
      expect((await access.validateShopUser('user', 'tenant-a')).role).toBe('operator');
      row.active = false;
      expect(await access.validateShopUser('user', 'tenant-a')).toBeTruthy();
      jest.advanceTimersByTime(10_001);
      await expect(access.validateShopUser('user', 'tenant-a')).rejects.toThrow('desativado');
      row.active = true;
      row.tenantId = 'tenant-b';
      jest.advanceTimersByTime(10_001);
      await expect(access.validateShopUser('user', 'tenant-a')).rejects.toThrow('desativado');
      expect(findUnique).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
