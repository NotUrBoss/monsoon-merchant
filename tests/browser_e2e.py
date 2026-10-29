"""Browser acceptance tests against a real HTTP server under a Pages-style subpath.
Install: pip install -r tests/browser-requirements.txt
         python -m playwright install --with-deps chromium firefox webkit
Run:     python tests/browser_e2e.py --browsers chromium firefox webkit --output /tmp/mm-evidence
Core journeys use visible controls; evaluate() only reads state except in explicitly
named migration / failure fixtures. No production save or external service is used.
"""
from __future__ import annotations
import argparse
import functools
import json
import os
import threading
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = 'mm.company.v3'
TABS = ('world', 'market', 'bridge', 'shipments', 'industry', 'orders')

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

def state(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

def click(page, action):
    page.locator(f'[data-n="{action}"]').click()

def tab(page, name):
    page.locator(f'[data-n="tab"][data-tab="{name}"]').click()

def choose(page, field, value):
    page.locator(f'#net-{field}').select_option(value)

def number(page, field, value):
    page.locator(f'#net-{field}').fill(str(value))

SEED_COMPANY = '''() => {localStorage.setItem('mm.company.v3', MMNetwork.serialize(MMNetwork.create('e2e-' + Date.now(), true)));}'''

def start(page, url):
    # New company campaigns are retired; an in-progress campaign is finished from the title's Archive entry.
    page.goto(url, wait_until='networkidle')
    assert page.locator('[data-a="network"]').count() == 0, 'no archive entry without a saved company'
    page.evaluate(SEED_COMPANY)
    page.reload(wait_until='networkidle')
    page.locator('[data-a="network"]').click()
    assert page.locator('[data-n="new"]').count() == 0, 'archive cannot start new companies'
    click(page, 'continue')
    assert state(page)['captain']['ship'] == 'coaster'

def resume(page, url):
    page.goto(url, wait_until='networkidle')
    page.locator('[data-a="network"]').click()
    click(page, 'continue')

def buy(page, good, qty):
    tab(page, 'market')
    choose(page, 'good', good)
    choose(page, 'side', 'buy')
    number(page, 'qty', qty)
    click(page, 'trade')

def advance_to(page, day):
    while state(page)['day'] < day:
        click(page, 'advance')

def no_overflow(page):
    sizes = page.evaluate('''() => [document.documentElement,document.body,
      document.querySelector('#app'),document.querySelector('.net-scroll')]
      .filter(Boolean).map(e=>({tag:e.id||e.className||e.tagName,width:e.clientWidth,scroll:e.scrollWidth}))''')
    assert all(s['scroll'] <= s['width'] + 1 for s in sizes), sizes

def desktop_journey(page, context, url, out):
    start(page, url)
    # Keyboard-operated map -> first destination, not a second economic state.
    page.locator('.world-hub[data-hub="singapore"]').focus()
    page.keyboard.press('Enter')
    assert page.locator('#net-hub').input_value() == 'singapore'
    click(page, 'build-warehouse')
    choose(page, 'hub', 'klang')
    buy(page, 'palm', 30)
    tab(page, 'bridge')
    choose(page, 'good', 'palm')
    number(page, 'qty', 20)
    click(page, 'transfer')
    assert state(page)['captain']['cargo']['palm'] == 20
    choose(page, 'sailTo', 'singapore')
    click(page, 'sail')
    arrival = state(page)['captain']['voyage']['arrivalDay']
    tab(page, 'shipments')
    choose(page, 'to', 'singapore')
    choose(page, 'mode', 'sea')
    choose(page, 'good', 'palm')
    number(page, 'qty', 10)
    click(page, 'dispatch')
    tab(page, 'industry')
    choose(page, 'recipe', 'food')
    click(page, 'build-factory')
    buy(page, 'rice', 20)
    buy(page, 'palm', 10)
    tab(page, 'industry')
    number(page, 'batches', 10)
    click(page, 'produce')
    initial = state(page)
    assert initial['day'] == 1 and len(initial['shipments']) == 1 and len(initial['production']) == 1
    assert initial['captain']['voyage'] is not None
    click(page, 'advance')
    saved = state(page)
    resume(page, url)
    assert state(page) == saved, 'reload must preserve all three job clocks'
    tab(page, 'world')
    page.screenshot(path=str(out/'concurrent-operations.png'))
    advance_to(page, max(arrival, initial['production'][0]['finishDay'], initial['shipments'][0]['arrivalDay']))
    delivered = state(page)
    assert delivered['warehouses']['singapore']['stock']['palm'] == 30
    assert delivered['warehouses']['klang']['stock']['food'] == 30
    assert delivered['captain']['cargo']['palm'] == 0
    tab(page, 'orders')
    before = state(page)['cash']
    page.locator('[data-n="fulfill-order"][data-order="straits"]').click()
    assert state(page)['cash'] == before + 52000
    assert state(page)['warehouses']['singapore']['stock']['palm'] == 10
    assert page.locator('[data-n="fulfill-order"][data-order="straits"]').count() == 0
    # Reposition the captain, load manufactured goods, and close a second sale.
    tab(page, 'bridge')
    choose(page, 'sailTo', 'klang')
    click(page, 'sail')
    advance_to(page, state(page)['captain']['voyage']['arrivalDay'])
    choose(page, 'good', 'food')
    number(page, 'qty', 30)
    click(page, 'transfer')
    choose(page, 'sailTo', 'singapore')
    click(page, 'sail')
    advance_to(page, state(page)['captain']['voyage']['arrivalDay'])
    tab(page, 'orders')
    before = state(page)['cash']
    page.locator('[data-n="fulfill-order"][data-order="pantry"]').click()
    assert state(page)['cash'] == before + 110000
    assert state(page)['warehouses']['singapore']['stock']['food'] == 0
    assert '5/5 milestones' in page.locator('.company-objectives').inner_text()
    # Backup rejection is atomic; an offline reload uses the actual service worker.
    click(page, 'backup')
    backup = page.locator('#net-backup-code').input_value()
    before = state(page)
    page.locator('#net-import').fill('{broken backup')
    click(page, 'restore')
    assert state(page) == before
    page.locator('#net-import').fill(backup)
    click(page, 'restore')
    assert state(page) == before
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    context.set_offline(True)
    resume(page, url)
    assert state(page) == before
    tab(page, 'world')
    page.screenshot(path=str(out/'offline-restored.png'))
    context.set_offline(False)
    # Finish all 60 days through the UI; no forced day mutation in this journey.
    advance_to(page, 60)
    final = state(page)
    assert final['status'] == 'finished' and final['captain']['voyage'] is None
    assert final['result']['netWorth'] == page.evaluate('(s)=>MMNetwork.netWorth(s)', final)
    assert page.locator('[data-n="advance"]').count() == 0
    page.screenshot(path=str(out/'season-settlement.png'))
    (out/'completed-campaign.json').write_text(json.dumps(final, indent=2))

def responsive_journey(page, context, url, out):
    start(page, url)
    for width, height in ((320,740),(375,812),(768,1024),(1440,1000)):
        page.set_viewport_size({'width':width,'height':height})
        for name in TABS:
            tab(page, name)
            no_overflow(page)
            missing = page.locator('input[id], select[id], textarea[id]').evaluate_all('''els=>els.filter(e=>
                !document.querySelector('label[for="'+e.id+'"]')&&!e.getAttribute('aria-label')).map(e=>e.id)''')
            assert missing == [], missing
        tab(page, 'world')
        page.locator('.net-scroll').evaluate('(e)=>e.scrollTop=0')
        page.screenshot(path=str(out/f'layout-{width}.png'))
    # Genuine touch-sized purchase + invalid input + manufacture preconditions.
    page.set_viewport_size({'width':375,'height':812})
    tab(page, 'market')
    before = state(page)
    number(page, 'qty', '-1')
    assert page.locator('[data-n="trade"]').is_disabled()
    assert state(page) == before
    number(page, 'qty', 1)
    click(page, 'trade')
    assert state(page)['stats']['trades'] == before['stats']['trades'] + 1
    tab(page, 'shipments')
    assert page.locator('[data-n="dispatch"]').is_disabled(), 'destination warehouse is required'

def finance_journey(page, context, url, out):
    start(page, url)
    tab(page, 'orders')
    initial = state(page)
    number(page, 'amount', 10000)
    click(page, 'borrow')
    assert state(page)['cash'] == initial['cash'] + 10000
    assert state(page)['debt'] == 10000
    click(page, 'advance')
    assert state(page)['stats']['upkeep'] == 270
    click(page, 'repay')
    assert state(page)['debt'] == 0 and state(page)['cash'] == initial['cash'] - 270
    number(page, 'amount', 150001)
    assert page.locator('[data-n="borrow"]').is_disabled()
    page.screenshot(path=str(out/'finance.png'))

def migration_journey(page, context, url, out):
    page.goto(url, wait_until='networkidle')
    old = page.evaluate('''() => {const s=MMNetwork.create('migration-fixture');delete s.captain;delete s.customer;s.version=1;
      const raw=JSON.stringify(s);localStorage.setItem('mm.network.v1',raw);return raw;}''')
    page.reload(wait_until='networkidle')
    page.locator('[data-a="network"]').click()
    click(page, 'continue')
    migrated = state(page)
    assert migrated['version'] == 3 and migrated['captain']['ship'] == 'coaster'
    assert migrated['cash'] == json.loads(old)['cash']
    assert page.evaluate("localStorage.getItem('mm.network.v1')") == old
    click(page, 'exit')
    page.locator('[data-a="network"]').click()
    assert page.locator('[data-n="new"]').count() == 0
    assert state(page) == migrated
    click(page, 'continue')
    click(page, 'exit')
    # A new season opens without modifying the archived company save.
    page.locator('[data-a="new-season"]').click()
    assert state(page) == migrated
    page.screenshot(path=str(out/'classic-preserved.png'))

def storage_failure(page, context, url, out):
    page.goto(url, wait_until='networkidle')
    page.evaluate(SEED_COMPANY)
    page.add_init_script('''Storage.prototype.setItem=function(){throw new DOMException('Test quota failure','QuotaExceededError');};''')
    page.reload(wait_until='networkidle')
    page.locator('[data-a="network"]').click()
    click(page, 'continue')
    assert 'could not be saved' in page.locator('.net-scroll').inner_text()
    backup = json.loads(page.locator('#net-backup-code').input_value())
    assert backup['captain']['ship'] == 'coaster' and backup['cash'] == 500000
    click(page, 'exit')
    assert page.locator('.network-screen').count() == 1, 'unsaved game must not silently vanish'
    page.screenshot(path=str(out/'storage-failure.png'))

def low_click_journey(page, context, url, out):
    start(page, url)
    actions=[]
    def action(selector, label):
        page.locator(selector).click();actions.append(label)
    initial=state(page)
    action('[data-n="plan-order"][data-order="straits"]','Review Straits plan')
    assert state(page)==initial, 'planning must be free of mutations'
    action('[data-n="route-confirm"][data-mode="captain"]','Confirm own-ship plan')
    committed=state(page)
    assert committed['captain']['cargo']['palm']==20
    assert committed['captain']['voyage'] is not None
    assert committed['warehouses']['singapore']['stock']['palm']==0
    action('[data-n="advance-next"]','Advance to next event')
    action('[data-n="fulfill-order"][data-order="straits"]','Fulfil delivered order')
    assert len(actions)==4
    assert state(page)['captain']['orders']['straits']=='fulfilled'
    click(page,'food-chain');click(page,'smart-produce')
    assert state(page)['production'][0]['output']['food']==30
    click(page,'advance-next')
    assert state(page)['warehouses']['klang']['stock']['food']==30
    page.locator('[data-n="plan-order"][data-order="pantry"]').click()
    # The captain is in Singapore; chartered cargo must not teleport the captain.
    assert 'must be docked at the origin' in page.locator('.route-planner').inner_text()
    page.locator('[data-n="route-confirm"][data-mode="sea"]').click()
    while state(page)['day']<8:
        click(page,'advance-next')
    assert page.locator('.customer-decision').count()==1
    before=state(page)['cash']
    page.locator('[data-n="customer-choice"][data-choice="priority"]').click()
    assert state(page)['cash']==before, 'negotiation cannot award free cash'
    assert state(page)['customer']['choice']=='priority'
    page.locator('[data-n="fulfill-order"][data-order="pantry"]').click()
    assert state(page)['cash']==before+130000
    assert state(page)['warehouses']['singapore']['stock']['food']==0
    # Dismissal and presentation settings are not simulation commands.
    saved=state(page);click(page,'effects');click(page,'report-close')
    assert state(page)==saved
    page.screenshot(path=str(out/'interactive-company.png'))
    click(page,'backup');raw=page.locator('#net-backup-code').input_value()
    page.locator('#net-import').fill(raw);click(page,'restore')
    assert state(page)==saved
    advance_to(page,60)
    assert state(page)['status']=='finished'
    (out/'first-delivery-actions.json').write_text(json.dumps({'actions':actions,'primary_actions':4,'scope':'after Start company; prefilled 20 t Straits own-ship order'},indent=2))
    page.screenshot(path=str(out/'smart-season-complete.png'))

def planner_interaction_journey(page, context, url, out):
    start(page,url)
    initial=state(page)
    page.locator('[data-n="plan-order"][data-order="straits"]').click()
    for width,height in ((320,740),(375,812),(768,1024),(1440,1000)):
        page.set_viewport_size({'width':width,'height':height});no_overflow(page)
        for value in ('-1','0','1.5','1e2',''):
            number(page,'routeQty',value)
            assert page.locator('[data-n="route-confirm"]').count()==0
            assert state(page)==initial
        number(page,'routeQty','20')
        page.locator('.route-planner').scroll_into_view_if_needed()
        page.screenshot(path=str(out/f'route-{width}.png'))
    # Destination selection by keyboard works without spending any money.
    page.locator('.world-hub[data-hub="bangkok"]').focus();page.keyboard.press('Enter')
    assert page.locator('#net-routeTo').input_value()=='bangkok'
    assert state(page)==initial
    click(page,'route-cancel');assert state(page)==initial
    # Direct SVG factory interaction has a visible keyboard/touch alternative.
    page.locator('svg [data-n="port-action"][data-tab="industry"]').focus();page.keyboard.press('Enter')
    assert page.locator('[data-n="build-factory"]').count()==1
    tab(page,'world')
    page.locator('.port-actions [data-tab="market"]').click()
    assert page.locator('[data-n="trade"]').count()==1
    tab(page,'world')
    page.locator('[data-n="plan-order"][data-order="straits"]').click()
    page.locator('[data-n="route-confirm"][data-mode="sea"]').dblclick()
    assert len(state(page)['shipments'])==1
    assert state(page)['stats']['trades']==1
    assert state(page)['day']==1

def v2_migration_journey(page, context, url, out):
    page.goto(url,wait_until='networkidle')
    old=page.evaluate('''() => {const s=MMNetwork.create('v2-fixture',true);
      MMNetwork.buildWarehouse(s,'singapore');MMNetwork.trade(s,'klang','palm',20,'buy');
      MMNetwork.transferCargo(s,'palm',20,'load');MMNetwork.sail(s,'singapore');
      delete s.customer;s.version=2;const raw=JSON.stringify(s);localStorage.setItem('mm.company.v2',raw);return raw;}''')
    page.reload(wait_until='networkidle')
    page.locator('[data-a="network"]').click();click(page,'continue')
    migrated=state(page);original=json.loads(old)
    assert migrated['version']==3
    for key in ('cash','debt','warehouses','captain','day'):
        assert migrated[key]==original[key]
    assert page.evaluate("localStorage.getItem('mm.company.v2')")==old
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    cached=page.evaluate('''async()=>{const c=await caches.open('mm-2.4.0');return (await c.keys()).map(r=>r.url);}''')
    assert any(x.endswith('/company-actions.js') for x in cached)
    assert any(x.endswith('/company-play.js') for x in cached)
    assert all(any(x.endswith('/' + n) for x in cached) for n in ('art.js', 'pixel.js', 'sfx.js'))
    context.set_offline(True);resume(page,url)
    assert state(page)==migrated
    click(page,'advance-next')
    assert state(page)['warehouses']['singapore']['stock']['palm']==20
    assert page.evaluate("localStorage.getItem('mm.company.v2')")==old
    page.screenshot(path=str(out/'v2-migrated-offline.png'))
    context.set_offline(False)

def decision_and_effects_journey(page, context, url, out):
    start(page,url);advance_to(page,7)
    # Existing advanced inputs remain available; all setup is through controls.
    page.locator('.company-world [data-n="route-open"]').click()
    choose(page,'routeTo','sydney');choose(page,'routeGood','coal');number(page,'routeQty',10)
    click(page,'route-buy');click(page,'route-build')
    page.locator('[data-n="route-confirm"][data-mode="sea"]').click()
    click(page,'advance-next');assert state(page)['day']==8
    assert page.locator('[data-n="advance-next"]').is_disabled()
    before=state(page)
    page.locator('[data-n="customer-choice"][data-choice="extension"]').click()
    assert state(page)['customer']['choice']=='extension'
    assert state(page)['cash']==before['cash']
    tab(page,'orders')
    pantry=page.locator('.company-order').filter(has_text='Singapore pantry supply')
    assert 'Day 35' in pantry.inner_text() and '95,000' in pantry.inner_text()
    before=state(page)
    click(page,'effects');click(page,'effects');click(page,'report-close')
    assert state(page)==before
    click(page,'backup');raw=page.locator('#net-backup-code').input_value()
    bad=json.loads(raw);bad['customer']['decidedDay']=1
    page.locator('#net-import').fill(json.dumps(bad));click(page,'restore');assert state(page)==before
    page.locator('#net-import').fill(raw);click(page,'restore');assert state(page)==before
    # The next event cannot silently sail past day-15 open contract deadlines.
    click(page,'advance-next');assert state(page)['day']==15
    assert state(page)['captain']['orders']['straits']=='open'
    assert page.locator('[data-n="advance-next"]').is_disabled()
    page.screenshot(path=str(out/'deadline-stop.png'))

def season_state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('mm.run.normal.v1'))")

