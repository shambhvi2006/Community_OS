// Frontend type definitions mirroring backend types
// Firestore Timestamps are serialized as { seconds: number, nanoseconds: number } on the client

export type VulnerabilityFlag = 'children' | 'elderly' | 'pregnant' | 'disabled' | 'medical_emergency';

export interface GeoLocation {
  lat: number;
  lng: number;
  description: string;
}

export interface UrgencyScoreBreakdown {
  severity: number;
  affected_count: number;
  vulnerability_flags: VulnerabilityFlag[];
  vulnerability_multiplier: number;
  hours_since_reported: number;
  urgency_score: number;
  computed_at: string;
}

export interface Need {
  id: string;
  source: 'whatsapp' | 'voice' | 'web' | 'debrief';
  location: GeoLocation;
  need_type: string;
  severity: number;
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
  raw_input: string;
  language: 'en' | 'hi' | 'pa';
  reporter_phone?: string;
  created_at: unknown;
  updated_at: unknown;
  audit_trail_id: string;
}

export interface MatchScoreBreakdown {
  volunteer_id: string;
  skill_match: number;
  distance_km: number;
  availability_score: number;
  burnout_factor: number;
  reliability_score: number;
  match_score: number;
}

export interface Dispatch {
  id: string;
  need_id: string;
  volunteer_id: string;
  ngo_id: string;
  status: 'pending' | 'sent' | 'accepted' | 'declined' | 'escalated' | 'completed';
  match_score_breakdown: MatchScoreBreakdown;
  sent_at?: unknown;
  responded_at?: unknown;
  completed_at?: unknown;
  escalation_count: number;
  created_at: unknown;
}

export interface InventoryItem {
  id: string;
  resource_type: string;
  quantity: number;
  location: GeoLocation;
  ngo_id: string;
  expiry_date?: unknown;
  status: 'available' | 'depleted' | 'expired';
  created_at: unknown;
  updated_at: unknown;
}

export interface AuditEntry {
  id: string;
  timestamp: unknown;
  actor_id: string;
  actor_role: 'super_admin' | 'ngo_admin' | 'coordinator' | 'volunteer' | 'system';
  action_type: string;
  previous_value: unknown;
  new_value: unknown;
  source: 'web' | 'whatsapp' | 'system';
}

export interface Volunteer {
  id: string;
  name: string;
  phone: string;
  location: GeoLocation;
  skills: string[];
  ngo_id: string;
  reliability_score: number;
  burnout_factor: number;
  status: 'available' | 'busy' | 'under_review';
}

export interface SystemAlert {
  id: string;
  ngo_id: string;
  type: 'early_warning' | 'inventory_low' | 'dispatch_delay' | 'service_degraded';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  created_at: unknown;
}
