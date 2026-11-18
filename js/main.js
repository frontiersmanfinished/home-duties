import * as E from './engine.js';
import * as D from './store.js';
import { S } from './store.js';
import { connect } from './backend.js';
import { $, $$, esc, icon, toast, applyFontSize, reduced, softChime, sheetOpen, closeSheet, openSheet } from './ui.js';
import { V, viewToday, viewRooms, viewAll, allRows, viewWeek, viewProgress, todayModel, ring } from './views.js';
import { openChore, openAdd, snoozeSheet, bulk } from './sheets.js';
import { viewSettings, wireSettings, viewTips, viewDeleted, viewPaused, openImport } from './pages.js';

const root = $('#root');
const TABS = [['today', 'Today', 'house'], ['rooms', 'Rooms', 'layout-grid'], ['all', 'All', 'list'], ['week', 'Week', 'calendar'], ['progress', 'Progress', 'chart-column']];
const TITLES = { today: 'Today', rooms: 'Rooms', all: 'All chores', week: 'Week', progress: 'Progress', settings: 'Settings', tips: 'Tips', deleted: 'Recently deleted', paused: 'Paused chores' };
const WAVE = '<svg class="wave" viewBox="0 0 400 44" preserveAspectRatio="none" aria-hidden="true"><path d="M0 26 C 80 2, 150 8, 230 26 S 350 42, 400 14 V44 H0Z"/></svg>';
let shell = false, dirty = false, lastDay = E.today();

