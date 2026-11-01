import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Phone, ArrowRight, Loader2, Zap, ShieldCheck, Clock,
  BarChart3, Package, Receipt, CreditCard, Wifi, WifiOff,
  ChevronDown, Star, TrendingUp, Users, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useDemoMissionsStore } from '@/store/demoMissions';
import { useDemoGuideStore } from '@/store/demoGuide';

// ─── Mockup de screenshots do sistema ─────────────────────────────────────────
const FEATURES = [
  {
    icon: BarChart3,
    title: 'Dashboard em Tempo Real',
    desc: 'Acompanhe vendas, faturamento e mix de pagamentos ao vivo.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    icon: Package,
    title: 'Estoque Inteligente',
    desc: 'Controle FIFO, alertas de reposição e importação de NF-e.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Receipt,
    title: 'NFC-e Automática',
    desc: 'Emissão fiscal integrada com a SEFAZ, sem complicação.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: WifiOff,
    title: 'Funciona Offline',
    desc: 'Venda mesmo sem internet. Sincroniza quando reconectar.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
];

const SOCIAL_PROOF_COUNT = 147; // leads ativos

export function DemoRegisterPage() {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  // Auto-login se vier com ?token=...&user=... na URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    const userParam = params.get('user');
    const operatorParam = params.get('operator');
    const registerParam = params.get('register');

    if (tokenParam && userParam) {
      try {
        const parsedUser = JSON.parse(decodeURIComponent(userParam));
        login(tokenParam, parsedUser);

        if (operatorParam) {
          try {
            const parsedOp = JSON.parse(decodeURIComponent(operatorParam));
            localStorage.setItem('currentOperator', JSON.stringify(parsedOp));
          } catch (e) { /* ignora */ }
        }
        if (registerParam) {
          try {
            const parsedReg = JSON.parse(decodeURIComponent(registerParam));
            const opId = parsedReg.operatorId || 'demo-op-1';
            localStorage.setItem(`pdvpro_cached_register_${opId}`, JSON.stringify(parsedReg));
          } catch (e) { /* ignora */ }
        }

        useDemoMissionsStore.getState().resetMissions();
        useDemoGuideStore.getState().reset();
        toast.success(`Bem-vindo à demonstração, ${parsedUser.name}!`);
        navigate('/', { replace: true });
      } catch (e) {
        console.error('Erro ao processar token de demonstração', e);
      }
    }
  }, [login, navigate]);

  const formatWhatsapp = (val: string) => {
    const raw = val.replace(/\D/g, '');
    let formatted = raw;
    if (raw.length > 0) {
      formatted = `(${raw.slice(0, 2)}`;
    }
    if (raw.length > 2) {
      formatted += `) ${raw.slice(2, 7)}`;
    }
    if (raw.length > 7) {
      formatted += `-${raw.slice(7, 11)}`;
    }
    return formatted;
  };

  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWhatsapp(formatWhatsapp(e.target.value));
  };

  const scrollToForm = () => {
    setShowForm(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus no input de nome
      const nameInput = document.getElementById('name');
      if (nameInput) nameInput.focus();
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = whatsapp.replace(/\D/g, '');
    
    if (name.trim().length < 2) {
      toast.error('Informe seu nome para continuar.');
      return;
    }
    if (cleanPhone.length < 10) {
      toast.error('Informe um WhatsApp válido com DDD.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/demo/register', { 
        name: name.trim(), 
        whatsapp: cleanPhone 
      });
      
      const { access_token, user, operator, cashRegister } = response.data;

      login(access_token, user);

      if (operator) {
        localStorage.setItem('currentOperator', JSON.stringify(operator));
      }

      if (cashRegister && operator) {
        localStorage.setItem(`pdvpro_cached_register_${operator.id}`, JSON.stringify(cashRegister));
      }

      useDemoMissionsStore.getState().resetMissions();
      useDemoGuideStore.getState().reset();

      toast.success('Acesso liberado! Entrando no sistema...');
      navigate('/', { replace: true });
    } catch (error: any) {
      toast.error('Erro ao conectar com o ambiente demo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-white font-sans relative overflow-x-hidden">
      {/* ─── Background Effects ─────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-blue-600/10 blur-[160px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-emerald-600/8 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      {/* ─── HERO Section ───────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-16">
        
        {/* Social proof micro */}
        <div className="flex items-center gap-2 mb-6 animate-[fadeIn_0.8s_ease]">
          <div className="flex -space-x-2">
            {[...'🍺🍷🥃'].map((emoji, i) => (
              <span
                key={i}
                className="w-7 h-7 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-xs"
              >
                {emoji}
              </span>
            ))}
          </div>
          <span className="text-xs text-zinc-400">
            <span className="text-emerald-400 font-bold">{SOCIAL_PROOF_COUNT}+</span> adegas já experimentaram
          </span>
        </div>

        {/* Hero heading */}
        <h1 className="text-center text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.1] max-w-3xl animate-[fadeIn_1s_ease]">
          O PDV que sua{' '}
          <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-emerald-400 bg-clip-text text-transparent">
            adega merece
          </span>
        </h1>

        <p className="text-zinc-400 text-center text-base sm:text-lg max-w-xl mt-5 leading-relaxed animate-[fadeIn_1.2s_ease]">
          Controle completo do estoque, vendas, fiscal e dashboard — tudo em um sistema bonito, rápido e que funciona até offline.
        </p>

        {/* ─── CTA Principal ────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col items-center gap-3 animate-[fadeIn_1.4s_ease]">
          <button
            onClick={scrollToForm}
            className="group relative bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-bold py-4 px-10 rounded-2xl flex items-center gap-3 shadow-[0_0_40px_rgba(59,130,246,0.3)] hover:shadow-[0_0_60px_rgba(59,130,246,0.5)] transition-all text-lg cursor-pointer"
          >
            <Zap size={20} className="text-yellow-300" />
            Testar agora — é grátis
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <p className="text-zinc-500 text-xs flex items-center gap-2">
            <CheckCircle2 size={12} className="text-emerald-500" />
            Acesso instantâneo • Sem instalar nada • Sem cartão
          </p>
        </div>

        {/* ─── Preview Visual do Sistema ────────────────────────────────── */}
        <div className="mt-14 w-full max-w-4xl animate-[fadeIn_1.6s_ease]">
          {/* Mockup bar */}
          <div className="bg-zinc-900/80 backdrop-blur rounded-t-2xl border border-zinc-800/60 px-4 py-2.5 flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <span className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-[10px] text-zinc-500 ml-2 font-mono">7bar.com.br/pdv</span>
          </div>
          {/* Feature cards como "preview" */}
          <div className="bg-[#0a0d13]/90 backdrop-blur rounded-b-2xl border border-t-0 border-zinc-800/60 p-6 sm:p-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {FEATURES.map((feat, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/40 hover:border-zinc-700/60 transition-all group"
                >
                  <div className={`w-10 h-10 rounded-lg ${feat.bg} flex items-center justify-center mb-3`}>
                    <feat.icon size={20} className={feat.color} />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">{feat.title}</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-center gap-8 mt-6 pt-6 border-t border-zinc-800/40">
              <div className="text-center">
                <p className="text-2xl font-black text-blue-400">40+</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Produtos cadastrados</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-emerald-400">R$ 51k</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Em estoque</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-amber-400">30 dias</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">De histórico</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-purple-400">100%</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Funcional</p>
              </div>
            </div>
          </div>
        </div>

        {/* Seta de scroll convidativa */}
        <button
          onClick={scrollToForm}
          className="mt-8 text-zinc-600 hover:text-zinc-400 transition-colors animate-bounce cursor-pointer"
        >
          <ChevronDown size={28} />
        </button>
      </div>

      {/* ─── SEÇÃO DO FORMULÁRIO ────────────────────────────────────────── */}
      <div
        ref={formRef}
        className={`relative z-10 flex flex-col items-center justify-center px-4 py-20 transition-all duration-700 ${
          showForm ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none h-0 overflow-hidden'
        }`}
      >
        {/* Glow behind form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[140px] pointer-events-none" />

        <div className="w-full max-w-[460px] relative">
          {/* Ribbon */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
            <span className="bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg shadow-emerald-500/30">
              ⚡ Acesso em 10 segundos
            </span>
          </div>

          {/* Card */}
          <div className="p-8 pt-10 rounded-3xl bg-[#0b0e14]/95 backdrop-blur-xl border border-zinc-800/80 shadow-[0_0_80px_rgba(0,0,0,0.9)]">
            
            {/* Header com contexto claro */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                Pronto pra ver o sistema funcionando?
              </h2>
              <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                Informe seu nome e WhatsApp para entrar no PDV agora.
                <br />
                <span className="text-emerald-400 font-semibold">
                  Você será redirecionado instantaneamente.
                </span>
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 ml-0.5">
                  <User size={14} className="text-blue-400" />
                  Seu nome
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#121620] border border-zinc-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="Ex: João da Adega"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="whatsapp" className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 ml-0.5">
                  <Phone size={14} className="text-blue-400" />
                  WhatsApp
                </label>
                <input
                  id="whatsapp"
                  type="tel"
                  required
                  value={whatsapp}
                  onChange={handleWhatsappChange}
                  maxLength={15}
                  className="w-full bg-[#121620] border border-zinc-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all text-base mt-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer relative overflow-hidden group"
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    <span>Preparando seu acesso...</span>
                  </>
                ) : (
                  <>
                    Entrar no Sistema Agora
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            {/* Trust badges */}
            <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-5 border-t border-zinc-800/60 mt-5 font-medium">
              <span className="flex items-center gap-1.5">
                <Zap size={13} className="text-emerald-400" />
                Acesso imediato
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-400" />
                Sem compromisso
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-emerald-400" />
                Leva 10 segundos
              </span>
            </div>

            {/* O que você vai encontrar */}
            <div className="mt-5 pt-4 border-t border-zinc-800/40">
              <p className="text-[11px] text-zinc-500 font-medium mb-2.5">O que você vai ver lá dentro:</p>
              <div className="space-y-1.5">
                {[
                  'Frente de caixa completa com atalhos de teclado',
                  'Dashboard com 30 dias de vendas reais simuladas',
                  'Estoque com 40+ produtos de adega cadastrados',
                  'Cadastro, edição e controle fiscal integrado',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── FORMULÁRIO INLINE (sempre visível embaixo do hero se não clicou no CTA) ── */}
      {!showForm && (
        <div className="relative z-10 flex flex-col items-center justify-center px-4 pb-20">
          {/* Compact inline form */}
          <div className="w-full max-w-[460px] p-6 rounded-2xl bg-[#0b0e14]/80 backdrop-blur-xl border border-zinc-800/60">
            <p className="text-center text-sm text-zinc-400 mb-4">
              <span className="text-white font-semibold">Preencha e entre agora</span> — sem instalar, sem pagar, sem enrolação.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 bg-[#121620] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-all"
                placeholder="Seu nome"
              />
              <input
                type="tel"
                required
                value={whatsapp}
                onChange={handleWhatsappChange}
                maxLength={15}
                className="flex-1 bg-[#121620] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-all font-mono"
                placeholder="(00) 00000-0000"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all whitespace-nowrap text-sm cursor-pointer disabled:opacity-70"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <><ArrowRight size={16} /> Entrar</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="relative z-10 text-center pb-8 text-[11px] text-zinc-600">
        © {new Date().getFullYear()} 7Bar PDV — Todos os direitos reservados.
      </footer>
    </div>
  );
}
