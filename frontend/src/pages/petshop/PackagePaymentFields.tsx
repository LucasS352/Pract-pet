import { CheckCircle2, CircleAlert, CreditCard, Plus, Trash2 } from 'lucide-react';
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

export function PackagePaymentFields({ rows, total, onChange, variant = 'default' }: {
  rows: PackagePaymentRow[]; total: number; onChange: (rows: PackagePaymentRow[]) => void; variant?: 'default' | 'receipt';
}) {
  const receipt = variant === 'receipt';
  const entered = rows.reduce((sum, row) => sum + Math.round((paymentAmount(row.amount) || 0) * 100), 0);
  const remaining = Math.round(total * 100) - entered;
  const valid = packagePaymentsValid(rows, total);
  const update = (index: number, patch: Partial<PackagePaymentRow>) => onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return (
    <fieldset className={receipt
      ? 'min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'
      : 'space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 sm:p-4'}>
      <legend className={receipt ? 'sr-only' : 'px-1 text-sm font-semibold text-emerald-950'}>{receipt ? 'Formas de pagamento' : 'Pagamento recebido'}</legend>
      {receipt ? (
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-800"><CreditCard aria-hidden="true" size={18} /></span>
          <div>
            <p className="text-sm font-bold text-slate-900">Formas de pagamento</p>
            <p className="text-xs text-slate-500">Informe o valor recebido em cada forma.</p>
          </div>
        </div>
      ) : <p className="text-sm text-zinc-600">Informe quanto recebeu em cada forma de pagamento.</p>}
      <div className={receipt ? 'space-y-3 p-3.5 sm:p-4' : 'space-y-3'}>
      {total > 0 && rows.map((row, index) => (
        <div key={index} className={receipt ? 'flex min-w-0 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 sm:p-3' : 'flex items-end gap-2'}>
          <label className="min-w-0 flex-1 space-y-1 text-xs font-medium text-zinc-600">
            <span>{receipt ? `Pagamento ${index + 1}` : `Forma ${index + 1}`}</span>
            <select aria-label={`Forma de pagamento ${index + 1}`} value={row.method} onChange={e => update(index, { method: e.target.value })}
              className={`h-11 w-full rounded-lg border bg-white px-2 text-base text-zinc-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm ${receipt ? 'border-slate-200' : 'border-zinc-300'}`}>
              {Object.entries(packagePaymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={`${receipt ? 'w-24 sm:w-36' : 'w-28 sm:w-36'} shrink-0 space-y-1 text-xs font-medium text-zinc-600`}>
            <span>Valor (R$)</span>
            <input aria-label={`Valor do pagamento ${index + 1}`} inputMode="decimal" value={row.amount} placeholder="0,00"
              onChange={e => update(index, { amount: e.target.value })}
              className={`h-11 w-full rounded-lg border bg-white px-2.5 text-base tabular-nums text-zinc-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 sm:text-sm ${receipt ? 'border-slate-200' : 'border-zinc-300'}`} />
          </label>
          {rows.length > 1 && <button type="button" aria-label={`Remover pagamento ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"><Trash2 aria-hidden="true" size={17} /></button>}
        </div>
      ))}
      <div className={receipt ? 'flex flex-col gap-3 pt-1' : 'flex flex-wrap items-center justify-between gap-3'}>
        {total > 0 && <button type="button" disabled={rows.length >= 12} onClick={() => {
          const method = Object.keys(packagePaymentLabels).find(method => !rows.some(r => r.method === method)) || 'pix';
          onChange([...rows, { method, amount: (Math.max(0, remaining) / 100).toFixed(2).replace('.', ',') }]);
        }} className={receipt
          ? 'inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-teal-300 bg-teal-50/60 px-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40'
          : 'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40'}><Plus aria-hidden="true" size={17} />Adicionar forma de pagamento</button>}
        <div className={receipt ? `flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${valid ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950'}` : 'text-right text-sm'} aria-live="polite" role="status">
          {receipt && (valid ? <CheckCircle2 aria-hidden="true" size={18} className="shrink-0 text-emerald-700" /> : <CircleAlert aria-hidden="true" size={18} className="shrink-0 text-amber-700" />)}
          <p className={receipt ? 'flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-0.5' : ''}>
            <span className={receipt ? 'font-semibold' : 'hidden'}>{valid ? 'Valores conferidos' : remaining > 0 ? `Falta ${money(remaining / 100)}` : remaining < 0 ? `Excede ${money(-remaining / 100)}` : 'Confira os valores'}</span>
            <span className={receipt ? 'font-bold tabular-nums' : 'font-semibold text-zinc-900'}>{receipt ? money(total) : `Total: ${money(total)}`}</span>
          </p>
          {!receipt && <p className={valid ? 'text-emerald-800' : 'text-amber-900'}>
            {valid ? 'Total conferido' : remaining > 0 ? `Falta ${money(remaining / 100)}` : remaining < 0 ? `Excede ${money(-remaining / 100)}` : 'Confira os valores informados'}
          </p>}
        </div>
      </div>
      </div>
    </fieldset>
  );
}
