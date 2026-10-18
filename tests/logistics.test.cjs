'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../logistics.js');
const ok = (result) => { assert.equal(result.ok,true,result.error); return result; };
const fresh = () => N.create('network-tests');
const advanceTo = (s,day) => { while(s.day<day) ok(N.advanceDay(s)); };
const unchangedFailure = (s,fn) => { const before=N.serialize(s);assert.equal(fn().ok,false);assert.equal(N.serialize(s),before); };

test('network catalog covers five regions, twelve products and explicit land rail corridors',()=>{
  assert.equal(Object.keys(N.HUBS).length,14);
  assert.equal(new Set(Object.values(N.HUBS).map(h=>h.region)).size,5);
  assert.equal(Object.keys(N.GOODS).length,12);
  assert.equal(Object.keys(N.RECIPES).length,4);
  assert.equal(N.RAIL_LINKS.some(p=>p.includes('sydney')),false);
  assert.equal(Object.isFrozen(N.HUBS.klang),true);
});

test('same seed and day produce reproducible markets and starting finances',()=>{
  const a=fresh(),b=fresh();assert.deepEqual(a,b);ok(N.validate(a));
  advanceTo(a,7);advanceTo(b,7);assert.deepEqual(N.prices(a,'shanghai'),N.prices(b,'shanghai'));
  assert.equal(N.netWorth(fresh()),N.INITIAL_NET_WORTH);
  assert.notDeepEqual(N.prices(N.create('different'),'klang'),N.prices(fresh(),'klang'));
});

test('immediate local round trips lose the spread; failed actions are transactional',()=>{
  for(const good of Object.keys(N.GOODS)) {
    const s=fresh(),cash=s.cash;ok(N.trade(s,'klang',good,1,'buy'));ok(N.trade(s,'klang',good,1,'sell'));assert.ok(s.cash<cash);
    for(const qty of [NaN,Infinity,-1,0,0.5,'2',null,Number.MAX_SAFE_INTEGER])unchangedFailure(s,()=>N.trade(s,'klang',good,qty,'buy'));
  }
  const s=fresh();unchangedFailure(s,()=>N.trade(s,'dubai','rice',1,'buy'));
  unchangedFailure(s,()=>N.trade(s,'klang','rice',1,'sell'));
  unchangedFailure(s,()=>N.upgradeWarehouse(s,'__proto__'));
  assert.deepEqual(N.warehouseUsage(s,'__proto__'),{stock:0,reserved:0,used:0,capacity:0,free:0});
  s.cash=NaN;const snapshot=JSON.stringify(s);assert.equal(N.buildWarehouse(s,'singapore').ok,false);assert.equal(JSON.stringify(s),snapshot);
});

test('parallel sea, rail and air jobs advance together and preserve all cargo',()=>{
  const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.buildWarehouse(s,'bangkok'));ok(N.trade(s,'klang','palm',30,'buy'));
  const sea=ok(N.dispatch(s,'klang','singapore','sea','palm',10)).shipment;
  const rail=ok(N.dispatch(s,'klang','bangkok','rail','palm',10)).shipment;
  const air=ok(N.dispatch(s,'klang','singapore','air','palm',10)).shipment;
  assert.equal(s.shipments.length,3);assert.ok(air.arrivalDay<sea.arrivalDay);
  assert.equal(N.warehouseUsage(s,'singapore').reserved,20);
  const cash=s.cash;advanceTo(s,Math.max(sea.arrivalDay,rail.arrivalDay,air.arrivalDay));
  assert.equal(s.shipments.length,0);assert.equal(s.stats.shipments,3);
  assert.equal(s.warehouses.singapore.stock.palm,20);assert.equal(s.warehouses.bangkok.stock.palm,10);
  assert.ok(s.cash<cash);ok(N.validate(s));
});

test('shipments obey lane count, vehicle capacity and real rail corridors',()=>{
  const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.buildWarehouse(s,'jakarta'));ok(N.trade(s,'klang','palm',40,'buy'));
  unchangedFailure(s,()=>N.dispatch(s,'klang','jakarta','rail','palm',1));
  unchangedFailure(s,()=>N.dispatch(s,'klang','singapore','air','palm',26));
  for(let n=0;n<3;n++)ok(N.dispatch(s,'klang','singapore','sea','palm',1));
  unchangedFailure(s,()=>N.dispatch(s,'klang','singapore','sea','palm',1));
  ok(N.upgradeLanes(s));for(let n=0;n<3;n++)ok(N.dispatch(s,'klang','singapore','sea','palm',1));
  unchangedFailure(s,()=>N.dispatch(s,'klang','singapore','sea','palm',1));
  unchangedFailure(s,()=>N.upgradeLanes(s));assert.equal(s.shipments.length,6);ok(N.validate(s));
});

