import * as fs from 'fs';
import * as path from 'path';

export function backupDatabase(): string {
  const dbPath = path.join(process.cwd(), 'data', 'leads.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`File database tidak ditemukan di ${dbPath}`);
  }

  const backupDir = path.join(process.cwd(), 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  const backupFileName = `leads_backup_${timestamp}.db`;
  const backupPath = path.join(backupDir, backupFileName);

  fs.copyFileSync(dbPath, backupPath);
  console.log(`✅ Backup database berhasil dibuat: ${backupPath}`);
  return backupPath;
}

if (require.main === module) {
  try {
    backupDatabase();
  } catch (err: any) {
    console.error('❌ Gagal membuat backup database:', err.message);
    process.exit(1);
  }
}

