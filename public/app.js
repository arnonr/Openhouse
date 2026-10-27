(function () {
  const BASE_PATH = window.location.pathname.startsWith('/openhouse') ? '/openhouse' : '';
  let currentUser = {
    lineUserId: '',
    displayName: '',
    pictureUrl: ''
  };
  let appConfig = {
    liffId: '',
    lineOaId: '@096ilctj',
    demoMode: true
  };
  let selectedGrade = 'ม.ปลาย';
  let html5QrScanner = null;
  let editingProfile = false;
  let surveyIframeLoadCount = 0;
  let lastState = null;

  const els = {
    eventTitle: document.getElementById('eventTitle'),
    eventSubtitle: document.getElementById('eventSubtitle'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    userSchoolStatus: document.getElementById('userSchoolStatus'),
    lineOaLink: document.getElementById('lineOaLink'),
    progressText: document.getElementById('progressText'),
    progressBarFill: document.getElementById('progressBarFill'),
    toastBanner: document.getElementById('toastBanner'),
    stampGrid: document.getElementById('stampGrid'),
    completionSection: document.getElementById('completionSection'),
    profileFormView: document.getElementById('profileFormView'),
    surveyFormView: document.getElementById('surveyFormView'),
    surveyPrefillText: document.getElementById('surveyPrefillText'),
    editProfileFromSurveyBtn: document.getElementById('editProfileFromSurveyBtn'),
    surveyLoadingOverlay: document.getElementById('surveyLoadingOverlay'),
    surveyIframe: document.getElementById('surveyIframe'),
    manualSurveyDoneBtn: document.getElementById('manualSurveyDoneBtn'),
    externalSurveyLink: document.getElementById('externalSurveyLink'),
    redeemReadyView: document.getElementById('redeemReadyView'),
    redeemedDoneView: document.getElementById('redeemedDoneView'),
    gradeOptions: document.getElementById('gradeOptions'),
    schoolInput: document.getElementById('schoolInput'),
    saveProfileBtn: document.getElementById('saveProfileBtn'),
    redeemUserInfo: document.getElementById('redeemUserInfo'),
    liveClock: document.getElementById('liveClock'),
    confirmRedeemBtn: document.getElementById('confirmRedeemBtn'),
    redeemedTimeText: document.getElementById('redeemedTimeText'),
    openScannerBtn: document.getElementById('openScannerBtn'),
    demoToolbar: document.getElementById('demoToolbar'),
    demoBoothButtons: document.getElementById('demoBoothButtons'),
    demoNewUserBtn: document.getElementById('demoNewUserBtn'),
    scannerModal: document.getElementById('scannerModal'),
    closeScannerBtn: document.getElementById('closeScannerBtn'),
    manualCodeInput: document.getElementById('manualCodeInput'),
    manualCodeSubmitBtn: document.getElementById('manualCodeSubmitBtn'),
    redeemConfirmModal: document.getElementById('redeemConfirmModal'),
    cancelRedeemModalBtn: document.getElementById('cancelRedeemModalBtn'),
    proceedRedeemModalBtn: document.getElementById('proceedRedeemModalBtn')
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type = 'success') {
    els.toastBanner.textContent = message;
    els.toastBanner.className = `toast-banner ${type}`;
    setTimeout(() => {
      if (els.toastBanner.textContent === message) {
        els.toastBanner.className = 'toast-banner';
      }
    }, 5000);
  }

  function updateClock() {
    const now = new Date();
    els.liveClock.textContent = now.toLocaleTimeString('th-TH', { hour12: false });
  }
  setInterval(updateClock, 1000);
  updateClock();

  function getOrCreateDemoUser(forceNew = false) {
    if (forceNew) {
      localStorage.removeItem('openhouse_demo_user');
    }
    let saved = localStorage.getItem('openhouse_demo_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_e) {}
    }
    const randNum = Math.floor(100 + Math.random() * 900);
    const demoUser = {
      lineUserId: `DEMO-U${Date.now()}-${randNum}`,
      displayName: `น้องนักศึกษา #${randNum}`,
      pictureUrl: ''
    };
    localStorage.setItem('openhouse_demo_user', JSON.stringify(demoUser));
    return demoUser;
  }

  async function initIdentity() {
    const cfgRes = await fetch(`${BASE_PATH}/api/config`);
    appConfig = await cfgRes.json();

    if (appConfig.lineOaId) {
      const cleanOa = appConfig.lineOaId.startsWith('@') ? appConfig.lineOaId : `@${appConfig.lineOaId}`;
      els.lineOaLink.href = `https://line.me/R/ti/p/${cleanOa}`;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const forceDemo = urlParams.get('demo') === '1';

    if (appConfig.liffId && !forceDemo && window.liff) {
      try {
        await window.liff.init({ liffId: appConfig.liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login({ redirectUri: window.location.href });
          return false;
        }
        const profile = await window.liff.getProfile();
        currentUser = {
          lineUserId: profile.userId,
          displayName: profile.displayName || 'ผู้เข้าร่วมงาน',
          pictureUrl: profile.pictureUrl || ''
        };
        return true;
      } catch (err) {
        console.warn('LIFF init fallback to demo user:', err);
      }
    }

    currentUser = getOrCreateDemoUser(false);
    els.demoToolbar.style.display = 'block';
    return true;
  }

  function extractBoothCodeFromInput(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';
    try {
      if (text.startsWith('http://') || text.startsWith('https://')) {
        const u = new URL(text);
        const fromParam = u.searchParams.get('booth');
        if (fromParam) return fromParam.trim();
      }
    } catch (_e) {}
    return text;
  }

  function mapBoothToGoogleFormOption(booth) {
    const text = `${booth.code || ''} ${booth.name || ''}`;
    if (text.includes('5G') || text.includes('ไร้สาย')) {
      return 'ศูนย์ปฏิบัติการนวัตกรรมไร้สายล้ำหน้ายุค 5G (ชั้น 1)';
    }
    if (text.includes('สิ่งแวดล้อม') || text.includes('พลังงาน')) {
      return 'ศูนย์ปฏิบัติการสิ่งแวดล้อมและการอนุรักษ์พลังงาน (ชั้น 1)';
    }
    if (text.includes('ยานยนต์') || text.includes('ขนส่งทางราง')) {
      return 'ศูนย์ปฏิบัติการเทคโนโลยีนวัตกรรมยานยนต์สมัยใหม่และระบบขนส่งทางราง (ชั้น 1)';
    }
    if (text.includes('อากาศยาน') || text.includes('ป้องกันประเทศ')) {
      return 'ศูนย์ปฏิบัติการเทคโนโลยีอากาศยานและการป้องกันประเทศ (ชั้น 1)';
    }
    if (text.includes('อัตโนมัติ') || text.includes('หุ่นยนต์')) {
      return 'ศูนย์ปฏิบัติการระบบอัตโนมัติและหุ่นยนต์ (ชั้น 2)';
    }
    if (text.includes('ชีวภาพ')) {
      return 'ศูนย์ปฏิบัติการเทคโนโลยีชีวภาพและเคมีชีวภาพ (ชั้น 7)';
    }
    if (text.includes('เรดาร์')) {
      return 'ศูนย์ปฏิบัติการเทคโนโลยีเรดาร์ (ชั้น 8)';
    }
    if (text.includes('เครื่องมือแพทย์') || text.includes('แพทย์')) {
      return 'ศูนย์ปฏิบัติการเทคโนโลยีและนวัตกรรมเครื่องมือแพทย์ (ชั้น 9)';
    }
    if (text.includes('อวกาศ')) {
      return 'สถาบันเทคโนโลยีอวกาศนานาชาติเพื่อการพัฒนาเศรษฐกิจ (ชั้น 10)';
    }
    if (text.includes('อเนกประสงค์')) {
      return 'บูธบริเวณอาคารอเนกประสงค์';
    }
    return null;
  }

  function buildGoogleFormUrls(rawFormUrl, state) {
    let baseUrl = String(rawFormUrl || '').trim();
    if (!baseUrl) return null;

    if (baseUrl.includes('18pHeTuocQ8r1J59OKouHnpaMoTKNWbodkqh7L5L6q6o')) {
      baseUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfIdO6uB31VYQSoWR7TwZHEOKB5beq7RcUfI5c21B8mONq2Rw/viewform';
    } else {
      baseUrl = baseUrl.replace(/\/(edit|formResponse)(\?.*)?$/i, '/viewform');
    }

    const baseWithoutQuery = baseUrl.split('?')[0];
    const params = new URLSearchParams();
    params.set('usp', 'pp_url');

    if (state.participant && state.participant.school_name) {
      params.set('entry.895062772', state.participant.school_name);
    }

    const isSat = new Date().getDay() === 6;
    params.set('entry.950814337', isSat ? 'วันเสาร์ที่ 7 พฤศจิกายน 2569' : 'วันศุกร์ที่ 6 พฤศจิกายน 2569');

    const addedCenters = new Set();
    (state.booths || []).forEach((b) => {
      if (b.stamped) {
        const mapped = mapBoothToGoogleFormOption(b);
        if (mapped && !addedCenters.has(mapped)) {
          addedCenters.add(mapped);
          params.append('entry.318598466', mapped);
        }
      }
    });

    const externalUrl = `${baseWithoutQuery}?${params.toString()}`;
    const embedParams = new URLSearchParams(params);
    embedParams.set('embedded', 'true');
    const embedUrl = `${baseWithoutQuery}?${embedParams.toString()}`;

    return { embedUrl, externalUrl, prefilledCentersCount: addedCenters.size };
  }

  function renderState(state) {
    if (!state) return;
    lastState = state;

    if (state.settings) {
      els.eventTitle.textContent = state.settings.event_title || 'KMUTNB Techno Park Open House';
      els.eventSubtitle.textContent = state.settings.prize_description || 'เดินชมฐานกิจกรรม สแกน QR Code สะสมแสตมป์แลกรับของรางวัล';
    }

    const p = state.participant;
    els.userName.textContent = p.display_name;
    if (p.picture_url) {
      els.userAvatar.innerHTML = `<img src="${escapeHtml(p.picture_url)}" alt="avatar" />`;
    } else {
      els.userAvatar.textContent = (p.display_name || 'นร').slice(0, 2);
    }

    const reqStamps = state.requiredStamps || 3;
    if (p.grade_level && p.school_name) {
      els.userSchoolStatus.textContent = `${p.grade_level} • ${p.school_name}`;
    } else {
      els.userSchoolStatus.textContent = `เลือกสแกนให้ครบ ${reqStamps} ฐาน (จากทั้งหมด ${state.totalBooths} ฐาน) เพื่อแลกรางวัล`;
    }

    els.progressText.textContent = `${state.stampedCount} / ${reqStamps} ฐาน`;
    const pct = reqStamps > 0 ? Math.min(100, Math.round((state.stampedCount / reqStamps) * 100)) : 0;
    els.progressBarFill.style.width = `${pct}%`;

    // Render Stamp Cards
    els.stampGrid.innerHTML = '';
    state.booths.forEach((b) => {
      const card = document.createElement('div');
      card.className = `stamp-item ${b.stamped ? 'stamped' : ''}`;
      card.innerHTML = `
        <div class="stamp-icon">${escapeHtml(b.icon || '📍')}</div>
        <div class="stamp-name">${escapeHtml(b.name)}</div>
        <div class="stamp-desc">${escapeHtml(b.description || '')}</div>
        <div class="stamp-badge">${b.stamped ? '✓ ประทับตราแล้ว' : 'รอสแกน QR'}</div>
      `;
      els.stampGrid.appendChild(card);
    });

    // Render Demo Booth Buttons
    els.demoBoothButtons.innerHTML = '';
    state.booths.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'demo-btn';
      btn.textContent = `${b.stamped ? '✓ ' : ''}${b.icon || ''} ${b.name}`;
      btn.addEventListener('click', () => performScan(b.code));
      els.demoBoothButtons.appendChild(btn);
    });

    // Completion & Redemption section
    if (state.isCompleted) {
      els.completionSection.style.display = 'block';
      const rawFormUrl = state.settings && state.settings.google_form_url
        ? String(state.settings.google_form_url).trim()
        : '';

      if (state.isRedeemed) {
        els.profileFormView.style.display = 'none';
        if (els.surveyFormView) els.surveyFormView.style.display = 'none';
        els.redeemReadyView.style.display = 'none';
        els.redeemedDoneView.style.display = 'block';
        const timeFormatted = p.redeemed_at
          ? new Date(p.redeemed_at).toLocaleTimeString('th-TH', { hour12: false })
          : '';
        els.redeemedTimeText.textContent = `ยืนยันรับรางวัลเมื่อเวลา ${timeFormatted} • ${p.display_name} (${p.school_name})`;
      } else if (!state.hasProfile || editingProfile) {
        els.profileFormView.style.display = 'block';
        if (els.surveyFormView) els.surveyFormView.style.display = 'none';
        els.redeemReadyView.style.display = 'none';
        els.redeemedDoneView.style.display = 'none';
        if (p.school_name && !els.schoolInput.value) {
          els.schoolInput.value = p.school_name;
        }
      } else if (!state.hasSurvey && rawFormUrl && els.surveyFormView) {
        els.profileFormView.style.display = 'none';
        els.surveyFormView.style.display = 'block';
        els.redeemReadyView.style.display = 'none';
        els.redeemedDoneView.style.display = 'none';

        const urls = buildGoogleFormUrls(rawFormUrl, state);
        if (urls) {
          if (els.surveyPrefillText) {
            els.surveyPrefillText.textContent = `🏫 กรอกอัตโนมัติ: ${p.school_name} (${urls.prefilledCentersCount} ฐานที่สแกน)`;
          }
          if (els.externalSurveyLink) {
            els.externalSurveyLink.href = urls.externalUrl;
          }
          if (els.surveyIframe && els.surveyIframe.getAttribute('data-loaded-url') !== urls.embedUrl) {
            surveyIframeLoadCount = 0;
            if (els.surveyLoadingOverlay) {
              els.surveyLoadingOverlay.style.display = 'flex';
            }
            els.surveyIframe.setAttribute('data-loaded-url', urls.embedUrl);
            els.surveyIframe.src = urls.embedUrl;
          }
        }
      } else {
        els.profileFormView.style.display = 'none';
        if (els.surveyFormView) els.surveyFormView.style.display = 'none';
        els.redeemReadyView.style.display = 'block';
        els.redeemedDoneView.style.display = 'none';
        els.redeemUserInfo.textContent = `${p.display_name} • ${p.grade_level} • ${p.school_name}`;
      }
    } else {
      els.completionSection.style.display = 'none';
    }
  }

  async function loadMyState() {
    const q = new URLSearchParams({
      lineUserId: currentUser.lineUserId,
      displayName: currentUser.displayName,
      pictureUrl: currentUser.pictureUrl
    });
    const res = await fetch(`${BASE_PATH}/api/me?${q.toString()}`);
    if (res.ok) {
      const state = await res.json();
      renderState(state);
    }
  }

  async function performScan(rawCode) {
    const boothCode = extractBoothCodeFromInput(rawCode);
    if (!boothCode) return;

    const res = await fetch(`${BASE_PATH}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineUserId: currentUser.lineUserId,
        displayName: currentUser.displayName,
        pictureUrl: currentUser.pictureUrl,
        boothCode
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'ไม่สามารถสแกนฐานนี้ได้', 'error');
      return;
    }

    if (data.alreadyStamped) {
      showToast(`คุณเคยประทับตรา "${data.booth.name}" ไปแล้วครับ`, 'success');
    } else {
      showToast(`🎉 ประทับตรา "${data.booth.name}" สำเร็จ!`, 'success');
    }
    renderState(data.state);
  }

  // Grade chip selection
  els.gradeOptions.querySelectorAll('.grade-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      els.gradeOptions.querySelectorAll('.grade-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedGrade = chip.getAttribute('data-grade');
    });
  });

  // Save profile
  els.saveProfileBtn.addEventListener('click', async () => {
    const schoolName = els.schoolInput.value.trim();
    if (!schoolName) {
      showToast('กรุณากรอกชื่อโรงเรียนหรือสถาบันของคุณครับ', 'error');
      els.schoolInput.focus();
      return;
    }
    const res = await fetch(`${BASE_PATH}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineUserId: currentUser.lineUserId,
        gradeLevel: selectedGrade,
        schoolName
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
      return;
    }
    editingProfile = false;
    if (els.surveyIframe) {
      els.surveyIframe.removeAttribute('data-loaded-url');
    }
    const hasForm = data.settings && String(data.settings.google_form_url || '').trim();
    if (hasForm && !data.hasSurvey) {
      showToast('กรอกชื่อโรงเรียนและฐานที่เข้าชมในฟอร์มให้อัตโนมัติแล้ว! ทำแบบประเมินด้านล่างได้เลยครับ', 'success');
    } else {
      showToast('บันทึกข้อมูลเรียบร้อย! แสดงหน้าจอนี้ที่จุดรับของรางวัลได้เลยครับ', 'success');
    }
    renderState(data);
  });

  async function completeSurveyAndProceed() {
    const res = await fetch(`${BASE_PATH}/api/survey-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineUserId: currentUser.lineUserId })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'ไม่สามารถบันทึกสถานะแบบประเมินได้', 'error');
      return;
    }
    showToast('🎉 ขอบคุณที่ทำแบบประเมิน! แสดงหน้าจอนี้ที่จุดรับของรางวัลได้เลยครับ', 'success');
    renderState(data);
    if (els.completionSection && els.completionSection.scrollIntoView) {
      els.completionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (els.surveyIframe) {
    els.surveyIframe.addEventListener('load', () => {
      if (!els.surveyIframe.getAttribute('src')) return;
      surveyIframeLoadCount += 1;
      if (els.surveyLoadingOverlay) {
        els.surveyLoadingOverlay.style.display = 'none';
      }
      // 1st load = Google Form viewform loaded; 2nd load = formResponse confirmation loaded after clicking Submit
      if (surveyIframeLoadCount >= 2) {
        setTimeout(() => {
          completeSurveyAndProceed();
        }, 500);
      }
    });
  }

  if (els.manualSurveyDoneBtn) {
    els.manualSurveyDoneBtn.addEventListener('click', () => {
      completeSurveyAndProceed();
    });
  }

  if (els.editProfileFromSurveyBtn) {
    els.editProfileFromSurveyBtn.addEventListener('click', () => {
      editingProfile = true;
      if (lastState) {
        renderState(lastState);
      }
      els.schoolInput.focus();
    });
  }

  // Redeem modal
  els.confirmRedeemBtn.addEventListener('click', () => {
    els.redeemConfirmModal.classList.add('open');
  });

  els.cancelRedeemModalBtn.addEventListener('click', () => {
    els.redeemConfirmModal.classList.remove('open');
  });

  els.proceedRedeemModalBtn.addEventListener('click', async () => {
    els.redeemConfirmModal.classList.remove('open');
    const res = await fetch(`${BASE_PATH}/api/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineUserId: currentUser.lineUserId })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'ไม่สามารถยืนยันรับรางวัลได้', 'error');
      return;
    }
    showToast('🎁 ยืนยันการรับของรางวัลสำเร็จ!', 'success');
    renderState(data);
  });

  // Scanner modal & camera
  async function closeScannerModal() {
    els.scannerModal.classList.remove('open');
    if (html5QrScanner) {
      try {
        await html5QrScanner.stop();
      } catch (_e) {}
      html5QrScanner = null;
    }
  }

  els.openScannerBtn.addEventListener('click', async () => {
    // If inside LINE mobile client and scanCodeV2 is available, try native scanner first
    if (window.liff && window.liff.isInClient && window.liff.isInClient() && window.liff.scanCodeV2) {
      try {
        const result = await window.liff.scanCodeV2();
        if (result && result.value) {
          await performScan(result.value);
          return;
        }
      } catch (_e) {
        // Fallback to web scanner modal
      }
    }

    els.scannerModal.classList.add('open');
    if (window.Html5Qrcode) {
      try {
        html5QrScanner = new window.Html5Qrcode('qrReader');
        await html5QrScanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decodedText) => {
            await closeScannerModal();
            await performScan(decodedText);
          },
          () => {}
        );
      } catch (_err) {
        document.getElementById('qrReader').innerHTML =
          '<div style="padding:12px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#475569;text-align:center;">เบราว์เซอร์ไม่ได้เปิดสิทธิ์กล้อง สามารถกรอกรหัสฐานด้านล่าง หรือสแกนด้วยแอปกล้องมือถือโดยตรงได้เลยครับ</div>';
      }
    }
  });

  els.closeScannerBtn.addEventListener('click', closeScannerModal);

  els.manualCodeSubmitBtn.addEventListener('click', async () => {
    const code = els.manualCodeInput.value.trim();
    if (!code) return;
    els.manualCodeInput.value = '';
    await closeScannerModal();
    await performScan(code);
  });

  els.demoNewUserBtn.addEventListener('click', async () => {
    currentUser = getOrCreateDemoUser(true);
    els.schoolInput.value = '';
    editingProfile = false;
    surveyIframeLoadCount = 0;
    if (els.surveyIframe) {
      els.surveyIframe.removeAttribute('data-loaded-url');
      els.surveyIframe.removeAttribute('src');
    }
    showToast(`สลับเป็นผู้ใช้งานทดสอบใหม่: ${currentUser.displayName}`, 'success');
    await loadMyState();
  });

  // Boot
  (async function start() {
    const ready = await initIdentity();
    if (!ready) return;

    await loadMyState();

    // Check if URL has ?booth=CODE or ?liff.state=%3Fbooth%3DCODE from scanning a physical booth QR code
    const urlParams = new URLSearchParams(window.location.search);
    const liffStateParams = new URLSearchParams(urlParams.get('liff.state') || '');
    const boothParam = urlParams.get('booth') || liffStateParams.get('booth');
    if (boothParam) {
      await performScan(boothParam);
      // Clean URL query parameter without reloading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  })();
})();
