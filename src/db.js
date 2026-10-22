const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_BOOTHS = [
  {
    code: 'ST-01-ROBOT',
    name: 'ฐานที่ 1: หุ่นยนต์และระบบอัตโนมัติ',
    description: 'สาธิตแขนกลอุตสาหกรรมและหุ่นยนต์อัจฉริยะ',
    icon: '🤖',
    sort_order: 1
  },
  {
    code: 'ST-02-ENERGY',
    name: 'ฐานที่ 2: พลังงานและสิ่งแวดล้อม',
    description: 'นวัตกรรมพลังงานสะอาดและเทคโนโลยีเพื่อความยั่งยืน',
    icon: '⚡',
    sort_order: 2
  },
  {
    code: 'ST-03-BIOFOOD',
    name: 'ฐานที่ 3: นวัตกรรมอาหารและชีวภาพ',
    description: 'เทคโนโลยีแปรรูปอาหารและการวิจัยทางชีวภาพ',
    icon: '🔬',
    sort_order: 3
  },
  {
    code: 'ST-04-SMARTIOT',
    name: 'ฐานที่ 4: Smart Tech & IoT',
    description: 'ระบบเซ็นเซอร์อัจฉริยะและการพัฒนาซอฟต์แวร์ยุคใหม่',
    icon: '🚀',
    sort_order: 4
  }
];

const DEFAULT_SETTINGS = {
  event_title: 'KMUTNB Techno Park Open House',
  event_subtitle: 'อุทยานเทคโนโลยี มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ',
  cooldown_seconds: '60',
  prize_description: 'สะสมแสตมป์ครบทุกฐาน รับของที่ระลึกสุดพิเศษที่จุดลงทะเบียน!'
};

