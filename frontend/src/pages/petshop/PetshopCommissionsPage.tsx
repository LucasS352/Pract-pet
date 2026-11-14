import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  CreditCard,
  Download,
  Edit3,
  FileText,
  Filter,
  History,
  Layers,
  PawPrint,
  Percent,
  Plus,
  RotateCcw,
  Scissors,
  Settings2,
  Tag,
  Trash2,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader, pageClass, TeamTabs } from './ui';
import {
  type CommissionRule as Rule,
  SIZE_LABEL_MAP as sizeLabelMap,
  formatCommissionBrl as brl,
  resolveStageLabel,
} from './commissionRulesUtils';

type Row = {
  id: string;
  executedAt: string;
  stageKey: string;
  baseAmount: string;
  ruleKind: string;
  ruleValue: string;
  amount: string;
  state: string;
  operatorId: string;
  appointment: { id: string; startsAt: string; pet: { name: string; size?: string | null }; customer?: { name: string } };
  appointmentService: { serviceId: string; nameSnapshot: string };
  operator: { name: string };
  adjustments: { amount: string; reason: string }[];
};

type Adjustment = {
  id: string;
  createdAt: string;
  amount: string;
  reason: string;
  state: string;
  commission: {
    appointment: { id: string; pet: { name: string }; customer?: { name: string } };
    operator: { name: string };
    appointmentService: { nameSnapshot: string };
  };
};

type Report = {
  totals: Record<string, string>;
  procedures: number;
  commissionableProcedures: number;
  byOperator: { id: string; name: string; procedures: number; amount: string }[];
  byService: { serviceId: string; name: string; procedures: number; amount: string }[];
  rows: Row[];
  adjustments: Adjustment[];
  inconsistencies: { commissionId: string; reason: string }[];
};

const stateLabel: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  PAID: 'Pago',
  REVERSED: 'Estornado',
};

const currentPeriod = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

