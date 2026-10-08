// ==========================================================================
// Finmunt Pinterest Automation - Pinterest Brand UI Controller
// ==========================================================================

const LOCK_SCREEN_HTML = `
  <div class="lock-card">
    <div class="lock-icon-badge">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
      </svg>
    </div>
    <h2>Finmunt Automation</h2>
    <p class="lock-subtitle">Security Lock &bull; Auto-locks every 5 minutes</p>
    
    <form id="lockForm" class="lock-form" onsubmit="handleUnlock(event)">
      <div class="lock-input-group">
        <input type="password" id="inputLockPassword" placeholder="Enter Access Password" autocomplete="current-password" required>
        <button type="button" class="btn-toggle-eye" id="btnToggleEye" onclick="togglePasswordVisibility()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
      </div>
      <div id="lockErrorMsg" class="lock-error" style="display:none;"></div>
      <button type="submit" class="btn-pinterest-primary" id="btnUnlock" style="width:100%;">
        Unlock Dashboard
      </button>
    </form>
  </div>
`;

// Global State
let cachedQueueItems = [];
let currentFilterBoard = 'all';
let currentSearchQuery = '';
let selectedUploadFile = null;

// Auth & Security state
let currentAuthToken = sessionStorage.getItem('finmunt_auth_token') || null;
const AUTO_LOCK_SECONDS = 300; // 5 minutes
let remainingLockSeconds = AUTO_LOCK_SECONDS;
let isDashboardLocked = true;
let lockInterval = null;
let isEnforcing = false;

// ==========================================================================
// Authenticated API Fetch Helper (Zero-Trust Security)
// ==========================================================================

async function authenticatedFetch(url, options = {}) {
  const token = currentAuthToken || sessionStorage.getItem('finmunt_auth_token');
  const headers = { ...(options.headers || {}) };
  
  if (token) {
    headers['x-auth-token'] = token;
  }

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    console.warn('[Security] Unauthorized request to', url);
    lockDashboard();
    throw new Error('Authentication expired or required.');
  }

  return response;
}

// ==========================================================================
// Anti-Tamper Guard (DevTools Bypass & Deletion Protection)
// ==========================================================================

