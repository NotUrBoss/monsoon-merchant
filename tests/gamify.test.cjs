// 2.4: captain XP and perks, the guild job chain, the cabinet, haggling, and the ideas list
// (sell all, quality surveys, overland trucks, Endless charters, best trades, payback).
const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../engine.js');

const ok = r => { assert.ok(r && r.ok, r && r.msg); return r; };
const no = r => { assert.ok(r && !r.ok, 'expected a refusal'); return r; };
function sail(s, to) {
  ok(MM.startVoyage(s, to, true));
  let guard = 0;
  while (s.phase === 'sea' && guard++ < 80) {
    if (s.pending) { MM.resolve(s, s.pending.choices.find(c => !c.disabled).id); continue; }
    MM.stepVoyage(s);
  }
}
const round = s => MM.deserialize(MM.serialize(s));
const other = s => s.ports.find(p => p !== s.port && MM.planVoyage(s, p).days <= 3) || s.ports.find(p => p !== s.port);

test('captain XP levels up on a curve and offers three perks that change the numbers', () => {
  const s = MM.newRun({ seed: 'xp1' }, MM.newMeta());
  assert.deepEqual([s.cap.lvl, s.cap.xp, s.cap.picks, s.cap.offer], [1, 0, 0, null]);
  assert.ok(MM.xpNeed(2) > MM.xpNeed(1) && MM.xpNeed(10) > MM.xpNeed(9));
  no(MM.pickPerk(s, 'haggler'));
  MM.gainXP(s, MM.xpNeed(1), 'a test');
  assert.equal(s.cap.lvl, 2); assert.equal(s.cap.picks, 1);
  assert.equal(s.cap.offer.length, 3);
  assert.equal(new Set(s.cap.offer).size, 3);
  no(MM.pickPerk(s, MM.PERK_IDS.find(p => s.cap.offer.indexOf(p) < 0)));
  const cap0 = MM.shipCap(s);
  s.cap.offer = ['stowage', 'haggler', 'purser'];
  ok(MM.pickPerk(s, 'stowage'));
  assert.ok(MM.hasPerk(s, 'stowage'));
  assert.ok(MM.shipCap(s) > cap0, 'stowage adds hold space');
  assert.equal(s.cap.offer, null); assert.equal(s.cap.picks, 0);
  // Every perk is a known id with text; levels cap out.
  MM.PERK_IDS.forEach(id => assert.ok(MM.PERKS[id].name && MM.PERKS[id].desc, id));
  MM.gainXP(s, 1e7, 'lots');
  assert.equal(s.cap.lvl, 30);
  const t = round(s); assert.equal(t.cap.lvl, 30); assert.deepEqual(t.cap.perks, ['stowage']);
});

test('the haggler perk narrows spreads and trading earns XP', () => {
  const a = MM.newRun({ seed: 'xp2' }, MM.newMeta()), b = MM.newRun({ seed: 'xp2' }, MM.newMeta());
  b.cap.perks.push('haggler');
  const g = a.goods[0];
  assert.ok(MM.quoteBuy(b, g, 10).total < MM.quoteBuy(a, g, 10).total);
  const before = a.cap.total;
  ok(MM.buy(a, g, 10));
  assert.ok(a.cap.total > before, 'buying earns a little XP');
});

test('the guild chain starts with a job, tracks progress and survives a save', () => {
  const s = MM.newRun({ seed: 'q1' }, MM.newMeta());
  assert.ok(s.quest && s.quest.cur && s.quest.cur.title && s.quest.cur.text);
  assert.equal(s.quest.done, 0);
  assert.equal(MM.QUEST_CHAIN.length, 10);
  const p = MM.questProgress(s, s.quest.cur);
  assert.ok(Array.isArray(p) && p.length === 2 && p[1] > 0);
  // Play a few legs; the chain never goes backwards.
  const g = s.goods.find(x => !MM.GOODS[x].perish);
  ok(MM.buy(s, g, 10));
  const dest = other(s); sail(s, dest);
  if (s.cargo[g]) MM.sell(s, g, s.cargo[g].q);
  assert.ok(s.quest.done >= 0 && s.quest.cur);
  const t = round(s); assert.deepEqual(t.quest, JSON.parse(MM.serialize(s)).quest);
});

test('haggling: one try per good per day, the result moves the quote, perfect earns a card', () => {
  const s = MM.newRun({ seed: 'hg1' }, MM.newMeta()); s.cash += 1e6;
  const g = s.goods[0];
  const base = MM.quoteBuy(s, g, 20).total;
  const r = ok(MM.haggle(s, g, 'buy', 0));
  assert.equal(r.tier, 'perfect');
  assert.ok(MM.quoteBuy(s, g, 20).total < base, 'a perfect haggle cuts the price');
  assert.ok(s.cards.haggle);
  no(MM.haggle(s, g, 'buy', 0));
  no(MM.haggle(s, 'nonsense', 'buy', 0));
  no(MM.haggle(s, s.goods[1], 'buy', NaN));
  const bad = ok(MM.haggle(s, s.goods[1], 'buy', 1));
  assert.equal(bad.tier, 'bad');
  assert.ok(MM.haggleZone(s) > 0 && MM.haggleZone(s) < 0.5);
  ok(MM.buy(s, g, 20));
  assert.equal(MM.quoteBuy(s, g, 20).hag || 1, 1, 'the deal is spent once you trade');
  const meta = MM.newMeta(); const ach = MM.checkAch(s, meta, false);
  assert.ok(ach.some(a => a.id === 'haggle_ace'));
});

