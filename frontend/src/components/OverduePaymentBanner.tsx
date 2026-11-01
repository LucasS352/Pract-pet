import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, X, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const STORAGE_KEY = '7bar_overdue_last_shown';
const ONE_HOUR_MS = 60 * 60 * 1000;

export function OverduePaymentBanner() {
  const token = useAuthStore((s) => s.token);
  const [visible, setVisible] = useState(false);
  const [diasAtraso, setDiasAtraso] = useState(0);
  const [valor, setValor] = useState<number | null>(null);

  const shouldShow = useCallback((dias: number): boolean => {
    if (dias < 0) return false; // não venceu ainda
    if (dias >= 4) {
      // 4+ dias: mostra de hora em hora
      const lastShown = Number(localStorage.getItem(STORAGE_KEY) || '0');
      return Date.now() - lastShown > ONE_HOUR_MS;
    }
    // 0-3 dias: mostra 1x por sessão
    const sessionKey = `${STORAGE_KEY}_session`;
    if (sessionStorage.getItem(sessionKey)) return false;
    return true;
  }, []);

  const markShown = useCallback((dias: number) => {
    if (dias >= 4) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } else {
      sessionStorage.setItem(`${STORAGE_KEY}_session`, '1');
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const checkStatus = async () => {
      try {
        const res = await api.get('/auth/tenant-status');
        const { diasAtraso: dias, valor: val, status } = res.data;

        // Não mostra se tenant está pausado/inativo ou sem atraso
        if (status === 'paused' || status === 'inactive') return;
        if (dias < 0) return; // ainda não venceu

        if (shouldShow(dias)) {
          setDiasAtraso(dias);
          setValor(val ? Number(val) : null);
          setVisible(true);
          markShown(dias);
        }
      } catch {
        // silencioso — não quebra o PDV
      }
    };

    checkStatus();

    // Para 4+ dias: recheck a cada hora via intervalo
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/auth/tenant-status');
        const { diasAtraso: dias, status } = res.data;
        if (status === 'paused' || status === 'inactive') return;
        if (dias >= 4 && shouldShow(dias)) {
          setDiasAtraso(dias);
          setVisible(true);
          markShown(dias);
        }
      } catch {}
    }, ONE_HOUR_MS);

    return () => clearInterval(interval);
  }, [token, shouldShow, markShown]);

  if (!visible) return null;

  const isVenceHoje = diasAtraso === 0;
  const isCritico = diasAtraso >= 4;

  const bg = isCritico
    ? 'bg-red-950/95 border-red-500/40'
    : isVenceHoje
    ? 'bg-amber-950/95 border-amber-500/40'
    : 'bg-orange-950/95 border-orange-500/40';

  const iconColor = isCritico ? 'text-red-400' : isVenceHoje ? 'text-amber-400' : 'text-orange-400';
  const textColor = isCritico ? 'text-red-300' : isVenceHoje ? 'text-amber-300' : 'text-orange-300';
  const titleColor = isCritico ? 'text-red-200' : isVenceHoje ? 'text-amber-200' : 'text-orange-200';

  const title = isVenceHoje
    ? '⚠️ Sua mensalidade vence hoje'
    : isCritico
    ? `🚨 Pagamento em atraso há ${diasAtraso} dias`
    : `⏰ Mensalidade atrasada há ${diasAtraso} dia${diasAtraso > 1 ? 's' : ''}`;

  const message = isVenceHoje
    ? 'Realize o pagamento hoje para evitar interrupções no sistema.'
    : isCritico
    ? 'Seu acesso pode ser suspenso em breve. Regularize agora para continuar usando o sistema sem problemas.'
    : 'Regularize seu pagamento o quanto antes para evitar juros e a suspensão do sistema.';

  const valorFormatado = valor
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] border-b ${bg} backdrop-blur-md px-4 py-3 flex items-start gap-3 shadow-2xl animate-[slideDown_0.3s_ease]`}
      style={{ animation: 'slideDown 0.3s ease' }}
    >
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <AlertTriangle className={`${iconColor} mt-0.5 shrink-0`} size={20} />

      <div className="flex-1 min-w-0">
        <p className={`font-bold text-sm ${titleColor}`}>{title}</p>
        <p className={`text-xs mt-0.5 ${textColor}`}>
          {message}
          {valorFormatado && (
            <span className="ml-1 font-semibold">
              Valor: {valorFormatado}
            </span>
          )}
        </p>
      </div>

      {isCritico && (
        <div className={`flex items-center gap-1 text-xs ${textColor} shrink-0`}>
          <Clock size={12} />
          <span>Aviso a cada 1h</span>
        </div>
      )}

      <button
        onClick={() => setVisible(false)}
        className={`p-1 rounded-lg hover:bg-white/10 transition ${textColor} shrink-0`}
        title="Fechar"
      >
        <X size={16} />
      </button>
    </div>
  );
}
