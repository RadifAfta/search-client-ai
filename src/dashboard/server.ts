import express, { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getDatabase, IDatabase, SqliteLeadRecord, LeadPipelineStatus } from '../database';
import { config } from '../config';
import { CATEGORIES_CONFIG } from '../config/categories.config';
import { PipelineRunner } from '../services/pipelineRunner';
import { SerpApiClient } from '../scrapers/serpApiClient';
import { ICONS } from './icons';

const app = express();
const PORT = config.dashboardPort || 3000;
const HOST = config.dashboardHost || '127.0.0.1';
const DASHBOARD_PIN = config.dashboardPin || '';

const db: IDatabase = getDatabase();

// Middleware dasar
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static assets secara lokal (fonts woff2, css, js) - zero CDN eksternal
app.use(express.static(path.join(process.cwd(), 'public')));

// Security: Simple Auth Middleware jika PIN aktif
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Izinkan asset statis (fonts, css, js) dimuat tanpa blokir
  if (req.path.startsWith('/fonts') || req.path.startsWith('/css') || req.path.startsWith('/js')) {
    return next();
  }

  if (DASHBOARD_PIN && DASHBOARD_PIN.trim() !== '') {
    const cookies = req.headers.cookie || '';
    const hasPinCookie = cookies.includes(`dash_pin=${DASHBOARD_PIN}`);

    if (req.path === '/login' || req.path === '/auth') {
      return next();
    }

    if (!hasPinCookie) {
      res.status(401).send(`
        <!DOCTYPE html>
        <html lang="id" data-theme="dark">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Autentikasi Akses - Kokpit Buruan Klien</title>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg">
          <link rel="stylesheet" href="/css/fonts.css">
          <link rel="stylesheet" href="/css/theme.css">
          <link rel="stylesheet" href="/css/dashboard.css">
          <style>
            body { display: flex; align-items: center; justify-content: center; height: 100vh; padding: 20px; }
            .login-box { background: var(--bg-panel); border: 1px solid var(--border-strong); padding: 36px; border-radius: var(--radius-lg); width: 100%; max-width: 380px; text-align: center; box-shadow: var(--shadow-warm); }
            .login-title { font-family: var(--font-display); font-size: 22px; font-weight: 800; color: var(--text-main); margin-bottom: 8px; }
            .login-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 24px; }
            .input-pin { width: 100%; padding: 12px; margin-bottom: 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--bg-base); color: var(--text-main); font-family: var(--font-mono); font-size: 18px; text-align: center; letter-spacing: 4px; outline: none; }
            .input-pin:focus { border-color: var(--accent); }
            .btn-login { width: 100%; padding: 12px; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); font-weight: 700; cursor: pointer; }
            .btn-login:hover { background: var(--accent-hover); }
          </style>
        </head>
        <body>
          <div class="login-box">
            <h2 class="login-title" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              ${ICONS.lock} Akses Kokpit
            </h2>
            <p class="login-sub">Masukkan PIN keamanan untuk membuka workstation lokal Anda.</p>
            <form method="POST" action="/auth">
              <input type="password" name="pin" class="input-pin" placeholder="••••" required autofocus>
              <button type="submit" class="btn-login">Buka Kokpit</button>
            </form>
          </div>
        </body>
        </html>
      `);
      return;
    }
  }
  next();
}

app.use(authMiddleware);

// Endpoint login PIN
app.post('/auth', (req: Request, res: Response) => {
  const { pin } = req.body;
  if (pin === DASHBOARD_PIN) {
    res.setHeader('Set-Cookie', `dash_pin=${pin}; Path=/; HttpOnly; SameSite=Strict`);
    res.redirect('/');
  } else {
    res.status(401).send(`<script>alert('PIN salah!'); window.location.href='/';</script>`);
  }
});

