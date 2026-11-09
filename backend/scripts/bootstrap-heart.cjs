const mysql = require('mysql2/promise');
const { spawnSync } = require('node:child_process');

async function main() {
  const rawUrl = process.env.DATABASE_URL_HEART;
  if (!rawUrl) throw new Error('DATABASE_URL_HEART não configurada.');

  const url = new URL(rawUrl);
  if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL_HEART deve usar MySQL.');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('Nome do banco Heart inválido.');

  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  });

  let tableCount;
  try {
    const [schemas] = await connection.execute(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [database],
    );
    if (schemas.length === 0) {
      await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`[Heart bootstrap] Banco ${database} criado.`);
    }

    const [rows] = await connection.execute(
      'SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
      [database],
    );
    tableCount = Number(rows[0].total);
  } finally {
    await connection.end();
  }

  if (tableCount > 0) {
    console.log(`[Heart bootstrap] Banco ${database} já possui tabelas; schema preservado.`);
    return;
  }

  console.log(`[Heart bootstrap] Criando schema inicial em ${database}...`);
  const result = spawnSync('npx', [
    '--no-install', 'prisma', 'db', 'push',
    '--schema=prisma/heart.schema.prisma', '--skip-generate',
  ], { cwd: '/app', env: { ...process.env, CI: '1' }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma db push falhou (código ${result.status}).`);
  console.log(`[Heart bootstrap] Schema inicial criado em ${database}.`);
}

main().catch((error) => {
  console.error(`[Heart bootstrap] Inicialização interrompida: ${error.message}`);
  process.exitCode = 1;
});
