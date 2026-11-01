// node --test tests/network-probe.test.cjs
// Optional real Nginx check: PDV_TEST_NGINX_IMAGE=pdv-frontend:latest (existing local image).
// Creates/removes only its own disposable container; no running PDV service or database touched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/hooks/useNetworkStatus.ts'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function harness(samples, online = true) {
  const states = [], effects = [], requests = [], timers = new Map();
  let clock = 0, timerId = 0;
  const react = {
    useState: initial => { const index = states.push(initial) - 1; return [initial, next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef: current => ({ current }), useCallback: fn => fn, useEffect: fn => effects.push(fn),
  };
  const axios = { create: options => {
    assert.equal(options.baseURL, '/'); assert.equal(options.timeout, 8000);
    return { get: async (url, config) => {
      requests.push({ url, config });
      const sample = samples.shift() || {};
      clock += sample.latency || 100;
      if (sample.error) throw sample.error;
      return { data: { status: 'ok' } };
    } };
  }, isCancel: err => err.code === 'ERR_CANCELED' };
  const context = { exports: {}, require: id => {
    if (id === 'react') return react;
    if (id === 'axios') return { default: axios };
    throw new Error(`Unexpected dependency ${id}`);
  }, navigator: { onLine: online }, window: { addEventListener() {}, removeEventListener() {} }, AbortController,
    Date: { now: () => clock },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.exports.useNetworkStatus();
  const cleanup = effects.map(fn => fn()).filter(fn => typeof fn === 'function');
  await flush();
  return { states, requests, timers, cleanup: () => cleanup.forEach(fn => fn()), tick: async () => {
    const [id, timer] = timers.entries().next().value; timers.delete(id); await timer.fn(); await flush();
  } };
}

test('probe uses same-origin /api/ with bounded timeout, no auth and cache bypass', async () => {
  const h = await harness([{}]); const req = h.requests[0];
  assert.equal(req.url, '/api/'); assert.equal(req.config.headers['Cache-Control'], 'no-cache');
  assert.equal(req.config.headers.Authorization, undefined); assert.ok(req.config.signal);
  assert.equal(h.states[0], 'online'); assert.equal([...h.timers.values()][0].delay, 60000);
  h.cleanup(); assert.equal(h.timers.size, 0); assert.equal(req.config.signal.aborted, true);
});
test('one failure does not falsely degrade; two failures still warn', async () => {
  const h = await harness([{ error: { code: 'ERR_NETWORK' } }, { error: { code: 'ECONNABORTED' } }]);
  assert.equal(h.states[0], 'online'); await h.tick(); assert.equal(h.states[0], 'degraded'); h.cleanup();
});
test('genuinely slow API responses still cause degraded status', async () => {
  const h = await harness([{ latency: 3500 }, { latency: 3500 }]);
  await h.tick(); assert.equal(h.states[0], 'degraded'); h.cleanup();
});
test('API recovery requires two successful checks after a failure sequence', async () => {
  const h = await harness([{ error: { code: 'ERR_NETWORK' } }, { error: { code: 'ERR_NETWORK' } }, {}, {}]);
  await h.tick(); await h.tick(); assert.equal(h.states[0], 'degraded');
  await h.tick(); assert.equal(h.states[0], 'recovering'); h.cleanup();
});
test('browser offline does not send requests; voluntary cancellation is not a failure', async () => {
  const offline = await harness([], false); assert.equal(offline.states[0], 'offline'); assert.equal(offline.requests.length, 0); offline.cleanup();
  const cancelled = await harness([{ error: { code: 'ERR_CANCELED' } }]);
  assert.equal(cancelled.states[0], 'online'); assert.equal(cancelled.timers.size, 0); cancelled.cleanup();
});
test('old /api clients are internally rewritten without a redirect or TLS change', () => {
  const nginx = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');
  const exact = nginx.match(/location = \/api\s*\{([^}]+)\}/)?.[1];
  assert.ok(exact); assert.match(exact, /rewrite \^ \/api\/ last;/);
  assert.doesNotMatch(exact, /return 30|redirect|permanent|https?:\/\//);
  assert.match(nginx, /proxy_pass http:\/\/backend:3520;/);
});

test('real Nginx: /api and /api/ preserve queries/methods, return JSON with no HTTP redirect', { skip: !process.env.PDV_TEST_NGINX_IMAGE, timeout: 30000 }, () => {
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
  let id;
  try {
    id = docker(['run', '--rm', '-d', '--network', 'none', '--read-only', '--tmpfs', '/var/cache/nginx', '--tmpfs', '/var/run', '--tmpfs', '/tmp',
      '--add-host', 'backend:127.0.0.1',
      '--mount', `type=bind,source=${path.join(root, 'nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
      '--mount', `type=bind,source=${path.join(__dirname, 'fixtures/probe-backend.conf')},target=/etc/nginx/conf.d/probe-backend.conf,readonly`,
      process.env.PDV_TEST_NGINX_IMAGE]).trim();
    assert.match(id, /^[a-f0-9]{64}$/);
    docker(['exec', id, 'nginx', '-t']);
    for (const route of ['/api', '/api/', '/api?probe=1', '/api/?probe=1', '/api/products?limit=1']) {
      const request = `GET ${route} HTTP/1.1\r\nHost: pdv.example.test\r\nX-Forwarded-Proto: https\r\nConnection: close\r\n\r\n`;
      const result = execFileSync('docker', ['exec', '-i', id, 'nc', '-w', '3', '127.0.0.1', '3521'], { input: request, encoding: 'utf8', timeout: 5000 });
      assert.match(result, /HTTP\/1.1 200 OK/); assert.doesNotMatch(result, /\r\nLocation:/i);
      const body = JSON.parse(result.split('\r\n\r\n')[1]);
      assert.equal(body.status, 'ok'); assert.equal(body.method, 'GET');
      assert.equal(body.uri, route.replace(/^\/api(?=\?|$)/, '/api/'));
    }
  } finally {
    if (id && /^[a-f0-9]{64}$/.test(id)) docker(['rm', '-f', id]);
  }
});
