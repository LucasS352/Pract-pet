#!/usr/bin/env node
/**
 * Script idempotente para importação em massa de dados e imagens de produtos (Pacote S.O.S / Multi-tenant).
 *
 * Regras de segurança e idempotência:
 * - Localiza o produto prioritariamente por `barcode` e, como segunda opção, por `shortCode`.
 * - NUNCA relaciona produtos somente pelo nome.
 * - Otimiza e valida a imagem com o mesmo pipeline do backend (WebP, máx 800px, máx 200KB, sem EXIF).
 * - Faz upload da imagem para a tabela `images` do banco Heart reutilizando imagem idêntica se já existir
 *   (evita duplicação em execuções repetidas).
 * - Atualiza `imageUrl` no produto do tenant (`/api/products/uploads/images/{imageId}`).
 * - Atualiza demais campos (`name`, `category`, `unit`, `priceCost`, `priceSell`, `stock`, `minStock`, `barcode`)
 *   somente quando preenchidos no manifesto CSV.
 * - Não apaga, não recria e não duplica produtos existentes.
 * - Suporta `--dry-run` (padrão) e `--apply` (gravação real), além de `--backup` para exportar snapshot prévio.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const backendNodeModules = path.resolve(__dirname, '../node_modules');
const mysql = require(path.join(backendNodeModules, 'mysql2/promise'));
const sharp = require(path.join(backendNodeModules, 'sharp'));

const IMAGE_URL_PREFIX = '/api/products/uploads/images/';
const IMAGE_OUTPUT_EDGE = 800;
const IMAGE_OUTPUT_BYTES = 200 * 1024;
const IMAGE_INPUT_PIXELS = 50_000_000;

sharp.concurrency(1);
sharp.cache({ memory: 8, files: 0, items: 20 });

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Converte um identificador estável de conteúdo (SHA-256 da imagem otimizada) em um UUID v5-like determinístico,
 * garantindo que a mesma imagem otimizada tenha sempre o mesmo ID no banco Heart sem duplicar linhas.
 */
function deterministicUuidFromHash(hexHash) {
  const bytes = Buffer.from(hexHash.slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC4122
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function optimizeAndValidateImage(inputBuffer) {
  const options = { failOn: 'warning', limitInputPixels: IMAGE_INPUT_PIXELS, sequentialRead: true };
  const metadata = await sharp(inputBuffer, options).timeout({ seconds: 8 }).metadata();
  if (
    !['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '') ||
    !metadata.width ||
    !metadata.height ||
    (metadata.pages || 1) !== 1
  ) {
    throw new Error('Formato não suportado ou imagem animada.');
  }

  // Se já estiver em WebP dentro das dimensões e tamanho da política e sem EXIF, valida os pixels e reaproveita
  if (
    metadata.format === 'webp' &&
    metadata.width <= IMAGE_OUTPUT_EDGE &&
    metadata.height <= IMAGE_OUTPUT_EDGE &&
    !metadata.exif &&
    inputBuffer.length <= IMAGE_OUTPUT_BYTES
  ) {
    await sharp(inputBuffer, options).timeout({ seconds: 8 }).raw().toBuffer();
    return {
      data: inputBuffer,
      mimeType: 'image/webp',
      width: metadata.width,
      height: metadata.height,
    };
  }

  for (const quality of [80, 68, 58]) {
    const { data, info } = await sharp(inputBuffer, options)
      .autoOrient()
      .resize({ width: IMAGE_OUTPUT_EDGE, height: IMAGE_OUTPUT_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 3 })
      .timeout({ seconds: 8 })
      .toBuffer({ resolveWithObject: true });

    if (data.length <= IMAGE_OUTPUT_BYTES) {
      return {
        data,
        mimeType: 'image/webp',
        width: info.width,
        height: info.height,
      };
    }
  }
  throw new Error('A imagem continua acima de 200 KB após otimização.');
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function readManifestCsv(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    throw new Error(`Manifesto vazio ou sem registros: ${csvPath}`);
  }

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length !== headers.length) {
      throw new Error(
        `Linha ${i + 1} do manifesto possui ${values.length} colunas, mas o cabeçalho exige ${headers.length}. Use aspas em campos com vírgula.`
      );
    }
    const row = { _line: i + 1 };
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

function parseArgs(argv) {
  const args = {
    tenantDb: process.env.TENANT_DB || 's_o_s',
    heartDb: process.env.HEART_DB || 'heart',
    packageDir: path.resolve(__dirname, '../../imagens-produtos-sos'),
    manifestFile: 'produtos-sos.csv',
    dryRun: true,
    backup: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.dryRun = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--no-backup') args.backup = false;
    else if (arg.startsWith('--tenant-db=')) args.tenantDb = arg.split('=')[1];
    else if (arg.startsWith('--package-dir=')) args.packageDir = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--manifest=')) args.manifestFile = arg.split('=')[1];
  }
  return args;
}

function safeIdentifier(name) {
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(name)) {
    throw new Error(`Nome de banco inválido: ${name}`);
  }
  return '`' + name + '`';
}

async function createConnection(heartDb) {
  const urlStr = process.env.DATABASE_URL_HEART || 'mysql://root:7bar%402025@127.0.0.1:3308/heart';
  const url = new URL(urlStr);
  return mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: heartDb,
    charset: 'utf8mb4',
    connectTimeout: 8000,
    supportBigNumbers: true,
  });
}

