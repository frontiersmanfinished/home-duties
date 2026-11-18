// The five main tabs.
import * as E from './engine.js';
import * as D from './store.js';
import { S } from './store.js';
import { esc, icon, initials } from './ui.js';

export const V = { view: 'today', filter: 'mine', quick: false, openRooms: new Set(), roomsTouched: false, currentRoom: null, sort: { key: 'due', dir: 1 }, search: '', selected: new Set(), weekDay: null, trendPick: null, logShown: 40 };
export const states = (day = E.today()) => D.liveChores().map(c => E.stateOf(c, day, D.seasons()));

function whoBadge(c) {
  if (c.assignees.includes('anyone') || !c.assignees.length) return '<span class="who any" title="Anyone">Any</span>';
  return c.assignees.slice(0, 2).map(id => { const p = D.person(id); return `<span class="who" title="${esc(p?.name)}">${esc(initials(p?.name))}</span>`; }).join('');
}
export const tile = (c, sm) => { const r = D.room(c.roomId); return `<span class="tile ${sm ? 'sm' : ''}" style="--tile:${esc(r.color)}">${icon(c.icon || r.icon)}</span>`; };

export function row(st, day, { sub, cls = '', bar = false } = {}) {
  const c = st.chore, sel = V.selected.has(c.id), roll = st.status === 'rollover';
  const late = st.status === 'overdue' ? ` late l${E.overdueLevel(st)}` : '';
  const text = sub ?? (st.status === 'overdue' ? E.dueText(st, day) : E.lastDoneText(c, day));
  const f = bar ? E.freshness(st, day) : 0, tone = st.status === 'overdue' ? 'late' : f >= .75 ? 'soon' : 'ok';
  return `<article class="chore${late}${st.ticked ? ' ticked' : ''}${sel ? ' sel' : ''} ${cls}" data-id="${esc(c.id)}">
    <div class="under"><span class="u-done">${icon('check')} Done</span><span class="u-later">Later ${icon('alarm-clock')}</span></div>
    <div class="chore-in">${tile(c)}<div class="txt"><b>${esc(st.title)}</b><small>${esc(text)}</small>${bar ? `<i class="bar ${tone}"><i style="width:${Math.round(f * 100)}%"></i></i>` : ''}</div>${whoBadge(c)}
      <button class="tick${st.ticked ? ' on' : ''}" data-${roll ? 'roll' : 'done'} aria-label="${roll ? 'Tick for today' : 'Mark done'}: ${esc(st.title)}">${icon('check')}</button></div></article>`;
}
const section = (title, rows) => rows ? `<h3 class="sec">${esc(title)}</h3>${rows}` : '';

function filterPills() {
  const opts = [['mine', 'Mine + Anyone'], ['all', 'Everyone'], ...S.people.filter(p => p.id !== S.meId).map(p => [p.id, p.name])];
  return `<div class="pills" role="group" aria-label="Show chores for">${opts.map(([v, l]) => `<button class="pill${V.filter === v ? ' on' : ''}" data-filter="${esc(v)}">${esc(l)}</button>`).join('')}<button class="pill${V.quick ? ' on' : ''}" data-quick>${icon('clock')} I've got 10 minutes</button></div>`;
}