def act(page, action, **data):
    sel = f'[data-a="{action}"]' + ''.join(f'[data-{k}="{v}"]' for k, v in data.items())
    page.locator(sel).first.click()

def merged_supply_chain_journey(page, context, url, out):
    # One game: a captain season grows a warehouse, standing orders, a factory and a freight route.
    page.set_viewport_size({'width':390,'height':844})
    page.goto(url, wait_until='networkidle')
    assert page.locator('[data-a="network"]').count() == 0
    assert page.locator('[data-a="new-season"]').count() == 1
    page.evaluate('''() => {const s=MM.newRun({seed:'e2e-merged'},MM.newMeta());s.cash+=2500000;s.st.peak=2500000;
      localStorage.setItem('mm.run.normal.v1',MM.serialize(s));}''')
    page.reload(wait_until='networkidle')
    act(page, 'continue', slot='normal')
    act(page, 'tab', id='company')
    assert page.locator('.stagecard .stg.on').count() == 5
    act(page, 'co-tab', id='sites')
    act(page, 'wh-build')
    assert 'klang' in season_state(page)['co']['wh']
    for good in ('rice', 'palm'):
        act(page, 'order-new', p='klang')
        act(page, 'ord-g', v=good); act(page, 'ord-q', v=50); act(page, 'ord-m', v='any'); act(page, 'ord-save')
    assert [o['g'] for o in season_state(page)['co']['wh']['klang']['orders']] == ['rice', 'palm']
    act(page, 'fac-sheet'); act(page, 'fac-build', id='food')
    assert season_state(page)['co']['fac']['klang']['recipe'] == 'food'
    act(page, 'co-tab', id='freight')
    act(page, 'route-new'); act(page, 'rt-g', v='food'); act(page, 'rt-to', v='singapore'); act(page, 'rt-q', v=25); act(page, 'rt-save')
    assert season_state(page)['co']['routes'][0]['to'] == 'singapore'
    for width, height in ((320,740),(375,812),(768,1024)):
        page.set_viewport_size({'width':width,'height':height})
        sizes = page.evaluate('''() => [document.documentElement,document.body,document.querySelector('#app'),document.querySelector('.scroll')]
          .filter(Boolean).map(e=>({tag:e.id||e.className||e.tagName,width:e.clientWidth,scroll:e.scrollWidth}))''')
        assert all(x['scroll'] <= x['width'] + 1 for x in sizes), sizes
        page.evaluate("document.getElementById('toasts').innerHTML=''")
        page.screenshot(path=str(out/f'company-{width}.png'))
    page.set_viewport_size({'width':390,'height':844})
    act(page, 'tab', id='market')
    assert page.locator('.whstrip').count() == 1
    for _ in range(3):
        act(page, 'wait')
        if page.locator('[data-a="result-ok"]').count(): act(page, 'result-ok')
    s = season_state(page)
    assert s['co']['made'] > 0, s['co']['fac']
    act(page, 'tab', id='company')
    act(page, 'co-tab', id='sites')
    assert 'Made' in page.locator('.facline').first.inner_text()
    page.evaluate("document.getElementById('toasts').innerHTML=''")
    page.screenshot(path=str(out/'company-running.png'))
    page.reload(wait_until='networkidle')
    act(page, 'continue', slot='normal')
    assert season_state(page)['co'] == s['co']

