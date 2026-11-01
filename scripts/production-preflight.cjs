// Read-only release checks. Run INSIDE the backend container via stdin:
// docker compose exec -T backend node < scripts/production-preflight.cjs
// Schema-only variant: docker compose exec -T backend node - --schema-only < scripts/production-preflight.cjs
// Never prints connection strings, passwords, PINs or customer records.
const mysql = require('mysql2/promise');

async function connect(connectionString) {
  const url = new URL(connectionString);
  return mysql.createConnection({
    host: url.hostname, port: Number(url.port || 3306),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)), connectTimeout: 5000,
  });
}
async function columns(db, table) {
  const [rows] = await db.query({
    sql: 'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    timeout: 10000,
  }, [table]);
  return new Set(rows.map(row => row.COLUMN_NAME));
}

(async () => {
  let failures = 0;
  const check = (ok, label) => { console.log(`${ok ? 'OK' : 'FAIL'}: ${label}`); if (!ok) failures++; };
  if (!process.argv.includes('--schema-only')) {
    const env = process.env;
    check(Boolean(env.JWT_SECRET && env.JWT_SECRET.length >= 32 && !env.JWT_SECRET.includes('7bar_jwt_super_secret')), 'JWT_SECRET exclusivo, não padrão, com pelo menos 32 caracteres');
    check(Boolean(env.SETUP_PIN && env.SETUP_PIN !== 'teltech352'), 'SETUP_PIN configurado e diferente do padrão');
    check(Boolean(env.SQL_PIN && env.SQL_PIN !== '43619835'), 'SQL_PIN configurado e diferente do padrão');
    const url = new URL(env.DATABASE_URL_HEART);
    check(Boolean(url.password && decodeURIComponent(url.password) !== '7bar@2025'), 'Senha do Heart diferente do padrão de desenvolvimento');
  }
  const heart = await connect(process.env.DATABASE_URL_HEART);
  try {
    const actual = await columns(heart, 'station_access_links');
    check(['id', 'tenantId', 'station', 'tokenHash', 'active', 'createdAt'].every(name => actual.has(name)), 'Heart: colunas de station_access_links');
    const [tenants] = await heart.query({ sql: 'SELECT id, database_url FROM tenants', timeout: 10000 });
    check(tenants.length > 0, 'Heart contém tenants para verificação');
    for (const tenant of tenants) {
      let db;
      try {
        db = await connect(tenant.database_url);
        const actual = await columns(db, 'products');
        check(actual.has('barStation'), `Tenant ${tenant.id}: products.barStation`);
        if (!process.argv.includes('--schema-only')) {
          const url = new URL(tenant.database_url);
          check(Boolean(url.password && decodeURIComponent(url.password) !== '7bar@2025'), `Tenant ${tenant.id}: senha não padrão`);
        }
      } catch { check(false, `Tenant ${tenant.id}: conexão/consulta indisponível`); }
      finally { await db?.end(); }
    }
  } finally { await heart.end(); }
  console.log('Somente leitura. Não valida backup, HTTPS, firewall ou fluxo fiscal.');
  process.exitCode = failures ? 1 : 0;
})().catch(() => { console.error('FAIL: preflight indisponível; verifique conexão/configuração (segredos omitidos).'); process.exitCode = 1; });
