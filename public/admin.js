(function () {
  const BASE_PATH = window.location.pathname.startsWith('/openhouse') ? '/openhouse' : '';
  let adminPassword = sessionStorage.getItem('openhouse_admin_pw') || '';
  let cachedOverview = null;
  let editingBoothId = null;

  const PRESET_ICONS = [
    '🛩️', '🤖', '🚄', '🌱', '📶', '📡', '💡', '🩺', '🚀',
    '✈️', '🛡️', '🦾', '🚆', '♻️', '⚡', '🎯', '🧠', '🛰️'
  ];

  const els = {
    loginBox: document.getElementById('loginBox'),
    dashboardBox: document.getElementById('dashboardBox'),
    adminPasswordInput: document.getElementById('adminPasswordInput'),
    loginBtn: document.getElementById('loginBtn'),
    loginError: document.getElementById('loginError'),
    refreshBtn: document.getElementById('refreshBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    statTotal: document.getElementById('statTotal'),
    statCompleted: document.getElementById('statCompleted'),
    statRequiredLabel: document.getElementById('statRequiredLabel'),
    statRedeemed: document.getElementById('statRedeemed'),
    statBooths: document.getElementById('statBooths'),
    boothListContainer: document.getElementById('boothListContainer'),
    resetDefaultBoothsBtn: document.getElementById('resetDefaultBoothsBtn'),
    openAddBoothModalBtn: document.getElementById('openAddBoothModalBtn'),
    settingEventTitle: document.getElementById('settingEventTitle'),
    settingPrizeDesc: document.getElementById('settingPrizeDesc'),
    settingRequiredStamps: document.getElementById('settingRequiredStamps'),
    settingCooldown: document.getElementById('settingCooldown'),
    settingGoogleFormUrl: document.getElementById('settingGoogleFormUrl'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    settingsSavedMsg: document.getElementById('settingsSavedMsg'),
    searchParticipantInput: document.getElementById('searchParticipantInput'),
    clearParticipantsBtn: document.getElementById('clearParticipantsBtn'),
    participantsTableBody: document.getElementById('participantsTableBody'),
    boothModal: document.getElementById('boothModal'),
    boothModalTitle: document.getElementById('boothModalTitle'),
    closeBoothModalBtn: document.getElementById('closeBoothModalBtn'),
    cancelBoothModalBtn: document.getElementById('cancelBoothModalBtn'),
    saveBoothModalBtn: document.getElementById('saveBoothModalBtn'),
    modalBoothIcon: document.getElementById('modalBoothIcon'),
    modalBoothName: document.getElementById('modalBoothName'),
    modalBoothDesc: document.getElementById('modalBoothDesc'),
    modalBoothCode: document.getElementById('modalBoothCode'),
    modalBoothOrder: document.getElementById('modalBoothOrder'),
    iconPickerGrid: document.getElementById('iconPickerGrid'),
    adminToast: document.getElementById('adminToast')
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showAdminToast(msg) {
    if (!els.adminToast) return;
    els.adminToast.textContent = msg;
    els.adminToast.classList.add('show');
    setTimeout(() => {
      if (els.adminToast.textContent === msg) {
        els.adminToast.classList.remove('show');
      }
    }, 3200);
  }

  function renderIconPicker() {
    if (!els.iconPickerGrid) return;
    els.iconPickerGrid.innerHTML = '';
    const currentIcon = els.modalBoothIcon.value.trim();
    PRESET_ICONS.forEach((ic) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `icon-choice-btn ${ic === currentIcon ? 'selected' : ''}`;
      btn.textContent = ic;
      btn.addEventListener('click', () => {
        els.modalBoothIcon.value = ic;
        renderIconPicker();
      });
      els.iconPickerGrid.appendChild(btn);
    });
  }

  function openBoothModal(booth = null) {
    if (booth) {
      editingBoothId = booth.id;
      els.boothModalTitle.textContent = '✏️ แก้ไขข้อมูลฐานกิจกรรม';
      els.modalBoothIcon.value = booth.icon || '📍';
      els.modalBoothName.value = booth.name || '';
      els.modalBoothDesc.value = booth.description || '';
      els.modalBoothCode.value = booth.code || '';
      els.modalBoothOrder.value = booth.sort_order ?? 1;
    } else {
      editingBoothId = null;
      const nextOrder = cachedOverview && cachedOverview.booths ? cachedOverview.booths.length + 1 : 1;
      els.boothModalTitle.textContent = '+ เพิ่มฐานกิจกรรมใหม่';
      els.modalBoothIcon.value = '📍';
      els.modalBoothName.value = '';
      els.modalBoothDesc.value = '';
      els.modalBoothCode.value = `ST-0${nextOrder}`;
      els.modalBoothOrder.value = nextOrder;
    }
    renderIconPicker();
    els.boothModal.classList.add('open');
    els.modalBoothName.focus();
  }

  function closeBoothModal() {
    els.boothModal.classList.remove('open');
    editingBoothId = null;
  }

  async function apiAdmin(path, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      options.headers || {}
    );
    return fetch(`${BASE_PATH}${path}`, Object.assign({}, options, { headers }));
  }

  async function fetchOverview() {
    const res = await apiAdmin('/api/admin/overview');
    if (res.status === 401) {
      sessionStorage.removeItem('openhouse_admin_pw');
      els.loginBox.style.display = 'block';
      els.dashboardBox.style.display = 'none';
      els.loginError.textContent = 'รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง';
      return false;
    }
    const data = await res.json();
    cachedOverview = data;
    els.loginBox.style.display = 'none';
    els.dashboardBox.style.display = 'block';
    renderDashboard(data);
    return true;
  }

  function renderDashboard(data) {
    els.statTotal.textContent = data.stats.totalParticipants;
    els.statCompleted.textContent = data.stats.completedCount;
    els.statRedeemed.textContent = data.stats.redeemedCount;
    els.statBooths.textContent = data.stats.activeBoothCount;
    if (els.statRequiredLabel) {
      els.statRequiredLabel.textContent = `เกณฑ์ขั้นต่ำ ${data.stats.requiredStamps || 3} ฐาน`;
    }

    els.settingEventTitle.value = data.settings.event_title || '';
    els.settingPrizeDesc.value = data.settings.prize_description || '';
    if (els.settingRequiredStamps) {
      els.settingRequiredStamps.value = data.settings.required_stamps ?? 3;
    }
    els.settingCooldown.value = data.settings.cooldown_seconds ?? 60;
    if (els.settingGoogleFormUrl) {
      els.settingGoogleFormUrl.value = data.settings.google_form_url || '';
    }

    // Render Booths
    els.boothListContainer.innerHTML = '';
    data.booths.forEach((b) => {
      const row = document.createElement('div');
      row.className = `booth-card ${b.is_active ? '' : 'inactive'}`;
      row.innerHTML = `
        <div class="booth-icon-box" aria-hidden="true">${escapeHtml(b.icon || '📍')}</div>
        <div class="booth-main">
          <div class="booth-title-row">
            <span class="booth-name-text">${escapeHtml(b.name)}</span>
            <span class="pill ${b.is_active ? 'pill-green' : 'pill-slate'}">
              ${b.is_active ? '● เปิดใช้งาน' : '○ ปิดชั่วคราว'}
            </span>
            <span class="pill pill-blue">สแกนแล้ว ${Number(b.scan_count) || 0} คน</span>
          </div>
          <div class="booth-meta-row">
            <span>📍 สถานที่/คำอธิบาย: <strong>${escapeHtml(b.description || '-')}</strong></span>
            <span>• รหัส QR: <code>${escapeHtml(b.code)}</code></span>
          </div>
        </div>
        <div class="booth-actions">
          <a href="${BASE_PATH}/poster.html?code=${encodeURIComponent(b.code)}" target="_blank" class="action-btn primary">🖨️ พิมพ์ป้าย QR</a>
          <button type="button" class="action-btn edit-btn">✏️ แก้ไขฐาน</button>
          <button type="button" class="action-btn toggle-btn">${b.is_active ? 'ปิดฐาน' : 'เปิดฐาน'}</button>
          <button type="button" class="action-btn danger del-btn">ลบ</button>
        </div>
      `;

      row.querySelector('.edit-btn').addEventListener('click', () => {
        openBoothModal(b);
      });

      row.querySelector('.toggle-btn').addEventListener('click', async () => {
        await apiAdmin(`/api/admin/booths/${b.id}`, {
          method: 'PUT',
          body: JSON.stringify({ is_active: b.is_active ? 0 : 1 })
        });
        showAdminToast(b.is_active ? `ปิดการใช้งาน "${b.name}" แล้ว` : `เปิดการใช้งาน "${b.name}" แล้ว`);
        await fetchOverview();
      });

      row.querySelector('.del-btn').addEventListener('click', async () => {
        if (!confirm(`ต้องการลบ "${b.name}" ใช่หรือไม่?`)) return;
        await apiAdmin(`/api/admin/booths/${b.id}`, { method: 'DELETE' });
        showAdminToast(`ลบฐานกิจกรรมเรียบร้อยแล้ว`);
        await fetchOverview();
      });

      els.boothListContainer.appendChild(row);
    });

    renderParticipantsTable();
  }

  function renderParticipantsTable() {
    if (!cachedOverview) return;
    const kw = (els.searchParticipantInput.value || '').trim().toLowerCase();
    const list = cachedOverview.participants.filter((p) => {
      if (!kw) return true;
      return (
        String(p.display_name || '').toLowerCase().includes(kw) ||
        String(p.school_name || '').toLowerCase().includes(kw) ||
        String(p.grade_level || '').toLowerCase().includes(kw)
      );
    });

    els.participantsTableBody.innerHTML = '';
    if (list.length === 0) {
      els.participantsTableBody.innerHTML = `
        <tr><td colspan="6" style="text-align:center;color:#64748b;padding:28px;">ยังไม่มีข้อมูลผู้เข้าร่วม</td></tr>
      `;
      return;
    }

    list.forEach((p) => {
      const tr = document.createElement('tr');
      const statusBadge = p.is_redeemed
        ? `<span class="pill pill-green">✓ รับรางวัลแล้ว</span>`
        : p.is_completed
        ? `<span class="pill pill-blue">พร้อมแลกรางวัล</span>`
        : `<span style="color:#64748b;font-size:12px;">กำลังสะสม</span>`;

      tr.innerHTML = `
        <td><strong>${escapeHtml(p.display_name)}</strong></td>
        <td>${escapeHtml(p.grade_level || '-')}</td>
        <td>${escapeHtml(p.school_name || '-')}</td>
        <td><strong>${Number(p.stamped_count) || 0} / ${Number(p.required_stamps) || 3}</strong> ฐาน <span style="font-size:11px;color:#64748b;">(จาก ${Number(p.total_active_booths) || 0})</span></td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" class="action-btn toggle-redeem-btn" style="padding:5px 10px;font-size:12px;">
              ${p.is_redeemed ? 'ยกเลิกสถานะรับของ' : 'กดยืนยันรับของให้'}
            </button>
            <button type="button" class="action-btn danger del-participant-btn" style="padding:5px 8px;font-size:12px;" title="ลบผู้เข้าร่วมคนนี้">
              ลบ
            </button>
          </div>
        </td>
      `;

      tr.querySelector('.toggle-redeem-btn').addEventListener('click', async () => {
        await apiAdmin(`/api/admin/participants/${encodeURIComponent(p.line_user_id)}/toggle-redeem`, {
          method: 'POST',
          body: JSON.stringify({ isRedeemed: !p.is_redeemed })
        });
        showAdminToast(`อัปเดตสถานะของ ${p.display_name} เรียบร้อยแล้ว`);
        await fetchOverview();
      });

      tr.querySelector('.del-participant-btn').addEventListener('click', async () => {
        if (!confirm(`ต้องการลบข้อมูลการสแกนของ "${p.display_name}" ใช่หรือไม่?`)) return;
        await apiAdmin(`/api/admin/participants/${encodeURIComponent(p.line_user_id)}`, {
          method: 'DELETE'
        });
        showAdminToast(`ลบข้อมูลของ ${p.display_name} เรียบร้อยแล้ว`);
        await fetchOverview();
      });

      els.participantsTableBody.appendChild(tr);
    });
  }

  // Modal listeners
  els.openAddBoothModalBtn.addEventListener('click', () => openBoothModal(null));
  els.closeBoothModalBtn.addEventListener('click', closeBoothModal);
  els.cancelBoothModalBtn.addEventListener('click', closeBoothModal);
  els.modalBoothIcon.addEventListener('input', renderIconPicker);

  els.saveBoothModalBtn.addEventListener('click', async () => {
    const icon = els.modalBoothIcon.value.trim() || '📍';
    const name = els.modalBoothName.value.trim();
    const description = els.modalBoothDesc.value.trim();
    const code = els.modalBoothCode.value.trim();
    const sort_order = Number(els.modalBoothOrder.value) || 1;

    if (!name) {
      alert('กรุณาระบุชื่อฐานกิจกรรม');
      els.modalBoothName.focus();
      return;
    }

    if (editingBoothId) {
      const res = await apiAdmin(`/api/admin/booths/${editingBoothId}`, {
        method: 'PUT',
        body: JSON.stringify({ icon, name, description, code, sort_order })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'ไม่สามารถบันทึกการแก้ไขได้');
        return;
      }
      showAdminToast('✓ บันทึกการแก้ไขฐานกิจกรรมเรียบร้อยแล้ว');
    } else {
      const res = await apiAdmin('/api/admin/booths', {
        method: 'POST',
        body: JSON.stringify({ icon, name, description, code, sort_order })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'ไม่สามารถเพิ่มฐานกิจกรรมได้');
        return;
      }
      showAdminToast('✓ เพิ่มฐานกิจกรรมใหม่เรียบร้อยแล้ว');
    }

    closeBoothModal();
    await fetchOverview();
  });

  if (els.resetDefaultBoothsBtn) {
    els.resetDefaultBoothsBtn.addEventListener('click', async () => {
      if (!confirm('ต้องการตั้งค่ารายชื่อฐานเป็น 9 ศูนย์ปฏิบัติการมาตรฐานของอุทยานเทคโนโลยี มจพ. ใช่หรือไม่?')) {
        return;
      }
      await apiAdmin('/api/admin/booths/reset-defaults', { method: 'POST' });
      showAdminToast('✨ โหลดข้อมูล 9 ศูนย์ปฏิบัติการมาตรฐานเรียบร้อยแล้ว');
      await fetchOverview();
    });
  }

  els.loginBtn.addEventListener('click', async () => {
    adminPassword = els.adminPasswordInput.value.trim();
    if (!adminPassword) return;
    sessionStorage.setItem('openhouse_admin_pw', adminPassword);
    await fetchOverview();
  });

  els.adminPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.loginBtn.click();
  });

  els.refreshBtn.addEventListener('click', async () => {
    await fetchOverview();
    showAdminToast('รีเฟรชข้อมูลล่าสุดแล้ว');
  });

  els.exportCsvBtn.addEventListener('click', () => {
    window.location.href = `${BASE_PATH}/api/admin/export.csv?key=${encodeURIComponent(adminPassword)}`;
  });

  els.saveSettingsBtn.addEventListener('click', async () => {
    await apiAdmin('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({
        event_title: els.settingEventTitle.value.trim(),
        prize_description: els.settingPrizeDesc.value.trim(),
        required_stamps: Math.max(1, Number(els.settingRequiredStamps ? els.settingRequiredStamps.value : 3) || 3),
        cooldown_seconds: Number(els.settingCooldown.value) || 0,
        google_form_url: els.settingGoogleFormUrl ? els.settingGoogleFormUrl.value.trim() : ''
      })
    });
    els.settingsSavedMsg.textContent = '✓ บันทึกการตั้งค่าเรียบร้อยแล้ว';
    showAdminToast('✓ บันทึกการตั้งค่าเกณฑ์หน้างานแล้ว');
    setTimeout(() => {
      els.settingsSavedMsg.textContent = '';
    }, 3000);
    await fetchOverview();
  });

  els.searchParticipantInput.addEventListener('input', renderParticipantsTable);

  if (els.clearParticipantsBtn) {
    els.clearParticipantsBtn.addEventListener('click', async () => {
      if (!confirm('⚠️ ยืนยันการล้างข้อมูลผู้เข้าร่วมและประวัติการสแกนทดสอบทั้งหมดใช่หรือไม่?\n(รายชื่อฐานกิจกรรมทั้ง 9 ฐานและการตั้งค่าหน้างานจะไม่ถูกลบ)')) {
        return;
      }
      await apiAdmin('/api/admin/participants/reset', { method: 'POST' });
      showAdminToast('🗑️ ล้างข้อมูลผู้เข้าร่วมและยอดสแกนทั้งหมดเรียบร้อยแล้ว');
      await fetchOverview();
    });
  }

  if (adminPassword) {
    fetchOverview();
  }
})();
