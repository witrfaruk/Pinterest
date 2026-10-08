// ==========================================================================
// Finmunt Pinterest Automation - Pinterest Brand UI Controller
// ==========================================================================

const elements = {
  // Main
  activityFeed: document.getElementById('activityFeed'),
  btnTriggerNow: document.getElementById('btnTriggerNow'),
  btnSeeAllPosts: document.getElementById('btnSeeAllPosts'),
  btnQueueCount: document.getElementById('btnQueueCount'),
  headerSubtitle: document.getElementById('headerSubtitle'),
  nextSlotText: document.getElementById('nextSlotText'),
  waitingCountText: document.getElementById('waitingCountText'),
  supabaseQueueCountText: document.getElementById('supabaseQueueCountText'),
  cloudQueuePill: document.getElementById('cloudQueuePill'),
  pinterestStatusPill: document.getElementById('pinterestStatusPill'),
  pinterestStatusDot: document.getElementById('pinterestStatusDot'),
  pinterestStatusText: document.getElementById('pinterestStatusText'),
  btnLockNow: document.getElementById('btnLockNow'),
  lockCountdownText: document.getElementById('lockCountdownText'),
  
  // Security Lock
  lockScreenOverlay: document.getElementById('lockScreenOverlay'),
  inputLockPassword: document.getElementById('inputLockPassword'),
  lockErrorMsg: document.getElementById('lockErrorMsg'),
  btnUnlock: document.getElementById('btnUnlock'),

  // Tabs
  tabSchedule: document.getElementById('tabSchedule'),
  tabQueue: document.getElementById('tabQueue'),
  tabQueueCountBadge: document.getElementById('tabQueueCountBadge'),
  scheduleView: document.getElementById('scheduleView'),
  queueView: document.getElementById('queueView'),
  
  // Queue Grids
  queuePostsGrid: document.getElementById('queuePostsGrid'),
  modalPostsGrid: document.getElementById('modalPostsGrid'),
  inputQueueSearch: document.getElementById('inputQueueSearch'),
  inputModalSearch: document.getElementById('inputModalSearch'),
  boardFilterChips: document.getElementById('boardFilterChips'),
  modalBoardFilterChips: document.getElementById('modalBoardFilterChips'),
  countFilterAll: document.getElementById('countFilterAll'),
  modalQueueCountBadge: document.getElementById('modalQueueCountBadge'),

  // Upload Modal
  btnOpenUploadModal: document.getElementById('btnOpenUploadModal'),
  uploadPinModal: document.getElementById('uploadPinModal'),
  btnCloseUploadModal: document.getElementById('btnCloseUploadModal'),
  inputPinFile: document.getElementById('inputPinFile'),
  dropzonePrompt: document.getElementById('dropzonePrompt'),
  dropzonePreview: document.getElementById('dropzonePreview'),
  previewImageEl: document.getElementById('previewImageEl'),
  btnAiAutoAnalyze: document.getElementById('btnAiAutoAnalyze'),
  aiAutoAnalyzeText: document.getElementById('aiAutoAnalyzeText'),
  uploadTitle: document.getElementById('uploadTitle'),
  uploadBoard: document.getElementById('uploadBoard'),
  uploadDescription: document.getElementById('uploadDescription'),
  uploadAltText: document.getElementById('uploadAltText'),
  uploadTags: document.getElementById('uploadTags'),
  btnSubmitUpload: document.getElementById('btnSubmitUpload'),
  uploadAlertMsg: document.getElementById('uploadAlertMsg'),
  titleCharCount: document.getElementById('titleCharCount'),
  descCharCount: document.getElementById('descCharCount'),
  altCharCount: document.getElementById('altCharCount'),

  // Modals
  allPostsModal: document.getElementById('allPostsModal'),
  btnClosePostsModal: document.getElementById('btnClosePostsModal'),
  authModal: document.getElementById('authModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  inputAccessToken: document.getElementById('inputAccessToken'),
  inputAppId: document.getElementById('inputAppId'),
  inputAppSecret: document.getElementById('inputAppSecret'),
  btnSaveToken: document.getElementById('btnSaveToken'),
  btnDisconnect: document.getElementById('btnDisconnect'),
  modalStatusAlert: document.getElementById('modalStatusAlert')
};

// Global state
let cachedQueueItems = [];
let currentFilterBoard = 'all';
let currentSearchQuery = '';
let selectedUploadFile = null;

// Auto-lock state (5 minutes = 300 seconds)
const AUTO_LOCK_SECONDS = 300;
let remainingLockSeconds = AUTO_LOCK_SECONDS;
let isDashboardLocked = true;
let lockInterval = null;

async function init() {
  checkInitialAuth();
  setupEventListeners();
  setupSSE();
  handleUrlParams();
  
  await Promise.all([
    loadActivity(),
    checkPinterestAuth(),
    loadSupabaseQueue()
  ]);

  // Periodic fallback refresh every 4 seconds
  setInterval(() => {
    if (!isDashboardLocked) {
      loadActivity();
      loadSupabaseQueue();
    }
  }, 4000);
}

// ==========================================================================
// Security & 5-Minute Auto-Lock Engine
// ==========================================================================

function checkInitialAuth() {
  const sessionAuth = sessionStorage.getItem('finmunt_auth_active');
  const sessionExpire = sessionStorage.getItem('finmunt_auth_expires_at');
  const now = Date.now();

  if (sessionAuth === 'true' && sessionExpire && now < parseInt(sessionExpire, 10)) {
    unlockDashboard();
  } else {
    lockDashboard();
  }
}

function lockDashboard() {
  isDashboardLocked = true;
  sessionStorage.removeItem('finmunt_auth_active');
  sessionStorage.removeItem('finmunt_auth_expires_at');
  if (lockInterval) clearInterval(lockInterval);

  elements.lockScreenOverlay.style.display = 'flex';
  elements.inputLockPassword.value = '';
  elements.lockErrorMsg.style.display = 'none';
  elements.lockCountdownText.textContent = '00:00';
  setTimeout(() => elements.inputLockPassword.focus(), 150);
}

function unlockDashboard() {
  isDashboardLocked = false;
  elements.lockScreenOverlay.style.display = 'none';
  remainingLockSeconds = AUTO_LOCK_SECONDS;

  sessionStorage.setItem('finmunt_auth_active', 'true');
  sessionStorage.setItem('finmunt_auth_expires_at', String(Date.now() + (AUTO_LOCK_SECONDS * 1000)));

  startLockCountdown();
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
  elements.lockCountdownText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

window.handleUnlock = async function(e) {
  e.preventDefault();
  const password = elements.inputLockPassword.value;
  elements.btnUnlock.disabled = true;
  elements.btnUnlock.textContent = 'Verifying...';
  elements.lockErrorMsg.style.display = 'none';

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      unlockDashboard();
      loadActivity();
      loadSupabaseQueue();
    } else {
      elements.lockErrorMsg.textContent = data.error || 'Incorrect password';
      elements.lockErrorMsg.style.display = 'block';
      elements.inputLockPassword.value = '';
      elements.inputLockPassword.focus();
    }
  } catch (err) {
    elements.lockErrorMsg.textContent = `Error: ${err.message}`;
    elements.lockErrorMsg.style.display = 'block';
  } finally {
    elements.btnUnlock.disabled = false;
    elements.btnUnlock.textContent = 'Unlock Dashboard';
  }
};

