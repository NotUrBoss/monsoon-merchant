"""Desktop Builder acceptance journeys against an isolated local HTTP server.

Install the dependencies in browser-requirements.txt and Playwright's three browsers.
Run: python tests/builder_browser.py --browsers chromium firefox webkit --output PATH
Journeys use visible controls. JavaScript reads saved state; named failure/legacy
fixtures seed browser storage. Playwright's clock runs the actual UI timer.
"""
from __future__ import annotations

import argparse
import functools
import json
import os
import threading
import traceback
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_e2e import QuietHandler, ROOT

KEY = "mm.builder.v1"
DAY_MS = 1500


def state(page):
    return page.evaluate("(key) => JSON.parse(localStorage.getItem(key))", KEY)


def economy(saved):
    return {key: value for key, value in saved.items() if key not in ("speed", "pauseReason")}


def click(page, action):
    page.locator(f'[data-b="{action}"]').click()


def speed(page, value):
    page.locator(f'[data-b="speed"][data-speed="{value}"]').click()


def tab(page, value):
    page.locator(f'.b-toolbar [data-b="tab"][data-tab="{value}"]').click()


def view(page, value):
    page.locator(f'.b-view-toggle [data-b="view"][data-view="{value}"]').click()


def start(page, url, approve=True, pause_after_approval=True):
    page.goto(url, wait_until="networkidle")
    page.locator('[data-a="builder"]').click()
    if approve:
        click(page, "approve-starter")
        if pause_after_approval:
            speed(page, 0)
    return state(page)


def resume(page, url):
    page.goto(url, wait_until="networkidle")
    page.locator('[data-a="builder"]').click()
    return state(page)


