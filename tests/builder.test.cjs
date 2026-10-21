'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../builder.js');

const ok = result => { assert.equal(result.ok, true, result.error); return result; };
const fresh = () => { const state = B.create(); ok(B.approveStarter(state)); return state; };
const running = () => { const state = fresh(); ok(B.setSpeed(state, 1)); return state; };
const copy = state => JSON.parse(JSON.stringify(state));
const fails = (state, action) => {
  const before = JSON.stringify(state);
  assert.equal(action().ok, false);
  assert.equal(JSON.stringify(state), before, 'rejected commands must be atomic');
};
const advanceTo = (state, day) => {
  while (state.day < day) {
    const advanced = ok(B.advance(state, Math.min(365, day - state.day)));
    assert.ok(advanced.days > 0, 'unexpected pause at day ' + state.day + ': ' + state.pauseReason);
  }
};
const sum = values => values.reduce((a, b) => a + b, 0);

// Independently reconstruct money, goods, and allocated vessel inventory from public records.
function audit(state) {
  const transit = sum(state.shipments.filter(s => s.status === 'inTransit').map(s => s.qty));
  const ledgerCash = sum(state.ledger.map(e => e.amount));
  const purchased = sum(state.ledger.filter(e => e.kind === 'procurement').map(e => e.qty));
  const processed = sum(state.ledger.filter(e => e.kind === 'production').map(e => e.qty));
  const local = sum(state.ledger.filter(e => e.kind === 'localSale').map(e => e.qty));
  const exported = sum(state.ledger.filter(e => e.kind === 'exportSale').map(e => e.qty));
  assert.equal(state.cash, ledgerCash);
  assert.equal(state.inventory.rice, purchased - processed);
  assert.equal(state.inventory.food + transit, processed - local - exported);
  assert.equal(purchased, state.inventory.rice + state.inventory.food + transit + local + exported);
  assert.equal(state.totals.ricePurchased, purchased);
  assert.equal(state.totals.localSold, local);
  assert.equal(state.totals.exportSold, exported);
  assert.ok(state.cash >= 0 && Number.isSafeInteger(state.cash));
  assert.ok(state.inventory.rice >= 0 && state.inventory.food >= 0);
  assert.ok(B.status(state).storageUsed <= B.status(state).storageCapacity);
  for (const category of ['procurement', 'production', 'freight']) {
    assert.ok(state.week.spent[category] <= state.policy.weeklyBudget[category]);
  }
  assert.ok(state.shipments.filter(s => s.status === 'inTransit').length <= 1);
  const finance = B.finance(state);
  assert.equal(finance.netWorth - B.INITIAL_CASH, finance.operatingProfit, 'cash, invested assets and unsold goods reconcile to earned profit');
  assert.equal(finance.operatingCashFlow - finance.capitalInvestment, finance.netCashChange);
}

test('desktop company begins paused without implicit purchases, agreements, vessels, or loans', () => {
  const state = B.create();
  assert.equal(state.cash, B.INITIAL_CASH);
  assert.equal(state.speed, 0);
  assert.deepEqual(state.buildings, []);
  assert.deepEqual(state.agreements, { local: false, export: false });
  assert.equal(state.route.enabled, false);
  const before = JSON.stringify(state);
  assert.equal(ok(B.advance(state, 100)).days, 0);
  assert.equal(JSON.stringify(state), before);
  ok(B.setSpeed(state, 4)); ok(B.advance(state, 100));
  assert.equal(state.cash, B.INITIAL_CASH);
  assert.deepEqual(state.buildings, []);
  assert.equal(state.shipments.length, 0);
  assert.equal(state.ledger.length, 1);
  assert.equal('loans' in state, false);
  ok(B.validate(state));
});

test('starter approval buys the quoted district and explicitly authorizes its complete recurring loop', () => {
  const state = B.create();
  assert.equal(B.STARTER_COST, sum(Object.values(B.COSTS)));
  ok(B.approveStarter(state));
  assert.equal(state.cash, B.INITIAL_CASH - B.STARTER_COST);
  assert.equal(state.totals.buildCost, B.STARTER_COST);
  assert.deepEqual(state.buildings.map(({ type, plot }) => ({ type, plot })), B.STARTER);
  assert.deepEqual(state.agreements, { local: true, export: true });
  assert.equal(state.route.enabled, true);
  assert.equal(state.speed, 0, 'approval itself must not start time');
  assert.equal(state.day, 0);
  fails(state, () => B.approveStarter(state));
  ok(B.validate(state));
});

