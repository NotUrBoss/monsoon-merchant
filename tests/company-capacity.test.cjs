'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const N=require('../logistics.js');
const ok=r=>{assert.equal(r.ok,true,r.error);return r;};

test('unified warehouse upgrades support a full largest-ship delivery and preserve reservations',()=>{
  const s=N.create('full-feeder',true);s.cash=10000000;
  ok(N.buildWarehouse(s,'singapore'));
  for(const hub of ['klang','singapore']){
    while(s.warehouses[hub].level<N.warehouseMaxLevel(s))ok(N.upgradeWarehouse(s,hub));
    assert.equal(s.warehouses[hub].capacity,1240);
    const before=N.serialize(s);assert.equal(N.upgradeWarehouse(s,hub).ok,false);assert.equal(N.serialize(s),before);
  }
  ok(N.upgradeShip(s,'feeder'));const load=N.FLEET.feeder.capacity;
  s.warehouses.klang.stock.coal=load;ok(N.validate(s));
  ok(N.transferCargo(s,'coal',load,'load'));const q=ok(N.sail(s,'singapore'));
  assert.equal(N.warehouseUsage(s,'singapore').reserved,load);
  assert.equal(N.quoteTrade(s,'singapore','coal',1241-load,'buy').ok,false);
  assert.deepEqual(ok(N.deserialize(N.serialize(s))).state,s);
  while(s.day<q.arrivalDay)ok(N.advanceDay(s));
  assert.equal(s.warehouses.singapore.stock.coal,load);assert.equal(s.captain.cargo.coal,0);
  ok(N.validate(s));assert.deepEqual(ok(N.deserialize(N.serialize(s))).state,s);
});
test('legacy warehouse caps remain unchanged until the captain is enabled',()=>{
  const s=N.create('old-caps');ok(N.upgradeWarehouse(s,'klang'));ok(N.upgradeWarehouse(s,'klang'));
  assert.equal(N.warehouseMaxLevel(s),3);assert.equal(N.upgradeWarehouse(s,'klang').ok,false);
  const old=JSON.parse(N.serialize(s));delete old.captain;delete old.customer;old.version=1;
  old.warehouses.klang.level=4;old.warehouses.klang.capacity=520;
  assert.equal(N.deserialize(JSON.stringify(old)).ok,false);
  ok(N.enableCaptain(s));ok(N.upgradeWarehouse(s,'klang'));assert.equal(s.warehouses.klang.capacity,520);ok(N.validate(s));
});
