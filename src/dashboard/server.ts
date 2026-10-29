import express, { Request, Response, NextFunction } from 'express';
import * as path from 'path';
import * as http from 'http';
import { SqliteDatabase, SqliteLeadRecord, LeadPipelineStatus } from '../database/sqliteDb';
import { CATEGORIES_CONFIG } from '../config/categories.config';
import { SerpApiClient } from '../scrapers/serpApiClient';
import { config } from '../config';

const app = express();
const db = new SqliteDatabase();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Konfigurasi Host & Port (Default 127.0.0.1:3000)
const HOST = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT || '3000', 10);
const DASHBOARD_PIN = process.env.DASHBOARD_PIN || '';

// Security: Simple Auth Middleware jika diakses di luar localhost atau PIN aktif
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Jika PIN diset di .env atau server bind ke 0.0.0.0
  if (DASHBOARD_PIN && DASHBOARD_PIN.trim() !== '') {
    const authHeader = req.headers['authorization'];
    const cookies = req.headers.cookie || '';
    const hasPinCookie = cookies.includes(`dash_pin=${DASHBOARD_PIN}`);

    if (req.path === '/login' || req.path === '/auth') {
      return next();
    }

    if (!hasPinCookie) {
      res.status(401).send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Login PIN Dashboard - Lead Gen</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .box { background: #1e293b; padding: 32px; border-radius: 12px; width: 100%; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; }
            h2 { margin-top: 0; color: #38bdf8; }
            input { width: 100%; padding: 12px; margin: 16px 0; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #fff; font-size: 16px; box-sizing: border-box; text-align: center; }
            button { width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; }
            button:hover { background: #0369a1; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2>🔒 Masukkan PIN Akses</h2>
            <p style="color: #94a3b8; font-size: 14px;">Dashboard dilindungi PIN keamanan untuk akses jaringan.</p>
            <form method="POST" action="/auth">
              <input type="password" name="pin" placeholder="Masukkan 4-6 digit PIN" required autofocus>
              <button type="submit">Buka Dashboard</button>
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

// Layout template pembungkus
function renderLayout(title: string, content: string, activeTab = 'queue'): string {
  const metrics = db.getPipelineMetrics();

  return `
  <!DOCTYPE html>
  <html lang="id">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - Lead Gen Local Dashboard</title>
    <style>
      :root {
        --bg: #0f172a;
        --card-bg: #1e293b;
        --card-border: #334155;
        --text: #f8fafc;
        --text-muted: #94a3b8;
        --primary: #38bdf8;
        --primary-hover: #0284c7;
        --success: #22c55e;
        --warning: #f59e0b;
        --danger: #ef4444;
        --wa-green: #25d366;
        --wa-hover: #1ebd5b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: var(--bg);
        color: var(--text);
        line-height: 1.5;
      }
      .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
      header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--card-border);
      }
      .brand { display: flex; align-items: center; gap: 12px; }
      .brand h1 { margin: 0; font-size: 22px; color: var(--primary); }
      .badge-mode {
        background: #0369a1;
        color: #e0f2fe;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 600;
      }
      nav { display: flex; gap: 10px; }
      nav a {
        color: var(--text-muted);
        text-decoration: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 500;
        transition: all 0.2s;
      }
      nav a:hover, nav a.active {
        background: var(--card-bg);
        color: var(--text);
      }
      nav a.active { border: 1px solid var(--primary); color: var(--primary); }

      /* Metrics Bar */
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }
      .metric-box {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      }
      .metric-value { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 2px; }
      .metric-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }

      /* Cards Grid */
      .queue-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 20px;
      }
      .card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
      }
      .business-title { font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 4px 0; }
      .category-sub { font-size: 13px; color: var(--text-muted); }
      .score-pill {
        background: #0284c7;
        color: #fff;
        padding: 4px 10px;
        border-radius: 9999px;
        font-weight: 700;
        font-size: 13px;
        white-space: nowrap;
      }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .tag {
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: 500;
      }
      .tag-channel { background: #1e3a8a; color: #93c5fd; }
      .tag-web-none { background: #451a03; color: #fcd34d; }
      .tag-web-social { background: #3b0764; color: #d8b4fe; }
      .tag-web-poor { background: #7f1d1d; color: #fca5a5; }
      .tag-review { background: #064e3b; color: #6ee7b7; }
      .tag-assumed { background: #334155; color: #cbd5e1; }

      /* Pesan Box */
      .message-box {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 12px;
      }
      .message-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 12px;
        color: var(--primary);
        font-weight: 600;
      }
      .message-textarea {
        width: 100%;
        background: transparent;
        border: none;
        color: #f1f5f9;
        font-family: inherit;
        font-size: 13px;
        resize: vertical;
        min-height: 85px;
        outline: none;
      }

      /* Buttons & Actions */
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 9px 14px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        border: none;
        transition: all 0.2s;
      }
      .btn-wa {
        background: var(--wa-green);
        color: #052e16;
        width: 100%;
        font-size: 14px;
        font-weight: 700;
      }
      .btn-wa:hover { background: var(--wa-hover); color: #000; }
      .btn-secondary { background: #334155; color: #f8fafc; }
      .btn-secondary:hover { background: #475569; }
      .btn-outline { background: transparent; border: 1px solid #475569; color: #94a3b8; }
      .btn-outline:hover { background: #334155; color: #fff; }

      .status-button-group {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .btn-status {
        padding: 5px 9px;
        font-size: 11px;
        border-radius: 4px;
        border: 1px solid #334155;
        background: #1e293b;
        color: #cbd5e1;
        cursor: pointer;
      }
      .btn-status:hover { background: #334155; color: #fff; }
      .btn-status.active { border-color: var(--primary); color: var(--primary); font-weight: bold; }

      /* Table View */
      .table-wrapper {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        overflow-x: auto;
      }
      table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
      th, td { padding: 12px 16px; border-bottom: 1px solid var(--card-border); }
      th { background: #0f172a; color: var(--text-muted); font-size: 12px; text-transform: uppercase; font-weight: 600; }
      tr:hover { background: rgba(255,255,255,0.02); }

      /* Forms & Filters */
      .filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
        background: var(--card-bg);
        padding: 16px;
        border-radius: 8px;
        border: 1px solid var(--card-border);
      }
      .form-control {
        background: #0f172a;
        border: 1px solid var(--card-border);
        color: #fff;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        outline: none;
      }
      .form-control:focus { border-color: var(--primary); }

      .toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #22c55e;
        color: #022c22;
        padding: 10px 18px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        display: none;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <div class="brand">
          <h1>🚀 Lead Gen Dashboard</h1>
          <span class="badge-mode">Mode: Cash Flow Cepat</span>
        </div>
        <nav>
          <a href="/" class="${activeTab === 'queue' ? 'active' : ''}">📋 Antrean Hari Ini</a>
          <a href="/leads" class="${activeTab === 'leads' ? 'active' : ''}">📂 Semua Lead</a>
        </nav>
      </header>

      <!-- Pipeline Summary -->
      <div class="metrics-grid">
        <div class="metric-box">
          <div class="metric-value">${metrics.totalLeads}</div>
          <div class="metric-label">Total Leads</div>
        </div>
        <div class="metric-box">
          <div class="metric-value" style="color: #38bdf8;">${metrics.belumDihubungi}</div>
          <div class="metric-label">Belum Dihubungi</div>
        </div>
        <div class="metric-box">
          <div class="metric-value" style="color: #f59e0b;">${metrics.terkirim + metrics.followUp}</div>
          <div class="metric-label">Terkirim / Follow-up</div>
        </div>
        <div class="metric-box">
          <div class="metric-value" style="color: #22c55e;">${metrics.balas}</div>
          <div class="metric-label">Balas Chat</div>
        </div>
        <div class="metric-box">
          <div class="metric-value" style="color: #a855f7;">${metrics.demo + metrics.negosiasi}</div>
          <div class="metric-label">Demo / Negosiasi</div>
        </div>
        <div class="metric-box">
          <div class="metric-value" style="color: #10b981;">${metrics.deal}</div>
          <div class="metric-label">Deal Proyek</div>
        </div>
        <div class="metric-box">
          <div class="metric-value">${metrics.responseRatePct}%</div>
          <div class="metric-label">Response Rate</div>
        </div>
        <div class="metric-box" style="grid-column: span 2;">
          <div class="metric-value" style="color: #34d399; font-size: 16px;">${formatRupiah(metrics.totalEstimatedValue)}</div>
          <div class="metric-label">Potensi Nilai Pipeline</div>
        </div>
      </div>

      ${content}
    </div>

    <div id="toast" class="toast">Teks berhasil disalin ke clipboard!</div>

    <script>
      function copyText(textareaId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        textarea.select();
        navigator.clipboard.writeText(textarea.value).then(() => {
          showToast('Pesan berhasil disalin!');
        });
      }

      function copyRaw(text) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Teks berhasil disalin!');
        });
      }

      function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 2500);
      }

      function updateWaLink(cardId, phone) {
        const textarea = document.getElementById('msg-' + cardId);
        const btn = document.getElementById('wa-btn-' + cardId);
        if (!textarea || !btn) return;
        const encoded = encodeURIComponent(textarea.value);
        btn.href = 'https://wa.me/' + phone + '?text=' + encoded;
      }
    </script>
  </body>
  </html>
  `;
}

// 1. Halaman Antrean Hari Ini (GET /)
app.get('/', (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '12', 10);
  const queue = db.getTodayQueue(limit);

  let cardsHtml = '';
  if (queue.length === 0) {
    cardsHtml = `
      <div style="background: var(--card-bg); padding: 40px; text-align: center; border-radius: 12px; border: 1px solid var(--card-border); grid-column: 1 / -1;">
        <h3>🎉 Antrean Hari Ini Kosong atau Selesai!</h3>
        <p style="color: var(--text-muted);">Semua lead hari ini telah dihubungi atau belum ada follow-up yang jatuh tempo.</p>
        <a href="/leads" class="btn btn-secondary">Lihat Semua Lead</a>
      </div>
    `;
  } else {
    for (const lead of queue) {
      const cardId = lead.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const phoneDigits = (lead.phone || '').replace(/\D/g, '');
      const waNumber = phoneDigits.startsWith('0') ? '62' + phoneDigits.substring(1) : phoneDigits;

      // Pilih teks pesan yang relevan dengan status lead
      let activeStep: 'step1' | 'step2_followup1' | 'step3_followup2' = 'step1';
      let stepLabel = 'Pesan 1 (Pembuka Santun)';
      if (lead.status === 'terkirim' || lead.status === 'follow_up_1') {
        activeStep = 'step2_followup1';
        stepLabel = 'Follow-up 1 (H+3 Nilai Tambah)';
      } else if (lead.status === 'follow_up_2') {
        activeStep = 'step3_followup2';
        stepLabel = 'Follow-up 2 (H+7 Sapaan Penutup)';
      }

      const messageContent = lead.messages?.[activeStep] || 'Halo Kak, salam kenal...';
      const encodedMessage = encodeURIComponent(messageContent);
      const waUrl = `https://wa.me/${waNumber}?text=${encodedMessage}`;

      // Tag Website
      let webTagClass = 'tag-web-none';
      if (lead.websiteVerificationStatus === 'hanya media sosial') webTagClass = 'tag-web-social';
      else if (lead.websiteVerificationStatus.includes('buruk')) webTagClass = 'tag-web-poor';

      // Tag Bukti Ulasan
      const reviewProven = lead.reviewEvidence?.isProven;
      const reviewBadgeHtml = reviewProven
        ? `<span class="tag tag-review">✅ Ulasan Riil: "${escapeHtml(lead.reviewEvidence?.quote?.substring(0, 45))}..."</span>`
        : `<span class="tag tag-assumed">⚠️ Asumsi Kategori</span>`;

      cardsHtml += `
        <div class="card" id="card-${cardId}">
          <div class="card-header">
            <div>
              <h3 class="business-title">${escapeHtml(lead.name)}</h3>
              <div class="category-sub">${escapeHtml(lead.category)} &bull; ${escapeHtml(lead.area || 'Jember')}</div>
            </div>
            <div class="score-pill">${lead.score}/100</div>
          </div>

          <div class="tags">
            <span class="tag tag-channel">${escapeHtml(lead.primaryChannel)}</span>
            <span class="tag ${webTagClass}">${escapeHtml(lead.websiteVerificationStatus)}</span>
            ${reviewBadgeHtml}
          </div>

          <!-- Pesan Outreach Terpilih -->
          <div class="message-box">
            <div class="message-header">
              <span>💬 ${stepLabel}</span>
              <button type="button" class="btn btn-outline" style="padding: 2px 8px; font-size: 11px;" onclick="copyText('msg-${cardId}')">📋 Salin</button>
            </div>
            <textarea
              id="msg-${cardId}"
              class="message-textarea"
              oninput="updateWaLink('${cardId}', '${waNumber}')"
            >${escapeHtml(messageContent)}</textarea>
          </div>

          <!-- Tombol Aksi Utama per Channel -->
          <div>
            ${
              lead.primaryChannel === 'WhatsApp' && waNumber
                ? `<a id="wa-btn-${cardId}" href="${waUrl}" target="_blank" class="btn btn-wa">📱 Buka WhatsApp (Siap Kirim)</a>`
                : ''
            }
            ${
              lead.primaryChannel === 'Instagram'
                ? `
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="copyText('msg-${cardId}')">📋 Salin Pesan</button>
                  ${lead.instagramUrl ? `<a href="${escapeHtml(lead.instagramUrl)}" target="_blank" class="btn btn-primary" style="flex: 1; background: #c13584;">📷 Buka Profil IG</a>` : ''}
                </div>`
                : ''
            }
            ${
              lead.primaryChannel === 'Telepon' && lead.phone
                ? `
                <div style="background: #0f172a; padding: 10px; border-radius: 6px; font-size: 13px;">
                  📞 <strong>Telepon:</strong> ${escapeHtml(lead.phone)}
                  <button type="button" class="btn btn-outline" style="padding: 2px 8px; margin-left: 8px;" onclick="copyRaw('${escapeHtml(lead.phone)}')">Salin</button>
                </div>`
                : ''
            }
            ${
              lead.primaryChannel === 'Kunjungan Langsung'
                ? `
                <div style="background: #0f172a; padding: 10px; border-radius: 6px; font-size: 12px;">
                  📍 <strong>Alamat:</strong> ${escapeHtml(lead.address || '-')}<br>
                  ${lead.mapsUrl ? `<a href="${escapeHtml(lead.mapsUrl)}" target="_blank" style="color: var(--primary);">Buka di Google Maps</a>` : ''}
                </div>`
                : ''
            }
          </div>

          <!-- Status Bar & Actions -->
          <form method="POST" action="/lead/${cardId}/status" style="margin-top: 4px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Update Status:</div>
            <div class="status-button-group">
              <button type="submit" name="status" value="terkirim" class="btn-status ${lead.status === 'terkirim' ? 'active' : ''}">✅ Terkirim</button>
              <button type="submit" name="status" value="balas" class="btn-status ${lead.status === 'balas' ? 'active' : ''}">💬 Balas</button>
              <button type="submit" name="status" value="demo" class="btn-status ${lead.status === 'demo' ? 'active' : ''}">💻 Demo</button>
              <button type="submit" name="status" value="negosiasi" class="btn-status ${lead.status === 'negosiasi' ? 'active' : ''}">🤝 Negosiasi</button>
              <button type="submit" name="status" value="deal" class="btn-status ${lead.status === 'deal' ? 'active' : ''}">🎉 Deal</button>
              <button type="submit" name="status" value="tidak_tertarik" class="btn-status ${lead.status === 'tidak_tertarik' ? 'active' : ''}">❌ Tolak</button>
              <button type="submit" name="status" value="jangan_hubungi" class="btn-status ${lead.status === 'jangan_hubungi' ? 'active' : ''}">🚫 Stop</button>
            </div>
          </form>

          <!-- Catatan Bebas & Estimasi Nilai Proyek -->
          <form method="POST" action="/lead/${cardId}/notes" style="display: flex; gap: 8px; margin-top: 4px;">
            <input type="text" name="notes" placeholder="Catatan (hasil telp, nama PIC, dsb)..." value="${escapeHtml(lead.notes || '')}" class="form-control" style="flex: 1;">
            <button type="submit" class="btn btn-secondary" style="padding: 6px 12px;">Simpan</button>
          </form>

          <form method="POST" action="/lead/${cardId}/value" style="display: flex; gap: 8px; align-items: center;">
            <span style="font-size: 12px; color: var(--text-muted);">Nilai Rp:</span>
            <input type="number" name="estimatedValue" placeholder="Rp" value="${lead.estimatedValue || ''}" class="form-control" style="flex: 1;">
            <button type="submit" class="btn btn-outline" style="padding: 6px 10px;">Set</button>
          </form>
        </div>
      `;
    }
  }

  const content = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h2 style="font-size: 18px; margin: 0;">Antrean Prioritas Hari Ini (${queue.length} Leads)</h2>
      <form method="GET" action="/" style="display: flex; align-items: center; gap: 8px;">
        <label style="font-size: 12px; color: var(--text-muted);">Tampilkan:</label>
        <select name="limit" class="form-control" onchange="this.form.submit()" style="padding: 4px 8px;">
          <option value="6" ${limit === 6 ? 'selected' : ''}>6 Leads</option>
          <option value="12" ${limit === 12 ? 'selected' : ''}>12 Leads (Default)</option>
          <option value="20" ${limit === 20 ? 'selected' : ''}>20 Leads</option>
        </select>
      </form>
    </div>
    <div class="queue-grid">
      ${cardsHtml}
    </div>
  `;

  res.send(renderLayout('Antrean Hari Ini', content, 'queue'));
});

// 2. Halaman Semua Lead (GET /leads)
app.get('/leads', (req: Request, res: Response) => {
  const { category, status, channel, search } = req.query;
  const leads = db.getAllLeads({
    category: category as string,
    status: status as string,
    channel: channel as string,
    search: search as string,
  });

  const categories = Object.values(CATEGORIES_CONFIG).map((c) => c.name);

  let rowsHtml = '';
  leads.forEach((l, idx) => {
    rowsHtml += `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <a href="/lead/${l.id}" style="color: #fff; font-weight: 600; text-decoration: none;">${escapeHtml(l.name)}</a>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(l.area || 'Jember')}</div>
        </td>
        <td>${escapeHtml(l.category)}</td>
        <td><span class="score-pill" style="font-size: 11px; padding: 2px 8px;">${l.score}</span></td>
        <td><span class="tag tag-channel">${escapeHtml(l.primaryChannel)}</span></td>
        <td><span class="btn-status" style="display: inline-block;">${escapeHtml(l.status)}</span></td>
        <td><span style="font-size: 11px;">${escapeHtml(l.websiteVerificationStatus)}</span></td>
        <td>${formatRupiah(l.estimatedValue || 0)}</td>
        <td>
          <a href="/lead/${l.id}" class="btn btn-outline" style="padding: 4px 10px; font-size: 11px;">Detail & Riwayat</a>
        </td>
      </tr>
    `;
  });

  const content = `
    <h2 style="font-size: 18px; margin-bottom: 16px;">Semua Leads Terdaftar (${leads.length} Leads)</h2>

    <form method="GET" action="/leads" class="filter-bar">
      <input type="text" name="search" placeholder="Cari nama / alamat / catatan..." value="${escapeHtml(search as string)}" class="form-control" style="flex: 2; min-width: 200px;">
      
      <select name="category" class="form-control" style="flex: 1;">
        <option value="all">Semua Kategori</option>
        ${categories.map((c) => `<option value="${escapeHtml(c)}" ${category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>

      <select name="status" class="form-control" style="flex: 1;">
        <option value="all">Semua Status</option>
        <option value="belum_dihubungi" ${status === 'belum_dihubungi' ? 'selected' : ''}>Belum Dihubungi</option>
        <option value="terkirim" ${status === 'terkirim' ? 'selected' : ''}>Terkirim</option>
        <option value="follow_up_1" ${status === 'follow_up_1' ? 'selected' : ''}>Follow-up 1</option>
        <option value="balas" ${status === 'balas' ? 'selected' : ''}>Balas</option>
        <option value="demo" ${status === 'demo' ? 'selected' : ''}>Demo</option>
        <option value="negosiasi" ${status === 'negosiasi' ? 'selected' : ''}>Negosiasi</option>
        <option value="deal" ${status === 'deal' ? 'selected' : ''}>Deal</option>
        <option value="tidak_tertarik" ${status === 'tidak_tertarik' ? 'selected' : ''}>Tidak Tertarik</option>
        <option value="jangan_hubungi" ${status === 'jangan_hubungi' ? 'selected' : ''}>Jangan Hubungi</option>
      </select>

      <select name="channel" class="form-control" style="flex: 1;">
        <option value="all">Semua Saluran</option>
        <option value="WhatsApp" ${channel === 'WhatsApp' ? 'selected' : ''}>WhatsApp</option>
        <option value="Instagram" ${channel === 'Instagram' ? 'selected' : ''}>Instagram</option>
        <option value="Telepon" ${channel === 'Telepon' ? 'selected' : ''}>Telepon</option>
        <option value="Kunjungan Langsung" ${channel === 'Kunjungan Langsung' ? 'selected' : ''}>Kunjungan Langsung</option>
      </select>

      <button type="submit" class="btn btn-secondary">Filter</button>
      <a href="/leads" class="btn btn-outline">Reset</a>
    </form>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Nama Bisnis</th>
            <th>Kategori</th>
            <th>Skor</th>
            <th>Channel</th>
            <th>Status</th>
            <th>Status Website</th>
            <th>Nilai Proyek</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">Tidak ada lead yang cocok dengan filter pencarian.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  res.send(renderLayout('Semua Leads', content, 'leads'));
});

// 3. Detail & Riwayat Lead (GET /lead/:id)
app.get('/lead/:id', (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const lead = db.getLeadById(leadId);
  if (!lead) {
    res.status(404).send('Lead tidak ditemukan');
    return;
  }

  const events = db.getLeadEvents(lead.id);

  let eventsHtml = '';
  if (events.length === 0) {
    eventsHtml = '<p style="color: var(--text-muted);">Belum ada riwayat tercatat.</p>';
  } else {
    events.forEach((ev) => {
      const dateStr = new Date(ev.createdAt).toLocaleString('id-ID');
      eventsHtml += `
        <div style="border-left: 2px solid var(--primary); padding-left: 14px; margin-bottom: 16px; position: relative;">
          <div style="font-size: 11px; color: var(--text-muted);">${dateStr}</div>
          <div style="font-weight: 600; color: #fff;">${escapeHtml(ev.action)}</div>
          ${ev.note ? `<div style="font-size: 13px; color: #cbd5e1; margin-top: 4px; background: #0f172a; padding: 8px; border-radius: 6px;">${escapeHtml(ev.note)}</div>` : ''}
        </div>
      `;
    });
  }

  const content = `
    <div style="margin-bottom: 16px;">
      <a href="/leads" style="color: var(--primary); text-decoration: none; font-size: 13px;">&larr; Kembali ke Daftar Semua Leads</a>
    </div>

    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
      <div>
        <div class="card">
          <div class="card-header">
            <div>
              <h2 style="margin: 0 0 6px 0; font-size: 24px; color: #fff;">${escapeHtml(lead.name)}</h2>
              <div style="color: var(--text-muted); font-size: 14px;">${escapeHtml(lead.category)} &bull; ${escapeHtml(lead.address || '-')}</div>
            </div>
            <div class="score-pill" style="font-size: 16px; padding: 6px 14px;">${lead.score}/100</div>
          </div>

          <div class="tags">
            <span class="tag tag-channel">${escapeHtml(lead.primaryChannel)}</span>
            <span class="tag tag-web-none">${escapeHtml(lead.websiteVerificationStatus)}</span>
            <span class="btn-status active">${escapeHtml(lead.status)}</span>
          </div>

          <div style="margin-top: 12px;">
            <h4 style="margin: 0 0 8px 0; color: var(--primary); font-size: 14px;">🎯 Skor & Alasan Penilaian:</h4>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #cbd5e1;">
              ${lead.scoreReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </div>

          <div style="margin-top: 16px;">
            <h4 style="margin: 0 0 8px 0; color: var(--primary); font-size: 14px;">💬 Konsep Pesan Outreach 3 Tahap:</h4>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div class="message-box">
                <div class="message-header"><span>Pesan 1</span></div>
                <div style="font-size: 13px;">${escapeHtml(lead.messages?.step1 || '-')}</div>
              </div>
              <div class="message-box">
                <div class="message-header"><span>Follow-up 1 (H+3)</span></div>
                <div style="font-size: 13px;">${escapeHtml(lead.messages?.step2_followup1 || '-')}</div>
              </div>
              <div class="message-box">
                <div class="message-header"><span>Follow-up 2 (H+7)</span></div>
                <div style="font-size: 13px;">${escapeHtml(lead.messages?.step3_followup2 || '-')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <h3 style="margin-top: 0; font-size: 16px; color: #fff;">🕒 Riwayat & Catatan Interaksi</h3>
          <div style="margin-top: 16px;">
            ${eventsHtml}
          </div>

          <form method="POST" action="/lead/${lead.id}/notes" style="margin-top: 20px;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; color: var(--primary);">Tambah Catatan Baru:</h4>
            <textarea name="notes" class="form-control" style="width: 100%; min-height: 80px;" placeholder="Tuliskan catatan negosiasi, hasil chat, dsb..."></textarea>
            <button type="submit" class="btn btn-secondary" style="width: 100%; margin-top: 8px;">Simpan Catatan</button>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderLayout(`Detail Lead: ${lead.name}`, content, 'leads'));
});

// 4. Action: Update Status (POST /lead/:id/status)
app.post('/lead/:id/status', (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const { status, note, snoozeDate } = req.body;
  db.updateLeadStatus(leadId, status as LeadPipelineStatus, note, snoozeDate);
  const referer = req.headers.referer || '/';
  res.redirect(referer);
});

// 5. Action: Simpan Catatan (POST /lead/:id/notes)
app.post('/lead/:id/notes', (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const { notes } = req.body;
  db.updateLeadNotes(leadId, notes || '');
  const referer = req.headers.referer || '/';
  res.redirect(referer);
});

// 6. Action: Set Estimasi Nilai Proyek (POST /lead/:id/value)
app.post('/lead/:id/value', (req: Request, res: Response) => {
  const leadId = String(req.params.id);
  const { estimatedValue } = req.body;
  db.updateLeadEstimatedValue(leadId, parseInt(estimatedValue || '0', 10));
  const referer = req.headers.referer || '/';
  res.redirect(referer);
});

// Export runner
export function startDashboardServer(): http.Server {
  const server = app.listen(PORT, HOST, () => {
    console.log(`================================================================`);
    console.log(`🌐 Local Lead Gen Dashboard aktif berjalan!`);
    console.log(`   URL: http://${HOST}:${PORT}`);
    console.log(`   Host Binding: ${HOST} (Default lokal laptop)`);
    if (DASHBOARD_PIN) {
      console.log(`   🔒 Proteksi PIN Aktif`);
    }
    console.log(`================================================================\n`);
  });
  return server;
}

if (require.main === module) {
  startDashboardServer();
}