window.togglePasswordVisibility = function() {
  const input = elements.inputLockPassword;
  input.type = input.type === 'password' ? 'text' : 'password';
};

// ==========================================================================
// Upload Pin (Mobile & Desktop) Handlers
// ==========================================================================

function openUploadModal() {
  elements.uploadPinModal.style.display = 'flex';
  resetUploadForm();
}

function closeUploadModal() {
  elements.uploadPinModal.style.display = 'none';
  resetUploadForm();
}

function resetUploadForm() {
  selectedUploadFile = null;
  elements.inputPinFile.value = '';
  elements.dropzonePrompt.style.display = 'block';
  elements.dropzonePreview.style.display = 'none';
  elements.previewImageEl.src = '';
  elements.uploadTitle.value = '';
  elements.uploadDescription.value = '';
  elements.uploadAltText.value = '';
  elements.uploadTags.value = '';
  elements.uploadAlertMsg.style.display = 'none';
  elements.btnSubmitUpload.disabled = false;
  elements.btnSubmitUpload.textContent = '🚀 Push to Supabase Cloud Queue';
  updateCharCounters();
}

window.handleFileSelected = function(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  selectedUploadFile = file;
  const reader = new FileReader();
  reader.onload = (event) => {
    elements.previewImageEl.src = event.target.result;
    elements.dropzonePrompt.style.display = 'none';
    elements.dropzonePreview.style.display = 'flex';
  };
  reader.readAsDataURL(file);
};

