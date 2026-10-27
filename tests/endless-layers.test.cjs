// Endless mode, the new company layers (estates, shops, managers, ocean lanes) and the 2.3 hardening.
const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../engine.js');

const ok = r => { assert.ok(r && r.ok, r && r.msg); return r; };
function rich(seed, peak, mode) {
  const s = MM.newRun({ seed, mode }, MM.newMeta());
  s.cash += peak; s.st.peak = Math.max(s.st.peak, peak);
  return s;
}
function finiteDeep(x, path = 'run') {
  if (typeof x === 'number') assert.ok(Number.isFinite(x), path + ' is not finite');
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) finiteDeep(x[k], path + '.' + k);
}
function sail(s, to) {
  ok(MM.startVoyage(s, to, true));
  let guard = 0;
  while (s.phase === 'sea' && guard++ < 80) {
    if (s.pending) { MM.resolve(s, s.pending.choices.find(c => !c.disabled).id); continue; }
    MM.stepVoyage(s);
  }
}

test('endless runs in 60-day chapters that roll forward with a report, bounties and a new monsoon', () => {
  const meta = MM.newMeta();
  const s = MM.newRun({ seed: 'end1', mode: 'endless' }, meta);
  assert.equal(s.mode, 'endless');
  assert.equal(s.endless.ch, 1);
  assert.equal(s.maxDays, MM.CHAPTER_DAYS);
  const shift1 = s.monsoon.shiftDay;
  while (s.endless.ch === 1) ok(MM.waitDay(s));
  assert.equal(s.endless.ch, 2);
  assert.equal(s.endless.reports.length, 1);
  assert.equal(s.maxDays, s.endless.start + MM.CHAPTER_DAYS);
  assert.ok(s.monsoon.shiftDay > shift1 + 30, 'the monsoon turns again in the new chapter');
  assert.ok(s.bounties.length > 0 && s.bounties.every(b => !b.done && !b.failed), 'fresh bounties');
  assert.ok(s.rival.target > s.rival.nw, 'Lim aims higher');
  assert.equal(s.endless.reports[0].lp, 0, 'a chapter without two voyages pays no Legacy');
  const t = MM.deserialize(MM.serialize(s));
  assert.deepEqual(JSON.parse(MM.serialize(t)), JSON.parse(MM.serialize(s)));
});

test('chapter Legacy needs two voyages, is capped and is collected once', () => {
  const meta = MM.newMeta();
  const s = MM.newRun({ seed: 'end2', mode: 'endless' }, meta);
  sail(s, 'singapore'); sail(s, 'klang');
  while (s.endless.ch === 1) ok(MM.waitDay(s));
  const r = s.endless.reports[0];
  assert.ok(r.voyages >= 2 && r.lp >= 6 && r.lp <= 30, JSON.stringify(r));
  const lp0 = meta.lp;
  assert.equal(MM.collectEndlessLP(s, meta), r.lp);
  assert.equal(meta.lp, lp0 + r.lp);
  assert.equal(MM.collectEndlessLP(s, meta), 0, 'paid once');
  const f = MM.endSeason(s, meta);
  assert.ok(f.lp <= 30 && f.chapters === 1);
  assert.equal(meta.endless.runs, 1);
  assert.equal(meta.endless.hall.length, 1);
});

test('a long endless run stays finite, keeps its history bounded and difficulty creeps up', () => {
  const s = MM.newRun({ seed: 'end3', mode: 'endless' }, MM.newMeta());
  s.cash = 5e7;
  for (let d = 0; d < 900; d++) ok(MM.waitDay(s));
  finiteDeep(s);
  assert.ok(s.hist.length < 400 && s.rival.hist.length < 400, 'history is thinned: ' + s.hist.length);
  assert.ok(s.level >= 5, 'monsoon level rises with chapters');
  assert.ok(s.rival.nw > 20e6, 'Lim keeps growing: ' + s.rival.nw);
  assert.ok(MM.serialize(s).length < 200000);
  MM.deserialize(MM.serialize(s));
});

test('ten days under water closes the house in endless', () => {
  const s = MM.newRun({ seed: 'end4', mode: 'endless' }, MM.newMeta());
  s.cash = -5e6;
  for (let d = 0; d < 12 && !s.endless.bankrupt; d++) MM.waitDay(s);
  assert.equal(s.endless.bankrupt, true);
});

