import {
  computeScore,
  computeVulnerabilityMultiplier,
  serializeBreakdown,
  parseBreakdown,
  formatBreakdown,
} from '../urgency';
import { VulnerabilityFlag } from '../../types/common';
import { Need, UrgencyScoreBreakdown } from '../../types/need';

describe('computeVulnerabilityMultiplier', () => {
  it('returns 1.0 for empty flags', () => {
    expect(computeVulnerabilityMultiplier([])).toBe(1.0);
  });

  it('adds 0.4 for children', () => {
    expect(computeVulnerabilityMultiplier(['children'])).toBeCloseTo(1.4);
  });

  it('adds 0.3 for elderly', () => {
    expect(computeVulnerabilityMultiplier(['elderly'])).toBeCloseTo(1.3);
  });

  it('adds 0.6 for medical_emergency', () => {
    expect(computeVulnerabilityMultiplier(['medical_emergency'])).toBeCloseTo(1.6);
  });

  it('sums multiple flags correctly', () => {
    // 1.0 + 0.4 (children) + 0.3 (elderly) = 1.7
    expect(computeVulnerabilityMultiplier(['children', 'elderly'])).toBeCloseTo(1.7);
  });

  it('caps at 2.0 when flags exceed the limit', () => {
    // 1.0 + 0.4 + 0.3 + 0.4 + 0.2 + 0.6 = 2.9 → capped at 2.0
    const allFlags: VulnerabilityFlag[] = [
      'children', 'elderly', 'pregnant', 'disabled', 'medical_emergency',
    ];
    expect(computeVulnerabilityMultiplier(allFlags)).toBe(2.0);
  });

  it('caps at 2.0 with three heavy flags', () => {
    // 1.0 + 0.4 + 0.4 + 0.6 = 2.4 → capped at 2.0
    expect(
      computeVulnerabilityMultiplier(['children', 'pregnant', 'medical_emergency']),
    ).toBe(2.0);
  });
});

describe('computeScore', () => {
  it('computes basic formula correctly', () => {
    const now = Date.now();
    const oneHourAgo = { seconds: Math.floor((now - 3600000) / 1000), nanoseconds: 0 };

    const result = computeScore({
      severity: 5,
      affected_count: 10,
      vulnerability_flags: [],
      created_at: oneHourAgo,
    } as Partial<Need>);

    // (5 × 10 × 1.0) / ~1.0 ≈ 50
    expect(result.severity).toBe(5);
    expect(result.affected_count).toBe(10);
    expect(result.vulnerability_multiplier).toBe(1.0);
    expect(result.hours_since_reported).toBeCloseTo(1.0, 1);
    expect(result.urgency_score).toBeCloseTo(50, 0);
  });

  it('applies vulnerability multiplier to the formula', () => {
    const now = Date.now();
    const twoHoursAgo = { seconds: Math.floor((now - 7200000) / 1000), nanoseconds: 0 };

    const result = computeScore({
      severity: 4,
      affected_count: 10,
      vulnerability_flags: ['children', 'elderly'],
      created_at: twoHoursAgo,
    } as Partial<Need>);

    // multiplier = 1.0 + 0.4 + 0.3 = 1.7
    // (4 × 10 × 1.7) / ~2.0 = 34
    expect(result.vulnerability_multiplier).toBeCloseTo(1.7);
    expect(result.hours_since_reported).toBeCloseTo(2.0, 1);
    expect(result.urgency_score).toBeCloseTo(34, 0);
  });

  it('defaults severity to 3 when missing', () => {
    const now = Date.now();
    const result = computeScore({
      affected_count: 2,
      vulnerability_flags: [],
      created_at: { seconds: Math.floor((now - 3600000) / 1000), nanoseconds: 0 },
    } as Partial<Need>);

    expect(result.severity).toBe(3);
  });

  it('defaults affected_count to 1 when missing', () => {
    const now = Date.now();
    const result = computeScore({
      severity: 5,
      vulnerability_flags: [],
      created_at: { seconds: Math.floor((now - 3600000) / 1000), nanoseconds: 0 },
    } as Partial<Need>);

    expect(result.affected_count).toBe(1);
  });

  it('defaults both severity and affected_count when both missing', () => {
    const result = computeScore({
      vulnerability_flags: [],
      created_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    } as Partial<Need>);

    expect(result.severity).toBe(3);
    expect(result.affected_count).toBe(1);
  });

  it('protects against division by zero with minimum hours', () => {
    // created_at = now → hours_since_reported would be ~0, clamped to 0.01
    const result = computeScore({
      severity: 5,
      affected_count: 1,
      vulnerability_flags: [],
      created_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    } as Partial<Need>);

    expect(result.hours_since_reported).toBeGreaterThanOrEqual(0.01);
    expect(Number.isFinite(result.urgency_score)).toBe(true);
    expect(result.urgency_score).toBeGreaterThan(0);
  });

  it('returns a valid computed_at ISO timestamp', () => {
    const result = computeScore({
      severity: 1,
      affected_count: 1,
      vulnerability_flags: [],
      created_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    } as Partial<Need>);

    expect(() => new Date(result.computed_at)).not.toThrow();
    expect(new Date(result.computed_at).toISOString()).toBe(result.computed_at);
  });

  it('includes vulnerability_flags in the breakdown', () => {
    const flags: VulnerabilityFlag[] = ['children', 'disabled'];
    const result = computeScore({
      severity: 5,
      affected_count: 1,
      vulnerability_flags: flags,
      created_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    } as Partial<Need>);

    expect(result.vulnerability_flags).toEqual(flags);
  });

  it('handles empty partial need (all defaults)', () => {
    const result = computeScore({});

    expect(result.severity).toBe(3);
    expect(result.affected_count).toBe(1);
    expect(result.vulnerability_flags).toEqual([]);
    expect(result.vulnerability_multiplier).toBe(1.0);
    expect(Number.isFinite(result.urgency_score)).toBe(true);
  });
});

