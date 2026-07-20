---
name: transmute-marketing
description: Run Transmute's faceless short-form marketing engine — render branded TikTok/Reels/Shorts videos from the canvas video studio, script hooks and captions, and coach Lewis through posting. Use WHENEVER a task touches marketing, promotion, growth, TikTok/Instagram/YouTube, "make a video", "new content", "what do I post", sounds/hashtags/captions, or reading the account analytics to plan the next batch. Captures the video-studio render recipe (and the WebCodecs gotcha that makes it work at all), the posting protocol, the phase-based CTA rule, and what Lewis can and can't do himself.
---

# Transmute marketing engine

Marketing is the ACTIVE focus (since 2026-07-13). Channel: **faceless short-form video**,
posted to TikTok (primary) + Instagram Reels + YouTube Shorts, all on **@transmuteapps**.
Claude produces the videos; Lewis only uploads, adds a sound, and replies to comments.

Full strategy + the Week 1 pack (7 scripted videos, captions, scorecard) lives in the
artifact: https://claude.ai/code/artifact/862ce360-e079-4b33-856d-573e2735ad34
Background/decisions: memory `project_marketing_plan.md`.

## Lewis's constraints — design around these

- **Cannot make videos.** No CapCut, no filming, no editing. If a plan requires him to edit,
  the plan is wrong. Claude renders finished MP4s; he uploads them.
- **Minimal time.** Batch everything. His daily job is: upload → sound → caption → pin → reply.
- **Phone for posting.** IG "Add audio" and TikTok "Pin comment" DO NOT EXIST on desktop web.
  Tell him to post from the phone app and transfer files via WhatsApp-to-self/email/Drive.
- Account creation, logins, passwords are **his** — Claude can't and shouldn't.

## The video studio (the core asset)

`C:\Users\lewis\Downloads\transmute-marketing\transmute-video-studio.html` — a single-file
canvas motion-graphics renderer. Draws with the app's REAL assets (FLAME_FORMS SVGs,
tier colours, ring geometry, Plus Jakarta Sans) so output is on-brand, then encodes
1080×1920 MP4s and downloads them (single file, or all 7 in one zip via JSZip).

### Render recipe (~40s for all 7)

1. Serve the folder: `python -m http.server 3021` from the directory, run_in_background.
2. Open `http://127.0.0.1:3021/transmute-video-studio.html` in **Lewis's real Chrome**
   (claude-in-chrome MCP) — must be his browser so downloads land in his Downloads folder.
3. Wait ~3.5s for fonts/flames, then `renderAll()` (or `renderOne(i)`) via javascript_tool.
4. Poll `window.__STUDIO` → `{state:'ready'|'rendering'|'done'|'error', done:[], err}`.
5. Verify the zip: PowerShell `Get-ChildItem C:\Users\lewis\Downloads\transmute-week1-videos.zip`,
   and Expand-Archive + Shell.Application `GetDetailsOf($item,27)` to read each MP4's duration.
6. Kill the server when done.

### Gotchas that cost real time — do not rediscover

- **MediaRecorder + requestAnimationFrame FREEZES in a hidden tab.** The first build stalled
  at "0.0s / 18s" forever because Chrome throttles rAF when the window isn't focused. The fix
  (already in the file) is a **WebCodecs path**: `VideoEncoder` + `mp4-muxer` CDN, encoding
  frame-by-frame off a loop counter — works hidden, ~5× realtime, and outputs real .mp4.
  `renderVideoRealtime()` remains only as a fallback.
- **Yield with MessageChannel, not setTimeout** — setTimeout is throttled in background tabs.
- Long `await new Promise(setTimeout)` inside javascript_tool hits a 45s CDP timeout; poll in
  ≤30s chunks, or assign the promise to `window.__x` and await it in a later call.
- Videos are **silent by design** — Lewis adds a trending sound at post time (platform-licensed
  audio can't travel with the file; each platform needs its own).

### Editing / re-rendering

Scenes are declarative in the `VIDEOS` array: `{name, scenes:[{d: seconds, draw:(t, sec)=>…}]}`
where `t` is 0→1 within the scene and `sec` is elapsed seconds (use for pulse/breathing).
Helpers: `bg()`, `title()`, `drawFlame(tierKey,x,y,size,sec)`, `ring()`, `hookScene()`,
`endCard()`, `fio()` (fade in/out). Tier keys: ember/spark/flame/blaze/blue/radiant/solar/phoenix.

**`const LAUNCHED=false`** near the top switches every end card between
"🔥 Launching this month / Follow for day one" and "▶ Get it on Google Play / search Transmute".
**Flip it to true the day production is approved and re-render all 7.**

## Phase-based CTA rule (important)

The app is NOT publicly searchable until production approval (~Jul 2026). Until then:

- Pinned comment: `Launching on Google Play this month 🔥 Follow so you don't miss day one.`
- Goal of pre-launch content is **followers**, not installs.
- On approval: flip `LAUNCHED`, re-render, re-pin all videos with
  `Search "Transmute" on Google Play 🔥`, testers leave 5★ reviews in the first 48h
  (review velocity is the top new-app ranking signal), founder countdown ("X of 250 left")
  becomes the daily video.

## Posting protocol (what to tell Lewis)

One video per day, in numbered order. Per video: upload → add a trending sound →
paste the caption from the pack → post 6–9pm UK → pin the comment → reply to every
comment in the first hour (replies are the strongest free signal; self-likes count for
nothing). IG/YouTube get the same files re-uploaded natively — never share from TikTok
(watermarked reposts get suppressed).

### Sounds

- **TikTok's Creative Center music chart was taken offline in 2026** — it shows hashtags only.
  Don't send him there.
- Use **tokchart.com** (free, daily) or, simpler, the in-app **Add sound** list — anything with
  a 🔺 rising arrow or "Trending" tag. Free tokchart rows are partly name-gated behind a
  subscription; the top few are always visible.
- Match energy to video: punchy/beat-drop → 03, 06, 07; atmospheric/cinematic → 02, 04;
  epic-rising → 05. Never let sound-hunting or beat-syncing exceed ~2 minutes; posting beats polish.
- Different sound per video (each sound is its own discovery surface, and trends decay fast).

### Account behaviour

Post like a brand, engage like a person. Follow 20–50 niche accounts (SR/discipline/gym),
like and genuinely comment in-niche daily. No mass-follow, no follow-unfollow, no link spam —
new accounts get rate-limited and profile-visit→follow conversion is the metric that matters.

## Moderation

On-screen text and spoken words: "retention", "SR", "the streak" — the full phrase can get a
video age-gated or throttled. Hashtags (#semenretention #nofap) are established and safe.
Nothing explicit or medical on camera; this is a discipline/self-improvement brand.

## Weekly loop

Sunday: read TikTok analytics (completion rate is the kill/scale signal, profile-visit rate is
the conversion signal) → drop the bottom-two angles → remake the best angle with 3 new hooks →
render the next batch. The Urge Wave POV (02) is the evergreen remake candidate; it's the most
filmable feature in the niche and no competitor has an equivalent.

**Week 2 upgrade path:** real in-app footage. Claude can't screen-record silently, so either
(a) Lewis screen-records 3 clips on his phone, or (b) he clicks "Share this tab" once and Claude
drives a scripted demo (set any streak state, trigger Urge Wave, scroll the letter) while it
records. Hybrid — brand ads for reach, real UI for trust — is where the best accounts land.
