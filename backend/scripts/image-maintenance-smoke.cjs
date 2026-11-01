/** Synthetic integration test ONLY in a fresh disposable MySQL container, without published ports or production mounts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const mysql = require('mysql2/promise');
const sharp = require('sharp');
const { ImageMaintenanceService } = require('../dist/maintenance/image-maintenance.service');
const { connectImageTenant } = require('../dist/maintenance/product-image-store');

async function main() {
  if (process.env.IMAGE_TEST_DISPOSABLE !== 'yes' || process.env.DATABASE_URL_HEART !== 'mysql://root:image-test-only@127.0.0.1:3306/image_test_heart') throw Error('ISOLATED_TEST_ENV_REQUIRED');
  const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: 'image-test-only' });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-image-smoke-'));
  try {
    // CREATE without IF NOT EXISTS: refuses reuse of an existing database. Never drops databases.
    for (const db of ['image_test_heart', 'image_test_shop', 'image_test_other']) await c.query(`CREATE DATABASE ${db}`);
    await c.query('CREATE TABLE image_test_heart.tenants (id varchar(36) PRIMARY KEY,database_name varchar(64),database_url varchar(255)) ENGINE=InnoDB');
    await c.query('CREATE TABLE image_test_heart.images (id varchar(36) PRIMARY KEY,data MEDIUMBLOB,mimeType varchar(50),createdAt datetime(3)) ENGINE=InnoDB');
    for (const db of ['image_test_shop', 'image_test_other']) await c.query(`CREATE TABLE ${db}.products (id varchar(36) PRIMARY KEY,name varchar(100),imageUrl varchar(255),updatedAt datetime(3),stock int) ENGINE=InnoDB`);
    const tid = randomUUID(), otherTid = randomUUID(), oldId = randomUUID();
    const pid = '11111111-1111-4111-8111-111111111111', conflicting = '22222222-2222-4222-8222-222222222222';
    await c.execute('INSERT INTO image_test_heart.tenants VALUES (?,?,?),(?,?,?)', [tid, 'image_test_shop', 'mysql://root:image-test-only@127.0.0.1:3306/image_test_shop', otherTid, 'image_test_other', 'mysql://root:image-test-only@127.0.0.1:3306/image_test_other']);
    const original = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#b57021' } }).png({ compressionLevel: 0 }).toBuffer();
    assert(original.length > 204800 && original.length < 8 * 1024 ** 2);
    await c.execute('INSERT INTO image_test_heart.images VALUES (?,?,?,NOW())', [oldId, original, 'image/png']);
    const oldUrl = '/api/products/uploads/images/' + oldId;
    await c.execute('INSERT INTO image_test_shop.products VALUES (?,?,?,NOW(),7),(?,?,?,NOW(),9)', [pid, 'Synthetic test product', oldUrl, conflicting, 'Client changed product', oldUrl]);
    await c.execute('INSERT INTO image_test_other.products VALUES (?,?,?,NOW(),11)', [pid, 'Other tenant shared original', oldUrl]);
    const makeService = () => { const s = new ImageMaintenanceService({ invalidateCache() {} }); Object.defineProperty(s, 'root', { value: root }); return s; };
    const service = makeService(); let job = await service.create(tid, randomUUID(), 10);
    assert.equal(job.diagnosis.selected, 1);
    assert.throws(() => service.get(otherTid, job.id), /TENANT_JOB_MISMATCH/);
    const count = async () => (await c.query('SELECT COUNT(*) n FROM image_test_heart.images'))[0][0].n;
    assert.equal(await count(), 1);
    job = await service.step(tid, job.id, job.run.id, 0, {});
    assert.equal(job.assets.length, 1); assert.equal(await count(), 1); // Preparation: no DB mutation.
    const preview = await service.preview(tid, job.id, job.assets[0].newId, false);
    assert.equal((await sharp(preview.data).metadata()).format, 'webp');
    const sourcePreview = await service.preview(tid, job.id, job.assets[0].newId, true);
    assert(sourcePreview.data.equals(original));
    job = await service.start(tid, job.id, 'simulate_apply', {});
    while (!job.run.complete) job = await service.step(tid, job.id, job.run.id, job.run.cursor, {});
    assert.equal(job.run.counts.eligible_apply, 2); assert.equal(await count(), 1);
    const approval = { packageHash: job.packageHash, confirmDatabase: 'image_test_shop', reviewed: true, backupReference: 'synthetic-disposable-fixture' };
    await assert.rejects(service.start(tid, job.id, 'apply', { ...approval, confirmDatabase: 'image_test_other' }), /REQUIRED/);
    await c.execute("UPDATE image_test_shop.products SET imageUrl='/new-client-photo.jpg' WHERE id=?", [conflicting]);
    job = await service.start(tid, job.id, 'apply', approval);
    // A different DB session blocks maintenance across processes, without touching schema/business rows.
    const lock = await connectImageTenant(tid);
    await lock.connection.query("SELECT GET_LOCK('pdv-product-image-maintenance-v1',0)");
    await assert.rejects(service.step(tid, job.id, job.run.id, 0, approval), /MAINTENANCE_BUSY/);
    await lock.connection.end();
    const runId = job.run.id;
    // Simulate a crash AFTER transaction commit but BEFORE durable progress update.
    const crashed = makeService(); crashed.save = () => { throw Error('synthetic crash after commit'); };
    await assert.rejects(crashed.step(tid, job.id, runId, 0, approval), /synthetic crash/);
    assert.equal(await count(), 2); assert.equal(service.get(tid, job.id).run.cursor, 0);
    job = await service.step(tid, job.id, runId, 0, approval);
    const replay = await service.step(tid, job.id, runId, 0, approval);
    assert.equal(replay.run.cursor, 1); // Lost-response replay must not advance to next product.
    const restarted = makeService(); job = restarted.get(tid, job.id); // File-backed recovery, no automatic processing.
    while (!job.run.complete) job = await restarted.step(tid, job.id, runId, job.run.cursor, approval);
    assert.equal(job.run.counts.already_applied, 1); assert.equal(job.run.counts.conflict, 1); assert.equal(await count(), 2);
    const [[other]] = await c.query('SELECT imageUrl,stock FROM image_test_other.products');
    assert.equal(other.imageUrl, oldUrl); assert.equal(other.stock, 11);
    const [[storedOriginal]] = await c.execute('SELECT data FROM image_test_heart.images WHERE id=?', [oldId]);
    assert(storedOriginal.data.equals(original));
    job = await restarted.start(tid, job.id, 'simulate_rollback', {});
    while (!job.run.complete) job = await restarted.step(tid, job.id, job.run.id, job.run.cursor, {});
    job = await restarted.start(tid, job.id, 'rollback', approval);
    while (!job.run.complete) job = await restarted.step(tid, job.id, job.run.id, job.run.cursor, approval);
    assert.equal(job.run.counts.reverted, 1); assert.equal(job.run.counts.conflict, 1); assert.equal(await count(), 2);
    const [final] = await c.query('SELECT id,imageUrl,stock FROM image_test_shop.products');
    assert.equal(final.find(p => p.id === pid).imageUrl, oldUrl); assert.equal(final.find(p => p.id === pid).stock, 7);
    assert.equal(final.find(p => p.id === conflicting).imageUrl, '/new-client-photo.jpg');
    console.log('PASS: real MySQL preparation/simulation are read-only; scoped apply; preserved original; shared-tenant isolation; stale-response replay; recovery after commit before progress save; durable resume; distributed lock; conflict-safe rollback; stocks unchanged.');
  } finally { await c.end(); }
}
main().catch(e => { console.error('ISOLATED_IMAGE_TEST_FAILED', e.message); process.exitCode = 1; });
