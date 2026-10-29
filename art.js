/* Monsoon Merchant — 16-bit pixel art. Every sprite is drawn in code, so the game ships no image files. */
(function (root) {
  'use strict';

  /* ================= Palette ================= */
  const PAL = {
    K: '#0b0a1a', k: '#1c1b36', N: '#23315f', n: '#31508f', B: '#3e80c4', b: '#6fb7ea', c: '#b4e6ff',
    W: '#f6f2e4', w: '#cfc8b6', g: '#8d8a99', G: '#57556b',
    T: '#1d7f84', t: '#39c3b2', Y: '#ffd65c', y: '#f4a23c', O: '#df653a', R: '#c63b3b', r: '#7d2232',
    P: '#f394b6', p: '#a062c6', v: '#5c3d8a', E: '#84cf54', e: '#3f9142', F: '#245a33',
    S: '#ebc98f', s: '#c08f58', D: '#835332', d: '#4c3024', L: '#f7d7b2', l: '#dca57a', M: '#a26b47', m: '#6e432c',
  };
  const OUT = PAL.K;

  /* ================= Pixel grid ================= */
  function Grid(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  Grid.prototype.set = function (x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return; this.d[y * this.w + x] = PAL[c] || c; };
  Grid.prototype.get = function (x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null; return this.d[y * this.w + x]; };
  Grid.prototype.clear = function (x, y) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = null; };
  Grid.prototype.rect = function (x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; };
  Grid.prototype.hline = function (x0, x1, y, c) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); };
  Grid.prototype.vline = function (x, y0, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); };
  Grid.prototype.ellipse = function (cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    return this;
  };
  Grid.prototype.line = function (x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  Grid.prototype.poly = function (pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    pts.forEach(p => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yy = y + 0.5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a[1] > yy) !== (b[1] > yy)) xs.push(a[0] + (yy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
    return this;
  };
  // Stamp a sprite given as rows of palette letters ('.' or ' ' = transparent).
  Grid.prototype.stamp = function (rows, ox, oy, flip, map) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        let ch = row[i]; if (ch === '.' || ch === ' ') continue;
        if (map && map[ch]) ch = map[ch];
        this.set(ox + (flip ? row.length - 1 - i : i), oy + j, ch);
      }
    });
    return this;
  };
  // Draw a dark outline around every opaque pixel (classic 16-bit sprite edge).
  Grid.prototype.outline = function (c, diag) {
    const col = PAL[c] || c || OUT, add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      let hit = this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1);
      if (!hit && diag) hit = this.get(x - 1, y - 1) || this.get(x + 1, y - 1) || this.get(x - 1, y + 1) || this.get(x + 1, y + 1);
      if (hit && hit !== col) add.push([x, y]);
    }
    add.forEach(p => { this.d[p[1] * this.w + p[0]] = col; });
    return this;
  };
  Grid.prototype.canvas = function (scale) {
    scale = scale || 1;
    const cv = document.createElement('canvas'); cv.width = this.w * scale; cv.height = this.h * scale;
    const x = cv.getContext('2d');
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) { const c = this.d[j * this.w + i]; if (c) { x.fillStyle = c; x.fillRect(i * scale, j * scale, scale, scale); } }
    return cv;
  };
  Grid.prototype.url = function (scale) { return this.canvas(scale).toDataURL('image/png'); };
  function fromRows(rows, outline) {
    const w = Math.max.apply(null, rows.map(r => r.length));
    const g = new Grid(w, rows.length).stamp(rows, 0, 0);
    if (outline) g.outline(outline === true ? OUT : outline);
    return g;
  }

  // Deterministic little RNG for procedural art.
  function prng(seed) { let s = 0; for (let i = 0; i < String(seed).length; i++) s = (s * 31 + String(seed).charCodeAt(i)) | 0; s = s || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const dith = (x, y, f) => f * 16 > BAYER[y & 3][x & 3] + 0.5;
  // Pick a colour from a top-to-bottom list of bands; only the last 30% of each band is dithered into the next.
  function bandAt(cols, f, x, y) {
    f = Math.max(0, Math.min(0.9999, f)) * cols.length;
    const i = Math.floor(f), fr = f - i;
    if (i >= cols.length - 1) return cols[cols.length - 1];
    const k = (fr - 0.7) / 0.3;
    return k > 0 && dith(x, y, k) ? cols[i + 1] : cols[i];
  }

  /* ================= Cargo sprites (12×12) ================= */
  const GOODS = {
    rice: [
      '............',
      '....w..w....',
      '...wWwwWw...',
      '....dDDd....',
      '...SSSSSS...',
      '..SWSSSSSs..',
      '..SyyyyyyS..',
      '..SyRRRRyS..',
      '..SWSSSSSs..',
      '..SSSSSSss..',
      '...ssssss...',
      '............'],
    palm: [
      '............',
      '...yYYYYy...',
      '..YWWYYYYy..',
      '..yyyyyyyy..',
      '..YWYYYYyO..',
      '..YWYYYYyO..',
      '..ODDDDDDO..',
      '..YWYYYYyO..',
      '..YWYYYYyO..',
      '..yyyyyyyy..',
      '...OOOOOO...',
      '............'],
    rubber: [
      '............',
      '............',
      '..yYYYYYYy..',
      '.yYWYYYYYYO.',
      '.YYYYYYYYYO.',
      '.OOOOOOOOOO.',
      '.yYYYYWYYYO.',
      '.YYYYYYYYYO.',
      '.OOOOOOOOOO.',
      '..DDDDDDDD..',
      '............',
      '............'],
    tyres: [
      '............',
      '....GGGG....',
      '..GGgGGgGG..',
      '..GgGkkGgG..',
      '.GgGk..kGgG.',
      '.GGk....kGG.',
      '.GGk....kGG.',
      '.GgGk..kGgG.',
      '..GgGkkGgG..',
      '..GGgGGgGG..',
      '....GGGG....',
      '............'],
    steel: [
      '............',
      '............',
      '.cbbbbbbbbb.',
      '.BBBBBBBBBn.',
      '.nnnBbBnnnn.',
      '....BbBn....',
      '....BbBn....',
      '.cbbBbBbbbb.',
      '.BBBBBBBBBn.',
      '.nnnnnnnnnn.',
      '............',
      '............'],
    coffee: [
      '............',
      '.....DDs....',
      '...DDsDDD...',
      '..DsDDdDDD..',
      '..DsDdDDDd..',
      '..DDDdDDDd..',
      '..DDdDDDDd..',
      '..DDdDDDDd..',
      '...DdDDDd...',
      '....dddd....',
      '............',
      '............'],
    electronics: [
      '............',
      '...g.g.g.g..',
      '..NNNNNNNN..',
      '.gNbbbbbnNg.',
      '..NbttttnN..',
      '.gNbtWttnNg.',
      '..NbttttnN..',
      '.gNbnnnnnNg.',
      '..NNNNNNNN..',
      '...g.g.g.g..',
      '............',
      '............'],
    durian: [
      '......D.....',
      '.....dD.....',
      '...E.EE.E...',
      '..EeEEEEeE..',
      '.EeEEeEEEeE.',
      '..EEeEEeEe..',
      '.EeEEEeEEeE.',
      '..EeEEEEeE..',
      '.EEeEeEEeEE.',
      '..EeEeEEeE..',
      '...E.ee.E...',
      '............'],
    food: [
      '............',
      '...wwwwww...',
      '..wWWWWWWw..',
      '..gwwwwwwg..',
      '..RRRRRRRR..',
      '..RWWYYWWR..',
      '..RWYEEYWR..',
      '..RWWYYWWR..',
      '..RRRRRRRR..',
      '..gwwwwwwg..',
      '...gggggg...',
      '............'],
    coffeemix: [
      '....w..w....',
      '.....w..w...',
      '....w..w....',
      '..WWWWWWW...',
      '..WDDDDDWWW.',
      '..WDsDDDW.W.',
      '..WDDDDDWWW.',
      '..WWWWWWW...',
      '...WWWWW....',
      '.wwwwwwwww..',
      '............',
      '............'],
    machinery: [
      '............',
      '.....yy.....',
      '..yy.yy.yy..',
      '..yyyOOyyy..',
      '...yO..Oy...',
      '.yyO....Oyy.',
      '.yyO....Oyy.',
      '...yO..Oy...',
      '..yyyOOyyy..',
      '..yy.yy.yy..',
      '.....yy.....',
      '............'],
    coal: [
      '............',
      '............',
      '............',
      '......GG....',
      '....GgGkG...',
      '...GgGkkGG..',
      '..GgkGGkkG..',
      '.GgGkkGgkkG.',
      '.GGkkGGGkkG.',
      '.kkkkkkkkkk.',
      '............',
      '............'],
  };

  /* ================= UI icons (12×12) ================= */
  const ICONS = {
    market: [
      '............',
      '.RWRWRWRWRW.',
      '.RWRWRWRWRW.',
      '..r.r.r.r.r.',
      '..D......D..',
      '..D.yYy..D..',
      '..D.YyY..D..',
      '.ssssssssss.',
      '.DDDDDDDDDD.',
      '.D........D.',
      '.d........d.',
      '............'],
    map: [
      '............',
      '.sSSSSSSSSs.',
      '.SSSSDSSSSS.',
      '.SbbSSDSSSS.',
      '.SbbbSSDSRS.',
      '.SbbSSSSRSR.',
      '.SSbSSSDSRS.',
      '.SSSSSDSSSS.',
      '.SSEESDSSSS.',
      '.SEEESSSSSS.',
      '.sSSSSSSSSs.',
      '............'],
    ship: [
      '............',
      '.....W......',
      '.....WW.....',
      '.....WWW....',
      '.....WWWW...',
      '.....D......',
      '.....D......',
      'DDDDDDDDDDD.',
      '.RDDDDDDDD..',
      '..rrrrrrr...',
      '.bb.bbb.bb..',
      '............'],
    office: [
      '............',
      '....dddd....',
      '...d....d...',
      '.DDDDDDDDDD.',
      '.DssssssssD.',
      '.DssssssssD.',
      '.DDDDYYDDDD.',
      '.DsssYYsssD.',
      '.DssssssssD.',
      '.DDDDDDDDDD.',
      '............',
      '............'],
    back: [
      '............',
      '.....W......',
      '....WW......',
      '...WWW......',
      '..WWWWWWWW..',
      '.WWWWWWWWW..',
      '..WWWWWWWW..',
      '...WWW......',
      '....WW......',
      '.....W......',
      '............',
      '............'],
    close: [
      '............',
      '............',
      '..WW....WW..',
      '...WW..WW...',
      '....WWWW....',
      '.....WW.....',
      '....WWWW....',
      '...WW..WW...',
      '..WW....WW..',
      '............',
      '............',
      '............'],
    coins: [
      '............',
      '....yyyy....',
      '...yYYYYy...',
      '...YWYYYy...',
      '...yyyyyy...',
      '.yyyyyyyyy..',
      'yYYYYyYYYYy.',
      'yWYYYyWYYYy.',
      'yYYYYyYYYYy.',
      'yyyyyyyyyyy.',
      '.OOOO.OOOO..',
      '............'],
    box: [
      '............',
      '............',
      '..ssssssss..',
      '.sSSSSSSSSs.',
      '.DDDDDDDDDD.',
      '.DsSSyySSsD.',
      '.DsSSyySSsD.',
      '.DsSSSSSSsD.',
      '.DsSSSSSSsD.',
      '.DDDDDDDDDD.',
      '............',
      '............'],
    chart: [
      '............',
      '.........E..',
      '........EE..',
      '.......E.E..',
      '......E.....',
      '..E..E......',
      '.E.EE.......',
      'E...........',
      '..t..t..t...',
      '..t..t..t.t.',
      '.ttttttttttt',
      '............'],
    menu: [
      '............',
      '............',
      '.WWWWWWWWWW.',
      '.WWWWWWWWWW.',
      '............',
      '.WWWWWWWWWW.',
      '.WWWWWWWWWW.',
      '............',
      '.WWWWWWWWWW.',
      '.WWWWWWWWWW.',
      '............',
      '............'],
    anchor: [
      '............',
      '.....bb.....',
      '....b..b....',
      '.....bb.....',
      '...bbbbbb...',
      '.....bb.....',
      '.....bb.....',
      '.b...bb...b.',
      '.bb..bb..bb.',
      '..bb.bb.bb..',
      '...bbbbbb...',
      '............'],
    wind: [
      '............',
      '........cc..',
      '.cccccc...c.',
      '.......cc.c.',
      '..........c.',
      '.ccccccccc..',
      '............',
      '.bbbbbbbb...',
      '.........b..',
      '.......b.b..',
      '........b...',
      '............'],
    bank: [
      '............',
      '.....YY.....',
      '...YYYYYY...',
      '.YYYYYYYYYY.',
      '.wwwwwwwwww.',
      '..W.W..W.W..',
      '..W.W..W.W..',
      '..W.W..W.W..',
      '..W.W..W.W..',
      '.wwwwwwwwww.',
      '.gggggggggg.',
      '............'],
    yard: [
      '............',
      '.YYYYYYYYYY.',
      '.Y.Y.Y.Y..Y.',
      '.YYYYYYYYYY.',
      '.Y........G.',
      '.Y........G.',
      '.Y.......RR.',
      '.Y.......RR.',
      '.Y..........',
      '.Y..........',
      'GGGGG.......',
      '............'],
    storm: [
      '............',
      '...wwww.....',
      '..wWWWWww...',
      '.wWWWWWWWw..',
      '.gwwwwwwwg..',
      '..ggggggg...',
      '.....YY.....',
      '....YY......',
      '...YYYY.....',
      '.....YY.....',
      '....Y.......',
      '............'],
    pirates: [
      '............',
      '...WWWWWW...',
      '..WWWWWWWW..',
      '..WKKWWKKW..',
      '..WKKWWKKW..',
      '..WWWKKWWW..',
      '...WWWWWW...',
      '...W.W.W....',
      '.W........W.',
      '..WW....WW..',
      '....WWWW....',
      '..WW....WW..'],
    engine: [
      '............',
      '.......ww...',
      '......w..w..',
      '......w..ww.',
      '.....www.w..',
      '....www.....',
      '...www......',
      '..www.......',
      '.www........',
      '.ww.........',
      '............',
      '............'],
    salvage: [
      '............',
      '............',
      '..RRRRRRRR..',
      '..RrRrRrRR..',
      '..RrRrRrRR..',
      '..RrRrRrRR..',
      '..RRRRRRRR..',
      '.b..bb..bb..',
      'bBbbBBbbBBb.',
      'BBBBBBBBBBB.',
      '............',
      '............'],
    trader: [
      '............',
      '............',
      '..ll....LL..',
      '.lllL..LLLL.',
      '.lllLLLLLLL.',
      '..llLLLLLL..',
      '...lLLLLL...',
      '....LLLL....',
      '.....LL.....',
      '............',
      '............',
      '............'],
    crew: [
      '............',
      '...w..w.....',
      '....w..w....',
      '...w..w.....',
      '............',
      '.WWWWWWWWWW.',
      '.WSSSSSSSSW.',
      '..WSSSSSSW..',
      '..WWWWWWWW..',
      '....wwww....',
      '............',
      '............'],
    current: [
      '............',
      '............',
      '.bb...bb....',
      'b..bbb..bbb.',
      '............',
      '.cc...cc....',
      'c..ccc..ccc.',
      '............',
      '.bb...bb....',
      'b..bbb..bbb.',
      '............',
      '............'],
    radio: [
      '............',
      '...........c',
      '.........c..',
      '........c.c.',
      '.......g.c..',
      '......g.....',
      '.ggggggggg..',
      '.gGGGGGGGg..',
      '.gGkkGtGtg..',
      '.gGkkGGGGg..',
      '.ggggggggg..',
      '............'],
    customs: [
      '............',
      '...RRRRRR...',
      '...RrrrrR...',
      '....rrrr....',
      '.....DD.....',
      '.....DD.....',
      '...dDDDDd...',
      '..ddddddddd.',
      '..RRRRRRRR..',
      '............',
      '............',
      '............'],
    star: [
      '.....Y......',
      '.....Y......',
      '....YYY.....',
      'YYYYYWYYYYY.',
      '.YYYWYYYYY..',
      '..YYYYYYY...',
      '...YYYYY....',
      '..YYYyYYY...',
      '..YYy.yYY...',
      '.YY.....YY..',
      '............',
      '............'],
    lock: [
      '............',
      '....gggg....',
      '...g....g...',
      '...g....g...',
      '..YYYYYYYY..',
      '..YWYYYYyY..',
      '..YYYkkYyY..',
      '..YYYkkYyY..',
      '..YYYYYYyY..',
      '..yyyyyyyy..',
      '............',
      '............'],
    check: [
      '............',
      '..........E.',
      '.........EE.',
      '........EE..',
      '.......EE...',
      '.E....EE....',
      '.EE..EE.....',
      '..EEEE......',
      '...EE.......',
      '............',
      '............',
      '............'],
    info: [
      '............',
      '...bbbbbb...',
      '..bbbWWbbb..',
      '.bbbbWWbbbb.',
      '.bbbbbbbbbb.',
      '.bbbWWWbbbb.',
      '.bbbbWWbbbb.',
      '.bbbbWWbbbb.',
      '..bbWWWWbb..',
      '...bbbbbb...',
      '............',
      '............'],
    gear: [
      '............',
      '.....gg.....',
      '..gg.gg.gg..',
      '..gggwwggg..',
      '...gw..wg...',
      '.ggw....wgg.',
      '.ggw....wgg.',
      '...gw..wg...',
      '..gggwwggg..',
      '..gg.gg.gg..',
      '.....gg.....',
      '............'],
    trophy: [
      '............',
      '.YYYYYYYYYY.',
      'Y.YWYYYYYy.Y',
      'Y.YWYYYYYy.Y',
      '.YYYYYYYYyY.',
      '...YYYYyy...',
      '....YYyy....',
      '.....yy.....',
      '.....yy.....',
      '...DDDDDD...',
      '...dddddd...',
      '............'],
    spark: [
      '............',
      '....pppp....',
      '...pPPPPp...',
      '..pPWPPPPp..',
      '..vpPPPPpv..',
      '...vpPPpv...',
      '....vppv....',
      '.....vv.....',
      '............',
      '............',
      '............',
      '............'],
    calendar: [
      '............',
      '..W....W....',
      '.RRRRRRRRRR.',
      '.RRRRRRRRRR.',
      '.WWWWWWWWWW.',
      '.WgWgWgWgWW.',
      '.WWWWWWWWWW.',
      '.WgWgWRRWWW.',
      '.WWWWWRRWWW.',
      '.wwwwwwwwww.',
      '............',
      '............'],
    play: [
      '............',
      '..W.........',
      '..WW........',
      '..WWW.......',
      '..WWWW......',
      '..WWWWW.....',
      '..WWWWW.....',
      '..WWWW......',
      '..WWW.......',
      '..WW........',
      '..W.........',
      '............'],
    fast: [
      '............',
      '............',
      '.W....W.....',
      '.WW...WW....',
      '.WWW..WWW...',
      '.WWWW.WWWW..',
      '.WWWW.WWWW..',
      '.WWW..WWW...',
      '.WW...WW....',
      '.W....W.....',
      '............',
      '............'],
    plus: [
      '............',
      '............',
      '.....WW.....',
      '.....WW.....',
      '.....WW.....',
      '..WWWWWWWW..',
      '..WWWWWWWW..',
      '.....WW.....',
      '.....WW.....',
      '.....WW.....',
      '............',
      '............'],
    minus: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '..WWWWWWWW..',
      '..WWWWWWWW..',
      '............',
      '............',
      '............',
      '............',
      '............'],
    up: [
      '............',
      '.....EE.....',
      '....EEEE....',
      '...EEEEEE...',
      '..EEEEEEEE..',
      '....EEEE....',
      '....EEEE....',
      '....EEEE....',
      '....EEEE....',
      '............',
      '............',
      '............'],
    down: [
      '............',
      '............',
      '....RRRR....',
      '....RRRR....',
      '....RRRR....',
      '....RRRR....',
      '..RRRRRRRR..',
      '...RRRRRR...',
      '....RRRR....',
      '.....RR.....',
      '............',
      '............'],
    rumour: [
      '............',
      '..WWWWWWWW..',
      '.WWWWWWWWWW.',
      '.WWkWWkWWkW.',
      '.WWWWWWWWWW.',
      '..WWWWWWWW..',
      '...WW.......',
      '..WW........',
      '.W..........',
      '............',
      '............',
      '............'],
    news: [
      '............',
      '.WWWWWWWWw..',
      '.WkkkkkkWw..',
      '.WWWWWWWWw..',
      '.WggWgggWw..',
      '.WggWWWWWw..',
      '.WWWWgggWw..',
      '.WgggWWWWw..',
      '.WWWWWWWWw..',
      '..wwwwwwww..',
      '............',
      '............'],
    sound: [
      '............',
      '....W.....c.',
      '...WW...c..c',
      '..WWW....c.c',
      'WWWWW..c.c.c',
      'WWWWW..c.c.c',
      'WWWWW..c.c.c',
      '..WWW....c.c',
      '...WW...c..c',
      '....W.....c.',
      '............',
      '............'],
    help: [
      '............',
      '...bbbbbb...',
      '..bbWWWWbb..',
      '.bbWWbbWWbb.',
      '.bbbbbbWWbb.',
      '.bbbbbWWbbb.',
      '.bbbbWWbbbb.',
      '.bbbbbbbbbb.',
      '..bbbWWbbb..',
      '...bbbbbb...',
      '............',
      '............'],
    download: [
      '............',
      '.....WW.....',
      '.....WW.....',
      '.....WW.....',
      '..WW.WW.WW..',
      '...WWWWWW...',
      '....WWWW....',
      '.....WW.....',
      '.W........W.',
      '.WWWWWWWWWW.',
      '............',
      '............'],
    flag: [
      '............',
      '.gRRRRRRR...',
      '.gRRWRRRRR..',
      '.gRWWWRRR...',
      '.gRRWRRRRR..',
      '.gRRRRRRR...',
      '.g..........',
      '.g..........',
      '.g..........',
      '.g..........',
      'ggg.........',
      '............'],
    clock: [
      '............',
      '...WWWWWW...',
      '..WwWWWWwW..',
      '.WWWWkWWWWW.',
      '.WwWWkWWWwW.',
      '.WWWWkkkWWW.',
      '.WwWWWWWWwW.',
      '.WWWWWWWWWW.',
      '..WwWWWWwW..',
      '...WWWWWW...',
      '............',
      '............'],
    shield: [
      '............',
      '.bbbbbbbbbb.',
      '.bWWbbbbbbn.',
      '.bWbbYYbbbn.',
      '.bbbYYYYbbn.',
      '.bbbbYYbbbn.',
      '..bbbYYbbn..',
      '..bbbbbbbn..',
      '...bbbbbn...',
      '....bbnn....',
      '.....nn.....',
      '............'],
    skull: [
      '............',
      '...WWWWWW...',
      '..WWWWWWWW..',
      '.WWWWWWWWWW.',
      '.WKKWWWKKWW.',
      '.WKKWWWKKWW.',
      '.WWWWKWWWWW.',
      '..WWWWWWWW..',
      '...WkWkWw...',
      '...WWWWWW...',
      '............',
      '............'],
    flame: [
      '.....R......',
      '.....RR.....',
      '....RRR.....',
      '...RRORR....',
      '...ROORR..R.',
      '..RROYORR.R.',
      '..ROYYYORRR.',
      '..ROYWYYORR.',
      '..ROYWWYOR..',
      '...ROYYOR...',
      '....RRRR....',
      '............'],
    sword: [
      '............',
      '.........WW.',
      '........WWW.',
      '.......WWw..',
      '......WWw...',
      '.....WWw....',
      '..Y.WWw.....',
      '..YYWw......',
      '...YY.......',
      '..dYYY......',
      '.dd..Y......',
      '............'],
    scroll: [
      '............',
      '..SSSSSSSS..',
      '.sSSSSSSSSs.',
      '..SgggggS...',
      '..SSSSSSS...',
      '..SgggSSS...',
      '..SSSSSSS...',
      '..SggggSS...',
      '..SSSSSSSs..',
      '.sSSSSSSSSs.',
      '..ssssssss..',
      '............'],
    crown: [
      '............',
      '............',
      '.Y...Y...Y..',
      '.YY.YYY.YY..',
      '.YYYYYYYYY..',
      '.YYRYYYRYY..',
      '.YYYYYYYYY..',
      '.yyyyyyyyy..',
      '............',
      '............',
      '............',
      '............'],
    music: [
      '............',
      '....WWWWWW..',
      '....WWWWWW..',
      '....W....W..',
      '....W....W..',
      '....W....W..',
      '..WWW..WWW..',
      '.WWWW.WWWW..',
      '.WWW..WWW...',
      '............',
      '............',
      '............'],
    factory: [
      '............',
      '.........r..',
      '...w.....r..',
      '..w......r..',
      '.........r..',
      '.R..R..R.r..',
      '.RR.RR.RRr..',
      '.RRRRRRRRRR.',
      '.RWRWRWRWRR.',
      '.RRRRRRRRRR.',
      '.RRDDRRRRRR.',
      '............'],
    warehouse: [
      '............',
      '.....RR.....',
      '...RRRRRR...',
      '.RRRRRRRRRR.',
      'RRRRRRRRRRRR',
      '.wWWWWWWWWw.',
      '.wWggggggWw.',
      '.wWgkgkgkWw.',
      '.wWggggggWw.',
      '.wWgkgkgkWw.',
      '.wwwwwwwwww.',
      '............'],
    route: [
      '............',
      '.......Y....',
      '.......YY...',
      '.YYYYYYYYY..',
      '.......YY...',
      '.......Y....',
      '..W.........',
      '..WW........',
      'GGGGGGGG....',
      '.GGGGGG.....',
      '.bb.bb.bb...',
      '............'],
    company: [
      '............',
      '....dddd....',
      '...d....d...',
      '.YYYYYYYYYY.',
      '.YyyyyyyyyY.',
      '.YyyyyyyyyY.',
      '.YYYYRRYYYY.',
      '.YyyyRRyyyY.',
      '.YyyyyyyyyY.',
      '.YYYYYYYYYY.',
      '............',
      '............'],
    truck: [
      '............',
      '............',
      'OOOOOOO.....',
      'OWWWWWO.....',
      'OWWWWWOBBB..',
      'OWWWWWOBccB.',
      'OOOOOOOBBBBB',
      'OOOOOOOOOOOB',
      '.KK....KK...',
      'KggK..KggK..',
      '.KK....KK...',
      '............'],
    stamp: [
      '............',
      '.RRRRRRRRRR.',
      '.R........R.',
      '.R.RRRRRR.R.',
      '.R.R....R.R.',
      '.R.R.RR.R.R.',
      '.R.R.RR.R.R.',
      '.R.R....R.R.',
      '.R.RRRRRR.R.',
      '.R........R.',
      '.RRRRRRRRRR.',
      '............'],
    card: [
      '............',
      '..pppppppp..',
      '..pYYYYYYp..',
      '..pYvvvvYp..',
      '..pYvYYvYp..',
      '..pYvYYvYp..',
      '..pYvvvvYp..',
      '..pYYYYYYp..',
      '..pYWWWWYp..',
      '..pYYYYYYp..',
      '..pppppppp..',
      '............'],
    level: [
      '............',
      '.....YY.....',
      '....YYYY....',
      '...YYYYYY...',
      '..YYYYYYYY..',
      '....YYYY....',
      '....YYYY....',
      '....YYYY....',
      '....YYYY....',
      '....YYYY....',
      '............',
      '............'],
    estate: [
      '............',
      '..EE....EE..',
      '.EeeE..EeeE.',
      'E...eEEe...E',
      '.....EE.....',
      '....EeeE....',
      '.....DD.....',
      '.....DD.....',
      '.....DD.....',
      '....DDDD....',
      '..ssssssss..',
      '............'],
    shop: [
      '............',
      '.RWRWRWRWRW.',
      '.RWRWRWRWRW.',
      '.rrrrrrrrrr.',
      '.wWWWWWWWWw.',
      '.wbbbwWDDWw.',
      '.wbbbwWDDWw.',
      '.wbbbwWDDWw.',
      '.wwwwwWDDWw.',
      '.wwwwwwwwww.',
      'GGGGGGGGGGGG',
      '............'],
    manager: [
      '............',
      '....dddd....',
      '...dLLLLd...',
      '...LLLLLL...',
      '...LKLLKL...',
      '....LLLL....',
      '.....LL.....',
      '...NNRRNN...',
      '..NNNRRNNN..',
      '..NNNRRNNN..',
      '..NNNNNNNN..',
      '............'],
    ocean: [
      '............',
      '....bbbb....',
      '..bBBEEBBb..',
      '.bBEEEEBBBb.',
      '.BBBEEBBBEB.',
      '.BBBBBBBEEB.',
      '.BBEEBBBEEB.',
      '.BBEEEBBBBB.',
      '.bBBEEBBBBb.',
      '..bBBBBBBb..',
      '....bbbb....',
      '............'],
    eye: [
      '............',
      '............',
      '...WWWWWW...',
      '..WWbbbbWW..',
      '.WWbbKKbbWW.',
      '.WWbbKKbbWW.',
      '..WWbbbbWW..',
      '...WWWWWW...',
      '............',
      '............',
      '............',
      '............'],
  };

  /* ================= Portraits (24×24, parametric) ================= */
  const CAST = {
    rahim:   { skin: 'l', hair: 'short', hairC: 'K', hat: 'songkok', shirt: 'T', shirt2: 't', stache: true, bg: '#1d5f6b' },
    meiling: { skin: 'L', hair: 'bun', hairC: 'k', shirt: 'P', shirt2: 'W', earrings: 'R', bg: '#7a3557' },
    teoh:    { skin: 'L', hair: 'short', hairC: 'W', hat: 'captain', shirt: 'N', shirt2: 'Y', beard: 'W', wrinkles: true, bg: '#26407a' },
    kumar:   { skin: 'M', hair: 'slick', hairC: 'K', glasses: true, stache: true, shirt: 'y', shirt2: 'W', bg: '#7a5420' },
    siti:    { skin: 'l', hair: 'none', hijab: 'p', shirt: 'v', shirt2: 'P', bg: '#4b2d6b' },
    wong:    { skin: 'L', hair: 'bald', hairC: 'G', shirt: 'E', shirt2: 'e', chain: true, round: true, bg: '#3d6b2a' },
    lim:     { skin: 'L', hair: 'slick', hairC: 'K', shades: true, shirt: 'R', shirt2: 'W', tie: 'K', bg: '#6b1f2a' },
    along:   { skin: 'M', hair: 'buzz', hairC: 'K', shades: true, shirt: 'k', shirt2: 'G', chain: true, scar: true, bg: '#2a2a3a' },
  };
  function skinShade(c) { return { L: 'l', l: 'M', M: 'm', m: 'd' }[c] || c; }
  function portrait(id) {
    const o = CAST[id] || CAST.rahim;
    const g = new Grid(24, 24);
    const sk = o.skin, sh = skinShade(sk);
    // shoulders
    g.ellipse(12, 24, 10, 6, o.shirt);
    g.rect(9, 19, 6, 2, o.shirt2);
    g.set(11, 21, o.shirt2); g.set(12, 21, o.shirt2);
    if (o.tie) { g.vline(12, 20, 23, o.tie); g.vline(11, 21, 22, o.tie); }
    // neck
    g.rect(10, 15, 4, 5, sh);
    // hijab back layer
    if (o.hijab) { g.ellipse(12, 11, 8, 9.5, o.hijab); g.ellipse(12, 19, 8, 4, o.hijab); }
    // hair behind head
    if (o.hair === 'bun') { g.ellipse(12, 4, 3, 2.6, o.hairC); g.ellipse(12, 10, 7, 7.5, o.hairC); }
    // head
    const rx = o.round ? 6.8 : 6, ry = o.round ? 7 : 7.2;
    g.ellipse(12, 10.5, rx, ry, sk);
    for (let y = 4; y < 18; y++) for (let x = 13; x < 20; x++) { const v = g.get(x, y), v2 = g.get(x + 1, y); if (v === PAL[sk] && v2 !== PAL[sk]) g.set(x, y, sh); }
    g.set(4 + (o.round ? 0 : 1), 11, sk); // ear left
    g.set(5, 11, sk); g.set(19, 11, sh); g.set(18, 11, sk);
    // hair
    const hc = o.hairC;
    if (o.hair === 'short' || o.hair === 'slick' || o.hair === 'bun') {
      g.ellipse(12, 6.5, 6.6, 4, hc);
      for (let x = 6; x <= 18; x++) for (let y = 8; y <= 12; y++) if (g.get(x, y) === PAL[hc] && y > 8 && x > 7 && x < 17) g.set(x, y, sk);
      g.vline(6, 7, 11, hc); g.vline(18, 7, 11, hc);
      if (o.hair === 'slick') { g.hline(9, 16, 6, 'g'); g.set(15, 5, 'g'); }
      if (o.hair === 'short' && hc === 'W') { g.hline(8, 15, 5, 'w'); }
    } else if (o.hair === 'buzz') {
      g.ellipse(12, 6, 6, 3, hc);
      for (let x = 7; x <= 17; x++) g.set(x, 8, null);
      for (let x = 7; x <= 17; x++) if (!g.get(x, 8)) g.set(x, 8, sk);
    } else if (o.hair === 'bald') {
      g.vline(6, 9, 12, hc); g.vline(18, 9, 12, hc); g.set(7, 8, hc); g.set(17, 8, hc);
      g.set(10, 5, 'W'); g.set(11, 5, 'W');
    }
    // hijab front: frame the face
    if (o.hijab) {
      for (let y = 2; y < 24; y++) for (let x = 2; x < 22; x++) {
        const dx = (x + 0.5 - 12) / 5.2, dy = (y + 0.5 - 11.5) / 6.4;
        const inFace = dx * dx + dy * dy <= 1;
        const outer = ((x + 0.5 - 12) / 8) ** 2 + ((y + 0.5 - 11) / 9.5) ** 2 <= 1;
        if (outer && !inFace && y < 19) g.set(x, y, o.hijab);
      }
      g.hline(8, 16, 4, 'P');
    }
    // hats
    if (o.hat === 'songkok') { g.rect(7, 2, 10, 4, 'K'); g.hline(7, 16, 5, 'k'); g.hline(8, 15, 2, 'k'); }
    if (o.hat === 'captain') { g.rect(6, 2, 12, 3, 'W'); g.ellipse(12, 2.5, 6.5, 2, 'W'); g.hline(5, 18, 5, 'K'); g.hline(6, 17, 6, 'k'); g.rect(11, 2, 2, 2, 'Y'); }
    // eyes
    if (o.shades) { g.hline(7, 17, 10, 'K'); g.rect(8, 10, 3, 2, 'K'); g.rect(13, 10, 3, 2, 'K'); g.set(9, 10, 'G'); g.set(14, 10, 'G'); }
    else {
      g.set(9, 10, 'K'); g.set(9, 11, 'K'); g.set(14, 10, 'K'); g.set(14, 11, 'K');
      g.set(8, 10, 'W'); g.set(15, 10, 'W');
      const brow = o.hairC === 'W' ? 'w' : (o.hijab ? 'm' : 'k');
      g.hline(8, 10, 8, brow); g.hline(13, 15, 8, brow);
      if (o.glasses) { [7, 12].forEach(x0 => { g.hline(x0, x0 + 4, 9, 'G'); g.hline(x0, x0 + 4, 12, 'G'); g.vline(x0, 9, 12, 'G'); g.vline(x0 + 4, 9, 12, 'G'); }); }
      if (o.earrings) { g.set(5, 13, o.earrings); g.set(18, 13, o.earrings); }
    }
    // nose & mouth
    g.set(12, 12, sh); g.set(12, 13, sh);
    if (o.stache) { g.hline(10, 14, 14, o.hairC === 'W' ? 'W' : 'k'); g.set(9, 15, o.hairC === 'W' ? 'W' : 'k'); g.set(15, 15, o.hairC === 'W' ? 'W' : 'k'); }
    g.hline(11, 13, 15, o.id === 'meiling' ? 'R' : 'm');
    if (id === 'meiling' || id === 'siti') g.hline(11, 13, 15, 'R');
    if (o.beard) { g.ellipse(12, 15.8, 4.5, 2.6, o.beard); g.hline(11, 13, 15, 'm'); g.set(12, 14, 'W'); }
    if (o.wrinkles) { g.set(7, 13, sh); g.set(17, 13, sh); }
    if (o.scar) { g.line(15, 7, 17, 13, 'r'); }
    if (o.chain) { g.hline(9, 15, 20, 'Y'); g.set(8, 19, 'Y'); g.set(16, 19, 'Y'); g.set(12, 21, 'Y'); }
    g.set(16, 13, (sk === 'L' || sk === 'l') ? 'P' : null); g.set(7, 13, (sk === 'L' || sk === 'l') && !o.wrinkles ? 'P' : g.get(7, 13));
    g.outline(OUT);
    return g;
  }

  /* ================= Ships (side view, facing right) ================= */
  const SHIP_ART = {
    coaster:   { len: 34, hull: 'r', hull2: 'O', deck: 'D', cabin: 'W', funnel: 'G', band: 'Y', cargo: 'crates', h: 5 },
    freighter: { len: 42, hull: 'n', hull2: 'B', deck: 'G', cabin: 'W', funnel: 'Y', band: 'K', cargo: 'boxes', h: 6 },
    feeder:    { len: 52, hull: 'G', hull2: 'g', deck: 'G', cabin: 'W', funnel: 'R', band: 'W', cargo: 'stacks', h: 6 },
    reefer:    { len: 48, hull: 'W', hull2: 'w', deck: 'B', cabin: 'W', funnel: 'B', band: 'W', cargo: 'reefers', h: 6, stripe: 'B' },
    handy:     { len: 62, hull: 'R', hull2: 'O', deck: 'k', cabin: 'W', funnel: 'K', band: 'Y', cargo: 'bulk', h: 7 },
  };
  function ship(cls, opts) {
    opts = opts || {};
    const a = SHIP_ART[cls] || SHIP_ART.coaster;
    const L = a.len, H = a.h, W = L + 6, Ht = H + 18;
    const g = new Grid(W, Ht);
    const base = Ht - 2, deckY = base - H;
    // hull shape: raised bow at right, rounded stern left
    const pts = [[2, deckY], [L - 2, deckY], [L + 3, deckY - 2], [L - 1, base], [5, base], [1, deckY + 2]];
    g.poly(pts, a.hull);
    g.hline(2, L - 1, deckY, a.hull2);
    g.hline(3, L, deckY + 1, a.hull2);
    if (a.stripe) g.hline(4, L - 1, deckY + 3, a.stripe);
    for (let x = 5; x < L - 1; x++) { g.set(x, base - 1, 'R'); if (x % 7 === 0 && cls === 'coaster') g.set(x, deckY + 2, 'O'); }
    g.set(L - 4, deckY + 2, 'W');
    // superstructure at the stern
    const cabW = Math.max(7, Math.round(L * 0.2)), cabH = cls === 'coaster' ? 6 : 8;
    const cx0 = 4;
    g.rect(cx0, deckY - cabH, cabW, cabH, a.cabin);
    g.hline(cx0, cx0 + cabW - 1, deckY - cabH, 'w');
    for (let x = cx0 + 1; x < cx0 + cabW - 1; x += 2) g.set(x, deckY - cabH + 2, 'b');
    if (cabH > 6) for (let x = cx0 + 1; x < cx0 + cabW - 1; x += 2) g.set(x, deckY - cabH + 5, 'b');
    g.rect(cx0 - 1, deckY - cabH - 1, cabW + 2, 1, 'w');
    // funnel
    const fx = cx0 + 1;
    g.rect(fx, deckY - cabH - 5, 3, 4, a.funnel);
    g.hline(fx, fx + 2, deckY - cabH - 3, a.band);
    // mast
    g.vline(cx0 + cabW - 2, deckY - cabH - 6, deckY - cabH - 1, 'g');
    g.set(cx0 + cabW - 1, deckY - cabH - 5, 'g');
    // cargo
    const x0 = cx0 + cabW + 2, x1 = L - 5;
    const colors = ['R', 'B', 'E', 'y', 'p', 't', 'O', 'W'];
    if (a.cargo === 'crates') {
      for (let x = x0; x + 3 <= x1; x += 5) { g.rect(x, deckY - 3, 4, 3, 's'); g.hline(x, x + 3, deckY - 3, 'S'); g.set(x + 1, deckY - 2, 'D'); }
      g.vline(Math.round((x0 + x1) / 2), deckY - 10, deckY - 4, 'D'); g.line(Math.round((x0 + x1) / 2), deckY - 10, x1, deckY - 4, 'd');
    } else if (a.cargo === 'boxes' || a.cargo === 'stacks' || a.cargo === 'reefers') {
      const rows = a.cargo === 'boxes' ? 1 : a.cargo === 'stacks' ? 3 : 2;
      let k = (opts.seed || 3);
      for (let r = 0; r < rows; r++) for (let x = x0; x + 5 <= x1 + 1; x += 6) {
        const c = a.cargo === 'reefers' ? (r % 2 ? 'W' : 'w') : colors[(k++ * 7 + r * 3) % colors.length];
        g.rect(x, deckY - 3 * (r + 1), 5, 3, c);
        g.set(x + 4, deckY - 3 * (r + 1) + 1, 'k');
        if (a.cargo === 'reefers') g.set(x + 1, deckY - 3 * (r + 1) + 1, 'b');
      }
    } else if (a.cargo === 'bulk') {
      for (let x = x0; x + 6 <= x1; x += 8) { g.rect(x, deckY - 2, 6, 2, 'G'); g.hline(x, x + 5, deckY - 2, 'g'); }
      [x0 + 6, x0 + 22, x0 + 38].forEach(cx => { if (cx < x1) { g.vline(cx, deckY - 12, deckY - 1, 'Y'); g.line(cx, deckY - 12, cx + 7, deckY - 7, 'Y'); } });
    }
    if (opts.flag !== false) { g.set(L + 2, deckY - 5, 'R'); g.set(L + 1, deckY - 5, 'R'); g.vline(L + 1, deckY - 4, deckY - 2, 'g'); }
    g.outline(OUT);
    return g;
  }
  // Traditional junk with battened sails (the rival's fleet, and the title ship).
  function junk(size, sailC, battenC, hullC) {
    size = size || 1;
    const W = Math.round(38 * size), H = Math.round(34 * size);
    const g = new Grid(W, H);
    const base = H - 2, deck = base - Math.round(6 * size);
    g.poly([[1, deck - 3 * size], [W * 0.18, deck], [W - 6 * size, deck], [W - 1, deck - 4 * size], [W - 5 * size, base], [5 * size, base]], hullC || 'D');
    g.hline(Math.round(W * 0.18), W - 6, deck, 's');
    g.hline(3, W - 8, base - 1, 'd');
    for (let x = Math.round(6 * size); x < W - 8; x += Math.round(4 * size)) g.set(x, deck + 2, 'S');
    const sail = (cx, top, w, h) => {
      g.vline(cx, top - 2, deck, 'd');
      g.poly([[cx - 1, top], [cx + w * 0.8, top + h * 0.06], [cx + w, top + h], [cx - 1, top + h]], sailC || 'R');
      for (let y = top + 3; y < top + h; y += Math.max(3, Math.round(3 * size))) g.line(cx, y, cx + Math.round(w * (0.82 + 0.18 * (y - top) / h)), y + 1, battenC || 'r');
    };
    sail(Math.round(W * 0.42), Math.round(3 * size), Math.round(W * 0.42), deck - Math.round(6 * size));
    sail(Math.round(W * 0.2), Math.round(10 * size), Math.round(W * 0.2), deck - Math.round(13 * size));
    sail(Math.round(W * 0.78), Math.round(12 * size), Math.round(W * 0.17), deck - Math.round(15 * size));
    g.outline(OUT);
    return g;
  }
  function skiff() {
    const g = new Grid(20, 10);
    g.poly([[1, 5], [17, 5], [19, 3], [16, 9], [3, 9]], 'G');
    g.hline(2, 17, 5, 'g');
    g.rect(1, 3, 2, 3, 'K');
    [6, 9, 12].forEach(x => { g.rect(x, 2, 2, 3, 'k'); g.set(x, 1, 'K'); g.set(x + 1, 1, 'K'); });
    g.set(14, 1, 'W'); g.set(14, 2, 'g');
    g.outline(OUT);
    return g;
  }
  function container(c) { const g = new Grid(8, 5); g.rect(0, 0, 8, 5, c); g.vline(2, 0, 4, 'k'); g.vline(5, 0, 4, 'k'); g.hline(0, 7, 0, 'W'); g.outline(OUT); return g; }

  /* ================= Port skylines (120×40) ================= */
  const PORT_LOOK = {
    penang:    { hill: true, tower: 'clock', temple: true, palms: 3, tint: 'E' },
    klang:     { cranes: 3, palms: 4, tanks: true, tint: 'e' },
    singapore: { towers: [22, 26, 24], wheel: true, dense: 0.9, tint: 'b' },
    jakarta:   { obelisk: true, dense: 0.6, palms: 2, tint: 'y' },
    bangkok:   { prang: true, temple: true, dense: 0.4, boats: true, tint: 'Y' },
    hcmc:      { tall: 30, dense: 0.6, lanterns: true, tint: 'R' },
    haiphong:  { cranes: 2, chimneys: 3, dense: 0.5, tint: 'g' },
    shenzhen:  { towers: [28, 34, 24, 30], dense: 1, tint: 't' },
    shanghai:  { pearl: true, towers: [30, 26, 36], dense: 0.8, tint: 'p' },
    colombo:   { palms: 4, temple: true, dense: 0.4, cranes: 1, tint: 'E' },
    mumbai:    { towers: [24, 20], dense: 0.8, cranes: 2, tint: 'y' },
    dubai:     { towers: [40, 26, 22], dense: 0.5, palms: 2, tint: 'S' },
    tokyo:     { towers: [30, 34, 28, 26], dense: 1, tint: 'R' },
  };
  function skyline(p, night, bare) {
    const look = PORT_LOOK[p] || {};
    const R = prng('sky' + p);
    const W = 120, H = 40, g = new Grid(W, H);
    const ground = 33;
    // sky gradient with dithered bands
    const top = night ? ['K', 'k', 'N'] : ['n', 'B', 'b'];
    if (!bare) {
      for (let y = 0; y < ground; y++) for (let x = 0; x < W; x++) g.set(x, y, bandAt(top, y / ground, x, y));
      if (!night) { g.ellipse(96, 9, 5, 5, 'Y'); g.ellipse(96, 9, 3.5, 3.5, 'W'); }
      else { g.ellipse(96, 8, 3, 3, 'W'); g.set(97, 7, 'w'); for (let i = 0; i < 14; i++) g.set(Math.floor(R() * W), Math.floor(R() * 16), R() < 0.3 ? 'Y' : 'w'); }
      for (let i = 0; i < 3; i++) { const cx = 10 + R() * 70, cy = 5 + R() * 8; if (!night) { g.ellipse(cx, cy, 6, 2, 'c'); g.ellipse(cx + 4, cy - 1, 4, 2, 'W'); } }
    } else { for (let i = 0; i < 14; i++) { R(); R(); R(); } }
    // hills
    if (look.hill) { g.ellipse(26, ground + 4, 26, 14, 'F'); g.ellipse(14, ground + 2, 12, 9, 'e'); }
    const sil = night ? 'k' : 'G', win = night ? 'Y' : 'b', wall = night ? 'N' : 'w';
    // generic buildings
    const dense = look.dense || 0.3;
    for (let x = 2; x < W - 4;) {
      const bw = 4 + Math.floor(R() * 6), bh = 4 + Math.floor(R() * 10 * dense + 2);
      if (R() < 0.35 + dense * 0.5) {
        const c = R() < 0.5 ? sil : wall;
        g.rect(x, ground - bh, bw, bh, c);
        for (let yy = ground - bh + 2; yy < ground - 1; yy += 3) for (let xx = x + 1; xx < x + bw - 1; xx += 2) if (R() < (night ? 0.6 : 0.8)) g.set(xx, yy, win);
      }
      x += bw + Math.floor(R() * 3);
    }
    (look.towers || []).forEach((h, i) => {
      const x = 34 + i * 14 + Math.floor(R() * 5), w = 6 + (i % 2);
      g.rect(x, ground - h, w, h, i % 2 ? 'n' : (night ? 'N' : 'g'));
      g.vline(x + w - 1, ground - h, ground, night ? 'k' : 'G');
      for (let yy = ground - h + 2; yy < ground; yy += 2) for (let xx = x + 1; xx < x + w - 1; xx += 2) g.set(xx, yy, night ? (R() < 0.5 ? 'Y' : 'N') : 'c');
      g.vline(x + 2, ground - h - 3, ground - h, 'g');
    });
    if (look.tall) { const x = 60; g.rect(x, ground - look.tall, 7, look.tall, night ? 'N' : 'g'); g.rect(x + 7, ground - look.tall + 5, 2, 2, 'w'); for (let yy = ground - look.tall + 2; yy < ground; yy += 2) g.hline(x + 1, x + 5, yy, night ? 'Y' : 'c'); }
    if (look.pearl) { const x = 72; g.vline(x, ground - 34, ground, 'p'); g.vline(x + 1, ground - 30, ground, 'v'); g.ellipse(x + 0.5, ground - 22, 3.5, 3.5, 'P'); g.ellipse(x + 0.5, ground - 10, 4.5, 4.5, 'P'); g.ellipse(x + 0.5, ground - 30, 2, 2, 'P'); g.line(x - 6, ground, x, ground - 12, 'p'); g.line(x + 7, ground, x + 1, ground - 12, 'p'); }
    if (look.wheel) { const cx = 98, cy = ground - 12; for (let a = 0; a < 32; a++) { const t = a / 32 * Math.PI * 2; g.set(cx + Math.round(Math.cos(t) * 10), cy + Math.round(Math.sin(t) * 10), 'W'); } for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; g.line(cx, cy, cx + Math.round(Math.cos(t) * 9), cy + Math.round(Math.sin(t) * 9), 'w'); } g.line(cx, cy, cx - 5, ground, 'g'); g.line(cx, cy, cx + 5, ground, 'g'); }
    if (look.obelisk) { const x = 58; g.rect(x - 1, ground - 26, 3, 24, 'W'); g.rect(x - 4, ground - 4, 9, 4, 'w'); g.ellipse(x + 0.5, ground - 28, 1.8, 2.4, 'Y'); g.set(x, ground - 31, 'y'); }
    if (look.clock) { }
    if (look.tower === 'clock') { const x = 70; g.rect(x, ground - 22, 6, 22, 'W'); g.rect(x + 1, ground - 26, 4, 4, 'S'); g.ellipse(x + 3, ground - 17, 2, 2, 'Y'); g.set(x + 3, ground - 17, 'K'); g.rect(x - 1, ground - 23, 8, 1, 's'); g.set(x + 2, ground - 28, 'R'); g.set(x + 3, ground - 28, 'R'); g.set(x + 2, ground - 27, 'R'); g.set(x + 3, ground - 27, 'R'); }
    if (look.temple) { const x = look.prang ? 30 : 88; g.rect(x, ground - 7, 14, 7, 'R'); g.poly([[x - 3, ground - 7], [x + 7, ground - 13], [x + 17, ground - 7]], 'y'); g.hline(x - 3, x + 17, ground - 7, 'Y'); g.rect(x + 5, ground - 4, 4, 4, 'K'); }
    if (look.prang) { [80, 92, 104].forEach((x, i) => { const h = i === 1 ? 26 : 18; g.poly([[x - 4, ground], [x, ground - h], [x + 4, ground]], i === 1 ? 'S' : 's'); for (let yy = ground - h + 4; yy < ground; yy += 4) g.hline(x - 2, x + 2, yy, 'Y'); g.vline(x, ground - h - 3, ground - h, 'Y'); }); }
    for (let i = 0; i < (look.cranes || 0); i++) { const x = 18 + i * 30 + Math.floor(R() * 6); g.vline(x, ground - 24, ground, 'O'); g.vline(x + 1, ground - 24, ground, 'O'); g.hline(x - 8, x + 14, ground - 24, 'O'); g.hline(x - 8, x + 14, ground - 23, 'R'); g.line(x, ground - 30, x - 8, ground - 24, 'g'); g.line(x, ground - 30, x + 14, ground - 24, 'g'); g.vline(x, ground - 30, ground - 24, 'O'); g.vline(x + 10, ground - 22, ground - 14, 'g'); g.rect(x + 8, ground - 14, 5, 3, ['B', 'R', 'E'][i % 3]); }
    if (look.tanks) { [84, 96].forEach(x => { g.ellipse(x, ground - 4, 6, 5, 'w'); g.hline(x - 6, x + 6, ground - 6, 'g'); }); }
    for (let i = 0; i < (look.chimneys || 0); i++) { const x = 70 + i * 12; g.rect(x, ground - 20, 4, 20, 'r'); g.hline(x, x + 3, ground - 16, 'W'); g.ellipse(x + 4, ground - 24, 3, 2, night ? 'G' : 'w'); g.ellipse(x + 8, ground - 27, 4, 2, night ? 'G' : 'w'); }
    if (look.lanterns) for (let x = 6; x < 50; x += 6) { g.set(x, ground - 9, 'R'); g.set(x, ground - 8, 'Y'); g.hline(x - 3, x + 3, ground - 10, 'd'); }
    for (let i = 0; i < (look.palms || 0); i++) { const x = 8 + Math.floor(R() * (W - 16)); g.vline(x, ground - 10, ground, 'D'); g.set(x + 1, ground - 6, 'D'); ['e', 'E'].forEach((c, k) => { g.line(x, ground - 10 + k, x - 5, ground - 7 + k, c); g.line(x, ground - 10 + k, x + 5, ground - 7 + k, c); g.line(x, ground - 11, x - 2, ground - 13, 'E'); g.line(x, ground - 11, x + 3, ground - 13, 'E'); }); }
    // quay & water
    g.rect(0, ground, W, 2, night ? 'G' : 'g'); g.hline(0, W - 1, ground, 'w');
    if (!bare) {
      for (let y = ground + 2; y < H; y++) for (let x = 0; x < W; x++) g.set(x, y, bandAt(night ? ['N', 'k'] : ['B', 'n'], (y - ground - 2) / (H - ground - 2), x, y));
      for (let i = 0; i < 18; i++) { const x = Math.floor(R() * W), y = ground + 3 + Math.floor(R() * 4); g.hline(x, x + 2, y, night ? 'n' : 'b'); }
    }
    if (look.boats) { const bt = junk(0.5, 'y', 'D', 'd'); stampGrid(g, bt, 6, ground - 10); }
    return g;
  }
  function stampGrid(dst, src, ox, oy, flip) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.d[y * src.w + x]; if (c) dst.set(ox + (flip ? src.w - 1 - x : x), oy + y, c); }
  }

  root.ART_BASE = { PAL, Grid, fromRows, prng, dith, bandAt, BAYER, GOODS, ICONS, CAST, portrait, ship, junk, skiff, container, skyline, stampGrid, SHIP_ART };
})(typeof window !== 'undefined' ? window : globalThis);
