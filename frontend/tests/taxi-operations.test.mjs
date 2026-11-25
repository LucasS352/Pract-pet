import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractCustomerTaxiAddress,
  needsTaxiStop,
  packageTransportCovers,
  packageTransportUiMode,
  parseTaxiAddressParts,
  resolveReceptionBookingSelection,
  summarizeTaxiAppointments,
} from '../src/pages/petshop/taxi-operations.ts';

const appointment = (id, status, mode, startsAt = '2026-11-09T17:00:00.000Z') => ({
  id, status, startsAt, transport: { enabled: true, mode },
});

test('coleta vencida continua pendente e cada agendamento conta uma vez', () => {
  const old = appointment('old', 'scheduled', 'round_trip', '2026-11-08T17:00:00.000Z');
  const result = summarizeTaxiAppointments([
    old, old,
    appointment('new', 'requested', 'pickup_only'),
    appointment('store', 'bathing', 'round_trip'),
    appointment('ready', 'ready', 'dropoff_only'),
    appointment('done', 'delivered', 'round_trip'),
    appointment('cancel', 'cancelled', 'round_trip'),
    appointment('absent', 'no_show', 'round_trip'),
  ]);
  assert.deepEqual(result.pickups.map(item => item.id), ['old', 'new']);
  assert.deepEqual(result.inStore.map(item => item.id), ['store']);
  assert.deepEqual(result.ready.map(item => item.id), ['ready']);
  assert.equal(result.all.length, 5);
  assert.equal(result.delivered.length, 1);
});

test('roteiro inclui tarefas futuras e pendentes, mas exclui ausência, entrega concluída e coleta já feita', () => {
  const cases = [
    ['scheduled', 'pickup_only', true],
    ['scheduled', 'dropoff_only', true],
    ['scheduled', 'round_trip', true],
    ['checked_in', 'pickup_only', false],
    ['bathing', 'round_trip', true],
    ['ready', 'pickup_only', false],
    ['ready', 'dropoff_only', true],
    ['delivered', 'round_trip', false],
    ['cancelled', 'round_trip', false],
    ['no_show', 'round_trip', false],
  ];
  for (const [status, mode, expected] of cases) {
    assert.equal(needsTaxiStop(appointment(`${status}-${mode}`, status, mode)), expected, `${status}/${mode}`);
  }
});

test('conta agendamentos, não serviços, pets ou tutores', () => {
  const first = { ...appointment('a', 'scheduled', 'round_trip'), pet: { id: 'pet-1', customerId: 'tutor-1' }, services: [{ id: 's1' }, { id: 's2' }] };
  const second = { ...appointment('b', 'scheduled', 'round_trip'), pet: { id: 'pet-1', customerId: 'tutor-1' }, services: [{ id: 's3' }] };
  const third = { ...appointment('c', 'scheduled', 'pickup_only'), pet: { id: 'pet-2', customerId: 'tutor-1' }, services: [{ id: 's4' }] };
  const result = summarizeTaxiAppointments([first, second, third]);
  assert.equal(result.pickups.length, 3);
  assert.equal(result.dropoffs.length, 2);
  assert.equal(result.all.length, 3);
});

test('transporte de pacote exige modalidade compatível e mantém o valor do seletor', () => {
  assert.equal(packageTransportUiMode('round_trip'), 'both');
  assert.equal(packageTransportUiMode('pickup_only'), 'pickup');
  assert.equal(packageTransportUiMode('dropoff_only'), 'dropoff');
  assert.equal(packageTransportCovers('both', 'pickup_only'), false);
  assert.equal(packageTransportCovers('dropoff', 'pickup_only'), false);
  assert.equal(packageTransportCovers('pickup', 'pickup_only'), true);
  assert.equal(packageTransportCovers('both', 'round_trip'), true);
  assert.equal(packageTransportCovers('pickup', null), false);
});

test('pré-preenche endereço do Táxi Dog imediatamente após cadastrar tutor e pet no modal de recepção', () => {
  const newTutor = {
    id: 'tutor-novo',
    name: 'Juliana Moriga',
    phone: '14991146769',
    address: 'Nagib Sahad, 576 - Cohab - Campo do Tiro',
    reference: 'Próximo ao Campo Orlandão, Ap 12',
  };
  const newPet = {
    id: 'pet-novo',
    customerId: 'tutor-novo',
    name: 'Belinha',
    species: 'dog',
    customer: newTutor,
  };

  const selection = resolveReceptionBookingSelection({ tutor: newTutor, pet: newPet });
  assert.equal(selection.selectedTutor.id, 'tutor-novo');
  assert.equal(selection.petId, 'pet-novo');
  assert.equal(selection.pets.length, 1);
  assert.deepEqual(selection.addressFields, {
    customerStreet: 'Nagib Sahad, 576',
    customerNeighborhood: 'Cohab - Campo do Tiro',
    customerReference: 'Próximo ao Campo Orlandão, Ap 12',
    saveAddressToCustomer: false,
  });
});

test('preserva pets existentes ao cadastrar segundo pet do mesmo tutor e extrai endereço ao cadastrar só o tutor', () => {
  const existingTutor = {
    id: 'tutor-1',
    name: 'Adriana',
    phone: '11999990000',
    address: 'Rua das Flores, 45 - Centro',
    reference: 'Portão verde',
  };
  const firstPet = { id: 'pet-1', customerId: 'tutor-1', name: 'Mel', species: 'dog', customer: existingTutor };
  const secondPet = { id: 'pet-2', customerId: 'tutor-1', name: 'Thor', species: 'dog', customer: existingTutor };

  const secondPetSelection = resolveReceptionBookingSelection(
    { tutor: existingTutor, pet: secondPet },
    'tutor-1',
    [firstPet],
  );
  assert.deepEqual(secondPetSelection.pets.map(p => p.id), ['pet-2', 'pet-1']);
  assert.equal(secondPetSelection.addressFields.customerStreet, 'Rua das Flores, 45');
  assert.equal(secondPetSelection.addressFields.customerNeighborhood, 'Centro');

  const tutorOnlySelection = resolveReceptionBookingSelection(
    { tutor: { id: 'tutor-2', name: 'Carlos', phone: '11988887777', address: null, reference: null }, pet: null },
  );
  assert.equal(tutorOnlySelection.petId, '');
  assert.equal(tutorOnlySelection.addressFields.saveAddressToCustomer, true);
  assert.deepEqual(parseTaxiAddressParts('Rua Sem Bairro, 10'), { street: 'Rua Sem Bairro, 10', neighborhood: '' });
  assert.equal(extractCustomerTaxiAddress(null).saveAddressToCustomer, true);
});
