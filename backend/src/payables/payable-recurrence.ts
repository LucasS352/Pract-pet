export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function nextOccurrence(baseMonth: string, originalDay: number, offset: number) {
  const [year, month] = baseMonth.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const dueDate = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(originalDay, lastDay), 12));
  return { dueDate, recurrenceMonth: monthKey(first) };
}

/** Never overwrite paid, edited or cancelled occurrences when extending a series. */
export async function ensureFutureOccurrences(tx: any, payable: any, count: number) {
  if (!payable.isRecurring || !payable.recurrenceId || payable.status === 'CANCELLED') return;
  const base = payable.recurrenceMonth || monthKey(payable.dueDate);
  const day = payable.recurrenceDay || payable.dueDate.getUTCDate();
  for (let offset = 1; offset <= count; offset++) {
    const occurrence = nextOccurrence(base, day, offset);
    await tx.payable.upsert({
      where: { recurrenceId_recurrenceMonth: { recurrenceId: payable.recurrenceId, recurrenceMonth: occurrence.recurrenceMonth } },
      update: {},
      create: {
        description: payable.description, amount: payable.amount, type: payable.type,
        status: 'PENDING', paidAt: null, isRecurring: true,
        recurrenceId: payable.recurrenceId, recurrenceDay: day, ...occurrence,
        supplierId: payable.supplierId, category: payable.category, notes: payable.notes,
      },
    });
  }
}
