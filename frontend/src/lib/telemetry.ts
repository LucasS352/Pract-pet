/**
 * ============================================================
 *  telemetry.ts — Telemetria Leve de Conectividade
 *  7bar PDV — Lote 1 de Robustez
 * ============================================================
 *
 *  Registra eventos de falha de rede e encerramento de sessão
 *  para diagnóstico de instabilidade em campo.
 *
 *  GARANTIAS:
 *  - Desacoplado: nunca bloqueia requisições HTTP nem o fluxo da UI
 *  - Fila em memória com flush assíncrono em microtask
 *  - Nunca registra senhas, tokens ou dados de negócio
 *  - Falha silenciosa: erro no IndexedDB não afeta o PDV
 *  - Máx. 1000 eventos (FIFO) para não estourar storage
 *  - Exportável via painel admin/SysInit
 * ============================================================
 */

import { db } from './db';

export type TelemetryEventType =
  | 'request_timeout'        // ECONNABORTED / ERR_CANCELED
  | 'request_network_error'  // ERR_NETWORK
  | 'received_401'           // servidor respondeu 401 (evidência concreta)
  | 'received_5xx'           // erro de servidor
  | 'session_ended'          // logout executado (com motivo)
  | 'polling_error'          // erro em polling silencioso
  | 'sw_version'             // versão do service worker ativo
  | 'sync_started'           // início de sincronização offline
  | 'sync_completed';        // fim de sincronização offline

export interface TelemetryEvent {
  id?: number;
  type: TelemetryEventType;
  /** URL anonimizada: apenas o path, sem query params */
  path?: string;
  /** Código HTTP se houver resposta */
  statusCode?: number;
  /** Código de erro Axios */
  errorCode?: string;
  /** Duração da requisição em milissegundos */
  durationMs?: number;
  /** Motivo de encerramento de sessão — nunca "token expirado" sem prova */
  sessionEndReason?: 'received_401_interactive' | 'received_401_polling' | 'network_during_refresh' | 'refresh_rejected' | 'manual_logout';
  /** Estado de navigator.onLine no momento do evento */
  wasOnline: boolean;
  /** Timestamp ISO */
  createdAt: string;
  /** ID anônimo de sessão para correlação (sem usuário) */
  sessionId: string;
}

const MAX_EVENTS = 1000;

/** ID de sessão anônimo, gerado uma vez por aba */
const SESSION_ID = crypto.randomUUID().substring(0, 8);

/** Fila em memória desacoplada */
let memoryQueue: TelemetryEvent[] = [];
let isFlushing = false;
let flushScheduled = false;

/** Anonimiza URL: mantém apenas o path, remove query strings e IDs numéricos */
export function anonymizePath(url?: string): string {
  if (!url) return '';
  try {
    const path = url.split('?')[0];
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
      .replace(/\/\d+/g, '/:id');
  } catch {
    return '';
  }
}

/**
 * Grava a fila em lote no IndexedDB de forma não bloqueante.
 */
async function flushQueue(): Promise<void> {
  if (isFlushing || memoryQueue.length === 0) return;
  isFlushing = true;

  try {
    const batch = memoryQueue.splice(0, memoryQueue.length);
    if (!db.telemetry_events) return;

    await db.telemetry_events.bulkAdd(batch);

    // Poda FIFO se passar do limite máximo
    const count = await db.telemetry_events.count();
    if (count > MAX_EVENTS) {
      const excess = await db.telemetry_events
        .orderBy('createdAt')
        .limit(count - MAX_EVENTS)
        .toArray();
      if (excess.length) {
        await db.telemetry_events.bulkDelete(excess.map(e => e.id!).filter(Boolean));
      }
    }
  } catch {
    // Falha silenciosa garantida
  } finally {
    isFlushing = false;
    flushScheduled = false;
    if (memoryQueue.length > 0) {
      scheduleFlush();
    }
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  // Desacoplado via microtask / setTimeout 0 — NUNCA no caminho crítico da requisição
  setTimeout(() => {
    void flushQueue();
  }, 0);
}

const MAX_MEMORY_QUEUE = 200;

/**
 * Registra um evento de telemetria de forma completamente desacoplada.
 * Retorna imediatamente — nunca trava a execução da tela ou do Axios.
 */
export function recordTelemetry(
  event: Omit<TelemetryEvent, 'wasOnline' | 'createdAt' | 'sessionId'>
): void {
  try {
    const fullEvent: TelemetryEvent = {
      ...event,
      wasOnline: navigator.onLine,
      createdAt: new Date().toISOString(),
      sessionId: SESSION_ID,
    };

    // Poda defensiva em memória: limita a 200 itens caso o IndexedDB engasgue
    if (memoryQueue.length >= MAX_MEMORY_QUEUE) {
      memoryQueue.shift();
    }

    memoryQueue.push(fullEvent);
    scheduleFlush();
  } catch {
    // Falha silenciosa
  }
}


/**
 * Retorna todos os eventos para exportação no painel admin / SysInit.
 */
export async function exportTelemetry(): Promise<TelemetryEvent[]> {
  try {
    if (!db.telemetry_events) return [];
    return await db.telemetry_events.orderBy('createdAt').reverse().toArray();
  } catch {
    return [];
  }
}

/**
 * Limpa todos os eventos do banco local.
 */
export async function clearTelemetry(): Promise<void> {
  try {
    memoryQueue = [];
    if (db.telemetry_events) {
      await db.telemetry_events.clear();
    }
  } catch { /* silencioso */ }
}
