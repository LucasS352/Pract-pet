import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Coins, PawPrint, Search, Users, X, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getFullUrl } from '@/lib/getFullUrl';

export function resolvePetAvatarUrl(pet: { name?: string | null; species?: string | null; breed?: string | null; photoUrl?: string | null }): string {
  if (pet.photoUrl) return getFullUrl(pet.photoUrl);
  const species = (pet.species || '').toLowerCase();
  const haystack = `${pet.breed || ''} ${pet.name || ''}`.toLowerCase();

  if (species === 'cat' || haystack.includes('gato') || haystack.includes('nina') || haystack.includes('simba') || haystack.includes('bella') || haystack.includes('amora')) {
    return '/petcare/cat-tabby.webp';
  }
  if (haystack.includes('golden') || haystack.includes('labrador') || haystack.includes('mel') || haystack.includes('thor') || haystack.includes('pandora') || haystack.includes('duque')) {
    return '/petcare/dog-golden.webp';
  }
  if (haystack.includes('collie') || haystack.includes('border') || haystack.includes('pastor') || haystack.includes('luna') || haystack.includes('maya')) {
    return '/petcare/dog-collie.webp';
  }
  if (haystack.includes('shih') || haystack.includes('lhasa') || haystack.includes('malt') || haystack.includes('bento') || haystack.includes('bob') || haystack.includes('lola')) {
    return '/petcare/dog-shihtzu.webp';
  }
  if (haystack.includes('pug') || haystack.includes('buldog') || haystack.includes('bulldog') || haystack.includes('chico') || haystack.includes('loquinho') || haystack.includes('zeca')) {
    return '/petcare/dog-pug.webp';
  }
  if (haystack.includes('spitz') || haystack.includes('lulu') || haystack.includes('beagle') || haystack.includes('teo') || haystack.includes('toby')) {
    return '/petcare/dog-spitz.webp';
  }

  const dogPool = ['/petcare/dog-golden.webp', '/petcare/dog-shihtzu.webp', '/petcare/dog-spitz.webp', '/petcare/dog-collie.webp', '/petcare/dog-pug.webp'];
  const code = (pet.name || 'P').charCodeAt(0);
  return dogPool[code % dogPool.length];
}

export function PetAvatar({
  pet,
  size = 'md',
  alt = '',
}: {
  pet: { name: string; species?: string | null; breed?: string | null; photoUrl?: string | null };
  size?: 'sm' | 'md' | 'lg';
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = resolvePetAvatarUrl(pet);
  const dims = size === 'sm' ? 'h-9 w-9 text-xs' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-11 w-11 text-xs';

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-[var(--pc-action-soft)] font-semibold text-[var(--pc-action)] ring-2 ring-white shadow-xs ${dims}`}>
        {(pet.name || 'PE').slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] object-cover ring-2 ring-white shadow-xs ${dims}`}
      loading="lazy"
    />
  );
}

export function PetHeroShowcase({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none hidden select-none items-center gap-4 lg:flex">
      <div className="relative flex items-center">
        <span className="absolute -left-5 -top-3 text-[var(--pc-action)]/15">
          <PawPrint size={26} />
        </span>
        <div className={`relative overflow-hidden rounded-2xl border border-[#cfe5df] bg-[#e9f3f0] shadow-xs ${compact ? 'h-16 w-28' : 'h-20 w-36'}`}>
          <img
            src="/petcare/hero-dog-cat.webp"
            alt=""
            className="h-full w-full object-cover object-center"
          />
        </div>
      </div>
      <div className="max-w-[175px]">
        <p className="text-xs italic leading-relaxed text-[var(--pc-text-secondary)]">
          “Pets felizes, clientes para sempre.”
        </p>
        <span className="mt-1.5 block h-0.5 w-8 rounded-full bg-[var(--pc-action)]" />
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="relative mb-4 sm:mb-6 flex flex-col gap-3 sm:gap-4 overflow-hidden rounded-2xl border border-[var(--pc-border)] bg-gradient-to-r from-white via-[#f9fcfb] to-[#eaf4f1] px-4 py-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--pc-action)]">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[var(--pc-text)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--pc-text-secondary)]">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-5 w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto [&>div]:w-full sm:[&>div]:w-auto">
        <PetHeroShowcase compact />
        {action}
      </div>
    </div>
  );
}

