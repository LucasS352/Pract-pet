import { normalizeTransport, parseAppointmentTransport, serializeAppointmentTransport, taxiNotificationText } from './petshop-transport';

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
    expect(taxiNotificationText('PET_READY', null, vars)).toBeNull();
  });
});
