import { ConflictException } from '@nestjs/common';

/** Executada com a comanda bloqueada, antes de criar venda ou movimentar estoque. */
export function assertComandaSnapshot(expected: unknown, actual: any[]) {
  if (expected === undefined) return; // Compatibilidade com clientes anteriores.
  if (!Array.isArray(expected) || expected.length !== actual.length ||
      new Set(expected.map(row => row?.id)).size !== actual.length ||
      expected.some(row => {
        const item = actual.find(item => item.id === row?.id);
        return !item || !Number.isFinite(Number(row.quantity)) || !Number.isFinite(Number(row.totalPrice)) ||
          Number(item.quantity) !== Number(row.quantity) ||
          Math.round(Number(item.totalPrice) * 100) !== Math.round(Number(row.totalPrice) * 100);
      })) {
    throw new ConflictException('A comanda mudou desde a cópia utilizada no caixa. Cobrança exige conferência; não cobre novamente.');
  }
}