function createError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function createDb(dbPath = ':memory:') {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS booths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '📍',
      sort_order INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      line_user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      picture_url TEXT DEFAULT '',
      grade_level TEXT DEFAULT '',
      school_name TEXT DEFAULT '',
      is_redeemed INTEGER DEFAULT 0,
      redeemed_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stamps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT NOT NULL,
      booth_id INTEGER NOT NULL,
      scanned_at TEXT NOT NULL,
      scanned_at_ms INTEGER NOT NULL,
      UNIQUE(line_user_id, booth_id),
      FOREIGN KEY (line_user_id) REFERENCES participants(line_user_id) ON DELETE CASCADE,
      FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default booths if empty
  const boothCountRow = db.prepare('SELECT COUNT(*) AS count FROM booths').get();
  if (Number(boothCountRow.count) === 0) {
    const insertBooth = db.prepare(`
      INSERT INTO booths (code, name, description, icon, sort_order, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    const nowIso = new Date().toISOString();
    for (const b of DEFAULT_BOOTHS) {
      insertBooth.run(b.code, b.name, b.description, b.icon, b.sort_order, nowIso);
    }
  }

  // Seed default settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(k, String(v));
  }

  function getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const result = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      result[r.key] = r.value;
    }
    result.cooldown_seconds = Number(result.cooldown_seconds) || 0;
    return result;
  }

  function updateSettings(patch = {}) {
    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined && v !== null) {
        upsert.run(k, String(v));
      }
    }
    return getSettings();
  }

  function listBooths({ activeOnly = false } = {}) {
    const sql = activeOnly
      ? 'SELECT * FROM booths WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
      : 'SELECT * FROM booths ORDER BY sort_order ASC, id ASC';
    return db.prepare(sql).all();
  }

  function createBooth({ name, description = '', icon = '📍', code, sort_order, is_active = 1 }) {
    if (!name || !String(name).trim()) {
      throw createError('INVALID_BOOTH', 'กรุณาระบุชื่อฐานกิจกรรม');
    }
    const cleanCode = (code && String(code).trim()) ||
      `ST-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const maxOrderRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM booths').get();
    const order = sort_order !== undefined ? Number(sort_order) : Number(maxOrderRow.max_order) + 1;
    const nowIso = new Date().toISOString();

    const info = db.prepare(`
      INSERT INTO booths (code, name, description, icon, sort_order, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cleanCode, String(name).trim(), String(description).trim(), String(icon || '📍').trim(), order, is_active ? 1 : 0, nowIso);

    return db.prepare('SELECT * FROM booths WHERE id = ?').get(info.lastInsertRowid);
  }

  function updateBooth(id, patch = {}) {
    const existing = db.prepare('SELECT * FROM booths WHERE id = ?').get(Number(id));
    if (!existing) {
      throw createError('BOOTH_NOT_FOUND', 'ไม่พบฐานกิจกรรมที่ระบุ');
    }
    const updated = {
      name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
      description: patch.description !== undefined ? String(patch.description).trim() : existing.description,
      icon: patch.icon !== undefined ? String(patch.icon).trim() : existing.icon,
      code: patch.code !== undefined ? String(patch.code).trim() : existing.code,
      sort_order: patch.sort_order !== undefined ? Number(patch.sort_order) : existing.sort_order,
      is_active: patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : existing.is_active
    };

    db.prepare(`
      UPDATE booths
      SET name = ?, description = ?, icon = ?, code = ?, sort_order = ?, is_active = ?
      WHERE id = ?
    `).run(updated.name, updated.description, updated.icon, updated.code, updated.sort_order, updated.is_active, Number(id));

    return db.prepare('SELECT * FROM booths WHERE id = ?').get(Number(id));
  }

  function deleteBooth(id) {
    const info = db.prepare('DELETE FROM booths WHERE id = ?').run(Number(id));
    return info.changes > 0;
  }

  function ensureParticipant({ lineUserId, displayName = 'ผู้เข้าร่วมงาน', pictureUrl = '' }) {
    if (!lineUserId || !String(lineUserId).trim()) {
      throw createError('INVALID_USER', 'ไม่พบรหัสผู้ใช้งาน LINE');
    }
    const uid = String(lineUserId).trim();
    const existing = db.prepare('SELECT * FROM participants WHERE line_user_id = ?').get(uid);
    const nowIso = new Date().toISOString();

    if (!existing) {
      db.prepare(`
        INSERT INTO participants (line_user_id, display_name, picture_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(uid, String(displayName || 'ผู้เข้าร่วมงาน').trim(), String(pictureUrl || ''), nowIso, nowIso);
    } else if (displayName || pictureUrl) {
      db.prepare(`
        UPDATE participants
        SET display_name = COALESCE(NULLIF(?, ''), display_name),
            picture_url = COALESCE(NULLIF(?, ''), picture_url),
            updated_at = ?
        WHERE line_user_id = ?
      `).run(String(displayName || '').trim(), String(pictureUrl || ''), nowIso, uid);
    }
    return db.prepare('SELECT * FROM participants WHERE line_user_id = ?').get(uid);
  }

  function getParticipantState(lineUserId, { displayName, pictureUrl } = {}) {
    const participant = ensureParticipant({ lineUserId, displayName, pictureUrl });
    const activeBooths = listBooths({ activeOnly: true });
    const userStamps = db.prepare(`
      SELECT s.booth_id, s.scanned_at, s.scanned_at_ms
      FROM stamps s
      WHERE s.line_user_id = ?
      ORDER BY s.scanned_at_ms ASC
    `).all(participant.line_user_id);

    const stampMap = new Map(userStamps.map((s) => [Number(s.booth_id), s]));
    const boothsWithStatus = activeBooths.map((b) => {
      const st = stampMap.get(Number(b.id));
      return {
        id: b.id,
        code: b.code,
        name: b.name,
        description: b.description,
        icon: b.icon,
        sort_order: b.sort_order,
        stamped: Boolean(st),
        scanned_at: st ? st.scanned_at : null
      };
    });

    const stampedCount = boothsWithStatus.filter((b) => b.stamped).length;
    const totalBooths = boothsWithStatus.length;
    const isCompleted = totalBooths > 0 && stampedCount >= totalBooths;
    const hasProfile = Boolean(participant.grade_level && participant.school_name);

    return {
      participant,
      booths: boothsWithStatus,
      stampedCount,
      totalBooths,
      isCompleted,
      hasProfile,
      isRedeemed: Boolean(participant.is_redeemed),
      settings: getSettings()
    };
  }

  function scanBooth({ lineUserId, displayName, pictureUrl, boothCode, nowMs = Date.now() }) {
    if (!boothCode || !String(boothCode).trim()) {
      throw createError('INVALID_BOOTH_CODE', 'ไม่พบรหัส QR Code ของฐานกิจกรรม');
    }
    const participant = ensureParticipant({ lineUserId, displayName, pictureUrl });
    const cleanCode = String(boothCode).trim();
    const booth = db.prepare('SELECT * FROM booths WHERE LOWER(code) = LOWER(?) AND is_active = 1').get(cleanCode);

    if (!booth) {
      throw createError('BOOTH_NOT_FOUND', 'ไม่พบฐานกิจกรรมนี้ หรือฐานกิจกรรมปิดอยู่');
    }

    // Check if already stamped (idempotent!)
    const existingStamp = db.prepare(
      'SELECT * FROM stamps WHERE line_user_id = ? AND booth_id = ?'
    ).get(participant.line_user_id, booth.id);

    if (existingStamp) {
      return {
        alreadyStamped: true,
        booth,
        state: getParticipantState(participant.line_user_id)
      };
    }

    // Check cooldown against latest scan of any other booth
    const settings = getSettings();
    const cooldownSeconds = Number(settings.cooldown_seconds) || 0;
    if (cooldownSeconds > 0) {
      const latestStamp = db.prepare(
        'SELECT MAX(scanned_at_ms) AS last_ms FROM stamps WHERE line_user_id = ?'
      ).get(participant.line_user_id);

      if (latestStamp && latestStamp.last_ms !== null) {
        const elapsedMs = nowMs - Number(latestStamp.last_ms);
        const cooldownMs = cooldownSeconds * 1000;
        if (elapsedMs < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
          throw createError(
            'COOLDOWN_ACTIVE',
            `กรุณาเดินชมฐานกิจกรรมสักครู่ (สแกนฐานถัดไปได้ในอีก ${remainingSeconds} วินาที)`,
            { remainingSeconds }
          );
        }
      }
    }

    const nowIso = new Date(nowMs).toISOString();
    db.prepare(`
      INSERT INTO stamps (line_user_id, booth_id, scanned_at, scanned_at_ms)
      VALUES (?, ?, ?, ?)
    `).run(participant.line_user_id, booth.id, nowIso, nowMs);

    return {
      alreadyStamped: false,
      booth,
      state: getParticipantState(participant.line_user_id)
    };
  }

  function saveProfile({ lineUserId, gradeLevel, schoolName }) {
    const state = getParticipantState(lineUserId);
    const cleanGrade = String(gradeLevel || '').trim();
    const cleanSchool = String(schoolName || '').trim();

    if (!cleanGrade || !cleanSchool) {
      throw createError('INVALID_PROFILE', 'กรุณาเลือกระดับชั้นและกรอกชื่อโรงเรียนให้ครบถ้วน');
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE participants
      SET grade_level = ?, school_name = ?, updated_at = ?
      WHERE line_user_id = ?
    `).run(cleanGrade, cleanSchool, nowIso, state.participant.line_user_id);

    return getParticipantState(lineUserId);
  }

  function redeemReward(lineUserId) {
    const state = getParticipantState(lineUserId);
    if (!state.isCompleted) {
      throw createError('NOT_COMPLETED', 'ยังสะสมแสตมป์ไม่ครบทุกฐาน');
    }
    if (!state.hasProfile) {
      throw createError('PROFILE_INCOMPLETE', 'กรุณากรอกระดับชั้นและชื่อโรงเรียนก่อนรับรางวัล');
    }
    if (state.isRedeemed) {
      return state;
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE participants
      SET is_redeemed = 1, redeemed_at = ?, updated_at = ?
      WHERE line_user_id = ?
    `).run(nowIso, nowIso, state.participant.line_user_id);

    return getParticipantState(lineUserId);
  }

  function toggleRedeemAdmin(lineUserId, forceState) {
    const state = getParticipantState(lineUserId);
    const nextRedeemed = forceState !== undefined ? (forceState ? 1 : 0) : (state.isRedeemed ? 0 : 1);
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE participants
      SET is_redeemed = ?, redeemed_at = ?, updated_at = ?
      WHERE line_user_id = ?
    `).run(nextRedeemed, nextRedeemed ? nowIso : null, nowIso, state.participant.line_user_id);
    return getParticipantState(lineUserId);
  }

  function getAdminOverview() {
    const allBooths = listBooths({ activeOnly: false });
    const activeBooths = allBooths.filter((b) => b.is_active === 1);
    const activeBoothIds = new Set(activeBooths.map((b) => Number(b.id)));

    const stampCounts = db.prepare(`
      SELECT booth_id, COUNT(*) AS scan_count
      FROM stamps
      GROUP BY booth_id
    `).all();
    const countByBooth = new Map(stampCounts.map((r) => [Number(r.booth_id), Number(r.scan_count)]));

    const boothsWithStats = allBooths.map((b) => ({
      ...b,
      scan_count: countByBooth.get(Number(b.id)) || 0
    }));

    const participants = db.prepare(`
      SELECT * FROM participants ORDER BY updated_at DESC
    `).all();

    const allStamps = db.prepare('SELECT line_user_id, booth_id, scanned_at FROM stamps').all();
    const stampsByUser = new Map();
    for (const s of allStamps) {
      if (!stampsByUser.has(s.line_user_id)) {
        stampsByUser.set(s.line_user_id, []);
      }
      stampsByUser.get(s.line_user_id).push(s);
    }

    const enrichedParticipants = participants.map((p) => {
      const userStamps = stampsByUser.get(p.line_user_id) || [];
      const activeScannedCount = userStamps.filter((s) => activeBoothIds.has(Number(s.booth_id))).length;
      const isCompleted = activeBooths.length > 0 && activeScannedCount >= activeBooths.length;
      return {
        ...p,
        stamped_count: activeScannedCount,
        total_active_booths: activeBooths.length,
        is_completed: isCompleted,
        stamps: userStamps
      };
    });

    const stats = {
      totalParticipants: enrichedParticipants.length,
      completedCount: enrichedParticipants.filter((p) => p.is_completed).length,
      redeemedCount: enrichedParticipants.filter((p) => p.is_redeemed === 1).length,
      activeBoothCount: activeBooths.length
    };

    return {
      stats,
      booths: boothsWithStats,
      participants: enrichedParticipants,
      settings: getSettings()
    };
  }

  function exportCsv() {
    const overview = getAdminOverview();
    const booths = overview.booths;

    const headers = [
      'LINE User ID',
      'ชื่อใน LINE',
      'ระดับชั้น',
      'โรงเรียน/สถาบัน',
      'จำนวนฐานที่เข้า',
      'สถานะสะสมครบ',
      'สถานะรับของรางวัล',
      'เวลารับของรางวัล',
      ...booths.map((b) => b.name)
    ];

    const rows = [headers.map(escapeCsvField).join(',')];

    for (const p of overview.participants) {
      const stampTimeByBooth = new Map((p.stamps || []).map((s) => [Number(s.booth_id), s.scanned_at]));
      const row = [
        p.line_user_id,
        p.display_name,
        p.grade_level || '',
        p.school_name || '',
        `${p.stamped_count}/${p.total_active_booths}`,
        p.is_completed ? 'ครบแล้ว' : 'ยังไม่ครบ',
        p.is_redeemed ? 'รับรางวัลแล้ว' : 'ยังไม่ได้รับ',
        p.redeemed_at || '',
        ...booths.map((b) => stampTimeByBooth.get(Number(b.id)) || '')
      ];
      rows.push(row.map(escapeCsvField).join(','));
    }

    return '\uFEFF' + rows.join('\r\n') + '\r\n';
  }

  return {
    db,
    getSettings,
    updateSettings,
    listBooths,
    createBooth,
    updateBooth,
    deleteBooth,
    getParticipantState,
    scanBooth,
    saveProfile,
    redeemReward,
    toggleRedeemAdmin,
    getAdminOverview,
    exportCsv
  };
}

module.exports = { createDb };
