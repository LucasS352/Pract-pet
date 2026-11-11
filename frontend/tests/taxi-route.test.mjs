import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGoogleMapsRoutes, isMobileMapsClient, qualifyRouteAddresses, requireRouteAddresses, orderedRouteAddresses } from '../src/pages/petshop/taxi-route.ts';

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

test('endereços abreviados recebem cidade e UF antes de abrir no Maps', () => {
  assert.throws(() => qualifyRouteAddresses(['Rua A, 10'], ''), /Informe cidade e UF/);
  const addresses = qualifyRouteAddresses(['Duque de Caxias, 21 - Jd Estoril', 'Heitor de Andrade Campos, 274 - Jd Prudência'], 'Bauru, SP');
  const url = new URL(buildGoogleMapsRoutes(addresses, true)[0]);
  assert.equal(url.searchParams.get('waypoints'), 'Duque de Caxias, 21 - Jd Estoril, Bauru, SP');
  assert.equal(url.searchParams.get('destination'), 'Heitor de Andrade Campos, 274 - Jd Prudência, Bauru, SP');
});
