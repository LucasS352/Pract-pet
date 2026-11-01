import { Injectable } from '@nestjs/common';

interface FiscalMetricEntry {
  xmlsProcessados: number;
  xmlsRejeitados: number;
  errosSefaz: number;
  tempoSefazTotal: number;
  tempoParserTotal: number;
  tempoBancoTotal: number;
  tempoEstoqueTotal: number;
  operacoes: number;
}

/**
 * FiscalMetricsService — Coleta e expõe métricas agregadas do módulo fiscal.
 *
 * Métricas ficam em memória (processo Node). Em V2, integrar com Prometheus/Grafana.
 */
@Injectable()
export class FiscalMetricsService {
  private metrics: FiscalMetricEntry = {
    xmlsProcessados: 0,
    xmlsRejeitados: 0,
    errosSefaz: 0,
    tempoSefazTotal: 0,
    tempoParserTotal: 0,
    tempoBancoTotal: 0,
    tempoEstoqueTotal: 0,
    operacoes: 0,
  };

  record(timings: {
    sefazMs?:   number;
    parserMs?:  number;
    bancoMs?:   number;
    estoqueMs?: number;
    success:    boolean;
    sefazError?: boolean;
  }): void {
    this.metrics.operacoes++;
    if (timings.success)     this.metrics.xmlsProcessados++;
    else                     this.metrics.xmlsRejeitados++;
    if (timings.sefazError)  this.metrics.errosSefaz++;

    if (timings.sefazMs)    this.metrics.tempoSefazTotal   += timings.sefazMs;
    if (timings.parserMs)   this.metrics.tempoParserTotal  += timings.parserMs;
    if (timings.bancoMs)    this.metrics.tempoBancoTotal    += timings.bancoMs;
    if (timings.estoqueMs)  this.metrics.tempoEstoqueTotal  += timings.estoqueMs;
  }

  getMetrics() {
    const { operacoes } = this.metrics;
    if (operacoes === 0) return { ...this.metrics, averages: null };

    return {
      ...this.metrics,
      averages: {
        tempoSefazMs:   Math.round(this.metrics.tempoSefazTotal   / operacoes),
        tempoParserMs:  Math.round(this.metrics.tempoParserTotal  / operacoes),
        tempoBancoMs:   Math.round(this.metrics.tempoBancoTotal   / operacoes),
        tempoEstoqueMs: Math.round(this.metrics.tempoEstoqueTotal / operacoes),
      },
    };
  }

  reset(): void {
    this.metrics = {
      xmlsProcessados: 0, xmlsRejeitados: 0, errosSefaz: 0,
      tempoSefazTotal: 0, tempoParserTotal: 0,
      tempoBancoTotal: 0, tempoEstoqueTotal: 0, operacoes: 0,
    };
  }
}
