import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';

/**
 * Calcula uma versão determinística dos dados financeiros de um caixa.
 * Baseada em SHA-256 (primeiros 16 hex chars) de:
 * 1. Vendas não canceladas (ordenadas por id asc)
 * 2. Pagamentos de cada venda (ordenados por id asc)
 * 3. Movimentações de sangria/suprimento (ordenadas por id asc)
 */
export function computeDataVersion(sales: any[], movements: any[]): string {
  const hash = createHash('sha256');

  // 1. Vendas ordenadas por id: 'asc' (estritamente determinístico)
  const sortedSales = [...sales]
    .filter(s => s.status !== 'cancelled' && s.source !== 'ajuste_fiscal')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  for (const sale of sortedSales) {
    const saleTotal = sale.total !== undefined ? sale.total : (sale.totalAmount ?? 0);
    hash.update(`sale:${sale.id}:${Number(saleTotal).toFixed(2)}:${sale.status};`);

    // 2. Pagamentos ordenados por id: 'asc'
    const payments = [...(sale.payments || [])].sort((a, b) =>
      String(a.id).localeCompare(String(b.id))
    );
    for (const p of payments) {
      const val = p.value !== undefined ? p.value : (p.amount ?? 0);
      hash.update(`pay:${p.id}:${Number(val).toFixed(2)}:${p.method};`);
    }
  }

  // 3. Movimentações ordenadas por id: 'asc'
  const sortedMovements = [...movements].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
  for (const m of sortedMovements) {
    const val = m.value !== undefined ? m.value : (m.amount ?? 0);
    hash.update(`mov:${m.id}:${m.type}:${Number(val).toFixed(2)};`);
  }

  return hash.digest('hex').substring(0, 16);
}

/**
 * Validação estrita do payload de detalhes da conferência/auditoria.
 */
export function validateConferenceDetails(details: any, requireVersion = true): void {
  if (!details || typeof details !== 'object') {
    throw new BadRequestException('closingDetails deve ser um objeto válido.');
  }

  if (requireVersion) {
    if (!details.dataVersion || typeof details.dataVersion !== 'string' || !/^[a-f0-9]{16}$/i.test(details.dataVersion)) {
      throw new BadRequestException('dataVersion é obrigatória e deve conter exatamente 16 caracteres hexadecimais.');
    }
  }

  if (details.notes !== undefined && details.notes !== null) {
    if (typeof details.notes !== 'string' || details.notes.length > 500) {
      throw new BadRequestException('notes deve ser um texto com no máximo 500 caracteres.');
    }
  }

  const numericFields = ['declaredCredit', 'declaredDebit', 'declaredPix'];
  for (const field of numericFields) {
    if (details[field] !== undefined && details[field] !== null) {
      const num = Number(details[field]);
      if (typeof details[field] === 'string' && !/^-?\d+(\.\d{1,2})?$/.test(details[field])) {
        throw new BadRequestException(`Valor monetário inválido no campo ${field}. Formato aceito: ex. 12.34`);
      }
      if (!Number.isFinite(num)) {
        throw new BadRequestException(`O campo ${field} deve ser um número finito.`);
      }
    }
  }

  if (details.declaredCustom !== undefined && details.declaredCustom !== null) {
    if (typeof details.declaredCustom !== 'object' || Array.isArray(details.declaredCustom)) {
      throw new BadRequestException('declaredCustom deve ser um mapa chave/valor.');
    }
    for (const [key, val] of Object.entries(details.declaredCustom)) {
      if (typeof val === 'string' && !/^-?\d+(\.\d{1,2})?$/.test(val)) {
        throw new BadRequestException(`Valor monetário inválido para ${key} em declaredCustom.`);
      }
      const num = Number(val);
      if (!Number.isFinite(num)) {
        throw new BadRequestException(`Valor de ${key} em declaredCustom deve ser um número finito.`);
      }
    }
  }
}
