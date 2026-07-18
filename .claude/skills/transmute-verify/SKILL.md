---
name: transmute-verify
description: >-
  Verify that a code change to the Transmute app (index.html) actually works by
  running it and observing real behaviour. Use this skill WHENEVER the user asks
  to verify, confirm, test, check, or "make sure" a change works in this app —
  including after editing index.html, fixing a bug, or before committing/opening
  a PR. Do NOT reach for screenshots first: this app runs infinite CSS animations
  (flame pulse, aura glow, legendary badge) that make preview_screenshot hang.
  This skill captures the eval-based verification recipe that actually works here.
---

# Verifying Transmute changes

Transmute is a single-file PWA (`index.html`, ~4k lines, vanilla JS). The state
lives in `localStorage` under `sr_v3`. Verification here is **behavioural and
text-based**, driven through the preview tools — not visual.

## Why not screenshots

`preview_screenshot` reliably **times out** on this app because several elements
animate forever (`flamePulse`, `auraPulse`, the `lgnd` legendary-badge glow, the
Urge Wave canvas `requestAnimationFrame` loop). The capture waits for the page to
go idle and it never does. So default to `preview_eval` + `preview_console_logs`,
and only screenshot as a last resort after pausing animations (see below).

**In practice, treat `preview_screenshot` as unavailable** — it has hung even on
a static, animation-free test page in this environment. Don't burn calls retrying
it. To check geometry/layout, read it from the DOM via eval (`getBoundingClientRect`,
SVG `getBBox`, `getComputedStyle`). To *show the user* visual output (e.g. new
icon/flame art), build it with the `visualize`/`show_widget` tool instead of
screenshotting the app.

## Server & ports — don't thrash

- **Reuse the existing `transmute-app` config (port 3000).** Just `preview_start`
  it. If a later call says "Server not found", the server died — `preview_start`
  `transmute-app` again and carry on; do NOT invent a new port.
- There's a **5-server-per-worktree limit.** Adding a fresh `transmute-app-N` port
  config for each verification hits the cap and leaves orphaned servers. If you
  truly need a clean one, `preview_list` then `preview_stop` an old server rather
  than adding configs. **Any temp config you add must be reverted before shipping.**
- A cache-busting reload (`location.href = location.origin + '/?fresh=' + Date.now()`)
  is enough to pick up an `index.html` edit — no need to restart the server.

## The recipe

1. **Start/confirm the server.** `preview_start` with name `transmute-app` (the
   config in `.claude/launch.json` — a static `python -m http.server 3000`).
   Reuse if already running.

2. **Reload fresh.** Changes to `index.html` need a reload. Use a cache-busting
   param so you get the new code:
   ```js
   location.href = location.origin + '/?fresh=' + Date.now()
   ```
   A navigation kills the current `preview_eval` context — that's expected. Just
   issue the next `preview_eval` in a fresh call; it runs against the new page.

3. **Drive the app through its own functions and assert on state.** The app
   exposes its functions globally (`goTab`, `uStart`, `uBeginSurf`, `uWin`,
   `updateHome`, `renderHistory`, `applyLang`, etc.) and its state as `S`. Prefer
   calling these and reading the resulting DOM/`S`/`localStorage` over poking the
   UI pixel by pixel. Return a small JSON object of the things you want to check.
   Example shape:
   ```js
   (()=>{
     goTab('urge'); uStart(); uBeginSurf(0.80);
     return {
       orb: document.getElementById('urf-orb-num').textContent,
       surfShown: getComputedStyle(document.getElementById('urge-surf')).display,
       lastEntry: S.entries[S.entries.length-1]
     };
   })()
   ```

4. **Force the state you need to test.** It's fine to set up preconditions via
   eval: `localStorage.setItem('uw_unlocked','1')` to skip the paywall,
   `S.startDate='2026-06-10'; S.entries=[]; save()` to seed data, or set
   `localStorage.removeItem('sr_v3')` + reload for a true first-run/day-0 state.
   For paid Urge Wave flows, set `uw_unlocked`; for an expired trial, set
   `first_open` to `Date.now()-30*86400000`.