function enforceSecurityLockDOM() {
  if (!isDashboardLocked || isEnforcing) return;
  isEnforcing = true;

  try {
    // 1. Ensure mainAppContainer has locked class
    const mainApp = document.getElementById('mainAppContainer');
    if (mainApp && !mainApp.classList.contains('dashboard-locked')) {
      mainApp.classList.add('dashboard-locked');
    }

    // 2. Ensure lockScreenOverlay exists
    let overlay = document.getElementById('lockScreenOverlay');
    if (!overlay || !document.body.contains(overlay)) {
      overlay = document.createElement('div');
      overlay.id = 'lockScreenOverlay';
      overlay.className = 'lock-screen-overlay';
      overlay.innerHTML = LOCK_SCREEN_HTML;
      document.body.prepend(overlay);
    } else {
      if (overlay.classList.contains('__web-inspector-hide-shortcut__')) {
        overlay.classList.remove('__web-inspector-hide-shortcut__');
      }
      if (overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.warn('Enforce guard notice:', err);
  } finally {
    isEnforcing = false;
  }
}

function setupTamperWatchdog() {
  const observer = new MutationObserver(() => {
    if (isDashboardLocked && !isEnforcing) {
      enforceSecurityLockDOM();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: false
  });

  setInterval(() => {
    if (isDashboardLocked && !isEnforcing) {
      enforceSecurityLockDOM();
    }
  }, 1000);
}

// ==========================================================================
// App Initialization
// ==========================================================================

async function init() {
  setupEventListeners();
  setupSSE();
  handleUrlParams();
  checkInitialAuth();
  setupTamperWatchdog();
}

// ==========================================================================
// Security & 5-Minute Auto-Lock Engine
// ==========================================================================

function checkInitialAuth() {
  const savedToken = sessionStorage.getItem('finmunt_auth_token');
  const sessionAuth = sessionStorage.getItem('finmunt_auth_active');
  const sessionExpire = sessionStorage.getItem('finmunt_auth_expires_at');
  const now = Date.now();

  if (savedToken && sessionAuth === 'true' && sessionExpire && now < parseInt(sessionExpire, 10)) {
    unlockDashboard(savedToken);
  } else {
    lockDashboard();
  }
}

function lockDashboard() {
  isDashboardLocked = true;
  currentAuthToken = null;
  sessionStorage.removeItem('finmunt_auth_token');
  sessionStorage.removeItem('finmunt_auth_active');
  sessionStorage.removeItem('finmunt_auth_expires_at');
  if (lockInterval) clearInterval(lockInterval);

  cachedQueueItems = [];

  const mainApp = document.getElementById('mainAppContainer');
  if (mainApp) {
    mainApp.classList.add('dashboard-locked');
    mainApp.style.display = 'none';
  }

  const overlay = document.getElementById('lockScreenOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.remove('__web-inspector-hide-shortcut__');
    overlay.style.display = 'flex';
  }

  const input = document.getElementById('inputLockPassword');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }

  const errEl = document.getElementById('lockErrorMsg');
  if (errEl) errEl.style.display = 'none';

  const timerEl = document.getElementById('lockCountdownText');
  if (timerEl) timerEl.textContent = '00:00';
}

function unlockDashboard(token) {
  isDashboardLocked = false;
  currentAuthToken = token;
  remainingLockSeconds = AUTO_LOCK_SECONDS;

  sessionStorage.setItem('finmunt_auth_token', token);
  sessionStorage.setItem('finmunt_auth_active', 'true');
  sessionStorage.setItem('finmunt_auth_expires_at', String(Date.now() + (AUTO_LOCK_SECONDS * 1000)));

  const overlay = document.getElementById('lockScreenOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  }

  const mainApp = document.getElementById('mainAppContainer');
  if (mainApp) {
    mainApp.classList.remove('dashboard-locked');
    mainApp.style.display = 'block';
  }

  startLockCountdown();

  // Load fresh verified data
  loadActivity();
  checkPinterestAuth();
  loadSupabaseQueue();
}

function startLockCountdown() {
  if (lockInterval) clearInterval(lockInterval);
  updateLockCountdownDisplay();

  lockInterval = setInterval(() => {
    remainingLockSeconds--;
    updateLockCountdownDisplay();

    if (remainingLockSeconds <= 0) {
      lockDashboard();
    }
  }, 1000);
}

function resetLockTimerOnActivity() {
  if (!isDashboardLocked) {
    remainingLockSeconds = AUTO_LOCK_SECONDS;
    sessionStorage.setItem('finmunt_auth_expires_at', String(Date.now() + (AUTO_LOCK_SECONDS * 1000)));
    updateLockCountdownDisplay();
  }
}

function updateLockCountdownDisplay() {
  const mins = Math.floor(remainingLockSeconds / 60);
  const secs = remainingLockSeconds % 60;
  const el = document.getElementById('lockCountdownText');
  if (el) {
    el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

window.handleUnlock = async function(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('inputLockPassword');
  const btn = document.getElementById('btnUnlock');
  const errEl = document.getElementById('lockErrorMsg');

  const password = input ? input.value : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying...';
  }
  if (errEl) errEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (res.ok && data.success && data.token) {
      unlockDashboard(data.token);
    } else {
      if (errEl) {
        errEl.textContent = data.error || 'Incorrect password';
        errEl.style.display = 'block';
      }
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = `Error: ${err.message}`;
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Unlock Dashboard';
    }
  }
};

window.togglePasswordVisibility = function() {
  const input = document.getElementById('inputLockPassword');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
};

// ==========================================================================
// Upload Pin (Mobile & Desktop) Handlers
// ==========================================================================

function openUploadModal() {
  const modal = document.getElementById('uploadPinModal');
  if (modal) modal.style.display = 'flex';
  resetUploadForm();
}

function closeUploadModal() {
  const modal = document.getElementById('uploadPinModal');
  if (modal) modal.style.display = 'none';
  resetUploadForm();
}

function resetUploadForm() {
  selectedUploadFile = null;
  const inputPinFile = document.getElementById('inputPinFile');
  if (inputPinFile) inputPinFile.value = '';

  const prompt = document.getElementById('dropzonePrompt');
  if (prompt) prompt.style.display = 'block';

  const preview = document.getElementById('dropzonePreview');
  if (preview) preview.style.display = 'none';

  const previewImg = document.getElementById('previewImageEl');
  if (previewImg) previewImg.src = '';

  const fields = ['uploadTitle', 'uploadDescription', 'uploadAltText', 'uploadTags'];
  fields.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });

  const alertMsg = document.getElementById('uploadAlertMsg');
  if (alertMsg) alertMsg.style.display = 'none';

  const submitBtn = document.getElementById('btnSubmitUpload');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '🚀 Push to Supabase Cloud Queue';
  }
  updateCharCounters();
}