function gate(title, text, btn = '') {
  shell = false;
  root.innerHTML = `<main class="gate"><span class="logo">${icon('house')}</span><h1>${esc(title)}</h1><p>${esc(text)}</p>${btn}</main>`;
}
function drawShell() {
  shell = true;
  root.innerHTML = `<header class="top" id="top"></header><main id="view"></main><button class="fab" id="fab" aria-label="Add chore">${icon('plus')}</button><nav class="nav" id="nav" aria-label="Main">${TABS.map(([v, l, i]) => `<button data-tab="${v}">${icon(i)}<span>${l}</span></button>`).join('')}</nav><div class="selbar" id="selbar"></div>`;
}
export function render() {
  if (S.phase === 'signin') return gate('Home Duties', 'Sign in with your Google account to see the household list.', `<button class="btn primary big" id="signin">Sign in with Google</button><p class="err" id="err"></p>`);
  if (S.phase === 'denied') return gate('Not on the list', `${S.user?.email || 'This account'} isn't allowed to open this household.`, '<button class="btn ghost" id="signout2">Use another account</button>');
  if (S.phase === 'loading') return gate('Home Duties', 'Loading your list…');
  if (S.phase === 'nosdk') return gate('Needs a connection', 'Home Duties has to be online the first time it opens.', '<button class="btn primary" onclick="location.reload()">Try again</button>');
  if (!shell) drawShell();
  const day = lastDay = E.today(), view = $('#view'), active = document.activeElement;
  const main = TABS.some(t => t[0] === V.view);
  const today = V.view === 'today' ? todayModel(day) : null, offline = !S.online || S.pending;
  $('#top').innerHTML = `<div class="top-in"><div><div class="brand">${main ? icon('house') : `<button class="back" data-tab="today" aria-label="Back">${icon('chevron-left')}</button>`}<span>Home Duties</span>${offline ? `<span class="sync" title="${S.online ? 'Syncing' : 'Offline. Changes will sync later.'}">${icon('cloud-off')}<em>${S.online ? 'Syncing' : 'Offline'}</em></span>` : ''}</div><h1>${esc(TITLES[V.view])}</h1></div>${today && today.total ? ring(today.done, today.total) : ''}<button class="menu" id="menu" aria-label="Menu">${icon('ellipsis-vertical')}</button></div>${WAVE}`;
  $$('#nav button').forEach(b => { const on = b.dataset.tab === V.view; b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  const selecting = V.selected.size > 0;
  root.classList.toggle('selecting', selecting);
  $('#selbar').innerHTML = selecting ? `<b>${V.selected.size} selected</b><button data-bulk="room">Move</button><button data-bulk="who">Assign</button><button data-bulk="delete">Delete</button><button data-bulk="cancel" aria-label="Cancel">${icon('x')}</button>` : '';
  $('#fab').hidden = !main;
  if (active && view.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName) && active.type !== 'range' && active.type !== 'checkbox') {
    dirty = true;
    if (active.id === 'all-q') { const t = $('.tbl', view); t.tBodies[0].outerHTML = allRows(day); }
    return;
  }
  dirty = false;
  const html = { today: viewToday, rooms: viewRooms, all: viewAll, week: viewWeek, progress: viewProgress, settings: viewSettings, tips: viewTips, deleted: viewDeleted, paused: viewPaused }[V.view](day);
  const tblX = $('.tbl-wrap', view)?.scrollLeft, pX = $('.pills', view)?.scrollLeft, sX = $('.strip', view)?.scrollLeft;
  view.innerHTML = html; view.className = `v-${V.view}`;
  const keep = (sel, x) => { const el = $(sel, view); if (el && x) el.scrollLeft = x; };
  keep('.tbl-wrap', tblX); keep('.pills', pX); keep('.strip', sX);
  if (V.view === 'settings') wireSettings(view, render); else { view.onchange = view.oninput = null; view.onclick = null; }
  if (S.error) { toast(S.error); S.error = null; }
}
const go = v => { V.view = v; V.selected.clear(); render(); scrollTo(0, 0); };
function special(what) { if (what === 'import') openImport(); else go(what); }

function menu() {
  const b = openSheet(`<h2>Menu</h2><div class="pick"><button class="pick-row" data-m="settings">${icon('settings')}<span>Settings</span></button><button class="pick-row" data-m="tips">${icon('circle-help')}<span>Tips</span></button><button class="pick-row" data-m="deleted">${icon('trash')}<span>Recently deleted</span></button><button class="pick-row" data-m="paused">${icon('pause')}<span>Paused chores</span></button></div>`);
  b.onclick = e => { const r = e.target.closest('[data-m]'); if (r) { closeSheet(); go(r.dataset.m); } };
}

// ---- Finishing a chore ----
const busy = new Set();
function celebrate(card) {
  softChime(); navigator.vibrate?.(12);
  if (reduced() || !card) return;
  const r = card.getBoundingClientRect(), box = document.createElement('div'); box.className = 'spark'; box.style.cssText = `left:${r.right - 44}px;top:${r.top + r.height / 2}px`;
  box.innerHTML = '<i></i>'.repeat(8); document.body.append(box); setTimeout(() => box.remove(), 700);
}
function finish(id, card) {
  if (busy.has(id)) return; busy.add(id);
  card?.classList.add('doing'); celebrate(card);
  setTimeout(() => {
    busy.delete(id); const before = todayModel();
    const undo = D.markDone(id), after = todayModel();
    const c = D.chore(id);
    toast(before.next && !after.next ? 'All clear. Lovely work!' : `${E.pastVerb(c.title)}!`, { label: 'Undo', run: undo });
  }, reduced() ? 0 : 340);
}

// ---- Taps ----
root.addEventListener('click', async e => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
  const t = e.target, b = t.closest('button'), d = b?.dataset || {};
  if (t.closest('#signin')) { try { await D.signIn(); } catch (x) { if ($('#err') && x.code !== 'auth/popup-closed-by-user') $('#err').textContent = 'Sign-in didn\'t finish. Please try again.'; } return; }
  if (t.closest('#signout2')) return D.signOut();
  if (t.closest('#fab')) return openAdd();
  if (t.closest('#menu')) return menu();
  if (d.tab) return go(d.tab);
  if (d.go) return special(d.go);
  if (d.bulk) { if (d.bulk === 'cancel') { V.selected.clear(); return render(); } return bulk(d.bulk, () => { V.selected.clear(); render(); }); }
  if (V.view === 'settings') return;
  if (d.filter) { V.filter = d.filter; return render(); }
  if (d.quick !== undefined) { V.quick = !V.quick; return render(); }
  if (d.room) { const r = d.room; V.openRooms.has(r) ? V.openRooms.delete(r) : V.openRooms.add(r); V.currentRoom = r; return render(); }
  if (d.sort) { V.sort = { key: d.sort, dir: V.sort.key === d.sort ? -V.sort.dir : 1 }; return render(); }
  if (d.day) { V.weekDay = d.day; return render(); }
  if (d.week) { V.trendPick = d.week; return render(); }
  if (d.moreLog !== undefined) { V.logShown += 40; if (V.logShown > D.allLog().length) { const n = await D.loadOlder().catch(() => -1); if (n === 0) toast('That\'s everything'); if (n < 0) toast('Older history needs a connection'); } return render(); }
  if (d.restore) { D.restoreChore(d.restore); return toast('Restored'); }
  if (d.resume) { D.patchChore(d.resume, { paused: false }); return toast('Resumed'); }
  const tr = t.closest('tr[data-id]'); if (tr) return openChore(tr.dataset.id);
  const card = t.closest('.chore'); if (!card) return;
  const id = card.dataset.id;
  if (V.selected.size) { toggleSel(id); return; }
  if (d.done !== undefined) return finish(id, card);
  if (d.roll !== undefined) { const undo = D.tickRollover(id); softChime(); if (undo) toast('Ticked for today', { label: 'Undo', run: undo }); return; }
  openChore(id);
});
root.addEventListener('input', e => { if (e.target.id === 'all-q') { V.search = e.target.value; $('.tbl').tBodies[0].outerHTML = allRows(E.today()); } });
root.addEventListener('focusout', () => setTimeout(() => { if (dirty) render(); }, 50));
function toggleSel(id) { V.selected.has(id) ? V.selected.delete(id) : V.selected.add(id); render(); }

