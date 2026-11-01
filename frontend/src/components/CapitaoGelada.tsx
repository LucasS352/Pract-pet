import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { X, ChevronRight } from 'lucide-react';
import { useDemoGuideStore } from '@/store/demoGuide';
import { useDemoMissionsStore } from '@/store/demoMissions';
import { useCartStore } from '@/store/cart';

// Full body character with transparent background
const CAPITAO_FULL = '/demo-assets/capitao-gelada-full.png';

// ─── Humores ─────────────────────────────────────────────────────────────────
type Mood = 'happy' | 'excited' | 'winking' | 'celebrating' | 'thinking';

interface MoodConfig {
  bubbleBg: string;
  bubbleBorder: string;
  badgeBg: string;
  badgeLabel: string;
  emoji: string;
  glowColor: string;
}

const MOODS: Record<Mood, MoodConfig> = {
  happy: {
    bubbleBg: 'bg-[#0d121f]',
    bubbleBorder: 'border-amber-500/50',
    badgeBg: 'bg-gradient-to-r from-amber-500 to-orange-500',
    badgeLabel: 'Cap. Gelada',
    emoji: '😄',
    glowColor: 'rgba(251,191,36,0.25)',
  },
  excited: {
    bubbleBg: 'bg-[#080e1d]',
    bubbleBorder: 'border-blue-500/60',
    badgeBg: 'bg-gradient-to-r from-blue-600 to-indigo-500',
    badgeLabel: '🔥 Dica!',
    emoji: '🤩',
    glowColor: 'rgba(59,130,246,0.3)',
  },
  winking: {
    bubbleBg: 'bg-[#0e0a1a]',
    bubbleBorder: 'border-purple-500/60',
    badgeBg: 'bg-gradient-to-r from-purple-600 to-pink-600',
    badgeLabel: '😉 Segredo',
    emoji: '😉',
    glowColor: 'rgba(168,85,247,0.25)',
  },
  celebrating: {
    bubbleBg: 'bg-[#070f0d]',
    bubbleBorder: 'border-emerald-500/60',
    badgeBg: 'bg-gradient-to-r from-emerald-500 to-teal-500',
    badgeLabel: '🏆 Incrível!',
    emoji: '🎉',
    glowColor: 'rgba(16,185,129,0.3)',
  },
  thinking: {
    bubbleBg: 'bg-[#0d0d0d]',
    bubbleBorder: 'border-zinc-500/40',
    badgeBg: 'bg-gradient-to-r from-zinc-600 to-zinc-700',
    badgeLabel: '🤔 Sabia?',
    emoji: '🤔',
    glowColor: 'rgba(161,161,170,0.15)',
  },
};

// ─── Mensagens por contexto ───────────────────────────────────────────────────
interface PopupMessage {
  text: string;
  mood: Mood;
  context?: string;
}

const MESSAGES: PopupMessage[] = [
  // POS vazio
  { text: 'Clica em qualquer produto pra jogar no carrinho! É rapidinho!', mood: 'happy', context: 'pos' },
  { text: 'Usa a barra de busca no topo pra achar qualquer bebida pelo nome ou código EAN!', mood: 'winking', context: 'pos' },
  { text: 'Você sabia que pode cadastrar combos e produtos compostos? Ex: "Chopp + Petisco"!', mood: 'thinking', context: 'pos' },
  // POS com itens
  { text: 'Aperta F12 ou [*] no teclado numérico pra finalizar a venda na hora!', mood: 'excited', context: 'pos_items' },
  { text: 'No checkout você pode misturar Pix + Dinheiro na mesma venda. Top né?!', mood: 'winking', context: 'pos_items' },
  { text: 'Informe o CPF do cliente na tela de pagamento pra gerar NFC-e fiscal!', mood: 'thinking', context: 'pos_items' },
  // Dashboard
  { text: 'Aqui você acompanha o faturamento em tempo real! Que adega incrível!', mood: 'excited', context: 'dashboard' },
  { text: 'O gráfico "Vendas por Hora" mostra quando é o horário de pico da sua adega!', mood: 'thinking', context: 'dashboard' },
  { text: 'No Mix de Pagamentos você vê quanto veio de Pix vs Cartão vs Dinheiro!', mood: 'happy', context: 'dashboard' },
  // Estoque
  { text: 'Clica em "+ Novo Produto" pra cadastrar com foto, código de barras e estoque!', mood: 'happy', context: 'inventory' },
  { text: 'Você pode importar uma planilha Excel ou uma NF-e XML do seu fornecedor!', mood: 'winking', context: 'inventory' },
  // Missões completas
  { text: 'PARABÉNS! Dominou o sistema! Agora clica em "Falar com Consultor" e assina já!', mood: 'celebrating', context: 'complete' },
  // Genérico
  { text: 'O PDV 7Bar funciona OFFLINE! Vende mesmo sem internet e sincroniza depois!', mood: 'excited' },
  { text: 'Cada turno tem relatório completo: sangria, suprimento e fechamento de caixa!', mood: 'thinking' },
  { text: 'A impressão do cupom sai automática na impressora fiscal ao fechar a venda!', mood: 'happy' },
  { text: 'Todo pedido fica salvo no histórico. Filtre por data, operador ou forma de pagamento!', mood: 'thinking' },
];

