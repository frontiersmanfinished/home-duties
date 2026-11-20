// Browser test at phone size: two simulated phones sharing one stand-in database.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require(process.env.PW_PATH || '/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const fake = require('./fake-firebase.cjs');
const ROOT = path.join(__dirname, '..'), SHOTS = process.env.SHOTS || '/tmp/shots', STARTER = process.env.STARTER;
fs.mkdirSync(SHOTS, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURI(q.url.split('?')[0]).replace(/^\/home-duties\//, '/'); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(r); });
const URL_ = 'http://localhost:4173/home-duties/', ALLOWED = ['alex@test.example', 'sam@test.example'];
let db = {}; const pages = new Set();
const results = []; const errors = [];
async function check(name, fn) { try { await fn(); results.push(['ok', name]); console.log('  ok  ', name); } catch (e) { results.push(['FAIL', name]); console.log('  FAIL', name, '\n      ', String(e.message).split('\n').slice(0, 3).join(' ')); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function applyOps(ops) { for (const o of ops) { if (o.type === 'delete') delete db[o.path]; else if (o.type === 'set') db[o.path] = o.merge ? { ...(db[o.path] || {}), ...o.data } : o.data; else if (db[o.path]) db[o.path] = { ...db[o.path], ...o.data }; } }
const push = () => { for (const p of pages) p.evaluate(a => window.__fromServer && window.__fromServer(a), db).catch(() => {}); };
async function phone(browser, name, email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 870 }, deviceScaleFactor: 2, hasTouch: false, timezoneId: 'Australia/Adelaide', locale: 'en-AU', colorScheme: opts.dark ? 'dark' : 'light', serviceWorkers: opts.sw ? 'allow' : 'block', reducedMotion: 'reduce', acceptDownloads: true });
  const user = { uid: 'uid-' + name.toLowerCase(), displayName: `${name} Tester`, email };
  await ctx.exposeBinding('__server', (src, action, payload) => {
    if (action === 'hello') return ALLOWED.includes(payload) ? 'ok' : 'denied';
    if (!ALLOWED.includes(email)) return 'denied';
    if (action === 'all') return db;
    if (action === 'commit') { applyOps(payload); setTimeout(push, 20); return 'ok'; }
  });
  await ctx.addInitScript(u => { window.__TEST_USER = u; window.__TEST_USER_EMAIL = () => u.email; }, user);
  for (const n of ['app', 'auth', 'firestore']) await ctx.route(`https://www.gstatic.com/firebasejs/**/firebase-${n}.js`, r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fake[n] }));
  await ctx.clock.setFixedTime(new Date(opts.at || '2026-11-19T09:30:00+10:30'));
  ctx.setDefaultTimeout(6000); const page = await ctx.newPage(); pages.add(page);
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource|permission-denied|code: /.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { ctx, page, name };
}
const signIn = async p => { await p.page.goto(URL_); await p.page.click('#signin'); await p.page.waitForSelector('#nav'); };
const setDay = async (p, iso, time = '09:30') => { await p.ctx.clock.setFixedTime(new Date(`${iso}T${time}:00+10:30`)); };
const tab = (p, t) => p.page.click(`#nav [data-tab=${t}]`);
const rerender = async p => { await tab(p, 'rooms'); await tab(p, 'today'); };
const docs = pre => Object.entries(db).filter(([k]) => k.startsWith(`households/home/${pre}/`)).map(([k, v]) => ({ id: k.split('/').pop(), ...v }));
const choreBy = t => docs('chores').find(c => c.title === t);
const until = async (fn, ms = 4000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out: ' + fn); await sleep(40); } };
const noOverflow = p => p.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = (p, n, full) => p.page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: !!full });
const cardFor = (p, title) => p.page.locator('.chore', { hasText: title }).first();

