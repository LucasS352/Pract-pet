import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { ProductsService } from '../products/products.service';
import { IMAGE_INPUT_BYTES, IMAGE_OUTPUT_BYTES, PRODUCT_IMAGE_POLICY, productImageOptimizer } from '../images/product-image.optimizer';
import { changeImageLink, ProductImagePackage, sha256, validateAsset, validatePackage } from './product-image-package';
import { assertImageId, connectImageTenant, mysqlImageStore, safeDatabase } from './product-image-store';

export type ImageRunMode = 'prepare' | 'simulate_apply' | 'apply' | 'simulate_rollback' | 'rollback';
type Group = { oldId: string; bytes: number; products: { id: string; name: string; imageUrl: string }[] };
export interface ImageJob {
  id: string; tenantId: string; createdAt: string; databaseName: string;
  groups: Group[]; inspected: number; external: number; missing: number; oversized: number; totalBytes: number;
  package: ProductImagePackage; packageHash?: string; prepared: boolean;
  run: { id: string; mode: ImageRunMode; cursor: number; complete: boolean; counts: Record<string, number> };
  simulations: Partial<Record<'apply' | 'rollback', string>>;
}
const modes: ImageRunMode[] = ['prepare', 'simulate_apply', 'apply', 'simulate_rollback', 'rollback'];
export function selectImageCandidates(groups: Group[], limit: number | 'all') {
  const candidates = groups.filter(g => g.bytes > IMAGE_OUTPUT_BYTES && g.bytes <= IMAGE_INPUT_BYTES).sort((a, b) => b.bytes - a.bytes);
  return limit === 'all' ? candidates : candidates.slice(0, limit);
}
const durableWrite = (file: string, data: string | Buffer, flag: 'wx' | 'a') => {
  const fd = fs.openSync(file, flag, 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
};

export function authorizeImageRun(job: ImageJob, mode: ImageRunMode, approval: any) {
  if (!modes.includes(mode) || mode === 'prepare' || !job.prepared || !job.package.assets.length) throw Error('PACKAGE_NOT_READY');
  validatePackage(job.package);
  if (job.packageHash !== sha256(JSON.stringify(job.package))) throw Error('PACKAGE_CHECKSUM_MISMATCH');
  if (mode === 'apply' || mode === 'rollback') {
    if (job.simulations[mode] !== job.packageHash || approval?.packageHash !== job.packageHash ||
        approval?.confirmDatabase !== job.databaseName || !(approval?.confirmed === true || (approval?.reviewed === true &&
        typeof approval?.backupReference === 'string' && approval.backupReference.trim().length >= 8 && approval.backupReference.length <= 200))) {
      throw Error('SIMULATION_REVIEW_DATABASE_AND_BACKUP_REQUIRED');
    }
  }
}

/** Request-driven bounded steps. No cron, startup hook or automatic resume/application. */
@Injectable()
export class ImageMaintenanceService {
  readonly root = path.resolve(process.cwd(), 'backups', '.image-optimization');
  constructor(private readonly products: ProductsService) {}

  private dir(id: string) {
    assertImageId(id);
    const dir = path.join(this.root, id);
    if (fs.existsSync(this.root) && fs.lstatSync(this.root).isSymbolicLink()) throw Error('UNSAFE_STORAGE');
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw Error('UNSAFE_STORAGE');
    return dir;
  }
  private read(tenantId: string, id: string): ImageJob {
    assertImageId(tenantId);
    const file = path.join(this.dir(id), 'job.json');
    if (!fs.existsSync(file)) throw Error('JOB_NOT_FOUND');
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 10 * 1024 * 1024) throw Error('INVALID_JOB_FILE');
    const job: ImageJob = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (job.id !== id || job.tenantId !== tenantId || job.package.tenantId !== tenantId || job.databaseName !== job.package.databaseName) throw Error('TENANT_JOB_MISMATCH');
    return job;
  }
  private save(job: ImageJob) {
    const dir = this.dir(job.id), temp = path.join(dir, randomUUID() + '.tmp');
    durableWrite(temp, JSON.stringify(job), 'wx');
    fs.renameSync(temp, path.join(dir, 'job.json'));
    // Linux volume: flush directory entry too. Windows does not allow opening a directory this way.
    if (process.platform !== 'win32') {
      const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
  }
  private journal(job: ImageJob, event: object) {
    durableWrite(path.join(this.dir(job.id), 'journal.jsonl'), JSON.stringify({ at: new Date().toISOString(), runId: job.run.id, ...event }) + '\n', 'a');
  }
  private space() {
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const stat = fs.statfsSync(this.root);
    if (stat.bavail * stat.bsize < 1024 ** 3) throw Error('AT_LEAST_1_GIB_FREE_REQUIRED');
  }
  private async locked<T>(tenantId: string, action: (db: Awaited<ReturnType<typeof connectImageTenant>>) => Promise<T>) {
    const db = await connectImageTenant(tenantId);
    try {
      // Session lock shared across backend processes; does not change business tables.
      const [[row]] = await db.connection.query<RowDataPacket[]>("SELECT GET_LOCK('pdv-product-image-maintenance-v1',0) acquired");
      if (row.acquired !== 1) throw Error('MAINTENANCE_BUSY');
      return await action(db);
    } finally { await db.connection.end(); } // Releases advisory lock even on exceptions.
  }
  private view(job: ImageJob, assetOffset = 0) {
    if (!Number.isInteger(assetOffset) || assetOffset < 0 || assetOffset > job.package.assets.length) assetOffset = 0;
    const groups = new Map(job.groups.map(g => [g.oldId, g]));
    return { id: job.id, tenantId: job.tenantId, databaseName: job.databaseName, createdAt: job.createdAt,
      prepared: job.prepared, packageHash: job.packageHash, run: job.run, simulations: job.simulations,
      total: job.run.mode === 'prepare' ? job.groups.length : job.package.entries.length,
      diagnosis: { inspected: job.inspected, selected: job.groups.length, external: job.external, missing: job.missing, oversized: job.oversized, totalBytes: job.totalBytes },
      assetOffset,
      assets: job.package.assets.slice(assetOffset).map(a => ({ oldId: a.oldId, newId: a.newId, oldBytes: a.oldBytes, bytes: a.bytes, width: a.width, height: a.height,
        names: groups.get(a.oldId)?.products.map(p => p.name) || [] })),
    };
  }
  get(tenantId: string, id: string) { return this.view(this.read(tenantId, id)); }
  list(tenantId: string) {
    assertImageId(tenantId);
    if (!fs.existsSync(this.root)) return [];
    return fs.readdirSync(this.root, { withFileTypes: true }).filter(d => d.isDirectory() && /^[0-9a-f-]{36}$/i.test(d.name))
      .slice(0, 1000).flatMap(d => {
        try { const j = this.read(tenantId, d.name); return [{ id: j.id, createdAt: j.createdAt, prepared: j.prepared, mode: j.run.mode, complete: j.run.complete }]; }
        catch { return []; } // Another tenant or incomplete creation; never expose other tenants.
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
  }
  async create(tenantId: string, id: string, limit: number | 'all') {
    assertImageId(id);
    if (limit !== 'all' && (!Number.isInteger(limit) || limit < 1 || limit > 500)) throw Error('LIMIT_MUST_BE_ALL_OR_1_TO_500');
    return this.locked(tenantId, async db => {
      if (fs.existsSync(path.join(this.dir(id), 'job.json'))) return this.get(tenantId, id); // Lost HTTP response: same job, not another plan.
      this.space();
      if (fs.readdirSync(this.root).length >= 1000) throw Error('JOB_STORAGE_LIMIT_REACHED');
      await db.connection.query('SET SESSION TRANSACTION READ ONLY');
      const [rows] = await db.connection.query<RowDataPacket[]>(`SELECT id,name,imageUrl FROM ${safeDatabase(db.databaseName)}.products WHERE imageUrl IS NOT NULL ORDER BY id LIMIT 10001`);
      if (rows.length > 10000) throw Error('CATALOG_TOO_LARGE_FOR_THIS_RUN');
      const groups = new Map<string, Group>(); let external = 0, missing = 0, oversized = 0;
      for (const p of rows) {
        const match = String(p.imageUrl).match(/^(?:https?:\/\/[^/?#]+)?\/api\/products\/uploads\/images\/([0-9a-f-]{36})$/i);
        if (!match) { external++; continue; }
        try { assertImageId(match[1]); } catch { external++; continue; }
        const g = groups.get(match[1]) || { oldId: match[1], bytes: 0, products: [] };
        g.products.push({ id: p.id, name: p.name, imageUrl: p.imageUrl }); groups.set(match[1], g);
      }
      const all = [...groups.values()];
      for (let i = 0; i < all.length; i += 100) {
        const ids = all.slice(i, i + 100).map(g => g.oldId);
        const [sizes] = await db.connection.execute<RowDataPacket[]>(`SELECT id,OCTET_LENGTH(data) bytes FROM images WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        for (const s of sizes) groups.get(s.id)!.bytes = Number(s.bytes);
      }
      for (const g of all) { if (!g.bytes) missing++; else if (g.bytes > IMAGE_INPUT_BYTES) oversized++; }
      // Largest first. Already small images are left alone; no repeated generation/recompression.
      const selected = selectImageCandidates(all, limit);
      const createdAt = new Date().toISOString();
      const job: ImageJob = { id, tenantId, databaseName: db.databaseName, createdAt, groups: selected,
        inspected: rows.length, external, missing, oversized, totalBytes: all.reduce((n, g) => n + g.bytes, 0),
        prepared: selected.length === 0, package: { version: 1, policy: PRODUCT_IMAGE_POLICY, tenantId, databaseName: db.databaseName, createdAt, assets: [], entries: [] },
        simulations: {}, run: { id: randomUUID(), mode: 'prepare', cursor: 0, complete: selected.length === 0, counts: {} } };
      fs.mkdirSync(this.dir(id), { mode: 0o700 });
      this.journal(job, { phase: 'created_read_only', tenantId, databaseName: db.databaseName }); this.save(job);
      return this.view(job);
    });
  }
  private assetData(job: ImageJob, id: string) {
    const a = job.package.assets.find(a => a.newId === id); if (!a) throw Error('ASSET_NOT_IN_PACKAGE');
    const file = path.join(this.dir(job.id), a.newId + '.webp');
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size !== a.bytes || st.size > IMAGE_OUTPUT_BYTES) throw Error('INVALID_ASSET_FILE');
    const data = fs.readFileSync(file);
    if (sha256(data) !== a.newHash) throw Error('ASSET_CHECKSUM_MISMATCH');
    return data;
  }
  async preview(tenantId: string, id: string, assetId: string, original: boolean) {
    const job = this.read(tenantId, id); const a = job.package.assets.find(a => a.newId === assetId);
    if (!a) throw Error('ASSET_NOT_IN_PACKAGE');
    if (!original) return { data: this.assetData(job, assetId), mime: 'image/webp' };
    // Explicit per-photo original preview only, never download the entire gallery of large originals.
    return this.locked(tenantId, async db => {
      if (db.databaseName !== job.databaseName) throw Error('TENANT_DATABASE_MISMATCH');
      const [[row]] = await db.connection.execute<RowDataPacket[]>('SELECT data,mimeType FROM images WHERE id=? AND OCTET_LENGTH(data)<=?', [a.oldId, IMAGE_INPUT_BYTES]);
      if (!row || sha256(row.data) !== a.oldHash || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(row.mimeType)) throw Error('SOURCE_CHANGED');
      return { data: row.data as Buffer, mime: row.mimeType as string };
    });
  }
  async start(tenantId: string, id: string, mode: ImageRunMode, approval: any) {
    return this.locked(tenantId, async db => {
      const job = this.read(tenantId, id);
      if (db.databaseName !== job.databaseName) throw Error('TENANT_DATABASE_MISMATCH');
      authorizeImageRun(job, mode, approval);
      this.space();
      // Each artifact is checked at its step, before mutation. Do not read thousands of files in one request.
      job.run = { id: randomUUID(), mode, cursor: 0, complete: false, counts: {} };
      // A new simulation must finish; an interrupted simulation cannot reuse a previous approval.
      if (mode === 'simulate_apply') delete job.simulations.apply;
      if (mode === 'simulate_rollback') delete job.simulations.rollback;
      this.journal(job, { phase: 'start', mode, packageHash: job.packageHash, confirmed: approval?.confirmed === true, backupReference: approval?.backupReference || null });
      this.save(job); return this.view(job);
    });
  }
  async step(tenantId: string, id: string, runId: string, cursor: number, approval: any) {
    return this.locked(tenantId, async db => {
      const job = this.read(tenantId, id);
      if (db.databaseName !== job.databaseName) throw Error('TENANT_DATABASE_MISMATCH');
      if (job.run.id !== runId || !Number.isInteger(cursor) || cursor < 0 || cursor > job.run.cursor) throw Error('STALE_RUN');
      if (cursor < job.run.cursor || job.run.complete) return this.view(job, approval?.assetCursor); // Duplicate request, no next mutation.
      this.space();
      let outcome: string;
      if (job.run.mode === 'prepare') {
        const group = job.groups[cursor];
        await db.connection.query('SET SESSION TRANSACTION READ ONLY');
        const [[source]] = await db.connection.execute<RowDataPacket[]>('SELECT data FROM images WHERE id=? AND OCTET_LENGTH(data)<=?', [group.oldId, IMAGE_INPUT_BYTES]);
        outcome = 'missing_or_too_large';
        if (source) {
          try {
            const result = await productImageOptimizer.optimize(source.data);
            outcome = 'less_than_10_percent_saving';
            if (result.data.length < source.data.length * 0.9) {
              const newId = randomUUID();
              const asset = { oldId: group.oldId, oldHash: sha256(source.data), oldBytes: source.data.length, newId,
                newHash: sha256(result.data), bytes: result.data.length, width: result.width, height: result.height };
              durableWrite(path.join(this.dir(id), newId + '.webp'), result.data, 'wx');
              job.package.assets.push(asset);
              job.package.entries.push(...group.products.map(p => ({ productId: p.id, oldUrl: p.imageUrl, assetId: newId })));
              outcome = 'prepared';
            }
          } catch (e: any) {
            // Saturation is transient, not an unsupported image; preserve cursor to resume later.
            if (e?.getStatus?.() === 429) throw Error('MAINTENANCE_BUSY');
            if (!e?.getStatus) throw e;
            outcome = 'unsupported_or_invalid_image';
          }
        }
      } else {
        authorizeImageRun(job, job.run.mode, approval);
        const dryRun = job.run.mode.startsWith('simulate_');
        const direction = job.run.mode.endsWith('rollback') ? 'rollback' : 'apply';
        const entry = job.package.entries[cursor], asset = job.package.assets.find(a => a.newId === entry.assetId)!;
        const data = this.assetData(job, asset.newId);
        this.journal(job, { phase: 'intent', mode: job.run.mode, cursor, productId: entry.productId, oldUrl: entry.oldUrl, newId: asset.newId });
        outcome = await changeImageLink(mysqlImageStore(db.connection, db.databaseName, dryRun), entry, asset, data, direction, dryRun);
        if (!dryRun) this.products.invalidateCache(tenantId);
      }
      this.journal(job, { phase: 'result', cursor, outcome });
      job.run.counts[outcome] = (job.run.counts[outcome] || 0) + 1;
      job.run.cursor++;
      job.run.complete = job.run.cursor >= (job.run.mode === 'prepare' ? job.groups.length : job.package.entries.length);
      if (job.run.complete) {
        if (job.run.mode === 'prepare') {
          job.prepared = true;
          if (job.package.assets.length) { validatePackage(job.package); job.packageHash = sha256(JSON.stringify(job.package)); }
        }
        if (job.run.mode === 'simulate_apply') job.simulations.apply = job.packageHash;
        if (job.run.mode === 'simulate_rollback') job.simulations.rollback = job.packageHash;
      }
      this.save(job); return this.view(job, approval?.assetCursor);
    });
  }
}
