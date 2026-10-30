import { config } from '../config';
import {
  SqliteDatabase,
  SqliteLeadRecord,
  SqliteEventRecord,
  LeadPipelineStatus,
  PipelineMetrics,
} from './sqliteDb';
import { SupabaseDatabase } from './supabaseDb';

export interface IDatabase {
  upsertLead(lead: SqliteLeadRecord): Promise<void> | void;
  getLeadById(id: string): Promise<SqliteLeadRecord | null> | (SqliteLeadRecord | null);
  getAllLeads(filter?: {
    category?: string;
    status?: string;
    channel?: string;
    search?: string;
  }): Promise<SqliteLeadRecord[]> | SqliteLeadRecord[];
  getTodayQueue(limit?: number): Promise<SqliteLeadRecord[]> | SqliteLeadRecord[];
  getPipelineLeads(): Promise<SqliteLeadRecord[]> | SqliteLeadRecord[];
  getTodayContactedCount(): Promise<number> | number;
  getDueFollowUpsCount(): Promise<number> | number;
  getLeadEvents(leadId: string): Promise<SqliteEventRecord[]> | SqliteEventRecord[];
  addEvent(leadId: string, status: string, action: string, note?: string): Promise<void> | void;
  updateLeadStatus(
    leadId: string,
    newStatus: LeadPipelineStatus,
    note?: string,
    snoozeDate?: string
  ): Promise<void> | void;
  updateLeadNotes(leadId: string, notes: string): Promise<void> | void;
  updateLeadEstimatedValue(leadId: string, estimatedValue: number): Promise<void> | void;
  updateLeadMessage(
    leadId: string,
    step: 'step1' | 'step2_followup1' | 'step3_followup2',
    newText: string
  ): Promise<void> | void;
  setManualWebChecked(leadId: string, checked: boolean): Promise<void> | void;
  clearAllLeads(createBackup?: boolean): Promise<{ deletedLeads: number; deletedEvents: number; backupPath?: string }> | { deletedLeads: number; deletedEvents: number; backupPath?: string };
  getPipelineMetrics(): Promise<PipelineMetrics> | PipelineMetrics;
  close?(): void;
}

export function getDatabase(): IDatabase {
  if (config.supabaseUrl && config.supabaseKey) {
    return new SupabaseDatabase(config.supabaseUrl, config.supabaseKey);
  }
  return new SqliteDatabase();
}

export { SqliteDatabase, SupabaseDatabase };
export * from './sqliteDb';
