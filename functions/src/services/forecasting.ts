/**
 * Forecasting Engine — stub implementation.
 * Real Prophet integration is a future enhancement.
 */

export interface ForecastPrediction {
  date: string;
  predicted_count: number;
  lower_bound: number;
  upper_bound: number;
}

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
  predictions: ForecastPrediction[];
  confidence: 'high' | 'reduced';
  early_warnings: EarlyWarning[];
}

/**
 * Generate a 7-day mock forecast for an NGO.
 * Returns stub data — Prophet integration is planned for a future iteration.
 */
export function generateForecast(ngoId: string): ForecastResult {
  const predictions: ForecastPrediction[] = [];
  const now = new Date();

  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const base = 10 + Math.floor(Math.random() * 15);
    predictions.push({
      date: d.toISOString().slice(0, 10),
      predicted_count: base,
      lower_bound: Math.max(0, base - 5),
      upper_bound: base + 8,
    });
  }

  // Generate an early warning if any prediction exceeds a mock threshold
  const threshold = 20;
  const early_warnings: EarlyWarning[] = predictions
    .filter((p) => p.predicted_count > threshold)
    .map((p) => ({
      need_type: 'food_shortage',
      area: 'default-area',
      predicted_date: p.date,
      predicted_count: p.predicted_count,
      percentile_90_threshold: threshold,
      message: `Predicted ${p.predicted_count} food_shortage needs on ${p.date} for NGO ${ngoId} exceeds 90th percentile (${threshold})`,
    }));

  return {
    need_type: 'food_shortage',
    area: 'default-area',
    predictions,
    confidence: predictions.length >= 7 ? 'high' : 'reduced',
    early_warnings,
  };
}
