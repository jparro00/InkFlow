"""
Ink Bloop PWA + cold-start audit harness.

Drives Playwright Chromium against the deployed dev URL, captures everything
the browser sees during boot (console, network, errors, perf timings, SW
state, cache contents), runs Lighthouse for the formal PWA + perf scores,
and writes the lot to tmp/pwa-audit/<utc-timestamp>/.

Why a custom harness instead of "just run Lighthouse": Lighthouse gives you
scores, but it doesn't show you the actual modulepreload list, the actual
cache contents after first render, or whether the SW lazy-precache message
round-tripped. Those are the things we just changed; we want to verify them
empirically, not via a 0-100 score.

Auth: Vercel SSO gates inkbloop-dev.vercel.app, so every request needs the
x-vercel-protection-bypass header. The token lives in .env.local (gitignored)
as VERCEL_BYPASS_TOKEN. See docs link in the help output.

Run:
  python scripts/pwa-audit.py
  python scripts/pwa-audit.py --url https://inkbloop-dev.vercel.app/
  python scripts/pwa-audit.py --skip-lighthouse  # faster, dev-loop iterations
"""

from __future__ import annotations

import argparse
import io
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.async_api import (
    async_playwright,
    BrowserContext,
    Page,
    Request,
    Response,
    Error as PWError,
)


REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_LOCAL = REPO_ROOT / ".env.local"
OUTPUT_ROOT = REPO_ROOT / "tmp" / "pwa-audit"
DEFAULT_URL = "https://inkbloop-dev.vercel.app/"

# Slow 4G — Lighthouse's default mobile throttling.
SLOW_4G = {
    "downloadThroughput": int(1.6 * 1024 * 1024 / 8),
    "uploadThroughput": int(750 * 1024 / 8),
    "latency": 150,
}


def read_env(key: str) -> str | None:
    if not ENV_LOCAL.exists():
        return None
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        if k.strip() == key:
            v = v.strip()
            if v and v[0] in ("'", '"') and v[-1] == v[0]:
                v = v[1:-1]
            return v
    return None


@dataclass
class CapturedRequest:
    url: str
    method: str
    resource_type: str
    status: int | None = None
    from_service_worker: bool = False
    response_size: int | None = None
    started_at: float = 0.0
    ended_at: float | None = None
    failure: str | None = None

    @property
    def duration_ms(self) -> float | None:
        if self.ended_at is None:
            return None
        return (self.ended_at - self.started_at) * 1000


@dataclass
class CaptureBundle:
    label: str
    url: str
    page_title: str = ""
    navigation_started_at: float = 0.0
    load_event_at: float | None = None
    dom_content_loaded_at: float | None = None
    perf_timing: dict[str, Any] = field(default_factory=dict)
    paint_timings: list[dict[str, Any]] = field(default_factory=list)
    largest_contentful_paint_ms: float | None = None
    console: list[dict[str, Any]] = field(default_factory=list)
    page_errors: list[str] = field(default_factory=list)
    requests: list[CapturedRequest] = field(default_factory=list)
    sw_state: dict[str, Any] = field(default_factory=dict)
    manifest: dict[str, Any] = field(default_factory=dict)
    modulepreloads: list[str] = field(default_factory=list)
    icons_check: list[dict[str, Any]] = field(default_factory=list)
    response_headers: dict[str, dict[str, str]] = field(default_factory=dict)


def fmt_kb(n: int | None) -> str:
    if n is None:
        return "?"
    if n < 1024:
        return f"{n} B"
    return f"{n / 1024:.1f} KB"


