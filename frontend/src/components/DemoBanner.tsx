import { useState, useEffect } from 'react';
import { Clock, X, ChevronDown, ChevronUp, CheckCircle2, Circle, MessageCircle, Trophy, ArrowUpRight, Sparkles, HelpCircle, RotateCcw, ListOrdered } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useDemoMissionsStore, DEMO_MISSIONS_LIST } from '@/store/demoMissions';
import { useNavigate } from 'react-router-dom';

const WHATSAPP_NUMBER = '5514997603870';

export function DemoBanner() {
  const [minimized, setMinimized] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedInstructions, setSelectedInstructions] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();

  const missionsState = useDemoMissionsStore();
  const { completedCount, totalCount, percent, isAllCompleted } = missionsState.getProgress();

  // Countdown timer
  useEffect(() => {
    if (!token || import.meta.env.VITE_APP_MODE !== 'demo') return;

    const calculateTimeLeft = () => {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const exp = payload.exp * 1000;
        const now = Date.now();
        const diff = exp - now;

        if (diff <= 0) return 'Expirado';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}h ${minutes}m`;
      } catch (e) {
        return '';
      }
    };

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 60000);

    return () => clearInterval(interval);
  }, [token]);

  if (import.meta.env.VITE_APP_MODE !== 'demo') return null;

  // ── Floating Minimized Pill ──
  if (minimized) {
    return (
      <div 
        onClick={() => setMinimized(false)}
        className="fixed top-4 right-4 z-50 cursor-pointer bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white px-4 py-2 rounded-full shadow-2xl border border-white/20 flex items-center gap-2.5 hover:scale-105 transition-all animate-bounce"
      >
        <span className="text-lg">🎯</span>
        <span className="font-bold text-xs tracking-wider uppercase">MISSÕES ({completedCount}/{totalCount})</span>
        <ChevronDown size={16} />
      </div>
    );
  }

  const handleMissionAction = (id: string) => {
    setDrawerOpen(false);
    if (id === 'saleCompleted') {
      navigate('/');
    } else if (id === 'movementCompleted') {
      navigate('/');
    } else if (id === 'productCreated') {
      navigate('/dashboard/inventory');
    } else if (id === 'dashboardVisited') {
      navigate('/dashboard');
    }
  };

  return (
    <>
      {/* ── Top Bar Container ── */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#090d16]/95 backdrop-blur-xl border-b border-zinc-800/80 shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
        
        {/* Main Bar */}
        <div className="h-13 flex items-center justify-between px-3 sm:px-6 gap-3">
          
          {/* Left: Badge + Timer */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full text-xs font-black tracking-wider flex items-center gap-1.5 border border-blue-500/30">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              DEMO 24H
            </div>
            {timeLeft && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono font-medium bg-zinc-900/80 text-zinc-300 px-2.5 py-1 rounded-full border border-zinc-800">
                <Clock size={12} className="text-amber-400" />
                {timeLeft}
              </div>
            )}
          </div>

          {/* Center: Mission Progress Bar & Toggle */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="flex-1 max-w-xl bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 hover:border-blue-500/40 rounded-xl px-3 py-1.5 transition-all flex items-center justify-between gap-3 group cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Trophy size={16} className={isAllCompleted ? 'text-amber-400 animate-bounce' : 'text-blue-400'} />
              <span className="text-xs font-bold text-zinc-200 truncate">
                {isAllCompleted ? '🎉 Todas as Missões Concluídas!' : `🎯 Missões do Teste: ${completedCount} de ${totalCount} Concluídas`}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2 w-28 bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${
                    isAllCompleted 
                      ? 'bg-gradient-to-r from-emerald-400 to-teal-400' 
                      : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-[11px] font-mono font-bold text-blue-400">{percent}%</span>
              {drawerOpen ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400 group-hover:translate-y-0.5 transition-transform" />}
            </div>
          </button>

          {/* Right: CTA & Close */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a 
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Olá! Estou testando o PDV demo e gostaria de tirar dúvidas sobre os planos.')}`}
              target="_blank" 
              rel="noreferrer"
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5 border border-emerald-400/30 cursor-pointer"
            >
              <MessageCircle size={14} />
              <span className="hidden md:inline">Falar com Consultor</span>
            </a>
            <button 
              onClick={() => setMinimized(true)}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Minimizar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Expandable Missions Drawer ── */}
        {drawerOpen && (
          <div className="border-t border-zinc-800/80 bg-[#07090e]/98 p-4 sm:p-6 animate-in slide-in-from-top-2 duration-200">
            <div className="max-w-5xl mx-auto">
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-400" />
                    Missões do Teste Demo (Instruções Passo a Passo)
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Complete as 4 missões abaixo. As missões se reiniciam a cada novo teste de lead.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => missionsState.resetMissions()}
                    className="text-[11px] font-semibold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    title="Reiniciar progresso das missões"
                  >
                    <RotateCcw size={12} />
                    Resetar Missões
                  </button>
                  {isAllCompleted && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                      <Trophy size={14} />
                      100% Concluído
                    </div>
                  )}
                </div>
              </div>

              {/* Missions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {DEMO_MISSIONS_LIST.map((m) => {
                  const isDone = missionsState[m.id];
                  const showDetails = selectedInstructions === m.id;

                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                        isDone 
                          ? 'bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xl">{m.icon}</span>
                          {isDone ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 size={12} />
                              Concluída
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full">
                              <Circle size={12} />
                              Pendente
                            </span>
                          )}
                        </div>

                        <h4 className={`text-xs font-bold leading-snug ${isDone ? 'text-emerald-300' : 'text-zinc-200'}`}>
                          {m.title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                          {m.shortDesc}
                        </p>

                        {/* Step-by-step Toggleable Details */}
                        {showDetails && (
                          <div className="mt-3 p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-1.5 text-[11px] text-zinc-300 animate-in fade-in duration-150">
                            <span className="font-bold text-blue-400 block mb-1 flex items-center gap-1">
                              <ListOrdered size={12} /> Como fazer:
                            </span>
                            {m.steps.map((step, idx) => (
                              <p key={idx} className="leading-relaxed">
                                {step}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center gap-2">
                        <button
                          onClick={() => setSelectedInstructions(showDetails ? null : m.id)}
                          className="flex-1 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 text-[11px] font-semibold py-1.5 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <HelpCircle size={12} />
                          {showDetails ? 'Ocultar' : 'Passo a Passo'}
                        </button>

                        {!isDone && (
                          <button
                            onClick={() => handleMissionAction(m.id)}
                            className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:text-blue-300 font-semibold text-[11px] px-2.5 py-1.5 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            Ir
                            <ArrowUpRight size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="h-13" />
    </>
  );
}
