import { createConnection, RowDataPacket } from 'mysql2/promise';
import { createHash } from 'crypto';

/** Executado somente pelo atualizador Sys-Init. Nunca remove ou reescreve registros. */
export async function upgradeTenantSchema<T>(databaseUrl: string, pushSchema: () => Promise<T>): Promise<T> {
  const connection = await createConnection(databaseUrl);
  let locked = false;
  let lockName = '';
  try {
    const [database] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS name');
    lockName = 'pdv-schema-' + createHash('sha256').update(database[0].name).digest('hex').slice(0, 40);
    const [lock] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    locked = Number(lock[0].acquired) === 1;
    if (!locked) throw new Error('Este banco já está sendo atualizado. Aguarde a conclusão antes de tentar novamente.');

    const [columns] = await connection.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payables'",
    );
    if (columns.length) {
      const names = new Set(columns.map(column => column.name));
      const [indexes] = await connection.query<RowDataPacket[]>(
        "SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName, SUB_PART AS prefixLength FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payables' ORDER BY INDEX_NAME, SEQ_IN_INDEX",
      );
      const target = indexes.filter(index => index.name === 'payables_recurrenceId_recurrenceMonth_key');
      if (target.length && !(target.length === 2 && target.every(index => Number(index.nonUnique) === 0 && index.prefixLength == null) && target[0].columnName === 'recurrenceId' && target[1].columnName === 'recurrenceMonth')) {
        throw new Error('Índice de recorrência com definição inesperada. Nenhum índice foi removido; é necessária revisão deste banco.');
      }
      if (!target.length) {
        if (names.has('recurrenceId') && names.has('recurrenceMonth')) {
          const [duplicates] = await connection.query<RowDataPacket[]>(
            'SELECT 1 AS duplicate FROM `payables` WHERE `recurrenceId` IS NOT NULL AND `recurrenceMonth` IS NOT NULL GROUP BY `recurrenceId`, `recurrenceMonth` HAVING COUNT(*) > 1 LIMIT 1',
          );
          if (duplicates.length) throw new Error('Existem contas a pagar duplicadas para a mesma recorrência e mês. Nenhuma conta foi apagada ou alterada. Revise as duplicidades deste banco antes de atualizar.');
        }
        const additions: string[] = [];
        if (!names.has('recurrenceId')) additions.push('ADD COLUMN `recurrenceId` VARCHAR(36) NULL');
        if (!names.has('recurrenceMonth')) additions.push('ADD COLUMN `recurrenceMonth` VARCHAR(7) NULL');
        additions.push('ADD UNIQUE INDEX `payables_recurrenceId_recurrenceMonth_key` (`recurrenceId`, `recurrenceMonth`)');
        // Uma única operação aditiva; o próprio MySQL também valida concorrência/duplicidades.
        await connection.query('ALTER TABLE `payables` ' + additions.join(', '));
      }
    }
    // Mantém a recusa do Prisma a outros avisos de perda de dados.
    return await pushSchema();
  } finally {
    try {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally {
      await connection.end();
    }
  }
}
