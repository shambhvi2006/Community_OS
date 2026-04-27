import { Timestamp, VulnerabilityFlag, GeoLocation } from './common';

export interface UrgencyScoreBreakdown {
  severity: number;
  affected_count: number;
  vulnerability_flags: VulnerabilityFlag[];
  vulnerability_multiplier: number; // capped at 2.0
  hours_since_reported: number;
  urgency_score: number;
  computed_at: string; // ISO 8601 timestamp
}

export interface Need {
  id: string;
  source: 'whatsapp' | 'voice' | 'web' | 'debrief';
  location: GeoLocation;
  need_type: string;
  severity: number; // 1-10
  affected_count: number;
  vulnerability_flags: VulnerabilityFlag[];
  urgency_score: number;
  urgency_breakdown: UrgencyScoreBreakdown;
  status: 'new' | 'triaged' | 'assigned' | 'in_progress' | 'completed' | 'verified' | 'archived';
  assigned_volunteer_id?: string;
  ngo_id: string;
  consent_token: string;
  duplicate_of?: string;
  recurrence_group_id?: string;
  debrief_source_need_id?: string;
  embedding?: number[];
  raw_input: string;
  language: 'en' | 'hi' | 'pa';
  reporter_phone?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  audit_trail_id: string;
}
