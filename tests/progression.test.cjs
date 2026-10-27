'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../engine.js');

function newSeason(options = {}) {
  const meta = MM.newMeta();
  return { meta, run: MM.newRun({ seed: 'progression-regression', ...options }, meta) };
}

function sailToPenang(run) {
  assert.equal(MM.startVoyage(run, 'penang', false).ok, true);
  for (let step = 0; run.phase === 'sea' && step < 100; step++) {
    if (run.pending) {
      const choices = run.pending.choices.filter(choice => !choice.disabled);
      const preference = ['push', 'run', 'fix', 'leave', 'decline', 'treat', 'pay', 'ok'];
      const choice = preference.map(id => choices.find(item => item.id === id)).find(Boolean) || choices[0];
      MM.resolve(run, choice.id);
    } else MM.stepVoyage(run);
  }
  assert.equal(run.phase, 'port');
  assert.equal(run.port, 'penang');
  assert.ok(run.st.daysAtSea > 0);
}

test('retiring twice on day one cannot farm Legacy or the season-completion achievement', () => {
  const meta = MM.newMeta();
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = MM.newRun({ seed: 'retirement-' + attempt }, meta);
    const result = MM.endSeason(run, meta);
    assert.equal(result.lp, 0);
    assert.equal(result.rewardEligible, false);
    assert.equal(result.newAch.some(achievement => achievement.id === 'first_season'), false);
  }
  assert.equal(meta.lp, 0);
  assert.equal(meta.ach.first_season, undefined);
});

test('waiting out the entire season without sailing earns no completion rewards', () => {
  const { run, meta } = newSeason();
  while (run.day < run.maxDays) assert.equal(MM.waitDay(run).ok, true);
  const result = MM.endSeason(run, meta);
  assert.equal(result.lp, 0);
  assert.equal(meta.lp, 0);
  assert.equal(meta.ach.first_season, undefined);
});

test('an early voyage earns a small prorated reward even when the player loses money', () => {
  const { run, meta } = newSeason();
  sailToPenang(run);
  assert.ok(MM.netWorth(run) < 70000);
  const result = MM.endSeason(run, meta);
  assert.equal(result.rewardEligible, true);
  assert.equal(result.lpBase, 1);
  assert.ok(result.lpBase < MM.seasonLP(result.nw, run.level));
  assert.ok(result.newAch.some(achievement => achievement.id === 'first_season'));
});

test('a season that includes a voyage retains its full existing payout at the scheduled end', () => {
  const { run, meta } = newSeason();
  sailToPenang(run);
  run.cash = 400000;
  while (run.day < run.maxDays) assert.equal(MM.waitDay(run).ok, true);
  const result = MM.endSeason(run, meta);
  assert.equal(result.rewardEligible, true);
  assert.equal(result.rewardFraction, 1);
  assert.equal(result.lpBase, MM.seasonLP(result.nw, run.level));
});

test('a shipwreck after genuine sea activity still earns Legacy despite negative net worth', () => {
  const { run, meta } = newSeason();
  assert.equal(MM.startVoyage(run, 'shenzhen', false).ok, true);
  MM.stepVoyage(run);
  // Model an insured or uninsured loss outcome after the first day at sea.
  run.cash = -5000;
  run.sunk = true;
  run.ship.cond = 0;
  run.phase = 'sunk';
  const result = MM.endSeason(run, meta);
  assert.ok(result.nw < 0);
  assert.equal(result.rewardEligible, true);
  assert.equal(result.lpBase, 1);
});

test('an abandoned daily start cannot establish a streak or a daily score', () => {
  const { run, meta } = newSeason({ mode: 'daily', dateKey: '2026-10-18' });
  const result = MM.endSeason(run, meta);
  assert.equal(result.lp, 0);
  assert.equal(result.streakBonus, 0);
  assert.equal(meta.daily.last, null);
  assert.equal(meta.daily.streak, 0);
  assert.deepEqual(meta.daily.plays, {});
  assert.deepEqual(meta.daily.best, {});
});

test('a completed daily voyage still records its score and daily participation', () => {
  const { run, meta } = newSeason({ mode: 'daily', dateKey: '2026-10-18' });
  sailToPenang(run);
  const result = MM.endSeason(run, meta);
  assert.equal(result.streakBonus, 0, 'the streak no longer pays a growing bonus');
  assert.equal(meta.daily.streak, 1);
  assert.equal(meta.daily.total, 1);
  assert.equal(meta.daily.plays['2026-10-18'], 1);
  assert.equal(meta.daily.best['2026-10-18'], result.nw);
});

test('finalizing the same completed run twice never pays twice', () => {
  const { run, meta } = newSeason();
  sailToPenang(run);
  const first = MM.endSeason(run, meta);
  const savedMeta = JSON.stringify(meta);
  assert.equal(MM.endSeason(run, meta), first);
  assert.equal(JSON.stringify(meta), savedMeta);
});