// Utility: XSS prevention
function escapeHtml(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format Rupiah
function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

// Segmented meter calculator
interface SegmentInfo {
  label: string;
  score: number;
  maxScore: number;
  reason: string;
}

function calculateScoreSegments(lead: SqliteLeadRecord): SegmentInfo[] {
  let actScore = 15;
  let actReason = 'Listing Google Maps aktif';
  if (lead.reviewEvidence?.isProven) {
    actScore = 25;
    actReason = `Ulasan riil terbukti: "${lead.reviewEvidence.quote?.substring(0, 40)}..."`;
  } else if (lead.scoreReasons?.some((r: string) => /rating/i.test(r))) {
    actScore = 20;
    actReason = 'Aktivitas ulasan pelanggan memadai di Maps';
  }

  let contactScore = 15;
  let contactReason = 'Tersedia saluran kontak';
  if (lead.primaryChannel === 'WhatsApp') {
    contactScore = 25;
    contactReason = 'Nomor HP seluler WhatsApp terverifikasi';
  } else if (lead.primaryChannel === 'Instagram') {
    contactScore = 20;
    contactReason = 'Akun Instagram aktif';
  }

  let catScore = 15;
  let catReason = `Kategori ${lead.category}`;
  if (['Kafe & Resto', 'Jasa Katering', 'Konveksi & Garment', 'Percetakan & Digital Printing', 'Otomotif & Bengkel Kendaraan'].includes(lead.category)) {
    catScore = 25;
    catReason = 'Kategori cash flow cepat (keputusan owner singkat)';
  }

  let webScore = 10;
  let webReason = lead.websiteVerificationStatus;
  if (lead.websiteVerificationStatus === 'hanya media sosial') {
    webScore = 15;
    webReason = 'Peluang tinggi: sudah aktif di medsos tapi belum punya web mandiri';
  } else if (lead.websiteVerificationStatus === 'tidak punya website') {
    webScore = 15;
    webReason = 'Belum memiliki web resmi di listing Google Maps';
  } else if (lead.websiteVerificationStatus.includes('buruk')) {
    webScore = 12;
    webReason = 'Web sudah ada namun belum mobile-friendly';
  }

  let locScore = 10;
  let locReason = lead.area ? `Area ${lead.area}, Jember` : 'Dalam jangkauan wilayah Jember';

  return [
    { label: 'Aktivitas', score: actScore, maxScore: 25, reason: actReason },
    { label: 'Kontak WA', score: contactScore, maxScore: 25, reason: contactReason },
    { label: 'Kategori', score: catScore, maxScore: 25, reason: catReason },
    { label: 'Peluang Web', score: webScore, maxScore: 15, reason: webReason },
    { label: 'Lokasi', score: locScore, maxScore: 10, reason: locReason }
  ];
}

// Layout template pembungkus
function renderLayout(title: string, content: string, activeTab = 'queue'): string {
  return `
  <!DOCTYPE html>
  <html lang="id">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - Kokpit Buruan Klien</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="stylesheet" href="/css/fonts.css">
    <link rel="stylesheet" href="/css/theme.css">
    <link rel="stylesheet" href="/css/dashboard.css">
  </head>
  <body>
    <div class="cockpit-container">
      <header class="cockpit-header">
        <div class="brand-section">
          <div class="brand-logo-badge" title="Radar Buruan Klien Aktif">
            <img src="/favicon.svg" alt="Radar Logo" width="32" height="32" class="brand-logo-img">
            <span class="radar-pulse"></span>
          </div>
          <div>
            <div class="brand-title">Kokpit Buruan Klien</div>
            <div class="brand-subtitle">Ruang Kerja Outreach Freelancer Lokal &bull; Jember</div>
          </div>
          <div class="sender-pill">
            <span class="sender-live-light"></span>
            <span>Pengirim:</span>
            <strong>${escapeHtml(config.senderName)}</strong>
            <span>&bull;</span>
            <em>${escapeHtml(config.senderRole)}</em>
          </div>
        </div>

        <div class="nav-actions">
          <a href="/" class="nav-tab ${activeTab === 'queue' ? 'active' : ''}">
            ${ICONS.list}
            Antrean Hari Ini
          </a>
          <a href="/pipeline" class="nav-tab ${activeTab === 'pipeline' ? 'active' : ''}">
            ${ICONS.columns}
            Papan Pipeline
          </a>
          <a href="/leads" class="nav-tab ${activeTab === 'leads' ? 'active' : ''}">
            ${ICONS.folder}
            Semua Leads
          </a>
          <button type="button" class="btn-hero-advance" style="padding: 7px 14px; font-size: 13px; min-height: 38px; border-radius: var(--radius-sm);" onclick="openScannerModal()">
            ${ICONS.zap}
            Tarik Lead
          </button>
          <button type="button" class="theme-toggle-btn" onclick="toggleShortcutsModal(true)" title="Daftar Pintasan Keyboard (?)">
            ${ICONS.keyboard}
          </button>
          <button type="button" class="theme-toggle-btn" onclick="toggleTheme()" title="Ganti Mode Terang / Gelap">
            <span id="theme-icon">${ICONS.sun}</span>
          </button>
        </div>
      </header>

      <main>
        ${content}
      </main>
    </div>

    <!-- Mobile Bottom Dock Navigation -->
    <nav class="mobile-bottom-dock">
      <a href="/" class="mobile-dock-item ${activeTab === 'queue' ? 'active' : ''}">
        ${ICONS.list}
        <span>Antrean</span>
      </a>
      <a href="/pipeline" class="mobile-dock-item ${activeTab === 'pipeline' ? 'active' : ''}">
        ${ICONS.columns}
        <span>Pipeline</span>
      </a>
      <button type="button" class="mobile-dock-item highlight" onclick="openScannerModal()" style="background: none; border: none; cursor: pointer;">
        ${ICONS.zap}
        <span>Tarik Lead</span>
      </button>
      <a href="/leads" class="mobile-dock-item ${activeTab === 'leads' ? 'active' : ''}">
        ${ICONS.folder}
        <span>Semua</span>
      </a>
      <button type="button" class="mobile-dock-item" onclick="toggleTheme()" style="background: none; border: none; cursor: pointer;">
        <span id="theme-icon-mobile" style="display: inline-flex;">${ICONS.sunMoon}</span>
        <span>Tema</span>
      </button>
    </nav>

    <!-- Modal Bantuan Pintasan Keyboard -->
    <div id="shortcutsModal" class="modal-backdrop" onclick="if(event.target === this) toggleShortcutsModal(false)">
      <div class="shortcuts-dialog">
        <div class="shortcuts-dialog-title">
          <span style="display: flex; align-items: center; gap: 8px;">${ICONS.keyboard} Pintasan Keyboard Kokpit</span>
          <button type="button" onclick="toggleShortcutsModal(false)" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:18px;">&times;</button>
        </div>
        <div class="shortcut-row">
          <span>Pindah ke lead berikutnya</span>
          <span class="kbd-badge">K</span>
        </div>
        <div class="shortcut-row">
          <span>Pindah ke lead sebelumnya</span>
          <span class="kbd-badge">J</span>
        </div>
        <div class="shortcut-row">
          <span>Buka WhatsApp (Siap Kirim)</span>
          <span class="kbd-badge">Enter</span>
        </div>
        <div class="shortcut-row">
          <span>Tandai Terkirim & lanjut ke kartu berikut</span>
          <span class="kbd-badge">S</span>
        </div>
        <div class="shortcut-row">
          <span>Tandai Balas Chat</span>
          <span class="kbd-badge">R</span>
        </div>
        <div class="shortcut-row">
          <span>Tandai Tolak / Jangan Hubungi</span>
          <span class="kbd-badge">X</span>
        </div>
        <div class="shortcut-row">
          <span>Fokus ke kolom catatan</span>
          <span class="kbd-badge">N</span>
        </div>
        <div class="shortcut-row">
          <span>Tampilkan bantuan pintasan</span>
          <span class="kbd-badge">?</span>
        </div>
        <div class="shortcut-row">
          <span>Tutup modal / batal fokus</span>
          <span class="kbd-badge">Esc</span>
        </div>
        <div style="margin-top: 16px; font-size: 11px; color: var(--text-dim); text-align: right;">
          Pintasan aktif di Mode Fokus saat kursor tidak mengetik di teks input.
        </div>
      </div>
    </div>

    <!-- Modal Scanner Lead Baru (SerpAPI Runner) -->
    <div id="scannerModal" class="modal-backdrop" onclick="if(event.target === this) closeScannerModal()">
      <div class="scanner-dialog">
        <div class="shortcuts-dialog-title" style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="display: flex; align-items: center; gap: 8px;">${ICONS.zap} Tarik Lead Baru dari SerpAPI</span>
            <span id="scanner-credit-badge" class="sender-pill" style="font-size: 11px;">Memeriksa kredit...</span>
          </div>
          <button type="button" onclick="closeScannerModal()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:18px;">&times;</button>
        </div>

        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          Jalankan scanner SerpAPI (engine: <code>google_maps</code>) langsung dari kokpit untuk menarik lead bisnis lokal nyata, menganalisis ulasan pelanggan riil, dan menyusun draf penawaran WhatsApp otomatis.
        </p>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div>
            <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px;">Target Wilayah / Kota:</label>
            <input id="scanner-city" type="text" value="Jember" class="input-editorial" style="width: 100%;">
          </div>
          <div>
            <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px;">Lead per Kategori:</label>
            <input id="scanner-leads-per-query" type="number" value="4" min="1" max="10" class="input-editorial" style="width: 100%;">
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px;">Mode Penilaian Skor:</label>
          <select id="scanner-scoring-mode" class="input-editorial" style="width: 100%;">
            <option value="cashflow_cepat" selected>Mode Cash Flow Cepat (Kafe/Resto, Katering, Percetakan, Konveksi, Bengkel diutamakan)</option>
            <option value="nilai_besar">Mode Nilai Besar (Wedding Organizer, Klinik Kecantikan diutamakan)</option>
          </select>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">Pilih Kategori Bisnis yang Ingin Ditarik:</label>
          <div class="category-chips-grid">
            <label class="category-chip-label">
              <input type="checkbox" name="scanner_cat" value="Cafe" checked>
              <span>Kafe & Resto</span>
            </label>
            <label class="category-chip-label">
              <input type="checkbox" name="scanner_cat" value="Catering" checked>
              <span>Jasa Katering</span>
            </label>
            <label class="category-chip-label">
              <input type="checkbox" name="scanner_cat" value="Percetakan" checked>
              <span>Percetakan</span>
            </label>
            <label class="category-chip-label">
              <input type="checkbox" name="scanner_cat" value="Konveksi" checked>
              <span>Konveksi</span>
            </label>
            <label class="category-chip-label">
              <input type="checkbox" name="scanner_cat" value="Bengkel Mobil" checked>
              <span>Bengkel Kendaraan</span>
            </label>
            <label class="category-chip-label">
              <input type="checkbox" name="scanner_cat" value="Klinik Kecantikan">
              <span>Klinik Kecantikan</span>
            </label>
            <label class="category-chip-label">
              <input type="checkbox" name="scanner_cat" value="Wedding Organizer">
              <span>Wedding Organizer</span>
            </label>
            <label class="category-chip-label">
              <input type="checkbox" name="scanner_cat" value="Oleh-oleh">
              <span>Retail & Oleh-oleh</span>
            </label>
          </div>
        </div>

        <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
          <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
            <input id="scanner-enrich-reviews" type="checkbox" checked>
            <span>Ambil Ulasan Riil (Google Maps Reviews) untuk lead potensial</span>
          </label>
          <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; color: var(--semantic-warning);">
            <input id="scanner-clear-cache" type="checkbox">
            <span>Paksa ambil segar (bersihkan cache SerpAPI lokal)</span>
          </label>
        </div>

        <!-- Live Terminal Stream Output -->
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px;">Live Terminal Stream</span>
            <span id="scanner-status-indicator" style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">Siap</span>
          </div>
          <div id="scannerTerminal" class="live-terminal">Klik "Mulai Tarik Lead" untuk menjalankan pipeline SerpAPI secara langsung...</div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; align-items: center;">
          <button type="button" class="btn-status-pill" onclick="closeScannerModal()">Tutup</button>
          <button id="btn-start-scanner" type="button" class="btn-hero-advance" onclick="startPipelineScanner()">
            ${ICONS.zap} Mulai Tarik Lead
          </button>
          <button id="btn-done-scanner" type="button" class="btn-hero-wa" style="display: none;" onclick="window.location.href='/'">
            ${ICONS.target} Selesai & Buka Antrean Baru
          </button>
        </div>
      </div>
    </div>

    <div id="toast" class="toast-editorial">Pesan berhasil disalin!</div>
    <script src="/js/dashboard.js" defer></script>
  </body>
  </html>
  `;
}

// 1. Halaman Antrean Hari Ini (GET /)
app.get('/', async (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '12', 10);
  const queue = await db.getTodayQueue(limit);
  const contactedToday = await db.getTodayContactedCount();
  const dueFollowUps = await db.getDueFollowUpsCount();
  const targetTotal = 12;

  // Banner Target Harian
  const isTargetAchieved = contactedToday >= targetTotal;
  const progressPct = Math.min(100, Math.round((contactedToday / targetTotal) * 100));

  let dailyBannerHtml = `
    <div class="daily-banner">
      <div class="target-info">
        <div class="target-stat-number">${contactedToday} <span style="font-size: 16px; color: var(--text-dim);">/ ${targetTotal}</span></div>
        <div class="target-stat-label">
          <strong>Target Outreach Hari Ini</strong><br>
          ${isTargetAchieved ? 'Target tercapai! Selesaikan sisa antrean jika siap.' : 'Fokus selesaikan 1 lead per waktu.'}
        </div>
      </div>

      <div class="target-progress-bar-container">
        <div class="progress-track">
          <div class="progress-fill" style="width: ${progressPct}%;"></div>
        </div>
      </div>

      <div style="display: flex; gap: 10px; align-items: center;">
        ${isTargetAchieved ? `
          <div class="target-completed-badge">
            ${ICONS.check}
            12/12 Target Beres
          </div>
        ` : ''}
        ${dueFollowUps > 0 ? `
          <div class="followup-due-pill">
            ${ICONS.clock}
            ${dueFollowUps} Follow-up Jatuh Tempo
          </div>
        ` : ''}
      </div>
    </div>
  `;

  if (queue.length === 0) {
    const emptyContent = `
      ${dailyBannerHtml}
      <div class="empty-state-editorial">
        <div class="empty-state-title">Antrean beres. Waktunya riset lead baru atau bikin demo.</div>
        <div class="empty-state-body">
          Database antrean saat ini bersih atau semua target telah selesai dihubungi. Anda bisa langsung menarik lead lokal baru dari Google Maps via SerpAPI langsung dari kokpit.
        </div>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn-hero-advance" onclick="openScannerModal()" style="min-width: 220px;">
            ${ICONS.zap} Tarik Lead Baru dari SerpAPI &rarr;
          </button>
          <a href="/pipeline" class="btn-status-pill" style="text-decoration: none;">
            Buka Papan Pipeline &rarr;
          </a>
        </div>
      </div>
    `;
    res.send(renderLayout('Antrean Selesai', emptyContent, 'queue'));
    return;
  }

  // A. Susun Kartu Mode Fokus (Hero Cards)
  let focusCardsHtml = '';
  let queueSidebarItemsHtml = '';
  let listModeCardsHtml = '';

  queue.forEach((lead, index) => {
    const cardId = lead.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const phoneDigits = (lead.phone || '').replace(/\D/g, '');
    const waNumber = phoneDigits.startsWith('0') ? '62' + phoneDigits.substring(1) : phoneDigits;

    let activeStep: 'step1' | 'step2_followup1' | 'step3_followup2' = 'step1';
    let stepLabel = 'Pesan 1 (Pembuka Santun & Penawaran Konkret)';
    if (lead.status === 'terkirim' || lead.status === 'follow_up_1') {
      activeStep = 'step2_followup1';
      stepLabel = 'Follow-up 1 (H+3 Nilai Tambah)';
    } else if (lead.status === 'follow_up_2') {
      activeStep = 'step3_followup2';
      stepLabel = 'Follow-up 2 (H+7 Sapaan Penutup)';
    }

    const messageContent = lead.messages?.[activeStep] || 'Halo Kak, perkenalkan saya...';
    const encodedMessage = encodeURIComponent(messageContent);
    const waUrl = `https://wa.me/${waNumber}?text=${encodedMessage}`;
    const segments = calculateScoreSegments(lead);

    // Stempel status miring
    let stampHtml = '';
    if (lead.websiteVerificationStatus === 'hanya media sosial') {
      stampHtml = `<span class="stamp-tag stamp-social">HANYA MEDIA SOSIAL</span>`;
    } else if (lead.websiteVerificationStatus === 'tidak punya website') {
      stampHtml = `<span class="stamp-tag stamp-none">BELUM PUNYA WEBSITE</span>`;
    } else {
      stampHtml = `<span class="stamp-tag stamp-poor">WEB PERLU REDESAIN</span>`;
    }

    const manualCheckedStamp = lead.manualWebChecked
      ? `<span id="stamp-checked-${cardId}" class="stamp-tag stamp-verified" style="margin-left: 6px;">SUDAH DICEK MANUAL</span>`
      : `<span id="stamp-checked-${cardId}" class="stamp-tag stamp-verified" style="margin-left: 6px; display: none;">SUDAH DICEK MANUAL</span>`;

    // Mode Fokus Item
    focusCardsHtml += `
      <div class="focus-card-item ${index === 0 ? 'active-lead' : ''}" data-lead-id="${lead.id}" id="focus-lead-${cardId}" style="${index === 0 ? 'display:block;' : 'display:none;'}">
        <div class="focus-hero-card">
          <div class="hero-meta-top">
            <div>
              <h2 class="hero-lead-title">${escapeHtml(lead.name)}</h2>
              <div class="hero-subinfo">
                <span>${escapeHtml(lead.category)}</span>
                <span>&bull;</span>
                <span>${escapeHtml(lead.area || 'Jember')}</span>
                <span>&bull;</span>
                <span class="channel-tag">${escapeHtml(lead.primaryChannel)}</span>
              </div>
            </div>
            <div>
              ${stampHtml}
              ${manualCheckedStamp}
            </div>
          </div>

          <!-- Segmented Tick Meter -->
          <div class="segmented-meter" title="${lead.score}/100 - Evaluasi Skor">
            <div class="meter-header">
              <span style="font-weight: 700; color: var(--text-muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Meteran Potensi Lead</span>
              <div style="display: flex; align-items: baseline; gap: 4px;">
                <span class="meter-score-badge">${lead.score}</span>
                <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">/100</span>
              </div>
            </div>
            <div class="meter-segments-row">
              ${segments.map((s) => {
                const isFilled = (s.score / s.maxScore) >= 0.7;
                return `<div class="meter-segment ${isFilled ? 'filled' : ''}" title="${s.label}: ${s.score}/${s.maxScore} pts (${escapeHtml(s.reason)})"></div>`;
              }).join('')}
            </div>
            <div class="meter-ticks-legend">
              ${segments.map((s) => `<span>${s.label}</span>`).join('')}
            </div>
          </div>

          <!-- Verifikasi Alert jika Tidak Punya Website -->
          ${
            lead.websiteVerificationStatus === 'tidak punya website'
              ? `
              <div class="verification-alert">
                <div class="verification-alert-title">
                  ${ICONS.alertTriangle}
                  Cek manual profil Instagram/Facebook sebelum mengirim pesan
                </div>
                <div class="verification-actions">
                  <a href="https://www.google.com/search?q=${encodeURIComponent(lead.name + ' Jember')}" target="_blank" class="btn-status-pill" style="text-decoration:none;">
                    ${ICONS.search}
                    Cari "${escapeHtml(lead.name)}" di Google
                  </a>
                  <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; user-select:none;">
                    <input type="checkbox" onchange="toggleManualCheck('${lead.id}', this.checked)" ${lead.manualWebChecked ? 'checked' : ''}>
                    <span>Sudah saya cek</span>
                  </label>
                </div>
              </div>`
              : ''
          }

          <!-- Workbench Draf Pesan -->
          <div class="message-workbench">
            <div class="message-workbench-header">
              <span style="display: flex; align-items: center; gap: 6px;">${ICONS.messageSquare} ${stepLabel}</span>
              <div style="display:flex; align-items:center; gap:10px;">
                <span id="char-count-${cardId}" class="char-counter">${messageContent.length} karakter</span>
                <button type="button" class="btn-status-pill" style="padding: 2px 8px; font-size: 11px;" onclick="copyText('msg-${cardId}')">${ICONS.copy} Salin</button>
              </div>
            </div>
            <textarea
              id="msg-${cardId}"
              class="message-live-textarea"
              oninput="handleMessageChange('${cardId}', '${waNumber}')"
            >${escapeHtml(messageContent)}</textarea>
          </div>

          <!-- Aksi Dominan Utama -->
          <div class="focus-actions-primary">
            ${
              lead.primaryChannel === 'WhatsApp' && waNumber
                ? `<a id="wa-btn-${cardId}" href="${waUrl}" target="_blank" class="btn-hero-wa">
                    ${ICONS.whatsapp} Buka WhatsApp <span class="kbd-badge">Enter</span>
                  </a>`
                : `<button type="button" class="btn-hero-wa" onclick="copyText('msg-${cardId}')">${ICONS.copy} Salin Pesan <span class="kbd-badge">Enter</span></button>`
            }
            <button type="button" class="btn-hero-advance" onclick="updateLeadStatusAjax('${lead.id}', 'terkirim', true)">
              ${ICONS.checkCheck} Terkirim & Lanjut <span class="kbd-badge">S</span>
            </button>
          </div>

          <!-- Aksi Cepat Sekunder -->
          <div class="focus-actions-secondary">
            <button type="button" class="btn-status-pill ${lead.status === 'balas' ? 'active' : ''}" onclick="updateLeadStatusAjax('${lead.id}', 'balas', false)">
              ${ICONS.message} Balas Chat <span class="kbd-badge">R</span>
            </button>
            <button type="button" class="btn-status-pill ${lead.status === 'tidak_tertarik' ? 'active' : ''}" onclick="updateLeadStatusAjax('${lead.id}', 'tidak_tertarik', true)">
              ${ICONS.xCircle} Tolak <span class="kbd-badge">X</span>
            </button>
            <button type="button" class="btn-status-pill" onclick="document.getElementById('notes-input-${cardId}').focus()">
              ${ICONS.edit} Catatan <span class="kbd-badge">N</span>
            </button>
            <a href="/lead/${lead.id}" class="btn-status-pill" style="margin-left:auto; text-decoration:none;">
              Lihat Riwayat & Detail &rarr;
            </a>
          </div>

          <!-- Kolom Catatan Cepat -->
          <form method="POST" action="/lead/${lead.id}/notes" class="hero-notes-form">
            <input id="notes-input-${cardId}" type="text" name="notes" placeholder="Catatan singkat (PIC, respons telepon, janji temu)..." value="${escapeHtml(lead.notes || '')}" class="input-editorial" style="flex:1;">
            <button type="submit" class="btn-status-pill">Simpan</button>
          </form>
        </div>
      </div>
    `;

    // Sidebar Item
    queueSidebarItemsHtml += `
      <div class="queue-item ${index === 0 ? 'active' : ''}" data-index="${index}" onclick="activateLeadByIndex(${index})">
        <div>
          <div class="queue-item-name">${escapeHtml(lead.name)}</div>
          <div class="queue-item-meta">${escapeHtml(lead.category)} &bull; ${escapeHtml(lead.area || 'Jember')}</div>
        </div>
        <div class="queue-item-score">${lead.score}</div>
      </div>
    `;

    // List Mode Card
    listModeCardsHtml += `
      <div class="focus-hero-card" style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h3 style="font-family: var(--font-display); font-size: 20px; margin: 0 0 4px 0;">
              <a href="/lead/${lead.id}" style="color:var(--text-main);">${escapeHtml(lead.name)}</a>
            </h3>
            <div style="font-size: 13px; color: var(--text-muted);">${escapeHtml(lead.category)} &bull; ${escapeHtml(lead.area || 'Jember')}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="meter-score-badge" style="font-size:18px;">${lead.score}</span>
            ${stampHtml}
          </div>
        </div>
        <div style="margin-top: 12px; display:flex; gap:8px; flex-wrap:wrap;">
          ${lead.primaryChannel === 'WhatsApp' && waNumber ? `<a href="${waUrl}" target="_blank" class="btn-status-pill" style="background:var(--wa-primary); color:var(--wa-text); font-weight:700;">${ICONS.whatsapp} WA</a>` : ''}
          <button type="button" class="btn-status-pill" onclick="updateLeadStatusAjax('${lead.id}', 'terkirim', false)">${ICONS.check} Terkirim</button>
          <button type="button" class="btn-status-pill" onclick="updateLeadStatusAjax('${lead.id}', 'balas', false)">${ICONS.message} Balas</button>
          <a href="/lead/${lead.id}" class="btn-status-pill" style="margin-left:auto;">Detail</a>
        </div>
      </div>
    `;
  });

  const content = `
    ${dailyBannerHtml}

    <div class="view-toggle-bar">
      <div class="view-pills">
        <button id="pill-focus" type="button" class="view-pill active" onclick="switchViewMode('focus')">
          ${ICONS.target} Mode Fokus (${queue.length})
        </button>
        <button id="pill-list" type="button" class="view-pill" onclick="switchViewMode('list')">
          ${ICONS.list} Mode Daftar
        </button>
      </div>

      <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">
        Pintasan: <span class="kbd-badge">J</span> / <span class="kbd-badge">K</span> Pindah &bull; <span class="kbd-badge">Enter</span> Buka WA &bull; <span class="kbd-badge">S</span> Terkirim &bull; <span class="kbd-badge">?</span> Bantuan
      </div>
    </div>

    <!-- Container Mode Fokus -->
    <div id="view-focus-container">
      <div class="focus-stage-grid">
        <div>
          ${focusCardsHtml}
        </div>

        <aside class="queue-sidebar">
          <div class="queue-sidebar-header">
            <span>Antrean Berikutnya</span>
            <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${queue.length} Leads</span>
          </div>

          <div class="queue-list">
            ${queueSidebarItemsHtml}
          </div>

          <div class="queue-nav-controls">
            <button id="btn-prev-lead" type="button" class="btn-nav-control" onclick="navigateLead(-1)" disabled>
              &larr; Prev <span class="kbd-badge">J</span>
            </button>
            <button id="btn-next-lead" type="button" class="btn-nav-control" onclick="navigateLead(1)">
              Next &rarr; <span class="kbd-badge">K</span>
            </button>
          </div>
        </aside>
      </div>
    </div>

    <!-- Container Mode Daftar -->
    <div id="view-list-container" style="display: none;">
      <div style="max-width: 900px; margin: 0 auto;">
        ${listModeCardsHtml}
      </div>
    </div>
  `;

  res.send(renderLayout('Antrean Hari Ini', content, 'queue'));
});

