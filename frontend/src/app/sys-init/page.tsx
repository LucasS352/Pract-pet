"use client";
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { api } from "@/lib/api";
import { getFullUrl } from "@/lib/getFullUrl";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ShieldCheck, Building2, User, Mail, Lock, Database, Loader2, CheckCircle2,
  AlertCircle, ArrowRight, Eye, EyeOff, Search, Edit, Image as ImageIcon,
  Settings, ToggleLeft, ToggleRight, AlertTriangle, Upload, X, Terminal,
  ChevronDown, ChevronRight, Trash2, DollarSign, Users, Plus, Phone, FileText,
  Clock, CreditCard, History, Info, Copy, Check, Edit2, LockKeyhole, Sparkles, UserPlus,
  Activity, CalendarDays, LayoutGrid
} from "lucide-react";
import { exportTelemetry, clearTelemetry } from "@/lib/telemetry";
import { db } from "@/lib/db";
import { TenantBillingCalendar } from "@/components/TenantBillingCalendar";
const ImageOptimizationPanel = lazy(() => import("@/components/ImageOptimizationPanel"));


const PIN_LENGTH = 10;

type Step = "pin" | "list" | "create" | "edit" | "success" | "backups";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Avança a data em exatamente 1 mês, preservando o dia e sem overflow (dia 31 → último dia do mês) */
function addOneMonthSafe(date: Date): Date {
  const originalDay = date.getDate();
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDayOfNextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDayOfNextMonth));
  return d;
}

/** Converte string "YYYY-MM-DD" para Date no horário local (sem offset de timezone) */
function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

