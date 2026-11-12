import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGoogleMapsRoutes,
  isMobileMapsClient,
  qualifyRouteAddresses,
  qualifyRouteAddress,
  addressHasCityOrState,
  requireRouteAddresses,
  orderedRouteAddresses,
} from '../src/pages/petshop/taxi-route.ts';

test('Android horizontal continua no limite de três paradas intermediárias', () => {
  assert.equal(isMobileMapsClient('Mozilla/5.0 (Linux; Android 14)', true, 915), true);
  assert.equal(isMobileMapsClient('Mozilla/5.0 (Windows NT 10.0)', false, 1280), false);
  assert.equal(buildGoogleMapsRoutes(['A', 'B', 'C', 'D', 'E'], true).length, 2);
});

test('quatro endereços chegam ao Maps na ordem do manifesto mobile', () => {
  const addresses = ['Rua A, 1', 'Rua B, 2', 'Rua C, 3', 'Rua D, 4'];
  const routes = buildGoogleMapsRoutes(addresses, true);
  assert.equal(routes.length, 1);
  const url = new URL(routes[0]);
  assert.equal(url.searchParams.get('destination'), addresses[3]);
  assert.equal(url.searchParams.get('waypoints'), addresses.slice(0, 3).join('|'));
});

test('agrupa endereços repetidos e cria trechos explícitos acima do limite', () => {
  const addresses = ['Rua A', ' rua a ', 'Rua B', 'Rua C', 'Rua D', 'Rua E'];
  assert.deepEqual(orderedRouteAddresses(addresses), ['Rua A', 'Rua B', 'Rua C', 'Rua D', 'Rua E']);
  const routes = buildGoogleMapsRoutes(addresses, true);
  assert.equal(routes.length, 2);
  assert.equal(new URL(routes[1]).searchParams.get('origin'), 'Rua D');
  assert.equal(new URL(routes[1]).searchParams.get('destination'), 'Rua E');
});

test('preserva retorno posterior ao mesmo endereço na ordem do manifesto', () => {
  const addresses = requireRouteAddresses(['Rua A', 'Rua B', ' rua a ']);
  assert.deepEqual(addresses, ['Rua A', 'Rua B', 'rua a']);
  const route = new URL(buildGoogleMapsRoutes(addresses, true)[0]);
  assert.equal(route.searchParams.get('waypoints'), 'Rua A|Rua B');
  assert.equal(route.searchParams.get('destination'), 'rua a');
});

test('uma parada sem endereço interrompe a rota em vez de ser omitida', () => {
  assert.throws(() => requireRouteAddresses(['Rua A, 10', '', 'Rua C, 30']), /1 parada\(s\) sem endereço/);
  assert.deepEqual(requireRouteAddresses(['Rua A, 10', ' rua a, 10 ', 'Rua C, 30']), ['Rua A, 10', 'Rua C, 30']);
});

test('não obriga digitação de UF/cidade e preserva endereços com cidades diferentes', () => {
  // Sem cidade fornecida, não lança erro: retorna o endereço limpo para resolver por GPS
  const semCidade = qualifyRouteAddresses(['Rua A, 10', 'Rua B, 20'], '');
  assert.deepEqual(semCidade, ['Rua A, 10', 'Rua B, 20']);

  // Detecta se endereço já possui estado/cidade explícito
  assert.equal(addressHasCityOrState('Av. Principal, 100 - Piratininga - SP'), true);
  assert.equal(addressHasCityOrState('Rua 15, 200, Agudos - SP'), true);
  assert.equal(addressHasCityOrState('Rua Sem Estado, 30 - Centro'), false);

  // Endereço de outra cidade não é poluído pela cidade padrão da loja
  const multiCidades = qualifyRouteAddresses(
    [
      'Rua Hipólito Lopes, 1419 - Redentor',
      'Av. 13 de Maio, 50 - Centro - Agudos - SP',
      'Rua B, 10 - Piratininga - SP',
    ],
    'Bauru, SP',
  );
  assert.equal(multiCidades[0], 'Rua Hipólito Lopes, 1419 - Redentor, Bauru, SP');
  assert.equal(multiCidades[1], 'Av. 13 de Maio, 50 - Centro - Agudos - SP');
  assert.equal(multiCidades[2], 'Rua B, 10 - Piratininga - SP');
});
