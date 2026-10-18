const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../engine.js');

const fresh = () => MM.newRun({ seed: 'save-validation' }, MM.newMeta());
const roundTrip = s => assert.deepEqual(MM.deserialize(MM.serialize(s)), JSON.parse(MM.serialize(s)));

test('accepts existing normal and daily v1 saves', () => {
  roundTrip(fresh());
  roundTrip(MM.newRun({ mode: 'daily', dateKey: '2026-10-18' }, MM.newMeta()));
});

test('save and restore preserve future market and random state', () => {
  const s = fresh();
  for (let i = 0; i < 12; i++) MM.waitDay(s);
  const restored = MM.deserialize(MM.serialize(s));
  for (let i = 0; i < 12; i++) { MM.waitDay(s); MM.waitDay(restored); }
  assert.deepEqual(s, restored);
});

test('accepts authentic port, sea, pending-event and completed saves', () => {
  const eventTypes = new Set();
  for (let i = 0; i < 80; i++) {
    const meta = MM.newMeta(); meta.levelMax = 10;
    MM.UNLOCKS.forEach(u => { meta.unlocks[u.id] = true; });
    const s = MM.newRun({ seed: 'save-states-' + i, level: i % 11, captain: MM.CAPTAIN_IDS[i % MM.CAPTAIN_IDS.length] }, meta);
    s.ship.up.radio = true;
    const g = s.goods[i % s.goods.length];
    MM.buy(s, g, Math.floor(MM.maxBuy(s, g) / 2));
    MM.startVoyage(s, 'shenzhen', true);
    for (let step = 0; step < 80 && s.phase !== 'sunk'; step++) {
      roundTrip(s);
      if (s.pending) {
        eventTypes.add(s.pending.type);
        MM.resolve(s, s.pending.choices.find(c => !c.disabled).id);
      } else if (s.phase === 'sea') MM.stepVoyage(s);
      else break;
    }
    MM.endSeason(s, meta); roundTrip(s);
    assert.deepEqual(MM.deserializeMeta(JSON.stringify(meta)), meta);
  }
  assert(eventTypes.has('storm') && eventTypes.has('pirates') && eventTypes.has('customs'));
});

test('rejects incomplete, unsupported and mistyped saves', () => {
  for (const raw of ['null', '[]', '{"v":1}', '{"v":2}', 'not json']) assert.throws(() => MM.deserialize(raw));
  const mutations = [
    s => { s.ship.cls = 'missing'; }, s => { s.goods = 'rice'; }, s => { s.cargo = []; },
    s => { s.port = 'missing'; }, s => { delete s.mk.klang.rice; }, s => { s.rngW = []; },
    s => { s.phase = 'sea'; s.voyage = null; }, s => { s.cash = null; }, s => { s.st.trades = '3'; },
    s => { s.phase = 'sunk'; }, s => { s.final = {}; }, s => { s.phase = 'ended'; s.final = {}; },
    s => { s.known.klang = null; }, s => { s.twist = 'missing'; }, s => { s.mk.klang.rice.I = 10000; },
    s => { s.cargo.rice = { q: -1, cost: 2000 }; },
  ];
  for (const mutate of mutations) { const s = fresh(); mutate(s); assert.throws(() => MM.deserialize(JSON.stringify(s))); }
});

test('rejects unsafe imported attributes and nonfinite JSON numbers', () => {
  const s = fresh();
  s.news.push({ id: 99, day: 1, kind: 'rumour', text: 'test', tag: '\" onclick=\"alert(1)' });
  assert.throws(() => MM.deserialize(JSON.stringify(s)));
  assert.throws(() => MM.deserialize(JSON.stringify(fresh()).replace('"cash":50000', '"cash":1e309')));
  assert.throws(() => MM.deserialize('{"v":1,"__proto__":{"polluted":true}}'));
});

test('preserves valid metadata and fills missing optional v1 fields', () => {
  const meta = MM.newMeta(); meta.lp = 25; meta.unlocks.good_coal = true;
  assert.deepEqual(MM.deserializeMeta(JSON.stringify(meta)), meta);
  delete meta.settings.motion; delete meta.daily.bestStreak; delete meta.tips;
  const restored = MM.deserializeMeta(JSON.stringify(meta));
  assert.equal(restored.lp, 25); assert.equal(restored.unlocks.good_coal, true);
  assert.equal(restored.settings.motion, true); assert.equal(restored.daily.bestStreak, 0);
  assert.deepEqual(restored.tips, {});
});

test('rejects invalid metadata sections, ranks and score types', () => {
  for (const raw of ['null', '[]', '{}', '{"v":2,"stats":{}}', '{"stats":[],"settings":{}}']) assert.throws(() => MM.deserializeMeta(raw));
  for (const mutate of [m => { m.daily.plays = []; }, m => { m.settings.motion = 'yes'; }, m => { m.stats.bestRank = 99; }, m => { m.lp = '10'; }, m => { m.history = {}; }]) {
    const m = MM.newMeta(); mutate(m); assert.throws(() => MM.deserializeMeta(JSON.stringify(m)));
  }
});
