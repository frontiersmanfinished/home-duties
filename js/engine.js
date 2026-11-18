// Scheduling rules and text helpers. No browser or database code, so it can be tested on its own.
export const DAY_MS = 864e5;
const pad = n => String(n).padStart(2, '0');
const parts = iso => iso.split('-').map(Number);
export const dayNum = iso => { const [y, m, d] = parts(iso); return Math.round(Date.UTC(y, m - 1, d) / DAY_MS); };
export const fromNum = n => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromNum(dayNum(iso) + n);
export const diffDays = (a, b) => dayNum(a) - dayNum(b);
export const weekday = iso => new Date(dayNum(iso) * DAY_MS).getUTCDay();
export const monthOf = iso => parts(iso)[1];
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isoOfMs = ms => isoOf(new Date(ms));
export const today = () => isoOf(new Date());
export function addMonths(iso, n) {
  const [y, m, d] = parts(iso), t = y * 12 + m - 1 + n, yy = Math.floor(t / 12), mm = t % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${pad(mm + 1)}-${pad(Math.min(d, last))}`;
}
export const mondayOf = iso => addDays(iso, -((weekday(iso) + 6) % 7));
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const shortDate = iso => { const [, m, d] = parts(iso); return `${DAYS[weekday(iso)]} ${d} ${MONTHS[m - 1]}`; };

export const DEFAULT_SEASONS = [
  { id: 'growing', name: 'Growing season', months: [9, 10, 11, 12, 1, 2, 3, 4, 5] },
  { id: 'winter', name: 'Winter', months: [6, 7, 8] },
];
export const DEFAULT_EFFORTS = [5, 15, 30, 60];

export function newChore(over = {}) {
  return {
    title: '', roomId: null, assignees: ['anyone'], icon: null, effort: 15, notes: '', steps: [], stepsDone: [],
    repeat: { type: 'none', days: 7, daysMax: null, weekday: 1, everyWeeks: 1, anchor: null },
    rollForward: true, rollsOver: false, months: null, seasonal: null, alt: null, shifts: {}, holidayShift: false, timeOfDay: '',
    startDate: null, dueDate: null, snoozedUntil: null, doneThrough: null, last: null, skip: null, tickedOn: null,
    completedAt: null, paused: false, deletedAt: null, notify: false, calendar: false, ...over,
  };
}

// ---- Seasons ----
export const seasonFor = (month, seasons) => (seasons || DEFAULT_SEASONS).find(s => s.months.includes(month)) || null;
export function activeMonths(c, seasons) {
  let m = c.months && c.months.length ? c.months.slice() : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (c.seasonal) m = m.filter(x => { const s = seasonFor(x, seasons); return !(s && c.seasonal[s.id] && c.seasonal[s.id].paused); });
  return m;
}
export function intervalOn(c, iso, seasons) {
  if (c.seasonal) {
    const s = seasonFor(monthOf(iso), seasons), r = s && c.seasonal[s.id];
    if (r && r.days) return r.days;
  }
  return c.repeat.days || 1;
}
const firstOfMonth = (y, m) => `${y}-${pad(m)}-01`;
/** First day of the next active stretch that begins strictly after `iso`. */
export function nextWindowStart(iso, months) {
  let [y, m] = parts(iso);
  for (let i = 0; i < 25; i++) {
    const prev = m === 1 ? 12 : m - 1, d = firstOfMonth(y, m);
    if (months.includes(m) && !months.includes(prev) && d > iso) return d;
    m++; if (m > 12) { m = 1; y++; }
  }
  return null;
}
function currentWindowStart(iso, months) {
  let [y, m] = parts(iso);
  for (let i = 0; i < 12; i++) {
    const prev = m === 1 ? 12 : m - 1;
    if (!months.includes(prev)) return firstOfMonth(y, m);
    m = prev; if (m === 12) y--;
  }
  return null;
}

// ---- Fixed-day occurrences ----
function shiftOcc(c, nominal) {
  if (c.shifts && c.shifts[nominal]) return c.shifts[nominal];
  if (c.holidayShift) {
    const pickup = addDays(nominal, (c.alt && c.alt.offset) || 0), md = pickup.slice(5);
    if (md === '12-25' || md === '01-01') return addDays(nominal, 1);
  }
  return nominal;
}
function nominalFrom(c, iso) {
  const r = c.repeat, wd = r.weekday ?? 1;
  let d = addDays(iso, (wd - weekday(iso) + 7) % 7);
  const k = r.everyWeeks || 1;
  if (k > 1) {
    const a = r.anchor || c.startDate || d, base = addDays(a, (wd - weekday(a) + 7) % 7);
    const w = ((diffDays(d, base) / 7) % k + k) % k;
    if (w) d = addDays(d, (k - w) * 7);
  }
  return d;
}
const stepDays = c => 7 * (c.repeat.everyWeeks || 1);
export function occAfter(c, iso) {
  let n = nominalFrom(c, addDays(iso, -8));
  for (let i = 0; i < 400; i++) { const d = shiftOcc(c, n); if (d > iso) return d; n = addDays(n, stepDays(c)); }
  return null;
}
export const occOnOrAfter = (c, iso) => occAfter(c, addDays(iso, -1));
export function occOnOrBefore(c, iso) {
  let found = null, n = nominalFrom(c, addDays(iso, -7 * ((c.repeat.everyWeeks || 1) + 2)));
  for (let i = 0; i < 12; i++) { const d = shiftOcc(c, n); if (d <= iso && (!found || d > found)) found = d; n = addDays(n, stepDays(c)); }
  return found;
}

export function displayTitle(c, occ) {
  if (c.alt && occ && c.alt.labels && c.alt.labels.length) {
    const pickup = addDays(occ, c.alt.offset || 0);
    // Weeks are counted from the Monday so a holiday-shifted pickup keeps its own week.
    const w = Math.round(diffDays(mondayOf(pickup), mondayOf(c.alt.anchor)) / 7), n = c.alt.labels.length;
    const label = c.alt.labels[((w % n) + n) % n];
    return (c.alt.format || '{title}: {label}').replace('{title}', c.title).replace('{label}', label);
  }
  return c.title;
}

// ---- Where a chore stands today ----
const lastDay = c => c.last ? isoOfMs(c.last.at) : null;
function baseDate(c) {
  return [c.startDate, lastDay(c), c.skip ? isoOfMs(c.skip.at) : null].filter(Boolean).sort().pop() || null;
}
/** Everything the screens need about a chore on a given day. */
export function stateOf(c, day, seasons) {
  const s = { chore: c, status: 'later', due: null, occ: null, daysLate: 0, ratio: 0, interval: null, base: null, title: c.title, ticked: false, restingUntil: null };
  if (c.deletedAt) return { ...s, status: 'deleted' };
  if (c.paused) return { ...s, status: 'paused' };
  const t = c.repeat.type;
  if (t === 'none') {
    if (c.completedAt) return { ...s, status: 'done' };
    s.due = c.dueDate || null;
    if (c.rollsOver && s.due && s.due <= day) return { ...s, status: 'rollover', ticked: c.tickedOn === day };
  } else {
    const months = activeMonths(c, seasons), partial = months.length < 12, inSeason = months.includes(monthOf(day));
    s.interval = t === 'fixed' ? stepDays(c) : intervalOn(c, day, seasons);
    const yearly = partial && s.interval >= 300;
    if (t === 'fixed') {
      let occ = c.doneThrough ? occAfter(c, c.doneThrough) : occOnOrAfter(c, c.startDate || day);
      if (c.rollForward !== false) { const latest = occOnOrBefore(c, day); if (latest && latest > occ && (!c.startDate || latest >= c.startDate)) occ = latest; }
      s.occ = occ; s.due = c.dueDate || occ; s.title = displayTitle(c, occ); s.base = c.doneThrough || c.startDate;
    } else {
      let base = baseDate(c);
      if (c.rollsOver && c.tickedOn && (!base || c.tickedOn > base)) base = c.tickedOn;
      s.base = base;
      s.due = yearly ? (c.dueDate || nextWindowStart(base || day, months)) : (c.dueDate || addDays(base || day, s.interval));
      if (c.rollsOver && s.interval === 1) s.due = day; // A daily reminder shows every day, including the first.
    }
    if (partial && !yearly) {
      if (!months.length) return { ...s, status: 'paused' };
      if (!inSeason) { s.restingUntil = nextWindowStart(day, months); return { ...s, status: 'resting', due: s.restingUntil }; }
      const w = currentWindowStart(day, months); if (w && s.due < w) s.due = w;
    }
    if (c.rollsOver) {
      if (c.tickedOn === day) return { ...s, status: 'rollover', ticked: true };
      if (s.due <= day) return { ...s, status: 'rollover' };
    }
  }
  if (c.snoozedUntil && (!s.due || c.snoozedUntil > s.due)) s.due = c.snoozedUntil;
  if (!s.due) return { ...s, status: 'someday' };
  // "Every 10 to 14 days": due from day 10, overdue only after day 14.
  const graceTo = t === 'since' && c.repeat.daysMax > s.interval && !c.dueDate && s.base ? addDays(s.base, c.repeat.daysMax) : s.due;
  const late = diffDays(day, graceTo > s.due ? graceTo : s.due), early = diffDays(s.due, day);
  s.daysLate = Math.max(0, late);
  s.ratio = late > 0 ? late / Math.max(s.interval || 7, 1) : 0;
  s.status = late > 0 ? 'overdue' : early <= 0 ? 'today' : early <= 2 ? 'soon' : 'later';
  return s;
}
/** 0 = just done, 1 = due now. Used by the freshness bars. */
export function freshness(st, day) {
  if (!st.due) return 0;
  if (!st.interval) return st.status === 'overdue' || st.status === 'today' ? 1 : 0.3;
  return Math.max(0, Math.min(1, 1 - diffDays(st.due, day) / st.interval));
}
export const overdueLevel = st => st.ratio >= 1 ? 3 : st.ratio >= 0.35 || st.daysLate >= 7 ? 2 : 1;
export const sortByUrgency = (a, b) => (b.ratio - a.ratio) || (a.due || '9').localeCompare(b.due || '9') || ((a.chore.effort || 0) - (b.chore.effort || 0)) || a.title.localeCompare(b.title);

export const isMine = (c, personId) => c.assignees.includes('anyone') || !c.assignees.length || c.assignees.includes(personId);
export function matchesFilter(c, filter, meId) {
  if (filter === 'all') return true;
  if (filter === 'mine') return isMine(c, meId);
  return c.assignees.includes(filter);
}

/** Today screen contents. */
export function buildToday(chores, day, seasons, filter, meId, doneToday = 0, maxMinutes = null) {
  const rows = chores.filter(c => matchesFilter(c, filter, meId)).map(c => stateOf(c, day, seasons));
  const fits = s => !maxMinutes || (s.chore.effort || 0) <= maxMinutes;
  const overdue = rows.filter(s => s.status === 'overdue' && fits(s)).sort(sortByUrgency);
  const dueToday = rows.filter(s => s.status === 'today' && fits(s)).sort(sortByUrgency);
  const rollover = rows.filter(s => s.status === 'rollover').sort((a, b) => (a.ticked - b.ticked) || a.title.localeCompare(b.title));
  const quick = rows.filter(s => s.status === 'soon' && (s.chore.effort || 0) <= 10).sort(sortByUrgency).slice(0, 4);
  const next = overdue[0] || dueToday[0] || quick[0] || null;
  const total = doneToday + rows.filter(s => s.status === 'overdue' || s.status === 'today').length;
  return { next, overdue: overdue.filter(s => s !== next), dueToday: dueToday.filter(s => s !== next), quick: quick.filter(s => s !== next), rollover, total, done: doneToday, overdueCount: rows.filter(s => s.status === 'overdue').length };
}

/** Due dates for a chore between two days, inclusive, assuming it is done on time. */
export function projectDates(c, st, from, to, seasons) {
  if (!st.due || ['deleted', 'paused', 'done'].includes(st.status)) return [];
  const months = activeMonths(c, seasons), out = [];
  if (c.repeat.type === 'fixed') {
    let d = st.due < from ? occOnOrAfter(c, from) : st.due;
    while (d && d <= to && out.length < 60) { out.push(d); d = occAfter(c, d); }
    return out;
  }
  if (c.repeat.type === 'none') return st.due >= from && st.due <= to ? [st.due] : [];
  let d = st.due;
  for (let i = 0; i < 400 && d <= to; i++) {
    if (d >= from && (st.interval >= 300 || months.includes(monthOf(d)))) out.push(d);
    d = addDays(d, intervalOn(c, d, seasons));
  }
  return out;
}

// ---- Recording work ----
export function doneChanges(c, st, atMs, who, day, kind = 'done') {
  const keys = ['last', 'skip', 'dueDate', 'snoozedUntil', 'stepsDone', 'doneThrough', 'completedAt'];
  const undo = {}; keys.forEach(k => { undo[k] = c[k] ?? (k === 'stepsDone' ? [] : null); });
  const patch = { dueDate: null, snoozedUntil: null, stepsDone: [] };
  if (kind === 'done') patch.last = { at: atMs, by: who.id, byName: who.name }; else patch.skip = { at: atMs };
  if (c.repeat.type === 'fixed') {
    const latest = occOnOrBefore(c, day), occ = st.occ || st.due;
    patch.doneThrough = latest && latest > occ ? latest : occ;
  }
  if (c.repeat.type === 'none' && kind === 'done') patch.completedAt = atMs;
  const log = { choreId: c.id, title: st.title || c.title, roomId: c.roomId, at: atMs, day, by: who.id, byName: who.name, kind, minutes: c.effort || 0 };
  return { patch, undo, log };
}

// ---- Momentum ----
export function streak(log, day) {
  const done = new Set(), kept = new Set();
  for (const e of log) (e.kind === 'done' ? done : kept).add(e.day);
  let d = done.has(day) || kept.has(day) ? day : addDays(day, -1), n = 0;
  for (let i = 0; i < 4000; i++, d = addDays(d, -1)) {
    if (done.has(d)) n++; else if (!kept.has(d)) break;
  }
  return n;
}
export function periodStats(log, from, to, people = []) {
  const items = log.filter(e => e.kind === 'done' && e.day >= from && e.day <= to), by = new Map();
  for (const e of items) { const k = e.by || e.byName; const r = by.get(k) || { id: k, name: e.byName || 'Someone', count: 0, minutes: 0 }; r.count++; r.minutes += e.minutes || 0; by.set(k, r); }
  for (const p of people) { const r = by.get(p.id); if (r) r.name = p.name; }
  return { count: items.length, minutes: items.reduce((a, e) => a + (e.minutes || 0), 0), byPerson: [...by.values()].sort((a, b) => b.count - a.count) };
}
export function weeklyTrend(log, day, weeks = 8) {
  const m = mondayOf(day), out = [];
  for (let i = weeks - 1; i >= 0; i--) { const from = addDays(m, -7 * i); out.push({ from, ...periodStats(log, from, addDays(from, 6)) }); }
  return out;
}

// ---- Words ----
const PAST = { wash: 'Washed', unload: 'Unloaded', wipe: 'Wiped', sweep: 'Swept', empty: 'Emptied', clean: 'Cleaned', mop: 'Mopped', degrease: 'Degreased', descale: 'Descaled', scrub: 'Scrubbed', swap: 'Swapped', make: 'Made', change: 'Changed', rotate: 'Rotated', declutter: 'Decluttered', put: 'Put', hang: 'Hung', fold: 'Folded', tidy: 'Tidied', vacuum: 'Vacuumed', dust: 'Dusted', test: 'Tested', replace: 'Replaced', steam: 'Steamed', bring: 'Brought', rinse: 'Rinsed', water: 'Watered', mow: 'Mowed', whipper: 'Whipper-snipped', weed: 'Weeded', weeding: 'Weeded', prune: 'Pruned', clear: 'Cleared', reset: 'Reset', run: 'Ran', adjust: 'Adjusted', check: 'Checked', brush: 'Brushed', hose: 'Hosed', backwash: 'Backwashed', untangle: 'Untangled', inspect: 'Inspected', close: 'Closed', grocery: 'Shopped', meal: 'Planned', sort: 'Sorted', pay: 'Paid', feed: 'Fed', ironing: 'Ironed', spring: 'Done' };
export const pastVerb = title => PAST[(title || '').trim().split(/[\s/,]+/)[0].toLowerCase()] || 'Done';
export function agoText(days) { return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} days ago` : days < 365 ? `${Math.round(days / 30)} months ago` : `${(days / 365).toFixed(1).replace('.0', '')} years ago`; }
export function lastDoneText(c, day) {
  if (c.last) return `${pastVerb(c.title)} ${agoText(diffDays(day, isoOfMs(c.last.at)))} by ${c.last.byName || 'someone'}`;
  return c.startDate && c.repeat.type !== 'none' ? 'Not ticked yet' : 'Not done yet';
}
export function dueText(st, day) {
  if (st.status === 'resting') return `Resting until ${MONTHS[monthOf(st.restingUntil) - 1]}`;
  if (st.status === 'paused') return 'Paused';
  if (st.status === 'done') return 'Done';
  if (!st.due) return 'No due date';
  const d = diffDays(st.due, day);
  if (st.status === 'overdue') return `${st.daysLate} day${st.daysLate === 1 ? '' : 's'} overdue`;
  if (d <= 0) return st.chore.timeOfDay ? `Due ${st.chore.timeOfDay}` : 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d < 7) return `Due ${DAYS_LONG[weekday(st.due)]}`;
  if (d < 60) return `Due in ${d} days`;
  return `Due ${shortDate(st.due)}`;
}
export function intervalText(c) {
  const r = c.repeat;
  if (r.type === 'none') return 'No repeat';
  if (r.type === 'fixed') return `Every ${(r.everyWeeks || 1) > 1 ? r.everyWeeks + ' weeks on ' : ''}${DAYS_LONG[r.weekday ?? 1]}`;
  const d = r.days;
  const range = r.daysMax ? `${d} to ${r.daysMax} days` : d === 1 ? 'day' : d === 7 ? 'week' : d === 14 ? 'fortnight' : d === 30 ? 'month' : d === 90 ? '3 months' : d === 180 ? '6 months' : d === 365 ? 'year' : `${d} days`;
  return `Every ${range}`;
}
export const effortText = m => !m ? '' : m >= 60 ? `${+(m / 60).toFixed(1)} hr` : `${m} min`;

