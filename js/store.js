// Live household data, and every change the app can make to it.
import * as E from './engine.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 20);
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? null : v)));
const noId = ({ id, ...rest }) => rest;
const HISTORY_DAYS = 400;
export const ROOM_COLOURS = ['#A7C4D9', '#C7B8E0', '#F4C7AB', '#F3E3A6', '#E8B4BC', '#B9D6C8'];
const DEFAULT_ROOMS = [['Kitchen', 'cooking-pot'], ['Bathroom', 'bath'], ['Bedrooms', 'bed'], ['Laundry', 'washing-machine'], ['Living areas', 'sofa'], ['Whole house', 'house'], ['Outdoor', 'trees'], ['Pool', 'waves'], ['Household admin', 'clipboard-list'], ['Vehicle', 'car'], ['Pets', 'paw-print']];

export const S = {
  phase: 'loading', user: null, meId: null, chores: [], log: [], olderLog: [], people: [], rooms: [], presets: [],
  config: {}, pending: false, online: navigator.onLine, synced: {}, error: null,
};
let api, listeners = [], changed = () => {}, purged = false;
export const onChange = fn => { changed = fn; };
let queued = false;
const notify = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; changed(); }); };

export const seasons = () => S.config.seasons || E.DEFAULT_SEASONS;
export const efforts = () => S.config.efforts || E.DEFAULT_EFFORTS;
export const me = () => S.people.find(p => p.id === S.meId) || { id: S.meId, name: firstName(S.user) };
export const person = id => S.people.find(p => p.id === id);
export const room = id => S.rooms.find(r => r.id === id) || S.rooms[0] || { id: null, name: 'No room', color: ROOM_COLOURS[0], icon: 'house' };
export const liveChores = () => S.chores.filter(c => !c.deletedAt);
export const allLog = () => [...S.log, ...S.olderLog];
export const doneToday = day => S.log.filter(e => e.day === day && e.kind === 'done');
const firstName = u => ((u && (u.displayName || u.email)) || 'Me').split(/[\s@]/)[0];
const write = ops => api.write(ops).catch(e => { S.error = e.code === 'permission-denied' ? 'This account can\'t save changes.' : 'A change could not be saved.'; console.error(e); notify(); });

export async function start(backend) {
  api = backend;
  addEventListener('online', () => { S.online = true; notify(); });
  addEventListener('offline', () => { S.online = false; notify(); });
  api.onUser(u => {
    listeners.forEach(off => off()); listeners = [];
    Object.assign(S, { user: u, meId: u ? `u_${u.uid}` : null, chores: [], log: [], olderLog: [], people: [], rooms: [], presets: [], config: {}, synced: {} });
    S.phase = u ? 'loading' : 'signin';
    if (u) listenAll();
    notify();
  });
}
export const signIn = () => api.signIn();
export const signOut = () => api.signOut();

function denied(e) {
  console.error(e);
  if (e.code === 'permission-denied') { S.phase = 'denied'; notify(); }
}
function listenAll() {
  const got = new Set();
  const seen = (name, m) => {
    got.add(name); if (!m.fromCache) S.synced[name] = true;
    S.pendingBy = { ...(S.pendingBy || {}), [name]: m.pending };
    S.pending = Object.values(S.pendingBy).some(Boolean);
    if (S.phase === 'loading' && got.size >= 5) S.phase = 'app';
    afterSync(); notify();
  };
  const col = (name, key, sort) => listeners.push(api.listen(name, (rows, m) => { S[key] = sort ? rows.sort(sort) : rows; seen(name, m); }, denied));
  col('chores', 'chores'); col('people', 'people', (a, b) => a.name.localeCompare(b.name));
  col('rooms', 'rooms', (a, b) => (a.order ?? 99) - (b.order ?? 99)); col('presets', 'presets', (a, b) => a.title.localeCompare(b.title));
  listeners.push(api.listen('completions', (rows, m) => { S.log = rows.sort((a, b) => b.at - a.at); seen('completions', m); }, denied, Date.now() - HISTORY_DAYS * E.DAY_MS));
  listeners.push(api.listenDoc('config', 'main', (d, m) => { S.config = d || {}; if (!m.fromCache) S.synced.config = true; notify(); }, denied));
}
function afterSync() {
  const ops = [];
  if (S.synced.people && !person(S.meId) && S.linkedFor !== S.user.uid) {
    S.linkedFor = S.user.uid;
    // Link this Google account to a matching name, or add it. The id is fixed, so two phones can't create duplicates.
    const name = firstName(S.user), same = S.people.find(p => !p.uid && p.name.toLowerCase() === name.toLowerCase());
    if (same) { S.meId = same.id; ops.push({ type: 'update', col: 'people', id: same.id, data: { uid: S.user.uid } }); }
    else if (!S.people.some(p => p.uid === S.user.uid)) ops.push({ type: 'set', col: 'people', id: S.meId, data: { name, uid: S.user.uid } });
  }
  const linked = S.people.find(p => p.uid === (S.user && S.user.uid)); if (linked) S.meId = linked.id;
  if (S.synced.rooms && !S.rooms.length && !S.seededRooms) {
    S.seededRooms = true;
    DEFAULT_ROOMS.forEach(([name, icon], i) => ops.push({ type: 'set', col: 'rooms', id: `r-${E.slug(name)}`, data: { name, icon, color: ROOM_COLOURS[i % ROOM_COLOURS.length], order: i } }));
  }
  if (S.synced.chores && !purged) {
    purged = true; const cut = Date.now() - 30 * E.DAY_MS;
    S.chores.filter(c => c.deletedAt && c.deletedAt < cut).forEach(c => ops.push({ type: 'delete', col: 'chores', id: c.id }));
  }
  if (ops.length) write(ops);
}

