(function () {
  const BASE_PATH = window.location.pathname.startsWith('/openhouse') ? '/openhouse' : '';
  let adminPassword = sessionStorage.getItem('openhouse_admin_pw') || '';
  let cachedOverview = null;

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
    statRedeemed: document.getElementById('statRedeemed'),
    statBooths: document.getElementById('statBooths'),
    boothListContainer: document.getElementById('boothListContainer'),
    newBoothIcon: document.getElementById('newBoothIcon'),
    newBoothName: document.getElementById('newBoothName'),
    newBoothDesc: document.getElementById('newBoothDesc'),
    addBoothBtn: document.getElementById('addBoothBtn'),
    settingEventTitle: document.getElementById('settingEventTitle'),
    settingPrizeDesc: document.getElementById('settingPrizeDesc'),
    settingRequiredStamps: document.getElementById('settingRequiredStamps'),
    settingCooldown: document.getElementById('settingCooldown'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    settingsSavedMsg: document.getElementById('settingsSavedMsg'),
    searchParticipantInput: document.getElementById('searchParticipantInput'),
    participantsTableBody: document.getElementById('participantsTableBody')
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

    els.settingEventTitle.value = data.settings.event_title || '';
    els.settingPrizeDesc.value = data.settings.prize_description || '';
    if (els.settingRequiredStamps) {
      els.settingRequiredStamps.value = data.settings.required_stamps ?? 3;
    }
    els.settingCooldown.value = data.settings.cooldown_seconds ?? 60;

    // Render Booths
    els.boothListContainer.innerHTML = '';
    data.booths.forEach((b) => {
      const row = document.createElement('div');
      row.className = `booth-row ${b.is_active ? '' : 'inactive'}`;
      row.innerHTML = `
        <div>
          <div style="font-weight: 700; font-size: 14px;">
            ${escapeHtml(b.icon || '📍')} ${escapeHtml(b.name)}
            <span style="font-size: 11px; color: #059669; margin-left: 6px;">(สแกนแล้ว ${Number(b.scan_count) || 0} คน)</span>
          </div>
          <div style="font-size: 12px; color: #64748b;">
            รหัส QR: <code>${escapeHtml(b.code)}</code> • ${escapeHtml(b.description || '-')}
          </div>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <a href="${BASE_PATH}/poster.html?code=${encodeURIComponent(b.code)}" target="_blank" class="small-btn primary">🖨️ พิมพ์ป้าย QR</a>
          <button class="small-btn toggle-btn">${b.is_active ? 'ปิดฐาน' : 'เปิดฐาน'}</button>
          <button class="small-btn edit-btn">แก้ไขชื่อ</button>
          <button class="small-btn danger del-btn">ลบ</button>
        </div>
      `;

      row.querySelector('.toggle-btn').addEventListener('click', async () => {
        await apiAdmin(`/api/admin/booths/${b.id}`, {
          method: 'PUT',
          body: JSON.stringify({ is_active: b.is_active ? 0 : 1 })
        });
        await fetchOverview();
      });

      row.querySelector('.edit-btn').addEventListener('click', async () => {
        const newName = prompt('แก้ไขชื่อฐานกิจกรรม:', b.name);
        if (!newName) return;
        const newDesc = prompt('แก้ไขคำอธิบายฐาน:', b.description || '');
        await apiAdmin(`/api/admin/booths/${b.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: newName, description: newDesc ?? b.description })
        });
        await fetchOverview();
      });

      row.querySelector('.del-btn').addEventListener('click', async () => {
        if (!confirm(`ต้องการลบ "${b.name}" ใช่หรือไม่?`)) return;
        await apiAdmin(`/api/admin/booths/${b.id}`, { method: 'DELETE' });
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
        <tr><td colspan="6" style="text-align:center;color:#64748b;padding:24px;">ยังไม่มีข้อมูลผู้เข้าร่วม</td></tr>
      `;
      return;
    }

    list.forEach((p) => {
      const tr = document.createElement('tr');
      const statusBadge = p.is_redeemed
        ? `<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:99px;font-weight:700;font-size:11px;">✓ รับรางวัลแล้ว</span>`
        : p.is_completed
        ? `<span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:99px;font-weight:700;font-size:11px;">พร้อมแลกรางวัล</span>`
        : `<span style="color:#64748b;font-size:12px;">กำลังสะสม</span>`;

      tr.innerHTML = `
        <td><strong>${escapeHtml(p.display_name)}</strong></td>
        <td>${escapeHtml(p.grade_level || '-')}</td>
        <td>${escapeHtml(p.school_name || '-')}</td>
        <td><strong>${Number(p.stamped_count) || 0} / ${Number(p.required_stamps) || 3}</strong> ฐาน <span style="font-size:11px;color:#64748b;">(จาก ${Number(p.total_active_booths) || 0})</span></td>
        <td>${statusBadge}</td>
        <td>
          <button class="small-btn toggle-redeem-btn">
            ${p.is_redeemed ? 'ยกเลิกสถานะรับของ' : 'กดยืนยันรับของให้'}
          </button>
        </td>
      `;

      tr.querySelector('.toggle-redeem-btn').addEventListener('click', async () => {
        await apiAdmin(`/api/admin/participants/${encodeURIComponent(p.line_user_id)}/toggle-redeem`, {
          method: 'POST',
          body: JSON.stringify({ isRedeemed: !p.is_redeemed })
        });
        await fetchOverview();
      });

      els.participantsTableBody.appendChild(tr);
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

  els.refreshBtn.addEventListener('click', fetchOverview);

  els.exportCsvBtn.addEventListener('click', () => {
    window.location.href = `${BASE_PATH}/api/admin/export.csv?key=${encodeURIComponent(adminPassword)}`;
  });

  els.addBoothBtn.addEventListener('click', async () => {
    const icon = els.newBoothIcon.value.trim() || '📍';
    const name = els.newBoothName.value.trim();
    const description = els.newBoothDesc.value.trim();
    if (!name) {
      alert('กรุณาระบุชื่อฐานกิจกรรม');
      return;
    }
    await apiAdmin('/api/admin/booths', {
      method: 'POST',
      body: JSON.stringify({ icon, name, description })
    });
    els.newBoothName.value = '';
    els.newBoothDesc.value = '';
    await fetchOverview();
  });

  els.saveSettingsBtn.addEventListener('click', async () => {
    await apiAdmin('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({
        event_title: els.settingEventTitle.value.trim(),
        prize_description: els.settingPrizeDesc.value.trim(),
        required_stamps: Math.max(1, Number(els.settingRequiredStamps ? els.settingRequiredStamps.value : 3) || 3),
        cooldown_seconds: Number(els.settingCooldown.value) || 0
      })
    });
    els.settingsSavedMsg.textContent = '✓ บันทึกการตั้งค่าเรียบร้อยแล้ว';
    setTimeout(() => {
      els.settingsSavedMsg.textContent = '';
    }, 3000);
    await fetchOverview();
  });

  els.searchParticipantInput.addEventListener('input', renderParticipantsTable);

  if (adminPassword) {
    fetchOverview();
  }
})();
