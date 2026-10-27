const path = require('node:path');
const express = require('express');
const QRCode = require('qrcode');

function createApp(store, config = {}) {
  const app = express();
  app.set('trust proxy', true);

  const adminPassword = String(config.adminPassword || process.env.ADMIN_PASSWORD || 'technopark2026');
  const liffId = String(config.liffId !== undefined ? config.liffId : (process.env.LIFF_ID || '')).trim();
  const lineOaId = String(config.lineOaId || process.env.LINE_OA_ID || '@096ilctj').trim();
  const publicBaseUrl = String(config.publicBaseUrl || process.env.PUBLIC_BASE_URL || '').trim();

  app.use(express.json({ limit: '512kb' }));

  const publicDir = path.join(__dirname, '..', 'public');
  const router = express.Router();

  // Serve /admin cleanly
  router.get('/admin', (_req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
  });

  router.use(express.static(publicDir));

  // Public Configuration
  router.get('/api/config', (_req, res) => {
    const settings = store.getSettings();
    res.json({
      liffId,
      lineOaId,
      publicBaseUrl,
      demoMode: !liffId,
      settings
    });
  });

  // Get participant state
  router.get('/api/me', (req, res) => {
    try {
      const lineUserId = String(req.query.lineUserId || '').trim();
      const displayName = String(req.query.displayName || '').trim();
      const pictureUrl = String(req.query.pictureUrl || '').trim();
      if (!lineUserId) {
        return res.status(400).json({ error: 'INVALID_USER', message: 'กรุณาระบุ lineUserId' });
      }
      const state = store.getParticipantState(lineUserId, { displayName, pictureUrl });
      return res.json(state);
    } catch (err) {
      return res.status(400).json({ error: err.code || 'ERROR', message: err.message });
    }
  });

  // Scan booth QR
  router.post('/api/scan', (req, res) => {
    try {
      const { lineUserId, displayName, pictureUrl, boothCode } = req.body || {};
      const result = store.scanBooth({ lineUserId, displayName, pictureUrl, boothCode });
      return res.json(result);
    } catch (err) {
      if (err.code === 'COOLDOWN_ACTIVE') {
        return res.status(429).json({
          error: err.code,
          message: err.message,
          remainingSeconds: err.remainingSeconds
        });
      }
      if (err.code === 'BOOTH_NOT_FOUND') {
        return res.status(404).json({ error: err.code, message: err.message });
      }
      return res.status(400).json({ error: err.code || 'SCAN_ERROR', message: err.message });
    }
  });

  // Save short post-completion profile
  router.post('/api/profile', (req, res) => {
    try {
      const { lineUserId, gradeLevel, schoolName } = req.body || {};
      const state = store.saveProfile({ lineUserId, gradeLevel, schoolName });
      return res.json(state);
    } catch (err) {
      return res.status(400).json({ error: err.code || 'PROFILE_ERROR', message: err.message });
    }
  });

  // Mark Google Form evaluation survey as completed
  router.post('/api/survey-complete', (req, res) => {
    try {
      const { lineUserId } = req.body || {};
      const state = store.completeSurvey(lineUserId);
      return res.json(state);
    } catch (err) {
      return res.status(400).json({ error: err.code || 'SURVEY_ERROR', message: err.message });
    }
  });

  // Confirm reward redemption in front of staff
  router.post('/api/redeem', (req, res) => {
    try {
      const { lineUserId } = req.body || {};
      const state = store.redeemReward(lineUserId);
      return res.json(state);
    } catch (err) {
      return res.status(400).json({ error: err.code || 'REDEEM_ERROR', message: err.message });
    }
  });

  // Generate SVG QR Code for booth poster
  router.get('/api/qr/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').trim();
      const customUrl = String(req.query.url || '').trim();
      const mountPrefix = req.baseUrl || '';
      const defaultHostUrl = `${req.protocol}://${req.get('host')}${mountPrefix}`;
      const base = customUrl ||
        (liffId ? `https://liff.line.me/${liffId}` : (publicBaseUrl || defaultHostUrl));
      const sep = base.includes('?') ? '&' : '?';
      const targetUrl = customUrl ? customUrl : `${base.replace(/\/$/, '')}${sep}booth=${encodeURIComponent(code)}`;

      const svg = await QRCode.toString(targetUrl, {
        type: 'svg',
        margin: 1,
        width: 360,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      return res.send(svg);
    } catch (err) {
      return res.status(500).json({ error: 'QR_ERROR', message: err.message });
    }
  });

  // Lookup booth details by code (for printable poster page)
  router.get('/api/booth-by-code/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toLowerCase();
    const booth = store.listBooths({ activeOnly: false }).find((b) => String(b.code).toLowerCase() === code);
    if (!booth) {
      return res.status(404).json({ error: 'BOOTH_NOT_FOUND', message: 'ไม่พบข้อมูลฐานกิจกรรม' });
    }
    return res.json({
      booth,
      settings: store.getSettings(),
      liffId,
      lineOaId,
      publicBaseUrl
    });
  });

  // Admin auth middleware
  function requireAdmin(req, res, next) {
    const provided = String(req.headers['x-admin-password'] || req.query.key || '').trim();
    if (!provided || provided !== adminPassword) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง' });
    }
    return next();
  }

  router.get('/api/admin/overview', requireAdmin, (_req, res) => {
    res.json(store.getAdminOverview());
  });

  router.post('/api/admin/booths', requireAdmin, (req, res) => {
    try {
      const booth = store.createBooth(req.body || {});
      return res.status(201).json(booth);
    } catch (err) {
      return res.status(400).json({ error: err.code || 'BOOTH_ERROR', message: err.message });
    }
  });

  router.put('/api/admin/booths/:id', requireAdmin, (req, res) => {
    try {
      const booth = store.updateBooth(req.params.id, req.body || {});
      return res.json(booth);
    } catch (err) {
      return res.status(400).json({ error: err.code || 'BOOTH_ERROR', message: err.message });
    }
  });

  router.delete('/api/admin/booths/:id', requireAdmin, (req, res) => {
    const ok = store.deleteBooth(req.params.id);
    res.json({ deleted: ok });
  });

  router.post('/api/admin/booths/reset-defaults', requireAdmin, (_req, res) => {
    const booths = store.seedDefaultBooths({ replaceExisting: true });
    res.json({ booths });
  });

  router.post('/api/admin/settings', requireAdmin, (req, res) => {
    const updated = store.updateSettings(req.body || {});
    res.json(updated);
  });

  router.post('/api/admin/participants/:lineUserId/toggle-redeem', requireAdmin, (req, res) => {
    try {
      const { isRedeemed } = req.body || {};
      const state = store.toggleRedeemAdmin(req.params.lineUserId, isRedeemed);
      return res.json(state);
    } catch (err) {
      return res.status(400).json({ error: err.code || 'ERROR', message: err.message });
    }
  });

  router.get('/api/admin/export.csv', requireAdmin, (_req, res) => {
    const csv = store.exportCsv();
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="openhouse-participants-${dateStr}.csv"`);
    res.send(csv);
  });

  // Redirect bare /openhouse to /openhouse/ (preserving query string like ?booth=...)
  app.use((req, res, next) => {
    if (req.originalUrl === '/openhouse' || req.originalUrl.startsWith('/openhouse?')) {
      const query = req.originalUrl.slice('/openhouse'.length);
      return res.redirect(302, `/openhouse/${query}`);
    }
    return next();
  });

  // Mount under both /openhouse (for Nginx Proxy Manager custom location) and / (root)
  app.use('/openhouse', router);
  app.use('/', router);

  return app;
}

module.exports = { createApp };