def run_days(page, days, rate=4):
    speed(page, rate)
    page.clock.run_for(DAY_MS * days // rate)
    speed(page, 0)
    return state(page)


def no_overflow(page):
    sizes = page.evaluate("""() => [document.documentElement, document.body,
      document.querySelector('#app')].filter(Boolean).map(e => ({
        name: e.id || e.tagName, width: e.clientWidth, scroll: e.scrollWidth
      }))""")
    assert all(item["scroll"] <= item["width"] + 1 for item in sizes), sizes


def stocks(page):
    return {
        good: page.locator(f'[data-stock="{good}"]').inner_text()
        for good in ("rice", "food")
    }


def snapshot(page, out, name):
    page.screenshot(path=str(out / f"{name}.png"), full_page=True)


def autonomous_journey(page, context, url, out):
    initial = start(page, url, pause_after_approval=False)
    assert initial["speed"] == 1, "Starter approval must start the approved company"
    assert initial["totals"]["seaArrivals"] == 0
    page.clock.run_for(DAY_MS * 3)
    speed(page, 0)
    paused = state(page)
    assert paused["day"] == 3, "Starter did not operate without another command"
    page.clock.run_for(DAY_MS * 4)
    assert state(page) == paused, "Paused company changed without a player command"
    after = run_days(page, 32)
    assert after["day"] == initial["day"] + 35
    assert after["totals"]["localSold"] > 0, "Local buyer never bought output"
    assert after["totals"]["exportSold"] > 0, "Export buyer never paid for delivery"
    assert after["totals"]["seaArrivals"] >= 3, "Expected repeated autonomous deliveries"
    assert after["totals"]["monsoonDelayed"] > 0, "Monsoon never affected the sea route"
    assert after["totals"]["foodProduced"] > 0
    finance = page.evaluate("(s) => MMBuilder.finance(s)", after)
    assert finance["operatingProfit"] > 0, finance
    assert page.locator('[data-stat="profit"]').inner_text().strip()
    snapshot(page, out, "autonomous-profitable-chain")
    restored = resume(page, url)
    assert economy(restored) == economy(after), "Reload lost or advanced paused company"
    assert restored["speed"] == 0
    page.clock.run_for(DAY_MS * 10)
    assert state(page) == restored, "Reload applied offline catch-up or resumed the clock"
    view(page, "regional")
    regional = stocks(page)
    assert state(page) == restored, "Regional view changed the simulation"
    view(page, "local")
    assert stocks(page) == regional, "Local and regional views show different stock"
    assert state(page) == restored
    page.evaluate("""async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
    }""")
    context.set_offline(True)
    assert economy(resume(page, url)) == economy(after), "Offline reload lost the Builder save"
    snapshot(page, out, "offline-restored-company")
    context.set_offline(False)
    (out / "company-after-35-days.json").write_text(json.dumps(after, indent=2))


def playback_journey(page, context, url, out):
    initial = start(page, url)
    # Every playback rate executes the same number of complete simulation days.
    results = []
    for rate in (1, 2, 4):
        # Exit first so the previous page's pagehide autosave cannot replace the fixture.
        click(page, "exit")
        page.evaluate(
            "([key, value]) => localStorage.setItem(key, JSON.stringify(value))",
            [KEY, initial],
        )
        resume(page, url)
        results.append(run_days(page, 12, rate))
    assert results[0] == results[1] == results[2], "Playback speed changed economics"
    paused = state(page)
    page.clock.run_for(DAY_MS * 10)
    assert state(page) == paused
    # Dispatch the browser blur event to verify the real background-pause handler.
    speed(page, 4)
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    blurred = state(page)
    assert blurred["speed"] == 0
    page.clock.run_for(DAY_MS * 5)
    assert state(page) == blurred, "A background company continued running"
    snapshot(page, out, "playback-paused")


def responsive_journey(page, context, url, out):
    initial = start(page, url)
    for width, height in ((1440, 1000), (1024, 768), (768, 1024), (375, 812)):
        page.set_viewport_size({"width": width, "height": height})
        for name in ("build", "routes", "markets", "upgrades", "company"):
            tab(page, name)
            no_overflow(page)
            missing = page.locator("input[id], select[id], textarea[id]").evaluate_all(
                """els => els.filter(e => !document.querySelector(
                  'label[for="' + e.id + '"]') && !e.getAttribute('aria-label'))
                  .map(e => e.id)"""
            )
            assert missing == [], missing
        view(page, "regional")
        no_overflow(page)
        view(page, "local")
        no_overflow(page)
        # A generic button hover must not obscure the active map view's dark text.
        active_view = page.locator(".b-view-toggle .is-active")
        active_view.hover()
        contrast = active_view.evaluate("""element => {
          const style = getComputedStyle(element);
          const luminance = color => color.match(/[\\d.]+/g).slice(0,3)
            .map(Number).map(v => v / 255)
            .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
            .reduce((sum,v,i) => sum + v * [0.2126,0.7152,0.0722][i], 0);
          const a=luminance(style.color), b=luminance(style.backgroundColor);
          return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
        }""")
        assert contrast >= 4.5, f"Hovered active map view has poor text contrast: {contrast}"
        snapshot(page, out, f"layout-{width}")
    assert state(page) == initial, "Responsive navigation changed company state"
    page.locator('[data-b="speed"][data-speed="1"]').focus()
    page.keyboard.press("Enter")
    page.clock.run_for(DAY_MS)
    page.locator('[data-b="speed"][data-speed="0"]').focus()
    page.keyboard.press("Enter")
    assert state(page)["day"] == initial["day"] + 1
    no_overflow(page)


def policy_journey(page, context, url, out):
    initial = start(page, url)
    tab(page, "company")
    click(page, "policies")
    settings = {
        "cash-floor": "3000", "stock-buffer": "12", "production-target": "6",
        "budget-procurement": "3500", "budget-production": "1400",
        "budget-freight": "700",
    }
    for field, value in settings.items():
        page.locator(f"#builder-{field}").fill(value)
    click(page, "save-policy")
    edited = state(page)
    assert edited["policy"]["cashFloor"] == 300000
    assert edited["policy"]["productionTarget"] == 6
    assert edited["policy"]["stockBuffer"] == 12
    assert edited["policy"]["weeklyBudget"] == {
        "procurement": 350000, "production": 140000, "freight": 70000
    }
    for field in ("cash", "inventory", "buildings", "ledger", "totals", "day"):
        assert edited[field] == initial[field], f"Policy edit secretly changed {field}"
    # A malformed target cannot partially apply any of the other policy fields.
    click(page, "policies")
    page.locator("#builder-production-target").fill("-1")
    click(page, "save-policy")
    assert state(page) == edited, "Invalid policy partially mutated the company"
    page.locator("#builder-production-target").fill("6")
    page.keyboard.press("Escape")
    after = run_days(page, 7)
    assert after["day"] == 7
    assert after["totals"]["foodProduced"] <= 7 * 6
    assert after["cash"] >= after["policy"]["cashFloor"]
    for category, spent in after["week"]["spent"].items():
        assert spent <= after["policy"]["weeklyBudget"][category]
    # Already spent authorizations cannot be retroactively reduced to zero.
    tab(page, "company")
    click(page, "policies")
    page.locator("#builder-budget-procurement").fill("0")
    click(page, "save-policy")
    assert state(page) == after
    snapshot(page, out, "policy-budgets-and-rejection")
    page.keyboard.press("Escape")
    click(page, "step")
    stepped = state(page)
    assert stepped["day"] > after["day"] and stepped["speed"] == 0


def construction_journey(page, context, url, out):
    start(page, url, approve=False)
    # Keyboard selection verifies map alternatives without relying on SVG hitboxes.
    def plot(value):
        page.locator(f'[data-b="plot"][data-plot="{value}"]').focus()
        page.keyboard.press("Enter")

    plot("p4")
    assert all(page.locator('[data-b="place"]').nth(i).is_disabled() for i in range(4))
    plot("p3")
    assert page.locator('[data-b="place"][data-type="dock"]').is_disabled()
    for kind, location in (("depot", "p1"), ("warehouse", "p2"), ("mill", "p6"), ("dock", "p10")):
        plot(location)
        page.locator(f'[data-b="place"][data-type="{kind}"]').click()
        assert any(b["type"] == kind and b["plot"] == location for b in state(page)["buildings"])
    built = state(page)
    assert len(built["buildings"]) == 4
    assert not built["starterApproved"]
    assert built["cash"] == 1500000 and built["totals"]["buildCost"] == 1500000
    assert built["agreements"] == {"local": False, "export": False}
    assert built["route"]["enabled"] is False
    tab(page, "upgrades")
    before_capacity = page.evaluate("(s) => MMBuilder.status(s).storageCapacity", built)
    page.locator('[data-b="upgrade"][data-type="warehouse"]').click()
    upgraded = state(page)
    assert next(b["level"] for b in upgraded["buildings"] if b["type"] == "warehouse") == 2
    assert upgraded["cash"] == built["cash"] - 150000
    assert page.evaluate("(s) => MMBuilder.status(s).storageCapacity", upgraded) > before_capacity
    page.locator('[data-b="upgrade"][data-type="dock"]').click()
    expanded = state(page)
    assert next(b["level"] for b in expanded["buildings"] if b["type"] == "dock") == 2
    assert expanded["cash"] == upgraded["cash"] - 200000
    tab(page, "markets")
    click(page, "approve-local")
    click(page, "approve-export")
    tab(page, "routes")
    page.locator("#builder-route-capacity").fill("18")
    page.locator("#builder-route-interval").fill("5")
    assert page.locator('[data-b="speed"][data-speed="4"]').is_disabled()
    click(page, "save-route")
    route_settings = state(page)
    page.locator("#builder-route-capacity").fill("19")
    click(page, "save-route")
    assert state(page) == route_settings, "Route load exceeded the upgraded dock limit"
    click(page, "cancel-route-edit")
    click(page, "approve-route")
    configured = state(page)
    assert configured["agreements"] == {"local": True, "export": True}
    assert configured["route"]["enabled"] is True
    assert configured["route"]["capacity"] == 18 and configured["route"]["interval"] == 5
    assert configured["cash"] == expanded["cash"], "Approvals awarded or spent cash"
    after = run_days(page, 21)
    assert after["totals"]["localSold"] > 0 and after["totals"]["seaArrivals"] >= 2
    assert all(shipment["qty"] == 18 for shipment in after["shipments"])
    assert all(b["departDay"] - a["departDay"] >= 5 for a, b in zip(after["shipments"], after["shipments"][1:]))
    snapshot(page, out, "custom-built-authorized-company")


def open_restore(page, text):
    tab(page, "company")
    page.locator(".b-restore summary").click()
    page.locator("#builder-import").fill(text)
    click(page, "restore-backup")


def backup_journey(page, context, url, out):
    initial = start(page, url)
    progressed = run_days(page, 7)
    open_restore(page, "{not valid JSON")
    assert state(page) == progressed
    assert "not changed" in page.locator(".b-notice").inner_text()
    poisoned = json.loads(json.dumps(progressed))
    poisoned["inventory"]["food"] += 1
    page.locator("#builder-import").fill(json.dumps(poisoned))
    click(page, "restore-backup")
    assert state(page) == progressed, "Forged stock was accepted from a backup"
    page.locator("#builder-import").fill(json.dumps(initial))
    click(page, "restore-backup")
    assert state(page) == progressed, "Backup review changed the current company"
    click(page, "cancel-restore")
    assert state(page) == progressed
    page.locator(".b-restore summary").click()
    click(page, "restore-backup")
    click(page, "confirm-restore")
    restored = state(page)
    assert economy(restored) == economy(initial)
    assert restored["speed"] == 0
    snapshot(page, out, "validated-backup-restored")


def corrupt_save_journey(page, context, url, out):
    page.goto(url, wait_until="networkidle")
    raw = '{"schema":1,"cash":900000000,"inventory":{"food":999}}'
    page.evaluate("([key, raw]) => localStorage.setItem(key, raw)", [KEY, raw])
    page.locator('[data-a="builder"]').click()
    assert "preserved" in page.locator(".b-save-warning").inner_text()
    assert page.evaluate("(key) => localStorage.getItem(key)", KEY) == raw
    tab(page, "company")
    assert page.locator('[data-b="backup-original"]').is_visible()
    click(page, "confirm-reset")
    click(page, "cancel-reset")
    assert page.evaluate("(key) => localStorage.getItem(key)", KEY) == raw
    snapshot(page, out, "corrupt-save-preserved")
    click(page, "confirm-reset")
    click(page, "reset")
    replaced = state(page)
    assert replaced["day"] == 0 and replaced["buildings"] == []
    assert replaced["cash"] == 3000000 and replaced["speed"] == 0
    click(page, "approve-starter")
    speed(page, 0)
    assert len(state(page)["buildings"]) == 4


def failed_restore_journey(page, context, url, out):
    start(page, url)
    existing = run_days(page, 7)
    candidate = page.evaluate("() => MMBuilder.serialize(MMBuilder.create())")
    open_restore(page, candidate)
    # Explicit storage-denial fixture: only the Builder save write fails.
    page.evaluate("""() => {
      window.__builderSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'mm.builder.v1') throw new DOMException('Test quota failure', 'QuotaExceededError');
        return window.__builderSetItem.call(this, key, value);
      };
    }""")
    click(page, "confirm-restore")
    assert state(page) == existing, "Failed restore overwrote the existing save"
    assert page.locator('[data-stat="day"]').inner_text() == "Day 7"
    assert "could not" in page.locator(".builder-shell").inner_text().lower()
    snapshot(page, out, "failed-restore-keeps-company")
    page.evaluate("() => { Storage.prototype.setItem = window.__builderSetItem; }")
    click(page, "exit")
    assert economy(state(page)) == economy(existing), "Failed restore replaced in-memory company"
    assert economy(resume(page, url)) == economy(existing)


def cash_recovery_journey(page, context, url, out):
    page.goto(url, wait_until="networkidle")
    # Reproduce a reachable cash crisis solely with successful public commands.
    # Fixtures are installed before entering Builder so no outgoing autosave can overwrite them.
    fixture = page.evaluate("""() => {
      const B = MMBuilder, s = B.create();
      const ok = result => { if (!result.ok) throw new Error(result.error); };
      ok(B.approveStarter(s)); ok(B.setPolicy(s, {cashFloor:0}));
      ok(B.setSpeed(s,1)); ok(B.advance(s,3));
      for (const type of ['warehouse','depot','depot','mill','mill']) ok(B.upgrade(s,type));
      ok(B.setPolicy(s, {productionTarget:0,stockBuffer:27,production:false,delivery:false,
        weeklyBudget:{procurement:500000}}));
      ok(B.advance(s));
      const raw = B.serialize(s); localStorage.setItem('mm.builder.v1',raw);
      return JSON.parse(raw);
    }""")
    assert fixture["day"] == 4 and fixture["cash"] == 0 and fixture["speed"] == 0
    shipment = next(s for s in fixture["shipments"] if s["status"] == "inTransit")
    assert shipment["arrivalDay"] == 7
    page.locator('[data-a="builder"]').click()
    loaded = state(page)
    assert economy(loaded) == economy(fixture)
    click(page, "wait-arrival")
    recovered = state(page)
    assert recovered["day"] == shipment["arrivalDay"] and recovered["speed"] == 0
    assert recovered["cash"] == shipment["revenue"]
    assert recovered["inventory"] == loaded["inventory"]
    for category in ("ricePurchased", "riceProcessed", "foodProduced", "localSold", "seaDepartures",
                     "procurementCost", "productionCost", "freightCost"):
        assert recovered["totals"][category] == loaded["totals"][category], category
    assert recovered["totals"]["seaArrivals"] == loaded["totals"]["seaArrivals"] + 1
    assert len(recovered["ledger"]) == len(loaded["ledger"]) + 1
    assert recovered["ledger"][-1]["kind"] == "exportSale"
    assert recovered["shipments"][0]["status"] == "delivered"
    wait_control = page.locator('[data-b="wait-arrival"]')
    assert wait_control.count() == 0 or wait_control.is_disabled()
    page.clock.run_for(DAY_MS * 5)
    assert state(page) == recovered, "Waiting silently resumed the company or paid twice"
    snapshot(page, out, "zero-cash-paid-shipment-recovery")


def legacy_journey(page, context, url, out):
    page.goto(url, wait_until="networkidle")
    # Valid existing-mode fixtures establish byte-for-byte save isolation.
    legacy = page.evaluate("""() => {
      const meta = MM.newMeta();
      const values = {
        'mm.meta.v1': JSON.stringify(meta),
        'mm.run.normal.v1': MM.serialize(MM.newRun({seed:'builder-legacy'}, meta)),
        'mm.company.v3': MMNetwork.serialize(MMNetwork.create('builder-legacy', true))
      };
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      return values;
    }""")
    initial = start(page, url)
    run_days(page, 7)
    current = page.evaluate(
        "(keys) => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]))",
        list(legacy),
    )
    assert current == legacy, "Builder changed an existing game save"
    click(page, "exit")
    page.locator('[data-a="network"]').click()
    page.locator('[data-n="continue"]').click()
    assert page.locator(".network-screen").is_visible()
    assert state(page)["day"] == initial["day"] + 7
    page.locator('[data-n="exit"]').click()
    page.locator('[data-a="continue"][data-slot="normal"]').click()
    assert page.locator(".screen.run").is_visible()
    assert page.locator('[data-a="trade"]').count() > 0
    snapshot(page, out, "classic-save-preserved")


JOURNEYS = {
    "autonomous-chain-save-offline": autonomous_journey,
    "playback-parity-and-pause": playback_journey,
    "responsive-keyboard": responsive_journey,
    "policies-budgets-and-event-step": policy_journey,
    "manual-placement-and-upgrades": construction_journey,
    "backup-validation-and-restore": backup_journey,
    "corrupt-save-preservation": corrupt_save_journey,
    "storage-failure-during-restore": failed_restore_journey,
    "zero-cash-shipment-recovery": cash_recovery_journey,
    "legacy-mode-isolation": legacy_journey,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/tmp/mm-builder-evidence")
    parser.add_argument("--browsers", nargs="+", default=["chromium", "firefox", "webkit"])
    parser.add_argument("--journeys", nargs="+", choices=JOURNEYS)
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT.parent))
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/{ROOT.name}/"
    results = []
    try:
        with sync_playwright() as playwright:
            for engine in args.browsers:
                options = {}
                if engine == "chromium" and os.environ.get("MM_CHROMIUM_PATH"):
                    options["executable_path"] = os.environ["MM_CHROMIUM_PATH"]
                try:
                    browser = getattr(playwright, engine).launch(headless=True, **options)
                except Exception:
                    results.append({
                        "browser": engine, "journey": "browser-launch", "status": "failed",
                        "error": traceback.format_exc(),
                    })
                    print(json.dumps(results[-1]), flush=True)
                    continue
                try:
                    for name in args.journeys or JOURNEYS:
                        directory = output / engine / name
                        directory.mkdir(parents=True, exist_ok=True)
                        context = browser.new_context(
                            viewport={"width": 1440, "height": 1000},
                            reduced_motion="reduce",
                        )
                        context.tracing.start(screenshots=True, snapshots=True, sources=True)
                        page = context.new_page()
                        page.set_default_timeout(10000)
                        instant = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
                        page.clock.install(time=instant)
                        page.clock.pause_at(instant + timedelta(seconds=1))
                        errors = []
                        page.on("pageerror", lambda error: errors.append(str(error)))
                        result = {"browser": engine, "journey": name, "status": "passed"}
                        try:
                            JOURNEYS[name](page, context, url, directory)
                            assert errors == [], errors
                            context.tracing.stop()
                        except Exception:
                            result.update(
                                status="failed", error=traceback.format_exc(),
                                console_errors=errors,
                            )
                            try:
                                snapshot(page, directory, "failure")
                                (directory / "failure.html").write_text(
                                    page.content(), encoding="utf-8"
                                )
                                context.tracing.stop(path=str(directory / "trace.zip"))
                            except Exception:
                                pass
                        finally:
                            context.close()
                        results.append(result)
                        print(json.dumps(result), flush=True)
                finally:
                    browser.close()
    finally:
        server.shutdown()
        server.server_close()
        report = {
            "journeys": results,
            "passed": sum(r["status"] == "passed" for r in results),
            "failed": sum(r["status"] == "failed" for r in results),
        }
        (output / "results.json").write_text(json.dumps(report, indent=2))
    if not results or any(r["status"] == "failed" for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
