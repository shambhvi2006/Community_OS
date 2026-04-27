import { Timestamp, GeoLocation } from './common';

export interface MatchScoreBreakdown {
  volunteer_id: string;
  skill_match: number; // 0.0-1.0
  distance_km: number;
  availability_score: number; // 0.0, 0.5, or 1.0
  burnout_factor: number;
  reliability_score: number; // 0-100
  match_score: number;
}

export interface Volunteer {
  id: string;
  name: string;
  phone: string;
  location: GeoLocation;
  skills: string[];
  availability: {
    windows: { day: string; start: string; end: string }[];
  };
  ngo_id: string;
  reliability_score: number; // 0-100
  burnout_factor: number; // 1.0 = fresh, higher = more burned out
  status: 'available' | 'busy' | 'under_review';
  task_history: {
    total_completed: number;
    total_declined: number;
    total_escalated: number;
    avg_response_time_minutes: number;
    avg_feedback_rating: number;
  };
  created_at: Timestamp;
  updated_at: Timestamp;
}