def season_length_and_company_events_journey(page, context, url, out):
    # Choose a 120-day season through the setup screen, then handle a big order and a company alert.
    page.set_viewport_size({'width':390,'height':844})
    page.goto(url, wait_until='networkidle')
    act(page, 'new-season')
    act(page, 'pick-days', id='120')
    assert page.locator('[data-a="pick-days"][data-id="120"]').get_attribute('aria-pressed') == 'true'
    assert '120 days' in page.locator('.setup-sum').inner_text()
    act(page, 'start-season')
    assert season_state(page)['maxDays'] == 120
    page.evaluate("window.__mm.A['go-title']()")  # leave the season so it is not saved over the fixture
    page.evaluate('''() => {const s=MM.newRun({seed:'e2e-co2',days:120},MM.newMeta());s.cash+=3000000;s.st.peak=3000000;
      MM.buildWarehouse(s);MM.buildFactory(s,'food');
      for(let i=0;i<40&&!(s.co.dealOffer&&s.co.alerts.some(a=>MM.alertOpen(s,a)));i++)MM.waitDay(s);
      localStorage.setItem('mm.run.normal.v1',MM.serialize(s));}''')
    page.reload(wait_until='networkidle')
    act(page, 'continue', slot='normal')
    assert page.locator('.tab[data-id="company"] .dot').count() == 1
    act(page, 'tab', id='company')
    assert page.locator('.deal-card.offer').count() == 1
    assert page.locator('.alert-card').count() == 1
    page.evaluate("document.getElementById('toasts').innerHTML=''")
    page.screenshot(path=str(out/'company-needs-you.png'))
    act(page, 'deal-accept')
    st = season_state(page)
    assert st['co']['dealOffer'] is None and len(st['co']['deals']) == 1
    alert = next(a for a in st['co']['alerts'] if a['choice'] is None)
    act(page, 'co-choose', id=str(alert['id']), c=alert['choices'][0]['id'])
    st = season_state(page)
    assert next(a for a in st['co']['alerts'] if a['id'] == alert['id'])['choice'] == alert['choices'][0]['id']
    assert page.locator('.alert-card').count() == 0
    assert page.locator('.deal-card:not(.offer)').count() == 1
    for width, height in ((320,740),(375,812)):
        page.set_viewport_size({'width':width,'height':height})
        sizes = page.evaluate('''() => [document.documentElement,document.body,document.querySelector('#app'),document.querySelector('.scroll')]
          .filter(Boolean).map(e=>({tag:e.id||e.className||e.tagName,width:e.clientWidth,scroll:e.scrollWidth}))''')
        assert all(x['scroll'] <= x['width'] + 1 for x in sizes), sizes
    page.evaluate("document.getElementById('toasts').innerHTML=''")
    page.screenshot(path=str(out/'company-orders.png'))

