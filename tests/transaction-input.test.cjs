const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../engine.js');

test('malformed trade and finance quantities cannot poison a valid classic save', () => {
  const s = MM.newRun({seed: 'transaction-inputs'}, MM.newMeta());
  assert(MM.buy(s, 'rice', 2).ok);
  assert(MM.bankBorrow(s, 1000).ok);
  assert(MM.alongBorrow(s, 1000).ok);
  for (const invalid of [NaN, Infinity, -Infinity, undefined, null, '2', {}, []]) {
    for (const action of [
      () => MM.buy(s, 'rice', invalid), () => MM.sell(s, 'rice', invalid),
      () => MM.bankBorrow(s, invalid), () => MM.bankRepay(s, invalid),
      () => MM.alongBorrow(s, invalid), () => MM.alongRepay(s, invalid)
    ]) {
      const before = MM.serialize(s);
      assert.equal(action().ok, false);
      assert.equal(MM.serialize(s), before);
      assert.deepEqual(MM.deserialize(before), JSON.parse(before));
    }
  }
  for (const invalidGood of ['constructor', '__proto__', 'missing']) {
    const before = MM.serialize(s);
    assert.equal(MM.sell(s, invalidGood, 1).ok, false);
    assert.equal(MM.serialize(s), before);
  }
});
