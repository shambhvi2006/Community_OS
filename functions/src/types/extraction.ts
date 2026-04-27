import { VulnerabilityFlag } from './common';

export interface ExtractionResult {
  need_type: string;
  location: { lat: number; lng: number; description: string };
  severity: number; // 1-10
  affected_count: number;
  vulnerability_flags: VulnerabilityFlag[];
  confidence: Record<string, number>; // per-field confidence 0.0-1.0
  language: 'en' | 'hi' | 'pa';
  raw_input: string;
}