describe('serializeBreakdown / parseBreakdown (round-trip)', () => {
  it('round-trips a breakdown through serialize and parse', () => {
    const breakdown: UrgencyScoreBreakdown = {
      severity: 7,
      affected_count: 5,
      vulnerability_flags: ['children', 'elderly'],
      vulnerability_multiplier: 1.7,
      hours_since_reported: 3.5,
      urgency_score: 17.0,
      computed_at: '2024-01-15T10:30:00.000Z',
    };

    const json = serializeBreakdown(breakdown);
    const parsed = parseBreakdown(json);

    expect(parsed).toEqual(breakdown);
  });

  it('produces valid JSON', () => {
    const breakdown: UrgencyScoreBreakdown = {
      severity: 1,
      affected_count: 1,
      vulnerability_flags: [],
      vulnerability_multiplier: 1.0,
      hours_since_reported: 0.01,
      urgency_score: 100,
      computed_at: new Date().toISOString(),
    };

    const json = serializeBreakdown(breakdown);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('double round-trip is stable: serialize(parse(serialize(x))) === serialize(x)', () => {
    const breakdown: UrgencyScoreBreakdown = {
      severity: 10,
      affected_count: 100,
      vulnerability_flags: ['medical_emergency', 'pregnant'],
      vulnerability_multiplier: 2.0,
      hours_since_reported: 0.5,
      urgency_score: 4000,
      computed_at: '2024-06-01T00:00:00.000Z',
    };

    const first = serializeBreakdown(breakdown);
    const second = serializeBreakdown(parseBreakdown(first));
    expect(second).toBe(first);
  });
});

describe('formatBreakdown', () => {
  it('produces a human-readable string with all components', () => {
    const breakdown: UrgencyScoreBreakdown = {
      severity: 4,
      affected_count: 10,
      vulnerability_flags: ['children', 'elderly'],
      vulnerability_multiplier: 1.7,
      hours_since_reported: 0.94,
      urgency_score: 72.34,
      computed_at: '2024-01-15T10:30:00.000Z',
    };

    const formatted = formatBreakdown(breakdown);

    expect(formatted).toContain('Urgency:');
    expect(formatted).toContain('Severity: 4');
    expect(formatted).toContain('Affected: 10');
    expect(formatted).toContain('Vuln: 1.7');
    expect(formatted).toContain('Hours: 0.94');
  });

  it('includes all component values in the output', () => {
    const breakdown: UrgencyScoreBreakdown = {
      severity: 8,
      affected_count: 3,
      vulnerability_flags: [],
      vulnerability_multiplier: 1.0,
      hours_since_reported: 2.5,
      urgency_score: 9.6,
      computed_at: new Date().toISOString(),
    };

    const formatted = formatBreakdown(breakdown);

    // Verify every numeric component appears
    expect(formatted).toContain('9.6');
    expect(formatted).toContain('8');
    expect(formatted).toContain('3');
    expect(formatted).toContain('1');
    expect(formatted).toContain('2.5');
  });

  it('rounds long decimals to 2 places', () => {
    const breakdown: UrgencyScoreBreakdown = {
      severity: 5,
      affected_count: 1,
      vulnerability_flags: ['children'],
      vulnerability_multiplier: 1.4,
      hours_since_reported: 0.333333,
      urgency_score: 21.000021,
      computed_at: new Date().toISOString(),
    };

    const formatted = formatBreakdown(breakdown);
    expect(formatted).toContain('Hours: 0.33');
    expect(formatted).toContain('Urgency: 21');
  });
});
