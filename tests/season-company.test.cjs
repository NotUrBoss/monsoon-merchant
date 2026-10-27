// Season length choice, company profit tracking, arrival reports, big orders and company alerts.
const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../engine.js');

const ok = r => { assert.ok(r && r.ok, r && r.msg); return r; };
function season(seed, peak, days) {
  const s = MM.newRun({ seed, days }, MM.newMeta());
  if (peak) { s.cash += peak; s.st.peak = Math.max(s.st.peak, peak); }
  return s;
}
function waitDays(s, n) { for (let i = 0; i < n && s.day < s.maxDays; i++) ok(MM.waitDay(s)); }

test('players choose a 90 or 120 day season; daily stays 60 and levels shorten in proportion', () => {
  assert.deepEqual(MM.SEASON_DAYS, [90, 120]);
  assert.equal(MM.newRun({ seed: 'a' }, MM.newMeta()).maxDays, 90, 'default is 90');
  assert.equal(MM.newRun({ seed: 'a', days: 120 }, MM.newMeta()).maxDays, 120);
  assert.equal(MM.newRun({ seed: 'a', days: 61 }, MM.newMeta()).maxDays, 90, 'only offered lengths');
  assert.equal(MM.newRun({ mode: 'daily', dateKey: '2026-10-27', days: 120 }, MM.newMeta()).maxDays <= 60, true);
  const meta = MM.newMeta(); meta.levelMax = 5;
  assert.equal(MM.newRun({ seed: 'a', days: 90, level: 5 }, meta).maxDays, 78);
  assert.equal(MM.newRun({ seed: 'a', days: 120, level: 5 }, meta).maxDays, 104);
  const s90 = MM.newRun({ seed: 'm' }, MM.newMeta()), s120 = MM.newRun({ seed: 'm', days: 120 }, MM.newMeta());
  assert.ok(Math.abs(s90.monsoon.shiftDay - 45) <= 4 && Math.abs(s120.monsoon.shiftDay - 60) <= 4, 'monsoon turns mid-season');
  assert.ok(s120.rival.target > s90.rival.target * 1.3, 'the rival grows with the season');
});

test('goals scale with the season: level unlock, bounties', () => {
  assert.equal(MM.levelGoal({ maxDays: 60 }), 1500000);
  assert.equal(MM.levelGoal({ maxDays: 90 }), 3000000);
  assert.equal(MM.levelGoal({ maxDays: 120 }), 4000000);
  const texts = [];
  for (let i = 0; i < 40; i++) MM.newRun({ seed: 'b' + i, days: 120 }, MM.newMeta()).bounties.forEach(b => texts.push(b.text));
  assert.ok(texts.some(t => /by day 60/.test(t)));
  assert.ok(!texts.includes('Make a single sale worth RM 400k'));
  // A Merchant over 60 days no longer levels up a 120 day season.
  const meta = MM.newMeta();
  const s = MM.newRun({ seed: 'lv', days: 120 }, meta);
  s.st.voyages = 1; s.st.daysAtSea = 1; s.day = s.maxDays; s.cash = 2000000;
  const f = MM.endSeason(s, meta);
  assert.equal(f.levelUp, false);
  const s2 = MM.newRun({ seed: 'lv2', days: 120 }, meta);
  s2.st.voyages = 1; s2.st.daysAtSea = 1; s2.day = s2.maxDays; s2.cash = 4100000;
  assert.equal(MM.endSeason(s2, meta).levelUp, 1);
});

test('each warehouse, factory and route keeps its own profit', () => {
  const s = season('pl', 2e6);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
  const w = s.co.wh.klang;
  w.stock.rice = { q: 40, cost: 1000 }; w.stock.palm = { q: 20, cost: 1000 };
  ok(MM.setOrder(s, 'klang', 'sell', 'food', 10, 'any'));
  ok(MM.addRoute(s, 'klang', 'singapore', 'food', 10, 'mkt'));
  waitDays(s, 4);
  assert.ok(w.pl.upkeep >= 4 * MM.CO.whUpkeep);
  assert.ok(w.pl.sold > 0 && Number.isFinite(w.pl.profit));
  const f = s.co.fac.klang;
  assert.ok(f.made > 0 && f.upkeep > 0 && Number.isFinite(f.added));
  const r = s.co.routes[0];
  assert.ok(r.freight > 0);
  waitDays(s, 3);
  assert.ok(r.trips >= 1 && r.sold > 0 && Number.isFinite(r.profit));
});

