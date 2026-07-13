---
name: transmute-refresh-stories
description: Refresh the Transmute app's live Stories feed by capturing the subreddit's current top posts through Lewis's real logged-in browser and publishing them as /stories.json. Use WHENEVER Lewis says "refresh stories", "update the stories", "new stories", or asks why the Stories tab looks stale — and whenever a session touches the stories pipeline. Captures the ONLY fetch route that works (Reddit blocks every server-side client), the blob-download trick around tool output limits, and the publish/verify recipe.
---

# Refreshing the Transmute live stories

The Stories tab loads `/stories.json` from the app's own site (sr-tracker-rho.vercel.app,
auto-deployed from `main`). This file is a snapshot of r/semenretention's top posts of the
month. It does NOT refresh itself — Reddit blocks every automated fetch route — so "refresh
stories" means: capture a new batch through Lewis's real browser, commit it, verify it's live.
Takes ~2 minutes. Lewis asks for this every couple of weeks.

## Do not re-litigate the fetch route (all tested 2026-07-13)

Reddit 403s ALL of these — do not waste time retrying them:
- plain curl/PowerShell from any machine (TLS fingerprint detection)
- GitHub Actions runners on www/old/api hosts, **even via curl-impersonate** (IP-range block)
- headless Edge/Chrome on Lewis's own machine, even with a normal `--user-agent` (headless detection)
- script-app creation for OAuth was silently rejected ×3 (see the retry plan at the end)

The ONLY thing Reddit serves is a real, logged-in, headed browser — which is why this recipe
drives Lewis's Edge via the claude-in-chrome tools (`mcp__claude-in-chrome__*`, load via
ToolSearch in one batch: `tabs_context_mcp,navigate,javascript_tool`).

## The recipe

1. **Get a tab on a reddit origin.** `tabs_context_mcp {createIfEmpty:true}`, then navigate to
   `https://old.reddit.com/prefs/apps` (any reddit page works; this one is quiet). If Lewis
   isn't logged in, ask him to log in first — the fetch may still work logged-out, but the
   session cookies are what reliably passes the bot check.

2. **Fetch + map + download in one `javascript_tool` call.** Same-origin fetch dodges CORS;
   the blob download dodges the tool-result truncation (~1k chars) that makes returning the
   JSON directly impossible:

   ```js
   const res = await fetch('/r/semenretention/top.json?limit=30&t=month&raw_json=1', {headers: {'Accept': 'application/json'}});
   const data = await res.json();
   const posts = data.data.children.map(c => c.data)
     .filter(p => p.is_self && p.selftext && p.selftext !== '[deleted]' && p.selftext !== '[removed]' && p.score > 20 && p.selftext.length > 80)
     .slice(0, 25)
     .map(p => ({
       title: p.title,
       flair: p.link_flair_text || '',
       up: p.score,
       days: (m => m ? parseInt(m[1], 10) : 0)((p.title + ' ' + p.selftext).match(/\b(\d+)\s*day/i)),
       body: p.selftext.length > 6000 ? p.selftext.slice(0, 6000) + '…' : p.selftext,
       author: p.author,
       url: 'https://reddit.com' + p.permalink,
       isReddit: true
     }));
   const payload = JSON.stringify({updated: new Date().toISOString(), stories: posts}, null, 1);
   const a = document.createElement('a');
   a.href = URL.createObjectURL(new Blob([payload], {type: 'application/json'}));
   a.download = 'stories.json';
   document.body.appendChild(a); a.click();
   'downloaded ' + posts.length + ' stories, ' + payload.length + ' chars'
   ```

   Keep the mapping in sync with what the app expects (see `loadRedditStories()` in
   index.html): `{title, flair, up, days, body, author, url, isReddit}` inside
   `{updated, stories}`. The app needs `stories.length >= 3` or it ignores the file.

3. **Validate and publish.** The file lands at `C:\Users\lewis\Downloads\stories.json`
   (newest one — check for ` (1)` suffixes). Copy into the repo, validate, ship via the
   normal PR cycle (the transmute-ship skill):

   ```bash
   cp "C:\Users\lewis\Downloads\stories.json" stories.json
   python -c "import json; d=json.load(open('stories.json', encoding='utf-8')); assert len(d['stories']) >= 5; print('valid,', len(d['stories']), 'stories')"
   # branch → commit "chore: refresh community stories (top of month)" → PR → squash-merge
   ```

4. **Verify live** (Vercel deploys main in ~1 min):

   ```bash
   curl -s "https://sr-tracker-rho.vercel.app/stories.json" | python -c "import json,sys; d=json.load(sys.stdin); print(len(d['stories']), 'stories, updated', d['updated'])"
   ```

   The `updated` timestamp must be today's. Done — users get the new batch on next app open
   (the app fetches with `cache:'no-store'` and the SW is network-first, so nothing sticks).

## Gotchas

- If fewer than ~5 posts survive the filter (quiet month), keep the old file — a thin batch
  looks worse than a slightly stale one.
- Never surface the subreddit name in a story's `flair` field (Play-policy call); the app
  shows "Community" for empty flairs, so leaving flair as-is from the mapping above is safe.
- The browser download needs no user gesture; if Edge shows a "downloads" permission prompt,
  ask Lewis to allow it once.
- `curl` cannot verify reddit.com but CAN verify the Vercel URL — only Reddit blocks bots.

## Making this skill obsolete

The durable fix is Reddit OAuth credentials: retry creating a script app at
old.reddit.com/prefs/apps (name `transmute-stories`, type script, redirect
`http://localhost`; Lewis must tick the captcha and click create himself, and Claude must
never handle the secret values — Lewis pastes them into GitHub repo secrets
`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`). Once the secrets exist, re-enable the cron in
`.github/workflows/stories.yml` and dispatch a run — then delete this skill and the
`project_reddit_app_retry` memory.
