import { allocatePackageDiscount, allocatePackagePayments, moneyCents, normalizePackagePayments, packageReceivedAmount, receiptNotes, receivedInPeriod } from './package-receipts';

describe('Package receipts in integer cents', () => {
  it('records the customer example of 52 cash + 38 Pix', () => {
    expect(normalizePackagePayments([{ method: 'dinheiro', amount: '52.00' }, { method: 'pix', amount: 38 }], 90))
      .toEqual([{ method: 'dinheiro', amount: 52 }, { method: 'pix', amount: 38 }]);
  });
  it.each([89.99, 90.01, 0, -1, 1e12, 'NaN', '1.001', ''])('rejects invalid or non-balancing payment %s', amount => {
    expect(() => normalizePackagePayments([{ method: 'pix', amount }], 90)).toThrow();
  });
  it('supports three methods and retains every cent across a family', () => {
    const payments = normalizePackagePayments([{ method: 'dinheiro', amount: 52 }, { method: 'pix', amount: 38 }, { method: 'credito', amount: 85 }], 175);
    const groups = allocatePackagePayments(payments, [58.33, 58.33, 58.34]);
    expect(groups.map(rows => rows.reduce((s, p) => s + moneyCents(p.amount), 0))).toEqual([5833, 5833, 5834]);
    for (const payment of payments) expect(groups.flat().filter(p => p.method === payment.method).reduce((s, p) => s + moneyCents(p.amount), 0)).toBe(moneyCents(payment.amount));
  });
  it('rejects unknown methods, absent payments and fractional cents', () => {
    expect(() => normalizePackagePayments([{ method: 'forged', amount: 90 }], 90)).toThrow();
    expect(() => normalizePackagePayments([], 90)).toThrow();
    expect(() => moneyCents(1.001)).toThrow();
    expect(normalizePackagePayments([], 0)).toEqual([]);
    expect(normalizePackagePayments(undefined, 90, 'pix')).toEqual([{ method: 'pix', amount: 90 }]);
  });
  it('attributes late receipts to payment date, preserving legacy dates and notes', () => {
    const today = new Date('2026-11-17T03:00:00Z'), end = new Date('2026-11-18T02:59:59.999Z');
    const createdAt = new Date('2026-11-16T15:00:00Z');
    const notes = receiptNotes('Observação antiga', { receivedAt: '2026-11-17T14:00:00Z', payments: [{ method: 'pix', amount: 37 }] });
    expect(JSON.parse(notes).userNotes).toBe('Observação antiga');
    expect(receivedInPeriod({ createdAt, notes }, today, end)).toBe(true);
    expect(receivedInPeriod({ createdAt, notes }, createdAt, new Date('2026-11-17T02:59:59.999Z'))).toBe(false);
    expect(receivedInPeriod({ createdAt, notes: null }, today, end)).toBe(false);
  });
  it('keeps the contracted price while reconciling a discounted receipt and family allocation', () => {
    const discounts = allocatePackageDiscount(20, [40, 40]);
    expect(discounts).toEqual([10, 10]);
    const payments = normalizePackagePayments([{ method: 'credito', amount: 30 }, { method: 'pix', amount: 30 }], 60);
    const allocated = allocatePackagePayments(payments, [30, 30]);
    expect(allocated.flat().reduce((sum, row) => sum + moneyCents(row.amount), 0)).toBe(6000);
    const notes = receiptNotes(null, { receivedAt: '2026-11-18T12:00:00Z', payments: allocated[0], discountAmount: discounts[0] });
    expect(packageReceivedAmount({ finalPrice: 40, notes })).toBe(30);
    expect(packageReceivedAmount({ finalPrice: 40, notes: null })).toBe(40);
    expect(allocatePackageDiscount(0.01, [33.33, 33.33, 33.34])).toEqual([0, 0, 0.01]);
  });
});
