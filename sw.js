const CACHE = 'transmute-v6';
const FILES = ['/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/privacy.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ===================== WEB PUSH (works with the app closed) =====================
// The server sends a dumb {kind:'evening'} payload once a day at local 6 PM.
// This worker owns the decision of WHAT to show, using app state the page
// mirrors into IndexedDB (localStorage is invisible to service workers):
//   startDate      — S.startDate ('YYYY-MM-DD'), drives the streak day count
//   lastLog        — toDateString() of the latest daily check-in
//   streakNotifDay — highest streak day already positively notified (either side)
//   lastNotifDate  — toDateString() the evening reminder last fired
// It writes the same flags back so the app doesn't duplicate a notification
// the push already showed (and vice versa). Always shows exactly one
// notification per push — silent pushes burn Chrome's background budget.

const MS_TITLES = {
  7:'One Week Strong', 14:'Two Weeks of Power', 21:'21 Days · Rewired',
  30:'30 Day Warrior', 40:'Peak Energy Unlocked', 60:'60 Days · The Elite',
  90:'90 Days · Legend', 120:'120 Days · Diamond Mind', 180:'180 Days · Transcendent',
  270:'270 Days · Solar', 365:'365 Days · One Full Year'
};
const POS_LINES = [
  'Momentum is building.',
  'Energy compounding — keep channelling it.',
  'Another promise kept.',
  'Your future self just got stronger.',
  'Discipline is becoming identity.'
];
const EVE_LINES = [
  'Rest well — tomorrow compounds.',
  'Logged and locked. Sleep on a win.',
  'Quiet consistency is the whole game.',
  'Banked. See you on the next one.',
  'Done right. Evenings like this build the man.'
];

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('transmute-push', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbGet(keys) {
  return idbOpen().then(db => new Promise(res => {
    const st = db.transaction('kv', 'readonly').objectStore('kv');
    const out = {}; let n = keys.length;
    keys.forEach(k => {
      const g = st.get(k);
      g.onsuccess = () => { out[k] = g.result; if (--n === 0) { db.close(); res(out); } };
      g.onerror = () => { if (--n === 0) { db.close(); res(out); } };
    });
  }));
}
function idbSet(obj) {
  return idbOpen().then(db => new Promise(res => {
    const tx = db.transaction('kv', 'readwrite');
    const st = tx.objectStore('kv');
    Object.keys(obj).forEach(k => st.put(obj[k], k));
    tx.oncomplete = () => { db.close(); res(true); };
    tx.onerror = () => { db.close(); res(false); };
  })).catch(() => false);
}

function streakDayFrom(startDate) {
  if (!startDate) return 0;
  const p = String(startDate).split('-');
  const a = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  const b = new Date(); b.setHours(0, 0, 0, 0);
  // round, not floor — same DST rationale as calcStreak() in index.html
  return Math.max(0, Math.round((b - a) / 86400000));
}

async function handleEveningPush() {
  const v = await idbGet(['startDate', 'lastLog', 'streakNotifDay', 'lastNotifDate']).catch(() => ({}));
  const opts = { icon: '/icon-192.png', badge: '/icon-192.png', tag: 'evening' };
  const today = new Date().toDateString();
  const n = streakDayFrom(v.startDate);
  if (n < 1) {
    return self.registration.showNotification('Transmute',
      Object.assign({ body: 'Evening check-in — a quiet minute for yourself.' }, opts));
  }
  if (v.lastLog !== today) {
    await idbSet({ lastNotifDate: today });
    return self.registration.showNotification('Transmute',
      Object.assign({ body: 'Day ' + n + ' · close out today, log how it felt before midnight.' }, opts));
  }
  const already = parseInt(v.streakNotifDay, 10) || 0;
  if (MS_TITLES[n] && already < n) {
    await idbSet({ streakNotifDay: n });
    return self.registration.showNotification('Day ' + n + ' · ' + MS_TITLES[n] + ' 🔥',
      Object.assign({ body: 'Milestone unlocked — a new flame form is waiting for you.' }, opts));
  }
  if (already < n) {
    await idbSet({ streakNotifDay: n });
    return self.registration.showNotification('Transmute',
      Object.assign({ body: 'Day ' + n + ' locked in. ' + POS_LINES[n % POS_LINES.length] }, opts));
  }
  // Day already celebrated and logged: still show a small close-of-day note.
  return self.registration.showNotification('Transmute',
    Object.assign({ body: 'Day ' + n + ' complete ✓ ' + EVE_LINES[n % EVE_LINES.length] }, opts));
}

self.addEventListener('push', e => {
  let data = {}; try { data = e.data ? e.data.json() : {}; } catch (err) {}
  // Only 'evening' exists today; unknown kinds fall through to the same logic
  // so an old worker never drops a push silently.
  e.waitUntil(handleEveningPush(data));
});

// Test hook: lets the page (and verification tooling) exercise the exact push
// path without a real push service round-trip.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'simulate-push') handleEveningPush({});
});

// Tapping a notification must open (or refocus) the app — without this
// handler, notification taps on Android do nothing at all.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Only cache good same-origin responses — a 404/500 or an opaque
        // cross-origin body must never overwrite a working offline copy.
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
