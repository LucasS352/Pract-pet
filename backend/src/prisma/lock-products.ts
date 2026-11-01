import { Prisma } from '@prisma/client';

/** Ordem comum entre lançamento e checkout, incluindo ingredientes de compostos. */
export async function lockProducts(tx: Prisma.TransactionClient, productIds: string[]) {
  for (const id of [...new Set(productIds)].sort()) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM products WHERE id = ${id} FOR UPDATE`);
  }
}
