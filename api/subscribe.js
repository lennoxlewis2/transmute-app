// Stores/removes a Web Push subscription. Called by the app after notification
// permission is granted (and re-called on every open to keep it fresh).
// Storage = Upstash Redis via the Vercel Marketplace REST API — key per device,
// value = { sub, tz, ts }. No account, no user id: the endpoint URL *is* the
// device identity, and it's an opaque capability URL minted by the push service.
const crypto = require('crypto');

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

const keyFor = endpoint => 'sub:' + crypto.createHash('sha256').update(endpoint).digest('hex');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  // Storage not provisioned yet: succeed quietly so the client doesn't retry-spam.
  if (!R_URL || !R_TOK) return res.status(200).json({ stored: false, reason: 'storage not configured' });

  const b = req.body || {};
  try {
    // TEMP DIAGNOSTIC (remove once push is confirmed on-device): client-side
    // subscribe failures land here so they can be read straight from Redis.
    if (typeof b.debug === 'string') {
      await redis(['SET', 'debug:' + Date.now(), b.debug.slice(0, 500), 'EX', '86400']);
      return res.status(200).json({ logged: true });
    }
    if (b.unsubscribe && typeof b.endpoint === 'string') {
      await redis(['DEL', keyFor(b.endpoint)]);
      return res.status(200).json({ removed: true });
    }
    const sub = b.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') ||
        !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'invalid subscription' });
    }
    const tz = (typeof b.tz === 'string' && b.tz.length <= 64) ? b.tz : 'Europe/London';
    await redis(['SET', keyFor(sub.endpoint), JSON.stringify({ sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, tz, ts: Date.now() })]);
    return res.status(200).json({ stored: true });
  } catch (e) {
    return res.status(500).json({ error: 'storage error' });
  }
};
