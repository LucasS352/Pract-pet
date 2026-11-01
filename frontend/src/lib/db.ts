/**
 * ============================================================
 *  db.ts — IndexedDB com Dexie.js
 *  7bar PDV — Persistência Offline
 * ============================================================
 *
 *  Tabelas:
 *    - offline_sales     : vendas realizadas sem conexão (OFFLINE_CONTINGENCY)
 *    - products_cache    : snapshot do catálogo para uso offline
 *    - telemetry_events  : eventos de rede/sessão para diagnóstico (Lote 1)
 *
 *  O snapshot fiscal (tributos) é congelado no momento da venda,
 *  garantindo conformidade mesmo que o catálogo mude depois.
 * ============================================================
 */

import Dexie, { type Table } from 'dexie';

// ── Tipos base compartilhados com o backend ──────────────────────────────────

/** Snapshot fiscal imutável de um item — espelha o modelo SaleItem do Prisma */
export interface OfflineSaleItemSnapshot {
  productId: string;
  productName: string;   // nome no momento da venda (congelado)
  unit: string;
  quantity: number;
  priceUnit: number;
  discount: number;
  subtotal: number;

  // Snapshot fiscal — congelado no momento da venda (NÃO alterar)
  ncm:        string | null;
  cest:       string | null;
  cfop:       string;        // ex: '5102'
  origem:     number;        // 0=Nacional

  // ICMS — apenas um dos dois é preenchido (SN ou Regime Normal)
  csosn:      string | null; // Simples Nacional: '102', '400', '500'
  cstIcms:    string | null; // Regime Normal:    '00', '10', '20', '60'
  aliqIcms:   number;
  valorIcms:  number;

  // PIS
  cstPis:     string;        // '99' = SN
  aliqPis:    number;
  valorPis:   number;

  // COFINS
  cstCofins:  string;
  aliqCofins: number;
  valorCofins: number;

  // Modificadores de combos / produtos compostos
  modifiers?: {
    optionId: string;
    componentProductId?: string;
    name?: string;
    quantity?: number;
    priceAdjustment?: number;
  }[];
  fromComanda?: boolean;
}

/** Forma de pagamento — espelha o modelo Payment do Prisma */
export interface OfflineSalePayment {
  method: 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outros';
  label?: string;
  tPag:   string;  // código SEFAZ: 01=Dinheiro, 17=PIX, 03=Crédito, 04=Débito
  value:  number;
  troco:  number;
}

// ── Status de sincronização ──────────────────────────────────────────────────

export type SyncStatus =
  | 'PENDING'             // Aguardando sync (criada offline)
  | 'SYNCING'             // Em processo de envio
  | 'SYNCED'              // Confirmada no backend
  | 'REVIEW'              // Conflito/recusa: preservada, sem reenvio automático
  | 'ERROR';              // Falhou ao sincronizar

// ── Modelo principal da venda offline ────────────────────────────────────────

/**
 * OfflineSale — representa uma venda realizada em modo de contingência offline.
 *
 * A propriedade `fiscalSnapshot` garante que os dados tributários
 * (CFOP, CSOSN, NCM, alíquotas) são a FOTO do momento da venda,
 * independente de qualquer alteração futura no catálogo.
 *
 * syncStatus = 'PENDING' indica que a venda precisa ser enviada ao backend.
 */
export interface OfflineSale {
  id?: number;            // auto-increment (chave primária do IndexedDB)
  localId: string;        // UUID v4 gerado no cliente — idempotência no sync
  idempotencyKey?: string; // Chave canônica enviada no checkout

  // Metadados da operação
  createdAt:  string;     // ISO 8601 — momento exato da venda
  operatorId: string;     // ID do usuário operador
  tenantId:   string;     // ID do tenant (Adega)
  cashRegisterId?: string; // ID do caixa aberto no momento (se houver)
  comandaId?: string;     // ID da comanda ativa (se houver)
  consumedByOperatorId?: string;