test('save validation: season lengths, endless chapter bounds, proto keys and huge numbers are rejected', () => {
  const s = rich('val', 3e6);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
  const good = JSON.parse(MM.serialize(s));
  const bad = mutate => { const x = JSON.parse(JSON.stringify(good)); mutate(x); assert.throws(() => MM.deserialize(JSON.stringify(x))); };
  bad(x => { x.maxDays = 2; });
  bad(x => { x.maxDays = 1e9; });
  bad(x => { x.co.wh.toString = x.co.wh.klang; });
  bad(x => { x.co.fac.hasOwnProperty = x.co.fac.klang; });
  bad(x => { x.cash = 1e308; });
  const e = JSON.parse(MM.serialize(MM.newRun({ seed: 'val2', mode: 'endless' }, MM.newMeta())));
  const badE = mutate => { const x = JSON.parse(JSON.stringify(e)); mutate(x); assert.throws(() => MM.deserialize(JSON.stringify(x))); };
  badE(x => { x.maxDays = 1e6; });
  badE(x => { delete x.endless; });
  badE(x => { x.endless.ch = 0; });
  assert.throws(() => MM.deserialize('{"__proto__":{"q":1}}'));
});

test('company APIs refuse inherited property names', () => {
  const s = rich('proto', 3e6);
  ok(MM.buildWarehouse(s));
  for (const k of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
    assert.equal(MM.buildFactory(s, k).ok, false);
    assert.equal(MM.storeCargo(s, k, 1).ok, false);
    assert.equal(MM.upgradeWarehouse(s, k).ok, false);
    assert.equal(MM.setOrder(s, k, 'buy', 'rice', 5, 'any').ok, false);
    assert.equal(MM.buildEstate(s, k).ok, false);
    assert.equal(MM.setShop(s, k, 'value').ok, false);
    assert.equal(MM.hireManager(s, k).ok, false);
  }
  assert.equal({}.q, undefined); assert.equal({}.lvl, undefined);
});

test('alert choices come from an allowlist so a crafted backup cannot inject markup', () => {
  const s = rich('xss', 3e6);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
  let guard = 0; while (!s.co.alerts.length && guard++ < 120 && s.day < s.maxDays - 3) ok(MM.waitDay(s));
  assert.ok(s.co.alerts.length, 'an alert arrived');
  const x = JSON.parse(MM.serialize(s));
  x.co.alerts[0].choices[0].id = '"><img src=x onerror=alert(1)>';
  assert.throws(() => MM.deserialize(JSON.stringify(x)));
  const y = JSON.parse(MM.serialize(s));
  y.co.alerts[0].choice = 'boom!';
  assert.throws(() => MM.deserialize(JSON.stringify(y)));
});

test('big orders cannot be filled with tonnes bought at the destination', () => {
  let tried = 0;
  for (let k = 0; k < 12 && tried < 3; k++) {
    const s = rich('arb' + k, 4e6);
    ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
    let guard = 0; while (!s.co.dealOffer && guard++ < 40) ok(MM.waitDay(s));
    const d = s.co.dealOffer; if (!d || d.port === 'klang') continue;
    ok(MM.acceptDeal(s));
    // A warehouse at the destination that buys the product off the local market.
    s.co.wh[d.port] = { lvl: 3, stock: {}, orders: [{ kind: 'buy', g: d.g, qty: 50, at: 'any' }], invest: MM.CO.whCost, pl: { bought: 0, sold: 0, profit: 0, upkeep: 0 } };
    s.co.wh[d.port].stock[d.g] = { q: d.qty, cost: 1000, ok: 0 };
    const deal = s.co.deals[0];
    for (let i = 0; i < 3; i++) ok(MM.waitDay(s));
    assert.equal(deal.got, 0, 'market-bought stock does not count');
    tried++;
  }
  assert.ok(tried > 0, 'found an order to test');
});

test('estates grow your own inputs, shops sell your own goods and managers run a port', () => {
  const s = rich('layers', 12e6);
  ok(MM.buildWarehouse(s));
  const g = MM.estateGoods(s, s.port)[0];
  assert.ok(g, 'something grows in Klang');
  ok(MM.buildEstate(s, g));
  assert.equal(MM.buildEstate(s, g).ok, false, 'one estate per port');
  ok(MM.openShop(s));
  ok(MM.setShop(s, s.port, 'premium', 'credit'));
  assert.equal(MM.setShop(s, s.port, 'luxury').ok, false);
  ok(MM.buildFactory(s, 'food'));
  ok(MM.hireManager(s, 'balanced'));
  for (let i = 0; i < 8; i++) ok(MM.waitDay(s));
  const e = s.co.est[s.port], w = s.co.wh[s.port], sh = s.co.shop[s.port], m = s.co.mgr[s.port];
  assert.ok(e.made > 0 && e.upkeep > 0, 'the estate harvests');
  assert.ok(MM.mineQty(w, g) > 0 || s.co.fac[s.port].made > 0, 'its harvest counts as your own stock');
  assert.ok(sh.upkeep > 0);
  assert.ok(m.wages > 0, 'the manager is paid');
  ok(MM.setManager(s, s.port, 'cautious'));
  ok(MM.fireManager(s, s.port));
  assert.equal(s.co.mgr[s.port], undefined);
  const t = MM.deserialize(MM.serialize(s));
  assert.deepEqual(t.co, s.co);
  finiteDeep(s);
});