def endless_and_layers_journey(page, context, url, out):
    # Pick Endless on the setup screen, build every company layer with visible controls, close a chapter and retire.
    page.set_viewport_size({'width':390,'height':844})
    page.goto(url, wait_until='networkidle')
    act(page, 'new-season')
    act(page, 'pick-days', id='endless')
    assert page.locator('[data-a="pick-days"][data-id="endless"]').get_attribute('aria-pressed') == 'true'
    act(page, 'start-season')
    st = page.evaluate("JSON.parse(localStorage.getItem('mm.run.endless.v1'))")
    assert st['mode'] == 'endless' and st['endless']['ch'] == 1
    assert page.locator('.day.endless').count() == 1
    page.evaluate("window.__mm.A['go-title']()")
    page.evaluate('''() => {const s=MM.newRun({seed:'e2e-endless',mode:'endless'},MM.newMeta());s.cash+=14000000;s.st.peak=14000000;
      for(let i=0;i<50;i++)MM.waitDay(s);
      localStorage.setItem('mm.run.endless.v1',MM.serialize(s));}''')
    page.reload(wait_until='networkidle')
    act(page, 'continue', slot='endless')
    endless = lambda: page.evaluate("JSON.parse(localStorage.getItem('mm.run.endless.v1'))")
    act(page, 'tab', id='company')
    assert page.locator('.stagecard .stg.on').count() == 9
    act(page, 'co-tab', id='sites')
    act(page, 'wh-build')
    act(page, 'est-sheet'); page.locator('.sheet [data-a="est-build"]').first.click()
    act(page, 'shop-open')
    act(page, 'shop-tier', v='premium'); act(page, 'shop-terms', v='credit')
    act(page, 'mgr-sheet'); act(page, 'mgr-hire', id='balanced')
    page.evaluate("window.__mm.A['go-title']()"); page.evaluate("window.__mm.A.continue({slot:'endless'})")
    co = endless()['co']
    assert 'klang' in co['est'] and co['shop']['klang']['tier'] == 'premium' and co['shop']['klang']['terms'] == 'credit', co
    assert co['mgr']['klang']['style'] == 'balanced'
    act(page, 'tab', id='company'); act(page, 'co-tab', id='sites')
    for width, height in ((320,740),(375,812)):
        page.set_viewport_size({'width':width,'height':height})
        sizes = page.evaluate('''() => [document.documentElement,document.body,document.querySelector('#app'),document.querySelector('.scroll')]
          .filter(Boolean).map(e=>({tag:e.id||e.className||e.tagName,width:e.clientWidth,scroll:e.scrollWidth}))''')
        assert all(x['scroll'] <= x['width'] + 1 for x in sizes), sizes
        page.evaluate("document.getElementById('toasts').innerHTML=''")
        page.screenshot(path=str(out/f'sites-{width}.png'))
    page.set_viewport_size({'width':390,'height':844})
    assert all(p in endless()['ports'] for p in ('colombo','mumbai','dubai','tokyo'))
    act(page, 'tab', id='market')
    for _ in range(15):
        act(page, 'wait')
        if page.evaluate("window.__mm.UI.modal && window.__mm.UI.modal.type") == 'chapter': break
        while page.locator('.modal [data-a="result-ok"]').count(): page.locator('.modal [data-a="result-ok"]').first.click()
    assert endless()['endless']['ch'] == 2
    assert 'Chapter 1 closed' in page.locator('.modal').inner_text()
    page.evaluate("document.getElementById('toasts').innerHTML=''")
    page.screenshot(path=str(out/'chapter.png'))
    while page.locator('.modal [data-a="result-ok"]').count(): page.locator('.modal [data-a="result-ok"]').first.click()
    act(page, 'menu'); act(page, 'end-early'); page.locator('.sheet .btn.danger-fill').click()
    assert page.locator('.end-hero').count() == 1
    assert page.locator('.hall li').count() == 1
    assert page.evaluate("JSON.parse(localStorage.getItem('mm.meta.v1')).endless.runs") == 1
    page.screenshot(path=str(out/'retired.png'))