window.handleFileSelected = function(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  selectedUploadFile = file;
  const reader = new FileReader();
  reader.onload = (event) => {
    const previewImg = document.getElementById('previewImageEl');
    if (previewImg) previewImg.src = event.target.result;
    const prompt = document.getElementById('dropzonePrompt');
    if (prompt) prompt.style.display = 'none';
    const preview = document.getElementById('dropzonePreview');
    if (preview) preview.style.display = 'flex';
  };
  reader.readAsDataURL(file);
};

window.removeSelectedFile = function(e) {
  if (e) e.stopPropagation();
  selectedUploadFile = null;
  const input = document.getElementById('inputPinFile');
  if (input) input.value = '';
  const prompt = document.getElementById('dropzonePrompt');
  if (prompt) prompt.style.display = 'block';
  const preview = document.getElementById('dropzonePreview');
  if (preview) preview.style.display = 'none';
  const previewImg = document.getElementById('previewImageEl');
  if (previewImg) previewImg.src = '';
};

window.updateCharCounters = function() {
  const titleEl = document.getElementById('uploadTitle');
  const descEl = document.getElementById('uploadDescription');
  const altEl = document.getElementById('uploadAltText');

  const titleLen = (titleEl?.value || '').length;
  const descLen = (descEl?.value || '').length;
  const altLen = (altEl?.value || '').length;

  const titleCnt = document.getElementById('titleCharCount');
  const descCnt = document.getElementById('descCharCount');
  const altCnt = document.getElementById('altCharCount');

  if (titleCnt) titleCnt.textContent = `${titleLen}/100`;
  if (descCnt) descCnt.textContent = `${descLen}/500`;
  if (altCnt) altCnt.textContent = `${altLen}/500`;
};

