import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  Image as ImageIcon,
  Info,
  Layers,
  MessageSquare,
  PawPrint,
  Pencil,
  Plus,
  PowerOff,
  QrCode,
  RotateCcw,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type {
  PetshopNotificationJob,
  PetshopNotificationRule,
  WhatsappSessionStatus,
} from './types';
import { dateTime } from './types';
import {
  EmptyState,
  inputClass,
  labelClass,
  ListSkeleton,
  Modal,
  pageClass,
  PageHeader,
  primaryButton,
  SearchField,
  secondaryButton,
} from './ui';

type WhatsappTab = 'connection' | 'automations' | 'history';

const TRIGGER_META: Record<
  string,
  {
    label: string;
    triggerBadge: string;
    description: string;
    icon: typeof Bell;
  }
> = {
  APPOINTMENT_CONFIRMED: {
    label: 'Confirmação de Agendamento',
    triggerBadge: 'Disparo: agendamento criado',
    description: 'Confirma o agendamento assim que ele é realizado.',
    icon: CalendarCheck,
  },
  BEFORE_APPOINTMENT: {
    label: 'Lembrete de Agendamento',
    triggerBadge: 'Disparo: antecedência do atendimento',
    description: 'Lembra o tutor do agendamento com antecedência.',
    icon: Bell,
  },
  PET_READY: {
    label: 'Pet Pronto',
    triggerBadge: 'Disparo: etapa Pronto',
    description: 'Informa que o pet está pronto e orienta retirada ou entrega conforme o Táxi Dog.',
    icon: PawPrint,
  },
  STAGE_PHOTO: {
    label: 'Foto da Etapa',
    triggerBadge: 'Disparo: colaborador envia foto',
    description: 'Envia ao tutor a foto e o recado da etapa pelo WhatsApp conectado.',
    icon: ImageIcon,
  },
  TAXI_DOG_PICKUP_DEPARTURE: {
    label: 'Táxi Dog Saiu para Buscar',
    triggerBadge: 'Disparo: saída da coleta',
    description: 'Avisa que o motorista saiu para buscar o pet.',
    icon: Send,
  },
  TAXI_DOG_DROPOFF_DEPARTURE: {
    label: 'Táxi Dog Saiu para Entregar',
    triggerBadge: 'Disparo: saída da entrega',
    description: 'Avisa que o motorista saiu para entregar o pet.',
    icon: Send,
  },
  PACKAGE_LAST_SESSION: {
    label: 'Última Sessão do Pacote',
    triggerBadge: 'Disparo: última sessão do pacote',
    description: 'Alerta quando o pacote do pet atinge a última sessão.',
    icon: Layers,
  },
  PACKAGE_EXPIRING: {
    label: 'Pacote Próximo do Vencimento',
    triggerBadge: 'Disparo: 3 dias antes de expirar',
    description: 'Lembra o tutor da validade do pacote e saldo restante.',
    icon: Clock,
  },
  INACTIVE_CUSTOMER: {
    label: 'Lembrete de Retorno (Cliente Ausente)',
    triggerBadge: 'Disparo: dias sem agendar',
    description: 'Envia lembrete automático para clientes que estão há X dias sem agendar.',
    icon: Sparkles,
  },
};

const TEMPLATE_VARIABLES = [
  { tag: '{nome_tutor}', label: 'Nome do Tutor', sample: 'Lucas' },
  { tag: '{nome_pet}', label: 'Nome do Pet', sample: 'Thor' },
  { tag: '{servico}', label: 'Serviços', sample: 'Banho e Tosa' },
  { tag: '{data}', label: 'Data', sample: '15/05' },
  { tag: '{hora}', label: 'Horário', sample: '14:00' },
  { tag: '{nome_loja}', label: 'Nome da Loja', sample: 'PetSh' },
  { tag: '{endereco}', label: 'Endereço', sample: 'Av. Principal, 120' },
  { tag: '{link_portal}', label: 'Link do Portal', sample: 'https://practpet.app/p/abc123' },
  { tag: '{saldo_pacote}', label: 'Saldo do Pacote', sample: '1' },
  { tag: '{validade_pacote}', label: 'Validade do Pacote', sample: '30/11' },
  { tag: '{dias_sem_vir}', label: 'Dias sem Agendar', sample: '15' },
];

function getRuleTriggerBadge(rule: PetshopNotificationRule): string {
  if (rule.triggerType === 'INACTIVE_CUSTOMER') {
    const days = rule.triggerMinutesBefore || 15;
    return `Disparo: ${days} dias sem agendar`;
  }
  if (rule.triggerType === 'BEFORE_APPOINTMENT') {
    const mins = rule.triggerMinutesBefore || 120;
    if (mins >= 1440 && mins % 1440 === 0) {
      const days = mins / 1440;
      return `Disparo: ${days === 1 ? '24 horas' : `${days} dias`} antes do atendimento`;
    }
    if (mins >= 60 && mins % 60 === 0) {
      return `Disparo: ${mins / 60} horas antes do atendimento`;
    }
    return `Disparo: ${mins} minutos antes do atendimento`;
  }
  return TRIGGER_META[rule.triggerType]?.triggerBadge || 'Disparo: evento automático';
}

