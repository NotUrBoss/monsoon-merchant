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
import threading
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = 'mm.company.v2'
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

def start(page, url):
    page.goto(url, wait_until='networkidle')
    page.locator('[data-a="network"]').click()
    click(page, 'new')
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
    old = page.evaluate('''() => {const s=MMNetwork.create('migration-fixture');delete s.captain;s.version=1;
      const raw=JSON.stringify(s);localStorage.setItem('mm.network.v1',raw);return raw;}''')
    page.locator('[data-a="network"]').click()
    click(page, 'continue')
    migrated = state(page)
    assert migrated['version'] == 2 and migrated['captain']['ship'] == 'coaster'
    assert migrated['cash'] == json.loads(old)['cash']
    assert page.evaluate("localStorage.getItem('mm.network.v1')") == old
    click(page, 'exit')
    page.locator('[data-a="network"]').click()
    click(page, 'new')
    click(page, 'cancel-new')
    assert state(page) == migrated
    click(page, 'continue')
    click(page, 'exit')
    # Original classic game still opens without modifying the unified save.
    page.locator('[data-a="new-season"]').click()
    assert state(page) == migrated
    page.screenshot(path=str(out/'classic-preserved.png'))

def storage_failure(page, context, url, out):
    page.add_init_script('''Storage.prototype.setItem=function(){throw new DOMException('Test quota failure','QuotaExceededError');};''')
    page.goto(url, wait_until='networkidle')
    page.locator('[data-a="network"]').click()
    click(page, 'new')
    assert 'could not be saved' in page.locator('.net-scroll').inner_text()
    backup = json.loads(page.locator('#net-backup-code').input_value())
    assert backup['captain']['ship'] == 'coaster' and backup['cash'] == 500000
    click(page, 'exit')
    assert page.locator('.network-screen').count() == 1, 'unsaved game must not silently vanish'
    page.screenshot(path=str(out/'storage-failure.png'))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='/tmp/mm-browser-evidence')
    parser.add_argument('--browsers',nargs='+',default=['chromium'])
    args=parser.parse_args()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT.parent)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    url=f'http://127.0.0.1:{server.server_port}/{ROOT.name}/'
    results=[]
    try:
        with sync_playwright() as playwright:
            for engine in args.browsers:
                browser=getattr(playwright,engine).launch(headless=True)
                try:
                    for name,fn in [('full-60-day-supply-chain',desktop_journey),('responsive-and-inputs',responsive_journey),('finance',finance_journey),('migration-and-classic',migration_journey),('storage-failure',storage_failure)]:
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
