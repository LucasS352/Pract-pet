import { PetshopWhatsappService } from './petshop-whatsapp.service';

describe('reconexão do WhatsApp', () => {
  afterEach(() => jest.useRealTimers());

  it('continua tentando após cinco falhas, com espera limitada e sem duplicar timers', () => {
    jest.useFakeTimers();
    const service: any = new PetshopWhatsappService({} as any, {} as any, {} as any);
    const rt = service.getOrCreateRuntime('tenant');
    const start = jest.spyOn(service, 'startBaileysSession').mockResolvedValue(undefined);
    for (let i = 0; i < 8; i++) service.scheduleReconnect(rt, 'tenant', 'qa-db');
    expect(rt.reconnectAttempts).toBe(8);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(299_999);
    expect(start).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledWith('tenant', 'qa-db', false);
  });
});
