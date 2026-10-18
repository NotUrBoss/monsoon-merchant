/* Monsoon Merchant — game engine. Pure logic, no DOM. Runs in the browser and in Node. */
(function (root) {
  'use strict';

  const VERSION = '1.1.0';
  const ELASTIC = 0.5;

  /* ================= RNG (sfc32, serialisable state) ================= */
  function hashSeed(str) {
    str = String(str);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    const out = [];
    for (let k = 0; k < 4; k++) {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      out.push(h | 0);
    }
    return out;
  }
  function rnd(st) {
    let a = st[0] | 0, b = st[1] | 0, c = st[2] | 0, d = st[3] | 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    st[0] = a; st[1] = b; st[2] = c; st[3] = d;
    return (t >>> 0) / 4294967296;
  }
  function stream(seed) { const st = hashSeed(seed); for (let i = 0; i < 12; i++) rnd(st); return st; }
  const rRange = (st, lo, hi) => lo + rnd(st) * (hi - lo);
  const rInt = (st, lo, hi) => lo + Math.floor(rnd(st) * (hi - lo + 1));
  const rPick = (st, arr) => arr[Math.floor(rnd(st) * arr.length)];
  function rGauss(st) {
    let u = rnd(st); if (u < 1e-12) u = 1e-12;
    const v = rnd(st);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  /* ================= Formatting (shared with UI) ================= */
  function rm(n) {
    const neg = n < 0; n = Math.abs(n);
    let t;
    if (n >= 1e9) t = (n / 1e9).toFixed(2) + 'B';
    else if (n >= 1e7) t = (n / 1e6).toFixed(1) + 'M';
    else if (n >= 1e6) t = (n / 1e6).toFixed(2) + 'M';
    else if (n >= 1e5) t = Math.round(n / 1e3) + 'k';
    else if (n >= 1e4) t = (n / 1e3).toFixed(1) + 'k';
    else t = Math.round(n).toLocaleString('en-US');
    return (neg ? '−' : '') + 'RM ' + t;
  }
  function price(n) { return 'RM ' + Math.round(n).toLocaleString('en-US'); }
  function tons(n) { return Math.round(n).toLocaleString('en-US') + ' t'; }

  /* ================= DATA ================= */
  const PORTS = {
    penang:    { name: 'Penang', short: 'Penang', cc: 'MY', lon: 100.36, lat: 5.41, bank: false, yard: false, unlock: null, blurb: 'Chip fabs, rubber estates and the best durians on the peninsula.' },
    klang:     { name: 'Port Klang', short: 'Klang', cc: 'MY', lon: 101.36, lat: 3.0, bank: true, yard: true, unlock: null, blurb: 'Home port. Palm oil as far as the eye can see.' },
    singapore: { name: 'Singapore', short: 'Singapore', cc: 'SG', lon: 103.84, lat: 1.25, bank: true, yard: true, unlock: null, blurb: 'The great hub. Deep markets, thin bargains, good banks.' },
    jakarta:   { name: 'Jakarta', short: 'Jakarta', cc: 'ID', lon: 106.88, lat: -6.08, bank: false, yard: false, unlock: 'port_jakarta', blurb: 'Coal barges and palm plantations, and a city that never stops buying rice.' },
    bangkok:   { name: 'Bangkok', short: 'Bangkok', cc: 'TH', lon: 100.86, lat: 13.15, bank: true, yard: false, unlock: 'port_bangkok', blurb: 'Rice and rubber at farm-gate prices.' },
    hcmc:      { name: 'Ho Chi Minh City', short: 'HCMC', cc: 'VN', lon: 106.85, lat: 10.55, bank: false, yard: false, unlock: null, blurb: 'Rice bowl and coffee belt. Hungry for steel and palm oil.' },
    haiphong:  { name: 'Haiphong', short: 'Haiphong', cc: 'VN', lon: 106.72, lat: 20.84, bank: false, yard: true, unlock: null, blurb: 'Factories, coal pits and a building boom that eats steel.' },
    shenzhen:  { name: 'Shenzhen', short: 'Shenzhen', cc: 'CN', lon: 114.08, lat: 22.5, bank: true, yard: true, unlock: null, blurb: 'Workshop of the world. Sells gadgets, buys everything else.' },
    shanghai:  { name: 'Shanghai', short: 'Shanghai', cc: 'CN', lon: 121.9, lat: 30.9, bank: true, yard: true, unlock: 'port_shanghai', blurb: 'Steel mills and deep pockets. Pays a fortune for durians.' },
  };
  const PORT_IDS = Object.keys(PORTS);

  const GOODS = {
    rice:        { name: 'Rice',        base: 2400,  vol: 0.025, gvol: 0.010, depth: 3200 },
    palm:        { name: 'Palm Oil',    base: 4200,  vol: 0.032, gvol: 0.014, depth: 2600 },
    rubber:      { name: 'Rubber',      base: 7000,  vol: 0.038, gvol: 0.016, depth: 1300 },
    steel:       { name: 'Steel',       base: 3300,  vol: 0.028, gvol: 0.012, depth: 2600 },
    coffee:      { name: 'Coffee',      base: 17500, vol: 0.045, gvol: 0.020, depth: 520 },
    electronics: { name: 'Electronics', base: 95000, vol: 0.032, gvol: 0.014, depth: 110 },
    durian:      { name: 'Durian',      base: 32000, vol: 0.045, gvol: 0.016, depth: 160, perish: 4, perishCold: 10, unlock: 'good_durian' },
    coal:        { name: 'Coal',        base: 650,   vol: 0.028, gvol: 0.012, depth: 9000, unlock: 'good_coal' },
  };
  const GOOD_IDS = Object.keys(GOODS);

  // Port price factors vs. the regional average (below 1 = exporter/cheap, above 1 = importer/dear).
  const PF = {
    penang:    { rice: 1.14, palm: 0.84, rubber: 0.80, steel: 1.10, coffee: 1.12, electronics: 0.88, durian: 0.64, coal: 1.16 },
    klang:     { rice: 1.14, palm: 0.78, rubber: 0.88, steel: 1.08, coffee: 1.10, electronics: 0.98, durian: 0.70, coal: 1.12 },
    singapore: { rice: 1.12, palm: 0.86, rubber: 0.94, steel: 1.06, coffee: 1.10, electronics: 1.00, durian: 0.92, coal: 0.96 },
    jakarta:   { rice: 1.24, palm: 0.74, rubber: 0.86, steel: 1.24, coffee: 0.84, electronics: 1.20, durian: 0.94, coal: 0.66 },
    bangkok:   { rice: 0.74, palm: 1.06, rubber: 0.76, steel: 1.20, coffee: 1.00, electronics: 1.06, durian: 0.72, coal: 1.14 },
    hcmc:      { rice: 0.80, palm: 1.22, rubber: 0.94, steel: 1.26, coffee: 0.78, electronics: 1.16, durian: 0.86, coal: 1.08 },
    haiphong:  { rice: 0.92, palm: 1.28, rubber: 1.12, steel: 1.08, coffee: 0.96, electronics: 0.92, durian: 1.08, coal: 0.86 },
    shenzhen:  { rice: 1.16, palm: 1.34, rubber: 1.36, steel: 0.86, coffee: 1.22, electronics: 0.78, durian: 1.40, coal: 1.22 },
    shanghai:  { rice: 1.18, palm: 1.38, rubber: 1.32, steel: 0.70, coffee: 1.30, electronics: 0.86, durian: 1.50, coal: 1.30 },
  };
  const PORT_SIZE = { penang: 0.8, klang: 1.1, singapore: 1.4, jakarta: 1.0, bangkok: 1.0, hcmc: 1.0, haiphong: 0.9, shenzhen: 1.3, shanghai: 1.5 };

  const SHIPS = {
    coaster:   { name: 'Old Coaster',       cap: 150,  speed: 10,   hull: 0.58, price: 0,       tradeIn: 20000, daily: 900,   desc: 'Rust, character and a cranky diesel.' },
    freighter: { name: 'Coastal Freighter', cap: 450,  speed: 11,   hull: 0.70, price: 260000,  daily: 2000,  desc: 'Three times the hold. Still fits every berth.' },
    feeder:    { name: 'Feeder Ship',       cap: 1200, speed: 12.5, hull: 0.80, price: 800000,  daily: 4500,  desc: 'A proper ship. Big enough to move markets.' },
    reefer:    { name: 'Fast Reefer',       cap: 700,  speed: 16,   hull: 0.74, price: 1250000, daily: 5200,  cold: true, unlock: 'ship_reefer', desc: 'Refrigerated and quick. Outruns pirates and spoilage.' },
    handy:     { name: 'Handysize Bulker',  cap: 3500, speed: 13,   hull: 0.90, price: 2400000, daily: 10500, desc: 'A floating warehouse. Shrugs off squalls.' },
  };
  const SHIP_IDS = Object.keys(SHIPS);

  const UPGRADES = {
    cold:     { name: 'Reefer containers', price: 60000,  desc: 'Durian keeps 10 days instead of 4.' },
    security: { name: 'Security team',     price: 45000,  desc: 'Deters pirates and lets you fight back.' },
    plating:  { name: 'Hull plating',      price: 55000,  desc: 'Better storm resistance.' },
    radio:    { name: 'Radio room',        price: 140000, desc: 'Live prices from every port, every day. Hear rumours at sea.' },
  };

  const CAPTAINS = {
    rahim:   { name: 'Rahim',       title: 'The Steady Hand', start: 'klang',     unlock: null,          desc: 'No tricks, no excuses. A solid all-rounder.' },
    meiling: { name: 'Mei Ling',    title: 'The Haggler',     start: 'penang',    unlock: 'capt_meiling', desc: 'Half the trading spread. Contracts pay 12% more.' },
    teoh:    { name: 'Old Teoh',    title: 'The Navigator',   start: 'singapore', unlock: 'capt_teoh',    desc: '15% faster, half the headwind penalty, fewer storms.' },
    kumar:   { name: 'Kumar',       title: 'The Insider',     start: 'penang',    unlock: 'capt_kumar',   desc: 'Knows which rumours to trust. Free market report every 7 days. Intel half price.' },
    siti:    { name: 'Siti',        title: 'The Financier',   start: 'singapore', unlock: 'capt_siti',    desc: 'Half bank interest, double credit, insurance 40% cheaper.' },
    wong:    { name: 'Durian Wong', title: 'The Speculator',  start: 'penang',    unlock: 'capt_wong',    desc: '35% more market shocks. Starts with reefer containers.' },
  };
  const CAPTAIN_IDS = Object.keys(CAPTAINS);

  const UNLOCKS = [
    { id: 'capt_meiling', cat: 'Captains', name: 'Mei Ling', sub: 'The Haggler', cost: 30 },
    { id: 'capt_teoh', cat: 'Captains', name: 'Old Teoh', sub: 'The Navigator', cost: 45 },
    { id: 'capt_kumar', cat: 'Captains', name: 'Kumar', sub: 'The Insider', cost: 60 },
    { id: 'capt_siti', cat: 'Captains', name: 'Siti', sub: 'The Financier', cost: 60 },
    { id: 'capt_wong', cat: 'Captains', name: 'Durian Wong', sub: 'The Speculator', cost: 90 },
    { id: 'port_bangkok', cat: 'Ports', name: 'Bangkok', sub: 'Cheap rice and rubber. Bank, no shipyard.', cost: 25 },
    { id: 'port_jakarta', cat: 'Ports', name: 'Jakarta', sub: 'Cheap coal, palm oil and coffee. Hungry for rice.', cost: 35 },
    { id: 'port_shanghai', cat: 'Ports', name: 'Shanghai', sub: 'Cheap steel. Pays top price for nearly everything else.', cost: 50 },
    { id: 'good_coal', cat: 'Cargo', name: 'Coal', sub: 'Cheap bulk. Needs a big hold to pay.', cost: 20 },
    { id: 'good_durian', cat: 'Cargo', name: 'Durian', sub: 'Huge margins into China. Spoils in 4 days without reefers.', cost: 35 },
    { id: 'ship_reefer', cat: 'Ships', name: 'Fast Reefer', sub: '16 knots, refrigerated hold.', cost: 40 },
    { id: 'perk_cash1', cat: 'Perks', name: 'Family money', sub: '+RM 25k starting cash', cost: 15 },
    { id: 'perk_cash2', cat: 'Perks', name: 'Angel investor', sub: '+RM 50k more starting cash', cost: 35, req: 'perk_cash1' },
    { id: 'perk_cash3', cat: 'Perks', name: 'Old money', sub: '+RM 100k more starting cash', cost: 70, req: 'perk_cash2' },
    { id: 'perk_contacts', cat: 'Perks', name: 'Old contacts', sub: 'Start each season with a full market report and a solid tip.', cost: 25 },
    { id: 'perk_insurer', cat: 'Perks', name: 'Friendly underwriter', sub: 'Insurance 30% cheaper.', cost: 25 },
    { id: 'perk_crew', cat: 'Perks', name: 'Loyal crew', sub: 'Running costs 20% lower.', cost: 30 },
  ];
  const UNLOCK_BY_ID = {}; UNLOCKS.forEach(u => { UNLOCK_BY_ID[u.id] = u; });

  const LEVELS = [
    { n: 0, desc: 'Standard season.' },
    { n: 1, desc: 'Running costs +25%.' },
    { n: 2, desc: 'Storms 30% more likely.' },
    { n: 3, desc: 'Rumours less reliable.' },
    { n: 4, desc: 'Bank interest +50%.' },
    { n: 5, desc: 'Season cut to 52 days.' },
    { n: 6, desc: 'Pirates 40% bolder.' },
    { n: 7, desc: 'Trading spreads +2%.' },
    { n: 8, desc: 'Contract penalties doubled.' },
    { n: 9, desc: 'Start with RM 20k less.' },
    { n: 10, desc: 'No monsoon forecast. Stronger winds.' },
  ];

  const RANKS = [
    { id: 'deckhand', name: 'Deckhand', min: -Infinity },
    { id: 'bosun', name: 'Bosun', min: 200000 },
    { id: 'trader', name: 'Trader', min: 600000 },
    { id: 'merchant', name: 'Merchant', min: 1500000 },
    { id: 'towkay', name: 'Towkay', min: 4000000 },
    { id: 'tycoon', name: 'Tycoon', min: 10000000 },
    { id: 'legend', name: 'Legend of the Straits', min: 25000000 },
  ];
  const MERCHANT_RANK = 3;

  const TWISTS = {
    typhoon: { name: 'Typhoon season', desc: 'Storms 50% more likely.' },
    boom:    { name: 'Boom times', desc: 'Market shocks 40% more frequent.' },
    calm:    { name: 'Calm seas, busy pirates', desc: 'Storms halved, pirates doubled.' },
    credit:  { name: 'Tight credit', desc: 'Bank interest doubled.' },
    windfall:{ name: 'Windfall', desc: 'Start with RM 100k.' },
    sprint:  { name: 'Sprint', desc: 'Season cut to 45 days.' },
  };
  const TWIST_IDS = Object.keys(TWISTS);

  const REGION_NAMES = { strait: 'Malacca Strait', java: 'Java Sea', gulf: 'Gulf of Thailand', scs: 'South China Sea', tonkin: 'Gulf of Tonkin', ecs: 'Taiwan Strait' };

  /* ================= Sea lanes ================= */
  const NODES = {
    m_n: [100.0, 4.4], m_s: [102.2, 1.8], sg_w: [103.4, 1.1], sg_e: [104.6, 1.3],
    riau: [105.0, -0.3], karimata: [106.6, -3.4],
    anambas: [105.8, 3.9], my_e: [104.3, 4.4], gulf: [102.6, 8.6], gulf_n: [100.9, 12.0],
    camau: [104.6, 7.9], delta: [106.4, 8.8], scs_s: [107.6, 8.4], vt: [107.3, 10.0],
    vn_c: [110.0, 12.2], vn_n: [109.4, 16.2], tonkin: [107.6, 19.2],
    paracel: [112.7, 17.2], prd: [114.1, 21.8],
    tonkin_n: [109.2, 20.4], qz: [110.3, 20.2], lz_e: [111.4, 20.8],
    tw: [119.5, 24.2], zj: [122.6, 28.3],
  };
  const EDGES = [
    ['penang', 'm_n', 'strait'], ['m_n', 'klang', 'strait'], ['klang', 'm_s', 'strait'], ['m_s', 'sg_w', 'strait'], ['sg_w', 'singapore', 'strait'],
    ['singapore', 'sg_e', 'strait'],
    ['sg_e', 'riau', 'java'], ['riau', 'karimata', 'java'], ['karimata', 'jakarta', 'java'],
    ['sg_e', 'my_e', 'gulf'], ['my_e', 'gulf', 'gulf'], ['gulf', 'gulf_n', 'gulf'], ['gulf_n', 'bangkok', 'gulf'],
    ['sg_e', 'anambas', 'scs'], ['my_e', 'anambas', 'scs'], ['anambas', 'scs_s', 'scs'], ['scs_s', 'vt', 'scs'], ['vt', 'hcmc', 'scs'],
    ['vt', 'delta', 'scs'], ['delta', 'camau', 'gulf'], ['camau', 'gulf', 'gulf'],
    ['vt', 'vn_c', 'scs'], ['scs_s', 'vn_c', 'scs'],
    ['vn_c', 'vn_n', 'scs'], ['vn_n', 'tonkin', 'tonkin'], ['tonkin', 'haiphong', 'tonkin'],
    ['vn_c', 'paracel', 'scs'], ['paracel', 'prd', 'scs'], ['prd', 'shenzhen', 'scs'],
    ['haiphong', 'tonkin_n', 'tonkin'], ['tonkin_n', 'qz', 'tonkin'], ['qz', 'lz_e', 'scs'], ['lz_e', 'prd', 'scs'],
    ['prd', 'tw', 'ecs'], ['tw', 'zj', 'ecs'], ['zj', 'shanghai', 'ecs'],
  ];
  function ll(id) { const p = PORTS[id]; return p ? [p.lon, p.lat] : NODES[id]; }
  function nmBetween(a, b) {
    const A = ll(a), B = ll(b);
    const lat = ((A[1] + B[1]) / 2) * Math.PI / 180;
    const dx = (B[0] - A[0]) * Math.cos(lat) * 60, dy = (B[1] - A[1]) * 60;
    return Math.hypot(dx, dy) * 1.05;
  }
  const GRAPH = {};
  EDGES.forEach(([a, b, region]) => {
    const len = nmBetween(a, b);
    (GRAPH[a] = GRAPH[a] || []).push({ to: b, len, region });
    (GRAPH[b] = GRAPH[b] || []).push({ to: a, len, region });
  });
  const ROUTES = {};
  function route(from, to) {
    const key = from + '>' + to;
    if (ROUTES[key]) return ROUTES[key];
    const dist = {}, prev = {}, done = {};
    const nodes = Object.keys(GRAPH);
    dist[from] = 0;
    for (;;) {
      let u = null, best = Infinity;
      for (const n of nodes) if (!done[n] && dist[n] !== undefined && dist[n] < best) { best = dist[n]; u = n; }
      if (u === null || u === to) break;
      done[u] = true;
      for (const e of GRAPH[u]) {
        const nd = best + e.len;
        if (dist[e.to] === undefined || nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { from: u, e }; }
      }
    }
    const path = [to], segs = [];
    let cur = to;
    while (cur !== from) {
      const pv = prev[cur];
      segs.unshift({ a: pv.from, b: cur, len: pv.e.len, region: pv.e.region });
      path.unshift(pv.from);
      cur = pv.from;
    }
    segs.forEach(sg => {
      const A = ll(sg.a), B = ll(sg.b);
      const lat = ((A[1] + B[1]) / 2) * Math.PI / 180;
      const dx = (B[0] - A[0]) * Math.cos(lat), dy = B[1] - A[1];
      const m = Math.hypot(dx, dy) || 1;
      sg.dir = [dx / m, dy / m];
    });
    const r = { from, to, path, segs, dist: dist[to] };
    ROUTES[key] = r;
    return r;
  }
  function segAt(r, frac) {
    let d = clamp(frac, 0, 1) * r.dist;
    for (const sg of r.segs) { if (d <= sg.len) return sg; d -= sg.len; }
    return r.segs[r.segs.length - 1];
  }

  /* ================= Text ================= */
  const SHORT_HEAD = {
    any: ['{G} runs short in {P}', 'Buyers in {P} scramble for {g}', 'Strike shuts the {g} terminal in {P}', 'Warehouse fire guts {P} {g} stocks'],
    rice: ['Panic buying empties {P} rice stores'], palm: ['Biodiesel mandate drains {P} palm oil'], rubber: ['Tyre makers in {P} desperate for rubber'],
    steel: ['Building boom swallows {P} steel'], coffee: ['Café craze drains {P} coffee stocks'], electronics: ['Gadget launch frenzy in {P}'],
    durian: ['{P} goes durian-crazy: Musang King sold out'], coal: ['Power plants in {P} run short of coal'],
  };
  const GLUT_HEAD = {
    any: ['{G} piles up in {P}', 'Cancelled orders flood {P} with {g}', '{P} warehouses overflowing with {g}'],
    rice: ['Bumper harvest floods {P} with rice'], palm: ['Palm oil tanks brimming in {P}'], rubber: ['Rubber glut hits {P}'],
    steel: ['Cheap steel floods {P}'], coffee: ['Record coffee crop swamps {P}'], electronics: ['Unsold gadgets pile up in {P}'],
    durian: ['Durian glut in {P}: prices crash'], coal: ['Coal stockpiles swell in {P}'],
  };
  const RUMOUR_SHORT = ['Dockside talk: {g} may soon run short in {P}.', 'A broker swears {P} will be begging for {g} within days.', 'Heard {P} buyers are quietly hoarding {g}.'];
  const RUMOUR_GLUT = ['Word is a flood of {g} is about to hit {P}.', 'A skipper reckons {P} will soon be swimming in {g}.', 'Heard {P} warehouses are about to overflow with {g}.'];
  const GLOBAL_EVENTS = [
    { good: 'rice', mult: [1.3, 1.5], text: 'Major exporter bans rice shipments' },
    { good: 'rice', mult: [0.72, 0.82], text: 'Record harvest: rice prices sag across the region' },
    { good: 'palm', mult: [1.25, 1.45], text: 'El Niño scorches palm plantations' },
    { good: 'rubber', mult: [1.25, 1.45], text: 'Glove makers go on a rubber buying spree' },
    { good: 'steel', mult: [0.68, 0.8], text: 'Steel overcapacity floods the region' },
    { good: 'coffee', mult: [1.35, 1.6], text: 'Frost hits Brazil’s coffee belt' },
    { good: 'electronics', mult: [1.22, 1.4], text: 'Global chip crunch' },
    { good: 'electronics', mult: [0.7, 0.82], text: 'Gadget demand slumps' },
    { good: 'durian', mult: [1.4, 1.7], text: 'Durian mania sweeps China', ports: ['shenzhen', 'shanghai'] },
    { good: 'coal', mult: [1.3, 1.5], text: 'Bitter winter up north: coal scramble', ports: ['shenzhen', 'shanghai', 'haiphong'] },
  ];
  function fill(tpl, p, g) {
    const gn = GOODS[g].name;
    return tpl.replace(/\{P\}/g, PORTS[p].name).replace(/\{G\}/g, gn).replace(/\{g\}/g, gn.toLowerCase());
  }

  /* ================= Meta (persistent progression) ================= */
  function newMeta() {
    return {
      v: 1, lp: 0, lpTotal: 0, unlocks: {}, levelMax: 0, ach: {},
      stats: { seasons: 0, best: 0, bestRank: null, profit: 0, voyages: 0, storms: 0, pirates: 0, contracts: 0, daysAtSea: 0, trades: 0, sunk: 0 },
      history: [],
      daily: { last: null, streak: 0, bestStreak: 0, best: {}, plays: {} },
      settings: { sound: true, haptics: true, tips: true, motion: true },
      tips: {},
    };
  }

  /* ================= Run creation ================= */
  function newRun(opts, meta) {
    opts = opts || {};
    meta = meta || newMeta();
    const mode = opts.mode === 'daily' ? 'daily' : 'normal';
    const daily = mode === 'daily';
    const seed = opts.seed || (daily ? 'daily-' + opts.dateKey : 'run-' + Date.now() + '-' + Math.floor(Math.random() * 1e9));
    const unl = daily ? {} : (meta.unlocks || {});
    const captain = daily ? 'rahim' : (CAPTAINS[opts.captain] && (!CAPTAINS[opts.captain].unlock || unl[CAPTAINS[opts.captain].unlock]) ? opts.captain : 'rahim');
    const level = daily ? 0 : clamp(opts.level | 0, 0, Math.min(10, meta.levelMax || 0));
    const ports = PORT_IDS.filter(p => !PORTS[p].unlock || unl[PORTS[p].unlock]);
    const goods = GOOD_IDS.filter(g => !GOODS[g].unlock || unl[GOODS[g].unlock]);
    const W = stream(seed + ':world');
    const s = {
      v: 1, version: VERSION, mode, dateKey: opts.dateKey || null, seed,
      rngW: W, rngL: stream(seed + ':luck'),
      captain, level, ports, goods,
      perks: {
        contacts: !!unl.perk_contacts, insurer: !!unl.perk_insurer, crew: !!unl.perk_crew, reefer: !!unl.ship_reefer,
      },
      twist: null,
      day: 1, maxDays: 60,
      phase: 'port', port: CAPTAINS[captain].start,
      cash: 50000, bank: 0, along: 0, alongDue: 0,
      ship: { cls: 'coaster', cond: 100, up: {} },
      cargo: {}, mk: {}, G: {},
      events: [], news: [], known: {},
      monsoon: { phase: 'NE', shiftDay: 31, forecast: 31, shifted: false },
      offers: [], contracts: [],
      voyage: null, pending: null, arrival: null, lastResult: null,
      insurePref: true,
      st: {
        trades: 0, profitSales: 0, maxSale: 0, maxMove: 0, bestTrade: 0, spent: 0, revenue: 0, costs: 0, fees: 0, premiums: 0, claims: 0,
        storms: 0, pirates: 0, escapes: 0, contracts: 0, failed: 0, contractPay: 0, borrowed: false, alongRepaid: false, collected: false,
        rumourProfit: false, durianSales: 0, peak: 0, m1Day: 0, voyages: 0, daysAtSea: 0, reports: 0, spoiled: 0, lostValue: 0, bigShip: false,
      },
      hist: [], seq: 0, log: [],
      sunk: false, lastDay: false, final: null,
    };
    // Starting cash
    if (!daily) {
      if (unl.perk_cash1) s.cash += 25000;
      if (unl.perk_cash2) s.cash += 50000;
      if (unl.perk_cash3) s.cash += 100000;
    }
    if (level >= 9) s.cash = Math.max(30000, s.cash - 20000);
    if (level >= 5) s.maxDays = 52;
    if (captain === 'wong') s.ship.up.cold = true;
    if (daily) {
      s.twist = rPick(W, TWIST_IDS);
      if (s.twist === 'windfall') s.cash = 100000;
      if (s.twist === 'sprint') s.maxDays = 45;
    }
    // Monsoon
    const half = Math.round(s.maxDays / 2);
    s.monsoon.phase = rnd(W) < 0.5 ? 'NE' : 'SW';
    s.monsoon.shiftDay = half + rInt(W, -4, 4);
    s.monsoon.forecast = s.monsoon.shiftDay + rInt(W, -2, 2);
    // Markets
    goods.forEach(g => { s.G[g] = clamp(rGauss(W) * GOODS[g].gvol * 3, -0.25, 0.25); });
    ports.forEach(p => {
      s.mk[p] = {};
      goods.forEach(g => { s.mk[p][g] = { L: clamp(rGauss(W) * GOODS[g].vol * 2.5, -0.3, 0.3), I: 0 }; });
    });
    // Warm up the world so the season starts mid-story.
    s.day = -5;
    for (let i = 0; i < 6; i++) { s.day++; worldTick(s); }
    s.day = 1;
    snapshot(s, s.port);
    // Everyone starts the season with a free market report; after that, knowledge goes stale.
    snapshotAll(s);
    if (s.perks.contacts && !daily) {
      const e = spawnLocal(s, true);
      if (e && !e.rumoured) addRumour(s, e, true, 0.1, 0.1);
      log(s, 'Old contacts send word of something brewing. Check the news in the Office.', 'info');
    }
    genOffers(s);
    s.st.peak = netWorth(s);
    s.hist.push([1, Math.round(netWorth(s))]);
    return s;
  }

  /* ================= Market ================= */
  function depthT(p, g) { return GOODS[g].depth * PORT_SIZE[p] * (PF[p][g] < 0.9 ? 1.35 : 1); }
  function evMult(s, p, g) {
    let m = 1;
    for (const e of s.events) {
      if (e.good !== g || s.day < e.start || s.day > e.end) continue;
      if (e.port === p || (e.scope === 'global' && (!e.ports || e.ports.indexOf(p) >= 0))) m *= e.mult;
    }
    return m;
  }
  function activeEvents(s, p, g) {
    return s.events.filter(e => e.good === g && s.day >= e.start && s.day <= e.end && (e.port === p || (e.scope === 'global' && (!e.ports || e.ports.indexOf(p) >= 0))));
  }
  function baseMid(s, p, g) { const mk = s.mk[p][g]; return GOODS[g].base * PF[p][g] * Math.exp(mk.L + s.G[g]) * evMult(s, p, g); }
  function mid(s, p, g) { return baseMid(s, p, g) * Math.exp(s.mk[p][g].I); }
  function spreadOf(s) { let sp = s.captain === 'meiling' ? 0.03 : 0.06; if (s.level >= 7) sp += 0.02; return sp; }
  function buyPrice(s, p, g) { return mid(s, p, g) * (1 + spreadOf(s) / 2); }
  function sellPrice(s, p, g) { return mid(s, p, g) * (1 - spreadOf(s) / 2); }
  function quoteBuy(s, g, q) {
    const p = s.port; q = Math.max(0, Math.floor(q));
    const m0 = mid(s, p, g), dI = ELASTIC * q / depthT(p, g);
    const f = dI > 1e-9 ? (Math.exp(dI) - 1) / dI : 1;
    const avg = m0 * (1 + spreadOf(s) / 2) * f;
    return { q, avg, total: Math.round(avg * q), after: m0 * Math.exp(dI) * (1 + spreadOf(s) / 2), move: Math.exp(dI) - 1 };
  }
  function quoteSell(s, g, q) {
    const p = s.port; q = Math.max(0, Math.floor(q));
    const m0 = mid(s, p, g), dI = ELASTIC * q / depthT(p, g);
    const f = dI > 1e-9 ? (1 - Math.exp(-dI)) / dI : 1;
    const avg = m0 * (1 - spreadOf(s) / 2) * f;
    return { q, avg, total: Math.round(avg * q), after: m0 * Math.exp(-dI) * (1 - spreadOf(s) / 2), move: 1 - Math.exp(-dI) };
  }
  function snapshot(s, p) { const m = {}; s.goods.forEach(g => { m[g] = mid(s, p, g); }); s.known[p] = { day: s.day, mid: m }; }
  function snapshotAll(s) { s.ports.forEach(p => snapshot(s, p)); }

  /* ================= Cargo & worth ================= */
  function cargoUsed(s) { let t = 0; for (const g in s.cargo) t += s.cargo[g].q; return t; }
  function shipCap(s) { return SHIPS[s.ship.cls].cap; }
  function freeSpace(s) { return Math.max(0, shipCap(s) - cargoUsed(s)); }
  function hasCold(s) { return !!(s.ship.up.cold || SHIPS[s.ship.cls].cold); }
  function shelfLife(s, g) {
    const G = GOODS[g]; if (!G.perish) return Infinity;
    return Math.round((hasCold(s) ? G.perishCold : G.perish) * (s.captain === 'wong' ? 1.5 : 1));
  }
  function cargoCostValue(s) { let v = 0; for (const g in s.cargo) v += s.cargo[g].q * s.cargo[g].cost; return v; }
  function cargoValue(s) {
    if (s.phase !== 'port') return cargoCostValue(s);
    let v = 0;
    for (const g in s.cargo) v += s.cargo[g].q * baseMid(s, s.port, g) * (1 - spreadOf(s) / 2);
    return v;
  }
  function tradeIn(s) { const sh = SHIPS[s.ship.cls]; return sh.price ? Math.round(sh.price * 0.6) : sh.tradeIn; }
  function netWorth(s) { return s.cash + cargoValue(s) + tradeIn(s) - s.bank - s.along; }
  function netWorthCost(s) { return s.cash + cargoCostValue(s) + tradeIn(s) - s.bank - s.along; }
  function addCargo(s, g, q, unitCost) {
    if (q <= 0) return;
    const c = s.cargo[g] || (s.cargo[g] = { q: 0, cost: 0 });
    c.cost = (c.cost * c.q + unitCost * q) / (c.q + q);
    c.q += q;
    if (GOODS[g].perish) (c.lots = c.lots || []).push({ q, d: s.day });
  }
  function removeCargo(s, g, q) {
    const c = s.cargo[g]; if (!c) return;
    q = Math.min(q, c.q);
    c.q -= q;
    if (c.lots) {
      let r = q;
      while (r > 0 && c.lots.length) {
        const lot = c.lots[0], take = Math.min(lot.q, r);
        lot.q -= take; r -= take;
        if (lot.q <= 0) c.lots.shift();
      }
    }
    if (c.q <= 0) delete s.cargo[g];
  }
  function afterChange(s) {
    const nw = netWorth(s);
    if (nw > s.st.peak) s.st.peak = nw;
    if (!s.st.m1Day && nw >= 1e6) s.st.m1Day = s.day;
  }
  function log(s, text, kind) { s.log.unshift({ day: s.day, text, kind: kind || 'info' }); if (s.log.length > 60) s.log.length = 60; }
  function addNews(s, n) { n.day = s.day; n.id = ++s.seq; s.news.unshift(n); if (s.news.length > 50) s.news.length = 50; }
  const fail = (msg) => ({ ok: false, msg });

  /* ================= Trading ================= */
  function canAct(s) { return s.phase === 'port' && !s.pending; }
  function maxBuy(s, g) {
    if (s.cash <= 0) return 0;
    let lo = 0, hi = freeSpace(s);
    if (hi <= 0) return 0;
    if (quoteBuy(s, g, hi).total <= s.cash) return hi;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (quoteBuy(s, g, m).total <= s.cash) lo = m; else hi = m - 1; }
    return lo;
  }
  function buy(s, g, q) {
    if (!canAct(s)) return fail('Not now');
    if (s.goods.indexOf(g) < 0) return fail('Unknown cargo');
    if (!Number.isFinite(q)) return fail('Enter a valid cargo quantity');
    q = Math.floor(q);
    if (q <= 0) return fail('Nothing to buy');
    if (q > freeSpace(s)) return fail('Not enough hold space');
    const qt = quoteBuy(s, g, q);
    if (qt.total > s.cash) return fail('Not enough cash');
    s.cash -= qt.total;
    addCargo(s, g, q, qt.total / q);
    s.mk[s.port][g].I += ELASTIC * q / depthT(s.port, g);
    s.st.trades++; s.st.spent += qt.total; s.st.maxMove = Math.max(s.st.maxMove, qt.move);
    snapshot(s, s.port);
    afterChange(s);
    return { ok: true, q, total: qt.total, avg: qt.avg, move: qt.move };
  }
  function sell(s, g, q) {
    if (!canAct(s)) return fail('Not now');
    if (s.goods.indexOf(g) < 0) return fail('Unknown cargo');
    if (!Number.isFinite(q)) return fail('Enter a valid cargo quantity');
    const c = s.cargo[g];
    q = Math.floor(q);
    if (!c || q <= 0) return fail('Nothing to sell');
    q = Math.min(q, c.q);
    const qt = quoteSell(s, g, q);
    const basis = c.cost * q;
    const profit = qt.total - basis;
    const shortage = activeEvents(s, s.port, g).some(e => e.kind === 'shortage' && e.rumoured);
    s.cash += qt.total;
    removeCargo(s, g, q);
    s.mk[s.port][g].I -= ELASTIC * q / depthT(s.port, g);
    s.st.trades++; s.st.revenue += qt.total; s.st.maxMove = Math.max(s.st.maxMove, qt.move);
    if (profit > 0) s.st.profitSales++;
    s.st.maxSale = Math.max(s.st.maxSale, qt.total);
    s.st.bestTrade = Math.max(s.st.bestTrade, profit);
    if (g === 'durian') s.st.durianSales += qt.total;
    if (shortage && profit > 0) s.st.rumourProfit = true;
    snapshot(s, s.port);
    afterChange(s);
    return { ok: true, q, total: qt.total, avg: qt.avg, profit, move: qt.move };
  }

  /* ================= World & daily tick ================= */
  function spawnLocal(s, forced) {
    const W = s.rngW;
    const p = rPick(W, s.ports), g = rPick(W, s.goods);
    const kindRoll = rnd(W), multRoll = rnd(W), lead = forced ? rInt(W, 3, 5) : rInt(W, 0, 4), dur = rInt(W, 5, 10);
    const hRoll = rnd(W), rumRoll = rnd(W), tRoll = rnd(W), tagRoll = rnd(W);
    if (s.events.some(e => e.port === p && e.good === g && e.end >= s.day)) return null;
    const pf = PF[p][g];
    const pShort = pf >= 1.1 ? 0.75 : pf <= 0.9 ? 0.3 : 0.55;
    const kind = forced || kindRoll < pShort ? 'shortage' : 'glut';
    const mult = kind === 'shortage' ? 1.5 + multRoll * 0.8 : 0.42 + multRoll * 0.26;
    const heads = kind === 'shortage' ? SHORT_HEAD : GLUT_HEAD;
    const pool = heads.any.concat(heads[g] || []);
    const e = {
      id: ++s.seq, scope: 'local', port: p, good: g, kind, mult,
      start: s.day + lead, end: s.day + lead + dur - 1,
      headline: fill(pool[Math.floor(hRoll * pool.length)], p, g), rumoured: false,
    };
    s.events.push(e);
    if (e.start === s.day) { e.announced = true; addNews(s, { kind: e.kind, text: e.headline, port: p, good: g, ev: e.id, end: e.end }); }
    const rumourRate = s.level >= 3 ? 0.6 : 0.78;
    if (!forced && lead >= 1 && rumRoll < rumourRate) addRumour(s, e, true, tRoll, tagRoll);
    return e;
  }
  function addRumour(s, e, truth, tRoll, tagRoll) {
    const pool = e.kind === 'shortage' ? RUMOUR_SHORT : RUMOUR_GLUT;
    const text = fill(pool[Math.floor(tRoll * pool.length)], e.port, e.good);
    const tag = truth ? (tagRoll < 0.85 ? 'solid' : 'shaky') : (tagRoll < 0.85 ? 'shaky' : 'solid');
    if (truth) e.rumoured = true;
    addNews(s, { kind: 'rumour', text, port: e.port, good: e.good, tag, truth, ev: truth ? e.id : null, rk: e.kind });
  }
  function spawnFakeRumour(s) {
    const W = s.rngW;
    const p = rPick(W, s.ports), g = rPick(W, s.goods);
    const k = rnd(W) < 0.6 ? 'shortage' : 'glut';
    const tRoll = rnd(W), tagRoll = rnd(W);
    addRumour(s, { port: p, good: g, kind: k }, false, tRoll, tagRoll);
  }
  function spawnGlobal(s) {
    const W = s.rngW;
    const def = rPick(W, GLOBAL_EVENTS);
    const multRoll = rnd(W), dur = rInt(W, 8, 14), lead = rInt(W, 0, 3);
    if (s.goods.indexOf(def.good) < 0) return;
    if (s.events.some(e => e.scope === 'global' && e.good === def.good && e.end >= s.day)) return;
    const mult = def.mult[0] + multRoll * (def.mult[1] - def.mult[0]);
    const e = {
      id: ++s.seq, scope: 'global', port: null, ports: def.ports || null, good: def.good, kind: mult > 1 ? 'boom' : 'bust', mult,
      start: s.day + lead, end: s.day + lead + dur - 1, headline: def.text, rumoured: lead > 0,
    };
    s.events.push(e);
    if (lead > 0) addNews(s, { kind: 'forecast', text: 'Brokers expect within days: ' + def.text.charAt(0).toLowerCase() + def.text.slice(1) + '.', good: def.good, rk: e.kind });
    else { e.announced = true; addNews(s, { kind: e.kind, text: def.text, good: def.good, ev: e.id, end: e.end }); }
  }
  function worldTick(s) {
    const W = s.rngW;
    s.goods.forEach(g => { s.G[g] = clamp(s.G[g] * 0.95 + rGauss(W) * GOODS[g].gvol, -0.45, 0.45); });
    s.ports.forEach(p => s.goods.forEach(g => {
      const m = s.mk[p][g];
      m.L = clamp(m.L * 0.88 + rGauss(W) * GOODS[g].vol, -0.5, 0.5);
      m.I *= 0.8; if (Math.abs(m.I) < 0.001) m.I = 0;
    }));
    s.events.forEach(e => { if (e.start === s.day && !e.announced) { e.announced = true; if (!s.news.some(n => n.ev === e.id && n.kind !== 'rumour')) addNews(s, { kind: e.kind, text: e.headline, port: e.port, good: e.good, ev: e.id, end: e.end }); } });
    s.events = s.events.filter(e => e.end >= s.day);
    const shock = (s.captain === 'wong' ? 1.35 : 1) * (s.twist === 'boom' ? 1.4 : 1);
    if (rnd(W) < 0.24 * shock) spawnLocal(s, false);
    if (rnd(W) < 0.03 * shock) spawnGlobal(s);
    if (rnd(W) < (s.level >= 3 ? 0.1 : 0.06)) spawnFakeRumour(s);
    if (s.day === s.monsoon.shiftDay && !s.monsoon.shifted) {
      s.monsoon.phase = s.monsoon.phase === 'NE' ? 'SW' : 'NE';
      s.monsoon.shifted = true;
      addNews(s, { kind: 'monsoon', text: 'The monsoon has turned. ' + (s.monsoon.phase === 'SW' ? 'The southwest monsoon now drives ships north and east. Typhoon season in the South China Sea.' : 'The northeast monsoon now drives ships south and west.') });
      log(s, 'The monsoon has turned: winds now blow from the ' + (s.monsoon.phase === 'SW' ? 'southwest' : 'northeast') + '.', 'monsoon');
    }
  }
  function dailyCost(s) { return Math.round(SHIPS[s.ship.cls].daily * (s.level >= 1 ? 1.25 : 1) * (s.perks.crew ? 0.8 : 1)); }
  function bankRate(s) { return 0.0025 * (s.captain === 'siti' ? 0.5 : 1) * (s.level >= 4 ? 1.5 : 1) * (s.twist === 'credit' ? 2 : 1); }
  const ALONG_RATE = 0.03;
  function playerTick(s) {
    const cost = dailyCost(s);
    s.cash -= cost; s.st.costs += cost;
    if (s.bank > 0) s.bank *= 1 + bankRate(s);
    if (s.along > 0) s.along *= 1 + ALONG_RATE;
    if (s.cash < 0) s.cash *= 1.01;
    for (const g of Object.keys(s.cargo)) {
      const c = s.cargo[g];
      if (!c.lots) continue;
      const life = shelfLife(s, g);
      let spoiled = 0;
      c.lots = c.lots.filter(l => { if (s.day - l.d > life) { spoiled += l.q; return false; } return true; });
      if (spoiled) {
        c.q -= spoiled; s.st.spoiled += spoiled; s.st.lostValue += spoiled * c.cost;
        if (c.q <= 0) delete s.cargo[g];
        log(s, spoiled + ' t of ' + GOODS[g].name.toLowerCase() + ' spoiled and went over the side.', 'bad');
      }
    }
    for (const k of s.contracts.slice()) {
      if (s.day > k.deadline) {
        s.cash -= k.penalty; s.st.failed++;
        s.contracts.splice(s.contracts.indexOf(k), 1);
        log(s, 'Contract missed: ' + k.qty + ' t ' + GOODS[k.good].name.toLowerCase() + ' to ' + PORTS[k.dest].name + '. Penalty ' + rm(k.penalty) + '.', 'bad');
      }
    }
    if (s.ship.up.radio) snapshotAll(s);
    else if (s.phase === 'port') snapshot(s, s.port);
    if (s.captain === 'kumar' && s.day % 7 === 0) { snapshotAll(s); log(s, 'Kumar’s contacts send a fresh market report.', 'info'); }
    s.hist.push([s.day, Math.round(netWorth(s))]);
    afterChange(s);
  }
  function dayTick(s) { s.day++; worldTick(s); playerTick(s); }

  /* ================= Voyages ================= */
  function shipSpeed(s) { let v = SHIPS[s.ship.cls].speed; if (s.captain === 'teoh') v *= 1.15; if (s.ship.cond < 50) v *= 0.9; return v; }
  function hullEff(s) { const base = SHIPS[s.ship.cls].hull + (s.ship.up.plating ? 0.12 : 0); return Math.min(0.98, base) * (0.55 + 0.45 * s.ship.cond / 100); }
  function phaseOn(s, day) { if (!s.monsoon.shifted && day >= s.monsoon.shiftDay) return s.monsoon.phase === 'NE' ? 'SW' : 'NE'; return s.monsoon.phase; }
  function windFactor(s, sg, phase) {
    const k = Math.SQRT1_2, w = phase === 'NE' ? [-k, -k] : [k, k];
    const a = sg.dir[0] * w[0] + sg.dir[1] * w[1];
    let str = 0.18 * (s.level >= 10 ? 1.35 : 1);
    if (sg.region === 'strait' || sg.region === 'java') str *= 0.4;
    if (a < 0 && s.captain === 'teoh') str *= 0.5;
    return 1 - str * a;
  }
  function stormP(s, region, day) {
    const base = { strait: 0.012, java: 0.02, gulf: 0.022, scs: 0.04, tonkin: 0.036, ecs: 0.04 }[region] || 0.02;
    let m = 1;
    if (phaseOn(s, day) === 'SW') m *= ({ scs: 1.5, tonkin: 1.5, ecs: 1.5, gulf: 1.1 })[region] || 1;
    else m *= ({ scs: 1.15, gulf: 1.2 })[region] || 1;
    if (Math.abs(day - s.monsoon.shiftDay) <= 3) m *= 1.6;
    if (s.captain === 'teoh') m *= 0.65;
    if (s.level >= 2) m *= 1.3;
    if (s.twist === 'typhoon') m *= 1.5;
    if (s.twist === 'calm') m *= 0.5;
    return base * m;
  }
  function pirateP(s, region) {
    const base = { strait: 0.028, java: 0.022, gulf: 0.008, scs: 0.01, tonkin: 0.006, ecs: 0.006 }[region] || 0.01;
    let m = 0.4 + Math.min(1, cargoCostValue(s) / 250000) * 0.8;
    if (s.level >= 6) m *= 1.4;
    if (s.ship.up.security) m *= 0.6;
    if (s.twist === 'calm') m *= 2;
    return base * m;
  }
  const riskLabel = p => (p < 0.08 ? 'Low' : p < 0.22 ? 'Medium' : 'High');
  function insuranceRate(s, days, r) {
    let rate = 0.004 + 0.0028 * days;
    const prone = r.segs.some(sg => sg.region === 'scs' || sg.region === 'tonkin' || sg.region === 'ecs');
    if (prone && phaseOn(s, s.day + days) === 'SW') rate += 0.003;
    if (Math.abs(s.day - s.monsoon.shiftDay) <= 4) rate += 0.003;
    if (s.perks.insurer) rate *= 0.7;
    if (s.captain === 'siti') rate *= 0.6;
    return rate;
  }
  function planVoyage(s, to) {
    const r = route(s.port, to);
    const speed = shipSpeed(s);
    let eff = 0;
    r.segs.forEach(sg => { eff += sg.len * windFactor(s, sg, s.monsoon.phase); });
    const days = Math.max(1, Math.round(eff / (speed * 24)));
    const calm = Math.max(1, Math.round(r.dist / (speed * 24)));
    let ps = 1, pp = 1;
    for (let i = 1; i <= days; i++) {
      const sg = segAt(r, (i - 0.5) / days);
      ps *= 1 - stormP(s, sg.region, s.day + i);
      pp *= 1 - pirateP(s, sg.region);
    }
    const storm = 1 - ps, pirate = 1 - pp;
    const regions = [];
    r.segs.forEach(sg => { if (regions.indexOf(sg.region) < 0) regions.push(sg.region); });
    const cv = cargoCostValue(s);
    return {
      to, route: r, days, calmDays: calm, windDelta: days - calm, arrive: s.day + days, tooLate: s.day + days > s.maxDays,
      cost: dailyCost(s) * days, premium: Math.round(cv * insuranceRate(s, days, r)), cargoValue: cv,
      storm, pirate, stormLabel: riskLabel(storm), pirateLabel: riskLabel(pirate), regions: regions.map(x => REGION_NAMES[x]), dist: Math.round(r.dist),
    };
  }
  function startVoyage(s, to, insure) {
    if (!canAct(s)) return fail('Not now');
    if (to === s.port || s.ports.indexOf(to) < 0) return fail('Pick another port');
    const plan = planVoyage(s, to);
    if (plan.tooLate) return fail('You would arrive after the season ends');
    let premium = 0;
    if (insure && plan.premium > 0) {
      if (s.cash < plan.premium) return fail('Not enough cash for insurance');
      premium = plan.premium; s.cash -= premium; s.st.premiums += premium;
    }
    s.insurePref = !!insure;
    s.voyage = { from: s.port, to, days: plan.days, idx: 0, insured: premium > 0, premium, startDay: s.day, log: [] };
    s.phase = 'sea'; s.offers = []; s.arrival = null; s.st.voyages++;
    return { ok: true, plan };
  }
  function stepVoyage(s) {
    if (s.phase !== 'sea') return { type: 'none' };
    if (s.pending) return { type: 'event', event: s.pending };
    const v = s.voyage;
    if (v.idx >= v.days) return arrive(s);
    dayTick(s);
    v.idx++;
    s.st.daysAtSea++;
    const r = route(v.from, v.to);
    const sg = segAt(r, (v.idx - 0.5) / v.days);
    const ev = rollSeaEvent(s, sg);
    if (ev) { s.pending = ev; v.log.push({ day: s.day, text: ev.title }); return { type: 'event', event: ev, day: s.day }; }
    return { type: 'day', day: s.day };
  }
  function progress(s) { const v = s.voyage; return v ? clamp(v.idx / v.days, 0, 1) : 0; }
  function mkEvent(type, title, text, choices, ctx) { return { type, title, text, choices, ctx: ctx || {} }; }
  function stormLossP(s, typhoon) { return clamp(0.95 - hullEff(s) * 0.8 + (typhoon ? 0.15 : 0), 0.1, 0.9); }
  function runChance(s) { return clamp(0.3 + (shipSpeed(s) - 10) * 0.06 + (s.ship.up.security ? 0.2 : 0), 0.15, 0.9); }
  function rollSeaEvent(s, sg) {
    const L = s.rngL;
    const u1 = rnd(L), u2 = rnd(L), u3 = rnd(L);
    if (u1 < stormP(s, sg.region, s.day)) return makeStorm(s, sg);
    if (u2 < pirateP(s, sg.region)) return makePirates(s, sg);
    if (u3 < 0.045) return makeMisc(s, sg);
    return null;
  }
  function makeStorm(s, sg) {
    const prone = sg.region === 'scs' || sg.region === 'tonkin' || sg.region === 'ecs';
    const typhoon = prone && (s.monsoon.phase === 'SW' || Math.abs(s.day - s.monsoon.shiftDay) <= 3) && rnd(s.rngL) < 0.5;
    const wait = typhoon ? 2 : 1;
    const has = cargoUsed(s) > 0;
    const pLoss = stormLossP(s, typhoon);
    return mkEvent('storm', typhoon ? 'Typhoon warning' : 'Squall line ahead',
      typhoon ? 'The barometer is in free fall. A typhoon is crossing your track in the ' + REGION_NAMES[sg.region] + '.' : 'Black clouds are stacked to the horizon and the swell is building in the ' + REGION_NAMES[sg.region] + '.',
      [
        { id: 'push', label: 'Push through', sub: has ? Math.round(pLoss * 100) + '% chance of losing cargo' + (s.voyage && s.voyage.insured ? ' (insured)' : ' (not insured)') : 'Expect some hull damage' },
        { id: 'wait', label: 'Heave to (+' + wait + ' day' + (wait > 1 ? 's' : '') + ')', sub: 'Much safer, costs time' },
      ], { typhoon, wait });
  }
  function makePirates(s, sg) {
    const cv = cargoCostValue(s);
    if (cv <= 0) return mkEvent('pirates', 'Boarded!', 'Pirates swarm aboard, find an empty hold and leave in disgust, taking only the galley’s instant noodles.', [{ id: 'ok', label: 'Carry on' }], { empty: true });
    const bribe = Math.max(3000, Math.round(cv * 0.06));
    const pRun = runChance(s);
    const choices = [
      { id: 'pay', label: 'Pay them off', sub: rm(bribe) + ', cargo stays safe', disabled: s.cash < bribe },
      { id: 'run', label: 'Make a run for it', sub: Math.round(pRun * 100) + '% chance to get away' },
    ];
    if (s.ship.up.security) choices.push({ id: 'fight', label: 'Stand and fight', sub: '70% chance to drive them off' });
    return mkEvent('pirates', 'Fast boats closing in', 'Two skiffs are cutting across your wake in the ' + REGION_NAMES[sg.region] + '. Your bosun counts six armed men.', choices, { bribe, pRun });
  }
  function makeMisc(s) {
    const L = s.rngL, v = s.voyage;
    const remaining = v.days - v.idx;
    const opts = [['engine', 3], ['salvage', 2.4], ['crew', 1.6]];
    if (freeSpace(s) >= 10) opts.push(['trader', 2]);
    if (remaining >= 2) opts.push(['current', 1.6]);
    if (s.ship.up.radio) opts.push(['radio', 2]);
    let tot = 0; opts.forEach(o => { tot += o[1]; });
    let u = rnd(L) * tot, kind = opts[0][0];
    for (const o of opts) { if (u < o[1]) { kind = o[0]; break; } u -= o[1]; }
    if (kind === 'engine') {
      const cost = Math.round(1500 + (SHIPS[s.ship.cls].price || 50000) * 0.004);
      return mkEvent('engine', 'Engine trouble', 'The diesel coughs, splutters and dies. The engineer says he can fix it, with the right spares.', [
        { id: 'fix', label: 'Buy spares off a passing ship', sub: rm(cost) + ', no delay', disabled: s.cash < cost },
        { id: 'limp', label: 'Limp on at half speed', sub: '+1 day' },
      ], { cost });
    }
    if (kind === 'salvage') {
      return mkEvent('salvage', 'Drifting containers', 'Your lookout spots containers bobbing in the swell, washed off some unlucky ship.', [
        { id: 'haul', label: 'Haul them aboard', sub: '+1 day, could be anything' },
        { id: 'leave', label: 'Leave them', sub: 'Keep to schedule' },
      ]);
    }
    if (kind === 'trader') {
      const budget = rRange(L, 0.15, 0.35) * Math.max(60000, netWorthCost(s));
      let pool = s.goods.filter(g => !GOODS[g].perish && GOODS[g].base * 0.7 <= budget);
      if (!pool.length) pool = ['rice'];
      const g = rPick(L, pool);
      const unit = Math.round(GOODS[g].base * rRange(L, 0.55, 0.72));
      const q = Math.min(freeSpace(s), Math.max(1, Math.round(budget / unit)));
      const total = unit * q;
      return mkEvent('trader', 'A trader in distress', 'A crippled freighter hails you. Her captain needs cash for a tow and offers ' + q + ' t of ' + GOODS[g].name.toLowerCase() + ' at ' + price(unit) + '/t, well under the regional average.', [
        { id: 'buy', label: 'Buy ' + q + ' t', sub: rm(total), disabled: s.cash < total || freeSpace(s) < q },
        { id: 'decline', label: 'Wish them luck', sub: 'Sail on' },
      ], { good: g, q, unit, total });
    }
    if (kind === 'crew') {
      const cost = Math.round(1200 + shipCap(s) * 2);
      return mkEvent('crew', 'Grumbling below decks', 'The crew want a proper makan: nasi lemak, roti canai and teh tarik all round.', [
        { id: 'treat', label: 'Treat them', sub: rm(cost) + ', happy crew sail faster', disabled: s.cash < cost },
        { id: 'refuse', label: 'Not this time', sub: 'They might sulk' },
      ], { cost });
    }
    if (kind === 'current') {
      return mkEvent('current', 'Favourable current', 'A strong current catches the hull and the log reads two knots over. You’ll arrive a day early.', [{ id: 'ok', label: 'Excellent' }], {});
    }
    return mkEvent('radio', 'Radio chatter', 'An old friend’s voice crackles over the radio with news from the docks.', [{ id: 'ok', label: 'Noted' }], {});
  }
  function makeCustoms(s) {
    const fee = Math.round(800 + cargoCostValue(s) * 0.004);
    return mkEvent('customs', 'Customs inspection', 'A customs officer wants every container opened and every manifest checked. It could take a while.', [
      { id: 'pay', label: 'Pay for express clearance', sub: rm(fee), disabled: s.cash < fee },
      { id: 'wait', label: 'Wait it out', sub: 'Lose a day in port' },
    ], { fee });
  }
  function loseCargo(s, frac, cause) {
    let lostVal = 0; const parts = [];
    for (const g of Object.keys(s.cargo)) {
      const c = s.cargo[g];
      let q = Math.round(c.q * frac);
      if (q <= 0) continue;
      q = Math.min(q, c.q);
      lostVal += q * c.cost;
      parts.push(q + ' t ' + GOODS[g].name.toLowerCase());
      removeCargo(s, g, q);
    }
    if (!parts.length) return 'Nothing important went over the side.';
    let txt = 'Lost to ' + cause + ': ' + parts.join(', ') + '.';
    s.st.lostValue += lostVal;
    if (s.voyage && s.voyage.insured) {
      const pay = Math.round(lostVal * 0.8);
      s.cash += pay; s.st.claims += pay;
      txt += ' The insurer pays ' + rm(pay) + '.';
    }
    return txt;
  }
  function damage(s, n) { n = Math.max(0, Math.round(n)); s.ship.cond = Math.max(0, s.ship.cond - n); return n; }
  function resolve(s, choiceId) {
    const e = s.pending;
    if (!e) return fail('Nothing to decide');
    const ch = e.choices.find(c => c.id === choiceId);
    if (!ch || ch.disabled) return fail('Choose another option');
    const L = s.rngL, v = s.voyage, ctx = e.ctx || {};
    let out = '', tone = 'info';
    switch (e.type) {
      case 'storm': {
        s.st.storms++;
        if (choiceId === 'push') {
          const lines = [];
          if (cargoUsed(s) > 0 && rnd(L) < stormLossP(s, ctx.typhoon)) { lines.push(loseCargo(s, rRange(L, 0.1, 0.28) * (ctx.typhoon ? 1.5 : 1), 'the storm')); tone = 'bad'; }
          else if (cargoUsed(s) > 0) { lines.push('The lashings hold. Not a crate lost.'); tone = 'good'; }
          else lines.push('You punch through the worst of it.');
          const d = damage(s, rRange(L, 3, 10) * (ctx.typhoon ? 1.7 : 1) * (1.25 - hullEff(s)));
          if (d) lines.push('Hull condition −' + d + '%.');
          out = lines.join(' ');
        } else {
          v.days += ctx.wait;
          out = 'You ride it out in the lee of an island. ' + ctx.wait + ' day' + (ctx.wait > 1 ? 's' : '') + ' lost, cargo safe.';
          if (rnd(L) < 0.15) { const d = damage(s, rRange(L, 2, 4)); out += ' Hull condition −' + d + '%.'; }
        }
        break;
      }
      case 'pirates': {
        s.st.pirates++;
        if (ctx.empty) { out = 'They’re gone as fast as they came.'; break; }
        if (choiceId === 'pay') { s.cash -= ctx.bribe; out = 'An envelope changes hands. The skiffs peel away.'; }
        else if (choiceId === 'run') {
          if (rnd(L) < ctx.pRun) { s.st.escapes++; out = 'Black smoke pours from the funnel and you leave them bouncing in your wake.'; tone = 'good'; }
          else { out = 'They catch you. ' + loseCargo(s, rRange(L, 0.2, 0.45), 'pirates'); tone = 'bad'; }
        } else {
          if (rnd(L) < 0.7) { s.st.escapes++; out = 'Your security team fires warning flares and the skiffs think better of it.'; tone = 'good'; }
          else { const d = damage(s, rRange(L, 5, 12)); out = 'A running fight. ' + loseCargo(s, rRange(L, 0.3, 0.5), 'pirates') + ' Hull condition −' + d + '%.'; tone = 'bad'; }
        }
        break;
      }
      case 'engine': {
        if (choiceId === 'fix') { s.cash -= ctx.cost; out = 'Spares bolted in. The diesel roars back to life.'; }
        else { v.days += 1; out = 'You limp on. One day lost.'; }
        break;
      }
      case 'salvage': {
        if (choiceId === 'haul') {
          v.days += 1;
          const budget = clamp(rRange(L, 0.04, 0.1) * Math.max(80000, netWorthCost(s)), 4000, 350000);
          const pool = s.goods.filter(x => !GOODS[x].perish && GOODS[x].base <= budget);
          if (rnd(L) < 0.6 && freeSpace(s) > 0 && pool.length) {
            const g = rPick(L, pool);
            const q = Math.min(freeSpace(s), Math.max(1, Math.round(budget / GOODS[g].base)));
            addCargo(s, g, q, 0);
            out = 'Jackpot: ' + q + ' t of ' + GOODS[g].name.toLowerCase() + ', free. One day lost hauling it in.'; tone = 'good';
          } else {
            const scrap = rInt(L, 500, 1500); s.cash += scrap;
            out = 'Mostly junk. The scrap fetches ' + rm(scrap) + '. One day lost.';
          }
        } else out = 'You leave them to the sea.';
        break;
      }
      case 'trader': {
        if (choiceId === 'buy') {
          if (s.cash < ctx.total || freeSpace(s) < ctx.q) return fail('Can’t afford it');
          s.cash -= ctx.total; addCargo(s, ctx.good, ctx.q, ctx.unit);
          out = 'Deal. ' + ctx.q + ' t of ' + GOODS[ctx.good].name.toLowerCase() + ' cross-loaded at ' + price(ctx.unit) + '/t.'; tone = 'good';
        } else out = 'You wish them a fair tow.';
        break;
      }
      case 'crew': {
        if (choiceId === 'treat') {
          s.cash -= ctx.cost;
          if (v.days - v.idx >= 2) { v.days -= 1; out = 'Full bellies, fast hands. You’ll arrive a day early.'; tone = 'good'; }
          else out = 'Morale soars.';
        } else if (rnd(L) < 0.35) { v.days += 1; out = 'The crew sulk and the ship crawls. One day lost.'; tone = 'bad'; }
        else out = 'Some muttering, but they get on with it.';
        break;
      }
      case 'current': { if (v.days - v.idx >= 2) v.days -= 1; out = 'One day saved.'; tone = 'good'; break; }
      case 'radio': {
        const up = s.events.filter(x => x.start > s.day && x.scope === 'local' && !x.rumoured);
        if (up.length) { const x = rPick(L, up); addRumour(s, x, true, rnd(L), 0); out = 'He says: “' + s.news[0].text + '”'; }
        else { snapshotAll(s); out = 'He reads out a full set of prices from every port.'; }
        tone = 'good';
        break;
      }
      case 'customs': {
        if (choiceId === 'pay') { s.cash -= ctx.fee; out = 'Stamped and cleared.'; }
        else { dayTick(s); out = 'A day of paperwork. Cleared at last.'; const c = checkCollectors(s); if (c) out += ' ' + c; }
        break;
      }
      default: out = '';
    }
    s.pending = null;
    if (v) v.log.push({ day: s.day, text: out });
    log(s, e.title + ': ' + out, tone);
    s.lastResult = { title: e.title, text: out, tone };
    afterChange(s);
    if (s.ship.cond <= 0 && s.phase === 'sea') return sink(s);
    return { ok: true, text: out, tone };
  }
  function sink(s) {
    const txt = loseCargo(s, 1, 'the sea');
    s.sunk = true; s.phase = 'sunk'; s.pending = null;
    log(s, 'Your ship has foundered. ' + txt, 'bad');
    return { type: 'sunk', text: 'The battered hull finally gives way. The crew make it to the lifeboats. ' + txt };
  }
  function portFee(s) { return Math.round(300 + shipCap(s) * 0.8); }
  function checkCollectors(s) {
    if (!(s.along > 0 && s.day > s.alongDue)) return null;
    const owed = Math.round(s.along * 1.25);
    let paid = 0; const parts = [];
    if (s.cash > 0) { const take = Math.min(Math.floor(s.cash), owed); s.cash -= take; paid += take; parts.push(rm(take) + ' in cash'); }
    for (const g of Object.keys(s.cargo)) {
      if (paid >= owed) break;
      const c = s.cargo[g];
      const unit = Math.max(1, sellPrice(s, s.port, g) * 0.6);
      const q = Math.min(c.q, Math.ceil((owed - paid) / unit));
      paid += q * unit; parts.push(q + ' t ' + GOODS[g].name.toLowerCase());
      removeCargo(s, g, q);
    }
    let extra = '';
    if (paid < owed) { damage(s, 15); extra = ' They “decorate” your hull on the way out (−15%).'; }
    s.along = 0; s.alongDue = 0; s.st.collected = true;
    const txt = 'The Ah Long’s boys were waiting at the gangway. They took ' + (parts.join(' and ') || 'what they could') + '.' + extra;
    log(s, txt, 'bad');
    return txt;
  }
  function arrive(s) {
    const v = s.voyage;
    s.port = v.to; s.phase = 'port'; s.voyage = null;
    const rep = { port: s.port, day: s.day, lines: [], fee: 0, delivered: [] };
    const fee = portFee(s); s.cash -= fee; s.st.fees += fee; rep.fee = fee;
    snapshot(s, s.port);
    for (const k of s.contracts.slice()) {
      if (k.dest !== s.port) continue;
      const c = s.cargo[k.good];
      if (c && c.q >= k.qty) {
        const basis = c.cost * k.qty, pay = k.qty * k.pay;
        removeCargo(s, k.good, k.qty);
        s.cash += pay; s.st.contracts++; s.st.contractPay += pay;
        s.contracts.splice(s.contracts.indexOf(k), 1);
        rep.delivered.push({ good: k.good, qty: k.qty, pay, profit: pay - basis });
        log(s, 'Contract delivered: ' + k.qty + ' t ' + GOODS[k.good].name.toLowerCase() + ' for ' + rm(pay) + '.', 'good');
      } else {
        rep.lines.push('Contract here needs ' + k.qty + ' t of ' + GOODS[k.good].name.toLowerCase() + '. You have ' + (c ? c.q : 0) + ' t.');
      }
    }
    const col = checkCollectors(s); if (col) rep.lines.push(col);
    genOffers(s);
    const L = s.rngL; const u = rnd(L), u2 = rnd(L);
    if (cargoUsed(s) > 0 && u < 0.1) s.pending = makeCustoms(s);
    else if (u2 < 0.04) { s.cash += fee; rep.lines.push('The harbourmaster is in a durian-feast mood. Port fees waived.'); }
    if (s.day >= s.maxDays) s.lastDay = true;
    s.arrival = rep;
    afterChange(s);
    return { type: 'arrived', report: rep };
  }

  /* ================= Contracts ================= */
  function genOffers(s) {
    const L = s.rngL;
    s.offers = [];
    const u = rnd(L);
    const n = u < 0.25 ? 0 : u < 0.75 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const g = rPick(L, s.goods);
      const dests = s.ports.filter(p => p !== s.port && PF[p][g] >= 1.12);
      const r1 = rnd(L), r2 = rnd(L), r3 = rnd(L), r4 = rnd(L);
      if (!dests.length) continue;
      const d = dests[Math.floor(r1 * dests.length)];
      const plan = planVoyage(s, d);
      const deadline = s.day + plan.days + 4 + Math.floor(r2 * 7);
      if (deadline > s.maxDays) continue;
      const norm = GOODS[g].base * PF[d][g];
      const pay = Math.round(norm * (1.08 + r3 * 0.22) * (s.captain === 'meiling' ? 1.12 : 1));
      const capVal = Math.min(shipCap(s) * GOODS[g].base, Math.max(60000, netWorthCost(s) * 1.2));
      let qty = Math.round((0.25 + r4 * 0.35) * capVal / GOODS[g].base / 5) * 5;
      qty = clamp(qty, 5, shipCap(s));
      if (s.offers.some(o => o.good === g && o.dest === d)) continue;
      s.offers.push({ id: ++s.seq, good: g, qty, dest: d, deadline, pay, penalty: Math.round(qty * pay * 0.25 * (s.level >= 8 ? 2 : 1)) });
    }
  }
  function acceptOffer(s, id) {
    if (!canAct(s)) return fail('Not now');
    const o = s.offers.find(x => x.id === id);
    if (!o) return fail('Offer gone');
    if (s.contracts.length >= 2) return fail('You can hold two contracts at a time');
    s.offers.splice(s.offers.indexOf(o), 1);
    s.contracts.push(o);
    return { ok: true };
  }

  /* ================= Finance ================= */
  function bankLimit(s) { return Math.max(0, Math.round(Math.max(50000, Math.max(0, netWorthCost(s)) * 0.8) * (s.captain === 'siti' ? 2 : 1) - s.bank)); }
  function alongLimit(s) { return Math.max(0, Math.round(Math.min(500000, 40000 + Math.max(0, netWorthCost(s)) * 0.15) - s.along)); }
  function bankBorrow(s, amt) {
    if (!canAct(s)) return fail('Not now');
    if (!PORTS[s.port].bank) return fail('No bank here');
    if (!Number.isFinite(amt)) return fail('Enter a valid amount');
    amt = Math.floor(amt);
    if (amt <= 0 || amt > bankLimit(s)) return fail('Over your credit limit');
    s.bank += amt; s.cash += amt; s.st.borrowed = true;
    afterChange(s);
    return { ok: true };
  }
  function bankRepay(s, amt) {
    if (!canAct(s)) return fail('Not now');
    if (!PORTS[s.port].bank) return fail('No bank here');
    if (!Number.isFinite(amt)) return fail('Enter a valid amount');
    amt = Math.min(Math.floor(amt), Math.floor(s.cash), Math.ceil(s.bank));
    if (amt <= 0) return fail('Nothing to repay');
    s.bank -= amt; s.cash -= amt;
    if (s.bank < 1) s.bank = 0;
    afterChange(s);
    return { ok: true };
  }
  function alongBorrow(s, amt) {
    if (!canAct(s)) return fail('Not now');
    if (!Number.isFinite(amt)) return fail('Enter a valid amount');
    amt = Math.floor(amt);
    if (amt <= 0 || amt > alongLimit(s)) return fail('He won’t lend you that much');
    if (s.along <= 0) s.alongDue = s.day + 10;
    s.along += amt; s.cash += amt; s.st.borrowed = true;
    afterChange(s);
    return { ok: true };
  }
  function alongRepay(s, amt) {
    if (!canAct(s)) return fail('Not now');
    if (!Number.isFinite(amt)) return fail('Enter a valid amount');
    amt = Math.min(Math.floor(amt), Math.floor(s.cash), Math.ceil(s.along));
    if (amt <= 0) return fail('Nothing to repay');
    s.along -= amt; s.cash -= amt;
    if (s.along < 1) { s.along = 0; if (s.day <= s.alongDue) s.st.alongRepaid = true; s.alongDue = 0; }
    afterChange(s);
    return { ok: true };
  }

  /* ================= Intel ================= */
  function reportCost(s) { return Math.round((2000 + Math.max(0, netWorthCost(s)) * 0.004) * (s.captain === 'kumar' ? 0.5 : 1)); }
  function buyReport(s) {
    if (!canAct(s)) return fail('Not now');
    const c = reportCost(s);
    if (s.cash < c) return fail('Not enough cash');
    s.cash -= c; s.st.reports++;
    snapshotAll(s);
    return { ok: true, cost: c };
  }

  /* ================= Shipyard ================= */
  function shipOffers(s) {
    if (!PORTS[s.port].yard) return [];
    return SHIP_IDS.filter(id => id !== s.ship.cls && SHIPS[id].price > 0 && (!SHIPS[id].unlock || s.perks.reefer)).map(id => {
      const sh = SHIPS[id];
      return { id, name: sh.name, cap: sh.cap, speed: sh.speed, hull: sh.hull, daily: sh.daily, desc: sh.desc, cold: !!sh.cold, price: sh.price, net: sh.price - tradeIn(s), fits: sh.cap >= cargoUsed(s) };
    });
  }
  function buyShip(s, id) {
    if (!canAct(s)) return fail('Not now');
    const o = shipOffers(s).find(x => x.id === id);
    if (!o) return fail('Not available here');
    if (!o.fits) return fail('Your cargo won’t fit');
    if (s.cash < o.net) return fail('Not enough cash');
    s.cash -= o.net;
    s.ship.cls = id; s.ship.cond = 100;
    if (SHIPS[id].cap >= 1200) s.st.bigShip = true;
    afterChange(s);
    return { ok: true, net: o.net };
  }
  function buyUpgrade(s, id) {
    if (!canAct(s)) return fail('Not now');
    if (!PORTS[s.port].yard) return fail('No shipyard here');
    const u = UPGRADES[id];
    if (!u || s.ship.up[id]) return fail('Already fitted');
    if (s.cash < u.price) return fail('Not enough cash');
    s.cash -= u.price; s.ship.up[id] = true;
    afterChange(s);
    return { ok: true };
  }
  function repairCost(s) { return Math.round((100 - s.ship.cond) * (250 + (SHIPS[s.ship.cls].price || 50000) * 0.0012)); }
  function repair(s) {
    if (!canAct(s)) return fail('Not now');
    if (!PORTS[s.port].yard) return fail('No shipyard here');
    const c = repairCost(s);
    if (c <= 0) return fail('She’s in good shape');
    if (s.cash < c) return fail('Not enough cash');
    s.cash -= c; s.ship.cond = 100;
    afterChange(s);
    return { ok: true, cost: c };
  }

  /* ================= Waiting & ending ================= */
  function waitDay(s) {
    if (!canAct(s)) return fail('Not now');
    if (s.day >= s.maxDays) return fail('The season is over');
    dayTick(s);
    const c = checkCollectors(s);
    if (s.day >= s.maxDays) s.lastDay = true;
    return { ok: true, text: c };
  }
  function rankFor(nw) { let r = 0; RANKS.forEach((k, i) => { if (nw >= k.min) r = i; }); return r; }
  function seasonLP(nw, level) { return Math.max(1, Math.round(6 * Math.log2(1 + Math.max(0, nw) / 50000) * (1 + 0.2 * level))); }
  function dayKeyShift(key, d) { const t = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) + d * 86400000; return new Date(t).toISOString().slice(0, 10); }
  function endSeason(s, meta) {
    if (s.final) return s.final;
    // Retirement rewards require a real voyage. Waiting at the starting port
    // must not turn starting capital into endlessly repeatable Legacy points.
    const rewardEligible = s.st.voyages > 0 && s.st.daysAtSea > 0 && (s.phase === 'port' || s.sunk);
    const rewardFraction = clamp((s.day - 1) / Math.max(1, s.maxDays - 1), 0, 1);
    let sold = 0;
    if (s.phase === 'port') {
      for (const g of Object.keys(s.cargo)) {
        const q = s.cargo[g].q, qt = quoteSell(s, g, q);
        s.cash += qt.total; sold += qt.total;
        s.mk[s.port][g].I -= ELASTIC * q / depthT(s.port, g);
        if (g === 'durian') s.st.durianSales += qt.total;
        delete s.cargo[g];
      }
    } else { s.cargo = {}; }
    const ship = s.sunk ? 0 : tradeIn(s);
    const debts = Math.round(s.bank + s.along);
    const nw = Math.round(s.cash + ship - debts);
    if (nw > s.st.peak) s.st.peak = nw;
    s.phase = 'ended'; s.pending = null;
    const rank = rankFor(nw);
    const base = rewardEligible ? Math.max(1, Math.round(seasonLP(nw, s.level) * rewardFraction)) : 0;
    const rewardNote = !rewardEligible
      ? 'Complete a voyage to earn season Legacy. Shipwrecks at sea also count.'
      : rewardFraction < 1 ? 'Season Legacy is scaled to the days played. A season with a completed voyage or shipwreck earns at least 1 LP.' : '';
    const f = { nw, cash: Math.round(s.cash), sold: Math.round(sold), ship, debts, rank, rankName: RANKS[rank].name, lp: base, lpBase: base, streakBonus: 0, levelUp: false, newAch: [], day: s.day, rewardEligible, rewardFraction, rewardNote };
    s.final = f;
    if (meta) {
      const m = meta.stats;
      m.seasons++; m.voyages += s.st.voyages; m.storms += s.st.storms; m.pirates += s.st.pirates; m.contracts += s.st.contracts;
      m.daysAtSea += s.st.daysAtSea; m.trades += s.st.trades; if (s.sunk) m.sunk++;
      m.profit += Math.max(0, nw - (s.hist[0] ? s.hist[0][1] : 0));
      if (nw > m.best) { m.best = nw; f.personalBest = true; }
      if (m.bestRank === null || rank > m.bestRank) m.bestRank = rank;
      if (s.mode === 'daily' && s.dateKey && rewardEligible) {
        const d = meta.daily;
        if (d.last !== s.dateKey) {
          d.streak = d.last === dayKeyShift(s.dateKey, -1) ? d.streak + 1 : 1;
          d.last = s.dateKey;
          f.streakBonus = Math.min(d.streak, 7);
        }
        d.bestStreak = Math.max(d.bestStreak || 0, d.streak);
        d.plays[s.dateKey] = (d.plays[s.dateKey] || 0) + 1;
        if (!(s.dateKey in d.best) || nw > d.best[s.dateKey]) d.best[s.dateKey] = nw;
        const keys = Object.keys(d.best).sort();
        while (keys.length > 60) { const k = keys.shift(); delete d.best[k]; delete d.plays[k]; }
      }
      if (rewardEligible && s.mode === 'normal' && s.level === meta.levelMax && rank >= MERCHANT_RANK && meta.levelMax < 10) { meta.levelMax++; f.levelUp = meta.levelMax; }
      f.lp = base + f.streakBonus;
      meta.lp += f.lp; meta.lpTotal += f.lp;
      meta.history.unshift({ t: Date.now(), mode: s.mode, date: s.dateKey, captain: s.captain, level: s.level, nw, rank, twist: s.twist });
      if (meta.history.length > 40) meta.history.length = 40;
      f.newAch = checkAch(s, meta, rewardEligible);
    }
    return f;
  }

  /* ================= Achievements ================= */
  const ACH = [
    { id: 'first_profit', name: 'Open for Business', desc: 'Make your first profitable sale.', lp: 5, test: s => s && s.st.profitSales >= 1 },
    { id: 'first_season', name: 'Sea Legs', desc: 'Finish a season.', lp: 5, test: (s, m, end) => !!end },
    { id: 'nw_250k', name: 'Quarter Million', desc: 'Reach RM 250k net worth.', lp: 5, test: s => s && s.st.peak >= 250000 },
    { id: 'nw_1m', name: 'Ringgit Millionaire', desc: 'Reach RM 1M net worth.', lp: 10, test: s => s && s.st.peak >= 1e6 },
    { id: 'nw_5m', name: 'Big Towkay', desc: 'Reach RM 5M net worth.', lp: 15, test: s => s && s.st.peak >= 5e6 },
    { id: 'nw_10m', name: 'Ten Million Club', desc: 'Reach RM 10M net worth.', lp: 20, test: s => s && s.st.peak >= 1e7 },
    { id: 'nw_25m', name: 'Legend of the Straits', desc: 'Reach RM 25M net worth.', lp: 30, test: s => s && s.st.peak >= 2.5e7 },
    { id: 'fast_1m', name: 'Express Lane', desc: 'Reach RM 1M before day 25.', lp: 15, test: s => s && s.st.m1Day > 0 && s.st.m1Day < 25 },
    { id: 'clean_books', name: 'Clean Books', desc: 'Finish as Merchant or better without ever borrowing.', lp: 15, test: (s, m, end) => end && s && !s.st.borrowed && s.final && s.final.rank >= MERCHANT_RANK },
    { id: 'paid_in_full', name: 'Paid in Full', desc: 'Repay the Ah Long before the due date.', lp: 5, test: s => s && s.st.alongRepaid },
    { id: 'weathered', name: 'Weathered', desc: 'Ride out 3 storms in one season.', lp: 10, test: s => s && s.st.storms >= 3 },
    { id: 'full_steam', name: 'Full Steam Ahead', desc: 'Escape from pirates.', lp: 5, test: s => s && s.st.escapes >= 1 },
    { id: 'ear', name: 'Ear to the Ground', desc: 'Sell at a profit into a shortage that was rumoured.', lp: 10, test: s => s && s.st.rumourProfit },
    { id: 'signed', name: 'Signed, Sealed', desc: 'Deliver a contract.', lp: 5, test: s => s && s.st.contracts >= 1 },
    { id: 'reliable', name: 'Reliable Partner', desc: 'Deliver 5 contracts in one season.', lp: 10, test: s => s && s.st.contracts >= 5 },
    { id: 'whale', name: 'Whale', desc: 'Make a single sale worth RM 1M.', lp: 10, test: s => s && s.st.maxSale >= 1e6 },
    { id: 'mover', name: 'Market Mover', desc: 'Move a price 25% in one trade.', lp: 5, test: s => s && s.st.maxMove >= 0.25 },
    { id: 'fleet', name: 'Fleet Upgrade', desc: 'Buy a Feeder Ship or bigger.', lp: 10, test: s => s && s.st.bigShip },
    { id: 'bulk_baron', name: 'Bulk Baron', desc: 'Own a Handysize Bulker.', lp: 15, test: s => s && s.ship.cls === 'handy' },
    { id: 'king_fruits', name: 'King of Fruits', desc: 'Sell RM 500k of durian in one season.', lp: 10, test: s => s && s.st.durianSales >= 5e5 },
    { id: 'regular', name: 'Regular', desc: 'Play the Daily Voyage 3 days running.', lp: 10, test: (s, m) => m.daily.streak >= 3 },
    { id: 'habit', name: 'Creature of Habit', desc: 'Play the Daily Voyage 7 days running.', lp: 20, test: (s, m) => m.daily.streak >= 7 },
    { id: 'rough', name: 'Rough Seas', desc: 'Finish Monsoon Level 3 as Merchant or better.', lp: 15, test: (s, m, end) => end && s && s.final && s.level >= 3 && s.final.rank >= MERCHANT_RANK },
    { id: 'storm_born', name: 'Storm Born', desc: 'Finish Monsoon Level 6 as Merchant or better.', lp: 25, test: (s, m, end) => end && s && s.final && s.level >= 6 && s.final.rank >= MERCHANT_RANK },
    { id: 'master', name: 'Master of Monsoons', desc: 'Finish Monsoon Level 10 as Merchant or better.', lp: 50, test: (s, m, end) => end && s && s.final && s.level >= 10 && s.final.rank >= MERCHANT_RANK },
    { id: 'full_crew', name: 'Full Crew', desc: 'Unlock every captain.', lp: 20, test: (s, m) => CAPTAIN_IDS.every(c => !CAPTAINS[c].unlock || m.unlocks[CAPTAINS[c].unlock]) },
  ];
  function checkAch(s, meta, atEnd) {
    const got = [];
    ACH.forEach(a => {
      if (meta.ach[a.id]) return;
      let ok = false;
      try { ok = !!a.test(s, meta, atEnd); } catch (e) { ok = false; }
      if (ok) { meta.ach[a.id] = Date.now(); meta.lp += a.lp; meta.lpTotal += a.lp; got.push(a); }
    });
    return got;
  }
  function unlock(meta, id) {
    const u = UNLOCK_BY_ID[id];
    if (!u) return fail('Unknown');
    if (meta.unlocks[id]) return fail('Already unlocked');
    if (u.req && !meta.unlocks[u.req]) return fail('Unlock ' + UNLOCK_BY_ID[u.req].name + ' first');
    if (meta.lp < u.cost) return fail('Not enough Legacy');
    meta.lp -= u.cost; meta.unlocks[id] = true;
    return { ok: true, ach: checkAch(null, meta, false) };
  }

  /* ================= Views for the UI ================= */
  function knownSell(s, p, g) { const k = s.known[p]; if (!k || k.mid[g] === undefined) return null; return { price: k.mid[g] * (1 - spreadOf(s) / 2), age: s.day - k.day, day: k.day }; }
  function bestKnownSell(s, g, exclude) {
    let best = null;
    s.ports.forEach(p => {
      if (p === exclude) return;
      const k = knownSell(s, p, g);
      if (k && (!best || k.price > best.price)) best = { port: p, price: k.price, age: k.age };
    });
    return best;
  }
  function bestKnownBuy(s, g, exclude) {
    let best = null;
    s.ports.forEach(p => {
      if (p === exclude) return;
      const k = s.known[p]; if (!k || k.mid[g] === undefined) return;
      const pr = k.mid[g] * (1 + spreadOf(s) / 2);
      if (!best || pr < best.price) best = { port: p, price: pr, age: s.day - k.day };
    });
    return best;
  }
  function marketRows(s) {
    const p = s.port;
    return s.goods.map(g => {
      const m = mid(s, p, g), c = s.cargo[g];
      const evs = activeEvents(s, p, g);
      return {
        g, name: GOODS[g].name, buy: buyPrice(s, p, g), sell: sellPrice(s, p, g), mid: m,
        vsAvg: baseMid(s, p, g) / GOODS[g].base - 1, events: evs.map(e => ({ kind: e.kind, end: e.end, headline: e.headline, scope: e.scope })),
        hold: c ? c.q : 0, cost: c ? c.cost : 0, pl: c ? sellPrice(s, p, g) / c.cost - 1 : 0,
        bestSell: bestKnownSell(s, g, p), maxBuy: maxBuy(s, g), perish: !!GOODS[g].perish,
      };
    });
  }
  function portProfile(p, goods) {
    const ex = [], im = [];
    (goods || GOOD_IDS).forEach(g => { if (PF[p][g] <= 0.86) ex.push(g); else if (PF[p][g] >= 1.2) im.push(g); });
    ex.sort((a, b) => PF[p][a] - PF[p][b]); im.sort((a, b) => PF[p][b] - PF[p][a]);
    return { exports: ex, imports: im };
  }
  function newsFeed(s, n) { return s.news.filter(x => x.day <= s.day).slice(0, n || 25); }
  function upcomingDeadlines(s) { return s.contracts.map(k => ({ ...k, daysLeft: k.deadline - s.day })); }
  function cargoRows(s) {
    return Object.keys(s.cargo).map(g => {
      const c = s.cargo[g];
      const life = shelfLife(s, g);
      const oldest = c.lots && c.lots.length ? c.lots[0].d : null;
      return { g, name: GOODS[g].name, q: c.q, cost: c.cost, spoilIn: oldest !== null ? oldest + life - s.day + 1 : null, bestSell: bestKnownSell(s, g, null) };
    });
  }

  function serialize(s) { return JSON.stringify(s); }
  const saveRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const saveId = x => typeof x === 'string' && /^[a-z][a-z0-9_-]*$/i.test(x);
  const saveDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const saveHas = (table, id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(table, id);
  function saveRequire(ok) { if (!ok) throw new Error('Invalid save data'); }
  function parseSave(str) {
    saveRequire(typeof str === 'string' && str.length <= 2000000);
    return JSON.parse(str, (key, value) => {
      saveRequire(key !== '__proto__' && key !== 'prototype' && key !== 'constructor');
      saveRequire(typeof value !== 'number' || Number.isFinite(value));
      return value;
    });
  }
  function saveNumbers(obj, keys) {
    saveRequire(saveRecord(obj));
    keys.forEach(k => saveRequire(Number.isFinite(obj[k])));
  }
  function deserialize(str) {
    const s = parseSave(str);
    saveRequire(saveRecord(s) && s.v === 1);
    saveRequire(['normal', 'daily'].includes(s.mode) && ['port', 'sea', 'sunk', 'ended'].includes(s.phase));
    saveRequire(saveHas(CAPTAINS, s.captain) && saveHas(PORTS, s.port));
    saveRequire(s.twist === null || saveHas(TWISTS, s.twist));
    saveRequire(s.mode !== 'daily' || saveDate(s.dateKey));
    saveNumbers(s, ['day', 'maxDays', 'level', 'cash', 'bank', 'along', 'alongDue', 'seq']);
    saveRequire(Number.isInteger(s.day) && s.day >= 1 && s.maxDays >= 1 && s.level >= 0 && s.level <= 10);
    saveRequire(s.bank >= 0 && s.along >= 0);
    [s.rngW, s.rngL].forEach(r => saveRequire(Array.isArray(r) && r.length === 4 && r.every(Number.isInteger)));
    [[s.ports, PORTS], [s.goods, GOODS]].forEach(([ids, table]) => {
      saveRequire(Array.isArray(ids) && ids.length > 0 && ids.every(id => saveHas(table, id)) && new Set(ids).size === ids.length);
    });
    saveRequire(s.ports.includes(s.port));
    saveNumbers(s.ship, ['cond']);
    saveRequire(saveHas(SHIPS, s.ship.cls) && s.ship.cond >= 0 && s.ship.cond <= 100 && saveRecord(s.ship.up));
    saveRequire(saveRecord(s.perks) && saveRecord(s.cargo) && saveRecord(s.mk) && saveRecord(s.G) && saveRecord(s.known));
    Object.keys(s.cargo).forEach(g => {
      const c = s.cargo[g];
      saveRequire(s.goods.includes(g)); saveNumbers(c, ['q', 'cost']);
      saveRequire(Number.isInteger(c.q) && c.q > 0 && c.cost >= 0);
      if (GOODS[g].perish) saveRequire(Array.isArray(c.lots));
      if (c.lots !== undefined) {
        saveRequire(Array.isArray(c.lots));
        c.lots.forEach(l => { saveNumbers(l, ['q', 'd']); saveRequire(l.q > 0); });
        saveRequire(c.lots.reduce((q, l) => q + l.q, 0) === c.q);
      }
    });
    saveRequire(cargoUsed(s) <= shipCap(s));
    s.ports.forEach(p => {
      saveRequire(saveRecord(s.mk[p]));
      s.goods.forEach(g => { saveNumbers(s.mk[p][g], ['L', 'I']); saveRequire(Number.isFinite(s.G[g])); });
    });
    Object.keys(s.known).forEach(p => {
      saveRequire(s.ports.includes(p)); saveNumbers(s.known[p], ['day']);
      saveRequire(saveRecord(s.known[p].mid));
      Object.keys(s.known[p].mid).forEach(g => saveRequire(s.goods.includes(g) && Number.isFinite(s.known[p].mid[g])));
    });
    saveNumbers(s.monsoon, ['shiftDay', 'forecast']);
    saveRequire(['NE', 'SW'].includes(s.monsoon.phase));
    saveNumbers(s.st, ['trades', 'profitSales', 'maxSale', 'maxMove', 'bestTrade', 'spent', 'revenue', 'costs', 'fees', 'premiums', 'claims', 'storms', 'pirates', 'escapes', 'contracts', 'failed', 'contractPay', 'durianSales', 'peak', 'm1Day', 'voyages', 'daysAtSea', 'reports', 'spoiled', 'lostValue']);
    ['events', 'news', 'offers', 'contracts', 'hist', 'log'].forEach(k => saveRequire(Array.isArray(s[k])));
    s.hist.forEach(h => saveRequire(Array.isArray(h) && h.length === 2 && h.every(Number.isFinite)));
    s.log.forEach(l => { saveNumbers(l, ['day']); saveRequire(typeof l.text === 'string' && saveId(l.kind)); });
    s.news.forEach(n => {
      saveNumbers(n, ['day', 'id']); saveRequire(typeof n.text === 'string' && saveId(n.kind));
      if (n.tag !== undefined) saveRequire(saveId(n.tag));
      if (n.end !== undefined) saveRequire(Number.isFinite(n.end));
    });
    s.events.forEach(e => {
      saveNumbers(e, ['id', 'start', 'end', 'mult']);
      saveRequire(s.goods.includes(e.good) && (e.port === null || s.ports.includes(e.port)) && typeof e.headline === 'string' && saveId(e.kind));
      if (e.ports != null) saveRequire(Array.isArray(e.ports) && e.ports.every(p => saveHas(PORTS, p)));
    });
    s.ports.forEach(p => s.goods.forEach(g => saveRequire(Number.isFinite(mid(s, p, g)) && mid(s, p, g) > 0)));
    s.offers.concat(s.contracts).forEach(c => {
      saveNumbers(c, ['id', 'qty', 'deadline', 'pay', 'penalty']);
      saveRequire(s.goods.includes(c.good) && s.ports.includes(c.dest) && c.qty > 0);
    });
    if (s.phase === 'sea' || s.phase === 'sunk') saveRequire(saveRecord(s.voyage));
    if (s.phase !== 'ended') saveRequire(s.final == null);
    else {
      saveNumbers(s.final, ['nw', 'cash', 'sold', 'ship', 'debts', 'rank', 'lp', 'lpBase', 'streakBonus', 'day']);
      saveRequire(Number.isInteger(s.final.rank) && s.final.rank >= 0 && s.final.rank < RANKS.length && Array.isArray(s.final.newAch));
    }
    if (s.voyage != null) {
      const v = s.voyage;
      saveNumbers(v, ['days', 'idx', 'premium', 'startDay']);
      saveRequire(s.ports.includes(v.from) && s.ports.includes(v.to) && v.from !== v.to && v.days >= 1 && v.idx >= 0 && Array.isArray(v.log));
    }
    if (s.pending != null) {
      const e = s.pending;
      saveRequire(saveRecord(e) && ['storm', 'pirates', 'engine', 'salvage', 'trader', 'crew', 'current', 'radio', 'customs'].includes(e.type));
      saveRequire(typeof e.title === 'string' && typeof e.text === 'string' && Array.isArray(e.choices) && e.choices.length > 0 && saveRecord(e.ctx));
      e.choices.forEach(c => saveRequire(saveRecord(c) && saveId(c.id) && typeof c.label === 'string' && (c.sub === undefined || typeof c.sub === 'string')));
      saveRequire(e.choices.some(c => !c.disabled));
      const fields = { storm: ['wait'], engine: ['cost'], trader: ['q', 'unit', 'total'], crew: ['cost'], customs: ['fee'] }[e.type];
      if (fields) saveNumbers(e.ctx, fields);
      if (e.type === 'pirates' && !e.ctx.empty) saveNumbers(e.ctx, ['bribe', 'pRun']);
      if (e.type === 'trader') saveRequire(s.goods.includes(e.ctx.good));
      if (e.type !== 'customs') saveRequire(s.phase === 'sea' && s.voyage);
    }
    saveRequire(Number.isFinite(netWorth(s)));
    return s;
  }
  function deserializeMeta(str) {
    const m = parseSave(str), b = newMeta();
    saveRequire(saveRecord(m) && (m.v === undefined || m.v === 1) && saveRecord(m.stats));
    ['settings', 'stats', 'daily', 'unlocks', 'ach', 'tips'].forEach(k => {
      saveRequire(m[k] === undefined || saveRecord(m[k]));
    });
    const out = Object.assign({}, b, m);
    ['settings', 'stats', 'daily'].forEach(k => { out[k] = Object.assign({}, b[k], m[k] || {}); });
    saveNumbers(out, ['lp', 'lpTotal', 'levelMax']);
    saveRequire(out.lp >= 0 && out.lpTotal >= 0 && Number.isInteger(out.levelMax) && out.levelMax >= 0 && out.levelMax <= 10);
    Object.keys(b.settings).forEach(k => saveRequire(typeof out.settings[k] === 'boolean'));
    Object.keys(b.stats).filter(k => k !== 'bestRank').forEach(k => saveRequire(Number.isFinite(out.stats[k])));
    const rank = out.stats.bestRank;
    saveRequire(rank === null || (Number.isInteger(rank) && rank >= 0 && rank < RANKS.length));
    saveNumbers(out.daily, ['streak', 'bestStreak']);
    saveRequire(out.daily.last === null || saveDate(out.daily.last));
    ['best', 'plays'].forEach(k => {
      saveRequire(saveRecord(out.daily[k]));
      Object.keys(out.daily[k]).forEach(d => saveRequire(saveDate(d) && Number.isFinite(out.daily[k][d])));
    });
    saveRequire(Array.isArray(out.history));
    out.history.forEach(h => {
      saveNumbers(h, ['t', 'level', 'nw', 'rank']);
      saveRequire(saveHas(CAPTAINS, h.captain) && Number.isInteger(h.rank) && h.rank >= 0 && h.rank < RANKS.length);
      saveRequire(['normal', 'daily'].includes(h.mode) && (h.mode !== 'daily' || saveDate(h.date)));
    });
    return out;
  }

  const MM = {
    VERSION, PORTS, PORT_IDS, GOODS, GOOD_IDS, PF, SHIPS, SHIP_IDS, UPGRADES, CAPTAINS, CAPTAIN_IDS, UNLOCKS, UNLOCK_BY_ID, LEVELS, RANKS, TWISTS, ACH, NODES, EDGES, REGION_NAMES, MERCHANT_RANK,
    rm, price, tons, clamp,
    newMeta, newRun, route, planVoyage, startVoyage, stepVoyage, resolve, progress, phaseOn,
    quoteBuy, quoteSell, maxBuy, buy, sell, buyPrice, sellPrice, mid, baseMid, spreadOf, activeEvents, depthT,
    cargoUsed, shipCap, freeSpace, hasCold, shelfLife, cargoValue, cargoCostValue, netWorth, netWorthCost, tradeIn,
    dailyCost, bankRate, ALONG_RATE, bankLimit, alongLimit, bankBorrow, bankRepay, alongBorrow, alongRepay,
    reportCost, buyReport, shipOffers, buyShip, buyUpgrade, repairCost, repair, acceptOffer, portFee, shipSpeed, hullEff, runChance,
    waitDay, endSeason, rankFor, seasonLP, checkAch, unlock, dayKeyShift,
    knownSell, bestKnownSell, bestKnownBuy, marketRows, portProfile, newsFeed, upcomingDeadlines, cargoRows,
    serialize, deserialize, deserializeMeta, canAct,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MM;
  else root.MM = MM;
})(typeof window !== 'undefined' ? window : globalThis);