const MODULE_BADGES: Record<string, { label: string; color: string }> = {
  food: { label: 'FOOD', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  kds: { label: 'KDS', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  carvoaria: { label: 'Carvoaria', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  nfce:           { label: 'NFC-e',    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  estoque:        { label: 'Estoque',  color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  dashboardMobile:{ label: 'Mobile',   color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  comandas:       { label: 'Comandas', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  vitrineDigital: { label: 'Vitrine',     color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  importacaoXml:  { label: 'XML',         color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  digitalSignage: { label: 'Signage',     color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  restaurante:    { label: 'Restaurante', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  petshop:        { label: 'Pet Shop', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
};

function ModuleBadges({ modulosRaw }: { modulosRaw: any }) {
  let m: Record<string, boolean> = { nfce: true, estoque: true, dashboardMobile: true };
  try {
    if (modulosRaw) {
      m = typeof modulosRaw === 'string' ? JSON.parse(modulosRaw) : modulosRaw;
    }
  } catch (e) { /* skip */ }

  const active = Object.entries(m).filter(([, v]) => v).map(([k]) => k);
  if (active.length === 0) return <span className="text-zinc-600 text-xs">Nenhum</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {active.map(key => {
        const badge = MODULE_BADGES[key] || { label: key, color: 'bg-zinc-700 text-zinc-300 border-zinc-600' };
        return (
          <span key={key} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${badge.color}`}>
            {badge.label}
          </span>
        );
      })}
    </div>
  );
}

export default function SysInitPage() {
  const [imageOptimizationOpen, setImageOptimizationOpen] = useState(false);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("pin");

  const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo' ||
    (typeof window !== 'undefined' && window.location.hostname.includes('demo'));

  const [activeTab, setActiveTab] = useState<"tenants" | "groups" | "leads" | "sql">("tenants");

  // ── SQL EDITOR STATE ──────────────────────────────────────────────────
  const [sqlPinUnlocked, setSqlPinUnlocked] = useState(false);
  const [sqlPinInput, setSqlPinInput] = useState('');
  const [sqlPinError, setSqlPinError] = useState('');
  const [sqlSelectedDb, setSqlSelectedDb] = useState<{ tenantId?: string; useHeart?: boolean; label: string }>({ useHeart: true, label: '🫀 Heart (master)' });
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM tenants LIMIT 10');
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState('');
  const [sqlHistory, setSqlHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('7bar_sql_history') || '[]'); } catch { return []; }
  });
  const [sqlTables, setSqlTables] = useState<string[]>([]);
  const [sqlLoadingTables, setSqlLoadingTables] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string; value: string; id: string } | null>(null);
  const [updatingRowId, setUpdatingRowId] = useState<string | null>(null);

  // ── LEADS LIST ────────────────────────────────────────────────────────
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState("");

  // ── TELEMETRIA LOCAL ───────────────────────────────────────────────────
  const [telemetryCount, setTelemetryCount] = useState<number>(0);
  const refreshTelemetryCount = useCallback(async () => {
    try {
      const count = await db.telemetry_events?.count();
      setTelemetryCount(count || 0);
    } catch { /* silencioso */ }
  }, []);

  const handleExportTelemetry = async () => {
    try {
      const events = await exportTelemetry();
      if (events.length === 0) {
        toast.info("Nenhum evento de telemetria registrado neste navegador.");
        return;
      }
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `telemetria-7bar-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${events.length} evento(s) de telemetria exportado(s)!`);
    } catch {
      toast.error("Erro ao exportar telemetria.");
    }
  };

  const handleClearTelemetry = async () => {
    if (!window.confirm("Deseja limpar todos os registros locais de telemetria deste navegador?")) return;
    await clearTelemetry();
    await refreshTelemetryCount();
    toast.success("Telemetria local limpa com sucesso.");
  };


  const loadLeads = async () => {
    if (!isDemoMode) return;
    setLoadingLeads(true);
    try {
      const pin = pinDigits.join('');
      const url = leadStatusFilter ? `/leads?status=${leadStatusFilter}` : '/leads';
      const res = await api.get(url, { headers: { 'x-setup-pin': pin } });
      setLeads(res.data || []);
    } catch (err) {
      console.warn('Leads não disponíveis no ambiente atual.');
    } finally {
      setLoadingLeads(false);
    }
  };

  const updateLeadStatus = async (leadId: string, newStatus: string, notes?: string) => {
    if (!isDemoMode) return;
    try {
      const pin = pinDigits.join('');
      await api.patch(`/leads/${leadId}`, { status: newStatus, notes }, { headers: { 'x-setup-pin': pin } });
      toast.success('Status do lead atualizado!');
      loadLeads();
    } catch (err) {
      toast.error('Erro ao atualizar lead.');
    }
  };

  // ── TENANT LIST ───────────────────────────────────────────────────────
  const [tenants, setTenants] = useState<any[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [includeHeart, setIncludeHeart] = useState(false);
  const [tenantView, setTenantView] = useState<"calendar" | "cards">("calendar");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // ── GROUPS LIST ───────────────────────────────────────────────────────
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupUsers, setGroupUsers] = useState<any[]>([]);
  const [loadingGroupUsers, setLoadingGroupUsers] = useState(false);
  const [newMemberTenantId, setNewMemberTenantId] = useState("");
  const [newMemberAlias, setNewMemberAlias] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [addingUser, setAddingUser] = useState(false);

  // ── DATABASE MIGRATION STATE ──────────────────────────────────────────
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<any[]>([]);
  const [activeLogTenantId, setActiveLogTenantId] = useState<string | null>(null);

  // ── PIN step ──────────────────────────────────────────────────────────
  const [pinDigits, setPinDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [pinError, setpinError] = useState("");
  const [pinShake, setPinShake] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Create Form step ──────────────────────────────────────────────────
  const [tenantName, setTenantName] = useState("");
  const [dbName, setDbName] = useState("");
  const [dbNameManual, setDbNameManual] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [seedProducts, setSeedProducts] = useState(true);
  const [mensalidadeValor, setMensalidadeValor] = useState("0.00");
  const [mensalidadeVencimento, setMensalidadeVencimento] = useState("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  // ── Edit Form step ────────────────────────────────────────────────────
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [editTab, setEditTab] = useState<"identidade" | "modulos" | "fiscal" | "financeiro" | "integracoes" | "usuarios">("identidade");
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);

  // Integração States
  const [integrationCreds, setIntegrationCreds] = useState<{clientId: string, clientSecret: string, merchantId: string, allowedCategories?: string[], priceMarkup?: number, syncStock?: boolean}>({ clientId: '', clientSecret: '', merchantId: '', allowedCategories: [], priceMarkup: 0, syncStock: false });
  const [tenantCategories, setTenantCategories] = useState<any[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [modulos, setModulos] = useState<any>({});
  const [editLoading, setEditLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{message: string; synced: number; errors: number} | null>(null);

  // Users State
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'operator' });

  // Payment History State
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingPaymentHistory, setLoadingPaymentHistory] = useState(false);
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [paymentObservacao, setPaymentObservacao] = useState("");

  // Backups State
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [backupSchedule, setBackupSchedule] = useState({ enabled: false, time: '02:00' });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const pin = pinDigits.join('');
      const res = await api.get('/sys-init/backups', { headers: { 'x-setup-pin': pin } });
      setBackupsList(res.data);
      const scheduleRes = await api.get('/sys-init/backups/schedule', { headers: { 'x-setup-pin': pin } });
      setBackupSchedule(scheduleRes.data);
    } catch (e) {
      toast.error('Erro ao carregar backups.');
    } finally {
      setLoadingBackups(false);
    }
  };

  const loadPaymentHistory = useCallback(async (tenantId: string) => {
    setLoadingPaymentHistory(true);
    try {
      const pin = pinDigits.join('');
      const res = await api.get(`/tenants/setup/${tenantId}/payment-history`, { headers: { 'x-setup-pin': pin } });
      setPaymentHistory(res.data || []);
    } catch (e) {
      toast.error('Erro ao carregar histórico.');
    } finally {
      setLoadingPaymentHistory(false);
    }
  }, [pinDigits]);

  const handleSyncCatalog = async () => {
    if (!editingTenant?.id) return;
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const pin = pinDigits.join('');
      await api.post(`/integrations/setup/${editingTenant.id}`, {
        provider: selectedIntegration,
        credentials: integrationCreds,
        settings: { active: true }
      }, { headers: { 'x-setup-pin': pin } });

      const res = await api.post(`/integrations/ifood/sync-catalog/${editingTenant.id}`, {}, { headers: { 'x-setup-pin': pin } });
      const data = res.data;
      setSyncResult(data);
      toast.success(`${data.synced} produto(s) sincronizados com o iFood!`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || err.message || 'Erro ao sincronizar catálogo');
    } finally {
      setSyncLoading(false);
    }
  };

  const loadTenants = async () => {
    setLoadingTenants(true);
    void refreshTelemetryCount();
    try {
      const pin = pinDigits.join('');
      const res = await api.get('/tenants/setup/list', { headers: { 'x-setup-pin': pin } });
      setTenants(res.data);
    } catch (err) {
      toast.error('Erro ao carregar tenants.');
    } finally {
      setLoadingTenants(false);
    }
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const pin = pinDigits.join('');
      const res = await api.get('/groups/setup/list', { headers: { 'x-setup-pin': pin } });
      setGroups(res.data);
    } catch (err) {
      toast.error('Erro ao carregar grupos.');
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadGroupUsers = async (groupId: string) => {
    setLoadingGroupUsers(true);
    try {
      const pin = pinDigits.join('');
      const res = await api.get(`/groups/setup/${groupId}/users`, { headers: { 'x-setup-pin': pin } });
      setGroupUsers(res.data);
    } catch (err) {
      toast.error('Erro ao carregar usuários do grupo.');
    } finally {
      setLoadingGroupUsers(false);
    }
  };

  // Auto-restaurar sessão do PIN se já autenticado na aba atual
  useEffect(() => {
    try {
      const savedPin = sessionStorage.getItem('7bar_sysinit_pin');
      if (savedPin && step === 'pin') {
        api.post('/tenants/setup/validate-pin', { pin: savedPin })
          .then(() => {
            const next = Array(PIN_LENGTH).fill("");
            savedPin.split("").forEach((c, i) => { if (i < PIN_LENGTH) next[i] = c; });
            setPinDigits(next);
            setStep("list");
          })
          .catch(() => {
            sessionStorage.removeItem('7bar_sysinit_pin');
          });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (step === "list") {
      if (activeTab === "tenants") loadTenants();
      else if (activeTab === "groups") loadGroups();
      else if (activeTab === "leads" && isDemoMode) loadLeads();
    }
  }, [step, activeTab, leadStatusFilter, isDemoMode]);

  useEffect(() => {
    if (!dbNameManual && tenantName) {
      setDbName(slugify(tenantName));
    }
  }, [tenantName, dbNameManual]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const pin = pinDigits.join('');
      await api.post('/groups/setup/create', { name: newGroupName }, { headers: { 'x-setup-pin': pin } });
      toast.success('Grupo criado com sucesso!');
      setIsCreateGroupOpen(false);
      setNewGroupName("");
      loadGroups();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao criar grupo.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleAddGroupMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !newMemberTenantId) return;
    setAddingMember(true);
    try {
      const pin = pinDigits.join('');
      await api.post(`/groups/setup/${selectedGroup.id}/members`, {
        tenantId: newMemberTenantId,
        alias: newMemberAlias
      }, { headers: { 'x-setup-pin': pin } });
      toast.success('Membro adicionado com sucesso!');
      setNewMemberTenantId("");
      setNewMemberAlias("");
      loadGroups();
      const updatedGroup = groups.find(g => g.id === selectedGroup.id);
      if (updatedGroup) setSelectedGroup(updatedGroup);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao adicionar membro.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleAddGroupUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    setAddingUser(true);
    try {
      const pin = pinDigits.join('');
      await api.post(`/groups/setup/${selectedGroup.id}/users`, {
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword
      }, { headers: { 'x-setup-pin': pin } });
      toast.success('Usuário adicionado com sucesso!');
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      loadGroupUsers(selectedGroup.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao adicionar usuário.');
    } finally {
      setAddingUser(false);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { handleValidatePin(); return; }
    if (e.key === "Backspace") {
      if (pinDigits[index]) {
        const next = [...pinDigits]; next[index] = ""; setPinDigits(next);
      } else if (index > 0) {
        pinRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePinChange = (index: number, value: string) => {
    const char = value.slice(-1);
    const next = [...pinDigits]; next[index] = char; setPinDigits(next);
    if (char && index < PIN_LENGTH - 1) pinRefs.current[index + 1]?.focus();
  };

  const handlePinPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").slice(0, PIN_LENGTH);
    const next = Array(PIN_LENGTH).fill("");
    pasted.split("").forEach((c, i) => (next[i] = c));
    setPinDigits(next);
    pinRefs.current[Math.min(pasted.length, PIN_LENGTH - 1)]?.focus();
  };

  const triggerShake = () => { setPinShake(true); setTimeout(() => setPinShake(false), 600); };

  const handleValidatePin = async () => {
    const pin = pinDigits.join("").trim();
    if (pin.length < 4) { setpinError("Digite o PIN completo."); triggerShake(); return; }
    setPinLoading(true); setpinError("");
    try {
      await api.post("/tenants/setup/validate-pin", { pin });
      try { sessionStorage.setItem('7bar_sysinit_pin', pin); } catch {}
      setTimeout(() => setStep("list"), 300);
    } catch {
      setpinError("PIN incorreto. Acesso negado."); triggerShake();
      setPinDigits(Array(PIN_LENGTH).fill("")); pinRefs.current[0]?.focus();
    } finally {
      setPinLoading(false);
    }
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError("");
    if (adminPassword !== adminPasswordConfirm) { setFormError("As senhas não coincidem."); return; }
    if (adminPassword.length < 6) { setFormError("A senha deve ter pelo menos 6 caracteres."); return; }
    setFormLoading(true);
    try {
      const pin = pinDigits.join("");
      const { data } = await api.post("/tenants/setup", {
        pin, tenantName, dbName, adminName, adminEmail, adminPassword, seedProducts,
        mensalidadeValor: Number(mensalidadeValor) || 0,
        mensalidadeVencimento: mensalidadeVencimento ? parseDateLocal(mensalidadeVencimento).toISOString() : null,
      });
      setSuccessData(data); setStep("success");
    } catch (err: any) {
      setFormError(err?.response?.data?.message || "Erro ao provisionar. Tente novamente.");
    } finally {
      setFormLoading(false);
    }
  };

  const openEdit = (tenant: any) => {
    setEditingTenant(tenant); setLogoFile(null);
    let parsedModulos = { petshop: true, nfce: true, estoque: true, dashboardMobile: true, comandas: true };
    try {
      if (tenant.modulos) parsedModulos = typeof tenant.modulos === 'string' ? JSON.parse(tenant.modulos) : tenant.modulos;
    } catch (e) { console.error("Erro ao fazer parse dos módulos:", e); }
    setModulos(parsedModulos);
    setEditTab("identidade");
    setPaymentHistory([]);
    setPaymentObservacao("");
    setStep("edit");
  };

  const handleSaveEdit = async () => {
    setEditLoading(true);
    try {
      const pin = pinDigits.join('');
      if (logoFile) {
        const formData = new FormData();
        formData.append("logo", logoFile);
        await api.post(`/tenants/setup/${editingTenant.id}/logo`, formData, { headers: { 'x-setup-pin': pin } });
      }
      await api.patch(`/tenants/setup/${editingTenant.id}`, {
        nomeFantasia: editingTenant.nomeFantasia,
        razaoSocial: editingTenant.razaoSocial,
        cnpj: editingTenant.cnpj,
        status: editingTenant.status,
        nfceAmbiente: editingTenant.nfceAmbiente,
        modulos,
        mensalidadeValor: Number(editingTenant.mensalidadeValor) || 0,
        mensalidadeVencimento: editingTenant.mensalidadeVencimento || null,
        // Campos de contato
        telefoneContato: editingTenant.telefoneContato || null,
        emailContato: editingTenant.emailContato || null,
        observacoes: editingTenant.observacoes || null,
      }, { headers: { 'x-setup-pin': pin } });
      toast.success("Tenant atualizado com sucesso!");
      setLogoFile(null); setStep("list"); loadTenants();
    } catch (err: any) {
      console.error(err.response?.data || err);
      toast.error(err.response?.data?.message || "Erro ao salvar alterações.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveIntegration = async () => {
    setEditLoading(true);
    try {
      const pin = pinDigits.join('');
      await api.post(`/integrations/setup/${editingTenant.id}`, {
        provider: selectedIntegration,
        credentials: integrationCreds,
        settings: { active: true }
      }, { headers: { 'x-setup-pin': pin } });
      toast.success("Integração salva com sucesso!");
      setSelectedIntegration(null); loadTenants(); setEditingTenant(null); setStep("list");
    } catch (err: any) {
      console.error(err.response?.data || err);
      toast.error(err.response?.data?.message || "Erro ao salvar integração.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteTenant = async (tenant: any) => {
    const confirmName = window.prompt(
      `ATENÇÃO: Isso excluirá PERMANENTEMENTE o banco de dados "${tenant.databaseName}" e todos os registros da empresa "${tenant.name || tenant.nomeFantasia}".\n\nEsta operação NÃO PODE SER DESFEITA.\n\nPara confirmar, digite o nome do banco de dados (${tenant.databaseName}):`
    );
    if (confirmName !== tenant.databaseName) {
      if (confirmName !== null) toast.error("Confirmação incorreta. A exclusão foi cancelada.");
      return;
    }
    try {
      const pin = pinDigits.join('');
      await api.delete(`/tenants/setup/${tenant.id}`, { headers: { 'x-setup-pin': pin } });
      toast.success("Tenant e banco de dados excluídos com sucesso!");
      loadTenants();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erro ao excluir tenant.");
    }
  };

  const handleRegistrarPagamento = async (tenantId: string, observacao?: string) => {
    setRegisteringPayment(true);
    try {
      const pin = pinDigits.join('');
      await api.post(`/tenants/setup/${tenantId}/registrar-pagamento`, { observacao }, { headers: { 'x-setup-pin': pin } });
      toast.success("Pagamento registrado! Vencimento avançado 1 mês.");
      loadTenants();
      if (editingTenant?.id === tenantId) {
        // Recarrega o tenant editado e o histórico
        const res = await api.get('/tenants/setup/list', { headers: { 'x-setup-pin': pin } });
        const updated = res.data.find((t: any) => t.id === tenantId);
        if (updated) setEditingTenant((prev: any) => ({ ...prev, mensalidadeVencimento: updated.mensalidadeVencimento }));
        loadPaymentHistory(tenantId);
      }
      setPaymentObservacao("");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erro ao registrar pagamento.");
    } finally {
      setRegisteringPayment(false);
    }
  };

  const handleMigrateBancos = async () => {
    setMigrationModalOpen(true); setMigrating(true);

    // Montar lista de resultados iniciais (Heart primeiro, depois tenants)
    const initialResults: any[] = [];
    if (includeHeart) {
      initialResults.push({
        tenantId: '__heart__',
        name: '🫀 Banco Heart (master)',
        databaseName: 'heart',
        status: 'processing',
        output: ''
      });
    }
    selectedTenantIds.forEach(id => {
      const tenant = tenants.find(t => t.id === id);
      initialResults.push({ tenantId: id, name: tenant?.name || tenant?.nomeFantasia || 'Tenant', databaseName: tenant?.databaseName || '', status: 'processing', output: '' });
    });
    setMigrationResults(initialResults);

    try {
      const pin = pinDigits.join('');
      const res = await api.post('/tenants/setup/migrate', { tenantIds: selectedTenantIds, includeHeart }, { headers: { 'x-setup-pin': pin } });
      setMigrationResults(res.data);
      toast.success('Migração de bancos concluída!');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao executar migração.';
      toast.error(msg);
      setMigrationResults(prev => prev.map(item => item.status === 'processing' ? { ...item, status: 'error', output: msg } : item));
    } finally {
      setMigrating(false); setSelectedTenantIds([]); loadTenants();
    }
  };

  // ── SQL EDITOR HANDLER ────────────────────────────────────────────────
  const handleSqlUnlock = () => {
    if (sqlPinInput === '43619835') {
      setSqlPinUnlocked(true);
      setSqlPinError('');
      loadTablesForDb(sqlSelectedDb);
    } else {
      setSqlPinError('PIN incorreto.');
      setSqlPinInput('');
    }
  };

  const loadTablesForDb = async (targetDb?: { tenantId?: string; useHeart?: boolean; label: string }) => {
    const db = targetDb || sqlSelectedDb;
    setSqlLoadingTables(true);
    try {
      const pin = pinDigits.join('');
      const res = await api.post(
        '/tenants/setup/sql',
        { sql: 'SHOW TABLES', tenantId: db.tenantId, useHeart: db.useHeart },
        { headers: { 'x-setup-pin': pin, 'x-sql-pin': '43619835' } }
      );
      if (res.data?.type === 'query' && Array.isArray(res.data?.rows)) {
        const tableList = res.data.rows.map((row: any[]) => String(row[0])).filter(Boolean);
        setSqlTables(tableList);
      } else {
        setSqlTables([]);
      }
    } catch {
      setSqlTables([]);
    } finally {
      setSqlLoadingTables(false);
    }
  };

  const handleExecuteSql = async (sqlOverride?: string, targetDb?: { tenantId?: string; useHeart?: boolean; label: string }) => {
    const queryToRun = (sqlOverride ?? sqlQuery).trim();
    if (!queryToRun) return;
    if (sqlOverride) setSqlQuery(sqlOverride);
    const db = targetDb || sqlSelectedDb;
    setSqlLoading(true);
    setSqlError('');
    setSqlResult(null);
    try {
      const pin = pinDigits.join('');
      const res = await api.post(
        '/tenants/setup/sql',
        { sql: queryToRun, tenantId: db.tenantId, useHeart: db.useHeart },
        { headers: { 'x-setup-pin': pin, 'x-sql-pin': '43619835' } }
      );
      setSqlResult(res.data);
      // salvar no histórico
      setSqlHistory(prev => {
        const updated = [queryToRun, ...prev.filter(q => q !== queryToRun)].slice(0, 20);
        localStorage.setItem('7bar_sql_history', JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      setSqlError(err.response?.data?.message || 'Erro ao executar query.');
    } finally {
      setSqlLoading(false);
    }
  };

  const handleCloseCashRegister = async (cashRegisterId: string) => {
    if (!confirm(`Deseja realmente FECHAR o caixa ${cashRegisterId.slice(0, 8)}...?`)) return;
    setUpdatingRowId(cashRegisterId);
    try {
      const q = `UPDATE cash_registers SET status = 'closed', closingTime = NOW(), closingValue = COALESCE(closingValue, openingValue, 0) WHERE id = '${cashRegisterId}'`;
      const pin = pinDigits.join('');
      await api.post(
        '/tenants/setup/sql',
        { sql: q, tenantId: sqlSelectedDb.tenantId, useHeart: sqlSelectedDb.useHeart },
        { headers: { 'x-setup-pin': pin, 'x-sql-pin': '43619835' } }
      );
      toast.success(`Caixa ${cashRegisterId.slice(0, 8)} fechado com sucesso!`);
      await handleExecuteSql(sqlQuery);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao fechar caixa.');
    } finally {
      setUpdatingRowId(null);
    }
  };

  const handleCancelSale = async (saleId: string) => {
    if (!confirm(`Deseja realmente CANCELAR a venda ${saleId.slice(0, 8)}...?`)) return;
    setUpdatingRowId(saleId);
    try {
      const q = `UPDATE sales SET status = 'cancelled', cancelledAt = NOW(), cancelReason = 'Cancelamento administrativo' WHERE id = '${saleId}'`;
      const pin = pinDigits.join('');
      await api.post(
        '/tenants/setup/sql',
        { sql: q, tenantId: sqlSelectedDb.tenantId, useHeart: sqlSelectedDb.useHeart },
        { headers: { 'x-setup-pin': pin, 'x-sql-pin': '43619835' } }
      );
      toast.success(`Venda ${saleId.slice(0, 8)} cancelada com sucesso!`);
      await handleExecuteSql(sqlQuery);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao cancelar venda.');
    } finally {
      setUpdatingRowId(null);
    }
  };

  const handleDeleteRow = async (tableName: string, rowId: string) => {
    if (!confirm(`ATENÇÃO: Deseja realmente EXCLUIR o registro "${rowId}" da tabela "${tableName}"?`)) return;
    setUpdatingRowId(rowId);
    try {
      const q = `DELETE FROM ${tableName} WHERE id = '${rowId}'`;
      const pin = pinDigits.join('');
      await api.post(
        '/tenants/setup/sql',
        { sql: q, tenantId: sqlSelectedDb.tenantId, useHeart: sqlSelectedDb.useHeart },
        { headers: { 'x-setup-pin': pin, 'x-sql-pin': '43619835' } }
      );
      toast.success(`Registro excluído com sucesso!`);
      await handleExecuteSql(sqlQuery);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao excluir registro.');
    } finally {
      setUpdatingRowId(null);
    }
  };

  const handleSaveInlineEdit = async (tableName: string) => {
    if (!editingCell) return;
    try {
      const val = editingCell.value;
      const sqlVal = val === '' || val.toUpperCase() === 'NULL' ? 'NULL' : `'${val.replace(/'/g, "''")}'`;
      const q = `UPDATE ${tableName} SET ${editingCell.column} = ${sqlVal} WHERE id = '${editingCell.id}'`;
      const pin = pinDigits.join('');
      await api.post(
        '/tenants/setup/sql',
        { sql: q, tenantId: sqlSelectedDb.tenantId, useHeart: sqlSelectedDb.useHeart },
        { headers: { 'x-setup-pin': pin, 'x-sql-pin': '43619835' } }
      );
      toast.success(`Campo "${editingCell.column}" atualizado com sucesso!`);
      setEditingCell(null);
      await handleExecuteSql(sqlQuery);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar alteração.');
    }
  };

  const handleCopyValue = (val: any) => {
    if (val === null || val === undefined) return;
    navigator.clipboard.writeText(String(val));
    toast.success('Copiado para a área de transferência!');
  };

  const isCertExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const expDate = new Date(date);
    const diff = expDate.getTime() - new Date().getTime();
    return diff < 30 * 24 * 60 * 60 * 1000 && diff > 0;
  };

  const filteredTenants = tenants.filter(t =>
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.cnpj?.includes(searchTerm) ||
    t.databaseName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.telefoneContato?.includes(searchTerm) ||
    t.emailContato?.toLowerCase().includes(searchTerm.toLowerCase())
  );


  const toggleTenant = (id: string, checked: boolean) => setSelectedTenantIds(ids => checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id));
  const allFilteredSelected = filteredTenants.length > 0 && filteredTenants.every(t => selectedTenantIds.includes(t.id));
  const allTenantsSelected = tenants.length > 0 && tenants.every(t => selectedTenantIds.includes(t.id));
  const toggleSelectAllTenants = () => setSelectedTenantIds(allTenantsSelected ? [] : tenants.map(t => t.id));
  const toggleFilteredTenants = () => setSelectedTenantIds(ids => allFilteredSelected
    ? ids.filter(id => !filteredTenants.some(t => t.id === id))
    : [...new Set([...ids, ...filteredTenants.map(t => t.id)])]);

  const faturamentoEstimado = tenants
    .filter(t => t.status === 'active')
    .reduce((acc, t) => acc + (Number(t.mensalidadeValor) || 0), 0);

  const mensalidadesAtrasadas = tenants.filter(t => {
    if (!t.mensalidadeVencimento || t.status !== 'active') return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const venc = new Date(t.mensalidadeVencimento);
    return venc < today;
  }).length;

  const getVencimentoStatus = (vencimento: string | null) => {
    if (!vencimento) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const venc = new Date(vencimento);
    venc.setHours(0, 0, 0, 0);
    const diffDays = Math.round((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { color: "text-rose-400 bg-rose-500/10 border-rose-500/20 animate-pulse", text: `Atrasado desde ${venc.toLocaleDateString("pt-BR")}` };
    if (diffDays === 0) return { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", text: "Vence hoje!" };
    if (diffDays <= 5) return { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", text: `Vence em ${diffDays} dias` };
    return { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", text: venc.toLocaleDateString("pt-BR") };
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col p-4 sm:p-8">
      {imageOptimizationOpen && <Suspense fallback={<div className="fixed inset-0 z-[100] bg-zinc-950 p-8">Carregando manutenção de imagens…</div>}><ImageOptimizationPanel
        tenants={tenants.filter(t => selectedTenantIds.includes(t.id))}
        pin={pinDigits.join('')}
        onClose={() => setImageOptimizationOpen(false)}
      /></Suspense>}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-violet-700 rounded-full blur-[140px] opacity-20" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-600 rounded-full blur-[160px] opacity-15" />
      </div>

      <div className="relative z-10 w-full min-w-0 flex-1 flex flex-col">
        {/* — PIN STEP — */}
        {step === "pin" && (
          <div className={`transition-all duration-300 max-w-md mx-auto mt-20 ${pinShake ? "animate-[shake_0.4s_ease]" : ""}`}>
            <div className="p-8 rounded-3xl bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 shadow-2xl">
              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/20">
                  <ShieldCheck size={30} className="text-violet-400" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Painel Central</h1>
                <p className="text-zinc-400 text-sm mt-2 text-center">
                  Digite o PIN de administração para acessar o gerenciador de Tenants
                </p>
              </div>
              <div className="mb-6">
                <div className="flex gap-2 justify-center" onPaste={handlePinPaste}>
                  {pinDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { pinRefs.current[i] = el; }}
                      type="password"
                      maxLength={2}
                      value={digit}
                      onChange={(e) => handlePinChange(i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(i, e)}
                      className={`w-9 h-11 text-center text-lg font-bold rounded-xl border transition-all outline-none
                        ${digit ? "bg-violet-600/20 border-violet-500/60 text-white" : "bg-zinc-950/50 border-zinc-700 text-white"}
                        focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30`}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
              </div>
              {pinError && (
                <div className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <AlertCircle size={16} /> {pinError}
                </div>
              )}
              <button
                onClick={handleValidatePin}
                disabled={pinLoading}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg shadow-violet-600/25 active:scale-95 flex justify-center items-center gap-2"
              >
                {pinLoading ? <Loader2 className="animate-spin" size={20} /> : <>Acessar Painel <ArrowRight size={18} /></>}
              </button>
            </div>
          </div>
        )}

        {/* — LIST STEP — */}
        {step === "list" && (
          <div className="animate-[fadeIn_0.3s_ease] flex flex-col flex-1">
            <div className="flex flex-wrap justify-between items-center gap-5 mb-6 mt-2">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
                  {activeTab === 'tenants'
                    ? 'Gestão de Tenants'
                    : activeTab === 'groups'
                    ? 'Gestão de Grupos'
                    : activeTab === 'sql'
                    ? '⚡ SQL Editor'
                    : '🎯 Leads de Demonstração'}
                </h1>
                <p className="text-zinc-400 mt-1">
                  {activeTab === 'tenants'
                    ? 'Clientes, vencimentos e gestão da sua operação.'
                    : activeTab === 'groups'
                    ? 'Gerencie os grupos de lojas e redes corporativas.'
                    : activeTab === 'sql'
                    ? 'Execute consultas, audite registros e realize alterações diretamente nos bancos de dados.'
                    : 'Contatos capturados através do ambiente de demonstração gratuita.'}
                </p>
              </div>
              <div className="flex gap-3">
                {activeTab === 'tenants' && (
                  <>
                    <button onClick={() => setStep("create")} className="flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-500"><Plus size={18} /> Novo cliente</button>
                  </>
                )}
                {activeTab === 'groups' && (
                  <button onClick={() => setIsCreateGroupOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-500/20">
                    <Users size={18} /> Novo Grupo
                  </button>
                )}
                {activeTab === 'leads' && (
                  <button onClick={loadLeads} className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-amber-500/20">
                    Atualizar Leads
                  </button>
                )}
              </div>
            </div>

            {activeTab === 'tenants' && <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3" aria-label="Ações administrativas">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={handleMigrateBancos} disabled={!includeHeart && !selectedTenantIds.length} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 text-sm font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-40"><Database size={16} /> Atualizar Bancos {(includeHeart ? 1 : 0) + selectedTenantIds.length || ''}</button>
                <label className="flex h-10 items-center gap-2 px-2 text-sm text-zinc-400 cursor-pointer select-none"><input type="checkbox" checked={includeHeart} onChange={e => setIncludeHeart(e.target.checked)} className="accent-violet-500 w-4 h-4 rounded" /> Incluir Heart</label>
                <button type="button" onClick={toggleSelectAllTenants} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition">
                  <CheckCircle2 size={16} className={allTenantsSelected ? "text-violet-400" : "text-zinc-500"} />
                  {allTenantsSelected ? 'Desmarcar todos os bancos' : `Selecionar todos os bancos (${tenants.length})`}
                </button>
                <span className="px-2 text-xs text-zinc-500">{selectedTenantIds.length} de {tenants.length} cliente(s) selecionado(s)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                <button disabled={!selectedTenantIds.length} onClick={() => setImageOptimizationOpen(true)} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"><ImageIcon size={16} /> Otimizar imagens</button>
                <button onClick={() => { setStep('backups'); loadBackups(); }} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300 hover:bg-zinc-800"><Database size={16} /> Gerenciar Backups</button>
                <button onClick={handleExportTelemetry} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300 hover:bg-zinc-800"><Activity size={16} /> Exportar telemetria ({telemetryCount})</button>
                {telemetryCount > 0 && <button onClick={handleClearTelemetry} title="Limpar telemetria local" className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={16} /> Limpar telemetria</button>}
              </div>
            </div>}

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-zinc-800">
              <button onClick={() => setActiveTab('tenants')} className={`py-2 px-4 font-bold border-b-2 transition-colors ${activeTab === 'tenants' ? 'border-violet-500 text-violet-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Tenants</button>
              <button onClick={() => setActiveTab('groups')} className={`py-2 px-4 font-bold border-b-2 transition-colors ${activeTab === 'groups' ? 'border-violet-500 text-violet-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Grupos</button>
              {isDemoMode && (
                <button onClick={() => setActiveTab('leads')} className={`py-2 px-4 font-bold border-b-2 transition-colors ${activeTab === 'leads' ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'} flex items-center gap-2`}>
                  🎯 Leads Demo {leads.length > 0 && <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-mono">{leads.length}</span>}
                </button>
              )}
              <button onClick={() => setActiveTab('sql')} className={`py-2 px-4 font-bold border-b-2 transition-colors ${activeTab === 'sql' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'} flex items-center gap-1.5`}>
                <Terminal size={15} /> SQL
              </button>
            </div>

            {/* ── TENANTS TAB ── */}
            {activeTab === 'tenants' ? (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl"><Building2 size={24} /></div>
                    <div><p className="text-zinc-400 text-sm">Total de Clientes</p><p className="text-2xl font-bold">{tenants.length}</p></div>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl"><DollarSign size={24} /></div>
                    <div>
                      <p className="text-zinc-400 text-sm">Faturamento Mensal</p>
                      <p className="text-2xl font-bold">R$ {faturamentoEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
                    <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl"><AlertTriangle size={24} /></div>
                    <div><p className="text-zinc-400 text-sm">Atrasados</p><p className="text-2xl font-bold text-rose-400">{mensalidadesAtrasadas}</p></div>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
                    <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl"><AlertTriangle size={24} /></div>
                    <div><p className="text-zinc-400 text-sm">Certificados a Vencer</p><p className="text-2xl font-bold">{tenants.filter(t => isCertExpiringSoon(t.certValidade)).length}</p></div>
                  </div>
                </div>

                <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input type="text" placeholder="Buscar por nome, CNPJ, telefone, e-mail..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-violet-500" />
                  </div>
                  <span className="text-sm text-zinc-500">{filteredTenants.length} cliente(s){selectedTenantIds.length > 0 ? ` · ${selectedTenantIds.length} selecionado(s)` : ''} </span>
                  <button type="button" onClick={searchTerm ? toggleFilteredTenants : toggleSelectAllTenants} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition flex items-center gap-1.5">
                    <CheckCircle2 size={14} className={(searchTerm ? allFilteredSelected : allTenantsSelected) ? "text-violet-400" : "text-zinc-500"} />
                    {searchTerm
                      ? (allFilteredSelected ? 'Desmarcar resultados' : `Selecionar resultados (${filteredTenants.length})`)
                      : (allTenantsSelected ? 'Desmarcar todos os bancos' : `Selecionar todos os bancos (${tenants.length})`)}
                  </button>
                  <div className="flex rounded-xl border border-zinc-700 bg-zinc-950 p-1">
                    <button type="button" onClick={() => setTenantView('calendar')} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${tenantView === 'calendar' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}><CalendarDays size={15} /> Calendário</button>
                    <button type="button" onClick={() => setTenantView('cards')} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${tenantView === 'cards' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}><LayoutGrid size={15} /> Clientes</button>
                  </div>
                </div>

                {tenantView === 'calendar' ? (
                  loadingTenants ? (
                    <div className="flex flex-1 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 p-12 text-zinc-500"><Loader2 className="mr-2 animate-spin" /> Carregando clientes...</div>
                  ) : (
                    <TenantBillingCalendar
                      tenants={filteredTenants}
                      month={calendarMonth}
                      onMonthChange={setCalendarMonth}
                      selectedIds={selectedTenantIds}
                      onToggleTenant={toggleTenant}
                      onEdit={openEdit}
                      onRegisterPayment={handleRegistrarPagamento}
                    />
                  )
                ) : (
                <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))]">
                  {loadingTenants ? <p className="p-8 text-zinc-400">Carregando clientes…</p> : !filteredTenants.length ? <p className="p-8 text-zinc-400">Nenhum cliente encontrado.</p> : filteredTenants.map(t => {
                    const selected = selectedTenantIds.includes(t.id);
                    const venc = getVencimentoStatus(t.mensalidadeVencimento);
                    const admin = t.users?.find((u: any) => u.role === 'admin' || u.role === 'superadmin');
                    return <article key={t.id} className={`flex min-w-0 flex-col rounded-2xl border p-5 transition ${selected ? 'border-violet-500 bg-violet-950/20' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'}`}>
                      <div className="mb-5 flex items-start gap-3">
                        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800 text-lg font-bold text-violet-300">{(t.name || t.nomeFantasia || '?').charAt(0).toUpperCase()}{t.logoUrl && <img src={getFullUrl(t.logoUrl)} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 h-full w-full object-cover" />}</div>
                        <div className="min-w-0 flex-1"><button onClick={() => openEdit(t)} className="text-left font-bold leading-snug text-zinc-100 hover:text-violet-300">{t.name || t.nomeFantasia}</button><p className="mt-1 break-all text-xs text-zinc-500">{t.databaseName}</p></div>
                        <input type="checkbox" aria-label={`Selecionar ${t.name || t.nomeFantasia}`} checked={selected} onChange={e => toggleTenant(t.id, e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-violet-500" />
                      </div>
                      <div className="mb-4 flex items-end justify-between gap-3 rounded-xl bg-zinc-950/60 p-3">
                        <div><p className="mb-1 text-xs text-zinc-500">Mensalidade</p><p className="text-xl font-semibold tabular-nums">{Number(t.mensalidadeValor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                        <span className={`rounded-full px-2 py-1 text-xs ${t.status === 'active' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>{t.status === 'active' ? 'Ativo' : t.status === 'paused' ? 'Pausado' : t.status === 'suspended' ? 'Suspenso' : 'Inativo'}</span>
                      </div>
                      <p className="mb-3 flex items-center gap-2 text-sm text-zinc-300"><CalendarDays size={15} className="text-zinc-500" />{t.mensalidadeVencimento ? new Date(t.mensalidadeVencimento).toLocaleDateString('pt-BR') : 'Sem vencimento definido'}</p>
                      {venc && <span className={`mb-4 w-fit rounded-lg border px-2 py-1 text-xs ${venc.color.replace('animate-pulse', '')}`}>{venc.text}</span>}
                      <div className="mb-4 space-y-1 text-xs text-zinc-500">
                        {t.telefoneContato && <p className="break-all">{t.telefoneContato}</p>}
                        {(t.emailContato || admin?.email) && <p className="break-all">{t.emailContato || admin?.email}</p>}
                        {t.emailContato && admin?.email && t.emailContato !== admin.email && <p className="break-all">Admin: {admin.email}</p>}
                      </div>
                      <div className="mb-4"><ModuleBadges modulosRaw={t.modulos} /></div>
                      <button onClick={() => { openEdit(t); setEditTab('modulos'); }} className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-violet-500/25 py-2.5 text-sm font-semibold text-violet-300 hover:bg-violet-500/10"><Settings size={16} /> Gerenciar módulos</button>
                      <div className="mt-auto flex items-center gap-2 border-t border-zinc-800 pt-4">
                        <button onClick={() => handleRegistrarPagamento(t.id)} disabled={registeringPayment} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40" title="Registrar Pagamento"><DollarSign size={15} /> Registrar pagamento</button>
                        <button onClick={() => openEdit(t)} className="rounded-lg border border-zinc-700 p-2 text-zinc-400 hover:text-white" title="Editar"><Edit size={16} /></button>
                        <button onClick={() => handleDeleteTenant(t)} className="rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300" title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </article>;
                  })}
                </div>
                )}
              </>
            ) : activeTab === 'groups' ? (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-zinc-950/50 text-zinc-400 sticky top-0 z-10 border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-4 font-medium">Nome do Grupo</th>
                        <th className="px-6 py-4 font-medium">Membros</th>
                        <th className="px-6 py-4 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {loadingGroups ? (
                        <tr><td colSpan={3} className="px-6 py-12 text-center text-zinc-500"><Loader2 className="animate-spin inline-block mr-2" /> Carregando...</td></tr>
                      ) : groups.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-12 text-center text-zinc-500">Nenhum grupo encontrado.</td></tr>
                      ) : (
                        groups.map(g => (
                          <tr key={g.id} className="hover:bg-zinc-800/30 transition">
                            <td className="px-6 py-4 font-semibold text-zinc-200">{g.name}</td>
                            <td className="px-6 py-4 text-zinc-400">{g.members?.length || 0} membros</td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => { setSelectedGroup(g); loadGroupUsers(g.id); }} className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Gerenciar">
                                <Settings size={18} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : activeTab === 'sql' ? (
              /* ── SQL EDITOR TAB ── */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {!sqlPinUnlocked ? (
                  /* PIN GATE */
                  <div className="flex-1 flex items-center justify-center py-20">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 w-full max-w-md text-center shadow-2xl">
                      <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                        <Terminal className="text-emerald-400" size={36} />
                      </div>
                      <h2 className="text-2xl font-black text-zinc-100 mb-1">SQL Editor</h2>
                      <p className="text-zinc-500 text-sm mb-2">Acesso direto aos bancos de dados do sistema.</p>
                      <p className="text-zinc-600 text-xs mb-8">Digite o PIN exclusivo do SQL Editor para continuar.</p>
                      <input
                        type="password"
                        value={sqlPinInput}
                        onChange={e => { setSqlPinInput(e.target.value); setSqlPinError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleSqlUnlock()}
                        placeholder="••••••••"
                        className="w-full p-4 bg-zinc-950 border border-zinc-700 rounded-2xl text-white text-center font-mono text-2xl tracking-[0.5em] focus:border-emerald-500 outline-none mb-3 placeholder:tracking-normal placeholder:text-2xl"
                        autoFocus
                        maxLength={12}
                      />
                      {sqlPinError && (
                        <div className="flex items-center gap-2 justify-center text-red-400 text-sm mb-3">
                          <AlertCircle size={14} /> {sqlPinError}
                        </div>
                      )}
                      <button onClick={handleSqlUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-2xl transition flex items-center justify-center gap-2">
                        <Terminal size={18} /> Acessar SQL Editor
                      </button>
                    </div>
                  </div>
                ) : (
                  /* SQL EDITOR UI — layout tipo DBeaver */
                  <div className="flex-1 flex gap-0 min-h-0 overflow-hidden rounded-2xl border border-zinc-800">

                    {/* ── SIDEBAR: Seletor de Banco + Tabelas + Atalhos ── */}
                    <div className="w-64 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col overflow-hidden">
                      {/* Seletor de Banco */}
                      <div className="p-3 border-b border-zinc-800">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Conexão do Banco</p>
                        <select
                          value={sqlSelectedDb.useHeart ? '__heart__' : (sqlSelectedDb.tenantId || '__heart__')}
                          onChange={e => {
                            const val = e.target.value;
                            let newDb: { tenantId?: string; useHeart?: boolean; label: string };
                            if (val === '__heart__') {
                              newDb = { useHeart: true, label: '🫀 Heart (master)' };
                              setSqlQuery('SELECT * FROM tenants LIMIT 10');
                            } else {
                              const t = tenants.find(item => item.id === val);
                              newDb = { tenantId: t?.id, useHeart: false, label: `▪ ${t?.name || t?.nomeFantasia || t?.databaseName} (${t?.databaseName})` };
                              setSqlQuery('SELECT id, status, operatorId, openingTime, closingTime, openingValue, closingValue FROM cash_registers ORDER BY openingTime DESC LIMIT 20');
                            }
                            setSqlSelectedDb(newDb);
                            setSqlResult(null);
                            setSqlError('');
                            loadTablesForDb(newDb);
                          }}
                          className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-2.5 py-2 text-xs font-mono focus:border-emerald-500 outline-none"
                        >
                          <option value="__heart__">🫀 Heart (master)</option>
                          {tenants.map(t => (
                            <option key={t.id} value={t.id}>▪ {t.name || t.nomeFantasia || t.databaseName} ({t.databaseName})</option>
                          ))}
                        </select>
                      </div>

                      {/* Header de Tabelas com botão de refresh */}
                      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Database size={12} className="text-emerald-400" />
                          Tabelas {sqlTables.length > 0 && `(${sqlTables.length})`}
                        </span>
                        <button
                          onClick={() => loadTablesForDb(sqlSelectedDb)}
                          disabled={sqlLoadingTables}
                          title="Atualizar lista de tabelas"
                          className="text-xs text-zinc-500 hover:text-emerald-400 p-1 hover:bg-zinc-800 rounded transition"
                        >
                          {sqlLoadingTables ? <Loader2 className="animate-spin" size={13} /> : '🔄'}
                        </button>
                      </div>

                      {/* Lista de tabelas (clicáveis) */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 min-h-0">
                        {sqlLoadingTables ? (
                          <div className="flex items-center justify-center py-8 text-zinc-600 gap-2 text-xs">
                            <Loader2 className="animate-spin" size={14} /> Carregando tabelas...
                          </div>
                        ) : sqlTables.length > 0 ? (
                          <div className="space-y-0.5">
                            {sqlTables.map(tableName => (
                              <button
                                key={tableName}
                                onClick={() => {
                                  const q = `SELECT * FROM ${tableName} LIMIT 50`;
                                  setSqlQuery(q);
                                  handleExecuteSql(q);
                                }}
                                className="w-full text-left px-2.5 py-1.5 text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded-lg transition flex items-center gap-2 group"
                              >
                                <span className="text-zinc-600 group-hover:text-emerald-400 text-[10px]">•</span>
                                <span className="truncate">{tableName}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-zinc-600 text-xs">
                            <p>Nenhuma tabela encontrada.</p>
                            <button
                              onClick={() => loadTablesForDb(sqlSelectedDb)}
                              className="mt-2 text-[11px] text-emerald-400 underline"
                            >
                              Carregar tabelas
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Atalhos rápidos contextuais */}
                      <div className="p-2.5 border-t border-zinc-800 max-h-48 overflow-y-auto custom-scrollbar">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 px-1">Atalhos Úteis</p>
                        <div className="space-y-0.5">
                          {sqlSelectedDb.useHeart ? (
                            <>
                              {[
                                { label: '🫀 Tenants cadastrados', q: 'SELECT id, name, database_name, status, mensalidade_vencimento, mensalidade_valor FROM tenants ORDER BY name' },
                                { label: '👥 Usuários Master', q: 'SELECT id, email, name, role, tenantId, createdAt FROM users ORDER BY createdAt DESC LIMIT 30' },
                                { label: '🔍— Integrações Hub', q: 'SELECT * FROM tenant_integrations LIMIT 50' },
                              ].map(item => (
                                <button
                                  key={item.label}
                                  onClick={() => { setSqlQuery(item.q); handleExecuteSql(item.q); }}
                                  className="w-full text-left px-2 py-1.5 text-[11px] text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800/70 rounded-lg transition truncate block"
                                >
                                  {item.label}
                                </button>
                              ))}
                            </>
                          ) : (
                            <>
                              {[
                                { label: '📋 Caixas (Todos)', q: 'SELECT id, code, status, operatorId, openingTime, closingTime, openingValue, closingValue FROM cash_registers ORDER BY openingTime DESC LIMIT 20' },
                                { label: '🔍“ Caixas Abertos', q: "SELECT id, code, status, operatorId, openingTime, openingValue FROM cash_registers WHERE status = 'open' ORDER BY openingTime DESC LIMIT 20" },
                                { label: '💰 Vendas Recentes', q: 'SELECT id, code, total, status, source, createdAt FROM sales ORDER BY createdAt DESC LIMIT 30' },
                                { label: '▪ Produtos do Catálogo', q: 'SELECT id, shortCode, name, barcode, priceSell, stock, active FROM products ORDER BY name LIMIT 50' },
                                { label: '▪ Estoque Baixo/Zerado', q: 'SELECT id, shortCode, name, stock, minStock, priceSell FROM products WHERE stock <= COALESCE(minStock, 5) ORDER BY stock ASC LIMIT 50' },
                                { label: '👥 Operadores da Loja', q: 'SELECT id, name, active, isManager FROM operators ORDER BY name' },
                                { label: '💳 Formas de Pagamento', q: 'SELECT id, name, tPag, active FROM tenant_payment_methods' },
                                { label: '🔒 Fechar Caixa Aberto', q: "UPDATE cash_registers SET status = 'closed', closingTime = NOW() WHERE id = 'COLOQUE_O_ID_AQUI'" },
                                { label: '— Cancelar Venda', q: "UPDATE sales SET status = 'cancelled', cancelledAt = NOW(), cancelReason = 'Cancelamento administrativo' WHERE id = 'COLOQUE_O_ID_AQUI'" },
                              ].map(item => (
                                <button
                                  key={item.label}
                                  onClick={() => { setSqlQuery(item.q); if (!item.q.includes('COLOQUE_O_ID')) handleExecuteSql(item.q); }}
                                  className="w-full text-left px-2 py-1.5 text-[11px] text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800/70 rounded-lg transition truncate block"
                                >
                                  {item.label}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── MAIN AREA: Editor + Resultados ── */}
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-zinc-950">

                      {/* Barra superior com banco ativo + executar */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-mono text-zinc-400">Banco: <span className="text-emerald-400 font-bold">{sqlSelectedDb.label}</span></span>
                        </div>
                        <div className="ml-auto flex items-center gap-3">
                          <span className="text-xs text-zinc-600 font-mono hidden sm:block">Ctrl+Enter para executar</span>
                          <button
                            onClick={() => handleExecuteSql()}
                            disabled={sqlLoading}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition text-sm shadow-lg shadow-emerald-500/20"
                          >
                            {sqlLoading ? <Loader2 className="animate-spin" size={15} /> : <Terminal size={15} />}
                            Executar
                          </button>
                        </div>
                      </div>

                      {/* Editor SQL */}
                      <div className="relative shrink-0 border-b border-zinc-800 bg-zinc-950">
                        <div className="absolute left-0 top-0 bottom-0 w-10 bg-zinc-900/40 border-r border-zinc-800/50 flex flex-col items-center pt-3 gap-[21px] select-none pointer-events-none">
                          {Array.from({ length: Math.max(5, sqlQuery.split('\n').length) }, (_, i) => (
                            <span key={i} className="text-[11px] text-zinc-700 font-mono leading-none">{i + 1}</span>
                          ))}
                        </div>
                        <textarea
                          value={sqlQuery}
                          onChange={e => setSqlQuery(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleExecuteSql(); }
                            if (e.key === 'Tab') { e.preventDefault(); const s = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; setSqlQuery(v => v.substring(0, s) + '  ' + v.substring(end)); setTimeout(() => { e.currentTarget.selectionStart = e.currentTarget.selectionEnd = s + 2; }, 0); }
                          }}
                          rows={Math.max(5, Math.min(10, sqlQuery.split('\n').length + 1))}
                          spellCheck={false}
                          placeholder="-- Digite sua consulta SQL aqui..."
                          className="w-full pl-12 pr-4 py-3 bg-transparent text-emerald-200 font-mono text-sm resize-none focus:outline-none leading-[1.6] custom-scrollbar"
                          style={{ minHeight: '110px' }}
                        />
                      </div>

                      {/* Divider com info de status */}
                      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/30 px-4 py-1.5 flex items-center gap-3">
                        {sqlLoading && (
                          <span className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                            <Loader2 className="animate-spin" size={13} /> Executando consulta...
                          </span>
                        )}
                        {sqlResult && !sqlLoading && (
                          <span className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                            <CheckCircle2 size={13} />
                            {sqlResult.type === 'query'
                              ? `${sqlResult.rowCount} linha${sqlResult.rowCount !== 1 ? 's' : ''} retornada${sqlResult.rowCount !== 1 ? 's' : ''}`
                              : `${sqlResult.rowsAffected} linha${sqlResult.rowsAffected !== 1 ? 's' : ''} afetada${sqlResult.rowsAffected !== 1 ? 's' : ''}`}
                            {sqlResult.limited && <span className="text-amber-400 font-normal ml-1">⚠️ limitado a 500 registros</span>}
                          </span>
                        )}
                        {sqlError && !sqlLoading && (
                          <span className="flex items-center gap-2 text-xs text-red-400 font-medium"><AlertCircle size={13} /> Erro na execução</span>
                        )}
                        {!sqlLoading && !sqlResult && !sqlError && (
                          <span className="text-xs text-zinc-600">Pronto para executar.</span>
                        )}
                        {sqlResult && <span className="ml-auto text-xs text-zinc-600 font-mono">{sqlResult.durationMs}ms</span>}
                      </div>

                      {/* Ãrea de resultado */}
                      <div className="flex-1 overflow-auto custom-scrollbar min-h-0 bg-zinc-950">
                        {/* Erro */}
                        {sqlError && (
                          <div className="m-4 bg-red-950/30 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
                            <div>
                              <p className="text-red-300 font-bold text-sm mb-1">Erro na Query</p>
                              <pre className="text-red-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">{sqlError}</pre>
                            </div>
                          </div>
                        )}

                        {/* Tabela com dados e ações interativas */}
                        {sqlResult?.type === 'query' && sqlResult.columns.length > 0 && sqlResult.rowCount > 0 && (() => {
                          const currentTableName = /FROM\s+([a-zA-Z0-9_]+)/i.exec(sqlQuery)?.[1] || '';
                          const idColIndex = sqlResult.columns.findIndex((col: string) => col.toLowerCase() === 'id');
                          const statusColIndex = sqlResult.columns.findIndex((col: string) => col.toLowerCase() === 'status');
                          const hasId = idColIndex !== -1 && Boolean(currentTableName);

                          return (
                            <div>
                              {hasId && (
                                <div className="px-4 py-1.5 bg-zinc-900/60 border-b border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 text-zinc-400">
                                    <Sparkles size={12} className="text-emerald-400" />
                                    Tabela <span className="font-mono text-emerald-400 font-bold">{currentTableName}</span> identificada — Dê <strong className="text-white">duplo clique</strong> em qualquer célula para editar direto no banco.
                                  </span>
                                </div>
                              )}
                              <table className="w-full text-left text-xs font-mono whitespace-nowrap border-collapse">
                                <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-700">
                                  <tr>
                                    <th className="px-3 py-2.5 text-zinc-500 font-bold border-r border-zinc-800 w-10 text-center">#</th>
                                    {hasId && (
                                      <th className="px-3 py-2.5 text-amber-400/90 font-bold border-r border-zinc-800 bg-zinc-900">
                                        Ações
                                      </th>
                                    )}
                                    {sqlResult.columns.map((col: string) => (
                                      <th key={col} className="px-4 py-2.5 text-emerald-400/90 font-bold border-r border-zinc-800 last:border-r-0 bg-zinc-900">
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sqlResult.rows.map((row: any[], ri: number) => {
                                    const rowId = hasId ? String(row[idColIndex]) : '';
                                    const statusVal = statusColIndex !== -1 ? String(row[statusColIndex]) : '';
                                    const isRowUpdating = updatingRowId === rowId;

                                    return (
                                      <tr key={ri} className={`border-b border-zinc-800/40 hover:bg-zinc-800/40 transition ${ri % 2 === 0 ? '' : 'bg-zinc-900/30'}`}>
                                        <td className="px-3 py-2 text-zinc-600 border-r border-zinc-800 text-center select-none">{ri + 1}</td>

                                        {/* Coluna de Ações Rápidas */}
                                        {hasId && (
                                          <td className="px-2.5 py-1.5 border-r border-zinc-800/50 bg-zinc-950/40">
                                            <div className="flex items-center gap-1.5">
                                              {/* Botão Fechar Caixa (se status == open) */}
                                              {currentTableName === 'cash_registers' && statusVal === 'open' && (
                                                <button
                                                  onClick={() => handleCloseCashRegister(rowId)}
                                                  disabled={isRowUpdating}
                                                  title="Fechar este caixa no banco agora"
                                                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white rounded-md text-[11px] font-sans font-bold flex items-center gap-1.5 transition shadow-sm"
                                                >
                                                  {isRowUpdating ? <Loader2 size={11} className="animate-spin" /> : <LockKeyhole size={11} />}
                                                  Fechar Caixa
                                                </button>
                                              )}

                                              {/* Botão Cancelar Venda (se completed) */}
                                              {currentTableName === 'sales' && statusVal === 'completed' && (
                                                <button
                                                  onClick={() => handleCancelSale(rowId)}
                                                  disabled={isRowUpdating}
                                                  title="Cancelar esta venda no banco"
                                                  className="px-2 py-0.5 bg-red-500/20 hover:bg-red-600 border border-red-500/40 text-red-300 hover:text-white rounded text-[11px] font-sans font-semibold flex items-center gap-1 transition"
                                                >
                                                  {isRowUpdating ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                                                  Cancelar
                                                </button>
                                              )}

                                              {/* Botão Gerar UPDATE no editor */}
                                              <button
                                                onClick={() => {
                                                  const setClauses = sqlResult.columns
                                                    .filter((c: string) => c.toLowerCase() !== 'id')
                                                    .map((c: string) => {
                                                      const actualIndex = sqlResult.columns.indexOf(c);
                                                      const v = row[actualIndex];
                                                      return `${c} = ${v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`}`;
                                                    })
                                                    .join(',\n  ');
                                                  setSqlQuery(`UPDATE ${currentTableName}\nSET\n  ${setClauses}\nWHERE id = '${rowId}';`);
                                                  toast.info('Comando UPDATE carregado no editor!');
                                                }}
                                                title="Carregar UPDATE completo desta linha no editor SQL"
                                                className="p-1 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 rounded transition"
                                              >
                                                <Edit2 size={12} />
                                              </button>

                                              {/* Botão Excluir Linha */}
                                              <button
                                                onClick={() => handleDeleteRow(currentTableName, rowId)}
                                                disabled={isRowUpdating}
                                                title="Excluir este registro do banco"
                                                className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            </div>
                                          </td>
                                        )}

                                        {/* Células de Dados */}
                                        {row.map((cell: any, ci: number) => {
                                          const colName = sqlResult.columns[ci];
                                          const isEditing = editingCell?.rowIndex === ri && editingCell?.column === colName;

                                          return (
                                            <td
                                              key={ci}
                                              className="px-3 py-1.5 border-r border-zinc-800/50 last:border-r-0 max-w-xs"
                                            >
                                              {isEditing ? (
                                                <div className="flex items-center gap-1 min-w-[160px]">
                                                  <input
                                                    type="text"
                                                    value={editingCell.value}
                                                    onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                                                    onKeyDown={e => {
                                                      if (e.key === 'Enter') handleSaveInlineEdit(currentTableName);
                                                      if (e.key === 'Escape') setEditingCell(null);
                                                    }}
                                                    placeholder="Valor ou NULL"
                                                    className="bg-zinc-950 border border-emerald-500 text-white text-xs px-2 py-1 rounded outline-none w-full font-mono"
                                                    autoFocus
                                                  />
                                                  <button
                                                    onClick={() => handleSaveInlineEdit(currentTableName)}
                                                    className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition"
                                                    title="Salvar alteração (Enter)"
                                                  >
                                                    <Check size={12} />
                                                  </button>
                                                  <button
                                                    onClick={() => setEditingCell(null)}
                                                    className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded transition"
                                                    title="Cancelar (Esc)"
                                                  >
                                                    <X size={12} />
                                                  </button>
                                                </div>
                                              ) : (
                                                <div
                                                  className="flex items-center justify-between gap-1 group/cell cursor-pointer"
                                                  onDoubleClick={() => {
                                                    if (hasId && colName.toLowerCase() !== 'id') {
                                                      setEditingCell({ rowIndex: ri, column: colName, value: cell === null ? '' : String(cell), id: rowId });
                                                    }
                                                  }}
                                                  title={cell === null ? 'NULL (Duplo clique para editar)' : `${String(cell)} (Duplo clique para editar)`}
                                                >
                                                  <span className="truncate max-w-xs">
                                                    {cell === null ? (
                                                      <span className="text-zinc-600 italic">NULL</span>
                                                    ) : (colName.toLowerCase() === 'code' || colName.toLowerCase() === 'shortcode') && cell !== null && cell !== '' ? (
                                                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 font-bold rounded-md text-xs border border-blue-500/30 inline-flex items-center font-mono">
                                                        #{String(cell)}
                                                      </span>
                                                    ) : colName.toLowerCase() === 'status' && String(cell) === 'open' ? (
                                                      <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold rounded text-[10px] uppercase border border-emerald-500/30 inline-flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                        open
                                                      </span>
                                                    ) : colName.toLowerCase() === 'status' && String(cell) === 'closed' ? (
                                                      <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 font-semibold rounded text-[10px] uppercase">
                                                        closed
                                                      </span>
                                                    ) : colName.toLowerCase() === 'status' && String(cell) === 'cancelled' ? (
                                                      <span className="px-1.5 py-0.5 bg-red-500/20 text-red-300 font-semibold rounded text-[10px] uppercase">
                                                        cancelled
                                                      </span>
                                                    ) : typeof cell === 'string' && cell.startsWith('20') && cell.includes('T') ? (
                                                      <span className="text-sky-400">{new Date(cell).toLocaleString('pt-BR')}</span>
                                                    ) : typeof cell === 'number' || (!isNaN(Number(cell)) && cell !== '') ? (
                                                      <span className="text-violet-300">{String(cell)}</span>
                                                    ) : (
                                                      <span className="text-zinc-300">{String(cell)}</span>
                                                    )}
                                                  </span>
                                                  <button
                                                    onClick={e => { e.stopPropagation(); handleCopyValue(cell); }}
                                                    title="Copiar valor integral"
                                                    className="opacity-0 group-hover/cell:opacity-100 p-0.5 text-zinc-600 hover:text-zinc-200 transition shrink-0"
                                                  >
                                                    <Copy size={10} />
                                                  </button>
                                                </div>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}

                        {/* Query executada mas 0 linhas retornadas */}
                        {sqlResult?.type === 'query' && sqlResult.rowCount === 0 && (
                          <div className="flex flex-col items-center justify-center p-12 text-center">
                            <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center mb-3">
                              <CheckCircle2 className="text-zinc-500" size={24} />
                            </div>
                            <p className="text-zinc-300 font-bold text-sm">Nenhum registro encontrado</p>
                            <p className="text-zinc-500 text-xs mt-1">A consulta foi executada com sucesso em {sqlResult.durationMs}ms, mas não retornou nenhuma linha.</p>
                          </div>
                        )}

                        {/* DML result (UPDATE/DELETE/INSERT) */}
                        {sqlResult?.type === 'exec' && (
                          <div className="m-4 bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-6 flex items-center gap-4">
                            <CheckCircle2 className="text-emerald-400 shrink-0" size={32} />
                            <div>
                              <p className="text-emerald-300 font-black text-lg">{sqlResult.rowsAffected} linha{sqlResult.rowsAffected !== 1 ? 's' : ''} afetada{sqlResult.rowsAffected !== 1 ? 's' : ''}</p>
                              <p className="text-zinc-400 text-sm mt-0.5">Comando SQL executado com sucesso em {sqlResult.durationMs}ms</p>
                            </div>
                          </div>
                        )}

                        {/* Histórico recente quando não há resultado */}
                        {!sqlResult && !sqlError && !sqlLoading && sqlHistory.length > 0 && (
                          <div className="p-4">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2.5 flex items-center gap-2"><History size={11} /> Histórico de Consultas</p>
                            <div className="space-y-1">
                              {sqlHistory.map((q, i) => (
                                <div key={i} className="flex items-center gap-3 group px-2 py-1.5 rounded-lg hover:bg-zinc-800/50 transition">
                                  <span className="flex-1 text-xs font-mono text-zinc-500 truncate">{q}</span>
                                  <button onClick={() => { setSqlQuery(q); handleExecuteSql(q); }} className="text-xs text-zinc-500 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition px-2 py-0.5 rounded border border-zinc-800 hover:border-emerald-600">executar</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!sqlResult && !sqlError && !sqlLoading && sqlHistory.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                            <Terminal className="text-zinc-800 mb-3" size={40} />
                            <p className="text-zinc-500 text-sm">Selecione uma tabela ou atalho na barra lateral para consultar.</p>
                            <p className="text-zinc-700 text-xs mt-1">Você também pode digitar comandos SQL diretamente no editor.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Leads Tab — mantido igual */
              <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Leads', value: leads.length, icon: '🎯', color: 'text-amber-400', filter: '' },
                    { label: 'Em Demonstração', value: leads.filter(l => l.status === 'EM_DEMO').length, icon: '⚡', color: 'text-blue-400', filter: 'EM_DEMO' },
                    { label: 'Convertidos', value: leads.filter(l => l.status === 'CONVERTIDO').length, icon: '✅', color: 'text-emerald-400', filter: 'CONVERTIDO' },
                    { label: 'Contatados', value: leads.filter(l => l.status === 'CONTATADO').length, icon: '💬', color: 'text-purple-400', filter: 'CONTATADO' },
                  ].map(card => (
                    <div key={card.label} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4">
                      <div className="p-3 bg-zinc-800/50 rounded-xl font-bold text-lg">{card.icon}</div>
                      <div><p className="text-zinc-400 text-xs font-medium">{card.label}</p><p className={`text-2xl font-bold ${card.color}`}>{card.value}</p></div>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/30">
                    <select value={leadStatusFilter} onChange={(e) => setLeadStatusFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500">
                      <option value="">Todos ({leads.length})</option>
                      <option value="NOVO">Novos</option>
                      <option value="EM_DEMO">Em Demo</option>
                      <option value="CONTATADO">Contatados</option>
                      <option value="CONVERTIDO">Convertidos</option>
                      <option value="DESCARTADO">Descartados</option>
                    </select>
                    <button onClick={loadLeads} className="text-xs text-zinc-400 hover:text-white bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700">Atualizar</button>
                  </div>
                  <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-zinc-950/50 text-zinc-400 sticky top-0 z-10 border-b border-zinc-800">
                        <tr>
                          <th className="px-6 py-4 font-medium">Data</th>
                          <th className="px-6 py-4 font-medium">Nome</th>
                          <th className="px-6 py-4 font-medium">WhatsApp</th>
                          <th className="px-6 py-4 font-medium">Status</th>
                          <th className="px-6 py-4 font-medium text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {loadingLeads ? (
                          <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-500"><Loader2 className="animate-spin inline-block mr-2" /> Carregando...</td></tr>
                        ) : leads.length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-500">Nenhum lead encontrado.</td></tr>
                        ) : (
                          leads.map((l: any) => {
                            const cleanPhone = l.whatsapp?.replace(/\D/g, '') || '';
                            const statusColors: Record<string, string> = {
                              NOVO: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                              EM_DEMO: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                              CONTATADO: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                              CONVERTIDO: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                              DESCARTADO: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
                            };
                            return (
                              <tr key={l.id} className="hover:bg-zinc-800/30 transition">
                                <td className="px-6 py-4 text-xs text-zinc-400 font-mono">{new Date(l.createdAt).toLocaleString('pt-BR')}</td>
                                <td className="px-6 py-4 font-semibold text-zinc-200">{l.name}</td>
                                <td className="px-6 py-4 font-mono text-zinc-300">{l.whatsapp}</td>
                                <td className="px-6 py-4">
                                  <select value={l.status} onChange={(e) => updateLeadStatus(l.id, e.target.value)} className={`text-xs font-bold px-2.5 py-1 rounded-full border bg-zinc-950 focus:outline-none cursor-pointer ${statusColors[l.status] || 'bg-zinc-800 text-zinc-300'}`}>
                                    <option value="NOVO">🔍µ Novo</option>
                                    <option value="EM_DEMO">▪ Em Demo</option>
                                    <option value="CONTATADO">▪ Contatado</option>
                                    <option value="CONVERTIDO">▪ Convertido</option>
                                    <option value="DESCARTADO">— Descartado</option>
                                  </select>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {cleanPhone && (
                                    <a href={`https://wa.me/55${cleanPhone}?text=Olá%20${encodeURIComponent(l.name)},%20vi%20que%20você%20experimentou%20o%20PDV!`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm">
                                      Chamar no WhatsApp 💬
                                    </a>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* — BACKUPS STEP — */}
        {step === "backups" && (
          <div className="max-w-4xl mx-auto mt-10 animate-[fadeIn_0.3s_ease] w-full">
            <button onClick={() => setStep("list")} className="mb-4 text-zinc-400 hover:text-white flex items-center gap-2 text-sm"><ArrowRight className="rotate-180" size={16} /> Voltar para lista</button>
            <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-3"><Database className="text-blue-500" /> Gestão de Backups</h2>
                  <p className="text-xs text-zinc-400 mt-1">Gere e restaure cópias de segurança. Backups mais antigos que 7 dias são excluídos automaticamente.</p>
                </div>
                <div className="flex gap-2">
                  <button disabled={downloadingAll} onClick={async () => {
                    setDownloadingAll(true);
                    try {
                      const pin = pinDigits.join('');
                      const response = await api.get(`/sys-init/backups/download-all?pin=${pin}`, { responseType: 'blob' });
                      const url = window.URL.createObjectURL(new Blob([response.data]));
                      const link = document.createElement('a'); link.href = url;
                      link.setAttribute('download', `Backups_7bar_${new Date().getTime()}.zip`);
                      document.body.appendChild(link); link.click(); link.parentNode?.removeChild(link);
                    } catch (e) { toast.error("Erro ao baixar ZIP"); } finally { setDownloadingAll(false); }
                  }} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition border border-zinc-700">
                    {downloadingAll ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} className="rotate-180" />}
                    Baixar Todos (.zip)
                  </button>
                  <button disabled={creatingBackup} onClick={async () => {
                    if (!window.confirm("Deseja criar um backup geral de todos os bancos de dados agora?")) return;
                    setCreatingBackup(true);
                    try {
                      const pin = pinDigits.join('');
                      await api.post('/sys-init/backups/create', { type: 'all' }, { headers: { 'x-setup-pin': pin } });
                      toast.success("Backup geral criado com sucesso!"); loadBackups();
                    } catch (e: any) { toast.error(e.response?.data?.message || "Erro ao criar backup"); } finally { setCreatingBackup(false); }
                  }} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition">
                    {creatingBackup ? <Loader2 className="animate-spin" size={18} /> : 'Gerar Backup Geral'}
                  </button>
                </div>
              </div>

              <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-2xl p-4 mb-6 flex items-center justify-between">
                <div><h3 className="font-bold text-white mb-1">Rotina Automática Diária</h3><p className="text-xs text-zinc-400">Gere um backup geral automaticamente num horário fixo.</p></div>
                <div className="flex items-center gap-4">
                  {backupSchedule.enabled && (
                    <input type="time" value={backupSchedule.time} onChange={(e) => setBackupSchedule({ ...backupSchedule, time: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
                  )}
                  <button disabled={savingSchedule} onClick={async () => {
                    setSavingSchedule(true);
                    try {
                      const pin = pinDigits.join(''); const newEnabled = !backupSchedule.enabled;
                      const payload = { ...backupSchedule, enabled: newEnabled };
                      await api.post('/sys-init/backups/schedule', payload, { headers: { 'x-setup-pin': pin } });
                      setBackupSchedule(payload); toast.success(`Rotina ${newEnabled ? 'ativada' : 'desativada'} com sucesso!`);
                    } catch (e) { toast.error("Erro ao salvar rotina"); } finally { setSavingSchedule(false); }
                  }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-sm transition ${backupSchedule.enabled ? 'bg-blue-600/20 text-blue-400' : 'bg-zinc-700/50 text-zinc-400'}`}>
                    {savingSchedule ? <Loader2 className="animate-spin" size={16} /> : (backupSchedule.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />)}
                    {backupSchedule.enabled ? 'Ativada' : 'Desativada'}
                  </button>
                  {backupSchedule.enabled && (
                    <button onClick={async () => {
                      setSavingSchedule(true);
                      try { const pin = pinDigits.join(''); await api.post('/sys-init/backups/schedule', backupSchedule, { headers: { 'x-setup-pin': pin } }); toast.success("Horário salvo!"); }
                      catch (e) { toast.error("Erro ao salvar"); } finally { setSavingSchedule(false); }
                    }} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition">Salvar Hora</button>
                  )}
                </div>
              </div>

              {loadingBackups ? (
                <div className="py-12 text-center text-zinc-500"><Loader2 className="animate-spin inline-block mr-2" /> Carregando backups...</div>
              ) : backupsList.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 bg-zinc-950/50 rounded-xl border border-zinc-800/50">Nenhum backup encontrado.</div>
              ) : (
                <div className="space-y-4">
                  {backupsList.map((group, i) => (
                    <div key={i} className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/50 transition">
                      <button onClick={() => setExpandedFolder(expandedFolder === group.folderName ? null : group.folderName)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-800/30 transition text-left">
                        <div className="flex items-center gap-3">
                          <Database size={20} className={group.isHeart ? 'text-rose-400' : 'text-blue-400'} />
                          <div>
                            <p className="font-bold text-zinc-200">{group.isHeart ? 'Sistema Central (Heart)' : `Tenant: ${group.tenantName}`}</p>
                            <p className="text-xs text-zinc-500">{group.files.length} arquivo(s)</p>
                          </div>
                        </div>
                        <ArrowRight size={18} className={`text-zinc-500 transition-transform ${expandedFolder === group.folderName ? '-rotate-90' : 'rotate-90'}`} />
                      </button>
                      {expandedFolder === group.folderName && (
                        <div className="border-t border-zinc-800 bg-zinc-950/80">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-zinc-900/30 text-zinc-500"><tr>
                              <th className="px-6 py-3 font-medium">Arquivo</th>
                              <th className="px-6 py-3 font-medium">Tamanho</th>
                              <th className="px-6 py-3 font-medium">Data</th>
                              <th className="px-6 py-3 font-medium text-right">Ações</th>
                            </tr></thead>
                            <tbody className="divide-y divide-zinc-800/50">
                              {group.files.map((file: any, j: number) => (
                                <tr key={j} className="hover:bg-zinc-800/40 transition">
                                  <td className="px-6 py-3 font-mono text-xs text-zinc-400">Backup_{group.isHeart ? 'Heart' : group.tenantName}.sql</td>
                                  <td className="px-6 py-3 text-zinc-500">{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</td>
                                  <td className="px-6 py-3 text-zinc-500">{new Date(file.createdAt).toLocaleString('pt-BR')}</td>
                                  <td className="px-6 py-3 text-right">
                                    <div className="flex justify-end gap-1">
                                      <button onClick={async () => {
                                        try { const pin = pinDigits.join(''); const response = await api.get(`/sys-init/backups/download/${file.path}?pin=${pin}`, { responseType: 'blob' });
                                          const url = window.URL.createObjectURL(new Blob([response.data])); const link = document.createElement('a'); link.href = url;
                                          link.setAttribute('download', file.filename); document.body.appendChild(link); link.click(); link.parentNode?.removeChild(link);
                                        } catch (e) { toast.error("Erro ao fazer download"); }
                                      }} className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Download"><Upload size={16} className="rotate-180" /></button>
                                      <button onClick={async () => {
                                        if (!window.confirm(`⚠️ï¸ Restaurar o backup? Os dados atuais serão substituídos irrevogavelmente.`)) return;
                                        try { const pin = pinDigits.join(''); await api.post(`/sys-init/backups/restore/${file.path}`, {}, { headers: { 'x-setup-pin': pin } }); toast.success("Backup restaurado!"); }
                                        catch (e: any) { toast.error(e.response?.data?.message || "Erro ao restaurar backup"); }
                                      }} className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition" title="Restaurar"><ArrowRight size={16} /></button>
                                      <button onClick={async () => {
                                        if (!window.confirm("Deseja excluir este backup?")) return;
                                        try { const pin = pinDigits.join(''); await api.delete(`/sys-init/backups/${file.path}`, { headers: { 'x-setup-pin': pin } }); loadBackups(); }
                                        catch (e: any) { toast.error("Erro ao excluir backup"); }
                                      }} className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition" title="Excluir"><Trash2 size={16} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* — CREATE STEP — */}
        {step === "create" && (
          <div className="max-w-md mx-auto mt-20 animate-[fadeIn_0.4s_ease]">
            <button onClick={() => setStep("list")} className="mb-4 text-zinc-400 hover:text-white flex items-center gap-2 text-sm"><ArrowRight className="rotate-180" size={16} /> Voltar para lista</button>
            <div className="p-8 rounded-3xl bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 shadow-2xl">
              <h1 className="text-2xl font-bold tracking-tight mb-6">Novo Tenant</h1>
              <form onSubmit={handleProvision} className="space-y-4">
                <div><label className="text-xs text-zinc-400 uppercase">Empresa</label><input required value={tenantName} onChange={e => setTenantName(e.target.value)} className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-xl mt-1 text-white" /></div>
                <div><label className="text-xs text-zinc-400 uppercase">Banco (gerado)</label><input required value={dbName} onChange={e => { setDbName(e.target.value); setDbNameManual(true); }} className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-xl mt-1 text-white font-mono text-sm" /></div>
                <div><label className="text-xs text-zinc-400 uppercase">Admin Nome</label><input required value={adminName} onChange={e => setAdminName(e.target.value)} className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-xl mt-1 text-white" /></div>
                <div><label className="text-xs text-zinc-400 uppercase">Admin Email</label><input type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-xl mt-1 text-white" /></div>
                <div><label className="text-xs text-zinc-400 uppercase">Senha</label><input type="password" required value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-xl mt-1 text-white" /></div>
                <div><label className="text-xs text-zinc-400 uppercase">Confirmar Senha</label><input type="password" required value={adminPasswordConfirm} onChange={e => setAdminPasswordConfirm(e.target.value)} className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-xl mt-1 text-white" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Mensalidade (R$)</label>
                    <input type="number" step="0.01" placeholder="0.00" value={mensalidadeValor} onChange={e => setMensalidadeValor(e.target.value)} className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-2xl mt-1 text-white font-bold focus:border-violet-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">1Âº Vencimento</label>
                    <input type="date" value={mensalidadeVencimento} onChange={e => setMensalidadeVencimento(e.target.value)} className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-2xl mt-1 text-white font-bold focus:border-violet-500 outline-none [color-scheme:dark]" />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                  <button type="button" onClick={() => setSeedProducts(!seedProducts)} className={`transition-colors ${seedProducts ? 'text-emerald-500' : 'text-zinc-600'}`}>
                    {seedProducts ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                  <div><p className="text-sm font-semibold text-zinc-200">Produtos Base</p><p className="text-xs text-zinc-500">Popular banco de dados com produtos padrão.</p></div>
                </div>
                {formError && <div className="text-red-400 text-sm">{formError}</div>}
                <button type="submit" disabled={formLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl mt-4">
                  {formLoading ? <Loader2 className="animate-spin mx-auto" /> : "Provisionar"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* — EDIT STEP — */}
        {step === "edit" && editingTenant && (
          <div className="max-w-2xl mx-auto mt-10 animate-[fadeIn_0.3s_ease] w-full">
            <button onClick={() => setStep("list")} className="mb-4 text-zinc-400 hover:text-white flex items-center gap-2 text-sm"><ArrowRight className="rotate-180" size={16} /> Voltar para lista</button>
            <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {editingTenant.logoUrl ? (
                    <img src={getFullUrl(editingTenant.logoUrl)} alt="Logo" className="w-10 h-10 rounded-xl object-contain border border-zinc-700 bg-zinc-950" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center font-bold text-violet-400">
                      {(editingTenant.name || editingTenant.nomeFantasia)?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold">{editingTenant.name || editingTenant.nomeFantasia}</h2>
                    <span className="text-xs font-mono text-zinc-500">{editingTenant.databaseName}</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${editingTenant.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-700 text-zinc-400 border-zinc-600'}`}>
                  {editingTenant.status === 'active' ? 'Ativo' : editingTenant.status === 'suspended' ? 'Suspenso' : 'Inativo'}
                </span>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-zinc-800 bg-zinc-950/50 overflow-x-auto">
                {[
                  { id: 'identidade', label: 'Identidade', icon: Building2 },
                  { id: 'modulos', label: 'Módulos', icon: Settings },
                  { id: 'fiscal', label: 'Fiscal', icon: FileText },
                  { id: 'financeiro', label: 'Financeiro', icon: CreditCard },
                  { id: 'integracoes', label: 'Integrações', icon: ArrowRight },
                  { id: 'usuarios', label: 'Usuários', icon: Users },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={async () => {
                      setEditTab(tab.id as any);
                      setSelectedIntegration(null);
                      if (tab.id === 'usuarios') {
                        setLoadingUsers(true);
                        try {
                          const pin = pinDigits.join('');
                          const res = await api.get(`/tenants/setup/${editingTenant.id}/users`, { headers: { 'x-setup-pin': pin } });
                          setTenantUsers(res.data);
                        } catch (e) { toast.error("Erro ao carregar usuários"); }
                        finally { setLoadingUsers(false); }
                      }
                      if (tab.id === 'financeiro') {
                        loadPaymentHistory(editingTenant.id);
                      }
                    }}
                    className={`flex-shrink-0 px-4 py-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${editTab === tab.id ? 'border-violet-500 text-violet-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <tab.icon size={13} />{tab.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="p-6 flex-1">
                {/* TAB: Identidade */}
                {editTab === 'identidade' && (
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs text-zinc-400 uppercase tracking-wider mb-2 block">Logotipo (White Label)</label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-center overflow-hidden">
                          {logoFile ? (
                            <img src={URL.createObjectURL(logoFile)} alt="Preview" className="w-full h-full object-cover" />
                          ) : editingTenant.logoUrl ? (
                            <img src={getFullUrl(editingTenant.logoUrl)} alt="Logo" className="w-full h-full object-contain p-1" />
                          ) : (
                            <ImageIcon size={30} className="text-zinc-700" />
                          )}
                        </div>
                        <div className="flex-1">
                          <label className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl cursor-pointer transition text-sm flex items-center gap-2 w-max">
                            <Upload size={16} /> Fazer Upload
                            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files && setLogoFile(e.target.files[0])} />
                          </label>
                          <p className="text-xs text-zinc-500 mt-2">Recomendado: PNG ou SVG transparente, proporção horizontal.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1.5 block">Nome Fantasia</label>
                        <input type="text" value={editingTenant.nomeFantasia || editingTenant.name || ''} onChange={e => setEditingTenant({...editingTenant, nomeFantasia: e.target.value})} className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:border-violet-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1.5 block">Status</label>
                        <select value={editingTenant.status} onChange={e => setEditingTenant({...editingTenant, status: e.target.value})} className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:border-violet-500 outline-none">
                          <option value="active">✅ Ativo</option>
                          <option value="paused">— Pausado (retorna em breve)</option>
                          <option value="suspended">⚠️ï¸ Suspenso (inadimplente)</option>
                          <option value="inactive">— Inativo</option>
                        </select>
                      </div>
                    </div>

                    {/* Contato */}
                    <div className="border-t border-zinc-800 pt-4">
                      <p className="text-xs text-zinc-400 uppercase tracking-wider mb-3 font-bold flex items-center gap-2"><Phone size={12} /> Contato do Cliente</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Telefone de Contato</label>
                          <div className="relative">
                            <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input type="text" placeholder="(11) 99999-9999" value={editingTenant.telefoneContato || ''} onChange={e => setEditingTenant({...editingTenant, telefoneContato: e.target.value})} className="w-full p-3 pl-9 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:border-violet-500 outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">E-mail de Contato</label>
                          <div className="relative">
                            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input type="email" placeholder="contato@empresa.com" value={editingTenant.emailContato || ''} onChange={e => setEditingTenant({...editingTenant, emailContato: e.target.value})} className="w-full p-3 pl-9 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:border-violet-500 outline-none" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Observações */}
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1.5"><Info size={12} /> Observações Internas</label>
                      <textarea rows={3} placeholder="Notas sobre o cliente, acordos especiais, etc..." value={editingTenant.observacoes || ''} onChange={e => setEditingTenant({...editingTenant, observacoes: e.target.value})} className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:border-violet-500 outline-none resize-none text-sm" />
                    </div>
                  </div>
                )}

                {/* TAB: Módulos */}
                {editTab === 'modulos' && (
                  <div className="space-y-4">
                    <p className="text-zinc-400 text-sm mb-4">Habilite ou desabilite os recursos (Feature Flags) para este cliente.</p>
                    {[                      { id: 'nfce', title: 'NFC-e / Emissão Fiscal', desc: 'Permite a emissão de cupons fiscais eletrÃ´nicos (NFC-e).', badge: MODULE_BADGES.nfce },
                      { id: 'importacaoXml', title: 'Entrada por XML (Upload Manual)', desc: 'Permite a importação manual de arquivos XML de NF-e.', badge: MODULE_BADGES.importacaoXml },
                      { id: 'estoque', title: 'Estoque', desc: 'Módulo completo de controle de produtos e inventário.', badge: MODULE_BADGES.estoque },
                      { id: 'dashboardMobile', title: 'Dashboard Mobile', desc: 'Acesso ao painel resumido em dispositivos móveis.', badge: MODULE_BADGES.dashboardMobile },
                      { id: 'comandas', title: 'Comandas & Mesas', desc: 'Permite o lançamento, abertura e consumo em comandas/mesas.', badge: MODULE_BADGES.comandas },
                      { id: 'vitrineDigital', title: '▪ Vitrine Digital TV', desc: 'Exibe promoções e produtos em uma TV/tela secundária via URL pública.', badge: MODULE_BADGES.vitrineDigital },                      { id: 'petshop', title: '🐾 Gestão Pet Shop', desc: 'Ativa o ambiente exclusivo de tutores, pets, vacinas, serviços e agenda. O PDV atual permanece preservado.', badge: MODULE_BADGES.petshop },
                    ].map(item => (
                      <div key={item.id} className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-zinc-700 transition">
                        <div className="flex items-center gap-3">
                          {item.badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${item.badge.color}`}>{item.badge.label}</span>}
                          <div>
                            <p className="font-semibold text-zinc-200">{item.title}</p>
                            <p className="text-xs text-zinc-500">{item.desc}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label={item.title}
                          aria-checked={modulos[item.id] === true}
                          disabled={modulos.food === true && ['kds', 'restaurante', 'comandas', 'petshop'].includes(item.id)}
                          title={modulos.food === true && ['kds', 'restaurante', 'comandas'].includes(item.id) ? 'Incluído no pacote PRACT FOOD' : undefined}
                          onClick={() => {
                            if (item.id === 'food' && modulos.food !== true) {
                              if (modulos.petshop === true) { toast.error('Desative o Pet Shop antes de habilitar o ambiente FOOD.'); return; }
                              setModulos({ ...modulos, food: true, kds: true, restaurante: true, comandas: true });
                            } else setModulos({ ...modulos, [item.id]: !modulos[item.id] });
                          }}
                          className={`transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${modulos[item.id] ? 'text-violet-500' : 'text-zinc-600'}`}>
                          {modulos[item.id] ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB: Fiscal */}
                {editTab === 'fiscal' && (
                  <div className="space-y-5">
                    <p className="text-sm text-zinc-400 border-b border-zinc-800 pb-3">Estes dados serão injetados no motor fiscal.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-xs text-zinc-400 uppercase">CNPJ</label><input type="text" value={editingTenant.cnpj || ''} onChange={e => setEditingTenant({...editingTenant, cnpj: e.target.value})} className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm mt-1" /></div>
                      <div><label className="text-xs text-zinc-400 uppercase">Ambiente NFC-e</label>
                        <select value={editingTenant.nfceAmbiente || 2} onChange={e => setEditingTenant({...editingTenant, nfceAmbiente: Number(e.target.value)})} className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm mt-1">
                          <option value={1}>1 - Produção</option>
                          <option value={2}>2 - Homologação</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: Financeiro */}
                {editTab === 'financeiro' && (
                  <div className="space-y-6">
                    {/* Analytics de cliente */}
                    {(() => {
                      const totalPago = paymentHistory.reduce((sum: number, log: any) => sum + Number(log.valor || 0), 0);
                      const ultimoPag = paymentHistory[0];
                      const mesesConosco = editingTenant?.createdAt
                        ? Math.max(1, Math.round((Date.now() - new Date(editingTenant.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)))
                        : null;
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-violet-500/5 border border-violet-500/15 rounded-2xl p-3 text-center">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Cliente há</p>
                            <p className="text-xl font-black text-violet-300">{mesesConosco ?? '—'}</p>
                            <p className="text-[10px] text-zinc-600">meses</p>
                          </div>
                          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-3 text-center">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Total pago</p>
                            <p className="text-lg font-black text-emerald-300">{totalPago > 0 ? `R$ ${totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p>
                            <p className="text-[10px] text-zinc-600">{paymentHistory.length} pagamentos</p>
                          </div>
                          <div className="bg-blue-500/5 border border-blue-500/15 rounded-2xl p-3 text-center">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Média mensal</p>
                            <p className="text-lg font-black text-blue-300">{mesesConosco && totalPago > 0 ? `R$ ${(totalPago / mesesConosco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p>
                            <p className="text-[10px] text-zinc-600">por mês</p>
                          </div>
                          <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-2xl p-3 text-center">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Último pag.</p>
                            <p className="text-sm font-black text-zinc-300">{ultimoPag ? new Date(ultimoPag.createdAt).toLocaleDateString('pt-BR') : '—'}</p>
                            <p className="text-[10px] text-zinc-600">{ultimoPag ? `R$ ${Number(ultimoPag.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Nenhum'}</p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Valor e Vencimento */}
                    <div>
                      <p className="text-sm text-zinc-400 mb-4">Configure o valor e a data do próximo vencimento da mensalidade.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1.5 block font-bold">Valor da Mensalidade (R$)</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-3.5 text-zinc-500 font-bold text-base">R$</span>
                            <input type="number" step="0.01" placeholder="0.00" value={editingTenant.mensalidadeValor || ''} onChange={e => setEditingTenant({...editingTenant, mensalidadeValor: e.target.value})} className="w-full p-3.5 pl-11 bg-zinc-950 border border-zinc-800 rounded-2xl text-white font-bold text-lg focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1.5 block font-bold">Próximo Vencimento</label>
                          <input type="date"
                            value={editingTenant.mensalidadeVencimento ? new Date(editingTenant.mensalidadeVencimento).toISOString().split('T')[0] : ''}
                            onChange={e => setEditingTenant({...editingTenant, mensalidadeVencimento: e.target.value ? parseDateLocal(e.target.value).toISOString() : null})}
                            className="w-full p-3.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-white font-bold text-base focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none [color-scheme:dark]" />
                        </div>
                      </div>

                      {/* Atalhos Rápidos */}
                      <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-4 mt-4 space-y-2">
                        <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider block">Definir Vencimento Rápido:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: '+30 Dias', action: () => { const d = new Date(); d.setDate(d.getDate() + 30); return d; } },
                            { label: 'Dia 05 Prox.', action: () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(5); return d; } },
                            { label: 'Dia 10 Prox.', action: () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(10); return d; } },
                            { label: 'Dia 15 Prox.', action: () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(15); return d; } },
                          ].map((preset, idx) => (
                            <button key={idx} type="button" onClick={() => setEditingTenant({ ...editingTenant, mensalidadeVencimento: preset.action().toISOString() })} className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded-xl text-xs font-bold text-violet-300 transition active:scale-95 cursor-pointer text-center">
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Registrar Pagamento */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4">
                      <h3 className="font-bold text-emerald-400 mb-3 flex items-center gap-2"><DollarSign size={16} /> Registrar Pagamento Recebido</h3>
                      <div className="space-y-3">
                        <input type="text" placeholder="Observação (opcional, ex: Pix recebido)" value={paymentObservacao} onChange={e => setPaymentObservacao(e.target.value)} className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white text-sm focus:border-emerald-500 outline-none" />
                        <button disabled={registeringPayment} onClick={() => handleRegistrarPagamento(editingTenant.id, paymentObservacao)} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
                          {registeringPayment ? <Loader2 className="animate-spin" size={18} /> : <><DollarSign size={18} /> Confirmar Pagamento & Avançar Vencimento</>}
                        </button>
                      </div>
                    </div>

                    {/* Histórico */}
                    <div>
                      <h3 className="font-bold text-zinc-300 mb-3 flex items-center gap-2"><History size={16} /> Histórico de Pagamentos</h3>
                      {loadingPaymentHistory ? (
                        <div className="text-center py-6 text-zinc-500"><Loader2 className="animate-spin inline-block" /></div>
                      ) : paymentHistory.length === 0 ? (
                        <div className="text-center py-6 text-zinc-600 bg-zinc-950/50 rounded-xl border border-zinc-800 text-sm">Nenhum pagamento registrado ainda.</div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                          {paymentHistory.map((log: any, i) => (
                            <div key={log.id || i} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><DollarSign size={14} className="text-emerald-400" /></div>
                                <div>
                                  <p className="text-sm font-semibold text-zinc-200">R$ {Number(log.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                  {log.observacao && <p className="text-xs text-zinc-500">{log.observacao}</p>}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-zinc-400 font-mono">{new Date(log.createdAt).toLocaleDateString('pt-BR')}</p>
                                <p className="text-[10px] text-zinc-600">→ venc: {new Date(log.vencimentoApos).toLocaleDateString('pt-BR')}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: Integrações */}
                {editTab === 'integracoes' && (
                  <div className="space-y-4">
                    {!selectedIntegration ? (
                      <>
                        <p className="text-sm text-zinc-400 mb-2">Selecione o provedor para configurar a integração deste cliente.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button onClick={async () => {
                            const existing = editingTenant?.tenantIntegrations?.find((i: any) => i.provider === 'ifood');
                            if (existing?.credentials) {
                              setIntegrationCreds({ ...existing.credentials, allowedCategories: existing.credentials.allowedCategories || [], priceMarkup: existing.credentials.priceMarkup || 0, syncStock: existing.credentials.syncStock || false });
                            } else {
                              setIntegrationCreds({ clientId: '', clientSecret: '', merchantId: '', allowedCategories: [], priceMarkup: 0, syncStock: false });
                            }
                            try {
                              const pin = pinDigits.join('');
                              const res = await api.get(`/tenants/setup/${editingTenant.id}/categories`, { headers: { 'x-setup-pin': pin } });
                              setTenantCategories(res.data);
                            } catch (e) { console.error("Erro ao buscar categorias:", e); }
                            setSelectedIntegration('ifood');
                          }} className="bg-zinc-950 border border-zinc-800 hover:border-red-500/50 rounded-2xl p-5 flex items-center gap-4 transition-colors group text-left">
                            <div className="w-14 h-14 bg-red-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg group-hover:scale-105 transition-transform">iFood</div>
                            <div><h3 className="font-bold text-white">Integração iFood</h3><p className="text-xs text-zinc-400 mt-1">Conectar ao portal do parceiro</p></div>
                          </button>
                          <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-2xl p-5 flex items-center gap-4 opacity-50 cursor-not-allowed">
                            <div className="w-14 h-14 bg-orange-500 rounded-xl flex items-center justify-center font-bold text-white shadow-lg">Rappi</div>
                            <div><h3 className="font-bold text-white">Integração Rappi</h3><p className="text-xs text-zinc-400 mt-1">Em breve</p></div>
                          </div>
                        </div>
                      </>
                    ) : selectedIntegration === 'ifood' ? (
                      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
                        <div className="flex items-center gap-4 mb-4">
                          <button onClick={() => setSelectedIntegration(null)} className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"><ArrowRight className="rotate-180" size={20} /></button>
                          <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg">iFood</div>
                          <div><h3 className="font-bold text-white text-lg">Integração iFood</h3><p className="text-xs text-zinc-400">Insira as chaves de API do cliente</p></div>
                        </div>
                        <div className="space-y-3">
                          <div><label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Client ID</label><input type="text" value={integrationCreds.clientId} onChange={e => setIntegrationCreds({...integrationCreds, clientId: e.target.value})} placeholder="Cole o Client ID" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:border-red-500 outline-none text-sm" /></div>
                          <div><label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Client Secret</label><input type="password" value={integrationCreds.clientSecret} onChange={e => setIntegrationCreds({...integrationCreds, clientSecret: e.target.value})} placeholder="Cole o Client Secret" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:border-red-500 outline-none text-sm" /></div>
                          <div><label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Merchant ID</label><input type="text" value={integrationCreds.merchantId} onChange={e => setIntegrationCreds({...integrationCreds, merchantId: e.target.value})} placeholder="Cole o ID da Loja" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:border-red-500 outline-none text-sm" /></div>
                          <button disabled={editLoading} onClick={handleSaveIntegration} className="w-full mt-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
                            {editLoading ? 'Salvando...' : 'Conectar ao iFood'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* TAB: Usuários */}
                {editTab === 'usuarios' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-zinc-400">Gerencie senhas e acessos da equipe do cliente.</p>
                      <button
                        onClick={() => setShowCreateUser(!showCreateUser)}
                        className="px-4 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition flex items-center gap-1.5"
                      >
                        {showCreateUser ? <X size={14} /> : <UserPlus size={14} />}
                        {showCreateUser ? 'Cancelar' : 'Novo Usuário'}
                      </button>
                    </div>

                    {showCreateUser && (
                      <div className="bg-zinc-950 border border-violet-500/30 rounded-xl p-4 space-y-3 animate-[fadeIn_0.2s_ease]">
                        <h4 className="text-sm font-bold text-violet-400 flex items-center gap-2"><UserPlus size={14} /> Criar Novo Usuário</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">Nome</label>
                            <input type="text" placeholder="Ex: João Estoquista" value={newUserForm.name} onChange={e => setNewUserForm({...newUserForm, name: e.target.value})} className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:border-violet-500 outline-none" />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">Email (Login)</label>
                            <input type="email" placeholder="estoquista@loja.com" value={newUserForm.email} onChange={e => setNewUserForm({...newUserForm, email: e.target.value})} className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:border-violet-500 outline-none" />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">Senha</label>
                            <input type="password" placeholder="Senha de acesso" value={newUserForm.password} onChange={e => setNewUserForm({...newUserForm, password: e.target.value})} className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:border-violet-500 outline-none" />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">Perfil de Acesso</label>
                            <select value={newUserForm.role} onChange={e => setNewUserForm({...newUserForm, role: e.target.value})} className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm focus:border-violet-500 outline-none">
                              <option value="operator">▪ Operador (Caixa PDV)</option>
                              <option value="stockist">▪ Estoquista (Catálogo & Estoque)</option>
                              <option value="admin">👍‘ Administrador (Acesso Total)</option>
                            </select>
                          </div>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-[11px] text-zinc-500 space-y-1">
                          {newUserForm.role === 'stockist' && <p>▪ <strong className="text-blue-400">Estoquista</strong>: Acessa somente Catálogo, Estoque, Categorias, Entrada e Edição em Massa. Sem acesso ao PDV, Analytics ou Financeiro. Não pode alterar preço de venda.</p>}
                          {newUserForm.role === 'operator' && <p>▪ <strong className="text-zinc-300">Operador</strong>: Acessa o PDV (frente de caixa). Não acessa o Dashboard administrativo.</p>}
                          {newUserForm.role === 'admin' && <p>👍‘ <strong className="text-violet-400">Administrador</strong>: Acesso total ao PDV e Dashboard (Analytics, Estoque, Financeiro, Configurações).</p>}
                        </div>
                        <button
                          disabled={editLoading || !newUserForm.name || !newUserForm.email || !newUserForm.password}
                          onClick={async () => {
                            try {
                              setEditLoading(true);
                              const pinSetup = pinDigits.join('');
                              await api.post(`/tenants/setup/${editingTenant.id}/users`, newUserForm, { headers: { 'x-setup-pin': pinSetup } });
                              toast.success(`Usuário ${newUserForm.name} criado com sucesso!`);
                              setShowCreateUser(false);
                              setNewUserForm({ name: '', email: '', password: '', role: 'operator' });
                              // Recarregar lista de usuários
                              const { data: users } = await api.get(`/tenants/setup/${editingTenant.id}/users`, { headers: { 'x-setup-pin': pinSetup } });
                              setTenantUsers(users);
                            } catch (e: any) {
                              toast.error(e.response?.data?.message || 'Erro ao criar usuário');
                            } finally {
                              setEditLoading(false);
                            }
                          }}
                          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
                        >
                          {editLoading ? 'Criando...' : 'Criar Usuário'}
                        </button>
                      </div>
                    )}

                    {loadingUsers ? (
                      <div className="text-center py-10 text-zinc-500"><Loader2 className="animate-spin inline-block mx-auto" size={24} /></div>
                    ) : tenantUsers.length === 0 ? (
                      <div className="text-center py-10 text-zinc-500">Nenhum usuário encontrado.</div>
                    ) : (
                      <div className="space-y-3">
                        {tenantUsers.map(user => (
                          <div key={user.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-zinc-200 flex items-center gap-2">
                                {user.name}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${user.role === 'admin' ? 'bg-violet-900/30 text-violet-400 border-violet-800' : user.role === 'stockist' ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>{user.role === 'stockist' ? '▪ estoquista' : user.role}</span>
                                {!user.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-800">Inativo</span>}
                              </p>
                              <p className="text-xs text-zinc-500">{user.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={async () => {
                                const pinSetup = pinDigits.join('');
                                const novaSenha = window.prompt(`Nova SENHA DE LOGIN para ${user.name}:`);
                                if (novaSenha) {
                                  try { await api.patch(`/tenants/setup/${editingTenant.id}/users/${user.id}/password`, { password: novaSenha }, { headers: { 'x-setup-pin': pinSetup } }); toast.success("Senha alterada!"); }
                                  catch (e: any) { toast.error(e.response?.data?.message || "Erro ao alterar senha"); }
                                }
                              }} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition">Senha Login</button>
                              <button onClick={async () => {
                                const pinSetup = pinDigits.join('');
                                const novoPin = window.prompt(`Novo PIN DO CAIXA para ${user.name} (ex: 1234):`);
                                if (novoPin) {
                                  try { await api.patch(`/tenants/setup/${editingTenant.id}/users/${user.id}/pin`, { pin: novoPin }, { headers: { 'x-setup-pin': pinSetup } }); toast.success("PIN alterado!"); }
                                  catch (e: any) { toast.error(e.response?.data?.message || "Erro ao alterar PIN"); }
                                }
                              }} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition">PIN Caixa</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                <button onClick={() => setStep("list")} className="px-5 py-2.5 rounded-xl font-medium text-zinc-400 hover:text-white transition">Cancelar</button>
                <button onClick={handleSaveEdit} disabled={editLoading} className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition">
                  {editLoading ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* — SUCCESS STEP — */}
        {step === "success" && successData && (
          <div className="max-w-md mx-auto mt-20 animate-[fadeIn_0.5s_ease] text-center">
            <div className="p-8 rounded-3xl bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 shadow-2xl">
              <CheckCircle2 size={50} className="text-emerald-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">Tenant Criado!</h1>
              <p className="text-zinc-400 text-sm mb-6">{successData.tenant?.name} pronto para uso.</p>
              <button onClick={() => { setStep("list"); loadTenants(); }} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 rounded-xl">Voltar para o Painel</button>
            </div>
          </div>
        )}

        {/* MODAL MIGRAÇÃO */}
        {migrationModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/40">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2 text-violet-400"><Database size={20} /> Migração de Bancos de Dados</h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    {includeHeart
                      ? `Atualizando ${migrationResults.length} banco(s): Heart (master) + tenants selecionados`
                      : `Atualizando estrutura e schemas do Prisma nos ${migrationResults.length} tenant(s) selecionado(s)`
                    }
                  </p>
                </div>
                {!migrating && (
                  <button onClick={() => { setMigrationModalOpen(false); setMigrationResults([]); setActiveLogTenantId(null); }} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition"><X size={20} /></button>
                )}
              </div>
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {migrationResults.map((result) => {
                  const isActiveLog = activeLogTenantId === result.tenantId;
                  return (
                    <div key={result.tenantId} className={`border rounded-xl overflow-hidden transition ${
                      result.tenantId === '__heart__'
                        ? 'border-rose-500/30 bg-rose-950/20'
                        : 'border-zinc-800 bg-zinc-950/40'
                    }`}>
                      <div onClick={() => result.output && setActiveLogTenantId(isActiveLog ? null : result.tenantId)} className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/20 transition">
                        <div className="flex items-center gap-3">
                          {result.status === 'processing' && <Loader2 className="animate-spin text-violet-400" size={18} />}
                          {result.status === 'success' && <CheckCircle2 className="text-emerald-400" size={18} />}
                          {result.status === 'error' && <AlertCircle className="text-red-400" size={18} />}
                          <div>
                            <p className="font-semibold text-sm text-zinc-200">{result.name}</p>
                            <p className="text-xs text-zinc-500">Banco: {result.databaseName || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border ${result.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : result.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                            {result.status === 'success' ? 'Sucesso' : result.status === 'error' ? 'Falhou' : 'Processando...'}
                          </span>
                          {result.output && <span className="text-zinc-500">{isActiveLog ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>}
                        </div>
                      </div>
                      {isActiveLog && result.output && (
                        <div className="px-4 pb-4 border-t border-zinc-800 bg-zinc-950">
                          <div className="flex items-center gap-2 py-2 text-xs font-mono text-zinc-400 border-b border-zinc-900 mb-2"><Terminal size={12} /><span>Console Log</span></div>
                          <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap max-h-60 overflow-y-auto p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 custom-scrollbar">{result.output}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
                <button disabled={migrating} onClick={() => { setMigrationModalOpen(false); setMigrationResults([]); setActiveLogTenantId(null); }} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold transition">
                  {migrating ? 'Migrando bancos...' : 'Fechar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CRIAR GRUPO */}
        {isCreateGroupOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/40">
                <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400">Novo Grupo</h2>
                <button onClick={() => setIsCreateGroupOpen(false)} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition"><X size={20} /></button>
              </div>
              <form onSubmit={handleCreateGroup} className="p-6 space-y-4">
                <div>
                  <label className="text-xs text-zinc-400 uppercase">Nome do Grupo</label>
                  <input required value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-xl mt-1 text-white focus:border-emerald-500 outline-none" placeholder="Ex: Rede XYZ" />
                </div>
                <button type="submit" disabled={creatingGroup} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition mt-4">
                  {creatingGroup ? <Loader2 className="animate-spin mx-auto" /> : "Criar Grupo"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODAL GERENCIAR GRUPO */}
        {selectedGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/40">
                <h2 className="text-xl font-bold flex items-center gap-2 text-violet-400">Gerenciar Grupo: {selectedGroup.name}</h2>
                <button onClick={() => { setSelectedGroup(null); loadGroups(); }} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition"><X size={20} /></button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-bold text-zinc-200 border-b border-zinc-800 pb-2">Membros (Tenants)</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {selectedGroup.members?.map((m: any) => (
                      <div key={m.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-zinc-200 text-sm">{m.tenant?.name || m.tenant?.nomeFantasia}</p>
                          {m.alias && <p className="text-xs text-zinc-500">Alias: {m.alias}</p>}
                        </div>
                      </div>
                    ))}
                    {(!selectedGroup.members || selectedGroup.members.length === 0) && <p className="text-zinc-500 text-sm italic">Nenhum membro neste grupo.</p>}
                  </div>
                  <form onSubmit={handleAddGroupMember} className="bg-zinc-950/50 p-4 border border-zinc-800 rounded-xl space-y-3 mt-4">
                    <h4 className="text-sm font-bold text-zinc-300">Adicionar Membro</h4>
                    <select required value={newMemberTenantId} onChange={e => setNewMemberTenantId(e.target.value)} className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none">
                      <option value="">Selecione um Tenant...</option>
                      {tenants.map(t => <option key={t.id} value={t.id}>{t.name || t.nomeFantasia}</option>)}
                    </select>
                    <input type="text" value={newMemberAlias} onChange={e => setNewMemberAlias(e.target.value)} placeholder="Alias (Opcional, ex: Loja Matriz)" className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none" />
                    <button type="submit" disabled={addingMember} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg transition">
                      {addingMember ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Adicionar"}
                    </button>
                  </form>
                </div>
                <div className="space-y-4">
                  <h3 className="font-bold text-zinc-200 border-b border-zinc-800 pb-2">Usuários Proprietários</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {loadingGroupUsers ? (
                      <div className="text-center py-4 text-zinc-500"><Loader2 className="animate-spin inline-block mx-auto" size={18} /></div>
                    ) : groupUsers.length === 0 ? (
                      <p className="text-zinc-500 text-sm italic">Nenhum usuário proprietário.</p>
                    ) : (
                      groupUsers.map((u: any) => (
                        <div key={u.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex justify-between items-center">
                          <div><p className="font-semibold text-zinc-200 text-sm">{u.name}</p><p className="text-xs text-zinc-500">{u.email}</p></div>
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={handleAddGroupUser} className="bg-zinc-950/50 p-4 border border-zinc-800 rounded-xl space-y-3 mt-4">
                    <h4 className="text-sm font-bold text-zinc-300">Novo Usuário do Grupo</h4>
                    <input required type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Nome" className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none" />
                    <input required type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="Email" className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none" />
                    <input required type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Senha" className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none" />
                    <button type="submit" disabled={addingUser} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg transition">
                      {addingUser ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Criar Usuário"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
