// Evening push fan-out. Runs INSIDE the hourly GitHub Action (push-evening.yml)
// with secrets injected as env vars — there is deliberately no public send
// endpoint and no shared cron secret. Pushes {kind:'evening'} to every stored
// device whose LOCAL hour is the target (18 unless PUSH_HOUR overrides, e.g.
// for a test dispatch). The service worker on the device decides what to show.
// Exits 0 with a "skipped" line when unconfigured so scheduled runs stay green.

const R_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(R_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + R_TOK, 'content-type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

function localHour(tz, now) {
  try {
    return parseInt(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(now), 10);
  } catch (e) {
    return -1; // unknown tz string: never matches, device just gets no push
  }
}

function localDate(tz, now) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD
  } catch (e) {
    return 'invalid';
  }
}

(async () => {
  if (!R_URL || !R_TOK || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log('skipped: not configured');
    return;
  }
  const webpush = require('web-push');
  webpush.setVapidDetails('mailto:lewiscurtis2@hotmail.co.uk',
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  // Two modes:
  // - Test dispatch (PUSH_HOUR input set): exact-hour match, and the send does
  //   NOT count as the day's delivery, so tests never eat the real evening one.
  // - Scheduled (default): GitHub's cron is unreliable (delayed for hours,
  //   sometimes skipped entirely — observed 07:35 → 12:20 → 16:54), so don't
  //   demand a run inside one exact hour. Each device gets the push on the
  //   FIRST run where its local time is in the 18:00–23:59 window and it
  //   hasn't been sent today (per-device lastSent date in its record).
  const overrideHour = process.env.PUSH_HOUR ? parseInt(process.env.PUSH_HOUR, 10) : null;
  const now = new Date();
  const payload = JSON.stringify({ kind: 'evening' });
  let cursor = '0', checked = 0, sent = 0, pruned = 0, failed = 0;

  do {
    const scan = await redis(['SCAN', cursor, 'MATCH', 'sub:*', 'COUNT', '200']);
    cursor = scan[0];
    const keys = scan[1] || [];
    if (!keys.length) continue;
    const vals = await redis(['MGET'].concat(keys));
    const jobs = [];
    for (let i = 0; i < keys.length; i++) {
      if (!vals[i]) continue;
      let rec; try { rec = JSON.parse(vals[i]); } catch (e) { continue; }
      checked++;
      const h = localHour(rec.tz, now);
      const today = localDate(rec.tz, now);
      if (overrideHour !== null) {
        if (h !== overrideHour) continue;
      } else {
        if (h < 18 || rec.lastSent === today) continue;
      }
      const key = keys[i];
      jobs.push(
        webpush.sendNotification(rec.sub, payload, { TTL: 4 * 3600 })
          .then(() => {
            sent++;
            if (overrideHour === null) {
              rec.lastSent = today;
              return redis(['SET', key, JSON.stringify(rec)]).catch(() => {});
            }
          })
          .catch(err => {
            // 404/410 = subscription dead (app uninstalled / permission revoked)
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
              pruned++;
              return redis(['DEL', key]).catch(() => {});
            }
            failed++;
          })
      );
    }
    await Promise.all(jobs);
  } while (cursor !== '0');

  console.log(JSON.stringify({ checked, sent, pruned, failed, mode: overrideHour === null ? 'evening-window' : 'test-hour-' + overrideHour }));
})().catch(e => { console.error('send failed:', e.message); process.exit(1); });
