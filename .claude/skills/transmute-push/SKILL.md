---
name: transmute-push
description: Operate, test, troubleshoot and extend the Transmute web-push notification system (closed-app notifications). Use WHENEVER a task touches push or notifications — "send a test push", "why didn't the notification arrive", "check who's subscribed", adding a new notification type, changing notification copy, or ANY report that a notification did/didn't show, looked wrong, or arrived late. Also read this before touching sw.js, /api/subscribe, scripts/send-evening.js, the evening-push workflow, or notification permission UI. Captures the full architecture, the Upstash/dispatch test recipes, and the device-side troubleshooting ladder that took two days to derive.
---

# Transmute web push — operations manual

Self-hosted VAPID web push. No third-party push vendor. Everything below was
verified end-to-end on real devices (July 2026).

## Architecture (one breath)

Device subscribes via `_pushSync()` in index.html → POSTs subscription+timezone
to `/api/subscribe` (Vercel fn) → stored in Upstash Redis (`sub:<sha256(endpoint)>`).
Hourly GitHub Action `evening-push` runs `scripts/send-evening.js` → pushes
`{kind:'evening'}` to each device on the FIRST run after 18:00 local, once per
local day (`lastSent` on the record — GH cron is hours-late/skippy, exact-hour
matching silently drops evenings). Because GH cron proved capable of skipping an
entire evening (2026-07-18), `/api/cron-evening` (Vercel cron, 17:10 + 19:10 UTC
daily, Hobby-plan max) is the guaranteed backstop — same window+lastSent rules,
so the schedulers can't double-send. The SW `push` handler picks the message from
an IndexedDB mirror (`transmute-push` db) of app state — SWs can't read
localStorage — choosing: log-reminder / milestone / day-locked positive /
day-complete. Flags sync both ways so app and SW never double-notify.