// ---- Chores ----
export function addChore(c) { const id = c.id || uid(), day = E.today(); const data = clean(noId({ ...E.newChore(), startDate: day, ...c, createdAt: Date.now(), updatedAt: Date.now() })); write([{ type: 'set', col: 'chores', id, data }]); return id; }
export const patchChore = (id, fields) => write([{ type: 'update', col: 'chores', id, data: clean({ ...fields, updatedAt: Date.now() }) }]);
export const patchMany = (ids, fields) => write(ids.map(id => ({ type: 'update', col: 'chores', id, data: clean({ ...fields, updatedAt: Date.now() }) })));
export const chore = id => S.chores.find(c => c.id === id);

function record(c, kind, who) {
  const day = E.today(), st = E.stateOf(c, day, seasons()), { patch, undo, log } = E.doneChanges(c, st, Date.now(), who, day, kind), logId = uid();
  write([{ type: 'set', col: 'completions', id: logId, data: clean(log) }, { type: 'update', col: 'chores', id: c.id, data: clean({ ...patch, updatedAt: Date.now() }) }]);
  return () => write([{ type: 'delete', col: 'completions', id: logId }, { type: 'update', col: 'chores', id: c.id, data: clean({ ...undo, updatedAt: Date.now() }) }]);
}
export const markDone = (id, who = me()) => record(chore(id), 'done', who);
export const skipChore = id => record(chore(id), 'skip', me());
export function tickRollover(id) {
  const c = chore(id), day = E.today(), st = E.stateOf(c, day, seasons());
  const was = { tickedOn: c.tickedOn ?? null, doneThrough: c.doneThrough ?? null, dueDate: c.dueDate ?? null };
  if (c.tickedOn === day) { patchChore(id, { tickedOn: null }); return null; }
  patchChore(id, { tickedOn: day, dueDate: null, ...(c.repeat.type === 'fixed' ? { doneThrough: st.occ } : {}) });
  return () => patchChore(id, was);
}
export const snooze = (id, until) => patchChore(id, { snoozedUntil: until });
export const removeChores = ids => patchMany(ids, { deletedAt: Date.now() });
export const restoreChore = id => patchChore(id, { deletedAt: null });
export const purgeChore = id => write([{ type: 'delete', col: 'chores', id }]);
export async function loadOlder(count = 200) {
  const oldest = allLog().reduce((m, e) => Math.min(m, e.at), Date.now());
  const rows = await api.getOlder('completions', oldest, count);
  S.olderLog.push(...rows); notify(); return rows.length;
}

