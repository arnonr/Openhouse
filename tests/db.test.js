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

test('dynamically evaluates completion when active booths change (3 to 5 booths)', () => {
  const store = createDb(':memory:');
  store.updateSettings({ cooldown_seconds: 0 });
  const booths = store.listBooths({ activeOnly: false });

  // Scan first 3 booths
  for (const b of booths.slice(0, 3)) {
    store.scanBooth({ lineUserId: 'U002', displayName: 'น้องแพรว', boothCode: b.code });
  }
  assert.equal(store.getParticipantState('U002').isCompleted, false);

  // Deactivate 4th booth -> now 3/3 active booths completed!
  store.updateBooth(booths[3].id, { is_active: 0 });
  assert.equal(store.getParticipantState('U002').isCompleted, true);
});
