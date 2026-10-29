/**
 * KOKPIT BURUAN KLIEN - LOCAL DASHBOARD INTERACTIONS
 * Vanilla JS. Zero heavy frameworks. Instant tactile feedback.
 */

(function () {
  'use strict';

  // 1. Theme Management (Warm Dark / Warm Light)
  const savedTheme = localStorage.getItem('dashboard_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dashboard_theme', next);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
    showToast(`Mode ${next === 'dark' ? 'Editorial Gelap' : 'Kertas Terang'} diaktifkan`);
  };

  // 2. Toast Notifications
  window.showToast = function (msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
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
      showToast('📋 Pesan berhasil disalin ke clipboard');
    });
  };

  window.copyRaw = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 Teks berhasil disalin');
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
        showToast(checked ? '✅ Ditandai: Sudah dicek manual' : 'ℹ️ Status cek manual dibatalkan');
        const badge = document.getElementById(`stamp-checked-${leadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
        if (badge) {
          badge.style.display = checked ? 'inline-block' : 'none';
        }
      })
      .catch((err) => {
        console.error(err);
        showToast('⚠️ Gagal memperbarui status');
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
        showToast(`✅ Status diubah menjadi: ${newStatus}`);
        if (autoAdvance) {
          if (currentLeadIndex < leadCards.length - 1) {
            navigateLead(1);
          } else {
            showToast('🎉 Semua antrean hari ini selesai!');
            setTimeout(() => {
              window.location.reload();
            }, 800);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        showToast('⚠️ Gagal menyimpan status');
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
  window.handleDragStart = function (e, leadId) {
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
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
    if (!leadId) return;

    const cardEl = document.getElementById(`kanban-card-${leadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (cardEl) {
      e.currentTarget.appendChild(cardEl);
    }

    fetch(`/lead/${encodeURIComponent(leadId)}/status-ajax`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetStatus }),
    })
      .then((res) => res.json())
      .then(() => {
        showToast(`✅ Dipindahkan ke kolom: ${targetStatus}`);
      })
      .catch((err) => {
        console.error(err);
        showToast('⚠️ Gagal memindahkan lead');
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

  // Init on load
  document.addEventListener('DOMContentLoaded', () => {
    // Restore preferred view mode
    const savedView = localStorage.getItem('dashboard_view_mode') || 'focus';
    switchViewMode(savedView);

    // Initialise active card
    if (leadCards.length > 0) {
      activateLeadByIndex(0);
    }
  });
})();
