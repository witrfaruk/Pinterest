// ==========================================================================
// FORCE PAGE TO START FROM TOP ON REFRESH (NO RESTORATION)
// ==========================================================================
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
if (window.location.hash) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
window.scrollTo(0, 0);

window.addEventListener('beforeunload', () => {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  window.scrollTo(0, 0);
});

// ==========================================================================
// INTERACTIVE ENGINE PREVIEW & CLI SIMULATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Ensure top position after DOM mounts
  window.scrollTo(0, 0);

  // 1. Copy to Clipboard Utility
  const copyButtons = document.querySelectorAll('[data-copy]');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const textToCopy = btn.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        btn.style.backgroundColor = 'var(--color-mint)';
        btn.style.borderColor = 'var(--border-color)';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.backgroundColor = '';
        }, 2000);
      } catch (err) {
        console.error('Copy failed:', err);
      }
    });
  });

  // 2. Mobile Navigation Toggle
  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('nav-menu');
  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      navMenu.classList.toggle('nav-menu-open');
      const isOpen = navMenu.classList.contains('nav-menu-open');
      mobileToggle.setAttribute('aria-expanded', isOpen);
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('nav-menu-open');
        mobileToggle.setAttribute('aria-expanded', 'false');
    });
  }

  // Smooth in-page navigation without adding # hash to the browser URL bar
  document.querySelectorAll('[data-scroll]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-scroll');
      if (target === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const targetEl = document.getElementById(target);
        if (targetEl) {
          const headerOffset = 80;
          const elementPosition = targetEl.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }

      if (history.replaceState) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    });
  });

  // 3. Simulated Real-time Terminal Log Streamer
  const terminalBody = document.getElementById('terminal-stream');
  if (terminalBody) {
    const logs = [
      { type: 'info', prefix: '[Init]', text: 'Autonomous Pinterest Engine v1.0.0 starting...' },
      { type: 'info', prefix: '[Config]', text: 'Loaded 5 target boards: Make Money, Save Money, Budgeting, Investing, Debt' },
      { type: 'warning', prefix: '[AI]', text: 'Connected to local Ollama (qwen2.5vl:3b) on http://127.0.0.1:11434' },
      { type: 'success', prefix: '[Supabase]', text: 'Cloud Queue synchronization active (5 slots: 17:30, 19:30, 21:30, 23:30, 01:30)' },
      { type: 'info', prefix: '[Watcher]', text: 'FIFO Image scanner watching /Images directory...' },
      { type: 'warning', prefix: '[Queue]', text: 'Incoming raw image detected: "passive_income_strategy.png"' },
      { type: 'info', prefix: '[Vision AI]', text: 'Analyzing image visual vectors with Qwen2.5-VL...' },
      { type: 'success', prefix: '[Classifier]', text: 'Classified: Board "Make Money" (ID: 1234567890123456781)' },
      { type: 'info', prefix: '[Metadata]', text: 'Generated Title: "7 High-Yield Passive Income Strategies for 2026"' },
      { type: 'success', prefix: '[Auditor]', text: 'AI Verification Loop: PASS (Title <= 100, Desc <= 500, Alt <= 500)' },
      { type: 'warning', prefix: '[Stealth]', text: 'Scrubbed all EXIF, XMP, and AI generator parameters via Sharp' },
      { type: 'info', prefix: '[Cloud]', text: 'Uploaded clean buffer to Supabase Storage -> Public URL ready' },
      { type: 'success', prefix: '[Pinterest]', text: 'HTTP 201 Created -> Pin published live to Pinterest!' },
      { type: 'info', prefix: '[Sheet]', text: 'Appended row to Google Sheets tracker (example_pinterest)' },
      { type: 'muted', prefix: '[Cleanup]', text: 'Local file safely deleted from /Images (FIFO completed)' }
    ];

    let logIndex = 0;

    function addNextLog() {
      if (logIndex >= logs.length) {
        logIndex = 0;
        terminalBody.innerHTML = '';
      }
      
      const item = logs[logIndex];
      const line = document.createElement('div');
      line.className = 'term-line';
      
      let classType = 'term-info';
      if (item.type === 'success') classType = 'term-success';
      if (item.type === 'warning') classType = 'term-warning';
      if (item.type === 'muted') classType = 'term-muted';
      
      line.innerHTML = `
        <span class="term-prefix">${item.prefix}</span>
        <span class="${classType}">${item.text}</span>
      `;
      
      terminalBody.appendChild(line);
      terminalBody.scrollTop = terminalBody.scrollHeight;
      logIndex++;
    }

    // Initial fill
    for (let i = 0; i < 5; i++) {
      addNextLog();
    }

    // Stream continuously
    setInterval(addNextLog, 2400);
  }

  // 4. Download ZIP Direct Handler
  const downloadBtn = document.getElementById('download-zip-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const zipUrl = 'https://github.com/witrfaruk/Pinterest/archive/refs/heads/main.zip';
      window.location.href = zipUrl;
    });
  }
});