async def attach_listeners(page: Page, bundle: CaptureBundle) -> None:
    """Hook every observable signal on the page so we can stop the test
    later and reconstruct what happened."""

    pending: dict[str, CapturedRequest] = {}

    def on_request(req: Request) -> None:
        cap = CapturedRequest(
            url=req.url,
            method=req.method,
            resource_type=req.resource_type,
            started_at=time.time(),
        )
        pending[req.url + "::" + req.method] = cap
        bundle.requests.append(cap)

    async def on_response(resp: Response) -> None:
        key = resp.url + "::" + resp.request.method
        cap = pending.get(key)
        if not cap:
            return
        cap.status = resp.status
        cap.from_service_worker = resp.from_service_worker
        cap.ended_at = time.time()
        try:
            cl = resp.headers.get("content-length")
            cap.response_size = int(cl) if cl is not None else None
        except Exception:
            cap.response_size = None
        # Persist response headers for the navigation document and any
        # /assets/ resource — that's where Cache-Control + Content-Encoding
        # checks live.
        try:
            url = resp.url
            if url.endswith("/") or "/assets/" in url or url.endswith(".js") or url.endswith(".css") or url.endswith(".html"):
                bundle.response_headers[url] = dict(resp.headers)
        except Exception:
            pass

    def on_request_failed(req: Request) -> None:
        key = req.url + "::" + req.method
        cap = pending.get(key)
        if cap:
            cap.failure = req.failure or "unknown"
            cap.ended_at = time.time()

    def on_console(msg: Any) -> None:
        bundle.console.append({
            "type": msg.type,
            "text": msg.text,
            "location": dict(msg.location) if msg.location else {},
        })

    def on_page_error(err: PWError) -> None:
        bundle.page_errors.append(str(err))

    page.on("request", on_request)
    page.on("response", lambda r: asyncio.create_task(on_response(r)))
    page.on("requestfailed", on_request_failed)
    page.on("console", on_console)
    page.on("pageerror", on_page_error)


async def gather_runtime_state(page: Page, bundle: CaptureBundle) -> None:
    """Run a single big page.evaluate() that probes everything we care about
    in the live page context: SW state, cache contents, manifest content,
    declared modulepreloads, and performance timings."""
    js = r"""
    async () => {
      const result = {};

      // Performance entries
      try {
        const nav = performance.getEntriesByType('navigation')[0];
        result.navigation = nav ? nav.toJSON() : null;
      } catch (e) { result.navigation_error = String(e); }
      try {
        result.paint = performance.getEntriesByType('paint').map(p => p.toJSON());
      } catch (e) { result.paint_error = String(e); }
      try {
        const lcp = performance.getEntriesByType('largest-contentful-paint');
        result.largest_contentful_paint_ms = lcp.length ? lcp[lcp.length - 1].startTime : null;
      } catch (e) { result.lcp_error = String(e); }
      result.perfTiming = performance.timing && performance.timing.toJSON ? performance.timing.toJSON() : null;

      // Service worker
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            const active = reg.active;
            const navPreload = reg.navigationPreload && (await reg.navigationPreload.getState().catch(() => null));
            result.sw = {
              scope: reg.scope,
              updateViaCache: reg.updateViaCache,
              installing_state: reg.installing && reg.installing.state,
              waiting_state: reg.waiting && reg.waiting.state,
              active_state: active && active.state,
              active_scriptURL: active && active.scriptURL,
              navigation_preload: navPreload || null,
            };
            if (window.caches) {
              const keys = await caches.keys();
              const cacheContents = {};
              for (const k of keys) {
                const c = await caches.open(k);
                const reqs = await c.keys();
                cacheContents[k] = reqs.map(r => r.url);
              }
              result.caches = cacheContents;
            }
          } else {
            result.sw = { registered: false };
          }
        } else {
          result.sw = { supported: false };
        }
      } catch (e) {
        result.sw_error = String(e);
      }

      // Manifest content
      try {
        const link = document.querySelector('link[rel="manifest"]');
        if (link) {
          const r = await fetch(link.href);
          const text = await r.text();
          let parsed = null;
          try { parsed = JSON.parse(text); } catch (e) { parsed = { _parse_error: String(e), _raw: text.slice(0, 500) }; }
          result.manifest = parsed;
        }
      } catch (e) {
        result.manifest_error = String(e);
      }

      // Declared modulepreload list — regression check that framer-motion / supabase aren't here
      result.modulepreload = [...document.querySelectorAll('link[rel="modulepreload"]')]
        .map(l => l.getAttribute('href'));

      // Icon dimensions (declared vs. actual)
      try {
        const link = document.querySelector('link[rel="manifest"]');
        const manifest = link ? await (await fetch(link.href)).json() : null;
        const out = [];
        const icons = manifest?.icons || [];
        for (const ic of icons) {
          const url = new URL(ic.src, link.href).href;
          const blob = await (await fetch(url)).blob();
          const bitmap = await createImageBitmap(blob);
          out.push({
            src: ic.src,
            declared_sizes: ic.sizes,
            actual_width: bitmap.width,
            actual_height: bitmap.height,
            byte_size: blob.size,
            type: ic.type,
            purpose: ic.purpose || 'any',
          });
          bitmap.close();
        }
        result.icons = out;
      } catch (e) {
        result.icons_error = String(e);
      }

      result.title = document.title;
      result.url = location.href;
      return result;
    }
    """
    state = await page.evaluate(js)
    bundle.perf_timing = state.get("perfTiming") or {}
    bundle.paint_timings = state.get("paint") or []
    bundle.largest_contentful_paint_ms = state.get("largest_contentful_paint_ms")
    bundle.sw_state = state.get("sw") or {}
    if "caches" in state:
        bundle.sw_state["caches"] = state["caches"]
    bundle.manifest = state.get("manifest") or {}
    bundle.modulepreloads = state.get("modulepreload") or []
    bundle.icons_check = state.get("icons") or []
    bundle.page_title = state.get("title", "")


