import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';

export interface StockCell { qty: number; productId: string; unit: string }
export interface StockRow { key?: string; barcode?: string | null; unit?: string; name: string; tenants: Record<string, StockCell> }
export interface StockData { tenantLabels: Record<string, string>; rows: StockRow[] }
export interface CatalogRow { key?: string; barcode?: string | null; unit?: string; name: string; tenants: Record<string, { id: string; priceSell: number; priceCost: number; stock: number; unit: string; barcode?: string; ncm?: string }> }
export interface CatalogData { tenantLabels: Record<string, string>; rows: CatalogRow[] }
export interface Result { tenantId?: string; name?: string; success: boolean; error?: string }
export const money = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(n) ? n : 0);
export const number = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number.isFinite(n) ? n : 0);
export const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.';
export async function api<T>(path: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  const token = JSON.parse(localStorage.getItem('7bar-auth') || '{}')?.state?.token;
  const response = await fetch(`/api/groups/my/${path}`, { method: body === undefined ? 'GET' : method, signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' · ') : data.message || `Erro HTTP ${response.status}`);
  return data;
}
export function useDebounce(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), 180); return () => window.clearTimeout(timer); }, [value]);
  return debounced.trim().toLocaleLowerCase('pt-BR');
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="gp-field"><label htmlFor={id}>{label}</label>{cloneElement(children as ReactElement<{ id: string }>, { id })}</div>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return children ? <div className={`gp-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div> : null;
}
export function Busy() { return <div className="gp-empty" role="status"><Loader2 className="gp-spin" size={22} /> Carregando…</div>; }
export function Results({ results, labels }: { results: Result[]; labels: Record<string, string> }) {
  return results.length > 0 ? <div className="gp-results" role="status"><strong>Resultado por loja</strong>{results.map((r, i) => <p key={i} className={r.success ? 'gp-success' : 'gp-error'}>{r.success ? '✓' : '⚠'} {r.tenantId ? labels[r.tenantId] || r.tenantId : 'Origem'}{r.name ? ` · ${r.name}` : ''}: {r.success ? 'Atualizado' : r.error || 'Não atualizado'}</p>)}</div> : null;
}
export function Modal({ open, onClose, title, children, maxWidth = '560px', drawer = false, side = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; maxWidth?: string; drawer?: boolean; side?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} className={`gp-dialog ${drawer ? 'gp-account-drawer' : ''} ${side ? 'gp-store-sheet' : ''}`} style={{ maxWidth }} aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); closeRef.current(); }} onClick={e => { if (e.target === e.currentTarget) closeRef.current(); }}>
    <div className="gp-dialog-content"><header><h2 id={titleId}>{title}</h2><button className="gp-icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header><div className="gp-dialog-body">{children}</div></div>
  </dialog>;
}
