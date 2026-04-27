import { Timestamp } from './common';
import { MatchScoreBreakdown } from './volunteer';

export type VolunteerCommand = 'YES' | 'NO' | 'DONE' | 'HELP' | 'AVAILABLE' | 'BUSY';

export interface Dispatch {
  id: string;
  need_id: string;
  volunteer_id: string;
  ngo_id: string;
  status: 'pending' | 'sent' | 'accepted' | 'declined' | 'escalated' | 'completed';
  match_score_breakdown: MatchScoreBreakdown;
  sent_at?: Timestamp;
  responded_at?: Timestamp;
  completed_at?: Timestamp;
  escalation_count: number;
  escalation_timeout_task_id?: string;
  beneficiary_feedback?: 'yes' | 'no' | 'no_response';
  created_at: Timestamp;
}
