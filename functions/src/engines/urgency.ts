import { VulnerabilityFlag } from '../types/common';
import { Need, UrgencyScoreBreakdown } from '../types/need';

/**
 * Weights for each vulnerability flag used in the urgency multiplier.
 */
const VULNERABILITY_WEIGHTS: Record<VulnerabilityFlag, number> = {
  children: 0.4,
  elderly: 0.3,
  pregnant: 0.4,
  disabled: 0.2,
  medical_emergency: 0.6,
};

const MAX_VULNERABILITY_MULTIPLIER = 2.0;
const MIN_HOURS_SINCE_REPORTED = 0.01;
const DEFAULT_SEVERITY = 3;
const DEFAULT_AFFECTED_COUNT = 1;

/**
 * Compute the vulnerability multiplier from a list of flags.
 * Starts at 1.0, adds each flag's weight, caps at 2.0.
 */
export function computeVulnerabilityMultiplier(flags: VulnerabilityFlag[]): number {
  let sum = 1.0;
  for (const flag of flags) {
    const weight = VULNERABILITY_WEIGHTS[flag];
    if (weight !== undefined) {
      sum += weight;
    }
  }
  return Math.min(sum, MAX_VULNERABILITY_MULTIPLIER);
}

/**
 * Compute the full urgency score breakdown for a (partial) Need.
 *
 * Formula: urgency_score = (severity × affected_count × vulnerability_multiplier) / hours_since_reported
 */
export function computeScore(need: Partial<Need>): UrgencyScoreBreakdown {
  const severity = need.severity ?? DEFAULT_SEVERITY;
  const affected_count = need.affected_count ?? DEFAULT_AFFECTED_COUNT;
  const vulnerability_flags = need.vulnerability_flags ?? [];

  const vulnerability_multiplier = computeVulnerabilityMultiplier(vulnerability_flags);

  const createdAtMs = need.created_at
    ? need.created_at.seconds * 1000 + need.created_at.nanoseconds / 1e6
    : Date.now();

  const hours_since_reported = Math.max(
    (Date.now() - createdAtMs) / (1000 * 60 * 60),
    MIN_HOURS_SINCE_REPORTED,
  );

  const urgency_score =
    (severity * affected_count * vulnerability_multiplier) / hours_since_reported;

  return {
    severity,
    affected_count,
    vulnerability_flags,
    vulnerability_multiplier,
    hours_since_reported,
    urgency_score,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Serialize an UrgencyScoreBreakdown to a JSON string.
 */
export function serializeBreakdown(breakdown: UrgencyScoreBreakdown): string {
  return JSON.stringify(breakdown);
}

/**
 * Parse a JSON string back into an UrgencyScoreBreakdown.
 */
export function parseBreakdown(json: string): UrgencyScoreBreakdown {
  return JSON.parse(json) as UrgencyScoreBreakdown;
}

/**
 * Format a breakdown as a human-readable string.
 * Example: "Urgency: 72.5 | Severity: 4 × Affected: 10 × Vuln: 1.7 / Hours: 0.94"
 */
export function formatBreakdown(breakdown: UrgencyScoreBreakdown): string {
  return (
    `Urgency: ${Number(breakdown.urgency_score.toFixed(2))}` +
    ` | Severity: ${breakdown.severity}` +
    ` × Affected: ${breakdown.affected_count}` +
    ` × Vuln: ${Number(breakdown.vulnerability_multiplier.toFixed(2))}` +
    ` / Hours: ${Number(breakdown.hours_since_reported.toFixed(2))}`
  );
}

export const urgencyEngine = {
  computeScore,
  computeVulnerabilityMultiplier,
  serializeBreakdown,
  parseBreakdown,
  formatBreakdown,
};