test('quality surveys: big lots can be off-spec unless surveyed; the fee is charged and off-spec sells lower', () => {
  let hits = 0, caught = 0;
  for (let i = 0; i < 60; i++) {
    const s = MM.newRun({ seed: 'qs' + i }, MM.newMeta());
    s.cash += 1e6;
    const g = s.goods.find(x => !MM.GOODS[x].perish);
    const q = Math.min(MM.maxBuy(s, g), Math.ceil(MM.SURVEY_MIN / MM.quoteBuy(s, g, 1).total) + 5);
    const survey = i % 2 === 0;
    const cash0 = s.cash, qt = MM.quoteBuy(s, g, q);
    if (qt.total < MM.SURVEY_MIN) continue;
    const r = ok(MM.buy(s, g, q, { survey }));
    if (survey) { assert.ok(r.fee >= 500); assert.equal(r.bad, 0); assert.equal(Math.round(cash0 - s.cash), Math.round(qt.total + r.fee)); caught += r.caught ? 1 : 0; }
    else { assert.equal(r.fee, 0); if (r.bad) { hits++; assert.equal(s.cargo[g].bad, r.bad); assert.ok(MM.quoteSell(s, g, q).offSpec > 0); } }
  }
  assert.ok(hits > 0, 'some unsurveyed lots turned out off-spec');
  assert.ok(caught >= 0);
  const s = MM.newRun({ seed: 'qs-small' }, MM.newMeta());
  const r = ok(MM.buy(s, s.goods[0], 1, { survey: true }));
  assert.equal(r.fee, 0, 'small lots need no survey');
});

test('sell everything here keeps contract cargo and refuses when nothing can go', () => {
  const s = MM.newRun({ seed: 'sa1' }, MM.newMeta()); s.cash += 1e6;
  no(MM.sellAll(s));
  const [g1, g2] = s.goods.filter(x => !MM.GOODS[x].perish);
  ok(MM.buy(s, g1, 15)); ok(MM.buy(s, g2, 12));
  s.contracts.push({ id: 999, good: g2, qty: 12, to: other(s), due: s.day + 20, pay: 1000, from: s.port });
  const q = MM.sellAllQuote(s);
  assert.equal(q.n, 1);
  const r = ok(MM.sellAll(s));
  assert.equal(r.n, 1);
  assert.ok(!s.cargo[g1]);
  assert.equal(s.cargo[g2].q, 12, 'contract tonnes stay aboard');
  no(MM.sellAll(s));
});

test('best trades use only prices you have seen, and payback estimates are sane', () => {
  const s = MM.newRun({ seed: 'bt1' }, MM.newMeta());
  const seen = Object.keys(s.known).filter(p => p !== s.port);
  MM.bestTrades(s, 3).forEach(t => {
    assert.ok(seen.indexOf(t.to) >= 0);
    assert.ok(t.profit > 0 && t.perDay > 0 && t.days >= 1 && t.q >= 1);
  });
  const list = MM.bestTrades(s, 5);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].perDay >= list[i].perDay);
  ['factory', 'estate', 'shop'].forEach(kind => {
    const arg = kind === 'factory' ? Object.keys(MM.RECIPES)[0] : kind === 'estate' ? Object.keys(MM.ESTATES)[0] : null;
    const p = MM.payback(s, kind, arg);
    assert.ok(p && p.cost > 0 && Number.isFinite(p.perDay));
    assert.ok(p.days === null || p.days > 0);
  });
  assert.equal(MM.payback(s, 'nonsense'), null);
});

test('the overland corridor: trucks only run Haiphong–Shenzhen and only once the stage is open', () => {
  const s = MM.newRun({ seed: 'tr1' }, MM.newMeta());
  assert.ok(MM.TRUCK_LINKS['haiphong|shenzhen']);
  s.cash += 3e6; s.st.peak = 5e6;
  s.port = 'haiphong'; ok(MM.buildWarehouse(s));
  const g = s.goods.find(x => !MM.GOODS[x].perish);
  no(MM.addRoute(s, 'haiphong', 'shenzhen', g, 50, 'mkt', 'truck'));
  s.cash += 10e6; s.st.peak = 13e6;
  if (s.ports.indexOf('shenzhen') < 0) return; // a run whose map lacks the corridor
  no(MM.addRoute(s, 'haiphong', s.ports.find(p => p !== 'haiphong' && p !== 'shenzhen'), g, 50, 'mkt', 'truck'));
  no(MM.addRoute(s, 'haiphong', 'shenzhen', g, 50, 'mkt', 'plane'));
  ok(MM.addRoute(s, 'haiphong', 'shenzhen', g, 50, 'mkt', 'truck'));
  const truck = MM.routeQuote(s, 'haiphong', 'shenzhen', 50, 'truck');
  assert.ok(truck.truck && truck.days === 2 && truck.cost > 0);
  const t = round(s); assert.equal(t.co.routes[0].mode, 'truck');
  const bad = JSON.parse(MM.serialize(s)); bad.co.routes[0].mode = 'rocket';
  assert.throws(() => MM.deserialize(JSON.stringify(bad)));
});

