// ==========================================================================
// Finmunt Pinterest Automation - Pinterest Brand UI Controller
// ==========================================================================

const elements = {
  activityFeed: document.getElementById('activityFeed'),
  btnTriggerNow: document.getElementById('btnTriggerNow'),
  headerSubtitle: document.getElementById('headerSubtitle'),
  nextSlotText: document.getElementById('nextSlotText'),
  waitingCountText: document.getElementById('waitingCountText'),
  pinterestStatusPill: document.getElementById('pinterestStatusPill'),
  pinterestStatusDot: document.getElementById('pinterestStatusDot'),
  pinterestStatusText: document.getElementById('pinterestStatusText'),
  authModal: document.getElementById('authModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  inputAccessToken: document.getElementById('inputAccessToken'),
  inputAppId: document.getElementById('inputAppId'),
  inputAppSecret: document.getElementById('inputAppSecret'),
  btnSaveToken: document.getElementById('btnSaveToken'),
  btnDisconnect: document.getElementById('btnDisconnect'),
  modalStatusAlert: document.getElementById('modalStatusAlert')
};


async function init() {
  setupEventListeners();
  setupSSE();
  handleUrlParams();
  await Promise.all([loadActivity(), checkPinterestAuth()]);
}

function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('auth_success')) {
    showModalAlert('success', 'Pinterest account successfully connected via OAuth!');
    openModal();
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.has('auth_error')) {
    showModalAlert('error', `OAuth Error: ${params.get('auth_error')}`);
    openModal();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function openModal() {
  elements.authModal.style.display = 'flex';
}

function closeModal() {
  elements.authModal.style.display = 'none';
}

function showModalAlert(type, message) {
  elements.modalStatusAlert.className = `modal-alert ${type}`;
  elements.modalStatusAlert.textContent = message;
  elements.modalStatusAlert.style.display = 'block';
}

async function checkPinterestAuth() {
  try {
    const res = await fetch('/api/pinterest/status');
    const data = await res.json();

    if (data.connected) {
      elements.pinterestStatusDot.style.backgroundColor = '#22c55e';
      elements.pinterestStatusDot.className = 'status-pill-dot dot-active';
      elements.pinterestStatusText.innerHTML = `Pinterest: <strong>@${escapeHtml(data.username || 'Finmunt')}</strong>`;
      elements.pinterestStatusPill.title = `Connected to Pinterest (@${data.username}). Click to change settings.`;
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
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    });

    eventSource.addEventListener('published', () => {
      loadActivity();
    });
  } catch (err) {
    console.warn('SSE connection warning:', err);
  }
}

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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Trigger Slot Now
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

function setupEventListeners() {
  elements.btnTriggerNow.addEventListener('click', async () => {
    try {
      elements.btnTriggerNow.disabled = true;
      elements.btnTriggerNow.textContent = 'Publishing...';
      const res = await fetch('/api/publish/trigger', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to trigger publishing');
      }
      setTimeout(loadActivity, 1000);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  // Modal open & close
  elements.pinterestStatusPill.addEventListener('click', openModal);
  elements.btnCloseModal.addEventListener('click', closeModal);
  elements.authModal.addEventListener('click', (e) => {
    if (e.target === elements.authModal) closeModal();
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
          closeModal();
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
          closeModal();
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

