/* Monsoon Merchant — user interface. */
(function () {
  'use strict';
  const APP_VERSION = '2.2.0';
  const MAP = window.MAP;
  const rm = MM.rm;
  const root = document.getElementById('app');

  /* ================= Storage ================= */
  const KEYS = { meta: 'mm.meta.v1', normal: 'mm.run.normal.v1', daily: 'mm.run.daily.v1' };
  let storageWarning = false;
  function savingFailed() {
    if (!storageWarning) toast('Progress could not be saved. Keep this tab open and copy a backup from the menu.', 'bad');
    storageWarning = true;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { savingFailed(); return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); return true; } catch (e) { savingFailed(); return false; } }
  function loadMeta() { const raw = lsGet(KEYS.meta); if (raw) { try { return MM.deserializeMeta(raw); } catch (e) { /* fall through */ } } return MM.newMeta(); }
  function saveMeta() { return lsSet(KEYS.meta, JSON.stringify(meta)); }
  function loadSlot(slot) {
    const raw = lsGet(KEYS[slot]); if (!raw) return null;
    try { const s = MM.deserialize(raw); return s.phase === 'ended' ? null : s; } catch (e) { return null; }
  }
  function saveRun() { if (!run || !UI.slot) return true; return run.phase === 'ended' ? lsDel(KEYS[UI.slot]) : lsSet(KEYS[UI.slot], MM.serialize(run)); }

  function restoreBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid backup');
    const nextMeta = MM.deserializeMeta(JSON.stringify(data.meta));
    const values = [[KEYS.meta, JSON.stringify(nextMeta)]];
    ['normal', 'daily'].forEach(slot => {
      const raw = data[slot];
      if (raw !== null && raw !== undefined) {
        const saved = MM.deserialize(raw);
        if (saved.mode !== slot) throw new Error('Wrong save slot');
      }
      values.push([KEYS[slot], raw == null ? null : raw]);
    });
    // Validate every slot before touching storage; keep old values for rollback.
    let previous;
    try { previous = values.map(([key]) => [key, localStorage.getItem(key)]); }
    catch (error) { const failure = new Error('Restore could not access this device’s storage. Your progress was not changed.'); failure.storage = true; throw failure; }
    let written = 0;
    try {
      values.forEach(([key, value]) => {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
        written++;
      });
    } catch (error) {
      let rolledBack = true;
      for (let i = written - 1; i >= 0; i--) {
        const [key, value] = previous[i];
        try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); }
        catch (rollbackError) { rolledBack = false; }
      }
      const failure = new Error(rolledBack ? 'Restore could not be saved. Your previous progress is unchanged.' : 'Restore failed and previous saves could not be fully recovered. Keep this tab and your backup code open.');
      failure.storage = true;
      throw failure;
    }
    return nextMeta;
  }

  let meta = loadMeta();
  let run = null;
  const UI = {
    screen: 'title', slot: null, tab: 'market', sheet: null, modal: null,
    setup: { captain: 'rahim', level: 0, days: +(lsGet('mm.setup.days') || 0) || MM.SEASON_DAYS[0] }, lastCash: null, final: null, endRun: null,
    sea: { timer: null, raf: null, fast: false, frac: 0 }, seenNews: 0, installEvt: null, swWaiting: null,
    scroll: {}, legacyCat: 'Captains', importOpen: false, widgets: [], owidgets: [], seaScene: null, seaMap: null,
  };

  /* ================= Sound & haptics ================= */
  SFX.config({ sound: () => !!meta.settings.sound, music: () => !!meta.settings.sound && !!meta.settings.music });
  const Sound = SFX.S;
  function buzz(p) { if (meta.settings.haptics && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* ignore */ } } }

  /* ================= Helpers ================= */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Math.round(n).toLocaleString('en-US');
  function pct(x, d) { const v = Math.abs(x * 100).toFixed(d || 0); if (+v === 0) return '0%'; return (x > 0 ? '+' : '−') + v + '%'; }
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function prettyDate(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  const gName = g => MM.GOODS[g].name;
  const pName = p => MM.PORTS[p].name;
  const pShort = p => MM.PORTS[p].short;
  const reduceMotion = () => !meta.settings.motion || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ================= Pixel sprites ================= */
  PX.installCSS();
  const I = {};
  Object.keys(ART_BASE.ICONS).forEach(k => { I[k] = '<i class="ic ic-' + k + '" aria-hidden="true"></i>'; });
  const GC = { rice: '#ebc98f', palm: '#ffd65c', rubber: '#8d8a99', steel: '#6fb7ea', coffee: '#c08f58', electronics: '#39c3b2', durian: '#84cf54', coal: '#57556b' };
  const gIcon = (g, cls) => '<i class="gi gi-' + g + ' ' + (cls || '') + '" aria-hidden="true"></i>';
  function captAvatar(id, size) { return '<i class="pt pt-' + id + '" style="--s:' + (size || 48) + 'px" aria-hidden="true"></i>'; }
  const EV_ICON = { storm: 'storm', pirates: 'pirates', engine: 'engine', salvage: 'salvage', trader: 'trader', crew: 'crew', current: 'current', radio: 'radio', customs: 'customs' };
  const EV_SPEAKER = { pirates: 'Bosun', storm: 'Lookout', engine: 'Engineer', salvage: 'Lookout', trader: 'Radio officer', crew: 'Cook', current: 'Navigator', radio: 'Radio officer', customs: 'Customs officer' };

  /* ================= Toasts ================= */
  function toast(text, kind) {
    const host = document.getElementById('toasts'); if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = (kind === 'ach' ? I.star : kind === 'bad' ? I.info : kind === 'good' ? I.check : I.info) + '<span>' + esc(text) + '</span>';
    host.appendChild(el);
    // Keep at most three on screen so quick play never buries the game; achievements stay longest.
    const live = Array.from(host.children).filter(t => !t.classList.contains('out'));
    if (live.length > 3) live.filter(t => t !== el).sort((a, b) => (a.classList.contains('ach') ? 1 : 0) - (b.classList.contains('ach') ? 1 : 0)).slice(0, live.length - 3).forEach(t => { t.classList.add('out'); setTimeout(() => t.remove(), 300); });
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }
  function floatText(text, good) {
    const host = root;
    const el = document.createElement('div');
    el.className = 'floater ' + (good ? 'pos' : 'neg');
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  /* ================= Tips ================= */
  const TIPS = {
    market: 'Buy cargo here, open Map to choose a destination, then sail and sell. Keep cash for voyage costs. Price tags compare with the regional average; prices elsewhere may be old.',
    map: 'Tap a port to plan a voyage. You only see live prices where you are. Elsewhere you see the last prices you heard, so check how old they are.',
    office: 'Contracts pay a premium if you deliver by a deadline. Banks lend cheaply at big ports. The Ah Long lends anywhere, at 3% a day.',
    ship: 'Bigger ships carry more but cost more to run each day. Your ship counts toward net worth at 60% of its price.',
    company: 'Your company grows with you: warehouses at RM 150k net worth, factories at RM 500k, freight at RM 1M. Standing orders run every day, even while you sail, and never spend below your cash reserve.',
    sea: 'Each day at sea costs running costs. Storms and pirates can strike. Insurance pays back 80% of cargo you lose.',
  };
  function tip(id) {
    if (!meta.settings.tips || meta.tips[id]) return '';
    return '<div class="tip">' + I.info + '<p>' + esc(TIPS[id]) + '</p><button class="tip-ok" data-a="tip-ok" data-id="' + id + '">Got it</button></div>';
  }

  /* ================= Widgets: pixel scenes and the sea chart ================= */
  // Placeholders are rendered as HTML, then mounted with live canvases after each render.
  function sceneHTML(id, opts, cls) { UI.pending = UI.pending || {}; UI.pending[id] = opts; return '<div class="scene ' + (cls || '') + '" data-scene="' + id + '"><canvas></canvas></div>'; }
  function mapHTML(id, opts) { UI.pending = UI.pending || {}; UI.pending[id] = opts; return '<div class="pxmap" data-map="' + id + '"' + (opts.interactive ? ' data-a="map"' : '') + '><div class="map-labels"></div></div>'; }
  function mountIn(host, list) {
    host.querySelectorAll('[data-scene]').forEach(el => {
      const o = (UI.pending || {})[el.dataset.scene] || {};
      const sc = new PX.Scene(el.querySelector('canvas'), Object.assign({ still: reduceMotion() }, o));
      sc.start(); list.push(sc); el._w = sc;
      if (el.dataset.scene === 'sea') UI.seaScene = sc;
    });
    host.querySelectorAll('[data-map]').forEach(el => {
      const o = (UI.pending || {})[el.dataset.map] || {};
      const mv = new PX.MapView(el, Object.assign({ still: reduceMotion() }, o));
      mv.start(); list.push(mv); el._w = mv;
      const lab = el.querySelector('.map-labels');
      if (lab && o.labels !== false) {
        lab.innerHTML = MM.PORT_IDS.map(p => {
          const [x, y] = mv.labelPos(p);
          const L = MAP.LABELS[p] || [0, 0, 'middle'];
          const cls = ['lbl', o.here === p ? 'here' : '', (o.locked || []).indexOf(p) >= 0 ? 'locked' : '', o.selected === p ? 'sel' : '', L[2] === 'end' && x < 20 ? 'start' : L[2]].join(' ');
          return '<span class="' + cls + '" style="left:' + x.toFixed(2) + '%;top:' + y.toFixed(2) + '%">' + esc(pShort(p)) + '</span>';
        }).join('');
      }
      if (el.dataset.map === 'sea') UI.seaMap = mv;
      if (el.dataset.map === 'main') UI.mainMap = mv;
    });
  }
  function unmount(list) { while (list.length) { const w = list.pop(); try { w.stop(); } catch (e) { /* ignore */ } } }
  function animateShip(toFrac, ms) {
    cancelAnimationFrame(UI.sea.raf);
    const from = UI.sea.frac;
    const apply = f => { UI.sea.frac = f; if (UI.seaMap) UI.seaMap.set({ frac: f }); };
    if (reduceMotion() || ms <= 0) { apply(toFrac); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms); apply(from + (toFrac - from) * k); if (k < 1) UI.sea.raf = requestAnimationFrame(step); };
    UI.sea.raf = requestAnimationFrame(step);
  }
  function lockedPorts(s) { return MM.PORT_IDS.filter(p => s.ports.indexOf(p) < 0); }

  /* ================= Shared bits ================= */
  function topbar(title, backAction, right) {
    return '<header class="topbar"><button class="icon-btn" data-a="' + (backAction || 'go-title') + '" aria-label="Back">' + I.back + '</button><h2>' + esc(title) + '</h2><div class="topbar-right">' + (right || '') + '</div></header>';
  }
  function windChip(s) {
    const days = s.monsoon.shifted ? null : s.monsoon.forecast - s.day;
    let sub = '';
    if (days !== null) sub = s.level >= 10 ? '?' : days > 0 ? days + 'd' : 'now';
    return '<button class="chip wind ' + (s.monsoon.phase === 'NE' ? 'ne' : 'sw') + '" data-a="wind-info">' + I.wind + '<b>' + s.monsoon.phase + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  }
  function hud() {
    const s = run;
    const nw = MM.netWorth(s), debt = s.bank + s.along;
    const used = MM.cargoUsed(s), cap = MM.shipCap(s);
    const loc = s.phase === 'sea' ? pShort(s.voyage.from) + ' » ' + pShort(s.voyage.to) : (pName(s.port).length > 12 ? pShort(s.port) : pName(s.port));
    const rv = s.rival ? s.rival.nw : 0, ahead = nw >= rv;
    return '<header class="hud">' +
      '<div class="hud-r1"><button class="menu-btn" data-a="menu" aria-label="Menu">' + I.menu + '</button><div class="loc">' + (s.phase === 'sea' ? I.ship : I.anchor) + '<span>' + esc(loc) + '</span></div>' + windChip(s) +
      '<button class="day" data-a="season-info"><span>Day <b>' + s.day + '</b>/' + s.maxDays + '</span><i style="width:' + Math.min(100, (s.day / s.maxDays) * 100).toFixed(0) + '%"></i></button></div>' +
      '<div class="hud-r2">' +
      '<div class="stat cash">' + I.coins + '<div><small>Cash</small><b id="hudCash" class="' + (s.cash < 0 ? 'neg' : '') + '">' + rm(s.cash) + '</b></div></div>' +
      '<div class="stat">' + I.box + '<div><small>Hold</small><b>' + num(used) + '<span class="dim">/' + num(cap) + '</span></b></div></div>' +
      '<div class="stat worth">' + I.chart + '<div><small>Worth</small><b>' + rm(nw) + '</b></div>' + (debt > 0 ? '<span class="debt-badge">owes ' + rm(debt).replace('RM ', '') + '</span>' : '') + '</div>' +
      '</div>' +
      (s.rival ? '<button class="rivalbar ' + (ahead ? 'ahead' : 'behind') + '" data-a="rival-info">' + captAvatar('lim', 22) + '<span>' + esc(MM.RIVAL.name) + ' <b>' + rm(rv) + '</b></span><em>' + (ahead ? 'You lead by ' + rm(nw - rv) : 'Behind by ' + rm(rv - nw)) + '</em></button>' : '') +
      '</header>';
  }
  function tabs() {
    const s = run;
    const officeDot = s.offers.length > 0 || s.news.some(n => n.id > UI.seenNews && n.day <= s.day && n.kind === 'rumour');
    const shipDot = MM.PORTS[s.port].yard && s.ship.cond < 60;
    const t = (id, icon, label, dot) => '<button class="tab ' + (UI.tab === id ? 'on' : '') + '" data-a="tab" data-id="' + id + '"' + (UI.tab === id ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span>' + (dot ? '<i class="dot"></i>' : '') + '</button>';
    const coDot = MM.coStage(s) > (s.co.seenStage || 0) || !!s.co.dealOffer || s.co.alerts.some(a => MM.alertOpen(s, a));
    return '<nav class="tabs">' + t('market', I.market, 'Market') + t('map', I.map, 'Map') + t('ship', I.ship, 'Ship', shipDot) + t('company', I.company, 'Company', coDot) + t('office', I.office, 'Office', officeDot) + '</nav>';
  }
  const EV_TAG = { shortage: 'Shortage', glut: 'Glut', boom: 'Boom', bust: 'Slump', squeeze: 'Lim buying', dump: 'Lim dumping' };
  const isUp = k => k === 'shortage' || k === 'boom' || k === 'squeeze';
  function ageLabel(age) { return age <= 0 ? 'today' : age === 1 ? '1 day old' : age + ' days old'; }
  function ageClass(age) { return age <= 1 ? 'fresh' : age <= 5 ? 'aging' : 'stale'; }


  /* ================= Company tab ================= */
  const STAGE_ICON = ['ship', 'warehouse', 'factory', 'route'];
  const isProduct = g => !!MM.GOODS[g].product;
  function goodsShown(s) { const k = MM.coStage(s); return s.goods.filter(g => !isProduct(g) || k >= 2); }
  function coMapOpts(s) {
    const co = s.co;
    return { whs: Object.keys(co.wh), facs: Object.keys(co.fac), trips: co.routes.filter(r => r.trip).map(r => ({ from: r.from, to: r.to, frac: 0.3 + 0.5 * Math.min(1, (s.day - r.trip.depart) / Math.max(1, r.trip.arrive - r.trip.depart)) })) };
  }
  function stageCard(s) {
    const k = MM.coStage(s), nx = MM.nextStage(s);
    let h = '<section class="stagecard"><div class="stages">' + MM.STAGES.map((st, i) => '<div class="stg ' + (i <= k ? 'on' : '') + (i === k + 1 ? ' next' : '') + '">' + I[STAGE_ICON[i]] + '<small>' + esc(st.name) + '</small></div>').join('') + '</div>';
    if (nx) h += '<p class="small">Next: <b>' + esc(nx.name) + '</b> when your net worth reaches ' + rm(nx.at) + '. ' + esc(nx.desc) + '</p><div class="bar"><i class="pos" style="width:' + Math.min(100, (s.st.peak / nx.at) * 100).toFixed(0) + '%"></i></div>';
    else h += '<p class="small">Your whole supply chain is unlocked. It runs every day, even while you sail.</p>';
    return h + '</section>';
  }
  function orderLabel(o) {
    return (o.kind === 'buy' ? 'Buy ' : 'Sell ') + num(o.qty) + ' t ' + gName(o.g).toLowerCase() + ' a day · ' + (o.mode === 'cheap' ? 'when cheap' : o.mode === 'dear' ? 'when dear' : 'any price');
  }
  function routeStatus(s, r) {
    if (r.trip) return 'At sea with ' + num(r.trip.q) + ' t · arrives day ' + r.trip.arrive;
    if (r.paused) return 'Paused';
    return 'Waiting for stock in ' + pShort(r.from);
  }
  function whCard(s, p) {
    const w = s.co.wh[p], f = s.co.fac[p], k = MM.coStage(s);
    const used = MM.whUsed(w), cap = MM.whCap(w);
    let h = '<section class="whcard"><div class="wh-head">' + I.warehouse + '<b>' + esc(pName(p)) + '</b><small>Level ' + w.lvl + ' · ' + num(used) + '/' + num(cap) + ' t</small>' +
      (w.lvl < MM.CO.whMaxLvl ? '<button class="btn xs" data-a="wh-up" data-p="' + p + '"' + (s.cash < MM.CO.whUpCost || !MM.canAct(s) ? ' disabled' : '') + '>+' + MM.CO.whCap + ' t · ' + rm(MM.CO.whUpCost) + '</button>' : '') + '</div>';
    h += '<div class="bar"><i class="' + (used / cap > 0.9 ? 'warn' : 'pos') + '" style="width:' + Math.min(100, used / cap * 100).toFixed(0) + '%"></i></div>';
    if (MM.strikeAt(s, p)) h += '<p class="small warn">Dockers on strike: no loading, buying or selling here.</p>';
    if (w.pl.sold || w.pl.upkeep) h += '<div class="pl-row">' + plLine('Profit', w.pl.profit - w.pl.upkeep) + '<span class="dim">sales ' + rm(w.pl.sold) + ' · rent ' + rm(w.pl.upkeep) + '</span></div>';
    const st = Object.keys(w.stock);
    h += '<div class="chips">' + (st.length ? st.map(g => '<span class="mini">' + gIcon(g, 'xs') + num(Math.floor(w.stock[g].q)) + ' t</span>').join('') : '<span class="small dim">No stock</span>') + '</div>';
    if (f) {
      const R = MM.RECIPES[f.recipe];
      h += '<div class="facline">' + I.factory + '<span><b>' + esc(R.name) + (f.lvl > 1 ? ' · level 2' : '') + '</b><small>' + Object.keys(R.input).map(g => R.input[g] + ' ' + gName(g).toLowerCase()).join(' + ') + ' » ' + R.out + ' t ' + gName(f.recipe).toLowerCase() + ' · up to ' + R.batches * f.lvl * R.out + ' t a day</small><small class="' + (/Made/.test(f.note) ? 'pos' : 'warn') + '">' + esc(f.note || 'Starts tomorrow') + ' · made ' + num(f.made) + ' t</small>' + (f.made ? '<small>' + plLine('Value added', f.added - f.upkeep) + '</small>' : '') + '</span>' +
        (f.lvl < MM.CO.facMaxLvl ? '<button class="btn xs" data-a="fac-up" data-p="' + p + '"' + (s.cash < MM.CO.facUpCost || !MM.canAct(s) ? ' disabled' : '') + '>×2 · ' + rm(MM.CO.facUpCost) + '</button>' : '') + '</div>';
    }
    h += '<ul class="orders">' + w.orders.map(o => '<li class="' + o.kind + '">' + (o.kind === 'buy' ? I.down : I.up) + '<span>' + esc(orderLabel(o)) + '<small>' + num(o.done) + ' t so far</small></span><button class="icon-btn sm" data-a="order-del" data-p="' + p + '" data-id="' + o.id + '" aria-label="Remove order">' + I.close + '</button></li>').join('') + '</ul>';
    if (w.orders.length < MM.CO.orderMax) h += '<button class="btn sm ghost" data-a="order-new" data-p="' + p + '">' + I.plus + '<span>Standing order</span></button>';
    return h + '</section>';
  }
  function plLine(label, v) { return '<span class="pl ' + (v >= 0 ? 'pos' : 'neg') + '">' + label + ' ' + (v < 0 ? '−' : '') + rm(Math.abs(v)) + '</span>'; }
  function alertCards(s) {
    const open = s.co.alerts.filter(a => MM.alertOpen(s, a));
    if (!open.length) return '';
    return '<section><h3 class="sec">Needs you</h3>' + open.map(a => '<div class="alert-card ' + a.kind + '">' + (a.kind === 'boom' ? I.up : a.kind === 'breakdown' ? I.factory : I.warehouse) + '<div><p>' + esc(a.text) + '</p>' +
      '<div class="row-actions">' + a.choices.map((c, i) => '<button class="btn sm ' + (i === 0 ? 'primary' : 'ghost') + '" data-a="co-choose" data-id="' + a.id + '" data-c="' + c.id + '"' + (c.cost && s.cash < c.cost ? ' disabled' : '') + '>' + esc(c.label) + '</button>').join('') + '</div></div></div>').join('') + '</section>';
  }
  function dealLine(s, d, offer) {
    const cap = MM.RECIPES[d.g].batches * MM.RECIPES[d.g].out;
    return '<div class="deal-card' + (offer ? ' offer' : '') + '">' + gIcon(d.g, 'sm') + '<div class="deal-main"><b>' + num(d.qty) + ' t ' + esc(gName(d.g).toLowerCase()) + ' to ' + esc(pShort(d.port)) + '</b>' +
      '<small>By day ' + d.deadline + ' (' + plural(Math.max(0, d.deadline - s.day), 'day') + ' left) · ' + num(d.unit) + '/t on delivery · bonus ' + rm(d.bonus) + ' when complete</small>' +
      (offer ? '<small>One factory makes about ' + num(cap) + ' t a day. Deliver by ship, by freight route, or from your warehouse in ' + esc(pShort(d.port)) + '. No penalty if you fall short, but no bonus.</small>'
        : '<div class="bar"><i class="pos" style="width:' + Math.round(d.got / d.qty * 100) + '%"></i></div><small>' + num(d.got) + ' of ' + num(d.qty) + ' t delivered · ' + rm(d.paid) + ' paid so far</small>') +
      '</div>' + (offer ? '<div class="deal-act"><button class="btn sm primary" data-a="deal-accept"' + (s.co.deals.length >= 2 ? ' disabled' : '') + '>Accept</button><button class="btn sm ghost" data-a="deal-decline">Decline</button></div>' : '') + '</div>';
  }
  function dealCards(s) {
    const co = s.co;
    if (!co.dealOffer && !co.deals.length) return '';
    return '<section><h3 class="sec">Big orders <small>' + co.deals.length + '/2 running</small></h3>' + (co.dealOffer ? dealLine(s, co.dealOffer, true) : '') + co.deals.map(d => dealLine(s, d, false)).join('') + '</section>';
  }
  function reportCard(r, title, arrival) {
    if (!r || !MM.repActive(r)) return '';
    const cell = (label, v) => '<div><small>' + label + '</small><b>' + v + '</b></div>';
    const costs = r.upkeep + r.fees + r.freight;
    let h = '<section class="co-report' + (arrival ? ' arr' : '') + '"><h4>' + I.company + '<span>' + esc(title) + '</span></h4><div class="rep-grid">' +
      cell('Bought', rm(r.bought)) + cell('Made', num(r.made) + ' t') + cell('Shipped', num(r.shipped) + ' t') + cell('Sold', rm(r.sold)) +
      cell('Profit on sales', '<span class="' + (r.profit >= 0 ? 'pos' : 'neg') + '">' + (r.profit < 0 ? '−' : '') + rm(Math.abs(r.profit)) + '</span>') + cell('Running costs', rm(costs)) + '</div>';
    if (r.notes.length) h += '<ul class="rep-notes">' + r.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>';
    return h + '</section>';
  }
  function tabCompany() {
    const s = run, co = s.co, k = MM.coStage(s);
    if ((co.seenStage || 0) < k) co.seenStage = k;
    let h = tip('company') + stageCard(s);
    if (k === 0) return h + '<section class="muted-box">' + I.company + '<p>Trade your way to ' + rm(MM.STAGES[1].at) + ' net worth to open your first warehouse. Then factories and freight follow, and your company starts earning while you sail.</p></section>';
    h += '<section class="co-sum"><div><small>Company value</small><b>' + rm(MM.coValue(s, false)) + '</b></div><div><small>Upkeep a day</small><b>' + rm(MM.coDaily(s)) + '</b></div><div><small>Made</small><b>' + num(co.made) + ' t</b></div></section>';
    h += alertCards(s) + dealCards(s) + reportCard(s.co.rep, 'Since day ' + s.co.rep.from, false);
    h += '<section><h3 class="sec">Cash reserve <small>automation never spends below it</small></h3><div class="seg reserve">' + [0, 20000, 50000, 100000, 250000].map(v => '<button class="' + (co.reserve === v ? 'on' : '') + '" data-a="reserve" data-v="' + v + '">' + (v ? rm(v).replace('RM ', '') : 'None') + '</button>').join('') + '</div></section>';
    // here
    if (s.phase === 'port') {
      const here = co.wh[s.port];
      let a = '';
      if (!here) a = '<button class="btn primary" data-a="wh-build"' + (s.cash < MM.CO.whCost ? ' disabled' : '') + '>' + I.warehouse + '<span>Rent a warehouse in ' + esc(pShort(s.port)) + ' · ' + rm(MM.CO.whCost) + '</span></button><p class="small dim">' + num(MM.CO.whCap) + ' t of storage, ' + rm(MM.CO.whUpkeep) + ' a day.</p>';
      else if (k >= 2 && !co.fac[s.port]) a = '<button class="btn primary" data-a="fac-sheet">' + I.factory + '<span>Build a factory in ' + esc(pShort(s.port)) + '</span></button>';
      else if (k < 2 && !co.fac[s.port]) a = '<p class="small dim">Factories unlock at ' + rm(MM.STAGES[2].at) + '.</p>';
      if (a) h += '<section class="here"><h3 class="sec">Here in ' + esc(pName(s.port)) + '</h3>' + a + '</section>';
    }
    const ports = Object.keys(co.wh);
    h += '<section><h3 class="sec">Warehouses <small>' + ports.length + '</small></h3>' + (ports.length ? ports.map(p => whCard(s, p)).join('') : '<p class="empty">No warehouses yet. Sail to a port where you buy often and rent one there.</p>') + '</section>';
    if (k >= 3) {
      h += '<section><h3 class="sec">Freight routes <small>' + co.routes.length + '/' + MM.CO.routeMax + '</small></h3>';
      h += co.routes.map(r => { const q = MM.routeQuote(s, r.from, r.to, r.qty); return '<div class="route-row ' + (r.trip ? 'moving' : '') + '">' + I.route + '<span><b>' + esc(pShort(r.from)) + ' » ' + esc(pShort(r.to)) + ' · ' + num(r.qty) + ' t ' + esc(gName(r.g).toLowerCase()) + '</b><small>' + (r.dest === 'wh' ? 'To your warehouse' : 'Sell at market') + ' · ' + plural(q.days, 'day') + ' · ' + rm(q.cost) + ' a trip · ' + plural(r.trips, 'trip') + ' done</small><small>' + esc(routeStatus(s, r)) + '</small>' + (r.trips ? '<small>' + plLine('Profit', r.profit) + '</small>' : '') + '</span>' +
        '<button class="btn xs" data-a="route-pause" data-id="' + r.id + '">' + (r.paused ? 'Resume' : 'Pause') + '</button><button class="icon-btn sm" data-a="route-del" data-id="' + r.id + '" aria-label="Remove route"' + (r.trip ? ' disabled' : '') + '>' + I.close + '</button></div>'; }).join('');
      if (co.routes.length < MM.CO.routeMax) h += '<button class="btn sm ghost" data-a="route-new"' + (ports.length ? '' : ' disabled') + '>' + I.plus + '<span>New freight route</span></button>';
      h += '</section>';
    } else h += '<p class="small dim center-note">Freight routes unlock at ' + rm(MM.STAGES[3].at) + '.</p>';
    return h;
  }
  function chipRow(action, items, current, label) {
    return '<div class="chips pick">' + items.map(it => '<button class="chip-btn ' + (String(it.v) === String(current) ? 'on' : '') + '" data-a="' + action + '" data-v="' + esc(it.v) + '"' + (it.dis ? ' disabled' : '') + (label ? ' aria-label="' + esc(label + ' ' + it.t) + '"' : '') + '>' + (it.icon || '') + '<span>' + esc(it.t) + '</span></button>').join('') + '</div>';
  }
  function orderSheet() {
    const s = run, o = UI.sheet, w = s.co.wh[o.p];
    const goods = goodsShown(s).filter(g => !MM.GOODS[g].perish);
    const v = MM.vsAvg(s, o.p, o.g);
    let h = '<header class="sh-head"><span class="ul-ic">' + I.warehouse + '</span><div><h3>Standing order</h3><small>' + esc(pName(o.p)) + ' warehouse · runs every day</small></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header>';
    h += '<div class="seg"><button class="' + (o.kind === 'buy' ? 'on' : '') + '" data-a="ord-kind" data-v="buy">Buy</button><button class="' + (o.kind === 'sell' ? 'on' : '') + '" data-a="ord-kind" data-v="sell">Sell</button></div>';
    h += '<h4 class="sub">Cargo</h4>' + chipRow('ord-g', goods.map(g => ({ v: g, t: gName(g), icon: gIcon(g, 'xs') })), o.g);
    h += '<h4 class="sub">Tonnes a day</h4>' + chipRow('ord-q', [5, 10, 25, 50, 100, 200].map(n => ({ v: n, t: n + ' t' })), o.qty);
    h += '<h4 class="sub">When</h4>' + chipRow('ord-m', (o.kind === 'buy' ? [{ v: 'cheap', t: 'Only when cheap' }, { v: 'any', t: 'Any price' }] : [{ v: 'dear', t: 'Only when dear' }, { v: 'any', t: 'Any price' }]), o.mode);
    h += '<p class="small">Today in ' + esc(pShort(o.p)) + ': ' + gName(o.g) + ' ' + (o.kind === 'buy' ? 'costs ' + num(MM.buyPrice(s, o.p, o.g)) : 'sells for ' + num(MM.sellPrice(s, o.p, o.g))) + ' <span class="' + (v < -0.1 ? 'pos' : v > 0.1 ? 'warn' : 'dim') + '">(' + pct(v) + ' vs average)</span>. "Cheap" means 10% or more below average, "dear" 10% or more above.</p>';
    if (o.kind === 'sell') h += '<p class="small dim">In stock: ' + num(w.stock[o.g] ? Math.floor(w.stock[o.g].q) : 0) + ' t.</p>';
    return sheetWrap(h + '<button class="btn primary big" data-a="ord-save">Save order</button>', 'order');
  }
  function factorySheet() {
    const s = run, p = s.port;
    let h = '<header class="sh-head"><span class="ul-ic">' + I.factory + '</span><div><h3>Build a factory</h3><small>' + esc(pName(p)) + ' · ' + rm(MM.CO.facCost) + ' · ' + rm(MM.CO.facUpkeep) + ' a day</small></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header>';
    h += '<p class="blurb">It uses inputs from your warehouse here and puts the product back into it, every day. Add standing buy orders for the inputs and a sell order or freight route for the product.</p><ul class="recipes">';
    Object.keys(MM.RECIPES).forEach(id => {
      const R = MM.RECIPES[id];
      const cost = Object.keys(R.input).reduce((t, g) => t + R.input[g] * MM.buyPrice(s, p, g), 0) / R.out;
      const best = MM.bestKnownSell(s, id, null);
      const locked = Object.keys(R.input).some(g => s.goods.indexOf(g) < 0);
      h += '<li class="recipe"><div class="rc-io">' + Object.keys(R.input).map(g => '<span>' + R.input[g] + '×' + gIcon(g, 'xs') + '</span>').join('+') + '<span>»</span><span>' + R.out + '×' + gIcon(id, 'xs') + '</span></div><div class="rc-main"><b>' + esc(R.name) + ' · ' + esc(gName(id)) + '</b><small>Inputs here about ' + num(cost) + '/t of product · best known sale ' + (best ? esc(pShort(best.port)) + ' ' + num(best.price) : num(MM.GOODS[id].base) + ' average') + ' · up to ' + R.batches * R.out + ' t a day</small></div>' +
        '<button class="btn sm primary" data-a="fac-build" data-id="' + id + '"' + (s.cash < MM.CO.facCost || locked ? ' disabled' : '') + '>Build</button></li>';
    });
    return sheetWrap(h + '</ul>', 'factory');
  }
  function routeSheet() {
    const s = run, r = UI.sheet, co = s.co;
    const froms = Object.keys(co.wh);
    const w = co.wh[r.from];
    const goods = goodsShown(s).filter(g => !MM.GOODS[g].perish).sort((a, b) => ((w.stock[b] || {}).q || 0) - ((w.stock[a] || {}).q || 0));
    const q = MM.routeQuote(s, r.from, r.to, r.qty);
    const k = s.known[r.to];
    let h = '<header class="sh-head"><span class="ul-ic">' + I.route + '</span><div><h3>New freight route</h3><small>Repeats every trip until you pause it</small></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header>';
    h += '<h4 class="sub">From your warehouse</h4>' + chipRow('rt-from', froms.map(p => ({ v: p, t: pShort(p) })), r.from);
    h += '<h4 class="sub">Cargo</h4>' + chipRow('rt-g', goods.map(g => ({ v: g, t: gName(g) + (w.stock[g] ? ' (' + num(Math.floor(w.stock[g].q)) + ')' : ''), icon: gIcon(g, 'xs') })), r.g);
    h += '<h4 class="sub">Tonnes a trip</h4>' + chipRow('rt-q', [25, 50, 100, 150, 200].map(n => ({ v: n, t: n + ' t' })), r.qty);
    h += '<h4 class="sub">To</h4>' + chipRow('rt-to', s.ports.filter(p => p !== r.from).map(p => ({ v: p, t: pShort(p) })), r.to);
    h += '<div class="seg"><button class="' + (r.dest === 'mkt' ? 'on' : '') + '" data-a="rt-dest" data-v="mkt">Sell at market</button><button class="' + (r.dest === 'wh' ? 'on' : '') + '" data-a="rt-dest" data-v="wh"' + (co.wh[r.to] ? '' : ' disabled') + '>To my warehouse</button></div>';
    h += '<dl class="facts"><div><dt>Each trip</dt><dd>' + plural(q.days, 'day') + '</dd></div><div><dt>Freight cost</dt><dd>' + rm(q.cost) + '</dd></div>' + (k ? '<div><dt>' + esc(pShort(r.to)) + ' pays</dt><dd>' + num(k.mid[r.g] * (1 - MM.spreadOf(s) / 2)) + ' <i class="' + ageClass(s.day - k.day) + '">' + ageLabel(s.day - k.day) + '</i></dd></div>' : '') + '<div><dt>Risk</dt><dd>Small, insured</dd></div></dl>';
    return sheetWrap(h + '<button class="btn primary big" data-a="rt-save">Start route</button>', 'route');
  }

  /* ================= Screens ================= */
  function screenTitle() {
    const normal = loadSlot('normal');
    const daily = loadSlot('daily');
    const key = todayKey();
    const d = meta.daily;
    const dailyBest = d.best[key];
    const dailyLive = daily && daily.dateKey === key;
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    const streakNow = (d.last === key || d.last === MM.dayKeyShift(key, -1)) ? d.streak : 0;
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let install = '';
    if (!standalone) {
      if (UI.installEvt) install = '<button class="install btn ghost" data-a="install">' + I.download + '<span>Install the app</span></button>';
      else if (iOS) install = '<div class="install-hint">' + I.download + '<span>To install: tap <b>Share</b>, then <b>Add to Home Screen</b>.</span></div>';
    }
    return '<div class="screen title-screen">' +
      '<div class="title-top">' + sceneHTML('title', { mode: 'title', tod: 0.8, speed: 0.4 }, 'title-scene') +
      '<div class="logo"><h1><span>Monsoon</span><span>Merchant</span></h1><p>Buy low. Sail far. Beat the wind.</p></div></div>' +
      '<div class="title-bottom"><div class="title-actions">' +
      (storageWarning ? '<p class="warnline" role="status">Saving failed on this device. Copy a backup before closing the game.</p>' : '') +
      (UI.swWaiting ? '<button class="update" data-a="sw-update">' + I.spark + '<span>New version ready. <b>Tap to update</b></span></button>' : '') +
      (normal ? '<button class="btn primary big cont" data-a="continue" data-slot="normal"><span>Continue season</span><small>Day ' + normal.day + '/' + normal.maxDays + ' · ' + esc(normal.phase === 'sea' ? 'At sea' : pName(normal.port)) + ' · ' + rm(MM.netWorth(normal)) + '</small></button>' : '') +
      '<button class="btn ' + (normal ? 'ghost' : 'primary big') + '" data-a="new-season">' + I.play + '<span>New season</span></button>' +
      '<button class="daily-card" data-a="daily">' +
      '<div class="dc-l">' + I.calendar + '</div><div class="dc-m"><b>Daily Voyage</b><small>' + esc(prettyDate(key)) + (dailyLive ? ' · in progress, day ' + daily.day : dailyBest !== undefined ? ' · best ' + rm(dailyBest) : ' · same seas for everyone') + '</small></div>' +
      '<div class="dc-r ' + (streakNow > 0 ? 'live' : '') + '">' + I.flame + '<b>' + streakNow + '</b></div></button>' +
      '<div class="title-row">' +
      '<button class="tile" data-a="legacy">' + I.spark + '<span>Legacy</span><b>' + meta.lp + ' LP</b></button>' +
      '<button class="tile" data-a="ledger">' + I.trophy + '<span>Ledger</span><b>' + Object.keys(meta.ach).length + '/' + MM.ACH.length + '</b></button>' +
      '<button class="tile" data-a="settings">' + I.gear + '<span>Settings</span><b>' + (meta.settings.music && meta.settings.sound ? 'Music on' : 'Quiet') + '</b></button>' +
      '</div>' + archiveEntry() + install +
      '</div><div class="version">v' + APP_VERSION + ' · ' + ('serviceWorker' in navigator && navigator.serviceWorker.controller ? 'works offline' : 'offline after first load') + '</div></div></div>';
  }
  function archiveEntry() {
    const raw = lsGet('mm.company.v3') || lsGet('mm.company.v2') || lsGet('mm.network.v1');
    if (!raw) return '';
    let day = '';
    try { const c = JSON.parse(raw); if (c && Number.isFinite(c.day)) day = ' (day ' + c.day + '/60)'; } catch (e) { /* unreadable saves still open the archive */ }
    return '<button class="link-row archive" data-a="network">' + I.scroll + '<span>Archive: Monsoon Company<small>Finish your saved company campaign' + esc(day) + '. New ones start in a season now.</small></span></button>';
  }
  function setupDays(st) { return st.level >= 5 ? Math.round(st.days * 52 / 60) : st.days; }
  function screenSetup() {
    const st = UI.setup;
    let h = '<div class="screen setup">' + topbar('New season') + '<main class="scroll">';
    h += '<section><h3 class="sec">Choose your captain</h3><div class="captains">';
    MM.CAPTAIN_IDS.forEach(id => {
      const c = MM.CAPTAINS[id];
      const locked = c.unlock && !meta.unlocks[c.unlock];
      const cost = locked ? MM.UNLOCK_BY_ID[c.unlock].cost : 0;
      h += '<button class="capt ' + (st.captain === id ? 'on' : '') + (locked ? ' locked' : '') + '" data-a="pick-capt" data-id="' + id + '" aria-pressed="' + (st.captain === id) + '">' + captAvatar(id, 52) +
        '<div><b>' + esc(c.name) + '</b><small>' + esc(c.title) + '</small><p>' + esc(c.desc) + '</p>' +
        (locked ? '<span class="lockline">' + I.lock + ' Unlock in Legacy · ' + cost + ' LP</span>' : '<span class="startline">Starts in ' + esc(pName(c.start)) + '</span>') + '</div></button>';
    });
    h += '</div></section>';
    const len = setupDays(st), goal = MM.levelGoal({ maxDays: len });
    h += '<section><h3 class="sec">Season length</h3><div class="seg season-len">' + MM.SEASON_DAYS.map(d => '<button class="' + (st.days === d ? 'on' : '') + '" data-a="pick-days" data-id="' + d + '" aria-pressed="' + (st.days === d) + '"><b>' + d + ' days</b><small>' + (d === MM.SEASON_DAYS[0] ? 'Quicker season' : 'Time to build an empire') + '</small></button>').join('') + '</div></section>';
    h += '<section><h3 class="sec">Monsoon level</h3><div class="levels">';
    for (let n = 0; n <= 10; n++) {
      const locked = n > meta.levelMax;
      h += '<button class="lvl ' + (st.level === n ? 'on' : '') + (locked ? ' locked' : '') + '" data-a="pick-level" data-id="' + n + '" aria-label="Monsoon level ' + n + (locked ? ', locked' : '') + '" aria-pressed="' + (st.level === n) + '">' + (locked ? I.lock : n) + '</button>';
    }
    h += '</div>';
    const mods = MM.LEVELS.slice(1, st.level + 1).map(l => l.desc);
    h += '<div class="level-desc">' + (st.level === 0 ? '<p>Standard season. Finish worth <b>' + rm(goal) + '</b> or more to unlock level 1.</p>' : '<p>All of these apply:</p><ul>' + mods.map(m => '<li>' + esc(m) + '</li>').join('') + '</ul><p class="dim">Legacy earned ×' + (1 + 0.2 * st.level).toFixed(1) + '. Finish worth ' + rm(goal) + ' or more to unlock the next level.</p>') + '</div></section>';
    const unl = meta.unlocks;
    let cash = 50000 + (unl.perk_cash1 ? 25000 : 0) + (unl.perk_cash2 ? 50000 : 0) + (unl.perk_cash3 ? 100000 : 0);
    if (st.level >= 9) cash = Math.max(30000, cash - 20000);
    h += '<section class="setup-sum"><div><small>Starting cash</small><b>' + rm(cash) + '</b></div><div><small>Season</small><b>' + len + ' days</b></div><div><small>Ship</small><b>Old Coaster</b></div></section>';
    h += '</main><footer class="cta"><button class="btn primary big" data-a="start-season">' + I.play + '<span>Start season</span></button></footer></div>';
    return h;
  }

  function screenRun() {
    const s = run;
    let body = '';
    if (UI.tab === 'market') body = tabMarket();
    else if (UI.tab === 'map') body = tabMap();
    else if (UI.tab === 'ship') body = tabShip();
    else if (UI.tab === 'company') body = tabCompany();
    else body = tabOffice();
    return '<div class="screen run">' + hud() + '<main class="scroll" id="scroller">' + body + '</main>' + tabs() + '</div>';
  }

  function portBanner(s) {
    const P = MM.PORTS[s.port];
    const prof = MM.portProfile(s.port, s.goods);
    const night = s.day % 4 === 3;
    const fac = (P.bank ? '<span class="fac">' + I.bank + 'Bank</span>' : '') + (P.yard ? '<span class="fac">' + I.yard + 'Yard</span>' : '');
    return '<section class="port-banner"><div class="pb-art" style="background-image:url(' + PX.skylineURL(s.port, night) + ')"><div class="pb-name"><h2>' + esc(P.name) + '</h2><span class="cc">' + P.cc + '</span></div></div>' +
      '<div class="pb-body"><div class="pb-fac">' + fac + '</div><p>' + esc(P.blurb) + '</p>' +
      '<div class="profile">' + (prof.exports.length ? '<span class="lab">Cheap here</span>' + prof.exports.map(g => '<span class="mini">' + gIcon(g, 'xs') + esc(gName(g)) + '</span>').join('') : '') +
      (prof.imports.length ? '<span class="lab">Pays well</span>' + prof.imports.map(g => '<span class="mini">' + gIcon(g, 'xs') + esc(gName(g)) + '</span>').join('') : '') + '</div></div></section>';
  }
  function lastDayBanner(s) {
    if (s.day < s.maxDays) {
      if (s.maxDays - s.day <= 5) return '<div class="banner warn">' + I.clock + '<p><b>' + plural(s.maxDays - s.day, 'day') + ' left.</b> Any cargo still aboard at the end is sold wherever you are.</p></div>';
      return '';
    }
    return '<div class="banner end">' + I.flag + '<p><b>The season is over.</b> Sell what you want here, then close the books.</p><button class="btn primary" data-a="end-season">End season</button></div>';
  }
  function tabMarket() {
    const s = run;
    let h = portBanner(s) + tip('market') + lastDayBanner(s);
    const evs = [];
    s.goods.forEach(g => MM.activeEvents(s, s.port, g).forEach(e => evs.push(e)));
    if (evs.length) {
      h += '<div class="events">' + evs.map(e => '<div class="evline ' + e.kind + '">' + (e.rival ? I.sword : isUp(e.kind) ? I.up : I.down) + '<span>' + esc(e.headline) + '</span><small>until day ' + e.end + '</small></div>').join('') + '</div>';
    }
    h += whStrip(s);
    h += '<ul class="goods">';
    const shown = goodsShown(s);
    MM.marketRows(s).filter(r => shown.indexOf(r.g) >= 0).forEach(r => {
      const tagCls = r.vsAvg <= -0.12 ? 'cheap' : r.vsAvg >= 0.12 ? 'dear' : 'flat';
      const ev = r.events.length ? '<span class="evtag ' + r.events[0].kind + '">' + EV_TAG[r.events[0].kind] + '</span>' : '';
      let sub;
      if (r.hold > 0) {
        const plc = r.pl >= 0 ? 'pos' : 'neg';
        sub = '<span class="holdline">You hold <b>' + num(r.hold) + ' t</b> · paid ' + num(r.cost) + ' <b class="' + plc + '">' + pct(r.pl) + '</b></span>';
      } else if (r.bestSell) {
        sub = '<span class="best">Sells best: ' + esc(pShort(r.bestSell.port)) + ' ' + num(r.bestSell.price) + ' <i class="' + ageClass(r.bestSell.age) + '">' + (r.bestSell.age <= 0 ? 'now' : r.bestSell.age + 'd') + '</i></span>';
      } else sub = '<span class="best dim">No prices known elsewhere</span>';
      h += '<li><button class="good" data-a="trade" data-g="' + r.g + '">' + gIcon(r.g) +
        '<div class="g-main"><div class="g-name">' + esc(r.name) + ' <span class="vs ' + tagCls + '">' + pct(r.vsAvg) + '</span>' + ev + (r.perish ? '<span class="perish">' + I.clock + '</span>' : '') + '</div>' + sub + '</div>' +
        '<div class="g-px"><div><small>Buy</small><b>' + num(r.buy) + '</b></div><div><small>Sell</small><b>' + num(r.sell) + '</b></div></div></button></li>';
    });
    h += '</ul><p class="foot-note">Prices in RM per tonne. Big trades move the price against you.</p>';
    if (s.day < s.maxDays) h += '<div class="row-actions"><button class="btn ghost" data-a="wait">' + I.clock + '<span>Wait a day here</span></button></div>';
    return h;
  }

  function whStrip(s) {
    const w = s.co.wh[s.port];
    if (!w) return MM.coStage(s) >= 1 && s.phase === 'port' ? '<div class="banner co">' + I.warehouse + '<p><b>No warehouse here.</b> Rent one from the Company tab to store cargo and run standing orders.</p></div>' : '';
    const goods = goodsShown(s).filter(g => (s.cargo[g] && !MM.GOODS[g].perish) || w.stock[g]);
    let h = '<section class="whstrip"><div class="wh-head">' + I.warehouse + '<b>Your warehouse</b><small>' + num(MM.whUsed(w)) + '/' + num(MM.whCap(w)) + ' t</small></div>';
    const strike = MM.strikeAt(s, s.port);
    if (strike) h += '<p class="small warn">Dockers on strike. Nothing moves in or out until it ends (see Company).</p>';
    if (!goods.length) h += '<p class="small dim">Empty. Buy cargo, then store it here, or set a standing order in Company.</p>';
    else h += '<ul>' + goods.map(g => { const a = s.cargo[g] ? s.cargo[g].q : 0, b = w.stock[g] ? Math.floor(w.stock[g].q) : 0; return '<li>' + gIcon(g, 'sm') + '<span><b>' + esc(gName(g)) + '</b><small>Ship ' + num(a) + ' t · Warehouse ' + num(b) + ' t</small></span>' +
      '<button class="btn xs" data-a="wh-store" data-g="' + g + '"' + (a && MM.whFree(w) > 0 && !strike ? '' : ' disabled') + '>Store</button><button class="btn xs" data-a="wh-take" data-g="' + g + '"' + (b && MM.freeSpace(s) > 0 && !strike ? '' : ' disabled') + '>Load</button></li>'; }).join('') + '</ul>';
    return h + '</section>';
  }
  function priceBoard(s) {
    let h = '<section class="board"><h3 class="sec">Price board <small>from what you know</small></h3><ul>';
    s.goods.forEach(g => {
      const lo = MM.bestKnownBuy(s, g, null), hi = MM.bestKnownSell(s, g, null);
      h += '<li>' + gIcon(g, 'sm') + '<b>' + esc(gName(g)) + '</b>' +
        '<span class="lohi"><span>' + (lo ? 'Buy ' + esc(pShort(lo.port)) + ' <em>' + num(lo.price) + '</em> <i class="' + ageClass(lo.age) + '">' + (lo.age <= 0 ? 'now' : lo.age + 'd') + '</i>' : '—') + '</span>' +
        '<span>' + (hi ? 'Sell ' + esc(pShort(hi.port)) + ' <em>' + num(hi.price) + '</em> <i class="' + ageClass(hi.age) + '">' + (hi.age <= 0 ? 'now' : hi.age + 'd') + '</i>' : '—') + '</span></span></li>';
    });
    return h + '</ul></section>';
  }
  function tabMap() {
    const s = run;
    let h = tip('map');
    const sel = UI.sheet && UI.sheet.type === 'port' ? UI.sheet.p : null;
    h += '<div class="map-box">' + mapHTML('main', Object.assign({ interactive: true, here: s.port, selected: sel, dests: s.contracts.map(c => c.dest), locked: lockedPorts(s), wind: s.monsoon.phase }, coMapOpts(s))) +
      '<div class="map-legend"><span>' + I.anchor + 'You</span><span>' + I.star + 'Contract</span><span class="windnote">' + I.wind + (s.monsoon.phase === 'NE' ? 'NE monsoon: fast going southwest' : 'SW monsoon: fast going northeast') + '</span></div></div>';
    h += '<p class="center-note">Choose a port on the chart or from the list below.</p>';
    h += '<section class="destinations"><h3 class="sec">Ports & voyages</h3><ul>' + MM.PORT_IDS.map(p => {
      const here = p === s.port;
      const available = s.ports.indexOf(p) >= 0;
      const pl = available && !here ? MM.planVoyage(s, p) : null;
      const detail = here ? 'You are here' : !available ? (s.mode === 'daily' ? 'Not in today’s voyage' : 'Unlock in Legacy') : plural(pl.days, 'day') + ' · arrive day ' + pl.arrive + (pl.tooLate ? ' · after season end' : ' · ' + rm(pl.cost) + ' running cost');
      return '<li><button class="destination" data-a="port" data-p="' + p + '"><b>' + esc(pName(p)) + '</b><small>' + esc(detail) + '</small></button></li>';
    }).join('') + '</ul></section>';
    h += priceBoard(s);
    return h;
  }
  function tabShip() {
    const s = run;
    const sh = MM.SHIPS[s.ship.cls];
    const cond = s.ship.cond;
    let h = tip('ship');
    h += '<section class="shipcard">' + sceneHTML('ship', { ship: s.ship.cls, mode: 'dock', tod: 0.45, speed: 0 }, 'ship-scene') + '<div class="sc-top">' +
      '<div><h3>' + esc(sh.name) + '</h3><p>' + esc(sh.desc) + '</p></div></div>' +
      '<div class="sc-stats"><div><small>Hold</small><b>' + num(sh.cap) + ' t</b></div><div><small>Speed</small><b>' + MM.shipSpeed(s).toFixed(1) + ' kn</b></div><div><small>Per day</small><b>' + rm(MM.dailyCost(s)) + '</b></div><div><small>Value</small><b>' + rm(MM.tradeIn(s)) + '</b></div></div>' +
      '<div class="cond"><div class="cond-top"><span>Hull condition</span><b class="' + (cond < 35 ? 'neg' : cond < 65 ? 'warn' : 'pos') + '">' + Math.round(cond) + '%</b></div><div class="bar"><i style="width:' + cond + '%" class="' + (cond < 35 ? 'neg' : cond < 65 ? 'warn' : 'pos') + '"></i></div>' +
      (cond < 50 ? '<p class="small neg">Below 50% the ship is slower. At 0% she sinks.</p>' : '') + '</div>' +
      '<div class="ups">' + Object.keys(MM.UPGRADES).map(u => '<span class="up ' + (s.ship.up[u] || (u === 'cold' && MM.hasCold(s)) ? 'on' : '') + '">' + (s.ship.up[u] || (u === 'cold' && MM.hasCold(s)) ? I.check : I.lock) + esc(MM.UPGRADES[u].name) + '</span>').join('') + '</div></section>';
    // cargo
    const rows = MM.cargoRows(s);
    h += '<section><h3 class="sec">Cargo <small>' + num(MM.cargoUsed(s)) + ' of ' + num(sh.cap) + ' t</small></h3>';
    if (!rows.length) h += '<p class="empty">The hold is empty.</p>';
    else h += '<ul class="cargo">' + rows.map(r => '<li>' + gIcon(r.g, 'sm') + '<div><b>' + esc(r.name) + '</b><small>' + num(r.q) + ' t · paid ' + num(r.cost) + '/t' + (r.spoilIn !== null ? ' · <span class="' + (r.spoilIn <= 2 ? 'neg' : 'warn') + '">spoils in ' + plural(Math.max(0, r.spoilIn), 'day') + '</span>' : '') + '</small></div><b class="cv">' + rm(r.q * r.cost) + '</b></li>').join('') + '</ul>';
    h += '</section>';
    // shipyard
    const P = MM.PORTS[s.port];
    if (!P.yard) {
      const yards = s.ports.filter(p => MM.PORTS[p].yard).map(pShort).join(', ');
      h += '<section class="muted-box">' + I.yard + '<p>No shipyard here. Yards: ' + esc(yards) + '.</p></section>';
    } else {
      h += '<section><h3 class="sec">Shipyard</h3>';
      const rc = MM.repairCost(s);
      if (rc > 0) h += '<div class="yard-row"><div><b>Repair hull to 100%</b><small>' + rm(rc) + '</small></div><button class="btn sm" data-a="repair" ' + (s.cash < rc ? 'disabled' : '') + '>Repair</button></div>';
      Object.keys(MM.UPGRADES).forEach(u => {
        if (s.ship.up[u] || (u === 'cold' && MM.hasCold(s))) return;
        const U = MM.UPGRADES[u];
        h += '<div class="yard-row"><div><b>' + esc(U.name) + '</b><small>' + esc(U.desc) + '</small></div><button class="btn sm" data-a="upgrade" data-id="' + u + '" ' + (s.cash < U.price ? 'disabled' : '') + '>' + rm(U.price) + '</button></div>';
      });
      h += '<h4 class="sub">Ships for sale <small>trade-in ' + rm(MM.tradeIn(s)) + '</small></h4>';
      MM.shipOffers(s).forEach(o => {
        const up = o.cap > sh.cap;
        h += '<div class="ship-offer"><i class="sh sh-' + o.id + '"></i><div class="so-main"><b>' + esc(o.name) + '</b><small>' + esc(o.desc) + '</small><div class="so-stats"><span>' + num(o.cap) + ' t</span><span>' + o.speed + ' kn</span><span>' + rm(o.daily) + '/day</span>' + (o.cold ? '<span>Refrigerated</span>' : '') + '</div></div>' +
          '<button class="btn sm ' + (up ? 'primary' : '') + '" data-a="buy-ship" data-id="' + o.id + '" ' + (!o.fits || s.cash < o.net ? 'disabled' : '') + '>' + (o.net >= 0 ? rm(o.net) : '+' + rm(-o.net)) + '</button></div>';
      });
      h += '</section>';
    }
    return h;
  }

  function newsItem(s, n) {
    const icon = n.kind === 'rumour' ? I.rumour : n.kind === 'monsoon' ? I.wind : n.kind === 'rival' ? I.sword : isUp(n.kind) ? I.up : n.kind === 'glut' || n.kind === 'bust' || n.kind === 'dump' ? I.down : I.news;
    const age = s.day - n.day;
    let tag = '';
    if (n.kind === 'rumour' && s.captain === 'kumar') tag = '<span class="src ' + n.tag + '">' + (n.tag === 'solid' ? 'Kumar: solid source' : 'Kumar: shaky source') + '</span>';
    if (n.kind === 'rumour') tag = '<span class="src rum">Rumour</span>' + tag;
    if (n.kind === 'forecast') tag = '<span class="src rum">Forecast</span>';
    if (n.kind === 'deal') tag = '<span class="src co">Company</span>';
    if (n.kind === 'rival' || n.kind === 'squeeze' || n.kind === 'dump') tag = '<span class="src riv">' + esc(MM.RIVAL.name) + '</span>';
    const live = n.ev && s.events.some(e => e.id === n.ev && s.day >= e.start && s.day <= e.end);
    return '<li class="news ' + n.kind + (n.id > (UI.prevSeen || 0) ? ' new' : '') + '">' + icon + '<div><p>' + esc(n.text) + '</p><small>' + (age <= 0 ? 'Today' : age === 1 ? 'Yesterday' : age + ' days ago') + (live ? ' · <b>happening now</b>' + (n.end ? ', until day ' + n.end : '') : '') + '</small>' + tag + '</div></li>';
  }
  function stepChart(series, w, h) {
    // two stepped lines on a pixel grid: you (gold) vs the rival (red)
    const all = series.reduce((a, x) => a.concat(x.pts), []);
    if (all.length < 2) return '';
    const x0 = Math.min.apply(null, all.map(p => p[0])), x1 = Math.max.apply(null, all.map(p => p[0]));
    const y0 = Math.min(0, Math.min.apply(null, all.map(p => p[1]))), y1 = Math.max.apply(null, all.map(p => p[1]));
    const X = x => Math.round(((x - x0) / Math.max(1, x1 - x0)) * (w - 4) + 2);
    const Y = y => Math.round(h - 2 - ((y - y0) / Math.max(1, y1 - y0)) * (h - 4));
    let out = '<svg class="steps" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" shape-rendering="crispEdges">';
    for (let gy = 1; gy < 4; gy++) out += '<rect x="0" y="' + Math.round(h * gy / 4) + '" width="' + w + '" height="1" fill="#31508f"/>';
    series.forEach(sr => {
      let d = '';
      sr.pts.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); d += i ? 'H' + x + 'V' + y : 'M' + x + ',' + y; });
      out += '<path d="' + d + '" fill="none" stroke="#0b0a1a" stroke-width="4"/><path d="' + d + '" fill="none" stroke="' + sr.c + '" stroke-width="2"/>';
    });
    return out + '</svg>';
  }
  function raceCard(s, extra) {
    const R = s.rival; if (!R) return '';
    const nw = MM.netWorth(s), ahead = nw >= R.nw;
    return '<section class="race ' + (ahead ? 'ahead' : 'behind') + '"><div class="race-top">' + captAvatar('lim', 44) + '<div><b>' + esc(MM.RIVAL.name) + '</b><small>' + esc(MM.RIVAL.desc) + '</small></div></div>' +
      '<div class="race-nums"><div><small>You</small><b class="gold">' + rm(nw) + '</b></div><div><small>Lim</small><b class="red">' + rm(R.nw) + '</b></div><div><small>' + (ahead ? 'Lead' : 'Gap') + '</small><b class="' + (ahead ? 'pos' : 'neg') + '">' + rm(Math.abs(nw - R.nw)) + '</b></div></div>' +
      stepChart([{ c: '#c63b3b', pts: R.hist }, { c: '#ffd65c', pts: s.hist }], 300, 70) +
      '<p class="small dim">Finish the season worth more than him for bonus Legacy. Watch the news: when his junks load a cargo, a glut is coming where they unload.' + (extra || '') + '</p></section>';
  }
  function bountyList(s, end) {
    const bs = s.bounties || []; if (!bs.length) return '';
    return '<ul class="bounties">' + bs.map(b => '<li class="bounty ' + (b.done ? 'done' : b.failed ? 'failed' : '') + '">' + (b.done ? I.check : b.failed ? I.close : I.scroll) + '<div><b>' + esc(b.text) + '</b><small>' + (b.done ? 'Done on day ' + b.doneDay : b.failed ? 'Missed' : bountyProgress(s, b)) + '</small></div><span class="lp">+' + b.lp + '</span></li>').join('') + '</ul>' + (end ? '' : '<p class="small dim">Bounties pay Legacy at the end of the season.</p>');
  }
  function bountyProgress(s, b) {
    const P = b.p;
    switch (b.type) {
      case 'deliver': return 'Sold ' + num(((s.st.sold[P.port] || {})[P.g]) || 0) + ' of ' + num(P.q) + ' t · ' + plural(Math.max(0, P.day - s.day), 'day') + ' left';
      case 'ports': return Object.keys(s.st.visited).length + ' of ' + P.n + ' ports';
      case 'bigsale': return 'Best sale so far ' + rm(s.st.maxSale);
      case 'profit': return 'Best profit so far ' + rm(Math.max(0, s.st.bestTrade));
      case 'contracts': return s.st.contracts + ' of ' + P.n + ' delivered';
      case 'nwby': return 'Worth ' + rm(MM.netWorth(s)) + ' · ' + plural(Math.max(0, P.day - s.day), 'day') + ' left';
      case 'hull': return 'Hull now ' + Math.round(s.ship.cond) + '%';
      case 'rivalby': return 'Checked on day ' + P.day;
      case 'nodebt': return 'So far, so good';
    }
    return '';
  }
  function tabOffice() {
    const s = run;
    const P = MM.PORTS[s.port];
    let h = tip('office');
    h += '<section><h3 class="sec">Bounties <small>this season</small></h3>' + bountyList(s) + '</section>';
    h += '<section><h3 class="sec">The race</h3>' + raceCard(s) + '</section>';
    // Contracts
    h += '<section><h3 class="sec">Contracts <small>' + s.contracts.length + '/2 active</small></h3>';
    if (!s.contracts.length && !s.offers.length) h += '<p class="empty">No contracts on offer here today.</p>';
    s.contracts.forEach(k => {
      const have = s.cargo[k.good] ? s.cargo[k.good].q : 0;
      const left = k.deadline - s.day;
      h += '<div class="contract active">' + gIcon(k.good, 'sm') + '<div><b>' + num(k.qty) + ' t ' + esc(gName(k.good)) + ' » ' + esc(pName(k.dest)) + '</b><small>Pays ' + num(k.pay) + '/t = <b>' + rm(k.qty * k.pay) + '</b> · due day ' + k.deadline + ' (' + (left >= 0 ? plural(left, 'day') + ' left' : 'late') + ')</small><small class="' + (have >= k.qty ? 'pos' : 'dim') + '">Aboard: ' + num(have) + '/' + num(k.qty) + ' t · penalty if missed ' + rm(k.penalty) + '</small></div></div>';
    });
    s.offers.forEach(o => {
      const norm = MM.GOODS[o.good].base * MM.PF[o.dest][o.good];
      h += '<div class="contract">' + gIcon(o.good, 'sm') + '<div><b>' + num(o.qty) + ' t ' + esc(gName(o.good)) + ' » ' + esc(pName(o.dest)) + '</b><small>Pays ' + num(o.pay) + '/t (' + pct(o.pay / norm - 1) + ' on usual) = <b>' + rm(o.qty * o.pay) + '</b></small><small>Deliver by day ' + o.deadline + ' · penalty ' + rm(o.penalty) + '</small></div><button class="btn sm primary" data-a="accept" data-id="' + o.id + '" ' + (s.contracts.length >= 2 ? 'disabled' : '') + '>Accept</button></div>';
    });
    h += '</section>';
    // Money
    h += '<section><h3 class="sec">Money</h3><div class="fin">';
    const bl = MM.bankLimit(s);
    h += '<div class="fin-card ' + (P.bank ? '' : 'off') + '"><div class="fin-top">' + I.bank + '<b>Bank</b><small>' + (MM.bankRate(s) * 100).toFixed(2) + '%/day</small></div>' +
      '<div class="fin-num"><small>You owe</small><b class="' + (s.bank > 0 ? 'neg' : '') + '">' + rm(s.bank) + '</b></div>' +
      (P.bank ? '<div class="fin-btns"><button class="btn xs" data-a="bank-borrow" data-f=".5" ' + (bl < 1000 ? 'disabled' : '') + '>Borrow ' + rm(bl / 2) + '</button><button class="btn xs" data-a="bank-borrow" data-f="1" ' + (bl < 1000 ? 'disabled' : '') + '>Borrow ' + rm(bl) + '</button>' + (s.bank > 0 ? '<button class="btn xs primary" data-a="bank-repay" ' + (s.cash < 1 ? 'disabled' : '') + '>Repay ' + rm(Math.min(s.bank, Math.max(0, s.cash))) + '</button>' : '') + '</div>' : '<p class="small dim">Banks: ' + esc(s.ports.filter(p => MM.PORTS[p].bank).map(pShort).join(', ')) + '</p>') + '</div>';
    const al = MM.alongLimit(s);
    const due = s.along > 0 ? s.alongDue - s.day : null;
    h += '<div class="fin-card along"><div class="fin-top">' + I.skull + '<b>Ah Long</b><small>3%/day</small></div>' +
      '<div class="fin-num"><small>You owe' + (due !== null ? ' · due ' + (due >= 0 ? 'in ' + plural(due, 'day') : 'now!') : '') + '</small><b class="' + (s.along > 0 ? 'neg' : '') + '">' + rm(s.along) + '</b></div>' +
      '<div class="fin-btns"><button class="btn xs" data-a="along-borrow" data-f=".5" ' + (al < 1000 ? 'disabled' : '') + '>Borrow ' + rm(al / 2) + '</button><button class="btn xs" data-a="along-borrow" data-f="1" ' + (al < 1000 ? 'disabled' : '') + '>Borrow ' + rm(al) + '</button>' + (s.along > 0 ? '<button class="btn xs primary" data-a="along-repay" ' + (s.cash < 1 ? 'disabled' : '') + '>Repay ' + rm(Math.min(s.along, Math.max(0, s.cash))) + '</button>' : '') + '</div>' +
      '<p class="small dim">Repay within 10 days or his boys collect 125%, from your cash and your cargo.</p></div>';
    h += '</div></section>';
    // Intel
    const rc = MM.reportCost(s);
    h += '<section><h3 class="sec">Intel</h3><div class="intel"><div><b>Market report</b><small>Today’s prices from every port.</small></div><button class="btn sm" data-a="report" ' + (s.cash < rc ? 'disabled' : '') + '>' + rm(rc) + '</button></div>';
    const shownG = goodsShown(s);
    const feed = MM.newsFeed(s, 40).filter(n => !n.good || shownG.indexOf(n.good) >= 0).slice(0, 18);
    h += '<ul class="newsfeed">' + (feed.length ? feed.map(n => newsItem(s, n)).join('') : '<li class="empty">Quiet on the docks.</li>') + '</ul></section>';
    // Season
    h += '<section><h3 class="sec">Season</h3><div class="season-box"><div>' + captAvatar(s.captain, 36) + '<span><b>' + esc(MM.CAPTAINS[s.captain].name) + '</b><small>' + esc(MM.CAPTAINS[s.captain].title) + (s.mode === 'daily' ? ' · Daily Voyage' : ' · Monsoon level ' + s.level) + '</small></span></div>' +
      (s.twist ? '<p class="small"><b>Today’s twist:</b> ' + esc(MM.TWISTS[s.twist].name) + '. ' + esc(MM.TWISTS[s.twist].desc) + '</p>' : '') +
      '<div class="row-actions">' + (s.day < s.maxDays ? '<button class="btn ghost sm" data-a="wait">' + I.clock + '<span>Wait a day</span></button>' : '') + '<button class="btn ghost sm danger" data-a="end-early">' + I.flag + '<span>End season now</span></button></div></div></section>';
    return h;
  }

  function screenSea() {
    const s = run;
    const v = s.voyage;
    const logs = s.log.filter(l => l.day > v.startDay).slice(0, 5);
    return '<div class="screen sea">' + hud() +
      '<div class="sea-view">' + sceneHTML('sea', { ship: s.ship.cls, mode: 'sail', event: s.pending ? s.pending.type : null, rival: true, speed: UI.sea.fast ? 2 : 1 }, 'sea-scene') +
      '<div class="voyage-pill"><b>' + esc(pShort(v.from)) + ' » ' + esc(pShort(v.to)) + '</b><span>Day ' + Math.min(v.idx, v.days) + ' of ' + v.days + (v.insured ? ' · insured' : '') + '</span></div></div>' +
      '<div class="sea-bottom"><div class="sea-mini">' + mapHTML('sea', Object.assign({ route: { from: v.from, to: v.to }, ship: true, frac: UI.sea.frac, locked: lockedPorts(s), wind: s.monsoon.phase, labels: false }, coMapOpts(s))) + '</div>' +
      '<div class="sea-side"><ul class="sealog">' + (logs.length ? logs.map(l => '<li class="' + l.kind + '"><small>Day ' + l.day + '</small><span>' + esc(l.text) + '</span></li>').join('') : '<li class="calm"><span>Fair winds. The crew settle into watches.</span></li>') + '</ul>' +
      '<button class="btn ghost sm ' + (UI.sea.fast ? 'on' : '') + '" data-a="sea-fast">' + I.fast + '<span>' + (UI.sea.fast ? 'Fast' : 'Normal') + '</span></button></div></div>' + tip('sea') + '</div>';
  }
  function sparkline(hist, w, h) {
    if (!hist || hist.length < 2) return '';
    const xs = hist.map(p => p[0]), ys = hist.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys);
    const X = x => ((x - x0) / Math.max(1, x1 - x0)) * (w - 8) + 4;
    const Y = y => h - 4 - ((y - y0) / Math.max(1, y1 - y0)) * (h - 8);
    const d = hist.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('');
    const area = d + 'L' + X(x1).toFixed(1) + ',' + (h - 4) + 'L' + X(x0).toFixed(1) + ',' + (h - 4) + 'Z';
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><path class="a" d="' + area + '"/><path class="l" d="' + d + '"/></svg>';
  }
  function screenEnd() {
    const f = UI.final, s = UI.endRun;
    const R = MM.RANKS[f.rank];
    const next = MM.RANKS[f.rank + 1];
    let h = '<div class="screen end"><main class="scroll">';
    h += '<section class="end-hero rank-' + R.id + '"><small>' + (s.sunk ? 'Shipwrecked on day ' + s.day : s.mode === 'daily' ? 'Daily Voyage · ' + esc(prettyDate(s.dateKey)) : 'Season complete') + '</small><div class="stamp">' + esc(R.name) + '</div>' +
      '<div class="end-nw"><small>Final net worth</small><b>' + rm(f.nw) + '</b>' + (f.personalBest ? '<span class="pb">' + I.star + 'Personal best</span>' : '') + '</div>' +
      (next ? '<p class="next">' + esc(next.name) + ' at ' + rm(next.min) + '</p>' : '<p class="next">The top rank. Legendary.</p>') + '</section>';
    h += '<section class="race ' + (f.beatRival ? 'ahead' : 'behind') + ' end-race"><div class="race-top">' + captAvatar('lim', 44) + '<div><b>' + (f.beatRival ? 'You beat ' + esc(MM.RIVAL.name) + '!' : esc(MM.RIVAL.name) + ' wins this one') + '</b><small>He finished on ' + rm(f.rivalNW) + '. You: ' + rm(f.nw) + '.</small></div></div>' +
      stepChart([{ c: '#c63b3b', pts: s.rival.hist }, { c: '#ffd65c', pts: s.hist.filter(p => p[0] < s.day).concat([[s.day, f.nw]]) }], 300, 80) + '</section>';
    h += '<section><h3 class="sec">Bounties</h3>' + bountyList(s, true) + '</section>';
    h += '<section class="breakdown"><div><small>Cash</small><b>' + rm(f.cash - f.sold) + '</b></div><div><small>Cargo sold at the end</small><b>' + rm(f.sold) + '</b></div><div><small>Ship at trade-in</small><b>' + rm(f.ship) + '</b></div>' + (f.company ? '<div><small>Company</small><b>' + rm(f.company) + '</b></div>' : '') + '<div><small>Debts</small><b class="' + (f.debts > 0 ? 'neg' : '') + '">' + (f.debts > 0 ? '−' : '') + rm(f.debts) + '</b></div></section>';
    const st = s.st;
    h += '<section class="statgrid"><div><b>' + st.voyages + '</b><small>voyages</small></div><div><b>' + st.trades + '</b><small>trades</small></div><div><b>' + rm(st.bestTrade) + '</b><small>best trade</small></div><div><b>' + st.contracts + '</b><small>contracts</small></div><div><b>' + st.storms + '</b><small>storms</small></div><div><b>' + st.pirates + '</b><small>pirate run-ins</small></div></section>';
    h += '<section class="lp-card"><div class="lp-big">' + I.spark + '<b>+' + (f.lp + f.newAch.reduce((a, x) => a + x.lp, 0)) + '</b><span>Legacy points</span></div><ul>' +
      '<li><span>Season result' + (s.level ? ' ×' + (1 + 0.2 * s.level).toFixed(1) : '') + '</span><b>+' + f.lpBase + '</b></li>' +
      (f.streakBonus ? '<li><span>Daily streak bonus</span><b>+' + f.streakBonus + '</b></li>' : '') +
      (f.rivalLP ? '<li><span>' + I.sword + 'Beat ' + esc(MM.RIVAL.name) + '</span><b>+' + f.rivalLP + '</b></li>' : '') +
      (f.bountyLP ? '<li><span>' + I.scroll + 'Bounties</span><b>+' + f.bountyLP + '</b></li>' : '') +
      f.newAch.map(a => '<li class="ach"><span>' + I.star + esc(a.name) + '</span><b>+' + a.lp + '</b></li>').join('') + '</ul>' +
      (f.rewardNote ? '<p class="reward-note">' + esc(f.rewardNote) + '</p>' : '') +
      (f.levelUp ? '<p class="lvlup">' + I.up + 'Monsoon level ' + f.levelUp + ' unlocked</p>' : '') + '</section>';
    h += '</main><footer class="cta stack"><button class="btn primary big" data-a="' + (s.mode === 'daily' ? 'go-title' : 'new-season') + '">' + I.play + '<span>' + (s.mode === 'daily' ? 'Done' : 'Sail another season') + '</span></button><div class="cta-row"><button class="btn ghost" data-a="go-title">Title</button><button class="btn" data-a="legacy">' + I.spark + '<span>Legacy · ' + meta.lp + '</span></button></div></footer></div>';
    return h;
  }

  function screenLegacy() {
    const cats = ['Captains', 'Ports', 'Cargo', 'Ships', 'Perks'];
    let h = '<div class="screen legacy">' + topbar('Legacy', UI.backTo || 'go-title') + '<main class="scroll">';
    h += '<section class="lp-hero">' + I.spark + '<div><b>' + meta.lp + '</b><small>Legacy points to spend</small></div><p>Earn Legacy by finishing seasons (more for richer seasons and higher Monsoon levels) and by unlocking achievements.</p></section>';
    h += '<div class="seg cats">' + cats.map(c => '<button class="' + (UI.legacyCat === c ? 'on' : '') + '" data-a="legacy-cat" data-id="' + c + '">' + c + '</button>').join('') + '</div>';
    h += '<ul class="unlocks">';
    MM.UNLOCKS.filter(u => u.cat === UI.legacyCat).forEach(u => {
      const have = !!meta.unlocks[u.id];
      const blocked = u.req && !meta.unlocks[u.req];
      let art = '';
      if (u.cat === 'Captains') { const cid = MM.CAPTAIN_IDS.find(c => MM.CAPTAINS[c].unlock === u.id); art = captAvatar(cid, 42); }
      else if (u.cat === 'Cargo') { const gid = u.id.replace('good_', ''); art = gIcon(gid); }
      else art = '<span class="ul-ic">' + (u.cat === 'Ports' ? I.anchor : u.cat === 'Ships' ? I.ship : I.spark) + '</span>';
      let sub = u.sub;
      if (u.cat === 'Captains') { const cid = MM.CAPTAIN_IDS.find(c => MM.CAPTAINS[c].unlock === u.id); sub = MM.CAPTAINS[cid].title + '. ' + MM.CAPTAINS[cid].desc; }
      h += '<li class="unl ' + (have ? 'have' : '') + '">' + art + '<div><b>' + esc(u.name) + '</b><small>' + esc(sub) + '</small>' + (blocked ? '<small class="dim">Needs ' + esc(MM.UNLOCK_BY_ID[u.req].name) + ' first</small>' : '') + '</div>' +
        (have ? '<span class="owned">' + I.check + '</span>' : '<button class="btn sm ' + (meta.lp >= u.cost && !blocked ? 'primary' : '') + '" data-a="unlock" data-id="' + u.id + '" ' + (meta.lp < u.cost || blocked ? 'disabled' : '') + '>' + u.cost + ' LP</button>') + '</li>';
    });
    h += '</ul>';
    h += '<section class="levels-info"><h3 class="sec">Monsoon levels</h3><p>Highest unlocked: <b>' + meta.levelMax + '</b> of 10. Finish your highest level worth enough to unlock the next: RM 3M in a 90-day season, RM 4M in 120 days (less at level 5 and above, where seasons are shorter). Each level adds a hazard and multiplies the Legacy you earn.</p></section>';
    h += '</main></div>';
    return h;
  }

  function screenLedger() {
    const m = meta.stats;
    let h = '<div class="screen ledger">' + topbar('Ledger') + '<main class="scroll">';
    h += '<section class="statgrid big"><div><b>' + m.seasons + '</b><small>seasons</small></div><div><b>' + rm(m.best) + '</b><small>best net worth</small></div><div><b>' + (m.bestRank === null ? '—' : esc(MM.RANKS[m.bestRank].name)) + '</b><small>best rank</small></div><div><b>' + m.voyages + '</b><small>voyages</small></div><div><b>' + m.contracts + '</b><small>contracts</small></div><div><b>' + (meta.daily.bestStreak || 0) + '</b><small>best daily streak</small></div></section>';
    h += '<section><h3 class="sec">Achievements <small>' + Object.keys(meta.ach).length + '/' + MM.ACH.length + '</small></h3><ul class="achs">';
    MM.ACH.forEach(a => { const got = !!meta.ach[a.id]; h += '<li class="' + (got ? 'got' : '') + '">' + (got ? I.star : I.lock) + '<div><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small></div><span>+' + a.lp + '</span></li>'; });
    h += '</ul></section>';
    h += '<section><h3 class="sec">Recent seasons</h3>';
    if (!meta.history.length) h += '<p class="empty">No finished seasons yet.</p>';
    else h += '<ul class="hist">' + meta.history.slice(0, 15).map(x => '<li>' + captAvatar(x.captain, 30) + '<div><b>' + esc(MM.RANKS[x.rank].name) + '</b><small>' + (x.mode === 'daily' ? 'Daily · ' + esc(prettyDate(x.date)) : 'Level ' + x.level + ' · ' + new Date(x.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) + '</small></div><b class="nw">' + rm(x.nw) + '</b></li>').join('') + '</ul>';
    h += '</section></main></div>';
    return h;
  }

  function screenSettings() {
    const st = meta.settings;
    const tog = (k, label, sub) => '<button class="toggle-row" data-a="toggle" data-id="' + k + '" role="switch" aria-checked="' + !!st[k] + '"><div><b>' + label + '</b><small>' + sub + '</small></div><span class="switch ' + (st[k] ? 'on' : '') + '" aria-hidden="true"><i></i></span></button>';
    let h = '<div class="screen settings">' + topbar('Settings') + '<main class="scroll">';
    h += '<section class="group">' + tog('sound', 'Sound', 'Chiptune bleeps and bloops.') + tog('music', 'Music', 'A sea shanty on loop.') + tog('haptics', 'Vibration', 'Android only. iPhones don’t allow it in web apps.') + tog('motion', 'Animations', 'Turn off for a calmer screen.') + tog('tips', 'Tips', 'Show beginner hints.') + '</section>';
    h += '<section class="group"><button class="link-row" data-a="help">' + I.help + '<span>How to play</span></button><button class="link-row" data-a="reset-tips">' + I.info + '<span>Show all tips again</span></button></section>';
    h += '<section class="group"><h3 class="sec">Captain backup</h3><p class="small dim">Copy your seasons (including your company), Daily Voyage and Legacy to keep them safe. The archived Monsoon Company campaign has its own Backup button.</p><div class="row-actions"><button class="btn sm" data-a="export">' + I.download + '<span>Copy backup code</span></button><button class="btn sm ghost" data-a="import-open">Restore…</button></div>' +
      (UI.importOpen ? '<label for="importBox">Backup code</label><textarea id="importBox" placeholder="Paste a backup code here"></textarea><button class="btn sm primary" data-a="import">Restore from code</button>' : '') + '</section>';
    h += '<section class="group"><button class="link-row danger" data-a="reset">' + I.close + '<span>Erase captain progress</span></button></section>';
    h += '<p class="about">Monsoon Merchant v' + APP_VERSION + '. Made for offline play. No ads, no accounts, no tracking.</p>';
    h += '</main></div>';
    return h;
  }

  function screenHelp() {
    const sec = (t, b) => '<section class="help-sec"><h3>' + t + '</h3>' + b + '</section>';
    let h = '<div class="screen help">' + topbar('How to play', UI.helpBack || 'settings') + '<main class="scroll">';
    h += sec('The goal', '<p>You have one season (90 or 120 days, your choice; Daily Voyage is 60) to turn an old coaster and RM 50,000 into as much as you can. Your final <b>net worth</b> is cash + cargo + your ship (at trade-in value) + your company − debts.</p><p>Ranks: Deckhand, Bosun (RM 200k), Trader (600k), Merchant (1.5M), Towkay (4M), Tycoon (10M), Legend of the Straits (25M).</p>');
    h += sec('Trading', '<p>Each port makes some goods cheaply and pays well for others. Buy where it’s cheap, sail, sell where it’s dear. The % tag compares a price with the regional average.</p><p>Big trades move prices: buying pushes the price up, selling pushes it down. Markets remember: a port you flood stays cheap for about a week. Rotate your routes.</p>');
    h += sec('What you know', '<p>You only see live prices in the port you’re in. For other ports you see the prices from your last visit or <b>market report</b>, which can be days old. The Radio room upgrade gives live prices everywhere.</p>');
    h += sec('Rumours and news', '<p>Shortages and gluts are often rumoured a few days before they hit. Get there while it’s happening for big profits. Some rumours are false.</p>');
    h += sec('The monsoon', '<p>The northeast monsoon speeds ships sailing southwest; the southwest monsoon speeds ships sailing northeast. Around mid-season the monsoon turns, and routes that were quick become slow. The weeks around the change bring squalls, and the southwest monsoon brings typhoons to the South China Sea.</p>');
    h += sec('Risk', '<p>Storms and pirates can cost you cargo. Insurance pays back 80% of what you lose. Storms also damage the hull. Below 40% a storm can sink her outright, so repair at a shipyard.</p>');
    h += sec('Your company', '<p>As your net worth grows, the season unlocks your supply chain: <b>warehouses</b> at RM 150k, <b>factories</b> at RM 500k and <b>freight</b> at RM 1M. Open the Company tab to see the next step.</p><p>Warehouses store cargo and run <b>standing orders</b>: buy or sell a set amount every day, only at a good price if you like. Factories turn raw goods in their warehouse into products every day. Freight routes ship stock between your warehouses or to a market. All of it runs by itself, even while you sail, and never spends below your cash reserve.</p><p>Each warehouse, factory and route shows its own <b>profit</b>, and when you dock you get a short report of what the company did while you were away.</p><p>Once you have factories, <b>big orders</b> arrive: hundreds of tonnes of a product for one port, paid per tonne on delivery plus a bonus when complete. Deliver by ship, by freight route, or from your warehouse there. Watch for <b>strikes</b>, <b>breakdowns</b> and <b>booms</b>: the Company tab asks what you want to do.</p>');
    h += sec('The rival', '<p><b>Towkay Lim</b> trades the same seas. His net worth is shown under yours. When his junks load a cargo, the price there jumps, and a few days later he floods the port where he unloads. Beat him by the end of the season for bonus Legacy.</p>');
    h += sec('Bounties', '<p>Each season comes with three bounties, like selling a cargo in a certain port by a deadline. Each one you complete pays Legacy at the end of the season. Find them in the Office.</p>');
    h += sec('Money', '<p>Contracts pay a premium for delivering by a deadline. Miss it and you pay a penalty. Banks lend at about 0.25% a day at big ports. The Ah Long lends anywhere at 3% a day and wants it back within 10 days.</p>');
    h += sec('Legacy', '<p>Season Legacy requires a completed voyage (shipwrecks count) and scales with days played; eligible runs earn at least 1 LP. Spend Legacy on new captains, ports, cargo, ships and perks. Finish as Merchant or better to unlock harder Monsoon levels, which earn more Legacy.</p><p>The <b>Daily Voyage</b> uses the same seas for everyone each day. Play it daily to build a streak.</p>');
    h += '</main></div>';
    return h;
  }

  /* ================= Sheets & modals ================= */
  function sheetWrap(inner, cls) { return '<div class="backdrop" data-a="close-sheet"></div><div class="sheet ' + (cls || '') + '" role="dialog"><div class="grip"></div>' + inner + '</div>'; }
  function modalWrap(inner, cls) { return '<div class="backdrop solid"></div><div class="modal ' + (cls || '') + '" role="dialog">' + inner + '</div>'; }

  function tradeDyn() {
    const s = run, sh = UI.sheet, g = sh.g;
    const q = sh.q;
    const hold = s.cargo[g] ? s.cargo[g].q : 0;
    let facts = '', btn = '';
    if (sh.mode === 'buy') {
      const max = MM.maxBuy(s, g);
      const qt = MM.quoteBuy(s, g, q);
      const best = MM.bestKnownSell(s, g, s.port);
      facts = '<dl class="facts"><div><dt>Average price</dt><dd>' + (q ? num(qt.avg) : '—') + '</dd></div><div><dt>Total</dt><dd><b>' + rm(qt.total) + '</b></dd></div>' +
        '<div><dt>Price after</dt><dd>' + num(qt.after) + ' <span class="' + (qt.move > 0.1 ? 'neg' : 'dim') + '">' + pct(qt.move, 1) + '</span></dd></div>' +
        '<div><dt>Cash after</dt><dd>' + rm(s.cash - qt.total) + '</dd></div><div><dt>Hold after</dt><dd>' + num(MM.cargoUsed(s) + q) + '/' + num(MM.shipCap(s)) + ' t</dd></div>' +
        (best ? '<div><dt>Best known sale</dt><dd>' + esc(pShort(best.port)) + ' ' + num(best.price) + ' <i class="' + ageClass(best.age) + '">' + ageLabel(best.age) + '</i></dd></div>' : '') + '</dl>';
      if (MM.GOODS[g].perish) facts += '<p class="warnline">' + I.clock + 'Spoils ' + MM.shelfLife(s, g) + ' days after loading' + (MM.hasCold(s) ? ' (reefer containers fitted).' : '. Reefer containers extend that to 10.') + '</p>';
      if (max === 0) facts += '<p class="warnline">' + (MM.freeSpace(s) <= 0 ? 'Your hold is full.' : 'You can’t afford a tonne.') + '</p>';
      btn = '<button class="btn primary big" data-a="do-trade" ' + (q <= 0 || q > max ? 'disabled' : '') + '>Buy ' + num(q) + ' t · ' + rm(qt.total) + '</button>';
    } else {
      const qt = MM.quoteSell(s, g, q);
      const cost = s.cargo[g] ? s.cargo[g].cost : 0;
      const profit = qt.total - cost * q;
      const best = MM.bestKnownSell(s, g, s.port);
      const contract = s.contracts.find(k => k.good === g);
      facts = '<dl class="facts"><div><dt>Average price</dt><dd>' + (q ? num(qt.avg) : '—') + '</dd></div><div><dt>You receive</dt><dd><b>' + rm(qt.total) + '</b></dd></div>' +
        '<div><dt>Trading profit</dt><dd class="' + (profit >= 0 ? 'pos' : 'neg') + '">' + (profit >= 0 ?  '+' : '') + rm(profit) + (cost ? ' <span>' + pct(q ? qt.avg / cost - 1 : 0) + '</span>' : '') + '</dd></div>' +
        '<div><dt>Price after</dt><dd>' + num(qt.after) + ' <span class="' + (qt.move > 0.1 ? 'neg' : 'dim') + '">−' + (qt.move * 100).toFixed(1) + '%</span></dd></div>' +
        (best ? '<div><dt>Best known elsewhere</dt><dd>' + esc(pShort(best.port)) + ' ' + num(best.price) + ' <i class="' + ageClass(best.age) + '">' + ageLabel(best.age) + '</i></dd></div>' : '') + '</dl>';
      facts += '<p class="small dim">Trading profit is sale proceeds minus cargo purchase cost. Voyage costs, fees, interest and insurance are separate.</p>';
      if (contract) facts += '<p class="warnline">' + I.info + 'You have a contract for ' + num(contract.qty) + ' t of this to ' + esc(pName(contract.dest)) + '.</p>';
      btn = '<button class="btn primary big" data-a="do-trade" ' + (q <= 0 || q > hold ? 'disabled' : '') + '>Sell ' + num(q) + ' t · ' + rm(qt.total) + '</button>';
    }
    return facts + btn;
  }
  function tradeSheet() {
    const s = run, sh = UI.sheet, g = sh.g;
    const hold = s.cargo[g] ? s.cargo[g].q : 0;
    const max = sh.mode === 'buy' ? MM.maxBuy(s, g) : hold;
    const r = MM.marketRows(s).find(x => x.g === g);
    const head = '<header class="sh-head">' + gIcon(g) + '<div><h3>' + esc(gName(g)) + '</h3><small>Buy ' + num(r.buy) + ' · Sell ' + num(r.sell) + ' · regional avg ' + num(MM.GOODS[g].base) + '</small></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header>';
    const seg = '<div class="seg"><button class="' + (sh.mode === 'buy' ? 'on' : '') + '" data-a="trade-mode" data-id="buy" aria-pressed="' + (sh.mode === 'buy') + '">Buy</button><button class="' + (sh.mode === 'sell' ? 'on' : '') + '" data-a="trade-mode" data-id="sell" aria-pressed="' + (sh.mode === 'sell') + '" ' + (hold ? '' : 'disabled') + '>Sell' + (hold ? ' (' + num(hold) + ' t)' : '') + '</button></div>';
    const qty = '<div class="qty"><button class="qbtn" data-a="qty" data-d="-10" aria-label="Decrease quantity by 10 tonnes">−10</button><button class="qbtn" data-a="qty" data-d="-1" aria-label="Decrease quantity by 1 tonne">' + I.minus + '</button><div class="qval"><b id="qVal">' + num(sh.q) + '</b><small>tonnes</small></div><button class="qbtn" data-a="qty" data-d="1" aria-label="Increase quantity by 1 tonne">' + I.plus + '</button><button class="qbtn" data-a="qty" data-d="10" aria-label="Increase quantity by 10 tonnes">+10</button></div>' +
      '<input type="range" id="qRange" min="0" max="' + max + '" step="1" value="' + Math.min(sh.q, max) + '" data-a="qty-range" aria-label="Quantity">' +
      '<div class="quick"><button data-a="qty-set" data-f=".25">¼</button><button data-a="qty-set" data-f=".5">½</button><button data-a="qty-set" data-f=".75">¾</button><button data-a="qty-set" data-f="1">' + (sh.mode === 'buy' ? 'Max ' + num(max) : 'All ' + num(max)) + '</button></div>';
    return sheetWrap(head + seg + qty + '<div id="tradeDyn">' + tradeDyn() + '</div>', 'trade');
  }

  function portSheet() {
    const s = run, p = UI.sheet.p, P = MM.PORTS[p];
    const avail = s.ports.indexOf(p) >= 0;
    const prof = MM.portProfile(p, s.goods);
    let h = '<header class="sh-head"><span class="ul-ic">' + I.anchor + '</span><div><h3>' + esc(P.name) + ' <span class="cc">' + P.cc + '</span></h3><small>' + ([P.bank ? 'Bank' : '', P.yard ? 'Shipyard' : ''].filter(Boolean).join(' · ') || 'No bank or shipyard') + '</small></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header>';
    h += '<p class="blurb">' + esc(P.blurb) + '</p>';
    if (!avail) {
      const u = MM.UNLOCK_BY_ID[P.unlock];
      h += '<div class="locked-box">' + I.lock + '<p>' + (s.mode === 'daily' ? 'Not part of the Daily Voyage.' : 'Unlock ' + esc(P.name) + ' in Legacy for ' + u.cost + ' LP.') + '</p></div>';
      return sheetWrap(h, 'port');
    }
    h += '<div class="profile">' + (prof.exports.length ? '<span class="lab">Cheap here</span>' + prof.exports.map(g => '<span class="mini" style="--c:' + GC[g] + '">' + esc(gName(g)) + '</span>').join('') : '') + (prof.imports.length ? '<span class="lab">Pays well</span>' + prof.imports.map(g => '<span class="mini" style="--c:' + GC[g] + '">' + esc(gName(g)) + '</span>').join('') : '') + '</div>';
    if (p === s.port) {
      h += '<p class="center-note">You’re here.</p>';
    } else {
      const pl = MM.planVoyage(s, p);
      h += '<div class="voy">' +
        '<div><small>Voyage</small><b>' + plural(pl.days, 'day') + '</b><span class="' + (pl.windDelta > 0 ? 'neg' : pl.windDelta < 0 ? 'pos' : 'dim') + '">' + (pl.windDelta > 0 ? '+' + pl.windDelta + ' headwind' : pl.windDelta < 0 ? pl.windDelta + ' tailwind' : 'no wind effect') + '</span></div>' +
        '<div><small>Arrive</small><b>Day ' + pl.arrive + '</b><span class="' + (pl.tooLate ? 'neg' : 'dim') + '">' + (pl.tooLate ? 'after season end' : 'of ' + s.maxDays) + '</span></div>' +
        '<div><small>Storms</small><b class="risk ' + pl.stormLabel.toLowerCase() + '">' + pl.stormLabel + '</b><span class="dim">' + Math.round(pl.storm * 100) + '%</span></div>' +
        '<div><small>Pirates</small><b class="risk ' + pl.pirateLabel.toLowerCase() + '">' + pl.pirateLabel + '</b><span class="dim">' + Math.round(pl.pirate * 100) + '%</span></div></div>';
      h += '<p class="via">' + I.wind + 'Via ' + esc(pl.regions.join(', ')) + ' · ' + num(pl.dist) + ' nm · running cost ' + rm(pl.cost) + '</p>';
    }
    // Known prices
    const k = s.known[p];
    if (k && p !== s.port) {
      const age = s.day - k.day;
      h += '<h4 class="sub">Prices there <i class="' + ageClass(age) + '">' + ageLabel(age) + '</i></h4><table class="ptable"><thead><tr><th></th><th>They pay</th><th>vs here</th><th>You hold</th></tr></thead><tbody>';
      let est = 0, basis = 0;
      s.goods.forEach(g => {
        const sellThere = k.mid[g] * (1 - MM.spreadOf(s) / 2);
        const buyHere = MM.buyPrice(s, s.port, g);
        const margin = sellThere / buyHere - 1;
        const c = s.cargo[g];
        if (c) { est += c.q * sellThere; basis += c.q * c.cost; }
        h += '<tr><td>' + gIcon(g, 'xs') + esc(gName(g)) + '</td><td>' + num(sellThere) + '</td><td class="' + (margin > 0.15 ? 'pos' : margin < 0 ? 'neg' : '') + '">' + pct(margin) + '</td><td>' + (c ? num(c.q) + ' t' : '') + '</td></tr>';
      });
      h += '</tbody></table>';
      if (basis > 0) h += '<p class="est">Your cargo would fetch about <b>' + rm(est) + '</b> there <span class="' + (est >= basis ? 'pos' : 'neg') + '">(' + (est >= basis ? '+' : '') + rm(est - basis) + ' on cost)</span>, before market impact.</p>';
    } else if (p !== s.port) {
      h += '<p class="est dim">' + I.info + ' You don’t know current prices there. Visit or buy a market report.</p>';
    }
    const ks = s.contracts.filter(c => c.dest === p);
    if (ks.length) h += ks.map(c => '<p class="contract-note">' + I.flag + 'Contract: ' + num(c.qty) + ' t ' + esc(gName(c.good)) + ' due day ' + c.deadline + '</p>').join('');
    if (p !== s.port) {
      const pl = MM.planVoyage(s, p);
      h += '<button class="btn primary big" data-a="plan" data-p="' + p + '" ' + (pl.tooLate || s.day >= s.maxDays ? 'disabled' : '') + '>' + I.ship + '<span>' + (pl.tooLate ? 'Too far for the time left' : 'Plan voyage') + '</span></button>';
    }
    return sheetWrap(h, 'port');
  }

  function departSheet() {
    const s = run, p = UI.sheet.p;
    const pl = MM.planVoyage(s, p);
    const ins = UI.sheet.insure;
    const warns = [];
    MM.cargoRows(s).forEach(r => { if (r.spoilIn !== null && r.spoilIn <= pl.days) warns.push(r.name + ' will spoil before you arrive (' + plural(Math.max(0, r.spoilIn), 'day') + ' left).'); });
    if (s.along > 0 && s.alongDue < pl.arrive) warns.push('The Ah Long’s loan falls due on day ' + s.alongDue + '. His boys will meet you at ' + pName(p) + '.');
    if (s.ship.cond < 35) warns.push('Your hull is at ' + Math.round(s.ship.cond) + '%. A bad storm could sink her.');
    if (MM.cargoUsed(s) === 0) warns.push('Your hold is empty.');
    if (s.cash - (ins ? pl.premium : 0) < pl.cost) warns.push('Running costs (' + rm(pl.cost) + ') will push your cash below zero. Overdrafts cost 1% a day.');
    s.contracts.forEach(c => {
      if (pl.arrive > c.deadline) warns.push('Contract for ' + num(c.qty) + ' t ' + gName(c.good) + ' to ' + pName(c.dest) + ' is due day ' + c.deadline + '. This voyage arrives on day ' + pl.arrive + ', after its deadline.');
      if (c.dest === p) {
        const held = s.cargo[c.good] ? s.cargo[c.good].q : 0;
        if (held < c.qty) warns.push('Contract at ' + pName(p) + ' needs ' + num(c.qty) + ' t ' + gName(c.good) + '; you carry ' + num(held) + ' t. Load ' + num(c.qty - held) + ' t more to deliver it on arrival.');
      }
    });
    let h = '<header class="sh-head"><span class="ul-ic">' + I.ship + '</span><div><h3>Sail to ' + esc(pName(p)) + '</h3><small>' + plural(pl.days, 'day') + ' · arrive day ' + pl.arrive + '</small></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header>';
    h += '<dl class="facts"><div><dt>Running cost</dt><dd>' + rm(pl.cost) + '</dd></div><div><dt>Port fee on arrival</dt><dd>' + rm(MM.portFee(s)) + '</dd></div><div><dt>Storms / pirates</dt><dd><b class="risk ' + pl.stormLabel.toLowerCase() + '">' + pl.stormLabel + '</b> / <b class="risk ' + pl.pirateLabel.toLowerCase() + '">' + pl.pirateLabel + '</b></dd></div><div><dt>Cargo value (cost)</dt><dd>' + rm(pl.cargoValue) + '</dd></div></dl>';
    if (pl.premium > 0) h += '<button class="toggle-row ins" data-a="toggle-ins" role="switch" aria-checked="' + !!ins + '"><div><b>Insure the cargo · ' + rm(pl.premium) + '</b><small>Pays back 80% of any cargo lost to storms or pirates on this voyage.</small></div><span class="switch ' + (ins ? 'on' : '') + '" aria-hidden="true"><i></i></span></button>';
    if (warns.length) h += '<ul class="warns">' + warns.map(w => '<li>' + I.info + '<span>' + esc(w) + '</span></li>').join('') + '</ul>';
    h += '<button class="btn primary big" data-a="cast-off" data-p="' + p + '">' + I.ship + '<span>Cast off</span></button>';
    return sheetWrap(h, 'depart');
  }

  function confirmSheet() {
    const c = UI.sheet;
    return sheetWrap('<header class="sh-head"><span class="ul-ic">' + (c.icon || I.info) + '</span><div><h3>' + esc(c.title) + '</h3></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header><p class="blurb">' + c.text + '</p><div class="cta-row"><button class="btn ghost" data-a="close-sheet">' + esc(c.no || 'Cancel') + '</button><button class="btn ' + (c.danger ? 'danger-fill' : 'primary') + '" data-a="' + c.yes + '" data-id="' + esc(c.id || '') + '">' + esc(c.yesLabel || 'OK') + '</button></div>', 'confirm');
  }
  function menuSheet() {
    const s = run;
    const row = (a, icon, label, sub, cls) => '<button class="link-row ' + (cls || '') + '" data-a="' + a + '">' + icon + '<span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span></button>';
    return sheetWrap('<header class="sh-head"><span class="ul-ic">' + I.anchor + '</span><div><h3>' + (s.mode === 'daily' ? 'Daily Voyage' : 'Season') + '</h3><small>Day ' + s.day + ' of ' + s.maxDays + ' · ' + esc(MM.CAPTAINS[s.captain].name) + (s.mode === 'daily' ? '' : ' · level ' + s.level) + '</small></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header>' +
      '<div class="menu-list">' + row('go-title', I.back, 'Save and go to title', 'Save your voyage to pick it up later.') +
      row('export', I.download, 'Copy backup code', 'Backs up seasons with their company, Daily Voyage and Legacy. The archived company campaign uses its own Backup button.') +
      row('help-run', I.help, 'How to play', '') +
      row('toggle-sound', I.sound, 'Sound: ' + (meta.settings.sound ? 'on' : 'off'), '') +
      row('toggle-music', I.music, 'Music: ' + (meta.settings.music ? 'on' : 'off'), '') +
      (s.phase === 'port' && !s.pending ? row('end-early', I.flag, 'End season now', 'Sell up here and score the season.', 'danger') : '') + '</div>', 'menu');
  }
  function infoSheet() {
    const c = UI.sheet;
    return sheetWrap('<header class="sh-head"><span class="ul-ic">' + (c.icon || I.info) + '</span><div><h3>' + esc(c.title) + '</h3></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header><div class="blurb">' + c.html + '</div><button class="btn primary big" data-a="close-sheet">OK</button>', 'confirm');
  }

  function eventModal() {
    const e = run.pending;
    const who = EV_SPEAKER[e.type] || 'Bosun';
    return modalWrap(sceneHTML('ev', { ship: run.ship.cls, mode: e.type === 'customs' ? 'dock' : 'sail', event: e.type, port: run.port, rival: false }, 'ev-scene') +
      '<div class="dialog"><div class="speaker">' + captAvatar(run.captain, 40) + '<span>' + esc(who) + '</span></div><h3>' + esc(e.title) + '</h3><p>' + esc(e.text) + '</p></div><div class="choices">' +
      e.choices.map(c => '<button class="choice" data-a="choose" data-id="' + c.id + '" ' + (c.disabled ? 'disabled' : '') + '><b>' + esc(c.label) + '</b>' + (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') + '</button>').join('') + '</div>', 'event ev-' + e.type);
  }
  function resultModal() {
    const m = UI.modal;
    return modalWrap('<div class="ev-art ' + m.tone + '">' + (m.tone === 'good' ? I.check : m.tone === 'bad' ? I.skull : I[EV_ICON[m.evType]] || I.info) + '</div><div class="dialog"><h3>' + esc(m.title) + '</h3><p>' + esc(m.text) + '</p></div><button class="btn primary big" data-a="result-ok">Continue</button>', 'result ' + m.tone);
  }
  function arrivalModal() {
    const r = UI.modal.rep, s = run;
    let h = sceneHTML('arr', { ship: s.ship.cls, mode: 'dock', event: 'arrival', port: r.port, tod: s.day % 4 === 3 ? 0.95 : 0.45 }, 'ev-scene') + '<h3>' + esc(pName(r.port)) + '</h3><p class="sub">Day ' + r.day + ' · port fee ' + rm(r.fee) + '</p>';
    if (r.delivered.length) h += '<ul class="arr-list">' + r.delivered.map(d => '<li class="pos">' + (d.big ? I.trophy : I.check) + '<span>' + (d.big ? (d.done ? 'Big order complete' : 'Big order') : 'Contract') + ' delivered: ' + num(d.qty) + ' t ' + esc(gName(d.good)) + ' for <b>' + rm(d.pay) + '</b>' + (d.done ? ' including the bonus' : '') + '</span></li>').join('') + '</ul>';
    if (r.co) h += reportCard(r.co, 'Your company, day ' + r.co.from + ' to ' + r.co.to, true) + (r.co.decide ? '<p class="arr-decide">' + I.info + '<span>' + plural(r.co.decide, 'decision') + ' waiting in the Company tab.</span></p>' : '');
    if (r.lines.length) h += '<ul class="arr-list">' + r.lines.map(l => '<li>' + I.info + '<span>' + esc(l) + '</span></li>').join('') + '</ul>';
    const ev = [];
    s.goods.forEach(g => MM.activeEvents(s, s.port, g).forEach(e => ev.push(e)));
    if (ev.length) h += '<ul class="arr-list">' + ev.map(e => '<li class="' + (e.kind === 'shortage' || e.kind === 'boom' ? 'pos' : 'warn') + '">' + (e.kind === 'shortage' || e.kind === 'boom' ? I.up : I.down) + '<span>' + esc(e.headline) + '</span></li>').join('') + '</ul>';
    const held = Object.keys(s.cargo);
    if (held.length) {
      h += '<ul class="arr-list">' + held.map(g => { const c = s.cargo[g], sp = MM.sellPrice(s, s.port, g); const m = sp / c.cost - 1; return '<li>' + gIcon(g, 'xs') + '<span>' + esc(gName(g)) + ' sells for ' + num(sp) + ' here <b class="' + (m >= 0 ? 'pos' : 'neg') + '">' + pct(m) + '</b> on cost</span></li>'; }).join('') + '</ul>';
    }
    h += (r.co ? '<div class="row-actions arr-acts"><button class="btn primary big" data-a="ashore">Go ashore</button><button class="btn ghost" data-a="ashore-co">' + I.company + '<span>Company</span></button></div>' : '<button class="btn primary big" data-a="ashore">Go ashore</button>');
    return modalWrap(h, 'arrival');
  }
  function sunkModal() {
    return modalWrap(sceneHTML('sunk', { ship: run ? run.ship.cls : 'coaster', mode: 'dock', event: 'storm' }, 'ev-scene sunk-scene') + '<h3>She’s gone down</h3><p>' + esc(UI.modal.text) + '</p><button class="btn primary big" data-a="finish">Count what’s left</button>', 'result bad');
  }

  /* ================= Render ================= */
  let overlayReturnFocus = null;
  function focusBookmark(el) {
    if (!el || (!el.id && !el.dataset.a)) return null;
    return { id: el.id, tag: el.tagName, data: Object.assign({}, el.dataset) };
  }
  function findFocus(host, bookmark) {
    if (!bookmark) return null;
    if (bookmark.id) {
      const el = document.getElementById(bookmark.id);
      if (el && host.contains(el) && !el.disabled) return el;
    }
    return Array.from(host.querySelectorAll('[data-a]')).find(el => !el.disabled && el.tagName === bookmark.tag && Object.keys(bookmark.data).every(k => el.dataset[k] === bookmark.data[k])) || null;
  }
  function focusWithin(host, bookmark) {
    const target = findFocus(host, bookmark) || host.querySelector('h1, h2, h3') || host;
    if (!target.matches('button, input, textarea, select, a[href], [tabindex]')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
  function renderOverlay(screenFocus) {
    const host = document.getElementById('overlay'); if (!host) return;
    const screenHost = document.getElementById('screen');
    const wasOpen = !!host.querySelector('[role="dialog"]');
    const previousFocus = host.contains(document.activeElement) ? focusBookmark(document.activeElement) : null;
    const trigger = screenHost.contains(document.activeElement) ? focusBookmark(document.activeElement) : screenFocus;
    let h = '';
    if (UI.modal) {
      if (UI.modal.type === 'result') h = resultModal();
      else if (UI.modal.type === 'arrival') h = arrivalModal();
      else if (UI.modal.type === 'sunk') h = sunkModal();
    } else if (run && run.pending && (UI.screen === 'run' || UI.screen === 'sea')) h = eventModal();
    else if (UI.sheet) {
      if (UI.sheet.type === 'trade') h = tradeSheet();
      else if (UI.sheet.type === 'port') h = portSheet();
      else if (UI.sheet.type === 'depart') h = departSheet();
      else if (UI.sheet.type === 'confirm') h = confirmSheet();
      else if (UI.sheet.type === 'info') h = infoSheet();
      else if (UI.sheet.type === 'menu') h = menuSheet();
      else if (UI.sheet.type === 'order') h = orderSheet();
      else if (UI.sheet.type === 'factory') h = factorySheet();
      else if (UI.sheet.type === 'route') h = routeSheet();
    }
    unmount(UI.owidgets);
    host.innerHTML = h;
    host.className = h ? 'open' : '';
    if (h) mountIn(host, UI.owidgets);
    screenHost.inert = !!h;
    if (h) {
      if (!wasOpen) overlayReturnFocus = trigger || null;
      const dialog = host.querySelector('[role="dialog"]');
      const title = dialog.querySelector('h3');
      dialog.setAttribute('aria-modal', 'true');
      if (title) { title.id = 'overlay-title'; dialog.setAttribute('aria-labelledby', title.id); }
      focusWithin(dialog, previousFocus);
    } else if (wasOpen) {
      focusWithin(screenHost, overlayReturnFocus);
      overlayReturnFocus = null;
    }
  }
  function render() {
    if (UI.screen === 'network') return;
    const screenHost = document.getElementById('screen');
    const oldKey = UI.renderedKey;
    const screenHadFocus = screenHost.contains(document.activeElement);
    const screenFocus = screenHadFocus ? focusBookmark(document.activeElement) : null;
    root.classList.toggle('reduce-motion', reduceMotion());
    const sc = document.querySelector('#screen .scroll');
    if (sc) UI.scroll[UI.renderedKey] = sc.scrollTop;
    if (UI.screen === 'run' && UI.tab === 'office' && run) {
      const maxId = run.news.reduce((a, n) => Math.max(a, n.day <= run.day ? n.id : 0), 0);
      if (maxId > UI.seenNews) { UI.prevSeen = UI.seenNews; UI.seenNews = maxId; try { sessionStorage.setItem('mm.seen', String(maxId)); } catch (e) { /* ignore */ } }
    }
    let h = '';
    if (UI.screen === 'title') h = screenTitle();
    else if (UI.screen === 'setup') h = screenSetup();
    else if (UI.screen === 'run') h = run ? screenRun() : screenTitle();
    else if (UI.screen === 'sea') h = run ? screenSea() : screenTitle();
    else if (UI.screen === 'end') h = screenEnd();
    else if (UI.screen === 'legacy') h = screenLegacy();
    else if (UI.screen === 'ledger') h = screenLedger();
    else if (UI.screen === 'settings') h = screenSettings();
    else if (UI.screen === 'help') h = screenHelp();
    unmount(UI.widgets); UI.seaScene = null; UI.seaMap = null; UI.mainMap = null;
    screenHost.innerHTML = h;
    mountIn(screenHost, UI.widgets);
    UI.renderedKey = UI.screen + ':' + (UI.screen === 'run' ? UI.tab : '');
    const nsc = document.querySelector('#screen .scroll');
    if (nsc && UI.scroll[UI.renderedKey]) nsc.scrollTop = UI.scroll[UI.renderedKey];
    renderOverlay(screenFocus);
    if (!document.getElementById('overlay').classList.contains('open') && (screenHadFocus || (oldKey && oldKey !== UI.renderedKey))) focusWithin(screenHost, screenFocus);
    if (run && (UI.screen === 'run' || UI.screen === 'sea')) countCash();
  }
  function countCash() {
    const el = document.getElementById('hudCash'); if (!el) return;
    const to = Math.round(run.cash), from = UI.lastCash;
    UI.lastCash = to;
    if (from === null || from === to || reduceMotion()) return;
    const t0 = performance.now(), dur = 450;
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = from + (to - from) * (1 - Math.pow(1 - k, 3)); el.textContent = rm(v); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ================= Flow ================= */
  function afterAction() {
    if (run) {
      const stg = MM.coStage(run);
      if (stg > (run.co.toldStage || 0)) { run.co.toldStage = stg; Sound.levelup(); toast('Unlocked: ' + MM.STAGES[stg].name + '. See the Company tab.', 'ach'); }
      const got = MM.checkAch(run, meta, false);
      if (got.length) { Sound.ach(); buzz([20, 40, 20]); got.forEach(a => toast('Achievement: ' + a.name + ' · +' + a.lp + ' Legacy', 'ach')); }
      (run.bounties || []).forEach(b => { if (b.done && !b.told) { b.told = true; Sound.levelup(); toast('Bounty done: ' + b.text + ' · +' + b.lp + ' Legacy', 'ach'); } else if (b.failed && !b.told && run.phase !== 'ended') { b.told = true; toast('Bounty missed: ' + b.text, 'bad'); } });
      saveRun();
    }
    saveMeta();
  }
  function enterRun(slot, s) {
    run = s; UI.slot = slot; UI.sheet = null; UI.modal = null; UI.lastCash = null;
    if (s.phase === 'sea') { UI.screen = 'sea'; UI.sea.frac = MM.progress(s); render(); seaLoop(); }
    else if (s.phase === 'sunk') { UI.screen = 'sea'; UI.modal = { type: 'sunk', text: 'The battered hull finally gave way.' }; render(); }
    else { UI.screen = 'run'; UI.tab = 'market'; render(); }
  }
  function stopSea() { clearTimeout(UI.sea.timer); UI.sea.timer = null; }
  function stopShip() { cancelAnimationFrame(UI.sea.raf); }
  function seaLoop() {
    stopSea();
    if (!run || run.phase !== 'sea' || UI.screen !== 'sea') return;
    if (run.pending) { renderOverlay(); return; }
    if (UI.modal) return;
    const delay = UI.sea.fast ? 260 : 780;
    UI.sea.timer = setTimeout(() => {
      if (!run || run.phase !== 'sea') return;
      const logBefore = run.log.length ? run.log[0] : null;
      const r = MM.stepVoyage(run);
      afterAction();
      if (r.type === 'day') {
        animateShip(MM.progress(run), delay - 40);
        refreshSeaChrome(logBefore);
        seaLoop();
      } else if (r.type === 'event') {
        animateShip(MM.progress(run), 300);
        refreshSeaChrome(logBefore);
        if (r.event.type === 'storm') { Sound.storm(); buzz([80, 60, 120]); }
        else if (r.event.type === 'pirates') { Sound.alert(); buzz([60, 40, 60, 40, 60]); }
        else { Sound.alert(); buzz(40); }
        renderOverlay();
      } else if (r.type === 'arrived') {
        animateShip(1, 200);
        Sound.bell(); buzz(30);
        setTimeout(() => { UI.screen = 'run'; UI.tab = 'market'; UI.modal = { type: 'arrival', rep: r.report }; UI.sea.frac = 0; render(); }, reduceMotion() ? 0 : 450);
      } else if (r.type === 'sunk') {
        Sound.bad(); buzz([200, 100, 200]);
        UI.modal = { type: 'sunk', text: r.text }; renderOverlay();
      }
    }, delay);
  }
  function refreshSeaChrome(logBefore) {
    const s = run;
    const hudEl = document.querySelector('#screen .hud');
    if (hudEl) { hudEl.outerHTML = hud(); countCash(); }
    if (UI.seaScene) UI.seaScene.set({ event: s.pending ? s.pending.type : null });
    const pill = document.querySelector('.voyage-pill span');
    if (pill && s.voyage) pill.textContent = 'Day ' + Math.min(s.voyage.idx, s.voyage.days) + ' of ' + s.voyage.days + (s.voyage.insured ? ' · insured' : '');
    const logEl = document.querySelector('.sealog');
    if (logEl && s.voyage) {
      const logs = s.log.filter(l => l.day > s.voyage.startDay).slice(0, 5);
      if (logs.length) logEl.innerHTML = logs.map((l, i) => '<li class="' + l.kind + (i === 0 && l !== logBefore ? ' fresh' : '') + '"><small>Day ' + l.day + '</small><span>' + esc(l.text) + '</span></li>').join('');
    }
  }
  function finishSeason() {
    stopSea(); stopShip();
    const f = MM.endSeason(run, meta);
    if (saveMeta()) lsDel(KEYS[UI.slot]);
    UI.final = f; UI.endRun = run; run = null; UI.slot = null;
    UI.screen = 'end'; UI.modal = null; UI.sheet = null;
    render();
    Sound.fanfare(); buzz([30, 50, 30, 50, 90]);
  }
  function startNormal() {
    const st = UI.setup;
    const c = MM.CAPTAINS[st.captain];
    if (c.unlock && !meta.unlocks[c.unlock]) { toast('Unlock ' + c.name + ' in Legacy first', 'bad'); Sound.error(); return; }
    const s = MM.newRun({ captain: st.captain, level: Math.min(st.level, meta.levelMax), days: st.days }, meta);
    lsSet('mm.setup.days', String(st.days));
    lsSet(KEYS.normal, MM.serialize(s));
    Sound.horn(); buzz(40);
    enterRun('normal', s);
  }
  function startDaily(force) {
    const key = todayKey();
    const cur = loadSlot('daily');
    if (cur && cur.dateKey === key && !force) { enterRun('daily', cur); return; }
    const s = MM.newRun({ mode: 'daily', dateKey: key }, meta);
    lsSet(KEYS.daily, MM.serialize(s));
    Sound.horn(); buzz(40);
    enterRun('daily', s);
    UI.sheet = { type: 'info', title: 'Daily Voyage', icon: I.calendar, html: '<p>The same seas, prices and storms for everyone today. Captain Rahim, standard rules' + (s.twist ? ', plus today’s twist:' : '.') + '</p>' + (s.twist ? '<p><b>' + esc(MM.TWISTS[s.twist].name) + '.</b> ' + esc(MM.TWISTS[s.twist].desc) + '</p>' : '') + '<p>Everyone races the same Towkay Lim and the same three bounties.</p><p class="dim">Finish it on consecutive days to build your streak.</p>' };
    renderOverlay();
  }

  /* ================= Actions ================= */
  const A = {
    network() {
      if (!window.MMNetworkUI || !window.MMNetwork) { toast('Monsoon Company could not load. Reload the game and try again.', 'bad'); return; }
      stopSea(); stopShip(); UI.sheet = null; UI.modal = null; run = null; UI.slot = null;
      unmount(UI.widgets); unmount(UI.owidgets);
      renderOverlay(); UI.screen = 'network';
      window.MMNetworkUI.open({ root, archive: true, onExit() { UI.screen = 'title'; render(); focusWithin(document.getElementById('screen')); } });
    },
    'go-title'() { if (run && !saveRun()) return; stopSea(); stopShip(); run = null; UI.slot = null; UI.screen = 'title'; UI.sheet = null; UI.modal = null; render(); },
    continue(d) { const s = loadSlot(d.slot); if (s) enterRun(d.slot, s); else render(); },
    'new-season'() {
      UI.setup.level = Math.min(UI.setup.level, meta.levelMax);
      const cur = loadSlot('normal');
      if (cur && UI.screen === 'title') { UI.sheet = { type: 'confirm', title: 'Abandon your season?', text: 'You have a season in progress (day ' + cur.day + ', ' + esc(rm(MM.netWorth(cur))) + '). Starting a new one will throw it away.', yes: 'new-season-go', yesLabel: 'Start fresh', danger: true }; renderOverlay(); return; }
      UI.screen = 'setup'; UI.sheet = null; render();
    },
    'new-season-go'() { lsDel(KEYS.normal); UI.screen = 'setup'; UI.sheet = null; render(); },
    'pick-capt'(d) { const c = MM.CAPTAINS[d.id]; if (c.unlock && !meta.unlocks[c.unlock]) { UI.backTo = 'new-season-back'; UI.legacyCat = 'Captains'; UI.screen = 'legacy'; render(); return; } UI.setup.captain = d.id; render(); },
    'new-season-back'() { UI.backTo = null; UI.screen = 'setup'; render(); },
    'pick-level'(d) { const n = +d.id; if (n > meta.levelMax) { toast('Finish level ' + meta.levelMax + ' worth ' + rm(MM.levelGoal({ maxDays: setupDays(UI.setup) })) + ' or more to unlock', 'bad'); return; } UI.setup.level = n; render(); },
    'pick-days'(d) { const n = +d.id; if (MM.SEASON_DAYS.indexOf(n) < 0) return; UI.setup.days = n; Sound.tap(); render(); },
    'start-season'() { startNormal(); },
    daily() {
      const key = todayKey();
      const cur = loadSlot('daily');
      if (cur && cur.dateKey !== key) lsDel(KEYS.daily);
      if (meta.daily.plays[key] && !(cur && cur.dateKey === key)) { UI.sheet = { type: 'confirm', title: 'Sail today’s voyage again?', text: 'You’ve already finished today’s Daily Voyage (best ' + esc(rm(meta.daily.best[key] || 0)) + '). Your best score counts.', yes: 'daily-go', yesLabel: 'Sail again' }; renderOverlay(); return; }
      startDaily(false);
    },
    'daily-go'() { UI.sheet = null; startDaily(true); },
    legacy() { UI.backTo = 'go-title'; UI.screen = 'legacy'; render(); },
    ledger() { UI.screen = 'ledger'; render(); },
    settings() { UI.screen = 'settings'; render(); },
    help() { UI.helpBack = UI.screen === 'settings' ? 'settings' : 'go-title'; UI.screen = 'help'; render(); },
    'legacy-cat'(d) { UI.legacyCat = d.id; render(); },
    unlock(d) {
      const u = MM.UNLOCK_BY_ID[d.id];
      UI.sheet = { type: 'confirm', title: 'Unlock ' + u.name + '?', text: esc(u.sub) + '<br><br>Costs <b>' + u.cost + ' Legacy</b>. You have ' + meta.lp + '.', yes: 'unlock-go', id: d.id, yesLabel: 'Unlock' };
      renderOverlay();
    },
    'unlock-go'(d) {
      const r = MM.unlock(meta, d.id);
      UI.sheet = null;
      if (!r.ok) { toast(r.msg, 'bad'); Sound.error(); render(); return; }
      Sound.ach(); buzz([20, 30, 20]);
      toast(MM.UNLOCK_BY_ID[d.id].name + ' unlocked', 'good');
      (r.ach || []).forEach(a => toast('Achievement: ' + a.name + ' · +' + a.lp + ' Legacy', 'ach'));
      saveMeta(); render();
    },
    toggle(d) {
      meta.settings[d.id] = !meta.settings[d.id]; saveMeta();
      if (d.id === 'sound' && meta.settings.sound) Sound.good();
      if (d.id === 'sound' || d.id === 'music') { if (meta.settings.sound && meta.settings.music) { SFX.ac(); SFX.Music.start(); } else SFX.Music.stop(); }
      render();
    },
    'reset-tips'() { meta.tips = {}; meta.settings.tips = true; saveMeta(); toast('Tips will show again', 'good'); render(); },
    'tip-ok'(d) { meta.tips[d.id] = 1; saveMeta(); render(); },
    export() {
      const data = { meta, normal: lsGet(KEYS.normal), daily: lsGet(KEYS.daily) };
      if (run && UI.slot) data[UI.slot] = MM.serialize(run);
      const code = 'MM1:' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      const done = () => toast('Backup code copied', 'good');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { UI.sheet = { type: 'info', title: 'Backup code', html: '<textarea readonly class="codebox">' + esc(code) + '</textarea>' }; renderOverlay(); });
      else { UI.sheet = { type: 'info', title: 'Backup code', html: '<textarea readonly class="codebox">' + esc(code) + '</textarea>' }; renderOverlay(); }
    },
    'import-open'() { UI.importOpen = !UI.importOpen; render(); },
    import() {
      const box = document.getElementById('importBox'); if (!box) return;
      try {
        const raw = box.value.trim(); if (raw.indexOf('MM1:') !== 0) throw new Error('bad');
        const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4)))));
        meta = restoreBackup(data);
        storageWarning = false;
        UI.importOpen = false; toast('Progress restored', 'good'); UI.screen = 'title'; render();
      } catch (e) { toast(e.storage ? e.message : 'That code didn’t work. Your progress was not changed.', 'bad'); Sound.error(); }
    },
    reset() { UI.sheet = { type: 'confirm', title: 'Erase captain progress?', text: 'Captain seasons, Daily Voyage, Legacy, unlocks and achievements on this device will be deleted. Monsoon Company is kept. This can’t be undone.', yes: 'reset-go', yesLabel: 'Erase', danger: true }; renderOverlay(); },
    'reset-go'() { lsDel(KEYS.meta); lsDel(KEYS.normal); lsDel(KEYS.daily); meta = MM.newMeta(); saveMeta(); UI.sheet = null; UI.screen = 'title'; toast('Progress erased'); render(); },
    install() { const e = UI.installEvt; if (!e) return; e.prompt(); e.userChoice.then(() => { UI.installEvt = null; render(); }); },
    'sw-update'() { if (UI.swWaiting) UI.swWaiting.postMessage({ type: 'SKIP_WAITING' }); },

    tab(d) { UI.tab = d.id; UI.sheet = null; Sound.tap(); render(); const sc = document.querySelector('#screen .scroll'); if (sc && !UI.scroll[UI.renderedKey]) sc.scrollTop = 0; },
    trade(d) {
      const s = run, g = d.g;
      const hold = s.cargo[g] ? s.cargo[g].q : 0;
      const mode = hold > 0 ? 'sell' : 'buy';
      UI.sheet = { type: 'trade', g, mode, q: mode === 'sell' ? hold : MM.maxBuy(s, g) };
      Sound.tap(); renderOverlay();
    },
    'trade-mode'(d) { const s = run, sh = UI.sheet; sh.mode = d.id; sh.q = d.id === 'sell' ? (s.cargo[sh.g] ? s.cargo[sh.g].q : 0) : MM.maxBuy(s, sh.g); renderOverlay(); },
    qty(d) { setQty(UI.sheet.q + (+d.d)); },
    'qty-set'(d) { const max = UI.sheet.mode === 'buy' ? MM.maxBuy(run, UI.sheet.g) : (run.cargo[UI.sheet.g] ? run.cargo[UI.sheet.g].q : 0); setQty(Math.floor(max * +d.f)); },
    'do-trade'() {
      const s = run, sh = UI.sheet;
      const r = sh.mode === 'buy' ? MM.buy(s, sh.g, sh.q) : MM.sell(s, sh.g, sh.q);
      if (!r.ok) { toast(r.msg, 'bad'); Sound.error(); return; }
      if (sh.mode === 'buy') { Sound.buy(); buzz(15); toast('Bought ' + num(r.q) + ' t ' + gName(sh.g).toLowerCase() + ' for ' + rm(r.total)); }
      else { Sound.sell(r.profit >= 0); buzz(r.profit >= 0 ? [15, 30, 15] : 30); floatText((r.profit >= 0 ? '+' : '') + rm(r.profit), r.profit >= 0); toast('Sold ' + num(r.q) + ' t for ' + rm(r.total)); }
      UI.sheet = null;
      afterAction(); render();
    },
    map(d, el, ev) {
      const mv = el._w; if (!mv) return;
      const best = mv.pick(ev.clientX, ev.clientY, 20);
      if (best) { UI.sheet = { type: 'port', p: best }; Sound.cursor(); mv.set({ selected: best }); el.querySelectorAll('.lbl').forEach(l => l.classList.toggle('sel', l.textContent === pShort(best))); renderOverlay(); }
    },
    port(d) { if (!MM.PORTS[d.p]) return; UI.sheet = { type: 'port', p: d.p }; Sound.tap(); renderOverlay(); },

    'wh-build'() { coAct(MM.buildWarehouse(run), 'Warehouse opened. Store cargo from the Market tab or add standing orders.'); },
    'wh-up'(d) { coAct(MM.upgradeWarehouse(run, d.p), 'Warehouse enlarged.'); },
    'wh-store'(d) { const r = MM.storeCargo(run, d.g, run.cargo[d.g] ? run.cargo[d.g].q : 0); coAct(r, r.ok ? 'Stored ' + num(r.q) + ' t ' + gName(d.g).toLowerCase() + '.' : ''); },
    'wh-take'(d) { const w = run.co.wh[run.port]; const r = MM.takeCargo(run, d.g, w && w.stock[d.g] ? w.stock[d.g].q : 0); coAct(r, r.ok ? 'Loaded ' + num(r.q) + ' t ' + gName(d.g).toLowerCase() + '.' : ''); },
    'fac-sheet'() { UI.sheet = { type: 'factory' }; Sound.tap(); renderOverlay(); },
    'fac-build'(d) { UI.sheet = null; const r = MM.buildFactory(run, d.id); if (r.ok) Sound.fanfare(); coAct(r, 'Factory built. Feed it with standing buy orders.'); },
    'fac-up'(d) { coAct(MM.upgradeFactory(run, d.p), 'Factory doubled.'); },
    'order-new'(d) {
      const w = run.co.wh[d.p], fac = run.co.fac[d.p];
      const g = fac ? Object.keys(MM.RECIPES[fac.recipe].input).find(x => !w.orders.some(o => o.g === x && o.kind === 'buy')) : null;
      UI.sheet = { type: 'order', p: d.p, kind: 'buy', g: g || goodsShown(run).find(x => !MM.GOODS[x].perish), qty: 25, mode: 'cheap' }; Sound.tap(); renderOverlay();
    },
    'ord-kind'(d) { UI.sheet.kind = d.v; UI.sheet.mode = d.v === 'buy' ? 'cheap' : 'dear'; renderOverlay(); },
    'ord-g'(d) { UI.sheet.g = d.v; renderOverlay(); },
    'ord-q'(d) { UI.sheet.qty = +d.v; renderOverlay(); },
    'ord-m'(d) { UI.sheet.mode = d.v; renderOverlay(); },
    'ord-save'() { const o = UI.sheet; const r = MM.setOrder(run, o.p, o.kind, o.g, o.qty, o.mode); if (r.ok) UI.sheet = null; coAct(r, 'Standing order saved. It runs from tomorrow.'); },
    'order-del'(d) { coAct(MM.removeOrder(run, d.p, +d.id), 'Order removed.'); },
    'route-new'() {
      const co = run.co, from = co.wh[run.port] ? run.port : Object.keys(co.wh)[0];
      const st = co.wh[from].stock, g = Object.keys(st).sort((a, b) => st[b].q - st[a].q)[0] || goodsShown(run)[0];
      let to = run.ports.filter(p => p !== from).sort((a, b) => MM.PF[b][g] - MM.PF[a][g])[0];
      UI.sheet = { type: 'route', from, g, qty: 100, to, dest: 'mkt' }; Sound.tap(); renderOverlay();
    },
    'rt-from'(d) { const r = UI.sheet; r.from = d.v; if (r.to === d.v) r.to = run.ports.find(p => p !== d.v); if (r.dest === 'wh' && !run.co.wh[r.to]) r.dest = 'mkt'; renderOverlay(); },
    'rt-g'(d) { UI.sheet.g = d.v; renderOverlay(); },
    'rt-q'(d) { UI.sheet.qty = +d.v; renderOverlay(); },
    'rt-to'(d) { UI.sheet.to = d.v; if (UI.sheet.dest === 'wh' && !run.co.wh[d.v]) UI.sheet.dest = 'mkt'; renderOverlay(); },
    'rt-dest'(d) { UI.sheet.dest = d.v; renderOverlay(); },
    'rt-save'() { const r = UI.sheet; const res = MM.addRoute(run, r.from, r.to, r.g, r.qty, r.dest); if (res.ok) UI.sheet = null; coAct(res, 'Route started. The first trip leaves when the stock is ready.'); },
    'route-pause'(d) { const r = MM.pauseRoute(run, +d.id); coAct(r, r.ok && r.paused ? 'Route paused.' : 'Route resumed.'); },
    'route-del'(d) { coAct(MM.removeRoute(run, +d.id), 'Route removed.'); },
    reserve(d) { coAct(MM.setReserve(run, +d.v), 'Cash reserve set to ' + rm(+d.v) + '.'); },
    'rival-info'() { UI.sheet = { type: 'info', title: MM.RIVAL.name, icon: I.sword, html: raceCard(run) + '<h4 class="sub">Bounties</h4>' + bountyList(run) }; Sound.tap(); renderOverlay(); },
    plan(d) { UI.sheet = { type: 'depart', p: d.p, insure: run.insurePref !== false }; renderOverlay(); },
    'toggle-ins'() { UI.sheet.insure = !UI.sheet.insure; renderOverlay(); },
    'cast-off'(d) {
      const r = MM.startVoyage(run, d.p, UI.sheet.insure);
      if (!r.ok) { toast(r.msg, 'bad'); Sound.error(); return; }
      UI.sheet = null; UI.screen = 'sea'; UI.sea.frac = 0; UI.lastCash = Math.round(run.cash);
      Sound.horn(); buzz(40);
      afterAction(); render(); seaLoop();
    },
    'sea-fast'() { UI.sea.fast = !UI.sea.fast; if (UI.seaScene) UI.seaScene.set({ speed: UI.sea.fast ? 2 : 1 }); const b = document.querySelector('[data-a="sea-fast"]'); if (b) { b.classList.toggle('on', UI.sea.fast); b.querySelector('span').textContent = UI.sea.fast ? 'Fast' : 'Normal'; } },
    choose(d) {
      const e = run.pending; if (!e) return;
      const r = MM.resolve(run, d.id);
      if (r.type === 'sunk') { UI.modal = { type: 'sunk', text: r.text }; afterAction(); render(); return; }
      if (!r.ok) { toast(r.msg, 'bad'); Sound.error(); return; }
      if (r.tone === 'good') { Sound.good(); buzz(20); } else if (r.tone === 'bad') { Sound.bad(); buzz([60, 40, 60]); } else Sound.tap();
      UI.modal = { type: 'result', title: e.title, text: r.text, tone: r.tone, evType: e.type };
      afterAction(); render();
    },
    'result-ok'() { UI.modal = null; render(); if (run && run.phase === 'sea') seaLoop(); },
    ashore() { UI.modal = null; render(); },
    'ashore-co'() { UI.modal = null; UI.tab = 'company'; render(); },
    'co-choose'(d) { coAct(MM.coChoose(run, +d.id, d.c), 'Done.'); },
    'deal-accept'() { coAct(MM.acceptDeal(run), 'Big order accepted. Deliver by ship, freight or your warehouse there.'); },
    'deal-decline'() { coAct(MM.declineDeal(run), 'Order declined.'); },
    finish() { UI.modal = null; finishSeason(); },
    wait() {
      const r = MM.waitDay(run);
      if (!r.ok) { toast(r.msg, 'bad'); return; }
      if (r.text) toast(r.text, 'bad'); else toast('A day passes in ' + pName(run.port) + '.');
      afterAction(); render();
    },
    'end-season'() { finishSeason(); },
    'end-early'() { UI.sheet = { type: 'confirm', title: 'End the season now?', text: 'Your cargo will be sold here at today’s prices, debts settled, and the season scored.<br><br>Season Legacy requires a completed voyage (shipwrecks count) and scales with days played; eligible runs earn at least 1 LP.', yes: 'end-season', yesLabel: 'End season', danger: true }; renderOverlay(); },
    accept(d) { const r = MM.acceptOffer(run, +d.id); if (!r.ok) { toast(r.msg, 'bad'); return; } Sound.good(); toast('Contract signed'); afterAction(); render(); },
    'bank-borrow'(d) { const amt = Math.floor(MM.bankLimit(run) * +d.f); const r = MM.bankBorrow(run, amt); if (!r.ok) { toast(r.msg, 'bad'); return; } Sound.buy(); toast('Borrowed ' + rm(amt) + ' from the bank'); afterAction(); render(); },
    'bank-repay'() { const r = MM.bankRepay(run, run.bank); if (!r.ok) { toast(r.msg, 'bad'); return; } Sound.good(); toast('Bank repaid'); afterAction(); render(); },
    'along-borrow'(d) {
      const amt = Math.floor(MM.alongLimit(run) * +d.f);
      UI.sheet = { type: 'confirm', title: 'Borrow from the Ah Long?', text: 'You get <b>' + esc(rm(amt)) + '</b> now. It grows 3% a day. If it isn’t repaid by day ' + (run.along > 0 ? run.alongDue : run.day + 10) + ', his boys will take 125% of it from your cash and cargo.', yes: 'along-go', id: String(amt), yesLabel: 'Take the money', danger: true };
      renderOverlay();
    },
    'along-go'(d) { const r = MM.alongBorrow(run, +d.id); UI.sheet = null; if (!r.ok) { toast(r.msg, 'bad'); render(); return; } Sound.buy(); toast('The Ah Long counts out ' + rm(+d.id)); afterAction(); render(); },
    'along-repay'() { const r = MM.alongRepay(run, run.along); if (!r.ok) { toast(r.msg, 'bad'); return; } Sound.good(); toast(run.along > 0 ? 'Part repaid' : 'Ah Long repaid in full'); afterAction(); render(); },
    report() { const r = MM.buyReport(run); if (!r.ok) { toast(r.msg, 'bad'); return; } Sound.good(); toast('Fresh prices from every port'); afterAction(); render(); },
    repair() { const r = MM.repair(run); if (!r.ok) { toast(r.msg, 'bad'); return; } Sound.good(); toast('Hull repaired for ' + rm(r.cost)); afterAction(); render(); },
    upgrade(d) { const r = MM.buyUpgrade(run, d.id); if (!r.ok) { toast(r.msg, 'bad'); return; } Sound.ach(); toast(MM.UPGRADES[d.id].name + ' fitted'); afterAction(); render(); },
    'buy-ship'(d) {
      const o = MM.shipOffers(run).find(x => x.id === d.id);
      UI.sheet = { type: 'confirm', title: (o.cap > MM.shipCap(run) ? 'Upgrade to a ' : 'Switch to a ') + o.name + '?', text: 'Price ' + esc(rm(o.price)) + ', less ' + esc(rm(MM.tradeIn(run))) + ' for your ' + esc(MM.SHIPS[run.ship.cls].name) + '. ' + (o.net >= 0 ? 'You pay <b>' + esc(rm(o.net)) + '</b>.' : 'You receive <b>' + esc(rm(-o.net)) + '</b>.') + ' Running costs become ' + esc(rm(o.daily)) + ' a day.', yes: 'ship-go', id: o.id, yesLabel: 'Sign the papers' };
      renderOverlay();
    },
    'ship-go'(d) { const r = MM.buyShip(run, d.id); UI.sheet = null; if (!r.ok) { toast(r.msg, 'bad'); render(); return; } Sound.fanfare(); buzz([30, 40, 30]); toast('Welcome aboard the ' + MM.SHIPS[d.id].name); afterAction(); render(); },
    'close-sheet'() { UI.sheet = null; renderOverlay(); if (UI.screen === 'run' && UI.tab === 'map' && UI.mainMap) { UI.mainMap.set({ selected: null }); document.querySelectorAll('.lbl.sel').forEach(l => l.classList.remove('sel')); } },
    menu() { UI.sheet = { type: 'menu' }; Sound.tap(); renderOverlay(); },
    'toggle-sound'() { meta.settings.sound = !meta.settings.sound; saveMeta(); if (meta.settings.sound) { Sound.good(); if (meta.settings.music) SFX.Music.start(); } else SFX.Music.stop(); renderOverlay(); },
    'toggle-music'() { meta.settings.music = !meta.settings.music; saveMeta(); if (meta.settings.music && meta.settings.sound) { SFX.ac(); SFX.Music.start(); } else SFX.Music.stop(); renderOverlay(); },
    'help-run'() { stopSea(); UI.sheet = null; UI.helpBack = 'help-back'; UI.prevScreen = UI.screen; UI.screen = 'help'; render(); },
    'help-back'() { UI.screen = UI.prevScreen || 'title'; render(); if (UI.screen === 'sea') seaLoop(); },
    'season-info'() {
      const s = run;
      const ph = s.monsoon.phase === 'NE' ? 'northeast' : 'southwest';
      const left = s.maxDays - s.day;
      UI.sheet = { type: 'info', title: 'Day ' + s.day + ' of ' + s.maxDays, icon: I.calendar, html: '<p><b>' + plural(Math.max(0, left), 'day') + ' left</b> in the season. Net worth now: <b>' + esc(rm(MM.netWorth(s))) + '</b> (cash ' + esc(rm(s.cash)) + ', cargo ' + esc(rm(MM.cargoValue(s))) + ', ship ' + esc(rm(MM.tradeIn(s))) + (s.bank + s.along > 0 ? ', debts −' + esc(rm(s.bank + s.along)) : '') + ').</p><p>Running costs: ' + esc(rm(MM.dailyCost(s))) + ' a day.</p>' + sparkline(s.hist, 320, 70) + '<p class="dim">The ' + ph + ' monsoon is blowing.</p>' };
      renderOverlay();
    },
    'wind-info'() {
      const s = run;
      const ph = s.monsoon.phase;
      const shiftTxt = s.monsoon.shifted ? 'It turned on day ' + s.monsoon.shiftDay + ' and holds for the rest of the season.' : s.level >= 10 ? 'Nobody can say when it will turn.' : 'Forecasters expect it to turn around <b>day ' + s.monsoon.forecast + '</b> (give or take a few days).';
      UI.sheet = { type: 'info', title: (ph === 'NE' ? 'Northeast' : 'Southwest') + ' monsoon', icon: I.wind, html: '<p>' + (ph === 'NE' ? 'Winds blow from the northeast. Voyages heading <b>south and west</b> are faster; voyages heading north and east are slower.' : 'Winds blow from the southwest. Voyages heading <b>north and east</b> are faster; voyages heading south and west are slower. Typhoons stalk the South China Sea.') + '</p><p>' + shiftTxt + '</p><p class="dim">The Malacca Strait and Java Sea are sheltered, so the wind matters less there. Squalls are worst in the days around the change.</p>' };
      renderOverlay();
    },
  };
  function coAct(r, msg) {
    if (!r || !r.ok) { toast((r && r.msg) || 'Not possible', 'bad'); Sound.error(); return; }
    if (msg) toast(msg, 'good'); Sound.good();
    afterAction(); render();
  }
  function setQty(q) {
    const s = run, sh = UI.sheet; if (!sh) return;
    const max = sh.mode === 'buy' ? MM.maxBuy(s, sh.g) : (s.cargo[sh.g] ? s.cargo[sh.g].q : 0);
    sh.q = Math.max(0, Math.min(max, Math.round(q)));
    const v = document.getElementById('qVal'); if (v) v.textContent = num(sh.q);
    const rg = document.getElementById('qRange'); if (rg && +rg.value !== sh.q) rg.value = sh.q;
    const dyn = document.getElementById('tradeDyn'); if (dyn) dyn.innerHTML = tradeDyn();
  }

  /* ================= Events ================= */
  root.addEventListener('click', ev => {
    Sound.unlock();
    const el = ev.target.closest('[data-a]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (el.tagName === 'INPUT') return;
    const a = el.dataset.a;
    if (A[a]) { ev.preventDefault(); A[a](el.dataset, el, ev); }
  });
  root.addEventListener('input', ev => {
    const el = ev.target;
    if (el && el.dataset && el.dataset.a === 'qty-range') setQty(+el.value);
  });
  root.addEventListener('keydown', ev => {
    const dialog = document.querySelector('#overlay [role="dialog"]');
    if (!dialog) return;
    if (ev.key === 'Escape' && dialog.classList.contains('sheet')) {
      ev.preventDefault();
      A['close-sheet']();
    } else if (ev.key === 'Tab') {
      const items = Array.from(dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')).filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!first) { ev.preventDefault(); focusWithin(dialog); return; }
      const active = document.activeElement;
      if (!dialog.contains(active) || active.tabIndex < 0 || (ev.shiftKey && active === first) || (!ev.shiftKey && active === last)) {
        ev.preventDefault();
        (ev.shiftKey ? last : first).focus();
      }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopSea(); saveRun(); saveMeta(); }
    else if (run && UI.screen === 'sea' && run.phase === 'sea' && !UI.modal && !run.pending) seaLoop();
  });
  window.addEventListener('pagehide', () => { saveRun(); saveMeta(); });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); UI.installEvt = e; if (UI.screen === 'title') render(); });
  window.addEventListener('appinstalled', () => { UI.installEvt = null; toast('Installed. Find Monsoon Merchant on your home screen.', 'good'); });

  /* ================= Service worker ================= */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        const track = w => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { UI.swWaiting = w; if (UI.screen === 'title') render(); } }); };
        if (reg.waiting && navigator.serviceWorker.controller) { UI.swWaiting = reg.waiting; if (UI.screen === 'title') render(); }
        reg.addEventListener('updatefound', () => track(reg.installing));
        setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
      }).catch(() => { /* offline-only mode */ });
      let reloaded = false;
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !hadController) return; reloaded = true; saveRun(); saveMeta(); location.reload(); });
    });
  }
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persisted().then(p => { if (!p) navigator.storage.persist().catch(() => {}); }).catch(() => {}); }

  try { UI.seenNews = +(sessionStorage.getItem('mm.seen') || 0); } catch (e) { /* ignore */ }
  window.__mm = { get run() { return run; }, get meta() { return meta; }, UI, A, render };
  render();
})();
