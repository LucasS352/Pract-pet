import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronRight, Zap } from 'lucide-react';
import { useDemoGuideStore } from '@/store/demoGuide';
import { useDemoMissionsStore } from '@/store/demoMissions';

const CAPITAO_FULL = '/demo-assets/capitao-gelada-full.jpg';

/** Partículas de névoa de gelo renderizadas em Canvas */
function FrostCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  type Particle = {
    x: number; y: number;
    vx: number; vy: number;
    radius: number;
    alpha: number;
    alphaDecay: number;
    blur: number;
  };

  const spawnParticles = useCallback((canvas: HTMLCanvasElement) => {
    const count = 60;
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const side = Math.random() > 0.5; // left or right edge
      newParticles.push({
        x: side ? Math.random() * canvas.width * 0.3 : canvas.width * 0.7 + Math.random() * canvas.width * 0.3,
        y: canvas.height * 0.4 + Math.random() * canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(Math.random() * 1.8 + 0.4),
        radius: Math.random() * 40 + 20,
        alpha: Math.random() * 0.6 + 0.3,
        alphaDecay: Math.random() * 0.006 + 0.003,
        blur: Math.random() * 20 + 10,
      });
    }
    particlesRef.current = newParticles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    if (active) {
      spawnParticles(canvas);
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter(p => p.alpha > 0.01);

      for (const p of particlesRef.current) {
        ctx.save();
        ctx.filter = `blur(${p.blur}px)`;
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        gradient.addColorStop(0, `rgba(180, 220, 255, ${p.alpha})`);
        gradient.addColorStop(0.5, `rgba(140, 200, 255, ${p.alpha * 0.6})`);
        gradient.addColorStop(1, `rgba(100, 180, 255, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.alphaDecay;
        p.blur *= 0.995;
        p.vx *= 0.99;
        p.vy *= 0.99;
      }

      // Continuous spawn while active
      if (active && particlesRef.current.length < 30) {
        spawnParticles(canvas);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [active, spawnParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
    />
  );
}

/** Efeito de brilho de gelo nas bordas do container */
function FrostEdgeGlow({ active }: { active: boolean }) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none z-10 transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Left edge */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-blue-300/20 to-transparent animate-pulse" />
      {/* Right edge */}
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-blue-300/20 to-transparent animate-pulse" />
      {/* Bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-cyan-300/15 to-transparent" />
      {/* Top ice shine */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent animate-pulse" />
    </div>
  );
}

type DialogueLine = {
  text: string;
  cta?: string;
  ctaAction?: () => void;
};

const DEMO_DIALOGUES: DialogueLine[] = [
  {
    text: 'Olá! Vim comandar a resenha de vendas! Sou o Capitão Gelada e vou te guiar na demo. 🍺',
    cta: 'Toque para começar',
  },
  {
    text: 'Aqui no centro estão os produtos da adega! Clique em qualquer um para adicionar ao carrinho.',
    cta: 'Próxima dica ›',
  },
  {
    text: 'Pressione F12 ou clique em "Cobrar" para abrir o checkout. Aceitamos Pix, Dinheiro, Crédito e Débito! 💳',
    cta: 'Entendi! ›',
  },
  {
    text: 'No topo tem suas Missões de Demo — complete as 4 para dominar o sistema! 🎯',
    cta: 'Ver Missões',
  },
];

interface CapitaoCartProps {
  /** Chamado quando o usuário fecha o personagem */
  onDismiss?: () => void;
}

export function CapitaoCart({ onDismiss }: CapitaoCartProps) {
  const [phase, setPhase] = useState<'hidden' | 'entering' | 'idle' | 'exiting'>('hidden');
  const [dialogueIdx, setDialogueIdx] = useState(0);
  const [dialogueVisible, setDialogueVisible] = useState(false);
  const [hasShownOnce, setHasShownOnce] = useState(false);

  const isDismissed = useDemoGuideStore(s => s.isDismissed);

  const saleCompleted = useDemoMissionsStore(s => s.saleCompleted);
  const movementCompleted = useDemoMissionsStore(s => s.movementCompleted);
  const productCreated = useDemoMissionsStore(s => s.productCreated);
  const dashboardVisited = useDemoMissionsStore(s => s.dashboardVisited);
  const allDone = saleCompleted && movementCompleted && productCreated && dashboardVisited;

  // Show entry once on first load
  useEffect(() => {
    if (import.meta.env.VITE_APP_MODE !== 'demo') return;
    if (isDismissed || hasShownOnce || allDone) return;

    const t = setTimeout(() => {
      setHasShownOnce(true);
      setPhase('entering');

      // After entrance animation, switch to idle + show dialogue
      setTimeout(() => {
        setPhase('idle');
        setTimeout(() => setDialogueVisible(true), 400);
      }, 1200);
    }, 2500); // Wait 2.5s after page load

    return () => clearTimeout(t);
  }, [isDismissed, hasShownOnce, allDone]);

  const handleNextDialogue = () => {
    if (dialogueIdx < DEMO_DIALOGUES.length - 1) {
      setDialogueVisible(false);
      setTimeout(() => {
        setDialogueIdx(i => i + 1);
        setDialogueVisible(true);
      }, 200);
    } else {
      handleDismiss();
    }
  };

  const handleDismiss = useCallback(() => {
    setDialogueVisible(false);
    setPhase('exiting');
    setTimeout(() => {
      setPhase('hidden');
      onDismiss?.();
    }, 800);
  }, [onDismiss]);

  if (import.meta.env.VITE_APP_MODE !== 'demo') return null;
  if (phase === 'hidden') return null;

  const currentDialogue = DEMO_DIALOGUES[dialogueIdx];
  const isEntering = phase === 'entering';
  const isIdle = phase === 'idle';
  const isExiting = phase === 'exiting';

  return (
    <>
      {/* ── Backdrop overlay (dark vignette) ── */}
      <div
        className={`fixed inset-0 z-[200] transition-all duration-700 pointer-events-none ${
          isIdle ? 'bg-black/50' : 'bg-transparent'
        }`}
        style={{
          /* Keep right cart panel visible */
          clipPath: 'inset(0 0 0 0)',
        }}
      />

      {/* ── Full-screen overlay that dims the product grid but not the right cart ── */}
      {isIdle && (
        <div
          className="fixed inset-y-0 left-0 z-[200] bg-black/55 pointer-events-auto"
          style={{ right: '450px' }} // leaves the cart width clear
          onClick={handleDismiss}
        />
      )}

      {/* ── Frost edge glow on cart panel ── */}
      <div className="fixed inset-y-0 right-0 z-[201] pointer-events-none" style={{ width: '450px' }}>
        <FrostEdgeGlow active={isEntering || isIdle} />
        <FrostCanvas active={isEntering} />
      </div>

      {/* ── Character container ── */}
      <div
        className="fixed z-[202] pointer-events-none"
        style={{
          // Positioned at the center-right, stepping out of the cart panel
          bottom: '100px',
          right: '80px',
          width: '340px',
          height: '500px',
        }}
      >
        {/* Character image with entrance/idle/exit transforms */}
        <div
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[280px] select-none transition-all pointer-events-auto cursor-pointer ${
            isEntering
              ? 'translate-y-0 opacity-100 scale-105'
              : isIdle
              ? 'translate-y-0 opacity-100 scale-100'
              : isExiting
              ? 'translate-y-[120%] opacity-0 scale-90'
              : 'translate-y-[120%] opacity-0'
          }`}
          style={{
            transitionDuration: isEntering ? '1000ms' : isExiting ? '700ms' : '500ms',
            transitionTimingFunction: isEntering
              ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'ease-in',
            filter: isIdle ? 'drop-shadow(0 -20px 40px rgba(100,180,255,0.4)) drop-shadow(0 0 30px rgba(59,130,246,0.3))' : 'none',
          }}
          onClick={handleNextDialogue}
        >
          {/* Idle breathing animation wrapper */}
          <div
            className={isIdle ? 'animate-[breathe_3s_ease-in-out_infinite]' : ''}
            style={isIdle ? {} : {}}
          >
            <img
              src={CAPITAO_FULL}
              alt="Capitão Gelada"
              className="w-full h-auto object-contain"
              draggable={false}
            />
          </div>

          {/* Ice glow beneath feet */}
          {isIdle && (
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-48 h-8 rounded-full bg-blue-400/25 blur-xl animate-pulse" />
          )}
        </div>

        {/* ── Dialogue Bubble ── */}
        {isIdle && dialogueVisible && (
          <div
            className="absolute bottom-[340px] left-1/2 -translate-x-1/2 w-[290px] animate-in fade-in slide-in-from-bottom-4 duration-400 pointer-events-auto"
            style={{ zIndex: 10 }}
          >
            <div className="relative bg-white/95 backdrop-blur-sm text-zinc-900 rounded-2xl rounded-bl-sm shadow-[0_8px_40px_rgba(0,0,0,0.5)] p-4 border border-white/80">
              {/* Close */}
              <button
                onClick={e => { e.stopPropagation(); handleDismiss(); }}
                className="absolute top-2 right-2 p-1 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>

              <p className="text-sm text-zinc-800 leading-relaxed font-medium pr-4">
                {currentDialogue.text}
              </p>

              {currentDialogue.cta && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (currentDialogue.ctaAction) currentDialogue.ctaAction();
                    else handleNextDialogue();
                  }}
                  className="mt-3 w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
                >
                  {currentDialogue.cta === 'Toque para começar' && <Zap size={12} />}
                  {currentDialogue.cta}
                  {currentDialogue.cta !== 'Toque para começar' && <ChevronRight size={12} />}
                </button>
              )}

              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 mt-3">
                {DEMO_DIALOGUES.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === dialogueIdx ? 'w-5 bg-blue-600' : 'w-1.5 bg-zinc-300'
                    }`}
                  />
                ))}
              </div>

              {/* Triangle pointing to character */}
              <div className="absolute -bottom-2 left-10 w-4 h-4 bg-white rotate-45 border-r border-b border-white/80" />
            </div>
          </div>
        )}
      </div>

      {/* ── "INICIAR DEMONSTRAÇÃO" big CTA (only on first dialogue) ── */}
      {isIdle && dialogueIdx === 0 && dialogueVisible && (
        <div
          className="fixed z-[203] bottom-[90px] left-1/2 -translate-x-[60%] pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-500"
        >
          <button
            onClick={handleNextDialogue}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-lg px-10 py-4 rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.5)] border border-emerald-400/30 flex items-center gap-3 cursor-pointer transition-all hover:scale-105 active:scale-95"
          >
            <Zap size={22} className="animate-pulse" />
            INICIAR DEMONSTRAÇÃO
          </button>
        </div>
      )}
    </>
  );
}
