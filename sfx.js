/* Monsoon Merchant — chiptune sound effects and a little sea shanty, synthesised with Web Audio. */
(function (root) {
  'use strict';
  let ctx = null, master = null, sfxBus = null, musicBus = null;
  let opts = { sound: () => true, music: () => true };
  function ac() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
        sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
        musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const NOTE = {};
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => { for (let o = 1; o <= 7; o++) NOTE[n + o] = 440 * Math.pow(2, (i - 9) / 12 + (o - 4)); });
  const hz = n => typeof n === 'number' ? n : NOTE[n];

  function tone(freq, t, dur, type, vol, bus, slide, duty) {
    const c = ctx; if (!c || !freq) return;
    const o = c.createOscillator(), g = c.createGain();
    if (type === 'pulse' && c.createPeriodicWave) {
      // narrow pulse wave for that NES lead sound
      const d = duty || 0.25, n = 24, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
      o.setPeriodicWave(c.createPeriodicWave(re, im));
    } else o.type = type === 'pulse' ? 'square' : type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(t, dur, vol, bus, lp, hp) {
    const c = ctx; if (!c) return;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); let v = 0; for (let i = 0; i < d.length; i++) { if (i % 4 === 0) v = Math.random() * 2 - 1; d[i] = v; } }
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp || lp || 4000;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus); s.start(t); s.stop(t + dur + 0.02);
  }
  function play(fn) { if (!opts.sound()) return; const c = ac(); if (!c) return; fn(c.currentTime + 0.01); }
  function arp(notes, step, type, vol, dur) { return t => notes.forEach((n, i) => tone(hz(n), t + i * step, dur || step * 1.1, type, vol)); }

  const S = {
    unlock() { ac(); if (opts.music()) Music.start(); },
    tap: () => play(t => tone(hz('A5'), t, 0.035, 'pulse', 0.18, null, null, 0.125)),
    cursor: () => play(t => tone(hz('E6'), t, 0.03, 'pulse', 0.12, null, null, 0.125)),
    buy: () => play(arp(['C5', 'G5'], 0.06, 'pulse', 0.2)),
    sell: up => play(up ? t => { ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => tone(hz(n), t + i * 0.055, 0.07, 'pulse', 0.2, null, null, 0.25)); tone(hz('C6'), t + 0.22, 0.16, 'square', 0.12); } : arp(['G4', 'D#4'], 0.11, 'pulse', 0.2, 0.14)),
    coin: () => play(t => { tone(hz('B5'), t, 0.06, 'square', 0.15); tone(hz('E6'), t + 0.06, 0.2, 'square', 0.15); }),
    horn: () => play(t => { tone(hz('D3'), t, 0.55, 'pulse', 0.22, null, null, 0.5); tone(hz('A3'), t, 0.55, 'triangle', 0.25); tone(hz('D3'), t + 0.62, 0.5, 'pulse', 0.2, null, null, 0.5); }),
    bell: () => play(t => { tone(hz('A5'), t, 0.5, 'triangle', 0.35); tone(hz('E6'), t, 0.3, 'pulse', 0.08, null, null, 0.125); tone(hz('A5'), t + 0.3, 0.6, 'triangle', 0.25); }),
    storm: () => play(t => { noise(t, 1.6, 0.5, null, 900); noise(t + 0.4, 1.2, 0.35, null, 400); tone(55, t, 0.9, 'triangle', 0.4, null, 0.6); }),
    thunder: () => play(t => { noise(t, 0.9, 0.6, null, 600); tone(45, t, 0.6, 'triangle', 0.35, null, 0.7); }),
    alert: () => play(t => { [0, 0.16, 0.32].forEach(d => tone(hz('E5'), t + d, 0.08, 'pulse', 0.18, null, null, 0.5)); }),
    cannon: () => play(t => { noise(t, 0.4, 0.6, null, 1200); tone(90, t, 0.3, 'square', 0.25, null, 0.4); }),
    good: () => play(arp(['E5', 'G#5', 'B5', 'E6'], 0.05, 'pulse', 0.18, 0.08)),
    bad: () => play(t => { tone(hz('E4'), t, 0.12, 'pulse', 0.2, null, null, 0.5); tone(hz('C4'), t + 0.13, 0.12, 'pulse', 0.2, null, null, 0.5); tone(hz('G#3'), t + 0.26, 0.3, 'pulse', 0.2, null, 0.95, 0.5); }),
    ach: () => play(t => { ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone(hz(n), t + i * 0.07, 0.09, 'pulse', 0.16, null, null, 0.25)); tone(hz('C7'), t + 0.3, 0.35, 'square', 0.1); }),
    fanfare: () => play(t => {
      const m = [['C5', 0, 0.12], ['C5', 0.15, 0.12], ['C5', 0.3, 0.12], ['C5', 0.45, 0.36], ['G#4', 0.85, 0.36], ['A#4', 1.25, 0.36], ['C5', 1.65, 0.2], ['A#4', 1.9, 0.12], ['C5', 2.05, 0.7]];
      m.forEach(([n, d, l]) => { tone(hz(n), t + d, l, 'pulse', 0.18, null, null, 0.25); tone(hz(n) / 2, t + d, l, 'triangle', 0.3); });
    }),
    error: () => play(t => tone(110, t, 0.12, 'square', 0.18)),
    splash: () => play(t => noise(t, 0.35, 0.3, null, 2500)),
    levelup: () => play(arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.045, 'pulse', 0.15, 0.06)),
  };

  /* ================= Music: an original shanty in D dorian ================= */
  // Each array element is one eighth note; '-' holds, '.' rests.
  const LEAD = [
    'D4', '-', 'F4', 'G4', 'A4', '-', 'A4', 'G4', 'F4', '-', 'D4', '-', 'E4', '-', 'C4', '-',
    'D4', '-', 'F4', 'G4', 'A4', '-', 'C5', 'A4', 'G4', '-', 'E4', '-', 'D4', '-', '-', '.',
    'A4', '-', 'A4', 'C5', 'D5', '-', 'C5', 'A4', 'G4', '-', 'A4', 'G4', 'F4', '-', 'D4', '-',
    'F4', '-', 'G4', 'A4', 'C5', '-', 'A4', 'G4', 'E4', '-', 'F4', 'E4', 'D4', '-', '-', '.',
  ];
  const CHORDS = ['Dm', 'C', 'Dm', 'C', 'F', 'C', 'Dm', 'Dm', 'F', 'Dm', 'C', 'Dm', 'F', 'C', 'Am', 'Dm'];
  const ROOT = { Dm: ['D2', 'A2', 'F3'], C: ['C2', 'G2', 'E3'], F: ['F2', 'C3', 'A3'], Am: ['A1', 'E2', 'C3'] };
  const Music = {
    on: false, timer: null, step: 0, next: 0,
    start() {
      if (this.on || !opts.music()) return;
      const c = ac(); if (!c) return;
      this.on = true; this.step = 0; this.next = c.currentTime + 0.1;
      const tempo = 112, dur = 60 / tempo / 2;
      const tick = () => {
        if (!ctx) return;
        while (this.next < ctx.currentTime + 0.25) { this.play(this.step, this.next, dur); this.next += dur; this.step = (this.step + 1) % LEAD.length; }
      };
      tick(); this.timer = setInterval(tick, 60);
    },
    stop() { this.on = false; clearInterval(this.timer); this.timer = null; },
    play(i, t, d) {
      const n = LEAD[i];
      if (n !== '-' && n !== '.') { let len = 1; while (LEAD[(i + len) % LEAD.length] === '-' && len < 4) len++; tone(hz(n), t, d * len * 0.92, 'pulse', 0.16, musicBus, null, 0.25); tone(hz(n) * 2, t, d * 0.5, 'pulse', 0.03, musicBus, null, 0.125); }
      const bar = Math.floor(i / 4) % CHORDS.length, beat = i % 4; // two bars of melody per 8 steps -> one chord per half bar
      const ch = ROOT[CHORDS[bar]];
      if (beat === 0) tone(hz(ch[0]), t, d * 1.6, 'triangle', 0.42, musicBus);
      if (beat === 2) tone(hz(ch[1]), t, d * 1.2, 'triangle', 0.32, musicBus);
      if (beat === 1 || beat === 3) tone(hz(ch[2]), t, d * 0.4, 'pulse', 0.05, musicBus, null, 0.5);
      if (i % 2 === 1) noise(t, 0.04, 0.08, musicBus, null, 6000);
      if (i % 8 === 0) { tone(150, t, 0.09, 'triangle', 0.5, musicBus, 0.3); }
      if (i % 8 === 4) noise(t, 0.09, 0.14, musicBus, 3000);
    },
  };
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });

  root.SFX = { S, Music, config(o) { opts = Object.assign(opts, o); }, ac };
})(typeof window !== 'undefined' ? window : globalThis);
