'use client';
import { useState, useEffect, useRef } from 'react';
import { StationAccessLinks } from '@/components/StationAccessLinks';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Building2, MapPin, Receipt, ShieldCheck, Save, Loader2, Upload, CheckCircle, AlertCircle, Zap, Eye, EyeOff, FlaskConical } from 'lucide-react';

const TABS = [
  { id: 'dados',        label: 'Dados da Empresa', icon: Building2 },
  { id: 'endereco',     label: 'Endereço',          icon: MapPin },
  { id: 'nfce',         label: 'NFC-e',             icon: Receipt },
  { id: 'certificado',  label: 'Certificado A1',    icon: ShieldCheck },
];

const CRT_OPTIONS = [
  { value: 1, label: '1 — Simples Nacional' },
  { value: 2, label: '2 — Simples Nacional — Excesso Sublimite' },
  { value: 3, label: '3 — Regime Normal (Lucro Presumido/Real)' },
];

export default function EmpresaConfigPage() {
  const [activeTab, setActiveTab] = useState('dados');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nfceHealth, setNfceHealth] = useState<boolean | null>(null);
  const certInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    // Dados
    razaoSocial: '', nomeFantasia: '', cnpj: '', ie: '', im: '', crt: 1, emailContador: '',
    // Endereço
    logradouro: '', numero: '', complemento: '', bairro: '',
    municipio: '', codMunicipio: '', uf: '', cep: '', telefone: '',
    // NFC-e
    nfceAtivo: false, nfceSerie: 1, nfceAmbiente: 2, nfceCsc: '', nfceIdCsc: '', proximaNota: 1,
    // Certificado (apenas leitura — upload separado)
    certValidade: '',
    // Integrações
    cosmosApiKey: '',
  });

  const [certFile, setCertFile] = useState<File | null>(null);
  const [certSenha, setCertSenha] = useState('');
  const [showCosmosKey, setShowCosmosKey] = useState(false);
  const [testingCosmos, setTestingCosmos] = useState(false);
  const [masterCount, setMasterCount] = useState<{ total: number; withNcm: number } | null>(null);
  const [modules, setModules] = useState({ nfce: true, estoque: true, dashboardMobile: true });

  useEffect(() => {
    api.get('/tenants/me')
      .then(res => {
        const d = res.data;
        setForm(prev => ({
          ...prev,
          razaoSocial: d.razaoSocial ?? '', nomeFantasia: d.nomeFantasia ?? '',
          cnpj: d.cnpj ?? '', ie: d.ie ?? '', im: d.im ?? '', crt: d.crt ?? 1,
          emailContador: d.emailContador ?? '',
          logradouro: d.logradouro ?? '', numero: d.numero ?? '',
          complemento: d.complemento ?? '', bairro: d.bairro ?? '',
          municipio: d.municipio ?? '', codMunicipio: d.codMunicipio ?? '',
          uf: d.uf ?? '', cep: d.cep ?? '', telefone: d.telefone ?? '',
          nfceAtivo: d.nfceAtivo ?? false, nfceSerie: d.nfceSerie ?? 1,
          nfceAmbiente: d.nfceAmbiente ?? 2, nfceCsc: d.nfceCsc ?? '',
          nfceIdCsc: d.nfceIdCsc ?? '', certValidade: d.certValidade ?? '',
          cosmosApiKey: d.cosmosApiKey ?? '',
          proximaNota: d.proximaNota ?? 1,
        }));

        let parsedModules = { nfce: true, estoque: true, dashboardMobile: true };
        try {
          if (d.modulos) {
            parsedModules = typeof d.modulos === 'string' ? JSON.parse(d.modulos) : d.modulos;
          }
        } catch (e) {
          console.error("Erro ao ler módulos do tenant:", e);
        }
        setModules(parsedModules);
      })
      .catch(() => toast.error('Erro ao carregar dados da empresa.'))
      .finally(() => setLoading(false));

    api.get('/nfce/health')
      .then(res => setNfceHealth(res.data.online))
      .catch(() => setNfceHealth(false));

    // Contagem de produtos na base mestre
    api.get('/master-products/count')
      .then(res => setMasterCount(res.data))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/tenants/me', form);

      if (certFile) {
        const fd = new FormData();
        fd.append('certPfx', certFile);
        fd.append('certSenha', certSenha);
        await api.post('/tenants/me/certificado', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setCertFile(null);
        setCertSenha('');
      }

      toast.success('Configurações salvas com sucesso!');

      const res = await api.get('/tenants/me');
      const d = res.data;
      setForm(prev => ({
        ...prev,
        certValidade: d.certValidade ?? '',
        nfceAtivo: d.nfceAtivo ?? false,
        cosmosApiKey: d.cosmosApiKey ?? '',
        proximaNota: d.proximaNota ?? 1,
      }));

      let parsedModules = { nfce: true, estoque: true, dashboardMobile: true };
      try {
        if (d.modulos) {
          parsedModules = typeof d.modulos === 'string' ? JSON.parse(d.modulos) : d.modulos;
        }
      } catch (e) {
        console.error("Erro ao ler módulos do tenant:", e);
      }
      setModules(parsedModules);

    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestCosmos = async () => {
    if (!form.cosmosApiKey) {
      toast.error('Informe o token da Cosmos antes de testar.');
      return;
    }
    setTestingCosmos(true);
    try {
      // Salva o token primeiro, depois testa
      await api.patch('/tenants/me', { cosmosApiKey: form.cosmosApiKey });
      const res = await api.get('/master-products/lookup/7898438720078');
      if (res.data.found) {
        toast.success(`✅ Cosmos funcionando! Produto: ${res.data.product.name}`);
      } else {
        toast.info('Token válido, mas produto de teste não encontrado na Cosmos.');
      }
      const count = await api.get('/master-products/count');
      setMasterCount(count.data);
    } catch {
      toast.error('Erro ao testar. Verifique o token e tente novamente.');
    } finally {
      setTestingCosmos(false);
    }
  };

  const f = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const inputCls = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors';
  const labelCls = 'text-sm font-semibold text-zinc-400 mb-1.5 block';

  const activeTabs = TABS.filter(tab => {
    if (modules.nfce === false && (tab.id === 'nfce' || tab.id === 'certificado')) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (modules.nfce === false && (activeTab === 'nfce' || activeTab === 'certificado')) {
      setActiveTab('dados');
    }
  }, [modules, activeTab]);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="animate-spin text-blue-500" size={40} />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Building2 className="text-blue-500" size={30} />
          Configurações da Empresa
        </h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition active:scale-95"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          Salvar Alterações
        </button>
      </div>

      {/* Tabs */}
      <StationAccessLinks />
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1 overflow-x-auto">
        {activeTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        {/* ABA: Dados */}
        {activeTab === 'dados' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={labelCls}>Razão Social *</label>
              <input className={inputCls} value={form.razaoSocial} onChange={e => f('razaoSocial', e.target.value)} placeholder="Ex: BAR E RESTAURANTE LTDA" />
            </div>
            <div>
              <label className={labelCls}>Nome Fantasia</label>
              <input className={inputCls} value={form.nomeFantasia} onChange={e => f('nomeFantasia', e.target.value)} placeholder="Ex: 7Bar" />
            </div>
            <div>
              <label className={labelCls}>CNPJ *</label>
              <input className={`${inputCls} font-mono`} value={form.cnpj} onChange={e => f('cnpj', e.target.value)} placeholder="00.000.000/0001-00" maxLength={18} />
            </div>
            <div>
              <label className={labelCls}>Inscrição Estadual (IE)</label>
              <input className={`${inputCls} font-mono`} value={form.ie} onChange={e => f('ie', e.target.value)} placeholder="000.000.000.000" />
            </div>
            <div>
              <label className={labelCls}>Inscrição Municipal (IM)</label>
              <input className={`${inputCls} font-mono`} value={form.im} onChange={e => f('im', e.target.value)} placeholder="Opcional" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Regime Tributário (CRT)</label>
              <select className={inputCls} value={form.crt} onChange={e => f('crt', parseInt(e.target.value))}>
                {CRT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>E-mail do Contador</label>
              <input className={inputCls} type="email" value={form.emailContador} onChange={e => f('emailContador', e.target.value)} placeholder="Ex: contabilidade@empresa.com" />
            </div>
          </div>
        )}

        {/* ABA: Endereço */}
        {activeTab === 'endereco' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2">
              <label className={labelCls}>Logradouro *</label>
              <input className={inputCls} value={form.logradouro} onChange={e => f('logradouro', e.target.value)} placeholder="Rua, Avenida..." />
            </div>
            <div>
              <label className={labelCls}>Número *</label>
              <input className={inputCls} value={form.numero} onChange={e => f('numero', e.target.value)} placeholder="123" />
            </div>
            <div>
              <label className={labelCls}>Complemento</label>
              <input className={inputCls} value={form.complemento} onChange={e => f('complemento', e.target.value)} placeholder="Sala, Apto..." />
            </div>
            <div>
              <label className={labelCls}>Bairro *</label>
              <input className={inputCls} value={form.bairro} onChange={e => f('bairro', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>CEP *</label>
              <input className={`${inputCls} font-mono`} value={form.cep} onChange={e => f('cep', e.target.value)} placeholder="00000-000" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Município *</label>
              <input className={inputCls} value={form.municipio} onChange={e => f('municipio', e.target.value)} placeholder="Bauru" />
            </div>
            <div>
              <label className={labelCls}>UF *</label>
              <input className={inputCls} value={form.uf} onChange={e => f('uf', e.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Código IBGE do Município <span className="text-zinc-600">(7 dígitos — ex: 3506003 para Bauru-SP)</span></label>
              <input className={`${inputCls} font-mono`} value={form.codMunicipio} onChange={e => f('codMunicipio', e.target.value)} placeholder="3506003" maxLength={7} />
            </div>
            <div>
              <label className={labelCls}>Telefone</label>
              <input className={`${inputCls} font-mono`} value={form.telefone} onChange={e => f('telefone', e.target.value)} placeholder="(14) 99999-9999" />
            </div>
          </div>
        )}

        {/* ABA: NFC-e */}
        {activeTab === 'nfce' && (
          <div className="space-y-6">
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${nfceHealth ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              {nfceHealth
                ? <CheckCircle className="text-emerald-400" size={20} />
                : <AlertCircle className="text-red-400" size={20} />
              }
              <div>
                <p className={`font-semibold text-sm ${nfceHealth ? 'text-emerald-400' : 'text-red-400'}`}>
                  Microsserviço PHP: {nfceHealth ? 'Online ✓' : nfceHealth === null ? 'Verificando...' : 'Offline ✗'}
                </p>
                <p className="text-zinc-500 text-xs">Responsável pela comunicação com a SEFAZ</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2 flex items-center gap-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                <div className="flex-1">
                  <p className="font-semibold text-white">Habilitar Emissão NFC-e</p>
                  <p className="text-zinc-500 text-sm">Ativa o botão "Emitir NFC-e" no PDV</p>
                </div>
                <button
                  onClick={() => f('nfceAtivo', !form.nfceAtivo)}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${form.nfceAtivo ? 'bg-blue-600' : 'bg-zinc-700'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${form.nfceAtivo ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
              </div>

              <div>
                <label className={labelCls}>Ambiente</label>
                <select className={inputCls} value={form.nfceAmbiente} onChange={e => f('nfceAmbiente', parseInt(e.target.value))}>
                  <option value={2}>2 — Homologação (Testes)</option>
                  <option value={1}>1 — Produção</option>
                </select>
                {form.nfceAmbiente === 1 && (
                  <p className="text-amber-400 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> Produção: notas reais serão emitidas. Use com certificado válido.
                  </p>
                )}
              </div>

              <div>
                <label className={labelCls}>Série</label>
                <input className={inputCls} type="number" min={1} max={999} value={form.nfceSerie} onChange={e => f('nfceSerie', parseInt(e.target.value))} />
              </div>

              <div>
                <label className={labelCls}>Número da Próxima Nota</label>
                <input className={inputCls} type="number" min={1} value={form.proximaNota} onChange={e => f('proximaNota', parseInt(e.target.value) || 1)} />
              </div>

              <div className="hidden md:block" />

              <div>
                <label className={labelCls}>CSC — Código de Segurança do Contribuinte</label>
                <input className={`${inputCls} font-mono`} value={form.nfceCsc} onChange={e => f('nfceCsc', e.target.value)} placeholder="SEFAZ-SP → Emitente → CSC" />
              </div>

              <div>
                <label className={labelCls}>ID do CSC</label>
                <input className={`${inputCls} font-mono`} value={form.nfceIdCsc} onChange={e => f('nfceIdCsc', e.target.value)} placeholder="Ex: 000001" />
              </div>
            </div>
          </div>
        )}

        {/* ABA: Certificado A1 */}
        {activeTab === 'certificado' && (
          <div className="space-y-6">
            {form.certValidade && (
              <div className="flex items-center gap-3 p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                <ShieldCheck className="text-emerald-400" size={24} />
                <div>
                  <p className="font-semibold text-white">Certificado A1 instalado</p>
                  <p className="text-zinc-500 text-sm">
                    Validade: <span className="text-amber-400 font-mono">
                      {new Date(form.certValidade).toLocaleDateString('pt-BR')}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className={labelCls}>Arquivo do Certificado (.pfx)</label>
                <div
                  onClick={() => certInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 bg-zinc-950 border-2 border-dashed border-zinc-700 hover:border-blue-500 rounded-xl cursor-pointer transition-colors"
                >
                  <Upload className="text-zinc-500 mb-2" size={32} />
                  <p className="text-zinc-400 font-medium">{certFile ? certFile.name : 'Clique para selecionar o arquivo .pfx'}</p>
                  <p className="text-zinc-600 text-xs mt-1">Certificado Digital A1 do tipo e-CNPJ ou e-NFe</p>
                  <input ref={certInputRef} type="file" accept=".pfx" className="hidden" onChange={e => setCertFile(e.target.files?.[0] || null)} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Senha do Certificado</label>
                <input
                  type="password"
                  className={inputCls}
                  value={certSenha}
                  onChange={e => setCertSenha(e.target.value)}
                  placeholder="Senha definida ao gerar o .pfx"
                />
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <p className="text-amber-400 text-sm font-semibold mb-1">⚠️ Segurança</p>
                <p className="text-amber-400/70 text-xs">
                  O certificado é armazenado criptografado no banco de dados e nunca é exposto via API.
                  Apenas o microsserviço PHP tem acesso ao arquivo durante a emissão.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
