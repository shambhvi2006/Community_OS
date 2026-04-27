import { Timestamp } from './common';

export interface AuditEntry {
  id: string;
  timestamp: Timestamp;
  actor_id: string;
  actor_role: 'super_admin' | 'ngo_admin' | 'coordinator' | 'volunteer' | 'system';
  action_type: string;
  previous_value: any;
  new_value: any;
  source: 'web' | 'whatsapp' | 'system';
}
