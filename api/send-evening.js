// Sends the evening push to every stored device whose LOCAL time is currently
// the target hour (18:00 by default). Triggered hourly by the GitHub Actions
// workflow push-evening.yml with `Authorization: Bearer CRON_SECRET`, so each
// timezone gets exactly one push per day at its own 6 PM.
//
// The payload is deliberately dumb ({kind:'evening'}): the service worker on
// the device reads its own mirrored state from IndexedDB and decides whether
// to show a "log today" reminder, a milestone celebration, or a positive
// day-complete note. Server knows endpoints + timezones, nothing else.
//
// Unconfigured environments return 200 {skipped} so the scheduled workflow
// stays green before/without setup (the stories cron taught us: red scheduled
// runs = failure-email spam).

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.CRON_SECRET || !R_URL || !R_TOK ||
      !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(200).json({ skipped: 'not configured' });
  }
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Lazy require so an unconfigured deploy never even needs the dependency.
  const webpush = require('web-push');
  webpush.setVapidDetails('mailto:lewiscurtis2@hotmail.co.uk',
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const targetHour = parseInt(process.env.PUSH_HOUR || '18', 10);
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
      if (localHour(rec.tz, now) !== targetHour) continue;
      jobs.push(
        webpush.sendNotification(rec.sub, payload, { TTL: 4 * 3600 })
          .then(() => { sent++; })
          .catch(err => {
            // 404/410 = subscription dead (app uninstalled / permission revoked)
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
              pruned++;
              return redis(['DEL', keys[i]]).catch(() => {});
            }
            failed++;
          })
      );
    }
    await Promise.all(jobs);
  } while (cursor !== '0');

  return res.status(200).json({ checked, sent, pruned, failed, hour: targetHour });
};