GEO = '''() => {
  const sc = document.querySelector('#screen .scroll');
  const rows = [...document.querySelectorAll('#screen .goods .good')].map(e => { const r = e.getBoundingClientRect(); return { g: e.dataset.g, top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; });
  const hud = document.querySelector('#screen .hud'), tabs = document.querySelector('#screen .tabs');
  return { rows, hud: hud ? Math.round(hud.getBoundingClientRect().top) : null, tabsBottom: tabs ? Math.round(tabs.getBoundingClientRect().bottom) : null,
    H: innerHeight, W: innerWidth, docW: document.documentElement.scrollWidth, overlay: document.getElementById('overlay').className,
    inert: !!document.getElementById('screen').inert, toasts: document.getElementById('toasts').children.length, scroll: sc ? sc.scrollTop : 0 };
}'''

def trade_layout_journey(page, context, url, out):
    # Buying and selling must not move the list, the bars or the traded row, on phones, tablets and desktops.
    for width, height in ((1440, 900), (1280, 640), (820, 1180), (390, 844), (320, 568)):
        page.set_viewport_size({'width': width, 'height': height})
        page.goto(url, wait_until='networkidle')
        page.evaluate("() => { localStorage.removeItem('mm.run.normal.v1'); }")
        page.reload(wait_until='networkidle')
        act(page, 'new-season'); act(page, 'start-season')
        page.evaluate("document.querySelector('#screen .scroll').scrollTop = 99999")
        page.wait_for_timeout(100)
        before = page.evaluate(GEO)
        g = before['rows'][2]['g']
        for mode in ('buy', 'sell'):
            page.locator(f'#screen .good[data-a="trade"][data-g="{g}"]').click()
            assert page.locator('#overlay .sheet.trade').count() == 1
            page.wait_for_timeout(300)
            before = page.evaluate(GEO)  # the click may scroll the row into view first
            assert page.locator('.sheet [data-a="do-trade"]').is_visible(), 'the trade button is on screen'
            box = page.locator('.sheet [data-a="do-trade"]').bounding_box()
            assert box and box['y'] + box['height'] <= height + 1, (width, height, mode, 'trade button below the screen', box)
            if mode == 'buy':
                page.locator('.sheet [data-a="qty-set"]').last.click()
            page.locator('.sheet [data-a="do-trade"]').click()
            page.wait_for_timeout(400)
            after = page.evaluate(GEO)
            label = f'{width}x{height} {mode}'
            assert after['overlay'] == '' and not after['inert'], label + ': the sheet closed and the screen is usable'
            assert after['docW'] <= after['W'] + 1, label + ': no sideways scroll'
            assert after['hud'] == before['hud'] and after['tabsBottom'] == before['tabsBottom'] == after['H'], (label, before, after)
            row_b = next(r for r in before['rows'] if r['g'] == g); row_a = next(r for r in after['rows'] if r['g'] == g)
            assert abs(row_a['top'] - row_b['top']) <= 2, (label, 'traded row moved', row_b, row_a)
            assert [(r['h'], r['w']) for r in after['rows']] == [(r['h'], r['w']) for r in before['rows']], (label, 'row sizes changed', before['rows'], after['rows'])
            assert after['toasts'] == 0, label + ': no toast covers the list'
            assert page.locator(f'#screen .good[data-a="trade"][data-g="{g}"] .done-line').count() == 1, label + ': the row says what happened'
            page.screenshot(path=str(out/f'{width}x{height}-{mode}.png'))