test('a shop only sells what you made, grew or shipped in', () => {
  const s = rich('shop2', 12e6);
  ok(MM.buildWarehouse(s)); ok(MM.openShop(s));
  const w = s.co.wh[s.port], sh = s.co.shop[s.port];
  w.stock.food = { q: 40, cost: 1000, ok: 0 };
  for (let i = 0; i < 3; i++) ok(MM.waitDay(s));
  assert.equal(sh.sold, 0, 'bought-here stock is not sold through the shop');
  w.stock.food = { q: 40, cost: 1000, ok: 40 };
  for (let i = 0; i < 3; i++) ok(MM.waitDay(s));
  assert.ok(sh.sold > 0, 'own stock sells');
});

test('ocean lanes open at the last company stage, never in the Daily Voyage', () => {
  const s = MM.newRun({ seed: 'oc' }, MM.newMeta());
  assert.ok(MM.OCEAN_PORTS.every(p => s.ports.indexOf(p) < 0));
  s.cash += 11e6; s.st.peak = 11e6;
  ok(MM.buildWarehouse(s));
  ok(MM.waitDay(s));
  assert.ok(MM.OCEAN_PORTS.every(p => s.ports.indexOf(p) >= 0), 'all four ocean ports open');
  const pl = MM.planVoyage(s, 'colombo');
  assert.ok(pl.days >= 6, 'a long leg: ' + pl.days);
  const d = MM.newRun({ mode: 'daily', dateKey: '2026-10-27' }, MM.newMeta());
  d.cash += 11e6; d.st.peak = 11e6;
  if (MM.buildWarehouse(d).ok) ok(MM.waitDay(d));
  assert.ok(MM.OCEAN_PORTS.every(p => d.ports.indexOf(p) < 0));
});

test('achievements: unique ids, known categories, never throw, season-only ones stay locked in endless', () => {
  const ids = new Set();
  const meta = MM.newMeta();
  const runs = [null, MM.newRun({ seed: 'a1' }, meta), MM.newRun({ seed: 'a2', mode: 'endless' }, meta), MM.newRun({ mode: 'daily', dateKey: '2026-10-27' }, meta)];
  const ended = MM.newRun({ seed: 'a3' }, meta); ended.st.voyages = 1; ended.st.daysAtSea = 1; MM.endSeason(ended, MM.newMeta()); runs.push(ended);
  assert.ok(MM.ACH.length >= 50);
  for (const a of MM.ACH) {
    assert.ok(!ids.has(a.id), 'duplicate ' + a.id); ids.add(a.id);
    assert.ok(MM.ACH_CATS.includes(a.cat), a.id + ' category');
    assert.ok(a.lp > 0 && a.lp <= 50);
    for (const s of runs) for (const end of [false, true]) {
      assert.doesNotThrow(() => a.test(s, meta, end), a.id);
      if (a.prog) assert.doesNotThrow(() => a.prog(s, meta), a.id + ' progress');
    }
  }
  const total = MM.ACH.reduce((t, a) => t + a.lp, 0);
  assert.ok(total < 1200, 'achievement Legacy budget ' + total);
  // Level goals cannot be met in endless.
  const e = MM.newRun({ seed: 'a4', mode: 'endless' }, meta);
  e.st.peak = 1e8; e.cash = 1e8;
  e.level = 10; e.st.voyages = 3; e.st.daysAtSea = 9; MM.endSeason(e, MM.newMeta());
  const gated = MM.ACH.filter(a => a.noEndless);
  assert.ok(gated.length >= 3);
  gated.forEach(a => assert.equal(!!a.test(e, meta, true), false, a.id));
});

test('quick retirement does not farm bounty Legacy', () => {
  const meta = MM.newMeta();
  const s = MM.newRun({ seed: 'farm' }, meta);
  sail(s, 'singapore');
  const f = MM.endSeason(s, meta);
  assert.ok(f.rewardFraction < 0.2);
  assert.ok(f.lp <= 4, 'a two-day season pays very little: ' + f.lp);
});