function getRuleDescription(rule: PetshopNotificationRule): string {
  if (rule.triggerType === 'INACTIVE_CUSTOMER') {
    const days = rule.triggerMinutesBefore || 15;
    return `Envia mensagem automática quando o cliente completa ${days} dias sem movimentação ou novo agendamento.`;
  }
  if (rule.triggerType === 'BEFORE_APPOINTMENT') {
    const mins = rule.triggerMinutesBefore || 120;
    if (mins >= 1440) return 'Lembra o tutor do agendamento no dia anterior.';
    if (mins >= 120) return `Lembra o tutor do agendamento com ${mins / 60} horas de antecedência.`;
    return `Lembra o tutor do agendamento com ${mins} minutos de antecedência.`;
  }
  return TRIGGER_META[rule.triggerType]?.description || 'Mensagem automática do Pet Shop.';
}

export default function PetshopWhatsappPage() {
  const [activeTab, setActiveTab] = useState<WhatsappTab>('automations');
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState<WhatsappSessionStatus | null>(null);
  const [rules, setRules] = useState<PetshopNotificationRule[]>([]);
  const [jobs, setJobs] = useState<PetshopNotificationJob[]>([]);

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Master-Detail State para Automações
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleTypeFilter, setRuleTypeFilter] = useState('all');
  const [ruleStatusFilter, setRuleStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');

  // Formulário do Detalhe Selecionado
  const [editorName, setEditorName] = useState('');
  const [editorActive, setEditorActive] = useState(true);
  const [editorAntecedenceValue, setEditorAntecedenceValue] = useState(24);
  const [editorAntecedenceUnit, setEditorAntecedenceUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [editorMessage, setEditorMessage] = useState('');
  const [editorIncludePhoto, setEditorIncludePhoto] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Envio de Teste Modal
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Modal para Criar Nova Automação
  const [newRuleModalOpen, setNewRuleModalOpen] = useState(false);
  const [newRuleForm, setNewRuleForm] = useState({
    name: '',
    triggerType: 'BEFORE_APPOINTMENT' as PetshopNotificationRule['triggerType'],
    triggerMinutesBefore: 120,
    messageTemplate:
      'Olá, {nome_tutor}! Lembramos que amanhã ({data}) às {hora} temos o horário de {nome_pet} ({servico}) aqui na {nome_loja}. Esperamos vocês!',
    includePhoto: false,
    active: true,
  });

  // Filtros do Histórico
  const [jobStatusFilter, setJobStatusFilter] = useState('all');
  const [jobSearch, setJobSearch] = useState('');
  const [retryingJobId, setRetryingJobId] = useState('');

  const loadSessionStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/petshop/whatsapp/status');
      setSession(data);
    } catch {
      // silencioso no polling
    }
  }, []);

  const loadAll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [statusRes, rulesRes, jobsRes] = await Promise.allSettled([
        api.get('/petshop/whatsapp/status'),
        api.get('/petshop/whatsapp/rules'),
        api.get('/petshop/whatsapp/jobs'),
      ]);

      if (statusRes.status === 'fulfilled') {
        setSession(statusRes.value.data);
      }
      if (rulesRes.status === 'fulfilled') {
        const loadedRules = Array.isArray(rulesRes.value.data) ? rulesRes.value.data : [];
        setRules(loadedRules);
        if (loadedRules.length > 0 && !selectedRuleId) {
          // Seleciona preferencialmente o lembrete 24h ou o primeiro
          const pref = loadedRules.find(r => r.triggerMinutesBefore === 1440) || loadedRules[0];
          setSelectedRuleId(pref.id);
        }
      }
      if (jobsRes.status === 'fulfilled') {
        setJobs(Array.isArray(jobsRes.value.data) ? jobsRes.value.data : []);
      }
    } catch {
      toast.error('Erro ao carregar dados do WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, [selectedRuleId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Polling dinâmico do status da sessão
  useEffect(() => {
    const intervalMs =
      session?.status === 'CONNECTING' ? 2500 : session?.status === 'QR_READY' ? 3500 : 10000;
    const timer = setInterval(() => {
      loadSessionStatus();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [session?.status, loadSessionStatus]);

  // Sincroniza formulário do editor sempre que seleciona uma regra
  const selectedRule = useMemo(() => {
    return rules.find(r => r.id === selectedRuleId) || null;
  }, [rules, selectedRuleId]);

  useEffect(() => {
    if (!selectedRule) return;
    setEditorName(selectedRule.name);
    setEditorActive(selectedRule.active !== false);
    setEditorMessage(selectedRule.messageTemplate || '');
    setEditorIncludePhoto(Boolean(selectedRule.includePhoto));

    if (selectedRule.triggerType === 'INACTIVE_CUSTOMER') {
      setEditorAntecedenceValue(selectedRule.triggerMinutesBefore || 15);
      setEditorAntecedenceUnit('days');
    } else {
      const mins = selectedRule.triggerMinutesBefore || 120;
      if (mins >= 1440 && mins % 1440 === 0) {
        setEditorAntecedenceValue(mins / 1440);
        setEditorAntecedenceUnit('days');
      } else if (mins >= 60 && mins % 60 === 0) {
        setEditorAntecedenceValue(mins / 60);
        setEditorAntecedenceUnit('hours');
      } else {
        setEditorAntecedenceValue(mins);
        setEditorAntecedenceUnit('minutes');
      }
    }
  }, [selectedRule]);

  // Inserção de variáveis dinâmicas no textarea
  const insertVariableIntoEditor = (tag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setEditorMessage(prev => `${prev} ${tag}`);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const current = editorMessage;
    const next = current.slice(0, start) + tag + current.slice(end);
    setEditorMessage(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 10);
  };

  // Pré-visualização da mensagem com variáveis reais simuladas
  const livePreviewMessage = useMemo(() => {
    let preview = editorMessage || '';
    for (const v of TEMPLATE_VARIABLES) {
      preview = preview.split(v.tag).join(v.sample);
    }
    return preview;
  }, [editorMessage]);

  // Salvar alterações na regra selecionada
  const handleSaveSelectedRule = async () => {
    if (!selectedRule) return;
    if (!editorName.trim()) {
      toast.error('Informe o nome da automação.');
      return;
    }

    setSavingRule(true);
    try {
      let finalMinutes = selectedRule.triggerMinutesBefore;
      if (selectedRule.triggerType === 'BEFORE_APPOINTMENT') {
        const val = Math.max(1, Number(editorAntecedenceValue) || 1);
        if (editorAntecedenceUnit === 'days') finalMinutes = val * 1440;
        else if (editorAntecedenceUnit === 'hours') finalMinutes = val * 60;
        else finalMinutes = val;
      } else if (selectedRule.triggerType === 'INACTIVE_CUSTOMER') {
        finalMinutes = Math.max(1, Math.min(365, Number(editorAntecedenceValue) || 15));
      }

      const payload = {
        name: editorName.trim(),
        active: editorActive,
        triggerMinutesBefore: finalMinutes,
        messageTemplate: editorMessage,
        includePhoto: editorIncludePhoto,
      };

      const { data } = await api.patch(`/petshop/whatsapp/rules/${selectedRule.id}`, payload);
      setRules(curr => curr.map(r => (r.id === selectedRule.id ? data : r)));
      toast.success('Automação atualizada com sucesso!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar alterações da automação.');
    } finally {
      setSavingRule(false);
    }
  };

  // Enviar teste da regra selecionada
  const handleSendTestFromEditor = async (e: FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error('Informe o número de WhatsApp para teste.');
      return;
    }

    setSendingTest(true);
    try {
      await api.post('/petshop/whatsapp/test', {
        phone: testPhone,
        message: livePreviewMessage,
      });
      toast.success('Mensagem de teste enviada com sucesso!');
      setTestModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Falha ao enviar mensagem de teste.');
    } finally {
      setSendingTest(false);
    }
  };

  // Conexão e Desconexão
  const handleStartConnection = async (forceReset = false) => {
    setConnecting(true);
    try {
      const { data } = await api.post('/petshop/whatsapp/connect', { forceReset });
      setSession(data);
      if (data.status === 'CONNECTED') {
        toast.success('WhatsApp conectado com sucesso!');
      } else if (data.status === 'QR_READY' && data.qrCodeDataUrl) {
        toast.info('QR Code pronto! Aponte o WhatsApp para escanear.');
      } else {
        toast.info('Iniciando sessão do WhatsApp...');
        setTimeout(() => loadSessionStatus(), 2000);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao conectar WhatsApp.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data } = await api.post('/petshop/whatsapp/disconnect');
      setSession(data);
      toast.success('Sessão desconectada.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao desconectar.');
    } finally {
      setDisconnecting(false);
    }
  };

  // Criação de Nova Automação
  const handleCreateNewRule = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/petshop/whatsapp/rules', newRuleForm);
      setRules(curr => [...curr, data]);
      setSelectedRuleId(data.id);
      setNewRuleModalOpen(false);
      toast.success('Nova automação criada com sucesso!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao criar automação.');
    }
  };

  // Filtro das réguas na coluna esquerda
  const filteredRules = useMemo(() => {
    return rules.filter(r => {
      if (ruleStatusFilter === 'active' && !r.active) return false;
      if (ruleStatusFilter === 'inactive' && r.active) return false;
      if (ruleTypeFilter !== 'all' && r.triggerType !== ruleTypeFilter) return false;
      if (ruleSearch.trim()) {
        const q = ruleSearch.toLowerCase();
        const m1 = r.name.toLowerCase().includes(q);
        const m2 = r.messageTemplate.toLowerCase().includes(q);
        if (!m1 && !m2) return false;
      }
      return true;
    });
  }, [rules, ruleSearch, ruleTypeFilter, ruleStatusFilter]);

  // Filtro do Histórico
  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      if (jobStatusFilter !== 'all' && j.status !== jobStatusFilter) return false;
      if (jobSearch.trim()) {
        const q = jobSearch.toLowerCase();
        const m1 = j.recipientName?.toLowerCase().includes(q);
        const m2 = j.recipientPhone?.toLowerCase().includes(q);
        const m3 = j.petName?.toLowerCase().includes(q);
        const m4 = j.messageContent?.toLowerCase().includes(q);
        if (!m1 && !m2 && !m3 && !m4) return false;
      }
      return true;
    });
  }, [jobs, jobStatusFilter, jobSearch]);

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const { data } = await api.post(`/petshop/whatsapp/jobs/${jobId}/retry`);
      setJobs(curr => curr.map(j => (j.id === jobId ? { ...j, ...data } : j)));
      toast.success('Mensagem reprocessada!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao reprocessar mensagem.');
    } finally {
      setRetryingJobId('');
    }
  };

  return (
    <div className={pageClass}>
      {/* CABEÇALHO PADRÃO PRACT PET */}
      <PageHeader
        eyebrow="Comunicação com Tutores"
        title="Central WhatsApp & Réguas de Automação"
        description="Configure mensagens automáticas para confirmar agendamentos, enviar lembretes, avisar sobre pacotes e manter seus tutores sempre informados."
        action={
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                session?.status === 'CONNECTED'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : session?.status === 'QR_READY' || session?.status === 'CONNECTING'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-slate-100 text-slate-700'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  session?.status === 'CONNECTED'
                    ? 'bg-emerald-500 animate-pulse'
                    : session?.status === 'QR_READY' || session?.status === 'CONNECTING'
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-slate-400'
                }`}
              />
              {session?.status === 'CONNECTED'
                ? `Conectado (${session.connectedPhone || '5514997603870'})`
                : session?.status === 'QR_READY'
                  ? 'Aguardando leitura do QR Code'
                  : session?.status === 'CONNECTING'
                    ? 'Iniciando conexão...'
                    : 'WhatsApp Desconectado'}
            </span>
          </div>
        }
      />

      {/* BARRA DE NAVEGAÇÃO ENTRE ABAS + BOTÃO NOVA AUTOMAÇÃO */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'connection'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <QrCode size={16} />
            Conexão & QR Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('automations')}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'automations'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Bell size={16} />
            Automações
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              loadAll(false);
            }}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MessageSquare size={16} />
            Histórico de Mensagens
          </button>
        </div>

        {activeTab === 'automations' && (
          <button
            type="button"
            onClick={() => setNewRuleModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-teal-800 transition shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            Nova automação
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <ListSkeleton rows={4} />
        </div>
      ) : activeTab === 'automations' ? (
        /* =====================================================================
           ABA 2: AUTOMAÇÕES (LAYOUT MASTER-DETAIL IDÊNTICO AO MODELO)
           ===================================================================== */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* COLUNA ESQUERDA: LISTA DE RÉGUAS DE AUTOMAÇÃO (MASTER) */}
          <div className="lg:col-span-5 xl:col-span-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Réguas de automação
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Gerencie as mensagens automáticas enviadas aos tutores.
              </p>
            </div>

            {/* BARRA DE FILTROS */}
            <div className="space-y-2">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={ruleSearch}
                  onChange={e => setRuleSearch(e.target.value)}
                  placeholder="Buscar regra..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs outline-none focus:border-teal-600 focus:bg-white focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={ruleTypeFilter}
                  onChange={e => setRuleTypeFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-teal-600 focus:bg-white"
                >
                  <option value="all">Todas as regras</option>
                  <option value="APPOINTMENT_CONFIRMED">Confirmação</option>
                  <option value="BEFORE_APPOINTMENT">Lembretes</option>
                  <option value="PET_READY">Pet Pronto</option>
                  <option value="PACKAGE_LAST_SESSION">Pacotes</option>
                  <option value="INACTIVE_CUSTOMER">Retorno / Inativos</option>
                </select>

                <select
                  value={ruleStatusFilter}
                  onChange={e => setRuleStatusFilter(e.target.value as any)}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-teal-600 focus:bg-white"
                >
                  <option value="active">Ativas</option>
                  <option value="all">Todas</option>
                  <option value="inactive">Pausadas</option>
                </select>
              </div>
            </div>

            {/* LISTA DE CARDS INTERATIVOS */}
            <div className="space-y-2.5 pt-1">
              {filteredRules.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Nenhuma regra encontrada com estes filtros.
                </div>
              ) : (
                filteredRules.map(rule => {
                  const meta = TRIGGER_META[rule.triggerType] || TRIGGER_META.BEFORE_APPOINTMENT;
                  const Icon = meta.icon;
                  const isSelected = rule.id === selectedRuleId;
                  const triggerBadge = getRuleTriggerBadge(rule);
                  const description = getRuleDescription(rule);

                  return (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => setSelectedRuleId(rule.id)}
                      className={`w-full text-left rounded-2xl p-4 transition border flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-500/30'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                            isSelected
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <Icon size={18} />
                        </div>

                        <div className="min-w-0">
                          <strong className="block text-xs font-bold text-slate-900 leading-snug truncate">
                            {rule.name}
                          </strong>
                          <span className="block text-[11px] font-semibold text-emerald-700 mt-0.5 truncate">
                            {triggerBadge}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 leading-tight">
                            {description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            rule.active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              rule.active ? 'bg-emerald-600' : 'bg-slate-400'
                            }`}
                          />
                          {rule.active ? 'Ativa' : 'Pausada'}
                        </span>
                        <ChevronRight
                          size={16}
                          className={isSelected ? 'text-emerald-700' : 'text-slate-400'}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUNA DIREITA: EDITOR & WHATSAPP PREVIEW (DETAIL) */}
          <div className="lg:col-span-7 xl:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
            {selectedRule ? (
              <>
                {/* TOPO DO DETALHE: ÍCONE, TÍTULO, SUBTÍTULO E AÇÕES */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-3.5">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <Bell size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900">
                          {selectedRule.name}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            editorActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              editorActive ? 'bg-emerald-600' : 'bg-slate-400'
                            }`}
                          />
                          {editorActive ? 'Ativa' : 'Pausada'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {getRuleDescription(selectedRule)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setTestModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
                    >
                      <Send size={14} />
                      Enviar teste
                    </button>
                    <button
                      type="button"
                      disabled={savingRule}
                      onClick={handleSaveSelectedRule}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-teal-800 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                    >
                      <Check size={16} />
                      {savingRule ? 'Salvando...' : 'Salvar alterações'}
                    </button>
                  </div>
                </div>

                {/* CORPO DO EDITOR: FORMULÁRIO (ESQUERDA) + MOCKUP WHATSAPP (DIREITA) */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                  {/* SUB-COLUNA DO FORMULÁRIO (7 colunas) */}
                  <div className="xl:col-span-7 space-y-5">
                    {/* 1. DETALHES DA REGRA */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Info size={14} className="text-teal-700" />
                        <span>Detalhes da regra</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-8">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Nome da automação *
                          </label>
                          <input
                            type="text"
                            value={editorName}
                            onChange={e => setEditorName(e.target.value)}
                            className={inputClass}
                            placeholder="Nome da regra"
                          />
                        </div>

                        <div className="sm:col-span-4 flex items-center justify-between sm:justify-start gap-3 pb-2">
                          <span className="text-[11px] font-semibold text-slate-600">Status</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={editorActive}
                            onClick={() => setEditorActive(v => !v)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              editorActive ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                editorActive ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span className="text-xs font-bold text-slate-700">
                            {editorActive ? 'Ativa' : 'Pausada'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 2. QUANDO ENVIAR */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Clock size={14} className="text-teal-700" />
                        <span>Quando enviar</span>
                      </div>

                      {selectedRule.triggerType === 'BEFORE_APPOINTMENT' ? (
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Antecedência do envio
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={999}
                              value={editorAntecedenceValue}
                              onChange={e => setEditorAntecedenceValue(Number(e.target.value))}
                              className="w-16 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-center text-xs font-bold text-slate-900 outline-none focus:border-teal-600"
                            />
                            <select
                              value={editorAntecedenceUnit}
                              onChange={e => setEditorAntecedenceUnit(e.target.value as any)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-600"
                            >
                              <option value="minutes">minutos antes</option>
                              <option value="hours">horas antes</option>
                              <option value="days">dias antes</option>
                            </select>
                            <span className="text-xs text-slate-500">
                              do horário do atendimento.
                            </span>
                          </div>
                        </div>
                      ) : selectedRule.triggerType === 'INACTIVE_CUSTOMER' ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2.5">
                          <label className="text-[11px] font-bold text-emerald-900 block">
                            Dias sem agendar / sem movimentação
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={editorAntecedenceValue}
                              onChange={e => setEditorAntecedenceValue(Number(e.target.value))}
                              className="w-20 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-center text-xs font-bold text-slate-900 outline-none focus:border-teal-600"
                            />
                            <span className="text-xs font-semibold text-emerald-900">
                              dias sem marcar nenhum atendimento.
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[10px] font-semibold text-slate-500 mr-1">Sugestões rápidas:</span>
                            {[15, 20, 30, 45].map(d => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setEditorAntecedenceValue(d)}
                                className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                                  editorAntecedenceValue === d
                                    ? 'bg-teal-700 text-white'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {d} dias
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Você pode criar mais de uma régua em "+ Nova automação" (ex: uma de 15 dias e outra de 30 dias).
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                          {selectedRule.triggerType === 'APPOINTMENT_CONFIRMED' && (
                            <p>Disparado instantaneamente assim que o agendamento é criado na recepção ou portal.</p>
                          )}
                          {selectedRule.triggerType === 'PET_READY' && (
                            <div className="space-y-2">
                              <p>Disparado quando a equipe marca o status do atendimento como <strong>Pronto p/ Buscar</strong>.</p>
                              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800 pt-1">
                                <input
                                  type="checkbox"
                                  checked={editorIncludePhoto}
                                  onChange={e => setEditorIncludePhoto(e.target.checked)}
                                  className="h-4 w-4 rounded accent-teal-700"
                                />
                                <span>Anexar automaticamente a foto da etapa quando houver</span>
                              </label>
                            </div>
                          )}
                          {selectedRule.triggerType === 'PACKAGE_LAST_SESSION' && (
                            <p>Disparado automaticamente quando a penúltima sessão do pacote é concluída, estimulando a renovação.</p>
                          )}
                          {selectedRule.triggerType === 'PACKAGE_EXPIRING' && (
                            <p>Disparado quando faltam 3 dias para a validade do pacote expirar e o cliente ainda possui saldo disponível.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3. MENSAGEM */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <MessageSquare size={14} className="text-teal-700" />
                        <span>Mensagem</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Personalize o texto que será enviado ao tutor via WhatsApp.
                      </p>

                      <textarea
                        ref={textareaRef}
                        rows={4}
                        value={editorMessage}
                        onChange={e => setEditorMessage(e.target.value)}
                        className={`${inputClass} leading-relaxed`}
                        placeholder="Digite o texto da mensagem..."
                      />
                    </div>

                    {/* 4. VARIÁVEIS DISPONÍVEIS */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Tag size={14} className="text-teal-700" />
                        <span>Variáveis disponíveis</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {TEMPLATE_VARIABLES.map(v => (
                          <button
                            key={v.tag}
                            type="button"
                            onClick={() => insertVariableIntoEditor(v.tag)}
                            className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs text-emerald-800 transition hover:bg-emerald-100 hover:border-emerald-300 cursor-pointer"
                            title={`Clique para inserir: ${v.label}`}
                          >
                            {v.tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* SUB-COLUNA DO WHATSAPP PREVIEW (5 colunas) */}
                  <div className="xl:col-span-5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Smartphone size={15} className="text-teal-700" />
                      <span>Pré-visualização da mensagem</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Veja como a mensagem será exibida no WhatsApp.
                    </p>

                    {/* MOCKUP WHATSAPP WALLPAPER BEIGE */}
                    <div
                      className="relative overflow-hidden rounded-2xl border border-amber-200/50 p-4 shadow-inner min-h-[340px] flex flex-col justify-end"
                      style={{
                        backgroundColor: '#efeae2',
                        backgroundImage: `radial-gradient(#d3c9be 1px, transparent 1px)`,
                        backgroundSize: '16px 16px',
                      }}
                    >
                      {/* BALÃO WHATSAPP SENT MESSAGE */}
                      <div className="relative z-10 max-w-[94%] rounded-2xl rounded-tl-sm bg-[#e7ffdb] p-3.5 shadow-xs text-xs sm:text-[13px] leading-relaxed text-slate-800 self-start">
                        <div className="whitespace-pre-wrap">{livePreviewMessage}</div>
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500 font-medium">
                          <span>10:00</span>
                          <CheckCheck size={14} className="text-[#34b7f1]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-20 text-center text-xs text-slate-400">
                Selecione uma automação na lista ao lado para editar.
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'connection' ? (
        /* =====================================================================
           ABA 1: CONEXÃO E AUTENTICAÇÃO POR QR CODE
           ===================================================================== */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs lg:col-span-7">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Sessão do WhatsApp da Loja
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Conexão isolada e exclusiva desta empresa. Suas credenciais são protegidas e reconectadas automaticamente.
                </p>
              </div>
              {session?.status === 'CONNECTED' ? (
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Wifi size={20} />
                </span>
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500">
                  <WifiOff size={20} />
                </span>
              )}
            </div>

            {session?.status === 'CONNECTED' ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
                      <Check size={18} />
                    </span>
                    <div>
                      <strong className="text-sm font-bold text-emerald-950 block">
                        WhatsApp Conectado e Operando
                      </strong>
                      <span className="text-xs text-emerald-800">
                        Número ativo: +{session.connectedPhone || '5514997603870'} · Notificações automáticas ativas
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={disconnecting}
                    onClick={handleDisconnect}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                  >
                    <PowerOff size={15} />
                    {disconnecting ? 'Desconectando...' : 'Desconectar WhatsApp'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center justify-center py-6 text-center">
                {session?.status === 'QR_READY' && session.qrCodeDataUrl ? (
                  <div className="space-y-4">
                    <div className="mx-auto inline-block rounded-2xl border-4 border-emerald-600 bg-white p-3 shadow-lg">
                      <img
                        src={session.qrCodeDataUrl}
                        alt="QR Code WhatsApp"
                        className="h-56 w-56 object-contain"
                      />
                    </div>
                    <div>
                      <strong className="text-sm font-bold text-slate-900 block">
                        Aponte a câmera do seu WhatsApp
                      </strong>
                      <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                        Abra o WhatsApp no celular &gt; Menu &gt; Aparelhos conectados &gt; Conectar aparelho.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-md">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-200">
                      <QrCode size={30} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Conecte o WhatsApp da sua unidade
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Clique no botão abaixo para gerar o QR Code de autenticação e parear o número de atendimento do Pet Shop.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => handleStartConnection(false)}
                      className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-teal-800 transition shadow-xs cursor-pointer"
                    >
                      <QrCode size={16} />
                      {connecting ? 'Gerando QR Code...' : 'Gerar QR Code de Conexão'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Teste de Envio Imediato */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs lg:col-span-5">
            <h2 className="text-lg font-bold text-slate-900">
              Teste de Envio Imediato
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Valide se a sessão conectada está entregando mensagens normalmente.
            </p>

            <form onSubmit={handleSendTestFromEditor} className="mt-5 space-y-4">
              <div>
                <label className={labelClass}>Telefone / WhatsApp com DDD *</label>
                <input
                  required
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="Ex: 14997603870"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Mensagem de Teste *</label>
                <textarea
                  rows={4}
                  required
                  value={livePreviewMessage}
                  onChange={e => setEditorMessage(e.target.value)}
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={sendingTest || session?.status !== 'CONNECTED'}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-teal-800 transition disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Send size={15} />
                {sendingTest
                  ? 'Enviando...'
                  : session?.status === 'CONNECTED'
                    ? 'Disparar Mensagem de Teste'
                    : 'Conecte o WhatsApp para Testar'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* =====================================================================
           ABA 3: HISTÓRICO E FILA DE MENSAGENS
           ===================================================================== */
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-md">
              <SearchField
                value={jobSearch}
                onChange={setJobSearch}
                placeholder="Buscar por tutor, pet, telefone ou conteúdo..."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'SENT', label: 'Enviados' },
                { key: 'PENDING', label: 'Na Fila (Pendentes)' },
                { key: 'FAILED', label: 'Falhas' },
                { key: 'CANCELLED_STALE', label: 'Descartados' },
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setJobStatusFilter(f.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    jobStatusFilter === f.key
                      ? 'bg-teal-700 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white">
              <EmptyState
                icon={MessageSquare}
                title="Nenhum disparo registrado neste filtro"
                description="Assim que os agendamentos e eventos acionarem as réguas configuradas, todo o histórico e status de entrega aparecerão aqui."
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Data / Horário</th>
                      <th className="px-4 py-3">Tutor & Pet</th>
                      <th className="px-4 py-3">Gatilho / Regra</th>
                      <th className="px-4 py-3">Mensagem</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredJobs.map(job => (
                      <tr key={job.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          <div>{dateTime(job.sentAt || job.createdAt)}</div>
                          <div className="text-[10px] text-slate-400">
                            Tentativas: {job.attempts}/{job.maxAttempts}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {job.recipientName}
                          </div>
                          <div className="text-slate-500">
                            +{job.recipientPhone} {job.petName ? `· Pet: ${job.petName}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800">
                            {job.rule?.name || job.triggerType}
                          </span>
                        </td>
                        <td className="max-w-md px-4 py-3">
                          <p className="line-clamp-2 text-slate-600">
                            {job.messageContent}
                          </p>
                          {job.lastError && (
                            <p className="mt-1 text-[11px] font-medium text-rose-600">
                              Detalhe: {job.lastError}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              job.status === 'SENT'
                                ? 'bg-emerald-50 text-emerald-700'
                                : job.status === 'PENDING'
                                  ? 'bg-sky-50 text-sky-700'
                                  : job.status === 'FAILED'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {job.status === 'SENT'
                              ? 'Enviado'
                              : job.status === 'PENDING'
                                ? 'Pendente na Fila'
                                : job.status === 'FAILED'
                                  ? 'Falha no Envio'
                                  : 'Descartado'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {job.status !== 'SENT' && (
                            <button
                              type="button"
                              disabled={retryingJobId === job.id}
                              onClick={() => handleRetryJob(job.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <RotateCcw size={12} />
                              {retryingJobId === job.id ? 'Reenviando...' : 'Tentar Agora'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ENVIAR TESTE RÁPIDO */}
      {testModalOpen && (
        <Modal
          title="Disparar Mensagem de Teste"
          onClose={() => setTestModalOpen(false)}
          maxWidth="sm:max-w-md"
        >
          <form onSubmit={handleSendTestFromEditor} className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Informe o número de WhatsApp com DDD para o qual deseja disparar o modelo formatado da automação:
            </p>

            <div>
              <label className={labelClass}>Telefone / WhatsApp com DDD *</label>
              <input
                required
                type="tel"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="Ex: 14997603870"
                className={inputClass}
                autoFocus
              />
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 leading-relaxed max-h-32 overflow-y-auto">
              <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Texto a ser disparado:
              </span>
              {livePreviewMessage}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={sendingTest || session?.status !== 'CONNECTED'}
                className={primaryButton}
              >
                <Send size={15} />
                <span>{sendingTest ? 'Enviando...' : 'Enviar Teste'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: NOVA AUTOMAÇÃO */}
      {newRuleModalOpen && (
        <Modal
          title="Nova Regra de Automação"
          onClose={() => setNewRuleModalOpen(false)}
          maxWidth="sm:max-w-xl"
        >
          <form onSubmit={handleCreateNewRule} className="space-y-4">
            <div>
              <label className={labelClass}>Nome da Automação *</label>
              <input
                required
                value={newRuleForm.name}
                onChange={e => setNewRuleForm({ ...newRuleForm, name: e.target.value })}
                placeholder="Ex: Lembrete 3 horas antes"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Evento Gatilho *</label>
                <select
                  value={newRuleForm.triggerType}
                  onChange={e => {
                    const nextType = e.target.value as PetshopNotificationRule['triggerType'];
                    setNewRuleForm({
                      ...newRuleForm,
                      triggerType: nextType,
                      triggerMinutesBefore: nextType === 'INACTIVE_CUSTOMER' ? 15 : 120,
                      messageTemplate:
                        nextType === 'INACTIVE_CUSTOMER'
                          ? 'Olá, {nome_tutor}! Já faz *{dias_sem_vir} dias* que não vemos *{nome_pet}* por aqui na *{nome_loja}*! Que tal agendar um horário para deixar {nome_pet} limpinho(a) essa semana?'
                          : newRuleForm.messageTemplate,
                    });
                  }}
                  className={inputClass}
                >
                  <option value="INACTIVE_CUSTOMER">Lembrete de Retorno (X dias sem agendar)</option>
                  <option value="BEFORE_APPOINTMENT">Lembrete Antes do Atendimento</option>
                  <option value="APPOINTMENT_CONFIRMED">Confirmação de Agendamento</option>
                  <option value="PET_READY">Pet Pronto p/ Retirada</option>
                  <option value="PACKAGE_LAST_SESSION">Última Sessão do Pacote</option>
                  <option value="PACKAGE_EXPIRING">Pacote Próximo do Vencimento</option>
                </select>
              </div>

              {newRuleForm.triggerType === 'BEFORE_APPOINTMENT' && (
                <div>
                  <label className={labelClass}>Antecedência em Minutos *</label>
                  <input
                    type="number"
                    min={15}
                    value={newRuleForm.triggerMinutesBefore}
                    onChange={e =>
                      setNewRuleForm({
                        ...newRuleForm,
                        triggerMinutesBefore: Number(e.target.value),
                      })
                    }
                    className={inputClass}
                    placeholder="Ex: 120 (2 horas)"
                  />
                </div>
              )}

              {newRuleForm.triggerType === 'INACTIVE_CUSTOMER' && (
                <div>
                  <label className={labelClass}>Dias sem Agendar *</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={newRuleForm.triggerMinutesBefore}
                    onChange={e =>
                      setNewRuleForm({
                        ...newRuleForm,
                        triggerMinutesBefore: Number(e.target.value),
                      })
                    }
                    className={inputClass}
                    placeholder="Ex: 15, 20 ou 30 dias"
                  />
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Texto do Template *</label>
              <textarea
                rows={4}
                required
                value={newRuleForm.messageTemplate}
                onChange={e => setNewRuleForm({ ...newRuleForm, messageTemplate: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setNewRuleModalOpen(false)}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <button type="submit" className={primaryButton}>
                Criar Automação
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
