---
name: transmute-android-release
description: Rebuild the Transmute Android .aab (Bubblewrap TWA) and upload it to a Play Console testing track. Use WHENEVER a new app bundle is needed — launcher icon changes, TWA manifest changes (theme colours, start URL, billing flags), version bumps, or promoting a build — including "rebuild the aab", "new release to closed testing", "update the launcher icon on phones". Captures the local toolchain paths, env-var signing, the auto-version-bump quirk, in-bundle verification, and the console upload recipe.
---

# Rebuilding & releasing the Transmute .aab

The web app updates instantly via Vercel — the .aab only needs rebuilding when something
BAKED INTO the Android shell changes: launcher icon, splash, theme colours, start URL,
version code, or Bubblewrap features (playBilling etc). The launcher icon is fetched from
`https://sr-tracker-rho.vercel.app/icon-512.png` AT BUILD TIME — deploy the new icon to
Vercel first, verify with `curl -s -o /dev/null -w "%{size_download}" <url>` that the byte
size matches the local file.

## Toolchain (all already installed)

- Project: `C:\Users\lewis\transmute-twa` (twa-manifest.json is the source of truth)
- JDK: `C:\Users\lewis\jdk-17.0.19+10` · Android SDK: `C:\Users\lewis\android-sdk`
- Node/bubblewrap: winget Node install, `bubblewrap` on PATH
- Keystore: `Desktop\Transmute App\signing-keys\signing.keystore`, alias `transmute`,
  password `txXjtHBCBsZI` (same for key)

## The build (Bash tool, one block)

```bash
cd 'C:/Users/lewis/transmute-twa'
export PATH="$PATH:/c/Users/lewis/jdk-17.0.19+10/bin:/c/Users/lewis/transmute-twa"
export BUBBLEWRAP_KEYSTORE_PASSWORD=txXjtHBCBsZI BUBBLEWRAP_KEY_PASSWORD=txXjtHBCBsZI
bubblewrap update       # regenerates the Android project, re-fetches the icon
bash apply-splash.sh    # REQUIRED: replaces the square-tile splash with the
                        # transparent glowing flame (update regenerates the
                        # squares from iconUrl every time — skipping this step
                        # ships the ugly square splash again)
bash apply-patches.sh   # REQUIRED (v7+): re-applies patches/DelegationService.java —
                        # the override that strips the site-origin subtext Chrome
                        # stamps on delegated notifications. `bubblewrap update`
                        # regenerates the Java sources, so skipping this brings
                        # the "URL in the notification" bug back.
bubblewrap build        # → app-release-bundle.aab + app-release-signed.apk
```

Gotchas:
- **`bubblewrap update` auto-increments appVersionCode** on top of whatever is in
  twa-manifest.json — don't hand-bump first or you skip a number (harmless, but know why).
- The PATH additions are load-bearing: gradlew needs the project dir on PATH (Windows
  NoDefaultCurrentDirectoryInExePath), jarsigner needs the JDK bin.
- Non-interactive: the env vars suppress the password prompts entirely.
- **Keep `"alphaDependencies": {"enabled": false}` in twa-manifest.json.** The alpha
  androidbrowserhelper (2.7.0-alpha02) shipped in v1–v4 had BROKEN notification
  permission delegation — grants never persisted to Chrome's site permission, so web
  push subscriptions were revoked (410) within minutes and no notification ever showed.
  v5 (2026-07-16) fixed this by regenerating with stable androidbrowserhelper 2.6.2;
  playBilling works fine without alpha deps. Never re-enable without re-testing push
  end-to-end on a real device.

## Verify BEFORE uploading (never ship blind)

```bash
unzip -l app-release-bundle.aab | grep mipmap        # launcher icons present
unzip -o app-release-bundle.aab 'base/res/mipmap-xxxhdpi-v4/ic_launcher.png' -d /tmp/aabcheck
```
Then Read the extracted PNG to eyeball it. `bubblewrap update` prints the new
versionCode — confirm it's higher than the last release.

**White-on-transparent assets look BLANK when Read** (white preview background).
To actually see them, composite onto dark first:
`npx --yes sharp-cli -i <png> -o check.png --background "#1a1a2e" flatten` → Read check.png.
Applies to `ic_notification_icon.png` (must be the flame silhouette — a purple
square here = the white-square status-bar bug is back; `monochromeIconUrl` in
twa-manifest.json feeds it) and the splash (must be the transparent glowing
flame, not the square icon tile).

**Archive every uploaded bundle** to `Desktop\Transmute App\signing-keys\Transmute-vN-<what>.aab`.
State as of 2026-07-18 (late): v6 (mono notification icon + smooth splash) live
on closed testing; v7 (DelegationService subtext strip → fully native
notification look) submitted for review.

## Upload to the closed track (claude-in-chrome)

1. Archive first: `cp app-release-bundle.aab 'Desktop/Transmute App/signing-keys/Transmute-vN-<what>.aab'`
2. Navigate `{console base}/app/4973933796371250215/closed-testing` → Manage track →
   Create new release (lands on `/tracks/<id>/releases/N/prepare`, which has a real
   `input[type=file]` in the DOM immediately).
3. File upload: the JS-injection trick is now blocked by the permission
   classifier — **ask Lewis to click Upload and pick the archived .aab** (give
   the exact path); see transmute-play-console for the full current flow.
   Success = bottom-left toast "1 app bundle uploaded" and Release name
   auto-fills "N (N)". (A stray "Error" string elsewhere in the DOM is noise.)
4. Release notes textarea: keep the `<en-GB>…</en-GB>` wrapper, set via the native value
   setter + input event.
5. Next → review page ("Ready to release") → Save → auto-lands on Publishing overview →
   "Submit 1 change for review" → **the confirm dialog appears ~3s LATE** — wait for it,
   then "Send changes for review". Confirm state: "Changes in review · Closed testing -
   Alpha · N (N) · Start full rollout".

Uploading a new release during the 14-day tester window is safe — it does NOT reset the
clock. Kill any temp CORS server when done (`netstat -ano | grep :PORT` → taskkill).