window.removeSelectedFile = function(e) {
  e.stopPropagation();
  selectedUploadFile = null;
  elements.inputPinFile.value = '';
  elements.dropzonePrompt.style.display = 'block';
  elements.dropzonePreview.style.display = 'none';
  elements.previewImageEl.src = '';
};

window.updateCharCounters = function() {
  const titleLen = (elements.uploadTitle.value || '').length;
  const descLen = (elements.uploadDescription.value || '').length;
  const altLen = (elements.uploadAltText.value || '').length;

  elements.titleCharCount.textContent = `${titleLen}/100`;
  elements.descCharCount.textContent = `${descLen}/500`;
  elements.altCharCount.textContent = `${altLen}/500`;

  elements.titleCharCount.style.color = titleLen > 100 ? 'var(--pinterest-red)' : 'var(--text-subtle)';
  elements.descCharCount.style.color = descLen > 500 ? 'var(--pinterest-red)' : 'var(--text-subtle)';
  elements.altCharCount.style.color = altLen > 500 ? 'var(--pinterest-red)' : 'var(--text-subtle)';
};

window.runAiAutoAnalyze = async function() {
  if (!selectedUploadFile) {
    showUploadAlert('error', 'Please choose an image file first.');
    return;
  }

  elements.btnAiAutoAnalyze.disabled = true;
  elements.aiAutoAnalyzeText.textContent = 'Analyzing image with Ollama Vision...';
  elements.uploadAlertMsg.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('image', selectedUploadFile);

    const res = await fetch('/api/analyze/image', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'AI Analysis failed');

    elements.uploadTitle.value = data.title || '';
    elements.uploadDescription.value = data.description || '';
    elements.uploadAltText.value = data.altText || '';
    elements.uploadTags.value = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '');

    // Select the board in dropdown
    if (data.boardId) {
      for (const opt of elements.uploadBoard.options) {
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
    elements.btnAiAutoAnalyze.disabled = false;
    elements.aiAutoAnalyzeText.textContent = 'Auto-Fill with AI (Ollama Vision)';
  }
};

