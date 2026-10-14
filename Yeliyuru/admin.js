/**
 * =============================================================================
 * YELIYURU VILLAGE PORTAL - ADMIN CONTROLLER LOGIC
 * Full editing of images, bilingual content, statistics, temples, festivals,
 * notices, and directory contacts with instant live preview & data.js export.
 * =============================================================================
 */

(function () {
  'use strict';

  // 1. DATA STATE
  let currentData = null;
  const LOCAL_STORAGE_KEY = 'yeliyuru_custom_village_data';
  const CLOSE_ICON_SVG = '<svg class="icon icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // Initialize data from IndexedDB or localStorage or default VILLAGE_DATA
  function initData() {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        currentData = JSON.parse(saved);
        if (currentData) delete currentData.culture;
      }
    } catch (e) {
      console.warn("localStorage read warning:", e);
    }

    if (!currentData || typeof currentData !== 'object' || Object.keys(currentData).length === 0) {
      // Deep clone default dataset from data.js
      const source = (typeof VILLAGE_DATA !== 'undefined' ? VILLAGE_DATA : window.VILLAGE_DATA) || {};
      currentData = JSON.parse(JSON.stringify(source));
    }
    if (currentData) delete currentData.culture;

    // Also load from IndexedDB (handles multi-megabyte photo sets without quota limits)
    if (window.VillageStorage && window.VillageStorage.loadData) {
      window.VillageStorage.loadData().then(idbData => {
        if (idbData && typeof idbData === 'object' && Object.keys(idbData).length > 0) {
          currentData = idbData;
          delete currentData.culture;
          populateAllFields();
          markSaved();
        }
      }).catch(err => {
        console.warn("IndexedDB load notice:", err);
      });
    }
  }

  // 2. THEME SETUP
  function initTheme() {
    const savedTheme = localStorage.getItem('village_theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
      themeIcon.innerHTML = (savedTheme === 'dark') ?
        (window.YELIYURU_ICONS?.sun || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/></svg>') :
        (window.YELIYURU_ICONS?.moon || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>');
    }

    const toggleBtn = document.getElementById('admin-theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const active = document.documentElement.getAttribute('data-theme');
        const next = (active === 'dark') ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('village_theme', next);
        if (themeIcon) {
          themeIcon.innerHTML = (next === 'dark') ?
            (window.YELIYURU_ICONS?.sun || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/></svg>') :
            (window.YELIYURU_ICONS?.moon || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>');
        }
        showToast((next === 'dark') ? "Dark theme enabled" : "Light theme enabled");
      });
    }
  }

  // 3. TOAST NOTIFICATION HELPER
  function showToast(msg, isError = false) {
    const toast = document.getElementById('admin-toast');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = msg;
    if (toastIcon) {
      toastIcon.innerHTML = isError ?
        (window.YELIYURU_ICONS?.lightbulb || '!') :
        (window.YELIYURU_ICONS?.check || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
    }
    toast.className = 'admin-toast ' + (isError ? 'toast-danger' : '');
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // 4. IMAGE UPLOAD HELPER (AUTOMATIC COMPRESSION & PREVIEW)
  function attachImageUploader(fileInputEl, urlInputEl, previewImgEl, onUpdate) {
    if (!fileInputEl || !urlInputEl || !previewImgEl) return;

    // When file chosen from computer
    fileInputEl.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      showToast("Optimizing image for fast web performance...");

      try {
        let optimizedDataUrl;
        if (window.VillageStorage && window.VillageStorage.compressImageFile) {
          // Compress high-resolution 5MB-10MB photos down to ~70KB-120KB web-friendly JPEG
          optimizedDataUrl = await window.VillageStorage.compressImageFile(file, 1200, 900, 0.82);
        } else {
          // Fallback
          optimizedDataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = ev => res(ev.target.result);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
        }

        previewImgEl.src = optimizedDataUrl;
        urlInputEl.value = optimizedDataUrl;
        if (onUpdate) onUpdate(optimizedDataUrl);
        markUnsaved();
        showToast("Image optimized & preview updated!");
      } catch (err) {
        console.error("Image optimization error:", err);
        showToast("Error processing image: " + err.message, true);
      }
    });

    // When URL or relative path typed manually
    urlInputEl.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        previewImgEl.src = val;
        if (onUpdate) onUpdate(val);
        markUnsaved();
      }
    });
  }

  // Unsaved changes status
  function markUnsaved() {
    const status = document.getElementById('save-status');
    const statusText = document.getElementById('status-text');
    if (status && statusText) {
      status.classList.add('unsaved');
      statusText.textContent = "Unsaved changes";
    }
  }

  function markSaved() {
    const status = document.getElementById('save-status');
    const statusText = document.getElementById('status-text');
    if (status && statusText) {
      status.classList.remove('unsaved');
      statusText.textContent = "All changes synced";
    }
  }

  // 5. SIDEBAR TAB NAVIGATION
  function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.tab-panel');

    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        navItems.forEach(i => i.classList.remove('active'));
        btn.classList.add('active');

        panels.forEach(p => {
          if (p.id === targetTab) {
            p.classList.add('active');
          } else {
            p.classList.remove('active');
          }
        });

        // Scroll main view to top
        const main = document.querySelector('.admin-main');
        if (main) main.scrollTop = 0;
      });
    });
  }

  // ===========================================================================
  // 6. POPULATE & BIND FORM FIELDS
  // ===========================================================================

  function populateAllFields() {
    populateGeneral();
    populateAbout();
    populateHistory();
    populateQuickFacts();
    populatePhotos();
    populateAgriculture();
    populateTemples();
    populateFestivals();
    populatePanchayat();
    populateSchools();
    populateTransport();
    populateContacts();
    populateNotices();
    populateMap();
    updateBadges();
  }

  function updateBadges() {
    const badgeFacts = document.getElementById('badge-facts');
    const badgePhotos = document.getElementById('badge-photos');
    const badgeTemples = document.getElementById('badge-temples');
    const badgeFestivals = document.getElementById('badge-festivals');
    const badgeMembers = document.getElementById('badge-members');
    const badgeSchools = document.getElementById('badge-schools');
    const badgeContacts = document.getElementById('badge-contacts');
    const badgeNotices = document.getElementById('badge-notices');

    if (badgeFacts) badgeFacts.textContent = (currentData.quickFacts || []).length;
    if (badgePhotos) badgePhotos.textContent = (currentData.photos || []).length;
    if (badgeTemples) badgeTemples.textContent = (currentData.temples || []).length;
    if (badgeFestivals) badgeFestivals.textContent = (currentData.festivals || []).length;
    if (badgeMembers && currentData.panchayat) badgeMembers.textContent = (currentData.panchayat.members || []).length;
    if (badgeSchools) badgeSchools.textContent = (currentData.schools || []).length + (currentData.health || []).length;
    if (badgeContacts) badgeContacts.textContent = (currentData.contacts || []).length;
    if (badgeNotices) badgeNotices.textContent = (currentData.notices || []).length;
  }

  // --- TAB 1: GENERAL & BANNER ---
  function populateGeneral() {
    const d = currentData;
    // Names
    setVal('gen-name-en', d.name?.en);
    setVal('gen-name-kn', d.name?.kn);
    setVal('gen-shortsub-en', d.shortSub?.en);
    setVal('gen-shortsub-kn', d.shortSub?.kn);
    setVal('gen-subtitle-en', d.subtitle?.en);
    setVal('gen-subtitle-kn', d.subtitle?.kn);
    setVal('gen-tagline-en', d.tagline?.en);
    setVal('gen-tagline-kn', d.tagline?.kn);

    // Banner & Meta
    if (d.banner) {
      setVal('url-hero-banner', d.banner.image);
      const prev = document.getElementById('preview-hero-banner');
      if (prev && d.banner.image) prev.src = d.banner.image;
      setVal('meta-pincode', d.banner.pincode);
      setVal('meta-elevation', d.banner.elevation);
      setVal('meta-taluk-en', d.banner.taluk?.en);
      setVal('meta-taluk-kn', d.banner.taluk?.kn);
      setVal('meta-district-en', d.banner.district?.en);
      setVal('meta-district-kn', d.banner.district?.kn);
    }

    attachImageUploader(
      document.getElementById('file-hero-banner'),
      document.getElementById('url-hero-banner'),
      document.getElementById('preview-hero-banner'),
      (imgSrc) => {
        if (!currentData.banner) currentData.banner = {};
        currentData.banner.image = imgSrc;
      }
    );
  }

  function readGeneral() {
    if (!currentData.name) currentData.name = {};
    currentData.name.en = getVal('gen-name-en');
    currentData.name.kn = getVal('gen-name-kn');

    if (!currentData.shortSub) currentData.shortSub = {};
    currentData.shortSub.en = getVal('gen-shortsub-en');
    currentData.shortSub.kn = getVal('gen-shortsub-kn');

    if (!currentData.subtitle) currentData.subtitle = {};
    currentData.subtitle.en = getVal('gen-subtitle-en');
    currentData.subtitle.kn = getVal('gen-subtitle-kn');

    if (!currentData.tagline) currentData.tagline = {};
    currentData.tagline.en = getVal('gen-tagline-en');
    currentData.tagline.kn = getVal('gen-tagline-kn');

    if (!currentData.banner) currentData.banner = {};
    currentData.banner.image = getVal('url-hero-banner');
    currentData.banner.pincode = getVal('meta-pincode');
    currentData.banner.elevation = getVal('meta-elevation');

    if (!currentData.banner.taluk) currentData.banner.taluk = {};
    currentData.banner.taluk.en = getVal('meta-taluk-en');
    currentData.banner.taluk.kn = getVal('meta-taluk-kn');

    if (!currentData.banner.district) currentData.banner.district = {};
    currentData.banner.district.en = getVal('meta-district-en');
    currentData.banner.district.kn = getVal('meta-district-kn');
  }

  // --- TAB 2: ABOUT ---
  function populateAbout() {
    const a = currentData.about || {};
    setVal('about-heading-en', a.heading?.en);
    setVal('about-heading-kn', a.heading?.kn);
    setVal('about-subheading-en', a.subheading?.en);
    setVal('about-subheading-kn', a.subheading?.kn);
    setVal('about-desc-en', a.description?.en);
    setVal('about-desc-kn', a.description?.kn);

    renderAboutHighlights();
  }

  function renderAboutHighlights() {
    const list = document.getElementById('about-highlights-list');
    if (!list) return;
    const highlights = currentData.about?.highlights || [];
    list.innerHTML = highlights.map((h, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <div class="grid-3">
          <div class="form-group">
            <label>Icon Key</label>
            <input type="text" class="form-control h-icon" value="${escapeHtml(window.normalizeIconKey ? window.normalizeIconKey(h.icon, 'sprout') : (h.icon || 'sprout'))}">
          </div>
          <div class="form-group">
            <label>Title (English)</label>
            <input type="text" class="form-control h-title-en" value="${escapeHtml(h.title?.en || '')}">
          </div>
          <div class="form-group">
            <label>Title (Kannada)</label>
            <input type="text" class="form-control h-title-kn" value="${escapeHtml(h.title?.kn || '')}">
          </div>
        </div>
        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Text (English)</label>
            <input type="text" class="form-control h-text-en" value="${escapeHtml(h.text?.en || '')}">
          </div>
          <div class="form-group">
            <label>Text (Kannada)</label>
            <input type="text" class="form-control h-text-kn" value="${escapeHtml(h.text?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  function readAbout() {
    if (!currentData.about) currentData.about = {};
    currentData.about.heading = { en: getVal('about-heading-en'), kn: getVal('about-heading-kn') };
    currentData.about.subheading = { en: getVal('about-subheading-en'), kn: getVal('about-subheading-kn') };
    currentData.about.description = { en: getVal('about-desc-en'), kn: getVal('about-desc-kn') };

    const items = document.querySelectorAll('#about-highlights-list .dynamic-item-card');
    const highlights = [];
    items.forEach(card => {
      const iconInput = card.querySelector('.h-icon')?.value.trim();
      highlights.push({
        icon: window.normalizeIconKey ? window.normalizeIconKey(iconInput, 'sprout') : (iconInput || 'sprout'),
        title: {
          en: card.querySelector('.h-title-en').value.trim(),
          kn: card.querySelector('.h-title-kn').value.trim()
        },
        text: {
          en: card.querySelector('.h-text-en').value.trim(),
          kn: card.querySelector('.h-text-kn').value.trim()
        }
      });
    });
    currentData.about.highlights = highlights;
  }

  // --- TAB 3: HISTORY ---
  function populateHistory() {
    const h = currentData.history || {};
    setVal('history-heading-en', h.heading?.en);
    setVal('history-heading-kn', h.heading?.kn);
    setVal('history-narrative-en', h.narrative?.en);
    setVal('history-narrative-kn', h.narrative?.kn);
    renderTimeline();

    const addBtn = document.getElementById('btn-add-milestone');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.history) currentData.history = {};
        if (!currentData.history.timeline) currentData.history.timeline = [];
        currentData.history.timeline.push({
          year: "New Era",
          title: { en: "Historical Milestone", kn: "ಐತಿಹಾಸಿಕ ಘಟ್ಟ" },
          desc: { en: "Description of the milestone...", kn: "ವಿವರಣೆ..." }
        });
        renderTimeline();
        markUnsaved();
      };
    }
  }

  function renderTimeline() {
    const list = document.getElementById('timeline-list');
    if (!list) return;
    const timeline = currentData.history?.timeline || [];
    list.innerHTML = timeline.map((m, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteTimeline(${idx})" title="Remove era">${CLOSE_ICON_SVG}</button>
        <div class="grid-3">
          <div class="form-group">
            <label>Era / Year</label>
            <input type="text" class="form-control t-year" value="${escapeHtml(m.year || '')}">
          </div>
          <div class="form-group">
            <label>Title (English)</label>
            <input type="text" class="form-control t-title-en" value="${escapeHtml(m.title?.en || '')}">
          </div>
          <div class="form-group">
            <label>Title (Kannada)</label>
            <input type="text" class="form-control t-title-kn" value="${escapeHtml(m.title?.kn || '')}">
          </div>
        </div>
        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Description (English)</label>
            <input type="text" class="form-control t-desc-en" value="${escapeHtml(m.desc?.en || '')}">
          </div>
          <div class="form-group">
            <label>Description (Kannada)</label>
            <input type="text" class="form-control t-desc-kn" value="${escapeHtml(m.desc?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteTimeline = function (idx) {
    readHistory();
    if (idx >= 0 && currentData.history && currentData.history.timeline && idx < currentData.history.timeline.length) {
      const removed = currentData.history.timeline.splice(idx, 1)[0];
      renderTimeline();
      markUnsaved();
      const era = removed?.year || removed?.title?.en || "Milestone";
      showToast(`Removed milestone "${era}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readHistory() {
    if (!currentData.history) currentData.history = {};
    currentData.history.heading = { en: getVal('history-heading-en'), kn: getVal('history-heading-kn') };
    currentData.history.narrative = { en: getVal('history-narrative-en'), kn: getVal('history-narrative-kn') };

    const items = document.querySelectorAll('#timeline-list .dynamic-item-card');
    const timeline = [];
    items.forEach(card => {
      timeline.push({
        year: card.querySelector('.t-year').value.trim(),
        title: {
          en: card.querySelector('.t-title-en').value.trim(),
          kn: card.querySelector('.t-title-kn').value.trim()
        },
        desc: {
          en: card.querySelector('.t-desc-en').value.trim(),
          kn: card.querySelector('.t-desc-kn').value.trim()
        }
      });
    });
    currentData.history.timeline = timeline;
  }

  // --- TAB 4: QUICK FACTS ---
  function populateQuickFacts() {
    renderQuickFacts();
    const addBtn = document.getElementById('btn-add-fact');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.quickFacts) currentData.quickFacts = [];
        currentData.quickFacts.push({
          id: "fact_" + Date.now(),
          icon: "mapPin",
          label: { en: "New Fact", kn: "ಹೊಸ ಅಂಶ" },
          value: { en: "Value Details", kn: "ವಿವರ" }
        });
        renderQuickFacts();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderQuickFacts() {
    const container = document.getElementById('facts-container');
    if (!container) return;
    const facts = currentData.quickFacts || [];
    container.innerHTML = facts.map((f, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteFact(${idx})" title="Delete fact">${CLOSE_ICON_SVG}</button>
        <div class="form-group">
          <label>Icon Key</label>
          <input type="text" class="form-control f-icon" value="${escapeHtml(window.normalizeIconKey ? window.normalizeIconKey(f.icon, 'mapPin') : (f.icon || 'mapPin'))}" style="width: 140px;">
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>Label (English)</label>
            <input type="text" class="form-control f-lbl-en" value="${escapeHtml(f.label?.en || '')}">
          </div>
          <div class="form-group">
            <label>Label (Kannada)</label>
            <input type="text" class="form-control f-lbl-kn" value="${escapeHtml(f.label?.kn || '')}">
          </div>
        </div>
        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Value (English)</label>
            <input type="text" class="form-control f-val-en" value="${escapeHtml(f.value?.en || '')}">
          </div>
          <div class="form-group">
            <label>Value (Kannada)</label>
            <input type="text" class="form-control f-val-kn" value="${escapeHtml(f.value?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteFact = function (idx) {
    readQuickFacts();
    if (idx >= 0 && idx < currentData.quickFacts.length) {
      currentData.quickFacts.splice(idx, 1);
      renderQuickFacts();
      updateBadges();
      markUnsaved();
      showToast("Fact removed. Remember to click 'Save All Changes' to sync.");
    }
  };

  function readQuickFacts() {
    const cards = document.querySelectorAll('#facts-container .dynamic-item-card');
    const facts = [];
    cards.forEach((card, idx) => {
      const origId = currentData.quickFacts[idx]?.id || ("fact_" + idx);
      const iconInput = card.querySelector('.f-icon')?.value.trim();
      facts.push({
        id: origId,
        icon: window.normalizeIconKey ? window.normalizeIconKey(iconInput, 'mapPin') : (iconInput || 'mapPin'),
        label: {
          en: card.querySelector('.f-lbl-en').value.trim(),
          kn: card.querySelector('.f-lbl-kn').value.trim()
        },
        value: {
          en: card.querySelector('.f-val-en').value.trim(),
          kn: card.querySelector('.f-val-kn').value.trim()
        }
      });
    });
    currentData.quickFacts = facts;
  }

  // --- TAB 5: PHOTO GALLERY ---
  function populatePhotos() {
    renderPhotosGrid();
    const addBtn = document.getElementById('btn-add-photo');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.photos) currentData.photos = [];
        currentData.photos.push({
          id: Date.now(),
          url: "assets/images/hero-banner.jpg",
          title: { en: "New Gallery Photo", kn: "ಹೊಸ ಛಾಯಾಚಿತ್ರ" },
          caption: { en: "Description of photo...", kn: "ಚಿತ್ರದ ವಿವರಣೆ..." },
          tag: { en: "Village Life", kn: "ಗ್ರಾಮ ಜೀವನ" }
        });
        renderPhotosGrid();
        updateBadges();
        markUnsaved();
        showToast("New photo slot added. Upload image or enter URL.");
      };
    }
  }

  function renderPhotosGrid() {
    const grid = document.getElementById('photos-grid');
    if (!grid) return;
    const photos = currentData.photos || [];

    grid.innerHTML = photos.map((p, idx) => `
      <div class="photo-admin-card" data-idx="${idx}">
        <div class="photo-card-img-wrap">
          <img src="${escapeHtml(p.url || 'assets/images/hero-banner.jpg')}" id="preview-photo-${idx}" alt="Gallery Preview">
        </div>
        <div class="photo-card-body">
          <div class="form-group">
            <label>Upload From Computer</label>
            <input type="file" accept="image/*" class="form-control file-input photo-file-input" data-idx="${idx}">
          </div>
          <div class="form-group">
            <label>Or Image Path / URL</label>
            <input type="text" class="form-control p-url" data-idx="${idx}" value="${escapeHtml(p.url || '')}">
          </div>
          <div class="form-group">
            <label>Title (English)</label>
            <input type="text" class="form-control p-title-en" value="${escapeHtml(p.title?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಶೀರ್ಷಿಕೆ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control p-title-kn" value="${escapeHtml(p.title?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Caption (English)</label>
            <textarea class="form-control p-cap-en" rows="2">${escapeHtml(p.caption?.en || '')}</textarea>
          </div>
          <div class="form-group">
            <label>ವಿವರಣೆ (ಕನ್ನಡ)</label>
            <textarea class="form-control p-cap-kn" rows="2">${escapeHtml(p.caption?.kn || '')}</textarea>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Tag (EN)</label>
              <input type="text" class="form-control p-tag-en" value="${escapeHtml(p.tag?.en || '')}">
            </div>
            <div class="form-group">
              <label>ಟ್ಯಾಗ್ (KN)</label>
              <input type="text" class="form-control p-tag-kn" value="${escapeHtml(p.tag?.kn || '')}">
            </div>
          </div>
          <div class="photo-card-actions">
            <span class="preview-badge">#${idx + 1}</span>
            <button type="button" class="btn btn-sm btn-danger-outline" onclick="window.adminDeletePhoto(${idx})">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              <span>Delete Photo</span>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach file uploader events for each photo card
    document.querySelectorAll('.photo-file-input').forEach(input => {
      const idx = input.getAttribute('data-idx');
      const preview = document.getElementById(`preview-photo-${idx}`);
      const urlInput = document.querySelector(`.p-url[data-idx="${idx}"]`);

      attachImageUploader(input, urlInput, preview, (imgSrc) => {
        if (currentData.photos[idx]) {
          currentData.photos[idx].url = imgSrc;
        }
      });
    });
  }

  window.adminDeletePhoto = function (idx) {
    readPhotos();
    if (idx >= 0 && currentData.photos && idx < currentData.photos.length) {
      const removed = currentData.photos.splice(idx, 1)[0];
      renderPhotosGrid();
      updateBadges();
      markUnsaved();
      const title = removed?.title?.en || removed?.title?.kn || "Photo";
      showToast(`Removed photo "${title}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readPhotos() {
    const cards = document.querySelectorAll('.photo-admin-card');
    const photos = [];
    cards.forEach((card, idx) => {
      const origId = currentData.photos[idx]?.id || idx + 1;
      photos.push({
        id: origId,
        url: card.querySelector('.p-url').value.trim(),
        title: {
          en: card.querySelector('.p-title-en').value.trim(),
          kn: card.querySelector('.p-title-kn').value.trim()
        },
        caption: {
          en: card.querySelector('.p-cap-en').value.trim(),
          kn: card.querySelector('.p-cap-kn').value.trim()
        },
        tag: {
          en: card.querySelector('.p-tag-en').value.trim(),
          kn: card.querySelector('.p-tag-kn').value.trim()
        }
      });
    });
    currentData.photos = photos;
  }

  // --- TAB 6: MILK & SILK (AGRICULTURE) ---
  function populateAgriculture() {
    const container = document.getElementById('agriculture-crops-container');
    if (!container) return;
    const crops = currentData.crops || [];

    container.innerHTML = crops.map((crop, idx) => `
      <div class="admin-card card-full" data-idx="${idx}">
        <h2 class="card-title">${escapeHtml(crop.name?.en || 'Crop Sector')} / ${escapeHtml(crop.name?.kn || '')}</h2>
        
        <div class="image-uploader-wrapper">
          <div class="image-preview-container">
            <img id="preview-crop-${idx}" src="${escapeHtml(crop.image || 'assets/images/milk.jpg')}" alt="Crop Preview" class="image-preview">
          </div>
          <div class="image-inputs">
            <div class="form-group">
              <label>Upload Image from Computer</label>
              <input type="file" accept="image/*" class="form-control file-input crop-file-input" data-idx="${idx}">
            </div>
            <div class="form-group">
              <label>Image URL / Path</label>
              <input type="text" class="form-control crop-url" data-idx="${idx}" value="${escapeHtml(crop.image || '')}">
            </div>
          </div>
        </div>

        <div class="grid-2 mt-4">
          <div class="form-group">
            <label>Name (English)</label>
            <input type="text" class="form-control crop-name-en" value="${escapeHtml(crop.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಹೆಸರು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control crop-name-kn" value="${escapeHtml(crop.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Annual Production (English)</label>
            <input type="text" class="form-control crop-yield-en" value="${escapeHtml(crop.annualProduction?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವಾರ್ಷಿಕ ಉತ್ಪಾದನೆ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control crop-yield-kn" value="${escapeHtml(crop.annualProduction?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Area / Extent (English)</label>
            <input type="text" class="form-control crop-area-en" value="${escapeHtml(crop.areaCovered?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವಿಸ್ತೀರ್ಣ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control crop-area-kn" value="${escapeHtml(crop.areaCovered?.kn || '')}">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Description (English)</label>
          <textarea class="form-control crop-desc-en" rows="3">${escapeHtml(crop.description?.en || '')}</textarea>
        </div>
        <div class="form-group mt-3">
          <label>ವಿವರಣೆ (ಕನ್ನಡ)</label>
          <textarea class="form-control crop-desc-kn" rows="3">${escapeHtml(crop.description?.kn || '')}</textarea>
        </div>
      </div>
    `).join('');

    // Attach uploader
    document.querySelectorAll('.crop-file-input').forEach(input => {
      const idx = input.getAttribute('data-idx');
      const preview = document.getElementById(`preview-crop-${idx}`);
      const urlInput = document.querySelector(`.crop-url[data-idx="${idx}"]`);
      attachImageUploader(input, urlInput, preview, (imgSrc) => {
        if (currentData.crops[idx]) currentData.crops[idx].image = imgSrc;
      });
    });
  }

  function readAgriculture() {
    const cards = document.querySelectorAll('#agriculture-crops-container .admin-card');
    cards.forEach((card, idx) => {
      if (currentData.crops[idx]) {
        currentData.crops[idx].image = card.querySelector('.crop-url').value.trim();
        currentData.crops[idx].name = {
          en: card.querySelector('.crop-name-en').value.trim(),
          kn: card.querySelector('.crop-name-kn').value.trim()
        };
        currentData.crops[idx].annualProduction = {
          en: card.querySelector('.crop-yield-en').value.trim(),
          kn: card.querySelector('.crop-yield-kn').value.trim()
        };
        currentData.crops[idx].areaCovered = {
          en: card.querySelector('.crop-area-en').value.trim(),
          kn: card.querySelector('.crop-area-kn').value.trim()
        };
        currentData.crops[idx].description = {
          en: card.querySelector('.crop-desc-en').value.trim(),
          kn: card.querySelector('.crop-desc-kn').value.trim()
        };
      }
    });
  }

  // --- TAB 7: TEMPLES ---
  function populateTemples() {
    renderTemples();
    const addBtn = document.getElementById('btn-add-temple');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.temples) currentData.temples = [];
        currentData.temples.push({
          name: { en: "New Temple Shrine", kn: "ಹೊಸ ದೇವಾಲಯ" },
          deity: { en: "Presiding Deity", kn: "ಪ್ರಧಾನ ದೈವ" },
          era: { en: "Historic Era", kn: "ಐತಿಹಾಸಿಕ ಕಾಲ" },
          timings: { en: "6:00 AM - 8:00 PM", kn: "ಬೆಳಗ್ಗೆ ೬:೦೦ - ರಾತ್ರಿ ೮:೦೦" },
          speciality: { en: "Special spiritual significance", kn: "ವಿಶೇಷ ಮಹಿಮೆ" },
          image: "assets/images/temple.jpg"
        });
        renderTemples();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderTemples() {
    const container = document.getElementById('temples-container');
    if (!container) return;
    const temples = currentData.temples || [];

    container.innerHTML = temples.map((t, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteTemple(${idx})" title="Delete temple">${CLOSE_ICON_SVG}</button>
        <h2 class="card-title">${escapeHtml(t.name?.en || 'Temple')}</h2>
        
        <div class="image-uploader-wrapper mb-3">
          <div class="image-preview-container">
            <img id="preview-temple-${idx}" src="${escapeHtml(t.image || 'assets/images/temple.jpg')}" alt="Temple Preview" class="image-preview">
          </div>
          <div class="image-inputs">
            <div class="form-group">
              <label>Upload Photo</label>
              <input type="file" accept="image/*" class="form-control file-input temple-file-input" data-idx="${idx}">
            </div>
            <div class="form-group">
              <label>Image URL / Path</label>
              <input type="text" class="form-control temple-url" data-idx="${idx}" value="${escapeHtml(t.image || '')}">
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Temple Name (EN)</label>
            <input type="text" class="form-control tm-name-en" value="${escapeHtml(t.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ದೇವಾಲಯದ ಹೆಸರು (KN)</label>
            <input type="text" class="form-control tm-name-kn" value="${escapeHtml(t.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Presiding Deity (EN)</label>
            <input type="text" class="form-control tm-deity-en" value="${escapeHtml(t.deity?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಪ್ರಧಾನ ದೈವ (KN)</label>
            <input type="text" class="form-control tm-deity-kn" value="${escapeHtml(t.deity?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Timings (EN)</label>
            <input type="text" class="form-control tm-time-en" value="${escapeHtml(t.timings?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಸಮಯ (KN)</label>
            <input type="text" class="form-control tm-time-kn" value="${escapeHtml(t.timings?.kn || '')}">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Speciality (EN)</label>
          <input type="text" class="form-control tm-spec-en" value="${escapeHtml(t.speciality?.en || '')}">
        </div>
        <div class="form-group mt-3">
          <label>ವಿಶೇಷತೆ (KN)</label>
          <input type="text" class="form-control tm-spec-kn" value="${escapeHtml(t.speciality?.kn || '')}">
        </div>

        <div class="card-footer-actions mt-3" style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 0.85rem;">
          <button type="button" class="btn btn-sm btn-danger-outline" onclick="window.adminDeleteTemple(${idx})" title="Delete this temple">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>Delete This Temple</span>
          </button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.temple-file-input').forEach(input => {
      const idx = input.getAttribute('data-idx');
      const preview = document.getElementById(`preview-temple-${idx}`);
      const urlInput = document.querySelector(`.temple-url[data-idx="${idx}"]`);
      attachImageUploader(input, urlInput, preview, (imgSrc) => {
        if (currentData.temples[idx]) currentData.temples[idx].image = imgSrc;
      });
    });
  }

  window.adminDeleteTemple = function (idx) {
    readTemples();
    if (idx >= 0 && idx < currentData.temples.length) {
      const removed = currentData.temples.splice(idx, 1)[0];
      renderTemples();
      updateBadges();
      markUnsaved();
      const name = removed?.name?.en || removed?.name?.kn || "Temple";
      showToast(`Removed "${name}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readTemples() {
    const cards = document.querySelectorAll('#temples-container .admin-card');
    const temples = [];
    cards.forEach((card, idx) => {
      const orig = (currentData.temples && currentData.temples[idx]) || {};
      temples.push({
        ...orig,
        image: card.querySelector('.temple-url')?.value?.trim() ?? orig.image ?? '',
        name: {
          en: card.querySelector('.tm-name-en')?.value?.trim() ?? orig.name?.en ?? '',
          kn: card.querySelector('.tm-name-kn')?.value?.trim() ?? orig.name?.kn ?? ''
        },
        deity: {
          en: card.querySelector('.tm-deity-en')?.value?.trim() ?? orig.deity?.en ?? '',
          kn: card.querySelector('.tm-deity-kn')?.value?.trim() ?? orig.deity?.kn ?? ''
        },
        timings: {
          en: card.querySelector('.tm-time-en')?.value?.trim() ?? orig.timings?.en ?? '',
          kn: card.querySelector('.tm-time-kn')?.value?.trim() ?? orig.timings?.kn ?? ''
        },
        speciality: {
          en: card.querySelector('.tm-spec-en')?.value?.trim() ?? orig.speciality?.en ?? '',
          kn: card.querySelector('.tm-spec-kn')?.value?.trim() ?? orig.speciality?.kn ?? ''
        }
      });
    });
    currentData.temples = temples;
  }

  // --- TAB 8: FESTIVALS ---
  function populateFestivals() {
    renderFestivals();
    const addBtn = document.getElementById('btn-add-festival');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.festivals) currentData.festivals = [];
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30);
        const yyyy = nextMonth.getFullYear();
        const mm = String(nextMonth.getMonth() + 1).padStart(2, '0');
        const dd = String(nextMonth.getDate()).padStart(2, '0');

        currentData.festivals.push({
          name: { en: "New Festival Celebration", kn: "ಹೊಸ ಹಬ್ಬದ ಆಚರಣೆ" },
          date: `${yyyy}-${mm}-${dd}`,
          period: { en: "Annual Festive Season", kn: "ವಾರ್ಷಿಕ ಸಂಭ್ರಮ" },
          highlights: { en: "Special pooja, cultural programs", kn: "ವಿಶೇಷ ಪೂಜೆ, ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮ" },
          description: { en: "Festival description...", kn: "ಹಬ್ಬದ ವಿವರಣೆ..." }
        });
        renderFestivals();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderFestivals() {
    const container = document.getElementById('festivals-container');
    if (!container) return;
    const festivals = currentData.festivals || [];

    container.innerHTML = festivals.map((f, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteFestival(${idx})" title="Delete festival">${CLOSE_ICON_SVG}</button>
        <h2 class="card-title">${escapeHtml(f.name?.en || 'Festival')}</h2>
        
        <div class="grid-3">
          <div class="form-group">
            <label>Event Date (YYYY-MM-DD)</label>
            <input type="date" class="form-control fes-date" value="${escapeHtml(f.date || '')}">
            <small class="form-hint">Drives the live homepage countdown!</small>
          </div>
          <div class="form-group">
            <label>Name (English)</label>
            <input type="text" class="form-control fes-name-en" value="${escapeHtml(f.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಹಬ್ಬದ ಹೆಸರು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control fes-name-kn" value="${escapeHtml(f.name?.kn || '')}">
          </div>
        </div>

        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Highlights (English)</label>
            <input type="text" class="form-control fes-high-en" value="${escapeHtml(f.highlights?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವಿಶೇಷತೆಗಳು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control fes-high-kn" value="${escapeHtml(f.highlights?.kn || '')}">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Description (English)</label>
          <textarea class="form-control fes-desc-en" rows="2">${escapeHtml(f.description?.en || '')}</textarea>
        </div>
        <div class="form-group mt-3">
          <label>ವಿವರಣೆ (ಕನ್ನಡ)</label>
          <textarea class="form-control fes-desc-kn" rows="2">${escapeHtml(f.description?.kn || '')}</textarea>
        </div>

        <div class="card-footer-actions mt-3" style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 0.85rem;">
          <button type="button" class="btn btn-sm btn-danger-outline" onclick="window.adminDeleteFestival(${idx})" title="Delete this festival">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>Delete This Festival</span>
          </button>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteFestival = function (idx) {
    // 1. Sync current inputs so edits in other cards aren't lost
    readFestivals();

    if (idx >= 0 && idx < currentData.festivals.length) {
      const removed = currentData.festivals.splice(idx, 1)[0];
      renderFestivals();
      updateBadges();
      markUnsaved();
      const name = removed?.name?.en || removed?.name?.kn || "Festival";
      showToast(`Removed "${name}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readFestivals() {
    const cards = document.querySelectorAll('#festivals-container .admin-card');
    const festivals = [];
    cards.forEach((card, idx) => {
      const orig = (currentData.festivals && currentData.festivals[idx]) || {};
      festivals.push({
        ...orig,
        date: card.querySelector('.fes-date')?.value?.trim() ?? orig.date ?? '',
        name: {
          en: card.querySelector('.fes-name-en')?.value?.trim() ?? orig.name?.en ?? '',
          kn: card.querySelector('.fes-name-kn')?.value?.trim() ?? orig.name?.kn ?? ''
        },
        highlights: {
          en: card.querySelector('.fes-high-en')?.value?.trim() ?? orig.highlights?.en ?? '',
          kn: card.querySelector('.fes-high-kn')?.value?.trim() ?? orig.highlights?.kn ?? ''
        },
        description: {
          en: card.querySelector('.fes-desc-en')?.value?.trim() ?? orig.description?.en ?? '',
          kn: card.querySelector('.fes-desc-kn')?.value?.trim() ?? orig.description?.kn ?? ''
        }
      });
    });
    currentData.festivals = festivals;
  }


  // --- TAB 10: PANCHAYAT ---
  function populatePanchayat() {
    const p = currentData.panchayat || {};
    setVal('url-panchayat-img', p.image);
    const prev = document.getElementById('preview-panchayat-img');
    if (prev && p.image) prev.src = p.image;

    setVal('panchayat-address-en', p.officeAddress?.en);
    setVal('panchayat-address-kn', p.officeAddress?.kn);
    setVal('panchayat-hours-en', p.workingHours?.en);
    setVal('panchayat-hours-kn', p.workingHours?.kn);

    attachImageUploader(
      document.getElementById('file-panchayat-img'),
      document.getElementById('url-panchayat-img'),
      document.getElementById('preview-panchayat-img'),
      (imgSrc) => {
        if (!currentData.panchayat) currentData.panchayat = {};
        currentData.panchayat.image = imgSrc;
      }
    );

    renderPanchayatMembers();
    const addBtn = document.getElementById('btn-add-member');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.panchayat) currentData.panchayat = {};
        if (!currentData.panchayat.members) currentData.panchayat.members = [];
        currentData.panchayat.members.push({
          role: { en: "Member", kn: "ಸದಸ್ಯರು" },
          name: { en: "Name", kn: "ಹೆಸರು" },
          term: "2021 - 2026",
          contact: "+91 98450 00000"
        });
        renderPanchayatMembers();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderPanchayatMembers() {
    const list = document.getElementById('panchayat-members-list');
    if (!list) return;
    const members = currentData.panchayat?.members || [];
    list.innerHTML = members.map((m, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteMember(${idx})" title="Remove member">${CLOSE_ICON_SVG}</button>
        <div class="grid-2">
          <div class="form-group">
            <label>Name (English)</label>
            <input type="text" class="form-control mem-name-en" value="${escapeHtml(m.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಹೆಸರು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control mem-name-kn" value="${escapeHtml(m.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Role / Position (English)</label>
            <input type="text" class="form-control mem-role-en" value="${escapeHtml(m.role?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಹುದ್ದೆ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control mem-role-kn" value="${escapeHtml(m.role?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Phone / Contact</label>
            <input type="text" class="form-control mem-phone" value="${escapeHtml(m.contact || '')}">
          </div>
          <div class="form-group">
            <label>Term / Period</label>
            <input type="text" class="form-control mem-term" value="${escapeHtml(m.term || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteMember = function (idx) {
    readPanchayat();
    if (idx >= 0 && currentData.panchayat && currentData.panchayat.members && idx < currentData.panchayat.members.length) {
      const removed = currentData.panchayat.members.splice(idx, 1)[0];
      renderPanchayatMembers();
      updateBadges();
      markUnsaved();
      const name = removed?.name?.en || removed?.name?.kn || "Member";
      showToast(`Removed "${name}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readPanchayat() {
    if (!currentData.panchayat) currentData.panchayat = {};
    currentData.panchayat.image = getVal('url-panchayat-img');
    currentData.panchayat.officeAddress = { en: getVal('panchayat-address-en'), kn: getVal('panchayat-address-kn') };
    currentData.panchayat.workingHours = { en: getVal('panchayat-hours-en'), kn: getVal('panchayat-hours-kn') };

    const items = document.querySelectorAll('#panchayat-members-list .dynamic-item-card');
    const members = [];
    items.forEach(card => {
      members.push({
        name: { en: card.querySelector('.mem-name-en').value.trim(), kn: card.querySelector('.mem-name-kn').value.trim() },
        role: { en: card.querySelector('.mem-role-en').value.trim(), kn: card.querySelector('.mem-role-kn').value.trim() },
        contact: card.querySelector('.mem-phone').value.trim(),
        term: card.querySelector('.mem-term').value.trim()
      });
    });
    currentData.panchayat.members = members;
  }

  // --- TAB 11: SCHOOLS & HEALTH ---
  function populateSchools() {
    const prev = document.getElementById('preview-school-img');
    const schImg = currentData.schools?.[0]?.image || 'assets/images/school.jpg';
    setVal('url-school-img', schImg);
    if (prev) prev.src = schImg;

    attachImageUploader(
      document.getElementById('file-school-img'),
      document.getElementById('url-school-img'),
      document.getElementById('preview-school-img'),
      (imgSrc) => {
        if (currentData.schools && currentData.schools[0]) currentData.schools[0].image = imgSrc;
      }
    );

    renderSchoolsList();
    renderHealthList();
  }

  function renderSchoolsList() {
    const list = document.getElementById('schools-list');
    if (!list) return;
    const schools = currentData.schools || [];
    list.innerHTML = schools.map((s, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <div class="grid-2">
          <div class="form-group">
            <label>School Name (EN)</label>
            <input type="text" class="form-control sch-name-en" value="${escapeHtml(s.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಶಾಲೆಯ ಹೆಸರು (KN)</label>
            <input type="text" class="form-control sch-name-kn" value="${escapeHtml(s.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Type / Grades (EN)</label>
            <input type="text" class="form-control sch-type-en" value="${escapeHtml(s.type?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವಿವರ (KN)</label>
            <input type="text" class="form-control sch-type-kn" value="${escapeHtml(s.type?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderHealthList() {
    const list = document.getElementById('health-list');
    if (!list) return;
    const health = currentData.health || [];
    list.innerHTML = health.map((h, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <div class="grid-2">
          <div class="form-group">
            <label>Facility Name (EN)</label>
            <input type="text" class="form-control hlt-name-en" value="${escapeHtml(h.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಆರೋಗ್ಯ ಕೇಂದ್ರ (KN)</label>
            <input type="text" class="form-control hlt-name-kn" value="${escapeHtml(h.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Doctor / Officer (EN)</label>
            <input type="text" class="form-control hlt-doc-en" value="${escapeHtml(h.doctor?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವೈದ್ಯಾಧಿಕಾರಿ (KN)</label>
            <input type="text" class="form-control hlt-doc-kn" value="${escapeHtml(h.doctor?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  function readSchools() {
    const schCards = document.querySelectorAll('#schools-list .dynamic-item-card');
    schCards.forEach((card, idx) => {
      if (currentData.schools[idx]) {
        currentData.schools[idx].name = { en: card.querySelector('.sch-name-en').value.trim(), kn: card.querySelector('.sch-name-kn').value.trim() };
        currentData.schools[idx].type = { en: card.querySelector('.sch-type-en').value.trim(), kn: card.querySelector('.sch-type-kn').value.trim() };
      }
    });

    const hltCards = document.querySelectorAll('#health-list .dynamic-item-card');
    hltCards.forEach((card, idx) => {
      if (currentData.health[idx]) {
        currentData.health[idx].name = { en: card.querySelector('.hlt-name-en').value.trim(), kn: card.querySelector('.hlt-name-kn').value.trim() };
        currentData.health[idx].doctor = { en: card.querySelector('.hlt-doc-en').value.trim(), kn: card.querySelector('.hlt-doc-kn').value.trim() };
      }
    });
  }

  // --- TAB 12: TRANSPORT ---
  function populateTransport() {
    const tr = currentData.transport || {};
    setVal('transport-road-en', tr.road?.en);
    setVal('transport-road-kn', tr.road?.kn);
    setVal('transport-airport-en', tr.airport?.en);
    setVal('transport-airport-kn', tr.airport?.kn);
    setVal('transport-rail-en', tr.rail?.en);
    setVal('transport-rail-kn', tr.rail?.kn);
  }

  function readTransport() {
    if (!currentData.transport) currentData.transport = {};
    currentData.transport.road = { en: getVal('transport-road-en'), kn: getVal('transport-road-kn') };
    currentData.transport.airport = { en: getVal('transport-airport-en'), kn: getVal('transport-airport-kn') };
    currentData.transport.rail = { en: getVal('transport-rail-en'), kn: getVal('transport-rail-kn') };
  }

  // --- TAB 13: CONTACTS ---
  function populateContacts() {
    renderContacts();
    const addBtn = document.getElementById('btn-add-contact');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.contacts) currentData.contacts = [];
        currentData.contacts.push({
          category: { en: "Public Services", kn: "ಸಾರ್ವಜನಿಕ ಸೇವೆ" },
          name: { en: "Officer / Person", kn: "ಅಧಿಕಾರಿ / ವ್ಯಕ್ತಿ" },
          role: { en: "Role / Service", kn: "ಸೇವೆ" },
          phone: "+91 90000 00000",
          available: { en: "24x7", kn: "೨೪x೭ ಲಭ್ಯ" }
        });
        renderContacts();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderContacts() {
    const container = document.getElementById('contacts-container');
    if (!container) return;
    const contacts = currentData.contacts || [];

    container.innerHTML = contacts.map((c, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteContact(${idx})" title="Delete contact">${CLOSE_ICON_SVG}</button>
        <div class="grid-2">
          <div class="form-group">
            <label>Name (English)</label>
            <input type="text" class="form-control c-name-en" value="${escapeHtml(c.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಹೆಸರು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control c-name-kn" value="${escapeHtml(c.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Role / Position (EN)</label>
            <input type="text" class="form-control c-role-en" value="${escapeHtml(c.role?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಹುದ್ದೆ (KN)</label>
            <input type="text" class="form-control c-role-kn" value="${escapeHtml(c.role?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Phone Number</label>
            <input type="text" class="form-control c-phone" value="${escapeHtml(c.phone || '')}">
          </div>
          <div class="form-group">
            <label>Availability / Hours</label>
            <input type="text" class="form-control c-avail-en" value="${escapeHtml(c.available?.en || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteContact = function (idx) {
    readContacts();
    if (idx >= 0 && currentData.contacts && idx < currentData.contacts.length) {
      const removed = currentData.contacts.splice(idx, 1)[0];
      renderContacts();
      updateBadges();
      markUnsaved();
      const name = removed?.name?.en || removed?.name?.kn || "Contact";
      showToast(`Removed "${name}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readContacts() {
    const cards = document.querySelectorAll('#contacts-container .admin-card');
    const contacts = [];
    cards.forEach((card, idx) => {
      const orig = currentData.contacts[idx] || {};
      contacts.push({
        ...orig,
        name: { en: card.querySelector('.c-name-en').value.trim(), kn: card.querySelector('.c-name-kn').value.trim() },
        role: { en: card.querySelector('.c-role-en').value.trim(), kn: card.querySelector('.c-role-kn').value.trim() },
        phone: card.querySelector('.c-phone').value.trim(),
        available: { en: card.querySelector('.c-avail-en').value.trim(), kn: card.querySelector('.c-avail-en').value.trim() }
      });
    });
    currentData.contacts = contacts;
  }

  // --- TAB 14: NOTICES ---
  function populateNotices() {
    renderNotices();
    const addBtn = document.getElementById('btn-add-notice');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.notices) currentData.notices = [];
        const today = new Date().toISOString().split('T')[0];
        currentData.notices.unshift({
          id: "notice_" + Date.now(),
          date: today,
          urgency: "High",
          department: { en: "Grama Panchayat", kn: "ಗ್ರಾಮ ಪಂಚಾಯತಿ" },
          title: { en: "New Public Announcement", kn: "ಹೊಸ ಸಾರ್ವಜನಿಕ ಪ್ರಕಟಣೆ" },
          content: { en: "Important notice content here...", kn: "ಪ್ರಮುಖ ಪ್ರಕಟಣೆಯ ವಿವರ ಇಲ್ಲಿದೆ..." }
        });
        renderNotices();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderNotices() {
    const container = document.getElementById('notices-container');
    if (!container) return;
    const notices = currentData.notices || [];

    container.innerHTML = notices.map((n, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteNotice(${idx})" title="Delete notice">${CLOSE_ICON_SVG}</button>
        <div class="grid-3">
          <div class="form-group">
            <label>Notice Date</label>
            <input type="date" class="form-control n-date" value="${escapeHtml(n.date || '')}">
          </div>
          <div class="form-group">
            <label>Urgency Level</label>
            <select class="form-control n-urgency">
              <option value="High" ${n.urgency === 'High' ? 'selected' : ''}>High (Alert)</option>
              <option value="Medium" ${n.urgency === 'Medium' ? 'selected' : ''}>Medium</option>
              <option value="Low" ${n.urgency === 'Low' ? 'selected' : ''}>Low (General)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Department (EN)</label>
            <input type="text" class="form-control n-dept-en" value="${escapeHtml(n.department?.en || '')}">
          </div>
        </div>

        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Notice Title (English)</label>
            <input type="text" class="form-control n-title-en" value="${escapeHtml(n.title?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಪ್ರಕಟಣೆ ಶೀರ್ಷಿಕೆ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control n-title-kn" value="${escapeHtml(n.title?.kn || '')}">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Full Content (English)</label>
          <textarea class="form-control n-content-en" rows="3">${escapeHtml(n.content?.en || '')}</textarea>
        </div>
        <div class="form-group mt-3">
          <label>ಸಂಪೂರ್ಣ ವಿವರ (ಕನ್ನಡ)</label>
          <textarea class="form-control n-content-kn" rows="3">${escapeHtml(n.content?.kn || '')}</textarea>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteNotice = function (idx) {
    readNotices();
    if (idx >= 0 && currentData.notices && idx < currentData.notices.length) {
      const removed = currentData.notices.splice(idx, 1)[0];
      renderNotices();
      updateBadges();
      markUnsaved();
      const title = removed?.title?.en || removed?.title?.kn || "Notice";
      showToast(`Removed "${title}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readNotices() {
    const cards = document.querySelectorAll('#notices-container .admin-card');
    const notices = [];
    cards.forEach((card, idx) => {
      const orig = currentData.notices[idx] || {};
      notices.push({
        ...orig,
        date: card.querySelector('.n-date').value.trim(),
        urgency: card.querySelector('.n-urgency').value,
        department: { en: card.querySelector('.n-dept-en').value.trim(), kn: orig.department?.kn || "ಗ್ರಾಮ ಪಂಚಾಯತಿ" },
        title: { en: card.querySelector('.n-title-en').value.trim(), kn: card.querySelector('.n-title-kn').value.trim() },
        content: { en: card.querySelector('.n-content-en').value.trim(), kn: card.querySelector('.n-content-kn').value.trim() }
      });
    });
    currentData.notices = notices;
  }

  // --- TAB 15: GOOGLE MAPS ---
  function populateMap() {
    const m = currentData.map || {};
    setVal('url-satellite-img', m.satelliteImage);
    const prev = document.getElementById('preview-satellite-img');
    if (prev && m.satelliteImage) prev.src = m.satelliteImage;

    setVal('map-coords', m.coordinates);
    setVal('map-elevation', m.elevation);
    setVal('map-url-search', m.googleMapsSearchUrl);
    setVal('map-url-embed', m.embedUrl);

    attachImageUploader(
      document.getElementById('file-satellite-img'),
      document.getElementById('url-satellite-img'),
      document.getElementById('preview-satellite-img'),
      (imgSrc) => {
        if (!currentData.map) currentData.map = {};
        currentData.map.satelliteImage = imgSrc;
      }
    );
  }

  function readMap() {
    if (!currentData.map) currentData.map = {};
    currentData.map.satelliteImage = getVal('url-satellite-img');
    currentData.map.coordinates = getVal('map-coords');
    currentData.map.elevation = getVal('map-elevation');
    currentData.map.googleMapsSearchUrl = getVal('map-url-search');
    currentData.map.embedUrl = getVal('map-url-embed');
  }

  // ===========================================================================
  // 7. SAVE, EXPORT, COPY & RESET HANDLERS
  // ===========================================================================

  function collectAllData() {
    readGeneral();
    readAbout();
    readHistory();
    readQuickFacts();
    readPhotos();
    readAgriculture();
    readTemples();
    readFestivals();
    delete currentData.culture;
    readPanchayat();
    readSchools();
    readTransport();
    readContacts();
    readNotices();
    readMap();
  }

  async function saveAllChanges() {
    collectAllData();
    try {
      if (window.VillageStorage && window.VillageStorage.saveData) {
        // Save to IndexedDB (virtually unlimited quota for high-res images)
        await window.VillageStorage.saveData(currentData);
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentData));
      }
      markSaved();
      showToast("All changes saved successfully! Live portal updated.");
    } catch (e) {
      console.error("Save error:", e);
      showToast("Error saving data: " + e.message, true);
    }
  }

  function exportDataJsFile() {
    collectAllData();
    const fileHeader = `/**
 * Yeliyuru Village Comprehensive Dataset
 * Location: Devanahalli Taluk, Bengaluru Rural District, Karnataka (562110)
 * Identity: The Land of Milk and Silk | Biggest Producer in Bengaluru Rural
 * Exported from Yeliyuru Admin Portal
 */

const VILLAGE_DATA = ${JSON.stringify(currentData, null, 2)};
`;

    const blob = new Blob([fileHeader], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded updated data.js! Replace data.js in your project to keep changes permanently.");
  }

  function copyCodeToClipboard() {
    collectAllData();
    const code = `const VILLAGE_DATA = ${JSON.stringify(currentData, null, 2)};`;
    navigator.clipboard.writeText(code).then(() => {
      showToast("Copied updated data.js code to clipboard!");
    }).catch(err => {
      showToast("Failed to copy code: " + err, true);
    });
  }

  async function resetToDefault() {
    if (confirm("Are you sure you want to revert all custom changes? This will reload the original default village dataset.")) {
      if (window.VillageStorage && window.VillageStorage.clearData) {
        await window.VillageStorage.clearData();
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
      const source = (typeof VILLAGE_DATA !== 'undefined' ? VILLAGE_DATA : window.VILLAGE_DATA) || {};
      currentData = JSON.parse(JSON.stringify(source));
      populateAllFields();
      markSaved();
      showToast("Reset to default village data successfully!");
    }
  }

  // Helper utils
  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ===========================================================================
  // 8. SECURITY & PASSWORD GATE ('chiru_yeliyuru_2026')
  // ===========================================================================
  const ADMIN_PASSWORD = 'chiru_yeliyuru_2026';
  const AUTH_SESSION_KEY = 'yeliyuru_admin_auth_session';

  function initSecurityGate() {
    const overlay = document.getElementById('admin-auth-overlay');
    const form = document.getElementById('admin-login-form');
    const input = document.getElementById('admin-pass-input');
    const errorMsg = document.getElementById('auth-error-msg');
    const togglePassBtn = document.getElementById('btn-toggle-pass');
    const logoutBtn = document.getElementById('btn-admin-logout');

    const isAuthenticated = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';

    if (isAuthenticated) {
      if (overlay) overlay.classList.add('hidden');
    } else {
      if (overlay) overlay.classList.remove('hidden');
      if (input) setTimeout(() => input.focus(), 250);
    }

    // Toggle password visibility
    if (togglePassBtn && input) {
      togglePassBtn.addEventListener('click', () => {
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        togglePassBtn.innerHTML = isPass ?
          (window.YELIYURU_ICONS?.eyeOff || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="22" y2="22"/></svg>') :
          (window.YELIYURU_ICONS?.eye || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>');
      });
    }

    // Login verification
    function checkLogin() {
      const entered = (input ? input.value : '').trim();
      if (entered === ADMIN_PASSWORD) {
        sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
        if (overlay) overlay.classList.add('hidden');
        if (errorMsg) errorMsg.classList.remove('show');
        if (input) input.value = '';
        showToast("Welcome Admin! Logged in successfully.");
      } else {
        if (errorMsg) {
          errorMsg.textContent = "Incorrect password! Please try again.";
          errorMsg.classList.add('show');
        }
        const card = document.querySelector('.admin-auth-card');
        if (card) {
          card.classList.add('auth-shake');
          setTimeout(() => card.classList.remove('auth-shake'), 450);
        }
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        checkLogin();
      });
    }

    const submitBtn = document.getElementById('btn-submit-auth');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        checkLogin();
      });
    }

    // Logout handler
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        if (overlay) overlay.classList.remove('hidden');
        if (errorMsg) errorMsg.classList.remove('show');
        if (input) {
          input.value = '';
          setTimeout(() => input.focus(), 250);
        }
        showToast("Logged out of admin panel.");
      });
    }
  }

  // Database health check & status indicator
  async function checkDatabaseStatus() {
    const dbIndicator = document.getElementById('db-status-text');
    if (!dbIndicator) return;
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.database) {
          const totalRows = Object.values(json.database.counts || {}).reduce((a, b) => a + b, 0);
          dbIndicator.textContent = `SQLite DB (${totalRows} records)`;
          const pill = document.getElementById('db-status-indicator');
          if (pill) {
            pill.title = `SQLite Database: yeliyuru.db (${json.database.sizeFormatted}, ${totalRows} records total)`;
          }
          const dot = document.querySelector('.db-dot');
          if (dot) dot.style.backgroundColor = '#10b981';
          return;
        }
      }
    } catch (e) {
      dbIndicator.textContent = 'IndexedDB Mode';
      const pill = document.getElementById('db-status-indicator');
      if (pill) {
        pill.title = 'Client-side storage active (IndexedDB)';
      }
      const dot = document.querySelector('.db-dot');
      if (dot) dot.style.backgroundColor = '#f59e0b';
    }
  }

  // 9. EVENT ATTACHMENTS & BOOTSTRAP
  document.addEventListener('DOMContentLoaded', () => {
    initData();
    initTheme();
    initSecurityGate();
    initTabs();
    populateAllFields();
    checkDatabaseStatus();

    // Save buttons
    const btnSave = document.getElementById('btn-save-all');
    if (btnSave) btnSave.addEventListener('click', saveAllChanges);

    document.querySelectorAll('.btn-save-quick').forEach(b => {
      b.addEventListener('click', saveAllChanges);
    });

    // Export file
    const btnExport = document.getElementById('btn-export-file');
    if (btnExport) btnExport.addEventListener('click', exportDataJsFile);

    // Copy code
    const btnCopy = document.getElementById('btn-copy-code');
    if (btnCopy) btnCopy.addEventListener('click', copyCodeToClipboard);

    // Reset default
    const btnReset = document.getElementById('btn-reset-default');
    if (btnReset) btnReset.addEventListener('click', resetToDefault);

    // Mark unsaved on any input change
    document.querySelector('.admin-main').addEventListener('input', () => {
      markUnsaved();
    });
  });

})();
