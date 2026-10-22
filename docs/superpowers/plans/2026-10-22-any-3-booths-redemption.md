# Any-3-Booths Redemption Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow students to unlock profile submission and reward redemption after stamping any `required_stamps` (default `3`) booths out of all active booths, while still displaying all active booths and allowing continued scanning.

**Architecture:** Add `required_stamps` (default `'3'`) to SQLite `settings` in `src/db.js`, compute `requiredStamps = totalBooths > 0 ? Math.min(Number(settings.required_stamps) || 3, totalBooths) : 0` and `isCompleted = requiredStamps > 0 && stampedCount >= requiredStamps`, and surface `requiredStamps` in the Student UI (`public/app.js`) and Admin settings UI (`public/admin.html`, `public/admin.js`).

**Tech Stack:** Node.js (`node:sqlite`, `node:test`), Express, Vanilla JS/HTML.

**Spec:** `docs/superpowers/specs/2026-10-22-any-3-booths-redemption-design.md`

## Global Constraints

- Default `required_stamps` is `3` (editable in Admin settings).
- If active booths `< required_stamps`, effective `requiredStamps` clamps to `totalBooths`.
- Students who already reached 3 stamps can still scan booth 4, 5, etc.

## Review Focus

- **Redeeming at 3 out of 4+ booths:** Stamping 3 out of 4 active booths sets `isCompleted = true` and allows saving profile + redeeming reward.
- **Clamping when active booths < required_stamps:** If `required_stamps = 3` but only 2 booths are active, stamping those 2 booths sets `isCompleted = true`.
- **Scanning additional booths after redemption:** A student who redeemed after 3 stamps can still scan the 4th booth without error.

---

### Task 1: Configurable `required_stamps` in DB, Student UI, and Admin UI

**Files:**
- Modify: `src/db.js`
- Modify: `public/app.js`
- Modify: `public/admin.html`
- Modify: `public/admin.js`
- Test: `tests/db.test.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Produces:
  - `state.requiredStamps` in `getParticipantState(lineUserId)`
  - `settings.required_stamps` (numeric, default `3`) in `getSettings()`
  - `stats.requiredStamps` in `getAdminOverview()`

- [ ] **Step 1: Update `tests/db.test.js` and `tests/api.test.js` with failing tests for 3-of-N completion**

Test that with 5 active booths and default `required_stamps = 3`, scanning 2 booths has `isCompleted === false`, scanning a 3rd booth sets `isCompleted === true` and allows `saveProfile` + `redeemReward`, and scanning the 4th booth afterwards still succeeds.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test`
Expected: FAIL on new `requiredStamps` assertions.

- [ ] **Step 3: Implement `required_stamps` in `src/db.js`, `public/app.js`, `public/admin.html`, and `public/admin.js`**

Update `DEFAULT_SETTINGS`, `getSettings`, `getParticipantState`, `getAdminOverview`, `exportCsv`, student progress bar/labels, and admin settings form.

- [ ] **Step 4: Run tests to verify GREEN and commit**

Run: `npm test`
Expected: All tests PASS.