test('plots enforce service, occupancy, waterfront and one facility per type without charging failures', () => {
  const state = B.create();
  for (const [type, plot] of [['mill', 'p4'], ['dock', 'p12'], ['mill', 'p9'], ['dock', 'p2'], ['mill', 'missing'], ['__proto__', 'p1'], ['constructor', 'p1']]) {
    fails(state, () => B.place(state, type, plot));
  }
  ok(B.place(state, 'warehouse', 'p2'));
  fails(state, () => B.place(state, 'mill', 'p2'));
  fails(state, () => B.place(state, 'warehouse', 'p3'));
  fails(state, () => B.approveStarter(state));
  ok(B.place(state, 'dock', 'p9'));
  assert.equal(state.agreements.export, false);
  assert.equal(state.route.enabled, false, 'building a dock must not silently authorize a route');
  ok(B.validate(state));
});

test('warehouse adjacency changes real handling throughput', () => {
  const adjacent = fresh(), distant = B.create();
  for (const [type, plot] of [['depot', 'p2'], ['warehouse', 'p1'], ['mill', 'p7'], ['dock', 'p9']]) ok(B.place(distant, type, plot));
  ok(B.setAgreement(distant, 'local', true));
  assert.equal(B.status(adjacent).handlingCapacity, 10);
  assert.equal(B.status(distant).handlingCapacity, 6);
  assert.equal(B.status(adjacent).productionCapacity, 8);
  assert.equal(B.status(distant).productionCapacity, 6);
  for (const state of [adjacent, distant]) { ok(B.setSpeed(state, 1)); ok(B.advance(state)); }
  assert.equal(adjacent.totals.foodProduced, 8);
  assert.equal(distant.totals.foodProduced, 6);
  audit(adjacent); audit(distant);
});

test('one day performs procurement, production and local delivery with exact cents and tonnes', () => {
  const state = running();
  ok(B.advance(state));
  assert.deepEqual(state.inventory, { rice: 16, food: 4 });
  assert.equal(state.totals.ricePurchased, 24);
  assert.equal(state.totals.foodProduced, 8);
  assert.equal(state.totals.localSold, 4);
  assert.equal(state.cash, B.INITIAL_CASH - B.STARTER_COST - 24 * B.PRICES.rice - 8 * B.PRICES.production - 4 * B.PRICES.localFreight + 4 * B.PRICES.local);
  assert.equal(state.totals.seaDepartures, 0, 'route waits for its approved full load');
  const finance = B.finance(state);
  assert.equal(finance.operatingProfit, 24000, 'only sold goods and completed freight reduce earned profit');
  assert.equal(finance.operatingCashFlow, -148000, 'stock purchases immediately reduce operating cash');
  assert.equal(finance.netCashChange, -1648000, 'capital investment also reduces cash');
  assert.equal(finance.inventoryValue, 172000, 'unsold rice and food remain assets at cost');
  audit(state); ok(B.validate(state));
});

test('outbound cargo is reserved once and arrival settles once even after buyers or deliveries are paused', () => {
  const state = running();
  advanceTo(state, 3);
  assert.equal(state.shipments.length, 1);
  const shipment = copy(state.shipments[0]);
  assert.equal(shipment.qty, 12);
  assert.equal(state.inventory.food, 0);
  const transitValue = B.finance(state).netWorth;
  assert.equal(transitValue, state.cash + state.totals.buildCost + state.inventory.rice * B.PRICES.rice + 12 * (B.PRICES.rice + B.PRICES.production) + shipment.freight);
  ok(B.setAgreement(state, 'export', false));
  ok(B.setRoute(state, { enabled: false }));
  ok(B.setPolicy(state, { procurement: false, production: false, delivery: false }));
  const cash = state.cash;
  advanceTo(state, shipment.arrivalDay - 1);
  assert.equal(state.cash, cash);
  ok(B.advance(state));
  assert.equal(state.cash, cash + shipment.revenue);
  assert.equal(state.shipments[0].status, 'delivered');
  assert.equal(state.totals.seaArrivals, 1);
  assert.equal(state.totals.exportSold, 12);
  ok(B.advance(state, 30));
  assert.equal(state.cash, cash + shipment.revenue);
  assert.equal(state.ledger.filter(e => e.kind === 'exportSale').length, 1);
  audit(state); ok(B.validate(state));
});

