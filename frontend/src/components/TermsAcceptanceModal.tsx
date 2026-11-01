import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { ShieldAlert, CheckCircle2, FileText, Lock, Loader2 } from 'lucide-react';

export function TermsAcceptanceModal() {
  const { user, setTermsAccepted } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  const shouldShow = user && (user.role === 'admin' || user.role === 'superadmin') && !user.termsAccepted;

  if (!shouldShow) return null;

  const handleAccept = async () => {
    if (!acceptedTerms || !acceptedPrivacy) {
      toast.error('Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/accept-terms');
      setTermsAccepted();
      toast.success('Termos aceitos com sucesso! Acesso liberado.');
    } catch (error) {
      toast.error('Erro ao aceitar os termos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 bg-zinc-950/50 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600/20 text-blue-500 rounded-2xl flex items-center justify-center border border-blue-500/30">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Atualização Legal Importante</h2>
            <p className="text-sm text-zinc-400">Antes de acessar o sistema, você precisa revisar e aceitar nossos novos Termos de Uso e Políticas.</p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar text-sm text-zinc-300 leading-relaxed">
          <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <FileText size={18} className="text-violet-400" />
              1. Termos de Licenciamento de Software (SaaS)
            </h3>
            <p className="mb-2"><strong>1.1. Natureza do Serviço:</strong> O sistema 7Bar é fornecido no modelo SaaS (Software as a Service) "no estado em que se encontra" (As-Is). O uso contínuo do software configura a aceitação destes termos.</p>
            <p className="mb-2"><strong>1.2. Isenção de Responsabilidade Técnica:</strong> A plataforma atua apenas como uma ferramenta tecnológica facilitadora de gestão e vendas. Não nos responsabilizamos por:</p>
            <ul className="list-disc pl-5 mb-2 space-y-1">
              <li>Instabilidades de conexão com a internet no seu estabelecimento.</li>
              <li>Falhas de equipamentos físicos (celulares, computadores, impressoras).</li>
              <li>Danos diretos, indiretos, incidentais ou lucros cessantes decorrentes do uso, mau uso ou indisponibilidade temporária do sistema.</li>
            </ul>
            <p className="mb-2"><strong>1.3. Obrigações Fiscais:</strong> O sistema realiza as transmissões para a SEFAZ de acordo com os dados parametrizados pelo contratante. A exatidão dos dados fiscais (NCM, CEST, alíquotas) e a guarda dos XMLs (apesar do sistema fornecer backup) são de inteira responsabilidade do Contratante e de seu Contador.</p>
          </section>

          <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <Lock size={18} className="text-emerald-400" />
              2. Política de Privacidade e LGPD
            </h3>
            <p className="mb-2"><strong>2.1. Papel como Operador de Dados:</strong> Nos termos da Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018), a plataforma atua exclusivamente como <strong>Operadora</strong> dos dados inseridos no sistema. O contratante (Seu Estabelecimento) atua como <strong>Controlador</strong> dos dados.</p>
            <p className="mb-2"><strong>2.2. Responsabilidade sobre Dados de Clientes Finais:</strong> Cabe exclusivamente ao Controlador (Contratante) obter o consentimento dos seus consumidores finais antes de cadastrar dados pessoais como nome, telefone ou CPF na emissão de nota fiscal ou comandas.</p>
            <p className="mb-2"><strong>2.3. Segurança e Sigilo:</strong> Os dados armazenados nos bancos de dados do sistema são criptografados, protegidos e jamais serão comercializados ou cedidos a terceiros. Eles existem unicamente para o funcionamento das operações do seu estabelecimento.</p>
          </section>
        </div>

        {/* Footer / Actions */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-950/80">
          <div className="space-y-3 mb-6">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="mt-0.5">
                <input 
                  type="checkbox" 
                  checked={acceptedTerms} 
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500/20 focus:ring-offset-0 transition-all cursor-pointer"
                />
              </div>
              <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                Eu li, compreendo e concordo integralmente com os <strong>Termos de Licenciamento de Software (SaaS)</strong>, incluindo a isenção de responsabilidade técnica por partes de terceiros.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="mt-0.5">
                <input 
                  type="checkbox" 
                  checked={acceptedPrivacy} 
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500/20 focus:ring-offset-0 transition-all cursor-pointer"
                />
              </div>
              <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                Eu li, compreendo e concordo com a <strong>Política de Privacidade (LGPD)</strong>, assumindo minha responsabilidade como Controlador dos dados dos meus clientes.
              </span>
            </label>
          </div>

          <button
            onClick={handleAccept}
            disabled={loading || !acceptedTerms || !acceptedPrivacy}
            className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <CheckCircle2 size={20} />
                Assinar e Liberar Acesso ao Sistema
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