export function todayModel(day = E.today()) {
  const mineDone = D.doneToday(day).filter(e => { const c = D.chore(e.choreId); return !c || E.matchesFilter(c, V.filter, S.meId); }).length;
  return E.buildToday(D.liveChores(), day, D.seasons(), V.filter, S.meId, mineDone, V.quick ? 10 : null);
}
export function ring(done, total) {
  const p = total ? Math.min(1, done / total) : 0, R = 42, L = 2 * Math.PI * R;
  return `<div class="ring" role="img" aria-label="${done} of ${total} done"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" class="r-bg"/><circle cx="50" cy="50" r="${R}" class="r-fg" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - p)}" transform="rotate(-90 50 50)"/></svg><div><b>${done} of ${total}</b><span>done</span></div></div>`;
}
export function viewToday(day) {
  if (!D.liveChores().length) return `${filterPills()}<div class="empty card"><span class="tile" style="--tile:#B9D6C8">${icon('sparkles')}</span><h2>Let's fill your list</h2><p class="muted">Load your starting chores once, and they'll appear on both phones.</p><button class="btn primary" data-go="import">${icon('upload')} Load starting list</button></div>`;
  const m = todayModel(day), rows = list => list.map(s => row(s, day)).join('');
  const n = m.next;
  const nextCard = n ? `<div class="next-wrap"><span class="next-tag">Do this next</span>
    <article class="chore next${n.status === 'overdue' ? ' late l' + E.overdueLevel(n) : ''}" data-id="${esc(n.chore.id)}"><div class="under"><span class="u-done">${icon('check')} Done</span><span class="u-later">Later ${icon('alarm-clock')}</span></div>
    <div class="chore-in">${tile(n.chore)}<div class="txt"><b>${esc(n.title)}</b><small>${icon('map-pin')} ${esc(D.room(n.chore.roomId).name)} ${n.chore.effort ? `<span class="dot">·</span> ${icon('clock')} ${esc(E.effortText(n.chore.effort))}` : ''}</small>${n.status === 'overdue' ? `<small class="late-t">${esc(E.dueText(n, day))}</small>` : ''}</div>${whoBadge(n.chore)}<button class="tick fill" data-done aria-label="Mark done: ${esc(n.title)}">${icon('check')}</button></div></article></div>`
    : `<div class="card clear"><span class="tile" style="--tile:#A8D5BA">${icon('sparkles')}</span><div><b>${V.quick ? 'Nothing that quick right now' : 'All clear for today'}</b><small class="muted">${m.done ? `${m.done} done. Nice work.` : 'Nothing is due.'}</small></div></div>`;
  const log = D.doneToday(day), mins = log.reduce((a, e) => a + (e.minutes || 0), 0), st = E.streak(D.allLog(), day);
  const roundup = `<div class="card roundup"><div><b>${st}</b><small>day streak</small></div><div><b>${log.length}</b><small>done today</small></div><div><b>${E.effortText(mins) || '0 min'}</b><small>of effort</small></div></div>`;
  return `${filterPills()}${nextCard}${section('Overdue', rows(m.overdue))}${section('Due today', rows(m.dueToday))}${section('Quick wins', rows(m.quick))}${m.rollover.length ? `<h3 class="sec">Every day <small>tick if you like</small></h3>${m.rollover.map(s => row(s, day, { sub: s.ticked ? 'Ticked today' : `${D.room(s.chore.roomId).name}` })).join('')}` : ''}${roundup}`;
}

export function viewRooms(day) {
  const all = states(day).filter(s => !['paused', 'done', 'deleted'].includes(s.status)), byRoom = new Map(S.rooms.map(r => [r.id, []]));
  all.forEach(s => { const k = byRoom.has(s.chore.roomId) ? s.chore.roomId : S.rooms[0]?.id; byRoom.get(k)?.push(s); });
  return S.rooms.map(r => {
    const list = (byRoom.get(r.id) || []).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    const over = list.filter(s => s.status === 'overdue').length, due = list.filter(s => s.status === 'today').length;
    const open = V.openRooms.has(r.id);
    const live = list.filter(s => s.status !== 'resting');
    const fresh = live.length ? live.reduce((a, s) => a + (s.status === 'rollover' ? 0 : E.freshness(s, day)), 0) / live.length : 0;
    return `<section class="room${open ? ' open' : ''}"><button class="room-h" data-room="${esc(r.id)}" aria-expanded="${open}"><span class="tile" style="--tile:${esc(r.color)}">${icon(r.icon)}</span><span class="txt"><b>${esc(r.name)}</b><small>${list.length} chore${list.length === 1 ? '' : 's'}${over ? ` · ${over} overdue` : ''}${due ? ` · ${due} today` : ''}</small><i class="bar ${over ? 'late' : fresh >= .75 ? 'soon' : 'ok'}"><i style="width:${Math.round(fresh * 100)}%"></i></i></span>${icon('chevron-down', 'chev')}</button>${open ? `<div class="room-b">${list.map(s => row(s, day, { sub: s.status === 'overdue' || s.status === 'resting' ? E.dueText(s, day) : `${E.lastDoneText(s.chore, day)} · ${E.dueText(s, day)}`, bar: s.status !== 'resting' && s.status !== 'rollover' })).join('') || '<p class="muted pad">Nothing here yet.</p>'}</div>` : ''}</section>`;
  }).join('');
}

