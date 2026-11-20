// Chore card, add chore, snooze and multi-select actions.
import * as E from './engine.js';
import * as D from './store.js';
import { S } from './store.js';
import { $, $$, esc, icon, openSheet, closeSheet, confirmBox, pickFrom, toast } from './ui.js';
import { ICONS } from './icons.js';
import { V, tile } from './views.js';

const sw = (key, on, label, hint = '') => `<label class="sw-row"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span><input type="checkbox" role="switch" data-sw="${key}" ${on ? 'checked' : ''}><i></i></label>`;
const chip = (attr, val, on, label) => `<button type="button" class="pill${on ? ' on' : ''}" data-${attr}="${esc(val)}">${esc(label)}</button>`;
const DAY_CHIPS = [[1, 'Daily'], [3, '3 days'], [7, 'Weekly'], [14, 'Fortnightly'], [30, 'Monthly'], [90, '3 months'], [180, '6 months'], [365, 'Yearly']];
const stepId = () => Math.random().toString(36).slice(2, 9);
const undoToast = (msg, undo) => toast(msg, undo ? { label: 'Undo', run: undo } : null);

export function snoozeSheet(id) {
  const c = D.chore(id), day = E.today(), st = E.stateOf(c, day, D.seasons());
  const opts = [['Tomorrow', 1], ['In 2 days', 2], ['In a week', 7]];
  const b = openSheet(`<h2>${esc(st.title)}</h2><p class="muted">Snoozing or skipping won't break your streak.</p><div class="pick">${opts.map(([l, n]) => `<button class="pick-row" data-n="${n}">${icon('alarm-clock')}<span>Snooze: ${l}</span></button>`).join('')}${c.repeat.type !== 'none' ? `<button class="pick-row" data-skip>${icon('skip-forward')}<span>Skip this time</span></button>` : ''}</div>`);
  b.addEventListener('click', e => {
    const r = e.target.closest('.pick-row'); if (!r) return;
    closeSheet();
    if (r.dataset.skip !== undefined) undoToast('Skipped this time', D.skipChore(id));
    else { const was = c.snoozedUntil ?? null, n = +r.dataset.n; D.snooze(id, E.addDays(day, n)); undoToast(`Snoozed until ${E.shortDate(E.addDays(day, n))}`, () => D.snooze(id, was)); }
  });
}

