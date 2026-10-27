// Captain-first supply chain: warehouses, standing orders, factories and freight inside a captain season.
const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../engine.js');

function season(seed, peak) {
  const s = MM.newRun({ seed: seed || 'chain' }, MM.newMeta());
  if (peak) { s.cash += peak; s.st.peak = Math.max(s.st.peak, peak); }
  return s;
}
const ok = r => { assert.ok(r && r.ok, r && r.msg); return r; };
function waitDays(s, n) { for (let i = 0; i < n; i++) ok(MM.waitDay(s)); }
const totalStock = s => Object.values(s.co.wh).reduce((t, w) => t + MM.whUsed(w), 0);

test('stages unlock by peak net worth and gate each layer', () => {
  const s = season('gate');
  assert.equal(MM.coStage(s), 0);
  assert.equal(MM.buildWarehouse(s).ok, false);
  s.st.peak = 150000; assert.equal(MM.coStage(s), 1);
  s.cash = 200000; ok(MM.buildWarehouse(s));
  assert.equal(MM.buildFactory(s, 'food').ok, false, 'factories need RM 500k');
  assert.equal(MM.addRoute(s, 'klang', 'singapore', 'palm', 50, 'mkt').ok, false, 'freight needs RM 1M');
  s.st.peak = 1e6; s.cash = 400000;
  ok(MM.buildFactory(s, 'food'));
  ok(MM.addRoute(s, 'klang', 'singapore', 'palm', 50, 'mkt'));
  assert.equal(MM.nextStage(s), null);
});

test('warehouse stores and returns cargo at cost, within capacity, and counts in net worth', () => {
  const s = season('store', 300000);
  ok(MM.buildWarehouse(s));
  ok(MM.buy(s, 'palm', 80));
  const before = MM.netWorth(s), cost = s.cargo.palm.cost;
  ok(MM.storeCargo(s, 'palm', 60));
  assert.equal(s.cargo.palm.q, 20);
  assert.equal(s.co.wh.klang.stock.palm.q, 60);
  assert.ok(Math.abs(s.co.wh.klang.stock.palm.cost - cost) < 1e-6);
  assert.ok(Math.abs(MM.netWorth(s) - before) < 1, 'moving cargo ashore does not change net worth');
  ok(MM.takeCargo(s, 'palm', 20));
  assert.equal(s.cargo.palm.q, 40);
  s.co.wh.klang.stock.rice = { q: MM.whFree(s.co.wh.klang), cost: 1 };
  assert.equal(MM.storeCargo(s, 'palm', 10).ok, false, 'full warehouse refuses cargo');
});

test('standing buy orders respect the cash reserve and warehouse space; sell orders only sell stock', () => {
  const s = season('orders', 300000);
  ok(MM.buildWarehouse(s));
  ok(MM.setOrder(s, 'klang', 'buy', 'rice', 200, 'any'));
  ok(MM.setReserve(s, s.cash - 20000));
  const cash0 = s.cash;
  waitDays(s, 1);
  assert.ok(s.cash >= s.co.reserve - MM.coDaily(s) - MM.dailyCost(s) - 1, 'never spends below the reserve beyond upkeep');
  assert.ok(MM.whUsed(s.co.wh.klang) <= MM.whCap(s.co.wh.klang));
  assert.ok(cash0 - s.cash < 30000);
  ok(MM.setReserve(s, 0));
  waitDays(s, 3);
  assert.ok(MM.whUsed(s.co.wh.klang) <= MM.whCap(s.co.wh.klang));
  const held = s.co.wh.klang.stock.rice.q;
  ok(MM.setOrder(s, 'klang', 'sell', 'rice', 1000, 'any'));
  ok(MM.removeOrder(s, 'klang', s.co.wh.klang.orders.find(o => o.kind === 'buy').id));
  waitDays(s, 1);
  assert.ok(!s.co.wh.klang.stock.rice || s.co.wh.klang.stock.rice.q < held);
  assert.ok(s.co.autoSold > 0);
});

test('factories convert inputs to products with conserved material and cost basis', () => {
  const s = season('factory', 2e6);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
  const w = s.co.wh.klang;
  w.stock.rice = { q: 18, cost: 2000 }; w.stock.palm = { q: 12, cost: 3000 };
  waitDays(s, 1);
  // 9 batches/day: 18 rice + 9 palm -> 18 food
  assert.equal(MM.RECIPES.food.batches, 9);
  assert.equal(w.stock.food.q, 18);
  assert.equal(w.stock.rice, undefined);
  assert.equal(w.stock.palm.q, 3);
  assert.ok(w.stock.food.cost > (2 * 2000 + 3000) / 2, 'product cost includes inputs and the batch fee');
  assert.equal(s.co.fac.klang.made, 18);
  waitDays(s, 1);
  assert.equal(w.stock.food.q, 18, 'no inputs, no output');
  assert.match(s.co.fac.klang.note, /inputs/);
});

