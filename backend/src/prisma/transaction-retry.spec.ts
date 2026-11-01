import { retryTransaction } from './transaction-retry';

describe('retry de transações abortadas', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('aguarda rollback e repete conflito transitório até concluir', async () => {
    const transaction = jest.fn().mockRejectedValueOnce({ code: 'P2034' }).mockResolvedValue({ id: 'same-sale' });
    const result = retryTransaction(transaction);
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ id: 'same-sale' });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('limita tentativas e propaga conflito persistente', async () => {
    const error = { code: 'P2034' };
    const transaction = jest.fn().mockRejectedValue(error);
    const result = retryTransaction(transaction);
    const assertion = expect(result).rejects.toBe(error);
    await jest.runAllTimersAsync();
    await assertion;
    expect(transaction).toHaveBeenCalledTimes(4);
  });

  it.each(['P2002', 'P2028', 'P1001', undefined])('não repete erros de resultado incerto ou validação: %s', async code => {
    const error = { code };
    const transaction = jest.fn().mockRejectedValue(error);
    await expect(retryTransaction(transaction)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