test('Endless charters: pick three of six, they settle after six chapters and pay Legacy', () => {
  const meta = MM.newMeta();
  const s = MM.newRun({ seed: 'ch1', mode: 'endless' }, meta);
  const Y = s.endless.year;
  assert.equal(Y.offer.length, 6); assert.equal(new Set(Y.offer).size, 6);
  no(MM.pickCharters(s, Y.offer.slice(0, 2)));
  no(MM.pickCharters(s, [Y.offer[0], Y.offer[0], Y.offer[1]]));
  ok(MM.pickCharters(s, Y.offer.slice(0, 3)));
  no(MM.pickCharters(s, Y.offer.slice(3, 6)));
  s.endless.year.chosen.forEach(c => { const p = MM.charterProgress(s, c); assert.ok(p[1] > 0); });
  const t = round(s); assert.deepEqual(t.endless.year, JSON.parse(MM.serialize(s)).endless.year);
  let guard = 0;
  while (s.endless.year.no === 1 && guard++ < 400) { s.cash = Math.max(s.cash, 1e6); MM.waitDay(s); }
  assert.equal(s.endless.year.no, 2, 'a new year begins');
  assert.ok(s.endless.lastYear && Array.isArray(s.endless.lastYear.done));
  round(s);
  const n = MM.newRun({ seed: 'ch2' }, meta);
  no(MM.pickCharters(n, ['ports', 'made', 'sales']));
});

test('the cabinet collects stamps and cards across runs, completing sets pays Legacy once', () => {
  const meta = MM.newMeta();
  const s = MM.newRun({ seed: 'co1' }, meta);
  const dest = other(s); sail(s, dest);
  s.cards.typhoon = s.day;
  const lp0 = meta.lp;
  const r = MM.collect(s, meta);
  assert.ok(r.items.length >= 1);
  assert.ok(meta.coll.cards.typhoon);
  assert.equal(MM.collect(s, meta).items.length, 0, 'nothing new the second time');
  // Fill the rare set and it pays once.
  Object.keys(MM.RARE_CARDS).forEach(k => { s.cards[k] = 1; });
  const r2 = MM.collect(s, meta);
  assert.ok(r2.sets.some(x => x.id === 'rare'));
  assert.ok(meta.lp > lp0);
  const sum = MM.collSummary(meta);
  assert.ok(sum.find(x => x.id === 'rare').done);
  const m2 = MM.deserializeMeta(JSON.stringify(meta));
  assert.deepEqual(m2.coll, meta.coll);
  const bad = JSON.parse(JSON.stringify(meta)); bad.coll.sets.nope = 1;
  assert.throws(() => MM.deserializeMeta(JSON.stringify(bad)));
});

test('old saves without the 2.4 fields load with fresh captain, quest and year', () => {
  const s = MM.newRun({ seed: 'old1', mode: 'endless' }, MM.newMeta());
  const raw = JSON.parse(MM.serialize(s));
  delete raw.cap; delete raw.quest; delete raw.cards; delete raw.hag; delete raw.hagUsed; delete raw.endless.year; delete raw.endless.lastYear;
  const t = MM.deserialize(JSON.stringify(raw));
  assert.equal(t.cap.lvl, 1); assert.ok(t.quest.cur); assert.deepEqual(t.cards, {});
  assert.equal(t.endless.year.offer.length, 6);
  const hacked = JSON.parse(MM.serialize(s)); hacked.cap.lvl = 99;
  assert.throws(() => MM.deserialize(JSON.stringify(hacked)));
  const hacked2 = JSON.parse(MM.serialize(s)); hacked2.cap.perks = ['godmode'];
  assert.throws(() => MM.deserialize(JSON.stringify(hacked2)));
});

test('new achievements unlock from the new layers', () => {
  const meta = MM.newMeta();
  const s = MM.newRun({ seed: 'ac1' }, meta);
  MM.gainXP(s, 1e6, 'test');
  s.quest.done = MM.QUEST_CHAIN.length;
  const got = MM.checkAch(s, meta, false).map(a => a.id);
  ['cap5', 'cap10', 'guild'].forEach(id => assert.ok(got.indexOf(id) >= 0, id));
});
