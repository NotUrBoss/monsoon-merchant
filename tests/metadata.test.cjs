const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('game has one parseable, factual JSON-LD entity and matching canonical URL', () => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const data = JSON.parse(scripts[0][1]);
  assert.equal(data['@context'], 'https://schema.org');
  assert.deepEqual(data['@type'], ['VideoGame', 'WebApplication']);
  assert.equal(data.name, 'Monsoon Merchant');
  assert.equal(data.url, 'https://noturboss.github.io/monsoon-merchant/');
  assert.ok(html.includes('<link rel="canonical" href="' + data.url + '">'));
  assert.equal(data.playMode, 'https://schema.org/SinglePlayer');
  assert.equal(data.applicationCategory, 'GameApplication');
  assert.equal(data.isAccessibleForFree, true);
  assert.equal(Number(data.offers.price), 0);
  assert.ok(fs.existsSync(path.join(root, new URL(data.image).pathname.split('/').pop())));
  assert.equal(data.aggregateRating, undefined, 'do not invent ratings');
  assert.equal(data.review, undefined, 'do not invent reviews');
});

test('app and offline cache versions match', () => {
  const ui = fs.readFileSync(path.join(root, 'ui.js'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.equal(ui.match(/APP_VERSION = '([^']+)'/)[1], sw.match(/CACHE = 'mm-([^']+)'/)[1]);
});
