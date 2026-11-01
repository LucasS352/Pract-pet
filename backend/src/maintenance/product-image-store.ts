import mysql, { Connection, RowDataPacket } from 'mysql2/promise';
import { ImagePackageStore } from './product-image-package';

export const safeDatabase = (name: string) => {
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(name)) throw Error('INVALID_DATABASE_NAME');
  return '`' + name + '`';
};
export const assertImageId = (id: string) => {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw Error('INVALID_ID');
};

/** Exact tenant from Heart, same MySQL instance, no schema updates or application startup. */
export async function connectImageTenant(tenantId: string) {
  assertImageId(tenantId);
  if (!process.env.DATABASE_URL_HEART) throw Error('DATABASE_URL_HEART_REQUIRED');
  const url = new URL(process.env.DATABASE_URL_HEART);
  const heartName = decodeURIComponent(url.pathname.slice(1)); safeDatabase(heartName);
  const connection = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: heartName, connectTimeout: 5000,
    multipleStatements: false, supportBigNumbers: true,
  });
  try {
    await connection.query('SET SESSION MAX_EXECUTION_TIME=8000');
    await connection.query('SET SESSION innodb_lock_wait_timeout=5');
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id,database_name,database_url FROM tenants WHERE id=?', [tenantId]);
    if (rows.length !== 1) throw Error('TENANT_NOT_FOUND');
    const tenant = rows[0]; const tenantUrl = new URL(tenant.database_url);
    safeDatabase(tenant.database_name);
    if (tenantUrl.hostname !== url.hostname || Number(tenantUrl.port || 3306) !== Number(url.port || 3306) ||
        decodeURIComponent(tenantUrl.pathname.slice(1)) !== tenant.database_name) throw Error('CROSS_SERVER_OR_DATABASE_MISMATCH');
    const [engines] = await connection.execute<RowDataPacket[]>(
      "SELECT TABLE_SCHEMA,TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE (TABLE_SCHEMA=? AND TABLE_NAME='images') OR (TABLE_SCHEMA=? AND TABLE_NAME='products')",
      [heartName, tenant.database_name]);
    if (engines.length !== 2 || engines.some(row => row.ENGINE !== 'InnoDB')) throw Error('TRANSACTIONAL_TABLES_REQUIRED');
    return { connection, databaseName: tenant.database_name as string, heartName };
  } catch (error) { await connection.end(); throw error; }
}

export function mysqlImageStore(c: Connection, databaseName: string, dryRun: boolean): ImagePackageStore {
  const table = safeDatabase(databaseName) + '.products';
  return {
    begin: async () => { await c.query(dryRun ? 'START TRANSACTION READ ONLY' : 'START TRANSACTION'); },
    commit: async () => { await c.commit(); }, rollback: async () => { await c.rollback(); },
    productImage: async id => {
      const [[row]] = await c.execute<RowDataPacket[]>(`SELECT imageUrl FROM ${table} WHERE id=?${dryRun ? '' : ' FOR UPDATE'}`, [id]);
      return row?.imageUrl;
    },
    imageInfo: async id => {
      const [[row]] = await c.execute<RowDataPacket[]>(`SELECT SHA2(data,256) hash,OCTET_LENGTH(data) bytes FROM images WHERE id=?${dryRun ? '' : ' FOR SHARE'}`, [id]);
      return row ? { hash: row.hash, bytes: row.bytes } : undefined;
    },
    insertImage: async (id, data) => {
      if (dryRun) throw Error('READ_ONLY_RUN');
      await c.execute("INSERT INTO images (id,data,mimeType,createdAt) VALUES (?,?,'image/webp',CURRENT_TIMESTAMP(3))", [id, data]);
    },
    compareAndSwap: async (id, expected, replacement) => {
      if (dryRun) throw Error('READ_ONLY_RUN');
      const [result] = await c.execute<mysql.ResultSetHeader>(`UPDATE ${table} SET imageUrl=?,updatedAt=CURRENT_TIMESTAMP(3) WHERE id=? AND BINARY imageUrl=BINARY ?`, [replacement, id, expected]);
      return result.affectedRows === 1;
    },
  };
}