export default function PetshopCommissionsPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [operatorId, setOperatorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [state, setState] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [closings, setClosings] = useState<{ period: string; state: string; paymentRef?: string }[]>([]);
  const [operators, setOperators] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ key: string; label: string; trackProfessional?: boolean }[]>([]);
  const [rule, setRule] = useState({ stageKey: '', serviceId: '', operatorId: '', size: 'all', kind: 'NONE', value: '0' });
  const [busy, setBusy] = useState(false);
  const [showFullExtract, setShowFullExtract] = useState(false);
  const [showRulesConfig, setShowRulesConfig] = useState(false);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [showClosingsHistory, setShowClosingsHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      const [reportRes, rulesRes, closingsRes] = await Promise.all([
        api.get<Report>('/petshop/commissions/report', {
          params: {
            period,
            operatorId: operatorId || undefined,
            serviceId: serviceId || undefined,
            state: state || undefined,
          },
        }),
        api.get<Rule[]>('/petshop/commissions/rules'),
        api.get<typeof closings>('/petshop/commissions/closings'),
      ]);
      setReport(reportRes.data);
      setRules(rulesRes.data);
      setClosings(closingsRes.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível carregar as comissões.');
    }
  }, [period, operatorId, serviceId, state]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    Promise.all([api.get('/operators'), api.get('/petshop/services'), api.get('/petshop/stages')])
      .then(([o, s, st]) => {
        setOperators(o.data);
        setServices(s.data);
        setStages(st.data);
      })
      .catch(() => toast.error('Não foi possível carregar os filtros.'));
  }, []);

  const currentClosing = useMemo(() => closings.find(c => c.period === period), [closings, period]);
  const periodEnded = period < currentPeriod();

  const maxOperatorAmount = useMemo(() => {
    if (!report?.byOperator?.length) return 1;
    const max = Math.max(...report.byOperator.map(o => Number(o.amount || 0)));
    return max > 0 ? max : 1;
  }, [report]);

  const maxServiceAmount = useMemo(() => {
    if (!report?.byService?.length) return 1;
    const max = Math.max(...report.byService.map(s => Number(s.amount || 0)));
    return max > 0 ? max : 1;
  }, [report]);

  const saveRule = async () => {
    if (!rule.stageKey) return toast.error('Selecione a etapa.');
    setBusy(true);
    try {
      await api.post('/petshop/commissions/rules', {
        ...rule,
        serviceId: rule.serviceId || null,
        operatorId: rule.stageKey === 'service_added' ? null : (rule.operatorId || null),
        size: rule.stageKey === 'service_added' ? 'all' : (rule.size || 'all'),
      });
      toast.success('Regra de comissão salva.');
      await load();
      setRule({ stageKey: '', serviceId: '', operatorId: '', size: 'all', kind: 'NONE', value: '0' });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível salvar a regra.');
    } finally {
      setBusy(false);
    }
  };

  const editRuleInForm = (r: Rule) => {
    setRule({
      stageKey: r.stageKey,
      serviceId: r.serviceId || '',
      operatorId: r.operatorId || '',
      size: r.size || 'all',
      kind: r.kind,
      value: String(Number(r.value || 0)),
    });
    setShowRulesConfig(true);
    toast.info('Regra carregada nos campos acima para edição.');
  };

  const deleteRule = async (r: Rule) => {
    if (!window.confirm(`Remover regra ativa de "${resolveStageLabel(r.stageKey, stages)}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/petshop/commissions/rules/${r.id}`);
      toast.success('Regra removida.');
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível remover a regra.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (path: string, body?: object) => {
    setBusy(true);
    try {
      await api.post(path, body || {});
      toast.success('Operação registrada.');
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Operação não concluída.');
    } finally {
      setBusy(false);
    }
  };

  const correct = (id: string) => {
    const amount = window.prompt('Ajuste em reais (ex: 5.00 para acréscimo, -5.00 para desconto):');
    if (!amount) return;
    const reason = window.prompt('Motivo do ajuste auditável:');
    if (reason) void act(`/petshop/commissions/${id}/correct`, { amount, reason });
  };

  const exportCsv = () => {
    if (!report) return;
    const header = [
      'Data',
      'Funcionário',
      'Pet',
      'Tutor',
      'Atendimento',
      'Serviço',
      'Etapa',
      'Base',
      'Regra',
      'Valor',
      'Estado',
      'Identificador',
      'Tipo de lançamento',
      'Justificativa',
    ];
    const lines = report.rows.map(r => [
      new Date(r.executedAt).toLocaleString('pt-BR'),
      r.operator.name,
      r.appointment.pet.name,
      r.appointment.customer?.name || '',
      r.appointment.id,
      r.appointmentService.nameSnapshot,
      r.stageKey,
      r.baseAmount,
      `${r.ruleKind} ${r.ruleValue}`,
      r.amount,
      stateLabel[r.state] || r.state,
      r.id,
      'Comissão',
      '',
    ]);
    for (const adjustment of report.adjustments || []) lines.push([
      new Date(adjustment.createdAt).toLocaleString('pt-BR'),
      adjustment.commission.operator.name,
      adjustment.commission.appointment.pet.name,
      adjustment.commission.appointment.customer?.name || '',
      adjustment.commission.appointment.id,
      adjustment.commission.appointmentService.nameSnapshot,
      '', '', '', adjustment.amount,
      stateLabel[adjustment.state] || adjustment.state,
      adjustment.id, 'Ajuste', adjustment.reason,
    ]);
    const csv = [header, ...lines]
      .map(line => line.map(value => `"${String(/^[=+@\-]/.test(String(value)) ? `'${value}` : value).replaceAll('"', '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `comissoes-${period}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderBadge = (itemState: string) => {
    switch (itemState) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={12} strokeWidth={2.5} /> Aprovado
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            <Clock size={12} strokeWidth={2.5} /> Pendente
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/90 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
            <CheckCircle2 size={12} strokeWidth={2.5} /> Pago
          </span>
        );
      case 'REVERSED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/90 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <XCircle size={12} strokeWidth={2.5} /> Estornado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
            {stateLabel[itemState] || itemState}
          </span>
        );
    }
  };

  return (
    <div className={`${pageClass} space-y-5 text-zinc-900`}>
      {/* Cabeçalho da página */}
      <PageHeader
        eyebrow="Equipe"
        title="Comissões"
        description="Conferência de produtividade, regras e pagamentos por período."
        action={
          <Link
            to="/petshop/equipe/comissoes/regras"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0d6e5a] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#0b5c4b]"
          >
            <Layers size={15} />
            Mapa de Status & Comissões
          </Link>
        }
      />

      {/* Subnavegação por abas em pílulas */}
      <TeamTabs />

      {/* Barra de Filtros */}
      <section
        className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-2xs"
        aria-label="Filtros do extrato"
      >
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <Calendar size={13} className="text-zinc-400" /> Período
            </label>
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 outline-none transition focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <User size={13} className="text-zinc-400" /> Funcionário
            </label>
            <select
              value={operatorId}
              onChange={e => setOperatorId(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
            >
              <option value="">Todos</option>
              {operators.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <Scissors size={13} className="text-zinc-400" /> Serviço
            </label>
            <select
              value={serviceId}
              onChange={e => setServiceId(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
            >
              <option value="">Todos</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <Filter size={13} className="text-zinc-400" /> Estado
            </label>
            <select
              value={state}
              onChange={e => setState(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
            >
              <option value="">Todos</option>
              {Object.entries(stateLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 6 Cards de Indicadores (KPIs) */}
      <section
        className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-6"
        aria-label="Indicadores financeiros"
      >
        {/* 1. Gerado */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Coins size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Gerado</p>
            <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
              {brl(report?.totals.generated)}
            </p>
          </div>
        </div>

        {/* 2. Pendente */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <Clock size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Pendente</p>
            <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
              {brl(report?.totals.pending)}
            </p>
          </div>
        </div>

        {/* 3. Aprovado */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <CheckCircle2 size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Aprovado</p>
            <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
              {brl(report?.totals.approved)}
            </p>
          </div>
        </div>

        {/* 4. Pago */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
            <CreditCard size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Pago</p>
            <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
              {brl(report?.totals.paid)}
            </p>
          </div>
        </div>

        {/* 5. Procedimentos */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 ring-1 ring-purple-100">
            <PawPrint size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Procedimentos</p>
            <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
              {report?.procedures ?? 0}
            </p>
          </div>
        </div>

        {/* 6. Comissionáveis */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
            <Percent size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Comissionáveis</p>
            <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
              {report?.commissionableProcedures ?? 0}
            </p>
          </div>
        </div>
      </section>

      {/* Card: Fechamento Mensal */}
      <section
        className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs"
        aria-label="Fechamento mensal"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/70 text-[#0d6e5a]">
              <CalendarCheck size={24} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900">Fechamento mensal</h2>
                <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                  <span>Estado:</span>
                  <span className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    {currentClosing?.state === 'PAID'
                      ? 'Pago'
                      : currentClosing?.state === 'APPROVED'
                      ? 'Aprovado'
                      : 'Em conferência'}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Aprovação e pagamento são operações separadas. O demonstrativo inclui os lançamentos do período e suas origens.
              </p>
              <p className="text-xs text-zinc-500">
                {!periodEnded
                  ? 'O fechamento fica disponível após o fim do mês.'
                  : currentClosing?.state === 'PAID'
                  ? 'Período quitado com registro auditável.'
                  : 'Período encerrado e elegível para homologação.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              disabled={
                busy || !periodEnded || Boolean(report?.inconsistencies.length) || currentClosing?.state === 'PAID'
              }
              onClick={() => act(`/petshop/commissions/closings/${period}/approve`)}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#0d6e5a] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs transition hover:bg-[#0b5c4b] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={16} strokeWidth={2.5} />
              <span>Aprovar</span>
            </button>

            <button
              disabled={busy || !periodEnded || currentClosing?.state !== 'APPROVED'}
              onClick={() => {
                const reference = window.prompt('Referência do pagamento (ex: Pix E2E, Comprovante bancário):');
                if (reference) void act(`/petshop/commissions/closings/${period}/pay`, { reference });
              }}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#0d6e5a] bg-white px-4 py-2.5 text-sm font-semibold text-[#0d6e5a] transition hover:bg-teal-50/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard size={16} />
              <span>Registrar pagamento</span>
            </button>

            <button
              onClick={exportCsv}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50"
            >
              <Download size={16} />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {Boolean(report?.inconsistencies?.length) && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
            <strong className="mb-1 block font-semibold">
              {report?.inconsistencies.length} inconsistência(s) impedem a aprovação do período:
            </strong>
            {report?.inconsistencies.map(item => (
              <p key={item.commissionId}>
                • Atendimento {item.commissionId.slice(0, 8)}: {item.reason}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* Grid 2 Colunas: Produtividade por Profissional & Por Serviço */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Coluna 1: Produtividade por profissional */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2">
            <User size={18} className="text-[#0d6e5a]" />
            <div>
              <h3 className="text-base font-bold text-zinc-900">Produtividade por profissional</h3>
              <p className="text-xs text-zinc-500">Procedimentos e comissões geradas no período.</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs font-medium text-zinc-400">
                  <th className="pb-2.5 font-medium">Profissional</th>
                  <th className="pb-2.5 font-medium w-36"></th>
                  <th className="pb-2.5 font-medium text-center">Procedimentos</th>
                  <th className="pb-2.5 font-medium text-right">Comissão (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100/80">
                {report?.byOperator.map(o => {
                  const percent = Math.min(
                    100,
                    Math.max(12, Math.round((Number(o.amount) / maxOperatorAmount) * 100))
                  );
                  return (
                    <tr key={o.id} className="text-sm">
                      <td className="py-3 font-medium text-zinc-800">{o.name}</td>
                      <td className="py-3">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-zinc-100 sm:w-36">
                          <div className="h-full rounded-full bg-[#0d6e5a]" style={{ width: `${percent}%` }} />
                        </div>
                      </td>
                      <td className="py-3 text-center text-zinc-600">{o.procedures}</td>
                      <td className="py-3 text-right font-bold text-zinc-900">{brl(o.amount)}</td>
                    </tr>
                  );
                })}
                {!report?.byOperator?.length && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-zinc-500">
                      Nenhum procedimento registrado no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna 2: Por serviço */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-[#0d6e5a]" />
            <div>
              <h3 className="text-base font-bold text-zinc-900">Por serviço</h3>
              <p className="text-xs text-zinc-500">Comissões geradas por serviço no período.</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs font-medium text-zinc-400">
                  <th className="pb-2.5 font-medium">Serviço</th>
                  <th className="pb-2.5 font-medium w-36"></th>
                  <th className="pb-2.5 font-medium text-center">Procedimentos</th>
                  <th className="pb-2.5 font-medium text-right">Comissão (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100/80">
                {report?.byService.map(s => {
                  const percent = Math.min(
                    100,
                    Math.max(12, Math.round((Number(s.amount) / maxServiceAmount) * 100))
                  );
                  return (
                    <tr key={s.serviceId} className="text-sm">
                      <td className="py-3 font-medium text-zinc-800 max-w-[200px] truncate" title={s.name}>
                        {s.name}
                      </td>
                      <td className="py-3">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-zinc-100 sm:w-36">
                          <div className="h-full rounded-full bg-[#0d6e5a]" style={{ width: `${percent}%` }} />
                        </div>
                      </td>
                      <td className="py-3 text-center text-zinc-600">{s.procedures}</td>
                      <td className="py-3 text-right font-bold text-zinc-900">{brl(s.amount)}</td>
                    </tr>
                  );
                })}
                {!report?.byService?.length && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-zinc-500">
                      Nenhum serviço comissionado no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Card: Lançamentos Recentes */}
      <section
        className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs"
        aria-label="Lançamentos recentes"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileText size={20} className="text-[#0d6e5a]" />
            <div>
              <h3 className="text-base font-bold text-zinc-900">Lançamentos recentes</h3>
              <p className="text-xs text-zinc-500">Últimos procedimentos que geraram comissão.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowFullExtract(!showFullExtract)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0d6e5a] shadow-2xs transition hover:bg-teal-50/50"
          >
            <span>{showFullExtract ? 'Ocultar extrato completo' : 'Ver extrato completo'}</span>
            <ArrowRight size={14} className={showFullExtract ? 'rotate-90 transition' : ''} />
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs font-medium text-zinc-400">
                <th className="pb-2.5 font-medium">Data</th>
                <th className="pb-2.5 font-medium">Profissional</th>
                <th className="pb-2.5 font-medium">Serviço</th>
                <th className="pb-2.5 font-medium text-right">Comissão (R$)</th>
                <th className="pb-2.5 font-medium text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100/80">
              {(showFullExtract ? report?.rows : report?.rows?.slice(0, 8))?.map(r => (
                <tr key={r.id} className="text-sm">
                  <td className="py-3 whitespace-nowrap text-zinc-600">
                    {new Date(r.executedAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-3 font-medium text-zinc-800">{r.operator.name}</td>
                  <td className="py-3 text-zinc-700">{r.appointmentService.nameSnapshot}</td>
                  <td className="py-3 text-right font-bold text-zinc-900">{brl(r.amount)}</td>
                  <td className="py-3 text-right whitespace-nowrap">{renderBadge(r.state)}</td>
                </tr>
              ))}
              {!report?.rows?.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-zinc-500">
                    Nenhum lançamento recente encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Extrato Detalhado & Operações de Auditoria (Expandido) */}
      {showFullExtract && (
        <section
          className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xs"
          aria-label="Extrato completo de auditoria"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-zinc-900">Extrato detalhado com origens</h3>
              <p className="text-xs text-zinc-500">
                Rastreabilidade completa com pet, agendamento, etapa, base de cálculo e ações de correção.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                  <th className="p-2.5">Data/Hora</th>
                  <th className="p-2.5">Funcionário</th>
                  <th className="p-2.5">Pet / Atendimento</th>
                  <th className="p-2.5">Serviço / Etapa</th>
                  <th className="p-2.5">Base</th>
                  <th className="p-2.5">Regra Aplicada</th>
                  <th className="p-2.5 font-bold text-zinc-900">Comissão</th>
                  <th className="p-2.5">Estado</th>
                  <th className="p-2.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {report?.rows.map(r => (
                  <tr key={r.id} className="align-top hover:bg-zinc-50/50">
                    <td className="p-2.5 whitespace-nowrap text-xs text-zinc-600">
                      {new Date(r.executedAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-2.5 font-medium text-zinc-900">{r.operator.name}</td>
                    <td className="p-2.5 text-xs">
                      <span className="font-semibold text-zinc-800">{r.appointment.pet.name}</span>
                      {r.appointment.pet.size && (
                        <span className="ml-1.5 rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
                          {sizeLabelMap[r.appointment.pet.size] || r.appointment.pet.size}
                        </span>
                      )}
                      <br />
                      <Link
                        className="font-mono text-[#0d6e5a] underline hover:text-[#0b5c4b]"
                        to={`/petshop/agenda?appointment=${r.appointment.id}&date=${r.appointment.startsAt.slice(0, 10)}`}
                      >
                        #{r.appointment.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2.5 text-xs text-zinc-700">
                      <span className="font-medium text-zinc-900">{r.appointmentService.nameSnapshot}</span>
                      <br />
                      <span className="text-zinc-500">{r.stageKey}</span>
                    </td>
                    <td className="p-2.5 whitespace-nowrap text-xs text-zinc-600">{brl(r.baseAmount)}</td>
                    <td className="p-2.5 text-xs text-zinc-600">
                      {r.ruleKind === 'PERCENT'
                        ? `${r.ruleValue}%`
                        : r.ruleKind === 'FIXED'
                        ? brl(r.ruleValue)
                        : 'Sem comissão'}
                    </td>
                    <td className="p-2.5 whitespace-nowrap font-bold text-zinc-900">{brl(r.amount)}</td>
                    <td className="p-2.5 whitespace-nowrap">{renderBadge(r.state)}</td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      {r.state !== 'REVERSED' ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            disabled={busy}
                            className="cursor-pointer text-xs font-semibold text-[#0d6e5a] underline hover:text-[#0b5c4b] disabled:opacity-50"
                            onClick={() => correct(r.id)}
                          >
                            Corrigir
                          </button>
                          <button
                            disabled={busy}
                            className="cursor-pointer text-xs font-semibold text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
                            onClick={() => {
                              const reason = window.prompt('Motivo do estorno desta comissão:');
                              if (reason) void act(`/petshop/commissions/${r.id}/reverse`, { reason });
                            }}
                          >
                            Estornar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">Sem ações</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Seções Complementares: Regras de Comissão, Ajustes Auditáveis e Histórico */}
      <div className="space-y-3 pt-2">
        {/* Acordeão: Regras de Comissão */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <button
            type="button"
            onClick={() => setShowRulesConfig(!showRulesConfig)}
            className="flex w-full cursor-pointer items-center justify-between p-4 text-left transition hover:bg-zinc-50/50"
          >
            <div className="flex items-center gap-2.5">
              <Settings2 size={18} className="text-[#0d6e5a]" />
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Configuração de Regras de Comissão (Incluindo Porte do Pet)</h3>
                <p className="text-xs text-zinc-500">
                  Defina regras específicas por etapa, porte do animal (P, M, G, GG), serviço e profissional com hierarquia de precedência.
                </p>
              </div>
            </div>
            <ChevronDown size={18} className={`text-zinc-400 transition ${showRulesConfig ? 'rotate-180' : ''}`} />
          </button>

          {showRulesConfig && (
            <div className="border-t border-zinc-100 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200/70 bg-teal-50/50 px-3.5 py-2.5 text-xs">
                <span className="text-teal-900">
                  Quer visualizar todos os <strong>status do fluxo e serviços</strong> mapeados com suas comissões e editar direto na tela?
                </span>
                <Link
                  to="/petshop/equipe/comissoes/regras"
                  className="inline-flex items-center gap-1 rounded-lg bg-[#0d6e5a] px-3 py-1.5 font-semibold text-white transition hover:bg-[#0b5c4b]"
                >
                  <Layers size={13} /> Abrir Mapa Completo
                </Link>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Etapa Rastreada</label>
                  <select
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
                    value={rule.stageKey}
                    onChange={e => setRule({ ...rule, stageKey: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {stages
                      .filter(s => s.trackProfessional)
                      .map(s => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    <option value="service_added">Serviço Extra Adicionado</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Serviço (Opcional)</label>
                  <select
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
                    value={rule.serviceId}
                    onChange={e => setRule({ ...rule, serviceId: e.target.value })}
                  >
                    <option value="">Todos os serviços</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Porte do Pet (Opcional)</label>
                  <select
                    disabled={rule.stageKey === 'service_added'}
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15 disabled:bg-zinc-100 disabled:opacity-60"
                    value={rule.stageKey === 'service_added' ? 'all' : rule.size}
                    onChange={e => setRule({ ...rule, size: e.target.value })}
                  >
                    <option value="all">Todos os portes</option>
                    <option value="mini">Mini</option>
                    <option value="small">Pequeno (P)</option>
                    <option value="medium">Médio (M)</option>
                    <option value="large">Grande (G)</option>
                    <option value="giant">Gigante (GG)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Profissional (Opcional)</label>
                  <select
                    disabled={rule.stageKey === 'service_added'}
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15 disabled:bg-zinc-100 disabled:opacity-60"
                    value={rule.stageKey === 'service_added' ? '' : rule.operatorId}
                    onChange={e => setRule({ ...rule, operatorId: e.target.value })}
                  >
                    <option value="">Todos os profissionais</option>
                    {operators.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Tipo de Comissão</label>
                  <select
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
                    value={rule.kind}
                    onChange={e => setRule({ ...rule, kind: e.target.value, value: '0' })}
                  >
                    <option value="NONE">Sem comissão</option>
                    {rule.stageKey !== 'service_added' && <option value="PERCENT">Percentual (%)</option>}
                    <option value="FIXED">Valor fixo (R$)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    {rule.kind === 'PERCENT' ? 'Percentual (%)' : 'Valor (R$)'}
                  </label>
                  <input
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15 disabled:bg-zinc-100 disabled:opacity-50"
                    type="number"
                    min="0"
                    max={rule.kind === 'PERCENT' ? 100 : undefined}
                    step="0.01"
                    disabled={rule.kind === 'NONE'}
                    value={rule.value}
                    onChange={e => setRule({ ...rule, value: e.target.value })}
                  />
                </div>
              </div>

              <button
                disabled={busy}
                onClick={saveRule}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#0d6e5a] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#0b5c4b] disabled:opacity-50"
              >
                <Plus size={14} /> Salvar regra
              </button>

              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold text-zinc-700">Regras cadastradas no estabelecimento:</p>
                <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 text-xs">
                  {rules.map(r => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <span className="text-zinc-700">
                        <strong>{resolveStageLabel(r.stageKey, stages)}</strong>{' '}
                        <span className="text-[11px] text-zinc-400">({r.stageKey})</span> ·{' '}
                        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800">
                          {sizeLabelMap[r.size || 'all'] || 'Todos os portes'}
                        </span>{' '}
                        · {services.find(s => s.id === r.serviceId)?.name || 'Todos os serviços'} ·{' '}
                        {operators.find(o => o.id === r.operatorId)?.name || 'Todos os profissionais'}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-zinc-900">
                          {r.kind === 'PERCENT'
                            ? `${r.value}%`
                            : r.kind === 'FIXED'
                            ? brl(r.value)
                            : 'Sem comissão'}{' '}
                          <span className="font-normal text-zinc-400">· v{r.version}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => editRuleInForm(r)}
                          className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#0d6e5a] hover:underline"
                        >
                          <Edit3 size={12} /> Editar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void deleteRule(r)}
                          className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                        >
                          <Trash2 size={12} /> Remover
                        </button>
                      </div>
                    </div>
                  ))}
                  {!rules.length && (
                    <p className="p-3 text-xs text-zinc-500">Nenhuma regra personalizada cadastrada.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Acordeão: Ajustes Auditáveis */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <button
            type="button"
            onClick={() => setShowAdjustments(!showAdjustments)}
            className="flex w-full cursor-pointer items-center justify-between p-4 text-left transition hover:bg-zinc-50/50"
          >
            <div className="flex items-center gap-2.5">
              <RotateCcw size={18} className="text-[#0d6e5a]" />
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Ajustes Auditáveis do Período</h3>
                <p className="text-xs text-zinc-500">
                  Histórico imutável de correções manuais e estornos com identificação e motivo.
                </p>
              </div>
            </div>
            <ChevronDown size={18} className={`text-zinc-400 transition ${showAdjustments ? 'rotate-180' : ''}`} />
          </button>

          {showAdjustments && (
            <div className="border-t border-zinc-100 p-5">
              <div className="divide-y divide-zinc-100 text-xs">
                {report?.adjustments.map(a => (
                  <div key={a.id} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-5">
                    <span className="text-zinc-500">{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                    <span className="font-medium text-zinc-800">
                      {a.commission.operator.name} · {a.commission.appointment.pet.name}
                    </span>
                    <span className="text-zinc-700">{a.commission.appointmentService.nameSnapshot}</span>
                    <span className="italic text-zinc-600">"{a.reason}"</span>
                    <strong className="text-right text-zinc-900">
                      {brl(a.amount)} · {stateLabel[a.state] || a.state}
                    </strong>
                  </div>
                ))}
                {!report?.adjustments.length && (
                  <p className="py-2 text-xs text-zinc-500">Nenhum ajuste auditável registrado neste período.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Acordeão: Fechamentos Anteriores */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <button
            type="button"
            onClick={() => setShowClosingsHistory(!showClosingsHistory)}
            className="flex w-full cursor-pointer items-center justify-between p-4 text-left transition hover:bg-zinc-50/50"
          >
            <div className="flex items-center gap-2.5">
              <History size={18} className="text-[#0d6e5a]" />
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Histórico de Fechamentos Anteriores</h3>
                <p className="text-xs text-zinc-500">Consulte períodos homologados e comprovantes de quitação.</p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-zinc-400 transition ${showClosingsHistory ? 'rotate-180' : ''}`}
            />
          </button>

          {showClosingsHistory && (
            <div className="border-t border-zinc-100 p-5">
              <div className="divide-y divide-zinc-100 text-xs">
                {closings.map(c => (
                  <button
                    key={c.period}
                    onClick={() => setPeriod(c.period)}
                    className="flex min-h-10 w-full cursor-pointer items-center justify-between py-2 text-left transition hover:bg-zinc-50"
                  >
                    <span className="font-semibold text-zinc-800">Período: {c.period}</span>
                    <span className="text-zinc-600">
                      Status: {stateLabel[c.state] || c.state}
                      {c.paymentRef ? ` · Ref: ${c.paymentRef}` : ''}
                    </span>
                  </button>
                ))}
                {!closings.length && (
                  <p className="py-2 text-xs text-zinc-500">Nenhum fechamento registrado no histórico.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