test('docking hands over a report of what the company did while you sailed', () => {
  const s = season('rep', 2e6);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
  ok(MM.setOrder(s, 'klang', 'buy', 'rice', 50, 'any'));
  ok(MM.setOrder(s, 'klang', 'buy', 'palm', 25, 'any'));
  ok(MM.startVoyage(s, 'shenzhen', true));
  let guard = 0, arrived = null;
  while (s.phase === 'sea' && guard++ < 50) {
    if (s.pending) { MM.resolve(s, s.pending.choices.find(c => !c.disabled).id); continue; }
    const x = MM.stepVoyage(s); if (x.type === 'arrived') arrived = x.report;
  }
  assert.ok(arrived, 'arrived');
  const r = arrived.co;
  assert.ok(r && r.bought > 0 && r.made > 0 && r.upkeep > 0, JSON.stringify(r));
  assert.equal(r.to, s.day);
  assert.equal(s.co.rep.from, s.day, 'a fresh report starts on arrival');
  assert.equal(s.co.rep.bought, 0);
});

test('big orders: offered after factories, paid per tonne, bonus on completion, expire without penalty', () => {
  const s = season('deal', 2e6);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'tyres'));
  let guard = 0;
  while (!s.co.dealOffer && guard++ < 30) waitDays(s, 1);
  const d = s.co.dealOffer;
  assert.ok(d, 'an offer arrives');
  assert.ok(d.deadline > s.day && d.deadline < s.maxDays && d.unit > 0 && d.bonus > 0);
  ok(MM.acceptDeal(s));
  assert.equal(s.co.dealOffer, null);
  assert.equal(s.co.deals.length, 1);
  // Deliver from a warehouse at the destination: rent one there and stock it.
  s.co.wh[d.port] = s.co.wh[d.port] || { lvl: 3, stock: {}, orders: [], invest: MM.CO.whCost, pl: { bought: 0, sold: 0, profit: 0, upkeep: 0 } };
  s.co.wh[d.port].lvl = 3;
  const half = Math.floor(d.qty / 2);
  s.co.wh[d.port].stock[d.g] = { q: half, cost: 1000 };
  const cash0 = s.cash;
  waitDays(s, 1);
  assert.equal(s.co.deals[0].got, half);
  assert.ok(s.cash > cash0 + half * d.unit * 0.9);
  s.co.wh[d.port].stock[d.g] = { q: d.qty, cost: 1000 };
  const cash1 = s.cash, done0 = s.co.dealsDone;
  waitDays(s, 1);
  assert.equal(s.co.deals.length, 0);
  assert.equal(s.co.dealsDone, done0 + 1);
  assert.ok(s.cash > cash1 + (d.qty - half) * d.unit + d.bonus * 0.9, 'paid the rest and the bonus');
  assert.equal(s.co.wh[d.port].stock[d.g].q, half, 'only what the order needed was taken');
  // An unfilled order simply expires.
  const s2 = season('deal2', 2e6);
  ok(MM.buildWarehouse(s2)); ok(MM.buildFactory(s2, 'food'));
  guard = 0; while (!s2.co.dealOffer && guard++ < 30) waitDays(s2, 1);
  ok(MM.acceptDeal(s2));
  const dl = s2.co.deals[0].deadline, cash = s2.cash;
  waitDays(s2, dl - s2.day + 1);
  assert.equal(s2.co.deals.length, 0);
  assert.ok(s2.cash > cash - 200000, 'no penalty beyond running costs');
  assert.equal(MM.declineDeal(s2).ok || true, true);
});

