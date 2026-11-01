import { assertComandaSnapshot } from './comanda-snapshot';
describe('Conferência da comanda cobrada a partir de uma cópia', () => {
  const items = [{ id: 'a', quantity: 2, totalPrice: '30.00' }, { id: 'b', quantity: 1, totalPrice: '15.00' }];
  it('aceita a mesma conta independentemente da ordem e de decimal serializado', () => {
    expect(() => assertComandaSnapshot([{ ...items[1], totalPrice: 15 }, items[0]], items)).not.toThrow();
  });
  it.each([
    [items[0]],
    [items[0], items[0]],
    [items[0], { ...items[1], id: 'substituido' }],
    [items[0], { ...items[1], quantity: 2 }],
    [items[0], { ...items[1], totalPrice: '16.00' }],
    [items[0], { ...items[1], totalPrice: 'NaN' }],
  ])('recusa alteração, omissão ou duplicação de itens (%j)', (...expected) => {
    expect(() => assertComandaSnapshot(expected, items)).toThrow('A comanda mudou');
  });
  it('preserva clientes legados', () => expect(() => assertComandaSnapshot(undefined, items)).not.toThrow());
});
