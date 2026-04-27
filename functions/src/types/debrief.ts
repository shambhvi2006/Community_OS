import { Timestamp } from './common';

export interface DebriefSession {
  id: string;
  need_id: string;
  volunteer_id: string;
  ngo_id: string;
  status: 'active' | 'completed' | 'no_new_needs';
  questions_asked: number; // max 3
  new_need_ids: string[];
}

export interface Debrief {
  id: string;
  need_id: string;
  volunteer_id: string;
  ngo_id: string;
  status: 'active' | 'completed' | 'no_new_needs';
  questions_asked: number;
  new_need_ids: string[];
  messages: { role: 'system' | 'volunteer'; content: string; timestamp: Timestamp }[];
  created_at: Timestamp;
  completed_at?: Timestamp;
}
