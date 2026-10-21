/* Monsoon Merchant — a district, a company and one shared clock. */
(function () {
  'use strict';
  const KEY = 'mm.builder.v1';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => 'RM ' + (Number(value || 0) / 100).toLocaleString('en-MY', { maximumFractionDigits: 0 });
  const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value || 0));
  const icons = {
    build: '<path d="M3 21V9l9-6 9 6v12H3Zm6 0v-7h6v7M3 9h18M7 10v2m10-2v2"/>',
    routes: '<circle cx="5" cy="6" r="3"/><circle cx="19" cy="18" r="3"/><path d="M8 6h8a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8"/>',
    markets: '<path d="M3 10h18l-2-6H5l-2 6Zm2 0v11h14V10M9 21v-7h6v7M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0"/>',
    upgrades: '<path d="m12 3 7 8h-4v10H9V11H5l7-8Z"/>',
    company: '<path d="M4 21V7h6V3h10v18H4Zm6-14v14M14 7h2m-2 4h2m-2 4h2M6 11h2m-2 4h2"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 4 12 8-12 8V4Z"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    leaf: '<path d="M20 4C9 3 3 7 5 15c8 5 15-1 15-11ZM5 21 16 9"/>',
    ship: '<path d="m3 15 3 5h12l3-5H3Zm4 0V9h10v6M9 9V5h5v4M3 23q3-3 6 0 3-3 6 0 3-3 6 0"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (icons[name] || icons.build) + '</svg>';
  const button = (text, action, cls, attributes) => '<button type="button" class="b-button ' + (cls || '') + '" data-b="' + action + '"' + (attributes || '') + '>' + text + '</button>';
  let previousClose;

  function open(options) {
    if (previousClose) previousClose(false);
    const B = window.MMBuilder, root = options.root;
    let state = B.create(), rawSave = '', saveWarning = '', blockedSave = false, disposed = false, timer = null;
    let notice = '', noticeError = false;
    const ui = { view: 'local', tab: 'overview', plot: null, policies: false, routeEditing:false, routeDraft:null, confirmReset: false, importText:'', pendingImport:null };
    try {
      rawSave = localStorage.getItem(KEY) || '';
      if (rawSave) {
        state = B.deserialize(rawSave);
        notice = B.status(state).critical ? state.pauseReason : 'Welcome back. Your company is paused and ready when you are.';
      }
    } catch (error) {
      blockedSave = !!rawSave;
      saveWarning = rawSave ? 'The saved company could not be read. It is preserved on this device. Open Company to recover it or explicitly replace it.' : 'Device storage is unavailable. Your company can run in this tab, but progress cannot be saved.';
    }
    root.classList.add('builder-mode');
    root.innerHTML = '<div class="builder-shell"></div>';
    const mount = root.querySelector('.builder-shell');
    const approved = () => state.buildings.length > 0;
    const getStatus = () => B.status(state);
    const getFinance = () => B.finance(state);
    const buildingAt = plot => state.buildings.find(building => building.plot === plot);
    const nameOf = type => B.BUILDINGS[type]?.name || type;
    const fact = (label, value, cls) => '<div class="' + (cls || '') + '"><dt>' + label + '</dt><dd>' + value + '</dd></div>';

    function save() {
      if (blockedSave) return false;
      try {
        localStorage.setItem(KEY, B.serialize(state));
        saveWarning = '';
        return true;
      } catch (error) {
        saveWarning = 'Your latest progress could not be saved. Keep this tab open. Download a backup in Company before leaving.';
        return false;
      }
    }
    function message(text, bad) { notice = text; noticeError = !!bad; }
    function stopTimer() { if (timer !== null) clearInterval(timer); timer = null; }
    function schedule() {
      stopTimer();
      if (!state.speed || disposed) return;
      timer = setInterval(() => {
        if (disposed || document.hidden) { pause('Paused while this tab is hidden.'); return; }
        const result = B.advance(state, 1);
        if (!result.ok) { message(result.error || 'The company needs your attention.', true); if(state.speed)B.setSpeed(state, 0); stopTimer(); }
        if (!state.speed) {stopTimer();if(getStatus().critical)message(state.pauseReason,true);}
        save();
        render();
      }, 1500 / state.speed);
    }
    function pause(reason) {
      if (!state.speed) return;
      B.setSpeed(state, 0);
      stopTimer();
      if (reason) message(reason);
      save();
      render();
    }
    function perform(result, text) {
      if (!result || !result.ok) message(result?.error || 'That action could not be completed.', true);
      else { message(text || 'Company updated.'); save(); }
      render();
      return !!result?.ok;
    }
    function topbar() {
      const s = getStatus(), f = getFinance();
      const serviceCount = state.buildings.filter(building => s.service[building.plot]).length;
      return '<header class="b-header"><div class="b-brand"><span class="b-brand-mark">' + icon('ship') + '</span><div><span>MONSOON</span><b>MERCHANT</b></div><span class="b-prototype">BUSINESS BUILDER</span></div>' +
        '<div class="b-header-right"><span class="b-season">' + icon('leaf') + esc(s.season) + '</span>' + button('Save &amp; exit', 'exit', 'b-subtle') + '</div></header>' +
        '<section class="b-metrics" aria-label="Company overview">' +
        '<div><span>Available cash</span><strong data-stat="cash">' + money(state.cash) + '</strong><small>Working capital</small></div>' +
        '<div><span>Operating profit</span><strong data-stat="profit" class="' + (f.operatingProfit < 0 ? 'b-negative' : 'b-positive') + '">' + signed(f.operatingProfit) + '</strong><small>Delivered sales less their costs · to date</small></div>' +
        '<div><span>District services</span><strong data-stat="service">' + (state.buildings.length ? serviceCount + '/' + state.buildings.length : 'Ready') + '<i class="b-status-dot"></i></strong><small>Road access &amp; utilities</small></div>' +
        '<div class="b-clock"><div><span>Company time</span><strong data-stat="day">Day ' + state.day + '</strong><small>' + (state.speed ? 'Running · ' + state.speed + '× speed' : 'Paused') + '</small></div><div class="b-speed" role="group" aria-label="Simulation speed">' +
        [[0,'Pause','Ⅱ'],[1,'Normal','▶'],[2,'Fast','▶▶'],[4,'Very fast','▶▶▶']].map(([speed,label,mark]) => button('<span aria-hidden="true">' + mark + '</span><span class="b-speed-label">' + label + '</span>', 'speed', state.speed === speed ? 'is-active' : '', ' data-speed="' + speed + '" aria-label="' + label + '" aria-pressed="' + (state.speed === speed) + '"' + ((!approved() || ui.policies || ui.routeEditing) && speed ? ' disabled' : ''))).join('') + '</div></div></section>';
    }
    function block(x, y, w, d, h, colors) {
      const iso = (dx,dy,dz) => (x + (dx-dy)*1.9) + ',' + (y + (dx+dy)*.95 - dz);
      return '<g><polygon points="' + [iso(0,0,0),iso(w,0,0),iso(w,0,h),iso(0,0,h)].join(' ') + '" fill="' + colors[1] + '"/><polygon points="' + [iso(w,0,0),iso(w,d,0),iso(w,d,h),iso(w,0,h)].join(' ') + '" fill="' + colors[2] + '"/><polygon points="' + [iso(0,0,h),iso(w,0,h),iso(w,d,h),iso(0,d,h)].join(' ') + '" fill="' + colors[0] + '"/><polygon points="' + [iso(0,0,0),iso(0,d,0),iso(w,d,0),iso(w,d,h),iso(0,d,h),iso(0,0,h)].join(' ') + '" fill="none" stroke="#0c353c" stroke-width="1.3" opacity=".5"/></g>';
    }
    function buildingArt(type, x, y, ghost) {
      let art = '';
      if (type === 'warehouse') {
        art = block(x-25,y-12,28,22,34,['#a5bdac','#4e7c78','#315e62']) +
          '<path d="m' + (x-25) + ' ' + (y-46) + ' 16-17 53 27-16 17Z" fill="#d3cfaf"/><path d="m' + (x-9) + ' ' + (y-63) + ' 42-21 53 27-42 21Z" fill="#e0dcc3"/>' +
          block(x-12,y+15,7,1,17,['#3e6b70','#173d4b','#244e55']) + block(x+13,y+28,7,1,17,['#3e6b70','#173d4b','#244e55']) +
          block(x-47,y+24,8,7,10,['#caa66d','#a17e50','#7e6344']);
      } else if (type === 'mill') {
        art = block(x-35,y-15,33,23,35,['#e5dab8','#b5b298','#748e83']) +
          block(x-28,y-11,9,8,52,['#f0dfaf','#c4b68c','#9c9f82']) +
          block(x+3,y+5,10,9,45,['#eddfbd','#c3bb98','#839d8d']) +
          block(x+27,y-2,6,6,77,['#d8b176','#b08755','#876b48']) +
          '<path d="M' + (x+38) + ' ' + (y-72) + 'q15-20 5-31" fill="none" stroke="#bdd3c6" stroke-width="9" opacity=".22" stroke-linecap="round"/>' +
          block(x-20,y+17,7,1,14,['#173c43','#214d55','#275b62']) + block(x+6,y+30,7,1,14,['#173c43','#214d55','#275b62']);
      } else if (type === 'depot') {
        art = block(x-32,y-15,28,20,26,['#8aa9a0','#466d68','#355656']) +
          block(x-42,y+10,12,5,10,['#e5b761','#a77736','#be9147']) +
          block(x-5,y+27,10,5,9,['#c5b388','#a08d63','#7d7758']) +
          '<path d="M' + (x-16) + ' ' + (y-35) + '  l0-24 18 9-18 8" fill="#68d2b9" stroke="#c6e0ce" stroke-width="2"/>';
      } else {
        art = block(x-30,y-3,47,15,10,['#b0b8a2','#667d71','#465f5d']) +
          block(x-19,y-12,15,9,19,['#d5a95b','#a37940','#7f623c']) +
          '<path d="M' + (x+34) + ' ' + (y+18) + 'v-73l-52-24v16l47 23M' + (x-18) + ' ' + (y-79) + 'v43" fill="none" stroke="#e0bb6d" stroke-width="5"/>' +
          '<path d="m' + (x+45) + ' ' + (y+39) + ' 47 4 26-10-7 18-45 7Z" fill="#d7cfb1"/><path d="m' + (x+56) + ' ' + (y+36) + ' 24-5 17 9-25 5Z" fill="#c28452"/>';
      }
      return '<g' + (ghost ? ' opacity=".38"' : '') + '>' + art + '</g>';
    }
    function localMap() {
      const s = getStatus();
      const center = plot => ({x:430+(plot.x-plot.y)*104,y:190+(plot.x+plot.y)*54});
      let plots = B.PLOTS.map(plot => {
        const p = center(plot), built = buildingAt(plot.id), proposed = !approved() && B.STARTER.find(item => item.plot === plot.id);
        const selected = ui.plot === plot.id, type = built?.type || proposed?.type;
        const label = plot.name + (built ? ', ' + nameOf(built.type) + ', level ' + built.level : ', available plot') + (s.service[plot.id] ? ', serviced' : ', no utility access');
        return '<g class="b-map-plot' + (selected ? ' is-selected' : '') + (built ? ' is-built' : '') + '" role="button" tabindex="0" data-b="plot" data-plot="' + plot.id + '" aria-label="' + esc(label) + '" aria-pressed="' + selected + '">' +
          '<title>' + esc(label) + '</title><polygon class="b-plot-base" points="' + [p.x+','+(p.y-41),(p.x+82)+','+p.y,p.x+','+(p.y+41),(p.x-82)+','+p.y].join(' ') + '" fill="' + (s.service[plot.id] ? '#305854' : '#344c4b') + '" stroke="' + (selected ? '#f4cc81' : '#587c70') + '" stroke-width="' + (selected ? 3 : 1) + '"/>' +
          (type ? buildingArt(type,p.x-8,p.y-12,!!proposed) : '<path d="M' + (p.x-10) + ' ' + p.y + 'h20m-10-7v14" stroke="' + (s.service[plot.id] ? '#a2bcb0' : '#647e77') + '" stroke-width="1.5"/>') +
          '<text x="' + p.x + '" y="' + (p.y+61) + '" class="b-plot-label">' + esc(type ? nameOf(type) : plot.name) + '</text>' +
          (selected ? '<circle cx="' + p.x + '" cy="' + (p.y+75) + '" r="3" fill="#f4cc81"/>' : '') + '</g>';
      }).join('');
      const road = '<path d="M326 190 742 406M222 244 638 460M534 190 222 352M638 244 326 406M742 298 430 460" stroke="#152e34" stroke-width="20" fill="none"/><path d="M326 190 742 406M222 244 638 460M534 190 222 352M638 244 326 406M742 298 430 460" stroke="#9caa85" stroke-width="1.3" stroke-dasharray="7 8" fill="none" opacity=".5"/>';
      return '<svg class="b-district-map" viewBox="0 0 1000 660" aria-label="Port Klang industrial district. Select a plot to inspect or build.">' +
        '<defs><pattern id="b-sea" width="60" height="26" patternUnits="userSpaceOnUse"><path d="M4 18h14m19-9h17" stroke="#4a8a90" opacity=".19" stroke-width="1.4"/></pattern><linearGradient id="b-land" x2="0" y2="1"><stop stop-color="#487065"/><stop offset="1" stop-color="#234a47"/></linearGradient><filter id="b-shadow"><feDropShadow dx="0" dy="15" stdDeviation="10" flood-opacity=".24"/></filter></defs>' +
        '<rect width="1000" height="660" fill="#102f3c"/><rect width="1000" height="660" fill="url(#b-sea)"/>' +
        '<path d="M430 136 846 352 534 514 118 298Z" fill="#061f2b" opacity=".3" transform="translate(0 29)"/>' +
        '<path d="M118 298 534 514 846 352v24L534 538 118 322Z" fill="#24423e"/>' +
        '<path d="M430 136 846 352 534 514 118 298Z" fill="url(#b-land)" stroke="#749084" stroke-width="2"/>' +
        '<path d="M125 298 534 510 839 352" fill="none" stroke="#9caa8d" stroke-width="6"/>' +
        road +
        '<path d="M178 244 325 166M788 349l43-24" stroke="#b4b58c" opacity=".3" stroke-width="3"/>' +
        '<g opacity=".65"><circle cx="370" cy="138" r="9" fill="#8bb18a"/><circle cx="352" cy="149" r="12" fill="#638e70"/><circle cx="805" cy="332" r="10" fill="#87ab82"/><circle cx="824" cy="344" r="8" fill="#709875"/><circle cx="214" cy="285" r="9" fill="#769879"/></g>' +
        plots +
        '<g class="b-water-label"><text x="186" y="502" transform="rotate(28 186 502)">STRAIT OF MALACCA</text><path d="M75 529h130m-52-12h107" stroke="#76a6a6" opacity=".3"/></g>' +
        '<g transform="translate(840 515)"><circle r="23" fill="#173843" stroke="#41636a"/><path d="M0-15 6 8 0 4-6 8Z" fill="#e6ddc4"/><text y="-34" text-anchor="middle" fill="#9dbcb6" font-size="11">N</text></g>' +
        '<g class="b-map-legend"><circle cx="43" cy="619" r="4" fill="#7bcbb7"/><text x="56" y="624">SERVICED DISTRICT</text><circle cx="261" cy="619" r="4" fill="#839587"/><text x="274" y="624">FUTURE LAND</text></g></svg>';
    }
    function regionalMap() {
      const activeShipments = state.shipments.filter(ship => ship.status === 'inTransit');
      return '<svg class="b-region-map" viewBox="0 0 1000 660" aria-label="Regional shipping network: Port Klang to Singapore">' +
        '<defs><pattern id="b-reg-sea" width="80" height="36" patternUnits="userSpaceOnUse"><path d="M5 24h20m30-13h13" stroke="#61999c" opacity=".14"/></pattern></defs>' +
        '<rect width="1000" height="660" fill="#102f3c"/><rect width="1000" height="660" fill="url(#b-reg-sea)"/>' +
        '<path d="M285-20 388-10 399 39 438 76 424 119 465 161 476 217 518 250 551 291 563 344 611 390 639 443 632 479 603 486 574 453 546 428 519 382 483 348 473 307 429 268 418 228 388 203 368 163 325 149 316 104 275 76Z" fill="#315950" stroke="#719082" stroke-width="2"/>' +
        '<path d="M20 275 76 275 113 311 153 326 184 358 246 388 287 435 322 462 347 515 391 551 408 610 449 663H170L115 580 85 536 50 471 0 411Z" fill="#284a45" stroke="#57796f" stroke-width="2"/>' +
        '<path d="M627 495 645 492 652 500 641 509 628 507Z" fill="#95b29a"/><path d="M723 597 783 571 879 582 946 617 1000 650v10H706Z" fill="#284a45" stroke="#57796f"/>' +
        '<text class="b-geography" x="437" y="180" transform="rotate(52 437 180)">MALAYSIA</text><text class="b-geography" x="175" y="474" transform="rotate(49 175 474)">SUMATRA</text>' +
        '<path class="' + (state.route.enabled ? 'b-route-line' : '') + '" d="M435 329C433 435 519 521 639 503" fill="none" stroke="' + (state.route.enabled ? '#e3b566' : '#627c7d') + '" stroke-width="3" stroke-dasharray="8 7"/>' +
        '<g role="button" tabindex="0" data-b="view" data-view="local" aria-label="Open Port Klang district"><circle cx="435" cy="329" r="20" fill="#65ccb4" opacity=".12"/><circle cx="435" cy="329" r="8" fill="#7fe3c6" stroke="#1c4850" stroke-width="4"/><rect x="244" y="291" width="162" height="69" rx="9" fill="#0d2530" stroke="#547e78"/><text x="261" y="317" class="b-city">PORT KLANG</text><text x="261" y="339" class="b-city-sub">Your home district ↗</text></g>' +
        '<g role="button" tabindex="0" data-b="tab" data-tab="markets" aria-label="Inspect Singapore export buyer"><circle cx="639" cy="503" r="20" fill="#e9bd71" opacity=".13"/><circle cx="639" cy="503" r="8" fill="#e9bd71" stroke="#1c4850" stroke-width="4"/><rect x="678" y="473" width="176" height="70" rx="9" fill="#0d2530" stroke="#776b4e"/><text x="696" y="500" class="b-city">SINGAPORE</text><text x="696" y="522" class="b-city-sub">' + (state.agreements.export ? 'Export buyer approved' : 'Export buyer available') + '</text></g>' +
        '<g transform="translate(484 444)"><rect x="-53" y="-24" width="157" height="46" rx="23" fill="#152a32" stroke="#827351"/><text x="25" y="4" text-anchor="middle" fill="#f0d49f" font-size="13">' + (activeShipments.length ? activeShipments.length + ' shipment' + (activeShipments.length === 1 ? '' : 's') + ' at sea' : 'Weekly sea freight') + '</text></g>' +
        '<text x="74" y="172" class="b-geography">STRAIT OF</text><text x="74" y="196" class="b-geography">MALACCA</text>' +
        '<text x="43" y="624" class="b-city-sub">One company · shared inventory · one clock</text></svg>';
    }
    function world() {
      return '<section class="b-world" aria-label="' + (ui.view === 'local' ? 'Local district' : 'Regional network') + '"><div class="b-world-heading"><div><span class="b-eyebrow">' + (ui.view === 'local' ? 'MALAYSIA · 03°N 101°E' : 'SOUTHEAST ASIA · TRADE NETWORK') + '</span><h1>' + (ui.view === 'local' ? 'Port Klang<span>Industrial District</span>' : 'Across the strait<span>Your regional network</span>') + '</h1></div><div class="b-view-toggle" role="group" aria-label="Map view">' + button('District', 'view', ui.view === 'local' ? 'is-active' : '', ' data-view="local" aria-pressed="' + (ui.view === 'local') + '"') + button('Regional', 'view', ui.view === 'regional' ? 'is-active' : '', ' data-view="regional" aria-pressed="' + (ui.view === 'regional') + '"') + '</div></div>' +
        '<div class="b-map-wrap">' + (ui.view === 'local' ? localMap() : regionalMap()) + '</div>' +
        '<div class="b-map-caption"><span><i class="b-status-dot"></i>' + (approved() ? (state.speed ? 'Your company is in motion' : 'Your district, at your pace') : 'A small district. A world of possibility.') + '</span><span>' + (ui.view === 'local' ? 'Select a building or plot to inspect' : 'Select a hub to inspect') + '</span></div></section>';
    }
    function starterPanel() {
      const total = B.STARTER.reduce((sum, item) => sum + B.BUILDINGS[item.type].cost, 0);
      return '<span class="b-eyebrow">YOUR FIRST VENTURE</span><h2>A little rice.<br>A growing business.</h2><p class="b-lead">Turn local rice into packaged food, then bring it to buyers across the strait.</p>' +
        '<div class="b-proposal-label"><span class="b-label-icon">' + icon('build') + '</span><div><b>Port Klang food company</b><small>Recommended starter proposal</small></div></div>' +
        '<div class="b-chain" aria-label="Supply chain"><span>Source<small>Rice depot</small></span><i>→</i><span>Make<small>Rice mill</small></span><i>→</i><span>Deliver<small>Local &amp; export</small></span></div>' +
        '<dl class="b-facts">' + fact('Capital investment', money(total)) + fact('Cash after construction', money(state.cash-total)) + fact('Weekly operating limits', money(Object.values(state.policy.weeklyBudget).reduce((a,b)=>a+b,0))) + '</dl>' +
        '<details class="b-proposal-details"><summary>Review four-building investment</summary><dl class="b-facts">' + B.STARTER.map(item => fact(esc(nameOf(item.type)), money(B.BUILDINGS[item.type].cost))).join('') + '</dl></details>' +
        '<p class="b-note">Approves four serviced buildings, both buyers and a recurring sea route. Weekly limits cover rice, production and freight; actual spending follows demand.</p>' +
        button('Approve company &amp; start ' + icon('arrow'), 'approve-starter', 'b-primary b-full', blockedSave ? ' disabled' : '') +
        '<p class="b-fine">Your team handles each day automatically.<br>You set the direction. Pause whenever you like.</p>';
    }
    function stocks() {
      const s = getStatus();
      return '<section class="b-stock"><div class="b-section-heading"><h3>Shared warehouse</h3><small>' + s.storageUsed + ' / ' + s.storageCapacity + ' t</small></div><div class="b-stock-pair"><div><span class="b-grain">◈</span><span>Raw rice<strong data-stock="rice">' + state.inventory.rice + ' <small>t</small></strong></span></div><div><span class="b-food">▦</span><span>Packaged food<strong data-stock="food">' + state.inventory.food + ' <small>t</small></strong></span></div></div><div class="b-meter"><span style="width:' + Math.min(100,s.storageCapacity ? s.storageUsed/s.storageCapacity*100 : 0) + '%"></span></div></section>';
    }
    function blockers() {
      const s = getStatus();
      if (!s.blockers.length) return '<div class="b-health">' + icon('check') + '<div><b>All systems connected</b><p>Supply, production and deliveries are authorized. Your team follows your budgets and reserve.</p></div></div>';
      const remedy = text => {
        if (text.includes('budget reached')) return 'New spending in this category waits until the next budget week. Raise the weekly limit, or let time reach the next reset.';
        if (text === 'Mill needs rice') return 'The mill cannot produce without input stock. Approved procurement replenishes rice on the next operating day if budget and cash allow.';
        if (text === 'Shared storage is full') return 'There is no room for new stock. Approve deliveries, reduce the stock buffer or expand the warehouse.';
        if (text === 'Delivery capacity limits production') return 'Production can make '+s.throughput.productionDemand+' t/day, but approved buyers can take about '+s.throughput.deliveryDailyCapacity.toFixed(1)+' t/day before monsoon delays. Extra food fills the warehouse. Upgrade the dock and raise the route load, shorten departures, or lower the production target.';
        if (text === 'Cash floor needs attention') return state.shipments.some(ship=>ship.status==='inTransit') ? 'Automatic operations have stopped to protect your reserve. Wait for paid shipment advances only cargo already at sea; all new spending and dispatches stay stopped until it arrives.' : 'Automatic operations have stopped to protect your reserve. No shipment is at sea to bring in cash. Review your cash reserve and operating policies before resuming.';
        if (text === 'Export route is paused') return 'No new cargo can reach the export buyer. Open Routes and approve the recurring route.';
        if (text === 'Approve a buyer agreement') return 'Finished goods have no authorized outlet. Open Markets and approve a local or export buyer.';
        if (text.includes('paused')) return 'This stage of the chain is not authorized. Open operating policies to turn it back on.';
        return 'This missing connection prevents the supply chain from operating. Select a serviced plot and build the required facility.';
      };
      const cause=s.critical ? 'Cash floor needs attention' : s.blockers[0],other=s.blockers.filter(text=>text!==cause);
      return '<div class="b-bottleneck"><span class="b-eyebrow">NEEDS YOUR ATTENTION</span><h3>' + esc(cause) + '</h3><p>' + esc(remedy(cause)) + '</p>' +
        (other.length ? '<p class="b-other-blockers">Also: ' + other.slice(0,2).map(esc).join(' · ') + '</p>' : '') +
        button('Review operating policies', 'policies', 'b-text-link') + '</div>';
    }
    function arrivalAction() {
      if(!state.shipments.some(ship=>ship.status==='inTransit'))return '';
      return button('Wait for paid shipment', 'wait-arrival', getStatus().critical ? 'b-primary b-full' : 'b-secondary b-full') + '<p class="b-fine">Advance to the nearest arrival, then pause. No new purchases, production, local sales or departures while waiting.</p>';
    }
    function overviewPanel() {
      const active = state.shipments.filter(ship => ship.status === 'inTransit'), next = getStatus().nextEventDay;
      return '<span class="b-eyebrow">THE BIG PICTURE</span><h2>Your company,<br>in motion.</h2><p class="b-lead">A connected supply chain, from Port Klang to Singapore.</p>' +
        stocks() + blockers() +
        '<div class="b-section-heading"><h3>On the horizon</h3><span class="b-pill">' + active.length + ' at sea</span></div>' +
        (active.length ? active.slice(0,3).map(ship => '<div class="b-shipment"><span class="b-label-icon">' + icon('ship') + '</span><div><b>' + ship.qty + ' t → Singapore</b><small>Arrives day ' + ship.arrivalDay + (ship.delay ? ' · monsoon delay +' + ship.delay + 'd' : '') + '</small></div></div>').join('') : '<p class="b-note">Your route checks for export cargo every ' + state.route.interval + ' days. Freight departs when stock, service and budget allow.</p>') +
        arrivalAction() + button('Next important event ' + icon('arrow'), 'step', 'b-secondary b-full', ' aria-label="Next important event"') +
        '<p class="b-fine">' + (next > state.day ? 'Advance toward day ' + next + ', then pause.' : 'Advance one company day, then pause.') + '</p>' +
        recentEvents();
    }
    function plotPanel() {
      const plot = B.PLOTS.find(item => item.id === ui.plot), built = buildingAt(plot.id), serviced = getStatus().service[plot.id];
      const status=getStatus();
      const placementNote=type=>{
        if(type!=='mill' && type!=='warehouse')return '';
        const neighbor=state.buildings.find(item=>item.type===(type==='mill'?'warehouse':'mill'));
        if(!neighbor)return 'Place the warehouse and mill next to one another for the best handling capacity.';
        const other=B.PLOTS.find(item=>item.id===neighbor.plot),distance=Math.abs(plot.x-other.x)+Math.abs(plot.y-other.y);
        const depotLevel=state.buildings.find(item=>item.type==='depot')?.level || 1;
        const handling=Math.max(2,10-Math.max(0,distance-1)*2+(depotLevel-1)*2);
        return 'This location is '+distance+' block'+(distance===1?'':'s')+' from the '+(type==='mill'?'warehouse':'mill')+'. Shared handling: '+handling+' t/day. Closer placement keeps goods moving.';
      };
      const capacityLabel=built ? ({depot:['District handling',status.handlingCapacity+' t/day'],warehouse:['Storage capacity',status.storageCapacity+' t'],mill:['Effective production',status.productionCapacity+' t/day'],dock:['Loading capacity',status.seaCapacity+' t']})[built.type] : null;
      return '<span class="b-eyebrow">' + esc(plot.name) + ' · ' + (plot.waterfront ? 'WATERFRONT' : 'INDUSTRIAL LAND') + '</span><h2>' + esc(built ? nameOf(built.type) : 'Room to grow.') + '</h2><p class="b-lead">' + (built ? esc(B.BUILDINGS[built.type].description) : 'Choose what belongs here. Location determines what your buildings can do.') + '</p>' +
        '<div class="' + (serviced ? 'b-health' : 'b-bottleneck') + '">' + icon(serviced ? 'check' : 'build') + '<div><b>' + (serviced ? 'Road &amp; utility access' : 'Outside the serviced district') + '</b><p>' + (serviced ? (plot.waterfront ? 'Waterfront access supports a shipping dock.' : 'Connected to the depot, storage and production network.') : 'This plot has no road or utility connection. Construction is unavailable; choose a serviced plot.') + '</p></div></div>' +
        (built ? '<dl class="b-facts">' + fact('Building level', built.level) + fact('Connection', serviced ? 'Operational' : 'Disconnected') + fact(capacityLabel[0],capacityLabel[1]) + '</dl>' + (placementNote(built.type) ? '<p class="b-note">'+esc(placementNote(built.type))+'</p>' : '') + button('Review upgrade ' + icon('arrow'), 'tab', 'b-secondary b-full', ' data-tab="upgrades"') + stocks() : '<div class="b-build-list">' + Object.entries(B.BUILDINGS).map(([type,data]) => {
          const existing = state.buildings.some(item => item.type === type), suitable = serviced && (type === 'dock' ? plot.waterfront : !plot.waterfront);
          return '<article><div><h3>' + esc(data.name) + '</h3><p>' + esc(data.description) + '</p>' + (!existing && suitable && placementNote(type) ? '<p class="b-placement-note">'+esc(placementNote(type))+'</p>' : '') + '<small>' + (existing ? 'Already built in your district' : !serviced ? 'Requires road and utility access' : !suitable ? (type === 'dock' ? 'Requires a waterfront plot' : 'Requires an inland plot') : state.cash-data.cost<state.policy.cashFloor ? 'Would breach your protected cash reserve' : 'Capital cost ' + money(data.cost)) + '</small></div>' + button(existing ? 'Built' : 'Build', 'place', 'b-secondary', ' data-type="' + type + '"' + (!suitable || existing || state.cash-data.cost<state.policy.cashFloor || blockedSave ? ' disabled' : '') + ' aria-label="Build ' + esc(data.name) + '"') + '</article>';
        }).join('') + '</div>') + button('Back to company overview', 'overview', 'b-text-link');
    }
    function buildPanel() {
      return '<span class="b-eyebrow">BUILD YOUR DISTRICT</span><h2>Everything<br>has its place.</h2><p class="b-lead">Select a plot on the map to inspect its service access and construction options.</p><div class="b-build-list">' +
        Object.entries(B.BUILDINGS).map(([type,data]) => '<article><span class="b-building-icon">' + icon(type === 'dock' ? 'ship' : 'build') + '</span><div><h3>' + esc(data.name) + '</h3><p>' + esc(data.description) + '</p><small>' + (state.buildings.some(item=>item.type===type) ? '✓ Built · inspect on map' : money(data.cost) + ' · one-time investment') + '</small></div></article>').join('') + '</div><p class="b-note">The inland district is serviced by road and utilities. Docks need a waterfront plot. The eastern expansion land is not yet serviced.</p>';
    }
    function routesPanel() {
      const dockCapacity=getStatus().seaCapacity,draft=ui.routeDraft || state.route;
      const routeField=(key,label,min,max,unit)=>'<label class="b-field" for="builder-route-'+key+'"><span>'+label+'</span><div><input id="builder-route-'+key+'" data-route-field="'+key+'" type="number" min="'+min+'" max="'+max+'" step="1" value="'+esc(draft[key])+'"'+(!dockCapacity?' disabled':'')+'><small>'+unit+'</small></div></label>';
      return '<span class="b-eyebrow">RECURRING LOGISTICS</span><h2>Across the strait.<br>On repeat.</h2><p class="b-lead">A standing sea route carries your packaged food to Singapore.</p>' +
        '<div class="b-route-card"><span>PORT KLANG</span>' + icon('ship') + '<span>SINGAPORE</span></div>' +
        '<dl class="b-facts">' + fact('Route authorization', state.route.enabled ? '<span class="b-positive">Approved</span>' : 'Awaiting approval') + fact('Shipment capacity', state.route.capacity + ' t') + fact('Departure interval', 'Every ' + state.route.interval + ' days') + fact('Sea transit', state.route.travelDays + ' days + monsoon delay') + fact('Weekly freight limit', money(state.policy.weeklyBudget.freight)) + fact('Approved export rate',getStatus().throughput.exportDailyCapacity.toFixed(1)+' t/day') + fact('Total approved delivery rate',getStatus().throughput.deliveryDailyCapacity.toFixed(1)+' t/day') + '</dl>' +
        '<div class="b-route-settings"><h3>Route settings</h3>'+routeField('capacity','Shipment load capacity',1,dockCapacity||24,'tonnes')+routeField('interval','Departure interval',4,30,'days')+'<p class="b-note">'+(dockCapacity?'Dock limit: '+dockCapacity+' t per shipment. Upgrade the dock to authorize larger loads. Departures can be 4–30 days apart.':'Build a harbour dock to configure this route.')+' Time pauses while you edit.</p>'+button('Apply route settings','save-route','b-secondary b-full',blockedSave||!dockCapacity?' disabled':'')+button('Discard route edits','cancel-route-edit','b-text-link')+'</div>'+
        '<p class="b-note">Cargo leaves only when the dock and warehouse are connected, the export buyer is approved, stock is available and freight fits your cash reserve and weekly budget. Payment arrives after delivery.</p>' +
        button(state.route.enabled ? 'Pause recurring route' : 'Approve recurring route', 'approve-route', 'b-primary b-full', blockedSave ? ' disabled' : '') +
        button('Review freight budget', 'policies', 'b-text-link') + arrivalAction() + stocks() +
        '<div class="b-section-heading"><h3>Shipping ledger</h3><small>Latest 4 shipments</small></div>' +
        (state.shipments.length ? state.shipments.slice(-4).reverse().map(ship=>'<div class="b-ledger-item"><div><b>' + ship.qty + ' t · Singapore</b><small>Departed day ' + ship.departDay + ' · arrival day ' + ship.arrivalDay + '</small></div><span>' + (ship.status === 'delivered' ? 'Delivered' : 'At sea') + '</span></div>').join('') : '<p class="b-note">Your first shipment will appear here once the route has cargo to carry.</p>');
    }
    function marketsPanel() {
      return '<span class="b-eyebrow">STANDING AGREEMENTS</span><h2>Make the goods.<br>Know the buyers.</h2><p class="b-lead">Approve a buyer once. Your team handles eligible deliveries as the company runs.</p>' +
        [['local','Klang food market','LOCAL BUYER','Receives available packaged food each day. Local deliveries share your depot handling capacity.'],
          ['export','Singapore distributor','EXPORT BUYER','Receives recurring sea shipments. Revenue is recognized when cargo arrives.']].map(([id,name,eyebrow,description]) => '<article class="b-buyer"><div class="b-section-heading"><span class="b-eyebrow">' + eyebrow + '</span><span class="b-pill ' + (state.agreements[id] ? 'b-good' : '') + '">' + (state.agreements[id] ? 'Approved' : 'Awaiting approval') + '</span></div><h3>' + name + '</h3><p>' + description + '</p>' + button(state.agreements[id] ? 'Pause buyer agreement' : 'Approve buyer agreement', 'approve-' + id, 'b-secondary b-full', blockedSave ? ' disabled' : '') + '</article>').join('') +
        '<p class="b-note">Buyer approvals, route approvals and delivery policy work together. Pausing an agreement stops new dispatches; goods already at sea keep their agreed sale terms.</p>' + stocks();
    }
    function upgradesPanel() {
      return '<span class="b-eyebrow">MAKE ROOM FOR MORE</span><h2>Grow the company<br>you already have.</h2><p class="b-lead">Expand the part of the chain that is holding you back.</p>' +
        '<div class="b-build-list">' + state.buildings.map(building => {
          const metadata = B.BUILDINGS[building.type], cost=metadata.upgradeCost*building.level, maxed=building.level>=3;
          return '<article><div><h3>' + esc(metadata.name) + '</h3><small>Level ' + building.level + '</small><p>' + esc(metadata.description) + '</p>' + button(maxed ? 'Fully upgraded' : 'Upgrade · ' + money(cost), 'upgrade', 'b-secondary', ' data-type="' + building.type + '"' + (blockedSave || maxed || state.cash-cost<state.policy.cashFloor ? ' disabled' : '') + ' aria-label="Upgrade ' + esc(metadata.name) + '"') + (!maxed && state.cash-cost<state.policy.cashFloor ? '<small>Would breach your protected cash reserve</small>' : '') + '</div></article>';
        }).join('') + '</div>' + (!state.buildings.length ? '<p class="b-note">Build your starter district to unlock upgrades.</p>' : '') + blockers();
    }
    function field(id,label,value,unit) {
      return '<label class="b-field" for="builder-' + id + '"><span>' + label + '</span><div><input id="builder-' + id + '" data-policy="' + id + '" type="number" min="0" step="1" value="' + value + '"><small>' + unit + '</small></div></label>';
    }
    function policiesPanel() {
      return '<span class="b-eyebrow">OPERATING POLICIES</span><h2>Set the rules.<br>Let it run.</h2><p class="b-lead">Time is paused while you edit. Limits reset every seven company days.</p>' +
        '<form id="builder-policy-form">' + field('cash-floor','Protected cash reserve',state.policy.cashFloor/100,'RM') +
        field('stock-buffer','Rice stock buffer',state.policy.stockBuffer,'tonnes') + field('production-target','Daily production target',state.policy.productionTarget,'tonnes') +
        '<h3 class="b-field-group">Weekly spending limits</h3>' + ['procurement','production','freight'].map(type=>field('budget-'+type,({procurement:'Rice procurement',production:'Production',freight:'Freight'})[type],state.policy.weeklyBudget[type]/100,'RM / week')).join('') +
        '<fieldset class="b-policy-switches"><legend>Team authorizations</legend>' + [['procurement','Auto-procure rice'],['production','Auto-produce packaged food'],['delivery','Auto-deliver to approved buyers']].map(([key,label])=>'<label><input type="checkbox" data-policy-toggle="' + key + '"' + (state.policy[key] ? ' checked' : '') + '><span>' + label + '</span></label>').join('') + '</fieldset>' +
        button('Apply operating policies', 'save-policy', 'b-primary b-full', blockedSave ? ' disabled' : '') + '</form>' + button('Back to Company', 'tab', 'b-text-link', ' data-tab="company"');
    }
    function recentEvents() {
      return '<section class="b-event-log"><h3>Company activity</h3>' + (state.events.length ? state.events.slice(-4).reverse().map(event=>'<div><span>D' + event.day + '</span><p>' + esc(event.message) + '</p></div>').join('') : '<p class="b-note">Your first operating day will appear here.</p>') + '</section>';
    }
    function companyPanel() {
      const f = getFinance();
      return '<span class="b-eyebrow">ONE COMPANY. ONE BALANCE.</span><h2>The numbers<br>behind the journey.</h2><dl class="b-facts">' + fact('Available cash',money(f.cash)) + fact('Delivered sales revenue',money(f.revenue)) + fact('Operating profit',signed(f.operatingProfit),'b-total') + fact('Operating cash flow',signed(f.operatingCashFlow)) + fact('Net cash change',signed(f.netCashChange)) + fact('Total cash spent',money(f.expenses)) + fact('Capital investment',money(f.capitalInvestment)) + fact('Inventory at cost',money(f.inventoryValue)) + fact('Company net worth',money(f.netWorth)) + '</dl>' +
        '<p class="b-note">Profit counts delivered sales and their goods and freight costs. Operating cash flow includes stock bought and freight prepaid. Inventory includes goods in transit and their prepaid freight; construction and upgrades are capital investment.</p>'+
        button('Edit operating policies ' + icon('arrow'), 'policies', 'b-primary b-full') + stocks() +
        '<h3 class="b-field-group">Progress on this device</h3><p class="b-note">Saved after every company day and decision. Returning always starts paused. Time stops when the tab is hidden.</p>' +
        button('Download company backup', 'backup', 'b-secondary b-full') +
        '<details class="b-restore"><summary>Restore a company backup</summary><label class="b-field" for="builder-import"><span>Paste a builder backup</span><textarea id="builder-import" rows="4" spellcheck="false" placeholder="Paste the contents of your company backup">' + esc(ui.importText) + '</textarea></label>' + button('Review backup', 'restore-backup', 'b-secondary b-full') +
        (ui.pendingImport ? '<div class="b-bottleneck"><b>Restore day ' + ui.pendingImport.day + '?</b><p>This replaces the current builder company with the reviewed backup. Other game saves are unaffected.</p><div class="b-confirm-actions">' + button('Cancel restore','cancel-restore','b-secondary') + button('Replace with backup','confirm-restore','b-danger') + '</div></div>' : '') + '</details>' +
        (blockedSave ? '<div class="b-bottleneck"><b>Saved progress preserved</b><p>The original save is unreadable. Download it before explicitly replacing it with a new company.</p>' + button('Download original save', 'backup-original', 'b-secondary') + '</div>' : '') +
        (ui.confirmReset ? '<div class="b-bottleneck"><b>Replace this builder company?</b><p>Your buildings, cargo, cash and progress will be replaced. Other game saves are unaffected.</p><div class="b-confirm-actions">' + button('Keep company', 'cancel-reset', 'b-secondary') + button('Replace company', 'reset', 'b-danger') + '</div></div>' : button('Start a new builder company', 'confirm-reset', 'b-text-link')) +
        recentEvents();
    }
    function inspector() {
      let html;
      if (ui.policies) html = policiesPanel();
      else if (ui.plot) html = plotPanel();
      else if (ui.tab === 'company') html = companyPanel();
      else if (ui.tab === 'routes') html = routesPanel();
      else if (ui.tab === 'markets') html = marketsPanel();
      else if (ui.tab === 'upgrades') html = upgradesPanel();
      else if (!approved()) html = starterPanel();
      else if (ui.tab === 'build') html = buildPanel();
      else html = overviewPanel();
      return '<aside class="b-inspector" aria-label="Company inspector" tabindex="-1">' + html + '</aside>';
    }
    function toolbar() {
      return '<nav class="b-toolbar" aria-label="Company tools"><div class="b-toolbar-hint"><span class="b-keycap">M</span><span>Make your next move</span></div><div class="b-tool-buttons">' + [['build','Build'],['routes','Routes'],['markets','Markets'],['upgrades','Upgrades'],['company','Company']].map(([tab,label])=>button(icon(tab) + '<span>' + label + '</span>', 'tab', ui.tab === tab ? 'is-active' : '', ' data-tab="' + tab + '" aria-pressed="' + (ui.tab === tab) + '"')).join('') + '</div><div class="b-autosave"><i class="b-status-dot"></i>' + (saveWarning ? 'Save needs attention' : 'Autosave on') + '</div></nav>';
    }
    function render() {
      if (disposed) return;
      const focused = document.activeElement, focusAction = focused?.dataset?.b, focusType = focused?.dataset?.type, focusSpeed = focused?.dataset?.speed, focusPlot = focused?.dataset?.plot, focusTab = focused?.dataset?.tab, focusView = focused?.dataset?.view;
      const oldInspector = mount.querySelector('.b-inspector'), scroll = oldInspector?.scrollTop || 0;
      mount.innerHTML = topbar() + (saveWarning ? '<div class="b-save-warning" role="alert">' + esc(saveWarning) + button('Company &amp; backups','tab','b-text-link',' data-tab="company"') + '</div>' : '') +
        '<div class="b-workspace">' + world() + inspector() + '</div>' +
        '<div class="b-notice ' + (noticeError || getStatus().critical ? 'is-error' : '') + '" role="status" aria-live="polite">' + esc(noticeError && notice ? notice : getStatus().critical && !state.speed ? state.pauseReason : notice || (state.speed ? 'Team at work. Each day follows your budgets, stock targets and buyer approvals.' : 'Company paused. Review your district or choose a speed to continue.')) + '</div>' + toolbar();
      mount.querySelector('.b-inspector').scrollTop = scroll;
      if (focusAction && root.contains(mount)) {
        let selector = '[data-b="' + focusAction + '"]';
        if (focusType) selector += '[data-type="' + focusType + '"]';
        if (focusSpeed) selector += '[data-speed="' + focusSpeed + '"]';
        if (focusPlot) selector += '[data-plot="' + focusPlot + '"]';
        if (focusTab) selector += '[data-tab="' + focusTab + '"]';
        if (focusView) selector += '[data-view="' + focusView + '"]';
        mount.querySelector(selector)?.focus({preventScroll:true});
      }
    }
    function showInspector() { mount.querySelector('.b-inspector')?.focus({preventScroll:true}); }
    function download(text,filename) {
      const url = URL.createObjectURL(new Blob([text],{type:'application/json'})), link = document.createElement('a');
      link.href = url; link.download = filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    function close(exit) {
      if (disposed) return;
      if(state.speed)B.setSpeed(state,0);
      const saved = save();
      if (exit !== false && !saved) { message('Progress is not saved. Download a company backup before leaving.', true); ui.tab='company';ui.policies=false;ui.plot=null;stopTimer();render();return; }
      disposed = true; stopTimer();
      mount.removeEventListener('click',click);
      mount.removeEventListener('keydown',keydown);
      mount.removeEventListener('focusin',focusin);
      mount.removeEventListener('input',input);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('blur',blur);
      window.removeEventListener('pagehide',pagehide);
      root.classList.remove('builder-mode');
      root.innerHTML = '<div id="screen" tabindex="-1"></div><div id="overlay"></div><div id="toasts" role="status" aria-live="polite" aria-relevant="additions text"></div>';
      previousClose = null;
      if (exit !== false) options.onExit?.();
    }
    function click(event) {
      const target = event.target.closest('[data-b]');
      if (!target || !mount.contains(target) || target.disabled) return;
      const action = target.dataset.b;
      if (action === 'exit') { close(true); return; }
      if (action === 'speed') {
        if (document.hidden) return;
        if(ui.routeEditing && Number(target.dataset.speed))return;
        if(!state.speed && !Number(target.dataset.speed)){message(getStatus().critical?state.pauseReason:'Company paused.',getStatus().critical);render();return;}
        if (perform(B.setSpeed(state,Number(target.dataset.speed)), Number(target.dataset.speed) ? 'Company running. Your team will handle the day-to-day.' : 'Company paused.')) schedule();
        return;
      }
      if (action === 'view') { ui.view=target.dataset.view; render(); return; }
      if (action === 'overview') { ui.tab='overview';ui.plot=null;ui.policies=false;ui.routeEditing=false;ui.routeDraft=null;render();return; }
      if (action === 'tab') {
        if (['routes','markets','company','upgrades','build'].includes(target.dataset.tab)) pause();
        ui.tab=target.dataset.tab;ui.plot=null;ui.policies=false;ui.routeEditing=false;ui.routeDraft=null;ui.confirmReset=false;render();showInspector();return;
      }
      if (action === 'plot') { pause();ui.plot=target.dataset.plot;ui.tab='build';ui.policies=false;ui.routeEditing=false;ui.routeDraft=null;render();showInspector();return; }
      if (action === 'policies') { pause();ui.policies=true;ui.tab='company';ui.plot=null;ui.routeEditing=false;ui.routeDraft=null;render();showInspector();return; }
      if (action === 'approve-starter') {
        if (perform(B.approveStarter(state),'Company approved. Buildings, buyers and the recurring route are connected.')) {
          B.setSpeed(state,1); ui.tab='overview'; save();schedule();render();showInspector();
        }
        return;
      }
      if (action === 'place') { perform(B.place(state,target.dataset.type,ui.plot),'Building added to your district.');return; }
      if (action === 'upgrade') { perform(B.upgrade(state,target.dataset.type),'Capacity upgraded. Review your operating targets to use it.');return; }
      if (action === 'approve-local' || action === 'approve-export') { const id=action.slice(8);perform(B.setAgreement(state,id,!state.agreements[id]),'Buyer agreement updated.');return; }
      if (action === 'approve-route') { perform(B.setRoute(state,{enabled:!state.route.enabled}),'Recurring route authorization updated.');return; }
      if (action === 'save-route') {
        const capacity=Number(mount.querySelector('#builder-route-capacity').value),interval=Number(mount.querySelector('#builder-route-interval').value);
        const max=getStatus().seaCapacity;
        const result=!Number.isSafeInteger(capacity)||capacity<1||capacity>max ? {ok:false,error:'Shipment load must be a whole number from 1 to '+max+' tonnes. Upgrade the dock for a larger load.'} : !Number.isSafeInteger(interval)||interval<4||interval>30 ? {ok:false,error:'Departure interval must be a whole number from 4 to 30 days.'} : B.setRoute(state,{capacity,interval});
        if(result.ok){ui.routeEditing=false;ui.routeDraft=null;}
        perform(result,'Route settings applied. Choose a speed when you are ready.');return;
      }
      if (action === 'cancel-route-edit') {ui.routeEditing=false;ui.routeDraft=null;render();return;}
      if (action === 'wait-arrival') {
        stopTimer();
        const result=B.waitForArrival(state);
        perform(result,'Paid shipment arrived on day '+state.day+'. All new spending was held during the wait. Company paused.');return;
      }
      if (action === 'save-policy') {
        event.preventDefault();
        const value = id => Number(mount.querySelector('#builder-'+id).value);
        const patch = {cashFloor:Math.round(value('cash-floor')*100),stockBuffer:value('stock-buffer'),productionTarget:value('production-target'),weeklyBudget:{}};
        for (const type of ['procurement','production','freight']) patch.weeklyBudget[type]=Math.round(value('budget-'+type)*100);
        for (const type of ['procurement','production','delivery']) patch[type]=mount.querySelector('[data-policy-toggle="'+type+'"]').checked;
        if (perform(B.setPolicy(state,patch),'Operating policies applied. Choose a speed when you are ready.')) { ui.policies=false;render();showInspector(); }
        return;
      }
      if (action === 'step') {
        stopTimer();
        const next=getStatus().nextEventDay, count=Math.max(1,Math.min(14,Number.isFinite(next) ? next-state.day : 1));
        const run=B.setSpeed(state,1);
        if (!run.ok) {perform(run);return;}
        let result={ok:true};
        for(let i=0;i<count && result.ok && state.speed;i++){result=B.advance(state,1);save();}
        if(state.speed)B.setSpeed(state,0);
        perform(result,getStatus().critical ? state.pauseReason : 'Advanced to day '+state.day+'. Company paused for your review.');
        return;
      }
      if (action === 'backup') { download(B.serialize(state),'monsoon-builder-day-'+state.day+'.json');message('Company backup downloaded.');render();return; }
      if (action === 'backup-original') { download(rawSave,'monsoon-builder-original-save.json');return; }
      if (action === 'restore-backup') {
        try {ui.pendingImport=B.deserialize(ui.importText);message('Backup verified. Review the replacement confirmation.');}
        catch(error){ui.pendingImport=null;message('That backup could not be read. Your company and saved progress have not changed.',true);}
        render();mount.querySelector('.b-restore').open=true;return;
      }
      if (action === 'cancel-restore') {ui.pendingImport=null;render();return;}
      if (action === 'confirm-restore' && ui.pendingImport) {
        try {
          const candidate=ui.pendingImport;
          localStorage.setItem(KEY,B.serialize(candidate));
          stopTimer();state=candidate;blockedSave=false;saveWarning='';ui.pendingImport=null;ui.importText='';ui.tab='overview';ui.plot=null;
          message('Company backup restored. Time is paused.');
        } catch(error) {
          message('The backup could not be saved. Your current company and saved progress have not changed.',true);
        }
        render();if(ui.pendingImport)mount.querySelector('.b-restore').open=true;return;
      }
      if (action === 'confirm-reset') {pause();ui.confirmReset=true;render();return;}
      if (action === 'cancel-reset') {ui.confirmReset=false;render();return;}
      if (action === 'reset') {stopTimer();state=B.create();blockedSave=false;ui.confirmReset=false;ui.tab='overview';ui.plot=null;ui.policies=false;save();message('New company ready for your approval.');render();return;}
    }
    function keydown(event) {
      const target=event.target.closest('svg [data-b]');
      if(target && ['Enter',' '].includes(event.key)){event.preventDefault();click({target,preventDefault:()=>{}});}
      if(event.key==='Escape' && (ui.plot||ui.policies||ui.routeEditing)){ui.plot=null;ui.policies=false;ui.routeEditing=false;ui.routeDraft=null;ui.tab='overview';render();}
    }
    function focusin(event) {
      if(event.target.dataset.routeField){
        if(!ui.routeDraft)ui.routeDraft={capacity:String(state.route.capacity),interval:String(state.route.interval)};
        ui.routeEditing=true;
        if(state.speed){B.setSpeed(state,0);stopTimer();save();}
        // Update playback controls without replacing the field being edited.
        mount.querySelectorAll('[data-b="speed"]').forEach(control=>{const speed=Number(control.dataset.speed);control.disabled=!!speed;control.classList.toggle('is-active',speed===0);control.setAttribute('aria-pressed',String(speed===0));});
        mount.querySelector('.b-clock small').textContent='Paused';
      } else if(event.target.matches('input,select,textarea'))pause();
    }
    function input(event) {if(event.target.id==='builder-import'){ui.importText=event.target.value;ui.pendingImport=null;}if(event.target.dataset.routeField && ui.routeDraft)ui.routeDraft[event.target.dataset.routeField]=event.target.value;}
    function visibility(){if(document.hidden)pause('Company paused while this tab is hidden.');}
    function blur(){pause('Company paused while you are away.');}
    function pagehide(){if(state.speed)B.setSpeed(state,0);stopTimer();save();}
    mount.addEventListener('click',click);
    mount.addEventListener('keydown',keydown);
    mount.addEventListener('focusin',focusin);
    mount.addEventListener('input',input);
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('blur',blur);
    window.addEventListener('pagehide',pagehide);
    previousClose=close;
    if(rawSave && !blockedSave)save();
    render();
    mount.querySelector('h1')?.setAttribute('tabindex','-1');
    mount.querySelector('h1')?.focus({preventScroll:true});
    return {close:()=>close(true)};
  }
  window.MMBuilderUI = {open, SAVE_KEY:KEY};
})();
