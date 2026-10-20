'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const N=require('../logistics.js');
const Classic=require('../engine.js');
const fresh=(seed='unified-test')=>N.create(seed,true);
const ok=r=>{assert.equal(r.ok,true,r.error);return r;};
const advanceTo=(s,day)=>{while(s.day<day)ok(N.advanceDay(s));};
const fails=(s,fn)=>{const before=N.serialize(s);assert.equal(fn().ok,false);assert.equal(N.serialize(s),before,'rejected command must not change state');};
const copy=s=>JSON.parse(N.serialize(s));
function setup(){const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.trade(s,'klang','palm',30,'buy'));return s;}

test('unified company reuses captain ship catalog and has one cash balance and calendar',()=>{
  const s=fresh();ok(N.validate(s));assert.equal(s.cash,N.INITIAL_CASH);assert.equal(N.netWorth(s),N.INITIAL_NET_WORTH);
  assert.equal(N.FLEET.coaster.capacity,Classic.SHIPS.coaster.cap);assert.equal(N.FLEET.freighter.cost,Classic.SHIPS.freighter.price);
  assert.equal('cash' in s.captain,false);assert.equal('day' in s.captain,false);
});
test('loading and unloading conserve stock and cannot be repeated to duplicate goods',()=>{
  const s=setup(),cash=s.cash,value=N.netWorth(s);ok(N.transferCargo(s,'palm',20,'load'));
  assert.equal(s.warehouses.klang.stock.palm,10);assert.equal(s.captain.cargo.palm,20);assert.equal(s.cash,cash);assert.equal(N.netWorth(s),value);
  fails(s,()=>N.transferCargo(s,'palm',11,'load'));ok(N.transferCargo(s,'palm',20,'unload'));assert.equal(s.warehouses.klang.stock.palm,30);
  fails(s,()=>N.transferCargo(s,'palm',1,'unload'));
});
test('captain, sea, air, rail and factory jobs progress on one clock and arrive exactly once',()=>{
  const s=setup();s.cash=1000000;ok(N.buildWarehouse(s,'bangkok'));ok(N.buildFactory(s,'klang','food'));
  ok(N.transferCargo(s,'palm',10,'load'));const voyage=ok(N.sail(s,'singapore'));
  const sea=ok(N.dispatch(s,'klang','singapore','sea','palm',5));const air=ok(N.dispatch(s,'klang','singapore','air','palm',5));const rail=ok(N.dispatch(s,'klang','bangkok','rail','palm',5));
  ok(N.trade(s,'klang','rice',2,'buy'));const production=ok(N.startProduction(s,'klang','food',1));
  assert.equal(s.day,1);assert.equal(N.warehouseUsage(s,'singapore').reserved,20);
  const end=Math.max(voyage.arrivalDay,sea.arrivalDay,air.arrivalDay,rail.arrivalDay,production.finishDay);
  advanceTo(s,end);assert.equal(s.captain.port,'singapore');assert.equal(s.captain.voyages,1);assert.equal(s.captain.transported,10);
  assert.equal(s.warehouses.singapore.stock.palm,20);assert.equal(s.warehouses.bangkok.stock.palm,5);assert.equal(s.warehouses.klang.stock.food,3);assert.equal(s.stats.shipments,3);
  ok(N.advanceDay(s));assert.equal(s.captain.voyages,1);assert.equal(s.warehouses.singapore.stock.palm,20);ok(N.validate(s));
});
test('manufacture, load, sail, unload and fulfil an order is a playable end-to-end chain',()=>{
  const s=fresh();ok(N.buildWarehouse(s,'singapore'));ok(N.buildFactory(s,'klang','food'));
  ok(N.trade(s,'klang','rice',20,'buy'));ok(N.trade(s,'klang','palm',10,'buy'));const job=ok(N.startProduction(s,'klang','food',10));
  fails(s,()=>N.transferCargo(s,'food',30,'load'));advanceTo(s,job.finishDay);ok(N.transferCargo(s,'food',30,'load'));
  const voyage=ok(N.sail(s,'singapore'));fails(s,()=>N.fulfillOrder(s,'pantry'));advanceTo(s,voyage.arrivalDay);
  const cash=s.cash;ok(N.fulfillOrder(s,'pantry'));assert.equal(s.cash,cash+110000);assert.equal(s.warehouses.singapore.stock.food,0);
  fails(s,()=>N.fulfillOrder(s,'pantry'));fails(s,()=>N.trade(s,'singapore','food',30,'sell'));
});
test('captain destination reservation participates in all warehouse capacity checks',()=>{
  const s=setup();s.warehouses.singapore.stock.coal=130;ok(N.transferCargo(s,'palm',20,'load'));ok(N.sail(s,'singapore'));
  assert.equal(N.warehouseUsage(s,'singapore').free,10);fails(s,()=>N.trade(s,'singapore','rice',11,'buy'));
  ok(N.dispatch(s,'klang','singapore','sea','palm',10));assert.equal(N.warehouseUsage(s,'singapore').free,0);
  advanceTo(s,s.captain.voyage.arrivalDay);assert.equal(N.warehouseUsage(s,'singapore').used,160);ok(N.validate(s));
});
test('blocked sail and invalid transfer inputs are atomic, including prototype keys',()=>{
  const s=setup();
  for(const value of [NaN,Infinity,-1,0,0.5,'1',null,undefined,Number.MAX_SAFE_INTEGER])fails(s,()=>N.transferCargo(s,'palm',value,'load'));
  for(const id of ['__proto__','constructor','unknown',null]){fails(s,()=>N.sail(s,id));fails(s,()=>N.upgradeShip(s,id));fails(s,()=>N.fulfillOrder(s,id));}
  fails(s,()=>N.transferCargo(s,'__proto__',1,'load'));fails(s,()=>N.sail(s,'klang'));fails(s,()=>N.sail(s,'sydney'));
  ok(N.transferCargo(s,'palm',20,'load'));s.warehouses.singapore.stock.coal=150;fails(s,()=>N.sail(s,'singapore'));
});
test('captain commands cannot move, sell or reconfigure the hold while in transit',()=>{
  const s=setup();ok(N.transferCargo(s,'palm',20,'load'));ok(N.sail(s,'singapore'));
  for(const fn of [()=>N.transferCargo(s,'palm',1,'unload'),()=>N.transferCargo(s,'palm',1,'load'),()=>N.insure(s,true),()=>N.repairCaptain(s),()=>N.upgradeShip(s,'freighter'),()=>N.sail(s,'klang')])fails(s,fn);
  assert.equal(s.warehouses.klang.stock.palm,10);fails(s,()=>N.trade(s,'klang','palm',11,'sell'));
});
test('cargo and ship asset value are counted once in transit, not once per view',()=>{
  const s=setup();ok(N.transferCargo(s,'palm',20,'load'));const q=ok(N.sail(s,'singapore'));
  const nonCargo=s.cash+2*Math.floor(N.COSTS.warehouse*.6),origin=N.prices(s,'klang').palm.sell*10,destination=N.prices(s,'singapore').palm.sell*20;
  assert.equal(N.netWorth(s),nonCargo+origin+destination);assert.equal(q.cost,s.captain.voyage.cost);
  for(let i=0;i<10;i++){N.objectives(s);N.quoteVoyage(s,'singapore');N.warehouseUsage(s,'singapore');assert.equal(N.netWorth(s),nonCargo+origin+destination);}
});
test('captain saves preserve concurrent voyages, production, reservations and deterministic weather',()=>{
  const s=setup();ok(N.transferCargo(s,'palm',20,'load'));ok(N.sail(s,'singapore'));ok(N.buildFactory(s,'klang','food'));ok(N.trade(s,'klang','rice',2,'buy'));ok(N.startProduction(s,'klang','food',1));
  const restored=ok(N.deserialize(N.serialize(s))).state;advanceTo(s,10);advanceTo(restored,10);assert.deepEqual(restored,s);
});
test('tampered captain saves reject cargo, orders, clocks, costs and missing fields',()=>{
  const s=setup();ok(N.transferCargo(s,'palm',20,'load'));ok(N.sail(s,'singapore'));
  const mutations=[x=>{x.captain.cash=1;},x=>{delete x.captain;},x=>{x.captain.hull=-1;},x=>{x.captain.cargo.palm=151;},x=>{x.captain.cargo.rice=0.5;},x=>{x.captain.ship='magic';},x=>{x.captain.port='sydney';},x=>{x.captain.voyage.arrivalDay++;},x=>{x.captain.voyage.cost=0;},x=>{x.captain.voyage.damage=0;},x=>{x.captain.voyage.extra=1;},x=>{x.captain.orders.straits='expired';},x=>{x.captain.orders.unknown='open';},x=>{x.captain.transported=Infinity;}];
  for(const mutate of mutations){const bad=copy(s);mutate(bad);assert.equal(N.deserialize(JSON.stringify(bad)).ok,false,mutate.toString());}
});
test('old company saves migrate without changing economics, and finished settlements remain intact',()=>{
  for(const finished of [false,true]){
    const old=N.create('old-company');if(finished)advanceTo(old,60);const oldValue=N.netWorth(old);const original=copy(old);delete original.captain;original.version=1;
    const text=JSON.stringify(original),restored=ok(N.deserialize(text)).state;
    assert.equal(restored.version,2);assert.equal(restored.captain,null);assert.equal(N.netWorth(restored),oldValue);assert.equal(restored.cash,old.cash);
    if(!finished){ok(N.enableCaptain(restored));assert.equal(N.netWorth(restored),oldValue);}else assert.deepEqual(restored.result,old.result);
    assert.equal(text,JSON.stringify(original),'migration must not alter the source input');
  }
});
test('malformed legacy saves are rejected before upgrading',()=>{
  const old=N.create();delete old.captain;old.version=1;old.cash=-1;assert.equal(N.deserialize(JSON.stringify(old)).ok,false);
  old.cash=500000;old.magic=true;assert.equal(N.deserialize(JSON.stringify(old)).ok,false);
});
test('orders can use chartered or captain cargo, consume stock once and pay debt first',()=>{
  const s=setup();const job=ok(N.dispatch(s,'klang','singapore','sea','palm',20));advanceTo(s,job.arrivalDay);ok(N.borrow(s,10000));
  const cash=s.cash;ok(N.fulfillOrder(s,'straits'));assert.equal(s.debt,0);assert.equal(s.cash,cash+42000);assert.equal(s.warehouses.singapore.stock.palm,0);fails(s,()=>N.fulfillOrder(s,'straits'));
});
test('deadline-day deliveries can fulfil orders; expired orders do not lock the campaign',()=>{
  const s=setup();advanceTo(s,14);const q=ok(N.dispatch(s,'klang','singapore','air','palm',20));assert.equal(q.arrivalDay,15);advanceTo(s,15);ok(N.fulfillOrder(s,'straits'));ok(N.advanceDay(s));assert.equal(s.captain.orders.straits,'fulfilled');
  const expired=fresh();advanceTo(expired,16);assert.equal(expired.captain.orders.straits,'expired');fails(expired,()=>N.fulfillOrder(expired,'straits'));ok(N.trade(expired,'klang','rice',1,'buy'));
});
test('borrowing does not create net worth, daily interest is charged once, repayment is bounded',()=>{
  const s=fresh(),value=N.netWorth(s),cash=s.cash;ok(N.borrow(s,10000));assert.equal(N.netWorth(s),value);assert.equal(s.debt,10000);
  assert.equal(N.dailyUpkeep(s),N.COSTS.warehouseUpkeep+50);ok(N.advanceDay(s));assert.equal(s.stats.upkeep,270);assert.equal(s.cash,cash+10000-270);
  ok(N.repay(s,10000));assert.equal(s.debt,0);assert.equal(s.cash,cash-270);
  for(const n of [-1,0,0.5,'10',Infinity,NaN,150001])fails(s,()=>N.borrow(s,n));fails(s,()=>N.repay(s,1));
});
test('cash shortage accrues upkeep and interest transparently without making state invalid',()=>{
  const s=fresh();ok(N.borrow(s,10000));s.cash=0;ok(N.advanceDay(s));assert.equal(s.debt,10270);assert.equal(s.cash,0);ok(N.validate(s));
  s.warehouses.klang.stock.food=10;const quote=ok(N.quoteTrade(s,'klang','food',10,'sell'));ok(N.trade(s,'klang','food',10,'sell'));assert.equal(s.debt,0);assert.equal(s.cash,quote.cost-10270);
});
test('repairs, insurance and ship upgrades charge the shared cash balance and respect gates',()=>{
  const s=setup();s.captain.hull=19;fails(s,()=>N.sail(s,'singapore'));const cash=s.cash;ok(N.repairCaptain(s));assert.equal(s.cash,cash-81*120);assert.equal(s.captain.hull,100);
  ok(N.insure(s,true));const quote=ok(N.sail(s,'singapore'));advanceTo(s,quote.arrivalDay);assert.equal(s.captain.hull,100);
  s.cash=1000000;const before=s.cash;ok(N.upgradeShip(s,'freighter'));assert.equal(s.cash,before-Classic.SHIPS.freighter.price);assert.equal(s.captain.ship,'freighter');fails(s,()=>N.upgradeShip(s,'coaster'));
});
test('monsoon travel quotes are deterministic across the day-30 boundary and saved correctly',()=>{
  const s=setup();advanceTo(s,30);const first=ok(N.quoteVoyage(s,'singapore'));assert.match(first.monsoon,/Southwest/);ok(N.advanceDay(s));const second=ok(N.quoteVoyage(s,'singapore'));assert.match(second.monsoon,/Northeast/);
  const sail=ok(N.sail(s,'singapore'));assert.deepEqual(ok(N.deserialize(N.serialize(s))).state,s);advanceTo(s,sail.arrivalDay);ok(N.validate(s));
});
test('late voyages are blocked and day-60 settlement includes onboard cargo and ship value',()=>{
  const s=setup();s.cash=1000000;ok(N.upgradeShip(s,'freighter'));ok(N.transferCargo(s,'palm',20,'load'));advanceTo(s,59);fails(s,()=>N.sail(s,'singapore'));ok(N.advanceDay(s));
  assert.equal(s.status,'finished');assert.equal(s.result.netWorth,N.netWorth(s));assert.equal(s.result.profit,N.netWorth(s)-N.INITIAL_NET_WORTH);assert.equal(s.captain.cargo.palm,20);
  for(const fn of [()=>N.borrow(s,1),()=>N.transferCargo(s,'palm',1,'unload'),()=>N.fulfillOrder(s,'straits'),()=>N.repairCaptain(s)])fails(s,fn);
  assert.deepEqual(ok(N.deserialize(N.serialize(s))).state,s);
});
test('accounting boundary checks refuse captain arrival before partial tick mutation',()=>{
  const s=setup();ok(N.transferCargo(s,'palm',20,'load'));const voyage=ok(N.sail(s,'singapore'));advanceTo(s,voyage.arrivalDay-1);s.captain.voyages=1e12;fails(s,()=>N.advanceDay(s));
});
test('25 integrated 60-day campaigns manufacture, sail, charter, sell, save and settle without invalid states',()=>{
  let completed=0;
  for(let seed=0;seed<25;seed++){
    let s=fresh('integrated-'+seed);ok(N.buildWarehouse(s,'singapore'));ok(N.buildFactory(s,'klang','food'));
    ok(N.trade(s,'klang','palm',30,'buy'));ok(N.trade(s,'klang','rice',20,'buy'));ok(N.startProduction(s,'klang','food',10));
    ok(N.transferCargo(s,'palm',20,'load'));ok(N.sail(s,'singapore'));
    while(s.status==='active'){
      if(s.captain.port==='singapore'&&!s.captain.voyage){if(N.quoteOrder(s,'straits').ok)ok(N.fulfillOrder(s,'straits'));if(N.quoteOrder(s,'pantry').ok)ok(N.fulfillOrder(s,'pantry'));if(s.day<20&&N.quoteVoyage(s,'klang').ok)ok(N.sail(s,'klang'));}
      if(s.captain.port==='klang'&&!s.captain.voyage&&s.warehouses.klang.stock.food>=30){ok(N.transferCargo(s,'food',30,'load'));if(N.quoteVoyage(s,'singapore').ok)ok(N.sail(s,'singapore'));}
      if(s.day===6&&s.warehouses.klang.stock.food>=1&&N.quoteShipment(s,'klang','singapore','air','food',1).ok)ok(N.dispatch(s,'klang','singapore','air','food',1));
      ok(N.advanceDay(s));ok(N.validate(s));s=ok(N.deserialize(N.serialize(s))).state;
    }
    assert.equal(s.result.netWorth,N.netWorth(s));assert.ok(s.captain.voyages>0);assert.equal(s.stats.produced,30);completed++;
  }
  assert.equal(completed,25);
});