(async () => {
  await new Promise(r => srv.listen(4173, r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  process.on('exit',()=>errors.length&&console.log('ERRS',errors.slice(0,5)));
  const A = await phone(browser, 'Alex', 'alex@test.example'), B = await phone(browser, 'Sam', 'sam@test.example');

  console.log('Sign-in and access');
  await check('sign-in screen shows first', async () => { await A.page.goto(URL_); await A.page.waitForSelector('#signin'); await shot(A, '01-signin'); });
  await check('account not on the list is refused', async () => { const C = await phone(browser, 'Other', 'other@test.example'); await C.page.goto(URL_); await C.page.click('#signin'); await C.page.waitForSelector('text=Not on the list'); await C.ctx.close(); pages.forEach(p => p.isClosed() && pages.delete(p)); });
  await signIn(A);
  await check('first run offers the starting list', () => A.page.waitForSelector('text=Load starting list'));
  await check('default rooms are created', () => until(() => docs('rooms').length === 11));

  console.log('Import');
  const text = STARTER ? fs.readFileSync(STARTER, 'utf8') : 'Chore,Area,IntervalDays,EstMinutes,RollsOver\nFeed pets,Pets,1,5,Yes\nClean toilets,Bathroom,7,10,No';
  const expected = STARTER ? 89 : 2;
  await check(`preview shows ${expected} new chores before adding`, async () => { await A.page.click('[data-go=import]'); await A.page.setInputFiles('#imp-file', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(text) }); await A.page.waitForSelector(`text=${expected} new`); assert.equal(docs('chores').length, 0); await shot(A, '02-import'); });
  await check('adding saves them all', async () => { await A.page.click('#imp-yes'); await until(() => docs('chores').length === expected); });
  await check('re-importing adds nothing', async () => { await sleep(100); await A.page.click('#nav [data-tab=progress]').catch(() => {}); await tab(A, 'today'); const before = docs('chores').length; await A.page.click('#menu'); await A.page.click('[data-m=settings]'); await A.page.click('[data-go=import]'); await A.page.fill('#imp-text', text); await A.page.click('#imp-go'); await A.page.waitForSelector(`text=0 new`); assert(await A.page.isDisabled('#imp-yes')); await A.page.goBack(); assert.equal(docs('chores').length, before); await tab(A, 'today'); });
  if (STARTER) {
    await check('day one: nothing overdue, 6 daily chores roll over', async () => { assert.equal(await A.page.locator('.late').count(), 0); assert.equal(await A.page.locator('[data-roll]').count(), 6); assert.equal(docs('chores').filter(c => c.rollsOver).length, 6); });
    await check('weekly chores spread across days 5 to 9', () => { const n = docs('chores').filter(c => c.repeat.type === 'since' && c.repeat.days === 7 && c.dueDate && !c.seasonal).map(c => Math.round((Date.parse(c.dueDate) - Date.parse('2026-11-19')) / 864e5)); assert.equal(Math.min(...n), 5); assert.equal(Math.max(...n), 9); });
    await check('brief overrides: bins, seasons, BBQ restart', () => { assert.equal(choreBy('Put bins out').repeat.type, 'fixed'); assert.equal(choreBy('Put bins out').notify, true); assert.equal(choreBy('Mow lawns').seasonal.growing.days, 7); assert.equal(choreBy('Mow lawns').seasonal.winter.days, 14); assert(choreBy('Clean BBQ').seasonal.winter.paused); assert(choreBy('Spring BBQ restart')); });
  }

  console.log('Two phones');
  await signIn(B);
  await check('second phone sees the same list', () => until(async () => (await B.page.evaluate(() => document.body.innerText)).includes('Do this next') || (await B.page.locator('.chore').count()) > 0));
  await check('each Google account becomes a family member', () => until(() => docs('people').map(p => p.name).sort().join() === 'Alex,Sam'));
  await setDay(A, '2026-11-27'); await setDay(B, '2026-11-27'); await rerender(A); await rerender(B);
  await check('overdue chores appear on Today with a Do this next card', async () => { await A.page.waitForSelector('.next'); assert((await A.page.locator('.late').count()) > 0); await shot(A, '03-today'); await shot(A, '03-today-full', true); });
  await check('+ button never covers the last card', async () => { await A.page.evaluate(() => scrollTo(0, 1e6)); const r = await A.page.evaluate(() => { const c = [...document.querySelectorAll('#view .card, #view .chore')].at(-1).getBoundingClientRect(), f = document.querySelector('#fab').getBoundingClientRect(); return c.bottom <= f.top + 1; }); assert(r); await A.page.evaluate(() => scrollTo(0, 0)); });
  let t1;
  await check('one tap Done records who and when, with Undo', async () => { const c = A.page.locator('.chore.next'); t1 = (await c.locator('.txt b').innerText()).trim(); const n = docs('completions').length; await c.locator('.tick').click(); await until(() => docs('completions').length === n + 1); const e = docs('completions').find(x => x.title === t1); assert.equal(e.byName, 'Alex'); assert(e.at); await A.page.waitForSelector('#toast.show >> text=Undo'); });
  await check('the other phone sees it within seconds', async () => { await until(async () => !(await B.page.locator('.chore.next .txt b').innerText()).includes(t1)); });
  await check('Undo removes the entry on both phones', async () => { const n = docs('completions').length; await A.page.click('#toast button'); await until(() => docs('completions').length === n - 1); await until(async () => (await B.page.locator('.chore.next .txt b').innerText()).includes(t1)); });
  await check('same chore ticked on both phones offline keeps both ticks', async () => {
    const n = docs('completions').length, id = await A.page.locator('.chore.next').getAttribute('data-id');
    await A.page.evaluate(() => window.__setOnline(false)); await B.page.evaluate(() => window.__setOnline(false));
    for (const p of [A, B]) await p.page.locator(`.chore[data-id="${id}"] .tick`).click();
    await A.page.waitForSelector('.sync'); await sleep(100); assert.equal(docs('completions').length, n);
    await A.page.evaluate(() => window.__setOnline(true)); await B.page.evaluate(() => window.__setOnline(true));
    await until(() => docs('completions').filter(c => c.choreId === id).length === 2); await until(async () => !(await A.page.locator('.sync').count()));
  });
  await check('offline tick survives closing the app, then syncs', async () => {
    const n = docs('completions').length; await A.page.evaluate(() => window.__setOnline(false)); await A.page.addInitScript(() => { window.__startOffline = sessionStorage.getItem('off') === '1'; });
    await A.page.evaluate(() => sessionStorage.setItem('off', '1')); const title = (await A.page.locator('.chore.next .txt b').innerText()).trim(); await A.page.locator('.chore.next .tick').click(); await sleep(100);
    await A.page.reload(); await A.page.waitForSelector('#nav'); await until(async () => (await A.page.locator('.chore.next .txt b').innerText()) !== title); assert.equal(docs('completions').length, n);
    await A.page.evaluate(() => { sessionStorage.removeItem('off'); return window.__setOnline(true); }); await until(() => docs('completions').length === n + 1);
  });
  await check('edits to different fields on two phones both survive', async () => {
    const id = docs('chores')[5].id, c = docs('chores')[5]; await A.page.evaluate(() => window.__setOnline(false)); await B.page.evaluate(() => window.__setOnline(false));
    for (const [p, f] of [[A, 'notes'], [B, 'title']]) { await tab(p, 'all'); await p.page.locator(`tr[data-id="${id}"]`).click(); await p.page.fill(`.sheet [data-f=${f}]`, `${f} edit`); await p.page.locator(`.sheet [data-f=${f}]`).blur(); await sleep(30); await p.page.goBack(); }
    await A.page.evaluate(() => window.__setOnline(true)); await B.page.evaluate(() => window.__setOnline(true));
    await until(() => { const d = docs('chores').find(x => x.id === id); return d.notes === 'notes edit' && d.title === 'title edit'; }); void c; await tab(A, 'today'); await tab(B, 'today');
  });

  console.log('Rollover, bins and repeats');
  await check('rollover tick is optional, greys out, keeps no history', async () => { const n = docs('completions').length, r = A.page.locator('.chore:has([data-roll])').first(); const id = await r.getAttribute('data-id'); await r.locator('.tick').click(); await A.page.waitForSelector(`.chore.ticked[data-id="${id}"]`); assert.equal(docs('completions').length, n); await setDay(A, '2026-11-28'); await rerender(A); await A.page.waitForSelector(`.chore[data-id="${id}"]:not(.ticked)`); assert.equal(await A.page.locator(`.late[data-id="${id}"]`).count(), 0); });
  if (STARTER) {
    await check('bin night shows the right bins and rolls forward', async () => { await setDay(A, '2026-11-30'); await rerender(A); await cardFor(A, 'Bins out: general + recycling').waitFor(); await setDay(A, '2026-12-07'); await rerender(A); await cardFor(A, 'Bins out: general + organics').waitFor(); assert.equal(await A.page.locator('.chore', { hasText: 'Bins out: general + recycling' }).count(), 0); });
    await check('pool chores rest in winter', async () => { await setDay(A, '2027-07-01'); await tab(A, 'all'); await A.page.fill('#all-q', 'skimmer'); await A.page.waitForSelector('tr:has-text("Resting until Oct")'); await A.page.fill('#all-q', ''); });
    await setDay(A, '2026-11-27'); await tab(A, 'today');
  }

  console.log('Adding and changing');
  await check('quick add takes a name and one tap', async () => { await A.page.click('#fab'); await A.page.fill('#q-name', 'Fix the tap'); await A.page.click('#q-add'); await until(() => choreBy('Fix the tap')); const c = choreBy('Fix the tap'); assert.equal(c.dueDate, '2026-11-27'); assert.equal(c.repeat.type, 'none'); assert.deepEqual(c.assignees, ['u_uid-alex']); await B.page.click('[data-filter=all]'); await until(async () => B.page.locator('.chore', { hasText: 'Fix the tap' }).count()); await B.page.click('[data-filter=mine]'); assert.equal(await B.page.locator('.chore', { hasText: 'Fix the tap' }).count(), 0); });
  if (STARTER) await check('typing suggests presets', async () => { await A.page.click('#fab'); await A.page.fill('#q-name', 'vac'); await A.page.waitForSelector('#q-sug .pick-row'); await shot(A, '04-add'); await A.page.goBack(); });
  await check('More options saves nothing until Add chore', async () => { await A.page.click('#fab'); await A.page.fill('#q-name', 'Draft job'); await A.page.click('#q-more'); await A.page.waitForSelector('[data-act=create]'); await A.page.click('[data-rtype=since]'); await A.page.click('[data-days="14"]'); await shot(A, '05-form'); assert(!choreBy('Draft job')); await A.page.click('[data-act=create]'); await until(() => choreBy('Draft job')?.repeat.days === 14); });
  await check('As needed: never overdue, own list, one tap logs it, optional nudge', async () => {
    await tab(A, 'today'); await A.page.click('#fab'); await A.page.fill('#q-name', 'Clean car seats'); await A.page.click('#q-more'); await A.page.click('[data-rtype=asneeded]'); await A.page.waitForSelector('text=Gentle nudge'); assert.equal(await A.page.locator('#f-due').count(), 0); assert.equal(await A.page.locator('[data-sw=rollsOver]').count(), 0); assert.equal(await A.page.locator('[data-asneeded]').count(), 0); await A.page.click('.sw-row:has-text("Gentle nudge")'); await A.page.fill('[data-r=nudgeDays]', '3'); await A.page.locator('[data-r=nudgeDays]').blur(); await shot(A, '11-asneeded-form'); await A.page.click('[data-act=create]');
    const c = await until(() => choreBy('Clean car seats')); assert.equal(c.repeat.type, 'asneeded'); assert.equal(c.repeat.nudgeDays, 3); assert.equal(c.dueDate, null);
    await setDay(A, '2026-12-20'); await rerender(A); assert.equal(await A.page.locator('.late:has-text("Clean car seats")').count(), 0); await A.page.waitForSelector('.nudge:has-text("Clean car seats")'); await A.page.locator('.nudge:has-text("Clean car seats")').scrollIntoViewIfNeeded(); await shot(A, '12-asneeded-today');
    const n = docs('completions').length; await A.page.locator('.chore:has-text("Clean car seats") .tick').click(); await until(() => docs('completions').length === n + 1);
    await until(async () => (await A.page.locator('.chore:has-text("Clean car seats")').count()) === 0); await A.page.click('[data-asneeded]:has-text("Show 1 as-needed chore")'); await A.page.waitForSelector('.chore:has-text("Clean car seats") >> text=Done today');
    await A.page.click('[data-asneeded]'); await setDay(A, '2026-11-27'); await rerender(A);
  });
  await check('shortcut due entry works (+3w)', async () => { await tab(A, 'all'); await A.page.fill('#all-q', 'Draft job'); await A.page.locator('tr:has-text("Draft job")').click(); await A.page.fill('#f-due', '+3w'); await A.page.locator('#f-due').blur(); await until(() => choreBy('Draft job').dueDate === '2026-12-18'); });
  await check('chore card: assign, steps, icon', async () => { await A.page.locator('.sheet [data-who="u_uid-sam"]').click(); await until(() => choreBy('Draft job').assignees.includes('u_uid-sam')); await A.page.fill('#new-step', 'Step one'); await A.page.click('[data-act=step]'); await until(() => choreBy('Draft job').steps.length === 1); await A.page.click('[data-act=icons]'); await A.page.fill('#f-icons input', 'hammer'); await A.page.click('[data-ic=hammer]'); await until(() => choreBy('Draft job').icon === 'hammer'); });
  await check('pause hides it and resume brings it back', async () => { await A.page.click('[data-act=pause]'); await until(() => choreBy('Draft job').paused); await A.page.goBack(); await A.page.click('#menu'); await A.page.click('[data-m=paused]'); await A.page.click('[data-resume]'); await until(() => !choreBy('Draft job').paused); });
  await check('delete asks once, restore brings it back', async () => { await tab(A, 'all'); await A.page.fill('#all-q', 'Draft job'); await A.page.locator('tr:has-text("Draft job")').click(); await A.page.click('[data-act=delete]'); await A.page.click('#cf-yes'); await until(() => choreBy('Draft job').deletedAt); await sleep(250); await A.page.fill('#all-q', ''); await A.page.click('#menu'); await A.page.click('[data-m=deleted]'); await A.page.click('[data-restore]'); await until(() => !choreBy('Draft job').deletedAt); });
  await tab(A, 'today');
  const swipe = async (p, loc, dx) => { const b = await loc.boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2; await p.page.mouse.move(x, y); await p.page.mouse.down(); for (let i = 1; i <= 6; i++) await p.page.mouse.move(x + dx * i / 6, y); await p.page.mouse.up(); };
  await check('swipe right marks done', async () => { const n = docs('completions').length; await swipe(A, A.page.locator('.chore:has([data-done])').nth(1), 140); await until(() => docs('completions').length === n + 1); });
  await check('swipe left offers snooze or skip', async () => { const c = A.page.locator('.chore:has([data-done])').nth(1), id = await c.getAttribute('data-id'); await swipe(A, c, -140); await A.page.waitForSelector('text=Snooze: Tomorrow'); await A.page.click('text=Snooze: Tomorrow'); await until(() => docs('chores').find(x => x.id === id).snoozedUntil === '2026-11-28'); });
  await check('skip records a skip, not a completion', async () => { const c = A.page.locator('.chore:has([data-done])').nth(1), id = await c.getAttribute('data-id'); await swipe(A, c, -140); await A.page.click('text=Skip this time'); await until(() => docs('completions').some(x => x.choreId === id && x.kind === 'skip')); assert(!docs('chores').find(x => x.id === id).last); });
  await check('Skip button on the chore card keeps last done and moves on', async () => { const c = A.page.locator('.chore:has([data-done])').nth(1), id = await c.getAttribute('data-id'), last = JSON.stringify(docs('chores').find(x => x.id === id).last ?? null); await c.locator('.txt').click(); await A.page.waitForSelector('[data-act=skip]'); assert(await A.page.evaluate(() => { const r = document.querySelector('.acts'); return r.scrollWidth <= r.clientWidth + 1; })); await shot(A, '10-card-skip'); await A.page.click('[data-act=skip]'); await until(() => docs('completions').some(x => x.choreId === id && x.kind === 'skip' && x.day === '2026-11-27')); assert.equal(JSON.stringify(docs('chores').find(x => x.id === id).last ?? null), last); await A.page.waitForSelector('#toast.show >> text=Skipped'); });
  await check('long-press selects several, then move', async () => { await sleep(100); const cs = A.page.locator('.chore:has([data-done])'), a = await cs.nth(1).getAttribute('data-id'), b0 = await cs.nth(1).boundingBox(); await A.page.mouse.move(b0.x + 90, b0.y + 20); await A.page.mouse.down(); await sleep(560); await A.page.mouse.up(); await A.page.waitForSelector('.selbar b'); await sleep(120); const b = await A.page.locator('.chore:has([data-done]):not(.sel)').nth(1).getAttribute('data-id'); await A.page.locator(`.chore[data-id="${b}"] .txt`).click(); await A.page.waitForSelector('text=2 selected'); await shot(A, '06-select'); await A.page.click('[data-bulk=room]'); await A.page.click('.pick-row:has-text("Vehicle")'); await until(() => [a, b].every(i => docs('chores').find(x => x.id === i).roomId === 'r-vehicle')); });
  await check('filter pills and 10-minute filter', async () => { await A.page.click('[data-quick]'); await sleep(40); const ok = await A.page.evaluate(() => document.querySelector('[data-quick]').classList.contains('on')); assert(ok); await A.page.click('[data-quick]'); await A.page.click('[data-filter=all]'); await A.page.click('[data-filter=mine]'); });

  console.log('Other views');
  for (const v of ['rooms', 'all', 'week', 'progress']) await check(`${v} view fits the phone`, async () => { await tab(A, v); if (v === 'rooms') await A.page.locator('.room-h').first().click(); await sleep(50); assert(await noOverflow(A)); await shot(A, `07-${v}`); });
  await check('All sorts by a column', async () => { await tab(A, 'all'); await A.page.click('[data-sort=effort]'); const a = await A.page.locator('tbody tr').first().locator('td.num').innerText(); await A.page.click('[data-sort=effort]'); const b = await A.page.locator('tbody tr').first().locator('td.num').innerText(); assert.notEqual(a, b); });
  await check('Progress shows split by person and history', async () => { await tab(A, 'progress'); await A.page.waitForSelector('.hb:has-text("Alex")'); await A.page.waitForSelector('.log li'); });
  await check('Settings: add and remove a member, with handover', async () => { await A.page.click('#menu'); await A.page.click('[data-m=settings]'); await A.page.fill('#add-people', 'Jo'); await A.page.click('[data-add=people]'); const j = await until(() => docs('people').find(p => p.name === 'Jo')); const c = choreBy('Fix the tap'); await A.page.evaluate(() => 0); db[`households/home/chores/${c.id}`].assignees = [j.id]; push(); await sleep(100); await A.page.locator(`[data-del=people][data-id="${j.id}"]`).click(); await A.page.click('.pick-row:has-text("Sam")'); await until(() => !docs('people').find(p => p.name === 'Jo')); assert.deepEqual(choreBy('Fix the tap').assignees, ['u_uid-sam']); assert(await noOverflow(A)); await shot(A, '08-settings'); });
  await check('Settings: rename a room', async () => { await A.page.fill('[data-rename=rooms][data-id=r-pets]', 'Animals'); await A.page.locator('[data-rename=rooms][data-id=r-pets]').blur(); await until(() => docs('rooms').find(r => r.id === 'r-pets').name === 'Animals'); });
  await check('text size is remembered on this phone', async () => { await A.page.locator('#font').fill('115'); await A.page.reload(); await A.page.waitForSelector('#nav'); assert.equal(await A.page.evaluate(() => document.documentElement.style.fontSize), '18.4px'); await A.page.evaluate(() => localStorage.setItem('hd.font', '100')); await A.page.reload(); await A.page.waitForSelector('#nav'); });
  await check('backup downloads every collection', async () => { await A.page.click('#menu'); await A.page.click('[data-m=settings]'); const [d] = await Promise.all([A.page.waitForEvent('download'), A.page.click('#export')]); const j = JSON.parse(fs.readFileSync(await d.path(), 'utf8')); assert.equal(j.kind, 'home-duties-backup'); assert.equal(j.data.chores.length, docs('chores').length); });
  await check('Tips page opens', async () => { await A.page.click('#menu'); await A.page.click('[data-m=tips]'); await A.page.waitForSelector('text=Swipes and selecting'); await tab(A, 'today'); });
  await check('long-press shortcuts: Add chore and Today', async () => { await A.page.goto(URL_ + '?add=1'); await A.page.waitForSelector('#q-name'); await A.page.goBack().catch(() => {}); await A.page.goto(URL_ + '?view=today'); await A.page.waitForSelector('.top h1:has-text("Today")'); });
  await check('every icon used exists', async () => { const src = fs.readFileSync(path.join(ROOT, 'js/icons.js'), 'utf8'), have = new Set(Object.keys(JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1)))); const used = new Set(); for (const f of ['main', 'views', 'sheets', 'pages', 'store']) for (const m of fs.readFileSync(path.join(ROOT, `js/${f}.js`), 'utf8').matchAll(/icon\('([a-z0-9-]+)'/g)) used.add(m[1]); docs('chores').forEach(c => c.icon && used.add(c.icon)); docs('rooms').forEach(r => used.add(r.icon)); assert.deepEqual([...used].filter(i => !have.has(i)), []); });
  await check('manifest lists both shortcuts and maskable icons', () => { const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'))); assert.deepEqual(m.shortcuts.map(s => s.name), ['Today', 'Add chore']); assert(m.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512')); m.icons.concat(m.shortcuts.flatMap(s => s.icons)).forEach(i => assert(fs.existsSync(path.join(ROOT, i.src)))); });

  console.log('Dark theme and offline start');
  const D = await phone(browser, 'Alex', 'alex@test.example', { dark: true, at: '2026-11-27T09:30:00+10:30' });
  await check('dark theme follows the phone', async () => { await signIn(D); await D.page.waitForSelector('.next'); assert.equal(await D.page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(38, 48, 58)'); await shot(D, '09-dark'); await D.page.click('#fab'); await sleep(50); await D.page.goBack(); });
  await D.ctx.close(); pages.forEach(p => p.isClosed() && pages.delete(p));
  const W = await phone(browser, 'Alex', 'alex@test.example', { sw: true, at: '2026-11-27T09:30:00+10:30' });
  await check('installed app opens with no connection', async () => { await signIn(W); await W.page.evaluate(() => navigator.serviceWorker.ready); await until(() => W.page.evaluate(async () => (await (await caches.open('home-duties-v3')).keys()).length > 15), 8000); await until(() => W.page.evaluate(() => !!navigator.serviceWorker.controller), 8000); await W.page.reload(); await W.page.waitForSelector('#nav'); await W.ctx.setOffline(true); await W.page.reload(); await W.page.waitForSelector('#nav', { timeout: 8000 }); await W.page.waitForSelector('.chore'); });
  await W.ctx.close(); pages.forEach(p => p.isClosed() && pages.delete(p));

  await check('no script errors on any phone', () => assert.deepEqual(errors, []));
  await browser.close(); srv.close();
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