// ---- Option lists ----
export const saveItem = (col, id, data) => { const key = id || uid(); write([{ type: 'set', col, id: key, data: clean(data), merge: true }]); return key; };
export const deleteItem = (col, id) => write([{ type: 'delete', col, id }]);
export const patchConfig = data => write([{ type: 'set', col: 'config', id: 'main', data: clean(data), merge: true }]);
export function removePerson(id, takeover) {
  const ops = [{ type: 'delete', col: 'people', id }];
  S.chores.filter(c => c.assignees.includes(id)).forEach(c => { const next = c.assignees.filter(a => a !== id); if (!next.includes(takeover)) next.push(takeover); ops.push({ type: 'update', col: 'chores', id: c.id, data: { assignees: takeover !== 'anyone' ? next.filter(a => a !== 'anyone') : ['anyone'] } }); });
  write(ops);
}
export function removeRoom(id, moveTo) {
  const ops = [{ type: 'delete', col: 'rooms', id }];
  S.chores.filter(c => c.roomId === id).forEach(c => ops.push({ type: 'update', col: 'chores', id: c.id, data: { roomId: moveTo } }));
  write(ops);
}
export function savePreset(c) { saveItem('presets', null, { title: c.title, roomId: c.roomId, effort: c.effort, repeat: c.repeat, icon: c.icon || null, steps: c.steps || [], rollsOver: !!c.rollsOver }); }

// ---- Import and backup ----
/** Work out what an import would add, before anything is saved. */
export function previewImport(text) {
  const t = text.trim(), day = E.today();
  let parsed = null;
  if (t.startsWith('{')) { try { parsed = JSON.parse(t); } catch { return { error: 'That file could not be read.' }; } }
  if (parsed && parsed.kind === 'home-duties-backup') return { backup: parsed, kind: 'backup', items: (parsed.data.chores || []).map(c => ({ title: c.title, room: c.roomId, isNew: !chore(c.id) })) };
  const starter = parsed && parsed.kind === 'home-duties-starter' ? parsed : null;
  if (parsed && !starter) return { error: 'That isn\'t a Home Duties file.' };
  const rows = starter ? starter.chores : E.rowsFromText(t);
  const existing = new Set(S.chores.map(c => c.title.toLowerCase())), ids = new Set(S.chores.map(c => c.id));
  const chores = E.choresFromRows(rows, day).map(c => ({ ...c, assignees: ['anyone'] }));
  const roomNames = new Map(); rows.forEach(r => { if (r.area) roomNames.set(`r-${E.slug(r.area)}`, r.area); });
  return { kind: starter ? 'starter' : 'rows', starter, chores, roomNames, items: chores.map(c => ({ title: E.displayTitle(c, E.stateOf(c, day, starter?.seasons || seasons()).occ), room: roomNames.get(c.roomId) || '', isNew: !ids.has(c.id) && !existing.has(c.title.toLowerCase()), chore: c })) };
}
export function applyImport(p) {
  const ops = [], now = Date.now();
  if (p.kind === 'backup') {
    const d = p.backup.data;
    for (const col of ['chores', 'people', 'rooms', 'presets', 'completions']) (d[col] || []).forEach(x => ops.push({ type: 'set', col, id: x.id, data: clean(noId(x)) }));
    if (d.config) ops.push({ type: 'set', col: 'config', id: 'main', data: clean(d.config), merge: true });
    write(ops); return ops.length;
  }
  const known = new Set(S.rooms.map(r => r.id)); let order = S.rooms.length;
  p.items.filter(i => i.isNew).forEach(i => {
    const c = i.chore; let rid = c.roomId;
    if (!rid) rid = c.roomId = S.rooms[0]?.id || 'r-whole-house';
    if (!known.has(rid)) { known.add(rid); ops.push({ type: 'set', col: 'rooms', id: rid, data: { name: p.roomNames.get(rid) || 'New room', icon: 'house', color: ROOM_COLOURS[order % ROOM_COLOURS.length], order: order++ } }); }
    ops.push({ type: 'set', col: 'chores', id: c.id, data: clean({ ...noId(c), createdAt: now, updatedAt: now }) });
    if (p.kind === 'starter') ops.push({ type: 'set', col: 'presets', id: `p-${c.id}`, data: clean({ title: c.title, roomId: rid, effort: c.effort, repeat: c.repeat, icon: c.icon, steps: [], rollsOver: c.rollsOver }) });
  });
  if (p.starter?.seasons) ops.push({ type: 'set', col: 'config', id: 'main', data: { seasons: p.starter.seasons, efforts: p.starter.efforts || E.DEFAULT_EFFORTS }, merge: true });
  write(ops); return p.items.filter(i => i.isNew).length;
}
export async function backupData() {
  const [chores, people, rooms, presets, completions] = await Promise.all(['chores', 'people', 'rooms', 'presets', 'completions'].map(n => api.getAll(n)));
  return { kind: 'home-duties-backup', version: 1, exportedAt: new Date().toISOString(), data: { chores, people, rooms, presets, completions, config: S.config } };
}