// ─── Posições de popup (evitando o carrinho à direita ~460px) ────────────────
interface PopupPos {
  style: React.CSSProperties;
  bubbleAlign: 'left' | 'right' | 'center';
}

// Posições no canto inferior direito/esquerdo calibradas para não tampar os cards de produtos
const POSITIONS: PopupPos[] = [
  // Canto inferior esquerdo (afastado da borda para não tampar produtos)
  { style: { bottom: '12px', left: '16px' }, bubbleAlign: 'left' },
  // Canto inferior centro-esquerda
  { style: { bottom: '12px', left: '28%' }, bubbleAlign: 'center' },
  // Meio do grid, lado direito (respeitando o espaço do carrinho à direita)
  { style: { bottom: '24px', right: '480px' }, bubbleAlign: 'right' },
  // Canto inferior centro-direita
  { style: { bottom: '12px', left: '45%' }, bubbleAlign: 'center' },
];

// ─── Hook contexto ────────────────────────────────────────────────────────────
function useCurrentContext() {
  const path = useLocation().pathname;
  const cartCount = useCartStore(s => s.items.length);
  const s = useDemoMissionsStore.getState();
  const allDone = s.saleCompleted && s.movementCompleted && s.productCreated && s.dashboardVisited;
  if (allDone) return 'complete';
  if (path.startsWith('/dashboard/inventory')) return 'inventory';
  if (path.startsWith('/dashboard')) return 'dashboard';
  return cartCount > 0 ? 'pos_items' : 'pos';
}

