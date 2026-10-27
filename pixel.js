/* Monsoon Merchant — pixel renderers: sprite CSS, the side-on sailing scene and the sea chart. */
(function (root) {
  'use strict';
  const A = root.ART_BASE, PAL = A.PAL, MAP = root.MAP;
  const U32 = {};
  function u32(hex) {
    if (U32[hex] !== undefined) return U32[hex];
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (U32[hex] = (255 << 24) | (b << 16) | (g << 8) | r);
  }
  const C = k => u32(PAL[k] || k);

  /* ================= Sprite cache & CSS ================= */
  const cache = {};
  function cached(key, make) { return cache[key] || (cache[key] = make()); }
  function spriteCanvas(key, make) { return cached('cv:' + key, () => make().canvas(1)); }
  function installCSS() {
    if (document.getElementById('pxcss')) return;
    let css = '';
    Object.keys(A.ICONS).forEach(k => { css += '.ic-' + k + '{background-image:url(' + A.fromRows(A.ICONS[k], true).url() + ')}'; });
    Object.keys(A.GOODS).forEach(k => { css += '.gi-' + k + '{background-image:url(' + A.fromRows(A.GOODS[k], true).url() + ')}'; });
    Object.keys(A.CAST).forEach(k => { css += '.pt-' + k + '{background-image:url(' + A.portrait(k).url() + ');--bg:' + A.CAST[k].bg + '}'; });
    Object.keys(A.SHIP_ART).forEach(k => { const g = A.ship(k); css += '.sh-' + k + '{background-image:url(' + g.url() + ');--w:' + g.w + ';--h:' + g.h + '}'; });
    // dithered page background tile
    const bg = new A.Grid(8, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bg.set(x, y, (x + y * 3) % 8 === 0 ? '#1a2346' : '#141b38');
    css += ':root{--bgtile:url(' + bg.url() + ')}';
    const st = document.createElement('style'); st.id = 'pxcss'; st.textContent = css; document.head.appendChild(st);
  }
  function skylineURL(p, night) { return cached('sky:' + p + night, () => A.skyline(p, night).url()); }

  /* ================= Side-on sailing scene ================= */
  const SW = 160, SH = 96, HORIZON = 54;
  const SKIES = {
    day:   { sky: ['n', 'B', 'b', 'c'], sea: ['b', 'B', 'n', 'N'], hi: 'c', sun: 'Y', cloud: ['W', 'c'], isle: 'T' },
    dusk:  { sky: ['v', 'p', 'O', 'y'], sea: ['p', 'v', 'N', 'k'], hi: 'y', sun: 'Y', cloud: ['P', 'p'], isle: 'v' },
    night: { sky: ['K', 'k', 'N', 'n'], sea: ['n', 'N', 'k', 'K'], hi: 'b', sun: 'W', cloud: ['G', 'N'], isle: 'k' },
    dawn:  { sky: ['N', 'n', 'P', 'S'], sea: ['B', 'n', 'N', 'k'], hi: 'S', sun: 'Y', cloud: ['W', 'P'], isle: 'N' },
    storm: { sky: ['K', 'k', 'G', 'g'], sea: ['G', 'N', 'k', 'K'], hi: 'w', sun: null, cloud: ['g', 'G'], isle: 'k' },
  };
  function cloudSprite(i, cols) {
    return spriteCanvas('cloud' + i + cols.join(''), () => {
      const R = A.prng('cl' + i), g = new A.Grid(28, 10);
      for (let k = 0; k < 4; k++) g.ellipse(6 + k * 5 + R() * 3, 6 - R() * 2, 5 + R() * 2, 3 + R() * 1.5, cols[1]);
      for (let k = 0; k < 3; k++) g.ellipse(8 + k * 5 + R() * 2, 4.5 - R(), 4, 2.2, cols[0]);
      return g;
    });
  }
  function shipSprite(cls) { return spriteCanvas('ship:' + cls, () => A.ship(cls)); }
  function junkSprite(size, a, b, c) { return spriteCanvas('junk:' + size + a + b + c, () => A.junk(size, a, b, c)); }
  function skiffSprite(flip) { return spriteCanvas('skiff' + (flip ? 'f' : ''), () => { const s = A.skiff(); if (!flip) return s; const g = new A.Grid(s.w, s.h); A.stampGrid(g, s, 0, 0, true); return g; }); }
  function contSprite(c) { return spriteCanvas('cont' + c, () => A.container(c)); }
  function flipped(key, cv) { return cached('flip:' + key, () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.translate(cv.width, 0); x.scale(-1, 1); x.drawImage(cv, 0, 0); return c; }); }
  function isleProfile(seed) {
    return cached('isle' + seed, () => { const R = A.prng(seed), h = []; let v = 0; for (let x = 0; x < 320; x++) { v = v * 0.92 + (R() - 0.45) * 1.6; h.push(Math.max(0, Math.round(v))); } return h; });
  }

  function Scene(canvas, opts) {
    this.cv = canvas; canvas.width = SW; canvas.height = SH;
    this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.img = this.ctx.createImageData(SW, SH); this.buf = new Uint32Array(this.img.data.buffer);
    this.o = Object.assign({ ship: 'coaster', mode: 'sail', event: null, tod: null, still: false, port: null, speed: 1 }, opts || {});
    this.t0 = performance.now(); this.raf = 0; this.flash = 0; this.nextBolt = 2000;
  }
  Scene.prototype.set = function (o) { Object.assign(this.o, o); if (this.o.still) this.draw(this.lastT || 0); };
  Scene.prototype.start = function () {
    const loop = t => { this.draw(t - this.t0); this.raf = requestAnimationFrame(loop); };
    if (this.o.still) { this.draw(1200); return this; }
    this.raf = requestAnimationFrame(loop); return this;
  };
  Scene.prototype.stop = function () { cancelAnimationFrame(this.raf); this.raf = 0; };
  Scene.prototype.skyFor = function (t) {
    const o = this.o;
    if (o.event === 'storm' || o.weather === 'storm') return { a: SKIES.storm, b: SKIES.storm, k: 0, tod: 0.5 };
    let tod = o.tod !== null ? o.tod : ((t / 24000) + 0.3) % 1;
    const keys = [['night', 0], ['dawn', 0.22], ['day', 0.32], ['day', 0.68], ['dusk', 0.78], ['night', 0.88], ['night', 1]];
    for (let i = 0; i < keys.length - 1; i++) {
      if (tod >= keys[i][1] && tod <= keys[i + 1][1]) {
        const k = (tod - keys[i][1]) / (keys[i + 1][1] - keys[i][1] || 1);
        return { a: SKIES[keys[i][0]], b: SKIES[keys[i + 1][0]], k, tod };
      }
    }
    return { a: SKIES.day, b: SKIES.day, k: 0, tod };
  };
  Scene.prototype.draw = function (t) {
    this.lastT = t;
    const o = this.o, buf = this.buf, ctx = this.ctx;
    const S = this.skyFor(t);
    const storm = o.event === 'storm' || o.weather === 'storm';
    const pick = (x, y, colsA, colsB, f) => A.bandAt(A.dith(x, y, S.k) ? colsB : colsA, f, x, y);
    // sky
    for (let y = 0; y < HORIZON; y++) for (let x = 0; x < SW; x++) buf[y * SW + x] = C(pick(x, y, S.a.sky, S.b.sky, y / HORIZON));
    // stars at night
    if (S.a === SKIES.night || S.b === SKIES.night) {
      const R = A.prng('stars');
      for (let i = 0; i < 40; i++) { const x = Math.floor(R() * SW), y = Math.floor(R() * (HORIZON - 14)); const tw = Math.sin(t / 400 + i) > 0.6; if (A.dith(x, y, S.a === SKIES.night ? 1 - S.k : S.k)) buf[y * SW + x] = C(tw ? 'W' : 'w'); }
    }
    const moving = o.mode === 'sail' && o.event !== 'engine';
    const sp = moving ? o.speed : 0.15;
    // sea
    for (let y = HORIZON; y < SH; y++) {
      const f = (y - HORIZON) / (SH - HORIZON);
      const depth = y - HORIZON;
      const amp = storm ? 3 : 1.4;
      for (let x = 0; x < SW; x++) {
        let c = pick(x, y, S.a.sea, S.b.sea, f * 0.98);
        const ph = x * (0.18 - f * 0.1) + t / (900 - f * 400) * (1 + sp * 1.2) + depth * 1.7;
        const w = Math.sin(ph) + Math.sin(ph * 0.53 + depth) * 0.6;
        if (w > (storm ? 1.05 : 1.35)) c = A.dith(x, y, S.k) ? S.b.hi : S.a.hi;
        else if (storm && w < -1.2 && depth > 4) c = 'k';
        buf[y * SW + x] = C(c);
      }
      if (depth === 0) for (let x = 0; x < SW; x++) if ((x + Math.floor(t / 300)) % 9 === 0) buf[y * SW + x] = C('W');
      void amp;
    }
    // sun / moon
    const sk = S.k < 0.5 ? S.a : S.b;
    if (sk.sun && !storm) {
      const arc = ((S.tod + 0.75) % 1);
      const day = S.tod > 0.2 && S.tod < 0.86;
      const p = day ? (S.tod - 0.2) / 0.66 : ((S.tod + 0.14) % 1) / 0.34;
      const sx = Math.round(10 + p * (SW - 20)), sy = Math.round(HORIZON - 4 - Math.sin(p * Math.PI) * (HORIZON - 14));
      void arc;
      const col = day ? 'Y' : 'W', r = day ? 5 : 3;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r && sy + y < HORIZON && sy + y >= 0 && sx + x >= 0 && sx + x < SW) buf[(sy + y) * SW + sx + x] = C(x * x + y * y < (r - 2) * (r - 2) ? (day ? 'W' : 'W') : col);
      }
      if (!day) { buf[(sy - 1) * SW + sx + 1] = C('w'); }
      // reflection
      for (let y = HORIZON + 1; y < SH; y += 2) { const off = Math.round(Math.sin(t / 300 + y) * 2); const x = sx + off; if (x > 0 && x < SW - 2) { buf[y * SW + x] = C(day ? 'Y' : 'w'); if ((y & 3) === 1) buf[y * SW + x + 1] = C(day ? 'y' : 'b'); } }
    }
    ctx.putImageData(this.img, 0, 0);
    // distant islands (parallax)
    const isle = isleProfile('isles'), scroll = Math.floor(t / 120 * sp) % 320;
    ctx.fillStyle = PAL[S.k < 0.5 ? S.a.isle : S.b.isle];
    for (let x = 0; x < SW; x++) { const h = isle[(x + scroll) % 320]; if (h > 0) ctx.fillRect(x, HORIZON - h, 1, h); }
    // clouds
    const cl = S.k < 0.5 ? S.a.cloud : S.b.cloud;
    for (let i = 0; i < 4; i++) {
      const spr = cloudSprite(i, cl);
      const span = SW + 40, x = Math.round(((i * 53 - t / (70 - i * 8) * (0.4 + sp)) % span + span) % span) - 30;
      ctx.drawImage(spr, x, 4 + i * 9);
    }
    // events behind the ship
    const ev = o.event, bob = n => Math.round(Math.sin(t / (storm ? 260 : 420) + n) * (storm ? 2 : 1));
    if (o.rival && !ev) { const j = junkSprite(0.5, 'R', 'r', 'D'); const x = Math.round(((SW + 30) - (t / 90) % (SW + 60))); ctx.drawImage(flipped('rj', j), x, HORIZON - j.height + 4 + bob(3)); }
    if (ev === 'arrival' || ev === 'customs') {
      const night = S.tod < 0.2 || S.tod > 0.86; const sky = cached('skyl:' + o.port + night, () => A.skyline(o.port || 'singapore', night, true).canvas(1));
      ctx.drawImage(sky, 0, 0, 120, 35, SW - 124, HORIZON - 34, 120, 35);
    }
    // the player's ship
    const shipC = o.mode === 'title' ? junkSprite(1.4, 'S', 'D', 'd') : shipSprite(o.ship);
    const sx = o.mode === 'title' ? Math.round(SW / 2 - shipC.width / 2) : 30;
    const sy = (o.mode === 'title' ? HORIZON + 30 : HORIZON + 22) - shipC.height + bob(0);
    // wake
    if (moving) for (let i = 0; i < 14; i++) { const wx = sx + 2 - i * 3 - ((t / 60) % 3); const wy = sy + shipC.height - 3 + (i % 2); if (wx > 0) { ctx.fillStyle = i % 3 ? PAL.c : PAL.W; ctx.fillRect(Math.round(wx), wy, 2, 1); } }
    ctx.drawImage(shipC, sx, sy);
    // water line over the hull
    ctx.fillStyle = PAL[(S.k < 0.5 ? S.a : S.b).sea[1]];
    for (let x = sx; x < sx + shipC.width; x++) { const h = 1 + ((x + Math.floor(t / 150)) % 5 === 0 ? 1 : 0); ctx.fillRect(x, sy + shipC.height - h, 1, h); }
    ctx.fillStyle = PAL.W; for (let x = sx + shipC.width - 6; x < sx + shipC.width + 2; x += 2) ctx.fillRect(x, sy + shipC.height - 2 - ((x / 2 + Math.floor(t / 200)) % 2), 1, 1);
    // events in front
    const fx = sx + shipC.width;
    if (ev === 'pirates') { [0, 1].forEach(i => { const s = skiffSprite(true); const x = Math.round(SW - 26 - i * 18 - ((t / 40) % 6)); ctx.drawImage(s, x, HORIZON + 14 + i * 9 + bob(i + 1)); }); }
    if (ev === 'salvage') ['R', 'B', 'y'].forEach((c, i) => ctx.drawImage(contSprite(c), SW - 46 + i * 12, HORIZON + 12 + i * 4 + bob(i)));
    if (ev === 'trader') { const s = flipped('trader', shipSprite('freighter')); ctx.drawImage(s, SW - s.width + 6, HORIZON + 16 - s.height + bob(2)); }
    if (ev === 'engine' || ev === 'smoke') { for (let i = 0; i < 6; i++) { const k = ((t / 700) + i / 6) % 1; ctx.fillStyle = i % 2 ? PAL.G : PAL.k; const r = 1 + Math.round(k * 4); ctx.fillRect(sx + 6 + Math.round(k * 10), sy - Math.round(k * 26), r, r); } }
    if (ev === 'crew') { ['Y', 'W'].forEach((c, i) => { const k = ((t / 900) + i / 2) % 1; ctx.fillStyle = PAL[c]; const x = sx + 12 + i * 10, y = sy - 4 - Math.round(k * 14); ctx.fillRect(x, y, 2, 2); ctx.fillRect(x + 1, y - 4, 1, 4); ctx.fillRect(x + 2, y - 4, 2, 1); }); }
    if (ev === 'current') { ctx.fillStyle = PAL.W; for (let i = 0; i < 9; i++) { const y = HORIZON + 8 + i * 4, x = Math.round(((i * 37 + t / 6) % (SW + 30)) - 20); ctx.fillRect(SW - x, y, 8, 1); } }
    if (ev === 'radio') { ctx.fillStyle = PAL.c; const k = (t / 500) % 1; for (let r = 0; r < 3; r++) { const rr = 3 + r * 4 + Math.round(k * 4); for (let a = -0.9; a <= 0.9; a += 0.12) ctx.fillRect(sx + 14 + Math.round(Math.cos(a - 1.57) * rr), sy + 2 + Math.round(Math.sin(a - 1.57) * rr), 1, 1); } }
    if (ev === 'customs') { const s = shipSprite('coaster'); ctx.drawImage(flipped('cust', s), fx + 12, sy + 4 + bob(1)); }
    // weather
    if (storm) {
      ctx.fillStyle = PAL.c;
      for (let i = 0; i < 70; i++) { const R = (i * 9301 + 49297) % 233280 / 233280; const x = Math.round((R * SW * 1.3 + t / 3) % (SW + 20)) - 10, y = Math.round((R * 997 + t / 2.2 + i * 13) % SH); ctx.fillRect(x - Math.floor(y / 4) % 2, y, 1, 3); }
      if (!o.still) {
        if (t > this.nextBolt) { this.flash = 3; this.boltX = 40 + Math.floor(Math.random() * 100); this.nextBolt = t + 1800 + Math.random() * 3000; }
        if (this.flash > 0) {
          this.flash--;
          ctx.fillStyle = PAL.W; let x = this.boltX;
          for (let y = 0; y < HORIZON; y += 3) { ctx.fillRect(x, y, 1, 3); x += Math.random() < 0.5 ? -1 : 1; }
          if (this.flash === 2) { ctx.globalAlpha = 0.45; ctx.fillRect(0, 0, SW, SH); ctx.globalAlpha = 1; }
        }
      }
    }
  };

  /* ================= Sea chart ================= */
  const MS = 3; // map units per chart pixel
  function landPolys() {
    return cached('landpolys', () => Object.keys(MAP.LAND).map(k => {
      const P = MAP.LAND[k].map(p => MAP.proj(p[0], p[1]));
      const n = P.length, out = [];
      for (let i = 0; i < n; i++) {
        const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
        for (let s = 0; s < 6; s++) {
          const t = s / 6, t2 = t * t, t3 = t2 * t;
          const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          out.push([f(p0[0], p1[0], p2[0], p3[0]) / MS, f(p0[1], p1[1], p2[1], p3[1]) / MS]);
        }
      }
      return out;
    }));
  }
  function chartRaster() {
    return cached('chart', () => {
      const W = Math.ceil(MAP.W / MS), H = Math.ceil(MAP.H / MS);
      const land = new Uint8Array(W * H);
      const tmp = new A.Grid(W, H);
      landPolys().forEach(pl => tmp.poly(pl, '#000000'));
      for (let i = 0; i < W * H; i++) land[i] = tmp.d[i] ? 1 : 0;
      // distance fields (4-neighbour BFS)
      const dist = (target) => {
        const d = new Int16Array(W * H).fill(99), q = [];
        for (let i = 0; i < W * H; i++) if (land[i] === target) { d[i] = 0; q.push(i); }
        for (let h = 0; h < q.length; h++) {
          const i = q[h], x = i % W, y = (i / W) | 0, nd = d[i] + 1;
          if (nd > 30) continue;
          [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([a, b]) => { if (a >= 0 && b >= 0 && a < W && b < H) { const j = b * W + a; if (d[j] > nd) { d[j] = nd; q.push(j); } } });
        }
        return d;
      };
      const toLand = dist(1), toSea = dist(0);
      const R = A.prng('chart');
      const noise = new Float32Array(W * H);
      // value noise
      const grid = (s) => { const gw = Math.ceil(W / s) + 2, gh = Math.ceil(H / s) + 2, v = []; for (let i = 0; i < gw * gh; i++) v.push(R()); return (x, y) => { const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy; const a = v[iy * gw + ix], b = v[iy * gw + ix + 1], c = v[(iy + 1) * gw + ix], d = v[(iy + 1) * gw + ix + 1]; const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }; };
      const n1 = grid(9), n2 = grid(4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) noise[y * W + x] = n1(x, y) * 0.7 + n2(x, y) * 0.3;
      const g = new A.Grid(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!land[i]) {
          const d = toLand[i];
          let c;
          if (d <= 1) c = 'b';
          else if (d <= 3) c = A.dith(x, y, (d - 1) / 3) ? 'B' : 'b';
          else if (d <= 7) c = A.dith(x, y, (d - 3) / 5) ? 'n' : 'B';
          else if (d <= 16) c = 'n';
          else c = A.dith(x, y, Math.min(1, (d - 16) / 8)) ? 'N' : 'n';
          g.set(x, y, c);
        } else {
          const d = toSea[i], nz = noise[i];
          let c = 'e';
          if (d <= 1) c = nz > 0.6 ? 'S' : 'E';
          else if (nz > 0.8 && d > 6) c = nz > 0.86 && d > 9 ? 'g' : 'G';
          else if (nz > 0.66 && d > 2) c = A.dith(x, y, Math.min(1, (nz - 0.66) / 0.08)) ? 'F' : 'e';
          else if (nz < 0.32) c = A.dith(x, y, Math.min(1, (0.32 - nz) / 0.08)) ? 'E' : 'e';
          g.set(x, y, c);
        }
      }
      // little hill bumps for texture
      for (let k = 0; k < 90; k++) {
        const x = Math.floor(R() * W), y = Math.floor(R() * H), i = y * W + x;
        if (land[i] && toSea[i] > 3 && g.get(x, y) === PAL.e) { g.set(x, y, 'F'); g.set(x + 1, y, 'F'); g.set(x, y - 1, 'E'); }
      }
      // coast edge
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (land[i] && toSea[i] === 1 && (x + y) % 2 === 0) g.set(x, y, g.get(x, y) === PAL.S ? 'S' : 'e'); }
      // compass rose in the open sea, west of Sumatra
      const cx = 14, cy = H - 34;
      g.vline(cx, cy - 8, cy + 8, 'w'); g.hline(cx - 8, cx + 8, cy, 'w');
      g.ellipse(cx, cy, 4, 4, 'N'); g.ellipse(cx, cy, 2, 2, 'w');
      g.vline(cx, cy - 10, cy - 7, 'R'); g.set(cx - 1, cy - 8, 'R'); g.set(cx + 1, cy - 8, 'R'); g.set(cx, cy - 12, 'W');
      return { W, H, cv: g.canvas(1), land, toLand };
    });
  }
  function townSprite(state) {
    return spriteCanvas('town' + state, () => {
      const g = new A.Grid(9, 9);
      const roof = state === 'locked' ? 'g' : state === 'here' ? 'Y' : 'R', wall = state === 'locked' ? 'w' : 'W';
      g.rect(1, 4, 7, 4, wall); g.poly([[0, 4.5], [4.5, 0.5], [9, 4.5]], roof); g.rect(4, 5, 1, 3, state === 'locked' ? 'G' : 'D');
      g.set(2, 5, 'b'); g.set(6, 5, 'b');
      g.outline('K');
      return g;
    });
  }
  function markerSprite(kind) {
    return spriteCanvas('mk' + kind, () => {
      if (kind === 'star') return A.fromRows(['..Y..', '.YYY.', 'YYWYY', '.YYY.', 'Y...Y'].map(r => r), true);
      if (kind === 'arrow') return A.fromRows(['YYYYY', 'YYYYY', '.YYY.', '..Y..'], true);
      if (kind === 'crate') return A.fromRows(['SSSSS', 'sDsDs', 'sssss'], true);
      if (kind === 'freight') return A.fromRows(['..W..', '.yWy.', 'ttttt', '.TTT.'], true);
      if (kind === 'cursor') return A.fromRows(['W....', 'WW...', 'WWW..', 'WWWW.', 'WWW..', 'WW...', 'W....'], true);
      return A.fromRows(['RRRR', 'RRRR'], true);
    });
  }
  function boatSprite(flip) {
    return spriteCanvas('mapboat' + (flip ? 'f' : ''), () => {
      const rows = ['...W.....', '...WW....', '...WWW...', '...D.....', 'DDDDDDDDD', '.RDDDDDR.', '..rrrrr..'];
      const g = A.fromRows(flip ? rows.map(r => r.split('').reverse().join('')) : rows, true);
      return g;
    });
  }

  function MapView(host, opts) {
    this.host = host; this.o = Object.assign({ selected: null, route: null, frac: 0, ship: false, here: null, dests: [], locked: [], wind: 'NE', still: false, ports: [] }, opts || {});
    const R = chartRaster();
    this.R = R;
    this.base = document.createElement('canvas'); this.base.width = R.W; this.base.height = R.H; this.base.className = 'map-base';
    this.fx = document.createElement('canvas'); this.fx.width = R.W; this.fx.height = R.H; this.fx.className = 'map-fx';
    host.appendChild(this.base); host.appendChild(this.fx);
    this.bctx = this.base.getContext('2d'); this.ctx = this.fx.getContext('2d');
    this.drawBase();
    this.t0 = performance.now();
  }
  MapView.prototype.xy = function (id) { const p = MAP.nodeXY(root.MM, id); return [p[0] / MS, p[1] / MS]; };
  MapView.prototype.drawBase = function () {
    const x = this.bctx, o = this.o, R = this.R;
    x.clearRect(0, 0, R.W, R.H);
    x.drawImage(R.cv, 0, 0);
    // sea lanes as dotted lines
    x.fillStyle = PAL.c;
    root.MM.EDGES.forEach(([a, b]) => {
      const A0 = this.xy(a), B0 = this.xy(b);
      const n = Math.max(1, Math.round(Math.hypot(B0[0] - A0[0], B0[1] - A0[1])));
      for (let i = 0; i <= n; i += 3) { const px = Math.round(A0[0] + (B0[0] - A0[0]) * i / n), py = Math.round(A0[1] + (B0[1] - A0[1]) * i / n); if (!R.land[py * R.W + px]) x.fillRect(px, py, 1, 1); }
    });
    // towns
    root.MM.PORT_IDS.forEach(p => {
      const [px, py] = this.xy(p);
      const st = o.locked.indexOf(p) >= 0 ? 'locked' : o.here === p ? 'here' : 'port';
      x.drawImage(townSprite(st), Math.round(px) - 4, Math.round(py) - 6);
    });
  };
  MapView.prototype.routePts = function () {
    if (!this.o.route) return null;
    const r = root.MM.route(this.o.route.from, this.o.route.to);
    return r.path.map(id => this.xy(id));
  };
  MapView.prototype.frame = function (t) {
    const x = this.ctx, o = this.o, R = this.R;
    x.clearRect(0, 0, R.W, R.H);
    // drifting wind streaks in the monsoon direction
    const dir = o.wind === 'NE' ? [-1, 1] : [1, -1];
    const Rn = A.prng('wind');
    x.fillStyle = PAL.W;
    for (let i = 0; i < 26; i++) {
      const bx = Rn() * R.W, by = Rn() * R.H, k = ((t / 2600) + Rn()) % 1;
      const px = Math.round(bx + dir[0] * k * 24), py = Math.round(by + dir[1] * k * 24);
      if (px < 0 || py < 0 || px >= R.W || py >= R.H || R.land[py * R.W + px]) continue;
      if (k < 0.15 || k > 0.85) continue;
      for (let j = 0; j < 4; j++) { const qx = px - dir[0] * j, qy = py - dir[1] * j; if (!R.land[qy * R.W + qx]) { x.globalAlpha = j === 0 ? 0.9 : 0.45; x.fillRect(qx, qy, 1, 1); } }
    }
    x.globalAlpha = 1;
    // sparkles on the water
    for (let i = 0; i < 14; i++) { const k = Math.floor(t / 500) + i * 7919; const px = (k * 2654435761 % 4294967296) % R.W, py = ((k * 40503) % 65536) % R.H; if (!R.land[py * R.W + px] && R.toLand[py * R.W + px] > 2) { x.fillStyle = PAL.W; x.fillRect(px, py, 1, 1); } }
    // route
    const pts = this.routePts();
    if (pts) {
      const segs = []; let tot = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); tot += l; }
      const off = Math.floor(t / 90);
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.round(segs[i - 1]));
        for (let j = 0; j < n; j++) {
          const d = acc + j; const on = ((d - off) % 6 + 6) % 6 < 3;
          const px = Math.round(a[0] + (b[0] - a[0]) * j / n), py = Math.round(a[1] + (b[1] - a[1]) * j / n);
          x.fillStyle = on ? PAL.Y : PAL.y; x.fillRect(px, py, 1, 1);
          if (on) { x.fillStyle = PAL.K; x.fillRect(px, py + 1, 1, 1); x.fillStyle = PAL.Y; }
        }
        acc += n;
      }
      if (o.ship) {
        const p = MAP.pointAlong(pts, o.frac);
        const flip = Math.abs(p.angle) > 90;
        const s = boatSprite(flip);
        x.drawImage(s, Math.round(p.x) - 4, Math.round(p.y) - 6 + (Math.sin(t / 300) > 0 ? 0 : 1));
      }
    }
    // your warehouses, factories and freight in transit
    (o.whs || []).forEach(p => { const [px, py] = this.xy(p); x.drawImage(markerSprite('crate'), Math.round(px) - 3, Math.round(py) + 3); });
    (o.facs || []).forEach(p => { const [px, py] = this.xy(p); const k = Math.floor(t / 400) % 3; x.fillStyle = PAL.W; x.fillRect(Math.round(px) - 7, Math.round(py) - 5 - k, 2, 1); x.fillStyle = PAL.w; x.fillRect(Math.round(px) - 8, Math.round(py) - 7 - k, 2, 1); x.fillStyle = PAL.g; x.fillRect(Math.round(px) - 8, Math.round(py) - 9 - k, 1, 1); });
    (o.trips || []).forEach(tr => {
      const r = root.MM.route(tr.from, tr.to), pts = r.path.map(id => this.xy(id));
      const p = MAP.pointAlong(pts, Math.max(0, Math.min(1, tr.frac)));
      const s2 = markerSprite('freight');
      x.drawImage(s2, Math.round(p.x) - 3, Math.round(p.y) - 4 + (Math.sin(t / 260 + tr.frac * 9) > 0 ? 0 : 1));
    });
    // contract destinations
    (o.dests || []).forEach(p => { const [px, py] = this.xy(p); const s = markerSprite('star'); x.drawImage(s, Math.round(px) + 2, Math.round(py) - 12 + (Math.sin(t / 250) > 0 ? 0 : 1)); });
    // you are here
    if (o.here && !o.ship) { const [px, py] = this.xy(o.here); const s = markerSprite('arrow'); x.drawImage(s, Math.round(px) - 3, Math.round(py) - 14 + Math.round(Math.sin(t / 180))); }
    // selection cursor
    if (o.selected) { const [px, py] = this.xy(o.selected); if (Math.floor(t / 300) % 2 === 0 || o.still) { const s = markerSprite('cursor'); x.drawImage(s, Math.round(px) - 13, Math.round(py) - 6); } }
  };
  MapView.prototype.start = function () {
    const loop = t => { this.frame(t - this.t0); this.raf = requestAnimationFrame(loop); };
    if (this.o.still) { this.frame(0); return this; }
    this.raf = requestAnimationFrame(loop); return this;
  };
  MapView.prototype.stop = function () { cancelAnimationFrame(this.raf); };
  MapView.prototype.set = function (o) { const rebase = ('here' in o && o.here !== this.o.here) || ('locked' in o); Object.assign(this.o, o); if (rebase) this.drawBase(); if (this.o.still) this.frame(0); };
  // Convert a click on the canvas into the nearest port id.
  MapView.prototype.pick = function (clientX, clientY, maxDist) {
    const r = this.fx.getBoundingClientRect();
    const mx = (clientX - r.left) / r.width * this.R.W, my = (clientY - r.top) / r.height * this.R.H;
    let best = null, bd = 1e9;
    root.MM.PORT_IDS.forEach(id => { const [x, y] = this.xy(id); const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = id; } });
    return bd <= (maxDist || 18) ? best : null;
  };
  MapView.prototype.labelPos = function (id) { const [x, y] = this.xy(id); return [x / this.R.W * 100, y / this.R.H * 100]; };

  /* ================= App icon ================= */
  function appIcon(size, maskable) {
    const g = new A.Grid(32, 32);
    const sky = ['v', 'p', 'O', 'y'];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) g.set(x, y, A.bandAt(sky, y / 20, x, y));
    g.ellipse(22, 14, 6, 6, 'Y'); g.ellipse(22, 14, 4, 4, 'W');
    for (let y = 20; y < 32; y++) for (let x = 0; x < 32; x++) g.set(x, y, A.bandAt(['p', 'v', 'N', 'k'], (y - 20) / 12, x, y));
    for (let y = 21; y < 32; y += 2) g.hline(20 + (y % 4), 24 - (y % 4), y, 'y');
    const j = A.junk(0.56, 'S', 'D', 'd');
    A.stampGrid(g, j, 2, 27 - j.h);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    if (maskable) { x.fillStyle = PAL.k; x.fillRect(0, 0, size, size); }
    const src = g.canvas(1);
    const pad = maskable ? Math.round(size * 0.1) : 0;
    x.drawImage(src, pad, pad, size - pad * 2, size - pad * 2);
    return cv;
  }

  root.PX = { installCSS, skylineURL, Scene, MapView, chartRaster, appIcon, SW, SH };
})(typeof window !== 'undefined' ? window : globalThis);
