/**
 * Script de Migração de Imagens — comprime BLOBs existentes no banco heart
 * 
 * Uso: docker compose exec backend node dist/prisma/migrate-images.js
 * 
 * O que faz:
 *   1. Busca todas as imagens da tabela `images` no banco heart
 *   2. Recomprime cada uma para JPEG otimizado (max 1200px, qualidade 82%)
 *   3. Atualiza o registro no banco com o BLOB menor
 * 
 * Resultado esperado: ~400MB → ~8-12MB (redução de ~97%)
 */

const { Jimp } = require('jimp');
const { PrismaClient } = require('../src/generated/heart-client');

const prisma = new PrismaClient();

const MAX_PX   = 1200;
const QUALITY  = 82;
const BATCH    = 20;

async function compressWithJimp(buffer) {
  try {
    const img = await Jimp.fromBuffer(buffer);
    const { width, height } = img.bitmap;
    const scale = Math.min(1, MAX_PX / Math.max(width, height));
    if (scale < 1) {
      img.resize({ w: Math.round(width * scale), h: Math.round(height * scale) });
    }
    const compressed = await img.getBuffer('image/jpeg', { quality: QUALITY });
    return { data: compressed, mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}

async function main() {
  const total = await prisma.image.count();
  console.log(`\n🖼️  Total de imagens no banco: ${total}`);

  if (total === 0) {
    console.log('Nenhuma imagem para migrar.');
    return;
  }

  let processed = 0, skipped = 0, failed = 0, savedBytes = 0;

  for (let skip = 0; skip < total; skip += BATCH) {
    const images = await prisma.image.findMany({
      skip, take: BATCH,
      select: { id: true, data: true, mimeType: true },
    });

    for (const image of images) {
      const originalSize = image.data.length;

      if (originalSize < 200 * 1024) {
        skipped++;
        continue;
      }

      const result = await compressWithJimp(image.data);

      if (!result) { failed++; continue; }

      const newSize = result.data.length;

      if (newSize < originalSize * 0.9) {
        await prisma.image.update({
          where: { id: image.id },
          data: { data: result.data, mimeType: result.mimeType },
        });
        savedBytes += originalSize - newSize;
        processed++;
        process.stdout.write(`\r✅ [${processed+skipped+failed}/${total}] ${(originalSize/1024).toFixed(0)}KB -> ${(newSize/1024).toFixed(0)}KB | Economizado: ${(savedBytes/1024/1024).toFixed(1)}MB   `);
      } else {
        skipped++;
      }
    }
  }

  console.log('\n\n📊 Migração concluída!');
  console.log(`  Comprimidas: ${processed} | Puladas: ${skipped} | Falhas: ${failed}`);
  console.log(`  💾 Espaço recuperado: ${(savedBytes/1024/1024).toFixed(2)} MB`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
