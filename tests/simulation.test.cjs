const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../engine.js');

function checkState(s) {
  for (const key of ['cash', 'bank', 'along', 'day', 'maxDays']) assert(Number.isFinite(s[key]), `${key} must remain finite`);
  assert(MM.cargoUsed(s) >= 0 && MM.cargoUsed(s) <= MM.shipCap(s));
  assert(s.ship.cond >= 0 && s.ship.cond <= 100);
  for (const c of Object.values(s.cargo)) assert(c.q > 0 && Number.isFinite(c.cost));
  const encoded = MM.serialize(s);
  assert.deepEqual(MM.deserialize(encoded), JSON.parse(encoded));
}

test('600 same-port buy/sell round trips cannot generate money', () => {
  for (let i = 0; i < 100; i++) {
    const baseline = MM.newRun({ seed: 'round-trip-' + i }, MM.newMeta());
    for (const good of baseline.goods) {
      const s = MM.deserialize(MM.serialize(baseline));
      const before = s.cash;
      const qty = MM.maxBuy(s, good);
      if (qty) {
        assert(MM.buy(s, good, qty).ok); checkState(s);
        assert(MM.sell(s, good, qty).ok); checkState(s);
        assert(s.cash <= before + 0.01);
      }
    }
  }
});

test('100 seeded seasons preserve valid state after every action and event', t => {
  let departures = 0, events = 0;
  for (let i = 0; i < 100; i++) {
    const meta = MM.newMeta(); meta.levelMax = 10;
    MM.UNLOCKS.forEach(u => { meta.unlocks[u.id] = true; });
    const s = MM.newRun({ seed: 'full-season-' + i, captain: MM.CAPTAIN_IDS[i % MM.CAPTAIN_IDS.length], level: i % 11 }, meta);
    let steps = 0;
    checkState(s);
    while (s.phase !== 'sunk' && s.day < s.maxDays && ++steps < 1000) {
      if (s.pending) {
        const choice = s.pending.choices.find(c => !c.disabled);
        assert(choice, 'Every event offers an available choice');
        MM.resolve(s, choice.id); events++;
      } else if (s.phase === 'sea') MM.stepVoyage(s);
      else {
        for (const good of Object.keys(s.cargo)) { assert(MM.sell(s, good, s.cargo[good].q).ok); checkState(s); }
        if (s.ship.cond < 70) { MM.repair(s); checkState(s); }
        const good = s.goods[i % s.goods.length];
        const qty = Math.floor(MM.maxBuy(s, good) / 2);
        if (qty > 0) { assert(MM.buy(s, good, qty).ok); checkState(s); }
        const ports = s.ports.filter(p => p !== s.port && !MM.planVoyage(s, p).tooLate);
        if (!ports.length) break;
        const started = MM.startVoyage(s, ports[(i + steps) % ports.length], true);
        if (started.ok) departures++; else assert(MM.waitDay(s).ok);
      }
      checkState(s);
    }
    assert(steps < 1000, 'Simulation must terminate');
    const score = MM.endSeason(s, meta); checkState(s);
    assert(Number.isFinite(score.nw));
    const legacy = meta.lp;
    assert.deepEqual(MM.endSeason(s, meta), score);
    assert.equal(meta.lp, legacy, 'Finalizing twice must not duplicate rewards');
    assert.deepEqual(MM.deserializeMeta(JSON.stringify(meta)), meta);
  }
  t.diagnostic(`100 seasons, ${departures} departures, ${events} events, 6 captains, 11 difficulty levels`);
});

test('a genuine sinking state remains restorable', () => {
  const s = MM.newRun({ seed: 'sink-round-trip' }, MM.newMeta());
  assert(MM.startVoyage(s, 'shenzhen', false).ok);
  s.ship.cond = 1;
  s.pending = { type: 'storm', title: 'Squall line ahead', text: 'Black clouds.', choices: [{ id: 'push', label: 'Push through' }], ctx: { typhoon: true, wait: 2 } };
  assert.equal(MM.resolve(s, 'push').type, 'sunk');
  assert.equal(s.phase, 'sunk');
  checkState(s);
});