function formHtml(c, draft) {
  const day = E.today(), R = c.repeat, seasons = D.seasons(), st = E.stateOf({ ...c, id: c.id || 'x' }, day, seasons), who = c.assignees || [];
  const anyone = who.includes('anyone') || !who.length;
  const hist = draft ? [] : D.allLog().filter(e => e.choreId === c.id).sort((a, b) => b.at - a.at).slice(0, 12);
  const dueLabel = st.due ? `${E.dueText(st, day)} (${E.shortDate(st.due)})` : 'Not set';
  return `<div class="f-head"><button type="button" class="tile-btn" data-act="icons" aria-label="Choose icon">${tile(c)}</button><input class="f-title" data-f="title" value="${esc(c.title)}" placeholder="Chore name" aria-label="Chore name"><button class="x" data-close aria-label="Close">${icon('x')}</button></div>
  <div id="f-icons"></div>
  ${draft ? '' : `<p class="muted f-sub">${esc(E.lastDoneText(c, day))} · ${esc(E.dueText(st, day))}</p><div class="row acts">${st.status === 'rollover' ? `<button class="btn primary" data-act="roll">${icon('check')} ${st.ticked ? 'Untick' : 'Tick for today'}</button>` : `<button class="btn primary" data-act="done">${icon('check')} Done</button>`}${st.status === 'rollover' ? '' : `${c.repeat.type !== 'none' ? `<button class="btn ghost" data-act="skip">${icon('skip-forward')} Skip</button>` : ''}<button class="btn ghost" data-act="later">${icon('alarm-clock')} Later</button><button class="btn ghost" data-act="doneby">Done by…</button>`}</div>`}
  <label class="fld"><span>Room</span><select data-f="roomId">${S.rooms.map(r => `<option value="${esc(r.id)}" ${r.id === c.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
  <div class="fld"><span>Who</span><div class="pills wrap">${chip('who', 'anyone', anyone, 'Anyone')}${S.people.map(p => chip('who', p.id, who.includes(p.id), p.name)).join('')}</div></div>
  <div class="fld"><span>Repeat</span><div class="seg">${[['none', 'No repeat'], ['since', 'After last done'], ['fixed', 'Fixed day']].map(([v, l]) => `<button type="button" class="${R.type === v ? 'on' : ''}" data-rtype="${v}">${l}</button>`).join('')}</div></div>
  ${R.type === 'since' ? `<div class="fld"><div class="pills wrap">${DAY_CHIPS.map(([d, l]) => chip('days', d, R.days === d, l)).join('')}</div><div class="row in"><span>Every</span><input type="number" min="1" inputmode="numeric" data-r="days" value="${R.days}" aria-label="Days"><span>to</span><input type="number" min="1" inputmode="numeric" data-r="daysMax" value="${R.daysMax ?? ''}" placeholder="–" aria-label="Up to days"><span>days after it's done</span></div></div>` : ''}
  ${R.type === 'fixed' ? `<div class="fld"><div class="pills wrap">${[1, 2, 3, 4, 5, 6, 0].map(d => chip('wd', d, (R.weekday ?? 1) === d, E.DAYS[d])).join('')}</div><div class="row in"><span>Every</span><input type="number" min="1" inputmode="numeric" data-r="everyWeeks" value="${R.everyWeeks || 1}" aria-label="Weeks"><span>week(s)</span></div><label class="fld sub"><span>Time of day (optional)</span><input data-f="timeOfDay" value="${esc(c.timeOfDay)}" placeholder="this evening"></label>${sw('rollForward', c.rollForward !== false, 'Roll forward if missed', 'A missed one moves to the next date.')}${sw('hasAlt', !!c.alt, 'Alternating details', 'Such as recycling one week, organics the next.')}
    ${c.alt ? `<div class="box"><label class="fld sub"><span>Title pattern</span><input data-alt="format" value="${esc(c.alt.format)}"></label><label class="fld sub"><span>Details, one per line</span><textarea rows="2" data-alt="labels">${esc(c.alt.labels.join('\n'))}</textarea></label><label class="fld sub"><span>A date the first detail applies</span><input type="date" data-alt="anchor" value="${esc(c.alt.anchor)}"></label><label class="fld sub"><span>Days from this chore to that date</span><input type="number" inputmode="numeric" data-alt="offset" value="${c.alt.offset || 0}"></label></div>` : ''}
    ${sw('holidayShift', c.holidayShift, 'Move a day later for Christmas and New Year\'s Day')}
    <div class="box"><span class="lbl">One-off date changes</span>${Object.entries(c.shifts || {}).map(([a, b]) => `<div class="row in"><span>${esc(E.shortDate(a))} → ${esc(E.shortDate(b))}</span><button class="x" data-unshift="${a}" aria-label="Remove">${icon('x')}</button></div>`).join('')}<div class="row in"><input type="date" id="sh-from" aria-label="Usual date"><span>→</span><input type="date" id="sh-to" aria-label="New date"><button class="btn ghost" data-act="shift">Add</button></div></div></div>` : ''}
  <div class="fld"><span>Due: ${esc(dueLabel)}</span><div class="pills wrap">${[['Today', 0], ['Tomorrow', 1], ['+2 days', 2], ['1 week', 7]].map(([l, n]) => chip('due', n, false, l)).join('')}${c.dueDate ? chip('due', 'clear', false, 'Clear') : ''}</div><input id="f-due" placeholder="Or type +2d, +3w, +1m or 24/12" aria-label="Due date"></div>
  <div class="fld"><span>Effort</span><div class="pills wrap">${[...new Set([...D.efforts(), ...(c.effort ? [c.effort] : [])])].sort((a, b) => a - b).map(m => chip('eff', m, c.effort === m, m >= 60 && D.efforts().at(-1) === m ? `${m}+ min` : `${m} min`)).join('')}</div></div>
  ${sw('rollsOver', c.rollsOver, 'Rolls over', 'Shows as a reminder and never goes overdue.')}
  ${sw('notify', c.notify, 'Notify me', 'Starts working with the Android app (next build).')}
  ${sw('calendar', c.calendar, 'Show in calendar', 'Starts working with the Android app (next build).')}
  <details class="fold" ${c.months || c.seasonal ? 'open' : ''}><summary>Seasons</summary><div class="fld"><span>Active months</span><div class="pills wrap">${E.MONTHS.map((m, i) => chip('mon', i + 1, !c.months || c.months.includes(i + 1), m)).join('')}</div></div>${sw('hasSeasonal', !!c.seasonal, 'Change with the season')}${c.seasonal ? seasons.map(s => { const r = c.seasonal[s.id] || {}; return `<div class="row in"><b class="grow">${esc(s.name)}</b><span>every</span><input type="number" min="1" inputmode="numeric" data-season="${esc(s.id)}" value="${r.days || ''}" placeholder="${R.days}" ${r.paused ? 'disabled' : ''} aria-label="${esc(s.name)} days"><label class="mini"><input type="checkbox" data-spause="${esc(s.id)}" ${r.paused ? 'checked' : ''}> Paused</label></div>`; }).join('') : ''}</details>
  <div class="fld"><span>Checklist steps</span>${(c.steps || []).map(s => `<div class="step"><input type="checkbox" data-stepdone="${s.id}" ${(c.stepsDone || []).includes(s.id) ? 'checked' : ''} aria-label="Done"><input data-step="${s.id}" value="${esc(s.text)}" aria-label="Step"><button class="x" data-unstep="${s.id}" aria-label="Remove step">${icon('x')}</button></div>`).join('')}<div class="row in"><input id="new-step" placeholder="Add a step"><button class="btn ghost" data-act="step">Add</button></div></div>
  <label class="fld"><span>Notes</span><textarea rows="2" data-f="notes">${esc(c.notes)}</textarea></label>
  ${draft ? `<button class="btn primary wide sticky" data-act="create">Add chore</button>` : `<div class="fld"><span>History</span><ul class="log">${hist.map(e => `<li><div><b>${e.kind === 'skip' ? 'Skipped' : 'Done'} by ${esc(D.person(e.by)?.name || e.byName)}</b><small>${esc(E.shortDate(e.day))}</small></div></li>`).join('') || '<li class="muted">No history yet.</li>'}</ul></div>
  <div class="row foot"><button class="btn ghost" data-act="preset">${icon('copy')} Save as preset</button><button class="btn ghost" data-act="pause">${icon(c.paused ? 'play' : 'pause')} ${c.paused ? 'Resume' : 'Pause'}</button><button class="btn ghost danger" data-act="delete">${icon('trash-2')} Delete</button></div>`}`;
}

function iconPicker(host, c, pick) {
  const draw = q => { $('.ic-grid', host).innerHTML = Object.keys(ICONS).filter(n => n.includes(q.toLowerCase())).map(n => `<button type="button" data-ic="${n}" aria-label="${n}" class="${c.icon === n ? 'on' : ''}">${icon(n)}</button>`).join(''); };
  host.innerHTML = `<div class="box"><label class="search">${icon('search')}<input placeholder="Search icons" aria-label="Search icons"></label><div class="ic-grid"></div><button class="btn ghost" data-ic="">Use the room's icon</button></div>`;
  draw(''); $('input', host).oninput = e => draw(e.target.value);
  host.onclick = e => { const b = e.target.closest('[data-ic]'); if (b) pick(b.dataset.ic || null); };
}

/** Opens the full form. With `draft`, nothing is saved until Add chore is tapped. */
export function openChore(id, draft = null) {
  const start = draft || D.chore(id); if (!start) return;
  // The card edits its own copy, so a slow sync can't undo what was just typed. Only changed fields are sent.
  const model = draft || JSON.parse(JSON.stringify(start));
  const body = openSheet('');
  body.classList.add('form');
  const draw = () => { const y = body.parentElement.scrollTop; body.innerHTML = formHtml(model, draft); body.parentElement.scrollTop = y; };
  const set = (fields, redraw = true) => { Object.assign(model, fields); if (!draft) D.patchChore(id, fields); if (redraw) draw(); };
  const setRepeat = o => set({ repeat: { ...model.repeat, ...o } });
  draw();

  body.addEventListener('change', e => {
    const t = e.target, d = t.dataset;
    if (d.f) set({ [d.f]: t.value }, false);
    else if (d.r) { const v = parseInt(t.value, 10); setRepeat({ [d.r]: Number.isFinite(v) && v > 0 ? v : (d.r === 'daysMax' ? null : model.repeat[d.r]) }); }
    else if (d.sw === 'hasAlt') set({ alt: t.checked ? { anchor: E.today(), offset: 0, labels: ['Week A', 'Week B'], format: '{title}: {label}' } : null });
    else if (d.sw === 'hasSeasonal') set({ seasonal: t.checked ? {} : null });
    else if (d.sw) set({ [d.sw]: t.checked }, false);
    else if (d.alt) { const a = { ...model.alt }; a[d.alt] = d.alt === 'labels' ? t.value.split('\n').map(x => x.trim()).filter(Boolean) : d.alt === 'offset' ? +t.value || 0 : t.value; set({ alt: a }, false); }
    else if (d.season) { const n = parseInt(t.value, 10); set({ seasonal: { ...model.seasonal, [d.season]: n > 0 ? { days: n } : {} } }, false); }
    else if (d.spause) set({ seasonal: { ...model.seasonal, [d.spause]: t.checked ? { paused: true } : {} } });
    else if (d.step) set({ steps: model.steps.map(s => s.id === d.step ? { ...s, text: t.value } : s) }, false);
    else if (d.stepdone) { const cur = new Set(model.stepsDone || []); t.checked ? cur.add(d.stepdone) : cur.delete(d.stepdone); set({ stepsDone: [...cur] }, false); }
    else if (t.id === 'f-due') { const v = E.parseDueInput(t.value, E.today()); if (v) set({ dueDate: v, snoozedUntil: null, completedAt: null }); else toast('Try +2d, +3w, +1m or 24/12'); }
  });
  body.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.who) {
      let w = (model.assignees || []).filter(a => a !== 'anyone');
      if (d.who === 'anyone') w = []; else w = w.includes(d.who) ? w.filter(a => a !== d.who) : [...w, d.who];
      set({ assignees: w.length ? w : ['anyone'] });
    } else if (d.rtype) setRepeat({ type: d.rtype });
    else if (d.days) setRepeat({ days: +d.days, daysMax: null });
    else if (d.wd) setRepeat({ weekday: +d.wd });
    else if (d.eff) set({ effort: +d.eff });
    else if (d.due) set(d.due === 'clear' ? { dueDate: null } : { dueDate: E.addDays(E.today(), +d.due), snoozedUntil: null, completedAt: null });
    else if (d.mon) { const m = +d.mon, cur = model.months ? [...model.months] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], next = cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m].sort((a, c) => a - c); set({ months: next.length === 12 ? null : next }); }
    else if (d.unstep) set({ steps: model.steps.filter(s => s.id !== d.unstep) });
    else if (d.unshift) { const s = { ...model.shifts }; delete s[d.unshift]; set({ shifts: s }); }
    else if (d.act) action(d.act);
  });
  function action(a) {
    if (a === 'icons') { const host = $('#f-icons', body); if (host.firstChild) host.innerHTML = ''; else iconPicker(host, model, ic => set({ icon: ic })); }
    else if (a === 'step') { const i = $('#new-step', body); if (i.value.trim()) set({ steps: [...(model.steps || []), { id: stepId(), text: i.value.trim() }] }); }
    else if (a === 'shift') { const f = $('#sh-from', body).value, t = $('#sh-to', body).value; if (f && t) set({ shifts: { ...model.shifts, [f]: t } }); }
    else if (a === 'create') { if (!model.title.trim()) return toast('Give it a name first'); D.addChore(model); closeSheet(); toast('Chore added'); }
    else if (a === 'done') { closeSheet(); undoToast('Done', D.markDone(id)); }
    else if (a === 'roll') { closeSheet(); D.tickRollover(id); }
    else if (a === 'skip') { closeSheet(); undoToast('Skipped this time', D.skipChore(id)); }
    else if (a === 'later') snoozeSheet(id);
    else if (a === 'doneby') pickFrom('Who did it?', S.people.map(p => ({ label: p.name, value: p })), p => { closeSheet(); undoToast(`Done by ${p.name}`, D.markDone(id, { id: p.id, name: p.name })); });
    else if (a === 'preset') { D.savePreset(model); toast('Saved as a preset'); }
    else if (a === 'pause') { set({ paused: !model.paused }); toast(model.paused ? 'Paused' : 'Resumed'); }
    else if (a === 'delete') confirmBox('Delete this chore?', 'It stays in Recently deleted for 30 days.', 'Delete', () => { closeSheet(); D.removeChores([id]); toast('Moved to Recently deleted', { label: 'Undo', run: () => D.restoreChore(id) }); });
  }
}

