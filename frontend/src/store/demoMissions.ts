import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';

export interface DemoMission {
  id: 'saleCompleted' | 'movementCompleted' | 'productCreated' | 'dashboardVisited';
  title: string;
  shortDesc: string;
  icon: string;
  steps: string[];
}

export const DEMO_MISSIONS_LIST: DemoMission[] = [
  {
    id: 'saleCompleted',
    title: 'Faça sua 1ª Venda',
    shortDesc: 'Adicione produtos ao carrinho e conclua a venda no PDV',
    icon: '🛒',
    steps: [
      '1. Na tela principal do PDV, clique sobre 1 ou mais produtos para adicioná-los ao carrinho.',
      '2. No painel à direita, confira o valor total e clique no botão azul "Finalizar Venda (F12)".',
      '3. Escolha uma forma de pagamento (ex: Dinheiro ou Pix) e clique em "Finalizar Venda".',
    ],
  },
  {
    id: 'movementCompleted',
    title: 'Lançar Sangria ou Suprimento',
    shortDesc: 'Registre uma retirada ou entrada de troco no caixa',
    icon: '💸',
    steps: [
      '1. No topo da tela do PDV, clique no botão "↕️ Sangria / Reposição".',
      '2. Escolha entre "Sangria (Saída)" ou "Suprimento (Entrada)".',
      '3. Digite um valor (ex: R$ 50,00), informe o motivo (ex: Retirada de sangria) e confirme.',
    ],
  },
  {
    id: 'productCreated',
    title: 'Cadastrar um Novo Produto',
    shortDesc: 'Adicione um produto com preço e estoque no sistema',
    icon: '➕',
    steps: [
      '1. Clique no botão "📊 Dashboard" no topo da tela.',
      '2. No menu lateral à esquerda, acesse "Estoque" e clique no botão verde "+ Novo Produto".',
      '3. Preencha o nome do produto, preço de venda e estoque inicial e clique em Salvar.',
    ],
  },
  {
    id: 'dashboardVisited',
    title: 'Explorar o Dashboard de Analytics',
    shortDesc: 'Veja gráficos de vendas por hora, mix de pagamentos e histórico',
    icon: '📊',
    steps: [
      '1. Clique no botão "📊 Dashboard" no topo da tela do PDV.',
      '2. Explore os indicadores de Faturamento (Hoje, Semana, Mês e Ticket Médio).',
      '3. Analise o gráfico de Vendas por Hora, Mix de Pagamentos e o Histórico de Vendas.',
    ],
  },
];

interface DemoMissionsState {
  saleCompleted: boolean;
  movementCompleted: boolean;
  productCreated: boolean;
  dashboardVisited: boolean;
  completeMission: (id: 'saleCompleted' | 'movementCompleted' | 'productCreated' | 'dashboardVisited') => void;
  resetMissions: () => void;
  getProgress: () => { completedCount: number; totalCount: number; percent: number; isAllCompleted: boolean };
}

export const useDemoMissionsStore = create<DemoMissionsState>()(
  persist(
    (set, get) => ({
      saleCompleted: false,
      movementCompleted: false,
      productCreated: false,
      dashboardVisited: false,

      resetMissions: () => {
        set({
          saleCompleted: false,
          movementCompleted: false,
          productCreated: false,
          dashboardVisited: false,
        });
      },

      completeMission: (id) => {
        if (import.meta.env.VITE_APP_MODE !== 'demo') return;

        const currentState = get();
        if (currentState[id]) return; // Já concluída

        set({ [id]: true });

        const mission = DEMO_MISSIONS_LIST.find((m) => m.id === id);
        if (mission) {
          toast.success(`🏆 Missão Concluída: ${mission.title}!`, {
            description: 'Excelente! Você concluiu essa etapa da demonstração.',
            duration: 5000,
          });
        }

        const newState = get();
        const count = [
          newState.saleCompleted,
          newState.movementCompleted,
          newState.productCreated,
          newState.dashboardVisited,
        ].filter(Boolean).length;

        if (count === 4) {
          setTimeout(() => {
            toast.success('🎉 PARABÉNS! VOCÊ COMPLETOU 100% DAS MISSÕES!', {
              description: 'Você conheceu todos os recursos principais do PDV 7Bar.',
              duration: 10000,
            });
          }, 600);
        }
      },

      getProgress: () => {
        const state = get();
        const completed = [
          state.saleCompleted,
          state.movementCompleted,
          state.productCreated,
          state.dashboardVisited,
        ].filter(Boolean).length;
        const total = 4;
        return {
          completedCount: completed,
          totalCount: total,
          percent: Math.round((completed / total) * 100),
          isAllCompleted: completed === total,
        };
      },
    }),
    {
      name: '7bar_demo_missions_v2',
    }
  )
);