test('monsoon adds exactly three days and repeated routes continue beyond day 60', () => {
  const state = running();
  advanceTo(state, 180);
  assert.equal(state.day, 180);
  assert.equal(state.speed, 1);
  assert.ok(state.shipments.length >= 20);
  assert.ok(state.shipments.some(s => s.departDay > 60));
  const delayed = state.shipments.filter(s => s.delay === 3);
  assert.ok(delayed.length > 0);
  for (const shipment of state.shipments) {
    const inMonsoon = shipment.departDay % 30 >= 18 && shipment.departDay % 30 <= 25;
    assert.equal(shipment.delay, inMonsoon ? 3 : 0);
    assert.equal(shipment.arrivalDay - shipment.departDay, inMonsoon ? 7 : 4);
  }
  assert.equal(state.totals.monsoonDelayed, delayed.length);
  assert.ok(B.finance(state).operatingProfit > 0);
  audit(state); ok(B.validate(state));
});

test('all playback speeds produce identical economic results per simulated day', () => {
  const results = [1, 2, 4].map(speed => {
    const state = fresh();
    ok(B.setSpeed(state, speed));
    for (let i = 0; i < 100; i++) {
      assert.equal(ok(B.advance(state)).days, 1);
      assert.equal(state.day, i + 1);
    }
    state.speed = 0;
    return state;
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  const state = running();
  ok(B.advance(state, 5)); ok(B.setSpeed(state, 0));
  const before = JSON.stringify(state);
  assert.equal(ok(B.advance(state, 365)).days, 0);
  assert.equal(JSON.stringify(state), before);
});

test('bounded advances and invalid commands never mutate the company', () => {
  const state = running();
  for (const value of [-1, 0, 366, 1.5, NaN, Infinity, '4', null]) fails(state, () => B.advance(state, value));
  for (const value of [-1, 3, 100, '1', null, NaN]) fails(state, () => B.setSpeed(state, value));
  for (const patch of [{}, null, [], { cashFloor: -1 }, { cashFloor: 1.2 }, { productionTarget: '8' }, { productionTarget: 101 }, { stockBuffer: -1 }, { procurement: 1 }, { unknown: true }, { weeklyBudget: { unknown: 1 } }, JSON.parse('{"__proto__":{"cash":0}}')]) fails(state, () => B.setPolicy(state, patch));
  for (const patch of [{}, { enabled: 1 }, { travelDays: 1 }, { lastDeparture: 0 }, { capacity: 0 }, { capacity: 24 }, { interval: 3 }, { interval: 31 }]) fails(state, () => B.setRoute(state, patch));
  fails(state, () => B.setAgreement(state, '__proto__', true));
  fails(state, () => B.setAgreement(state, 'local', 'true'));
  fails(state, () => B.upgrade(state, 'constructor'));
  ok(B.validate(state));
});

test('weekly budgets cap expenses, survive imports, and renew on day eight without changing cash', () => {
  const state = running();
  ok(B.setPolicy(state, { weeklyBudget: { procurement: 64000, production: 12000, freight: 2000 } }));
  advanceTo(state, 7);
  assert.deepEqual(state.week.spent, { procurement: 64000, production: 12000, freight: 2000 });
  assert.equal(state.totals.ricePurchased, 8);
  assert.equal(state.totals.foodProduced, 4);
  assert.equal(state.totals.localSold, 2);
  const restored = B.deserialize(B.serialize(state));
  assert.deepEqual(restored.week, state.week);
  fails(state, () => B.setPolicy(state, { weeklyBudget: { freight: 1000 } }));
  ok(B.setPolicy(state, { procurement: false, production: false, delivery: false }));
  const cash = state.cash;
  ok(B.advance(state));
  assert.equal(state.week.index, 1);
  assert.deepEqual(state.week.spent, { procurement: 0, production: 0, freight: 0 });
  assert.equal(state.cash, cash);
  audit(state); ok(B.validate(state));
});

test('a zero budget stops its operation without borrowing or treating a budget hold as a cash emergency', () => {
  const state = running();
  ok(B.setPolicy(state, { weeklyBudget: { procurement: 0, production: 0, freight: 0 } }));
  ok(B.advance(state, 30));
  assert.equal(state.cash, B.INITIAL_CASH - B.STARTER_COST);
  assert.equal(state.totals.ricePurchased, 0);
  assert.equal(state.speed, 1);
  assert.equal(B.status(state).critical, false);
  assert.ok(B.status(state).blockers.includes('Procurement weekly budget reached'));
});

test('cash protection pauses on insufficient working cash, preserves cash, and resumes after an explicit policy adjustment', () => {
  const state = running();
  ok(B.setPolicy(state, { cashFloor: state.cash - 5000 }));
  const before = state.cash;
  assert.equal(ok(B.advance(state, 30)).days, 1);
  assert.equal(state.day, 1);
  assert.equal(state.cash, before);
  assert.equal(state.speed, 0);
  assert.ok(state.pauseReason.startsWith('Cash floor:'));
  assert.equal(B.status(state).critical, true);
  assert.equal(ok(B.advance(state)).days, 0);
  ok(B.setPolicy(state, { cashFloor: 250000 }));
  ok(B.setSpeed(state, 1)); ok(B.advance(state, 30));
  assert.equal(state.day, 31);
  assert.ok(state.totals.localSold > 0);
  assert.ok(state.cash >= state.policy.cashFloor);
  audit(state); ok(B.validate(state));
});

test('cash floors also protect explicit construction and upgrades; setting a higher floor pauses immediately', () => {
  const state = B.create();
  ok(B.setPolicy(state, { cashFloor: B.INITIAL_CASH }));
  fails(state, () => B.approveStarter(state));
  fails(state, () => B.place(state, 'depot', 'p1'));
  fails(state, () => B.setSpeed(state, 1));
  const active = running();
  ok(B.setPolicy(active, { cashFloor: active.cash }));
  assert.equal(active.speed, 0);
  fails(active, () => B.upgrade(active, 'warehouse'));
  assert.equal(active.cash, B.INITIAL_CASH - B.STARTER_COST);
});

test('a zero-cash company can explicitly wait for committed paid cargo without spending or a loan', () => {
  const state = fresh();
  ok(B.setPolicy(state, { cashFloor: 0 }));
  ok(B.setSpeed(state, 1)); ok(B.advance(state, 3));
  for (const type of ['warehouse', 'depot', 'depot', 'mill', 'mill']) ok(B.upgrade(state, type));
  ok(B.setPolicy(state, { productionTarget: 0, stockBuffer: 27, production: false, delivery: false, weeklyBudget: { procurement: 500000 } }));
  ok(B.advance(state));
  assert.equal(state.day, 4);
  assert.equal(state.cash, 0);
  assert.equal(state.speed, 0);
  fails(state, () => B.setSpeed(state, 1));
  const restored = B.deserialize(B.serialize(state));
  assert.ok(restored.pauseReason.startsWith('Cash floor:'), 'loading must preserve the emergency explanation');
  assert.equal(B.status(restored).critical, true);
  const stock = copy(restored.inventory), policy = copy(restored.policy), expenses = B.finance(restored).expenses;
  const ledgerLength = restored.ledger.length, departures = restored.totals.seaDepartures;
  assert.equal(ok(B.waitForArrival(restored)).days, 3);
  assert.equal(restored.day, 7);
  assert.equal(restored.cash, 288000);
  assert.equal(restored.speed, 0);
  assert.deepEqual(restored.inventory, stock);
  assert.deepEqual(restored.policy, policy);
  assert.equal(B.finance(restored).expenses, expenses);
  assert.equal(restored.totals.seaDepartures, departures);
  assert.deepEqual(restored.ledger.slice(ledgerLength).map(e => e.kind), ['exportSale']);
  fails(restored, () => B.waitForArrival(restored));
  ok(B.setSpeed(restored, 1));
  audit(restored); ok(B.validate(restored));
});

test('waiting for a paid arrival holds all operations, renews budgets and weather, and ends paused', () => {
  const state = running();
  advanceTo(state, 24);
  const shipment = state.shipments.find(s => s.status === 'inTransit');
  assert.equal(shipment.arrivalDay, 31);
  ok(B.setPolicy(state, { cashFloor: state.cash + 1 }));
  assert.equal(state.speed, 0);
  const before = copy(state), earnedBefore = B.finance(state).operatingProfit;
  assert.equal(ok(B.waitForArrival(state)).days, 7);
  assert.equal(state.day, 31);
  assert.equal(state.cash, before.cash + shipment.revenue);
  assert.equal(state.speed, 0);
  assert.deepEqual(state.inventory, before.inventory);
  assert.deepEqual(state.policy, before.policy);
  assert.deepEqual(state.agreements, before.agreements);
  assert.deepEqual(state.route, before.route);
  assert.deepEqual(state.week, { index: 4, spent: { procurement: 0, production: 0, freight: 0 } });
  assert.equal(state.totals.ricePurchased, before.totals.ricePurchased);
  assert.equal(state.totals.foodProduced, before.totals.foodProduced);
  assert.equal(state.totals.localSold, before.totals.localSold);
  assert.equal(state.totals.seaDepartures, before.totals.seaDepartures);
  assert.ok(state.events.some(e => e.day === 26 && e.type === 'weather'));
  assert.equal(B.finance(state).operatingProfit - earnedBefore, shipment.revenue - shipment.qty * (B.PRICES.rice + B.PRICES.production) - shipment.freight);
  assert.deepEqual(state.ledger.slice(before.ledger.length).map(e => e.kind), ['exportSale']);
  audit(state); ok(B.validate(state));
});

test('waiting without a committed shipment is rejected atomically', () => {
  for (const state of [B.create(), running()]) fails(state, () => B.waitForArrival(state));
});

test('throughput diagnostics explain approved outlet limits and respond to explicit route and production policies', () => {
  const state = fresh();
  const initial = JSON.stringify(state), status = B.status(state);
  assert.equal(status.throughput.productionDemand, 8);
  assert.equal(status.throughput.localDailyCapacity, 4);
  assert.equal(status.throughput.exportDailyCapacity, 12 / 7);
  assert.equal(status.throughput.deliveryDailyCapacity, 4 + 12 / 7);
  assert.ok(status.blockers.includes('Delivery capacity limits production'));
  assert.equal(JSON.stringify(state), initial, 'diagnostics never alter the simulation');
  ok(B.setPolicy(state, { productionTarget: 5 }));
  assert.ok(!B.status(state).blockers.includes('Delivery capacity limits production'));
  ok(B.setPolicy(state, { productionTarget: 8 }));
  ok(B.upgrade(state, 'dock')); ok(B.setRoute(state, { capacity: 18, interval: 4 }));
  assert.equal(B.status(state).throughput.deliveryDailyCapacity, 8.5);
  assert.ok(!B.status(state).blockers.includes('Delivery capacity limits production'));
  ok(B.setAgreement(state, 'export', false));
  assert.equal(B.status(state).throughput.deliveryDailyCapacity, 4);
  assert.ok(B.status(state).blockers.includes('Delivery capacity limits production'));
  ok(B.setPolicy(state, { production: false }));
  assert.equal(B.status(state).throughput.productionDemand, 0);
  assert.ok(!B.status(state).blockers.includes('Delivery capacity limits production'));
  audit(state); ok(B.validate(state));
});

test('shared storage stays bounded when buyers are paused and high stock targets cannot create capacity', () => {
  const state = running();
  ok(B.setAgreement(state, 'local', false));
  ok(B.setAgreement(state, 'export', false));
  ok(B.setPolicy(state, { stockBuffer: 160, productionTarget: 100 }));
  for (let i = 0; i < 90; i++) { ok(B.advance(state)); audit(state); }
  assert.equal(B.status(state).storageUsed, 80);
  assert.equal(state.totals.localSold, 0);
  assert.equal(state.totals.exportSold, 0);
  assert.equal(state.shipments.length, 0);
  ok(B.validate(state));
});

test('explicit upgrades change capacity, costs and handling; no automatic upgrade occurs', () => {
  const state = fresh();
  const baseCash = state.cash;
  ok(B.upgrade(state, 'warehouse'));
  assert.equal(B.status(state).storageCapacity, 120);
  ok(B.upgrade(state, 'mill'));
  assert.equal(B.status(state).productionCapacity, 10, 'handling limits an upgraded mill');
  ok(B.upgrade(state, 'depot'));
  assert.equal(B.status(state).productionCapacity, 12);
  assert.equal(state.cash, baseCash - B.BUILDINGS.warehouse.upgradeCost - B.BUILDINGS.mill.upgradeCost - B.BUILDINGS.depot.upgradeCost);
  ok(B.setSpeed(state, 1)); advanceTo(state, 100);
  assert.equal(state.buildings.find(b => b.type === 'dock').level, 1);
  ok(B.upgrade(state, 'dock'));
  ok(B.setRoute(state, { capacity: 18, interval: 5 }));
  assert.equal(B.status(state).seaCapacity, 18);
  ok(B.upgrade(state, 'dock'));
  ok(B.setRoute(state, { capacity: 24 }));
  fails(state, () => B.upgrade(state, 'dock'));
  audit(state); ok(B.validate(state));
});

test('save and reload preserve all economics and in-flight commitments, resume paused, and never catch up offline', () => {
  const original = running();
  advanceTo(original, 24);
  assert.ok(original.shipments.some(s => s.status === 'inTransit'));
  const backup = B.serialize(original), restored = B.deserialize(backup);
  assert.equal(restored.speed, 0);
  assert.equal(restored.day, original.day);
  assert.deepEqual(restored.inventory, original.inventory);
  assert.deepEqual(restored.shipments, original.shipments);
  assert.deepEqual(restored.ledger, original.ledger);
  assert.equal(ok(B.advance(restored, 100)).days, 0);
  assert.equal(restored.day, 24);
  ok(B.setSpeed(original, 1)); ok(B.setSpeed(restored, 1));
  advanceTo(original, 200); advanceTo(restored, 200);
  assert.deepEqual(restored, original);
});

test('strict imports reject corrupted money, goods, facilities, journal, authorizations, timing and unknown fields', () => {
  const state = running();
  advanceTo(state, 30);
  const mutations = [
    s => { s.cash += 1; },
    s => { s.inventory.food += 1; },
    s => { s.inventory.rice = -1; },
    s => { s.totals.revenue += 1; },
    s => { s.buildings[0].plot = 'p4'; },
    s => { s.buildings[0].level = 3; },
    s => { s.policy.procurement = 'yes'; },
    s => { s.policy.productionTarget = 1.5; },
    s => { s.policy.weeklyBudget.freight = -1; },
    s => { s.week.spent.procurement = 0; },
    s => { s.week.index += 1; },
    s => { s.route.travelDays = 0; },
    s => { s.route.lastDeparture = -7; },
    s => { s.shipments[0].arrivalDay -= 1; },
    s => { s.shipments[0].revenue += 1; },
    s => { s.shipments[0].settledDay += 1; },
    s => { s.shipments[0].status = 'inTransit'; },
    s => { s.ledger[1].amount += 1; },
    s => { s.ledger[0].cashAfter -= 1; },
    s => { s.ledger.push(copy(s.ledger.at(-1))); },
    s => { s.events.push({ day: s.day + 1, type: 'bad', message: 'future' }); },
    s => { s.wallClockTimestamp = Date.now(); },
    s => { s.currency = 'USD'; },
    s => { delete s.agreements; },
    s => { s.constructor = { malicious: true }; },
    s => { s.schema = 2; }
  ];
  const original = JSON.stringify(state);
  for (const mutate of mutations) {
    const corrupted = copy(state);
    mutate(corrupted);
    assert.throws(() => B.deserialize(JSON.stringify(corrupted)));
    assert.equal(JSON.stringify(state), original, 'import rejection must not affect the current company');
  }
  for (const input of ['null', '[]', '{}', '{"__proto__":{}}', 'not json', '', null, 123]) assert.throws(() => B.deserialize(input));
  assert.equal(B.validate({}).ok, false);
});

test('shipment journals cannot double-settle even if an attacker also edits cash and totals', () => {
  const state = running();
  advanceTo(state, 20);
  const corrupted = copy(state), receipt = copy(corrupted.ledger.find(e => e.kind === 'exportSale'));
  receipt.id = corrupted.ledger.length + 1;
  receipt.day = corrupted.day;
  receipt.cashAfter = corrupted.cash + receipt.amount;
  corrupted.ledger.push(receipt);
  corrupted.cash += receipt.amount;
  corrupted.totals.revenue += receipt.amount;
  corrupted.totals.exportSold += receipt.qty;
  assert.throws(() => B.deserialize(JSON.stringify(corrupted)));
});

test('derived views cannot advance time or change assets and return detached budget values', () => {
  const state = running();
  advanceTo(state, 20);
  const before = JSON.stringify(state);
  for (let i = 0; i < 10; i++) {
    B.status(state);
    const finances = B.finance(state);
    finances.weeklySpent.procurement = 0;
    finances.weeklyBudget.freight = 999999999;
  }
  assert.equal(JSON.stringify(state), before);
  const finances = B.finance(state);
  assert.equal(finances.netCashChange, finances.cash - B.INITIAL_CASH);
  assert.equal(finances.operatingCashFlow, finances.netCashChange + state.totals.buildCost + state.totals.upgradeCost);
  assert.equal(finances.operatingProfit, finances.netWorth - B.INITIAL_CASH);
});

test('the next operating event never skips initial production and stops at an in-flight arrival', () => {
  const state = running();
  assert.equal(B.status(state).nextEventDay, 1);
  advanceTo(state, 3);
  assert.equal(B.status(state).nextEventDay, state.shipments[0].arrivalDay);
  ok(B.advance(state, B.status(state).nextEventDay - state.day));
  assert.equal(state.shipments[0].status, 'delivered');
  assert.equal(B.status(state).nextEventDay, state.day + 1);
});

test('ten years of unattended cycles retain exact accounting, bounded events and positive cash', () => {
  const state = running();
  for (let year = 0; year < 10; year++) {
    ok(B.advance(state, 365));
    audit(state); ok(B.validate(state));
  }
  assert.equal(state.day, 3650);
  assert.ok(state.totals.seaArrivals > 400);
  assert.ok(state.cash > B.INITIAL_CASH);
  assert.ok(state.events.length <= 120);
  assert.ok(state.ledger.length > 10000, 'complete accounting records survive display-event truncation');
  const restored = B.deserialize(B.serialize(state));
  audit(restored); ok(B.validate(restored));
});

test('seeded changing policies, route schedules, saves and speed controls preserve invariants over 4,380 days', () => {
  for (let seed = 1; seed <= 12; seed++) {
    let random = seed, state = running();
    const pick = max => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random % max; };
    for (let day = 0; day < 365; day++) {
      if (day % 11 === 0) {
        ok(B.setPolicy(state, { productionTarget: pick(14), stockBuffer: pick(50),
          weeklyBudget: {
            procurement: state.week.spent.procurement + pick(500000),
            production: state.week.spent.production + pick(250000),
            freight: state.week.spent.freight + pick(120000)
          } }));
        ok(B.setAgreement(state, 'local', pick(5) !== 0));
        ok(B.setAgreement(state, 'export', pick(5) !== 0));
        ok(B.setRoute(state, { capacity: 1 + pick(12), interval: 4 + pick(12), enabled: pick(4) !== 0 }));
      }
      if (day % 31 === 0) state = B.deserialize(B.serialize(state));
      if (state.speed === 0) {
        ok(B.setPolicy(state, { cashFloor: 0 }));
        ok(B.setSpeed(state, [1, 2, 4][pick(3)]));
      }
      ok(B.advance(state));
      audit(state);
    }
    ok(B.validate(state));
  }
});