export function parseDueInput(text, day) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'today') return day;
  if (t === 'tomorrow') return addDays(day, 1);
  let m = t.match(/^\+?(\d+)\s*([dwm])$/);
  if (m) { const n = +m[1]; return m[2] === 'd' ? addDays(day, n) : m[2] === 'w' ? addDays(day, n * 7) : addMonths(day, n); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  m = t.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +day.slice(0, 4);
    let iso = `${y}-${pad(+m[2])}-${pad(+m[1])}`;
    if (!m[3] && iso < day) iso = `${y + 1}${iso.slice(4)}`;
    return iso;
  }
  return null;
}

// ---- Import ----
export const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
export function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function splitTable(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : null;
  if (!sep) return lines.map(l => [l.replace(/^\s*[-*•]\s*/, '').trim()]);
  return lines.map(l => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim()); return out;
  });
}
export function frequencyDays(text) {
  const t = (text || '').toLowerCase();
  const m = t.match(/every\s+(\d+)\s*(day|week|month)/);
  if (m) return +m[1] * { day: 1, week: 7, month: 30 }[m[2]];
  for (const [re, d] of [[/daily|every day/, 1], [/few days|twice weekly/, 3], [/fortnight/, 14], [/week/, 7], [/quarter/, 90], [/6.?month|half.?year/, 180], [/month/, 30], [/year|annual/, 365]]) if (re.test(t)) return d;
  return null;
}
export function parseMonths(text) {
  const t = (text || '').trim(); if (!t) return null;
  const idx = w => MONTHS.findIndex(m => m.toLowerCase() === w.slice(0, 3).toLowerCase()) + 1;
  const m = t.split(/\s*(?:-|–|to)\s*/i);
  if (m.length !== 2 || !idx(m[0]) || !idx(m[1])) return null;
  const out = []; let a = idx(m[0]); const b = idx(m[1]);
  for (let i = 0; i < 12; i++) { out.push(a); if (a === b) break; a = a === 12 ? 1 : a + 1; }
  return out;
}
/** Rows from pasted text. Understands a header row (Chore, Area, Frequency, IntervalDays, EstMinutes, RollsOver, ActiveMonths) or one chore per line. */
export function rowsFromText(text) {
  const t = splitTable(text); if (!t.length) return [];
  const head = t[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...n) => head.findIndex(h => n.includes(h));
  const name = col('chore', 'name', 'title', 'task'), hasHead = name >= 0;
  const c = { area: col('area', 'room'), freq: col('frequency', 'repeat'), days: col('intervaldays', 'interval', 'days'), mins: col('estminutes', 'minutes', 'effort'), roll: col('rollsover', 'rollover'), months: col('activemonths', 'months') };
  return t.slice(hasHead ? 1 : 0).map(r => {
    const g = k => hasHead && c[k] >= 0 ? r[c[k]] || '' : '';
    const days = parseInt(g('days'), 10) || frequencyDays(g('freq'));
    return { title: r[hasHead ? name : 0] || '', area: g('area'), days: days || null, effort: parseInt(g('mins'), 10) || 15, rollsOver: /^y|true|1/i.test(g('roll')), months: parseMonths(g('months')) };
  }).filter(r => r.title);
}
/** Spread first due dates by up to about a quarter of the interval, so same-interval chores don't land together. */
export function spreadOffsets(items) {
  const groups = new Map(), out = new Map();
  for (const it of items) { if (!groups.has(it.days)) groups.set(it.days, []); groups.get(it.days).push(it); }
  for (const [days, list] of groups) {
    const k = days < 3 ? 0 : Math.round(days / 4);
    list.slice().sort((a, b) => hash(a.id) - hash(b.id)).forEach((it, i) => {
      out.set(it.id, list.length === 1 || !k ? 0 : Math.round(-k + (2 * k * i) / (list.length - 1)));
    });
  }
  return out;
}
/** Turn plain rows or starter-file rows into chores, treated as done on `day`. */
export function choresFromRows(rows, day) {
  const items = rows.map(r => ({ ...r, id: r.id || `c-${slug(r.title)}` }));
  const spread = spreadOffsets(items.filter(r => r.days && !r.fixed && !r.rollsOver && !r.oncePerSeason));
  return items.map(r => {
    const c = newChore({ id: r.id, title: r.title, roomId: r.roomId || (r.area ? `r-${slug(r.area)}` : null), effort: r.effort || 15, icon: r.icon || null, rollsOver: !!r.rollsOver, months: r.months || null, seasonal: r.seasonal || null, startDate: day, notify: !!r.notify, timeOfDay: r.timeOfDay || '', notes: r.notes || '' });
    if (r.fixed) {
      c.repeat = { type: 'fixed', days: 7, daysMax: null, weekday: r.fixed.weekday, everyWeeks: r.fixed.everyWeeks || 1, anchor: null };
      c.alt = r.alt || null; c.holidayShift = !!r.holidayShift; c.rollForward = r.rollForward !== false;
    } else if (r.days) {
      c.repeat = { type: 'since', days: r.days, daysMax: null, weekday: 1, everyWeeks: 1, anchor: null };
      const off = spread.get(r.id);
      if (off !== undefined) c.dueDate = addDays(day, r.days + off);
    } else c.dueDate = day;
    return c;
  });
}