AUDIT = '''() => {
  const W = innerWidth, H = innerHeight, out = [];
  if (document.documentElement.scrollWidth > W + 1) out.push('sideways scroll ' + document.documentElement.scrollWidth);
  const open = document.getElementById('overlay').classList.contains('open');
  const layer = open ? document.querySelector('#overlay [role="dialog"]') : document.getElementById('screen');
  if (!layer) return ['no visible layer'];
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  [...layer.querySelectorAll('button, [data-a]')].filter(vis).forEach(e => {
    if (e.closest('.seg, .chips, .pxmap, .map-box')) return;
    const r = e.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) out.push('off-screen ' + (e.dataset.a || e.className));
  });
  const tabs = document.querySelector('#screen .tabs');
  if (tabs && !open && Math.abs(tabs.getBoundingClientRect().bottom - H) > 2) out.push('tab bar moved');
  return out;
}'''

def all_screens_journey(page, context, url, out):
    # Visit every screen, tab and sheet on a phone and a laptop; nothing scrolls sideways or leaves the screen.
    for width, height in ((390, 844), (1366, 768)):
        page.set_viewport_size({'width': width, 'height': height})
        page.goto(url, wait_until='networkidle')
        page.evaluate("() => { localStorage.removeItem('mm.run.normal.v1'); }")
        page.reload(wait_until='networkidle')
        seen = []
        def check(name):
            page.wait_for_timeout(80)
            issues = page.evaluate(AUDIT)
            assert issues == [], (width, name, issues)
            seen.append(name)
        def do(a, **d):
            page.evaluate('([a, d]) => window.__mm.A[a](d)', [a, d])
        check('title')
        for a in ('settings', 'help', 'legacy', 'ledger'):
            do(a); check(a); do('go-title')
        act(page, 'new-season'); check('setup')
        act(page, 'pick-days', id='endless'); check('setup-endless'); act(page, 'pick-days', id='90')
        act(page, 'start-season'); check('market')
        page.evaluate("() => { const r = window.__mm.run; r.cash += 14e6; r.st.peak = 14e6; }")
        for t in ('market', 'map', 'ship', 'office', 'company'):
            act(page, 'tab', id=t); check('tab-' + t)
        for st in ('sites', 'freight', 'overview'):
            act(page, 'co-tab', id=st); check('company-' + st)
        act(page, 'co-tab', id='sites'); act(page, 'wh-build')
        for a, d, name in (('order-new', {'p': 'klang'}, 'order'), ('fac-sheet', {}, 'factory'), ('est-sheet', {}, 'estate'), ('mgr-sheet', {}, 'manager'),
                           ('route-new', {}, 'route'), ('rival-info', {}, 'rival'), ('season-info', {}, 'season'), ('menu', {}, 'menu'),
                           ('port', {'p': 'singapore'}, 'port'), ('plan', {'p': 'singapore'}, 'depart'), ('trade', {'g': 'rice'}, 'trade')):
            do(a, **d); check('sheet-' + name); do('close-sheet')
        act(page, 'tab', id='market'); act(page, 'menu'); act(page, 'end-early'); page.locator('.sheet .btn.danger-fill').click()
        page.wait_for_timeout(300); check('end')
        page.screenshot(path=str(out/f'end-{width}.png'))
        assert len(seen) >= 28, seen

