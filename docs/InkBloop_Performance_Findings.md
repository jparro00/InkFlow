# Ink Bloop — Performance Findings

Code review of `C:\Users\jparr\Documents\claude\InkFlow` against [PWA_Performance_Review_Guide.md](PWA_Performance_Review_Guide.md). Symptom under investigation: **cold starts up to 10 seconds**.

Findings are ordered by **estimated impact on cold start**, biggest wins first. Each item lists the file/line, the problem, and the fix.

---

## Cold start anatomy (current state)

Walking the boot path with measured byte sizes from `dist/`:

```
1. HTML  (3.4 KB) ──────────────► already streaming
2. Inline boot splash renders (good — ~instant)
3. Browser fetches:
   ├─ favicon  /inkbloop_logo.png ────────── 216 KB  ⚠️ 531×531 PNG used as favicon
   ├─ apple-touch-icon.png ─────────────── 216 KB  ⚠️ same image
   ├─ apple-touch-icon-180x180.png ────── 216 KB  ⚠️ same image (NOT 180×180!)
   ├─ manifest.json ──────────────────────── 0.5 KB
   └─ CSS /assets/index.css ─────────────── 56.8 KB (preload + onload swap, good)
4. modulepreload (high priority, parallel):
   ├─ index.js (entry) ──────────────────── 6 KB
   ├─ rolldown-runtime ──────────────────── 0.8 KB
   ├─ react-vendor ─────────────────────── 181.8 KB
   ├─ react-router ─────────────────────── 41.1 KB
   ├─ supabase ─────────────────────────── 186.4 KB  ⚠️ on the boot critical path
   ├─ supabase-Bro12EPS.js ────────────── 0.4 KB
   └─ framer-motion ────────────────────── 139.5 KB  ⚠️ shouldn't be on boot path
5. Fonts (4 woff2 files, parallel) ────── ~67 KB total
6. JS executes → AuthProvider runs → supabase.auth.getSession() (network round-trip)
7. While loading=true, BootSplash held visible
8. ProtectedRoute resolves → DataLoader (lazy) loads
9. AppShell (lazy) loads ─────────────── 129.1 KB
   └─ pulls in entire agent system (5 agents) statically
10. Calendar route (lazy) loads ────────── 24.9 KB
11. DataLoader fires 5 parallel store fetches → Supabase round-trips
12. First useful paint
```

**Total bytes on the cold critical path before useful render:** ~1.05 MB uncompressed of JS/CSS + ~650 KB of redundant PNG icons + ~67 KB fonts ≈ **~1.7 MB**. Brotli would cut JS/CSS to ~300 KB compressed; PNGs and fonts already compress poorly. Plus a Supabase auth round-trip and 5 store-fetch round-trips before render.

On a slow connection that's exactly the 10-second range you're seeing.

---

## P0 — Highest impact (fix first)

### 1. Three identical 216 KB PNGs are downloaded for icons

**Files:** [public/inkbloop_logo.png](../InkFlow/public/inkbloop_logo.png), [public/apple-touch-icon.png](../InkFlow/public/apple-touch-icon.png), [public/apple-touch-icon-180x180.png](../InkFlow/public/apple-touch-icon-180x180.png), [index.html:5-7](../InkFlow/index.html), [public/manifest.json:11-22](../InkFlow/public/manifest.json), [src/components/layout/AppHeader.tsx:12](../InkFlow/src/components/layout/AppHeader.tsx)

**Problem:**
- All three PNGs are byte-identical 216,694-byte 531×531 images.
- The "180x180" file is also 531×531 — misnamed.
- `<link rel="icon" type="image/png" href="/inkbloop_logo.png">` triggers a 216 KB favicon fetch on every cold visit.
- `apple-touch-icon` (216 KB) is also fetched aggressively by iOS on first install.
- The manifest references both as PWA icons (216 KB × 2).
- AppHeader displays `inkbloop_logo.png` at 28×28 (`w-7 h-7`) — uses 216 KB to show 28 px.

**Impact:** ~650 KB of redundant binary on cold start. Favicon is fetched with high priority and competes with critical resources. On a 3 Mbps mobile link, this alone costs ~2 seconds.