window.submitUploadPin = async function() {
  if (!selectedUploadFile) {
    showUploadAlert('error', 'Please select an image file to upload.');
    return;
  }

  const title = elements.uploadTitle.value.trim();
  const description = elements.uploadDescription.value.trim();
  const altText = elements.uploadAltText.value.trim();
  const tags = elements.uploadTags.value.trim();
  const [boardId, boardName] = elements.uploadBoard.value.split('|');

  elements.btnSubmitUpload.disabled = true;
  elements.btnSubmitUpload.textContent = 'Pushing to Supabase Cloud...';

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

    const res = await fetch('/api/upload/pin', {
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
    elements.btnSubmitUpload.disabled = false;
    elements.btnSubmitUpload.textContent = '🚀 Push to Supabase Cloud Queue';
  }
};

function showUploadAlert(type, message) {
  elements.uploadAlertMsg.className = `modal-alert ${type}`;
  elements.uploadAlertMsg.textContent = message;
  elements.uploadAlertMsg.style.display = 'block';
}

// ==========================================================================
// Cloud Queue Loader & Renderer
// ==========================================================================

async function loadSupabaseQueue() {
  try {
    const res = await fetch('/api/supabase/queue');
    const data = await res.json();
    
    if (data.items) {
      cachedQueueItems = data.items;
      const count = data.items.length;

      if (elements.supabaseQueueCountText) elements.supabaseQueueCountText.textContent = `${count} ready`;
      if (elements.btnQueueCount) elements.btnQueueCount.textContent = count;
      if (elements.tabQueueCountBadge) elements.tabQueueCountBadge.textContent = count;
      if (elements.modalQueueCountBadge) elements.modalQueueCountBadge.textContent = count;
      if (elements.countFilterAll) elements.countFilterAll.textContent = count;

      renderQueueCards(elements.queuePostsGrid);
      renderQueueCards(elements.modalPostsGrid);
    }
  } catch (err) {
    console.warn('Could not fetch Supabase queue:', err);
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
          ${cachedQueueItems.length === 0 ? 'Click "+ Upload Pin" or drop images in Images/ folder.' : 'Try changing the search or board filter.'}
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
  try {
    const res = await fetch('/api/activity');
    if (!res.ok) throw new Error('Failed to fetch activity');
    const data = await res.json();

    if (data.nextSlot) {
      elements.nextSlotText.textContent = data.nextSlot.displayText;
    }

    if (data.waitingImagesCount !== undefined) {
      elements.waitingCountText.textContent = `${data.waitingImagesCount} images`;
    }

    if (data.isBusy) {
      elements.btnTriggerNow.disabled = true;
      elements.btnTriggerNow.innerHTML = `
        <span class="pinterest-spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></span>
        Publishing...
      `;
    } else {
      elements.btnTriggerNow.disabled = false;
      elements.btnTriggerNow.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Trigger Slot
      `;
    }

    renderActivity(data.activity.days);
  } catch (err) {
    elements.activityFeed.innerHTML = `
      <div class="loading-state">
        <p>Error loading activity: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderActivity(days) {
  if (!days || days.length === 0) {
    elements.activityFeed.innerHTML = `
      <div class="loading-state">
        <p>No activity records available yet.</p>
      </div>
    `;
    return;
  }

  elements.activityFeed.innerHTML = days.map(day => {
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
  try {
    const res = await fetch('/api/pinterest/status');
    const data = await res.json();

    if (data.connected) {
      elements.pinterestStatusDot.style.backgroundColor = '#22c55e';
      elements.pinterestStatusDot.className = 'status-pill-dot dot-pulsing';
      elements.pinterestStatusText.innerHTML = `Pinterest: <strong>@${escapeHtml(data.username || 'Finmunt')}</strong>`;
      elements.pinterestStatusPill.title = `Connected to Pinterest (@${data.username}). Click to manage credentials.`;
    } else if (data.hasToken) {
      elements.pinterestStatusDot.style.backgroundColor = '#ef4444';
      elements.pinterestStatusDot.className = 'status-pill-dot';
      elements.pinterestStatusText.innerHTML = `Pinterest: <strong>Invalid Token</strong>`;
      elements.pinterestStatusPill.title = `Token Error: ${data.reason}. Click to re-authenticate.`;
    } else {
      elements.pinterestStatusDot.style.backgroundColor = '#f59e0b';
      elements.pinterestStatusDot.className = 'status-pill-dot';
      elements.pinterestStatusText.innerHTML = `Pinterest: <strong>Connect API</strong>`;
      elements.pinterestStatusPill.title = 'Click to connect Pinterest account';
    }
  } catch (err) {
    elements.pinterestStatusDot.style.backgroundColor = '#ef4444';
    elements.pinterestStatusText.innerHTML = `Pinterest: <strong>Offline</strong>`;
  }
}

function setupSSE() {
  try {
    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('activity_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        renderActivity(data.days);
      } catch (err) {}
    });

    eventSource.addEventListener('published', () => {
      loadActivity();
      loadSupabaseQueue();
    });

    eventSource.addEventListener('queued', () => {
      loadActivity();
      loadSupabaseQueue();
    });
  } catch (err) {
    console.warn('SSE connection warning:', err);
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
  elements.authModal.style.display = 'flex';
}

function closeAuthModal() {
  elements.authModal.style.display = 'none';
}

function openPostsModal() {
  elements.allPostsModal.style.display = 'flex';
  renderQueueCards(elements.modalPostsGrid);
}

function closePostsModal() {
  elements.allPostsModal.style.display = 'none';
}

function showModalAlert(type, message) {
  elements.modalStatusAlert.className = `modal-alert ${type}`;
  elements.modalStatusAlert.textContent = message;
  elements.modalStatusAlert.style.display = 'block';
}

function setupEventListeners() {
  // Activity tracking for auto-lock reset
  ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetLockTimerOnActivity, { passive: true });
  });

  // Lock Now button
  elements.btnLockNow.addEventListener('click', lockDashboard);

  // Upload modal open/close
  elements.btnOpenUploadModal.addEventListener('click', openUploadModal);
  elements.btnCloseUploadModal.addEventListener('click', closeUploadModal);
  elements.uploadPinModal.addEventListener('click', (e) => {
    if (e.target === elements.uploadPinModal) closeUploadModal();
  });

  // Trigger Slot Now
  elements.btnTriggerNow.addEventListener('click', async () => {
    try {
      elements.btnTriggerNow.disabled = true;
      elements.btnTriggerNow.textContent = 'Publishing...';
      const res = await fetch('/api/publish/trigger', { method: 'POST' });
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
  elements.tabSchedule.addEventListener('click', () => {
    elements.tabSchedule.classList.add('active');
    elements.tabQueue.classList.remove('active');
    elements.scheduleView.classList.add('active');
    elements.queueView.classList.remove('active');
  });

  elements.tabQueue.addEventListener('click', () => {
    elements.tabQueue.classList.add('active');
    elements.tabSchedule.classList.remove('active');
    elements.queueView.classList.add('active');
    elements.scheduleView.classList.remove('active');
    renderQueueCards(elements.queuePostsGrid);
  });

  // Open "See All Posts"
  elements.btnSeeAllPosts.addEventListener('click', openPostsModal);
  elements.cloudQueuePill.addEventListener('click', openPostsModal);
  elements.btnClosePostsModal.addEventListener('click', closePostsModal);
  elements.allPostsModal.addEventListener('click', (e) => {
    if (e.target === elements.allPostsModal) closePostsModal();
  });

  // Auth modal
  elements.pinterestStatusPill.addEventListener('click', openAuthModal);
  elements.btnCloseModal.addEventListener('click', closeAuthModal);
  elements.authModal.addEventListener('click', (e) => {
    if (e.target === elements.authModal) closeAuthModal();
  });

  // Filters & Search handlers
  function attachFilterEvents(container) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-chip');
      if (!btn) return;
      
      container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentFilterBoard = btn.getAttribute('data-board') || 'all';

      renderQueueCards(elements.queuePostsGrid);
      renderQueueCards(elements.modalPostsGrid);
    });
  }

  attachFilterEvents(elements.boardFilterChips);
  attachFilterEvents(elements.modalBoardFilterChips);

  elements.inputQueueSearch.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderQueueCards(elements.queuePostsGrid);
  });

  elements.inputModalSearch.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderQueueCards(elements.modalPostsGrid);
  });

  // Save Token
  elements.btnSaveToken.addEventListener('click', async () => {
    const token = elements.inputAccessToken.value.trim();
    const appId = elements.inputAppId.value.trim();
    const appSecret = elements.inputAppSecret.value.trim();

    elements.btnSaveToken.disabled = true;
    elements.btnSaveToken.textContent = 'Testing connection...';

    try {
      const res = await fetch('/api/settings/token', {
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
    } finally {
      elements.btnSaveToken.disabled = false;
      elements.btnSaveToken.textContent = 'Save & Test Connection';
      checkPinterestAuth();
    }
  });

  // Disconnect Account
  elements.btnDisconnect.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to disconnect this Pinterest account?')) return;
    try {
      const res = await fetch('/api/pinterest/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showModalAlert('success', 'Pinterest account disconnected successfully.');
        elements.inputAccessToken.value = '';
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