test('freight routes carry stock, take days, and deliver or sell on arrival', () => {
  const s = season('route', 2e6);
  ok(MM.buildWarehouse(s));
  s.co.wh.klang.stock.palm = { q: 150, cost: 3000 };
  ok(MM.addRoute(s, 'klang', 'singapore', 'palm', 100, 'mkt'));
  waitDays(s, 1);
  const r = s.co.routes[0];
  assert.ok(r.trip && r.trip.q === 100);
  assert.equal(s.co.wh.klang.stock.palm.q, 50);
  const sold0 = s.co.autoSold;
  waitDays(s, r.trip.arrive - s.day);
  assert.ok(s.co.autoSold > sold0, 'sold at the destination market');
  assert.equal(r.trips, 1);
  assert.ok(r.trip, 'the next trip leaves with the remaining stock');
  assert.equal(MM.removeRoute(s, r.id).ok, false, 'cannot cancel with cargo at sea');
  ok(MM.pauseRoute(s, r.id));
  waitDays(s, r.trip.arrive - s.day);
  assert.equal(r.trip, null);
  ok(MM.removeRoute(s, r.id));
});

test('contracts are delivered from a warehouse at their destination', () => {
  const s = season('contract', 300000);
  ok(MM.buildWarehouse(s));
  s.contracts.push({ id: 999, good: 'rice', qty: 30, dest: 'klang', deadline: s.day + 5, pay: 4000, penalty: 1000 });
  s.co.wh.klang.stock.rice = { q: 30, cost: 2000 };
  const cash0 = s.cash;
  waitDays(s, 1);
  assert.equal(s.contracts.length, 0);
  assert.ok(s.cash > cash0 + 30 * 4000 - 5000);
});

test('company state survives save, load and strict validation; older saves gain an empty company', () => {
  const s = season('save', 2e6);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'tyres'));
  ok(MM.setOrder(s, 'klang', 'buy', 'rubber', 50, 'cheap'));
  s.co.wh.klang.stock.steel = { q: 40, cost: 3000 };
  ok(MM.addRoute(s, 'klang', 'shenzhen', 'tyres', 40, 'mkt'));
  waitDays(s, 2);
  const t = MM.deserialize(MM.serialize(s));
  assert.deepEqual(t.co, s.co);
  const old = JSON.parse(MM.serialize(season('old')));
  delete old.co; old.goods = old.goods.filter(g => !MM.GOODS[g].product);
  old.ports.forEach(p => old.goods.length && Object.keys(old.mk[p]).forEach(g => { if (MM.GOODS[g].product) delete old.mk[p][g]; }));
  Object.keys(old.G).forEach(g => { if (MM.GOODS[g].product) delete old.G[g]; });
  Object.keys(old.known).forEach(p => Object.keys(old.known[p].mid).forEach(g => { if (MM.GOODS[g].product) delete old.known[p].mid[g]; }));
  const migrated = MM.deserialize(JSON.stringify(old));
  assert.ok(migrated.co && migrated.goods.includes('machinery'));
  const bad = JSON.parse(MM.serialize(s)); bad.co.wh.klang.lvl = 9;
  assert.throws(() => MM.deserialize(JSON.stringify(bad)));
  const bad2 = JSON.parse(MM.serialize(s)); bad2.co.wh.klang.stock.steel = { q: 9999, cost: 1 };
  assert.throws(() => MM.deserialize(JSON.stringify(bad2)));
});

test('season settlement values the company: stock at market, buildings at 70%', () => {
  const s = season('settle', 2e6);
  ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, 'food'));
  s.co.wh.klang.stock.rice = { q: 100, cost: 2000 };
  s.st.voyages = 1; s.st.daysAtSea = 1;
  const f = MM.endSeason(s, MM.newMeta());
  assert.ok(f.company > (MM.CO.whCost + MM.CO.facCost) * 0.7);
  assert.equal(f.nw, Math.round(f.cash + f.ship + f.company - f.debts));
});

test('random company play keeps cash finite, stock within capacity and material non-negative', () => {
  for (let k = 0; k < 40; k++) {
    const s = season('fuzz' + k, 2e6);
    ok(MM.buildWarehouse(s)); ok(MM.buildFactory(s, ['food', 'tyres', 'coffeemix', 'machinery'][k % 4]));
    const R = MM.RECIPES[s.co.fac.klang.recipe];
    Object.keys(R.input).forEach(g => ok(MM.setOrder(s, 'klang', 'buy', g, 30 + k, k % 2 ? 'any' : 'cheap')));
    ok(MM.addRoute(s, 'klang', s.ports.filter(p => p !== 'klang')[k % (s.ports.length - 1)], s.co.fac.klang.recipe, 20 + k, 'mkt'));
    for (let d = 0; d < 25 && s.day < s.maxDays; d++) {
      ok(MM.waitDay(s));
      assert.ok(Number.isFinite(s.cash) && Number.isFinite(MM.netWorth(s)));
      Object.values(s.co.wh).forEach(w => { assert.ok(MM.whUsed(w) <= MM.whCap(w) + 1e-6); Object.values(w.stock).forEach(c => assert.ok(c.q > 0 && Number.isFinite(c.cost))); });
    }
    assert.ok(totalStock(s) >= 0);
  }
});
