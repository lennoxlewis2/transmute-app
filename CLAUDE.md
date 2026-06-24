# Transmute — Project Context

Single-file PWA for semen retention / habit tracking. All CSS, HTML, and JS live in **`index.html`** (~3900 lines). Do not create separate files unless explicitly asked.

## Stack
- Vanilla JS + CSS, no framework, no build step
- `localStorage` key: `sr_v3` (all app state)
- i18n via `applyLang()` — uses `ic.innerHTML` (not `.textContent`) to preserve inline SVGs
- Service worker in `sw.js`, manifest in `manifest.json`
- Privacy policy in `privacy.html`

## Target
Google Play Store via TWA (Trusted Web Activity). Google Play Billing is **required** for paid digital features — Stripe is not allowed inside Play Store apps. The current paywall has a Stripe placeholder (`https://buy.stripe.com/REPLACE_ME`) that must be replaced with the Digital Goods API / RevenueCat before launch.

## Workflow
- Branch → commit → push → `gh pr create` → `gh pr merge --squash --delete-branch`
- Repo: `lennoxlewis2/transmute-app`
- Git identity: `lennoxlewis2` / `lewiscurtis2@hotmail.co.uk`
- Run the full branch→PR cycle automatically without asking

## Key facts
- Progress ring: 150px SVG, `r=68` outer / `r=61` inner, `stroke-width:3/2`, dasharray `427.3` / `383.3`
- Paywall restore code `TRANSMUTE99` is hardcoded client-side (known, low-priority)
- All tab icons and transmute-nav icons are inline SVGs — never wipe with `.textContent`
