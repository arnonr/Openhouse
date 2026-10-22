# KMUTNB Techno Park Open House Stamp Rally Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dockerized LINE LIFF & QR Code Stamp Rally web application (with student stamp card, post-completion 2-field form, live-clock reward redemption, admin dashboard, printable A4 booth QR posters, and CSV export) for KMUTNB Techno Park Open House (`@096ilctj`).

**Architecture:** A single-container Node.js (Express) application backed by Node's built-in `node:sqlite` (`DatabaseSync`) storing data in `./data/openhouse.db`. It serves a mobile-first student LIFF frontend (with automatic Demo Mode fallback when `LIFF_ID` is not yet configured), an Admin dashboard (`/admin`), and an A4 printable QR poster page (`/poster.html`).

**Tech Stack:** Node.js 22/24 (`node:sqlite`, `node:test`), Express 5, `qrcode` (SVG generation for booth posters), Vanilla HTML/CSS/JS + LINE LIFF SDK v2.

**Spec:** `docs/superpowers/specs/2026-10-22-openhouse-stamp-rally-design.md`

## Global Constraints

- **LINE OA Account:** `@096ilctj` (KMUTNB Techno Park / อุทยานเทคโนโลยี มจพ.)
- **Target Scale:** ~100 participants on Ubuntu Server behind Nginx Proxy Manager (`https://it.technopark.kmutnb.ac.th/`)
- **Zero-Friction Start:** Scanning a booth QR records the stamp immediately without requiring registration upfront
- **Minimal Post-Completion Info:** Collect only `grade_level` (`ม.ต้น`, `ม.ปลาย`, `ปวช. / ปวส.`, `นักศึกษา / อื่นๆ`) and `school_name` once all active booths are stamped
- **Anti-Cheat Cooldown:** Configurable `cooldown_seconds` between scans (default `60` seconds, adjustable to `0` in Admin)
- **Excel Thai Compatibility:** CSV export must begin with UTF-8 BOM (`\uFEFF`)

## Review Focus

- **Scanning the same booth twice:** Scanning a booth the student already stamped must be idempotent (`alreadyStamped: true`) and must NOT trigger a cooldown error or duplicate row.
- **Cooldown only applies to new booths:** A student scanning a second distinct booth within `cooldown_seconds` receives `429` with `remainingSeconds`, unless `cooldown_seconds` is `0`.
- **Dynamic booth activation/deactivation:** If Admin reduces active booths from 4 to 3 (or increases to 5), completion status (`isCompleted`) dynamically evaluates against all currently active booths (`is_active = 1`).
- **Redeeming before completion or without profile:** Calling `/api/redeem` when not all active booths are stamped or when `grade_level`/`school_name` is missing must be rejected with `400`.
- **CSV injection / commas in school names:** School names containing commas or quotes (e.g., `รร.สาธิต "พิบูลบำเพ็ญ", ชลบุรี`) must be properly RFC-4180 escaped in `/api/admin/export.csv`.

---

### Task 1: Project Setup & SQLite Data Layer (`src/db.js`)

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `src/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces:
  - `createDb(dbPath = ':memory:')` returning `{ db, getSettings, updateSettings, listBooths, createBooth, updateBooth, deleteBooth, getParticipantState, scanBooth, saveProfile, redeemReward, toggleRedeemAdmin, getAdminOverview, exportCsv }`

- [ ] **Step 1: Initialize `package.json` and install dependencies (`express`, `qrcode`)**

Create `package.json` with `"type": "commonjs"`, `"scripts": { "start": "node src/server.js", "test": "node --test tests/*.test.js" }`, and install `express` and `qrcode`. Also create `.env.example`.

- [ ] **Step 2: Write the failing database unit tests in `tests/db.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');

test('seeds 4 default booths and default settings', () => {
  const store = createDb(':memory:');
  const booths = store.listBooths({ activeOnly: true });
  assert.equal(booths.length, 4);
  const settings = store.getSettings();
  assert.equal(Number(settings.cooldown_seconds), 60);
});