// ---- Swipe and long-press ----
let suppressClick = false, g = null;
root.addEventListener('pointerdown', e => {
  const card = e.target.closest('.chore'); if (!card || e.button) return;
  g = { card, inner: $('.chore-in', card), id: card.dataset.id, x: e.clientX, y: e.clientY, dx: 0, mode: null, onTick: !!e.target.closest('.tick') };
  g.timer = setTimeout(() => { if (g && !g.mode && !g.onTick) { g.mode = 'hold'; navigator.vibrate?.(15); suppressClick = true; toggleSel(g.id); } }, 480);
});
addEventListener('pointermove', e => {
  if (!g || g.mode === 'hold') return;
  const dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (!g.mode) {
    if (Math.abs(dy) > 10) { clearTimeout(g.timer); g = null; return; }
    if (Math.abs(dx) > 12 && !V.selected.size) { g.mode = 'swipe'; clearTimeout(g.timer); g.card.classList.add('swiping'); }
  }
  if (g.mode === 'swipe') { g.dx = dx; g.inner.style.transform = `translateX(${dx}px)`; g.card.classList.toggle('to-done', dx > 0); g.card.classList.toggle('to-later', dx < 0); }
}, { passive: true });
function endGesture() {
  if (!g) return; clearTimeout(g.timer); const h = g; g = null;
  if (h.mode === 'hold') { setTimeout(() => { suppressClick = false; }, 60); return; }
  if (h.mode !== 'swipe') return;
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
  h.card.classList.remove('swiping'); h.inner.style.transform = '';
  const st = E.stateOf(D.chore(h.id), E.today(), D.seasons());
  if (h.dx > 90) { if (st.status === 'rollover') D.tickRollover(h.id); else finish(h.id, h.card); }
  else if (h.dx < -90 && st.status !== 'rollover') snoozeSheet(h.id);
}
addEventListener('pointerup', endGesture); addEventListener('pointercancel', endGesture);
root.addEventListener('contextmenu', e => { if (e.target.closest('.chore')) e.preventDefault(); });

// ---- Start ----
function applyLink() {
  const q = new URLSearchParams(location.search), v = q.get('view');
  if (v && TITLES[v]) V.view = v;
  if (q.get('add')) V.wantAdd = true;
  if (q.toString()) history.replaceState(null, '', location.pathname);
}
D.onChange(() => { render(); if (S.phase === 'app' && V.wantAdd && !sheetOpen()) { V.wantAdd = false; openAdd(); } });
setInterval(() => { if (E.today() !== lastDay) render(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && E.today() !== lastDay) render(); });
applyFontSize(); applyLink(); render();
connect().then(D.start).catch(e => { console.error(e); S.phase = 'nosdk'; render(); });

if ('serviceWorker' in navigator && !location.search.includes('nosw')) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Home Duties has updated', { label: 'Refresh', run: () => location.reload() }, 15000); });
}
