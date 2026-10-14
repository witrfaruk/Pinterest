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

  // 3. Download ZIP Direct Handler
  const downloadBtn = document.getElementById('download-zip-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const zipUrl = 'https://github.com/witrfaruk/Pinterest/archive/refs/heads/main.zip';
      window.location.href = zipUrl;
    });
  }
});