// 2. Halaman Papan Pipeline Kanban (GET /pipeline)
app.get('/pipeline', async (req: Request, res: Response) => {
  const metrics = await db.getPipelineMetrics();
  const allPipelineLeads = await db.getPipelineLeads();

  // Kolom-kolom Kanban
  const columns: { id: LeadPipelineStatus; label: string }[] = [
    { id: 'belum_dihubungi', label: 'Belum Dihubungi' },
    { id: 'terkirim', label: 'Terkirim (Menunggu)' },
    { id: 'follow_up_1', label: 'Follow-up' },
    { id: 'balas', label: 'Balas Chat' },
    { id: 'demo', label: 'Demo / Solusi' },
    { id: 'negosiasi', label: 'Negosiasi' },
    { id: 'deal', label: 'Deal Proyek' },
  ];

  let boardColumnsHtml = '';
  columns.forEach((col) => {
    let colLeads: SqliteLeadRecord[] = [];
    if (col.id === 'follow_up_1') {
      colLeads = allPipelineLeads.filter((l) => l.status === 'follow_up_1' || l.status === 'follow_up_2');
    } else {
      colLeads = allPipelineLeads.filter((l) => l.status === col.id);
    }

    const colValueSum = colLeads.reduce((acc, curr) => acc + (curr.estimatedValue || 0), 0);

    let cardsHtml = '';
    colLeads.forEach((lead) => {
      const cardSafeId = lead.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      cardsHtml += `
        <div
          id="kanban-card-${cardSafeId}"
          class="kanban-card"
          draggable="true"
          data-current-status="${lead.status}"
          ondragstart="handleDragStart(event, '${lead.id}', '${lead.status}')"
          ondragend="handleDragEnd(event, '${lead.id}')"
        >
          <div class="kanban-card-title">
            <a href="/lead/${lead.id}" style="color:var(--text-main);">${escapeHtml(lead.name)}</a>
          </div>
          <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(lead.category)} &bull; ${escapeHtml(lead.area || 'Jember')}</div>
          <div class="kanban-card-meta">
            <span style="font-family:var(--font-mono); color:var(--accent); font-weight:700;">${lead.score} pts</span>
            ${lead.estimatedValue ? `<span style="font-family:var(--font-mono); color:var(--semantic-success);">${formatRupiah(lead.estimatedValue)}</span>` : ''}
          </div>

          <!-- Dropdown alternatif untuk mobile/keyboard -->
          <select class="kanban-move-select" onchange="if(this.value && this.value !== '${lead.status}') { updateLeadStatusAjax('${lead.id}', this.value, false); setTimeout(()=>window.location.reload(), 350); }">
            <option value="" disabled selected>&rarr; Pindah Kolom...</option>
            <option value="belum_dihubungi">Belum Dihubungi</option>
            <option value="terkirim">Terkirim</option>
            <option value="follow_up_1">Follow-up</option>
            <option value="balas">Balas Chat</option>
            <option value="demo">Demo</option>
            <option value="negosiasi">Negosiasi</option>
            <option value="deal">Deal</option>
          </select>
        </div>
      `;
    });

    boardColumnsHtml += `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <div>
            <div class="kanban-col-title">${escapeHtml(col.label)}</div>
            ${colValueSum > 0 ? `<div style="font-family:var(--font-mono); font-size:10px; color:var(--semantic-success);">${formatRupiah(colValueSum)}</div>` : ''}
          </div>
          <span class="kanban-col-count">${colLeads.length}</span>
        </div>
        <div
          class="kanban-cards-container"
          data-status="${col.id}"
          ondragover="handleDragOver(event)"
          ondragleave="handleDragLeave(event)"
          ondrop="handleDrop(event, '${col.id}')"
        >
          ${cardsHtml || '<div style="font-size:11px; color:var(--text-dim); text-align:center; padding:20px 0;">Kosong</div>'}
        </div>
      </div>
    `;
  });

  const content = `
    <!-- Metrics Bar Editorial -->
    <div class="pipeline-metrics-bar">
      <div class="pipeline-metric-card">
        <div class="pipeline-metric-val">${metrics.totalLeads}</div>
        <div class="pipeline-metric-lbl">Total Leads</div>
      </div>
      <div class="pipeline-metric-card">
        <div class="pipeline-metric-val accent">${metrics.terkirim + metrics.followUp}</div>
        <div class="pipeline-metric-lbl">Terkirim / Follow-up</div>
      </div>
      <div class="pipeline-metric-card">
        <div class="pipeline-metric-val" style="color: #60A5FA;">${metrics.balas}</div>
        <div class="pipeline-metric-lbl">Balas Chat</div>
      </div>
      <div class="pipeline-metric-card">
        <div class="pipeline-metric-val success">${metrics.deal}</div>
        <div class="pipeline-metric-lbl">Deal Proyek</div>
      </div>
      <div class="pipeline-metric-card">
        <div class="pipeline-metric-val">${metrics.responseRatePct}%</div>
        <div class="pipeline-metric-lbl">Response Rate</div>
      </div>
      <div class="pipeline-metric-card" style="grid-column: span 2;">
        <div class="pipeline-metric-val success" style="font-size:22px;">${formatRupiah(metrics.totalEstimatedValue)}</div>
        <div class="pipeline-metric-lbl">Potensi Nilai Pipeline</div>
      </div>
    </div>

    <div class="kanban-board-scroll">
      <div class="kanban-board">
        ${boardColumnsHtml}
      </div>
    </div>
  `;

  res.send(renderLayout('Papan Pipeline Kanban', content, 'pipeline'));
});

