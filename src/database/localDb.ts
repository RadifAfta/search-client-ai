import * as fs from 'fs';
import * as path from 'path';

export interface ProcessedLeadRecord {
  referenceUrl: string;
  name: string;
  source: string;
  processedAt: string;
}

const dirPath = path.join(__dirname, '../../data');
const filePath = path.join(dirPath, 'processed_leads.json');

/**
 * Initializes the database directory and file if they do not exist
 */
function initDb(): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf-8');
  }
}

// Automatically initialize database
initDb();

/**
 * Reads all processed lead records from the local JSON file
 */
export function readProcessedLeads(): ProcessedLeadRecord[] {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as ProcessedLeadRecord[];
  } catch (err: any) {
    console.error('❌ Failed to read processed leads database:', err.message || err);
    return [];
  }
}

/**
 * Checks if a lead's URL has already been processed in a past run.
 * Safety fallback: Returns false if the URL is empty or "Unknown".
 */
export function isLeadProcessed(referenceUrl: string): boolean {
  if (!referenceUrl || referenceUrl === 'Unknown') {
    return false;
  }

  const leads = readProcessedLeads();
  return leads.some((record) => record.referenceUrl.toLowerCase() === referenceUrl.toLowerCase());
}

/**
 * Saves a new qualified lead to the local JSON file with a timestamp.
 */
export function saveProcessedLead(lead: { name: string; source: string; referenceUrl: string }): void {
  if (!lead.referenceUrl || lead.referenceUrl === 'Unknown') {
    return;
  }

  try {
    const leads = readProcessedLeads();
    
    // Avoid appending duplicate URLs in case of concurrent calls
    if (leads.some((record) => record.referenceUrl.toLowerCase() === lead.referenceUrl.toLowerCase())) {
      return;
    }

    const newRecord: ProcessedLeadRecord = {
      referenceUrl: lead.referenceUrl,
      name: lead.name,
      source: lead.source,
      processedAt: new Date().toISOString(),
    };

    leads.push(newRecord);
    fs.writeFileSync(filePath, JSON.stringify(leads, null, 2), 'utf-8');
    console.log(`      💾 Saved lead to local database: "${lead.name}"`);
  } catch (err: any) {
    console.error(`❌ Failed to save lead "${lead.name}" to database:`, err.message || err);
  }
}
