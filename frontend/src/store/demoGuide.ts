import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GuideContext = 
  | 'welcome' 
  | 'pos_empty_cart' 
  | 'pos_has_items' 
  | 'payment_modal' 
  | 'movement_modal' 
  | 'close_register_modal'
  | 'dashboard' 
  | 'inventory' 
  | 'missions_complete';

export interface GuideTip {
  id: string;
  context: GuideContext;
  message: string;
  emoji?: string;
}

/**
 * Diálogos contextuais ricos e explicativos do Capitão Gelada.
 */
export const GUIDE_DIALOGUES: GuideTip[] = [
  // ── Welcome (primeira visita) ──
  {
    id: 'welcome_1',
    context: 'welcome',
    message: 'Ahoy, marujo! 🍺 Eu sou o Capitão Gelada, e vou te guiar nessa navegação pelo PDV 7Bar! Bora conhecer tudo?',
    emoji: '👋',
  },
  {
    id: 'welcome_2',
    context: 'welcome',
    message: 'Aqui no topo 👆 você vê suas Missões do Teste — complete as 4 para dominar o sistema! Cada uma tem um botão "Passo a Passo".',
    emoji: '🎯',
  },
  {
    id: 'welcome_3',
    context: 'welcome',
    message: 'Comece pela mais divertida: faça sua primeira venda! É só clicar nos produtos no centro da tela!',
    emoji: '🛒',
  },

  // ── POS - Carrinho vazio ──
  {
    id: 'pos_empty_1',
    context: 'pos_empty_cart',
    message: 'Tá vendo a grade de produtos? Clica em qualquer bebida ou item pra jogar no carrinho de vendas!',
    emoji: '👆',
  },
  {
    id: 'pos_empty_2',
    context: 'pos_empty_cart',
    message: 'Dica de Capitão: use a barra de busca no topo pra encontrar qualquer produto pelo nome, código ou leitor de código de barras!',
    emoji: '🔍',
  },

  // ── POS - Com itens no carrinho ──
  {
    id: 'pos_items_1',
    context: 'pos_has_items',
    message: 'Boa! Já tem produtos no carrinho! Agora pressione a tecla F12 no teclado ou clique em "Finalizar Venda (F12)"! 💰',
    emoji: '✅',
  },
  {
    id: 'pos_items_2',
    context: 'pos_has_items',
    message: 'Atalho esperto: você também pode usar F10 para limpar o carrinho ou alterar a quantidade dos itens!',
    emoji: '⚡',
  },

  // ── Tela de Finalizar Pagamento (F12) ──
  {
    id: 'pay_1',
    context: 'payment_modal',
    message: 'Aqui na tela de checkout temos as formas de pagamento pré-cadastradas (Dinheiro, Pix, Cartão, Consumo Colaborador). E no Dashboard você pode criar novos métodos personalizados!',
    emoji: '💳',
  },
  {
    id: 'pay_2',
    context: 'payment_modal',
    message: 'Super Atalho: Digite 1 (Dinheiro), 2 (Pix), 3 (Crédito) ou 4 (Débito) no seu teclado para selecionar a forma na hora sem usar o mouse!',
    emoji: '⚡',
  },
  {
    id: 'pay_3',
    context: 'payment_modal',
    message: 'Você também pode informar o CPF do cliente para NFC-e ou marcar "Imprimir Cupom automaticamente". Depois é só dar Enter para concluir!',
    emoji: '🧾',
  },

  // ── Modal de Sangria / Suprimento ──
  {
    id: 'mov_1',
    context: 'movement_modal',
    message: 'Aqui você registra Sangria (retirada de dinheiro do caixa) ou Suprimento (entrada de troco). Digite o valor e o motivo para ter o controle do caixa 100% auditado!',
    emoji: '💸',
  },

  // ── Modal de Fechamento de Caixa ──
  {
    id: 'close_1',
    context: 'close_register_modal',
    message: 'No fechamento do caixa, conte o dinheiro da gaveta e informe os valores. O sistema calcula a quebra/diferença de caixa e gera o relatório impresso!',
    emoji: '🔒',
  },

  // ── Dashboard ──
  {
    id: 'dash_1',
    context: 'dashboard',
    message: 'Bem-vindo ao Dashboard de Analytics! Aqui você vê tudo: Faturamento do Dia, Semana, Mês, Ticket Médio e alerta de Contas a Pagar.',
    emoji: '📊',
  },
  {
    id: 'dash_2',
    context: 'dashboard',
    message: 'Analise o gráfico de Vendas por Hora e o Mix de Pagamentos para saber quais bebidas mais vendem e em qual horário o movimento é pico!',
    emoji: '📈',
  },

  // ── Estoque ──
  {
    id: 'inv_1',
    context: 'inventory',
    message: 'Aqui no Estoque você gerencia seu catálogo! Clique no botão verde "+ Novo Produto" no canto superior para cadastrar um novo item.',
    emoji: '📦',
  },
  {
    id: 'inv_2',
    context: 'inventory',
    message: 'Dica: Você também pode usar a Edição em Massa, Importar Notas XML de fornecedores ou auditoria de estoque em 3 passos!',
    emoji: '🏷️',
  },

  // ── All missions complete ──
  {
    id: 'complete_1',
    context: 'missions_complete',
    message: '🎉 PARABÉNS, MARUJO! Você concluiu 100% das missões do teste! Agora imagina essa agilidade rodando na sua adega... Clique em "Falar com Consultor" no topo!',
    emoji: '🏆',
  },
];