// 3. Halaman Semua Lead (GET /leads)
app.get('/leads', async (req: Request, res: Response) => {
  const { category, status, channel, search } = req.query;
  const leads = await db.getAllLeads({
    category: category as string,
    status: status as string,
    channel: channel as string,
    search: search as string,
  });

  const categories = Object.values(CATEGORIES_CONFIG).map((c) => c.name);

  // Helper formatting badges
  const getLeadStatusBadge = (st: string) => {
    switch (st) {
      case 'belum_dihubungi':
        return { label: 'Belum Dihubungi', bg: 'rgba(148, 163, 184, 0.12)', color: 'var(--text-muted)', border: 'rgba(148, 163, 184, 0.25)', dot: '#94A3B8' };
      case 'terkirim':
        return { label: 'Terkirim', bg: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B', border: 'rgba(245, 158, 11, 0.3)', dot: '#F59E0B' };
      case 'follow_up_1':
        return { label: 'Follow-Up 1', bg: 'rgba(168, 85, 247, 0.12)', color: '#C084FC', border: 'rgba(168, 85, 247, 0.3)', dot: '#C084FC' };
      case 'follow_up_2':
        return { label: 'Follow-Up 2', bg: 'rgba(192, 132, 252, 0.15)', color: '#D8B4FE', border: 'rgba(192, 132, 252, 0.3)', dot: '#D8B4FE' };
      case 'balas':
        return { label: 'Balas Chat', bg: 'rgba(59, 130, 246, 0.12)', color: '#60A5FA', border: 'rgba(59, 130, 246, 0.3)', dot: '#60A5FA' };
      case 'demo':
        return { label: 'Demo Dibuat', bg: 'rgba(99, 102, 241, 0.12)', color: '#818CF8', border: 'rgba(99, 102, 241, 0.3)', dot: '#818CF8' };
      case 'negosiasi':
        return { label: 'Negosiasi', bg: 'rgba(234, 88, 12, 0.12)', color: '#FB923C', border: 'rgba(234, 88, 12, 0.3)', dot: '#FB923C' };
      case 'deal':
        return { label: 'Deal / Closing', bg: 'rgba(16, 185, 129, 0.15)', color: '#34D399', border: 'rgba(16, 185, 129, 0.35)', dot: '#34D399' };
      case 'tidak_tertarik':
        return { label: 'Tidak Tertarik', bg: 'rgba(239, 68, 68, 0.12)', color: '#F87171', border: 'rgba(239, 68, 68, 0.3)', dot: '#F87171' };
      case 'data_lama':
        return { label: 'Data Lama', bg: 'rgba(100, 116, 139, 0.12)', color: '#94A3B8', border: 'rgba(100, 116, 139, 0.25)', dot: '#64748B' };
      case 'perlu_riset_kontak':
        return { label: 'Perlu Riset', bg: 'rgba(244, 63, 94, 0.12)', color: '#FB7185', border: 'rgba(244, 63, 94, 0.3)', dot: '#FB7185' };
      default:
        return { label: st, bg: 'rgba(148, 163, 184, 0.12)', color: 'var(--text-muted)', border: 'rgba(148, 163, 184, 0.25)', dot: '#94A3B8' };
    }
  };

  const getLeadWebBadge = (webSt: string) => {
    switch (webSt) {
      case 'tidak punya website':
        return `<span class="table-web-badge table-web-noweb"><span class="table-status-dot" style="background:#F87171;"></span>Tanpa Web</span>`;
      case 'hanya media sosial':
        return `<span class="table-web-badge table-web-social"><span class="table-status-dot" style="background:#FBBF24;"></span>Hanya Medsos</span>`;
      case 'punya website tapi buruk':
        return `<span class="table-web-badge table-web-bad"><span class="table-status-dot" style="background:#FB923C;"></span>Web Buruk</span>`;
      case 'punya website aktif':
        return `<span class="table-web-badge table-web-active"><span class="table-status-dot" style="background:#34D399;"></span>Web Aktif</span>`;
      default:
        return `<span class="table-web-badge table-web-check"><span class="table-status-dot" style="background:#94A3B8;"></span>Perlu Cek</span>`;
    }
  };

  const getLeadChannelBadge = (ch: string) => {
    if (ch === 'WhatsApp') {
      return `<span class="table-channel-pill table-channel-whatsapp">${ICONS.whatsapp} WA</span>`;
    } else if (ch === 'Instagram') {
      return `<span class="table-channel-pill table-channel-instagram">${ICONS.instagram} IG</span>`;
    } else if (ch === 'Phone') {
      return `<span class="table-channel-pill table-channel-phone">${ICONS.phone} Telp</span>`;
    }
    return `<span class="table-channel-pill table-channel-none">None</span>`;
  };

  // Stat summary
  const highScoreCount = leads.filter((l) => l.score >= 85).length;
  const noWebCount = leads.filter((l) => l.websiteVerificationStatus === 'tidak punya website' || l.websiteVerificationStatus === 'hanya media sosial').length;
  const contactedCount = leads.filter((l) => l.status !== 'belum_dihubungi').length;

  let rowsHtml = '';
  leads.forEach((l, idx) => {
    const st = getLeadStatusBadge(l.status);
    rowsHtml += `
      <tr>
        <td class="table-col-num">${idx + 1}</td>
        <td>
          <div class="table-business-cell">
            <a href="/lead/${l.id}" class="table-business-name" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</a>
            <div class="table-business-sub">
              <span class="table-business-area">${ICONS.mapPin} ${escapeHtml(l.area || 'Jember')}</span>
              ${l.phone ? `<span style="opacity:0.35;">•</span> <span>${escapeHtml(l.phone)}</span>` : ''}
            </div>
          </div>
        </td>
        <td>
          <div class="table-category-cell">${escapeHtml(l.category)}</div>
        </td>
        <td>
          <span class="table-score-pill ${l.score >= 80 ? 'table-score-high' : l.score >= 60 ? 'table-score-mid' : ''}">
            ${l.score}<span class="table-score-denom">/100</span>
          </span>
        </td>
        <td>${getLeadChannelBadge(l.primaryChannel)}</td>
        <td>
          <span class="table-status-pill" style="background:${st.bg}; color:${st.color}; border:1px solid ${st.border};">
            <span class="table-status-dot" style="background:${st.dot};"></span>
            ${st.label}
          </span>
        </td>
        <td>${getLeadWebBadge(l.websiteVerificationStatus)}</td>
        <td>
          <span class="table-val-pill ${l.estimatedValue && l.estimatedValue > 0 ? 'table-val-active' : ''}">${formatRupiah(l.estimatedValue || 0)}</span>
        </td>
        <td style="text-align:right;">
          <a href="/lead/${l.id}" class="table-action-btn">
            <span>Detail</span>
            ${ICONS.arrowRight}
          </a>
        </td>
      </tr>
    `;
  });

  const content = `
    <div class="leads-header-row">
      <div class="leads-title-group">
        <h2 class="leads-title">Database Semua Leads</h2>
        <span class="leads-count-badge">${leads.length} Terdata</span>
      </div>
    </div>

    <!-- Quick Stat Strip -->
    <div class="leads-stat-strip">
      <div class="stat-strip-card">
        <span class="stat-strip-label">${ICONS.folder} Total Leads</span>
        <span class="stat-strip-value">${leads.length}</span>
      </div>
      <div class="stat-strip-card">
        <span class="stat-strip-label">${ICONS.zap} Prioritas Tinggi (&ge;85)</span>
        <span class="stat-strip-value" style="color:#F59E0B;">${highScoreCount}</span>
      </div>
      <div class="stat-strip-card">
        <span class="stat-strip-label">${ICONS.alertTriangle} Tanpa / Hanya Medsos</span>
        <span class="stat-strip-value" style="color:#F87171;">${noWebCount}</span>
      </div>
      <div class="stat-strip-card">
        <span class="stat-strip-label">${ICONS.checkCheck} Sudah Dihubungi</span>
        <span class="stat-strip-value" style="color:var(--semantic-success);">${contactedCount}</span>
      </div>
    </div>

    <!-- Filter Form -->
    <form method="GET" action="/leads" class="leads-filter-card">
      <div style="position:relative; flex:2; min-width:220px;">
        <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted); display:flex; align-items:center;">
          ${ICONS.search}
        </span>
        <input type="text" name="search" placeholder="Cari nama, alamat, catatan..." value="${escapeHtml(search as string)}" class="input-editorial" style="width:100%; padding-left:36px;">
      </div>
      
      <select name="category" class="input-editorial" style="flex:1; min-width:160px;">
        <option value="all">Semua Kategori</option>
        ${categories.map((c) => `<option value="${escapeHtml(c)}" ${category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>

      <select name="status" class="input-editorial" style="flex:1; min-width:160px;">
        <option value="all">Semua Status</option>
        <option value="belum_dihubungi" ${status === 'belum_dihubungi' ? 'selected' : ''}>Belum Dihubungi</option>
        <option value="terkirim" ${status === 'terkirim' ? 'selected' : ''}>Terkirim</option>
        <option value="follow_up_1" ${status === 'follow_up_1' ? 'selected' : ''}>Follow-Up 1</option>
        <option value="follow_up_2" ${status === 'follow_up_2' ? 'selected' : ''}>Follow-Up 2</option>
        <option value="balas" ${status === 'balas' ? 'selected' : ''}>Balas Chat</option>
        <option value="demo" ${status === 'demo' ? 'selected' : ''}>Demo Dibuat</option>
        <option value="negosiasi" ${status === 'negosiasi' ? 'selected' : ''}>Negosiasi</option>
        <option value="deal" ${status === 'deal' ? 'selected' : ''}>Deal / Closing</option>
        <option value="tidak_tertarik" ${status === 'tidak_tertarik' ? 'selected' : ''}>Tidak Tertarik</option>
        <option value="data_lama" ${status === 'data_lama' ? 'selected' : ''}>Data Lama</option>
      </select>

      <div style="display:flex; gap:8px;">
        <button type="submit" class="btn-status-pill" style="background:var(--accent); color:#fff; border-color:var(--accent); font-weight:700;">
          ${ICONS.filter} Filter
        </button>
        <a href="/leads" class="btn-status-pill" style="text-decoration:none;">Reset</a>
      </div>
    </form>

    <!-- Table Card -->
    <div class="leads-table-card">
      <div class="leads-table-wrapper">
        <table class="leads-table">
          <thead>
            <tr>
              <th style="width:44px; text-align:center;">#</th>
              <th>Nama Bisnis</th>
              <th>Kategori</th>
              <th>Skor</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Status Web</th>
              <th>Potensi Nilai</th>
              <th style="text-align:right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="9" style="text-align:center; padding:36px; color:var(--text-muted);">Tidak ada lead yang cocok dengan kriteria filter.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout('Semua Leads', content, 'leads'));
});

// 4. Detail & Riwayat Lead (GET /lead/:id)
app.get('/lead/:id', async (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const lead = await db.getLeadById(leadId);
  if (!lead) {
    res.status(404).send('Lead tidak ditemukan');
    return;
  }

  const events = await db.getLeadEvents(lead.id);
  const segments = calculateScoreSegments(lead);

  let timelineHtml = '';
  if (events.length === 0) {
    timelineHtml = '<p style="color:var(--text-muted);">Belum ada riwayat tercatat.</p>';
  } else {
    events.forEach((ev) => {
      const dateStr = new Date(ev.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      timelineHtml += `
        <div class="timeline-event-item">
          <div class="timeline-node-dot"></div>
          <div class="timeline-date">${dateStr}</div>
          <div class="timeline-action">${escapeHtml(ev.action)}</div>
          ${ev.note ? `<div class="timeline-note-box">${escapeHtml(ev.note)}</div>` : ''}
        </div>
      `;
    });
  }

  const content = `
    <div style="margin-bottom: 20px;">
      <a href="/leads" style="color: var(--accent); font-size: 13px; text-decoration: none;">&larr; Kembali ke Daftar Semua Leads</a>
    </div>

    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
      <div>
        <div class="focus-hero-card">
          <div class="hero-meta-top">
            <div>
              <h2 class="hero-lead-title">${escapeHtml(lead.name)}</h2>
              <div class="hero-subinfo">
                <span>${escapeHtml(lead.category)}</span>
                <span>&bull;</span>
                <span>${escapeHtml(lead.address || '-')}</span>
              </div>
            </div>
            <div class="meter-score-badge" style="font-size:24px;">${lead.score}/100</div>
          </div>

          <!-- Segmented Meter -->
          <div class="segmented-meter">
            <div class="meter-header">
              <span style="font-weight:700; color:var(--text-muted); font-size:11px; text-transform:uppercase;">Meteran Komponen Skor</span>
              <span style="font-family:var(--font-mono); font-size:12px;">${lead.score} pts</span>
            </div>
            <div class="meter-segments-row">
              ${segments.map((s) => {
                const isFilled = (s.score / s.maxScore) >= 0.7;
                return `<div class="meter-segment ${isFilled ? 'filled' : ''}" title="${s.label}: ${s.score}/${s.maxScore} pts"></div>`;
              }).join('')}
            </div>
            <div class="meter-ticks-legend">
              ${segments.map((s) => `<span>${s.label}</span>`).join('')}
            </div>
          </div>

          <!-- Audit Bukti Website -->
          <div style="background:var(--bg-base); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:16px; margin:18px 0;">
            <h4 style="font-family:var(--font-display); font-size:14px; margin-bottom:8px; color:var(--accent); display:flex; align-items:center; gap:6px;">${ICONS.search} Bukti Verifikasi Website</h4>
            <div style="font-size:13px; color:var(--text-muted);">
              <div>Status: <strong>${escapeHtml(lead.websiteVerificationStatus)}</strong></div>
              ${lead.websiteAuditEvidence?.checkedUrls?.length ? `<div>URL Dicek: <code>${escapeHtml(lead.websiteAuditEvidence.checkedUrls.join(', '))}</code></div>` : ''}
              ${lead.websiteAuditEvidence?.details ? `<div style="margin-top:4px;">Detail: ${escapeHtml(lead.websiteAuditEvidence.details)}</div>` : ''}
            </div>
          </div>

          <!-- Konsep Pesan Outreach -->
          <div style="margin-top: 18px;">
            <h4 style="font-family:var(--font-display); font-size:15px; margin-bottom:12px; color:var(--text-main); display:flex; align-items:center; gap:6px;">${ICONS.messageSquare} Rangkaian Pesan Outreach</h4>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div class="message-workbench">
                <div class="message-workbench-header"><span>Pesan 1</span></div>
                <div style="font-size:13px; line-height:1.6;">${escapeHtml(lead.messages?.step1 || '-')}</div>
              </div>
              <div class="message-workbench">
                <div class="message-workbench-header"><span>Follow-up 1 (H+3)</span></div>
                <div style="font-size:13px; line-height:1.6;">${escapeHtml(lead.messages?.step2_followup1 || '-')}</div>
              </div>
              <div class="message-workbench">
                <div class="message-workbench-header"><span>Follow-up 2 (H+7)</span></div>
                <div style="font-size:13px; line-height:1.6;">${escapeHtml(lead.messages?.step3_followup2 || '-')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="focus-hero-card">
          <h3 style="font-family:var(--font-display); font-size:16px; margin-bottom:16px; display:flex; align-items:center; gap:8px;">${ICONS.clock} Timeline Riwayat Interaksi</h3>
          <div class="timeline-track">
            ${timelineHtml}
          </div>

          <form method="POST" action="/lead/${lead.id}/notes" style="margin-top: 24px;">
            <h4 style="font-size:13px; margin-bottom:8px; color:var(--text-muted);">Tambah Catatan:</h4>
            <textarea name="notes" class="input-editorial" style="width:100%; min-height:80px;" placeholder="Catatan hasil negosiasi..."></textarea>
            <button type="submit" class="btn-status-pill" style="width:100%; margin-top:8px;">Simpan Catatan</button>
          </form>

          <form method="POST" action="/lead/${lead.id}/value" style="margin-top: 16px;">
            <h4 style="font-size:13px; margin-bottom:8px; color:var(--text-muted);">Estimasi Nilai Proyek:</h4>
            <div style="display:flex; gap:8px;">
              <input type="number" name="estimatedValue" value="${lead.estimatedValue || ''}" placeholder="Rp" class="input-editorial" style="flex:1;">
              <button type="submit" class="btn-status-pill">Set Nilai</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderLayout(`Detail Lead: ${lead.name}`, content, 'leads'));
});

// 5. Action: AJAX Status Transition (POST /lead/:id/status-ajax)
app.post('/lead/:id/status-ajax', async (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const { status, note } = req.body;
  await db.updateLeadStatus(leadId, status as LeadPipelineStatus, note);
  res.json({ success: true, leadId, status });
});

// 6. Action: Toggle Manual Web Check (POST /lead/:id/manual-check)
app.post('/lead/:id/manual-check', async (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const checked = Boolean(req.body.checked);
  await db.setManualWebChecked(leadId, checked);
  res.json({ success: true, leadId, checked });
});

// 7. Action: Update Status Form Post (POST /lead/:id/status)
app.post('/lead/:id/status', async (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const { status, note, snoozeDate } = req.body;
  await db.updateLeadStatus(leadId, status as LeadPipelineStatus, note, snoozeDate);
  const referer = req.headers.referer || '/';
  res.redirect(referer);
});

// 8. Action: Simpan Catatan (POST /lead/:id/notes)
app.post('/lead/:id/notes', async (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const { notes } = req.body;
  await db.updateLeadNotes(leadId, notes || '');
  const referer = req.headers.referer || '/';
  res.redirect(referer);
});

// 9. Action: Set Estimasi Nilai Proyek (POST /lead/:id/value)
app.post('/lead/:id/value', async (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const { estimatedValue } = req.body;
  await db.updateLeadEstimatedValue(leadId, parseInt(estimatedValue || '0', 10));
  const referer = req.headers.referer || '/';
  res.redirect(referer);
});

// 10. Action: Cek Kredit SerpAPI Akun (GET /api/credits)
app.get('/api/credits', async (req: Request, res: Response) => {
  try {
    const serpClient = new SerpApiClient(config);
    const info = await serpClient.getAccountCredits();
    res.json({ success: true, ...info });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Action: Reset / Kosongkan Database dengan Backup Otomatis (POST /api/leads/reset)
app.post('/api/leads/reset', async (req: Request, res: Response) => {
  const clearCache = Boolean(req.body.clearCache);
  const result = await db.clearAllLeads(true);

  if (clearCache) {
    try {
      const baseDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
      const cacheDir = path.join(baseDir, 'data', 'cache', 'serpapi');
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const f of files) {
          if (f.endsWith('.json')) {
            try {
              fs.unlinkSync(path.join(cacheDir, f));
            } catch {}
          }
        }
      }
    } catch {}
  }

  res.json({ success: true, ...result, cacheCleared: clearCache });
});

// 12. Action: Jalankan Pipeline Scanner via Server-Sent Events (GET /api/pipeline/run-stream)
app.get('/api/pipeline/run-stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const city = (req.query.city as string) || 'Jember';
  const categoriesParam = (req.query.categories as string) || '';
  const categories = categoriesParam ? categoriesParam.split(',').map((c) => c.trim()).filter(Boolean) : undefined;
  const leadsPerQuery = parseInt((req.query.leadsPerQuery as string) || '4', 10);
  const scoringMode = ((req.query.scoringMode as string) || 'cashflow_cepat') as 'cashflow_cepat' | 'nilai_besar';
  const enrichReviews = req.query.enrichReviews !== 'false';
  const clearCacheFirst = req.query.clearCacheFirst === 'true';

  const runner = new PipelineRunner(config, db);

  const sendEvent = (data: any) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {}
  };

  // Heartbeat ping agar koneksi SSE di proxy (Vercel / Cloudflare) tidak dianggap idle
  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {}
  }, 5000);

  try {
    const result = await runner.run(
      {
        city,
        categories,
        leadsPerQuery,
        scoringMode,
        enrichReviews,
        clearCacheFirst,
      },
      (msg, type) => {
        sendEvent({
          type: 'log',
          message: msg,
          level: type || 'info',
          timestamp: new Date().toLocaleTimeString('id-ID'),
        });
      }
    );

    sendEvent({ type: 'done', result });
  } catch (err: any) {
    sendEvent({ type: 'error', error: err.message || 'Pipeline execution failed' });
  } finally {
    clearInterval(keepAlive);
    try {
      res.end();
    } catch {}
  }
});

// Export runner & app for Vercel Serverless
export function startDashboardServer(): http.Server {
  const server = app.listen(PORT, HOST, () => {
    console.log(`================================================================`);
    console.log(`[KOKPIT] Buruan Klien - Local Dashboard Aktif!`);
    console.log(`   URL: http://${HOST}:${PORT}`);
    console.log(`   Host Binding: ${HOST} (Laptop Lokal)`);
    if (DASHBOARD_PIN) {
      console.log(`   [PIN] Proteksi Keamanan Aktif`);
    }
    console.log(`================================================================\n`);
  });
  return server;
}

if (require.main === module) {
  startDashboardServer();
}

export default app;
export { app, db };
