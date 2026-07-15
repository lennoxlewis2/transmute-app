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

(async () => {
  if (!R_URL || !R_TOK || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log('skipped: not configured');
    return;
  }
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

  console.log(JSON.stringify({ checked, sent, pruned, failed, hour: targetHour }));
})().catch(e => { console.error('send failed:', e.message); process.exit(1); });