5. **Check for errors.** `preview_console_logs` with `level: 'error'`. "No console
   logs" is the pass signal. Always do this — it's the cheapest real check.

6. **Screenshot only if a visual truly matters**, and only after pausing motion,
   or the capture will hang:
   ```js
   (()=>{let s=document.getElementById('_capfix');if(!s){s=document.createElement('style');
     s.id='_capfix';s.textContent='*{animation:none!important;transition:none!important;}';
     document.head.appendChild(s);}return 'paused';})()
   ```
   Then `preview_screenshot`. (It can still occasionally hang; don't block the
   verdict on it — the eval/console checks are the real evidence.)

## What "verified" means

Report the concrete observations: the function ran, the DOM/state changed as
expected, and `console_logs` showed no errors. Quote the values you checked.
Never claim a change works from reading the diff alone — exercise it.

## Stub recipes for notification / push / wipe testing (proven July 2026)

- **Notification permission**: `Object.defineProperty(Notification, 'permission', {get: () => 'granted', configurable: true})` — works in Chrome; wrap in try. The preview
  browser's real permission is usually 'denied' or 'default', never 'granted'.
- **Capture notifications**: stub the SW route, not the constructor —
  `navigator.serviceWorker.getRegistration = () => Promise.resolve({showNotification: (t,o) => {calls.push({t,o}); return Promise.resolve();}})`.
  For `_pushSync`, stub the `ready` getter on the instance:
  `Object.defineProperty(navigator.serviceWorker, 'ready', {get: () => Promise.resolve({pushManager: {subscribe: () => Promise.resolve({toJSON: () => ({endpoint:'https://x', keys:{p256dh:'p',auth:'a'}})})}}), configurable: true})`.
- **Capture /api/subscribe POSTs**: wrap `window.fetch`, intercept by URL,
  return `Promise.resolve({ok:true,status:200})`, restore after.
- **visibilityState is a TRAP**: the preview pane flips between genuinely
  'visible' and 'hidden' depending on focus, and `notify()` deliberately skips
  display while visible (#159). Stub it explicitly per direction:
  `Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true})`
  (and `delete document.visibilityState` to restore). A test that "fails" may
  just be the guard doing its job in the pane's real state.
- **Run SW logic in the page sandbox** (no real push needed):
  `src = await (await fetch('/sw.js?x='+Date.now())).text()`, then
  `new Function('self','caches','clients','fetch','indexedDB', src + '\n;return {handleEveningPush}')`
  called with a fake `self` (addEventListener no-op, registration stub) and the
  REAL indexedDB — seed via the page's `_idbSet`, assert on captured
  showNotification calls. Fire the actual push listener by capturing it from
  `addEventListener` and passing `{data:{json:()=>({...})}, waitUntil: p=>p}`.
- **Testing across location.reload()** (e.g. the wipe handler): state persists
  in the preview origin — click the real button in one eval, assert
  localStorage in the NEXT eval after the reload. Stale timers from earlier
  evals can fire after reload and pollute results — prefer a fresh cache-busted
  load before timing-sensitive assertions.
- **Time-of-day gates**: `Date.prototype.getHours = () => 19` (restore after).
  Never trust `TZ=Europe/London date` in Git Bash — off by one vs BST.

## Notes that save time

- `applyLang()` rewrites many labels via `ic.innerHTML`/`set(...)`; if you changed
  a translated string, switch `curLang` and call `applyLang()` to confirm it took.
- Mobile-ish viewport: `preview_resize` preset `mobile` (375×812). The app caps at
  `max-width:480px`.
- Tabs are 4: `home`, `urge` (SOS), `stories`, `transmute`. `phases`/`history` are
  reachable via `goTab(...)` even though they have no tab button.
- If the server reports "not found", just `preview_start` again — it's disposable.