test('incoming reservations prevent buys and later dispatches from overfilling a warehouse',()=>{
  const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.trade(s,'singapore','coal',130,'buy'));ok(N.trade(s,'klang','palm',40,'buy'));
  ok(N.dispatch(s,'klang','singapore','sea','palm',20));
  assert.equal(N.warehouseUsage(s,'singapore').free,10);
  unchangedFailure(s,()=>N.dispatch(s,'klang','singapore','sea','palm',11));
  unchangedFailure(s,()=>N.trade(s,'singapore','coal',11,'buy'));
  ok(N.trade(s,'singapore','coal',10,'buy'));advanceTo(s,3);assert.equal(N.warehouseUsage(s,'singapore').used,160);ok(N.validate(s));
});

test('warehouse expansion consumes cash and adds capacity at bounded levels',()=>{
  const s=fresh();const cash=s.cash;ok(N.upgradeWarehouse(s,'klang'));ok(N.upgradeWarehouse(s,'klang'));
  assert.equal(s.warehouses.klang.capacity,400);assert.equal(s.cash,cash-2*N.COSTS.warehouseUpgrade);
  unchangedFailure(s,()=>N.upgradeWarehouse(s,'klang'));ok(N.validate(s));
});

test('factories consume inputs, reserve output and complete exactly once',()=>{
  const s=fresh();ok(N.buildFactory(s,'klang','food'));
  unchangedFailure(s,()=>N.startProduction(s,'klang','food',1));
  ok(N.trade(s,'klang','rice',20,'buy'));ok(N.trade(s,'klang','palm',10,'buy'));
  unchangedFailure(s,()=>N.startProduction(s,'klang','food',11));
  const q=ok(N.startProduction(s,'klang','food',10));
  assert.equal(s.warehouses.klang.stock.rice,0);assert.equal(s.warehouses.klang.stock.palm,0);
  assert.equal(N.warehouseUsage(s,'klang').reserved,30);
  unchangedFailure(s,()=>N.startProduction(s,'klang','food',1));
  advanceTo(s,q.finishDay);assert.equal(s.warehouses.klang.stock.food,30);assert.equal(s.stats.produced,30);
  ok(N.advanceDay(s));assert.equal(s.warehouses.klang.stock.food,30);ok(N.validate(s));
});

test('all four recipes have realizable inputs and bounded batches',()=>{
  for(const [recipeId,r]of Object.entries(N.RECIPES)){
    const s=fresh();ok(N.buildFactory(s,'klang',recipeId));for(const [g,n]of Object.entries(r.inputs))ok(N.trade(s,'klang',g,n,'buy'));
    const q=ok(N.startProduction(s,'klang',recipeId,1));advanceTo(s,q.finishDay);
    for(const [g,n]of Object.entries(r.output))assert.equal(s.warehouses.klang.stock[g],n);
    assert.equal(r.maxBatches,10);ok(N.validate(s));
  }
});

test('upkeep shortfalls become visible debt and sale income repays debt first',()=>{
  const s=fresh();ok(N.trade(s,'klang','rice',2,'buy'));s.cash=0;ok(N.advanceDay(s));
  assert.equal(s.debt,N.COSTS.warehouseUpkeep);assert.equal(s.cash,0);const q=ok(N.quoteTrade(s,'klang','rice',1,'sell'));
  ok(N.trade(s,'klang','rice',1,'sell'));assert.equal(s.debt,0);assert.equal(s.cash,q.cost-N.COSTS.warehouseUpkeep);ok(N.validate(s));
});

test('end-of-season preflight refuses overdue jobs and final accounting includes cargo and facilities',()=>{
  const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.buildFactory(s,'klang','food'));ok(N.trade(s,'klang','rice',2,'buy'));ok(N.trade(s,'klang','palm',2,'buy'));
  advanceTo(s,59);unchangedFailure(s,()=>N.dispatch(s,'klang','singapore','sea','palm',1));unchangedFailure(s,()=>N.startProduction(s,'klang','food',1));
  ok(N.dispatch(s,'klang','singapore','air','palm',1));const q=ok(N.advanceDay(s));assert.equal(q.finished,true);
  assert.equal(s.warehouses.singapore.stock.palm,1);assert.equal(s.shipments.length,0);assert.equal(s.result.netWorth,N.netWorth(s));
  assert.equal(s.result.profit,s.result.netWorth-N.INITIAL_NET_WORTH);unchangedFailure(s,()=>N.advanceDay(s));unchangedFailure(s,()=>N.trade(s,'singapore','palm',1,'sell'));
  assert.deepEqual(ok(N.deserialize(N.serialize(s))).state,s);
});

test('active save roundtrips preserve ongoing reservations and all job clocks',()=>{
  const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.buildFactory(s,'klang','textiles'));
  ok(N.trade(s,'klang','cotton',4,'buy'));ok(N.trade(s,'klang','palm',5,'buy'));ok(N.startProduction(s,'klang','textiles',2));ok(N.dispatch(s,'klang','singapore','sea','palm',5));
  const loaded=ok(N.deserialize(N.serialize(s))).state;assert.deepEqual(loaded,s);
  advanceTo(s,8);advanceTo(loaded,8);assert.deepEqual(loaded,s);
});