**Fix:**
1. Replace the favicon link with the existing `favicon.svg` (9 KB):
   ```html
   <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
   ```
2. Generate a **real 180×180 apple-touch-icon** (target ~10–20 KB PNG or use `pngquant`/`oxipng`). Delete `apple-touch-icon.png` (the 531×531 one) and keep only the correctly-sized one.
3. Generate proper PWA icons (192×192 and 512×512, separately optimized — each ~15 KB).
4. In [AppHeader.tsx:12](../InkFlow/src/components/layout/AppHeader.tsx), replace the `<img src="/inkbloop_logo.png">` with the inline SVG already used in the boot splash, or with the `favicon.svg`.

**Estimated cold-start improvement:** 1–2 s on mobile.

---

### 2. Supabase SDK (186 KB) blocks the entire boot critical path

**Files:** [src/contexts/AuthContext.tsx:4,26](../InkFlow/src/contexts/AuthContext.tsx), [src/lib/supabase.ts](../InkFlow/src/lib/supabase.ts), [src/App.tsx:111](../InkFlow/src/App.tsx)

**Problem:**
- `AuthProvider` is a static import in `App.tsx`, which statically imports `supabase` from `lib/supabase.ts`, which calls `createClient` at module load.
- The supabase chunk is **186 KB uncompressed**, modulepreloaded on every cold start.
- `loading=true` is held until `supabase.auth.getSession()` resolves — this is **network-blocking** even when there's a cached session in localStorage (`inkbloop-auth`).
- `ProtectedRoute` shows `BootSplash` during this whole time.

**Impact:** Adds 186 KB parse + a network round-trip to *every* cold start, even for repeat users with valid sessions. This is the biggest single contributor to the 10-second symptom on flaky networks.

**Fix (two stages):**

**Stage A — quick (saves the round-trip):** Read the persisted session synchronously from localStorage to render the app optimistically; let the SDK validate in the background:

```typescript
function readPersistedSession() {
  try {
    const raw = localStorage.getItem('inkbloop-auth');
    return raw ? JSON.parse(raw)?.currentSession ?? null : null;
  } catch { return null; }
}
// Use this for initial state. loading starts as false if a session was found.
```
Show real UI immediately; if `getSession()` later returns null/expired, redirect to login.

**Stage B — bigger (saves the 186 KB parse):** Defer the Supabase import to *after* first paint:
- Replace the static `import { supabase } from '../lib/supabase'` in AuthContext with a dynamic import.
- Login is the only critical path that genuinely needs Supabase early. Most users hit the calendar route and never touch the auth API directly.

**Estimated cold-start improvement:** 1–3 s, especially on repeat-user warm cache + slow Supabase auth roundtrip.

---

### 3. framer-motion (139 KB) is on the boot critical path via modulepreload

**File:** [dist/index.html:49](../InkFlow/dist/index.html), [src/components/common/Modal.tsx:2](../InkFlow/src/components/common/Modal.tsx), [src/pages/Login.tsx:3](../InkFlow/src/pages/Login.tsx), many others

**Problem:**
- `dist/index.html` emits `<link rel="modulepreload" href=".../framer-motion-...js">` on every cold load.
- Vite's `manualChunks` splits framer-motion into its own chunk; because so many lazy chunks reference it, Vite's preload graph promotes it to a top-level preload.
- Result: 139 KB downloaded with high priority *before login can even render*, even though only the AppShell + modals use it.

**Impact:** ~140 KB on every cold start, competing with the LCP path.

**Fix options (pick one):**

**A.** Delete the `framer-motion` rule from `manualChunks` in [vite.config.ts:23](../InkFlow/vite.config.ts) so it gets co-located into whichever chunk uses it (typically AppShell). The chunk gets bigger but moves off the cold path.

**B.** Add Vite's `build.modulePreload.resolveDependencies` option to filter framer-motion (and supabase) out of the cold preload list:
```ts
build: {
  modulePreload: {
    resolveDependencies: (filename, deps) =>
      deps.filter(d => !/framer-motion|supabase-/.test(d)),
  },
}
```

