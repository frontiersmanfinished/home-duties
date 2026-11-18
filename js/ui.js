// Small shared helpers: escaping, icons, sheets, toasts, per-phone settings.
import { ICONS } from './icons.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.house}</svg>`;
export const initials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const local = {
  get(k, d) { try { const v = localStorage.getItem('hd.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hd.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export function applyFontSize(v = local.get('font', 100)) { document.documentElement.style.fontSize = `${16 * v / 100}px`; }

// ---- Sheets: layers that slide up. The Android back button closes the top one. ----
const stack = [];
export function openSheet(html, onClose) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.innerHTML = `<div class="sheet-bg" data-close></div><section class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sheet-body">${html}</div></section>`;
  document.body.append(el);
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  stack.push({ el, onClose }); history.pushState({ sheet: stack.length }, '');
  requestAnimationFrame(() => el.classList.add('open'));
  return $('.sheet-body', el);
}
export const closeSheet = () => { if (stack.length) history.back(); };
export const sheetOpen = () => stack.length > 0;
addEventListener('popstate', () => {
  const top = stack.pop(); if (!top) return;
  top.el.classList.remove('open'); top.onClose && top.onClose();
  setTimeout(() => top.el.remove(), reduced() ? 0 : 220);
});
export function confirmBox(title, text, yes, onYes, danger = true) {
  const b = openSheet(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="row end"><button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'coral' : 'primary'}" id="cf-yes">${esc(yes)}</button></div>`);
  $('#cf-yes', b).onclick = () => { closeSheet(); onYes(); };
}
export function pickFrom(title, options, onPick) {
  const b = openSheet(`<h2>${esc(title)}</h2><div class="pick">${options.map((o, i) => `<button class="pick-row" data-i="${i}">${o.icon ? `<span class="tile sm" style="--tile:${esc(o.color || '#B9D6C8')}">${icon(o.icon)}</span>` : ''}<span>${esc(o.label)}</span></button>`).join('')}</div>`);
  b.addEventListener('click', e => { const r = e.target.closest('.pick-row'); if (r) { closeSheet(); onPick(options[+r.dataset.i].value); } });
}

// ---- Toast with optional Undo ----
let toastTimer;
export function toast(msg, action, ms = 5000) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  t.classList.add('show');
  if (action) $('button', t).onclick = () => { t.classList.remove('show'); action.run(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
let audio;
export function softChime() {
  if (!local.get('sound', false)) return;
  try {
    audio = audio || new AudioContext();
    const now = audio.currentTime;
    [659, 880].forEach((f, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0, now + i * .09); g.gain.linearRampToValueAtTime(.06, now + i * .09 + .02); g.gain.exponentialRampToValueAtTime(.0001, now + i * .09 + .35); o.connect(g).connect(audio.destination); o.start(now + i * .09); o.stop(now + i * .09 + .4); });
  } catch { /* sound is optional */ }
}