  // Valores financeiros
  subtotal: number;
  discount: number;
  total:    number;

  // Itens com snapshot fiscal imutável e modificadores
  items: OfflineSaleItemSnapshot[];

  // Formas de pagamento
  payments: OfflineSalePayment[];

  // Dados do consumidor (opcional, para NFC-e futura)
  customerCpf?:  string;
  customerName?: string;

  // Vendas offline NUNCA emitem NFC-e no momento da venda
  // (emissão fiscal requer conexão com SEFAZ)
  emitirNfce: false;

  // Snapshot canônico e imutável de todo o payload do checkout
  rawPayload?: any;

  // ── Status de sincronização ─────────────────────────────────────────────
  syncStatus:   SyncStatus;
  syncedAt?:    string;   // ISO 8601 — quando foi sincronizada com sucesso
  syncError?:   string;   // mensagem de erro se syncStatus = 'ERROR'
  backendSaleId?: string; // ID da venda no backend após sincronização
}

// ── Cache de Produtos ────────────────────────────────────────────────────────

/**
 * CachedProduct — snapshot do catálogo de produtos para uso offline.
 * Inclui dados fiscais para montar o snapshot no momento da venda.
 */
export interface CachedProduct {
  id:        string;   // chave primária (mesmo ID do backend)
  name:      string;
  shortCode: string | null;
  barcode:   string | null;
  unit:      string;
  priceSell: number;
  stock:     number;
  active:    boolean;

  // Dados fiscais do produto (vindos do GrupoTributacao)
  ncm:        string | null;
  cest:       string | null;
  origem:     number;
  cfop:       string;
  csosn:      string | null;
  cstIcms:    string | null;
  aliqIcms:   number;
  cstPis:     string;
  aliqPis:    number;
  cstCofins:  string;
  aliqCofins: number;

  // Produto composto / com adicionais
  isComposite?: boolean;
  modifierGroups?: any[];  // grupos de modificadores/adicionais

  // Metadados do cache
  cachedAt: number;   // Date.now() — para expiração do cache
  salesCount?: number;
  imageUrl?: string | null;
}

// ── Telemetria ───────────────────────────────────────────────────────────────
import type { TelemetryEvent } from './telemetry';

// ── Definição do banco Dexie ─────────────────────────────────────────────────

class SevenBarDatabase extends Dexie {
  comandas_cache!: Table<{ tenantId: string; savedAt: number; items: any[] }, string>;
  offline_sales!:    Table<OfflineSale, number>;
  products_cache!:   Table<CachedProduct, string>;
  telemetry_events!: Table<TelemetryEvent, number>;

  constructor() {
    super('7bar_pdv');

    // ── v1: tabelas originais (não alterar) ─────────────────────────────────
    this.version(1).stores({
      offline_sales: '++id, localId, syncStatus, createdAt, tenantId',
      products_cache: 'id, name, barcode, shortCode',
    });

    // ── v2: adiciona tabela de telemetria (dados existentes preservados) ─────
    this.version(2).stores({
      offline_sales: '++id, localId, syncStatus, createdAt, tenantId',
      products_cache: 'id, name, barcode, shortCode',
      telemetry_events: '++id, type, createdAt, sessionId',
    });

    // ── v3: adiciona cache de comandas para contingência offline ─────────────
    // IMPORTANTE: todas as stores existentes devem ser redeclaradas na migração
    this.version(3).stores({
      offline_sales: '++id, localId, syncStatus, createdAt, tenantId',
      products_cache: 'id, name, barcode, shortCode',
      telemetry_events: '++id, type, createdAt, sessionId',
      comandas_cache: 'tenantId',
    });
  }
}

/** Instância singleton do banco — use esta em todo o app */
export const db = new SevenBarDatabase();

// ── Helpers de acesso ao banco ────────────────────────────────────────────────