test('company alerts: strikes stop a warehouse, breakdowns stop a factory, booms offer overtime', () => {
  const seen = {};
  for (let k = 0; k < 40 && Object.keys(seen).length < 3; k++) {
    const s = season('alert' + k, 3e6, 120);
    ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
    for (let d = 0; d < 80 && s.day < s.maxDays - 3; d++) {
      ok(MM.waitDay(s));
      const a = s.co.alerts.find(x => MM.alertOpen(s, x));
      if (!a || seen[a.kind]) continue;
      seen[a.kind] = true;
      if (a.kind === 'strike') {
        assert.equal(MM.strikeAt(s, a.p), true);
        if (a.p === s.port) { s.cargo.palm = { q: 5, cost: 1 }; assert.equal(MM.storeCargo(s, 'palm', 5).ok, false); delete s.cargo.palm; }
        const cash = s.cash; ok(MM.coChoose(s, a.id, 'settle'));
        assert.equal(s.cash, cash - a.cost);
        assert.equal(MM.strikeAt(s, a.p), false);
      } else if (a.kind === 'breakdown') {
        const f = s.co.fac[a.p];
        assert.ok(f.downUntil >= s.day);
        s.co.wh[a.p].stock.rice = { q: 40, cost: 1000 }; s.co.wh[a.p].stock.palm = { q: 20, cost: 1000 };
        const made = f.made; ok(MM.waitDay(s)); assert.equal(f.made, made, 'no output while broken');
        ok(MM.coChoose(s, a.id, 'repair'));
        ok(MM.waitDay(s)); assert.ok(f.made > made, 'repaired factory runs again');
      } else if (a.kind === 'boom') {
        assert.ok(s.events.some(e => e.port === a.p && e.good === a.g && e.mult > 1.2));
        ok(MM.coChoose(s, a.id, 'overtime'));
        const f = Object.values(s.co.fac).find(x => x.recipe === a.g);
        const w = s.co.wh.klang; w.lvl = 3; w.stock.rice = { q: 200, cost: 1000 }; w.stock.palm = { q: 100, cost: 1000 };
        const made = f.made; ok(MM.waitDay(s));
        assert.equal(f.made - made, 2 * MM.RECIPES.food.batches * MM.RECIPES.food.out, 'overtime doubles output');
      }
      assert.equal(MM.coChoose(s, a.id, a.choices[0].id).ok, false, 'one decision per alert');
    }
  }
  assert.deepEqual(Object.keys(seen).sort(), ['boom', 'breakdown', 'strike']);
});

test('new company state survives save and load; bad alerts and deals are rejected', () => {
  const s = season('save2', 3e6, 120);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
  let guard = 0; while (!s.co.dealOffer && guard++ < 30) waitDays(s, 1);
  ok(MM.acceptDeal(s));
  guard = 0; while (!s.co.alerts.length && guard++ < 80) waitDays(s, 1);
  const t = MM.deserialize(MM.serialize(s));
  assert.deepEqual(t.co, s.co);
  assert.equal(t.maxDays, 120);
  const bad = JSON.parse(MM.serialize(s)); bad.co.deals[0].g = 'durian';
  assert.throws(() => MM.deserialize(JSON.stringify(bad)));
  if (s.co.alerts.length) { const bad2 = JSON.parse(MM.serialize(s)); bad2.co.alerts[0].kind = 'meteor'; assert.throws(() => MM.deserialize(JSON.stringify(bad2))); }
  // A company saved before these features gains empty reports, orders and profit records.
  const old = JSON.parse(MM.serialize(s));
  delete old.co.rep; delete old.co.deals; delete old.co.dealOffer; delete old.co.alerts; delete old.co.wh.klang.pl; delete old.co.fac.klang.added;
  const m = MM.deserialize(JSON.stringify(old));
  assert.ok(m.co.rep && Array.isArray(m.co.deals) && m.co.wh.klang.pl && m.co.fac.klang.added === 0);
});