window.runAiAutoAnalyze = async function() {
  if (!selectedUploadFile) {
    showUploadAlert('error', 'Please choose an image file first.');
    return;
  }

  const btn = document.getElementById('btnAiAutoAnalyze');
  const btnText = document.getElementById('aiAutoAnalyzeText');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Analyzing image with Ollama Vision...';

  const alertMsg = document.getElementById('uploadAlertMsg');
  if (alertMsg) alertMsg.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('image', selectedUploadFile);

    const res = await authenticatedFetch('/api/analyze/image', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'AI Analysis failed');

    const titleEl = document.getElementById('uploadTitle');
    const descEl = document.getElementById('uploadDescription');
    const altEl = document.getElementById('uploadAltText');
    const tagsEl = document.getElementById('uploadTags');
    const boardEl = document.getElementById('uploadBoard');

    if (titleEl) titleEl.value = data.title || '';
    if (descEl) descEl.value = data.description || '';
    if (altEl) altEl.value = data.altText || '';
    if (tagsEl) tagsEl.value = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '');

    if (data.boardId && boardEl) {
      for (const opt of boardEl.options) {
        if (opt.value.startsWith(data.boardId) || opt.text.toLowerCase() === (data.boardName || '').toLowerCase()) {
          opt.selected = true;
          break;
        }
      }
    }

    updateCharCounters();
    showUploadAlert('success', `✓ AI generated metadata for "${data.boardName || 'Selected'}" board!`);
  } catch (err) {
    showUploadAlert('error', `AI Analysis error: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Auto-Fill with AI (Ollama Vision)';
  }
};

window.submitUploadPin = async function() {
  if (!selectedUploadFile) {
    showUploadAlert('error', 'Please select an image file to upload.');
    return;
  }

  const title = (document.getElementById('uploadTitle')?.value || '').trim();
  const description = (document.getElementById('uploadDescription')?.value || '').trim();
  const altText = (document.getElementById('uploadAltText')?.value || '').trim();
  const tags = (document.getElementById('uploadTags')?.value || '').trim();
  const boardVal = document.getElementById('uploadBoard')?.value || '|';
  const [boardId, boardName] = boardVal.split('|');

  const btn = document.getElementById('btnSubmitUpload');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Pushing to Supabase Cloud...';
  }

  try {
    const formData = new FormData();
    formData.append('image', selectedUploadFile);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('altText', altText);
    formData.append('tags', tags);
    formData.append('boardId', boardId);
    formData.append('boardName', boardName);
    formData.append('autoAnalyze', (!title || !description) ? 'true' : 'false');

    const res = await authenticatedFetch('/api/upload/pin', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Upload failed');

    showUploadAlert('success', '✓ Pin successfully queued in Supabase Cloud!');
    setTimeout(() => {
      closeUploadModal();
      loadSupabaseQueue();
      loadActivity();
    }, 1200);
  } catch (err) {
    showUploadAlert('error', `Upload error: ${err.message}`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 Push to Supabase Cloud Queue';
    }
  }
};

function showUploadAlert(type, message) {
  const el = document.getElementById('uploadAlertMsg');
  if (!el) return;
  el.className = `modal-alert ${type}`;
  el.textContent = message;
  el.style.display = 'block';
}

// ==========================================================================
// Cloud Queue Loader & Renderer
// ==========================================================================

async function loadSupabaseQueue() {
  if (isDashboardLocked) return;

  try {
    const res = await authenticatedFetch('/api/supabase/queue');
    const data = await res.json();
    
    if (data.items) {
      cachedQueueItems = data.items;
      const count = data.items.length;

      const queueText = document.getElementById('supabaseQueueCountText');
      const btnCount = document.getElementById('btnQueueCount');
      const tabBadge = document.getElementById('tabQueueCountBadge');
      const modalBadge = document.getElementById('modalQueueCountBadge');
      const filterAll = document.getElementById('countFilterAll');

      if (queueText) queueText.textContent = `${count} ready`;
      if (btnCount) btnCount.textContent = count;
      if (tabBadge) tabBadge.textContent = count;
      if (modalBadge) modalBadge.textContent = count;
      if (filterAll) filterAll.textContent = count;

      renderQueueCards(document.getElementById('queuePostsGrid'));
      renderQueueCards(document.getElementById('modalPostsGrid'));
    }
  } catch (err) {
    console.warn('Could not fetch Supabase queue:', err.message);
  }
}

function renderQueueCards(container) {
  if (!container) return;

  let filtered = cachedQueueItems.filter(item => {
    const matchBoard = currentFilterBoard === 'all' || (item.board_name || '').toLowerCase() === currentFilterBoard.toLowerCase();
    const query = currentSearchQuery.trim().toLowerCase();
    if (!query) return matchBoard;

    const matchText = (item.title || '').toLowerCase().includes(query) ||
                      (item.description || '').toLowerCase().includes(query) ||
                      (item.board_name || '').toLowerCase().includes(query) ||
                      (item.tags || '').toLowerCase().includes(query);
    return matchBoard && matchText;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="loading-state">
        <p style="font-weight: 600; font-size: 15px;">No pins match your current filter</p>
        <span style="font-size: 13px; color: var(--text-muted);">
          ${cachedQueueItems.length === 0 ? 'Click "+ Upload Pin" to push pins.' : 'Try changing the search or board filter.'}
        </span>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((pin, idx) => {
    const boardSlug = getBoardSlug(pin.board_name);
    const tagsArray = typeof pin.tags === 'string' ? pin.tags.split(',').map(t => t.trim()).filter(Boolean) : (pin.tags || []);
    
    return `
      <article class="pin-card" data-id="${escapeHtml(pin.id)}">
        <div class="pin-card-media">
          <img src="${escapeHtml(pin.image_url)}" alt="${escapeHtml(pin.alt_text || pin.title)}" class="pin-card-img" loading="lazy">
          <span class="pin-card-badge">#${idx + 1}</span>
        </div>

        <div class="pin-card-body">
          <span class="pin-board-badge board-${boardSlug}">
            ${escapeHtml(pin.board_name || 'General')}
          </span>

          <h3 class="pin-title">${escapeHtml(pin.title)}</h3>

          <p class="pin-description" id="desc_${escapeHtml(pin.id)}">
            ${escapeHtml(pin.description)}
          </p>
          ${(pin.description && pin.description.length > 120) ? `
            <button class="btn-toggle-desc" onclick="toggleDescription('${escapeHtml(pin.id)}')">
              Read more &darr;
            </button>
          ` : ''}

          ${tagsArray.length > 0 ? `
            <div class="pin-tags-row">
              ${tagsArray.slice(0, 4).map(t => `<span class="pin-tag-chip">#${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}

          <div class="pin-card-footer">
            <span class="pin-alt-text-preview" title="${escapeHtml(pin.alt_text || 'No alt text')}">
              👁️ ${escapeHtml(pin.alt_text || 'Alt text verified')}
            </span>
            <button class="btn-copy-meta" onclick="copyPinMetadata('${escapeHtml(pin.id)}')" title="Copy title and description">
              Copy
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function getBoardSlug(boardName) {
  if (!boardName) return 'save-money';
  const norm = boardName.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-').trim();
  if (norm.includes('save')) return 'save-money';
  if (norm.includes('make')) return 'make-money';
  if (norm.includes('budget')) return 'budgeting';
  if (norm.includes('invest')) return 'investing';
  if (norm.includes('debt') || norm.includes('credit')) return 'debt-credit';
  return 'save-money';
}

window.toggleDescription = function(pinId) {
  const descEl = document.getElementById(`desc_${pinId}`);
  if (!descEl) return;
  descEl.classList.toggle('expanded');
  const btn = descEl.nextElementSibling;
  if (btn && btn.classList.contains('btn-toggle-desc')) {
    btn.innerHTML = descEl.classList.contains('expanded') ? 'Show less &uarr;' : 'Read more &darr;';
  }
};

window.copyPinMetadata = function(pinId) {
  const pin = cachedQueueItems.find(p => p.id === pinId);
  if (!pin) return;
  const text = `Title: ${pin.title}\n\nDescription: ${pin.description}\n\nBoard: ${pin.board_name}\nTags: ${pin.tags || ''}`;
  navigator.clipboard.writeText(text).then(() => {
    alert('Pin metadata copied to clipboard!');
  }).catch(() => {});
};

// ==========================================================================
// 7-Day Activity Feed & Schedule
// ==========================================================================

async function loadActivity() {
  if (isDashboardLocked) return;

  try {
    const res = await authenticatedFetch('/api/activity');
    if (!res.ok) throw new Error('Failed to fetch activity');
    const data = await res.json();

    const nextSlotEl = document.getElementById('nextSlotText');
    if (data.nextSlot && nextSlotEl) {
      nextSlotEl.textContent = data.nextSlot.displayText;
    }

    const waitCountEl = document.getElementById('waitingCountText');
    if (data.waitingImagesCount !== undefined && waitCountEl) {
      waitCountEl.textContent = `${data.waitingImagesCount} images`;
    }

    const triggerBtn = document.getElementById('btnTriggerNow');
    if (triggerBtn) {
      if (data.isBusy) {
        triggerBtn.disabled = true;
        triggerBtn.innerHTML = `
          <span class="pinterest-spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></span>
          Publishing...
        `;
      } else {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Trigger Slot
        `;
      }
    }

    if (data.activity && data.activity.days) {
      renderActivity(data.activity.days);
    }
  } catch (err) {
    const feed = document.getElementById('activityFeed');
    if (feed && !isDashboardLocked) {
      feed.innerHTML = `
        <div class="loading-state">
          <p>Error loading activity: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }
}

function renderActivity(days) {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;

  if (!days || days.length === 0) {
    feed.innerHTML = `
      <div class="loading-state">
        <p>No activity records available yet.</p>
      </div>
    `;
    return;
  }

  feed.innerHTML = days.map(day => {
    const isComplete = day.successCount === day.totalSlots && day.totalSlots > 0;
    const countBadgeClass = isComplete ? 'day-count-badge day-count-complete' : 'day-count-badge';

    return `
      <section class="day-card">
        <div class="day-card-header">
          <div class="day-date-group">
            <h2 class="day-title">${escapeHtml(day.label)}</h2>
            <span class="day-weekday-pill">${escapeHtml(day.weekday)}</span>
          </div>
          <span class="${countBadgeClass}">${escapeHtml(day.summaryText)}</span>
        </div>

        <div class="slots-list">
          ${(day.slots || []).map(slot => renderSlotItem(slot)).join('')}
        </div>
      </section>
    `;
  }).join('');
}

function renderSlotItem(slot) {
  const status = slot.status || 'PENDING';
  let badgeClass = 'badge-upcoming';
  let badgeText = 'Upcoming';

  if (status === 'COMPLETED') {
    badgeClass = 'badge-completed';
    badgeText = 'Completed';
  } else if (status === 'FAILED') {
    badgeClass = 'badge-failed';
    badgeText = 'Failed';
  } else if (status === 'SKIPPED') {
    badgeClass = 'badge-skipped';
    badgeText = 'Skipped';
  }

  let detailsHtml = '';
  if (slot.filename) {
    detailsHtml = `
      <div class="slot-details">
        <span class="slot-filename">${escapeHtml(slot.filename)}</span>
        ${slot.boardName ? `<span class="slot-board-tag">${escapeHtml(slot.boardName)}</span>` : ''}
        ${slot.pinId ? `<a href="https://www.pinterest.com/pin/${escapeHtml(slot.pinId)}/" target="_blank" rel="noopener noreferrer" class="slot-pin-link">View Pin &rarr;</a>` : ''}
      </div>
    `;
  } else if (slot.error) {
    detailsHtml = `<div class="slot-details"><span style="color:var(--text-muted);font-size:12px">${escapeHtml(slot.error)}</span></div>`;
  }

  return `
    <div class="slot-item">
      <div class="slot-left">
        <span class="slot-time-pill">${escapeHtml(slot.slotTime)}</span>
        ${detailsHtml}
      </div>
      <span class="slot-status-badge ${badgeClass}">${badgeText}</span>
    </div>
  `;
}

// ==========================================================================
// Pinterest Auth Check & Event Listeners
// ==========================================================================

async function checkPinterestAuth() {
  if (isDashboardLocked) return;

  const dot = document.getElementById('pinterestStatusDot');
  const text = document.getElementById('pinterestStatusText');
  const pill = document.getElementById('pinterestStatusPill');

  try {
    const res = await authenticatedFetch('/api/pinterest/status');
    const data = await res.json();

    if (data.connected) {
      if (dot) {
        dot.style.backgroundColor = '#22c55e';
        dot.className = 'status-pill-dot dot-pulsing';
      }
      if (text) text.innerHTML = `Pinterest: <strong>@${escapeHtml(data.username || 'Finmunt')}</strong>`;
      if (pill) pill.title = `Connected to Pinterest (@${data.username}). Click to manage credentials.`;
    } else if (data.hasToken) {
      if (dot) {
        dot.style.backgroundColor = '#ef4444';
        dot.className = 'status-pill-dot';
      }
      if (text) text.innerHTML = `Pinterest: <strong>Invalid Token</strong>`;
      if (pill) pill.title = `Token Error: ${data.reason}. Click to re-authenticate.`;
    } else {
      if (dot) {
        dot.style.backgroundColor = '#f59e0b';
        dot.className = 'status-pill-dot';
      }
      if (text) text.innerHTML = `Pinterest: <strong>Connect API</strong>`;
      if (pill) pill.title = 'Click to connect Pinterest account';
    }
  } catch (err) {
    if (dot) {
      dot.style.backgroundColor = '#ef4444';
      dot.className = 'status-pill-dot';
    }
    if (text) text.innerHTML = `Pinterest: <strong>Offline</strong>`;
  }
}

function setupSSE() {
  try {
    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('activity_update', (e) => {
      try {
        if (!isDashboardLocked) {
          const data = JSON.parse(e.data);
          renderActivity(data.days);
        }
      } catch (err) {}
    });

    eventSource.addEventListener('published', () => {
      if (!isDashboardLocked) {
        loadActivity();
        loadSupabaseQueue();
      }
    });

    eventSource.addEventListener('queued', () => {
      if (!isDashboardLocked) {
        loadActivity();
        loadSupabaseQueue();
      }
    });
  } catch (err) {
    console.warn('SSE connection notice:', err);
  }
}

function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('auth_success')) {
    showModalAlert('success', 'Pinterest account successfully connected via OAuth!');
    openAuthModal();
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.has('auth_error')) {
    showModalAlert('error', `OAuth Error: ${params.get('auth_error')}`);
    openAuthModal();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'flex';
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'none';
}

function openPostsModal() {
  const modal = document.getElementById('allPostsModal');
  if (modal) modal.style.display = 'flex';
  renderQueueCards(document.getElementById('modalPostsGrid'));
}

function closePostsModal() {
  const modal = document.getElementById('allPostsModal');
  if (modal) modal.style.display = 'none';
}

function showModalAlert(type, message) {
  const alertEl = document.getElementById('modalStatusAlert');
  if (!alertEl) return;
  alertEl.className = `modal-alert ${type}`;
  alertEl.textContent = message;
  alertEl.style.display = 'block';
}

function setupEventListeners() {
  // Activity tracking for auto-lock reset
  ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetLockTimerOnActivity, { passive: true });
  });

  // Lock button
  document.getElementById('btnLockNow')?.addEventListener('click', lockDashboard);

  // Upload modal triggers
  document.getElementById('btnOpenUploadModal')?.addEventListener('click', openUploadModal);
  document.getElementById('btnCloseUploadModal')?.addEventListener('click', closeUploadModal);
  const uploadModal = document.getElementById('uploadPinModal');
  if (uploadModal) {
    uploadModal.addEventListener('click', (e) => {
      if (e.target === uploadModal) closeUploadModal();
    });
  }

  // Trigger Slot Now
  document.getElementById('btnTriggerNow')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnTriggerNow');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Publishing...';
      }
      const res = await authenticatedFetch('/api/publish/trigger', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to trigger publishing');
      }
      setTimeout(() => {
        loadActivity();
        loadSupabaseQueue();
      }, 1000);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  // Tab switching
  const tabSched = document.getElementById('tabSchedule');
  const tabQ = document.getElementById('tabQueue');
  const schedView = document.getElementById('scheduleView');
  const qView = document.getElementById('queueView');

  if (tabSched && tabQ && schedView && qView) {
    tabSched.addEventListener('click', () => {
      tabSched.classList.add('active');
      tabQ.classList.remove('active');
      schedView.classList.add('active');
      qView.classList.remove('active');
    });

    tabQ.addEventListener('click', () => {
      tabQ.classList.add('active');
      tabSched.classList.remove('active');
      qView.classList.add('active');
      schedView.classList.remove('active');
      renderQueueCards(document.getElementById('queuePostsGrid'));
    });
  }

  // Modals & see all posts
  document.getElementById('btnSeeAllPosts')?.addEventListener('click', openPostsModal);
  document.getElementById('cloudQueuePill')?.addEventListener('click', openPostsModal);
  document.getElementById('btnClosePostsModal')?.addEventListener('click', closePostsModal);
  const postsModal = document.getElementById('allPostsModal');
  if (postsModal) {
    postsModal.addEventListener('click', (e) => {
      if (e.target === postsModal) closePostsModal();
    });
  }

  // Auth modal
  document.getElementById('pinterestStatusPill')?.addEventListener('click', openAuthModal);
  document.getElementById('btnCloseModal')?.addEventListener('click', closeAuthModal);
  const authMod = document.getElementById('authModal');
  if (authMod) {
    authMod.addEventListener('click', (e) => {
      if (e.target === authMod) closeAuthModal();
    });
  }

  // Filters
  function attachFilterEvents(container) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-chip');
      if (!btn) return;
      
      container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentFilterBoard = btn.getAttribute('data-board') || 'all';

      renderQueueCards(document.getElementById('queuePostsGrid'));
      renderQueueCards(document.getElementById('modalPostsGrid'));
    });
  }

  attachFilterEvents(document.getElementById('boardFilterChips'));
  attachFilterEvents(document.getElementById('modalBoardFilterChips'));

  document.getElementById('inputQueueSearch')?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderQueueCards(document.getElementById('queuePostsGrid'));
  });

  document.getElementById('inputModalSearch')?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderQueueCards(document.getElementById('modalPostsGrid'));
  });

  // Save Token
  document.getElementById('btnSaveToken')?.addEventListener('click', async () => {
    const token = document.getElementById('inputAccessToken')?.value.trim();
    const appId = document.getElementById('inputAppId')?.value.trim();
    const appSecret = document.getElementById('inputAppSecret')?.value.trim();
    const btn = document.getElementById('btnSaveToken');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Testing connection...';
    }

    try {
      const res = await authenticatedFetch('/api/settings/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, appId, appSecret })
      });
      const data = await res.json();

      if (data.connected) {
        showModalAlert('success', `Connected successfully to Pinterest as @${data.username}!`);
        setTimeout(() => {
          closeAuthModal();
          checkPinterestAuth();
        }, 1500);
      } else {
        showModalAlert('error', `Connection failed: ${data.reason || 'Invalid credentials'}`);
      }
    } catch (err) {
      showModalAlert('error', `Connection error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save & Test Connection';
      }
      checkPinterestAuth();
    }
  });

  // Disconnect Account
  document.getElementById('btnDisconnect')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to disconnect this Pinterest account?')) return;
    try {
      const res = await authenticatedFetch('/api/pinterest/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showModalAlert('success', 'Pinterest account disconnected successfully.');
        const tokenInput = document.getElementById('inputAccessToken');
        if (tokenInput) tokenInput.value = '';
        setTimeout(() => {
          closeAuthModal();
          checkPinterestAuth();
        }, 1000);
      }
    } catch (err) {
      showModalAlert('error', `Disconnect error: ${err.message}`);
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', init);
