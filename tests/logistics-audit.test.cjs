const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../logistics.js');

function accepted(s, action) {
  const before = JSON.stringify(s);
  const result = action();
  if (!result.ok) assert.equal(JSON.stringify(s), before, result.error);
  assert.deepEqual(N.validate(s), {ok:true}, result.error);
  assert.deepEqual(N.deserialize(N.serialize(s)).state, s);
  return result;
}
function yes(s, action) { const result = accepted(s, action); assert.equal(result.ok, true, result.error); return result; }
function rejected(s, action) { const result = accepted(s, action); assert.equal(result.ok, false); return result; }
function advanceTo(s, day) { while(s.day < day) yes(s, () => N.advanceDay(s)); }

test('concurrent sea, rail, air and production conserve stock across days and release reservations', () => {
  const s = N.create('audit-concurrency');
  yes(s, () => N.buildWarehouse(s, 'bangkok'));
  yes(s, () => N.buildWarehouse(s, 'singapore'));
  yes(s, () => N.buildFactory(s, 'klang', 'textiles'));
  yes(s, () => N.trade(s, 'klang', 'cotton', 20, 'buy'));
  yes(s, () => N.trade(s, 'klang', 'palm', 20, 'buy'));
  yes(s, () => N.trade(s, 'klang', 'coal', 20, 'buy'));
  const sea = yes(s, () => N.dispatch(s, 'klang', 'singapore', 'sea', 'palm', 10)).shipment;
  const rail = yes(s, () => N.dispatch(s, 'klang', 'bangkok', 'rail', 'cotton', 5)).shipment;
  const air = yes(s, () => N.dispatch(s, 'klang', 'singapore', 'air', 'coal', 10)).shipment;
  const production = yes(s, () => N.startProduction(s, 'klang', 'textiles', 5)).job;
  assert.equal(s.shipments.length, 3);
  assert.equal(N.warehouseUsage(s, 'singapore').reserved, 20);
  assert.equal(N.warehouseUsage(s, 'bangkok').reserved, 5);
  assert.equal(N.warehouseUsage(s, 'klang').reserved, 10);
  assert.equal(s.warehouses.klang.stock.cotton, 5);
  rejected(s, () => N.dispatch(s, 'klang', 'bangkok', 'sea', 'palm', 1));
  rejected(s, () => N.startProduction(s, 'klang', 'textiles', 1));
  rejected(s, () => N.trade(s, 'singapore', 'palm', 1, 'sell'));
  const finalDay = Math.max(sea.arrivalDay, rail.arrivalDay, air.arrivalDay, production.finishDay);
  while(s.day < finalDay) {
    yes(s, () => N.advanceDay(s));
    assert.equal(s.warehouses.singapore.stock.palm, s.day >= sea.arrivalDay ? 10 : 0);
    assert.equal(s.warehouses.singapore.stock.coal, s.day >= air.arrivalDay ? 10 : 0);
    assert.equal(s.warehouses.bangkok.stock.cotton, s.day >= rail.arrivalDay ? 5 : 0);
    assert.equal(s.warehouses.klang.stock.textiles, s.day >= production.finishDay ? 10 : 0);
  }
  assert.equal(s.stats.shipments, 3);
  assert.equal(s.stats.produced, 10);
  assert.equal(N.warehouseUsage(s, 'singapore').reserved, 0);
  assert.equal(N.warehouseUsage(s, 'klang').reserved, 0);
  assert.equal(s.shipments.length + s.production.length, 0);
});

test('splitting loads never reduces quoted freight, and local round trips lose the spread', () => {
  for(const mode of ['sea','rail','air']) {
    const s = N.create('audit-splitting-' + mode);
    yes(s, () => N.buildWarehouse(s, 'bangkok'));
    yes(s, () => N.trade(s, 'klang', 'coal', 20, 'buy'));
    const whole = N.quoteShipment(s, 'klang', 'bangkok', mode, 'coal', 20);
    const half = N.quoteShipment(s, 'klang', 'bangkok', mode, 'coal', 10);
    assert.equal(whole.ok, true); assert.equal(half.ok, true);
    assert(half.cost * 2 > whole.cost);
    const cash = s.cash;
    const available = s.market.klang.coal;
    yes(s, () => N.trade(s, 'klang', 'coal', 5, 'buy'));
    yes(s, () => N.trade(s, 'klang', 'coal', 5, 'sell'));
    assert(s.cash < cash);
    assert.equal(s.market.klang.coal, available);
    assert.equal(s.day, 1);
  }
});

