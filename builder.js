(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MMBuilder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // All money is integer MYR cents; all goods are integer tonnes.
  const INITIAL_CASH = 3000000;
  const MAX_DAY = 36500;
  const COSTS = Object.freeze({ depot: 200000, warehouse: 300000, mill: 600000, dock: 400000 });
  const PRICES = Object.freeze({ rice: 8000, production: 3000, local: 18000, export: 24000, localFreight: 1000, seaFreight: 2000 });
  const BUILDINGS = Object.freeze({
    depot: Object.freeze({ name: 'Supply depot', cost: COSTS.depot, upgradeCost: 100000, description: 'Brings rice into the district and handles local deliveries.' }),
    warehouse: Object.freeze({ name: 'Warehouse', cost: COSTS.warehouse, upgradeCost: 150000, description: 'Stores rice and food together. Build near the mill for faster handling.' }),
    mill: Object.freeze({ name: 'Food mill', cost: COSTS.mill, upgradeCost: 250000, description: 'Turns one tonne of rice into one tonne of food.' }),
    dock: Object.freeze({ name: 'Harbour dock', cost: COSTS.dock, upgradeCost: 200000, description: 'Loads the approved repeating sea route to Singapore.' })
  });
  const PLOTS = Object.freeze(Array.from({ length: 12 }, (_, i) => Object.freeze({
    id: 'p' + (i + 1), name: 'Plot ' + (i + 1), x: i % 4, y: Math.floor(i / 4),
    waterfront: i >= 8, serviced: i % 4 !== 3
  })));
  const STARTER = Object.freeze([
    Object.freeze({ type: 'depot', plot: 'p1' }),
    Object.freeze({ type: 'warehouse', plot: 'p2' }),
    Object.freeze({ type: 'mill', plot: 'p6' }),
    Object.freeze({ type: 'dock', plot: 'p10' })
  ]);
  const STARTER_COST = STARTER.reduce((sum, b) => sum + COSTS[b.type], 0);
  const EXPENSES = ['procurementCost', 'productionCost', 'freightCost', 'buildCost', 'upgradeCost'];
  const TOTAL_KEYS = [...EXPENSES, 'revenue', 'ricePurchased', 'riceProcessed', 'foodProduced', 'localSold', 'exportSold', 'seaDepartures', 'seaArrivals', 'monsoonDelayed'];
  const BUDGET_KEYS = ['procurement', 'production', 'freight'];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
  const plain = object => object !== null && typeof object === 'object' && !Array.isArray(object) && Object.getPrototypeOf(object) === Object.prototype;
  const exactKeys = (object, keys) => plain(object) && Object.keys(object).length === keys.length && keys.every(key => own(object, key));
  const success = extra => Object.assign({ ok: true }, extra);
  const failure = error => ({ ok: false, error });
  const building = (state, type) => state.buildings.find(b => b.type === type);
  const plotById = id => PLOTS.find(p => p.id === id);
  const monsoon = day => day % 30 >= 18 && day % 30 <= 25;
  const weekIndex = day => day === 0 ? 0 : Math.floor((day - 1) / 7);
  const sum = list => list.reduce((a, b) => a + b, 0);

  function create() {
    return {
      schema: 1, day: 0, cash: INITIAL_CASH, speed: 0, pauseReason: 'Ready to build',
      starterApproved: false, buildings: [], inventory: { rice: 0, food: 0 },
      policy: { procurement: true, production: true, delivery: true, cashFloor: 250000,
        productionTarget: 8, stockBuffer: 16,
        weeklyBudget: { procurement: 400000, production: 160000, freight: 80000 } },
      agreements: { local: false, export: false },
      route: { enabled: false, capacity: 12, interval: 7, travelDays: 4, lastDeparture: -7 },
      shipments: [], week: { index: 0, spent: { procurement: 0, production: 0, freight: 0 } },
      totals: Object.fromEntries(TOTAL_KEYS.map(key => [key, 0])),
      ledger: [{ id: 1, day: 0, kind: 'opening', amount: INITIAL_CASH, cashAfter: INITIAL_CASH, qty: 0, ref: '' }],
      events: [{ day: 0, type: 'company', message: 'Monsoon Merchant founded in Port Klang. Approve your district when ready.' }]
    };
  }

  function event(state, type, message) {
    state.events.push({ day: state.day, type, message });
    // Events are a display feed; the complete accounting journal is retained separately.
    if (state.events.length > 120) state.events.shift();
  }

  function record(state, kind, amount, qty = 0, ref = '') {
    state.cash += amount;
    state.ledger.push({ id: state.ledger.length + 1, day: state.day, kind, amount, cashAfter: state.cash, qty, ref });
    const category = { procurement: 'procurementCost', production: 'productionCost', localFreight: 'freightCost',
      seaFreight: 'freightCost', build: 'buildCost', upgrade: 'upgradeCost' }[kind];
    if (category) state.totals[category] -= amount;
    if (kind === 'localSale' || kind === 'exportSale') state.totals.revenue += amount;
    const budget = { procurement: 'procurement', production: 'production', localFreight: 'freight', seaFreight: 'freight' }[kind];
    if (budget) state.week.spent[budget] -= amount;
  }

  function capacities(state) {
    const warehouse = building(state, 'warehouse'), mill = building(state, 'mill'), depot = building(state, 'depot'), dock = building(state, 'dock');
    const storageCapacity = warehouse ? 80 + (warehouse.level - 1) * 40 : 0;
    let handlingCapacity = 0;
    if (warehouse && mill && depot) {
      const a = plotById(warehouse.plot), b = plotById(mill.plot);
      const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      handlingCapacity = Math.max(2, 10 - Math.max(0, distance - 1) * 2 + (depot.level - 1) * 2);
    }
    return {
      storageCapacity, handlingCapacity,
      productionCapacity: mill ? Math.min(8 + (mill.level - 1) * 4, handlingCapacity) : 0,
      procurementCapacity: depot ? 24 + (depot.level - 1) * 8 : 0,
      localCapacity: depot ? Math.min(4 + (depot.level - 1) * 2, handlingCapacity) : 0,
      seaCapacity: dock ? 12 + (dock.level - 1) * 6 : 0
    };
  }

  function status(state) {
    const cap = capacities(state), blockers = [];
    const throughput = {
      productionTarget: state.policy.productionTarget,
      productionDemand: state.policy.production ? Math.min(state.policy.productionTarget, cap.productionCapacity) : 0,
      localDailyCapacity: state.policy.delivery && state.agreements.local ? cap.localCapacity : 0,
      exportDailyCapacity: state.policy.delivery && state.agreements.export && state.route.enabled && cap.seaCapacity
        ? Math.min(state.route.capacity, cap.seaCapacity) / Math.max(state.route.interval, state.route.travelDays) : 0
    };
    throughput.deliveryDailyCapacity = throughput.localDailyCapacity + throughput.exportDailyCapacity;
    for (const type of ['depot', 'warehouse', 'mill']) if (!building(state, type)) blockers.push('Build a ' + BUILDINGS[type].name.toLowerCase());
    if (!state.agreements.local && !state.agreements.export) blockers.push('Approve a buyer agreement');
    if (!state.policy.procurement) blockers.push('Rice procurement is paused');
    if (!state.policy.production) blockers.push('Food production is paused');
    if (!state.policy.delivery) blockers.push('Deliveries are paused');
    if (state.inventory.rice === 0 && building(state, 'mill')) blockers.push('Mill needs rice');
    if (cap.storageCapacity > 0 && state.inventory.rice + state.inventory.food >= cap.storageCapacity) blockers.push('Shared storage is full');
    if (state.agreements.export && !state.route.enabled) blockers.push('Export route is paused');
    if (state.route.enabled && !building(state, 'dock')) blockers.push('Build a harbour dock for exports');
    if (throughput.productionDemand > throughput.deliveryDailyCapacity) blockers.push('Delivery capacity limits production');
    for (const key of BUDGET_KEYS) if (state.week.spent[key] >= state.policy.weeklyBudget[key]) blockers.push(key[0].toUpperCase() + key.slice(1) + ' weekly budget reached');
    const critical = state.cash <= state.policy.cashFloor || state.pauseReason.startsWith('Cash floor:');
    if (critical) blockers.push('Cash floor needs attention');
    const arrivals = state.shipments.filter(s => s.status === 'inTransit').map(s => s.arrivalDay);
    const nextWeek = (state.week.index + 1) * 7 + 1;
    return Object.assign(cap, {
      day: state.day, season: monsoon(state.day) ? 'Monsoon' : 'Dry season', critical, blockers, throughput,
      storageUsed: state.inventory.rice + state.inventory.food,
      nextEventDay: Math.min(nextWeek, ...arrivals, arrivals.length ? Infinity : state.day + 1),
      service: Object.fromEntries(PLOTS.map(p => [p.id, p.serviced])),
      canRun: state.day < MAX_DAY
    });
  }

  function finance(state) {
    const expenses = sum(EXPENSES.map(key => state.totals[key]));
    const operatingCosts = state.totals.procurementCost + state.totals.productionCost + state.totals.freightCost;
    const activeShipments = state.shipments.filter(s => s.status === 'inTransit');
    const inTransit = sum(activeShipments.map(s => s.qty));
    const inventoryValue = state.inventory.rice * PRICES.rice +
      (state.inventory.food + inTransit) * (PRICES.rice + PRICES.production) +
      sum(activeShipments.map(s => s.freight));
    const capitalInvestment = state.totals.buildCost + state.totals.upgradeCost;
    const soldGoodsCost = (state.totals.localSold + state.totals.exportSold) * (PRICES.rice + PRICES.production);
    const completedFreightCost = state.totals.localSold * PRICES.localFreight +
      sum(state.shipments.filter(s => s.status === 'delivered').map(s => s.freight));
    return {
      cash: state.cash, revenue: state.totals.revenue, expenses, capitalInvestment, inventoryValue,
      netCashChange: state.cash - INITIAL_CASH,
      operatingCashFlow: state.totals.revenue - operatingCosts,
      operatingProfit: state.totals.revenue - soldGoodsCost - completedFreightCost,
      soldGoodsCost, completedFreightCost,
      netWorth: state.cash + capitalInvestment + inventoryValue,
      weeklySpent: Object.assign({}, state.week.spent), weeklyBudget: Object.assign({}, state.policy.weeklyBudget)
    };
  }

  function canPlace(state, type, plot) {
    if (typeof type !== 'string' || !own(COSTS, type)) return 'Choose a valid building';
    const location = plotById(plot);
    if (!location) return 'Choose a valid plot';
    if (!location.serviced) return 'This plot has no road or utility service';
    if (type === 'dock' && !location.waterfront) return 'The harbour dock needs a waterfront plot';
    if (type !== 'dock' && location.waterfront) return 'Waterfront plots are reserved for the harbour dock';
    if (building(state, type)) return 'This district already has a ' + BUILDINGS[type].name.toLowerCase();
    if (state.buildings.some(b => b.plot === plot)) return 'This plot is occupied';
    if (state.cash - COSTS[type] < state.policy.cashFloor) return 'This purchase would breach your cash floor';
    return '';
  }

  function place(state, type, plot) {
    const error = canPlace(state, type, plot);
    if (error) return failure(error);
    state.buildings.push({ id: type, type, plot, level: 1 });
    record(state, 'build', -COSTS[type], 1, type);
    event(state, 'construction', BUILDINGS[type].name + ' opened on ' + plotById(plot).name + '.');
    return success();
  }

  function approveStarter(state) {
    if (state.starterApproved) return failure('The starter district is already approved');
    if (state.buildings.length) return failure('The starter proposal requires an empty district; continue your custom build');
    if (state.cash - STARTER_COST < state.policy.cashFloor) return failure('The starter proposal would breach your cash floor');
    for (const item of STARTER) place(state, item.type, item.plot);
    state.agreements.local = true;
    state.agreements.export = true;
    state.route.enabled = true;
    state.starterApproved = true;
    state.pauseReason = state.speed === 0 ? 'Starter approved — ready to run' : '';
    event(state, 'approval', 'Starter district, local buyer, export buyer and repeating sea route approved.');
    return success();
  }

  function setPolicy(state, patch) {
    const keys = ['procurement', 'production', 'delivery', 'cashFloor', 'productionTarget', 'stockBuffer', 'weeklyBudget'];
    if (!plain(patch) || !Object.keys(patch).length || Object.keys(patch).some(key => !keys.includes(key))) return failure('Unknown policy setting');
    for (const key of ['procurement', 'production', 'delivery']) if (own(patch, key) && typeof patch[key] !== 'boolean') return failure('Automation switches must be on or off');
    if (own(patch, 'cashFloor') && !integer(patch.cashFloor, 0, 1000000000)) return failure('Cash floor must be whole cents between 0 and RM10,000,000');
    if (own(patch, 'productionTarget') && !integer(patch.productionTarget, 0, 100)) return failure('Production target must be 0–100 tonnes per day');
    if (own(patch, 'stockBuffer') && !integer(patch.stockBuffer, 0, 160)) return failure('Stock buffer must be 0–160 tonnes');
    if (own(patch, 'weeklyBudget')) {
      if (!plain(patch.weeklyBudget) || !Object.keys(patch.weeklyBudget).length ||
        Object.keys(patch.weeklyBudget).some(key => !BUDGET_KEYS.includes(key) || !integer(patch.weeklyBudget[key], 0, 100000000))) return failure('Weekly budgets must be whole cents between 0 and RM1,000,000');
    }
    const next = Object.assign({}, state.policy, patch, { weeklyBudget: Object.assign({}, state.policy.weeklyBudget, patch.weeklyBudget || {}) });
    // Already-spent money cannot be removed from this week's authorization.
    if (BUDGET_KEYS.some(key => next.weeklyBudget[key] < state.week.spent[key])) return failure('A weekly budget cannot be lower than the amount already spent this week');
    state.policy = next;
    event(state, 'policy', 'Operating policy updated.');
    if (state.cash <= state.policy.cashFloor && state.speed !== 0) pauseForCash(state);
    return success();
  }

  function setAgreement(state, buyer, enabled) {
    if (!['local', 'export'].includes(buyer) || typeof enabled !== 'boolean') return failure('Choose a valid buyer and agreement setting');
    state.agreements[buyer] = enabled;
    event(state, 'agreement', (buyer === 'local' ? 'Local' : 'Export') + ' buyer agreement ' + (enabled ? 'approved.' : 'paused.'));
    return success();
  }

  function setRoute(state, patch) {
    const keys = ['enabled', 'capacity', 'interval'];
    if (!plain(patch) || !Object.keys(patch).length || Object.keys(patch).some(key => !keys.includes(key))) return failure('Unknown route setting');
    if (own(patch, 'enabled') && typeof patch.enabled !== 'boolean') return failure('Route must be enabled or paused');
    if (own(patch, 'capacity') && !integer(patch.capacity, 1, 24)) return failure('Route load must be 1–24 tonnes');
    if (own(patch, 'interval') && !integer(patch.interval, 4, 30)) return failure('Departure interval must be 4–30 days');
    if (own(patch, 'capacity') && building(state, 'dock') && patch.capacity > capacities(state).seaCapacity) return failure('Upgrade the dock before increasing its load');
    state.route = Object.assign({}, state.route, patch);
    event(state, 'route', 'Repeating Port Klang–Singapore route updated.');
    return success();
  }

  function upgrade(state, type) {
    if (typeof type !== 'string' || !own(BUILDINGS, type)) return failure('Choose a valid building');
    const item = building(state, type);
    if (!item) return failure('Build this facility before upgrading it');
    if (item.level >= 3) return failure('This facility is already at maximum level');
    const cost = BUILDINGS[type].upgradeCost * item.level;
    if (state.cash - cost < state.policy.cashFloor) return failure('This upgrade would breach your cash floor');
    record(state, 'upgrade', -cost, item.level, type);
    item.level += 1;
    event(state, 'upgrade', BUILDINGS[type].name + ' upgraded to level ' + item.level + '.');
    return success();
  }

  function setSpeed(state, speed) {
    if (![0, 1, 2, 4].includes(speed)) return failure('Choose Pause, Normal, Fast or Very Fast');
    if (speed && state.day >= MAX_DAY) return failure('This company has reached the supported 100-year calendar limit');
    if (speed && state.cash <= state.policy.cashFloor) return failure('Adjust your cash floor before resuming');
    state.speed = speed;
    state.pauseReason = speed === 0 ? 'Paused by you' : '';
    return success();
  }

  function pauseForCash(state) {
    state.speed = 0;
    state.pauseReason = 'Cash floor: automatic spending stopped. Review cash and operating policy.';
    event(state, 'attention', state.pauseReason);
  }

  function affordable(state, category, price) {
    return Math.max(0, Math.min(
      Math.floor((state.cash - state.policy.cashFloor) / price),
      Math.floor((state.policy.weeklyBudget[category] - state.week.spent[category]) / price)
    ));
  }

  function dayStep(state, options = {}) {
    const operating = options.operations !== false;
    state.day += 1;
    if (state.week.index !== weekIndex(state.day)) {
      state.week = { index: weekIndex(state.day), spent: { procurement: 0, production: 0, freight: 0 } };
      event(state, 'budget', 'A new operating week has started; approved budgets renewed.');
    }
    if (state.day % 30 === 18) event(state, 'weather', 'Monsoon conditions: sea departures take three extra days.');
    if (state.day % 30 === 26) event(state, 'weather', 'Dry conditions return to the strait.');
    for (const shipment of state.shipments) {
      if (shipment.status === 'inTransit' && shipment.arrivalDay <= state.day) {
        record(state, 'exportSale', shipment.revenue, shipment.qty, shipment.id);
        shipment.status = 'delivered';
        shipment.settledDay = state.day;
        state.totals.exportSold += shipment.qty;
        state.totals.seaArrivals += 1;
        event(state, 'arrival', shipment.qty + 't food delivered to Singapore; export payment received.');
      }
    }
    const cap = capacities(state);
    let cheapestBlockedCost = Infinity;
    const checkCash = (wanted, category, price) => {
      if (wanted > 0 && state.policy.weeklyBudget[category] - state.week.spent[category] >= price &&
        state.cash - state.policy.cashFloor < price) cheapestBlockedCost = Math.min(cheapestBlockedCost, price);
    };

    if (operating && state.policy.procurement && cap.procurementCapacity && cap.storageCapacity) {
      const free = cap.storageCapacity - state.inventory.rice - state.inventory.food;
      const wanted = Math.max(0, Math.min(cap.procurementCapacity, free, state.policy.stockBuffer + state.policy.productionTarget - state.inventory.rice));
      const qty = Math.min(wanted, affordable(state, 'procurement', PRICES.rice));
      checkCash(wanted, 'procurement', PRICES.rice);
      if (qty) {
        record(state, 'procurement', -qty * PRICES.rice, qty);
        state.inventory.rice += qty;
        state.totals.ricePurchased += qty;
      }
    }
    if (operating && state.policy.production && cap.productionCapacity) {
      const desiredFood = state.policy.stockBuffer + (state.route.enabled && state.agreements.export ? state.route.capacity : cap.localCapacity);
      const wanted = Math.max(0, Math.min(state.policy.productionTarget, cap.productionCapacity, state.inventory.rice, desiredFood - state.inventory.food));
      const qty = Math.min(wanted, affordable(state, 'production', PRICES.production));
      checkCash(wanted, 'production', PRICES.production);
      if (qty) {
        record(state, 'production', -qty * PRICES.production, qty);
        state.inventory.rice -= qty;
        state.inventory.food += qty;
        state.totals.riceProcessed += qty;
        state.totals.foodProduced += qty;
      }
    }
    if (operating && state.policy.delivery && state.agreements.local && cap.localCapacity) {
      const wanted = Math.min(state.inventory.food, cap.localCapacity);
      const qty = Math.min(wanted, affordable(state, 'freight', PRICES.localFreight));
      checkCash(wanted, 'freight', PRICES.localFreight);
      if (qty) {
        record(state, 'localFreight', -qty * PRICES.localFreight, qty);
        record(state, 'localSale', qty * PRICES.local, qty);
        state.inventory.food -= qty;
        state.totals.localSold += qty;
      }
    }
    if (operating && state.policy.delivery && state.agreements.export && state.route.enabled && cap.seaCapacity &&
      !state.shipments.some(s => s.status === 'inTransit') && state.day - state.route.lastDeparture >= state.route.interval) {
      const qty = Math.min(state.route.capacity, cap.seaCapacity);
      if (state.inventory.food >= qty) {
        const freight = qty * PRICES.seaFreight;
        checkCash(qty, 'freight', freight);
        if (affordable(state, 'freight', freight) >= 1) {
          const id = 'sea-' + (state.shipments.length + 1), delay = monsoon(state.day) ? 3 : 0;
          record(state, 'seaFreight', -freight, qty, id);
          state.inventory.food -= qty;
          state.shipments.push({ id, qty, departDay: state.day, arrivalDay: state.day + state.route.travelDays + delay,
            revenue: qty * PRICES.export, freight, delay, status: 'inTransit', settledDay: null });
          state.route.lastDeparture = state.day;
          state.totals.seaDepartures += 1;
          if (delay) state.totals.monsoonDelayed += 1;
          event(state, 'departure', qty + 't food departed for Singapore' + (delay ? '; monsoon adds three days.' : '.'));
        }
      }
    }
    // Finish all safe daily receipts before deciding whether intervention is needed.
    if (operating && (state.cash <= state.policy.cashFloor || (cheapestBlockedCost !== Infinity && state.cash - state.policy.cashFloor < cheapestBlockedCost))) pauseForCash(state);
    if (state.day >= MAX_DAY) {
      state.speed = 0;
      state.pauseReason = '100-year calendar limit reached';
    }
  }

  function advance(state, days = 1) {
    if (!integer(days, 1, 365)) return failure('Advance must be between 1 and 365 whole days');
    if (!state.speed) return success({ days: 0 });
    let elapsed = 0;
    while (elapsed < days && state.speed && state.day < MAX_DAY) {
      dayStep(state);
      elapsed += 1;
    }
    return success({ days: elapsed });
  }

  function waitForArrival(state) {
    const arrivals = state.shipments.filter(shipment => shipment.status === 'inTransit').map(shipment => shipment.arrivalDay);
    if (!arrivals.length) return failure('There is no paid shipment at sea to wait for');
    const target = Math.min(...arrivals);
    if (target > MAX_DAY) return failure('This arrival is beyond the supported 100-year calendar');
    const elapsed = target - state.day;
    state.speed = 0;
    while (state.day < target) dayStep(state, { operations: false });
    state.pauseReason = 'Shipment payment received — paused for your review';
    event(state, 'wait', 'Waited ' + elapsed + ' day' + (elapsed === 1 ? '' : 's') + ' for paid cargo. All new spending and dispatches were held.');
    return success({ days: elapsed });
  }

  function assert(condition, message) {
    if (!condition) throw new Error('Invalid builder save: ' + message);
  }

  function validateOrThrow(state) {
    assert(exactKeys(state, ['schema', 'day', 'cash', 'speed', 'pauseReason', 'starterApproved', 'buildings', 'inventory', 'policy', 'agreements', 'route', 'shipments', 'week', 'totals', 'ledger', 'events']), 'unexpected company fields');
    assert(state.schema === 1 && integer(state.day, 0, MAX_DAY) && integer(state.cash) && [0, 1, 2, 4].includes(state.speed), 'company values');
    assert(typeof state.pauseReason === 'string' && state.pauseReason.length <= 200 && typeof state.starterApproved === 'boolean', 'company flags');
    assert(Array.isArray(state.buildings) && state.buildings.length <= 4, 'buildings');
    const usedTypes = new Set(), usedPlots = new Set();
    let buildCost = 0, upgradeCost = 0;
    for (const b of state.buildings) {
      assert(exactKeys(b, ['id', 'type', 'plot', 'level']) && typeof b.type === 'string' && own(BUILDINGS, b.type) && b.id === b.type && integer(b.level, 1, 3), 'building values');
      const plot = plotById(b.plot);
      assert(plot && plot.serviced && plot.waterfront === (b.type === 'dock') && !usedTypes.has(b.type) && !usedPlots.has(b.plot), 'building placement');
      usedTypes.add(b.type); usedPlots.add(b.plot);
      buildCost += COSTS[b.type];
      upgradeCost += BUILDINGS[b.type].upgradeCost * (b.level === 3 ? 3 : b.level - 1);
    }
    assert(!state.starterApproved || STARTER.every(b => state.buildings.some(actual => actual.type === b.type && actual.plot === b.plot)), 'starter district');
    assert(exactKeys(state.inventory, ['rice', 'food']) && integer(state.inventory.rice) && integer(state.inventory.food), 'inventory');
    assert(state.inventory.rice + state.inventory.food <= capacities(state).storageCapacity, 'shared storage capacity');
    assert(exactKeys(state.policy, ['procurement', 'production', 'delivery', 'cashFloor', 'productionTarget', 'stockBuffer', 'weeklyBudget']), 'policy fields');
    for (const key of ['procurement', 'production', 'delivery']) assert(typeof state.policy[key] === 'boolean', 'automation switch');
    assert(integer(state.policy.cashFloor, 0, 1000000000) && integer(state.policy.productionTarget, 0, 100) && integer(state.policy.stockBuffer, 0, 160), 'policy values');
    assert(exactKeys(state.policy.weeklyBudget, BUDGET_KEYS) && BUDGET_KEYS.every(key => integer(state.policy.weeklyBudget[key], 0, 100000000)), 'weekly budget');
    assert(exactKeys(state.agreements, ['local', 'export']) && typeof state.agreements.local === 'boolean' && typeof state.agreements.export === 'boolean', 'buyer agreements');
    assert(exactKeys(state.route, ['enabled', 'capacity', 'interval', 'travelDays', 'lastDeparture']) &&
      typeof state.route.enabled === 'boolean' && integer(state.route.capacity, 1, 24) && integer(state.route.interval, 4, 30) &&
      state.route.travelDays === 4 && integer(state.route.lastDeparture, -7, state.day), 'route');
    assert(exactKeys(state.week, ['index', 'spent']) && state.week.index === weekIndex(state.day) && exactKeys(state.week.spent, BUDGET_KEYS) &&
      BUDGET_KEYS.every(key => integer(state.week.spent[key]) && state.week.spent[key] <= state.policy.weeklyBudget[key]), 'weekly spending');
    assert(exactKeys(state.totals, TOTAL_KEYS) && TOTAL_KEYS.every(key => integer(state.totals[key])), 'totals');
    assert(state.totals.buildCost === buildCost && state.totals.upgradeCost === upgradeCost, 'capital expenses');
    assert(Array.isArray(state.shipments) && state.shipments.length <= Math.floor(state.day / 4) + 1, 'shipments');
    let departed = 0, delivered = 0, exportSold = 0, inTransit = 0, delayed = 0, lastDeparture = -7, previousArrival = 0;
    const shipmentById = new Map();
    for (const shipment of state.shipments) {
      assert(exactKeys(shipment, ['id', 'qty', 'departDay', 'arrivalDay', 'revenue', 'freight', 'delay', 'status', 'settledDay']), 'shipment fields');
      assert(shipment.id === 'sea-' + (departed + 1) && integer(shipment.qty, 1, 24) &&
        integer(shipment.departDay, 1, state.day) && shipment.departDay >= lastDeparture + 4 && shipment.departDay >= previousArrival &&
        shipment.delay === (monsoon(shipment.departDay) ? 3 : 0) &&
        shipment.arrivalDay === shipment.departDay + 4 + shipment.delay &&
        shipment.revenue === shipment.qty * PRICES.export && shipment.freight === shipment.qty * PRICES.seaFreight, 'shipment values');
      assert(shipment.status === 'inTransit' || shipment.status === 'delivered', 'shipment status');
      if (shipment.status === 'inTransit') {
        assert(shipment.arrivalDay > state.day && shipment.settledDay === null, 'unsettled shipment');
        inTransit += shipment.qty;
      } else {
        assert(shipment.settledDay === shipment.arrivalDay && shipment.settledDay <= state.day, 'arrival settlement');
        delivered += 1; exportSold += shipment.qty;
      }
      shipmentById.set(shipment.id, shipment);
      departed += 1; delayed += shipment.delay ? 1 : 0; lastDeparture = shipment.departDay; previousArrival = shipment.arrivalDay;
    }
    assert(state.shipments.filter(s => s.status === 'inTransit').length <= 1 && (!departed || usedTypes.has('dock')), 'vessel allocation');
    assert(state.route.lastDeparture === lastDeparture && state.totals.seaDepartures === departed && state.totals.seaArrivals === delivered &&
      state.totals.monsoonDelayed === delayed && state.totals.exportSold === exportSold, 'route totals');
    assert(state.totals.ricePurchased - state.totals.riceProcessed === state.inventory.rice &&
      state.totals.riceProcessed === state.totals.foodProduced &&
      state.totals.foodProduced === state.inventory.food + state.totals.localSold + exportSold + inTransit, 'goods conservation');
    assert(Array.isArray(state.ledger) && state.ledger.length > 0 && state.ledger.length <= 250000, 'ledger');
    let balance = 0, previousDay = 0, journalRice = 0, journalFood = 0;
    const calculated = Object.fromEntries(TOTAL_KEYS.map(key => [key, 0]));
    const spent = { procurement: 0, production: 0, freight: 0 }, built = new Set(), levels = {};
    const departures = new Set(), arrivals = new Set();
    for (let i = 0; i < state.ledger.length; i += 1) {
      const entry = state.ledger[i];
      assert(exactKeys(entry, ['id', 'day', 'kind', 'amount', 'cashAfter', 'qty', 'ref']) && entry.id === i + 1 &&
        integer(entry.day, previousDay, state.day) && integer(entry.qty) && typeof entry.ref === 'string' &&
        entry.ref.length <= 30 && Number.isSafeInteger(entry.amount) && integer(entry.cashAfter), 'ledger entry');
      if (i === 0) assert(entry.kind === 'opening' && entry.amount === INITIAL_CASH && entry.qty === 0 && entry.day === 0 && entry.ref === '', 'opening balance');
      else {
        const prices = { procurement: -PRICES.rice, production: -PRICES.production, localFreight: -PRICES.localFreight,
          localSale: PRICES.local, seaFreight: -PRICES.seaFreight, exportSale: PRICES.export };
        assert(own(prices, entry.kind) || entry.kind === 'build' || entry.kind === 'upgrade', 'ledger category');
        if (own(prices, entry.kind)) assert(entry.qty > 0 && entry.amount === entry.qty * prices[entry.kind] && entry.day > 0, 'transaction price');
        if (entry.kind === 'build') {
          assert(own(COSTS, entry.ref) && entry.qty === 1 && entry.amount === -COSTS[entry.ref] && !built.has(entry.ref), 'construction transaction');
          built.add(entry.ref); levels[entry.ref] = 1; calculated.buildCost -= entry.amount;
        }
        if (entry.kind === 'upgrade') {
          assert(own(BUILDINGS, entry.ref) && built.has(entry.ref) && levels[entry.ref] === entry.qty && entry.qty < 3 &&
            entry.amount === -BUILDINGS[entry.ref].upgradeCost * entry.qty, 'upgrade transaction');
          levels[entry.ref] += 1; calculated.upgradeCost -= entry.amount;
        }
        if (entry.kind === 'procurement') {
          assert(built.has('depot') && built.has('warehouse'), 'procurement facilities');
          calculated.procurementCost -= entry.amount; calculated.ricePurchased += entry.qty; journalRice += entry.qty;
        }
        if (entry.kind === 'production') {
          assert(built.has('depot') && built.has('warehouse') && built.has('mill'), 'production facilities');
          calculated.productionCost -= entry.amount; calculated.riceProcessed += entry.qty; calculated.foodProduced += entry.qty;
          journalRice -= entry.qty; journalFood += entry.qty;
        }
        if (entry.kind === 'localFreight' || entry.kind === 'seaFreight') calculated.freightCost -= entry.amount;
        if (entry.kind === 'localSale') { calculated.revenue += entry.amount; calculated.localSold += entry.qty; journalFood -= entry.qty; }
        if (entry.kind === 'seaFreight' || entry.kind === 'exportSale') {
          const shipment = shipmentById.get(entry.ref);
          assert(shipment && shipment.qty === entry.qty, 'shipment transaction');
          if (entry.kind === 'seaFreight') {
            assert(entry.day === shipment.departDay && !departures.has(entry.ref), 'departure transaction');
            departures.add(entry.ref); journalFood -= entry.qty;
          } else {
            assert(shipment.status === 'delivered' && entry.day === shipment.settledDay && !arrivals.has(entry.ref), 'export settlement transaction');
            arrivals.add(entry.ref); calculated.revenue += entry.amount; calculated.exportSold += entry.qty;
          }
        } else if (entry.kind !== 'build' && entry.kind !== 'upgrade') assert(entry.ref === '', 'transaction reference');
        const category = { procurement: 'procurement', production: 'production', localFreight: 'freight', seaFreight: 'freight' }[entry.kind];
        if (category && weekIndex(entry.day) === state.week.index) spent[category] -= entry.amount;
      }
      const journalCapacity = levels.warehouse ? 80 + (levels.warehouse - 1) * 40 : 0;
      assert(integer(journalRice) && integer(journalFood) && journalRice + journalFood <= journalCapacity, 'journal goods conservation');
      balance += entry.amount;
      assert(integer(balance) && balance === entry.cashAfter, 'journal balance');
      previousDay = entry.day;
    }
    calculated.seaDepartures = departed; calculated.seaArrivals = delivered; calculated.monsoonDelayed = delayed;
    assert(balance === state.cash && TOTAL_KEYS.every(key => calculated[key] === state.totals[key]), 'journal totals');
    assert(BUDGET_KEYS.every(key => spent[key] === state.week.spent[key]), 'weekly journal totals');
    assert(state.buildings.every(b => built.has(b.type) && levels[b.type] === b.level) && built.size === state.buildings.length, 'building journal');
    assert(departures.size === departed && arrivals.size === delivered, 'shipment journal');
    const localFreight = sum(state.ledger.filter(e => e.kind === 'localFreight').map(e => e.qty));
    assert(localFreight === state.totals.localSold, 'local deliveries');
    assert(Array.isArray(state.events) && state.events.length <= 120 && state.events.every(e =>
      exactKeys(e, ['day', 'type', 'message']) && integer(e.day, 0, state.day) && typeof e.type === 'string' &&
      e.type.length <= 30 && typeof e.message === 'string' && e.message.length <= 300), 'event feed');
  }

  function validate(state) {
    try { validateOrThrow(state); return success(); }
    catch (error) { return failure(error.message); }
  }

  function serialize(state) {
    validateOrThrow(state);
    return JSON.stringify(state);
  }

  function deserialize(text) {
    if (typeof text !== 'string' || text.length > 50000000) throw new Error('Invalid builder save: expected a company backup under 50 MB');
    let state;
    try { state = JSON.parse(text); }
    catch (_) { throw new Error('Invalid builder save: unreadable JSON'); }
    validateOrThrow(state);
    state.speed = 0;
    if (!state.pauseReason.startsWith('Cash floor:')) state.pauseReason = 'Loaded paused — resume when ready';
    return state;
  }

  return Object.freeze({ create, place, approveStarter, setPolicy, setAgreement, setRoute, upgrade, advance, waitForArrival, setSpeed,
    serialize, deserialize, validate, status, finance, INITIAL_CASH, COSTS, PRICES, BUILDINGS, PLOTS, STARTER, STARTER_COST });
});
