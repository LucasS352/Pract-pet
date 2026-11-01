const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/components/ImageOptimizationPanel.tsx'), 'utf8');
const flow = source.slice(source.indexOf('  const drain = '), source.indexOf('  const loadPreview'));
function harness({ confirm = true, paused = false, failSimulation = false, resume = false } = {}) {
  const calls = [], stop = { current: false }, mounted = { current: true };
  let current = { id: 'job', databaseName: 'shop', packageHash: 'hash', assets: [], run: { id: 'run', mode: resume ? 'apply' : 'prepare', cursor: resume ? 1 : 0, complete: !resume } };
  let pending;
  const sandbox = { stop, mounted, job: current, tenant: { name: 'Loja' }, busyRef: { current: false }, base: '/maintenance', headers: {},
    window: { confirm: () => confirm }, updateJob: () => {}, setTimeout,
    task: action => { pending = action(); return pending; },
    maintenance: {
      get: async () => ({ data: current }),
      post: async (url, body) => {
        calls.push({ url, body });
        if (url.endsWith('/start')) current = { ...current, run: { id: 'new-run', mode: body.mode, cursor: 0, complete: false } };
        else {
          if (failSimulation && current.run.mode === 'simulate_apply') throw Error('network failure');
          current = { ...current, run: { ...current.run, cursor: current.run.cursor + 1, complete: true } };
          if (paused && current.run.mode === 'simulate_apply') stop.current = true;
        }
        return { data: current };
      },
    },
  };
  const js = ts.transpileModule(flow + '\nglobalThis.runSave = save;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, sandbox);
  return { calls, run: async () => { sandbox.runSave(); await pending; } };
}
test('simple Save verifies first, then applies with explicit confirmation and same package scope', async () => {
  const h = harness(); await h.run();
  assert.deepEqual(h.calls.filter(c => c.url.endsWith('/start')).map(c => c.body.mode), ['simulate_apply', 'apply']);
  const apply = h.calls.at(-1).body;
  assert.equal(apply.confirmed, true); assert.equal(apply.packageHash, 'hash'); assert.equal(apply.confirmDatabase, 'shop');
  assert.equal(apply.backupReference, undefined);
});
test('canceling confirmation does not initiate a request', async () => { const h = harness({ confirm: false }); await h.run(); assert.equal(h.calls.length, 0); });
test('pause after simulation never starts application', async () => {
  const h = harness({ paused: true }); await h.run(); assert.equal(h.calls.some(c => c.body.mode === 'apply'), false);
});
test('simulation failure never falls through into application', async () => {
  const h = harness({ failSimulation: true }); await assert.rejects(h.run(), /network failure/); assert.equal(h.calls.some(c => c.body.mode === 'apply'), false);
});
test('resuming an interrupted application uses its saved cursor without starting another run', async () => {
  const h = harness({ resume: true }); await h.run(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].body.cursor, 1); assert.equal(h.calls[0].body.runId, 'run');
});
test('analysis requests all images, with no numeric sample input or manual backup/hash fields', () => {
  assert.match(source, /limit: 'all'/); assert.doesNotMatch(source, /setLimit|setBackupReference|setConfirmDatabase|setReviewed/);
});