async def cold_load(
    pw,
    *,
    url: str,
    token: str,
    output_dir: Path,
    label: str,
    mobile: bool = False,
    persist_cache: bool = False,
    offline_after_load: bool = False,
) -> CaptureBundle:
    """Cold-load a URL with throttling, capture everything, screenshot,
    and (optionally) flip offline before returning to test SW fallback.

    persist_cache=False launches a fresh ephemeral context so neither the
    HTTP cache nor the service worker cache leaks across runs — that's a
    real cold load.
    """
    print(f"[{label}] launching browser (mobile={mobile})...")
    browser = await pw.chromium.launch(headless=True)

    extra_headers = {
        "x-vercel-protection-bypass": token,
        # Tell Vercel to set the bypass cookie on first response so the SW,
        # manifest, icons, and fetched assets don't each re-challenge.
        "x-vercel-set-bypass-cookie": "true",
    }
    context_kwargs: dict[str, Any] = {
        "extra_http_headers": extra_headers,
        "ignore_https_errors": False,
    }
    if mobile:
        # Mirror Lighthouse's mobile preset: Moto G Power equivalent.
        context_kwargs.update({
            "viewport": {"width": 412, "height": 823},
            "device_scale_factor": 1.75,
            "is_mobile": True,
            "has_touch": True,
            "user_agent": "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
        })
    else:
        context_kwargs["viewport"] = {"width": 1280, "height": 800}

    context = await browser.new_context(**context_kwargs)

    # CDP throttling — this is what hurts on the actual cold-start path,
    # not localhost gigabit.
    cdp = await context.new_cdp_session(await context.new_page())
    # We just spent a CDP page — close it; we'll open the real one below.
    page0 = context.pages[0]
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", {
        "offline": False,
        "latency": SLOW_4G["latency"],
        "downloadThroughput": SLOW_4G["downloadThroughput"],
        "uploadThroughput": SLOW_4G["uploadThroughput"],
    })
    await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4 if mobile else 1})

    bundle = CaptureBundle(label=label, url=url)
    bundle.navigation_started_at = time.time()
    page = page0
    await attach_listeners(page, bundle)

    # Trace — opens with `playwright show-trace tmp/pwa-audit/<ts>/<label>-trace.zip`
    await context.tracing.start(screenshots=True, snapshots=True, sources=False)

    try:
        # `wait_until="load"` waits for the load event; we then poll for
        # SW activation separately so we capture the "useful paint" plus
        # SW-registered state in one pass.
        await page.goto(url, wait_until="load", timeout=60_000)
        bundle.load_event_at = time.time()

        # Wait for SW (if any) to reach active. Don't fail on timeout —
        # we'd rather capture the "no SW yet" state than abort.
        try:
            await page.wait_for_function(
                """() => {
                    if (!('serviceWorker' in navigator)) return true;
                    return navigator.serviceWorker.controller != null
                        || navigator.serviceWorker.ready != null;
                }""",
                timeout=10_000,
            )
        except PWError:
            pass

        # Give SW a moment to receive the cacheVendors postMessage from
        # main.tsx and populate its cache.
        await page.wait_for_timeout(2_000)

        await gather_runtime_state(page, bundle)

        screenshot_path = output_dir / f"{label}.png"
        await page.screenshot(path=str(screenshot_path), full_page=False)

        if offline_after_load:
            print(f"[{label}] flipping offline + reloading...")
            await cdp.send("Network.emulateNetworkConditions", {
                "offline": True,
                "latency": 0,
                "downloadThroughput": 0,
                "uploadThroughput": 0,
            })
            try:
                await page.reload(wait_until="load", timeout=15_000)
                await page.screenshot(path=str(output_dir / f"{label}-offline.png"))
                bundle.sw_state["offline_reload_ok"] = True
            except PWError as e:
                bundle.sw_state["offline_reload_ok"] = False
                bundle.sw_state["offline_reload_error"] = str(e)
    finally:
        try:
            await context.tracing.stop(path=str(output_dir / f"{label}-trace.zip"))
        except Exception:
            pass
        await browser.close()

    return bundle


