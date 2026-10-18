/* Monsoon Merchant — a separate, turn-based logistics company campaign. */
(function () {
  'use strict';
  const KEY = 'mm.network.v1';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => 'RM ' + Math.round(n).toLocaleString('en-US');
  const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's');
  const whole = value => /^\d+$/.test(String(value)) ? Number(value) : NaN;
  const transportIcon = id => ({ sea: '⛴', air: '✈', rail: '🚆' }[id]);
  const disabled = reason => reason ? ' disabled aria-describedby="network-reason"' : '';
  let previousClose = null;

  function open(options) {
    if (previousClose) previousClose();
    const N = window.MMNetwork, app = options.root;
    const mount = app.querySelector('#screen') || app;
    const ids = Object.keys(N.HUBS), goods = Object.keys(N.GOODS), recipes = Object.keys(N.RECIPES);
    let state = null, saved = null, unreadable = false, saveWarning = '', disposed = false;
    let notice = '', badNotice = false;
    const ui = { view: 'lobby', tab: 'market', hub: 'klang', good: 'palm', qty: '20', side: 'buy', to: ids.find(id => id !== 'klang'), mode: 'sea', recipe: recipes[0], batches: '1', backup: false, confirm: false, importText: '' };
    try {
      const raw = localStorage.getItem(KEY);
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
    const dailyCost = () => Object.keys(state.warehouses).length * N.COSTS.warehouseUpkeep + Object.keys(state.factories).length * N.COSTS.factoryUpkeep;
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
      return '<div class="net-intro"><span class="net-kicker">A new way to trade</span><h1 tabindex="-1">Network Company</h1><p class="net-lead">One company. Many routes.</p><p>Run simultaneous sea, air and rail shipments across Asia. Build warehouses, source local products and turn raw materials into finished goods.</p>' +
        '<ol class="net-steps"><li><b>Trade locally</b><span>Begin with ' + money(500000) + ' and a Klang warehouse. Prices include a buy/sell spread.</span></li><li><b>Build your network</b><span>Open a destination warehouse, buy cargo and dispatch up to 3 shipments at once.</span></li><li><b>Make every day count</b><span>Advancing a day moves all shipments and production jobs, and charges upkeep everywhere.</span></li></ol>' +
        '<p class="net-note"><b>Time moves only when you advance a day.</b> Trading, building and dispatching do not move the clock. A separate 60-day campaign; classic seasons, Daily Voyage and Legacy keep their own progress.</p>' +
        (unreadable ? '<p class="net-warning">The saved company could not be read. It has been kept on this device. Restore a company backup below, or explicitly replace it with a new company.</p>' : '') +
        (saved ? btn('Continue company · Day ' + saved.day + '/60', 'continue', 'primary big') : '') +
        (ui.confirm ? '<div class="net-warning"><p>Replace the saved company? Its warehouses, cargo and progress will be lost. Classic and Daily saves are unaffected.</p><div class="row-actions">' + btn('Keep existing company', 'cancel-new') + btn('Replace company', 'start', 'danger') + '</div></div>' : btn(saved || unreadable ? 'Start a new company' : 'Start company · ' + money(500000), 'new', saved ? 'ghost' : 'primary big')) +
        '<button class="net-text-button" data-n="backup">Restore a company backup</button></div>';
    }
    function summary() {
      const result = state.result;
      return '<section class="net-intro net-finale"><span class="net-kicker">Day 60 · season complete</span><h1 tabindex="-1">' + esc(result.rank) + '</h1><p class="net-lead">' + money(result.netWorth) + '</p><p>Company value after liabilities, including cargo at local sale prices and the resale value of facilities. ' + (result.profit >= 0 ? 'You gained ' : 'You lost ') + money(Math.abs(result.profit)) + ' against your opening company value.</p><dl class="net-stats">' + fact('Shipments completed', result.shipments) + fact('Manufactured', result.produced + ' t') + fact('Upkeep paid or accrued', money(state.stats.upkeep)) + fact('Outstanding debt', money(state.debt || 0)) + '</dl><p class="net-note">Review the operations log below or start another company from the title. This campaign does not award classic Legacy.</p>' + btn('Company title', 'lobby', 'primary') + '</section>';
    }
    function warehouse() {
      const w = state.warehouses[ui.hub], usage = N.warehouseUsage(state, ui.hub);
      if (!w) return '<section class="net-card"><h2>Open a warehouse</h2><p>Receive shipments and trade remotely in ' + esc(hubName(ui.hub)) + '.</p><dl class="facts">' + fact('Capacity', '160 t') + fact('One-time cost', money(N.COSTS.warehouse)) + fact('Daily upkeep', money(N.COSTS.warehouseUpkeep)) + '</dl>' + btn('Build warehouse · ' + money(N.COSTS.warehouse), 'build-warehouse', 'primary', state.cash < N.COSTS.warehouse ? ' disabled' : '') + (state.cash < N.COSTS.warehouse ? '<p class="net-note">Not enough cash to build this warehouse.</p>' : '') + '</section>';
      return '<section class="net-card net-storage"><div class="net-card-head"><h2>' + esc(hubName(ui.hub)) + ' warehouse</h2><span class="net-badge">Level ' + w.level + '</span></div><dl class="facts">' + fact('On hand', usage.stock + ' t') + fact('Incoming &amp; production reserved', usage.reserved + ' t') + fact('Free capacity', '<b>' + usage.free + ' / ' + usage.capacity + ' t</b>') + fact('Daily upkeep', money(N.COSTS.warehouseUpkeep)) + '</dl>' + (w.level < 3 ? btn('Expand +120 t · ' + money(N.COSTS.warehouseUpgrade), 'upgrade-warehouse', '', state.cash < N.COSTS.warehouseUpgrade ? ' disabled' : '') + (state.cash < N.COSTS.warehouseUpgrade ? '<p class="net-note">Not enough cash to expand.</p>' : '') : '<p class="net-note">Maximum warehouse capacity.</p>') + '</section>';
    }
    function tradePanel() {
      if (!state.warehouses[ui.hub]) return '';
      const q = whole(ui.qty), quote = N.quoteTrade(state, ui.hub, ui.good, q, ui.side);
      const stock = state.warehouses[ui.hub].stock[ui.good] || 0;
      const price = N.prices(state, ui.hub)[ui.good];
      return '<section class="net-card"><h2>Trade at ' + esc(hubName(ui.hub)) + '</h2><div class="net-form">' + select('good', 'Product', ui.good, goods.map(id => [id, goodName(id)])) + select('side', 'Action', ui.side, [['buy', 'Buy into warehouse'], ['sell', 'Sell warehouse stock']]) + input('qty', 'Quantity (whole tonnes)', ui.qty) + '</div><p class="net-note">On hand: ' + stock + ' t · Local supply today: ' + price.available + ' t</p><dl class="facts">' + fact('Price per tonne', money(price[ui.side])) + fact(ui.side === 'buy' ? 'Purchase cost' : 'Sale proceeds', quote.ok ? '<b>' + money(quote.cost) + '</b>' : '—') + '</dl><p id="network-reason" class="' + (quote.ok ? 'net-note' : 'net-warning') + '">' + (quote.ok ? (ui.side === 'sell' && state.debt ? 'Proceeds repay outstanding upkeep debt first.' : 'Trades do not advance the day. Daily local supply is limited.') : esc(quote.error)) + '</p>' + btn((ui.side === 'buy' ? 'Buy ' : 'Sell ') + (Number.isFinite(q) ? q : 0) + ' t', 'trade', 'primary', disabled(!quote.ok)) + '</section>';
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
      const shipments = state.shipments.map(s => '<li><div><span class="net-badge">' + transportIcon(s.mode) + ' ' + esc(N.TRANSPORTS[s.mode].name) + '</span><b>' + esc(hubName(s.from)) + ' → ' + esc(hubName(s.to)) + '</b><small>' + s.qty + ' t ' + esc(goodName(s.good)) + ' · freight ' + money(s.cost) + '</small></div><div class="net-eta"><b>Day ' + s.arrivalDay + '</b><small>' + plural(s.arrivalDay - state.day, 'day') + ' left</small></div></li>');
      const jobs = state.production.map(p => '<li><div><span class="net-badge">Factory</span><b>' + esc(hubName(p.hub)) + ' · ' + esc(N.RECIPES[p.recipeId].name) + '</b><small>' + esc(productList(p.output)) + '</small></div><div class="net-eta"><b>Day ' + p.finishDay + '</b><small>' + plural(p.finishDay - state.day, 'day') + ' left</small></div></li>');
      return '<section class="net-card"><h2>Operations in progress <span class="dim">' + (shipments.length + jobs.length) + '</span></h2>' + (shipments.length + jobs.length ? '<ul class="net-operations">' + shipments.concat(jobs).join('') + '</ul>' : '<p class="net-note">No active jobs. Buy cargo, dispatch a shipment or start a production batch before advancing time.</p>') + '</section>';
    }
    function log() { return '<details class="net-card net-log"><summary>Company log</summary><ul>' + state.history.map(item => '<li><small>Day ' + item.day + '</small><span>' + esc(item.text) + '</span></li>').join('') + '</ul></details>'; }
    function campaign() {
      if (!active()) return summary() + operations() + log();
      const next = Math.min(...state.shipments.map(s => s.arrivalDay), ...state.production.map(p => p.finishDay));
      const hubs = ids.map(id => [id, hubName(id) + ' · ' + N.HUBS[id].region + (state.warehouses[id] ? ' · owned' : '')]);
      const regionNav = '<nav class="net-regions" aria-label="Trading regions">' + [...new Set(ids.map(id => N.HUBS[id].region))].map(region => '<button data-n="region" data-region="' + esc(region) + '"' + (N.HUBS[ui.hub].region === region ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(region) + '<small>' + plural(ids.filter(id => N.HUBS[id].region === region).length, 'hub') + '</small></button>').join('') + '</nav>';
      return '<div class="net-overview"><div><small>Cash available</small><b>' + money(state.cash) + '</b></div><div><small>Company value</small><b>' + money(N.netWorth(state)) + '</b></div><div><small>Daily upkeep</small><b>' + money(dailyCost()) + '</b></div><div><small>Next completion</small><b>' + (Number.isFinite(next) ? 'Day ' + next : 'No active jobs') + '</b></div></div>' +
        (state.debt ? '<p class="net-warning">Upkeep debt: ' + money(state.debt) + '. Future sales repay this before adding spendable cash.</p>' : '') +
        (state.day === 1 && state.stats.shipments === 0 && state.shipments.length === 0 && state.production.length === 0 && state.stats.produced === 0 ? '<div class="net-guidance"><b>Your first supply chain</b><p>Try Singapore as your first destination: build its warehouse, return to Klang and buy 20 t of palm oil. Use Shipments to compare freight and dispatch it. Advance days until arrival, select the destination and sell. Start small and compare freight against the price difference.</p></div>' : '') +
        regionNav + '<div class="net-toolbar">' + select('hub', 'Manage a regional hub', ui.hub, hubs) + '<nav class="net-tabs" aria-label="Company workspaces">' + [['market', 'Market'], ['shipments', 'Shipments'], ['industry', 'Industry']].map(([id, name]) => btn(name, 'tab', ui.tab === id ? 'on' : '', ' data-tab="' + id + '"' + (ui.tab === id ? ' aria-current="page"' : ''))).join('') + '</nav></div>' +
        '<div class="net-layout"><div class="net-main-column">' + (ui.tab === 'market' ? tradePanel() : ui.tab === 'shipments' ? shipmentPanel() : industryPanel()) + '</div><aside class="net-side-column" aria-label="Warehouse and operations">' + warehouse() + (ui.tab === 'shipments' ? lanesPanel() : '') + operations() + log() + '</aside>' + (ui.tab === 'market' ? '<div class="net-price-column">' + pricesPanel() + '</div>' : '') + '</div>';
    }
    function backupPanel() {
      if (!ui.backup) return '';
      let code = ''; try { if (state || saved) code = N.serialize(state || saved); } catch (error) { /* no valid state to export */ }
      return '<section class="net-card net-backup"><h2>Company backup</h2><p class="net-note">Company backups are separate from classic MM1 backups. Copy all text below and keep it somewhere safe.</p>' + (code ? '<label class="net-field" for="net-backup-code"><span>Current company backup</span><textarea id="net-backup-code" readonly spellcheck="false">' + esc(code) + '</textarea></label>' + btn('Copy company backup', 'copy') : '') + '<label class="net-field" for="net-import"><span>Restore a company backup (replaces this company only)</span><textarea id="net-import" spellcheck="false" placeholder="Paste a company backup">' + esc(ui.importText) + '</textarea></label>' + btn('Validate &amp; restore company', 'restore') + btn('Close backup panel', 'backup', 'ghost') + '</section>';
    }
    function render(keepFocus) {
      if (disposed) return;
      normalizeDestination();
      const current = document.activeElement, focusId = keepFocus && mount.contains(current) ? current.id : '';
      const selection = focusId && current.matches('input,textarea') ? [current.selectionStart, current.selectionEnd] : null;
      const bookmark = keepFocus && current?.dataset?.n ? Object.assign({}, current.dataset) : null;
      const scrolled = mount.querySelector('.net-scroll')?.scrollTop || 0;
      mount.innerHTML = '<div class="network-screen"><header class="net-header">' + btn('← Main menu', 'exit', 'ghost') + '<div><b>Network Company</b><small>' + (state && ui.view === 'campaign' ? 'Day ' + state.day + ' / 60' : 'Sea · Air · Rail') + '</small></div>' + btn('Backup', 'backup', 'ghost') + '</header><main class="net-scroll">' + (saveWarning ? '<p class="net-warning" role="alert">' + esc(saveWarning) + '</p>' : '') + '<div class="net-notice ' + (badNotice ? 'net-warning' : '') + '" role="status" aria-live="polite">' + esc(notice) + '</div>' + (ui.view === 'lobby' ? lobby() : campaign()) + backupPanel() + '</main>' + (active() && ui.view === 'campaign' ? '<footer class="net-daybar"><p>Advance <b>all shipments and factories</b> by one day.<span>Charges ' + money(dailyCost()) + ' upkeep across your company.</span></p>' + btn('Advance to day ' + (state.day + 1), 'advance', 'primary') + '</footer>' : '') + '</div>';
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
    }
    function close() { disposed = true; mount.removeEventListener('click', click); mount.removeEventListener('change', change); mount.removeEventListener('input', typing); app.classList.remove('network-mode'); previousClose = null; }
    function click(event) {
      const el = event.target.closest('[data-n]'); if (!el || el.disabled || !mount.contains(el)) return;
      const action = el.dataset.n;
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
        state = loaded.state; saved = state; unreadable = false; saveWarning = ''; ui.hub = state.home; ui.view = 'campaign'; ui.backup = false; message('Company restored.'); render(); return;
      }
      if (action === 'new') { if (saved || unreadable) { ui.confirm = true; render(true); } else start(); return; }
      if (action === 'start') { start(); return; }
      if (action === 'cancel-new') { ui.confirm = false; render(true); return; }
      if (action === 'continue') { state = saved; ui.hub = state.home; ui.view = 'campaign'; message('Company resumed.'); render(); return; }
      if (action === 'lobby') { ui.view = 'lobby'; ui.confirm = false; render(); return; }
      if (!active()) return;
      if (action === 'region') {
        ui.hub = ids.find(id => N.HUBS[id].region === el.dataset.region && state.warehouses[id]) || ids.find(id => N.HUBS[id].region === el.dataset.region);
        normalizeDestination();
        message('Managing ' + hubName(ui.hub) + ' in ' + N.HUBS[ui.hub].region + '.'); render(true); return;
      }
      if (action === 'tab') { ui.tab = el.dataset.tab; message(''); render(); return; }
      if (action === 'product') { ui.good = el.dataset.good; render(true); mount.querySelector('#net-good')?.focus(); return; }
      if (action === 'trade') apply(N.trade(state, ui.hub, ui.good, whole(ui.qty), ui.side), (ui.side === 'buy' ? 'Bought ' : 'Sold ') + ui.qty + ' t ' + goodName(ui.good) + ' in ' + hubName(ui.hub) + '.');
      else if (action === 'dispatch') apply(N.dispatch(state, ui.hub, ui.to, ui.mode, ui.good, whole(ui.qty)), 'Shipment dispatched. Advance days to move it toward ' + hubName(ui.to) + '.');
      else if (action === 'build-warehouse') apply(N.buildWarehouse(state, ui.hub), 'Warehouse opened in ' + hubName(ui.hub) + '.');
      else if (action === 'upgrade-warehouse') apply(N.upgradeWarehouse(state, ui.hub), 'Warehouse capacity increased.');
      else if (action === 'upgrade-lanes') apply(N.upgradeLanes(state), 'Your company now has 6 concurrent freight slots.');
      else if (action === 'build-factory') apply(N.buildFactory(state, ui.hub, ui.recipe), 'Factory built. Buy the required inputs locally or ship them here.');
      else if (action === 'produce') apply(N.startProduction(state, ui.hub, state.factories[ui.hub].recipeId, whole(ui.batches)), 'Production started. Advance days to finish the batch.');
      else if (action === 'advance') apply(N.advanceDay(state));
    }
    function start() {
      state = N.create('company-' + Date.now()); saved = state; ui.hub = state.home; ui.view = 'campaign'; ui.confirm = false; ui.tab = 'market';
      message('Your company is open. Start with local cargo, then add a destination warehouse.'); save(); render();
    }
    function change(event) {
      const field = event.target.dataset.field;
      if (!field) return;
      ui[field] = event.target.value;
      if (field === 'hub') normalizeDestination();
      message(''); render(true);
    }
    function typing(event) {
      if (event.target.id === 'net-import') ui.importText = event.target.value;
      if (['qty', 'batches'].includes(event.target.dataset.field)) change(event);
    }
    mount.addEventListener('click', click); mount.addEventListener('change', change); mount.addEventListener('input', typing);
    previousClose = close;
    render();
  }
  window.MMNetworkUI = { open };
})();