let modalLocks = 0;
let originalOverflow = '';
const modalHistoryTokens: string[] = [];
let suppressModalPopstate = false;
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 'sm:max-w-2xl',
  showBack = false,
  headerRight,
  suspended = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  showBack?: boolean;
  headerRight?: ReactNode;
  suspended?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const historyToken = useRef(`petshop-modal-${Math.random().toString(36).slice(2)}`);
  const historyCleanup = useRef<number | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || []);
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalHistoryTokens[modalHistoryTokens.length - 1] !== historyToken.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const token = historyToken.current;
    if (historyCleanup.current !== null) window.clearTimeout(historyCleanup.current);
    historyCleanup.current = null;
    modalHistoryTokens.push(token);
    if (window.history.state?.petshopModal !== token) window.history.pushState({ ...window.history.state, petshopModal: token }, '');
    const handleBack = () => {
      if (suppressModalPopstate) return;
      if (modalHistoryTokens[modalHistoryTokens.length - 1] === token) closeRef.current();
    };
    window.addEventListener('popstate', handleBack);
    if (modalLocks++ === 0) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handleBack);
      const tokenIndex = modalHistoryTokens.indexOf(token);
      if (tokenIndex >= 0) modalHistoryTokens.splice(tokenIndex, 1);
      if (window.history.state?.petshopModal === token) {
        historyCleanup.current = window.setTimeout(() => {
          historyCleanup.current = null;
          if (window.history.state?.petshopModal !== token) return;
          suppressModalPopstate = true;
          const reset = () => { window.clearTimeout(fallback); suppressModalPopstate = false; window.removeEventListener('popstate', reset); };
          const fallback = window.setTimeout(reset, 500);
          window.addEventListener('popstate', reset, { once: true });
          window.history.back();
        }, 0);
      }
      if (--modalLocks === 0) document.body.style.overflow = originalOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[80] grid min-w-0 place-items-end overflow-x-clip bg-slate-950/50 p-0 pt-[max(0.75rem,env(safe-area-inset-top,0px))] backdrop-blur-[2px] sm:place-items-center sm:p-4 ${suspended ? 'invisible pointer-events-none' : ''}`}
      aria-hidden={suspended}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.75rem)] sm:max-h-[92dvh] w-full min-w-0 max-w-[100vw] overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-2xl bg-white pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-2xl sm:rounded-2xl sm:pb-0 [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0 max-sm:[&_input]:text-base max-sm:[&_select]:text-base max-sm:[&_textarea]:text-base ${maxWidth}`}
      >
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--pc-border)] bg-white/95 px-4 py-3 sm:px-5 sm:py-3.5 backdrop-blur">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {showBack && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Voltar"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 cursor-pointer"
              >
                <ChevronLeft aria-hidden="true" size={20} />
              </button>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-slate-500 truncate font-normal">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100/80 text-[var(--pc-text-secondary)] transition hover:bg-[var(--pc-surface-subtle)] cursor-pointer"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, label = 'Buscar' }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string }) {
  const id = useId();
  return <div className="relative w-full"><label htmlFor={id} className="sr-only">{label}</label><Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pc-text-muted)]" /><input id={id} type="search" value={value} onChange={event => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-[var(--pc-border-strong)] bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-[var(--pc-text-muted)] focus:border-[var(--pc-action)] focus:ring-2 focus:ring-[var(--pc-action)]/15" placeholder={placeholder} /></div>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center"><Icon aria-hidden="true" size={28} className="mb-4 text-[var(--pc-border-strong)]" /><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 max-w-sm text-sm leading-6 text-[var(--pc-text-muted)]">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="animate-pulse divide-y divide-[var(--pc-border)]" role="status" aria-label="Carregando dados">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="flex h-20 items-center gap-4 px-5">
      <span className="h-10 w-10 shrink-0 rounded-lg bg-[var(--pc-surface-subtle)]" />
      <div className="min-w-0 flex-1">
        <span className="block h-3 w-2/5 rounded bg-[var(--pc-border)]" />
        <span className="mt-2 block h-2.5 w-3/5 rounded bg-[var(--pc-surface-subtle)]" />
      </div>
    </div>)}
  </div>;
}

export function CatalogTabs() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-10 items-center justify-center rounded-lg px-3.5 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
      isActive ? 'bg-[var(--pc-text)] text-white shadow-xs' : 'text-[var(--pc-text-secondary)] hover:bg-white hover:text-[var(--pc-text)]'
    }`;
  return (
    <nav aria-label="Seções do catálogo e estoque" className="mb-5 flex w-full items-center gap-1.5 overflow-x-auto no-scrollbar rounded-xl border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] p-1.5">
      <NavLink to="/petshop/servicos" className={tabClass}>Serviços</NavLink>
      <NavLink to="/petshop/produtos" className={tabClass}>Produtos</NavLink>
      <NavLink to="/petshop/edicao-massa" className={tabClass}>Edição em Massa</NavLink>
      <NavLink to="/petshop/entrada-estoque" className={tabClass}>Entrada / Lotes</NavLink>
      <NavLink to="/petshop/alertas-validade" className={tabClass}>Validades</NavLink>
      <NavLink to="/petshop/pedidos-compra" className={tabClass}>Pedidos de Compra</NavLink>
      <NavLink to="/petshop/fornecedores" className={tabClass}>Fornecedores</NavLink>
    </nav>
  );
}

export function TeamTabs() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition whitespace-nowrap shadow-2xs ${
      isActive
        ? 'bg-[#0d6e5a] text-white shadow-xs'
        : 'border border-zinc-200/90 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900'
    }`;
  return (
    <nav aria-label="Seções da equipe" className="mb-5 flex w-full items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
      <NavLink to="/petshop/equipe" end className={tabClass}>
        <Users size={16} />
        <span>Colaboradores & PINs</span>
      </NavLink>
      <NavLink to="/petshop/equipe/comissoes" end className={tabClass}>
        <Coins size={16} />
        <span>Comissões & Fechamento</span>
      </NavLink>
    </nav>
  );
}

export const inputClass = 'min-h-11 w-full rounded-lg border border-[var(--pc-border-strong)] bg-white px-3 py-2.5 text-sm text-[var(--pc-text)] outline-none transition placeholder:text-[var(--pc-text-muted)] focus:border-[var(--pc-action)] focus:ring-2 focus:ring-[var(--pc-action)]/15';
export const primaryButton = 'min-h-11 cursor-pointer rounded-lg bg-[var(--pc-action)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--pc-action-hover)] disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButton = 'min-h-11 cursor-pointer rounded-lg border border-[var(--pc-border-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--pc-text)] transition hover:bg-[var(--pc-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50';
export const labelClass = 'mb-1.5 block text-xs font-medium text-[var(--pc-text-secondary)]';
export const pageClass = 'mx-auto w-full max-w-[1600px] p-3.5 sm:p-6 lg:p-8';
