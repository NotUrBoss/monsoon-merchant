"""Real HTTP browser tests for the separate desktop prototype.
Runs on a Pages-style subpath. State evaluation is read-only except explicitly
named storage, corrupt-save and visibility fault fixtures. No production data.
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
KEY = 'monsoon.district.v1'

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

def state(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

def click(page, action):
    page.locator(f'button[data-action="{action}"]').first.click()

def panel(page, name):
    page.locator(f'nav button[data-panel="{name}"]').click()

def start(page, url):
    page.goto(url, wait_until='networkidle')
    click(page, 'starter')
    click(page, 'confirm')
    assert state(page)['cash'] == 380000

def run_to(page, expression, timeout=45000):
    page.locator('[data-action="speed"][data-speed="8"]').click()
    page.wait_for_function(f'() => {{const s=JSON.parse(localStorage.getItem("{KEY}")); return s && ({expression});}}', timeout=timeout)
    page.locator('[data-action="speed"][data-speed="0"]').click()

def auto_company(page, ctx, url, out):
    start(page, url)
    run_to(page, 's.day >= 121')
    s=state(page)
    assert s['totals']['localSold'] >= 300
    assert s['cash'] > 500000
    assert page.evaluate('(s)=>DistrictSim.validate(s).ok', s)
    page.screenshot(path=str(out/'self-running-district.png'), full_page=True)
    (out/'autopilot.json').write_text(json.dumps({'days':s['day']-1,'produced':s['totals']['produced'], 'localSold':s['totals']['localSold'],'cash':s['cash'],'routineCommandsAfterApproval':0},indent=2))

def export_chain(page, ctx, url, out):
    start(page,url)
    click(page,'export');click(page,'confirm')
    run_to(page,'s.totals.departures >= 4 && s.totals.exportSold >= 30')
    s=state(page)
    assert s['totals']['localSold'] > 0
    assert s['totals']['revenue'] == s['totals']['localSold']*2400+s['totals']['exportSold']*3100
    page.locator('[data-view="region"]').click()
    page.screenshot(path=str(out/'export-network.png'),full_page=True)
    panel(page,'policy')
    page.locator('[name="enabled"]').uncheck()
    page.locator('#policy-form button').click()
    departures=state(page)['totals']['departures']
    day=state(page)['day']
    run_to(page,f's.day >= {day+10}')
    assert state(page)['totals']['departures'] == departures
    assert state(page)['route']['job'] is None

def pause_and_visibility(page, ctx, url, out):
    start(page,url)
    page.locator('[data-speed="1"]').click()
    page.wait_for_function(f'JSON.parse(localStorage.getItem("{KEY}")).day >= 2')
    page.locator('[data-speed="0"]').click()
    snapshot=state(page)
    page.wait_for_timeout(700)
    assert state(page) == snapshot
    page.locator('h1').click();page.keyboard.press('Space')
    assert page.locator('[data-speed="1"]').get_attribute('aria-pressed') == 'true'
    # Explicit synthetic background event fixture: not a physical-device claim.
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
    assert page.locator('[data-speed="0"]').get_attribute('aria-pressed') == 'true'
    snapshot=state(page);page.wait_for_timeout(700);assert state(page)==snapshot
    page.reload(wait_until='networkidle')
    assert page.locator('[data-speed="0"]').get_attribute('aria-pressed')=='true'
    assert state(page)==snapshot

def policy_controls(page,ctx,url,out):
    start(page,url);panel(page,'policy')
    page.locator('[name="dailyBudget"]').fill('5000');page.locator('#policy-form button').click()
    run_to(page,'s.day>=15')
    assert state(page)['totals']['produced']==0
    assert page.locator('[data-code="idle"]').is_visible()
    panel(page,'policy');page.locator('[name="dailyBudget"]').fill('15000');page.locator('#policy-form button').click()
    run_to(page,'s.totals.localSold>=12')
    s=state(page)
    assert all(h['purchases']+h['processing']+h['freight']<=15000 for h in s['history'])
    panel(page,'finance');assert page.get_by_text('Company accounts',exact=True).is_visible()
    page.screenshot(path=str(out/'accounts.png'),full_page=True)

def planning_and_keyboard(page,ctx,url,out):
    page.goto(url,wait_until='networkidle');click(page,'starter');click(page,'cancel')
    assert state(page) is None
    panel(page,'build')
    page.locator('[data-action="type"][data-type="factory"]').click()
    page.locator('svg [data-plot="3"]').focus();page.keyboard.press('Enter')
    click(page,'cancel');assert state(page) is None
    panel(page,'build');page.locator('svg [data-plot="3"]').click()
    box=page.locator('[data-action="confirm"]').bounding_box()
    page.mouse.dblclick(box['x']+box['width']/2,box['y']+box['height']/2)
    s=state(page);assert len(s['buildings'])==2;assert s['cash']==410000
    assert page.locator('#notice').is_visible()
    nav=page.locator('nav button[data-panel="build"]').bounding_box()
    assert page.evaluate('([x,y])=>document.elementFromPoint(x,y).closest("button")?.dataset.panel', [nav['x']+nav['width']/2,nav['y']+nav['height']/2])=='build'
    page.locator('svg [data-plot="3"]').focus();page.keyboard.press('Enter')
    assert page.get_by_role('heading',name='Food factory',exact=True).is_visible()
    before=state(page)
    bad=out/'bad-backup.json';bad.write_text('{"cash":999999999}')
    page.locator('#restore-file').set_input_files(str(bad));page.wait_for_timeout(250)
    assert state(page)==before
    assert 'save' in page.locator('#notice').inner_text().lower()

def offline_and_old_saves(page,ctx,url,out):
    root=url.removesuffix('desktop/')
    page.goto(root,wait_until='networkidle')
    page.evaluate('navigator.serviceWorker.ready')
    # Create a genuine existing company using its visible controls. The original
    # app saves metadata on pagehide: leave it before taking the baseline, rather
    # than injecting a placeholder that its legitimate unload handler replaces.
    page.locator('[data-a="network"]').click()
    page.locator('[data-n="new"]').click()
    page.locator('[data-n="advance"]').click()
    original_company=page.evaluate("localStorage.getItem('mm.company.v3')")
    assert json.loads(original_company)['day'] == 2
    page.goto(root+'tests/browser-requirements.txt',wait_until='load')
    original_saves=page.evaluate("() => Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('mm.')).map(k=>[k,localStorage.getItem(k)]))")
    assert original_saves['mm.company.v3']==original_company
    assert json.loads(original_saves['mm.meta.v1'])['v']==1
    start(page,url)
    for _ in range(5):click(page,'step')
    before=state(page)
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function("navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.includes('/desktop/sw.js')")
    names=page.evaluate('caches.keys()')
    assert 'district-builder-0.1.0' in names
    assert any(n.startswith('mm-') for n in names)
    ctx.set_offline(True);page.reload(wait_until='load')
    page.wait_for_selector('[data-action="step"]')
    assert state(page)==before
    click(page,'step');assert state(page)['day']==before['day']+1
    district_after=state(page)
    for key,value in original_saves.items():
        assert page.evaluate('(k)=>localStorage.getItem(k)',key)==value, f'Original save changed: {key}'
    # The older game must still open its real save offline after using the child
    # service worker; returning to it must not change the district save either.
    page.goto(root,wait_until='load')
    page.locator('[data-a="network"]').click()
    page.locator('[data-n="continue"]').click()
    assert page.evaluate("localStorage.getItem('mm.company.v3')")==original_company
    assert state(page)==district_after
    ctx.set_offline(False)


def storage_failure(page,ctx,url,out):
    start(page,url);before=state(page)
    page.evaluate("""() => {const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='monsoon.district.v1')throw new DOMException('test quota','QuotaExceededError');return original.call(this,k,v);};}""")
    click(page,'step')
    assert page.get_by_role('alert').is_visible()
    assert state(page)==before
    assert page.locator('[data-speed="0"]').get_attribute('aria-pressed')=='true'
    with page.expect_download() as d:click(page,'backup')
    download=d.value;path=out/'recovery-backup.json';download.save_as(str(path))
    recovered=json.loads(path.read_text())
    assert recovered['day']==before['day']+1
    assert page.evaluate('(s)=>DistrictSim.validate(s).ok',recovered)
    page.reload(wait_until='networkidle');assert state(page)==before
    page.on('dialog',lambda d:d.accept())
    page.locator('#restore-file').set_input_files(str(path))
    page.wait_for_function(f'JSON.parse(localStorage.getItem("{KEY}")).day === {recovered["day"]}')
    assert state(page)==recovered

def corrupt_save(page,ctx,url,out):
    ctx.add_init_script("localStorage.setItem('monsoon.district.v1','broken district');localStorage.setItem('mm.company.v3','keep this');")
    page.goto(url,wait_until='networkidle')
    assert page.locator('[data-speed="1"]').is_disabled()
    assert page.evaluate('(k)=>localStorage.getItem(k)',KEY)=='broken district'
    with page.expect_download() as d:click(page,'backup')
    path=out/'original-broken-backup.json';d.value.save_as(str(path));assert path.read_text()=='broken district'
    page.on('dialog',lambda d:d.accept());click(page,'reset')
    assert state(page)['day']==1
    assert page.evaluate("localStorage.getItem('mm.company.v3')")=='keep this'

def responsive_and_effects(page,ctx,url,out):
    start(page,url)
    for width in (1440,1280,1024,768,375):
        page.set_viewport_size({'width':width,'height':900})
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),f'overflow at {width}'
        panel(page,'policy')
        assert page.locator('[name="reserve"]').is_visible()
        panel(page,'overview')
        page.screenshot(path=str(out/f'layout-{width}.png'),full_page=True)
    before=state(page);click(page,'effects');assert state(page)==before
    assert page.locator('.scene.reduced').count()==1

JOURNEYS=[auto_company,export_chain,pause_and_visibility,policy_controls,planning_and_keyboard,offline_and_old_saves,storage_failure,corrupt_save,responsive_and_effects]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--browsers',nargs='+',default=['chromium','firefox','webkit']);ap.add_argument('--output',default='/tmp/district-evidence');args=ap.parse_args()
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT.parent)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/{ROOT.name}/desktop/'
    results=[]
    try:
        with sync_playwright() as p:
            for name in args.browsers:
                browser=getattr(p,name).launch()
                for journey in JOURNEYS:
                    folder=out/name/journey.__name__;folder.mkdir(parents=True,exist_ok=True)
                    context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
                    context.tracing.start(screenshots=True,snapshots=True,sources=True)
                    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    result={'browser':name,'journey':journey.__name__}
                    try:
                        journey(page,context,url,folder)
                        assert not errors,errors
                        result['status']='passed';context.tracing.stop()
                    except Exception:
                        result['status']='failed';result['error']=traceback.format_exc()
                        page.screenshot(path=str(folder/'failure.png'),full_page=True)
                        context.tracing.stop(path=str(folder/'trace.zip'))
                    results.append(result);print(json.dumps(result),flush=True);context.close()
                browser.close()
    finally:
        server.shutdown()
        (out/'results.json').write_text(json.dumps(results,indent=2))
    return 0 if results and all(r['status']=='passed' for r in results) else 1

if __name__=='__main__':raise SystemExit(main())