// ─── Componente ───────────────────────────────────────────────────────────────
export function CapitaoGelada() {
  const ctx = useCurrentContext();
  const isDismissed = useDemoGuideStore(s => s.isDismissed);
  const showGuide   = useDemoGuideStore(s => s.showGuide);
  const dismissGuide= useDemoGuideStore(s => s.dismissGuide);

  const [visible, setVisible]         = useState(false);
  const [bubbleShow, setBubbleShow]   = useState(false);
  const [charIn, setCharIn]           = useState(false);
  const [currentMsg, setCurrentMsg]   = useState<PopupMessage>(MESSAGES[0]);
  const [currentPos, setCurrentPos]   = useState<PopupPos>(POSITIONS[0]);
  const [tilt, setTilt]               = useState(0);
  const [bounceKey, setBounceKey]     = useState(0);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevCtx   = useRef('');

  const show = useCallback((context: string) => {
    // Pick message for context
    const pool = MESSAGES.filter(m => !m.context || m.context === context);
    const msg  = pool[Math.floor(Math.random() * pool.length)];
    const pos  = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
    const deg  = (Math.random() - 0.5) * 8; // subtle tilt

    setCurrentMsg(msg);
    setCurrentPos(pos);
    setTilt(deg);
    setBounceKey(k => k + 1);
    setCharIn(false);
    setBubbleShow(false);
    setVisible(true);

    // Character slides in
    requestAnimationFrame(() => {
      setTimeout(() => {
        setCharIn(true);
        // Bubble after character
        setTimeout(() => setBubbleShow(true), 700);
      }, 30);
    });

    // Auto-hide do BALÃO após 20s. O personagem fica mais 5s e then sai
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // 1. Esconde só o balão
      setBubbleShow(false);
      // 2. Depois de mais 5s esconde o personagem
      setTimeout(() => {
        setCharIn(false);
        setTimeout(() => setVisible(false), 600);
      }, 5000);
    }, 20000);
  }, []);

  // Esconde APENAS o balão (personagem continua na tela)
  const hideBubble = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setBubbleShow(false);
    // Personagem some sozinho depois de 8s
    hideTimer.current = setTimeout(() => {
      setCharIn(false);
      setTimeout(() => setVisible(false), 600);
    }, 8000);
  }, []);

  // Esconde tudo (usado só pelo "Ocultar guia")
  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setBubbleShow(false);
    setTimeout(() => { setCharIn(false); setTimeout(() => setVisible(false), 500); }, 300);
  }, []);

  const nextMsg = useCallback(() => {
    setBubbleShow(false);
    setTimeout(() => {
      const pool = MESSAGES.filter(m => !m.context || m.context === ctx);
      const next = pool[Math.floor(Math.random() * pool.length)];
      setCurrentMsg(next);
      setBubbleShow(true);
    }, 200);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hide, 14000);
  }, [ctx, hide]);

  // Aparecer na mudança de contexto
  useEffect(() => {
    if (import.meta.env.VITE_APP_MODE !== 'demo') return;
    if (isDismissed) return;
    if (prevCtx.current === ctx) return;
    const isFirstRun = !prevCtx.current;
    prevCtx.current = ctx;
    
    // Na primeira carga aguarda 6s para a tela estabilizar, nas trocas subsequentes aguarda 3s
    const delay = isFirstRun ? 6000 : 3000;
    const t = setTimeout(() => show(ctx), delay);
    return () => clearTimeout(t);
  }, [ctx, isDismissed, show]);

  // Primeiro aparecimento (backup safeguard 6.5s)
  useEffect(() => {
    if (import.meta.env.VITE_APP_MODE !== 'demo') return;
    if (isDismissed) return;
    const t = setTimeout(() => {
      if (!prevCtx.current) show(ctx);
    }, 6500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reaparecer periodicamente (~45s)
  useEffect(() => {
    if (import.meta.env.VITE_APP_MODE !== 'demo') return;
    if (isDismissed) return;
    const iv = setInterval(() => { if (!visible) show(ctx); }, 45000);
    return () => clearInterval(iv);
  }, [ctx, isDismissed, visible, show]);

  if (import.meta.env.VITE_APP_MODE !== 'demo') return null;

  const mood = MOODS[currentMsg.mood];

  // ── Avatar minimalista quando dismissado ──
  if (isDismissed) {
    return (
      <button
        onClick={() => { showGuide(); show(ctx); }}
        title="Chamar o Capitão Gelada"
        className="fixed bottom-4 right-4 z-[9999] cursor-pointer group"
      >
        <img
          src={CAPITAO_FULL}
          alt="Cap. Gelada"
          className="w-20 h-auto object-contain drop-shadow-2xl group-hover:scale-110 transition-transform"
          style={{ mixBlendMode: 'multiply' }}
        />
        <span className="absolute top-0 right-0 w-4 h-4 bg-amber-400 rounded-full border-2 border-zinc-950 animate-ping" />
      </button>
    );
  }

  if (!visible) return null;

  return (
    <div
      className="fixed z-[9999] pointer-events-auto"
      style={{
        ...currentPos.style,
        transform: `rotate(${tilt}deg)`,
      }}
    >
      <div className="relative flex flex-col items-center">

        {/* ── Balão de fala ── */}
        {bubbleShow && (
          <div
            className={`absolute bottom-[calc(100%-32px)] ${
              currentPos.bubbleAlign === 'right'  ? 'right-0'  :
              currentPos.bubbleAlign === 'center' ? 'left-1/2 -translate-x-1/2' :
              'left-0'
            } w-[260px] sm:w-[290px] pointer-events-auto`}
            style={{
              animation: 'pop-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards',
              transform: currentPos.bubbleAlign === 'center'
                ? `translateX(-50%) rotate(${-tilt}deg)`
                : `rotate(${-tilt}deg)`,
            }}
          >
            <div className={`${mood.bubbleBg} border ${mood.bubbleBorder} rounded-2xl rounded-bl-sm shadow-[0_12px_40px_rgba(0,0,0,0.8)] p-3 backdrop-blur-sm`}>
              {/* Badge topo */}
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white ${mood.badgeBg}`}>
                  {mood.badgeLabel}
                </span>
                <div className="flex gap-0.5">
                  <button onClick={nextMsg} className="p-1 text-zinc-500 hover:text-zinc-200 transition cursor-pointer rounded" title="Próxima">
                    <ChevronRight size={13} />
                  </button>
                  <button onClick={hideBubble} className="p-1 text-zinc-500 hover:text-white transition cursor-pointer rounded" title="Fechar balão">
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Texto */}
              <p className="text-xs text-zinc-100 leading-relaxed font-medium">
                <span className="mr-1">{mood.emoji}</span>
                {currentMsg.text}
              </p>

              {/* Rodapé */}
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-zinc-800/60">
                <button
                  onClick={() => { dismissGuide(); hide(); }}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition cursor-pointer"
                >
                  Ocultar guia
                </button>
                <button
                  onClick={nextMsg}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${mood.badgeBg} text-white cursor-pointer hover:scale-105 transition-transform`}
                >
                  Próxima →
                </button>
              </div>
            </div>

            {/* Triângulo apontando pro personagem */}
            <div
              className={`absolute -bottom-1.5 w-3 h-3 bg-[#0d121f] border-r border-b ${mood.bubbleBorder} rotate-45 ${
                currentPos.bubbleAlign === 'right' ? 'right-10' : 'left-10'
              }`}
            />
          </div>
        )}

        {/* ── Personagem inteiro ── */}
        <button
          key={bounceKey}
          onClick={() => setBubbleShow(b => !b)}
          className="cursor-pointer relative"
          title="Capitão Gelada"
          style={{
            transition: 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease',
            transform: charIn ? 'translateY(0) scale(1)' : 'translateY(60px) scale(0.7)',
            opacity: charIn ? 1 : 0,
          }}
        >
          {/* Glow no chão */}
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full blur-2xl"
            style={{ background: mood.glowColor }}
          />

          {/* Imagem do personagem — SEM crop circular */}
          <img
            src={CAPITAO_FULL}
            alt="Capitão Gelada"
            draggable={false}
            className="relative w-[160px] sm:w-[190px] h-auto object-contain select-none"
            style={{
              filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.9)) drop-shadow(0 0 20px rgba(251,191,36,0.2))',
            }}
          />
        </button>

      </div>
    </div>
  );
}
