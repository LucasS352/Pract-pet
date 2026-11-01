import { useState, useEffect, useRef } from 'react';
import { X, Flashlight, AlertCircle, ScanBarcode } from 'lucide-react';
import { toast } from 'sonner';

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function CameraBarcodeScannerModal({ isOpen, onClose, onScan }: CameraBarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const lastScannedTimeRef = useRef<{ [code: string]: number }>({});
  const isProcessingRef = useRef<boolean>(false);

  // Som de beep suave ao escanear
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota Lá (A5)
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Ignora erro de áudio se bloqueado pelo navegador
    }
  };

  const handleBarcodeDetected = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode || isProcessingRef.current) return;

    // Cooldown de 3.5 segundos para o mesmo código de barras
    const now = Date.now();
    const lastTime = lastScannedTimeRef.current[cleanCode] || 0;
    if (now - lastTime < 3500) {
      return;
    }

    lastScannedTimeRef.current[cleanCode] = now;
    isProcessingRef.current = true;
    setLastScannedCode(cleanCode);

    playBeep();
    if (navigator.vibrate) {
      navigator.vibrate(60);
    }

    onScan(cleanCode);

    // Libera o lock de processamento após 1 segundo
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 1000);
  };

  // Iniciar câmera
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    setCameraError(null);
    setHasCamera(true);
    setTorchOn(false);
    setManualCode('');

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Câmera não suportada neste navegador.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsScanning(true);
        }

        // Verifica suporte a lanterna
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as any;
        if (capabilities && 'torch' in capabilities) {
          setHasTorch(true);
        }
      } catch (err: any) {
        console.error('Erro ao acessar câmera:', err);
        setHasCamera(false);
        setCameraError(err.message || 'Não foi possível acessar a câmera do dispositivo.');
      }
    };

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Loop de detecção com BarcodeDetector
  useEffect(() => {
    if (!isOpen || !isScanning) return;

    let detector: any = null;
    if ('BarcodeDetector' in window) {
      try {
        detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'],
        });
      } catch (e) {
        console.warn('BarcodeDetector não suportou formatos solicitados:', e);
      }
    }

    const scanFrame = async () => {
      if (videoRef.current && videoRef.current.readyState >= 2 && detector) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            if (rawValue) {
              handleBarcodeDetected(rawValue);
            }
          }
        } catch {
          // Frame drop normal em loop contínuo
        }
      }
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    if (detector) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, isScanning, lastScannedCode]);

  const stopCamera = () => {
    setIsScanning(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Erro ao alternar lanterna:', e);
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleBarcodeDetected(manualCode.trim());
    setManualCode('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <ScanBarcode size={18} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">Leitor de Código de Barras</h3>
              <p className="text-[11px] text-zinc-400">Aponte para o código EAN ou QR Code</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 rounded-xl transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewfinder Câmera */}
        <div className="relative w-full aspect-[4/3] bg-zinc-900 overflow-hidden flex items-center justify-center">
          {hasCamera ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />

              {/* Overlay / Mira de escaneamento */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                {/* Janela de foco central */}
                <div className="w-64 h-36 border-2 border-blue-400/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] overflow-hidden">
                  {/* Linha de varredura animada */}
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent absolute top-0 animate-[bounce_2s_infinite]" />
                  {/* Cantos estilizados */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-400" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-blue-400" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-400" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-400" />
                </div>
                <span className="text-[11px] font-semibold text-white/80 bg-black/60 px-3 py-1 rounded-full mt-3 backdrop-blur-sm">
                  Posicione o código de barras no quadro
                </span>
              </div>

              {/* Botões sobre a câmera */}
              <div className="absolute bottom-3 right-3 flex gap-2">
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2.5 rounded-xl backdrop-blur-md border transition ${
                      torchOn
                        ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-lg'
                        : 'bg-zinc-900/80 text-zinc-300 border-zinc-700'
                    }`}
                    title="Alternar Lanterna"
                  >
                    <Flashlight size={18} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <AlertCircle size={24} />
              </div>
              <p className="text-sm font-semibold text-white">Câmera Indisponível</p>
              <p className="text-xs text-zinc-400 max-w-xs">{cameraError || 'Permita o acesso à câmera nas configurações do navegador.'}</p>
            </div>
          )}
        </div>

        {/* Digitação Manual Alternativa */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 space-y-3">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Digitar código manualmente (EAN)..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition active:scale-95 shrink-0"
            >
              Inserir
            </button>
          </form>

          <div className="flex justify-between items-center text-[11px] text-zinc-500">
            <span>Suporta EAN-13, Code 128, QR Code</span>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-white font-semibold"
            >
              Concluído
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