async function exportBackup(conn, tenantDb, packageDir) {
  const dbIdent = safeIdentifier(tenantDb);
  const [products] = await conn.query(
    `SELECT p.*, c.name AS categoryName
     FROM ${dbIdent}.products p
     LEFT JOIN ${dbIdent}.categories c ON c.id = p.categoryId
     ORDER BY p.shortCode, p.name`
  );
  const backupDir = path.join(packageDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const snapshotPath = path.join(backupDir, `backup-products-${tenantDb}-latest.json`);
  const timestampedPath = path.join(
    backupDir,
    `backup-products-${tenantDb}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      tenantDb,
      totalProducts: products.length,
      products,
    },
    null,
    2
  );
  fs.writeFileSync(snapshotPath, payload, 'utf8');
  fs.writeFileSync(timestampedPath, payload, 'utf8');
  return { snapshotPath, timestampedPath, count: products.length };
}

async function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.isAbsolute(args.manifestFile)
    ? args.manifestFile
    : path.join(args.packageDir, args.manifestFile);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifesto não encontrado em: ${manifestPath}`);
  }

  const rows = readManifestCsv(manifestPath);
  const conn = await createConnection(args.heartDb);

  try {
    const tenantIdent = safeIdentifier(args.tenantDb);
    const heartIdent = safeIdentifier(args.heartDb);

    // 1. Backup preventivo antes de qualquer operação
    let backupInfo = null;
    if (args.backup) {
      backupInfo = await exportBackup(conn, args.tenantDb, args.packageDir);
    }

    // 2. Carrega todos os produtos e categorias atuais do tenant
    const [existingProducts] = await conn.query(
      `SELECT p.id, p.name, p.shortCode, p.barcode, p.unit, p.active,
              p.priceCost, p.priceSell, p.stock, p.minStock, p.imageUrl,
              p.categoryId, c.name AS categoryName
       FROM ${tenantIdent}.products p
       LEFT JOIN ${tenantIdent}.categories c ON c.id = p.categoryId`
    );

    const [existingCategories] = await conn.query(
      `SELECT id, name FROM ${tenantIdent}.categories`
    );

    const categoriesByName = new Map(
      existingCategories.map((c) => [String(c.name).trim().toLowerCase(), c])
    );

    const byBarcode = new Map();
    const byShortCode = new Map();
    const unidentifiableDbProducts = [];

    for (const p of existingProducts) {
      const bc = p.barcode ? String(p.barcode).trim() : '';
      const sc = p.shortCode ? String(p.shortCode).trim() : '';
      if (!bc && !sc) {
        unidentifiableDbProducts.push({ id: p.id, name: p.name });
      }
      if (bc) {
        byBarcode.set(bc, [...(byBarcode.get(bc) || []), p]);
      }
      if (sc) {
        byShortCode.set(sc, [...(byShortCode.get(sc) || []), p]);
      }
    }

    const report = {
      mode: args.dryRun ? 'DRY-RUN' : 'APPLY',
      tenantDb: args.tenantDb,
      manifestPath,
      backupSnapshot: backupInfo ? backupInfo.snapshotPath : null,
      summary: {
        totalManifestRows: rows.length,
        importedOrUpdated: 0,
        ignoredUnchanged: 0,
        errors: 0,
        unidentifiableInDb: unidentifiableDbProducts.length,
      },
      imported: [],
      ignored: [],
      errors: [],
      unidentifiableDbProducts,
    };

    for (const row of rows) {
      const lineNum = row._line;
      const barcode = (row.barcode || '').trim();
      const shortCode = (row.shortCode || '').trim();
      const filename = (row.filename || '').trim();

      // Regra: nunca relacionar somente pelo nome
      if (!barcode && !shortCode) {
        report.errors.push({
          line: lineNum,
          name: row.name || '',
          reason: 'Registro sem barcode e sem shortCode (proibido relacionar apenas pelo nome).',
        });
        continue;
      }

      // 1ª opção: barcode | 2ª opção: shortCode
      let matchedBy = null;
      let candidates = [];
      if (barcode && byBarcode.has(barcode)) {
        candidates = byBarcode.get(barcode);
        matchedBy = `barcode:${barcode}`;
      } else if (shortCode && byShortCode.has(shortCode)) {
        candidates = byShortCode.get(shortCode);
        matchedBy = `shortCode:${shortCode}`;
      }

      if (candidates.length === 0) {
        report.errors.push({
          line: lineNum,
          barcode,
          shortCode,
          name: row.name || '',
          reason: 'Produto não encontrado no banco por barcode nem por shortCode.',
        });
        continue;
      }

      if (candidates.length > 1) {
        report.errors.push({
          line: lineNum,
          barcode,
          shortCode,
          name: row.name || '',
          reason: `Identificador ambíguo (${matchedBy}) corresponde a ${candidates.length} produtos.`,
        });
        continue;
      }

      const product = candidates[0];

      // Validação e otimização da imagem
      if (!filename) {
        report.errors.push({
          line: lineNum,
          productId: product.id,
          shortCode: product.shortCode,
          reason: 'Coluna filename vazia no manifesto.',
        });
        continue;
      }

      const imagePath = path.join(args.packageDir, filename);
      if (!fs.existsSync(imagePath)) {
        report.errors.push({
          line: lineNum,
          productId: product.id,
          shortCode: product.shortCode,
          filename,
          reason: `Arquivo de imagem não encontrado: ${imagePath}`,
        });
        continue;
      }

      let optimized;
      try {
        const rawBuf = fs.readFileSync(imagePath);
        optimized = await optimizeAndValidateImage(rawBuf);
      } catch (err) {
        report.errors.push({
          line: lineNum,
          productId: product.id,
          shortCode: product.shortCode,
          filename,
          reason: `Falha ao validar/otimizar imagem: ${err.message}`,
        });
        continue;
      }

      const imageHash = sha256(optimized.data);
      const deterministicImageId = deterministicUuidFromHash(imageHash);

      // Verifica se já existe imagem com mesmo hash no Heart (ou se a imagem atual do produto já é idêntica)
      let targetImageId = deterministicImageId;
      let needInsertImage = true;

      if (product.imageUrl && product.imageUrl.startsWith(IMAGE_URL_PREFIX)) {
        const currentImgId = product.imageUrl.slice(IMAGE_URL_PREFIX.length);
        const [curRows] = await conn.execute(
          `SELECT id, SHA2(data, 256) AS hash FROM ${heartIdent}.images WHERE id = ?`,
          [currentImgId]
        );
        if (curRows.length === 1 && String(curRows[0].hash).toLowerCase() === imageHash.toLowerCase()) {
          targetImageId = currentImgId;
          needInsertImage = false;
        }
      }

      if (needInsertImage) {
        const [existingImgRows] = await conn.execute(
          `SELECT id, SHA2(data, 256) AS hash FROM ${heartIdent}.images WHERE id = ?`,
          [deterministicImageId]
        );
        if (existingImgRows.length === 1) {
          needInsertImage = false;
        }
      }

      const targetImageUrl = `${IMAGE_URL_PREFIX}${targetImageId}`;

      // Prepara campos a atualizar somente quando presentes no manifesto
      const updates = {};
      const changes = [];

      if (product.imageUrl !== targetImageUrl) {
        updates.imageUrl = targetImageUrl;
        changes.push(`imageUrl: ${product.imageUrl || 'NULL'} -> ${targetImageUrl}`);
      }

      if (row.name !== undefined && row.name !== '' && row.name !== product.name) {
        updates.name = row.name;
        changes.push(`name: "${product.name}" -> "${row.name}"`);
      }

      if (barcode !== '' && barcode !== (product.barcode || '')) {
        updates.barcode = barcode;
        changes.push(`barcode: ${product.barcode || 'NULL'} -> ${barcode}`);
      }

      if (row.unit !== undefined && row.unit !== '' && row.unit !== product.unit) {
        updates.unit = row.unit;
        changes.push(`unit: ${product.unit} -> ${row.unit}`);
      }

      if (row.priceCost !== undefined && row.priceCost !== '') {
        const nextCost = Number(row.priceCost);
        if (!Number.isFinite(nextCost) || nextCost < 0) {
          report.errors.push({ line: lineNum, shortCode, reason: `priceCost inválido: ${row.priceCost}` });
          continue;
        }
        if (Math.abs(Number(product.priceCost) - nextCost) > 0.0001) {
          updates.priceCost = nextCost.toFixed(4);
          changes.push(`priceCost: ${Number(product.priceCost).toFixed(2)} -> ${nextCost.toFixed(2)}`);
        }
      }

      if (row.priceSell !== undefined && row.priceSell !== '') {
        const nextSell = Number(row.priceSell);
        if (!Number.isFinite(nextSell) || nextSell < 0) {
          report.errors.push({ line: lineNum, shortCode, reason: `priceSell inválido: ${row.priceSell}` });
          continue;
        }
        if (Math.abs(Number(product.priceSell) - nextSell) > 0.0001) {
          updates.priceSell = nextSell.toFixed(4);
          changes.push(`priceSell: ${Number(product.priceSell).toFixed(2)} -> ${nextSell.toFixed(2)}`);
        }
      }

      if (row.stock !== undefined && row.stock !== '') {
        const nextStock = Number(row.stock);
        if (!Number.isFinite(nextStock) || nextStock < 0) {
          report.errors.push({ line: lineNum, shortCode, reason: `stock inválido: ${row.stock}` });
          continue;
        }
        if (Math.abs(Number(product.stock) - nextStock) > 0.0001) {
          updates.stock = nextStock.toFixed(3);
          changes.push(`stock: ${Number(product.stock)} -> ${nextStock}`);
        }
      }

      if (row.minStock !== undefined && row.minStock !== '') {
        const nextMin = Number(row.minStock);
        if (!Number.isFinite(nextMin) || nextMin < 0) {
          report.errors.push({ line: lineNum, shortCode, reason: `minStock inválido: ${row.minStock}` });
          continue;
        }
        const curMin = product.minStock !== null && product.minStock !== undefined ? Number(product.minStock) : null;
        if (curMin === null || Math.abs(curMin - nextMin) > 0.0001) {
          updates.minStock = nextMin.toFixed(3);
          changes.push(`minStock: ${curMin ?? 'NULL'} -> ${nextMin}`);
        }
      }

      if (row.category !== undefined && row.category !== '') {
        const catKey = row.category.trim().toLowerCase();
        let cat = categoriesByName.get(catKey);
        if (!cat) {
          if (!args.dryRun) {
            const newCatId = crypto.randomUUID();
            await conn.execute(
              `INSERT INTO ${tenantIdent}.categories (id, name, createdAt, updatedAt) VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
              [newCatId, row.category.trim()]
            );
            cat = { id: newCatId, name: row.category.trim() };
            categoriesByName.set(catKey, cat);
          } else {
            cat = { id: '(nova-categoria)', name: row.category.trim() };
          }
        }
        if (cat.id !== product.categoryId) {
          updates.categoryId = cat.id;
          changes.push(`category: "${product.categoryName || ''}" -> "${cat.name}"`);
        }
      }

      if (!product.active) {
        updates.active = 1;
        changes.push(`active: 0 -> 1`);
      }

      if (changes.length === 0 && !needInsertImage) {
        report.ignored.push({
          line: lineNum,
          matchedBy,
          productId: product.id,
          shortCode: product.shortCode,
          barcode: product.barcode,
          name: product.name,
          filename,
          imageUrl: product.imageUrl,
          reason: 'Produto e imagem já estão idênticos ao manifesto.',
        });
        continue;
      }

      if (!args.dryRun) {
        await conn.beginTransaction();
        try {
          if (needInsertImage) {
            await conn.execute(
              `INSERT INTO ${heartIdent}.images (id, data, mimeType, createdAt) VALUES (?, ?, 'image/webp', UTC_TIMESTAMP(3))`,
              [targetImageId, optimized.data]
            );
          }

          const cols = Object.keys(updates);
          if (cols.length > 0) {
            const setClause = cols.map((c) => `${safeIdentifier(c)} = ?`).join(', ');
            const params = [...cols.map((c) => updates[c]), product.id];
            await conn.execute(
              `UPDATE ${tenantIdent}.products SET ${setClause}, updatedAt = UTC_TIMESTAMP(3) WHERE id = ?`,
              params
            );
          }
          await conn.commit();
        } catch (txErr) {
          await conn.rollback();
          report.errors.push({
            line: lineNum,
            matchedBy,
            productId: product.id,
            shortCode: product.shortCode,
            reason: `Erro na gravação SQL: ${txErr.message}`,
          });
          continue;
        }
      }

      report.imported.push({
        line: lineNum,
        matchedBy,
        productId: product.id,
        shortCode: product.shortCode,
        barcode: updates.barcode || product.barcode || null,
        name: updates.name || product.name,
        filename,
        imageBytes: optimized.data.length,
        dimensions: `${optimized.width}x${optimized.height}`,
        imageUrl: targetImageUrl,
        imageInserted: needInsertImage,
        changes,
      });
    }

    report.summary.importedOrUpdated = report.imported.length;
    report.summary.ignoredUnchanged = report.ignored.length;
    report.summary.errors = report.errors.length;

    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