interface DemoGuideState {
  /** Modal atualmente ativo ('payment' | 'movement' | 'close_register' | null) */
  activeModal: 'payment' | 'movement' | 'close_register' | null;
  /** IDs dos tips já vistos pelo usuário */
  seenTips: string[];
  /** O guia está visível? */
  isVisible: boolean;
  /** O guia foi permanentemente fechado nesta sessão? */
  isDismissed: boolean;
  /** ID do tip atualmente exibido */
  currentTipId: string | null;

  // Actions
  setActiveModal: (modal: 'payment' | 'movement' | 'close_register' | null) => void;
  showTipForContext: (ctx: GuideContext) => void;
  advanceTip: () => void;
  dismissGuide: () => void;
  showGuide: () => void;
  markSeen: (tipId: string) => void;
  reset: () => void;
}

export const useDemoGuideStore = create<DemoGuideState>()(
  persist(
    (set, get) => ({
      activeModal: null,
      seenTips: [],
      isVisible: true,
      isDismissed: false,
      currentTipId: null,

      setActiveModal: (modal) => {
        const state = get();
        if (state.activeModal !== modal) {
          set({ activeModal: modal });
          // Auto trigger context for modal
          if (modal === 'payment') {
            get().showTipForContext('payment_modal');
          } else if (modal === 'movement') {
            get().showTipForContext('movement_modal');
          } else if (modal === 'close_register') {
            get().showTipForContext('close_register_modal');
          }
        }
      },

      showTipForContext: (ctx: GuideContext) => {
        const state = get();
        if (state.isDismissed) return;

        // Find first unseen tip for this context
        const tipsForContext = GUIDE_DIALOGUES.filter((t) => t.context === ctx);
        const unseenTip = tipsForContext.find((t) => !state.seenTips.includes(t.id));

        if (unseenTip) {
          set({ currentTipId: unseenTip.id, isVisible: true });
        } else if (tipsForContext.length > 0) {
          // All seen, show first/last tip for context
          set({ currentTipId: tipsForContext[0].id, isVisible: true });
        }
      },

      advanceTip: () => {
        const state = get();
        if (!state.currentTipId) return;

        const currentTip = GUIDE_DIALOGUES.find((t) => t.id === state.currentTipId);
        if (!currentTip) return;

        // Mark current as seen
        const newSeen = state.seenTips.includes(state.currentTipId)
          ? state.seenTips
          : [...state.seenTips, state.currentTipId];

        // Find next tip in same context
        const contextTips = GUIDE_DIALOGUES.filter((t) => t.context === currentTip.context);
        const currentIdx = contextTips.findIndex((t) => t.id === state.currentTipId);
        const nextTip = contextTips[currentIdx + 1];

        if (nextTip) {
          set({ seenTips: newSeen, currentTipId: nextTip.id });
        } else {
          // No more tips in this context, loop or hide
          set({ seenTips: newSeen, currentTipId: contextTips[0].id });
        }
      },

      dismissGuide: () => {
        set({ isDismissed: true, isVisible: false, currentTipId: null });
      },

      showGuide: () => {
        set({ isDismissed: false, isVisible: true });
      },

      markSeen: (tipId: string) => {
        const state = get();
        if (!state.seenTips.includes(tipId)) {
          set({ seenTips: [...state.seenTips, tipId] });
        }
      },

      reset: () => {
        set({
          activeModal: null,
          seenTips: [],
          isVisible: true,
          isDismissed: false,
          currentTipId: null,
        });
      },
    }),
    {
      name: '7bar_demo_guide_v2',
    }
  )
);
