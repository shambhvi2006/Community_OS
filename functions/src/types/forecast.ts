import { Timestamp } from './common';

export interface EarlyWarning {
  need_type: string;
  area: string;
  predicted_date: string;
  predicted_count: number;
  percentile_90_threshold: number;
  message: string;
}

export interface ForecastResult {
  need_type: string;
  area: string;
  predictions: { date: string; predicted_count: number; lower_bound: number; upper_bound: number }[];
  confidence: 'high' | 'reduced';
  early_warnings: EarlyWarning[];
}

export interface Forecast {
  id: string;
  ngo_id: string;
  need_type: string;
  area: string;
  predictions: { date: string; predicted_count: number; lower_bound: number; upper_bound: number }[];
  confidence: 'high' | 'reduced';
  early_warnings: EarlyWarning[];
  trained_at: Timestamp;
  created_at: Timestamp;
}
