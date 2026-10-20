const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('service worker precaches every app asset and serves cached navigation offline', async () => {
  const handlers = {};
  const cached = new Map();
  const root = path.join(__dirname, '..');
  let claimed = false;
  const deleted = [];
  const sandbox = {
    URL,
    self: {location: {origin: 'https://example.test', href: 'https://example.test/monsoon-merchant/sw.js'}, addEventListener: (name, fn) => handlers[name] = fn,
      clients: {claim: async () => {claimed = true;}}, skipWaiting() {}},
    caches: {
      open: async () => ({addAll: async assets => {
        for (const asset of assets) {
          const file = path.join(root, asset === './' ? 'index.html' : asset);
          assert.ok(fs.existsSync(file), asset + ' must be shipped');
          cached.set(asset, fs.readFileSync(file));
        }
      }}),
      match: async key => cached.get(typeof key === 'string' ? key : './' + new URL(key.url).pathname.split('/').pop()),
      keys: async () => ['mm-1.0.1', 'mm-1.1.0', 'mm-1.2.0', 'another-app'],
      delete: async key => deleted.push(key)
    },
    fetch: async () => {throw new Error('offline');}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), sandbox);
  let pending;
  handlers.install({waitUntil(p) {pending = p;}});
  await pending;
  assert.equal(cached.size, 15);
  assert.ok(cached.has('./logistics.js'));
  assert.ok(cached.has('./network-ui.js'));
  handlers.activate({waitUntil(p) {pending = p;}});
  await pending;
  assert.equal(claimed, true);
  assert.deepEqual(deleted, ['mm-1.0.1','mm-1.1.0']);
  handlers.fetch({request: {url: 'https://example.test/monsoon-merchant/', method: 'GET', mode: 'navigate'},
    respondWith(p) {pending = p;}});
  assert.match((await pending).toString(), /Monsoon Merchant/);
  handlers.fetch({request: {url: 'https://example.test/monsoon-merchant/icon-512.png', method: 'GET', mode: 'navigate'},
    respondWith(p) {pending = p;}});
  assert.deepEqual(await pending, fs.readFileSync(path.join(root, 'icon-512.png')), 'direct image navigation must return the image, not the game shell');
});
