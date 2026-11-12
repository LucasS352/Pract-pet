import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Registro duplicado. Já existe um item com estes dados.' },
  P2003: { status: HttpStatus.BAD_REQUEST, message: 'Não foi possível concluir: há vínculos relacionados.' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado.' },
  P2034: { status: HttpStatus.CONFLICT, message: 'Conflito temporário de atualização. Tente novamente.' },
};

/**
 * Filtro global de exceções:
 * - Preserva integralmente o payload de `HttpException` já tratado pelos controllers/services.
 * - Traduz erros conhecidos do Prisma (duplicidade, FK, registro ausente, deadlock) para HTTP 4xx.
 * - Registra erros 500 completos no log do servidor sem vazar stack/SQL ao cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: { tenantId?: string } }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status >= 500) {
        this.logger.error(`${req.method} ${req.url} -> ${status}: ${exception.message}`, exception.stack);
      }
      return res.status(status).json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
    }

    const prismaCode = (exception as { code?: unknown })?.code;
    if (typeof prismaCode === 'string' && PRISMA_ERROR_MAP[prismaCode]) {
      const mapped = PRISMA_ERROR_MAP[prismaCode];
      this.logger.warn(`${req.method} ${req.url} [tenant=${req.user?.tenantId ?? '-'}] Prisma ${prismaCode} -> ${mapped.status}`);
      return res.status(mapped.status).json({
        statusCode: mapped.status,
        message: mapped.message,
      });
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      `${req.method} ${req.url} [tenant=${req.user?.tenantId ?? '-'}] 500: ${err.message}`,
      err.stack,
    );

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno no servidor. Tente novamente.',
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