**C.** Replace framer-motion entirely with CSS transitions for the simple cases (modals slide up/down, accordions). Most usage in this app is simple slide/fade — `transform`/`opacity` transitions are free, native, and 0 KB. Reserve framer-motion for the gesture-driven Modal drag.

**Estimated cold-start improvement:** 0.5–1 s.

---

### 4. Service worker has no Navigation Preload

**File:** [public/sw.js:46-63](../InkFlow/public/sw.js)

**Problem:**
- The SW handles `request.mode === 'navigate'` by checking the cache, falling back to network.
- On a cold revisit (SW idle), the browser must boot the SW *before* the navigation fetch starts — typically **250 ms+ on mobile**, up to 500 ms+ on slow CPUs.
- Navigation preload would parallelize the network request with SW boot.

**Fix:** Enable in the activate handler and consume in the navigate branch:

```javascript
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(/* existing cleanup */),
      self.registration.navigationPreload?.enable(),  // new
    ]).then(() => self.clients.claim())
  );
});

// In the navigate branch, prefer the preloaded response:
if (request.mode === 'navigate') {
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('/index.html');
    if (cached) {
      // Background revalidate as today
      event.waitUntil((async () => {
        try {
          const fresh = (await event.preloadResponse) || await fetch(request);
          if (fresh?.ok) cache.put('/index.html', fresh.clone());
        } catch {}
      })());
      return cached;
    }
    const preloaded = await event.preloadResponse;
    return preloaded || fetch(request);
  })());
  return;
}
```

**Estimated cold-revisit improvement:** 250–500 ms.

---

### 5. AppShell statically imports every modal/drawer + the entire agent system

**File:** [src/components/layout/AppShell.tsx:1-20](../InkFlow/src/components/layout/AppShell.tsx)

**Problem:**
The AppShell chunk is **129 KB** because it eagerly imports:
- `BookingDrawer`, `BookingForm`, `CreateClientForm`, `ClientForm`, `AgentPanel`, `AgentFeedbackPrompt`, `SearchOverlay`, `ConversationDrawer`, `ToastContainer`
- `agents/orchestrator` → which imports all 5 agent modules (`bookingAgent`, `clientAgent`, `scheduleAgent`, `messagingAgent`, `feedbackAgent`)

These all parse on first AppShell render, even though almost none are visible until the user opens something.