const COLS = [['title', 'Chore'], ['room', 'Room'], ['who', 'Who'], ['last', 'Last done'], ['due', 'Next due'], ['interval', 'Interval'], ['effort', 'Effort']];
export function allRows(day) {
  const q = V.search.trim().toLowerCase();
  const val = s => { const c = s.chore; return { title: s.title.toLowerCase(), room: D.room(c.roomId).name, who: c.assignees.map(a => a === 'anyone' ? 'Anyone' : D.person(a)?.name || '').join(', '), last: c.last?.at || 0, due: s.due || '9999', interval: s.interval || 99999, effort: c.effort || 0 }; };
  const list = states(day).filter(s => s.status !== 'done').map(s => ({ s, v: val(s) })).filter(r => !q || `${r.v.title} ${r.v.room} ${r.v.who}`.toLowerCase().includes(q));
  const { key, dir } = V.sort; list.sort((a, b) => (a.v[key] > b.v[key] ? 1 : a.v[key] < b.v[key] ? -1 : 0) * dir || a.v.title.localeCompare(b.v.title));
  return `<tbody>${list.map(({ s, v }) => { const c = s.chore; return `<tr data-id="${esc(c.id)}" class="${s.status === 'overdue' ? 'late' : ''}"><th scope="row">${esc(s.title)}</th><td>${esc(v.room)}</td><td>${esc(v.who)}</td><td>${c.last ? esc(E.agoText(E.diffDays(day, E.isoOfMs(c.last.at)))) : '–'}</td><td>${s.status === 'paused' ? 'Paused' : s.status === 'resting' ? esc(E.dueText(s, day)) : s.due ? esc(E.shortDate(s.due)) : '–'}</td><td>${esc(E.intervalText(c).replace('Every ', ''))}</td><td class="num">${esc(E.effortText(c.effort))}</td></tr>`; }).join('')}</tbody>`;
}
export function viewAll(day) {
  return `<label class="search">${icon('search')}<input id="all-q" type="search" placeholder="Search chores" value="${esc(V.search)}" aria-label="Search chores"></label>
  <div class="tbl-wrap"><table class="tbl"><thead><tr>${COLS.map(([k, l]) => `<th scope="col" aria-sort="${V.sort.key === k ? (V.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-sort="${k}">${l}${V.sort.key === k ? icon(V.sort.dir > 0 ? 'arrow-up' : 'arrow-down') : ''}</button></th>`).join('')}</tr></thead>${allRows(day)}</table></div>`;
}

