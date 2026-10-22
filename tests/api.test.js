const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

test('Student API workflow, cooldown 429, validation 400, and Admin auth protection', async () => {
  const store = createDb(':memory:');
  store.updateSettings({ cooldown_seconds: 30 });
  const app = createApp(store, { adminPassword: 'secret-admin', liffId: '', lineOaId: '@096ilctj' });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Public config endpoint
    const cfgRes = await fetch(`${baseUrl}/api/config`);
    assert.equal(cfgRes.status, 200);
    const cfg = await cfgRes.json();
    assert.equal(cfg.lineOaId, '@096ilctj');
    assert.equal(cfg.demoMode, true);

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

    // First scan succeeds
    const scan1 = await fetch(`${baseUrl}/api/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineUserId: 'U999', displayName: 'นักเรียนทดสอบ', boothCode: overview.booths[0].code })
    });
    assert.equal(scan1.status, 200);

    // Second distinct booth scan within 30s returns 429
    const scanCooldown = await fetch(`${baseUrl}/api/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineUserId: 'U999', displayName: 'นักเรียนทดสอบ', boothCode: overview.booths[1].code })
    });
    assert.equal(scanCooldown.status, 429);

    // Admin sets cooldown to 0
    const setRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-password': 'secret-admin' },
      body: JSON.stringify({ cooldown_seconds: 0 })
    });
    assert.equal(setRes.status, 200);

    // Scan remaining booths
    for (const booth of overview.booths.slice(1)) {
      const scanRes = await fetch(`${baseUrl}/api/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'U999', displayName: 'นักเรียนทดสอบ', boothCode: booth.code })
      });
      assert.equal(scanRes.status, 200);
    }

    // Redeem before profile returns 400
    const badRedeem = await fetch(`${baseUrl}/api/redeem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineUserId: 'U999' })
    });
    assert.equal(badRedeem.status, 400);

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

    // CSV export endpoint returns text/csv with BOM
    const csvRes = await fetch(`${baseUrl}/api/admin/export.csv`, {
      headers: { 'x-admin-password': 'secret-admin' }
    });
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes('รร.วัดเขมาภิรตาราม'));
  } finally {
    server.close();
  }
});

test('Serves Student Stamp Rally HTML page at / and Admin/Poster pages', async () => {
  const store = createDb(':memory:');
  const app = createApp(store);
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const homeRes = await fetch(`${baseUrl}/`);
    assert.equal(homeRes.status, 200);
    const html = await homeRes.text();
    assert.ok(html.includes('อุทยานเทคโนโลยี มจพ.'));

    const adminRes = await fetch(`${baseUrl}/admin`);
    assert.equal(adminRes.status, 200);
    const adminHtml = await adminRes.text();
    assert.ok(adminHtml.includes('ระบบจัดการงาน Open House'));

    const posterRes = await fetch(`${baseUrl}/poster.html?code=ST-01-ROBOT`);
    assert.equal(posterRes.status, 200);
    const posterHtml = await posterRes.text();
    assert.ok(posterHtml.includes('OPEN HOUSE STAMP RALLY'));
  } finally {
    server.close();
  }
});

