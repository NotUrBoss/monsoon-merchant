const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const MM = require('../engine.js');

// Execute the actual storage boundary with a controlled browser-storage adapter.
const ui = fs.readFileSync(path.join(__dirname, '../ui.js'), 'utf8');
const storageSource = ui.slice(ui.indexOf('  const KEYS ='), ui.indexOf('  let meta = loadMeta();'));
const keys = ['mm.meta.v1', 'mm.run.normal.v1', 'mm.run.daily.v1', 'mm.run.endless.v1'];
function harness(failWrite = () => false, failRead = false) {
  const initial = keys.map((key, i) => [key, 'previous-' + i]);
  const data = new Map(initial);
  const notices = [];
  let writes = 0;
  function update(key, value) {
    writes++;
    if (failWrite(writes)) throw new Error('Storage quota exceeded');
    if (value === null) data.delete(key); else data.set(key, value);
  }
  const context = vm.createContext({ MM, localStorage: {
    getItem(key) { if (failRead) throw new Error('Storage unavailable'); return data.get(key) ?? null; },
    setItem: (key, value) => update(key, value), removeItem: key => update(key, null),
  }, toast: (...args) => notices.push(args) });
  vm.runInContext(storageSource + '\nglobalThis.testStorage = { restoreBackup, lsSet };', context);
  return { api: context.testStorage, data, initial, notices, get writes() { return writes; } };
}
function backup() {
  const meta = MM.newMeta(); meta.lp = 25;
  return { meta, normal: MM.serialize(MM.newRun({ seed: 'restore' }, meta)), daily: null };
}

test('invalid run, metadata or slot mismatch leaves every saved value untouched', () => {
  for (const change of [b => { b.normal = '{"v":1}'; }, b => { b.meta.stats = []; }, b => { b.daily = b.normal; }]) {
    const h = harness(), b = backup(); change(b);
    assert.throws(() => h.api.restoreBackup(b));
    assert.equal(h.writes, 0); assert.deepEqual([...h.data], h.initial);
  }
});

test('valid backup saves metadata and season and removes an absent daily slot', () => {
  const h = harness(), b = backup();
  const restored = h.api.restoreBackup(b);
  assert.equal(restored.lp, 25); assert.equal(h.writes, 4);
  assert.equal(h.data.get(keys[0]), JSON.stringify(b.meta));
  assert.equal(h.data.get(keys[1]), b.normal); assert.equal(h.data.has(keys[2]), false); assert.equal(h.data.has(keys[3]), false);
});

test('failure after the first or second write rolls back previous slots', () => {
  for (const failAt of [2, 3]) {
    const h = harness(n => n === failAt);
    assert.throws(() => h.api.restoreBackup(backup()), e => e.storage === true && /previous progress is unchanged/.test(e.message));
    assert.deepEqual([...h.data], h.initial);
  }
});

test('failed rollback reports that previous saves may be incomplete', () => {
  const h = harness(n => n >= 2);
  assert.throws(() => h.api.restoreBackup(backup()), e => e.storage === true && /could not be fully recovered/.test(e.message));
});

test('unavailable storage reports an access problem without writing', () => {
  const h = harness(() => false, true);
  assert.throws(() => h.api.restoreBackup(backup()), e => e.storage === true && /could not access/.test(e.message));
  assert.equal(h.writes, 0);
});

test('ordinary save failure is visible and repeated failures do not flood notices', () => {
  const h = harness(() => true);
  assert.equal(h.api.lsSet(keys[0], 'new'), false);
  assert.equal(h.api.lsSet(keys[0], 'new'), false);
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0][0], /could not be saved/);
  assert.deepEqual([...h.data], h.initial);
});