test('malformed saves reject non-finite, unknown, overflowing and inconsistent game state',()=>{
  const changes=[s=>{s.version=2;},s=>{s.cash=-1;},s=>{s.cash=null;},s=>{s.debt='0';},s=>{s.day=60;},s=>{s.warehouses.klang.stock.rice=161;},s=>{s.warehouses.klang.capacity=999;},s=>{s.warehouses.klang.stock.rice=1.5;},s=>{s.market.klang.rice=-1;},s=>{s.market.unknown={};},s=>{s.warehouses.invalid=s.warehouses.klang;},s=>{s.factories.klang={recipeId:'magic'};},s=>{s.stats.trades=NaN;},s=>{s.laneLimit=100;},s=>{s.result={netWorth:999999};},s=>{s.unexpected=true;}];
  for(const change of changes){const s=fresh();change(s);assert.equal(N.deserialize(JSON.stringify(s)).ok,false);}
  assert.equal(N.deserialize('{bad').ok,false);assert.equal(N.deserialize('x'.repeat(1000001)).ok,false);
  assert.equal(N.deserialize('{"__proto__":{"polluted":true}}').ok,false);assert.equal({}.polluted,undefined);
  const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.trade(s,'klang','palm',20,'buy'));ok(N.dispatch(s,'klang','singapore','sea','palm',10));
  for(const change of [x=>x.shipments[0].arrivalDay++,x=>x.shipments[0].cost=1,x=>x.shipments[0].qty=121,x=>x.shipments.push({...x.shipments[0]}),x=>x.warehouses.singapore.stock.coal=155,x=>x.nextId=1]){const copy=JSON.parse(N.serialize(s));change(copy);assert.equal(N.validate(copy).ok,false);}
});

test('thirty complete companies trade, ship, manufacture, persist and settle for sixty days',()=>{
  let delivered=0,produced=0;
  for(let seed=0;seed<30;seed++){
    let s=N.create(`simulation-${seed}`);ok(N.buildWarehouse(s,'singapore'));ok(N.buildWarehouse(s,'bangkok'));ok(N.buildFactory(s,'klang','food'));
    ok(N.trade(s,'klang','palm',30,'buy'));ok(N.dispatch(s,'klang','singapore','sea','palm',6));ok(N.dispatch(s,'klang','bangkok','rail','palm',6));ok(N.dispatch(s,'klang','singapore','air','palm',4));
    while(s.status==='active'){
      for(const h of ['singapore','bangkok'])for(const g of Object.keys(N.GOODS)){const qty=s.warehouses[h].stock[g];if(qty)ok(N.trade(s,h,g,qty,'sell'));}
      if(s.warehouses.klang.stock.food)ok(N.trade(s,'klang','food',s.warehouses.klang.stock.food,'sell'));
      if(s.day<=57&&!s.production.length){for(const [g,n]of Object.entries(N.RECIPES.food.inputs)){const needed=n*10-s.warehouses.klang.stock[g];if(needed>0&&N.quoteTrade(s,'klang',g,needed,'buy').ok)ok(N.trade(s,'klang',g,needed,'buy'));}if(N.quoteProduction(s,'klang','food',10).ok)ok(N.startProduction(s,'klang','food',10));}
      ok(N.advanceDay(s));ok(N.validate(s));s=ok(N.deserialize(N.serialize(s))).state;
      for(const hub of Object.keys(s.warehouses))assert.ok(N.warehouseUsage(s,hub).used<=s.warehouses[hub].capacity);
    }
    assert.equal(s.day,60);assert.equal(s.shipments.length,0);assert.equal(s.production.length,0);assert.equal(s.result.netWorth,N.netWorth(s));assert.ok(Number.isSafeInteger(s.result.profit));delivered+=s.stats.shipments;produced+=s.stats.produced;
  }
  assert.equal(delivered,90);assert.ok(produced>=25000);
});

test('supported accounting limits reject actions before any partial mutation',()=>{
  let s=fresh();ok(N.trade(s,'klang','rice',1,'buy'));s.cash=1e12;unchangedFailure(s,()=>N.trade(s,'klang','rice',1,'sell'));
  s=fresh();s.stats.trades=1e12;unchangedFailure(s,()=>N.trade(s,'klang','rice',1,'buy'));
  s=fresh();s.cash=0;s.debt=1e12;unchangedFailure(s,()=>N.advanceDay(s));
  s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.trade(s,'klang','rice',1,'buy'));s.nextId=1e9;unchangedFailure(s,()=>N.dispatch(s,'klang','singapore','sea','rice',1));
});
