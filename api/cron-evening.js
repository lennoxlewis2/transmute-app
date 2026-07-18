// Vercel-cron backstop for the evening push. GitHub's schedule (push-evening.yml)
// is the early bird but drifts for hours or skips entirely; Vercel's scheduler is
// reliable, so two daily invocations of this endpoint (see "crons" in vercel.json)
// guarantee delivery inside the UK evening in both BST and GMT. Same evening-window
// rules as scripts/send-evening.js: local hour >= 18, once per local day via the
// per-device lastSent date — so however many schedulers fire, a device gets one push.
// Auth: Vercel sends "Authorization: Bearer <CRON_SECRET>" on cron invocations when
// that env var is set. Fails closed (503) when unconfigured.
const webpush = require('web-push');

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

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'not configured' });
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!R_URL || !R_TOK || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: 'push not configured' });
  }
  webpush.setVapidDetails('mailto:lewiscurtis2@hotmail.co.uk',
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

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
      if (h < 18 || rec.lastSent === today) continue;
      const key = keys[i];
      jobs.push(
        webpush.sendNotification(rec.sub, payload, { TTL: 4 * 3600 })
          .then(() => {
            sent++;
            rec.lastSent = today;
            return redis(['SET', key, JSON.stringify(rec)]).catch(() => {});
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

  return res.status(200).json({ checked, sent, pruned, failed, mode: 'evening-window' });
};
