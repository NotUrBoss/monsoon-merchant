/* Monsoon Merchant — unified captain, factory, freight and finance workspaces. */
(function () {
  'use strict';
  const KEY = 'mm.company.v3';
  const PREVIOUS_KEY = 'mm.company.v2';
  const LEGACY_KEY = 'mm.network.v1'; // Read-only migration source; never overwrite an old company.
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => 'RM ' + Math.round(n).toLocaleString('en-US');
  const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's');
  const whole = value => /^\d+$/.test(String(value)) ? Number(value) : NaN;
  const transportIcon = id => ({ sea: '⛴', air: '✈', rail: '🚆' }[id]);
  const disabled = reason => reason ? ' disabled aria-describedby="network-reason"' : '';
  let previousClose = null;

  function open(options) {
    if (previousClose) previousClose();
    const N = window.MMNetwork, A = window.MMCompanyActions, app = options.root;
    const mount = app.querySelector('#screen') || app;
    const ids = Object.keys(N.HUBS), goods = Object.keys(N.GOODS), recipes = Object.keys(N.RECIPES);
    let state = null, saved = null, unreadable = false, saveWarning = '', disposed = false;
    let notice = '', badNotice = false, rendering = false;
    const ui = { route:null, report:null, effects:true, foodChain:false, view: 'lobby', tab: 'world', hub: 'klang', good: 'palm', qty: '20', side: 'buy', to: ids.find(id => id !== 'klang'), mode: 'sea', recipe: recipes[0], batches: '1', backup: false, confirm: false, importText: '', sailTo:'singapore', direction:'load', amount:'10000' };
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(PREVIOUS_KEY) || localStorage.getItem(LEGACY_KEY);
      if (raw) {
        const loaded = N.deserialize(raw);
        if (loaded.ok) saved = loaded.state;
        else unreadable = true;
      }
    } catch (error) { saveWarning = 'Device storage is unavailable. Keep this tab open and copy a company backup after playing.'; }
    app.classList.add('network-mode');
    mount.inert = false;
    const hubName = id => N.HUBS[id].name;
    const goodName = id => N.GOODS[id].name;
    const active = () => state && state.status === 'active';
    const dailyCost = () => N.dailyUpkeep(state);
    const btn = (label, action, cls, attrs) => '<button class="btn ' + (cls || '') + '" data-n="' + action + '"' + (attrs || '') + '>' + label + '</button>';
    const select = (id, label, value, entries) => {
      const option = ([key, text]) => '<option value="' + esc(key) + '"' + (key === value ? ' selected' : '') + '>' + esc(text) + '</option>';
      let content = entries.map(option).join('');
      if (id === 'hub' || id === 'to') content = [...new Set(entries.map(([key]) => N.HUBS[key].region))].map(region => '<optgroup label="' + esc(region) + '">' + entries.filter(([key]) => N.HUBS[key].region === region).map(option).join('') + '</optgroup>').join('');
      return '<label class="net-field" for="net-' + id + '"><span>' + label + '</span><select id="net-' + id + '" data-field="' + id + '">' + content + '</select></label>';
    };
    const input = (id, label, value) => '<label class="net-field" for="net-' + id + '"><span>' + label + '</span><input id="net-' + id + '" data-field="' + id + '" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="' + esc(value) + '"></label>';
    const fact = (name, value) => '<div><dt>' + name + '</dt><dd>' + value + '</dd></div>';
    const productList = values => Object.entries(values).map(([id, q]) => q + ' t ' + goodName(id)).join(' + ');
    const Play = window.MMCompanyPlay.create({N,A,money,esc,btn,select,input,productList});
    function normalizeDestination() {
      if (!N.HUBS[ui.to] || ui.to === ui.hub) ui.to = ids.find(id => id !== ui.hub);
    }
    function message(text, bad) { notice = text; badNotice = !!bad; }
    function save() {
      if (!state) return true;
      try {
        localStorage.setItem(KEY, N.serialize(state));
        saveWarning = ''; saved = state; unreadable = false; return true;
      } catch (error) {
        saveWarning = 'Your latest company progress could not be saved. Keep this tab open and copy the backup below before leaving.';
        ui.backup = true; return false;
      }
    }
    function apply(result, success) {
      if (!result.ok) { message(result.error || 'That action is unavailable.', true); render(true); return; }
      message(result.finished ? 'Day 60 reached. Your company season is complete. Final company value: ' + money(state.result.netWorth) + '.' : success || (result.events || []).join(' ') || 'Company updated.');
      save(); render(!result.finished);
    }
    function lobby() {
      return '<div class="net-intro"><span class="net-kicker">The unified campaign</span><h1 tabindex="-1">Monsoon Company</h1><p class="net-lead">Captain. Manufacture. Deliver.</p><p>Captain your own ship while your factories and sea, air and rail freight keep working. Every workspace uses one company balance, one inventory network and one clock.</p>' +
        '<ol class="net-steps"><li><b>Trade locally</b><span>Begin with ' + money(500000) + ' cash, a Klang warehouse and your starter coaster. Prices include a buy/sell spread.</span></li><li><b>Build your network</b><span>Source inputs, manufacture finished goods, then deliver with your own ship or up to 3 chartered shipments at once.</span></li><li><b>Make every day count</b><span>Advance the shared day, fulfil delivery orders and keep a cash reserve for upkeep and any debt interest.</span></li></ol>' +
        '<p class="net-note"><b>Time moves only when you advance a day.</b> Trading, building and dispatching do not move the clock. One 60-day company campaign. Previous Network Company saves are upgraded without erasing their originals. Classic seasons, Daily Voyage and Legacy remain available as archived challenges.</p>' +
        (unreadable ? '<p class="net-warning">The saved company could not be read. It has been kept on this device. Restore a company backup below, or explicitly replace it with a new company.</p>' : '') +
        (saved ? btn('Continue company · Day ' + saved.day + '/60', 'continue', 'primary big') : '') +
        (ui.confirm ? '<div class="net-warning"><p>Replace the saved company? Its warehouses, cargo and progress will be lost. Classic and Daily saves are unaffected.</p><div class="row-actions">' + btn('Keep existing company', 'cancel-new') + btn('Replace company', 'start', 'danger') + '</div></div>' : btn(saved || unreadable ? 'Start a new company' : 'Start company · ' + money(500000), 'new', saved ? 'ghost' : 'primary big')) +
        '<button class="net-text-button" data-n="backup">Restore a company backup</button></div>';
    }
    function summary() {
      const result = state.result;
      return '<section class="net-intro net-finale"><span class="net-kicker">Day 60 · season complete</span><h1 tabindex="-1">' + esc(result.rank) + '</h1><p class="net-lead">' + money(result.netWorth) + '</p><p>Company value after liabilities, including cargo at local sale prices and the resale value of facilities and your ship. ' + (result.profit >= 0 ? 'You gained ' : 'You lost ') + money(Math.abs(result.profit)) + ' against your opening company value.</p><dl class="net-stats">' + fact('Chartered shipments completed', result.shipments) + fact('Captain voyages', state.captain?.voyages || 0) + fact('Orders fulfilled', Object.values(state.captain?.orders || {}).filter(x=>x==='fulfilled').length) + fact('Manufactured', result.produced + ' t') + fact('Upkeep paid or accrued', money(state.stats.upkeep)) + fact('Outstanding debt', money(state.debt || 0)) + '</dl><p class="net-note">Review the operations log below or start another company from the title. Company objectives and valuation are independent of archived classic Legacy rewards.</p>' + btn('Company title', 'lobby', 'primary') + '</section>';
    }
    function warehouse() {
      const w = state.warehouses[ui.hub], usage = N.warehouseUsage(state, ui.hub);
      if (!w) return '<section class="net-card"><h2>Open a warehouse</h2><p>Receive shipments and trade remotely in ' + esc(hubName(ui.hub)) + '.</p><dl class="facts">' + fact('Capacity', '160 t') + fact('One-time cost', money(N.COSTS.warehouse)) + fact('Daily upkeep', money(N.COSTS.warehouseUpkeep)) + '</dl>' + btn('Build warehouse · ' + money(N.COSTS.warehouse), 'build-warehouse', 'primary', state.cash < N.COSTS.warehouse ? ' disabled' : '') + (state.cash < N.COSTS.warehouse ? '<p class="net-note">Not enough cash to build this warehouse.</p>' : '') + '</section>';
      return '<section class="net-card net-storage"><div class="net-card-head"><h2>' + esc(hubName(ui.hub)) + ' warehouse</h2><span class="net-badge">Level ' + w.level + '</span></div><dl class="facts">' + fact('On hand', usage.stock + ' t') + fact('Incoming, captain &amp; production reserved', usage.reserved + ' t') + fact('Free capacity', '<b>' + usage.free + ' / ' + usage.capacity + ' t</b>') + fact('Daily upkeep', money(N.COSTS.warehouseUpkeep)) + '</dl>' + (w.level < N.warehouseMaxLevel(state) ? btn('Expand +120 t · ' + money(N.COSTS.warehouseUpgrade), 'upgrade-warehouse', '', state.cash < N.COSTS.warehouseUpgrade ? ' disabled' : '') + (state.cash < N.COSTS.warehouseUpgrade ? '<p class="net-note">Not enough cash to expand.</p>' : '') : '<p class="net-note">Maximum warehouse capacity.</p>') + '</section>';
    }
    function tradePanel() {
      if (!state.warehouses[ui.hub]) return '';
      const q = whole(ui.qty), quote = N.quoteTrade(state, ui.hub, ui.good, q, ui.side);
      const stock = state.warehouses[ui.hub].stock[ui.good] || 0;
      const price = N.prices(state, ui.hub)[ui.good];
      return '<section class="net-card"><h2>Trade at ' + esc(hubName(ui.hub)) + '</h2><div class="net-form">' + select('good', 'Product', ui.good, goods.map(id => [id, goodName(id)])) + select('side', 'Action', ui.side, [['buy', 'Buy into warehouse'], ['sell', 'Sell warehouse stock']]) + input('qty', 'Quantity (whole tonnes)', ui.qty) + '</div><p class="net-note">On hand: ' + stock + ' t · Local supply today: ' + price.available + ' t</p><dl class="facts">' + fact('Price per tonne', money(price[ui.side])) + fact(ui.side === 'buy' ? 'Purchase cost' : 'Sale proceeds', quote.ok ? '<b>' + money(quote.cost) + '</b>' : '—') + '</dl><p id="network-reason" class="' + (quote.ok ? 'net-note' : 'net-warning') + '">' + (quote.ok ? (ui.side === 'sell' && state.debt ? 'Proceeds repay outstanding company debt first.' : 'Trades do not advance the day. Daily local supply is limited.') : esc(quote.error)) + '</p>' + btn((ui.side === 'buy' ? 'Buy ' : 'Sell ') + (Number.isFinite(q) ? q : 0) + ' t', 'trade', 'primary', disabled(!quote.ok)) + '</section>';
    }
    function pricesPanel() {
      const prices = N.prices(state, ui.hub), stock = state.warehouses[ui.hub]?.stock || {};
      return '<section class="net-card"><h2>Local market</h2><p class="net-note">Choose a product to trade. All prices are RM per tonne.</p><div class="net-market">' + goods.map(id => '<button class="net-product' + (ui.good === id ? ' selected' : '') + '" data-n="product" data-good="' + id + '" aria-label="' + esc(goodName(id)) + ', buy ' + prices[id].buy + ', sell ' + prices[id].sell + ' RM per tonne, ' + (stock[id] || 0) + ' tonnes owned"><b>' + esc(goodName(id)) + '</b><span>Buy ' + money(prices[id].buy) + '</span><span>Sell ' + money(prices[id].sell) + '</span><small>' + (stock[id] || 0) + ' t owned · ' + prices[id].available + ' t supply</small></button>').join('') + '</div></section>';
    }
    function shipmentPanel() {
      const q = whole(ui.qty), quote = N.quoteShipment(state, ui.hub, ui.to, ui.mode, ui.good, q);
      const target = state.warehouses[ui.to] ? N.warehouseUsage(state, ui.to) : null;
      const own = state.warehouses[ui.hub]?.stock[ui.good] || 0;
      const destinationPrice = N.prices(state, ui.to)[ui.good].sell;
      return '<section class="net-card"><h2>Dispatch from ' + esc(hubName(ui.hub)) + '</h2><p class="net-note">Cargo must already be in this warehouse. Freight is paid at dispatch. Rail serves connected inland corridors; sea and air reach every hub.</p><div class="net-form">' + select('to', 'Destination', ui.to, ids.filter(id => id !== ui.hub).map(id => [id, hubName(id) + (state.warehouses[id] ? '' : ' · warehouse needed')])) + select('mode', 'Transport', ui.mode, Object.entries(N.TRANSPORTS).map(([id, m]) => [id, transportIcon(id) + ' ' + m.name + ' · max ' + m.capacity + ' t'])) + select('good', 'Cargo', ui.good, goods.map(id => [id, goodName(id)])) + input('qty', 'Quantity (whole tonnes)', ui.qty) + '</div><dl class="facts">' + fact('Cargo on hand', own + ' t') + fact('Destination free space', target ? target.free + ' t' : 'Warehouse needed') + fact('Destination space reserved', target ? target.reserved + ' t' : '—') + fact('Freight charge', quote.ok ? money(quote.cost) : '—') + fact('Arrival', quote.ok ? 'Day ' + quote.arrivalDay + ' · ' + plural(quote.days, 'day') : '—') + fact('Destination sell price today', money(destinationPrice) + '/t') + '</dl>' + (quote.ok ? '<p class="net-note">Prices can change before arrival. Receiving cargo reserves ' + q + ' t at the destination now.</p>' : '<p id="network-reason" class="net-warning">' + esc(quote.error) + '</p>') + btn('Dispatch shipment', 'dispatch', 'primary', disabled(!quote.ok)) + '</section>';
    }
    function lanesPanel() {
      return '<section class="net-card"><h2>Concurrent shipments</h2><p><b>' + state.shipments.length + ' / ' + state.laneLimit + '</b> freight slots in use.</p><p class="net-note">Sea is economical for bulk cargo. Air is fast but expensive. Rail balances speed and price on connected routes.</p>' + (state.laneLimit < 6 ? btn('Add 3 freight slots · ' + money(N.COSTS.laneUpgrade), 'upgrade-lanes', '', state.cash < N.COSTS.laneUpgrade ? ' disabled' : '') + (state.cash < N.COSTS.laneUpgrade ? '<p class="net-note">Not enough cash for more freight slots.</p>' : '') : '<p class="net-note">All 6 freight slots unlocked.</p>') + '</section>';
    }
    function industryPanel() {
      if (!state.warehouses[ui.hub]) return '<section class="net-card"><h2>Local manufacturing</h2><p>Build a warehouse here first. It holds factory inputs and reserves space for finished products.</p></section>';
      const factory = state.factories[ui.hub];
      const recipeId = factory ? factory.recipeId : ui.recipe, recipe = N.RECIPES[recipeId];
      const batches = whole(ui.batches), quote = factory ? N.quoteProduction(state, ui.hub, recipeId, batches) : null;
      const localPrices = N.prices(state, ui.hub);
      const inputCost = Object.entries(recipe.inputs).reduce((sum, [id, qty]) => sum + qty * localPrices[id].buy, 0);
      const outputValue = Object.entries(recipe.output).reduce((sum, [id, qty]) => sum + qty * localPrices[id].sell, 0);
      return '<section class="net-card"><h2>' + (factory ? esc(recipe.name) : 'Build a local factory') + '</h2><p class="net-note">One permanent factory specialization per hub, one production job at a time. Inputs come from this warehouse and finished goods stay here for sale or onward shipment.</p>' + (!factory ? select('recipe', 'Factory specialization', ui.recipe, recipes.map(id => [id, N.RECIPES[id].name])) : '') + '<dl class="facts">' + fact('Inputs per batch', esc(productList(recipe.inputs))) + fact('Output per batch', esc(productList(recipe.output))) + fact('Processing fee per batch', money(recipe.cost)) + fact('Processing time', plural(recipe.days, 'day')) + fact('Factory daily upkeep', money(N.COSTS.factoryUpkeep)) + fact('Margin at today’s local prices', money(outputValue - inputCost - recipe.cost)) + '</dl><p class="net-note">Margin uses today’s input purchase and output sale prices; it excludes construction, freight and daily upkeep. Future prices may differ.</p>' + (!factory ? btn('Build factory · ' + money(N.COSTS.factory), 'build-factory', 'primary', state.cash < N.COSTS.factory ? ' disabled' : '') + (state.cash < N.COSTS.factory ? '<p class="net-note">Not enough cash to build this factory.</p>' : '') : input('batches', 'Batches to produce (1–' + recipe.maxBatches + ')', ui.batches) + (quote.ok ? '<p class="net-note">Fee ' + money(quote.cost) + ' · finishes day ' + quote.finishDay + ' · produces ' + esc(productList(quote.output)) + '.</p>' : '<p id="network-reason" class="net-warning">' + esc(quote.error) + '</p>') + btn('Start production', 'produce', 'primary', disabled(!quote.ok))) + '</section>';
    }
    function operations() {
      const captain=state.captain?.voyage;
      const captainJob=captain?['<li><div><span class="net-badge">Your captain</span><b>'+esc(hubName(captain.from))+' → '+esc(hubName(captain.to))+'</b><small>'+Object.values(state.captain.cargo).reduce((a,b)=>a+b,0)+' t aboard</small></div><div class="net-eta"><b>Day '+captain.arrivalDay+'</b><small>'+plural(captain.arrivalDay-state.day,'day')+' left</small></div></li>']:[];
      const shipments = captainJob.concat(state.shipments.map(s => '<li><div><span class="net-badge">' + transportIcon(s.mode) + ' ' + esc(N.TRANSPORTS[s.mode].name) + '</span><b>' + esc(hubName(s.from)) + ' → ' + esc(hubName(s.to)) + '</b><small>' + s.qty + ' t ' + esc(goodName(s.good)) + ' · freight ' + money(s.cost) + '</small></div><div class="net-eta"><b>Day ' + s.arrivalDay + '</b><small>' + plural(s.arrivalDay - state.day, 'day') + ' left</small></div></li>'));
      const jobs = state.production.map(p => '<li><div><span class="net-badge">Factory</span><b>' + esc(hubName(p.hub)) + ' · ' + esc(N.RECIPES[p.recipeId].name) + '</b><small>' + esc(productList(p.output)) + '</small></div><div class="net-eta"><b>Day ' + p.finishDay + '</b><small>' + plural(p.finishDay - state.day, 'day') + ' left</small></div></li>');
      return '<section class="net-card"><h2>Operations in progress <span class="dim">' + (shipments.length + jobs.length) + '</span></h2>' + (shipments.length + jobs.length ? '<ul class="net-operations">' + shipments.concat(jobs).join('') + '</ul>' : '<p class="net-note">No active jobs. Buy cargo, dispatch a shipment or start a production batch before advancing time.</p>') + '</section>';
    }
    function log() { return '<details class="net-card net-log"><summary>Company log</summary><ul>' + state.history.map(item => '<li><small>Day ' + item.day + '</small><span>' + esc(item.text) + '</span></li>').join('') + '</ul></details>'; }
    function campaign() {
      if (!active()) return Play.report(state,ui) + summary() + operations() + log();
      const next = nextEvent();
      const hubs = ids.map(id => [id, hubName(id) + ' · ' + N.HUBS[id].region + (state.warehouses[id] ? ' · owned' : '')]);
      const regionNav = '<nav class="net-regions" aria-label="Trading regions">' + [...new Set(ids.map(id => N.HUBS[id].region))].map(region => '<button data-n="region" data-region="' + esc(region) + '"' + (N.HUBS[ui.hub].region === region ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(region) + '<small>' + plural(ids.filter(id => N.HUBS[id].region === region).length, 'hub') + '</small></button>').join('') + '</nav>';
      return '<div class="net-overview"><div><small>Cash available</small><b>' + money(state.cash) + '</b></div><div><small>Company value</small><b>' + money(N.netWorth(state)) + '</b></div><div><small>Daily upkeep</small><b>' + money(dailyCost()) + '</b></div><div><small>Next completion</small><b>' + (Number.isFinite(next) ? 'Day ' + next : 'No active jobs') + '</b></div></div>' +
        (state.debt ? '<p class="net-warning">Company debt: ' + money(state.debt) + '. Sales and order payments repay this before adding spendable cash. Daily interest is 0.5% while the captain is enabled.</p>' : '') +
        Play.report(state,ui) + Play.decision(state) + (ui.tab==='world'?Play.briefing(state,ui):ui.tab==='orders'?'':Play.ready(state)) + regionNav + '<div class="net-toolbar">' + select('hub', 'Manage a regional hub', ui.hub, hubs) + '<nav class="net-tabs" aria-label="Company workspaces">' + [['world','Map'],['market','Trade'],['bridge','Captain'],['shipments','Freight'],['industry','Manufacture'],['orders','Orders & Bank']].map(([id, name]) => btn(name, 'tab', ui.tab === id ? 'on' : '', ' data-tab="' + id + '"' + (ui.tab === id ? ' aria-current="page"' : ''))).join('') + '</nav></div>' +
        objectivePanel() + (ui.tab === 'world' ? window.MMCompanyWorld.port(state,N,ui.hub) : '') + (ui.foodChain?Play.factory(state,ui,'klang',10,true,'food'):'') + Play.route(state,ui) +
        '<div class="net-layout"><div class="net-main-column">' + (ui.tab === 'world' ? window.MMCompanyWorld.world(state,N,ui.hub) : ui.tab === 'market' ? tradePanel() : ui.tab === 'bridge' ? bridgePanel() : ui.tab === 'shipments' ? shipmentPanel() : ui.tab === 'orders' ? ordersPanel() : industryPanel() + (state.factories[ui.hub]?Play.factory(state,ui,ui.hub,whole(ui.batches)):'')) + '</div><aside class="net-side-column" aria-label="Warehouse and operations">' + warehouse() + (ui.tab === 'shipments' ? lanesPanel() : '') + operations() + log() + '</aside>' + (ui.tab === 'market' ? '<div class="net-price-column">' + pricesPanel() + '</div>' : '') + '</div>';
    }

    function nextEvent(){return Math.min(...state.shipments.map(j=>j.arrivalDay),...state.production.map(j=>j.finishDay),state.captain?.voyage?.arrivalDay||Infinity);}
    function objectivePanel(){
      const objectives=N.objectives(state),next=objectives.find(o=>!o.done),completed=objectives.filter(o=>o.done).length;
      return '<details class="net-guidance company-objectives" aria-label="Campaign objectives"><summary class="net-card-head"><b>Your trading company · '+completed+'/5 milestones</b><span class="net-badge">'+(next?'Next objective':'Supply chain established')+'</span></summary><div class="objective-track">'+objectives.map(o=>'<button data-n="objective" data-objective="'+o.id+'" class="'+(o.done?'done':o.id===next?.id?'current':'')+'">'+(o.done?'✓ ':'○ ')+esc(o.name)+'</button>').join('')+'</div><p>'+esc(next?next.hint:'Keep growing your network, finish outstanding orders and protect your net worth through day 60.')+'</p></details>';
    }
    function bridgePanel(){
      const c=state.captain;
      if(!c)return '<section class="net-card"><h2>Captain bridge</h2><p>Add the starter coaster to this company without changing its cash or deleting the old save.</p>'+btn('Enable captain bridge','enable-captain','primary')+'</section>';
      const fleet=N.FLEET[c.ship],aboard=Object.values(c.cargo).reduce((a,b)=>a+b,0);
      let h='<section class="net-card"><div class="net-card-head"><h2>'+esc(fleet.name)+'</h2><span class="net-badge">Hull '+c.hull+'%</span></div><p class="net-note">Captain '+(c.voyage?'at sea to '+esc(hubName(c.voyage.to)):'docked at '+esc(hubName(c.port)))+'. The regional hub selector manages remote facilities; it does not move your ship.</p><dl class="facts">'+fact('Hold used',aboard+' / '+fleet.capacity+' t')+fact('Captain deliveries',c.transported+' t across '+c.voyages+' voyages')+'</dl>';
      if(c.voyage)return h+'<p class="net-guidance">Arrives on day '+c.voyage.arrivalDay+'. Cargo will unload automatically into the reserved destination warehouse. Keep trading and manufacturing while the captain sails.</p>'+btn('Manage destination warehouse','captain-destination')+'</section>';
      if(ui.sailTo===c.port||!N.HUBS[ui.sailTo])ui.sailTo=ids.find(id=>id!==c.port);
      const transfer=N.quoteTransfer(state,ui.good,whole(ui.qty),ui.direction),voyage=N.quoteVoyage(state,ui.sailTo);
      h+='<h3>Load or unload at '+esc(hubName(c.port))+'</h3><div class="net-form">'+select('good','Ship cargo',ui.good,goods.map(id=>[id,goodName(id)]))+select('direction','Transfer',ui.direction,[['load','Warehouse → ship'],['unload','Ship → warehouse']])+input('qty','Quantity (whole tonnes)',ui.qty)+'</div><p class="net-note">Warehouse: '+state.warehouses[c.port].stock[ui.good]+' t · Aboard: '+c.cargo[ui.good]+' t</p>'+(transfer.ok?'':'<p class="net-warning">'+esc(transfer.error)+'</p>')+btn(ui.direction==='load'?'Load cargo':'Unload cargo','transfer','primary',transfer.ok?'':' disabled');
      h+='<hr class="company-divider"><h3>Plan your voyage</h3>'+select('sailTo','Captain destination',ui.sailTo,ids.filter(id=>id!==c.port).map(id=>[id,hubName(id)+(state.warehouses[id]?'':' · warehouse needed')]))+'<p class="net-note">Voyage cost includes fuel and crew. Insurance includes storm-damage repair on arrival; ordinary repairs cost RM 120 per hull point. Quotes use the monsoon at departure.</p>'+btn('Voyage insurance: '+(c.insured?'on':'off'),'insurance','', ' aria-pressed="'+c.insured+'"')+(voyage.ok?'<dl class="facts">'+fact('Departure','Day '+state.day)+fact('Arrival','Day '+voyage.arrivalDay+' · '+plural(voyage.days,'day'))+fact('Voyage cost',money(voyage.cost))+fact('Weather',esc(voyage.monsoon))+fact('Cargo reservation',aboard+' t at destination')+'</dl>':'<p class="net-warning">'+esc(voyage.error)+'</p>')+btn('Sail to '+esc(hubName(ui.sailTo)),'sail','primary',voyage.ok?'':' disabled');
      if(!aboard)h+='<p class="net-note">Your hold is empty. Sailing empty repositions the captain; load cargo first for a delivery.</p>';
      h+='<hr class="company-divider"><h3>Shipyard</h3>'+btn('Repair to 100% · '+money((100-c.hull)*120),'repair-captain','', c.hull===100||state.cash<(100-c.hull)*120?' disabled':'');
      for(const [id,f]of Object.entries(N.FLEET))if(f.cost>fleet.cost){const cost=f.cost-N.shipValue(c);h+=btn('Upgrade: '+esc(f.name)+' · '+f.capacity+' t · '+money(cost),'upgrade-ship','', ' data-ship="'+id+'"'+(cost>state.cash?' disabled':''));}
      return h+'</section>';
    }
    function ordersPanel(){
      const c=state.captain;if(!c)return bridgePanel();
      const orders=Object.keys(N.ORDERS).map(id=>{const o=N.orderTerms(state,id);const q=N.quoteOrder(state,id),status=c.orders[id];return '<article class="company-order"><div class="net-card-head"><h3>'+esc(o.name)+'</h3><span class="net-badge">'+esc(status)+'</span></div><p>'+o.qty+' t '+esc(goodName(o.good))+' → '+esc(hubName(o.hub))+'</p><dl class="facts">'+fact('Payment',money(o.payment))+fact('Delivery deadline','Day '+o.deadline)+'</dl>'+(status==='open'?'<p class="net-note">'+(q.ok?'Warehouse cargo is ready. Payment consumes it once.':esc(q.error))+'</p>'+btn('Fulfil order','fulfill-order','primary',' data-order="'+id+'"'+(q.ok?'':' disabled'))+btn('Manage delivery hub','order-hub','ghost',' data-order="'+id+'"'):'')+'</article>';}).join('');
      const amount=whole(ui.amount),canBorrow=Number.isSafeInteger(amount)&&amount>0&&amount+state.debt<=N.CREDIT_LIMIT,canRepay=Number.isSafeInteger(amount)&&amount>0&&amount<=state.debt&&amount<=state.cash;
      return '<section class="net-card"><h2>Delivery orders</h2><p class="net-note">Deliver into the named warehouse, then fulfil the order. Its payment replaces a market sale, not an extra payout. Orders expire without penalty; deadline-day arrivals can fulfil an order before advancing again.</p>'+orders+'</section><section class="net-card"><h2>Company finance</h2><dl class="facts">'+fact('Outstanding debt',money(state.debt))+fact('Shared credit limit',money(N.CREDIT_LIMIT))+fact('Daily interest',money(Math.ceil(state.debt*0.005)))+'</dl><p class="net-warning">Loans are game money. Interest is 0.5% per game day. Upkeep shortfalls also become debt. Sales and order payments repay debt automatically before increasing spendable cash.</p>'+input('amount','Loan or repayment (whole RM)',ui.amount)+btn('Borrow','borrow','',canBorrow?'':' disabled')+btn('Repay','repay','',canRepay?'':' disabled')+'</section>';
    }

    function backupPanel() {
      if (!ui.backup) return '';
      let code = ''; try { if (state || saved) code = N.serialize(state || saved); } catch (error) { /* no valid state to export */ }
      return '<section class="net-card net-backup"><h2>Company backup</h2><p class="net-note">This backup contains the captain, factories, freight, warehouses, orders and money together. Older company backups are accepted; classic MM1 backups stay separate.</p>' + (code ? '<label class="net-field" for="net-backup-code"><span>Current company backup</span><textarea id="net-backup-code" readonly spellcheck="false">' + esc(code) + '</textarea></label>' + btn('Copy company backup', 'copy') : '') + '<label class="net-field" for="net-import"><span>Restore a company backup (replaces this company only)</span><textarea id="net-import" spellcheck="false" placeholder="Paste a company backup">' + esc(ui.importText) + '</textarea></label>' + btn('Validate &amp; restore company', 'restore') + btn('Close backup panel', 'backup', 'ghost') + '</section>';
    }
    function render(keepFocus) {
      if (disposed || rendering) return;
      rendering = true;
      try {
      normalizeDestination();
      const current = document.activeElement, focusId = keepFocus && mount.contains(current) ? current.id : '';
      const selection = focusId && current.matches('input,textarea') ? [current.selectionStart, current.selectionEnd] : null;
      const bookmark = keepFocus && current?.dataset?.n ? Object.assign({}, current.dataset) : null;
      const scrolled = mount.querySelector('.net-scroll')?.scrollTop || 0;
      mount.innerHTML = '<div class="network-screen'+(ui.effects?'':' no-effects')+'"><header class="net-header">' + btn('← Main menu', 'exit', 'ghost') + '<div><b>Monsoon Company</b><small>' + (state && ui.view === 'campaign' ? 'Day ' + state.day + ' / 60' : 'Captain · Factory · Freight') + '</small></div>' + btn(ui.effects?'Effects on':'Effects off','effects','ghost',' aria-pressed="'+ui.effects+'"') + btn('Backup', 'backup', 'ghost') + '</header><main class="net-scroll">' + (saveWarning ? '<p class="net-warning" role="alert">' + esc(saveWarning) + '</p>' : '') + '<div class="net-notice ' + (badNotice ? 'net-warning' : '') + '" role="status" aria-live="polite">' + esc(notice) + '</div>' + (ui.view === 'lobby' ? lobby() : campaign()) + backupPanel() + '</main>' + (active() && ui.view === 'campaign' ? Play.daybar(state,ui) : '') + '</div>';
      const sc = mount.querySelector('.net-scroll');
      if (keepFocus) sc.scrollTop = scrolled;
      let next = focusId ? document.getElementById(focusId) : null;
      if (!next && bookmark) next = Array.from(mount.querySelectorAll('[data-n]')).find(el => Object.keys(bookmark).every(key => el.dataset[key] === bookmark[key]));
      if (!next || next.disabled) next = keepFocus ? null : mount.querySelector('h1, h2');
      if (next) {
        if (!next.matches('button,input,select,textarea')) next.tabIndex = -1;
        next.focus({ preventScroll: true });
        if (selection && next.matches('input,textarea') && selection[0] !== null) next.setSelectionRange(selection[0], selection[1]);
      }
      } finally { rendering = false; }
    }
    function close() { mount.removeEventListener('keydown', keyboard); disposed = true; mount.removeEventListener('click', click); mount.removeEventListener('change', change); mount.removeEventListener('input', typing); app.classList.remove('network-mode'); previousClose = null; }

    function openRoute(orderId=null,from=null){
      const o=orderId?N.orderTerms(state,orderId):null;
      const origin=from||ui.hub;
      ui.route={from:state.warehouses[origin]?origin:state.home,to:o?o.hub:(ui.to===origin?'singapore':ui.to),good:o?o.good:ui.good,qty:String(o?o.qty:whole(ui.qty)||20),buyMissing:!!o,buildDestination:!!o,orderId};
      if(ui.route.from===ui.route.to)ui.route.from=Object.keys(state.warehouses).find(id=>id!==ui.route.to)||state.home;
      ui.tab='world';ui.foodChain=false;message('Review the complete cost, then confirm one transport option.');render();
      mount.querySelector('.route-planner')?.scrollIntoView({block:'start'});
    }
    function reportAdvance(result,fromDay){
      if(result.ok)ui.report={fromDay,toDay:state.day,upkeep:result.upkeep,events:(result.events||[]).map(e=>typeof e==='string'?{day:state.day,text:e}:e),message:result.message||'One shared company day completed.'};
      apply(result,result.message);
    }
    function click(event) {
      const el = event.target.closest('[data-n]'); if (!el || el.disabled || !mount.contains(el)) return;
      const action = el.dataset.n;
      if(event.detail>1)return; // Ignore the second activation of a physical double-click.
      if(action==='report-close'){ui.report=null;render(true);return;}
      if(action==='effects'){ui.effects=!ui.effects;render(true);return;}
      if (action === 'exit') { if (state && !save()) { render(true); return; } close(); options.onExit(); return; }
      if (action === 'backup') { ui.backup = !ui.backup; render(true); if (ui.backup) mount.querySelector('.net-backup')?.scrollIntoView({ block: 'start' }); return; }
      if (action === 'copy') {
        const box = mount.querySelector('#net-backup-code'); box.select();
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(box.value).then(() => { if (disposed) return; message('Company backup copied.'); render(true); }, () => { if (disposed) return; message('Use your device’s Copy command on the selected backup text.'); render(true); });
        return;
      }
      if (action === 'restore') {
        ui.importText = mount.querySelector('#net-import').value.trim();
        const loaded = N.deserialize(ui.importText);
        if (!loaded.ok) { message('Backup was not restored: ' + loaded.error, true); render(true); return; }
        try { localStorage.setItem(KEY, N.serialize(loaded.state)); }
        catch (error) { message('Restore could not be saved. Your existing company is unchanged.', true); render(true); return; }
        ui.route=null;ui.report=null;ui.foodChain=false;state = loaded.state; saved = state; unreadable = false; saveWarning = ''; ui.hub = state.home; ui.view = 'campaign'; ui.backup = false; if(!state.captain && state.status==='active')N.enableCaptain(state); save(); message('Company restored.'); render(); return;
      }
      if (action === 'new') { if (saved || unreadable) { ui.confirm = true; render(true); } else start(); return; }
      if (action === 'start') { start(); return; }
      if (action === 'cancel-new') { ui.confirm = false; render(true); return; }
      if (action === 'continue') { state = saved; ui.hub = state.home; ui.view = 'campaign'; if(!state.captain && state.status==='active'){const upgraded=N.enableCaptain(state);if(!upgraded.ok){message(upgraded.error,true);render();return;}} save(); message('Company resumed. All workspaces share this save.'); render(); return; }
      if (action === 'lobby') { ui.view = 'lobby'; ui.confirm = false; render(); return; }
      if (!active()) return;
      if(action==='port-action'){ui.route=null;ui.foodChain=false;ui.tab=el.dataset.tab;if(ui.tab==='bridge'&&state.captain)ui.hub=state.captain.port;render();return;}
      if(action==='route-open'){openRoute();return;}
      if(action==='plan-order'){openRoute(el.dataset.order,el.dataset.from||'klang');return;}
      if(action==='route-cancel'){ui.route=null;message('Plan cancelled. No money or cargo moved.');render(true);return;}
      if(action==='route-buy'||action==='route-build'){if(ui.route){const key=action==='route-buy'?'buyMissing':'buildDestination';ui.route[key]=!ui.route[key];render(true);}return;}
      if(action==='route-confirm'){
        if(!ui.route)return;const q=ui.routeQuotes?.[el.dataset.mode];
        if(!q?.ok||q.late)return;
        const result=A.deliver(state,{...ui.route,qty:whole(ui.route.qty),mode:el.dataset.mode},q.snapshot);
        if(result.ok)ui.route=null;apply(result,'Delivery committed once. Use Next event to reach the next completion.');return;
      }
      if(action==='food-chain'){ui.foodChain=true;ui.tab='world';ui.route=null;render();mount.querySelector('.smart-factory')?.scrollIntoView({block:'start'});return;}
      if(action==='smart-produce'){
        const q=ui.factoryQuote,p=ui.factoryArgs;if(!q?.ok)return;
        const result=A.produce(state,p.hub,p.batches,p.build,p.recipe,q.snapshot);
        if(result.ok){ui.foodChain=false;ui.tab='world';}apply(result,'Inputs sourced and production started as one transaction.');return;
      }
      if(action==='customer-choice'){apply(N.chooseCustomer(state,el.dataset.choice),'Customer agreement saved. Payment is earned only on fulfilment.');return;}
      if(action==='advance-next'){
        const q=ui.advanceQuote;if(!q?.ok)return;const day=state.day;
        reportAdvance(A.advanceNext(state,q.snapshot),day);return;
      }
      if(action==='world-hub'){if(ui.route){if(el.dataset.hub===ui.route.from){message('Choose a different destination.',true);render(true);return;}ui.route.to=el.dataset.hub;ui.route.orderId=null;message('Destination updated. No cargo moved.');render(true);mount.querySelector('.route-planner')?.scrollIntoView({block:'start'});}else{ui.hub=el.dataset.hub;ui.tab='market';message('Managing '+hubName(ui.hub)+'.');render();}return;}
      if(action==='objective'){const objective=N.objectives(state).find(o=>o.id===el.dataset.objective);if(objective){ui.tab=objective.tab;ui.hub=objective.hub;message(objective.hint);render();}return;}
      if(action==='captain-destination'){ui.hub=state.captain.voyage.to;ui.tab='market';render();return;}
      if(action==='order-hub'){ui.hub=N.ORDERS[el.dataset.order].hub;ui.tab='market';render();return;}
      if(action==='enable-captain'){apply(N.enableCaptain(state),'Captain enabled. This is the same company, cash balance and day.');return;}
      if(action==='transfer'){apply(N.transferCargo(state,ui.good,whole(ui.qty),ui.direction),'Cargo transferred at the captain’s port.');return;}
      if(action==='sail'){apply(N.sail(state,ui.sailTo),'Captain underway. All operations share the Advance day button.');return;}
      if(action==='insurance'){apply(N.insure(state,!state.captain.insured),'Voyage insurance updated.');return;}
      if(action==='repair-captain'){apply(N.repairCaptain(state),'Ship repaired.');return;}
      if(action==='upgrade-ship'){apply(N.upgradeShip(state,el.dataset.ship),'Ship upgraded.');return;}
      if(action==='fulfill-order'){apply(N.fulfillOrder(state,el.dataset.order),'Order fulfilled. Cargo consumed and payment received.');return;}
      if(action==='borrow'){apply(N.borrow(state,whole(ui.amount)),'Loan added to the shared company balance.');return;}
      if(action==='repay'){apply(N.repay(state,whole(ui.amount)),'Company debt repaid.');return;}
      if (action === 'region') {
        ui.hub = ids.find(id => N.HUBS[id].region === el.dataset.region && state.warehouses[id]) || ids.find(id => N.HUBS[id].region === el.dataset.region);
        normalizeDestination();
        message('Managing ' + hubName(ui.hub) + ' in ' + N.HUBS[ui.hub].region + '.'); render(true); return;
      }
      if (action === 'tab') { ui.route=null;ui.foodChain=false;ui.tab = el.dataset.tab; message(''); render(); return; }
      if (action === 'product') { ui.good = el.dataset.good; render(true); mount.querySelector('#net-good')?.focus(); return; }
      if (action === 'trade') apply(N.trade(state, ui.hub, ui.good, whole(ui.qty), ui.side), (ui.side === 'buy' ? 'Bought ' : 'Sold ') + ui.qty + ' t ' + goodName(ui.good) + ' in ' + hubName(ui.hub) + '.');
      else if (action === 'dispatch') apply(N.dispatch(state, ui.hub, ui.to, ui.mode, ui.good, whole(ui.qty)), 'Shipment dispatched. Advance days to move it toward ' + hubName(ui.to) + '.');
      else if (action === 'build-warehouse') apply(N.buildWarehouse(state, ui.hub), 'Warehouse opened in ' + hubName(ui.hub) + '.');
      else if (action === 'upgrade-warehouse') apply(N.upgradeWarehouse(state, ui.hub), 'Warehouse capacity increased.');
      else if (action === 'upgrade-lanes') apply(N.upgradeLanes(state), 'Your company now has 6 concurrent freight slots.');
      else if (action === 'build-factory') apply(N.buildFactory(state, ui.hub, ui.recipe), 'Factory built. Buy the required inputs locally or ship them here.');
      else if (action === 'produce') apply(N.startProduction(state, ui.hub, state.factories[ui.hub].recipeId, whole(ui.batches)), 'Production started. Advance days to finish the batch.');
      else if (action === 'advance') {const day=state.day;reportAdvance(N.advanceDay(state),day);}
    }
    function start() {
      ui.route=null;ui.report=null;ui.foodChain=false;state = N.create('company-' + Date.now(), true); saved = state; ui.hub = state.home; ui.view = 'campaign'; ui.confirm = false; ui.tab = 'world';
      message('Your company is open. Follow the first delivery objective or explore the map.'); save(); render();
    }
    function change(event) {
      const field = event.target.dataset.field;
      // Replacing a focused form can synchronously dispatch change/blur in Chromium.
      if(rendering||!field)return;
      if(field.startsWith('route')&&ui.route){
        const key={routeFrom:'from',routeTo:'to',routeGood:'good',routeQty:'qty'}[field];if(!key||ui.route[key]===event.target.value)return;
        ui.route[key]=event.target.value;ui.route.orderId=null;
        if(ui.route.from===ui.route.to)ui.route.to=ids.find(id=>id!==ui.route.from);
        render(true);return;
      }
      if(ui[field]===event.target.value)return;
      ui[field] = event.target.value;
      if (field === 'hub') normalizeDestination();
      message(''); render(true);
    }
    function typing(event) {
      if (event.target.id === 'net-import') ui.importText = event.target.value;
      if (['qty', 'batches', 'amount', 'routeQty'].includes(event.target.dataset.field)) change(event);
    }
    function keyboard(event){const hub=event.target.closest('svg [data-n]');if(hub&&['Enter',' '].includes(event.key)){event.preventDefault();click({target:hub});}}
    mount.addEventListener('keydown',keyboard);
    mount.addEventListener('click', click); mount.addEventListener('change', change); mount.addEventListener('input', typing);
    previousClose = close;
    render();
  }
  window.MMNetworkUI = { open };
})();
