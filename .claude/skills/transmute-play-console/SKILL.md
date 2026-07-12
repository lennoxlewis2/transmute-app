---
name: transmute-play-console
description: Drive the Google Play Console for the Transmute app via the claude-in-chrome browser tools. Use WHENEVER a task touches the Play Console — checking tester/review status, editing products or prices, store listing changes, licence testing, applying for production, or reading console notifications. Captures the account/app IDs, direct URLs, click-flow recipes and UI gotchas so console sessions are fast instead of re-derived.
---

# Transmute on Google Play Console

## THE file-upload recipe (works for listing assets AND .aab releases)
The old "patch HTMLInputElement.prototype.click" trick does NOT fire for the asset
library (it mounts its own input late). Instead:
1. JS-click the "Add assets"/upload button → an `input[type=file]` appears in the DOM.
2. Serve the file from localhost with CORS: python `SimpleHTTPRequestHandler` subclass
   sending `Access-Control-Allow-Origin: *` on a spare port (3012+), run_in_background.
3. In the page: `fetch('http://127.0.0.1:PORT/file') → blob → new File → DataTransfer →
   input.files = dt.files` + dispatch `input` and `change`. (HTTPS pages may fetch
   localhost http — it's exempt from mixed-content.)
4. Kill the server after (`netstat -ano | grep :PORT` → `taskkill //F //PID`).

**Swapping a listing image**: after adding, the slot holds BOTH images ("Too many
images") — remove the old one via its `aria-label` (e.g. "Remove App icon"; the newly
added asset is labelled by filename instead). Then Save.

**Submitting changes**: Save → Publishing overview → "Submit N changes for review" →
the confirm dialog renders ~3s LATE; wait, then "Send changes for review". Verify the
section header flips to "Changes in review".

**Prefer JS clicks over coordinates** for buttons found by text/aria-label — the page
is huge (viewport ~3832×2040) and `zoom` regions use RAW viewport px, not screenshot px,
so coordinate maths silently misses.

Account **Lewis Curtis** (personal), id `6775960790393968580`, login `lennoxlewis1258@googlemail.com` (already signed in in Chrome — the account picker may appear; click the "Lewis Curtis" listbox option, coordinate clicks on it can silently no-op, use `find` + ref).
App **Transmute: Semen Retention** (`com.transmute.app`), id `4973933796371250215`.

## Navigate by URL, not by menu

Base: `https://play.google.com/console/u/0/developers/6775960790393968580`

- App dashboard: `{base}/app/4973933796371250215/app-dashboard`
- Subscriptions: `{base}/app/4973933796371250215/subscriptions`
- One-time products: `{base}/app/4973933796371250215/one-time-products` (`/managed-products/create` redirects to `/one-time-products/create`)
- Offer create: `{base}/app/.../subscriptions/s/<productId>/base-plans/b/<planId>/offers/create`
- Licence testing (account-level): `{base}/license-tester`
- Payments profile: `{base}/paymentssettings`

## What already exists (as of 2026-07-08)

- Products all **Active**: `transmute_annual` (base plan `yearly`, £24.99/yr) and `transmute_monthly` (base plan `monthly`, £3.99/mo), each with offer `freetrial7` (7-day free trial, "New customer acquisition", per-product entitlement). `transmute_lifetime` one-time (purchase option `buy`, type Buy, £39.99, backwards-compatible).
- Licence testers active: email list "Transmute testers" = lennoxlewis1258@googlemail.com, ggaldrat@gmail.com. RESPOND_NORMALLY.
- Closed testing live; tester opt-in link `https://play.google.com/apps/testing/com.transmute.app`; Google Group `transmute-testers@googlegroups.com`. 12-tester/14-day clock started ~2026-07-07 → production application ~Jul 21 (button on dashboard when eligible).
- Payments profile exists (merchant name "Transmute", statement TRANSMUTE) but had a red "urgent issue" notification — bank/ID verification is Lewis's job.

## Recipes

**Create a subscription**: Subscriptions → Create subscription (dialog: product ID + user-visible name) → lands on Edit subscription → "Add a base plan" (ID, Auto-renewing, billing period dropdown defaults to Monthly) → Price and availability → **Set prices** → tick the header select-all checkbox ("177 countries selected") → Set price → GBP amount → Update → **Save** (bottom right) → then **Activate** (Save leaves it Draft — two steps, always).

**Add a free-trial offer**: subscription page → Add offer → base plan preselected → Offer ID → Eligibility "New customer acquisition" → scroll to Phases → Add phase → Type "Free trial" → Duration (triple-click the field to replace the default `1`, dropdown Months→Days) → Apply → Save → **Activate**.

**One-time product**: two-step wizard. Step 1: product ID, Name, Description (required). Step 2: Purchase option ID (users never see it; `buy`), type Buy, Set prices → **Bulk edit pricing** → select-all → Continue → price → Apply → **Activate** (submit can take ~10s of "Submitting…").

## Gotchas

- **Save ≠ Activate.** Base plans and offers save as Draft; there is always a second Activate click. Check the status chip under the page title (`Draft`/`Active`).
- **The left sidebar sometimes collapses**, shifting the whole page left by ~230px — screenshot before clicking; previously-valid coordinates miss.
- The lang/currency dialogs and pickers are custom widgets: for a duration/price field, `triple_click` then type replaces the value; dropdowns need a click then a click on the option row.
- "There is an issue with your payments profile" banners don't block product creation/activation — only Lewis clearing verification affects real sales.
- Money/identity boundaries: creating/altering the payments profile, bank details, and the 15% service-fee terms acceptance are **Lewis-only** — guide him on screen (screenshot → tell him what to type), never enter them.
- File uploads (screenshots/icons): the native picker never opens headlessly — patch `HTMLInputElement.prototype.click` to capture the input, set `.files` via DataTransfer + dispatch change (proven pattern from listing day).
- SAVE the store listing before navigating away — silent draft loss.
- App SKUs must match the paywall code (`PLANS` in index.html): `transmute_annual` / `transmute_monthly` / `transmute_lifetime`, 7-day trials disclosed in paywall copy (PR #127) — if prices or trials change in Console, update the t() paywall strings too.
