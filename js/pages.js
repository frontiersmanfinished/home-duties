// Settings, Tips, Recently deleted and Paused.
import * as E from './engine.js';
import * as D from './store.js';
import { S, ROOM_COLOURS } from './store.js';
import { $, esc, icon, closeSheet, openSheet, confirmBox, pickFrom, toast, local, applyFontSize } from './ui.js';
import { ICONS } from './icons.js';

const listRow = (col, it, label, extra = '') => `<div class="set-row"><input data-rename="${col}" data-id="${esc(it.id)}" value="${esc(label)}" aria-label="Name">${extra}<button class="x" data-del="${col}" data-id="${esc(it.id)}" aria-label="Remove ${esc(label)}">${icon('trash-2')}</button></div>`;
const addRow = (col, ph) => `<div class="row in"><input id="add-${col}" placeholder="${ph}"><button class="btn ghost" data-add="${col}">Add</button></div>`;

export function viewSettings() {
  const fs = local.get('font', 100), seasons = D.seasons();
  return `<h3 class="sec">Family</h3><div class="card">${S.people.map(p => listRow('people', p, p.name, p.uid ? '<small class="tag">signs in</small>' : '')).join('')}${addRow('people', 'Add a family member')}</div>
  <h3 class="sec">Rooms</h3><div class="card">${S.rooms.map(r => listRow('rooms', r, r.name, `<button class="swatch" style="--tile:${esc(r.color)}" data-roomstyle="${esc(r.id)}" aria-label="Colour and icon for ${esc(r.name)}">${icon(r.icon)}</button>`)).join('')}${addRow('rooms', 'Add a room')}</div>
  <h3 class="sec">Effort levels (minutes)</h3><div class="card"><div class="pills wrap">${D.efforts().map(m => `<button class="pill on" data-deleff="${m}" aria-label="Remove ${m} minutes">${m} ${icon('x')}</button>`).join('')}</div><div class="row in"><input id="add-eff" type="number" inputmode="numeric" min="1" placeholder="Minutes"><button class="btn ghost" data-add="eff">Add</button></div></div>
  <h3 class="sec">Seasons</h3><div class="card">${seasons.map(s => `<div class="fld"><span>${esc(s.name)}</span><div class="pills wrap">${E.MONTHS.map((m, i) => `<button class="pill${s.months.includes(i + 1) ? ' on' : ''}" data-smon="${esc(s.id)}" data-m="${i + 1}">${m}</button>`).join('')}</div></div>`).join('')}</div>
  <h3 class="sec">Preset chores (${S.presets.length})</h3><details class="card fold"><summary>Show presets</summary>${S.presets.map(p => listRow('presets', p, p.title)).join('')}${addRow('presets', 'Add a preset')}</details>
  <h3 class="sec">This phone</h3><div class="card"><label class="fld"><span>Text size: <b id="fs-v">${fs}%</b></span><input type="range" id="font" min="85" max="130" step="5" value="${fs}"></label><label class="sw-row"><span>Soft sound on Done</span><input type="checkbox" role="switch" id="sound" ${local.get('sound', false) ? 'checked' : ''}><i></i></label></div>
  <h3 class="sec">Your data</h3><div class="card stack"><button class="btn ghost wide" data-go="import">${icon('upload')} Import chores</button><button class="btn ghost wide" id="export">${icon('download')} Back up to a file</button><button class="btn ghost wide" data-go="deleted">${icon('trash')} Recently deleted</button><button class="btn ghost wide" data-go="paused">${icon('pause')} Paused chores</button><button class="btn ghost wide" id="signout">${icon('log-out')} Sign out (${esc(S.user?.email)})</button></div>`;
}

