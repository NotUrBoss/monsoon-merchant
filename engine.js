/* Monsoon Merchant — game engine. Pure logic, no DOM. Runs in the browser and in Node. */
(function (root) {
  'use strict';

  const VERSION = '2.3.1';
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
    // Ocean lanes: far ports beyond the chart, opened by the company's Ocean lanes stage. lon/lat place them at the chart edge.
    colombo:   { name: 'Colombo', short: 'Colombo', cc: 'LK', lon: 96.75, lat: 8.7, bank: false, yard: false, unlock: null, ocean: true, blurb: 'Gateway to the Indian Ocean. Rubber estates and thirsty for rice.' },
    mumbai:    { name: 'Mumbai', short: 'Mumbai', cc: 'IN', lon: 96.75, lat: 11.4, bank: true, yard: false, unlock: null, ocean: true, blurb: 'A billion cooks. Buys palm oil by the tanker, sells rice cheap.' },
    dubai:     { name: 'Dubai', short: 'Dubai', cc: 'AE', lon: 96.75, lat: 14.1, bank: true, yard: true, unlock: null, ocean: true, blurb: 'Imports everything and pays well for it. Coal is the only bargain.' },
    tokyo:     { name: 'Tokyo', short: 'Tokyo', cc: 'JP', lon: 124.25, lat: 28.6, bank: true, yard: true, unlock: null, ocean: true, blurb: 'Machines and gadgets cheap, rice and coffee very dear.' },
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
    // Products: made in your factories, but every market also trades them.
    food:        { name: 'Packaged Food', base: 6750,   vol: 0.028, gvol: 0.012, depth: 1800, product: true },
    tyres:       { name: 'Tyres',         base: 15500,  vol: 0.032, gvol: 0.014, depth: 900, product: true },
    coffeemix:   { name: 'Coffee Mix',    base: 28000,  vol: 0.036, gvol: 0.016, depth: 400, product: true },
    machinery:   { name: 'Machinery',     base: 152000, vol: 0.03,  gvol: 0.013, depth: 90, product: true },
  };
  const GOOD_IDS = Object.keys(GOODS);

  // Port price factors vs. the regional average (below 1 = exporter/cheap, above 1 = importer/dear).
  const PF = {
    penang:    { rice: 1.14, palm: 0.84, rubber: 0.80, steel: 1.10, coffee: 1.12, electronics: 0.88, durian: 0.64, coal: 1.16, food: 1.02, tyres: 0.96, coffeemix: 1.00, machinery: 1.02 },
    klang:     { rice: 1.14, palm: 0.78, rubber: 0.88, steel: 1.08, coffee: 1.10, electronics: 0.98, durian: 0.70, coal: 1.12, food: 0.96, tyres: 0.97, coffeemix: 1.00, machinery: 1.05 },
    singapore: { rice: 1.12, palm: 0.86, rubber: 0.94, steel: 1.06, coffee: 1.10, electronics: 1.00, durian: 0.92, coal: 0.96, food: 1.12, tyres: 1.00, coffeemix: 1.06, machinery: 1.00 },
    jakarta:   { rice: 1.24, palm: 0.74, rubber: 0.86, steel: 1.24, coffee: 0.84, electronics: 1.20, durian: 0.94, coal: 0.66, food: 1.10, tyres: 1.08, coffeemix: 0.96, machinery: 1.12 },
    bangkok:   { rice: 0.74, palm: 1.06, rubber: 0.76, steel: 1.20, coffee: 1.00, electronics: 1.06, durian: 0.72, coal: 1.14, food: 0.95, tyres: 1.10, coffeemix: 1.02, machinery: 1.08 },
    hcmc:      { rice: 0.80, palm: 1.22, rubber: 0.94, steel: 1.26, coffee: 0.78, electronics: 1.16, durian: 0.86, coal: 1.08, food: 1.00, tyres: 1.10, coffeemix: 0.95, machinery: 1.10 },
    haiphong:  { rice: 0.92, palm: 1.28, rubber: 1.12, steel: 1.08, coffee: 0.96, electronics: 0.92, durian: 1.08, coal: 0.86, food: 1.05, tyres: 1.12, coffeemix: 1.02, machinery: 1.08 },
    shenzhen:  { rice: 1.16, palm: 1.34, rubber: 1.36, steel: 0.86, coffee: 1.22, electronics: 0.78, durian: 1.40, coal: 1.22, food: 1.08, tyres: 0.96, coffeemix: 1.10, machinery: 0.94 },
    shanghai:  { rice: 1.18, palm: 1.38, rubber: 1.32, steel: 0.70, coffee: 1.30, electronics: 0.86, durian: 1.50, coal: 1.30, food: 1.10, tyres: 0.95, coffeemix: 1.12, machinery: 0.92 },
    colombo:   { rice: 1.16, palm: 1.14, rubber: 0.80, steel: 1.18, coffee: 0.96, electronics: 1.20, durian: 1.22, coal: 1.18, food: 1.12, tyres: 1.12, coffeemix: 1.06, machinery: 1.16 },
    mumbai:    { rice: 0.82, palm: 1.45, rubber: 1.08, steel: 0.94, coffee: 1.06, electronics: 1.26, durian: 1.32, coal: 1.36, food: 1.06, tyres: 1.06, coffeemix: 1.14, machinery: 1.18 },
    dubai:     { rice: 1.32, palm: 1.22, rubber: 1.26, steel: 1.24, coffee: 1.26, electronics: 1.08, durian: 1.46, coal: 0.92, food: 1.36, tyres: 1.30, coffeemix: 1.30, machinery: 1.24 },
    tokyo:     { rice: 1.46, palm: 1.26, rubber: 1.30, steel: 0.88, coffee: 1.38, electronics: 0.84, durian: 1.56, coal: 1.34, food: 1.24, tyres: 0.94, coffeemix: 1.30, machinery: 0.84 },
  };
  const PORT_SIZE = { penang: 0.8, klang: 1.1, singapore: 1.4, jakarta: 1.0, bangkok: 1.0, hcmc: 1.0, haiphong: 0.9, shenzhen: 1.3, shanghai: 1.5, colombo: 0.9, mumbai: 1.4, dubai: 1.3, tokyo: 1.5 };
  const OCEAN_PORTS = PORT_IDS.filter(p => PORTS[p].ocean);

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
    { n: 5, desc: 'Season 13% shorter (78 or 104 days).' },
    { n: 6, desc: 'Pirates 40% bolder.' },
    { n: 7, desc: 'Trading spreads +2%.' },
    { n: 8, desc: 'Contract penalties doubled.' },
    { n: 9, desc: 'Start with RM 20k less.' },
    { n: 10, desc: 'No monsoon forecast. Stronger winds.' },
  ];

  // Season lengths a player can choose for a normal season. Daily Voyage stays 60 days.
  const SEASON_DAYS = [90, 120];
  // Endless mode runs in chapters of one monsoon each.
  const CHAPTER_DAYS = 60;
  // Every season length a save may hold: daily (60, sprint 45), normal and level 5+ cuts.
  const VALID_DAYS = [45, 52, 60, 78, 90, 104, 120];
  const RANKS = [
    { id: 'deckhand', name: 'Deckhand', min: -Infinity },
    { id: 'bosun', name: 'Bosun', min: 200000 },
    { id: 'trader', name: 'Trader', min: 600000 },
    { id: 'merchant', name: 'Merchant', min: 1500000 },
    { id: 'towkay', name: 'Towkay', min: 4000000 },
    { id: 'tycoon', name: 'Tycoon', min: 10000000 },
    { id: 'legend', name: 'Legend of the Straits', min: 25000000 },
    { id: 'taipan', name: 'Taipan', min: 100000000 },
    { id: 'prince', name: 'Merchant Prince', min: 250000000 },
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

  const RIVAL = { name: 'Towkay Lim', full: 'Lim Ah Seng', desc: 'Old money from Penang. Runs a fleet of junks and hates losing.' };
  const BOUNTY_LP = { deliver: 8, ports: 6, bigsale: 8, profit: 8, contracts: 8, nwby: 10, hull: 5, rivalby: 8, nodebt: 5 };

  const REGION_NAMES = { strait: 'Malacca Strait', java: 'Java Sea', gulf: 'Gulf of Thailand', scs: 'South China Sea', tonkin: 'Gulf of Tonkin', ecs: 'Taiwan Strait', indian: 'Indian Ocean', pacific: 'East China Sea and Pacific' };

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
    andaman: [97.7, 6.6], ryukyu: [123.4, 25.4],
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
    // Ocean lanes, with real sea distances in nautical miles.
    ['penang', 'andaman', 'strait'], ['m_n', 'andaman', 'strait'], ['andaman', 'colombo', 'indian', 1100], ['colombo', 'mumbai', 'indian', 900], ['mumbai', 'dubai', 'indian', 1050],
    ['tw', 'ryukyu', 'pacific'], ['ryukyu', 'tokyo', 'pacific', 1000], ['zj', 'tokyo', 'pacific', 950],
  ];
  function ll(id) { const p = PORTS[id]; return p ? [p.lon, p.lat] : NODES[id]; }
  function nmBetween(a, b) {
    const A = ll(a), B = ll(b);
    const lat = ((A[1] + B[1]) / 2) * Math.PI / 180;
    const dx = (B[0] - A[0]) * Math.cos(lat) * 60, dy = (B[1] - A[1]) * 60;
    return Math.hypot(dx, dy) * 1.05;
  }
  const GRAPH = {};
  EDGES.forEach(([a, b, region, nm]) => {
    const len = nm || nmBetween(a, b);
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
      daily: { last: null, streak: 0, bestStreak: 0, total: 0, best: {}, plays: {} },
      settings: { sound: true, music: true, haptics: true, tips: true, motion: true },
      tips: {},
      endless: { runs: 0, best: 0, bestDay: 0, chapters: 0, hall: [] },
    };
  }

  /* ================= Run creation ================= */
  function newRun(opts, meta) {
    opts = opts || {};
    meta = meta || newMeta();
    const mode = opts.mode === 'daily' ? 'daily' : opts.mode === 'endless' ? 'endless' : 'normal';
    const daily = mode === 'daily', endless = mode === 'endless';
    const seed = opts.seed || (daily ? 'daily-' + opts.dateKey : 'run-' + Date.now() + '-' + Math.floor(Math.random() * 1e9));
    const unl = daily ? {} : (meta.unlocks || {});
    const captain = daily ? 'rahim' : (CAPTAINS[opts.captain] && (!CAPTAINS[opts.captain].unlock || unl[CAPTAINS[opts.captain].unlock]) ? opts.captain : 'rahim');
    const level = daily ? 0 : clamp(opts.level | 0, 0, Math.min(10, meta.levelMax || 0));
    const ports = PORT_IDS.filter(p => !PORTS[p].ocean && (!PORTS[p].unlock || unl[PORTS[p].unlock]));
    const goods = GOOD_IDS.filter(g => !GOODS[g].unlock || unl[GOODS[g].unlock]);
    const W = stream(seed + ':world');
    const length = daily ? 60 : endless ? CHAPTER_DAYS : (SEASON_DAYS.indexOf(+opts.days) >= 0 ? +opts.days : SEASON_DAYS[0]);
    const s = {
      v: 1, version: VERSION, mode, dateKey: opts.dateKey || null, seed,
      rngW: W, rngL: stream(seed + ':luck'),
      captain, level, ports, goods,
      perks: {
        contacts: !!unl.perk_contacts, insurer: !!unl.perk_insurer, crew: !!unl.perk_crew, reefer: !!unl.ship_reefer,
      },
      twist: null,
      day: 1, maxDays: length,
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
        visited: {}, sold: {}, alongUsed: false, typhoons: 0,
      },
      rival: null, bounties: [], co: newCo(),
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
    if (level >= 5 && !endless) s.maxDays = Math.round(length * 52 / 60);
    if (endless) s.endless = newEndless(s);
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
    initRival(s);
    // Warm up the world so the season starts mid-story.
    s.day = -5;
    for (let i = 0; i < 6; i++) { s.day++; worldTick(s); }
    s.day = 1;
    s.rival.hist = [[1, s.rival.nw]];
    s.st.visited[s.port] = true;
    genBounties(s);
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
    if (s.endless) s.endless.nw0 = s.st.peak;
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
  function quoteBuy(s, g, q) { return quoteBuyAt(s, s.port, g, q); }
  function quoteSell(s, g, q) { return quoteSellAt(s, s.port, g, q); }
  function quoteBuyAt(s, p, g, q) {
    q = Math.max(0, Math.floor(q));
    const m0 = mid(s, p, g), dI = ELASTIC * q / depthT(p, g);
    const f = dI > 1e-9 ? (Math.exp(dI) - 1) / dI : 1;
    const avg = m0 * (1 + spreadOf(s) / 2) * f;
    return { q, avg, total: Math.round(avg * q), after: m0 * Math.exp(dI) * (1 + spreadOf(s) / 2), move: Math.exp(dI) - 1 };
  }
  function quoteSellAt(s, p, g, q) {
    q = Math.max(0, Math.floor(q));
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
  function netWorth(s) { return s.cash + cargoValue(s) + tradeIn(s) + coValue(s, false) - s.bank - s.along; }
  function netWorthCost(s) { return s.cash + cargoCostValue(s) + tradeIn(s) + coValue(s, true) - s.bank - s.along; }
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
  function addSold(s, p, g, q) { const m = s.st.sold[p] || (s.st.sold[p] = {}); m[g] = (m[g] || 0) + q; }
  function afterChange(s) {
    const nw = netWorth(s);
    if (nw > s.st.peak) s.st.peak = nw;
    if (!s.st.m1Day && nw >= 1e6) s.st.m1Day = s.day;
    if (s.bounties) checkBounties(s, false);
    if (s.co) openOcean(s);
  }
  function log(s, text, kind) { s.log.unshift({ day: s.day, text, kind: kind || 'info' }); if (s.log.length > 60) s.log.length = 60; }
  function addNews(s, n) { n.day = s.day; n.id = ++s.seq; s.news.unshift(n); if (s.news.length > 50) s.news.length = 50; }
  const fail = (msg) => ({ ok: false, msg });
  const own = (o, k) => o != null && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

  /* ================= Trading ================= */
  function canAct(s) { return s.phase === 'port' && !s.pending && !(s.endless && s.endless.bankrupt); }
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
    if (s.co) { const h = s.co.here || (s.co.here = {}); h[g] = (h[g] || 0) + q; }
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
    addSold(s, s.port, g, q);
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
  /* ================= Rival ================= */
  // Longer seasons compound: the rival grows faster than linearly with the season length.
  function rivalScale(d) { return d <= 60 ? d / 60 : 1 + 2.5 * (d - 60) / 60; }
  // Endless: Lim's target for the end of chapter ch grows faster than linearly, and with the creeping level.
  function endlessRivalTarget(s, ch, luck) { return Math.round(2200000 * luck * Math.pow(ch, 1.4) * (1 + 0.12 * s.level)); }
  function initRival(s) {
    const W = s.rngW;
    const luck = 0.8 + rnd(W) * 0.45;
    const target = s.mode === 'endless' ? endlessRivalTarget(s, 1, luck) : 2000000 * (1 + 0.15 * s.level) * luck * (s.twist === 'windfall' ? 1.3 : 1) * rivalScale(s.maxDays);
    s.rival = { nw: 50000, target: Math.round(target), next: rInt(W, 1, 3), moves: 0, walk: 0, hist: [] };
    if (s.mode === 'endless') { s.rival.base = 50000; s.rival.luck = luck; }
  }
  function rivalCurve(s, day) {
    if (s.mode === 'endless' && s.endless) { const E = s.endless, x = clamp((day - E.start) / CHAPTER_DAYS, 0, 1); return s.rival.base + (s.rival.target - s.rival.base) * Math.pow(x, 1.2); }
    const x = clamp(day / s.maxDays, 0, 1); return 50000 + (s.rival.target - 50000) * Math.pow(x, 1.7);
  }
  function rivalTick(s) {
    const R = s.rival, W = s.rngW;
    R.walk = clamp(R.walk * 0.9 + rGauss(W) * 0.035, -0.18, 0.18);
    R.nw = Math.round(rivalCurve(s, Math.max(0, s.day)) * Math.exp(R.walk));
    if (s.day >= 1) { R.hist.push([s.day, R.nw]); R.hist = thinHist(R.hist); }
    if (s.day >= R.next) { rivalMove(s); R.next = s.day + rInt(W, 2, 4); }
  }
  function rivalFinal(s) { return s.mode === 'endless' || s.day >= s.maxDays ? s.rival.nw : Math.round(rivalCurve(s, s.maxDays) * Math.exp(s.rival.walk)); }
  function rivalMove(s) {
    const W = s.rngW;
    const r1 = rnd(W), m1 = rnd(W), m2 = rnd(W), d1 = rInt(W, 3, 5), d2 = rInt(W, 4, 7), lead = rInt(W, 2, 4);
    const lanes = [];
    s.goods.forEach(g => {
      if (GOODS[g].perish || GOODS[g].product) return;
      s.ports.forEach(a => s.ports.forEach(b => { if (a !== b && PF[b][g] / PF[a][g] >= 1.3) lanes.push({ g, a, b, r: PF[b][g] / PF[a][g] }); }));
    });
    if (!lanes.length) return;
    lanes.sort((x, y) => y.r - x.r || (x.g + x.a + x.b < y.g + y.a + y.b ? -1 : 1));
    const L = lanes[Math.floor(r1 * Math.min(10, lanes.length))];
    if (s.events.some(e => e.good === L.g && (e.port === L.a || e.port === L.b) && e.end >= s.day)) return;
    const gl = GOODS[L.g].name.toLowerCase();
    const e1 = { id: ++s.seq, scope: 'local', rival: true, port: L.a, good: L.g, kind: 'squeeze', mult: 1.12 + m1 * 0.14, start: s.day, end: s.day + d1 - 1, headline: RIVAL.name + '’s junks buy up ' + gl + ' in ' + PORTS[L.a].name, rumoured: false, announced: true };
    const e2 = { id: ++s.seq, scope: 'local', rival: true, port: L.b, good: L.g, kind: 'dump', mult: 0.7 + m2 * 0.14, start: s.day + lead, end: s.day + lead + d2 - 1, headline: RIVAL.name + '’s fleet dumps ' + gl + ' in ' + PORTS[L.b].name, rumoured: true };
    s.events.push(e1, e2);
    addNews(s, { kind: 'rival', text: RIVAL.name + ' loads ' + gl + ' in ' + PORTS[L.a].name + ', bound for ' + PORTS[L.b].name + '. Expect a glut there from about day ' + e2.start + '.', port: L.b, good: L.g, ev: e1.id, end: e1.end });
    s.rival.moves++;
  }

  /* ================= Bounties ================= */
  // Round a goal to a friendly figure (two significant digits, ending in 0 or 5).
  function niceGoal(x) { const m = Math.pow(10, Math.floor(Math.log10(x)) - 1); return Math.round(x / (5 * m)) * 5 * m; }
  // Net-worth goal for unlocking the next Monsoon level: a Merchant over 60 days, scaled to longer seasons.
  function levelGoal(s) { return niceGoal(RANKS[MERCHANT_RANK].min * Math.pow(s.maxDays / 60, 1.5)); }
  function makeBounty(s, type) {
    const W = s.rngW;
    const E = s.mode === 'endless' ? s.endless : null;
    const half = E ? E.start + Math.round(CHAPTER_DAYS / 2) : Math.round(s.maxDays / 2);
    const b = { id: type, type, lp: BOUNTY_LP[type], done: false, failed: false, p: {} };
    if (type === 'deliver') {
      const goods = s.goods.filter(g => !GOODS[g].perish && !GOODS[g].product);
      const g = goods[Math.floor(rnd(W) * goods.length)];
      const dests = s.ports.filter(p => PF[p][g] >= 1.12);
      const p = dests.length ? dests[Math.floor(rnd(W) * dests.length)] : s.ports[0];
      const q = rInt(W, 12, 25) * 10, d = Math.min(s.maxDays - 4, rInt(W, half - 8, half + 4));
      b.p = { g, port: p, q, day: d, q0: E ? ((s.st.sold[p] || {})[g] || 0) : 0 };
      b.text = 'Sell ' + q + ' t of ' + GOODS[g].name.toLowerCase() + ' in ' + PORTS[p].name + ' by day ' + d;
    } else if (type === 'ports') {
      if (E) { b.p = { n: 6, v0: s.st.voyages }; b.text = 'Make 6 voyages this chapter'; }
      else { b.p = { n: Math.min(6, s.ports.length) }; b.text = 'Drop anchor in ' + b.p.n + ' different ports'; }
    }
    else if (type === 'bigsale') { b.p = { x: E ? niceGoal(Math.max(400000, netWorth(s) * 0.08, s.st.maxSale * 1.2)) : niceGoal(400000 * s.maxDays / 60) }; b.text = 'Make a single sale worth ' + rm(b.p.x); }
    else if (type === 'profit') { b.p = { x: E ? niceGoal(Math.max(150000, netWorth(s) * 0.03, s.st.bestTrade * 1.2)) : niceGoal(150000 * s.maxDays / 60) }; b.text = 'Clear ' + rm(b.p.x) + ' profit on one sale'; }
    else if (type === 'contracts') { b.p = { n: E ? 4 : Math.max(3, 3 + Math.round((s.maxDays - 60) / 30)), c0: E ? s.st.contracts : 0 }; b.text = 'Deliver ' + b.p.n + ' contracts' + (E ? ' this chapter' : ''); }
    else if (type === 'nwby') { const x = E ? niceGoal(Math.max(1e6, netWorth(s) * 1.6)) : niceGoal(1e6 * Math.pow(half / 30, 2.2)); b.p = { x, day: half }; b.text = 'Be worth ' + rm(x) + ' by day ' + half; }
    else if (type === 'hull') { b.p = { x: 80 }; b.text = 'Finish the ' + (E ? 'chapter' : 'season') + ' with the hull at 80% or better'; }
    else if (type === 'rivalby') { b.p = { day: half }; b.text = 'Be worth more than ' + RIVAL.name + ' on day ' + half; }
    else if (type === 'nodebt') { b.text = 'Never borrow from the Ah Long'; }
    return b;
  }
  function genBounties(s) {
    const W = s.rngW;
    const pool = Object.keys(BOUNTY_LP).filter(t => s.mode !== 'endless' || t !== 'nodebt');
    const picks = [];
    while (picks.length < 3) picks.push(pool.splice(Math.floor(rnd(W) * pool.length), 1)[0]);
    s.bounties = picks.map(t => makeBounty(s, t));
  }
  function checkBounties(s, atEnd) {
    const got = [];
    (s.bounties || []).forEach(b => {
      if (b.done || b.failed) return;
      const P = b.p; let ok = false, bad = false;
      switch (b.type) {
        case 'deliver': ok = ((s.st.sold[P.port] || {})[P.g] || 0) - (P.q0 || 0) >= P.q; bad = !ok && s.day > P.day; break;
        case 'ports': ok = P.v0 !== undefined ? s.st.voyages - P.v0 >= P.n : Object.keys(s.st.visited).length >= P.n; break;
        case 'bigsale': ok = s.st.maxSale >= P.x; break;
        case 'profit': ok = s.st.bestTrade >= P.x; break;
        case 'contracts': ok = s.st.contracts - (P.c0 || 0) >= P.n; break;
        case 'nwby': ok = s.day <= P.day && netWorth(s) >= P.x; bad = !ok && s.day > P.day; break;
        case 'hull': ok = atEnd && !s.sunk && s.ship.cond >= P.x; bad = atEnd && !ok; break;
        case 'rivalby': if (s.day >= P.day && b.check === undefined) { b.check = netWorth(s) > s.rival.nw; ok = b.check; bad = !ok; } break;
        case 'nodebt': bad = s.st.alongUsed; ok = atEnd && !bad; break;
      }
      if (ok) { b.done = true; b.doneDay = s.day; got.push(b); }
      else if (bad || atEnd) b.failed = true;
    });
    return got;
  }

  function worldTick(s) {
    const W = s.rngW;
    s.goods.forEach(g => { s.G[g] = clamp(s.G[g] * 0.95 + rGauss(W) * GOODS[g].gvol, -0.45, 0.45); });
    s.ports.forEach(p => s.goods.forEach(g => {
      const m = s.mk[p][g];
      m.L = clamp(m.L * 0.88 + rGauss(W) * GOODS[g].vol, -0.5, 0.5);
      m.I *= 0.9; if (Math.abs(m.I) < 0.001) m.I = 0;
    }));
    s.events.forEach(e => { if (e.start === s.day && !e.announced) { e.announced = true; if (!s.news.some(n => n.ev === e.id && n.kind !== 'rumour')) addNews(s, { kind: e.kind, text: e.headline, port: e.port, good: e.good, ev: e.id, end: e.end }); } });
    s.events = s.events.filter(e => e.end >= s.day);
    const shock = (s.captain === 'wong' ? 1.35 : 1) * (s.twist === 'boom' ? 1.4 : 1);
    if (rnd(W) < 0.24 * shock) spawnLocal(s, false);
    if (rnd(W) < 0.03 * shock) spawnGlobal(s);
    if (rnd(W) < (s.level >= 3 ? 0.1 : 0.06)) spawnFakeRumour(s);
    rivalTick(s);
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
    companyTick(s);
    s.cash = clamp(s.cash, -1e12, 1e13); s.bank = Math.min(s.bank, 1e13); s.along = Math.min(s.along, 1e13);
    s.hist.push([s.day, Math.round(netWorth(s))]);
    s.hist = thinHist(s.hist);
    afterChange(s);
  }
  function dayTick(s) {
    s.day++; worldTick(s); playerTick(s);
    if (s.mode === 'endless' && s.endless) endlessTick(s);
  }
  // Keep the last 120 days in full and one point a week before that, so long games stay small.
  function thinHist(h) {
    if (h.length <= 300) return h;
    const cut = h[h.length - 1][0] - 120;
    return h.filter((x, i) => x[0] > cut || i === 0 || x[0] % 7 === 0);
  }

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
    const base = { strait: 0.012, java: 0.02, gulf: 0.022, scs: 0.04, tonkin: 0.036, ecs: 0.04, indian: 0.022, pacific: 0.03 }[region] || 0.02;
    let m = 1;
    if (phaseOn(s, day) === 'SW') m *= ({ scs: 1.5, tonkin: 1.5, ecs: 1.5, gulf: 1.1, indian: 1.6, pacific: 1.5 })[region] || 1;
    else m *= ({ scs: 1.15, gulf: 1.2 })[region] || 1;
    if (Math.abs(day - s.monsoon.shiftDay) <= 3) m *= 1.6;
    if (s.captain === 'teoh') m *= 0.65;
    if (s.level >= 2) m *= 1.3;
    if (s.twist === 'typhoon') m *= 1.5;
    if (s.twist === 'calm') m *= 0.5;
    return base * m;
  }
  function pirateP(s, region) {
    const base = { strait: 0.05, java: 0.04, gulf: 0.016, scs: 0.02, tonkin: 0.014, ecs: 0.014, indian: 0.02, pacific: 0.006 }[region] || 0.02;
    let m = 0.4 + Math.min(1, cargoCostValue(s) / 250000) * 0.8;
    if (s.level >= 6) m *= 1.4;
    if (s.ship.up.security) m *= 0.6;
    if (s.twist === 'calm') m *= 2;
    return base * m;
  }
  const riskLabel = p => (p < 0.08 ? 'Low' : p < 0.22 ? 'Medium' : 'High');
  function insuranceRate(s, days, r) {
    let rate = 0.004 + 0.0028 * days;
    const prone = r.segs.some(sg => sg.region === 'scs' || sg.region === 'tonkin' || sg.region === 'ecs' || sg.region === 'pacific' || sg.region === 'indian');
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
      to, route: r, days, calmDays: calm, windDelta: days - calm, arrive: s.day + days, tooLate: s.mode !== 'endless' && s.day + days > s.maxDays,
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
    if (s.co) s.co.here = {};
    return { ok: true, plan };
  }
  function stepVoyage(s) {
    if (s.phase !== 'sea') return { type: 'none' };
    if (s.pending) return { type: 'event', event: s.pending };
    const v = s.voyage;
    if (v.idx >= v.days) return arrive(s);
    if (s.mode !== 'endless' && s.day >= s.maxDays) { log(s, 'You crack on through the last night and make ' + PORTS[v.to].name + ' as the season closes.', 'info'); return arrive(s); }
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
  function founderP(s, typhoon) { const c = s.ship.cond; return c >= 40 ? 0 : (typhoon ? 0.32 : 0.16) * (1 - c / 40); }
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
    const prone = sg.region === 'scs' || sg.region === 'tonkin' || sg.region === 'ecs' || sg.region === 'pacific';
    const typhoon = prone && (s.monsoon.phase === 'SW' || Math.abs(s.day - s.monsoon.shiftDay) <= 3) && rnd(s.rngL) < 0.5;
    const wait = typhoon ? 2 : 1;
    const has = cargoUsed(s) > 0;
    const pLoss = stormLossP(s, typhoon);
    return mkEvent('storm', typhoon ? 'Typhoon warning' : 'Squall line ahead',
      typhoon ? 'The barometer is in free fall. A typhoon is crossing your track in the ' + REGION_NAMES[sg.region] + '.' : 'Black clouds are stacked to the horizon and the swell is building in the ' + REGION_NAMES[sg.region] + '.',
      [
        { id: 'push', label: 'Push through', sub: (has ? Math.round(pLoss * 100) + '% chance of losing cargo' + (s.voyage && s.voyage.insured ? ' (insured)' : ' (not insured)') : 'Expect some hull damage') + (founderP(s, typhoon) > 0 ? '. Hull at ' + Math.round(s.ship.cond) + '%: ' + Math.round(founderP(s, typhoon) * 100) + '% chance she founders' : '') },
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
        s.st.storms++; if (ctx.typhoon) s.st.typhoons++;
        if (choiceId === 'push') {
          const lines = [];
          if (ctx.typhoon) s.st.typhoonPush = true;
          if (rnd(L) < founderP(s, ctx.typhoon)) { s.ship.cond = 0; s.pending = null; return sink(s); }
          if (cargoUsed(s) > 0 && rnd(L) < stormLossP(s, ctx.typhoon)) { lines.push(loseCargo(s, rRange(L, 0.1, 0.28) * (ctx.typhoon ? 1.5 : 1), 'the storm')); tone = 'bad'; }
          else if (cargoUsed(s) > 0) { lines.push('The lashings hold. Not a crate lost.'); tone = 'good'; }
          else lines.push('You punch through the worst of it.');
          const d = damage(s, rRange(L, 5, 14) * (ctx.typhoon ? 1.8 : 1) * (1.3 - hullEff(s)));
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
    // In Endless, a captain with a company is not finished: the company sends a coaster to bring them home.
    if (s.mode === 'endless' && s.co && Object.keys(s.co.wh).length) {
      const home = Object.keys(s.co.wh)[0];
      s.ship = { cls: 'coaster', cond: 70, up: {} }; s.port = home; s.phase = 'port'; s.voyage = null; s.pending = null;
      s.st.visited[home] = true; s.st.rescued = (s.st.rescued || 0) + 1;
      log(s, 'Your ship foundered. ' + txt + ' The company brought you home to ' + PORTS[home].name + ' in an old coaster.', 'bad');
      afterChange(s);
      return { type: 'rescued', text: 'The battered hull finally gives way and the crew take to the boats. ' + txt + ' Your company sends an old coaster to bring you home to ' + PORTS[home].name + '. The trading house lives on.' };
    }
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
    s.st.visited[s.port] = true;
    const rep = { port: s.port, day: s.day, lines: [], fee: 0, delivered: [] };
    const fee = portFee(s); s.cash -= fee; s.st.fees += fee; rep.fee = fee;
    snapshot(s, s.port);
    for (const k of s.contracts.slice()) {
      if (k.dest !== s.port) continue;
      const c = s.cargo[k.good];
      if (c && c.q >= k.qty) {
        const basis = c.cost * k.qty, pay = k.qty * k.pay;
        removeCargo(s, k.good, k.qty);
        addSold(s, s.port, k.good, k.qty);
        s.cash += pay; s.st.contracts++; s.st.contractPay += pay;
        s.contracts.splice(s.contracts.indexOf(k), 1);
        rep.delivered.push({ good: k.good, qty: k.qty, pay, profit: pay - basis });
        log(s, 'Contract delivered: ' + k.qty + ' t ' + GOODS[k.good].name.toLowerCase() + ' for ' + rm(pay) + '.', 'good');
      } else {
        rep.lines.push('Contract here needs ' + k.qty + ' t of ' + GOODS[k.good].name.toLowerCase() + '. You have ' + (c ? c.q : 0) + ' t.');
      }
    }
    if (s.co) {
      for (const d of s.co.deals.slice()) {
        const c = s.cargo[d.g];
        if (d.port !== s.port || !c) continue;
        const unit = c.cost, q = Math.min(c.q, d.qty - d.got), pay = Math.round(q * d.unit), done = d.got + q >= d.qty;
        removeCargo(s, d.g, q);
        dealDeliver(s, d, q, unit, null);
        rep.delivered.push({ good: d.g, qty: q, pay: pay + (done ? d.bonus + d.deposit : 0), profit: pay - unit * q, big: true, done });
      }
      rep.co = takeCoReport(s);
    }
    const col = checkCollectors(s); if (col) rep.lines.push(col);
    genOffers(s);
    const L = s.rngL; const u = rnd(L), u2 = rnd(L);
    if (cargoUsed(s) > 0 && u < 0.1) s.pending = makeCustoms(s);
    else if (u2 < 0.04) { s.cash += fee; rep.lines.push('The harbourmaster is in a durian-feast mood. Port fees waived.'); }
    if (s.mode !== 'endless' && s.day >= s.maxDays) s.lastDay = true;
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
      if (!dests.length || (GOODS[g].product && coStage(s) < 2)) continue;
      const d = dests[Math.floor(r1 * dests.length)];
      const plan = planVoyage(s, d);
      const deadline = s.day + plan.days + 4 + Math.floor(r2 * 7);
      if (s.mode !== 'endless' && deadline > s.maxDays) continue;
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
    s.along += amt; s.cash += amt; s.st.borrowed = true; s.st.alongUsed = true;
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


  /* ================= Company: warehouses, factories, estates, shops, managers, freight, ocean lanes ================= */
  const STAGES = [
    { id: 'trader', at: 0, name: 'Trader', desc: 'Buy, sail and sell.' },
    { id: 'warehouse', at: 150000, name: 'Warehouses', desc: 'Rent warehouses and set standing buy and sell orders.' },
    { id: 'factory', at: 500000, name: 'Factories', desc: 'Build factories that turn raw goods into products every day.' },
    { id: 'freight', at: 1000000, name: 'Freight', desc: 'Hire freight to run standing routes between ports.' },
    { id: 'estate', at: 2000000, name: 'Estates', desc: 'Buy plantations and mines that fill your warehouses every day.' },
    { id: 'shop', at: 3000000, name: 'Shops', desc: 'Open shops that sell your goods to steady customers, for cash or on credit.' },
    { id: 'manager', at: 8000000, name: 'Managers', desc: 'Hire branch managers who run a port for you.' },
    { id: 'ocean', at: 10000000, name: 'Ocean lanes', desc: 'Sail and ship to Colombo, Mumbai, Dubai and Tokyo.' },
  ];
  const STAGE = { warehouse: 1, factory: 2, freight: 3, estate: 4, shop: 5, manager: 6, ocean: 7 };
  const CO = { whCost: 60000, whUpCost: 50000, whCap: 400, whMaxLvl: 3, whUpkeep: 300, facCost: 150000, facUpCost: 120000, facUpkeep: 600, facBatches: 20, facMaxLvl: 2,
    routeBase: 3000, routePerTDay: 6, routeMax: 3, freightSpeed: 12, orderMax: 4, reserve: 20000, batchFee: 0.04,
    estCost: 300000, estUpCost: 250000, estUpkeep: 1500, estMaxLvl: 2, estYield: 36000, harvestCost: 0.3,
    shopCost: 250000, shopUpCost: 200000, shopUpkeep: 1000, shopMaxLvl: 2, creditDays: 30, mgrFee: 100000 };
  const RECIPES = {
    food:      { name: 'Food processor', input: { rice: 2, palm: 1 }, out: 2, batches: 9 },
    tyres:     { name: 'Tyre plant', input: { rubber: 1, steel: 1 }, out: 1, batches: 8 },
    coffeemix: { name: 'Coffee roastery', input: { coffee: 2, rice: 1 }, out: 2, batches: 2 },
    machinery: { name: 'Machine works', input: { steel: 3, electronics: 1 }, out: 1, batches: 1 },
  };
  // Estates grow a raw good where the port is a natural producer; yields are best in their monsoon.
  const ESTATES = {
    palm:   { name: 'Palm oil estate', season: 'NE' },
    rubber: { name: 'Rubber estate', season: 'NE' },
    rice:   { name: 'Rice paddies', season: 'SW' },
    coffee: { name: 'Coffee estate', season: 'SW' },
    coal:   { name: 'Coal mine', season: null },
  };
  const SHOP_DEMAND = { food: 30, tyres: 14, coffeemix: 8, machinery: 1.5 };
  const SHOP_TIERS = { value: { name: 'Value', price: 1.0, demand: 1.3 }, standard: { name: 'Standard', price: 1.07, demand: 1.0 }, premium: { name: 'Premium', price: 1.15, demand: 0.7 } };
  const SHOP_TERMS = { cash: { name: 'Cash only', demand: 1.0 }, credit: { name: '30-day credit', demand: 1.4 } };
  const MGR_STYLES = {
    cautious:   { name: 'Cautious', wage: 2000, buy: -0.05, sell: 0.05, desc: 'Buys inputs only when cheap, sells only when dear, never pays to fix trouble.' },
    balanced:   { name: 'Balanced', wage: 2500, buy: 0.08, sell: -0.02, desc: 'Keeps the factory fed at fair prices and pays small bills to fix trouble.' },
    aggressive: { name: 'Aggressive', wage: 3000, buy: 9, sell: -0.12, desc: 'Never lets the factory wait, sells surplus fast and always pays to fix trouble.' },
  };
  const ALERT_CHOICES = { strike: ['settle', 'wait'], breakdown: ['repair', 'wait'], boom: ['overtime', 'normal'], blight: ['spray', 'wait'], pricewar: ['match', 'hold'] };
  function newCo() { return coFill({ wh: {}, fac: {}, routes: [], reserve: CO.reserve, seq: 0, made: 0, trips: 0, autoBought: 0, autoSold: 0, upkeep: 0, built: 0 }); }
  function coRng(s) { if (!s.rngC) s.rngC = stream(s.seed + ':company'); return s.rngC; }
  function coStage(s) { let k = 0; STAGES.forEach((st, i) => { if ((s.st.peak || 0) >= st.at) k = i; }); return Math.max(k, s.co ? (s.co.minStage || 0) : 0); }
  function nextStage(s) { const k = coStage(s); return STAGES[k + 1] || null; }
  function coCan(s) { return !!s.co && s.phase !== 'ended' && s.phase !== 'sunk'; }
  function whUsed(w) { let t = 0; for (const g in w.stock) t += w.stock[g].q; return t; }
  function whCap(w) { return w.lvl * CO.whCap; }
  function whFree(w) { return Math.max(0, whCap(w) - whUsed(w)); }
  // Stock remembers how many tonnes are "yours to deliver": made, grown or shipped in, not bought on this port's market.
  function stockAdd(w, g, q, unit, mine) {
    if (q <= 0) return;
    const c = w.stock[g] || (w.stock[g] = { q: 0, cost: 0, ok: 0 });
    c.cost = (c.cost * c.q + unit * q) / (c.q + q); c.q += q;
    if (mine) c.ok = Math.min(c.q, (c.ok || 0) + q);
  }
  function stockTake(w, g, q, mineOnly) {
    const c = w.stock[g]; if (!c) return 0;
    q = Math.min(q, mineOnly ? c.ok : c.q);
    if (q <= 0) return 0;
    const plain = c.q - c.ok;
    c.ok -= mineOnly ? q : Math.max(0, q - plain);
    c.q -= q;
    if (c.q <= 1e-9) delete w.stock[g];
    else c.ok = clamp(c.ok, 0, c.q);
    return q;
  }
  function mineQty(w, g) { const c = w && w.stock[g]; return c ? Math.floor(c.ok) : 0; }
  function spendable(s) { return Math.max(0, s.cash - (s.co ? s.co.reserve : CO.reserve)); }
  function fmtN(n) { return Math.round(n).toLocaleString('en-US'); }
  function coLog(s, text, kind) { log(s, text, kind || 'co'); }
  function needStage(s, k) { return coStage(s) >= k ? null : fail(STAGES[k].name + ' unlock at ' + rm(STAGES[k].at) + ' net worth'); }
  function routeMax(s) { return s.mode === 'endless' && s.endless ? Math.min(6, CO.routeMax + Math.floor((s.endless.ch - 1) / 2)) : CO.routeMax; }
  function freightDays(s, from, to) {
    const r = route(from, to); let eff = 0;
    r.segs.forEach(sg => { eff += sg.len * windFactor(s, sg, phaseOn(s, s.day)); });
    return Math.max(1, Math.round(eff / (CO.freightSpeed * 24)));
  }
  function routeQuote(s, from, to, q) { const days = freightDays(s, from, to); return { days, cost: Math.round(CO.routeBase + CO.routePerTDay * q * days) }; }
  function hereWh(s, p) { return own(s.co.wh, p) ? s.co.wh[p] : null; }
  function buildWarehouse(s) {
    if (!canAct(s)) return fail('Not now');
    const st = needStage(s, STAGE.warehouse); if (st) return st;
    if (own(s.co.wh, s.port)) return fail('You already have a warehouse here');
    if (s.cash < CO.whCost) return fail('Not enough cash');
    s.cash -= CO.whCost; s.co.built += CO.whCost;
    s.co.wh[s.port] = { lvl: 1, stock: {}, orders: [], invest: CO.whCost, pl: { bought: 0, sold: 0, profit: 0, upkeep: 0 } };
    coLog(s, 'Warehouse opened in ' + PORTS[s.port].name + '.', 'good');
    afterChange(s);
    return { ok: true };
  }
  function upgradeWarehouse(s, p) {
    if (!canAct(s)) return fail('Not now');
    const w = hereWh(s, p); if (!w) return fail('No warehouse there');
    if (w.lvl >= CO.whMaxLvl) return fail('Already the biggest warehouse');
    if (s.cash < CO.whUpCost) return fail('Not enough cash');
    s.cash -= CO.whUpCost; s.co.built += CO.whUpCost; w.invest += CO.whUpCost; w.lvl++;
    afterChange(s);
    return { ok: true };
  }
  function storeCargo(s, g, q) {
    if (!canAct(s)) return fail('Not now');
    const w = hereWh(s, s.port); if (!w) return fail('No warehouse here');
    if (strikeAt(s, s.port)) return fail('The dockers are on strike');
    if (!own(GOODS, g) || GOODS[g].perish) return fail('Warehouses have no cold storage');
    const c = own(s.cargo, g) ? s.cargo[g] : null; if (!c) return fail('Not aboard');
    q = Math.min(Math.floor(q), c.q, whFree(w));
    if (q <= 0) return fail(whFree(w) <= 0 ? 'The warehouse is full' : 'Nothing to store');
    // Cargo bought on this port's market during this call is not "yours to deliver".
    const here = s.co.here || (s.co.here = {});
    const local = Math.min(q, here[g] || 0);
    if (local) here[g] -= local;
    stockAdd(w, g, q - local, c.cost, true); stockAdd(w, g, local, c.cost, false);
    removeCargo(s, g, q);
    afterChange(s);
    return { ok: true, q };
  }
  function takeCargo(s, g, q) {
    if (!canAct(s)) return fail('Not now');
    const w = hereWh(s, s.port); if (!w) return fail('No warehouse here');
    if (strikeAt(s, s.port)) return fail('The dockers are on strike');
    const c = own(w.stock, g) ? w.stock[g] : null; if (!c) return fail('Not in the warehouse');
    q = Math.min(Math.floor(q), Math.floor(c.q), freeSpace(s));
    if (q <= 0) return fail('Your hold is full');
    const unit = c.cost, plain = Math.min(q, Math.max(0, Math.floor(c.q - c.ok)));
    stockTake(w, g, q);
    if (plain) { const here = s.co.here || (s.co.here = {}); here[g] = (here[g] || 0) + plain; }
    addCargo(s, g, q, unit);
    afterChange(s);
    return { ok: true, q };
  }
  const ORDER_MODES = { buy: ['cheap', 'any'], sell: ['dear', 'any'] };
  function setOrder(s, p, kind, g, qty, mode) {
    if (!coCan(s)) return fail('Not now');
    const w = hereWh(s, p); if (!w) return fail('No warehouse there');
    if (!own(ORDER_MODES, kind) || ORDER_MODES[kind].indexOf(mode) < 0) return fail('Unknown order');
    if (s.goods.indexOf(g) < 0 || GOODS[g].perish) return fail('Not this cargo');
    qty = Math.floor(qty); if (!(qty >= 1 && qty <= 1000)) return fail('Choose 1 to 1,000 t a day');
    const same = w.orders.find(o => o.kind === kind && o.g === g);
    if (same) { same.qty = qty; same.mode = mode; return { ok: true, id: same.id }; }
    if (w.orders.length >= CO.orderMax) return fail('Up to ' + CO.orderMax + ' orders per warehouse');
    const o = { id: ++s.co.seq, kind, g, qty, mode, done: 0 };
    w.orders.push(o);
    return { ok: true, id: o.id };
  }
  function removeOrder(s, p, id) { if (!coCan(s)) return fail('Not now'); const w = hereWh(s, p); if (!w) return fail('No warehouse there'); const i = w.orders.findIndex(o => o.id === id); if (i < 0) return fail('No such order'); w.orders.splice(i, 1); return { ok: true }; }
  function buildFactory(s, recipe) {
    if (!canAct(s)) return fail('Not now');
    const st = needStage(s, STAGE.factory); if (st) return st;
    if (!own(RECIPES, recipe)) return fail('Unknown factory');
    if (!hereWh(s, s.port)) return fail('Open a warehouse here first');
    if (own(s.co.fac, s.port)) return fail('This port already has your factory');
    if (s.cash < CO.facCost) return fail('Not enough cash');
    s.cash -= CO.facCost; s.co.built += CO.facCost;
    s.co.fac[s.port] = { recipe, lvl: 1, made: 0, invest: CO.facCost, note: '', added: 0, upkeep: 0, downUntil: 0, otUntil: 0 };
    coLog(s, RECIPES[recipe].name + ' built in ' + PORTS[s.port].name + '.', 'good');
    afterChange(s);
    return { ok: true };
  }
  function upgradeFactory(s, p) {
    if (!canAct(s)) return fail('Not now');
    const f = own(s.co.fac, p) ? s.co.fac[p] : null; if (!f) return fail('No factory there');
    if (f.lvl >= CO.facMaxLvl) return fail('Already upgraded');
    if (s.cash < CO.facUpCost) return fail('Not enough cash');
    s.cash -= CO.facUpCost; s.co.built += CO.facUpCost; f.invest += CO.facUpCost; f.lvl++;
    afterChange(s);
    return { ok: true };
  }
  /* ---- Estates ---- */
  function estateGoods(s, p) { return Object.keys(ESTATES).filter(g => s.goods.indexOf(g) >= 0 && own(PF, p) && PF[p][g] <= 0.95); }
  function estateYield(s, e) {
    const sea = ESTATES[e.g].season, ph = phaseOn(s, s.day);
    const season = sea ? (sea === ph ? 1.15 : 0.9) : 1;
    return Math.max(1, Math.round(CO.estYield * e.lvl / GOODS[e.g].base * season * (e.blightUntil >= s.day ? 0.5 : 1)));
  }
  function buildEstate(s, g) {
    if (!canAct(s)) return fail('Not now');
    const st = needStage(s, STAGE.estate); if (st) return st;
    if (!hereWh(s, s.port)) return fail('Open a warehouse here first');
    if (own(s.co.est, s.port)) return fail('You already have an estate here');
    if (!own(ESTATES, g) || estateGoods(s, s.port).indexOf(g) < 0) return fail('That does not grow here');
    if (s.cash < CO.estCost) return fail('Not enough cash');
    s.cash -= CO.estCost; s.co.built += CO.estCost;
    s.co.est[s.port] = { g, lvl: 1, made: 0, added: 0, upkeep: 0, invest: CO.estCost, note: '', blightUntil: 0 };
    coLog(s, ESTATES[g].name + ' bought near ' + PORTS[s.port].name + '.', 'good');
    afterChange(s);
    return { ok: true };
  }
  function upgradeEstate(s, p) {
    if (!canAct(s)) return fail('Not now');
    const e = own(s.co.est, p) ? s.co.est[p] : null; if (!e) return fail('No estate there');
    if (e.lvl >= CO.estMaxLvl) return fail('Already at full size');
    if (s.cash < CO.estUpCost) return fail('Not enough cash');
    s.cash -= CO.estUpCost; s.co.built += CO.estUpCost; e.invest += CO.estUpCost; e.lvl++;
    afterChange(s);
    return { ok: true };
  }
  /* ---- Shops ---- */
  function openShop(s) {
    if (!canAct(s)) return fail('Not now');
    const st = needStage(s, STAGE.shop); if (st) return st;
    if (!hereWh(s, s.port)) return fail('Open a warehouse here first');
    if (own(s.co.shop, s.port)) return fail('You already have a shop here');
    if (s.cash < CO.shopCost) return fail('Not enough cash');
    s.cash -= CO.shopCost; s.co.built += CO.shopCost;
    s.co.shop[s.port] = { lvl: 1, tier: 'standard', terms: 'cash', rep: 1, sold: 0, profit: 0, upkeep: 0, recv: [], bad: 0, collected: 0, invest: CO.shopCost, carry: [], matchUntil: 0, warUntil: 0, note: '' };
    coLog(s, 'Shop opened in ' + PORTS[s.port].name + '.', 'good');
    afterChange(s);
    return { ok: true };
  }
  function upgradeShop(s, p) {
    if (!canAct(s)) return fail('Not now');
    const sh = own(s.co.shop, p) ? s.co.shop[p] : null; if (!sh) return fail('No shop there');
    if (sh.lvl >= CO.shopMaxLvl) return fail('Already the biggest shop');
    if (s.cash < CO.shopUpCost) return fail('Not enough cash');
    s.cash -= CO.shopUpCost; s.co.built += CO.shopUpCost; sh.invest += CO.shopUpCost; sh.lvl++;
    afterChange(s);
    return { ok: true };
  }
  function setShop(s, p, tier, terms) {
    if (!coCan(s)) return fail('Not now');
    const sh = own(s.co.shop, p) ? s.co.shop[p] : null; if (!sh) return fail('No shop there');
    if (tier != null) { if (!own(SHOP_TIERS, tier)) return fail('Unknown price'); sh.tier = tier; }
    if (terms != null) { if (!own(SHOP_TERMS, terms)) return fail('Unknown terms'); sh.terms = terms; }
    return { ok: true };
  }
  function shopRecv(sh) { return sh.recv.reduce((t, r) => t + r[1], 0); }
  function shopDemand(s, p, sh, g) {
    const tier = SHOP_TIERS[sh.matchUntil >= s.day ? 'value' : sh.tier];
    return SHOP_DEMAND[g] * sh.lvl * sh.rep * tier.demand * SHOP_TERMS[sh.terms].demand * (PORT_SIZE[p] || 1) * (sh.warUntil >= s.day && sh.matchUntil < s.day ? 0.5 : 1);
  }
  /* ---- Managers ---- */
  function hireManager(s, style) {
    if (!canAct(s)) return fail('Not now');
    const st = needStage(s, STAGE.manager); if (st) return st;
    if (!hereWh(s, s.port)) return fail('Open a warehouse here first');
    if (own(s.co.mgr, s.port)) return fail('This port already has a manager');
    if (!own(MGR_STYLES, style)) return fail('Choose a style');
    if (s.cash < CO.mgrFee) return fail('Not enough cash');
    s.cash -= CO.mgrFee; s.st.costs += CO.mgrFee;
    s.co.mgr[s.port] = { style, since: s.day, bought: 0, sold: 0, wages: 0, decided: 0 };
    coLog(s, MGR_STYLES[style].name + ' manager hired in ' + PORTS[s.port].name + '.', 'good');
    afterChange(s);
    return { ok: true };
  }
  function setManager(s, p, style) {
    if (!coCan(s)) return fail('Not now');
    const m = own(s.co.mgr, p) ? s.co.mgr[p] : null; if (!m) return fail('No manager there');
    if (!own(MGR_STYLES, style)) return fail('Choose a style');
    m.style = style; return { ok: true };
  }
  function fireManager(s, p) {
    if (!coCan(s)) return fail('Not now');
    if (!own(s.co.mgr, p)) return fail('No manager there');
    delete s.co.mgr[p]; coLog(s, 'Manager in ' + PORTS[p].name + ' let go.', 'co'); return { ok: true };
  }
  function managerTick(s, p) {
    const co = s.co, m = co.mgr[p], w = co.wh[p], M = MGR_STYLES[m.style];
    if (!w || strikeAt(s, p)) return;
    const f = own(co.fac, p) ? co.fac[p] : null;
    const inputs = f ? RECIPES[f.recipe].input : {};
    // Keep about four days of factory inputs in stock.
    Object.keys(inputs).forEach(g => {
      if (s.goods.indexOf(g) < 0) return;
      const target = 4 * f.lvl * RECIPES[f.recipe].batches * inputs[g];
      const have = (w.stock[g] || {}).q || 0;
      let q = Math.min(Math.ceil(target - have), whFree(w));
      if (q <= 0 || vsAvg(s, p, g) > M.buy) return;
      while (q > 0 && quoteBuyAt(s, p, g, q).total > spendable(s)) q = Math.floor(q * 0.7);
      if (q <= 0) return;
      const qt = coTrade(s, p, g, q, 'buy');
      s.cash -= qt.total; stockAdd(w, g, q, qt.total / q, false); m.bought += qt.total; w.pl.bought += qt.total; co.rep.bought += qt.total; s.st.trades++;
    });
    // Sell what nothing else here is waiting for.
    Object.keys(w.stock).forEach(g => {
      if (inputs[g] || GOODS[g].perish) return;
      if (co.routes.some(r => r.from === p && r.g === g && !r.paused)) return;
      if (co.deals.some(d => d.port === p && d.g === g)) return;
      if (own(co.shop, p) && SHOP_DEMAND[g]) return;
      if (w.orders.some(o => o.g === g)) return;
      if (vsAvg(s, p, g) < M.sell) return;
      const c = w.stock[g], q = Math.min(Math.floor(c.q), Math.max(10, Math.floor(c.q * 0.4)));
      if (q <= 0) return;
      const basis = c.cost * q, qt = coTrade(s, p, g, q, 'sell');
      stockTake(w, g, q); s.cash += qt.total; m.sold += qt.total; s.st.trades++;
      addSold(s, p, g, q); plSale(co, w.pl, qt.total, basis);
    });
  }
  function mgrDecide(s, a) {
    const m = a.p && own(s.co.mgr, a.p) ? s.co.mgr[a.p] : null;
    if (!m || !alertOpen(s, a)) return;
    const paid = a.choices[0], free = a.choices[1];
    let pick = free.id;
    if (m.style === 'aggressive') pick = paid.id;
    else if (m.style === 'balanced' && (!paid.cost || paid.cost <= Math.max(20000, netWorth(s) * 0.02))) pick = paid.id;
    if (paid.cost && s.cash < paid.cost) pick = free.id;
    const r = coChoose(s, a.id, pick);
    if (r.ok) { a.byMgr = true; m.decided++; repNote(s, 'Your ' + PORTS[a.p].name + ' manager chose: ' + a.choices.find(c => c.id === pick).label + '.'); }
  }
  /* ---- Ocean lanes ---- */
  function openOcean(s) {
    if (s.mode === 'daily' || !s.co || coStage(s) < STAGE.ocean || s.ports.indexOf(OCEAN_PORTS[0]) >= 0) return;
    OCEAN_PORTS.forEach(p => {
      s.ports.push(p);
      s.mk[p] = {};
      s.goods.forEach(g => { s.mk[p][g] = { L: 0, I: 0 }; });
      snapshot(s, p);
    });
    addNews(s, { kind: 'monsoon', text: 'Ocean lanes open: Colombo, Mumbai, Dubai and Tokyo are on your chart. Long voyages, wide price gaps.' });
    log(s, 'Ocean lanes open. Your ships and freight can now reach Colombo, Mumbai, Dubai and Tokyo.', 'good');
  }
  /* ---- Routes ---- */
  function addRoute(s, from, to, g, qty, dest) {
    if (!coCan(s)) return fail('Not now');
    const st = needStage(s, STAGE.freight); if (st) return st;
    if (!hereWh(s, from)) return fail('Routes start at one of your warehouses');
    if (from === to || s.ports.indexOf(to) < 0) return fail('Pick another port');
    if (dest !== 'wh' && dest !== 'mkt') return fail('Unknown destination');
    if (dest === 'wh' && !hereWh(s, to)) return fail('You have no warehouse there');
    if (s.goods.indexOf(g) < 0 || GOODS[g].perish) return fail('Not this cargo');
    qty = Math.floor(qty); if (!(qty >= 10 && qty <= 200)) return fail('Choose 10 to 200 t a trip');
    if (s.co.routes.length >= routeMax(s)) return fail('Up to ' + routeMax(s) + ' routes');
    const r = { id: ++s.co.seq, from, to, g, qty, dest, trip: null, trips: 0, paused: false, sold: 0, profit: 0, freight: 0, wait: 0 };
    s.co.routes.push(r);
    return { ok: true, id: r.id };
  }
  function removeRoute(s, id) { if (!coCan(s)) return fail('Not now'); const i = s.co.routes.findIndex(r => r.id === id); if (i < 0) return fail('No such route'); const r = s.co.routes[i]; if (r.trip) return fail('Wait until the cargo arrives'); s.co.routes.splice(i, 1); return { ok: true }; }
  function pauseRoute(s, id) { if (!coCan(s)) return fail('Not now'); const r = s.co.routes.find(x => x.id === id); if (!r) return fail('No such route'); r.paused = !r.paused; return { ok: true, paused: r.paused }; }
  function setReserve(s, amt) { if (!coCan(s)) return fail('Not now'); amt = Math.floor(amt); if (!(amt >= 0 && amt <= 5e6)) return fail('Choose RM 0 to 5M'); s.co.reserve = amt; return { ok: true }; }
  function coTrade(s, p, g, q, side) {
    const qt = side === 'buy' ? quoteBuyAt(s, p, g, q) : quoteSellAt(s, p, g, q);
    s.mk[p][g].I += (side === 'buy' ? 1 : -1) * ELASTIC * q / depthT(p, g);
    return qt;
  }
  function vsAvg(s, p, g) { return baseMid(s, p, g) / (GOODS[g].base * Math.exp(s.G[g])) - 1; }
  /* ---- The daily company tick ---- */
  function companyTick(s) {
    const co = s.co; if (!co) return;
    coFill(co);
    const rep = co.rep, R = coRng(s);
    // 0. big orders and company alerts
    dealsTick(s);
    alertsTick(s);
    const ports = Object.keys(co.wh);
    if (!ports.length && !co.routes.length) return;
    // 1. upkeep and wages
    let up = 0;
    ports.forEach(p => { const w = co.wh[p], c = w.lvl * CO.whUpkeep; up += c; w.pl.upkeep += c; });
    Object.keys(co.fac).forEach(p => { const f = co.fac[p], c = f.lvl * CO.facUpkeep; up += c; f.upkeep += c; });
    Object.keys(co.est).forEach(p => { const e = co.est[p], c = e.lvl * CO.estUpkeep; up += c; e.upkeep += c; });
    Object.keys(co.shop).forEach(p => { const sh = co.shop[p], c = sh.lvl * CO.shopUpkeep; up += c; sh.upkeep += c; });
    Object.keys(co.mgr).forEach(p => { const m = co.mgr[p], c = MGR_STYLES[m.style].wage; up += c; m.wages += c; });
    s.cash -= up; s.st.costs += up; co.upkeep += up; rep.upkeep += up;
    // 2. estates harvest into their warehouse
    Object.keys(co.est).forEach(p => {
      const e = co.est[p], w = co.wh[p];
      if (!w) return;
      const hc = Math.round(GOODS[e.g].base * CO.harvestCost);
      let n = Math.min(estateYield(s, e), Math.floor(whFree(w)), Math.floor(spendable(s) / Math.max(1, hc)));
      if (n <= 0) { e.note = whFree(w) < 1 ? 'Warehouse full: crop left in the field' : 'Cash below your reserve'; return; }
      s.cash -= hc * n; s.st.costs += hc * n;
      stockAdd(w, e.g, n, hc + e.lvl * CO.estUpkeep / n, true);
      e.made += n; co.harvested += n; rep.made += n; rep.fees += hc * n;
      e.added += Math.round(n * (baseMid(s, p, e.g) * (1 - spreadOf(s) / 2) - hc));
      e.note = 'Harvested ' + n + ' t today' + (e.blightUntil >= s.day ? ' (blight)' : '');
    });
    // 3. factories
    Object.keys(co.fac).forEach(p => {
      const f = co.fac[p], w = co.wh[p], Rc = RECIPES[f.recipe];
      if (!w) return;
      if (f.downUntil >= s.day) { f.note = 'Broken down until day ' + (f.downUntil + 1); return; }
      const ot = f.otUntil >= s.day;
      let n = f.lvl * Rc.batches * (ot ? 2 : 1);
      Object.keys(Rc.input).forEach(g => { n = Math.min(n, Math.floor(((w.stock[g] || {}).q || 0) / Rc.input[g])); });
      const grow = Rc.out - Object.keys(Rc.input).reduce((t, g) => t + Rc.input[g], 0);
      if (grow > 0) n = Math.min(n, Math.floor(whFree(w) / grow));
      const fee = Math.round(GOODS[f.recipe].base * Rc.out * CO.batchFee * (ot ? 1.5 : 1));
      n = Math.min(n, Math.floor(spendable(s) / Math.max(1, fee)));
      if (n <= 0) { f.note = Object.keys(Rc.input).some(g => ((w.stock[g] || {}).q || 0) < Rc.input[g]) ? 'Waiting for inputs' : 'Cash below your reserve'; return; }
      let cost = fee * n;
      Object.keys(Rc.input).forEach(g => { cost += w.stock[g].cost * Rc.input[g] * n; stockTake(w, g, Rc.input[g] * n); });
      s.cash -= fee * n; s.st.costs += fee * n;
      const out = Rc.out * n;
      stockAdd(w, f.recipe, out, cost / out, true);
      f.added += Math.round(out * baseMid(s, p, f.recipe) * (1 - spreadOf(s) / 2) - cost);
      f.made += out; co.made += out; rep.made += out; rep.fees += fee * n;
      f.note = 'Made ' + out + ' t today' + (ot ? ' (overtime)' : '');
    });
    // 4. branch managers
    Object.keys(co.mgr).forEach(p => managerTick(s, p));
    // 5. standing buy and sell orders
    ports.forEach(p => {
      const w = co.wh[p];
      if (strikeAt(s, p)) return;
      w.orders.forEach(o => {
        if (s.goods.indexOf(o.g) < 0) return;
        const v = vsAvg(s, p, o.g);
        if (o.kind === 'buy') {
          if (o.mode === 'cheap' && v > -0.1) return;
          let q = Math.min(o.qty, Math.floor(whFree(w)));
          if (q <= 0) return;
          while (q > 0 && quoteBuyAt(s, p, o.g, q).total > spendable(s)) q = Math.floor(q * 0.7);
          if (q <= 0) return;
          const qt = coTrade(s, p, o.g, q, 'buy');
          s.cash -= qt.total; stockAdd(w, o.g, q, qt.total / q, false); o.done += q; co.autoBought += qt.total; s.st.trades++;
          w.pl.bought += qt.total; rep.bought += qt.total;
        } else {
          if (o.mode === 'dear' && v < 0.1) return;
          const have = Math.floor((w.stock[o.g] || {}).q || 0);
          const q = Math.min(o.qty, have);
          if (q <= 0) return;
          const basis = w.stock[o.g].cost * q;
          const qt = coTrade(s, p, o.g, q, 'sell');
          stockTake(w, o.g, q); s.cash += qt.total; o.done += q; co.autoSold += qt.total; s.st.trades++;
          s.st.maxSale = Math.max(s.st.maxSale, qt.total); s.st.bestTrade = Math.max(s.st.bestTrade, qt.total - basis);
          if (qt.total > basis) s.st.profitSales++;
          addSold(s, p, o.g, q);
          plSale(co, w.pl, qt.total, basis);
        }
      });
    });
    // 6. shops sell your own goods to their customers; credit sales are collected later
    Object.keys(co.shop).forEach(p => {
      const sh = co.shop[p], w = co.wh[p];
      if (!w) return;
      for (const r of sh.recv.slice()) {
        if (r[0] > s.day) continue;
        sh.recv.splice(sh.recv.indexOf(r), 1);
        let amt = r[1];
        if (rnd(R) < 0.06) { const lost = Math.round(amt * (0.3 + 0.7 * rnd(R))); amt -= lost; sh.bad += lost; sh.profit -= lost; repNote(s, 'A customer of your ' + PORTS[p].name + ' shop defaulted: ' + rm(lost) + ' lost.'); }
        s.cash += amt; sh.collected += amt;
      }
      if (strikeAt(s, p)) { sh.note = 'Strike: nothing reaches the shop'; return; }
      const tier = SHOP_TIERS[sh.matchUntil >= s.day ? 'value' : sh.tier];
      let wanted = 0, served = 0, take = 0;
      Object.keys(SHOP_DEMAND).forEach(g => {
        if (s.goods.indexOf(g) < 0) return;
        const mine = mineQty(w, g), dem = Math.round(shopDemand(s, p, sh, g));
        if (mine > 0 && sh.carry.indexOf(g) < 0) sh.carry.push(g);
        if (sh.carry.indexOf(g) < 0 || dem <= 0) return;
        wanted += dem;
        const q = Math.min(dem, mine);
        if (q <= 0) return;
        served += q;
        const unit = baseMid(s, p, g) * (1 - spreadOf(s) / 2) * tier.price, basis = w.stock[g].cost * q, amt = Math.round(unit * q);
        stockTake(w, g, q, true);
        sh.sold += amt; sh.profit += amt - basis; rep.sold += amt; rep.profit += amt - basis; take += amt;
        if (sh.terms === 'credit') {
          const due = s.day + CO.creditDays, last = sh.recv[sh.recv.length - 1];
          if (last && last[0] === due) last[1] += amt; else sh.recv.push([due, amt]);
        } else s.cash += amt;
      });
      if (wanted > 0) sh.rep = clamp(sh.rep + (served >= wanted * 0.8 ? 0.015 : -0.03), 0.5, 1.5);
      sh.note = wanted ? 'Sold ' + served + ' of ' + wanted + ' t wanted today' : 'Waiting for goods: stock your own products here';
    });
    // 7. freight routes: arrivals, then departures
    co.routes.forEach(r => {
      if (r.trip && s.day >= r.trip.arrive) {
        if (strikeAt(s, r.to)) { r.trip.arrive = s.day + 1; }
        else {
          const t = r.trip; r.trip = null; r.trips++; co.trips++;
          let q = t.q;
          if (rnd(R) < 0.04) { const lost = Math.round(q * rRange(R, 0.2, 0.4)); q -= lost; const pay = Math.round(lost * t.unit * 0.8); s.cash += pay; s.st.claims += pay; r.profit += pay - lost * t.unit; const msg = 'Freight to ' + PORTS[r.to].name + ' hit bad weather: ' + lost + ' t lost, insurer paid ' + rm(pay) + '.'; coLog(s, msg, 'bad'); repNote(s, msg); }
          // Big orders at the destination take the cargo first.
          co.deals.filter(d => d.port === r.to && d.g === r.g).forEach(d => { if (q > 0) q -= dealDeliver(s, d, Math.min(q, d.qty - d.got), t.unit, r); });
          if (r.dest === 'wh' && hereWh(s, r.to) && q > 0) {
            const w = co.wh[r.to], room = Math.min(q, Math.floor(whFree(w)));
            stockAdd(w, r.g, room, t.unit, true); q -= room;
          }
          if (q > 0) {
            const qt = coTrade(s, r.to, r.g, q, 'sell');
            s.cash += qt.total; co.autoSold += qt.total; s.st.trades++; s.st.maxSale = Math.max(s.st.maxSale, qt.total);
            s.st.bestTrade = Math.max(s.st.bestTrade, qt.total - t.unit * q); addSold(s, r.to, r.g, q);
            r.sold += qt.total; r.profit += qt.total - t.unit * q; rep.sold += qt.total; rep.profit += qt.total - t.unit * q;
            coLog(s, 'Freight sold ' + q + ' t ' + GOODS[r.g].name.toLowerCase() + ' in ' + PORTS[r.to].name + ' for ' + rm(qt.total) + '.', 'good');
          } else coLog(s, 'Freight delivered ' + t.q + ' t ' + GOODS[r.g].name.toLowerCase() + ' to ' + PORTS[r.to].name + '.', 'co');
        }
      }
      if (!r.trip && !r.paused && !strikeAt(s, r.from)) {
        const w = co.wh[r.from]; if (!w) return;
        const have = Math.floor((w.stock[r.g] || {}).q || 0);
        const q = Math.min(r.qty, have);
        if (q <= 0) { r.wait = 0; return; }
        // Small loads wait up to three days for more stock, then go anyway.
        if (q < Math.min(10, r.qty) && q * w.stock[r.g].cost < 150000 && r.wait < 3) { r.wait++; return; }
        const rq = routeQuote(s, r.from, r.to, q);
        if (spendable(s) < rq.cost) return;
        const unit = w.stock[r.g].cost;
        stockTake(w, r.g, q); s.cash -= rq.cost; s.st.costs += rq.cost; r.wait = 0;
        r.freight += rq.cost; rep.freight += rq.cost; rep.shipped += q;
        r.trip = { q, unit: unit + rq.cost / q, depart: s.day, arrive: s.day + rq.days };
      }
    });
    // 8. contracts and big orders delivered from a warehouse at the destination, from your own goods only
    for (const k of s.contracts.slice()) {
      const w = hereWh(s, k.dest);
      if (!w || mineQty(w, k.good) < k.qty || s.day > k.deadline || strikeAt(s, k.dest)) continue;
      const pay = k.qty * k.pay, basis = w.stock[k.good].cost * k.qty;
      stockTake(w, k.good, k.qty, true); addSold(s, k.dest, k.good, k.qty);
      s.cash += pay; s.st.contracts++; s.st.contractPay += pay;
      s.contracts.splice(s.contracts.indexOf(k), 1);
      plSale(co, w.pl, pay, basis); rep.delivered += k.qty;
      const msg = 'Warehouse ' + PORTS[k.dest].name + ' delivered the contract: ' + k.qty + ' t ' + GOODS[k.good].name.toLowerCase() + ' for ' + rm(pay) + '.';
      coLog(s, msg, 'good'); repNote(s, msg);
    }
    for (const d of co.deals.slice()) {
      const w = hereWh(s, d.port);
      if (!w || strikeAt(s, d.port)) continue;
      const q = Math.min(mineQty(w, d.g), d.qty - d.got);
      if (q <= 0) continue;
      const unit = w.stock[d.g].cost;
      stockTake(w, d.g, q, true);
      dealDeliver(s, d, q, unit, w.pl);
    }
    // 9. your warehouses report live prices
    ports.forEach(p => snapshot(s, p));
    if (s.cash < 0 && up > 0 && !co.toldNeg) { co.toldNeg = 1; const msg = 'Cash is below zero: company running costs are piling up an overdraft. Sell stock or pause buying.'; coLog(s, msg, 'bad'); repNote(s, msg); }
    if (s.cash >= 0) co.toldNeg = 0;
  }
  /* ---- Profit, reports ---- */
  function newRep(day) { return { from: day, bought: 0, sold: 0, profit: 0, made: 0, shipped: 0, delivered: 0, upkeep: 0, fees: 0, freight: 0, notes: [] }; }
  function repNote(s, text) { const r = s.co.rep; if (r.notes[r.notes.length - 1] === text) return; r.notes.push(text); if (r.notes.length > 8) r.notes.shift(); }
  function plSale(co, pl, rev, basis) { if (pl) { pl.sold += rev; pl.profit += rev - basis; } co.rep.sold += rev; co.rep.profit += rev - basis; }
  function repActive(r) { return !!(r && (r.bought || r.sold || r.made || r.shipped || r.delivered || r.notes.length)); }
  // Fill fields added after a company was first saved (older saves, new buildings).
  function coFill(co) {
    if (!co.rep) co.rep = newRep(1);
    if (!Array.isArray(co.deals)) co.deals = [];
    if (co.dealOffer === undefined) co.dealOffer = null;
    if (!Array.isArray(co.alerts)) co.alerts = [];
    ['est', 'shop', 'mgr', 'here'].forEach(k => { if (!saveRecord(co[k])) co[k] = {}; });
    ['nextDeal', 'dealsDone', 'nextAlert', 'harvested', 'waited', 'dealShip'].forEach(k => { if (co[k] == null) co[k] = 0; });
    Object.values(co.wh).forEach(w => {
      if (!w.pl) w.pl = { bought: 0, sold: 0, profit: 0, upkeep: 0 };
      Object.values(w.stock || {}).forEach(c => { if (c.ok == null) c.ok = c.q; });
    });
    Object.values(co.fac).forEach(f => { ['added', 'upkeep', 'downUntil', 'otUntil'].forEach(k => { if (f[k] == null) f[k] = 0; }); });
    co.routes.forEach(r => { ['sold', 'profit', 'freight', 'wait'].forEach(k => { if (r[k] == null) r[k] = 0; }); });
    co.deals.concat(co.dealOffer ? [co.dealOffer] : []).forEach(d => { if (d.deposit == null) d.deposit = 0; });
    return co;
  }
  // The company report since you last docked: handed to the arrival card, then started again.
  function takeCoReport(s) {
    const co = s.co; if (!co) return null;
    coFill(co);
    const r = co.rep; co.rep = newRep(s.day);
    r.to = s.day; r.decide = co.alerts.filter(a => alertOpen(s, a)).length;
    return repActive(r) || r.decide ? r : null;
  }
  /* ---- Big company orders ---- */
  const DEAL_QTY = { food: [250, 450], tyres: [150, 300], coffeemix: [60, 120], machinery: [10, 25] };
  function makeDeal(s) {
    const L = coRng(s), co = s.co;
    const pool = Object.keys(RECIPES).filter(g => s.goods.indexOf(g) >= 0);
    const mine = Object.values(co.fac).map(f => f.recipe).filter(g => pool.indexOf(g) >= 0);
    const r1 = rnd(L), r2 = rnd(L), r3 = rnd(L), r4 = rnd(L), r5 = rnd(L), r6 = rnd(L);
    const g = mine.length && r1 < 0.7 ? mine[Math.floor(r2 * mine.length)] : pool[Math.floor(r2 * pool.length)];
    const best = s.ports.slice().sort((a, b) => PF[b][g] - PF[a][g] || (a < b ? -1 : 1)).slice(0, 4);
    const port = best[Math.floor(r3 * best.length)];
    const [lo, hi] = DEAL_QTY[g], step = hi >= 100 ? 10 : 5;
    const qty = Math.round((lo + r4 * (hi - lo)) / step) * step;
    const cap = RECIPES[g].batches * RECIPES[g].out;
    const need = Math.ceil(qty / cap);
    const deadline = Math.min(s.mode === 'endless' ? Infinity : s.maxDays - 1, s.day + need + 10 + Math.floor(r5 * 7));
    if (deadline - s.day < need + 6) return null;
    const unit = Math.round(GOODS[g].base * PF[port][g] * (1.06 + r6 * 0.1));
    const bonus = niceGoal(qty * unit * 0.15);
    return { id: ++co.seq, g, qty, got: 0, port, deadline, unit, bonus, paid: 0, expires: s.day + 5, deposit: Math.round(qty * unit * 0.05) };
  }
  function dealsTick(s) {
    const co = s.co;
    for (const d of co.deals.slice()) {
      if (s.day > d.deadline) {
        co.deals.splice(co.deals.indexOf(d), 1);
        const back = d.got * 2 >= d.qty;
        if (back) s.cash += d.deposit;
        const msg = 'Big order for ' + GOODS[d.g].name.toLowerCase() + ' in ' + PORTS[d.port].name + ' expired: ' + fmtN(d.got) + ' of ' + fmtN(d.qty) + ' t delivered, no bonus' + (back ? ', deposit returned.' : ', deposit kept by the buyer.');
        coLog(s, msg, 'bad'); repNote(s, msg);
      }
    }
    if (co.dealOffer && s.day > co.dealOffer.expires) co.dealOffer = null;
    if (coStage(s) >= STAGE.factory && Object.keys(co.fac).length && !co.dealOffer && co.deals.length < 2 && s.day >= co.nextDeal) {
      co.nextDeal = s.day + rInt(coRng(s), 8, 12);
      co.dealOffer = makeDeal(s);
      if (co.dealOffer) { const d = co.dealOffer; addNews(s, { kind: 'deal', text: 'Big order offered: ' + fmtN(d.qty) + ' t ' + GOODS[d.g].name.toLowerCase() + ' to ' + PORTS[d.port].name + ' by day ' + d.deadline + '. See the Company tab.', port: d.port, good: d.g }); repNote(s, 'A big order is on offer in the Company tab.'); }
    }
  }
  function acceptDeal(s) {
    if (!coCan(s)) return fail('Not now');
    const co = s.co, d = co.dealOffer;
    if (!d) return fail('No order on offer');
    if (co.deals.length >= 2) return fail('You can run two big orders at a time');
    if (s.cash < d.deposit) return fail('Not enough cash for the deposit');
    s.cash -= d.deposit;
    co.dealOffer = null; co.deals.push(d);
    coLog(s, 'Big order accepted: ' + d.qty + ' t ' + GOODS[d.g].name.toLowerCase() + ' to ' + PORTS[d.port].name + ' by day ' + d.deadline + '. Deposit ' + rm(d.deposit) + '.', 'co');
    return { ok: true };
  }
  function declineDeal(s) { if (!coCan(s) || !s.co.dealOffer) return fail('No order on offer'); s.co.dealOffer = null; return { ok: true }; }
  // Deliver q t to a big order; unitCost is the cost basis per tonne, pl the business that delivered (or null for your ship).
  function dealDeliver(s, d, q, unitCost, pl) {
    const co = s.co;
    q = Math.min(Math.floor(q), d.qty - d.got); if (q <= 0) return 0;
    const pay = Math.round(q * d.unit);
    d.got += q; d.paid += pay; s.cash += pay; s.st.trades++;
    s.st.maxSale = Math.max(s.st.maxSale, pay);
    plSale(co, pl, pay, unitCost * q); co.rep.delivered += q;
    if (d.got >= d.qty) {
      s.cash += d.bonus + d.deposit; co.dealsDone++; plSale(co, pl, d.bonus, 0);
      if (!pl) co.dealShip++;
      co.deals.splice(co.deals.indexOf(d), 1);
      const msg = 'Big order complete: ' + fmtN(d.qty) + ' t ' + GOODS[d.g].name.toLowerCase() + ' delivered to ' + PORTS[d.port].name + '. Bonus ' + rm(d.bonus) + ' and your deposit back.';
      coLog(s, msg, 'good'); repNote(s, msg);
    }
    return q;
  }
  /* ---- Company alerts: strikes, breakdowns, booms, blight, price wars ---- */
  function strikeAt(s, p) { return !!s.co && s.co.alerts.some(a => a.kind === 'strike' && a.p === p && a.choice !== 'settle' && s.day >= a.day && s.day <= a.end); }
  function alertOpen(s, a) { return a.choice === null && a.choices.length > 0 && s.day <= a.end; }
  function stockValue(w) { let v = 0; for (const g in w.stock) v += w.stock[g].q * w.stock[g].cost; return v; }
  function newAlert(s, kind) { return { id: ++s.co.seq, kind, p: null, g: null, day: s.day, end: s.day, cost: 0, text: '', choices: [], choice: null, byMgr: false }; }
  function pushAlert(s, a) {
    const co = s.co;
    co.alerts.push(a); if (co.alerts.length > 12) co.alerts.shift();
    coLog(s, a.text, a.kind === 'boom' ? 'good' : 'bad'); repNote(s, a.text);
    mgrDecide(s, a);
  }
  function breakdownAlert(s, p) {
    const co = s.co, f = co.fac[p], a = newAlert(s, 'breakdown');
    a.p = p; a.end = s.day + 4; f.downUntil = a.end;
    a.cost = niceGoal(CO.facCost * 0.2 * f.lvl + netWorth(s) * 0.003);
    a.text = 'Your ' + RECIPES[f.recipe].name.toLowerCase() + ' in ' + PORTS[p].name + ' has broken down. Spare parts arrive on day ' + (a.end + 1) + '.';
    a.choices = [{ id: 'repair', label: 'Repair now · ' + rm(a.cost), cost: a.cost }, { id: 'wait', label: 'Wait for the parts', cost: 0 }];
    return a;
  }
  function alertsTick(s) {
    const co = s.co, L = coRng(s);
    co.alerts = co.alerts.filter(a => s.day <= a.end + 4);
    const whs = Object.keys(co.wh), facs = Object.keys(co.fac);
    // Overtime wears machines: each overtime day risks a breakdown.
    facs.forEach(p => { const f = co.fac[p]; if (f.otUntil >= s.day && f.downUntil < s.day && rnd(L) < 0.05 && !co.alerts.some(a => a.kind === 'breakdown' && a.p === p && s.day <= a.end)) pushAlert(s, breakdownAlert(s, p)); });
    if (!whs.length || s.day < co.nextAlert || (s.mode !== 'endless' && s.day >= s.maxDays - 2)) return;
    const roll = rnd(L), k1 = rnd(L), k2 = rnd(L), k3 = rnd(L), k4 = rnd(L);
    if (roll > 0.045 || co.alerts.some(a => alertOpen(s, a))) return;
    const ests = Object.keys(co.est), shops = Object.keys(co.shop);
    const kinds = ['strike']; if (facs.length) kinds.push('breakdown', 'boom'); if (ests.length) kinds.push('blight'); if (shops.length) kinds.push('pricewar');
    const kind = kinds[Math.floor(k1 * kinds.length)];
    let a;
    if (kind === 'strike') {
      const p = whs[Math.floor(k2 * whs.length)];
      a = newAlert(s, kind); a.p = p; a.end = s.day + 2 + Math.floor(k3 * 3);
      a.cost = Math.max(10000, niceGoal(12000 + stockValue(co.wh[p]) * 0.03 + netWorth(s) * 0.002));
      a.text = 'Dockers strike at ' + PORTS[p].name + '. Your warehouse there cannot load, unload, buy or sell until day ' + (a.end + 1) + '.';
      a.choices = [{ id: 'settle', label: 'Pay the dockers ' + rm(a.cost), cost: a.cost }, { id: 'wait', label: 'Wait it out', cost: 0 }];
    } else if (kind === 'breakdown') {
      a = breakdownAlert(s, facs[Math.floor(k2 * facs.length)]);
    } else if (kind === 'boom') {
      const g = co.fac[facs[Math.floor(k2 * facs.length)]].recipe;
      const best = s.ports.slice().sort((x, y) => PF[y][g] - PF[x][g] || (x < y ? -1 : 1)).slice(0, 3);
      const p = best[Math.floor(k3 * best.length)];
      a = newAlert(s, kind); a.p = p; a.g = g; a.end = s.day + 5 + Math.floor(k4 * 4);
      const mult = 1.3 + k4 * 0.15;
      const e = { id: ++s.seq, scope: 'local', port: p, good: g, kind: 'shortage', mult, start: s.day, end: a.end, headline: GOODS[g].name + ' sells out in ' + PORTS[p].name + ': buyers pay a premium', rumoured: false, announced: true };
      s.events.push(e);
      addNews(s, { kind: 'shortage', text: e.headline, port: p, good: g, ev: e.id, end: e.end });
      a.text = 'Demand for ' + GOODS[g].name.toLowerCase() + ' booms in ' + PORTS[p].name + ': prices about ' + Math.round((mult - 1) * 100) + '% higher until day ' + a.end + '.';
      a.choices = [{ id: 'overtime', label: 'Run overtime: double output, fees +50%, breakdown risk', cost: 0 }, { id: 'normal', label: 'Business as usual', cost: 0 }];
    } else if (kind === 'blight') {
      const p = ests[Math.floor(k2 * ests.length)], e = co.est[p];
      a = newAlert(s, kind); a.p = p; a.g = e.g; a.end = s.day + 5; e.blightUntil = a.end;
      a.cost = niceGoal(30000 * e.lvl + netWorth(s) * 0.002);
      a.text = (e.g === 'coal' ? 'Flooding in your coal mine' : 'Blight on your ' + ESTATES[e.g].name.toLowerCase()) + ' near ' + PORTS[p].name + ': half the usual harvest until day ' + (a.end + 1) + '.';
      a.choices = [{ id: 'spray', label: (e.g === 'coal' ? 'Pump it out · ' : 'Spray now · ') + rm(a.cost), cost: a.cost }, { id: 'wait', label: 'Let it pass', cost: 0 }];
    } else {
      const p = shops[Math.floor(k2 * shops.length)], sh = co.shop[p];
      a = newAlert(s, kind); a.p = p; a.end = s.day + 5; sh.warUntil = a.end;
      a.text = RIVAL.name + ' opens a cut-price shop next to yours in ' + PORTS[p].name + '. Your customers will drift away until day ' + (a.end + 1) + '.';
      a.choices = [{ id: 'match', label: 'Match his prices (value pricing until then)', cost: 0 }, { id: 'hold', label: 'Hold your prices', cost: 0 }];
    }
    co.nextAlert = s.day + 6 + Math.floor(k4 * 5);
    pushAlert(s, a);
  }
  function coChoose(s, id, cid) {
    if (!coCan(s)) return fail('Not now');
    const co = s.co;
    const a = co.alerts.find(x => x.id === id); if (!a) return fail('That is over');
    if (!alertOpen(s, a)) return fail('Already decided');
    const c = a.choices.find(x => x.id === cid); if (!c) return fail('Unknown choice');
    if (c.cost) { if (s.cash < c.cost) return fail('Not enough cash'); s.cash -= c.cost; s.st.costs += c.cost; }
    a.choice = cid;
    if (!c.cost && a.choices[0].cost && cid === a.choices[1].id) co.waited++;
    if (cid === 'repair' && own(co.fac, a.p)) { co.fac[a.p].downUntil = s.day - 1; co.fac[a.p].note = 'Repaired'; }
    if (cid === 'overtime') Object.values(co.fac).forEach(f => { if (f.recipe === a.g) f.otUntil = a.end; });
    if (cid === 'settle') coLog(s, 'The strike at ' + PORTS[a.p].name + ' is over.', 'good');
    if (cid === 'spray' && own(co.est, a.p)) co.est[a.p].blightUntil = s.day - 1;
    if (cid === 'match' && own(co.shop, a.p)) co.shop[a.p].matchUntil = a.end;
    afterChange(s);
    return { ok: true };
  }
  /* ---- Valuation ---- */
  function coValue(s, atCost) {
    const co = s.co; if (!co) return 0;
    let v = 0;
    Object.keys(co.wh).forEach(p => {
      const w = co.wh[p]; v += w.invest * 0.7;
      for (const g in w.stock) v += w.stock[g].q * (atCost ? w.stock[g].cost : baseMid(s, p, g) * (1 - spreadOf(s) / 2));
    });
    Object.keys(co.fac).forEach(p => { v += co.fac[p].invest * 0.7; });
    Object.keys(co.est || {}).forEach(p => { v += co.est[p].invest * 0.7; });
    Object.keys(co.shop || {}).forEach(p => { const sh = co.shop[p]; v += sh.invest * 0.7 + shopRecv(sh) * 0.9; });
    co.routes.forEach(r => { if (r.trip) v += r.trip.q * r.trip.unit; });
    return v;
  }
  function coDaily(s) {
    const co = s.co; if (!co) return 0;
    let up = 0;
    Object.keys(co.wh).forEach(p => { up += co.wh[p].lvl * CO.whUpkeep; });
    Object.keys(co.fac).forEach(p => { up += co.fac[p].lvl * CO.facUpkeep; });
    Object.keys(co.est || {}).forEach(p => { up += co.est[p].lvl * CO.estUpkeep; });
    Object.keys(co.shop || {}).forEach(p => { up += co.shop[p].lvl * CO.shopUpkeep; });
    Object.keys(co.mgr || {}).forEach(p => { up += MGR_STYLES[co.mgr[p].style].wage; });
    return up;
  }
  function coSummary(s) {
    const co = s.co;
    return {
      stage: coStage(s), next: nextStage(s), daily: coDaily(s), value: coValue(s, false), reserve: co.reserve,
      warehouses: Object.keys(co.wh).map(p => ({ p, lvl: co.wh[p].lvl, used: whUsed(co.wh[p]), cap: whCap(co.wh[p]), stock: co.wh[p].stock, orders: co.wh[p].orders, fac: co.fac[p] || null })),
      routes: co.routes.map(r => Object.assign({}, r, { quote: routeQuote(s, r.from, r.to, r.qty) })),
    };
  }
  // Validate the company block of a save (called from upgradeRun).
  function validateCo(s) {
    const co = s.co;
    const intIn = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    const numIn = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
    saveRequire(saveRecord(co) && saveRecord(co.wh) && saveRecord(co.fac) && Array.isArray(co.routes));
    saveNumbers(co, ['reserve', 'seq', 'made', 'trips', 'autoBought', 'autoSold', 'upkeep', 'built']);
    saveRequire(numIn(co.reserve, 0, 5e6) && co.routes.length <= 6);
    ['est', 'shop', 'mgr', 'here'].forEach(k => saveRequire(co[k] === undefined || saveRecord(co[k])));
    saveRequire(Object.values(co.wh).every(saveRecord) && Object.values(co.fac).every(saveRecord) && co.routes.every(saveRecord));
    ['est', 'shop', 'mgr'].forEach(k => saveRequire(co[k] === undefined || Object.values(co[k]).every(saveRecord)));
    coFill(co);
    saveNumbers(co, ['nextDeal', 'dealsDone', 'nextAlert', 'harvested', 'waited', 'dealShip']);
    ['seenStage', 'toldStage', 'toldNeg', 'minStage'].forEach(k => saveRequire(co[k] === undefined || intIn(co[k], 0, STAGES.length)));
    Object.keys(co.here).forEach(g => saveRequire(s.goods.includes(g) && numIn(co.here[g], 0, 1e6)));
    saveRequire(saveRecord(co.rep) && Array.isArray(co.rep.notes) && co.rep.notes.length <= 8 && co.rep.notes.every(n => typeof n === 'string'));
    saveNumbers(co.rep, ['from', 'bought', 'sold', 'profit', 'made', 'shipped', 'delivered', 'upkeep', 'fees', 'freight']);
    const dealOk = d => {
      saveRequire(saveRecord(d) && saveHas(RECIPES, d.g) && s.goods.includes(d.g) && s.ports.includes(d.port));
      saveNumbers(d, ['id', 'qty', 'got', 'deadline', 'unit', 'bonus', 'paid', 'expires', 'deposit']);
      saveRequire(intIn(d.qty, 1, 1000) && intIn(d.got, 0, d.qty - 1) && numIn(d.unit, 1, 1e6) && numIn(d.bonus, 0, 1e8) && numIn(d.deposit, 0, 1e8) && numIn(d.paid, 0, 1e11));
    };
    saveRequire(Array.isArray(co.deals) && co.deals.length <= 2); co.deals.forEach(dealOk);
    if (co.dealOffer !== null) dealOk(co.dealOffer);
    saveRequire(Array.isArray(co.alerts) && co.alerts.length <= 12);
    co.alerts.forEach(a => {
      saveRequire(saveRecord(a) && saveHas(ALERT_CHOICES, a.kind) && typeof a.text === 'string' && Array.isArray(a.choices) && a.choices.length === 2);
      const allowed = ALERT_CHOICES[a.kind];
      saveRequire(a.choice === null || allowed.includes(a.choice));
      saveRequire(a.p === null || s.ports.includes(a.p)); saveRequire(a.g === null || s.goods.includes(a.g));
      saveRequire(a.byMgr === undefined || typeof a.byMgr === 'boolean');
      saveNumbers(a, ['id', 'day', 'end', 'cost']); saveRequire(numIn(a.cost, 0, 1e9));
      a.choices.forEach((c, i) => { saveRequire(saveRecord(c) && c.id === allowed[i] && typeof c.label === 'string'); saveNumbers(c, ['cost']); saveRequire(numIn(c.cost, 0, 1e9)); });
    });
    Object.keys(co.wh).forEach(p => {
      const w = co.wh[p];
      saveRequire(s.ports.includes(p) && intIn(w.lvl, 1, CO.whMaxLvl) && numIn(w.invest, 0, 1e9) && saveRecord(w.stock) && Array.isArray(w.orders) && w.orders.length <= CO.orderMax);
      Object.keys(w.stock).forEach(g => { saveRequire(s.goods.includes(g)); const c = w.stock[g]; saveNumbers(c, ['q', 'cost', 'ok']); saveRequire(c.q > 0 && numIn(c.cost, 0, 1e7) && numIn(c.ok, 0, c.q)); });
      saveRequire(whUsed(w) <= whCap(w) + 1e-6);
      w.orders.forEach(o => { saveRequire(saveRecord(o) && saveHas(ORDER_MODES, o.kind) && ORDER_MODES[o.kind].includes(o.mode) && s.goods.includes(o.g)); saveNumbers(o, ['id', 'qty', 'done']); saveRequire(intIn(o.qty, 1, 1000)); });
      saveRequire(saveRecord(w.pl)); saveNumbers(w.pl, ['bought', 'sold', 'profit', 'upkeep']);
    });
    Object.keys(co.fac).forEach(p => { const f = co.fac[p]; saveRequire(own(co.wh, p) && saveHas(RECIPES, f.recipe) && intIn(f.lvl, 1, CO.facMaxLvl)); saveNumbers(f, ['made', 'invest', 'added', 'upkeep', 'downUntil', 'otUntil']); });
    Object.keys(co.est).forEach(p => { const e = co.est[p]; saveRequire(own(co.wh, p) && saveHas(ESTATES, e.g) && s.goods.includes(e.g) && intIn(e.lvl, 1, CO.estMaxLvl) && typeof e.note === 'string'); saveNumbers(e, ['made', 'added', 'upkeep', 'invest', 'blightUntil']); });
    Object.keys(co.shop).forEach(p => {
      const sh = co.shop[p];
      saveRequire(own(co.wh, p) && intIn(sh.lvl, 1, CO.shopMaxLvl) && saveHas(SHOP_TIERS, sh.tier) && saveHas(SHOP_TERMS, sh.terms) && numIn(sh.rep, 0.5, 1.5) && typeof sh.note === 'string');
      saveNumbers(sh, ['sold', 'profit', 'upkeep', 'bad', 'collected', 'invest', 'matchUntil', 'warUntil']);
      saveRequire(Array.isArray(sh.recv) && sh.recv.length <= 64 && sh.recv.every(r => Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && numIn(r[1], 0, 1e10)));
      saveRequire(Array.isArray(sh.carry) && sh.carry.every(g => saveHas(SHOP_DEMAND, g)));
    });
    Object.keys(co.mgr).forEach(p => { const m = co.mgr[p]; saveRequire(own(co.wh, p) && saveHas(MGR_STYLES, m.style)); saveNumbers(m, ['since', 'bought', 'sold', 'wages', 'decided']); });
    co.routes.forEach(r => {
      saveRequire(own(co.wh, r.from) && s.ports.includes(r.to) && r.from !== r.to && ['wh', 'mkt'].includes(r.dest) && s.goods.includes(r.g) && typeof r.paused === 'boolean');
      saveNumbers(r, ['id', 'qty', 'trips', 'sold', 'profit', 'freight', 'wait']); saveRequire(intIn(r.qty, 10, 200));
      if (r.trip != null) { saveNumbers(r.trip, ['q', 'unit', 'depart', 'arrive']); saveRequire(numIn(r.trip.q, 1, 200) && numIn(r.trip.unit, 0, 1e7)); }
    });
    if (s.rngC !== undefined) saveRequire(Array.isArray(s.rngC) && s.rngC.length === 4 && s.rngC.every(Number.isInteger));
  }

  /* ================= Endless mode ================= */
  const CHAPTER_TWISTS = ['typhoon', 'boom', 'calm', 'credit', null, null];
  function newEndless(s) {
    return { ch: 1, start: 1, baseLevel: s.level, nw0: 0, voy0: 0, lpOwed: 0, lpPaid: 0, ahead: 0, aheadBest: 0, neg: 0, bankrupt: false, seen: 0, reports: [] };
  }
  function endlessTick(s) {
    const E = s.endless;
    const nw = netWorth(s);
    E.neg = nw < 0 ? E.neg + 1 : 0;
    if (E.neg >= 10 && !E.bankrupt) { E.bankrupt = true; log(s, 'Ten days under water: your creditors close the house.', 'bad'); }
    if (s.day >= s.maxDays) chapterClose(s);
  }
  function chapterClose(s) {
    const E = s.endless, W = s.rngW;
    checkBounties(s, true);
    const nw = netWorth(s), done = s.bounties.filter(b => b.done);
    const beat = nw > s.rival.nw, voy = s.st.voyages - E.voy0;
    let lp = 0;
    if (voy >= 2) {
      lp = Math.min(30, 6 + done.reduce((a, b) => a + b.lp, 0) + (beat ? 8 : 0));
      if (E.ch >= 7) lp = Math.round(lp / 2);
    }
    E.ahead = beat ? E.ahead + 1 : 0; E.aheadBest = Math.max(E.aheadBest, E.ahead);
    E.reports.push({ ch: E.ch, from: E.start, to: s.day, nw0: Math.round(E.nw0), nw: Math.round(nw), rival: Math.round(s.rival.nw), beat, bounties: done.length, lp, voyages: voy, level: s.level, twist: s.twist });
    if (E.reports.length > 8) E.reports.shift();
    E.lpOwed += lp;
    // Next chapter
    E.ch++; E.start = s.day; E.nw0 = nw; E.voy0 = s.st.voyages;
    s.maxDays = s.day + CHAPTER_DAYS;
    const lvl = Math.min(10, E.baseLevel + Math.floor((E.ch - 1) / 2));
    if (lvl > s.level) { s.level = lvl; log(s, 'The seas grow harder: Monsoon level ' + lvl + '.', 'monsoon'); }
    s.twist = CHAPTER_TWISTS[Math.floor(rnd(W) * CHAPTER_TWISTS.length)];
    s.monsoon.shiftDay = E.start + Math.round(CHAPTER_DAYS / 2) + rInt(W, -4, 4);
    s.monsoon.forecast = s.monsoon.shiftDay + rInt(W, -2, 2);
    s.monsoon.shifted = false;
    s.rival.base = s.rival.nw; s.rival.target = Math.max(s.rival.nw * 1.25, endlessRivalTarget(s, E.ch, s.rival.luck));
    genBounties(s);
    addNews(s, { kind: 'monsoon', text: 'Chapter ' + E.ch + ' begins. ' + (s.twist ? TWISTS[s.twist].name + ': ' + TWISTS[s.twist].desc : 'Fair trading weather.') + ' New bounties are posted.' });
    log(s, 'Chapter ' + (E.ch - 1) + ' closed: worth ' + rm(nw) + (beat ? ', ahead of ' : ', behind ') + RIVAL.name + '.', beat ? 'good' : 'info');
  }
  // Pay Legacy banked at chapter closes into the player's Legacy. Called by the UI after each action.
  function collectEndlessLP(s, meta) {
    if (!s || s.mode !== 'endless' || !s.endless || !meta) return 0;
    const E = s.endless, lp = E.lpOwed;
    if (!lp) return 0;
    E.lpOwed = 0; E.lpPaid += lp; meta.lp += lp; meta.lpTotal += lp;
    return lp;
  }

  /* ================= Waiting & ending ================= */
  function waitDay(s) {
    if (!canAct(s)) return fail('Not now');
    if (s.mode !== 'endless' && s.day >= s.maxDays) return fail('The season is over');
    dayTick(s);
    const c = checkCollectors(s);
    if (s.mode !== 'endless' && s.day >= s.maxDays) s.lastDay = true;
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
    const company = Math.round(coValue(s, false));
    const nw = Math.round(s.cash + ship + company - debts);
    if (nw > s.st.peak) s.st.peak = nw;
    s.phase = 'ended'; s.pending = null;
    const rank = rankFor(nw);
    const E = s.mode === 'endless' ? s.endless : null;
    const lenBonus = s.mode === 'normal' ? Math.max(1, Math.sqrt(s.maxDays / 90)) : 1;
    const base = E ? (rewardEligible && E.ch >= 2 ? Math.min(30, Math.round(seasonLP(nw, s.level) * 0.4)) + E.lpOwed : E.lpOwed)
      : rewardEligible ? Math.max(1, Math.round(seasonLP(nw, s.level) * rewardFraction * lenBonus)) : 0;
    if (E) { E.lpPaid += base; E.lpOwed = 0; }
    const rewardNote = E ? (E.ch >= 2 ? 'Retirement pays up to 30 Legacy plus anything banked at the last chapter close.' : 'Close at least one chapter to earn a retirement payout.') : !rewardEligible
      ? 'Complete a voyage to earn season Legacy. Shipwrecks at sea also count.'
      : rewardFraction < 1 ? 'Season Legacy is scaled to the days played. A season with a completed voyage or shipwreck earns at least 1 LP.' : '';
    const f = { nw, cash: Math.round(s.cash), sold: Math.round(sold), ship, company, debts, rank, rankName: RANKS[rank].name, lp: base, lpBase: base, streakBonus: 0, levelUp: false, newAch: [], day: s.day, rewardEligible, rewardFraction, rewardNote };
    checkBounties(s, true);
    f.rivalNW = rivalFinal(s);
    f.beatRival = nw > f.rivalNW;
    f.rivalLP = rewardEligible && f.beatRival && !E ? Math.round(8 * (1 + 0.2 * s.level)) : 0;
    f.bountyLP = rewardEligible && !E ? Math.round((s.bounties || []).filter(b => b.done).reduce((a, b) => a + b.lp, 0) * rewardFraction) : 0;
    f.lp = base + f.rivalLP + f.bountyLP;
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
          d.total = (d.total || 0) + 1;
        }
        d.bestStreak = Math.max(d.bestStreak || 0, d.streak);
        d.plays[s.dateKey] = (d.plays[s.dateKey] || 0) + 1;
        if (!(s.dateKey in d.best) || nw > d.best[s.dateKey]) d.best[s.dateKey] = nw;
        const keys = Object.keys(d.best).sort();
        while (keys.length > 60) { const k = keys.shift(); delete d.best[k]; delete d.plays[k]; }
      }
      if (rewardEligible && s.mode === 'normal' && s.level === meta.levelMax && nw >= levelGoal(s) && meta.levelMax < 10) { meta.levelMax++; f.levelUp = meta.levelMax; }
      f.lp = base + f.streakBonus + f.rivalLP + f.bountyLP;
      meta.lp += f.lp; meta.lpTotal += f.lp;
      if (E) {
        const er = meta.endless;
        er.runs++; er.chapters = Math.max(er.chapters, E.ch - 1); er.bestDay = Math.max(er.bestDay, s.day);
        if (nw > er.best) { er.best = nw; f.endlessBest = true; }
        er.hall.push({ t: Date.now(), nw, day: s.day, ch: E.ch - 1, captain: s.captain });
        er.hall.sort((a, b) => b.nw - a.nw); if (er.hall.length > 5) er.hall.length = 5;
        f.chapters = E.ch - 1; f.bankrupt = !!E.bankrupt;
      }
      meta.history.unshift({ t: Date.now(), mode: s.mode, date: s.dateKey, captain: s.captain, level: s.level, nw, rank, twist: s.twist });
      if (meta.history.length > 40) meta.history.length = 40;
      f.newAch = checkAch(s, meta, rewardEligible);
    }
    return f;
  }

  /* ================= Achievements ================= */
  const ACH = [
    { id: 'first_profit', cat: 'Trade', name: 'Open for Business', desc: 'Make your first profitable sale.', lp: 5, test: s => s && s.st.profitSales >= 1 },
    { id: 'first_season', cat: 'Voyages', name: 'Sea Legs', desc: 'Finish a season.', lp: 5, test: (s, m, end) => !!end },
    { id: 'nw_250k', cat: 'Wealth', name: 'Quarter Million', desc: 'Reach RM 250k net worth.', lp: 5, test: s => s && s.st.peak >= 250000 },
    { id: 'nw_1m', cat: 'Wealth', name: 'Ringgit Millionaire', desc: 'Reach RM 1M net worth.', lp: 10, test: s => s && s.st.peak >= 1e6 },
    { id: 'nw_5m', cat: 'Wealth', name: 'Big Towkay', desc: 'Reach RM 5M net worth.', lp: 15, test: s => s && s.st.peak >= 5e6 },
    { id: 'nw_10m', cat: 'Wealth', name: 'Ten Million Club', desc: 'Reach RM 10M net worth.', lp: 20, test: s => s && s.st.peak >= 1e7 },
    { id: 'nw_25m', cat: 'Wealth', name: 'Legend of the Straits', desc: 'Reach RM 25M net worth.', lp: 30, test: s => s && s.st.peak >= 2.5e7 },
    { id: 'fast_1m', cat: 'Wealth', name: 'Express Lane', desc: 'Reach RM 1M before day 25.', lp: 15, test: s => s && s.st.m1Day > 0 && s.st.m1Day < 25 },
    { id: 'clean_books', cat: 'Mastery', name: 'Clean Books', desc: 'Finish as Merchant or better without ever borrowing.', lp: 15, test: (s, m, end) => end && s && !s.st.borrowed && s.final && s.final.rank >= MERCHANT_RANK },
    { id: 'paid_in_full', cat: 'Trade', name: 'Paid in Full', desc: 'Repay the Ah Long before the due date.', lp: 5, test: s => s && s.st.alongRepaid },
    { id: 'weathered', cat: 'Voyages', name: 'Weathered', desc: 'Ride out 3 storms in one season.', lp: 10, test: s => s && s.st.storms >= 3 },
    { id: 'full_steam', cat: 'Voyages', name: 'Full Steam Ahead', desc: 'Escape from pirates.', lp: 5, test: s => s && s.st.escapes >= 1 },
    { id: 'ear', cat: 'Trade', name: 'Ear to the Ground', desc: 'Sell at a profit into a shortage that was rumoured.', lp: 10, test: s => s && s.st.rumourProfit },
    { id: 'signed', cat: 'Trade', name: 'Signed, Sealed', desc: 'Deliver a contract.', lp: 5, test: s => s && s.st.contracts >= 1 },
    { id: 'reliable', cat: 'Trade', name: 'Reliable Partner', desc: 'Deliver 5 contracts in one season.', lp: 10, test: s => s && s.st.contracts >= 5 },
    { id: 'whale', cat: 'Trade', name: 'Whale', desc: 'Make a single sale worth RM 1M.', lp: 10, test: s => s && s.st.maxSale >= 1e6 },
    { id: 'mover', cat: 'Trade', name: 'Market Mover', desc: 'Move a price 25% in one trade.', lp: 5, test: s => s && s.st.maxMove >= 0.25 },
    { id: 'fleet', cat: 'Voyages', name: 'Fleet Upgrade', desc: 'Buy a Feeder Ship or bigger.', lp: 10, test: s => s && s.st.bigShip },
    { id: 'bulk_baron', cat: 'Voyages', name: 'Bulk Baron', desc: 'Own a Handysize Bulker.', lp: 15, test: s => s && s.ship.cls === 'handy' },
    { id: 'king_fruits', cat: 'Trade', name: 'King of Fruits', desc: 'Sell RM 500k of durian in one season.', lp: 10, test: s => s && s.st.durianSales >= 5e5 },
    { id: 'regular', cat: 'Daily', name: 'Regular', desc: 'Play the Daily Voyage 3 times.', lp: 10, test: (s, m) => (m.daily.total || 0) >= 3 || m.daily.bestStreak >= 3, prog: (s, m) => [m.daily.total || 0, 3] },
    { id: 'habit', cat: 'Daily', name: 'Creature of Habit', desc: 'Play the Daily Voyage 10 times.', lp: 20, test: (s, m) => (m.daily.total || 0) >= 10 || m.daily.bestStreak >= 7, prog: (s, m) => [m.daily.total || 0, 10] },
    { id: 'rough', cat: 'Mastery', name: 'Rough Seas', desc: 'Finish Monsoon Level 3 as Merchant or better.', lp: 15, noEndless: true, test: (s, m, end) => end && s && s.final && s.mode !== 'endless' && s.level >= 3 && s.final.rank >= MERCHANT_RANK },
    { id: 'storm_born', cat: 'Mastery', name: 'Storm Born', desc: 'Finish Monsoon Level 6 as Merchant or better.', lp: 25, noEndless: true, test: (s, m, end) => end && s && s.final && s.mode !== 'endless' && s.level >= 6 && s.final.rank >= MERCHANT_RANK },
    { id: 'master', cat: 'Mastery', name: 'Master of Monsoons', desc: 'Finish Monsoon Level 10 as Merchant or better.', lp: 50, noEndless: true, test: (s, m, end) => end && s && s.final && s.mode !== 'endless' && s.level >= 10 && s.final.rank >= MERCHANT_RANK },
    { id: 'rival_beat', cat: 'Mastery', name: 'Upstart', desc: 'Finish a season worth more than Towkay Lim.', lp: 10, test: (s, m, end) => end && s && s.final && s.final.beatRival },
    { id: 'rival_crush', cat: 'Mastery', name: 'Hostile Takeover', desc: 'Finish worth at least twice as much as Towkay Lim.', lp: 20, test: (s, m, end) => end && s && s.final && s.final.nw >= 2 * s.final.rivalNW },
    { id: 'clean_sweep', cat: 'Mastery', name: 'Clean Sweep', desc: 'Complete all three bounties in one season.', lp: 15, test: s => s && s.bounties && s.bounties.length === 3 && s.bounties.every(b => b.done) },
    { id: 'typhoon', cat: 'Voyages', name: 'Eye of the Storm', desc: 'Push through a typhoon.', lp: 10, test: s => s && s.st.typhoonPush },
    { id: 'full_crew', cat: 'Mastery', name: 'Full Crew', desc: 'Unlock every captain.', lp: 20, test: (s, m) => CAPTAIN_IDS.every(c => !CAPTAINS[c].unlock || m.unlocks[CAPTAINS[c].unlock]) },
    // Company and late game
    { id: 'co_wh', cat: 'Company', name: 'Godown', desc: 'Rent your first warehouse.', lp: 5, test: s => s && s.co && Object.keys(s.co.wh).length >= 1 },
    { id: 'co_fac', cat: 'Company', name: 'Smoke Stack', desc: 'Build a factory.', lp: 5, test: s => s && s.co && Object.keys(s.co.fac).length >= 1 },
    { id: 'co_made', cat: 'Company', name: 'Production Line', desc: 'Make 1,000 t of products in one run.', lp: 10, test: s => s && s.co && s.co.made >= 1000, prog: s => [s && s.co ? s.co.made : 0, 1000] },
    { id: 'co_trips', cat: 'Company', name: 'Standing Route', desc: 'Complete 10 freight trips in one run.', lp: 10, test: s => s && s.co && s.co.trips >= 10, prog: s => [s && s.co ? s.co.trips : 0, 10] },
    { id: 'co_all4', cat: 'Company', name: 'Diversified Industries', desc: 'Own a factory for every product in one run.', lp: 20, test: s => s && s.co && Object.keys(RECIPES).every(g => Object.values(s.co.fac).some(f => f.recipe === g)), prog: s => [s && s.co ? Object.keys(RECIPES).filter(g => Object.values(s.co.fac).some(f => f.recipe === g)).length : 0, 4] },
    { id: 'co_added', cat: 'Company', name: 'Value Added', desc: 'A single factory adds RM 1M of value.', lp: 15, test: s => s && s.co && Object.values(s.co.fac).some(f => f.added >= 1e6) },
    { id: 'co_value', cat: 'Company', name: 'Bricks and Mortar', desc: 'Own a company worth RM 5M.', lp: 15, test: s => s && s.co && coValue(s, false) >= 5e6 },
    { id: 'deal_1', cat: 'Company', name: 'Order Book', desc: 'Complete a big order.', lp: 10, test: s => s && s.co && s.co.dealsDone >= 1 },
    { id: 'deal_5', cat: 'Company', name: 'Preferred Supplier', desc: 'Complete 5 big orders in one run.', lp: 20, test: s => s && s.co && s.co.dealsDone >= 5, prog: s => [s && s.co ? s.co.dealsDone : 0, 5] },
    { id: 'deal_ship', cat: 'Company', name: "Captain's Delivery", desc: 'Finish a big order from your own hold.', lp: 10, test: s => s && s.co && s.co.dealShip >= 1 },
    { id: 'alert_calm', cat: 'Company', name: 'Hold the Line', desc: 'Sit out 3 company troubles without paying, in one run.', lp: 10, test: s => s && s.co && s.co.waited >= 3, prog: s => [s && s.co ? s.co.waited : 0, 3] },
    { id: 'est_1', cat: 'Company', name: 'Landowner', desc: 'Buy an estate or mine.', lp: 10, test: s => s && s.co && Object.keys(s.co.est || {}).length >= 1 },
    { id: 'est_harvest', cat: 'Company', name: 'Harvest Moon', desc: 'Harvest 2,000 t from your estates in one run.', lp: 15, test: s => s && s.co && s.co.harvested >= 2000, prog: s => [s && s.co ? s.co.harvested : 0, 2000] },
    { id: 'shop_1', cat: 'Company', name: 'Open for Customers', desc: 'Open a shop.', lp: 10, test: s => s && s.co && Object.keys(s.co.shop || {}).length >= 1 },
    { id: 'shop_rep', cat: 'Company', name: 'Household Name', desc: 'Raise a shop to 140% reputation.', lp: 15, test: s => s && s.co && Object.values(s.co.shop || {}).some(sh => sh.rep >= 1.4) },
    { id: 'shop_credit', cat: 'Company', name: 'Good Credit', desc: 'Collect RM 1M from customers on credit in one run.', lp: 15, test: s => s && s.co && Object.values(s.co.shop || {}).reduce((t, sh) => t + sh.collected, 0) >= 1e6 },
    { id: 'mgr_1', cat: 'Company', name: 'Delegation', desc: 'Hire a branch manager.', lp: 10, test: s => s && s.co && Object.keys(s.co.mgr || {}).length >= 1 },
    { id: 'ocean_1', cat: 'Voyages', name: 'Beyond the Chart', desc: 'Drop anchor in an ocean port.', lp: 15, test: s => s && OCEAN_PORTS.some(p => s.st.visited[p]) },
    { id: 'ocean_all', cat: 'Voyages', name: 'Four Winds', desc: 'Visit Colombo, Mumbai, Dubai and Tokyo in one run.', lp: 25, test: s => s && OCEAN_PORTS.every(p => s.st.visited[p]), prog: s => [s ? OCEAN_PORTS.filter(p => s.st.visited[p]).length : 0, 4] },
    { id: 'long_towkay', cat: 'Mastery', name: 'Long Haul', desc: 'Finish a 120-day season as Towkay or better.', lp: 15, test: (s, m, end) => end && s && s.final && s.mode === 'normal' && s.maxDays >= 104 && s.final.rank >= 4 },
    { id: 'end_ch2', cat: 'Endless', name: 'Second Monsoon', desc: 'Close two chapters in Endless.', lp: 10, test: s => s && s.endless && s.endless.ch >= 3 },
    { id: 'end_year', cat: 'Endless', name: 'A Year of Monsoons', desc: 'Reach day 360 in Endless.', lp: 20, test: s => s && s.mode === 'endless' && s.day >= 360, prog: s => [s && s.mode === 'endless' ? s.day : 0, 360] },
    { id: 'end_lim', cat: 'Endless', name: "Lim's Last Junk", desc: 'Close 5 Endless chapters in a row ahead of Towkay Lim.', lp: 25, test: s => s && s.endless && s.endless.aheadBest >= 5, prog: s => [s && s.endless ? s.endless.aheadBest : 0, 5] },
    { id: 'taipan', cat: 'Wealth', name: 'Taipan', desc: 'Reach RM 100M net worth.', lp: 30, test: s => s && s.st.peak >= 1e8 },
    { id: 'prince', cat: 'Wealth', name: 'Merchant Prince', desc: 'Reach RM 250M net worth.', lp: 40, test: s => s && s.st.peak >= 2.5e8 },
  ];

  const ACH_CATS = ['Trade', 'Voyages', 'Wealth', 'Company', 'Mastery', 'Endless', 'Daily'];
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

  function serialize(s) { return JSON.stringify(s, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Refusing to save a non-finite number at ' + k); return v; }); }
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
    saveRequire(['normal', 'daily', 'endless'].includes(s.mode) && ['port', 'sea', 'sunk', 'ended'].includes(s.phase));
    saveRequire(saveHas(CAPTAINS, s.captain) && saveHas(PORTS, s.port));
    saveRequire(s.twist === null || saveHas(TWISTS, s.twist));
    saveRequire(s.mode !== 'daily' || saveDate(s.dateKey));
    saveNumbers(s, ['day', 'maxDays', 'level', 'cash', 'bank', 'along', 'alongDue', 'seq']);
    saveRequire(Number.isInteger(s.day) && s.day >= 1 && Number.isInteger(s.maxDays) && s.level >= 0 && s.level <= 10 && Number.isInteger(s.level));
    if (s.mode === 'endless') {
      const E = s.endless;
      saveRequire(saveRecord(E)); saveNumbers(E, ['ch', 'start', 'baseLevel', 'nw0', 'voy0', 'lpOwed', 'lpPaid', 'ahead', 'aheadBest', 'neg', 'seen']);
      saveRequire(Number.isInteger(E.ch) && E.ch >= 1 && E.ch <= 100000 && s.maxDays === E.start + CHAPTER_DAYS - (E.ch === 1 ? 1 : 0) && s.day <= s.maxDays);
      saveRequire(E.lpOwed >= 0 && E.lpOwed <= 1000 && typeof E.bankrupt === 'boolean' && Array.isArray(E.reports) && E.reports.length <= 8);
      E.reports.forEach(r => { saveNumbers(r, ['ch', 'from', 'to', 'nw0', 'nw', 'rival', 'bounties', 'lp', 'voyages', 'level']); saveRequire(typeof r.beat === 'boolean' && (r.twist === null || saveHas(TWISTS, r.twist))); });
      saveRequire(saveRecord(s.rival) && Number.isFinite(s.rival.base) && Number.isFinite(s.rival.luck));
    } else saveRequire(VALID_DAYS.includes(s.maxDays) && s.day <= s.maxDays + 8 && s.endless === undefined);
    saveRequire(s.bank >= 0 && s.along >= 0 && Math.abs(s.cash) <= 1e13 && s.bank <= 1e13 && s.along <= 1e13);
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
    upgradeRun(s);
    return s;
  }
  // v2 additions (rival, bounties, voyage stats) are optional in saves: older seasons gain a rival and no bounties.
  function upgradeRun(s) {
    const st = s.st;
    if (!saveRecord(st.visited)) st.visited = {};
    st.visited[s.port] = true;
    if (!saveRecord(st.sold)) st.sold = {};
    Object.keys(st.sold).forEach(p => { saveRequire(saveRecord(st.sold[p])); Object.keys(st.sold[p]).forEach(g => saveRequire(Number.isFinite(st.sold[p][g]))); });
    if (typeof st.alongUsed !== 'boolean') st.alongUsed = false;
    if (!Number.isFinite(st.typhoons)) st.typhoons = 0;
    if (s.rival == null) {
      initRival(s);
      s.rival.walk = 0; s.rival.nw = Math.round(rivalCurve(s, s.day)); s.rival.next = s.day + 1;
      s.rival.hist = [[s.day, s.rival.nw]];
    } else {
      saveRequire(saveRecord(s.rival)); saveNumbers(s.rival, ['nw', 'target', 'next', 'walk']);
      saveRequire(Array.isArray(s.rival.hist) && s.rival.hist.every(h => Array.isArray(h) && h.length === 2 && h.every(Number.isFinite)));
    }
    // Supply-chain layer: products join the markets of older seasons and the company starts empty.
    GOOD_IDS.filter(g => GOODS[g].product && s.goods.indexOf(g) < 0).forEach(g => {
      s.goods.push(g);
      s.G[g] = 0;
      s.ports.forEach(p => { s.mk[p][g] = { L: 0, I: 0 }; });
    });
    if (s.co == null) s.co = newCo();
    validateCo(s);
    if (s.bounties == null) s.bounties = [];
    saveRequire(Array.isArray(s.bounties) && s.bounties.length <= 3);
    s.bounties.forEach(b => saveRequire(saveRecord(b) && saveHas(BOUNTY_LP, b.type) && typeof b.text === 'string' && saveRecord(b.p) && Number.isFinite(b.lp)));
  }
  function deserializeMeta(str) {
    const m = parseSave(str), b = newMeta();
    saveRequire(saveRecord(m) && (m.v === undefined || m.v === 1) && saveRecord(m.stats));
    ['settings', 'stats', 'daily', 'unlocks', 'ach', 'tips', 'endless'].forEach(k => {
      saveRequire(m[k] === undefined || saveRecord(m[k]));
    });
    const out = Object.assign({}, b, m);
    ['settings', 'stats', 'daily', 'endless'].forEach(k => { out[k] = Object.assign({}, b[k], m[k] || {}); });
    saveNumbers(out.endless, ['runs', 'best', 'bestDay', 'chapters']);
    saveRequire(Array.isArray(out.endless.hall) && out.endless.hall.length <= 5);
    out.endless.hall.forEach(h => { saveNumbers(h, ['t', 'nw', 'day', 'ch']); saveRequire(saveHas(CAPTAINS, h.captain)); });
    saveNumbers(out.daily, ['total']);
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
      saveRequire(['normal', 'daily', 'endless'].includes(h.mode) && (h.mode !== 'daily' || saveDate(h.date)));
    });
    return out;
  }

  const MM = {
    VERSION, RIVAL, BOUNTY_LP, ACH_CATS, checkBounties, rivalFinal, PORTS, PORT_IDS, GOODS, GOOD_IDS, PF, SHIPS, SHIP_IDS, UPGRADES, CAPTAINS, CAPTAIN_IDS, UNLOCKS, UNLOCK_BY_ID, LEVELS, RANKS, TWISTS, ACH, NODES, EDGES, REGION_NAMES, MERCHANT_RANK,
    rm, price, tons, clamp,
    newMeta, newRun, route, planVoyage, startVoyage, stepVoyage, resolve, progress, phaseOn,
    quoteBuy, quoteSell, maxBuy, buy, sell, buyPrice, sellPrice, mid, baseMid, spreadOf, activeEvents, depthT,
    cargoUsed, shipCap, freeSpace, hasCold, shelfLife, cargoValue, cargoCostValue, netWorth, netWorthCost, tradeIn,
    dailyCost, bankRate, ALONG_RATE, bankLimit, alongLimit, bankBorrow, bankRepay, alongBorrow, alongRepay,
    reportCost, buyReport, shipOffers, buyShip, buyUpgrade, repairCost, repair, acceptOffer, portFee, shipSpeed, hullEff, runChance,
    waitDay, endSeason, rankFor, seasonLP, checkAch, unlock, dayKeyShift,
    knownSell, bestKnownSell, bestKnownBuy, marketRows, portProfile, newsFeed, upcomingDeadlines, cargoRows,
    serialize, deserialize, deserializeMeta, canAct,
    SEASON_DAYS, CHAPTER_DAYS, collectEndlessLP, OCEAN_PORTS, STAGE, ESTATES, SHOP_DEMAND, SHOP_TIERS, SHOP_TERMS, MGR_STYLES, estateGoods, estateYield, buildEstate, upgradeEstate, openShop, upgradeShop, setShop, shopRecv, shopDemand, hireManager, setManager, fireManager, routeMax, mineQty,
    levelGoal, niceGoal, acceptDeal, declineDeal, coChoose, strikeAt, alertOpen, repActive, takeCoReport, STAGES, CO, RECIPES, ORDER_MODES, coStage, nextStage, whUsed, whCap, whFree, buildWarehouse, upgradeWarehouse, storeCargo, takeCargo, setOrder, removeOrder,
    buildFactory, upgradeFactory, addRoute, removeRoute, pauseRoute, setReserve, routeQuote, freightDays, coValue, coDaily, coSummary, vsAvg, quoteBuyAt, quoteSellAt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MM;
  else root.MM = MM;
})(typeof window !== 'undefined' ? window : globalThis);