**Fix:**
1. Lazy-load every component behind `<AnimatePresence>{cond && <Comp/>}</AnimatePresence>`:
   ```tsx
   const BookingDrawer = lazy(() => import('../booking/BookingDrawer'));
   // etc.
   ```
   Wrap each in its own `<Suspense fallback={null}>` (no fallback needed — they're modals).
2. Lazy-load the orchestrator on first agent interaction:
   ```tsx
   const onAgentSelection = async (kind, id) => {
     const { handleSelection } = await import('../../agents/orchestrator');
     return handleSelection(kind, id);
   };
   ```
3. The agent panel itself can lazy-load its agents — there's no need for the orchestrator to statically import all 5; it can dynamic-import the right one based on `intent.agent`.

**Estimated cold-start improvement (after login):** 50–80 KB off the AppShell chunk. Calendar route would render before agent code is even fetched.

---

### 6. ~80 KB of WOFF (legacy) font files shipped alongside WOFF2

**Files:** `dist/assets/*.woff` (8 files totaling ~155 KB), [src/main.tsx:5-8](../InkFlow/src/main.tsx)

**Problem:**
- `@fontsource/dm-sans` and `@fontsource/dm-serif-display` ship both `.woff` and `.woff2` files. The CSS `src:` lists both formats:
  ```css
  src: url(./files/dm-sans-latin-500-normal.woff2) format('woff2'),
       url(./files/dm-sans-latin-500-normal.woff) format('woff');
  ```
- All modern browsers (98%+ globally in 2026) support woff2. The browser only fetches woff2.
- But the **woff files are still in the `dist/` folder and hosted**, taking deploy-bandwidth and clouding HTTP cache. More importantly, they're a sign no one stripped the legacy entries from the CSS — which means a cache miss on any client legitimately picking woff (rare, old Safari) is a wasted slow download.

**Fix:**
- Switch to `@fontsource-utils` "no-fallback" entries, OR write a tiny build step that strips `, url(...).woff format('woff')` from the imported CSS. Even simpler: use `unpic-vite-fonts`-style bundling, or write the four `@font-face` blocks manually pointing only to the woff2 files you actually want.
- Subset further: this app appears English-only, but `@fontsource` ships the full Latin range. The Latin **subset** trims to ~12 KB per weight; you could go further with a custom subset to the actual glyph set used.

**Estimated cold-start improvement:** Modest — fonts are already non-render-blocking due to `font-display: swap`. But if you preload one weight (the body weight, 500), you'd cut visible FOUT. Bigger win: drop WOFF, save ~80 KB of deploy bytes.

---

## P1 — High impact

### 7. Service worker uses `skipWaiting()` unconditionally

**File:** [public/sw.js:9](../InkFlow/public/sw.js)

**Problem:** Every new SW immediately replaces the active one mid-session. Open tabs can end up with old HTML/JS calling new APIs, causing flaky errors and forced reloads.

**Fix:** Either prompt the user before swapping, or accept the risk explicitly. For an app this size, a simple "New version available — reload?" toast is enough. Defer `skipWaiting()` until the user accepts.

**Impact on cold start:** None directly, but reduces the number of "broken on first load after deploy" pages that *appear* slow because they're forced to reload.

---

### 8. Service worker hardcoded skip of Supabase requests means no offline tolerance for auth

**File:** [public/sw.js:43](../InkFlow/public/sw.js)

**Problem:** `if (url.hostname.includes('supabase')) return;` — every `getSession()` and store-fetch goes straight to network. On a slow connection or partial offline, the boot path stalls waiting for Supabase.

**Fix:** Add a short-TTL `Network First` (timeout ~3 s, fall back to cache) for Supabase **GET** requests. Keep auth and POST/PATCH on network-only. This means a flaky network gives you instant stale data instead of a 30-second timeout.

```javascript
if (url.hostname.includes('supabase') && request.method === 'GET') {
  event.respondWith(networkFirstWithTimeout(request, 3000));
  return;
}
```

**Estimated worst-case improvement:** Up to multiple seconds when Supabase is slow.

---

### 9. DataLoader blocks the calendar render on 5 parallel store fetches

**File:** [src/contexts/DataLoader.tsx:21-32](../InkFlow/src/contexts/DataLoader.tsx)

**Problem:** Calendar (the default route) only needs `bookings` + `clients`. But DataLoader also fires `fetchImages`, `fetchDocuments`, `fetchConversations`, plus `startRealtime` (which itself calls `supabase.auth.getSession()`). Calendar rendering waits on whichever Supabase request returns slowest — even for data Calendar doesn't display.

**Fix:**
- Render Calendar against whatever's already in the persisted Zustand store (they all use `persist`), and let the fresh fetches update it on arrival.
- Move non-critical fetches (images, documents, conversations, realtime) into the existing `idle()` block. These already run in idle for prefetching routes; the same belongs there for non-critical data.

```tsx
useEffect(() => {
  if (!session) return;
  fetchClients();
  fetchBookings();   // critical for Calendar (default)
  idle(() => {
    fetchImages();
    fetchDocuments();
    fetchConversations();
    startRealtime();
  });
  // ...
}, [session, ...]);
```

**Estimated improvement:** 200–800 ms off first useful paint (depends on which store-fetch is slowest).

---

### 10. AuthContext shows BootSplash with no optimistic render

**File:** [src/App.tsx:44-54](../InkFlow/src/App.tsx)

**Problem:** `ProtectedRoute` returns `<BootSplash />` while `loading=true`. With Stage A of finding #2, there's no need — if a session is in localStorage, render the app and validate in the background. If `getSession()` later says no session, redirect.

**Fix:** Couple this with finding #2 Stage A.

---

### 11. Service worker pre-cache list excludes vendor chunks

**File:** [scripts/write-sw.ts:26-38](../InkFlow/scripts/write-sw.ts)

**Problem:** Only `index-*.js` and `index-*.css` are pre-cached. The 600 KB+ of vendor chunks (react-vendor, react-router, supabase, framer-motion) are *not* — every cold load on a freshly-installed SW must fetch them all. The comment explains this is to avoid a 20–30s install delay, which is a legitimate concern, but the trade-off is paid by the user on every cold load.

**Fix:** Pre-cache the vendor chunks **lazily** — register them with the SW after the first successful load (e.g. send a `MessageChannel` `cacheVendors` message from the page, SW does `cache.addAll(vendorUrls)` without blocking install). This way:
- First-ever install: fast, only shell precached.
- Second-and-later cold loads: vendor chunks served from SW cache instantly, no network at all.

This is the single biggest win for repeat-cold-load (closed tab, opened next morning).

**Estimated improvement (repeat cold load):** 0.5–2 s.

---

### 12. Manifest is missing a 192×192 icon and a maskable variant

**File:** [public/manifest.json](../InkFlow/public/manifest.json)

**Problem:**
- Only 531×531 and a (mis-sized) 180×180 icon. PWA install criteria expects 192×192 *and* 512×512. Lighthouse will flag this.
- No `purpose: "maskable"` icon → Android adaptive icons crop the existing icon awkwardly.
- No iOS `apple-touch-startup-image` link tags → iOS PWA install shows a white splash on launch.

**Fix:** Generate a clean icon set (one source SVG → 192×192 PNG, 512×512 PNG, 512×512 maskable PNG with built-in safe area) using e.g. [pwa-asset-generator](https://github.com/onderceylan/pwa-asset-generator). Add the apple-touch-startup-image links — generator can produce all 13 device sizes.

**Estimated cold-start improvement:** Modest for the install experience; bigger for iOS launch (no white splash).

---

## P2 — Medium impact

### 13. Heavy imports inside Login.tsx pull in framer-motion

**File:** [src/pages/Login.tsx:3](../InkFlow/src/pages/Login.tsx)

**Problem:** Login uses `motion` from framer-motion. Login is on the cold-start path for unauthenticated users. This is one of the static-import paths that's puffing the framer-motion preload (finding #3).

**Fix:** Replace the one or two motion components with CSS transitions. Login should be the leanest page in the app.

---

### 14. Cloudflare beacon script always evaluated even when token is missing

**File:** [index.html:36-46](../InkFlow/index.html)

**Problem:** The IIFE runs on every page load, even when `VITE_CF_ANALYTICS_TOKEN` isn't set (it correctly bails out, but still runs the script).

**Fix:** Move the conditional to build time — only emit the script tag when the env var is set. Use a Vite plugin or a simple HTML transform. Saves a few milliseconds and a few bytes.

---

### 15. `<meta name="viewport">` disables user zoom

**File:** [index.html:9](../InkFlow/index.html)

**Problem:** `maximum-scale=1.0, user-scalable=no` is an accessibility issue (WCAG SC 1.4.4). Not a perf issue per se but a regression risk during a perf review. The pinch-to-zoom is also blocked at the JS level in `main.tsx:13`.

**Fix:** Either remove the user-scalable restriction or accept it as a deliberate native-app-feel choice. Document it.

---

### 16. Tailwind v4 generates a 57 KB CSS file

**File:** `dist/assets/index-*.css`

**Problem:** 57 KB of CSS is reasonable but on the large side. A lot of utility classes ship that aren't used.

**Fix:** Verify Tailwind v4's content scanning is finding the right files (it should be, with the `@tailwindcss/vite` plugin). Consider extracting critical CSS for the boot path (the boot splash is already inlined, but the login form has none). Less of a win than other items here.

---

### 17. Lots of `<img src>` with no `width`/`height`

**Files:** [src/components/layout/AppHeader.tsx:12](../InkFlow/src/components/layout/AppHeader.tsx) (has w-7 h-7 class but not the HTML attrs), search the rest

**Problem:** Tailwind classes set the rendered size but the browser still doesn't know the intrinsic aspect ratio until the image header loads. Any image without width/height attributes (or `aspect-ratio` CSS) can cause CLS.

**Fix:** Add `width` and `height` HTML attributes to every `<img>`. Trivial, prevents layout shift.

---

### 18. `Bot` Lucide icon imported in AppShell

**File:** [src/components/layout/AppShell.tsx:2](../InkFlow/src/components/layout/AppShell.tsx)

**Problem:** Lucide-react tree-shakes well, but every icon you import lands in the eager chunk. AppShell imports just `Bot` here, but other components elsewhere are likely importing many at the top level. Worth a sweep.

**Fix:** Verify with a bundle analyzer that only used icons end up in the icons chunk. Currently it's only 7.8 KB so probably fine.

---

### 19. Two scripts in `<head>` (theme + Cloudflare) before the module

**File:** [index.html:27-46](../InkFlow/index.html)

**Problem:** Both run synchronously before the module script (which is auto-deferred). They're cheap (each does a try/catch around localStorage read or env-var check) but they do block parsing of the rest of `<head>`.

**Fix:** The theme script is necessary (must run before paint). The Cloudflare check is not — move it after the module preload links so it doesn't block.

---

### 20. No HTTP cache headers visible for static assets (review needed)

**File:** Hosting config (Vercel — see `package.json:13`)

**Problem:** Vercel's defaults are fine but worth verifying:
- Hashed assets (`/assets/*.js`, `*.css`) → `Cache-Control: public, max-age=31536000, immutable`
- HTML → `Cache-Control: no-cache`
- Brotli enabled

If `vercel.json` doesn't exist or doesn't override these, Vercel does the right thing automatically. Confirm by checking response headers on a deployed asset.

---

## P3 — Low impact / cleanup

### 21. `BootSplash` React component duplicates the inline HTML splash

**Files:** [index.html:50-54](../InkFlow/index.html), [src/App.tsx:21-42](../InkFlow/src/App.tsx)

**Problem:** Same SVG, same animation, defined in both places. Drift risk.

**Fix:** Extract to one source (e.g. an SVG file with `?raw` import) and reuse. Pure cleanup, no perf change.

---

### 22. `idle()` polyfill in DataLoader

**File:** [src/contexts/DataLoader.tsx:35-42](../InkFlow/src/contexts/DataLoader.tsx)

**Problem:** Custom `requestIdleCallback` polyfill works but Safari support is now native (since 16.4). Type-cast workaround is verbose.

**Fix:** TypeScript 5.4+ has the type built-in. Drop the cast.

---

### 23. Pinch-to-zoom listeners installed at module load

**File:** [src/main.tsx:13-21](../InkFlow/src/main.tsx)

**Problem:** Two `document.addEventListener` calls at module top level. Minor but unnecessary on the boot critical path.

**Fix:** Move into a `useEffect` in App, or behind `window.addEventListener('load', ...)`.

---

## Summary — Estimated cumulative improvement

| Tier | Items | Best-case savings on cold start |
|---|---|---|
| **P0** (1–6) | Icons, supabase off boot path, framer-motion off preload, navigation preload, AppShell lazy, fonts | **~3–6 s** |
| **P1** (7–12) | SW updates, supabase SW caching, DataLoader pruning, vendor precaching, manifest | **~1–3 s** |
| **P2** (13–20) | Login simplification, viewport, CSS, etc. | **~0.3–0.7 s** |

A reasonable goal after P0+P1: **cold start under 3 seconds on slow 4G**, sub-second on warm cache.

---

## Recommended order of implementation

The order minimizes risk and gets quick wins early:

1. **Fix the icon files** (#1). Trivial, no code changes — just replace files and update the favicon link. **~2 s win** alone.
2. **Add Navigation Preload** (#4). 5 lines in `sw.js`. No risk.
3. **Lazy-load AppShell modals + agent orchestrator** (#5). Mechanical refactor, bundle analyzer confirms.
4. **Defer non-critical DataLoader fetches** (#9). 5-line change, persisted store covers the gap.
5. **Strip framer-motion from modulepreload** (#3). One Vite config option.
6. **Optimistic auth from localStorage** (#2 Stage A). ~30 lines.
7. **Generate proper PWA icons + manifest** (#12). Run a generator, paste the output.
8. **Lazy-precache vendor chunks** (#11). Largest behavioral change, save for last.
9. Cleanups (P2/P3) opportunistically.

Validate each step by running Lighthouse mobile against the deployed build before moving on. Median of 3 runs.
