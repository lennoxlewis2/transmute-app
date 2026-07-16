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
bubblewrap update   # regenerates the Android project, re-fetches the icon
bubblewrap build    # → app-release-bundle.aab + app-release-signed.apk
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

## Upload to the closed track (claude-in-chrome)

1. Archive first: `cp app-release-bundle.aab 'Desktop/Transmute App/signing-keys/Transmute-vN-<what>.aab'`
2. Navigate `{console base}/app/4973933796371250215/closed-testing` → Manage track →
   Create new release (lands on `/tracks/<id>/releases/N/prepare`, which has a real
   `input[type=file]` in the DOM immediately).
3. File upload = the **localhost CORS server trick** (see transmute-play-console skill):
   serve the project dir, then in the page fetch → File → DataTransfer → `input.files` +
   dispatch `input`+`change`. Success = bottom-left toast "1 app bundle uploaded" and
   Release name auto-fills "N (N)". (A stray "Error" string elsewhere in the DOM is noise.)
4. Release notes textarea: keep the `<en-GB>…</en-GB>` wrapper, set via the native value
   setter + input event.
5. Next → review page ("Ready to release") → Save → auto-lands on Publishing overview →
   "Submit 1 change for review" → **the confirm dialog appears ~3s LATE** — wait for it,
   then "Send changes for review". Confirm state: "Changes in review · Closed testing -
   Alpha · N (N) · Start full rollout".

Uploading a new release during the 14-day tester window is safe — it does NOT reset the
clock. Kill any temp CORS server when done (`netstat -ano | grep :PORT` → taskkill).