test('bad input, overbooking, job overlap and malformed import reject without changes', () => {
  const s = N.create('audit-rejection');
  yes(s, () => N.buildWarehouse(s, 'singapore'));
  yes(s, () => N.buildFactory(s, 'klang', 'textiles'));
  yes(s, () => N.trade(s, 'klang', 'cotton', 30, 'buy'));
  for(const qty of [0,-1,NaN,Infinity,1.5,'5',null,undefined,true,{},[],1e30]) {
    rejected(s, () => N.trade(s, 'klang', 'cotton', qty, 'buy'));
    rejected(s, () => N.dispatch(s, 'klang', 'singapore', 'sea', 'cotton', qty));
    rejected(s, () => N.startProduction(s, 'klang', 'textiles', qty));
  }
  rejected(s, () => N.startProduction(s, 'klang', 'textiles', 11));
  rejected(s, () => N.dispatch(s, 'klang', 'singapore', 'rail', 'cotton', 1));
  yes(s, () => N.trade(s, 'singapore', 'coal', Math.min(155,s.market.singapore.coal), 'buy'));
  const free = N.warehouseUsage(s,'singapore').free;
  if(free > 0) {
    const remaining = Math.min(free,s.market.singapore.rice);
    yes(s, () => N.trade(s,'singapore','rice',remaining,'buy'));
  }
  rejected(s, () => N.dispatch(s, 'klang', 'singapore', 'air', 'cotton', 1));
  for(const mutate of [
    v => {v.warehouses.klang.stock.cotton = -1;},
    v => {v.cash = '500000';},
    v => {v.day = 60;},
    v => {v.warehouses.klang.stock.fake = 1;},
    v => {v.factories.singapore = {recipeId:'unknown'};},
    v => {v.warehouses.klang.capacity = 900;}
  ]) {
    const imported = structuredClone(s); mutate(imported);
    assert.equal(N.deserialize(JSON.stringify(imported)).ok, false);
  }
});

test('final-day arrivals and outputs settle exactly once and all finished mutations reject', () => {
  const s = N.create('audit-finale');
  yes(s, () => N.buildWarehouse(s, 'singapore'));
  yes(s, () => N.buildFactory(s, 'klang', 'textiles'));
  yes(s, () => N.trade(s, 'klang', 'cotton', 10, 'buy'));
  yes(s, () => N.trade(s, 'klang', 'palm', 10, 'buy'));
  advanceTo(s, 57);
  yes(s, () => N.startProduction(s, 'klang', 'textiles', 5));
  advanceTo(s, 59);
  yes(s, () => N.dispatch(s, 'klang', 'singapore', 'air', 'palm', 10));
  rejected(s, () => N.dispatch(s, 'klang', 'singapore', 'sea', 'cotton', 1));
  const finish = yes(s, () => N.advanceDay(s));
  assert.equal(finish.finished, true);
  assert.equal(s.day, 60);
  assert.equal(s.warehouses.singapore.stock.palm, 10);
  assert.equal(s.warehouses.klang.stock.textiles, 10);
  assert.equal(s.result.netWorth, N.netWorth(s));
  assert.equal(s.result.profit, s.result.netWorth - N.INITIAL_NET_WORTH);
  assert.equal(s.result.shipments, 1); assert.equal(s.result.produced, 10);
  for(const action of [
    () => N.advanceDay(s), () => N.trade(s,'klang','textiles',1,'sell'),
    () => N.dispatch(s,'klang','singapore','air','textiles',1),
    () => N.startProduction(s,'klang','textiles',1),
    () => N.buildWarehouse(s,'bangkok'), () => N.upgradeWarehouse(s,'klang'),
    () => N.upgradeLanes(s), () => N.buildFactory(s,'singapore','food')
  ]) rejected(s, action);
  const malformed = structuredClone(s); malformed.result.profit++;
  assert.equal(N.deserialize(JSON.stringify(malformed)).ok, false);
});

test('supported numeric boundaries never permit an action that invalidates its save', () => {
  let s = N.create('audit-limits'); s.cash = 1e12; s.warehouses.klang.stock.coal = 1;
  rejected(s, () => N.trade(s,'klang','coal',1,'sell'));
  s = N.create('audit-limits'); s.stats.trades = 1e12;
  rejected(s, () => N.trade(s,'klang','coal',1,'buy'));
  s = N.create('audit-limits'); s.cash = 0; s.debt = 1e12;
  rejected(s, () => N.advanceDay(s));
  s = N.create('audit-limits'); s.market.klang.coal = 100000; s.warehouses.klang.stock.coal = 1;
  rejected(s, () => N.trade(s,'klang','coal',1,'sell'));
  s = N.create('audit-limits');
  yes(s, () => N.buildWarehouse(s,'singapore'));
  yes(s, () => N.trade(s,'klang','coal',1,'buy'));
  s.nextId = 1e9;
  rejected(s, () => N.dispatch(s,'klang','singapore','sea','coal',1));
});

