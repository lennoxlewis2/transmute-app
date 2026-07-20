---
name: transmute-play-console
description: Drive the Google Play Console for the Transmute app via the claude-in-chrome browser tools. Use WHENEVER a task touches the Play Console — checking tester/review status, editing products or prices, store listing changes, licence testing, applying for production, or reading console notifications. Captures the account/app IDs, direct URLs, click-flow recipes and UI gotchas so console sessions are fast instead of re-derived.
---

# Transmute on Google Play Console

## File uploads (.aab releases AND listing assets) — current reality
**The JS file-injection route is now BLOCKED by the permission classifier**
(fetch-localhost → DataTransfer → input.files via javascript_tool — denied twice
on 2026-07-18, even with Lewis's explicit go-ahead). Don't burn turns retrying.
The working flow:
1. Drive the console to the page with the file input (release prepare page has a
   real `input[type=file]` immediately; asset library mounts its own on click).
2. Ask Lewis for the 10-second human step: click Upload and pick the file — give
   him the exact path (e.g. `Desktop → Transmute App → signing-keys → <name>.aab`).
3. Confirm via screenshot: bottom-left toast "1 app bundle uploaded", Release
   name auto-fills "N (N)". Then do everything else yourself (notes, Save, submit).

(Historic CORS-server recipe, in case the classifier ever permits it again:
serve the file dir with `Access-Control-Allow-Origin: *` on port 3012+, then in
the page fetch → blob → File → DataTransfer → dispatch input+change. Kill the
server after: `netstat -ano | grep :PORT` → `taskkill //F //PID`.)

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
- Closed testing live; tester opt-in link `https://play.google.com/apps/testing/com.transmute.app`; Google Group `transmute-testers@googlegroups.com`. 12-tester/14-day clock started ~2026-07-07.
- **PRODUCTION ACCESS APPLIED 2026-07-19 19:03** — all three criteria met, 3-step
  questionnaire submitted (recruitment via Reddit communities; "neither difficult
  or easy"; installs steady 18-22 across UK/US/SE/AT; feedback via DMs, main issue
  the evening reminder → fixed in v6/v7; audience adult men 18-40; 0-10K expected
  first-year installs). Google reviews and emails the account owner, "7 days or
  less". Every answer is 300 chars max — the counter blocks submit at 301.
  NEXT once granted: Test and release → Production → Create release → **Add from
  library** (promote v7, don't re-upload) → staged rollout (start ~20%).
- Payments profile exists (merchant name "Transmute", statement TRANSMUTE) but had a red "urgent issue" notification — bank/ID verification is Lewis's job.

## Recipes

**Create a subscription**: Subscriptions → Create subscription (dialog: product ID + user-visible name) → lands on Edit subscription → "Add a base plan" (ID, Auto-renewing, billing period dropdown defaults to Monthly) → Price and availability → **Set prices** → tick the header select-all checkbox ("177 countries selected") → Set price → GBP amount → Update → **Save** (bottom right) → then **Activate** (Save leaves it Draft — two steps, always).

**Add a free-trial offer**: subscription page → Add offer → base plan preselected → Offer ID → Eligibility "New customer acquisition" → scroll to Phases → Add phase → Type "Free trial" → Duration (triple-click the field to replace the default `1`, dropdown Months→Days) → Apply → Save → **Activate**.

**One-time product**: two-step wizard. Step 1: product ID, Name, Description (required). Step 2: Purchase option ID (users never see it; `buy`), type Buy, Set prices → **Bulk edit pricing** → select-all → Continue → price → Apply → **Activate** (submit can take ~10s of "Submitting…").

## Browser-session gotchas (learned 2026-07-16/18)

- **Tab groups die between turns** ("tab group no longer exists") — always
  `tabs_context_mcp {createIfEmpty:true}` first, then re-navigate by URL. Don't
  cache tabIds across user messages.
- **Busy pages wedge script injection** ("Script injection timed out") — Vercel
  logs and sometimes the console do this. A reload rarely helps; a FRESH TAB
  always does.
- **"Create track" ≠ "Create new release"** — `find` on the closed-testing
  overview offers "Create track" (which would create a whole new track). The
  "Create new release" button lives on the TRACK page:
  `{base}/app/4973933796371250215/tracks/4699381906178792655`. Navigate there directly.
- **Release flow refs go stale after upload** — re-`find` before each click.
  Full happy path: track page → Create new release → [Lewis uploads] → notes via
  form_input (keep the `<en-GB>` wrapper) → Next → review "Ready to release" →
  Save → dialog "Go to Publishing overview?" → Go to overview → "Submit 1 change
  for review" → confirm dialog (~3s LATE, sometimes skipped entirely — if find
  shows "Changes in review" already, it went through).
- **Abandoning a draft**: "Discard draft release" (top right of prepare page) →
  confirm dialog. An empty draft is harmless but clutters the track.

## Gotchas

- **Save ≠ Activate.** Base plans and offers save as Draft; there is always a second Activate click. Check the status chip under the page title (`Draft`/`Active`).
- **The left sidebar sometimes collapses**, shifting the whole page left by ~230px — screenshot before clicking; previously-valid coordinates miss.
- The lang/currency dialogs and pickers are custom widgets: for a duration/price field, `triple_click` then type replaces the value; dropdowns need a click then a click on the option row.
- "There is an issue with your payments profile" banners don't block product creation/activation — only Lewis clearing verification affects real sales.
- Money/identity boundaries: creating/altering the payments profile, bank details, and the 15% service-fee terms acceptance are **Lewis-only** — guide him on screen (screenshot → tell him what to type), never enter them.
- File uploads (screenshots/icons): the native picker never opens headlessly — patch `HTMLInputElement.prototype.click` to capture the input, set `.files` via DataTransfer + dispatch change (proven pattern from listing day).
- SAVE the store listing before navigating away — silent draft loss.
- App SKUs must match the paywall code (`PLANS` in index.html): `transmute_annual` / `transmute_monthly` / `transmute_lifetime`, 7-day trials disclosed in paywall copy (PR #127) — if prices or trials change in Console, update the t() paywall strings too.
