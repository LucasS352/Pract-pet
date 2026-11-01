import { Injectable, Logger } from '@nestjs/common';

interface TimingEntry {
  label: string;
  startMs: number;
}

export interface TraceResult {
  correlationId: string;
  steps: Record<string, number>;
  totalMs: number;
  memoryPeakMb: number;
}

/**
 * FiscalLoggerService — Logger estruturado com CorrelationId e rastreamento de timings.
 *
 * Uso:
 *   const ctx = logger.startTrace(correlationId);
 *   ctx.step('sefaz');
 *   // ... faz a chamada ...
 *   ctx.step('parser');
 *   const result = ctx.finish();
 *   // result: { steps: { sefaz: 1200, parser: 80 }, totalMs: 1280, memoryPeakMb: 12.4 }
 */
@Injectable()
export class FiscalLoggerService {
  private readonly logger = new Logger('FiscalModule');

  static generateCorrelationId(): string {
    const ts  = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `fiscal_${ts}_${rnd}`;
  }

  startTrace(correlationId: string) {
    const startTotal = Date.now();
    const steps: Record<string, number> = {};
    let lastStepMs = startTotal;
    let lastLabel  = '__start__';
    let memPeak    = process.memoryUsage().heapUsed;

    const self = this;

    return {
      log: (msg: string) => self.logger.log(`[${correlationId}] ${msg}`),
      warn: (msg: string) => self.logger.warn(`[${correlationId}] ${msg}`),
      error: (msg: string) => self.logger.error(`[${correlationId}] ${msg}`),

      step: (label: string) => {
        const now = Date.now();
        steps[lastLabel] = now - lastStepMs;
        lastStepMs = now;
        lastLabel  = label;
        const mem = process.memoryUsage().heapUsed;
        if (mem > memPeak) memPeak = mem;
      },

      finish: (): TraceResult => {
        const now = Date.now();
        steps[lastLabel] = now - lastStepMs;
        const totalMs       = now - startTotal;
        const memoryPeakMb  = Math.round((memPeak / 1024 / 1024) * 10) / 10;

        const stepStr = Object.entries(steps)
          .filter(([k]) => k !== '__start__')
          .map(([k, v]) => `${k}: ${v}ms`)
          .join(' | ');

        self.logger.log(
          `[${correlationId}] TRACE: ${stepStr} | Total: ${totalMs}ms | RAM Pico: ${memoryPeakMb}MB`,
        );

        return { correlationId, steps, totalMs, memoryPeakMb };
      },
    };
  }

  log(correlationId: string, msg: string)   { this.logger.log(`[${correlationId}] ${msg}`); }
  warn(correlationId: string, msg: string)  { this.logger.warn(`[${correlationId}] ${msg}`); }
  error(correlationId: string, msg: string) { this.logger.error(`[${correlationId}] ${msg}`); }
}
