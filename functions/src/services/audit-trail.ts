import { db } from '../config/firebase';
import { AuditEntry } from '../types/audit';
import * as admin from 'firebase-admin';

type AppendInput = Omit<AuditEntry, 'id' | 'timestamp'>;

function validateEntry(entry: AppendInput): void {
  if (!entry.actor_id || typeof entry.actor_id !== 'string') {
    throw new Error('actor_id is required and must be a non-empty string');
  }
  if (!entry.actor_role || typeof entry.actor_role !== 'string') {
    throw new Error('actor_role is required and must be a non-empty string');
  }
  if (!entry.action_type || typeof entry.action_type !== 'string') {
    throw new Error('action_type is required and must be a non-empty string');
  }
  if (!entry.source || typeof entry.source !== 'string') {
    throw new Error('source is required and must be a non-empty string');
  }
  if (!('previous_value' in entry)) {
    throw new Error('previous_value is required');
  }
  if (!('new_value' in entry)) {
    throw new Error('new_value is required');
  }
}

export const auditTrailService = {
  async append(need_id: string, entry: AppendInput): Promise<AuditEntry> {
    if (!need_id || typeof need_id !== 'string') {
      throw new Error('need_id is required and must be a non-empty string');
    }

    validateEntry(entry);

    const colRef = db.collection(`needs/${need_id}/audit_entries`);
    const docRef = colRef.doc();

    const auditEntry: AuditEntry = {
      id: docRef.id,
      timestamp: admin.firestore.Timestamp.now() as unknown as AuditEntry['timestamp'],
      actor_id: entry.actor_id,
      actor_role: entry.actor_role,
      action_type: entry.action_type,
      previous_value: entry.previous_value,
      new_value: entry.new_value,
      source: entry.source,
    };

    await docRef.set(auditEntry);
    return auditEntry;
  },

  async getTrail(need_id: string): Promise<AuditEntry[]> {
    if (!need_id || typeof need_id !== 'string') {
      throw new Error('need_id is required and must be a non-empty string');
    }

    const snapshot = await db
      .collection(`needs/${need_id}/audit_entries`)
      .orderBy('timestamp', 'asc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as AuditEntry);
  },
};