/** Retorna todas as vendas com syncStatus = 'PENDING', ordenadas por data */
export async function getPendingSales(tenantId?: string, operatorId?: string): Promise<OfflineSale[]> {
  if (!tenantId || !operatorId) return [];
  return db.offline_sales
    .where('syncStatus')
    .anyOf(['PENDING', 'ERROR', 'SYNCING'])
    .filter(sale => sale.tenantId === tenantId && sale.operatorId === operatorId)
    .sortBy('createdAt');
}

/** Salva uma venda offline e retorna o ID local */
export async function saveOfflineSale(
  sale: Omit<OfflineSale, 'id'>
): Promise<number> {
  if (!sale.tenantId || sale.tenantId === 'unknown' || !sale.operatorId || sale.operatorId === 'unknown') {
    throw new Error('Loja e operador são obrigatórios para salvar a operação.');
  }
  return db.transaction('rw', db.offline_sales, async () => {
    const existing = await db.offline_sales.where('localId').equals(sale.localId)
      .filter(row => row.tenantId === sale.tenantId).first();
    if (existing) throw new Error('Operação já registrada. Recupere a pendência existente; não recrie o pedido.');
    if (sale.comandaId) {
      const charged = await db.offline_sales.where('tenantId').equals(sale.tenantId)
        .filter(row => row.comandaId === sale.comandaId).first();
      if (charged) throw new Error('Esta comanda já possui cobrança registrada neste aparelho. Confira as pendências; não cobre novamente.');
    }
    return db.offline_sales.add(sale);
  });
}

export async function getOfflineSale(tenantId: string, localId: string): Promise<OfflineSale | undefined> {
  return db.offline_sales.where('localId').equals(localId).filter(row => row.tenantId === tenantId).first();
}

export async function getReviewSales(tenantId?: string, operatorId?: string): Promise<OfflineSale[]> {
  if (!tenantId || !operatorId) return [];
  return db.offline_sales.where('syncStatus').equals('REVIEW')
    .filter(row => row.tenantId === tenantId && row.operatorId === operatorId).toArray();
}

/** Marca uma venda como SYNCED após envio bem-sucedido ao backend */
export async function markSaleSynced(
  localId: string,
  backendSaleId: string,
  tenantId: string
): Promise<void> {
  await db.offline_sales
    .where('localId')
    .equals(localId)
    .filter(row => row.tenantId === tenantId)
    .modify({
      syncStatus:   'SYNCED',
      syncedAt:     new Date().toISOString(),
      backendSaleId,
    });
}

/** Marca uma venda como ERROR após falha de sincronização */
export async function markSaleError(
  localId: string,
  errorMessage: string,
  tenantId: string
): Promise<void> {
  await db.offline_sales
    .where('localId')
    .equals(localId)
    .filter(row => row.tenantId === tenantId)
    .modify({
      syncStatus: 'ERROR',
      syncError:  errorMessage,
    });
}

/** Preserva recusas/conflitos para conferência, sem reenvio automático. */
export async function markSaleReview(localId: string, tenantId: string, message: string): Promise<void> {
  await db.offline_sales
    .where('localId')
    .equals(localId)
    .filter(row => row.tenantId === tenantId)
    .modify({ syncStatus: 'REVIEW', syncError: message });
}

/** Conta vendas pendentes — usado pelo badge de status */
export async function countPendingSales(tenantId?: string): Promise<number> {
  if (!tenantId) return 0;
  return db.offline_sales
    .where('syncStatus')
    .anyOf(['PENDING', 'ERROR', 'SYNCING', 'REVIEW'])
    .filter(row => row.tenantId === tenantId)
    .count();
}

/** Atualiza o cache completo de produtos */
export async function updateProductsCache(
  products: CachedProduct[]
): Promise<void> {
  await db.transaction('rw', db.products_cache, async () => {
    await db.products_cache.clear();
    await db.products_cache.bulkPut(products);
  });
}

/** Retorna produtos do cache (para uso offline) */
export async function getCachedProducts(): Promise<CachedProduct[]> {
  return db.products_cache.toArray();
}
