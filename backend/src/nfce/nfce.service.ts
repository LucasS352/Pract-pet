import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/** Microsserviço PHP de emissão */

export interface NfceResultado {
  status: 'autorizada' | 'rejeitada' | 'erro';
  chave?: string;
  protocolo?: string;
  numero?: number;
  xml?: string;
  qrcode?: string;
  codRejeicao?: string;
  motivoRejeicao?: string;
}

@Injectable()
export class NfceService {
  private readonly logger = new Logger(NfceService.name);

  constructor(private httpService: HttpService) {}

  /**
   * Monta o payload e chama o microsserviço PHP para emissão.
   * Se o ambiente for PRODUÇÃO (1), lança erro — não emitimos em produção sem certificado de homologação válido.
   */
  async emitir(payload: {
    empresa: any;
    nota: any;
    certPfxBase64: string;
    certSenha: string;
    ambiente: number;
  }): Promise<NfceResultado> {
    const serviceUrl = process.env.NFCE_SERVICE_URL || 'http://nfce-service:8080';

    this.logger.log(`Enviando NFC-e ao microsserviço PHP (${payload.ambiente === 1 ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}): ${serviceUrl}/emitir`);

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<NfceResultado>(`${serviceUrl}/emitir`, payload, {
          timeout: 90_000, // SEFAZ pode demorar se houver retentativas
        }),
      );
      this.logger.log(`NFC-e resultado: ${data.status} | chave: ${data.chave ?? 'N/A'}`);
      return data;
    } catch (err: any) {
      const msg = err?.response?.data?.motivoRejeicao || err?.response?.data?.message || err.message || 'Erro de comunicação com serviço NFC-e';
      this.logger.error(`Falha ao emitir NFC-e: ${msg}`);
      return {
        status: 'erro',
        motivoRejeicao: msg,
      };
    }
  }

  /** Health check do microsserviço PHP */
  async healthCheck(): Promise<boolean> {
    const serviceUrl = process.env.NFCE_SERVICE_URL || 'http://nfce-service:8080';
    try {
      await firstValueFrom(this.httpService.get(`${serviceUrl}/status`, { timeout: 5_000 }));
      return true;
    } catch {
      return false;
    }
  }
}