def gamify_journey(page, context, url, out):
    # 2.4: captain level and perks, quests, haggling, survey, sell all and undo, the cabinet, accessibility,
    # the wide layout with shortcuts, the price map, Endless charters and the overland truck.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(url, wait_until='networkidle')
    page.evaluate("() => { localStorage.removeItem('mm.run.normal.v1'); }")
    page.reload(wait_until='networkidle')
    act(page, 'new-season'); act(page, 'start-season')
    assert page.locator('#screen .capchip').count() == 1, 'the HUD shows the captain level'
    assert page.locator('#screen .questcard').count() == 1, 'the first guild job is on the market'
    run = lambda: page.evaluate('() => JSON.parse(localStorage.getItem("mm.run.normal.v1"))')
    # Haggle on a big lot: stop the marker and the quote changes.
    page.evaluate("() => { window.__mm.run.cash += 400000; window.__mm.render(); }")
    g = page.evaluate("() => window.__mm.run.goods.find(x => !MM.GOODS[x].perish)")
    page.locator(f'#screen .good[data-a="trade"][data-g="{g}"]').click()
    page.locator('.sheet [data-a="qty-set"]').last.click()
    assert page.locator('.sheet [data-a="haggle-open"]').count() == 1, 'big lots can be haggled'
    page.locator('.sheet [data-a="haggle-open"]').click()
    assert page.locator('#hagMark').count() == 1
    page.wait_for_timeout(250)
    page.locator('.sheet [data-a="haggle-stop"]').click()
    page.wait_for_timeout(100)
    assert page.locator('.sheet [data-a="haggle-open"]').count() == 0, 'one haggle per trader per day'
    assert page.locator('.sheet [data-a="survey"]').count() == 1, 'big lots offer a survey'
    page.locator('.sheet [data-a="survey"]').click()
    assert page.locator('.sheet [data-a="survey"]').get_attribute('aria-checked') == 'true'
    page.locator('.sheet [data-a="do-trade"]').click()
    page.wait_for_timeout(300)
    assert page.locator('#screen .undobar').count() == 1, 'the trade can be undone'
    cash_after = run()['cash']
    page.locator('#screen .undobar[data-a="undo"]').click()
    page.wait_for_timeout(200)
    assert run()['cash'] > cash_after and not run()['cargo'].get(g), 'undo puts the cash back'
    # Buy two cargoes, then sell everything with one confirm, then undo that too.
    for gg in page.evaluate("() => window.__mm.run.goods.filter(x => !MM.GOODS[x].perish).slice(0, 2)"):
        page.locator(f'#screen .good[data-a="trade"][data-g="{gg}"]').click()
        page.locator('.sheet [data-a="qty-set"]').first.click()
        page.locator('.sheet [data-a="do-trade"]').click(); page.wait_for_timeout(200)
    assert page.locator('#screen .sellall [data-a="sell-all"]').count() == 1
    page.locator('#screen [data-a="sell-all"]').click()
    page.locator('.sheet [data-a="sell-all-go"]').click(); page.wait_for_timeout(300)
    assert run()['cargo'] == {}, 'the hold is empty'
    page.locator('#screen .undobar[data-a="undo"]').click(); page.wait_for_timeout(200)
    assert len(run()['cargo']) == 2, 'undo restores the cargo'
    # Level up: the perk sheet opens by itself and a perk can be chosen.
    page.evaluate("() => { MM.gainXP(window.__mm.run, MM.xpNeed(1) + 5, 'test'); window.__mm.A.tab({id:'market'}); }")
    page.wait_for_timeout(200)
    if page.locator('.sheet.captain').count() == 0:
        act(page, 'captain')
    assert page.locator('.sheet.captain .perk-opt').count() == 3
    page.locator('.sheet.captain .perk-opt').first.click(); page.wait_for_timeout(200)
    assert run()['cap']['picks'] == 0
    page.screenshot(path=str(out / 'phone-market.png'))
    # The cabinet and back.
    act(page, 'captain'); act(page, 'cabinet')
    assert page.locator('.screen.cabinet .cabinet-grid').count() >= 4
    page.screenshot(path=str(out / 'cabinet.png'))
    act(page, 'cabinet-back')
    assert page.locator('#screen .screen.run').count() == 1
    # Price map chips put prices on the chart labels.
    act(page, 'tab', id='map')
    page.locator('#screen .price-chips [data-a="price-g"]').nth(1).click(); page.wait_for_timeout(300)
    assert page.locator('#screen .lbl .pr').count() >= 1, 'prices on the chart'
    # Accessibility: larger text, contrast and shapes apply at once.
    page.evaluate("() => { window.__mm.A['go-title'](); window.__mm.A.settings(); }")
    for k in ('bigText', 'contrast', 'shapes'):
        act(page, 'toggle', id=k)
    cls = page.evaluate('document.documentElement.className')
    assert 'big-text' in cls and 'contrast' in cls and 'shapes' in cls, cls
    assert page.evaluate('document.documentElement.scrollWidth') <= 391, 'no sideways scroll with larger text'
    page.screenshot(path=str(out / 'a11y-settings.png'))
    for k in ('bigText', 'contrast', 'shapes'):
        act(page, 'toggle', id=k)
    with page.expect_download() as dl:
        act(page, 'export-file')
    assert dl.value.suggested_filename.startswith('monsoon-merchant-backup-')
    # Wide layout: side panel, sheets dock right, keyboard shortcuts.
    page.set_viewport_size({'width': 1440, 'height': 900})
    page.wait_for_timeout(300)
    page.evaluate("() => window.__mm.A['go-title']()")
    act(page, 'continue', slot='normal')
    assert page.locator('#screen .run-body .side').count() == 1, 'wide screens get the side panel'
    page.keyboard.press('2'); page.wait_for_timeout(150)
    assert page.locator('#screen .tab.on[data-id="map"]').count() == 1, 'key 2 opens the map'
    page.keyboard.press('1'); page.keyboard.press('c'); page.wait_for_timeout(150)
    box = page.locator('#overlay .sheet').bounding_box()
    assert box and box['x'] > 500, ('the sheet docks to the right', box)
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    page.screenshot(path=str(out / 'wide.png'))
    # Endless: charters and the overland truck.
    page.evaluate("""() => {const s=MM.newRun({seed:'e2e-charters',mode:'endless'},MM.newMeta());s.cash+=3e6;s.st.peak=13e6;s.port='haiphong';
      localStorage.setItem('mm.run.endless.v1',MM.serialize(s));}""")
    page.reload(wait_until='networkidle')
    act(page, 'continue', slot='endless')
    assert page.locator('#screen .charter-note').count() == 1, 'the market reminds you to pick charters'
    act(page, 'tab', id='office')
    for i in range(3):
        page.locator('#screen .charter-pick [data-a="charter-toggle"]').nth(i).click()
    act(page, 'charter-sign'); page.wait_for_timeout(200)
    st = page.evaluate("JSON.parse(localStorage.getItem('mm.run.endless.v1'))")
    assert len(st['endless']['year']['chosen']) == 3
    assert page.locator('#screen .charter-list li').count() == 3
    act(page, 'tab', id='company'); act(page, 'co-tab', id='sites'); act(page, 'wh-build')
    act(page, 'co-tab', id='freight'); act(page, 'route-new')
    page.evaluate("() => { const sh = window.__mm.UI.sheet; sh.from = 'haiphong'; sh.to = 'shenzhen'; window.__mm.A['rt-mode']({v:'truck'}); }")
    page.wait_for_timeout(150)
    assert page.locator('.sheet [data-a="rt-mode"][data-v="truck"].on').count() == 1, 'truck mode on the corridor'
    act(page, 'rt-save'); page.wait_for_timeout(200)
    st = page.evaluate("JSON.parse(localStorage.getItem('mm.run.endless.v1'))")
    assert st['co']['routes'] and st['co']['routes'][0]['mode'] == 'truck', st['co']['routes']
    # Small phones get short tips with a More link.
    page.set_viewport_size({'width': 320, 'height': 568})
    page.evaluate("() => { window.__mm.meta.settings.tips = true; window.__mm.meta.tips = {}; window.__mm.A['go-title'](); }")
    act(page, 'new-season'); act(page, 'start-season')
    if page.locator('#screen .tip').count():
        assert page.locator('#screen .tip.short [data-a="tip-more"]').count() == 1
        page.locator('#screen [data-a="tip-more"]').click()
        assert page.locator('#screen .tip.short').count() == 0
    page.screenshot(path=str(out / 'phone-320.png'))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='/tmp/mm-browser-evidence')
    parser.add_argument('--browsers',nargs='+',default=['chromium'])
    parser.add_argument('--only',nargs='*',default=None)
    args=parser.parse_args()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT.parent)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    url=f'http://127.0.0.1:{server.server_port}/{ROOT.name}/'
    results=[]
    try:
        with sync_playwright() as playwright:
            for engine in args.browsers:
                browser=getattr(playwright,engine).launch(headless=True, **({'executable_path':os.environ['MM_CHROMIUM_PATH']} if engine=='chromium' and os.environ.get('MM_CHROMIUM_PATH') else {}))
                try:
                    for name,fn in [('full-60-day-supply-chain',desktop_journey),('responsive-and-inputs',responsive_journey),('finance',finance_journey),('migration-and-classic',migration_journey),('storage-failure',storage_failure),('four-action-supply-chain',low_click_journey),('planner-accessibility',planner_interaction_journey),('v2-migration-offline',v2_migration_journey),('customer-decisions-effects',decision_and_effects_journey),('merged-supply-chain',merged_supply_chain_journey),('season-length-and-company-events',season_length_and_company_events_journey),('endless-and-layers',endless_and_layers_journey),('trade-layout-stability',trade_layout_journey),('all-screens',all_screens_journey),('gamify-2.4',gamify_journey)]:
                        if args.only and name not in args.only: continue
                        directory=output/engine/name;directory.mkdir(parents=True,exist_ok=True)
                        context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
                        context.tracing.start(screenshots=True,snapshots=True,sources=True)
                        page=context.new_page();page.set_default_timeout(10000)
                        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                        result={'browser':engine,'journey':name,'status':'passed'}
                        try:
                            fn(page,context,url,directory)
                            assert errors == [], errors
                            context.tracing.stop()
                        except Exception:
                            result.update(status='failed',error=traceback.format_exc(),console_errors=errors)
                            try:
                                page.screenshot(path=str(directory/'failure.png'))
                                (directory/'failure.html').write_text(page.content())
                                context.tracing.stop(path=str(directory/'trace.zip'))
                            except Exception:
                                pass
                        finally:
                            context.close()
                        results.append(result)
                        print(json.dumps(result),flush=True)
                finally:
                    browser.close()
    finally:
        server.shutdown();server.server_close()
        report={'journeys':results,'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results)}
        (output/'results.json').write_text(json.dumps(report,indent=2))
    if any(r['status']=='failed' for r in results) or not results:
        raise SystemExit(1)

if __name__=='__main__':
    main()