export function viewWeek(day) {
  const all = states(day), days = Array.from({ length: 7 }, (_, i) => E.addDays(day, i)), map = new Map(days.map(d => [d, []]));
  const end = days[6];
  for (const s of all) {
    if (['rollover', 'paused', 'done', 'deleted', 'resting', 'someday'].includes(s.status)) continue;
    if (s.status === 'overdue') { map.get(day).push({ s, title: s.title }); }
    for (const d of E.projectDates(s.chore, s, day, end, D.seasons())) if (map.has(d) && !(s.status === 'overdue' && d === day)) map.get(d).push({ s, title: s.chore.alt ? E.displayTitle(s.chore, d) : s.title });
  }
  const pick = map.has(V.weekDay) ? V.weekDay : day, items = map.get(pick).sort((a, b) => (b.s.ratio - a.s.ratio) || a.title.localeCompare(b.title));
  const strip = days.map(d => { const n = map.get(d).length, [, , dd] = d.split('-'); return `<button class="wd${d === pick ? ' on' : ''}" data-day="${d}" aria-label="${E.shortDate(d)}, ${n} chores"><small>${E.DAYS[E.weekday(d)]}</small><b>${+dd}</b><span class="cnt">${n}</span></button>`; }).join('');
  const to = E.addMonths(day, 3), up = [];
  for (const s of all) {
    const c = s.chore, big = c.repeat.type === 'none' || (s.interval || 0) >= 30 || s.status === 'resting';
    if (!big || !s.due || ['paused', 'done', 'deleted', 'rollover'].includes(s.status) || s.due <= end || s.due > to) continue;
    up.push(s);
  }
  up.sort((a, b) => a.due.localeCompare(b.due));
  const dayRows = items.map(({ s, title }) => row({ ...s, title }, day, { sub: s.status === 'overdue' ? E.dueText(s, day) : `${D.room(s.chore.roomId).name} · ${E.effortText(s.chore.effort)}` })).join('');
  return `<div class="strip">${strip}</div><h3 class="sec">${pick === day ? 'Today' : E.shortDate(pick)}</h3>${dayRows || '<p class="muted pad">Nothing due.</p>'}<h3 class="sec">Next 3 months</h3>${up.map(s => row(s, day, { sub: `${E.shortDate(s.due)} · ${E.intervalText(s.chore)}` })).join('') || '<p class="muted pad">Nothing coming up.</p>'}`;
}

export function viewProgress(day) {
  const log = D.allLog(), mon = E.mondayOf(day), wk = E.periodStats(log, mon, E.addDays(mon, 6), S.people), trend = E.weeklyTrend(log, day), st = E.streak(log, day);
  const max = Math.max(1, ...trend.map(t => t.count)), pmax = Math.max(1, ...wk.byPerson.map(p => p.count));
  const pick = trend.find(t => t.from === V.trendPick) || trend[trend.length - 1];
  const bars = trend.map(t => `<button class="b${t === pick ? ' on' : ''}" data-week="${t.from}" aria-label="Week of ${E.shortDate(t.from)}: ${t.count} done"><i style="height:${t.count ? Math.max(5, t.count / max * 100) : 0}%"></i></button>`).join('');
  const entries = log.slice().sort((a, b) => b.at - a.at).slice(0, V.logShown);
  const rows = entries.map(e => `<li class="${e.kind === 'skip' ? 'skip' : ''}"><div><b>${esc(e.title)}</b><small>${e.kind === 'skip' ? 'Skipped' : 'Done'} by ${esc(D.person(e.by)?.name || e.byName)} · ${esc(E.shortDate(e.day))}</small></div></li>`).join('');
  return `<div class="stats"><div class="card"><b>${st}</b><small>day streak</small></div><div class="card"><b>${wk.count}</b><small>done this week</small></div><div class="card"><b>${E.effortText(wk.minutes) || '0 min'}</b><small>of effort</small></div></div>
  <h3 class="sec">This week by person</h3><div class="card">${wk.byPerson.map(p => `<div class="hb"><span>${esc(p.name)}</span><i><i style="width:${p.count / pmax * 100}%"></i></i><b>${p.count}</b></div>`).join('') || '<p class="muted">Nothing ticked off yet this week.</p>'}</div>
  <h3 class="sec">Last 8 weeks</h3><div class="card"><p class="cap"><b>${pick.count} done</b> in the week of ${esc(E.shortDate(pick.from))}${pick.minutes ? ` · ${esc(E.effortText(pick.minutes))}` : ''}</p><div class="bars">${bars}</div></div>
  <h3 class="sec">History</h3><ul class="card log">${rows || '<li class="muted">Completed chores will show here.</li>'}</ul><button class="btn ghost wide" data-more-log>Show more</button>`;
}
