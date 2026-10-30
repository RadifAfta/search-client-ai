/**
 * KOKPIT BURUAN KLIEN - LOCAL DASHBOARD INTERACTIONS
 * Vanilla JS. Zero heavy frameworks. Instant tactile feedback.
 * High-precision vector SVG icons. Zero emoji UI slop.
 */

(function () {
  'use strict';

  // Vector SVG Icons for Dynamic JS States
  const ICONS_JS = {
    sun: '<svg class="ui-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg class="ui-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    check: '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    info: '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    alert: '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    trash: '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    copy: '<svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    zap: '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    target: '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    loader: '<svg class="ui-icon spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
    xCircle: '<svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };

  // 1. Theme Management (Warm Dark / Warm Light)
  const savedTheme = localStorage.getItem('dashboard_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const updateThemeIcon = (theme) => {
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.innerHTML = theme === 'dark' ? ICONS_JS.sun : ICONS_JS.moon;
    }
    const mobileIcon = document.getElementById('theme-icon-mobile');
    if (mobileIcon) {
      mobileIcon.innerHTML = theme === 'dark' ? ICONS_JS.sun : ICONS_JS.moon;
    }
  };

  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dashboard_theme', next);
    updateThemeIcon(next);
    showToast(`Mode ${next === 'dark' ? 'Editorial Gelap' : 'Kertas Terang'} diaktifkan`, 'info');
  };

  // 2. Toast Notifications (With Clean Vector Icons)
  window.showToast = function (msg, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    let iconSvg = ICONS_JS.info;
    if (type === 'success') {
      iconSvg = `<span style="color:var(--semantic-success); display:inline-flex;">${ICONS_JS.check}</span>`;
    } else if (type === 'error' || type === 'warn') {
      iconSvg = `<span style="color:var(--semantic-danger); display:inline-flex;">${ICONS_JS.alert}</span>`;
    } else if (type === 'trash') {
      iconSvg = `<span style="color:var(--semantic-warning); display:inline-flex;">${ICONS_JS.trash}</span>`;
    } else if (type === 'copy') {
      iconSvg = `<span style="color:var(--accent); display:inline-flex;">${ICONS_JS.copy}</span>`;
    }

    toast.innerHTML = `<span style="display:inline-flex; align-items:center; gap:8px;">${iconSvg}<span>${msg}</span></span>`;
    toast.style.display = 'block';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2400);
  };

  // 3. Copy to Clipboard
  window.copyText = function (elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.select();
    navigator.clipboard.writeText(el.value).then(() => {
      showToast('Pesan berhasil disalin ke clipboard', 'copy');
    });
  };

  window.copyRaw = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Teks berhasil disalin ke clipboard', 'copy');
    });
  };

  // 4. Focus Mode Lead State & Navigation
  let currentLeadIndex = 0;
  const leadCards = document.querySelectorAll('.focus-card-item');

  window.activateLeadByIndex = function (index) {
    if (!leadCards || leadCards.length === 0) return;
    if (index < 0 || index >= leadCards.length) return;

    const currentCard = document.querySelector('.focus-card-item.active-lead');
    if (currentCard) {
      currentCard.classList.add('animating');
      setTimeout(() => {
        currentCard.classList.remove('active-lead', 'animating');
        showLead(index);
      }, 150);
    } else {
      showLead(index);
    }
  };

  function showLead(index) {
    currentLeadIndex = index;
    leadCards.forEach((card, idx) => {
      card.classList.toggle('active-lead', idx === index);
      if (idx === index) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });

    // Update queue sidebar list highlight
    const queueItems = document.querySelectorAll('.queue-item');
    queueItems.forEach((item, idx) => {
      item.classList.toggle('active', idx === index);
    });

    // Update nav control buttons
    const prevBtn = document.getElementById('btn-prev-lead');
    const nextBtn = document.getElementById('btn-next-lead');
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === leadCards.length - 1;

    // Scroll active item into view in sidebar
    const activeItem = document.querySelector(`.queue-item[data-index="${index}"]`);
    if (activeItem && activeItem.scrollIntoView) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  window.navigateLead = function (direction) {
    const next = currentLeadIndex + direction;
    if (next >= 0 && next < leadCards.length) {
      activateLeadByIndex(next);
    }
  };

  // 5. Live Message Updating for wa.me link
  window.handleMessageChange = function (cardId, phone) {
    const textarea = document.getElementById(`msg-${cardId}`);
    const waBtn = document.getElementById(`wa-btn-${cardId}`);
    const counter = document.getElementById(`char-count-${cardId}`);
    if (!textarea) return;

    if (counter) {
      counter.textContent = `${textarea.value.length} karakter`;
    }

    if (waBtn && phone) {
      const encoded = encodeURIComponent(textarea.value);
      waBtn.href = `https://wa.me/${phone}?text=${encoded}`;
    }
  };

  // 6. Manual Web Verification Checkbox Toggle
  window.toggleManualCheck = function (leadId, checked) {
    fetch(`/lead/${encodeURIComponent(leadId)}/manual-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: checked }),
    })
      .then((res) => res.json())
      .then(() => {
        showToast(checked ? 'Ditandai: Sudah dicek manual' : 'Status cek manual dibatalkan', checked ? 'success' : 'info');
        const badge = document.getElementById(`stamp-checked-${leadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
        if (badge) {
          badge.style.display = checked ? 'inline-block' : 'none';
        }
      })
      .catch((err) => {
        console.error(err);
        showToast('Gagal memperbarui status', 'error');
      });
  };

  // 7. Status Actions (Terkirim & Advance, Balas, etc.)
  window.updateLeadStatusAjax = function (leadId, newStatus, autoAdvance) {
    fetch(`/lead/${encodeURIComponent(leadId)}/status-ajax`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
      .then((res) => res.json())
      .then((data) => {
        showToast(`Status diubah menjadi: ${newStatus}`, 'success');
        if (autoAdvance) {
          if (currentLeadIndex < leadCards.length - 1) {
            navigateLead(1);
          } else {
            showToast('Semua antrean hari ini selesai!', 'success');
            setTimeout(() => {
              window.location.reload();
            }, 800);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        showToast('Gagal menyimpan status', 'error');
      });
  };

  // 8. Keyboard Shortcuts
  window.toggleShortcutsModal = function (open) {
    const modal = document.getElementById('shortcutsModal');
    if (!modal) return;
    modal.classList.toggle('open', open);
  };

  document.addEventListener('keydown', function (e) {
    // If inside text inputs, do not trigger shortcuts
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (e.key === 'Escape') {
      toggleShortcutsModal(false);
      if (isTyping) activeEl.blur();
      return;
    }

    if (isTyping) return;

    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      navigateLead(-1);
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      navigateLead(1);
    } else if (e.key === 'Enter') {
      const activeCard = document.querySelector('.focus-card-item.active-lead');
      if (activeCard) {
        const waBtn = activeCard.querySelector('.btn-hero-wa');
        if (waBtn && waBtn.href) {
          window.open(waBtn.href, '_blank');
        }
      }
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      const activeCard = document.querySelector('.focus-card-item.active-lead');
      if (activeCard) {
        const leadId = activeCard.getAttribute('data-lead-id');
        if (leadId) updateLeadStatusAjax(leadId, 'terkirim', true);
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      const activeCard = document.querySelector('.focus-card-item.active-lead');
      if (activeCard) {
        const leadId = activeCard.getAttribute('data-lead-id');
        if (leadId) updateLeadStatusAjax(leadId, 'balas', false);
      }
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      const activeCard = document.querySelector('.focus-card-item.active-lead');
      if (activeCard) {
        const leadId = activeCard.getAttribute('data-lead-id');
        if (leadId) updateLeadStatusAjax(leadId, 'tidak_tertarik', true);
      }
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      const activeCard = document.querySelector('.focus-card-item.active-lead');
      if (activeCard) {
        const notesInput = activeCard.querySelector('input[name="notes"]');
        if (notesInput) notesInput.focus();
      }
    } else if (e.key === '?') {
      e.preventDefault();
      toggleShortcutsModal(true);
    }
  });

  // 9. Pipeline Kanban Native Drag & Drop
  window.handleDragStart = function (e, leadId, currentStatus) {
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.setData('application/current-status', currentStatus || '');
    e.dataTransfer.effectAllowed = 'move';
    const card = document.getElementById(`kanban-card-${leadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (card) card.classList.add('dragging');
  };

  window.handleDragEnd = function (e, leadId) {
    const card = document.getElementById(`kanban-card-${leadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (card) card.classList.remove('dragging');
  };

  window.handleDragOver = function (e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  window.handleDragLeave = function (e) {
    e.currentTarget.classList.remove('drag-over');
  };

  window.handleDrop = function (e, targetStatus) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const leadId = e.dataTransfer.getData('text/plain');
    const currentStatus = e.dataTransfer.getData('application/current-status');
    if (!leadId) return;

    const cardEl = document.getElementById(`kanban-card-${leadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (cardEl) {
      cardEl.classList.remove('dragging');
    }

    // Jika dipindahkan di kolom yang sama persis, abaikan (NO-OP)
    if (currentStatus === targetStatus) {
      return;
    }

    if (cardEl) {
      cardEl.setAttribute('data-current-status', targetStatus);
      e.currentTarget.appendChild(cardEl);
    }

    fetch(`/lead/${encodeURIComponent(leadId)}/status-ajax`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetStatus }),
    })
      .then((res) => res.json())
      .then(() => {
        const labels = {
          belum_dihubungi: 'Belum Dihubungi',
          terkirim: 'Terkirim',
          follow_up_1: 'Follow-up',
          balas: 'Balas Chat',
          demo: 'Demo',
          negosiasi: 'Negosiasi',
          deal: 'Deal Proyek',
        };
        const label = labels[targetStatus] || targetStatus;
        showToast(`Dipindahkan ke kolom: ${label}`, 'success');
        setTimeout(() => {
          window.location.reload();
        }, 350);
      })
      .catch((err) => {
        console.error(err);
        showToast('Gagal memindahkan lead', 'error');
      });
  };

  // 10. Switch between Focus View and List View
  window.switchViewMode = function (mode) {
    const focusView = document.getElementById('view-focus-container');
    const listView = document.getElementById('view-list-container');
    const btnFocus = document.getElementById('pill-focus');
    const btnList = document.getElementById('pill-list');

    if (mode === 'focus') {
      if (focusView) focusView.style.display = 'block';
      if (listView) listView.style.display = 'none';
      if (btnFocus) btnFocus.classList.add('active');
      if (btnList) btnList.classList.remove('active');
      localStorage.setItem('dashboard_view_mode', 'focus');
    } else {
      if (focusView) focusView.style.display = 'none';
      if (listView) listView.style.display = 'block';
      if (btnFocus) btnFocus.classList.remove('active');
      if (btnList) btnList.classList.add('active');
      localStorage.setItem('dashboard_view_mode', 'list');
    }
  };

  // 11. Scanner Modal & Live Pipeline Runner
  let activeEventSource = null;

  window.openScannerModal = function () {
    const modal = document.getElementById('scannerModal');
    if (!modal) return;
    modal.classList.add('open');
    loadSerpApiCredits();
  };

  window.closeScannerModal = function () {
    const modal = document.getElementById('scannerModal');
    if (modal) modal.classList.remove('open');
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
  };

  function loadSerpApiCredits() {
    const badge = document.getElementById('scanner-credit-badge');
    if (!badge) return;
    badge.textContent = 'Memeriksa saldo...';
    fetch('/api/credits')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          badge.innerHTML = `Sisa Kredit: <strong style="color:var(--accent);">${data.totalSearchesLeft}</strong> / ${data.searchesPerMonth}`;
        } else {
          badge.textContent = 'Kredit: Kunci API perlu dicek';
        }
      })
      .catch(() => {
        badge.textContent = 'Kredit: Gagal memuat';
      });
  }

  window.startPipelineScanner = function () {
    const city = document.getElementById('scanner-city').value || 'Jember';
    const leadsPerQuery = document.getElementById('scanner-leads-per-query').value || '4';
    const scoringMode = document.getElementById('scanner-scoring-mode').value || 'cashflow_cepat';
    const enrichReviews = document.getElementById('scanner-enrich-reviews').checked;
    const clearCache = document.getElementById('scanner-clear-cache').checked;

    const checkedBoxes = document.querySelectorAll('input[name="scanner_cat"]:checked');
    const categories = Array.from(checkedBoxes).map((c) => c.value);

    if (categories.length === 0) {
      alert('Pilih minimal satu kategori bisnis untuk ditarik.');
      return;
    }

    const terminal = document.getElementById('scannerTerminal');
    const startBtn = document.getElementById('btn-start-scanner');
    const doneBtn = document.getElementById('btn-done-scanner');
    const statusIndicator = document.getElementById('scanner-status-indicator');

    terminal.innerHTML = '';
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    startBtn.innerHTML = `${ICONS_JS.loader} Sedang Memproses...`;
    if (doneBtn) doneBtn.style.display = 'none';
    if (statusIndicator) {
      statusIndicator.textContent = '● Berjalan...';
      statusIndicator.style.color = 'var(--accent)';
    }

    const appendLog = (msg, level) => {
      const line = document.createElement('div');
      if (level === 'success') line.style.color = 'var(--semantic-success)';
      else if (level === 'warn') line.style.color = 'var(--semantic-warning)';
      else if (level === 'error') line.style.color = 'var(--semantic-danger)';
      line.textContent = msg;
      terminal.appendChild(line);
      terminal.scrollTop = terminal.scrollHeight;
    };

    appendLog(`[${new Date().toLocaleTimeString('id-ID')}] [CONNECT] Menghubungkan ke scanner SerpAPI...`, 'info');

    const params = new URLSearchParams({
      city,
      categories: categories.join(','),
      leadsPerQuery,
      scoringMode,
      enrichReviews: String(enrichReviews),
      clearCacheFirst: String(clearCache),
    });

    if (activeEventSource) {
      activeEventSource.close();
    }

    activeEventSource = new EventSource(`/api/pipeline/run-stream?${params.toString()}`);

    activeEventSource.onmessage = function (event) {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'log') {
          appendLog(payload.message, payload.level);
        } else if (payload.type === 'done') {
          activeEventSource.close();
          activeEventSource = null;
          startBtn.disabled = false;
          startBtn.style.opacity = '1';
          startBtn.innerHTML = `${ICONS_JS.zap} Jalankan Lagi`;
          if (doneBtn) {
            doneBtn.style.display = 'inline-flex';
            doneBtn.innerHTML = `${ICONS_JS.target} Selesai & Buka ${payload.result.savedToDb} Lead Baru`;
          }
          if (statusIndicator) {
            statusIndicator.innerHTML = `${ICONS_JS.check} Selesai`;
            statusIndicator.style.color = 'var(--semantic-success)';
          }
          loadSerpApiCredits();
          showToast(`Sukses! ${payload.result.savedToDb} lead baru tersimpan ke database`, 'success');
        } else if (payload.type === 'error') {
          activeEventSource.close();
          activeEventSource = null;
          startBtn.disabled = false;
          startBtn.style.opacity = '1';
          startBtn.innerHTML = `${ICONS_JS.zap} Coba Lagi`;
          appendLog(`[ERROR] ${payload.error}`, 'error');
          if (statusIndicator) {
            statusIndicator.innerHTML = `${ICONS_JS.xCircle} Error`;
            statusIndicator.style.color = 'var(--semantic-danger)';
          }
          showToast('Gagal menjalankan pipeline', 'error');
        }
      } catch (err) {
        console.error('SSE parsing error:', err);
      }
    };

    activeEventSource.onerror = function () {
      if (activeEventSource) {
        activeEventSource.close();
        activeEventSource = null;
      }
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.innerHTML = `${ICONS_JS.zap} Coba Lagi`;
      appendLog('[WARN] Koneksi SSE terputus.', 'warn');
    };
  };

  // 12. Reset Database Modal
  window.openResetModal = function () {
    const modal = document.getElementById('resetModal');
    if (modal) modal.classList.add('open');
  };

  window.closeResetModal = function () {
    const modal = document.getElementById('resetModal');
    if (modal) modal.classList.remove('open');
  };

  window.executeDatabaseReset = function () {
    const clearCache = document.getElementById('reset-clear-cache')?.checked || false;
    fetch('/api/leads/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearCache }),
    })
      .then((r) => r.json())
      .then((data) => {
        closeResetModal();
        showToast('Database dikosongkan. Backup dibuat.', 'trash');
        setTimeout(() => {
          window.location.href = '/';
        }, 600);
      })
      .catch((err) => {
        console.error(err);
        showToast('Gagal mengosongkan database', 'error');
      });
  };

  // Init on load
  document.addEventListener('DOMContentLoaded', () => {
    // Sync theme icon
    updateThemeIcon(savedTheme);

    // Restore preferred view mode
    const savedView = localStorage.getItem('dashboard_view_mode') || 'focus';
    switchViewMode(savedView);
  });
})();