def serialize_bundle(b: CaptureBundle) -> dict[str, Any]:
    return {
        "label": b.label,
        "url": b.url,
        "page_title": b.page_title,
        "navigation_started_at": b.navigation_started_at,
        "load_event_at": b.load_event_at,
        "dom_content_loaded_at": b.dom_content_loaded_at,
        "wall_clock_load_ms": (b.load_event_at - b.navigation_started_at) * 1000 if b.load_event_at else None,
        "perf_timing": b.perf_timing,
        "paint_timings": b.paint_timings,
        "largest_contentful_paint_ms": b.largest_contentful_paint_ms,
        "console": b.console,
        "page_errors": b.page_errors,
        "sw_state": b.sw_state,
        "manifest": b.manifest,
        "modulepreloads": b.modulepreloads,
        "icons_check": b.icons_check,
        "response_headers": b.response_headers,
        "requests": [
            {
                "url": r.url,
                "method": r.method,
                "type": r.resource_type,
                "status": r.status,
                "from_sw": r.from_service_worker,
                "size": r.response_size,
                "duration_ms": r.duration_ms,
                "failure": r.failure,
            }
            for r in b.requests
        ],
    }


def run_lighthouse(url: str, token: str, output_dir: Path, preset: str) -> dict[str, Any] | None:
    """Run Lighthouse via npx and return the parsed score summary. Lighthouse
    is a heavy dep (~50 MB), so we let npx fetch it on first run and rely on
    the npm cache thereafter."""
    # Lighthouse appends .report.json/.report.html to the --output-path
    # value, so we strip the suffix when passing it in and look for the
    # appended path on read-back.
    out_base = output_dir / f"lighthouse-{preset}"
    out_json = output_dir / f"lighthouse-{preset}.report.json"
    extra_headers = json.dumps({
        "x-vercel-protection-bypass": token,
        "x-vercel-set-bypass-cookie": "true",
    })
    cmd = [
        "npx", "-y", "lighthouse@13",
        url,
        f"--preset={preset}" if preset == "desktop" else "",
        f"--output=json", f"--output=html",
        f"--output-path={out_base.as_posix()}",
        "--quiet",
        "--chrome-flags=--headless --no-sandbox",
        f"--extra-headers={extra_headers}",
    ]
    cmd = [c for c in cmd if c]
    print(f"[lighthouse:{preset}] running...")
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, shell=True)
    # Lighthouse on Windows hits an EPERM at temp-dir cleanup that returns
    # rc=1 *after* the report has already been written. Persist stderr
    # for diagnosis but only treat the run as failed if the JSON is also
    # missing.
    if proc.returncode != 0:
        (output_dir / f"lighthouse-{preset}.stderr.log").write_text(proc.stderr)
    if not out_json.exists():
        print(f"[lighthouse:{preset}] failed (rc={proc.returncode}); stderr saved")
        return None
    try:
        data = json.loads(out_json.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[lighthouse:{preset}] could not parse output: {e}")
        return None
    cats = data.get("categories", {})
    audits = data.get("audits", {})
    failed = [
        {"id": k, "title": v.get("title"), "score": v.get("score"), "displayValue": v.get("displayValue")}
        for k, v in audits.items()
        if v.get("score") is not None and v["score"] < 0.9
    ]
    return {
        "scores": {k: v.get("score") for k, v in cats.items()},
        "metrics": {
            k: audits.get(k, {}).get("numericValue")
            for k in ("first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index", "interactive")
        },
        "failed_audits": failed,
    }


def write_summary(output_dir: Path, bundles: list[CaptureBundle], lighthouses: dict[str, dict | None]) -> Path:
    lines: list[str] = []
    lines.append(f"# Ink Bloop PWA Audit — {datetime.now(timezone.utc).isoformat()}")
    lines.append("")
    lines.append(f"Output dir: `{output_dir.relative_to(REPO_ROOT)}`")
    lines.append("")

    for b in bundles:
        lines.append(f"## {b.label}")
        lines.append("")
        wall_ms = (b.load_event_at - b.navigation_started_at) * 1000 if b.load_event_at else None
        lines.append(f"- Wall-clock load event: **{wall_ms:.0f} ms**" if wall_ms else "- Wall-clock load event: (no event)")
        if b.largest_contentful_paint_ms:
            lines.append(f"- Largest Contentful Paint: **{b.largest_contentful_paint_ms:.0f} ms**")
        for p in b.paint_timings:
            lines.append(f"- {p['name']}: **{p['startTime']:.0f} ms**")
        sw = b.sw_state or {}
        lines.append(f"- SW state: `{sw.get('active_state')}` scope=`{sw.get('scope')}` navPreload=`{sw.get('navigation_preload')}`")
        caches = (sw.get("caches") or {}) if isinstance(sw, dict) else {}
        for cname, urls in caches.items():
            lines.append(f"  - cache `{cname}`: {len(urls)} entries")
        lines.append(f"- modulepreload links: {b.modulepreloads}")
        # Critical regression check
        bad = [m for m in b.modulepreloads if re.search(r"framer-motion|supabase", m or "")]
        if bad:
            lines.append(f"  - **REGRESSION**: heavy chunks back on cold preload list: {bad}")
        # Icons
        for ic in b.icons_check:
            ds = ic.get("declared_sizes")
            aw = ic.get("actual_width")
            ah = ic.get("actual_height")
            note = ""
            if ds and "x" in ds:
                w_decl, h_decl = ds.split("x")
                if str(aw) != w_decl or str(ah) != h_decl:
                    note = f"  ⚠️ declared {ds} actual {aw}x{ah}"
            lines.append(f"- icon `{ic['src']}` declared {ds} actual {aw}x{ah} — {fmt_kb(ic.get('byte_size'))}{note}")
        # Top errors
        errs = [c for c in b.console if c.get("type") in ("error", "warning")][:10]
        if errs:
            lines.append(f"- Top console errors/warnings ({len(errs)}):")
            for e in errs:
                loc = e.get("location") or {}
                where = f" ({loc.get('url','')}:{loc.get('lineNumber','?')})" if loc.get("url") else ""
                lines.append(f"  - `{e['type']}` {e['text']}{where}")
        if b.page_errors:
            lines.append(f"- Page errors ({len(b.page_errors)}):")
            for pe in b.page_errors[:5]:
                lines.append(f"  - {pe}")
        # Failed requests
        failed = [r for r in b.requests if r.failure]
        if failed:
            lines.append(f"- Failed requests ({len(failed)}):")
            for r in failed[:10]:
                lines.append(f"  - `{r.status or '-'}` {r.url} ({r.failure})")
        # Top requests by size
        sized = sorted([r for r in b.requests if r.response_size], key=lambda r: -(r.response_size or 0))[:8]
        if sized:
            lines.append("- Largest responses:")
            for r in sized:
                via_sw = " [SW]" if r.from_service_worker else ""
                lines.append(f"  - {fmt_kb(r.response_size)} {r.url}{via_sw}")
        lines.append("")

    for preset, lh in lighthouses.items():
        lines.append(f"## Lighthouse — {preset}")
        if not lh:
            lines.append("- (failed to run; see lighthouse-*.stderr.log)")
            continue
        for k, v in (lh.get("scores") or {}).items():
            lines.append(f"- {k}: **{(v or 0) * 100:.0f}** / 100")
        lines.append("- Metrics:")
        for k, v in (lh.get("metrics") or {}).items():
            lines.append(f"  - {k}: {v:.0f} ms" if v else f"  - {k}: -")
        failed = lh.get("failed_audits") or []
        if failed:
            lines.append(f"- Failed audits ({len(failed)} below 0.9):")
            for fa in failed[:15]:
                disp = f" — {fa['displayValue']}" if fa.get("displayValue") else ""
                lines.append(f"  - `{fa['id']}` {fa['title']}{disp}")
        lines.append("")

    summary_path = output_dir / "summary.md"
    summary_path.write_text("\n".join(lines), encoding="utf-8")
    return summary_path


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--skip-lighthouse", action="store_true", help="Skip the Lighthouse runs (faster)")
    parser.add_argument("--mobile-only", action="store_true", help="Only the mobile pass")
    parser.add_argument("--desktop-only", action="store_true", help="Only the desktop pass")
    args = parser.parse_args()

    token = read_env("VERCEL_BYPASS_TOKEN") or os.environ.get("VERCEL_BYPASS_TOKEN")
    if not token:
        print(
            "ERROR: VERCEL_BYPASS_TOKEN is missing.\n"
            "Generate one at: https://vercel.com/<team>/<project>/settings/deployment-protection\n"
            "Then add to .env.local:  VERCEL_BYPASS_TOKEN=<value>\n"
            "Docs: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation",
            file=sys.stderr,
        )
        return 2

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = OUTPUT_ROOT / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"[audit] output -> {output_dir.relative_to(REPO_ROOT)}")

    bundles: list[CaptureBundle] = []
    async with async_playwright() as pw:
        if not args.mobile_only:
            cold = await cold_load(pw, url=args.url, token=token, output_dir=output_dir, label="cold-desktop", mobile=False, offline_after_load=True)
            bundles.append(cold)
        if not args.desktop_only:
            mobile = await cold_load(pw, url=args.url, token=token, output_dir=output_dir, label="cold-mobile", mobile=True, offline_after_load=False)
            bundles.append(mobile)

    for b in bundles:
        (output_dir / f"{b.label}.json").write_text(
            json.dumps(serialize_bundle(b), indent=2, default=str),
            encoding="utf-8",
        )

    lighthouses: dict[str, dict | None] = {}
    if not args.skip_lighthouse:
        if not args.mobile_only:
            lighthouses["desktop"] = run_lighthouse(args.url, token, output_dir, "desktop")
        if not args.desktop_only:
            lighthouses["mobile"] = run_lighthouse(args.url, token, output_dir, "mobile")

    summary = write_summary(output_dir, bundles, lighthouses)
    print(f"[audit] summary -> {summary.relative_to(REPO_ROOT)}")
    print(summary.read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    # Windows consoles default to cp1252 which can't print non-ASCII
    # characters in our summary. Force UTF-8 so the script doesn't crash
    # on emoji or arrows in console output.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(asyncio.run(main()))
