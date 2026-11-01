// node --test tests/bulk-images.test.cjs — synthetic files, no product writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, FormData, File };
vm.createContext(context);
vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/bulk-images.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { imageBatches, imageResults, imageFormData, uploadImageBatches, IMAGE_BATCH_BYTES } = context.exports;
const item = (i, size = 10) => ({ id: `image-${i}`, file: { name: `Água ${i}.jpg`, size }, status: 'pending' });
const response = batch => ({ details: { matched: batch.map(x => ({ fileId: x.id, fileName: 'ignored', productName: 'Água' })), errors: [], notFound: [] } });

test('352 files split by both size and count without losing order or duplicating', () => {
  const items = Array.from({ length: 352 }, (_, i) => item(i, i % 2 ? 500_000 : 3_000_000));
  const batches = imageBatches(items);
  assert.equal(batches.flat().length, 352);
  assert.equal(batches.flat().map(x => x.id).join(','), items.map(x => x.id).join(','));
  for (const batch of batches) {
    assert.ok(batch.length <= 10);
    assert.ok(batch.reduce((sum, x) => sum + x.file.size, 0) <= IMAGE_BATCH_BYTES);
  }
  assert.equal(imageBatches(Array.from({ length: 352 }, (_, i) => item(i))).length, 36);
  assert.throws(() => imageBatches([item(0, IMAGE_BATCH_BYTES + 1)]));
});
test('multipart preserves original UTF-8 name in JSON and uses ASCII ID on wire', () => {
  const original = 'Álcool Etílico Líquido 70° Frasco 1L.jpg';
  const form = imageFormData([{ ...item(0), file: new File(['x'], original, { type: 'image/jpeg' }) }]);
  assert.equal(JSON.parse(form.get('manifest'))[0].fileName, original);
  assert.equal(form.get('files').name, 'image-0');
});
test('matching uses IDs, even with duplicate or corrupted response names', () => {
  const batch = [item(0), item(1), item(2)];
  const results = imageResults(batch, { details: {
    matched: [{ fileId: 'image-1', fileName: 'broken', productName: 'Água' }],
    notFound: [{ fileId: 'image-0', fileName: 'broken' }],
    errors: [{ fileId: 'image-2', fileName: 'broken', error: 'ambiguous' }],
  } });
  assert.equal(results.map(x => x.status).join(','), 'no-match,success,error');
});
test('missing or duplicate outcomes never leave spinner running', () => {
  for (const data of [{}, { details: { matched: [], notFound: [], errors: [] } },
    { details: { matched: response([item(0), item(0)]).details.matched } }]) {
    assert.equal(imageResults([item(0)], data)[0].status, 'error');
  }
});
test('sequential batches, progress after acknowledgement, no concurrent requests', async () => {
  let active = 0, peak = 0, sends = 0, acknowledged = 0;
  const seen = new Map();
  const ok = await uploadImageBatches(Array.from({ length: 25 }, (_, i) => item(i)), async batch => {
    sends++; peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    acknowledged += batch.length; active--; return response(batch);
  }, outcomes => outcomes.forEach(x => seen.set(x.id, x.status)), count => assert.equal(count, acknowledged), new AbortController().signal);
  assert.equal(ok, true); assert.equal(peak, 1); assert.equal(sends, 3);
  assert.equal([...seen.values()].filter(x => x === 'success').length, 25);
});
test('lost response stops without retry: successes retained, current batch error, remaining pending', async () => {
  const items = Array.from({ length: 25 }, (_, i) => item(i));
  const seen = new Map(items.map(x => [x.id, x.status])); let sends = 0;
  const ok = await uploadImageBatches(items, async batch => {
    if (++sends === 2) throw new Error('timeout'); return response(batch);
  }, outcomes => outcomes.forEach(x => seen.set(x.id, x.status)), () => {}, new AbortController().signal);
  assert.equal(ok, false); assert.equal(sends, 2);
  assert.equal([...seen.values()].filter(x => x === 'success').length, 10);
  assert.equal([...seen.values()].filter(x => x === 'error').length, 10);
  assert.equal([...seen.values()].filter(x => x === 'pending').length, 5);
});
test('unmount abort prevents subsequent batches and late state updates', async () => {
  const controller = new AbortController(); let updates = 0, sends = 0;
  const ok = await uploadImageBatches(Array.from({ length: 25 }, (_, i) => item(i)), async batch => {
    sends++; controller.abort(); return response(batch);
  }, () => updates++, () => assert.fail('late progress'), controller.signal);
  assert.equal(ok, false); assert.equal(sends, 1); assert.equal(updates, 1);
});
