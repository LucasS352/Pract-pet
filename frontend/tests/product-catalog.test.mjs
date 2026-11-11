import assert from 'node:assert/strict';
import test from 'node:test';
import { isPetshopServiceCategory } from '../src/pages/petshop/product-catalog.ts';

test('serviços e pacotes legados não aparecem como mercadorias', () => {
  assert.equal(isPetshopServiceCategory('Serviços'), true);
  assert.equal(isPetshopServiceCategory('Pacotes Pet'), true);
  assert.equal(isPetshopServiceCategory('Higiene e Beleza'), false);
});