const presetToChore = p => ({ title: p.title, roomId: p.roomId, effort: p.effort || 15, icon: p.icon || null, steps: p.steps || [], rollsOver: !!p.rollsOver, repeat: { ...E.newChore().repeat, ...(p.repeat || {}) } });
export function openAdd() {
  const day = E.today(), roomId = (V.view === 'rooms' && V.currentRoom) || S.rooms.find(r => r.id === 'r-whole-house')?.id || S.rooms[0]?.id;
  const base = () => E.newChore({ roomId, assignees: [S.meId], dueDate: day, startDate: day });
  const b = openSheet(`<h2>Add a chore</h2><div class="row in"><input id="q-name" placeholder="What needs doing?" autocomplete="off" aria-label="Chore name"><button class="btn primary" id="q-add">Add</button></div><div id="q-sug" class="pick"></div><button class="btn ghost wide" id="q-more">More options</button>`);
  const name = $('#q-name', b); setTimeout(() => name.focus(), 60);
  const add = over => { const t = name.value.trim(); if (!t && !over) return; D.addChore({ ...base(), title: t, ...over }); closeSheet(); toast('Chore added'); };
  name.oninput = () => {
    const q = name.value.trim().toLowerCase();
    const hits = q.length < 2 ? [] : S.presets.filter(p => p.title.toLowerCase().includes(q)).slice(0, 5);
    $('#q-sug', b).innerHTML = hits.map(p => `<button class="pick-row" data-p="${esc(p.id)}">${icon(p.icon || D.room(p.roomId).icon)}<span>${esc(p.title)}<small>${esc(E.intervalText({ repeat: { ...E.newChore().repeat, ...p.repeat } }))} · ${esc(E.effortText(p.effort))}</small></span></button>`).join('');
  };
  name.onkeydown = e => { if (e.key === 'Enter') add(); };
  $('#q-add', b).onclick = () => add();
  $('#q-sug', b).onclick = e => { const r = e.target.closest('[data-p]'); if (!r) return; const p = S.presets.find(x => x.id === r.dataset.p), c = presetToChore(p); name.value = p.title; add({ ...c, dueDate: day }); };
  $('#q-more', b).onclick = () => { const draft = { ...base(), title: name.value.trim() }; closeSheet(); setTimeout(() => openChore(null, draft), 30); };
}

export function bulk(action, done) {
  const ids = [...V.selected];
  if (action === 'room') pickFrom('Move to room', S.rooms.map(r => ({ label: r.name, value: r.id, icon: r.icon, color: r.color })), v => { D.patchMany(ids, { roomId: v }); done(); });
  if (action === 'who') pickFrom('Assign to', [{ label: 'Anyone', value: 'anyone' }, ...S.people.map(p => ({ label: p.name, value: p.id }))], v => { D.patchMany(ids, { assignees: [v] }); done(); });
  if (action === 'delete') confirmBox(`Delete ${ids.length} chore${ids.length === 1 ? '' : 's'}?`, 'They stay in Recently deleted for 30 days.', 'Delete', () => { D.removeChores(ids); done(); toast('Moved to Recently deleted', { label: 'Undo', run: () => ids.forEach(D.restoreChore) }); });
}
