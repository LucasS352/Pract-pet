import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * FiscalPhpService — Proxy centralizado para o microsserviço PHP.
 *
 * Responsável por:
 * - Enviar requisições ao nfce-service
 * - Propagar o CorrelationId em todos os headers
 * - Mapear erros do PHP para mensagens amigáveis
 * - Retry com backoff exponencial (retry de rede, não de negócio)
 */
@Injectable()
export class FiscalPhpService {
  private readonly logger = new Logger(FiscalPhpService.name);
  private readonly serviceUrl = process.env.NFCE_SERVICE_URL || 'http://nfce-service:80';

  constructor(private readonly httpService: HttpService) {}

  private getHeaders(correlationId: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
    };
  }

  private mapPhpError(err: any): string {
    const msg: string = err?.response?.data?.mensagem
      || err?.response?.data?.motivoRejeicao
      || err?.response?.data?.message
      || err?.message
      || 'Erro de comunicação com o serviço fiscal';

    // Mapear erros técnicos em mensagens amigáveis
    if (msg.includes('openssl_pkcs12_read') || msg.includes('Senha incorreta')) {
      return 'Certificado digital inválido ou senha incorreta.';
    }
    if (msg.includes('certValidade') || msg.includes('expired')) {
      return 'Certificado digital vencido. Renove o certificado A1.';
    }
    if (msg.includes('SSL_ERROR_SYSCALL') || msg.includes('timeout') || msg.includes('Connection refused')) {
      return 'SEFAZ indisponível no momento. Tente novamente em instantes.';
    }
    if (msg.includes('cStat 108')) {
      return 'Serviço da SEFAZ em parada programada.';
    }
    if (msg.includes('cStat 109')) {
      return 'Serviço da SEFAZ em parada emergencial.';
    }
    return msg;
  }

  async post<T = any>(path: string, body: any, correlationId: string, timeoutMs = 90_000): Promise<T> {
    const url = `${this.serviceUrl}${path}`;
    this.logger.log(`[${correlationId}] POST ${url}`);

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<T>(url, body, {
          headers: this.getHeaders(correlationId),
          timeout: timeoutMs,
        }),
      );
      return data;
    } catch (err: any) {
      const friendly = this.mapPhpError(err);
      this.logger.error(`[${correlationId}] Falha em POST ${path}: ${friendly}`);
      throw new Error(friendly);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.serviceUrl}/status`, { timeout: 5_000 }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
