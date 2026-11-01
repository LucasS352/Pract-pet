// Tests the GENERATED service worker: no browser cache/IndexedDB is touched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const routes = [];
class Strategy { constructor(options) { this.options = options; this.kind = this.constructor.name; } }
class CacheFirst extends Strategy {} class NetworkFirst extends Strategy {} class StaleWhileRevalidate extends Strategy {}
const noop = () => {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/sw.js'), 'utf8'), {
  self: { define: true, skipWaiting: noop },
  define: (_deps, factory) => factory({
    clientsClaim: noop, precacheAndRoute: noop, cleanupOutdatedCaches: noop,
    NavigationRoute: class {}, createHandlerBoundToURL: noop,
    registerRoute: (match, handler) => { if (typeof match === 'function') routes.push({ match, handler }); },
    CacheFirst, NetworkFirst, StaleWhileRevalidate, ExpirationPlugin: Strategy, CacheableResponsePlugin: Strategy,
  }),
});
const routeFor = (pathname, destination = '') => routes.find(r => r.match({ url: new URL('https://local.test' + pathname), sameOrigin: true, request: { destination } }));
test('private Sys-Init job and preview fetches are not stored by the service worker', () => {
  assert.equal(routeFor('/api/tenants/setup/tenant/image-optimization/jobs'), undefined);
  assert.equal(routeFor('/api/tenants/setup/tenant/image-optimization/jobs/job/preview/asset'), undefined);
});
test('maintenance UI loads on demand and does not resume operations on mount', () => {
  const page = fs.readFileSync(path.join(__dirname, '../src/app/sys-init/page.tsx'), 'utf8');
  const panel = fs.readFileSync(path.join(__dirname, '../src/components/ImageOptimizationPanel.tsx'), 'utf8');
  assert.match(page, /lazy\(\(\) => import\("@\/components\/ImageOptimizationPanel"\)\)/);
  assert.doesNotMatch(panel, /setInterval|localStorage|axios-retry/);
  assert.match(panel, /cursor: current\.run\.cursor/);
  assert.match(panel, /URL\.revokeObjectURL/);
  assert.match(panel, /stop\.current = true/);
});
test('product image hits CacheFirst before catalog NetworkFirst, even when fetched by URL', () => {
  const route = routeFor('/api/products/uploads/images/abc');
  assert.equal(route.handler.kind, 'CacheFirst');
  assert.equal(route.handler.options.cacheName, 'pdvpro-product-images-v1');
  assert.equal(routeFor('/api/products?limit=2000').handler.kind, 'NetworkFirst');
});
test('large images and unknown-length/error responses do not enter the dedicated SW cache', async () => {
  const { handler } = routeFor('/api/products/uploads/images/abc', 'image');
  const plugin = handler.options.plugins.find(p => p.cacheWillUpdate);
  const response = (size, status = 200) => ({ status, headers: { get: () => size } });
  const small = response('204800');
  assert.equal(await plugin.cacheWillUpdate({ response: small }), small);
  for (const r of [response('5220533'), response(null), response('40', 503), response('0')]) {
    assert.equal(await plugin.cacheWillUpdate({ response: r }), null);
  }
});
test('cash registers and checkout are not captured by catalog caching', () => {
  assert.equal(routeFor('/api/cash-registers/current'), undefined);
  assert.equal(routeFor('/api/sales/checkout'), undefined);
});
test('image lazy loader resets on new URL without an unbounded global loaded-image set', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/LazyImage.tsx'), 'utf8');
  assert.match(source, /key=\{props.src\}/); assert.match(source, /loading="lazy"/);
  assert.doesNotMatch(source, /const loadedImages\s*=/);
});
