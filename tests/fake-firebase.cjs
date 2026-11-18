// A stand-in for the Firebase SDK. Each page keeps a local copy and a queue of unsent writes, like the real offline cache.
// The "server" lives in the test process and is shared by every simulated phone.
const app = `export const initializeApp = c => ({ c });`;
const auth = `
export const getAuth = () => ({});
export class GoogleAuthProvider { setCustomParameters() {} }
export const getRedirectResult = async () => null;
const cbs = [];
const cur = () => { try { return JSON.parse(localStorage.getItem('fake.user')); } catch { return null; } };
export const onAuthStateChanged = (a, cb) => { cbs.push(cb); setTimeout(() => cb(cur()), 0); return () => {}; };
export const signInWithPopup = async () => { localStorage.setItem('fake.user', JSON.stringify(window.__TEST_USER)); cbs.forEach(c => c(cur())); };
export const signInWithRedirect = signInWithPopup;
export const signOut = async () => { localStorage.removeItem('fake.user'); cbs.forEach(c => c(null)); };`;
const firestore = `
const K = 'fake.cache', Q = 'fake.queue';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let cache = load(K, {}), queue = load(Q, []), subs = new Set(), online = !window.__startOffline, deniedFlag = false, synced = false;
const save = () => { localStorage.setItem(K, JSON.stringify(cache)); localStorage.setItem(Q, JSON.stringify(queue)); };
const view = () => { const v = JSON.parse(JSON.stringify(cache)); for (const b of queue) apply(v, b); return v; };
function apply(s, ops) { for (const o of ops) { if (o.type === 'delete') delete s[o.path]; else if (o.type === 'set') s[o.path] = o.merge ? { ...(s[o.path] || {}), ...o.data } : o.data; else if (s[o.path]) s[o.path] = { ...s[o.path], ...o.data }; } }
let firing = false;
function fire() { if (firing) return; firing = true; setTimeout(() => { firing = false; for (const f of [...subs]) f(); }, 0); }
let flushing = null;
function flush() { if (flushing) return flushing; flushing = (async () => { while (online && queue.length) { const b = queue[0]; const r = await window.__server('commit', b); if (r === 'denied') { deniedFlag = true; break; } queue.shift(); applyToCache(b); save(); } })().finally(() => { flushing = null; }); return flushing; }
function applyToCache(b) { apply(cache, b); }
window.__fromServer = all => { if (!online) return; cache = all; synced = true; save(); fire(); };
window.__setOnline = async v => { online = v; if (v) { await flush(); cache = await window.__server('all'); synced = true; save(); fire(); } else { synced = false; fire(); } };
(async () => { if (online) { const r = await window.__server('hello', window.__TEST_USER_EMAIL()); if (r === 'denied') { deniedFlag = true; fire(); return; } await flush(); cache = await window.__server('all'); synced = true; save(); fire(); } })();
export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
export const initializeFirestore = () => ({});
export const collection = (d, ...p) => ({ path: p.join('/') }); export const doc = (d, ...p) => ({ path: p.join('/'), id: p.at(-1) });
export const where = (f, op, v) => ({ f, op, v }); export const orderBy = () => ({}); export const limit = n => ({ limit: n });
export const query = (c, ...x) => ({ ...c, cons: x });
const rowsFor = (r, s) => Object.entries(s).filter(([p]) => p.startsWith(r.path + '/') && p.split('/').length === r.path.split('/').length + 1).map(([p, d]) => ({ id: p.split('/').at(-1), data: () => d })).filter(x => (r.cons || []).every(c => !c.f || (c.op === '>=' ? x.data()[c.f] >= c.v : x.data()[c.f] < c.v)));
const metaOf = () => ({ fromCache: !synced, hasPendingWrites: queue.length > 0 });
export function onSnapshot(r, o, cb, err) {
  const isDoc = !!r.id;
  const f = () => { if (deniedFlag) return err({ code: 'permission-denied' }); const s = view(); if (isDoc) cb({ exists: () => !!s[r.path], data: () => s[r.path], metadata: metaOf() }); else cb({ docs: rowsFor(r, s), metadata: metaOf() }); };
  subs.add(f); setTimeout(f, 0); return () => subs.delete(f);
}
export const getDocs = async r => ({ docs: rowsFor(r, view()) });
export const writeBatch = () => { const ops = []; return { set: (r, d, o = {}) => ops.push({ type: 'set', path: r.path, data: JSON.parse(JSON.stringify(d)), merge: !!o.merge }), update: (r, d) => ops.push({ type: 'update', path: r.path, data: JSON.parse(JSON.stringify(d)) }), delete: r => ops.push({ type: 'delete', path: r.path }), commit() { queue.push(ops); save(); fire(); flush().then(fire); return Promise.resolve(); } }; };`;
module.exports = { app, auth, firestore };