test('upkeep debt is repaid before spendable sales cash and facilities have explicit resale valuation', () => {
  const s = N.create('audit-accounting');
  assert.equal(N.netWorth(s), 542000);
  const beforeWarehouse = N.netWorth(s);
  yes(s, () => N.buildWarehouse(s,'singapore'));
  assert.equal(N.netWorth(s), beforeWarehouse - N.COSTS.warehouse * 0.4);
  const beforeFactory = N.netWorth(s);
  yes(s, () => N.buildFactory(s,'klang','textiles'));
  assert.equal(N.netWorth(s), beforeFactory - N.COSTS.factory * 0.5);
  yes(s, () => N.trade(s,'klang','cotton',10,'buy'));
  const beforeJob = N.netWorth(s);
  yes(s, () => N.startProduction(s,'klang','textiles',5));
  assert.equal(N.netWorth(s), beforeJob - N.RECIPES.textiles.cost * 5,
    'unfinished output is valued at consumed input sale prices, not future output');
  s.cash = 0;
  const upkeep = yes(s, () => N.advanceDay(s)).upkeep;
  assert.equal(s.debt,upkeep);
  assert.equal(s.cash,0);
  advanceTo(s,4);
  const debt = s.debt, proceeds = N.quoteTrade(s,'klang','textiles',10,'sell').cost;
  yes(s, () => N.trade(s,'klang','textiles',10,'sell'));
  assert.equal(s.cash,Math.max(0,proceeds-debt));
  assert.equal(s.debt,Math.max(0,debt-proceeds));
});

test('200 seeded 60-day mixed networks preserve valid saves, queues, debt and accounting', () => {
  let observedShipments = 0, observedProduction = 0, checked = 0;
  const attempt = (s, action) => { checked++; return accepted(s, action); };
  for(let seed = 0; seed < 200; seed++) {
    const s = N.create('qa-network-' + seed);
    const target = seed % 2 ? 'bangkok' : 'singapore';
    yes(s, () => N.buildWarehouse(s, target));
    const recipeId = ['food','textiles','electronics','machinery'][seed % 4];
    yes(s, () => N.buildFactory(s, 'klang', recipeId));
    const recipe = N.RECIPES[recipeId];
    while(s.status === 'active') {
      for(const hub of Object.keys(s.warehouses)) for(const [good,qty] of Object.entries(s.warehouses[hub].stock)) {
        if(qty && (hub !== 'klang' || !Object.hasOwn(recipe.inputs,good))) attempt(s, () => N.trade(s,hub,good,qty,'sell'));
      }
      if(!s.production.length) {
        const batches = 1 + (seed + s.day) % 5;
        for(const [good,perBatch] of Object.entries(recipe.inputs)) {
          const qty = perBatch * batches - s.warehouses.klang.stock[good];
          if(qty > 0) attempt(s, () => N.trade(s,'klang',good,qty,'buy'));
        }
        attempt(s, () => N.startProduction(s,'klang',recipeId,batches));
      }
      if(s.day % 3 === 1) {
        const qty = 1 + (seed + s.day) % 8;
        if(attempt(s, () => N.trade(s,'klang','palm',qty,'buy')).ok) {
          const mode = target === 'bangkok' ? ['rail','sea','air'][(seed+s.day)%3] : ['sea','air'][(seed+s.day)%2];
          attempt(s, () => N.dispatch(s,'klang',target,mode,'palm',qty));
        }
      }
      const beforeDebt = s.debt, beforeCash = s.cash, beforeUpkeep = s.stats.upkeep;
      const result = yes(s, () => N.advanceDay(s)); checked++;
      assert.equal(beforeCash - s.cash + s.debt - beforeDebt, result.upkeep);
      assert.equal(s.stats.upkeep - beforeUpkeep, result.upkeep);
      for(const hub of Object.keys(s.warehouses)) assert(N.warehouseUsage(s,hub).free >= 0);
    }
    assert.equal(s.day,60); assert.equal(s.shipments.length,0); assert.equal(s.production.length,0);
    assert.equal(s.result.netWorth,N.netWorth(s));
    observedShipments += s.stats.shipments; observedProduction += s.stats.produced;
  }
  assert(checked > 15000); assert(observedShipments > 1000); assert(observedProduction > 1000);
  console.log(JSON.stringify({networkAudit:{seeds:200,checkedStates:checked,completedShipments:observedShipments,manufacturedTonnes:observedProduction}}));
});