test('scans booths, handles idempotent repeat scans, enforces cooldown, and completes flow', () => {
  const store = createDb(':memory:');
  store.updateSettings({ cooldown_seconds: 60 });
  const booths = store.listBooths({ activeOnly: true });

  // First scan succeeds immediately without profile
  const res1 = store.scanBooth({
    lineUserId: 'U001',
    displayName: 'น้องสมชาย',
    pictureUrl: '',
    boothCode: booths[0].code,
    nowMs: 100000
  });
  assert.equal(res1.alreadyStamped, false);
  assert.equal(res1.state.stampedCount, 1);

  // Repeat scan on same booth is idempotent even within cooldown window
  const resRepeat = store.scanBooth({
    lineUserId: 'U001',
    displayName: 'น้องสมชาย',
    boothCode: booths[0].code,
    nowMs: 105000
  });
  assert.equal(resRepeat.alreadyStamped, true);

  // Different booth within 60s cooldown throws COOLDOWN_ACTIVE
  assert.throws(
    () => store.scanBooth({
      lineUserId: 'U001',
      displayName: 'น้องสมชาย',
      boothCode: booths[1].code,
      nowMs: 120000
    }),
    (err) => err.code === 'COOLDOWN_ACTIVE' && err.remainingSeconds === 40
  );

  // Scan remaining booths after cooldown
  store.updateSettings({ cooldown_seconds: 0 });
  for (const b of booths.slice(1)) {
    store.scanBooth({ lineUserId: 'U001', displayName: 'น้องสมชาย', boothCode: b.code });
  }

  // Cannot redeem before saving profile
  assert.throws(() => store.redeemReward('U001'), (err) => err.code === 'PROFILE_INCOMPLETE');

  // Save profile & redeem
  store.saveProfile({ lineUserId: 'U001', gradeLevel: 'ม.ปลาย', schoolName: 'รร.เตรียมวิศวฯ, มจพ.' });
  const redeemed = store.redeemReward('U001');
  assert.equal(redeemed.participant.is_redeemed, 1);

  // CSV export includes UTF-8 BOM and escaped school name
  const csv = store.exportCsv();
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"รร.เตรียมวิศวฯ, มจพ."'));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../src/db'`

- [ ] **Step 4: Implement `createDb(dbPath)` in `src/db.js` using `node:sqlite` (`DatabaseSync`)**

Implement schema creation (`booths`, `participants`, `stamps`, `settings`), seeding 4 default KMUTNB Techno Park booths (`ST-01` to `ST-04`), cooldown logic, profile validation, reward redemption, admin CRUD, and RFC-4180 CSV export with `\uFEFF` BOM.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

---

### Task 2: Express HTTP API & QR Generator (`src/app.js`, `src/server.js`)

**Files:**
- Create: `src/app.js`
- Create: `src/server.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Consumes: `createDb` from `src/db.js`
- Produces:
  - `createApp(store, config)` returning an Express app serving static `public/` and routes:
    - `GET /api/config`
    - `GET /api/me`
    - `POST /api/scan`
    - `POST /api/profile`
    - `POST /api/redeem`
    - `GET /api/qr/:code`
    - `GET /api/admin/overview`
    - `POST /api/admin/booths`
    - `PUT /api/admin/booths/:id`
    - `DELETE /api/admin/booths/:id`
    - `POST /api/admin/settings`
    - `POST /api/admin/participants/:lineUserId/toggle-redeem`
    - `GET /api/admin/export.csv`

- [ ] **Step 1: Write failing API integration tests in `tests/api.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

test('Student API workflow and Admin auth protection', async () => {
  const store = createDb(':memory:');
  store.updateSettings({ cooldown_seconds: 0 });
  const app = createApp(store, { adminPassword: 'secret-admin', liffId: '', lineOaId: '@096ilctj' });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Unauthorized admin request returns 401
    const unauth = await fetch(`${baseUrl}/api/admin/overview`);
    assert.equal(unauth.status, 401);

    // Authorized admin overview returns booths
    const overviewRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { 'x-admin-password': 'secret-admin' }
    });
    assert.equal(overviewRes.status, 200);
    const overview = await overviewRes.json();
    assert.equal(overview.booths.length, 4);

    // Scan all 4 booths
    for (const booth of overview.booths) {
      const scanRes = await fetch(`${baseUrl}/api/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'U999', displayName: 'นักเรียนทดสอบ', boothCode: booth.code })
      });
      assert.equal(scanRes.status, 200);
    }

    // Save profile and redeem
    const profRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineUserId: 'U999', gradeLevel: 'ม.ปลาย', schoolName: 'รร.วัดเขมาภิรตาราม' })
    });
    assert.equal(profRes.status, 200);

    const redRes = await fetch(`${baseUrl}/api/redeem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineUserId: 'U999' })
    });
    assert.equal(redRes.status, 200);

    // QR SVG endpoint returns image/svg+xml
    const qrRes = await fetch(`${baseUrl}/api/qr/${overview.booths[0].code}?url=https://example.com`);
    assert.equal(qrRes.status, 200);
    assert.match(qrRes.headers.get('content-type'), /image\/svg\+xml/);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../src/app'`

- [ ] **Step 3: Implement `src/app.js` and `src/server.js`**

Implement all Student and Admin routes in `src/app.js`, including QR SVG generation via `qrcode.toString(targetUrl, { type: 'svg', margin: 1 })`, admin authentication middleware checking `x-admin-password` or `?key=`, and `src/server.js` entry point.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

---

### Task 3: Student Mobile LIFF Frontend (`public/index.html`, `public/styles.css`, `public/app.js`)

**Files:**
- Create: `public/styles.css`
- Create: `public/index.html`
- Create: `public/app.js`
- Modify: `tests/api.test.js` (add static asset & HTML verification test)

**Interfaces:**
- Consumes: `GET /api/config`, `GET /api/me`, `POST /api/scan`, `POST /api/profile`, `POST /api/redeem`
- Produces:
  - Mobile-first Thai UI supporting URL parameter `?booth=CODE` auto-check-in, LINE LIFF login + `@096ilctj` friend banner, Demo Mode toolbar (1-click test scanning any booth when in demo/testing mode), in-app camera QR scanner (`html5-qrcode` + `liff.scanCodeV2`), 2-field completion form, and live-clock staff redemption screen.

- [ ] **Step 1: Add frontend route test to `tests/api.test.js`**

Add a test asserting `GET /`, `GET /admin`, and `GET /poster.html` return `200` and contain expected Thai UI headings.

- [ ] **Step 2: Implement `public/styles.css`, `public/index.html`, and `public/app.js`**

Build the student stamp rally interface matching the approved mockup (stamp grid, progress bar, camera QR scanner modal, 2-field completion modal, and live-clock staff confirmation card).

- [ ] **Step 3: Run tests to verify**

Run: `npm test`
Expected: PASS

---

### Task 4: Admin Dashboard & Printable A4 QR Poster (`public/admin.html`, `public/admin.js`, `public/poster.html`)

**Files:**
- Create: `public/admin.html`
- Create: `public/admin.js`
- Create: `public/poster.html`

**Interfaces:**
- Consumes: Admin APIs (`/api/admin/*`) and `/api/qr/:code`
- Produces:
  - `/admin`: Real-time statistics, booth add/edit/toggle/delete (3–5+ booths), one-click "พิมพ์ป้าย QR" button, cooldown seconds configurator, participant search & manual redeem toggle, and Excel CSV download button.
  - `/poster.html?code=...`: Print-ready A4 poster with KMUTNB Techno Park header, booth icon & name, large SVG QR Code (automatically encoding LIFF URL or server URL + `?booth=CODE`), and `@media print` styling.

- [ ] **Step 1: Implement `public/admin.html`, `public/admin.js`, and `public/poster.html`**

Create the Admin dashboard and printable A4 poster page.

- [ ] **Step 2: Run tests to verify all static and API tests pass**

Run: `npm test`
Expected: PASS

---

### Task 5: Docker, Nginx Proxy Manager Config & LINE OA (`@096ilctj`) Setup Guide

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces:
  - `docker compose up -d --build` deployment configuration exposing port `3100` with persistent `./data` volume
  - Step-by-step Thai documentation in `README.md` covering:
    1. Deploying on Ubuntu Server + configuring Nginx Proxy Manager (`https://it.technopark.kmutnb.ac.th/`)
    2. Creating the LIFF App linked to LINE OA `@096ilctj` and setting up Rich Menu in `https://manager.line.biz/account/@096ilctj`

- [ ] **Step 1: Create `Dockerfile`, `docker-compose.yml`, `.gitignore`, and `README.md`**

Write the Docker configuration using `node:22-alpine` and comprehensive Thai setup documentation.

- [ ] **Step 2: Run full test suite and smoke-test the live server locally**

Run: `npm test`
Expected: All tests PASS with 0 errors.
