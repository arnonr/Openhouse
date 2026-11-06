# Strict LINE OA Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent students from losing stamps by blocking temporary external browser sessions, requiring students to open the Stamp Rally inside the LINE app and add the LINE OA (`@096ilctj`) as a friend before collecting stamps, and automatically stamping any scanned booth once unlocked.

**Architecture:** Update `public/index.html` with a blocking `#lineGateModal` overlay for both external-browser deep-linking (`https://line.me/R/app/<LIFF_ID>?booth=...`) and in-LINE friendship verification (`window.liff.getFriendship()`). Update `public/app.js` to persist any scanned `?booth=...` parameter in `localStorage` (`openhouse_pending_booth`), disable production fallback to `getOrCreateDemoUser()`, verify `liff.isInClient()` and `liff.getFriendship()`, and automatically re-verify friendship on window focus/visibilitychange or button click.

**Tech Stack:** Node.js (`node:test`), Express, Vanilla JS/HTML, LINE LIFF SDK v2.

**Spec:** `docs/superpowers/specs/2026-11-06-require-line-oa-gate-design.md`

## Global Constraints

- When `appConfig.liffId` is configured and `?demo=1` is not set, `public/app.js` must never fall back to `getOrCreateDemoUser()`.
- Existing printed QR codes (`https://liff.line.me/2012153981-eWRVDFrg?booth=...`) must continue to work without reprinting.
- Any `?booth=CODE` (or `liff.state` `booth=CODE`) scanned before adding the LINE OA must be saved and automatically stamped once the student passes the gate.

## Review Focus

- **Scanning with native phone camera (external browser):** When `liff.isInClient()` is `false`, the gate modal blocks scanning and provides a direct `https://line.me/R/app/<LIFF_ID>?booth=<CODE>` button to jump into the LINE app with the booth code preserved.
- **Opening in LINE without adding LINE OA (`friendFlag === false`):** The gate modal blocks scanning until `liff.getFriendship()` returns `friendFlag === true`.
- **Returning from adding LINE OA:** Focusing/returning to the page or clicking `#gateRecheckFriendBtn` re-runs `liff.getFriendship()`, closes the gate when `friendFlag === true`, and immediately stamps the saved `openhouse_pending_booth`.
- **Profile name fallback:** If `liff.getProfile()` omits `displayName`, fallback to `liff.getDecodedIDToken().name` before `'ผู้เข้าร่วมงาน'`.
- **Demo mode (`?demo=1` or empty `liffId`):** Continues to work with `getOrCreateDemoUser()` for local testing and admin preview (`./?demo=1`).

---

### Task 1: Add Strict LINE OA Gate Modal and Client Identity Enforcement

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Produces:
  - `#lineGateModal`, `#gateExternalView`, `#gateFriendshipView`, `#gateOpenLineAppBtn`, `#gateAddFriendBtn`, `#gateRecheckFriendBtn`, `#gateStatusMsg` in `public/index.html`
  - `savePendingBoothFromUrl()`, `consumePendingBooth()`, `verifyLineFriendship()`, and updated `initIdentity()` in `public/app.js`

- [ ] **Step 1: Add failing test in `tests/api.test.js` for LINE OA Gate modal and strict identity flow**

Add a test in `tests/api.test.js` asserting that:
1. `public/index.html` includes `#lineGateModal`, `#gateOpenLineAppBtn`, `#gateAddFriendBtn`, and `#gateRecheckFriendBtn`.
2. `public/app.js` checks `window.liff.isInClient()` and `window.liff.getFriendship()`, stores `openhouse_pending_booth`, uses `https://line.me/R/app/` for launching the LINE app with `?booth=`, and does not fall back to `getOrCreateDemoUser` when `appConfig.liffId && !forceDemo`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test`
Expected: FAIL on the new LINE OA gate assertions.

- [ ] **Step 3: Implement `#lineGateModal` in `public/index.html` and strict LINE OA gate logic in `public/app.js`**

1. In `public/index.html`, add `#lineGateModal` with two subviews (`#gateExternalView` for external browsers with step 1 add friend + step 2 open in LINE app, and `#gateFriendshipView` for in-LINE users who haven't added `@096ilctj` yet).
2. In `public/app.js`:
   - Extract `booth` from URL or `liff.state` at startup and persist in `localStorage.setItem('openhouse_pending_booth', boothCode)`.
   - When `appConfig.liffId && !forceDemo`, never call `getOrCreateDemoUser`.
   - If `!window.liff.isInClient()`, show `#lineGateModal` (`#gateExternalView`) with `https://line.me/R/app/${appConfig.liffId}` (appending `?booth=...` if present).
   - If `window.liff.isInClient()`, check `window.liff.getFriendship()`. If `friendFlag === false`, show `#lineGateModal` (`#gateFriendshipView`) and re-verify on `#gateRecheckFriendBtn` click and `visibilitychange` / `focus`.
   - Once unlocked, load participant state and automatically scan and clear `openhouse_pending_booth`.

- [ ] **Step 4: Run tests to verify GREEN and commit**

Run: `npm test`
Expected: All tests PASS.