**Tray invariant (#159)**: `notify()` in index.html skips display while the
page is visible — the tray belongs to the CLOSED app. Only the trial-renewal
disclosure passes `showWhenVisible=true`. Don't add on-open tray notifications.

## Credentials & locations

- Upstash REST: URL `https://legible-turtle-162450.upstash.io`, token in
  Vercel env (`KV_REST_API_TOKEN`, project transmute-app, team lewis18) and in
  GH Actions secrets (`UPSTASH_REDIS_REST_TOKEN`). Db `transmute-push-subs`, free tier.
- VAPID keypair: GH Actions secrets + backup `C:\Users\lewis\transmute-push-secrets.txt`;
  public key hardcoded in index.html (`PUSH_VAPID_PUBLIC`).
- Vercel env (project transmute-app) additionally needs `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` and `CRON_SECRET` for `/api/cron-evening` — Vercel sends
  `Authorization: Bearer <CRON_SECRET>` on cron invocations automatically; the
  endpoint fails closed without it. GH workflow sending is unchanged.

## Test recipes

**Send a test push now** (does NOT consume the device's daily evening slot):
```bash
HOUR=$(( (10#$(date -u +%H) + 1) % 24 ))   # London = UTC+1 in summer; do NOT trust `TZ=... date` in Git Bash — it's wrong
gh workflow run evening-push -f hour=$HOUR
# then: gh run list --workflow=evening-push --limit 1 → gh run view <id> --log | grep checked
```
Result line: `{"checked":N,"sent":n,"pruned":p,"failed":f,"mode":"test-hour-H"}`.
`sent:1` = the push service ACCEPTED it — not proof it displayed (see ladder).
`pruned` = 404/410 dead subscriptions deleted. Scheduled runs report `mode:"evening-window"`.

**Inspect the subscription store** (who's subscribed, which tz, last sent):
use Node fetch against Upstash REST (`["SCAN","0","MATCH","sub:*","COUNT","100"]`,
then MGET; each record = `{sub:{endpoint,keys},tz,ts,lastSent}`). Parse with
node, not sed — the values are escaped JSON. Endpoint host tells the browser
(fcm.googleapis.com = Chrome family). A device re-subscribing daily with fresh
endpoints = its permission is being cycled (see ladder, step 4).

**Exercise SW logic without a real push**: fetch `/sw.js`, evaluate via
`new Function('self','caches','clients','fetch','indexedDB', src + ';return {handleEveningPush}')`
with a stub `self.registration.showNotification` capturing calls, seed state
through the page's `_idbSet`, and call `handleEveningPush({})` per scenario.
(Full recipe in transmute-verify.)

## Troubleshooting ladder — "no notification arrived"

Walk DOWN; each layer was a real failure once. Check the cheap server truths first.

1. **Was a send even attempted?** `gh run list --workflow=evening-push` — GH
   cron drifts for hours; the evening-window logic tolerates that, but confirm a
   run happened after 18:00 local with `sent≥1` and the device's sub wasn't
   `lastSent`-gated by an earlier test... (test sends never set lastSent).
2. **Did the sub get pruned (410)?** Means the push service considers the
   registration dead — Chrome revoked it. Almost always permission trouble, not delivery.
3. **Permission stack (TWA devices — three layers, ALL must hold):**
   Android app notifications ON + Chrome's per-site permission Allow + the TWA
   delegation actually syncing them. Symptoms map: permission reads `default`
   forever = nothing ever asked (the app's prompt overlay does the asking since
   #154); `requestPermission` resolves granted but getter stays `default` = the
   TWA stale-cache quirk (that's why `_pushSync` attempts subscribe regardless —
   `pushManager.subscribe()` checks the REAL permission); subs created then
   410-dead within minutes = the durable site permission never persisted.
   **androidbrowserhelper 2.7.0-alpha02 had broken delegation** (grants never
   persisted) — fixed by shell v5+ with stable 2.6.2; never re-enable
   `alphaDependencies` (see transmute-android-release).
4. **Sub endpoint churns daily** = permission still being cycled on that device.
   Clean fix: clear the site's notification permission in Chrome, re-grant
   through the app's own popup (delegated dialog), on a v6+ shell.
5. **Accepted but never displayed, sub stays alive**: device-side delivery.
   Samsung "deep sleeping apps" putting **Chrome** to sleep kills delivery for a
   user who "doesn't use Chrome" — the TWA runs on Chrome regardless. Fix:
   Battery → remove Chrome from deep sleep / add to never-sleeping.
6. **Can't see the phone?** Re-add the debug beacon (below) rather than guessing.

## The debug-beacon technique (observability for unreachable devices)

When a device misbehaves and its console is unreachable, ship a TEMPORARY
beacon: page/SW `fetch('/api/subscribe', {debug: 'stage: detail | ua...'})` +
a branch in api/subscribe.js storing `debug:<ts>` keys (EX 86400) in Redis,
readable via REST. Report every STAGE (permission value, subscribe result,
sw push-received/push-shown) — the stage that never reports is the answer.
This found every root cause of the July saga. PRs #152/#156 (added) and #158
(removed) are the reference diffs. Always remove after diagnosis; purge
`debug:*` keys when done.

## Extending (new notification kinds)

- Server stays dumb: add a `kind` to the payload if scheduling differs; the SW
  decides content from mirrored state. New state the SW needs → add to
  `_pushMirror()` (page) and read via `idbGet` (sw.js) — never assume
  localStorage.
- Notification copy is hardcoded English by precedent (i18n parity rule
  deliberately not applied to notifications).
- `badge` must be the white-on-transparent silhouette (`/badge-96.png`) —
  Android flattens colour icons in the status bar to a blank square.
- Every push MUST show exactly one notification — silent pushes burn Chrome's
  background-message budget and eventually get the site throttled.
- Milestone titles are duplicated in sw.js (`MS_TITLES`) — keep in sync with
  `MILESTONES` in index.html when tiers change.
- sw.js changes: bump `CACHE` version; devices pick the new SW up on next app
  open (byte-diff + skipWaiting).

## Known limits / future

- Delivery time = first scheduler wake after 18:00 local. GH cron often lands
  18:07 local but can skip a whole evening; the Vercel crons guarantee UK
  delivery by ~19:10 BST / ~20:10 GMT worst case (Hobby crons run once daily,
  up to 59 min late). Non-European timezones still depend on GH cron alone.
- Notifications rendered by Chrome show the site URL — unavoidable web-side;
  the clean native look requires delegation display through the app (v6 shell +
  permission granted via the app dialog, not Chrome site settings).
- iOS/web-desktop users can subscribe (same flow) but nobody has tested Safari.
