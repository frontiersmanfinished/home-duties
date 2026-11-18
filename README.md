# Home Duties

A shared household chore tracker. It is a progressive web app, hosted on GitHub Pages, with sync through Firebase.

This repo holds code only. Chore data and account details live in a private Firebase project, protected by its database rules.

Bump `VERSION` in `sw.js` with each release so phones pick up the change.

Tests: `node tests/engine.test.mjs`, then `node tests/app.test.cjs` (needs Playwright and Chrome). The app test swaps Firebase for a local stand-in, so it needs no account.