export function wireSettings(root, rerender) {
  root.onchange = e => {
    const t = e.target, d = t.dataset;
    if (d.rename) { const v = t.value.trim(); if (v) D.saveItem(d.rename, d.id, d.rename === 'presets' ? { title: v } : { name: v }); }
    if (t.id === 'sound') local.set('sound', t.checked);
  };
  root.oninput = e => { if (e.target.id === 'font') { const v = +e.target.value; local.set('font', v); applyFontSize(v); $('#fs-v').textContent = v + '%'; } };
  root.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.add === 'eff') { const v = parseInt($('#add-eff').value, 10); if (v > 0) D.patchConfig({ efforts: [...new Set([...D.efforts(), v])].sort((x, y) => x - y) }); }
    else if (d.add) {
      const i = $(`#add-${d.add}`), v = i.value.trim(); if (!v) return;
      if (d.add === 'people') D.saveItem('people', null, { name: v });
      if (d.add === 'rooms') D.saveItem('rooms', `r-${E.slug(v)}`, { name: v, icon: 'house', color: ROOM_COLOURS[S.rooms.length % ROOM_COLOURS.length], order: S.rooms.length });
      if (d.add === 'presets') D.saveItem('presets', null, { title: v, roomId: S.rooms[0]?.id, effort: 15, repeat: E.newChore().repeat, icon: null, steps: [], rollsOver: false });
      i.value = '';
    } else if (d.deleff) D.patchConfig({ efforts: D.efforts().filter(m => m !== +d.deleff) });
    else if (d.smon) {
      const m = +d.m, list = D.seasons().map(s => ({ ...s, months: s.id === d.smon ? (s.months.includes(m) ? s.months.filter(x => x !== m) : [...s.months, m].sort((x, y) => x - y)) : s.months.filter(x => x !== m) }));
      D.patchConfig({ seasons: list });
    } else if (d.del === 'people') {
      const p = D.person(d.id);
      if (p.uid) return toast('This person signs in, so they stay on the list');
      pickFrom(`Who takes over ${p.name}'s chores?`, [{ label: 'Anyone', value: 'anyone' }, ...S.people.filter(x => x.id !== p.id).map(x => ({ label: x.name, value: x.id }))], v => D.removePerson(p.id, v));
    } else if (d.del === 'rooms') {
      const r = S.rooms.find(x => x.id === d.id), others = S.rooms.filter(x => x.id !== d.id);
      if (!others.length) return toast('Keep at least one room');
      pickFrom(`Move ${r.name} chores to`, others.map(x => ({ label: x.name, value: x.id, icon: x.icon, color: x.color })), v => D.removeRoom(r.id, v));
    } else if (d.del) D.deleteItem(d.del, d.id);
    else if (d.roomstyle) roomStyle(d.roomstyle);
    else if (b.id === 'export') exportFile();
    else if (b.id === 'signout') confirmBox('Sign out?', 'Your chores stay safe in the household list.', 'Sign out', () => D.signOut(), false);
    void rerender;
  };
}
function roomStyle(id) {
  const r = S.rooms.find(x => x.id === id);
  const b = openSheet(`<h2>${esc(r.name)}</h2><div class="fld"><span>Colour</span><div class="row">${ROOM_COLOURS.map(c => `<button class="swatch" style="--tile:${c}" data-c="${c}" aria-label="Colour ${c}">${c === r.color ? icon('check') : ''}</button>`).join('')}</div></div><div class="fld"><span>Icon</span><div class="ic-grid">${Object.keys(ICONS).map(n => `<button data-ic="${n}" aria-label="${n}" class="${n === r.icon ? 'on' : ''}">${icon(n)}</button>`).join('')}</div></div>`);
  b.onclick = e => { const t = e.target.closest('button'); if (!t) return; if (t.dataset.c) D.saveItem('rooms', id, { color: t.dataset.c }); if (t.dataset.ic) D.saveItem('rooms', id, { icon: t.dataset.ic }); if (t.dataset.c || t.dataset.ic) closeSheet(); };
}
async function exportFile() {
  toast('Preparing backup…');
  try {
    const data = await D.backupData(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `home-duties-backup-${E.today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Backup saved to Downloads');
  } catch { toast('Backup needs a connection. Try again when online.'); }
}

export function openImport() {
  const b = openSheet(`<h2>Import chores</h2><p class="muted">Choose your starter or backup file, or paste a list or table. You'll see a preview first.</p><label class="btn ghost wide file">${icon('upload')} Choose a file<input type="file" id="imp-file" accept=".json,.csv,.txt,text/*,application/json" hidden></label><textarea id="imp-text" rows="5" placeholder="Paste here: one chore per line, or a table with a header row" aria-label="Paste chores"></textarea><button class="btn primary wide" id="imp-go">Preview</button><div id="imp-out"></div>`);
  let plan = null;
  const preview = text => {
    plan = D.previewImport(text); const out = $('#imp-out', b);
    if (plan.error) { out.innerHTML = `<p class="late-t">${esc(plan.error)}</p>`; return; }
    const fresh = plan.items.filter(i => i.isNew).length, have = plan.items.length - fresh;
    out.innerHTML = plan.kind === 'backup'
      ? `<h3 class="sec">Backup: ${plan.items.length} chores</h3><p class="muted">Restoring replaces matching records with the copies in this file.</p><button class="btn coral wide" id="imp-yes">Restore backup</button>`
      : `<h3 class="sec">${fresh} new${have ? `, ${have} already on your list` : ''}</h3><div class="tbl-wrap prev"><table class="tbl"><thead><tr><th>Chore</th><th>Room</th><th>Repeat</th><th>Status</th></tr></thead><tbody>${plan.items.map(i => `<tr><th scope="row">${esc(i.title)}</th><td>${esc(i.room || '–')}</td><td>${esc(E.intervalText(i.chore))}</td><td>${i.isNew ? 'New' : 'Skipped'}</td></tr>`).join('')}</tbody></table></div><button class="btn primary wide" id="imp-yes" ${fresh ? '' : 'disabled'}>Add ${fresh} chore${fresh === 1 ? '' : 's'}</button>`;
    $('#imp-yes', b).onclick = () => { const n = D.applyImport(plan); closeSheet(); toast(plan.kind === 'backup' ? 'Backup restored' : `${n} chores added`); };
    out.scrollIntoView({ behavior: 'smooth' });
  };
  $('#imp-go', b).onclick = () => preview($('#imp-text', b).value);
  $('#imp-file', b).onchange = async e => { const f = e.target.files[0]; if (f) preview(await f.text()); };
}

export function viewDeleted() {
  const list = S.chores.filter(c => c.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  return `<p class="muted pad">Deleted chores are kept for 30 days.</p>${list.map(c => `<div class="card item"><div class="txt"><b>${esc(c.title)}</b><small>${Math.max(0, 30 - Math.floor((Date.now() - c.deletedAt) / E.DAY_MS))} days left</small></div><button class="btn ghost" data-restore="${esc(c.id)}">Restore</button></div>`).join('') || '<p class="muted pad">Nothing here.</p>'}`;
}
export function viewPaused() {
  const list = D.liveChores().filter(c => c.paused);
  return `<p class="muted pad">Paused chores are hidden but keep their history.</p>${list.map(c => `<div class="card item"><div class="txt"><b>${esc(c.title)}</b><small>${esc(D.room(c.roomId).name)}</small></div><button class="btn ghost" data-resume="${esc(c.id)}">Resume</button></div>`).join('') || '<p class="muted pad">Nothing is paused.</p>'}`;
}

const TIPS = [
  ['Today', 'One big "Do this next" card, then anything overdue, due today and quick wins. Tap the round tick to finish a chore. You get 5 seconds to undo. The pills choose whose chores you see: "Mine + Anyone" is the default. "I\'ve got 10 minutes" shows only short jobs.'],
  ['Overdue', 'Nothing hides. Overdue chores stay on Today and deepen in colour the later they get.'],
  ['Every day chores', 'Chores that roll over sit quietly at the bottom of Today. Ticking is optional. If you leave one, it just comes back tomorrow, never goes overdue and doesn\'t touch your streak.'],
  ['As needed', 'For jobs with no schedule. They sit in the As needed list on Today, showing how long since each was last done, and are never overdue. Tap the tick when you do one. Turn on a gentle nudge to bring one to the top after a set number of days.'],
  ['Skipping', 'Not needed today? Open the chore and tap Skip. It keeps the last time it was really done and moves on to the next one, without breaking your streak.'],
  ['Swipes and selecting', 'Swipe a chore right for Done, left for snooze or skip. Press and hold to select several, then move, reassign or delete them together.'],
  ['Rooms', 'Chores by room. The bar fills as a chore gets closer to due: green, then amber, then coral.'],
  ['All', 'Every chore in one flat table. Tap a column heading to sort, or search at the top. Slide sideways to see more columns.'],
  ['Week', 'Tap a day to see what lands on it. Below that are the bigger jobs coming in the next 3 months.'],
  ['Progress', 'Your streak, this week by person, the last 8 weeks and the full history. Skips keep a streak alive but don\'t add to it.'],
  ['Adding a chore', 'Tap +, type a name and tap Add. Typing suggests presets. "More options" opens everything else. In Rooms, a new chore goes in the room you last opened.'],
  ['Repeats', '"After last done" counts from when it was really done. "Fixed day" sticks to a weekday, like bin night. Fixed chores roll forward if missed, unless you turn that off. "As needed" has no due date at all (see below).'],
  ['Due dates', 'Use the quick buttons or type +2d, +3w, +1m, or a date like 24/12.'],
  ['Seasons', 'In a chore\'s Seasons section, choose active months or a different interval for each season. Season months are in Settings.'],
  ['Alternating chores', 'A fixed chore can alternate details, like which bins go out, and can move for one-off dates.'],
  ['Pause and delete', 'Pause hides a chore and keeps its history. Deleted chores can be restored for 30 days from Settings.'],
  ['Offline', 'Everything works without signal once the app has opened online. A small cloud icon shows changes are waiting, and they sync by themselves.'],
  ['Sharing', 'Both phones see the same list within seconds. If you both tick the same chore, both ticks are kept.'],
  ['Settings', 'Edit family, rooms, effort levels, seasons and presets. Text size and sound belong to each phone. Back up to a file any time.'],
  ['Long-press the app icon', 'Hold the Home Duties icon for shortcuts to Today and Add chore.'],
  ['Coming next', 'The Android app adds the home-screen widget, chosen notifications and Google Calendar sync. "Notify me" and "Show in calendar" are saved now and start working then.'],
];
export const viewTips = () => TIPS.map(([h, t]) => `<details class="card fold"><summary>${esc(h)}</summary><p>${esc(t)}</p></details>`).join('');
