import { useState, useEffect } from 'react';
import { X, Download, FileArchive, Loader2, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface ExportXmlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportXmlModal({ isOpen, onClose }: ExportXmlModalProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [emailContador, setEmailContador] = useState('');
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      
      setStartDate(formattedDate);
      setEndDate(formattedDate);

      api.get('/tenants/me')
        .then(res => {
          if (res.data?.emailContador) {
            setEmailContador(res.data.emailContador);
          }
        })
        .catch(err => {
          console.error('Erro ao buscar e-mail do contador:', err);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (!startDate || !endDate) {
      toast.error('Preencha as duas datas');
      return;
    }

    setLoadingDownload(true);
    try {
      const response = await api.get('/sales/export/xmls', {
        params: { startDate, endDate },
        responseType: 'blob', // Importante para ZIP
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `xmls_${startDate}_a_${endDate}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      
      toast.success('Download concluído com sucesso!');
      onClose();
    } catch (err: any) {
      toast.error('Nenhum XML encontrado neste período ou erro na exportação.');
    } finally {
      setLoadingDownload(false);
    }
  };

  const handleSendEmail = async () => {
    if (!startDate || !endDate) {
      toast.error('Preencha as duas datas');
      return;
    }

    if (!emailContador) {
      toast.error('Informe o e-mail de destino');
      return;
    }

    setLoadingEmail(true);
    try {
      const response = await api.post('/sales/export/xmls/send-email', {
        startDate,
        endDate,
        email: emailContador
      });

      toast.success(response.data?.message || 'E-mail enviado com sucesso!');
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao enviar XMLs por e-mail.';
      toast.error(msg);
    } finally {
      setLoadingEmail(false);
    }
  };

  const loading = loadingDownload || loadingEmail;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center p-5 border-b border-zinc-800">
          <h2 className="text-xl font-bold flex items-center gap-2"><FileArchive className="text-blue-500" /> Exportar XMLs</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition"><X size={24} /></button>
        </div>
        
        <div className="p-6 space-y-5">
          <p className="text-zinc-400 text-sm">Selecione o período das Notas Fiscais (NFC-e) autorizadas para exportação.</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-1">Data Inicial</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-1">Data Final</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <div className="border-t border-zinc-800/80 pt-4 space-y-2">
            <label className="text-sm font-medium text-zinc-300 block">Enviar diretamente para o Contador</label>
            <input 
              type="email" 
              value={emailContador} 
              onChange={e => setEmailContador(e.target.value)} 
              placeholder="E-mail da contabilidade"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm" 
            />
            <p className="text-zinc-500 text-xs">O e-mail será enviado com o arquivo ZIP em anexo.</p>
          </div>
        </div>

        <div className="p-5 border-t border-zinc-800 bg-zinc-950/50 flex flex-col sm:flex-row justify-end gap-3">
          <button 
            type="button"
            onClick={onClose} 
            className="w-full sm:w-auto order-3 sm:order-none px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition font-medium text-sm text-center"
          >
            Cancelar
          </button>
          
          <button 
            onClick={handleExport} 
            disabled={loading || !startDate || !endDate} 
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loadingDownload ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 
            Baixar ZIP
          </button>

          <button 
            onClick={handleSendEmail} 
            disabled={loading || !startDate || !endDate || !emailContador} 
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loadingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} 
            Enviar E-mail
          </button>
        </div>
      </div>
    </div>
  );
}
