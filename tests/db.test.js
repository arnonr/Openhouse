const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');

test('seeds 4 default booths and default settings', () => {
  const store = createDb(':memory:');
  const booths = store.listBooths({ activeOnly: true });
  assert.equal(booths.length, 4);
  const settings = store.getSettings();
  assert.equal(Number(settings.cooldown_seconds), 60);
  assert.equal(Number(settings.required_stamps), 3);
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

test('unlocks completion after any 3 booths out of 5+ booths and still allows scanning more booths', () => {
  const store = createDb(':memory:');
  store.updateSettings({ cooldown_seconds: 0, required_stamps: 3 });
  store.createBooth({ name: 'ฐานที่ 5: AI & Robotics', icon: '🧠' });
  const booths = store.listBooths({ activeOnly: true });
  assert.equal(booths.length, 5);

  // Scan 2 booths -> not completed yet (2/3)
  store.scanBooth({ lineUserId: 'U002', displayName: 'น้องแพรว', boothCode: booths[0].code });
  store.scanBooth({ lineUserId: 'U002', displayName: 'น้องแพรว', boothCode: booths[2].code });
  let state = store.getParticipantState('U002');
  assert.equal(state.requiredStamps, 3);
  assert.equal(state.totalBooths, 5);
  assert.equal(state.isCompleted, false);

  // Scan 3rd booth (any booth, e.g. booth #5) -> completed (3/3)!
  store.scanBooth({ lineUserId: 'U002', displayName: 'น้องแพรว', boothCode: booths[4].code });
  state = store.getParticipantState('U002');
  assert.equal(state.stampedCount, 3);
  assert.equal(state.isCompleted, true);

  // Can save profile and redeem at 3 stamps
  store.saveProfile({ lineUserId: 'U002', gradeLevel: 'ม.ปลาย', schoolName: 'รร.สตรีนนทบุรี' });
  store.redeemReward('U002');
  assert.equal(store.getParticipantState('U002').isRedeemed, true);

  // Can still scan 4th booth even after redeeming
  const scan4 = store.scanBooth({ lineUserId: 'U002', displayName: 'น้องแพรว', boothCode: booths[1].code });
  assert.equal(scan4.state.stampedCount, 4);
});
