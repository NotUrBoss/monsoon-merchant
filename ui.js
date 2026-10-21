/* Monsoon Merchant — user interface. */
(function () {
  'use strict';
  const APP_VERSION = '1.4.0';
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
    setup: { captain: 'rahim', level: 0 }, lastCash: null, final: null, endRun: null,
    sea: { timer: null, raf: null, fast: false, frac: 0 }, seenNews: 0, installEvt: null, swWaiting: null,
    scroll: {}, legacyCat: 'Captains', importOpen: false,
  };

  /* ================= Sound & haptics ================= */
  const Sound = (function () {
    let ctx = null;
    function ac() {
      if (!meta.settings.sound) return null;
      try {
        if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { return null; }
      return ctx;
    }
    function tone(freq, dur, type, vol, when, slide) {
      const c = ac(); if (!c) return;
      const t = c.currentTime + (when || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol, when, freq) {
      const c = ac(); if (!c) return;
      const t = c.currentTime + (when || 0);
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq || 800, t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + dur);
    }
    return {
      unlock() { ac(); },
      tap() { tone(700, 0.04, 'triangle', 0.035); },
      buy() { tone(523, 0.07, 'triangle', 0.09); tone(784, 0.11, 'triangle', 0.09, 0.06); },
      sell(up) { if (up) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, i * 0.055)); else { tone(392, 0.14, 'triangle', 0.08); tone(311, 0.2, 'triangle', 0.08, 0.1); } },
      horn() { tone(98, 0.9, 'sawtooth', 0.045); tone(147, 0.9, 'sawtooth', 0.03); },
      bell() { tone(988, 1.1, 'sine', 0.09); tone(1480, 0.7, 'sine', 0.035, 0.01); tone(988, 0.9, 'sine', 0.05, 0.35); },
      storm() { noise(1.4, 0.22, 0, 900); tone(60, 1.0, 'sine', 0.07, 0.1); },
      alert() { tone(880, 0.12, 'square', 0.035); tone(660, 0.16, 'square', 0.035, 0.14); },
      good() { tone(659, 0.1, 'triangle', 0.08); tone(988, 0.16, 'triangle', 0.08, 0.08); },
      bad() { tone(220, 0.22, 'sawtooth', 0.04); tone(165, 0.3, 'sawtooth', 0.04, 0.12); },
      ach() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'sine', 0.07, i * 0.07)); },
      fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, i * 0.11)); },
      error() { tone(180, 0.12, 'square', 0.03); },
    };
  })();
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

  /* ================= Icons ================= */
  const sv = (body, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + body + '</svg>';
  const I = {
    market: sv('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>'),
    map: sv('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
    ship: sv('<path d="M3 15l2 5h14l2-5z"/><path d="M6 15V9h12v6"/><path d="M12 9V4"/><path d="M9 6h6"/>'),
    office: sv('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M3 12h18"/>'),
    back: sv('<path d="M15 18l-6-6 6-6"/>'),
    close: sv('<path d="M18 6L6 18M6 6l12 12"/>'),
    coins: sv('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>'),
    box: sv('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
    chart: sv('<path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/>'),
    menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    anchor: sv('<circle cx="12" cy="5" r="2"/><path d="M12 7v14"/><path d="M5 13a7 7 0 0014 0"/><path d="M8 10h8"/>'),
    wind: sv('<path d="M3 8h11a3 3 0 10-3-3"/><path d="M3 12h16a3 3 0 11-3 3"/><path d="M3 16h7"/>'),
    bank: sv('<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8"/><path d="M3 20h18"/>'),
    yard: sv('<path d="M4 21V8l6-4v17"/><path d="M10 9h6l4 3v9"/><path d="M14 13h2M14 17h2"/>'),
    storm: sv('<path d="M20 16.6A5 5 0 0018 7h-1.3A8 8 0 104 15"/><path d="M13 11l-4 6h6l-4 6"/>'),
    pirates: sv('<path d="M4 20L16 8"/><path d="M14 6l4-2-2 4"/><path d="M20 20L8 8"/><path d="M10 6L6 4l2 4"/><path d="M5 17l2 2M19 17l-2 2"/>'),
    engine: sv('<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.8-3.8a6 6 0 01-7.9 7.9l-6.9 6.9a2.1 2.1 0 01-3-3l6.9-6.9a6 6 0 017.9-7.9z"/>'),
    salvage: sv('<rect x="3" y="8" width="18" height="12" rx="1"/><path d="M7 8v12M12 8v12M17 8v12"/><path d="M2 5c3 2 5-2 8 0s5 2 8 0 3-1 4 0"/>'),
    trader: sv('<path d="M8 11l3 3 7-7"/><path d="M3 12l5 5 3-3"/><path d="M12 17l2 2 7-7"/>'),
    crew: sv('<path d="M4 11h16a8 8 0 01-16 0z"/><path d="M8 7c0-2 2-2 2-4M12 7c0-2 2-2 2-4M16 7c0-2 2-2 2-4"/>'),
    current: sv('<path d="M2 8c3 2 5-2 8 0s5 2 8 0 3-1 4 0"/><path d="M2 13c3 2 5-2 8 0s5 2 8 0 3-1 4 0"/><path d="M2 18c3 2 5-2 8 0s5 2 8 0 3-1 4 0"/>'),
    radio: sv('<rect x="3" y="10" width="18" height="11" rx="2"/><path d="M7 10l9-6"/><circle cx="8" cy="15.5" r="2"/><path d="M14 14h4M14 17h4"/>'),
    customs: sv('<path d="M9 3h6l1 4H8z"/><rect x="5" y="7" width="14" height="14" rx="2"/><path d="M9 12h6M9 16h4"/>'),
    flame: sv('<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-4 3 1-3 0-5-2-7-1 4-4 6-4 11 0 5 3 9 7 9z"/>'),
    star: sv('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
    lock: sv('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
    check: sv('<path d="M5 12l5 5 9-10"/>'),
    info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    trophy: sv('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 01-10 0z"/><path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3"/>'),
    spark: sv('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>'),
    calendar: sv('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    play: sv('<path d="M7 4l13 8-13 8z"/>'),
    fast: sv('<path d="M3 5l9 7-9 7z"/><path d="M12 5l9 7-9 7z"/>'),
    plus: sv('<path d="M12 5v14M5 12h14"/>'),
    minus: sv('<path d="M5 12h14"/>'),
    up: sv('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    down: sv('<path d="M12 5v14M5 12l7 7 7-7"/>'),
    rumour: sv('<path d="M21 12a8 8 0 01-11.6 7.1L4 21l1.9-5.4A8 8 0 1121 12z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>'),
    news: sv('<path d="M4 5h13v14H6a2 2 0 01-2-2z"/><path d="M17 9h3v8a2 2 0 01-2 2"/><path d="M8 9h5M8 13h5"/>'),
    sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    sound: sv('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>'),
    help: sv('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17v.01"/>'),
    download: sv('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
    flag: sv('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    shield: sv('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    skull: sv('<path d="M12 3a8 8 0 00-5 14.2V20h10v-2.8A8 8 0 0012 3z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M10 20v-2M14 20v-2"/>'),
  };
  const GC = { rice: '#EADFB8', palm: '#F2B84B', rubber: '#A9B6C3', steel: '#86A6C6', coffee: '#CF9264', electronics: '#6FB6FF', durian: '#A8D86A', coal: '#8A94A3' };
  const GICON = {
    rice: '<svg viewBox="0 0 24 24"><path d="M3 11h18a9 9 0 01-18 0z" fill="currentColor" opacity=".9"/><ellipse cx="8" cy="8.5" rx="1.3" ry="2" transform="rotate(-30 8 8.5)" fill="currentColor"/><ellipse cx="12" cy="7" rx="1.3" ry="2" fill="currentColor"/><ellipse cx="16" cy="8.5" rx="1.3" ry="2" transform="rotate(30 16 8.5)" fill="currentColor"/></svg>',
    palm: '<svg viewBox="0 0 24 24"><path d="M12 2.5c3.5 5 6.5 8.5 6.5 12a6.5 6.5 0 01-13 0c0-3.5 3-7 6.5-12z" fill="currentColor"/><path d="M9 15a3 3 0 003 3" stroke="#0B1726" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".55"/></svg>',
    rubber: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="4" fill="#0B1726" opacity=".75"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="#0B1726" stroke-width="1.5" opacity=".6"/></svg>',
    steel: '<svg viewBox="0 0 24 24"><path d="M4 4h16v4h-6v8h6v4H4v-4h6V8H4z" fill="currentColor"/></svg>',
    coffee: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="7" ry="9.5" transform="rotate(25 12 12)" fill="currentColor"/><path d="M9.5 4.5c2.5 3 2 5.5 1.5 7.5s-1 4.5 1.5 7.5" stroke="#0B1726" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".6"/></svg>',
    electronics: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="#0B1726" opacity=".55"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    durian: '<svg viewBox="0 0 24 24"><path d="M12 3l1.5 2.5L16 4l.5 3 3 .5-1.5 2.5L20.5 12 18 13.5l1.5 2.5-3 .5-.5 3-2.5-1.5L12 21l-1.5-3L8 19.5l-.5-3-3-.5L6 13.5 3.5 12 6 10 4.5 7.5l3-.5L8 4l2.5 1.5z" fill="currentColor"/><path d="M12 1.5v3" stroke="#6b8f3a" stroke-width="2" stroke-linecap="round"/></svg>',
    coal: '<svg viewBox="0 0 24 24"><path d="M3 17l3-6 4 1 2-5 5 2 3 5-2 5H5z" fill="currentColor"/><path d="M10 12l2 4M17 9l-2 5" stroke="#0B1726" stroke-width="1.4" opacity=".5"/></svg>',
  };
  const gIcon = (g, cls) => '<span class="gi ' + (cls || '') + '" style="--c:' + GC[g] + '">' + GICON[g] + '</span>';
  const CAPT_COLORS = { rahim: '#2EC4B6', meiling: '#FF8FB1', teoh: '#6FB6FF', kumar: '#F2B84B', siti: '#B794F6', wong: '#A8D86A' };
  function captAvatar(id, size) {
    const c = MM.CAPTAINS[id], col = CAPT_COLORS[id];
    const ini = c.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    return '<span class="avatar" style="--c:' + col + ';--s:' + (size || 44) + 'px"><b>' + esc(ini) + '</b></span>';
  }
  const EV_ICON = { storm: 'storm', pirates: 'pirates', engine: 'engine', salvage: 'salvage', trader: 'trader', crew: 'crew', current: 'current', radio: 'radio', customs: 'customs' };

  /* ================= Toasts ================= */
  function toast(text, kind) {
    const host = document.getElementById('toasts'); if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = (kind === 'ach' ? I.star : kind === 'bad' ? I.info : kind === 'good' ? I.check : I.info) + '<span>' + esc(text) + '</span>';
    host.appendChild(el);
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
    sea: 'Each day at sea costs running costs. Storms and pirates can strike. Insurance pays back 80% of cargo you lose.',
  };
  function tip(id) {
    if (!meta.settings.tips || meta.tips[id]) return '';
    return '<div class="tip">' + I.info + '<p>' + esc(TIPS[id]) + '</p><button class="tip-ok" data-a="tip-ok" data-id="' + id + '">Got it</button></div>';
  }

  /* ================= Map ================= */
  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  let streakCache = null;
  function windStreaks() {
    if (streakCache) return streakCache;
    const polys = Object.keys(MAP.LAND).map(k => MAP.LAND[k].map(p => MAP.proj(p[0], p[1])));
    const out = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let tries = 0;
    while (out.length < 26 && tries++ < 600) {
      const x = 30 + rnd() * (MAP.W - 60), y = 30 + rnd() * (MAP.H - 60);
      if (polys.some(pl => pointInPoly(x, y, pl))) continue;
      if (out.some(o => Math.hypot(o[0] - x, o[1] - y) < 70)) continue;
      out.push([x, y, rnd()]);
    }
    streakCache = out;
    return out;
  }
  function mapDefs() {
    return '<defs>' +
      '<radialGradient id="seaG" cx="55%" cy="45%" r="75%"><stop offset="0" stop-color="#103051"/><stop offset="1" stop-color="#0A1B2E"/></radialGradient>' +
      '<linearGradient id="landG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A4559"/><stop offset="1" stop-color="#20374A"/></linearGradient>' +
      '<pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#1B3B5C" stroke-width=".8" opacity=".55"/></pattern>' +
      '</defs>';
  }
  function mapSVG(opts) {
    const s = run;
    const vb = opts.viewBox || [0, 0, MAP.W, MAP.H];
    const scale = vb[2] / MAP.W;
    let h = '<svg class="map" viewBox="' + vb.map(v => Math.round(v * 10) / 10).join(' ') + '" preserveAspectRatio="xMidYMid meet"' + (opts.interactive ? ' data-a="map"' : '') + ' role="img" aria-label="Sea chart">';
    h += mapDefs();
    h += '<rect x="-50" y="-50" width="' + (MAP.W + 100) + '" height="' + (MAP.H + 100) + '" fill="url(#seaG)"/>';
    h += '<rect width="' + MAP.W + '" height="' + MAP.H + '" fill="url(#grid)"/>';
    // wind streaks
    const k = Math.SQRT1_2, ph = s.monsoon.phase;
    const dx = ph === 'NE' ? -k : k, dy = ph === 'NE' ? k : -k;
    h += '<g class="streaks' + (reduceMotion() ? ' still' : '') + '">';
    windStreaks().forEach(([x, y, r]) => {
      h += '<path d="M' + (x - dx * 16).toFixed(1) + ',' + (y - dy * 16).toFixed(1) + 'L' + (x + dx * 16).toFixed(1) + ',' + (y + dy * 16).toFixed(1) + '" style="animation-delay:-' + (r * 3).toFixed(2) + 's"/>';
    });
    h += '</g>';
    h += '<g class="land">' + MAP.landPaths().map(d => '<path d="' + d + '"/>').join('') + '</g>';
    h += '<g class="lanes" style="stroke-width:' + (1.3 * scale).toFixed(2) + '">' + MM.EDGES.map(([a, b]) => { const A = MAP.nodeXY(MM, a), B = MAP.nodeXY(MM, b); return '<line x1="' + A[0].toFixed(1) + '" y1="' + A[1].toFixed(1) + '" x2="' + B[0].toFixed(1) + '" y2="' + B[1].toFixed(1) + '"/>'; }).join('') + '</g>';
    if (opts.route) {
      const r = MM.route(opts.route.from, opts.route.to);
      const pts = MAP.routePoints(MM, r);
      h += '<path class="route-glow" d="' + MAP.polyD(pts) + '" style="stroke-width:' + (9 * scale).toFixed(2) + '"/>';
      h += '<path class="route" d="' + MAP.polyD(pts) + '" style="stroke-width:' + (3 * scale).toFixed(2) + ';stroke-dasharray:' + (8 * scale).toFixed(2) + ' ' + (7 * scale).toFixed(2) + ';--off:' + (-30 * scale).toFixed(2) + 'px"/>';
    }
    // contract destinations
    const dests = {}; s.contracts.forEach(c => { dests[c.dest] = true; });
    MM.PORT_IDS.forEach(p => {
      const [x, y] = MAP.nodeXY(MM, p);
      const avail = s.ports.indexOf(p) >= 0;
      const here = s.phase !== 'sea' && s.port === p;
      const sel = opts.selected === p;
      const cls = ['port', avail ? '' : 'locked', here ? 'here' : '', sel ? 'sel' : '', dests[p] ? 'dest' : ''].join(' ');
      const L = MAP.LABELS[p];
      const r = (here ? 8.5 : 7) * Math.max(scale, 0.45);
      h += '<g class="' + cls + '">';
      if (here && !reduceMotion()) h += '<circle class="pulse" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r * 1.9).toFixed(1) + '"/>';
      if (dests[p]) h += '<circle class="ring" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r * 1.7).toFixed(1) + '" style="stroke-width:' + (2 * scale).toFixed(2) + '"/>';
      h += '<circle class="dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" style="stroke-width:' + (2.5 * scale).toFixed(2) + '"/>';
      h += '<text x="' + (x + L[0] * scale).toFixed(1) + '" y="' + (y + L[1] * scale).toFixed(1) + '" text-anchor="' + L[2] + '" style="font-size:' + (17 * Math.max(scale, 0.5)).toFixed(1) + 'px;stroke-width:' + (4 * Math.max(scale, 0.5)).toFixed(1) + 'px">' + esc(pShort(p)) + '</text>';
      h += '</g>';
    });
    if (opts.ship) {
      h += '<g class="ship-mk" id="shipMk"><g style="transform:scale(' + (Math.max(scale, 0.35)).toFixed(3) + ')"><path d="M-13,-5 L9,-5 L15,0 L9,5 L-13,5 Z" class="hull"/><path d="M-6,-5 L-6,-14 L4,-5 Z" class="sail"/></g></g>';
    }
    h += '</svg>';
    return h;
  }
  function seaViewBox(from, to) {
    const r = MM.route(from, to);
    const pts = MAP.routePoints(MM, r);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    const pad = 60;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    let w = x1 - x0, h = y1 - y0;
    const aspect = 1.05; // height / width of the sea map box
    const minW = 300;
    if (w < minW) { x0 -= (minW - w) / 2; w = minW; }
    if (h / w < aspect) { const nh = w * aspect; y0 -= (nh - h) / 2; h = nh; } else { const nw = h / aspect; x0 -= (nw - w) / 2; w = nw; }
    x0 = Math.max(-40, Math.min(x0, MAP.W + 40 - w));
    y0 = Math.max(-40, Math.min(y0, MAP.H + 40 - h));
    return [x0, y0, w, h];
  }
  function placeShip(frac) {
    const el = document.getElementById('shipMk'); if (!el || !run || !run.voyage) return;
    const pts = MAP.routePoints(MM, MM.route(run.voyage.from, run.voyage.to));
    const p = MAP.pointAlong(pts, frac);
    const flip = Math.abs(p.angle) > 90;
    el.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + (flip ? p.angle + 180 : p.angle).toFixed(1) + ')' + (flip ? ' scale(-1,1)' : ''));
  }
  function animateShip(toFrac, ms) {
    cancelAnimationFrame(UI.sea.raf);
    const from = UI.sea.frac;
    if (reduceMotion() || ms <= 0) { UI.sea.frac = toFrac; placeShip(toFrac); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      UI.sea.frac = from + (toFrac - from) * k;
      placeShip(UI.sea.frac);
      if (k < 1) UI.sea.raf = requestAnimationFrame(step);
    };
    UI.sea.raf = requestAnimationFrame(step);
  }

  /* ================= Shared bits ================= */
  function topbar(title, backAction, right) {
    return '<header class="topbar"><button class="icon-btn" data-a="' + (backAction || 'go-title') + '" aria-label="Back">' + I.back + '</button><h2>' + esc(title) + '</h2><div class="topbar-right">' + (right || '') + '</div></header>';
  }
  function windChip(s) {
    const days = s.monsoon.shifted ? null : s.monsoon.forecast - s.day;
    const arrow = s.monsoon.phase === 'NE' ? 'ne' : 'sw';
    let sub = '';
    if (days !== null) sub = s.level >= 10 ? '?' : days > 0 ? '~' + days + 'd' : 'now';
    return '<button class="chip wind ' + arrow + '" data-a="wind-info"><span class="arrow">' + I.up + '</span><b>' + s.monsoon.phase + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  }
  function hud() {
    const s = run;
    const nw = MM.netWorth(s), debt = s.bank + s.along;
    const used = MM.cargoUsed(s), cap = MM.shipCap(s);
    const loc = s.phase === 'sea' ? pShort(s.voyage.from) + ' → ' + pShort(s.voyage.to) : (pName(s.port).length > 12 ? pShort(s.port) : pName(s.port));
    return '<header class="hud">' +
      '<div class="hud-r1"><button class="menu-btn" data-a="menu" aria-label="Menu">' + I.menu + '</button><div class="loc">' + (s.phase === 'sea' ? I.ship : I.anchor) + '<span>' + esc(loc) + '</span></div>' + windChip(s) +
      '<button class="day" data-a="season-info"><span>Day <b>' + s.day + '</b>/' + s.maxDays + '</span><i style="width:' + Math.min(100, (s.day / s.maxDays) * 100).toFixed(0) + '%"></i></button></div>' +
      '<div class="hud-r2">' +
      '<div class="stat cash">' + I.coins + '<div><small>Cash</small><b id="hudCash" class="' + (s.cash < 0 ? 'neg' : '') + '">' + rm(s.cash) + '</b></div></div>' +
      '<div class="stat">' + I.box + '<div><small>Hold</small><b>' + num(used) + '<span class="dim">/' + num(cap) + ' t</span></b></div></div>' +
      '<div class="stat worth">' + I.chart + '<div><small>Net worth</small><b>' + rm(nw) + '</b></div>' + (debt > 0 ? '<span class="debt-badge">owes ' + rm(debt).replace('RM ', '') + '</span>' : '') + '</div>' +
      '</div></header>';
  }
  function tabs() {
    const s = run;
    const officeDot = s.offers.length > 0 || s.news.some(n => n.id > UI.seenNews && n.day <= s.day && n.kind === 'rumour');
    const shipDot = MM.PORTS[s.port].yard && s.ship.cond < 60;
    const t = (id, icon, label, dot) => '<button class="tab ' + (UI.tab === id ? 'on' : '') + '" data-a="tab" data-id="' + id + '"' + (UI.tab === id ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span>' + (dot ? '<i class="dot"></i>' : '') + '</button>';
    return '<nav class="tabs">' + t('market', I.market, 'Market') + t('map', I.map, 'Map') + t('ship', I.ship, 'Ship', shipDot) + t('office', I.office, 'Office', officeDot) + '</nav>';
  }
  function ageLabel(age) { return age <= 0 ? 'today' : age === 1 ? '1 day old' : age + ' days old'; }
  function ageClass(age) { return age <= 1 ? 'fresh' : age <= 5 ? 'aging' : 'stale'; }

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
      if (UI.installEvt) install = '<button class="install" data-a="install">' + I.download + '<span>Install the app</span></button>';
      else if (iOS) install = '<div class="install-hint">' + I.download + '<span>To install: tap <b>Share</b>, then <b>Add to Home Screen</b>.</span></div>';
    }
    return '<div class="screen title-screen">' +
      '<div class="title-sky"><div class="logo"><h1><span>Monsoon</span><span>Merchant</span></h1><p>Buy low. Sail far. Beat the wind.</p></div>' +
      '<div class="title-scene" aria-hidden="true"><div class="sun"></div>' +
      '<svg class="title-ship" viewBox="0 0 160 110"><path d="M22 78 L138 78 Q 134 92 118 98 L 40 98 Q 26 92 22 78 Z" fill="#0B1726"/><rect x="78" y="14" width="4" height="66" fill="#0B1726"/><rect x="50" y="34" width="3.5" height="46" fill="#0B1726"/><path d="M82 18 Q 108 28 120 42 L 116 76 L 82 76 Z" fill="#14294A" stroke="#F2B84B" stroke-width="2.5" stroke-linejoin="round"/><path d="M82 32 Q 102 36 118 40 M82 46 Q 102 50 118 52 M82 60 Q 102 64 117 64" stroke="#F2B84B" stroke-width="2" fill="none" opacity=".85"/><path d="M53 38 Q 70 44 77 56 L 75 76 L 53 76 Z" fill="#14294A" stroke="#F2B84B" stroke-width="2.2" stroke-linejoin="round"/><path d="M53 52 Q 65 55 76 58 M53 64 Q 65 67 75 68" stroke="#F2B84B" stroke-width="1.8" fill="none" opacity=".85"/></svg>' +
      '<svg class="waves" viewBox="0 0 400 60" preserveAspectRatio="none"><path class="w1" d="M0 22 Q50 8 100 22 T200 22 T300 22 T400 22 T500 22 V60 H0Z"/><path class="w2" d="M0 34 Q50 22 100 34 T200 34 T300 34 T400 34 T500 34 V60 H0Z"/><path class="w3" d="M0 46 Q50 36 100 46 T200 46 T300 46 T400 46 T500 46 V60 H0Z"/></svg></div></div>' +
      '<div class="title-bottom"><div class="title-actions">' +
      (storageWarning ? '<p class="warnline" role="status">Saving failed on this device. Copy a backup before closing the game.</p>' : '') +
      (UI.swWaiting ? '<button class="update" data-a="sw-update">' + I.spark + '<span>New version ready. <b>Tap to update</b></span></button>' : '') +
      (normal ? '<button class="btn primary big cont" data-a="continue" data-slot="normal"><span>Continue season</span><small>Day ' + normal.day + '/' + normal.maxDays + ' · ' + esc(normal.phase === 'sea' ? 'At sea' : pName(normal.port)) + ' · ' + rm(MM.netWorth(normal)) + '</small></button>' : '') +
      '<button class="daily-card builder-entry" data-a="builder"><div class="dc-l">' + I.spark + '</div><div class="dc-m"><b>Desktop Business Builder <span class="new-tag">PROTOTYPE</span></b><small>Build a district · set your strategy · watch it work</small></div><span aria-hidden="true">→</span></button>' +
      '<button class="daily-card network-entry company-entry" data-a="network"><div class="dc-l">' + I.play + '</div><div class="dc-m"><b>Play Monsoon Company <span class="new-tag">UNIFIED</span></b><small>Captain · manufacture · ship · deliver · one campaign</small></div><span aria-hidden="true">→</span></button>' +
      '<button class="btn ghost" data-a="new-season">' + I.play + '<span>Classic captain season</span></button>' +
      '<button class="daily-card" data-a="daily">' +
      '<div class="dc-l">' + I.calendar + '</div><div class="dc-m"><b>Daily Voyage</b><small>' + esc(prettyDate(key)) + (dailyLive ? ' · in progress, day ' + daily.day : dailyBest !== undefined ? ' · best ' + rm(dailyBest) : ' · same seas for everyone') + '</small></div>' +
      '<div class="dc-r ' + (streakNow > 0 ? 'live' : '') + '">' + I.flame + '<b>' + streakNow + '</b></div></button>' +
      '<div class="title-row">' +
      '<button class="tile" data-a="legacy">' + I.spark + '<span>Legacy</span><b>' + meta.lp + ' LP</b></button>' +
      '<button class="tile" data-a="ledger">' + I.trophy + '<span>Ledger</span><b>' + Object.keys(meta.ach).length + '/' + MM.ACH.length + '</b></button>' +
      '<button class="tile" data-a="settings">' + I.gear + '<span>Settings</span><b>&nbsp;</b></button>' +
      '</div>' + install +
      '</div><div class="version">v' + APP_VERSION + ' · ' + ('serviceWorker' in navigator && navigator.serviceWorker.controller ? 'works offline' : 'offline after first load') + '</div></div></div>';
  }

  function screenSetup() {
    const st = UI.setup;
    let h = '<div class="screen setup">' + topbar('New season') + '<main class="scroll">';
    h += '<section><h3 class="sec">Choose your captain</h3><div class="captains">';
    MM.CAPTAIN_IDS.forEach(id => {
      const c = MM.CAPTAINS[id];
      const locked = c.unlock && !meta.unlocks[c.unlock];
      const cost = locked ? MM.UNLOCK_BY_ID[c.unlock].cost : 0;
      h += '<button class="capt ' + (st.captain === id ? 'on' : '') + (locked ? ' locked' : '') + '" data-a="pick-capt" data-id="' + id + '" aria-pressed="' + (st.captain === id) + '">' + captAvatar(id, 46) +
        '<div><b>' + esc(c.name) + '</b><small>' + esc(c.title) + '</small><p>' + esc(c.desc) + '</p>' +
        (locked ? '<span class="lockline">' + I.lock + ' Unlock in Legacy · ' + cost + ' LP</span>' : '<span class="startline">Starts in ' + esc(pName(c.start)) + '</span>') + '</div></button>';
    });
    h += '</div></section>';
    h += '<section><h3 class="sec">Monsoon level</h3><div class="levels">';
    for (let n = 0; n <= 10; n++) {
      const locked = n > meta.levelMax;
      h += '<button class="lvl ' + (st.level === n ? 'on' : '') + (locked ? ' locked' : '') + '" data-a="pick-level" data-id="' + n + '" aria-label="Monsoon level ' + n + (locked ? ', locked' : '') + '" aria-pressed="' + (st.level === n) + '">' + (locked ? I.lock : n) + '</button>';
    }
    h += '</div>';
    const mods = MM.LEVELS.slice(1, st.level + 1).map(l => l.desc);
    h += '<div class="level-desc">' + (st.level === 0 ? '<p>Standard season. Finish as <b>Merchant</b> (RM 1.5M) or better to unlock level 1.</p>' : '<p>All of these apply:</p><ul>' + mods.map(m => '<li>' + esc(m) + '</li>').join('') + '</ul><p class="dim">Legacy earned ×' + (1 + 0.2 * st.level).toFixed(1) + '. Finish as Merchant or better to unlock the next level.</p>') + '</div></section>';
    const unl = meta.unlocks;
    let cash = 50000 + (unl.perk_cash1 ? 25000 : 0) + (unl.perk_cash2 ? 50000 : 0) + (unl.perk_cash3 ? 100000 : 0);
    if (st.level >= 9) cash = Math.max(30000, cash - 20000);
    h += '<section class="setup-sum"><div><small>Starting cash</small><b>' + rm(cash) + '</b></div><div><small>Season</small><b>' + (st.level >= 5 ? 52 : 60) + ' days</b></div><div><small>Ship</small><b>Old Coaster</b></div></section>';
    h += '</main><footer class="cta"><button class="btn primary big" data-a="start-season">' + I.play + '<span>Start season</span></button></footer></div>';
    return h;
  }

  function screenRun() {
    const s = run;
    let body = '';
    if (UI.tab === 'market') body = tabMarket();
    else if (UI.tab === 'map') body = tabMap();
    else if (UI.tab === 'ship') body = tabShip();
    else body = tabOffice();
    return '<div class="screen run">' + hud() + '<main class="scroll" id="scroller">' + body + '</main>' + tabs() + '</div>';
  }

  function portBanner(s) {
    const P = MM.PORTS[s.port];
    const prof = MM.portProfile(s.port, s.goods);
    const fac = (P.bank ? '<span class="fac">' + I.bank + 'Bank</span>' : '') + (P.yard ? '<span class="fac">' + I.yard + 'Shipyard</span>' : '');
    return '<section class="port-banner"><div class="pb-top"><h2>' + esc(P.name) + '</h2><span class="cc">' + P.cc + '</span>' + fac + '</div><p>' + esc(P.blurb) + '</p>' +
      '<div class="profile">' + (prof.exports.length ? '<span class="lab">Cheap here</span>' + prof.exports.map(g => '<span class="mini" style="--c:' + GC[g] + '">' + esc(gName(g)) + '</span>').join('') : '') +
      (prof.imports.length ? '<span class="lab">Pays well</span>' + prof.imports.map(g => '<span class="mini" style="--c:' + GC[g] + '">' + esc(gName(g)) + '</span>').join('') : '') + '</div></section>';
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
      h += '<div class="events">' + evs.map(e => '<div class="evline ' + e.kind + '">' + (e.kind === 'shortage' || e.kind === 'boom' ? I.up : I.down) + '<span>' + esc(e.headline) + '</span><small>until day ' + e.end + '</small></div>').join('') + '</div>';
    }
    h += '<ul class="goods">';
    MM.marketRows(s).forEach(r => {
      const tagCls = r.vsAvg <= -0.12 ? 'cheap' : r.vsAvg >= 0.12 ? 'dear' : 'flat';
      const ev = r.events.length ? '<span class="evtag ' + r.events[0].kind + '">' + (r.events[0].kind === 'shortage' ? 'Shortage' : r.events[0].kind === 'glut' ? 'Glut' : r.events[0].kind === 'boom' ? 'Boom' : 'Slump') + '</span>' : '';
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
    h += '<div class="map-box">' + mapSVG({ interactive: true, selected: UI.sheet && UI.sheet.type === 'port' ? UI.sheet.p : null }) +
      '<div class="map-legend"><span><i class="lg here"></i>You</span><span><i class="lg dest"></i>Contract</span><span><i class="lg lane"></i>Sea lane</span><span class="windnote">' + I.wind + (s.monsoon.phase === 'NE' ? 'Northeast monsoon: fast southwest' : 'Southwest monsoon: fast northeast') + '</span></div></div>';
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
    h += '<section class="shipcard"><div class="sc-top"><svg class="sc-art" viewBox="0 0 120 50"><path d="M6 30 L112 30 L100 44 L16 44 Z" fill="currentColor"/><rect x="30" y="18" width="40" height="12" fill="currentColor" opacity=".55"/><rect x="74" y="12" width="14" height="18" fill="currentColor" opacity=".8"/><path d="M80 12 V4" stroke="currentColor" stroke-width="3"/></svg>' +
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
        h += '<div class="ship-offer"><div class="so-main"><b>' + esc(o.name) + '</b><small>' + esc(o.desc) + '</small><div class="so-stats"><span>' + num(o.cap) + ' t</span><span>' + o.speed + ' kn</span><span>' + rm(o.daily) + '/day</span>' + (o.cold ? '<span>Refrigerated</span>' : '') + '</div></div>' +
          '<button class="btn sm ' + (up ? 'primary' : '') + '" data-a="buy-ship" data-id="' + o.id + '" ' + (!o.fits || s.cash < o.net ? 'disabled' : '') + '>' + (o.net >= 0 ? rm(o.net) : '+' + rm(-o.net)) + '</button></div>';
      });
      h += '</section>';
    }
    return h;
  }

  function newsItem(s, n) {
    const icon = n.kind === 'rumour' ? I.rumour : n.kind === 'monsoon' ? I.wind : n.kind === 'shortage' || n.kind === 'boom' ? I.up : n.kind === 'glut' || n.kind === 'bust' ? I.down : I.news;
    const age = s.day - n.day;
    let tag = '';
    if (n.kind === 'rumour' && s.captain === 'kumar') tag = '<span class="src ' + n.tag + '">' + (n.tag === 'solid' ? 'Kumar: solid source' : 'Kumar: shaky source') + '</span>';
    if (n.kind === 'rumour') tag = '<span class="src rum">Rumour</span>' + tag;
    if (n.kind === 'forecast') tag = '<span class="src rum">Forecast</span>';
    const live = n.ev && s.events.some(e => e.id === n.ev && s.day >= e.start && s.day <= e.end);
    return '<li class="news ' + n.kind + (n.id > (UI.prevSeen || 0) ? ' new' : '') + '">' + icon + '<div><p>' + esc(n.text) + '</p><small>' + (age <= 0 ? 'Today' : age === 1 ? 'Yesterday' : age + ' days ago') + (live ? ' · <b>happening now</b>' + (n.end ? ', until day ' + n.end : '') : '') + '</small>' + tag + '</div></li>';
  }
  function tabOffice() {
    const s = run;
    const P = MM.PORTS[s.port];
    let h = tip('office');
    // Contracts
    h += '<section><h3 class="sec">Contracts <small>' + s.contracts.length + '/2 active</small></h3>';
    if (!s.contracts.length && !s.offers.length) h += '<p class="empty">No contracts on offer here today.</p>';
    s.contracts.forEach(k => {
      const have = s.cargo[k.good] ? s.cargo[k.good].q : 0;
      const left = k.deadline - s.day;
      h += '<div class="contract active">' + gIcon(k.good, 'sm') + '<div><b>' + num(k.qty) + ' t ' + esc(gName(k.good)) + ' → ' + esc(pName(k.dest)) + '</b><small>Pays ' + num(k.pay) + '/t = <b>' + rm(k.qty * k.pay) + '</b> · due day ' + k.deadline + ' (' + (left >= 0 ? plural(left, 'day') + ' left' : 'late') + ')</small><small class="' + (have >= k.qty ? 'pos' : 'dim') + '">Aboard: ' + num(have) + '/' + num(k.qty) + ' t · penalty if missed ' + rm(k.penalty) + '</small></div></div>';
    });
    s.offers.forEach(o => {
      const norm = MM.GOODS[o.good].base * MM.PF[o.dest][o.good];
      h += '<div class="contract">' + gIcon(o.good, 'sm') + '<div><b>' + num(o.qty) + ' t ' + esc(gName(o.good)) + ' → ' + esc(pName(o.dest)) + '</b><small>Pays ' + num(o.pay) + '/t (' + pct(o.pay / norm - 1) + ' on usual) = <b>' + rm(o.qty * o.pay) + '</b></small><small>Deliver by day ' + o.deadline + ' · penalty ' + rm(o.penalty) + '</small></div><button class="btn sm primary" data-a="accept" data-id="' + o.id + '" ' + (s.contracts.length >= 2 ? 'disabled' : '') + '>Accept</button></div>';
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
    const feed = MM.newsFeed(s, 18);
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
    const vb = seaViewBox(v.from, v.to);
    const logs = s.log.filter(l => l.day > v.startDay).slice(0, 6);
    return '<div class="screen sea">' + hud() +
      '<div class="sea-map">' + mapSVG({ viewBox: vb, route: { from: v.from, to: v.to }, ship: true }) +
      '<div class="voyage-pill"><b>' + esc(pShort(v.from)) + ' → ' + esc(pShort(v.to)) + '</b><span>Day ' + Math.min(v.idx, v.days) + ' of ' + v.days + (v.insured ? ' · insured' : '') + '</span></div></div>' +
      '<div class="sea-bottom"><ul class="sealog">' + (logs.length ? logs.map(l => '<li class="' + l.kind + '"><small>Day ' + l.day + '</small><span>' + esc(l.text) + '</span></li>').join('') : '<li class="calm"><span>Fair winds. The crew settle into watches.</span></li>') + '</ul>' +
      tip('sea') +
      '<div class="sea-actions"><button class="btn ghost ' + (UI.sea.fast ? 'on' : '') + '" data-a="sea-fast">' + I.fast + '<span>' + (UI.sea.fast ? 'Fast' : 'Normal speed') + '</span></button></div></div></div>';
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
    h += '<section class="chart-card"><h3 class="sec">Net worth by day</h3>' + sparkline(s.hist.filter(p => p[0] < s.day).concat([[s.day, f.nw]]), 340, 90) + '</section>';
    h += '<section class="breakdown"><div><small>Cash</small><b>' + rm(f.cash - f.sold) + '</b></div><div><small>Cargo sold at the end</small><b>' + rm(f.sold) + '</b></div><div><small>Ship at trade-in</small><b>' + rm(f.ship) + '</b></div><div><small>Debts</small><b class="' + (f.debts > 0 ? 'neg' : '') + '">' + (f.debts > 0 ? '−' : '') + rm(f.debts) + '</b></div></section>';
    const st = s.st;
    h += '<section class="statgrid"><div><b>' + st.voyages + '</b><small>voyages</small></div><div><b>' + st.trades + '</b><small>trades</small></div><div><b>' + rm(st.bestTrade) + '</b><small>best trade</small></div><div><b>' + st.contracts + '</b><small>contracts</small></div><div><b>' + st.storms + '</b><small>storms</small></div><div><b>' + st.pirates + '</b><small>pirate run-ins</small></div></section>';
    h += '<section class="lp-card"><div class="lp-big">' + I.spark + '<b>+' + (f.lp + f.newAch.reduce((a, x) => a + x.lp, 0)) + '</b><span>Legacy points</span></div><ul>' +
      '<li><span>Season result' + (s.level ? ' ×' + (1 + 0.2 * s.level).toFixed(1) : '') + '</span><b>+' + f.lpBase + '</b></li>' +
      (f.streakBonus ? '<li><span>Daily streak bonus</span><b>+' + f.streakBonus + '</b></li>' : '') +
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
    h += '<section class="levels-info"><h3 class="sec">Monsoon levels</h3><p>Highest unlocked: <b>' + meta.levelMax + '</b> of 10. Finish your highest level as Merchant (RM 1.5M) or better to unlock the next. Each level adds a hazard and multiplies the Legacy you earn.</p></section>';
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
    h += '<section class="group">' + tog('sound', 'Sound', 'Little chimes and creaks.') + tog('haptics', 'Vibration', 'Android only. iPhones don’t allow it in web apps.') + tog('motion', 'Animations', 'Turn off for a calmer screen.') + tog('tips', 'Tips', 'Show beginner hints.') + '</section>';
    h += '<section class="group"><button class="link-row" data-a="help">' + I.help + '<span>How to play</span></button><button class="link-row" data-a="reset-tips">' + I.info + '<span>Show all tips again</span></button></section>';
    h += '<section class="group"><h3 class="sec">Captain backup</h3><p class="small dim">Copy your captain seasons, Daily Voyage and Legacy to keep them safe. Monsoon Company has its own Backup button inside that mode.</p><div class="row-actions"><button class="btn sm" data-a="export">' + I.download + '<span>Copy backup code</span></button><button class="btn sm ghost" data-a="import-open">Restore…</button></div>' +
      (UI.importOpen ? '<label for="importBox">Backup code</label><textarea id="importBox" placeholder="Paste a backup code here"></textarea><button class="btn sm primary" data-a="import">Restore from code</button>' : '') + '</section>';
    h += '<section class="group"><button class="link-row danger" data-a="reset">' + I.close + '<span>Erase captain progress</span></button></section>';
    h += '<p class="about">Monsoon Merchant v' + APP_VERSION + '. Made for offline play. No ads, no accounts, no tracking.</p>';
    h += '</main></div>';
    return h;
  }

  function screenHelp() {
    const sec = (t, b) => '<section class="help-sec"><h3>' + t + '</h3>' + b + '</section>';
    let h = '<div class="screen help">' + topbar('How to play', UI.helpBack || 'settings') + '<main class="scroll">';
    h += sec('The goal', '<p>You have one season (60 days) to turn an old coaster and RM 50,000 into as much as you can. Your final <b>net worth</b> is cash + cargo + your ship (at trade-in value) − debts.</p><p>Ranks: Deckhand, Bosun (RM 200k), Trader (600k), Merchant (1.5M), Towkay (4M), Tycoon (10M), Legend of the Straits (25M).</p>');
    h += sec('Trading', '<p>Each port makes some goods cheaply and pays well for others. Buy where it’s cheap, sail, sell where it’s dear. The % tag compares a price with the regional average.</p><p>Big trades move prices: buying pushes the price up, selling pushes it down. It recovers over a few days. Spread big cargoes across several ports and goods.</p>');
    h += sec('What you know', '<p>You only see live prices in the port you’re in. For other ports you see the prices from your last visit or <b>market report</b>, which can be days old. The Radio room upgrade gives live prices everywhere.</p>');
    h += sec('Rumours and news', '<p>Shortages and gluts are often rumoured a few days before they hit. Get there while it’s happening for big profits. Some rumours are false.</p>');
    h += sec('The monsoon', '<p>The northeast monsoon speeds ships sailing southwest; the southwest monsoon speeds ships sailing northeast. Around mid-season the monsoon turns, and routes that were quick become slow. The weeks around the change bring squalls, and the southwest monsoon brings typhoons to the South China Sea.</p>');
    h += sec('Risk', '<p>Storms and pirates can cost you cargo. Insurance pays back 80% of what you lose. Storms also damage the hull. Repair it at a shipyard, because at 0% she sinks.</p>');
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
      row('export', I.download, 'Copy backup code', 'Backs up captain seasons, Daily Voyage and Legacy. Monsoon Company uses its own Backup button.') +
      row('help-run', I.help, 'How to play', '') +
      row('toggle-sound', I.sound, 'Sound: ' + (meta.settings.sound ? 'on' : 'off'), '') +
      (s.phase === 'port' && !s.pending ? row('end-early', I.flag, 'End season now', 'Sell up here and score the season.', 'danger') : '') + '</div>', 'menu');
  }
  function infoSheet() {
    const c = UI.sheet;
    return sheetWrap('<header class="sh-head"><span class="ul-ic">' + (c.icon || I.info) + '</span><div><h3>' + esc(c.title) + '</h3></div><button class="icon-btn" data-a="close-sheet" aria-label="Close">' + I.close + '</button></header><div class="blurb">' + c.html + '</div><button class="btn primary big" data-a="close-sheet">OK</button>', 'confirm');
  }

  function eventModal() {
    const e = run.pending;
    const ic = I[EV_ICON[e.type]] || I.info;
    return modalWrap('<div class="ev-art ev-' + e.type + '">' + ic + '</div><h3>' + esc(e.title) + '</h3><p>' + esc(e.text) + '</p><div class="choices">' +
      e.choices.map(c => '<button class="choice" data-a="choose" data-id="' + c.id + '" ' + (c.disabled ? 'disabled' : '') + '><b>' + esc(c.label) + '</b>' + (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') + '</button>').join('') + '</div>', 'event ev-' + e.type);
  }
  function resultModal() {
    const m = UI.modal;
    return modalWrap('<div class="ev-art ' + m.tone + '">' + (m.tone === 'good' ? I.check : m.tone === 'bad' ? I.info : I[EV_ICON[m.evType]] || I.info) + '</div><h3>' + esc(m.title) + '</h3><p>' + esc(m.text) + '</p><button class="btn primary big" data-a="result-ok">Continue</button>', 'result ' + m.tone);
  }
  function arrivalModal() {
    const r = UI.modal.rep, s = run;
    let h = '<div class="ev-art arrive">' + I.anchor + '</div><h3>' + esc(pName(r.port)) + '</h3><p class="sub">Day ' + r.day + ' · port fee ' + rm(r.fee) + '</p>';
    if (r.delivered.length) h += '<ul class="arr-list">' + r.delivered.map(d => '<li class="pos">' + I.check + '<span>Contract delivered: ' + num(d.qty) + ' t ' + esc(gName(d.good)) + ' for <b>' + rm(d.pay) + '</b></span></li>').join('') + '</ul>';
    if (r.lines.length) h += '<ul class="arr-list">' + r.lines.map(l => '<li>' + I.info + '<span>' + esc(l) + '</span></li>').join('') + '</ul>';
    const ev = [];
    s.goods.forEach(g => MM.activeEvents(s, s.port, g).forEach(e => ev.push(e)));
    if (ev.length) h += '<ul class="arr-list">' + ev.map(e => '<li class="' + (e.kind === 'shortage' || e.kind === 'boom' ? 'pos' : 'warn') + '">' + (e.kind === 'shortage' || e.kind === 'boom' ? I.up : I.down) + '<span>' + esc(e.headline) + '</span></li>').join('') + '</ul>';
    const held = Object.keys(s.cargo);
    if (held.length) {
      h += '<ul class="arr-list">' + held.map(g => { const c = s.cargo[g], sp = MM.sellPrice(s, s.port, g); const m = sp / c.cost - 1; return '<li>' + gIcon(g, 'xs') + '<span>' + esc(gName(g)) + ' sells for ' + num(sp) + ' here <b class="' + (m >= 0 ? 'pos' : 'neg') + '">' + pct(m) + '</b> on cost</span></li>'; }).join('') + '</ul>';
    }
    h += '<button class="btn primary big" data-a="ashore">Go ashore</button>';
    return modalWrap(h, 'arrival');
  }
  function sunkModal() {
    return modalWrap('<div class="ev-art bad">' + I.storm + '</div><h3>She’s gone down</h3><p>' + esc(UI.modal.text) + '</p><button class="btn primary big" data-a="finish">Count what’s left</button>', 'result bad');
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
    }
    host.innerHTML = h;
    host.className = h ? 'open' : '';
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
    if (UI.screen === 'network' || UI.screen === 'builder') return;
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
    screenHost.innerHTML = h;
    UI.renderedKey = UI.screen + ':' + (UI.screen === 'run' ? UI.tab : '');
    const nsc = document.querySelector('#screen .scroll');
    if (nsc && UI.scroll[UI.renderedKey]) nsc.scrollTop = UI.scroll[UI.renderedKey];
    renderOverlay(screenFocus);
    if (!document.getElementById('overlay').classList.contains('open') && (screenHadFocus || (oldKey && oldKey !== UI.renderedKey))) focusWithin(screenHost, screenFocus);
    if (UI.screen === 'sea' && run && run.voyage) placeShip(UI.sea.frac);
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
      const got = MM.checkAch(run, meta, false);
      if (got.length) { Sound.ach(); buzz([20, 40, 20]); got.forEach(a => toast('Achievement: ' + a.name + ' · +' + a.lp + ' Legacy', 'ach')); }
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
    const pill = document.querySelector('.voyage-pill span');
    if (pill && s.voyage) pill.textContent = 'Day ' + Math.min(s.voyage.idx, s.voyage.days) + ' of ' + s.voyage.days + (s.voyage.insured ? ' · insured' : '');
    const logEl = document.querySelector('.sealog');
    if (logEl && s.voyage) {
      const logs = s.log.filter(l => l.day > s.voyage.startDay).slice(0, 6);
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
    const s = MM.newRun({ captain: st.captain, level: Math.min(st.level, meta.levelMax) }, meta);
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
    UI.sheet = { type: 'info', title: 'Daily Voyage', icon: I.calendar, html: '<p>The same seas, prices and storms for everyone today. Captain Rahim, standard rules' + (s.twist ? ', plus today’s twist:' : '.') + '</p>' + (s.twist ? '<p><b>' + esc(MM.TWISTS[s.twist].name) + '.</b> ' + esc(MM.TWISTS[s.twist].desc) + '</p>' : '') + '<p class="dim">Finish it on consecutive days to build your streak.</p>' };
    renderOverlay();
  }

  /* ================= Actions ================= */
  const A = {
    builder() {
      if (!window.MMBuilderUI || !window.MMBuilder) { toast('The business builder could not load. Reload the game and try again.', 'bad'); return; }
      stopSea(); stopShip(); UI.sheet = null; UI.modal = null; run = null; UI.slot = null;
      renderOverlay(); UI.screen = 'builder';
      window.MMBuilderUI.open({ root, onExit() { UI.screen = 'title'; render(); focusWithin(document.getElementById('screen')); } });
    },
    network() {
      if (!window.MMNetworkUI || !window.MMNetwork) { toast('Monsoon Company could not load. Reload the game and try again.', 'bad'); return; }
      stopSea(); stopShip(); UI.sheet = null; UI.modal = null; run = null; UI.slot = null;
      renderOverlay(); UI.screen = 'network';
      window.MMNetworkUI.open({ root, onExit() { UI.screen = 'title'; render(); focusWithin(document.getElementById('screen')); } });
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
    'pick-level'(d) { const n = +d.id; if (n > meta.levelMax) { toast('Finish level ' + meta.levelMax + ' as Merchant or better to unlock', 'bad'); return; } UI.setup.level = n; render(); },
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
    toggle(d) { meta.settings[d.id] = !meta.settings[d.id]; saveMeta(); if (d.id === 'sound' && meta.settings.sound) Sound.good(); render(); },
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
      const svg = el.closest('svg'); if (!svg || !svg.getScreenCTM) return;
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      let best = null, bd = 1e9;
      MM.PORT_IDS.forEach(id => { const [x, y] = MAP.nodeXY(MM, id); const dd = Math.hypot(x - p.x, y - p.y); if (dd < bd) { bd = dd; best = id; } });
      if (best && bd < 55) { UI.sheet = { type: 'port', p: best }; Sound.tap(); renderOverlay(); }
    },
    port(d) { if (!MM.PORTS[d.p]) return; UI.sheet = { type: 'port', p: d.p }; Sound.tap(); renderOverlay(); },
    plan(d) { UI.sheet = { type: 'depart', p: d.p, insure: run.insurePref !== false }; renderOverlay(); },
    'toggle-ins'() { UI.sheet.insure = !UI.sheet.insure; renderOverlay(); },
    'cast-off'(d) {
      const r = MM.startVoyage(run, d.p, UI.sheet.insure);
      if (!r.ok) { toast(r.msg, 'bad'); Sound.error(); return; }
      UI.sheet = null; UI.screen = 'sea'; UI.sea.frac = 0; UI.lastCash = Math.round(run.cash);
      Sound.horn(); buzz(40);
      afterAction(); render(); seaLoop();
    },
    'sea-fast'() { UI.sea.fast = !UI.sea.fast; const b = document.querySelector('[data-a="sea-fast"]'); if (b) { b.classList.toggle('on', UI.sea.fast); b.querySelector('span').textContent = UI.sea.fast ? 'Fast' : 'Normal speed'; } },
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
    'close-sheet'() { UI.sheet = null; renderOverlay(); if (UI.screen === 'run' && UI.tab === 'map') render(); },
    menu() { UI.sheet = { type: 'menu' }; Sound.tap(); renderOverlay(); },
    'toggle-sound'() { meta.settings.sound = !meta.settings.sound; saveMeta(); if (meta.settings.sound) Sound.good(); renderOverlay(); },
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
