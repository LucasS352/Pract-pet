import { Plus, Trash2 } from 'lucide-react';
import { money } from './types';

export type PackagePaymentRow = { method: string; amount: string };
export const packagePaymentLabels: Record<string, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', credito: 'Cartão de crédito', debito: 'Cartão de débito',
};
export function paymentAmount(value: string): number {
  return /^\d+(?:[.,]\d{1,2})?$/.test(value.trim()) ? Number(value.replace(',', '.')) : NaN;
}
export function packagePaymentsValid(rows: PackagePaymentRow[], total: number): boolean {
  if (total === 0) return rows.length === 0 || (rows.length === 1 && paymentAmount(rows[0].amount) === 0);
  return rows.length > 0 && rows.length <= 12 && rows.every(row => packagePaymentLabels[row.method] && paymentAmount(row.amount) > 0) &&
    rows.reduce((sum, row) => sum + Math.round(paymentAmount(row.amount) * 100), 0) === Math.round(total * 100);
}

export function PackagePaymentFields({ rows, total, onChange }: {
  rows: PackagePaymentRow[]; total: number; onChange: (rows: PackagePaymentRow[]) => void;
}) {
  const entered = rows.reduce((sum, row) => sum + Math.round((paymentAmount(row.amount) || 0) * 100), 0);
  const remaining = Math.round(total * 100) - entered;
  const valid = packagePaymentsValid(rows, total);
  const update = (index: number, patch: Partial<PackagePaymentRow>) => onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return (
    <fieldset className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold text-emerald-950">Pagamento recebido</legend>
      <p className="text-sm text-zinc-600">Informe quanto recebeu em cada forma de pagamento.</p>
      {total > 0 && rows.map((row, index) => (
        <div key={index} className="flex items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1 text-xs font-medium text-zinc-600">
            <span>Forma {index + 1}</span>
            <select aria-label={`Forma de pagamento ${index + 1}`} value={row.method} onChange={e => update(index, { method: e.target.value })}
              className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-2 text-base text-zinc-900 sm:text-sm">
              {Object.entries(packagePaymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="w-28 shrink-0 space-y-1 text-xs font-medium text-zinc-600 sm:w-36">
            <span>Valor (R$)</span>
            <input aria-label={`Valor do pagamento ${index + 1}`} inputMode="decimal" value={row.amount} placeholder="0,00"
              onChange={e => update(index, { amount: e.target.value })}
              className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base tabular-nums text-zinc-900 sm:text-sm" />
          </label>
          {rows.length > 1 && <button type="button" aria-label={`Remover pagamento ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={17} /></button>}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {total > 0 && <button type="button" disabled={rows.length >= 12} onClick={() => {
          const method = Object.keys(packagePaymentLabels).find(method => !rows.some(r => r.method === method)) || 'pix';
          onChange([...rows, { method, amount: (Math.max(0, remaining) / 100).toFixed(2).replace('.', ',') }]);
        }} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"><Plus size={17} />Adicionar forma de pagamento</button>}
        <div className="text-right text-sm" aria-live="polite" role="status">
          <p className="font-semibold text-zinc-900">Total: {money(total)}</p>
          <p className={valid ? 'text-emerald-800' : 'text-amber-900'}>
            {valid ? 'Total conferido' : remaining > 0 ? `Falta ${money(remaining / 100)}` : remaining < 0 ? `Excede ${money(-remaining / 100)}` : 'Confira os valores informados'}
          </p>
        </div>
      </div>
    </fieldset>
  );
}
