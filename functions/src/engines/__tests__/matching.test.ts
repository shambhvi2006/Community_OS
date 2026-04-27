import {
  computeSkillMatch,
  computeDistance,
  computeAvailability,
  computeMatchScore,
  findMatches,
} from '../matching';
import { Need } from '../../types/need';
import { Volunteer } from '../../types/volunteer';
import { GeoLocation } from '../../types/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = new Date();
const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const currentDay = days[now.getDay()];
const currentHour = now.getHours();
const pad = (n: number) => String(n).padStart(2, '0');

function makeVolunteer(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    id: 'v1',
    name: 'Test Volunteer',
    phone: '+910000000000',
    location: { lat: 12.97, lng: 77.59, description: 'Bangalore' },
    skills: ['first_aid', 'driving'],
    availability: {
      windows: [
        { day: currentDay, start: `${pad(currentHour)}:00`, end: `${pad(currentHour)}:59` },
      ],
    },
    ngo_id: 'ngo1',
    reliability_score: 80,
    burnout_factor: 1.0,
    status: 'available',
    task_history: {
      total_completed: 10,
      total_declined: 1,
      total_escalated: 0,
      avg_response_time_minutes: 5,
      avg_feedback_rating: 4.5,
    },
    created_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    updated_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    ...overrides,
  };
}

function makeNeed(overrides: Partial<Need> = {}): Need {
  return {
    id: 'n1',
    source: 'whatsapp',
    location: { lat: 12.97, lng: 77.59, description: 'Bangalore' },
    need_type: 'food_shortage',
    severity: 5,
    affected_count: 3,
    vulnerability_flags: [],
    urgency_score: 10,
    urgency_breakdown: {} as any,
    status: 'new',
    ngo_id: 'ngo1',
    consent_token: 'tok',
    raw_input: 'need food',
    language: 'en',
    created_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    updated_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    audit_trail_id: 'at1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeSkillMatch
// ---------------------------------------------------------------------------

describe('computeSkillMatch', () => {
  it('returns 1.0 when needSkills is empty', () => {
    expect(computeSkillMatch([], ['a', 'b'])).toBe(1.0);
  });

  it('returns 1.0 when all needed skills are present', () => {
    expect(computeSkillMatch(['a', 'b'], ['a', 'b', 'c'])).toBe(1.0);
  });

  it('returns 0.0 when no skills overlap', () => {
    expect(computeSkillMatch(['x', 'y'], ['a', 'b'])).toBe(0.0);
  });

  it('returns correct ratio for partial overlap', () => {
    expect(computeSkillMatch(['a', 'b', 'c'], ['a', 'c'])).toBeCloseTo(2 / 3);
  });

  it('returns 0.0 when volunteer has no skills', () => {
    expect(computeSkillMatch(['a'], [])).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// computeDistance
// ---------------------------------------------------------------------------

describe('computeDistance', () => {
  it('returns 0 for identical locations', () => {
    const loc: GeoLocation = { lat: 12.97, lng: 77.59, description: 'A' };
    expect(computeDistance(loc, loc)).toBe(0);
  });

  it('returns a positive distance for different locations', () => {
    const a: GeoLocation = { lat: 12.97, lng: 77.59, description: 'Bangalore' };
    const b: GeoLocation = { lat: 13.08, lng: 80.27, description: 'Chennai' };
    const dist = computeDistance(a, b);
    expect(dist).toBeGreaterThan(0);
    // Bangalore to Chennai is roughly 290 km
    expect(dist).toBeGreaterThan(250);
    expect(dist).toBeLessThan(350);
  });

  it('is symmetric', () => {
    const a: GeoLocation = { lat: 28.61, lng: 77.21, description: 'Delhi' };
    const b: GeoLocation = { lat: 19.07, lng: 72.87, description: 'Mumbai' };
    expect(computeDistance(a, b)).toBeCloseTo(computeDistance(b, a));
  });
});

// ---------------------------------------------------------------------------
// computeAvailability
// ---------------------------------------------------------------------------

describe('computeAvailability', () => {
  it('returns 1.0 when current time is within a window', () => {
    const vol = makeVolunteer({
      availability: {
        windows: [
          { day: currentDay, start: `${pad(currentHour)}:00`, end: `${pad(currentHour)}:59` },
        ],
      },
    });
    expect(computeAvailability(vol)).toBe(1.0);
  });

  it('returns 0.5 when window starts within next 4 hours', () => {
    // Window starts 2 hours from now
    const futureHour = (currentHour + 2) % 24;
    // Only valid if futureHour > currentHour (same day, no wrap)
    if (futureHour > currentHour) {
      const vol = makeVolunteer({
        availability: {
          windows: [
            { day: currentDay, start: `${pad(futureHour)}:00`, end: `${pad(futureHour)}:59` },
          ],
        },
      });
      expect(computeAvailability(vol)).toBe(0.5);
    }
  });

  it('returns 0.0 when no windows match current day', () => {
    const otherDay = days[(now.getDay() + 3) % 7]; // 3 days from now
    const vol = makeVolunteer({
      availability: {
        windows: [{ day: otherDay, start: '09:00', end: '17:00' }],
      },
    });
    expect(computeAvailability(vol)).toBe(0.0);
  });

  it('returns 0.0 when windows array is empty', () => {
    const vol = makeVolunteer({ availability: { windows: [] } });
    expect(computeAvailability(vol)).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// computeMatchScore
// ---------------------------------------------------------------------------

describe('computeMatchScore', () => {
  it('returns a valid MatchScoreBreakdown for an eligible volunteer', () => {
    const need = makeNeed();
    const vol = makeVolunteer();
    const result = computeMatchScore(need, vol, []);

    expect(result).not.toBeNull();
    expect(result!.volunteer_id).toBe('v1');
    expect(result!.match_score).toBeGreaterThan(0);
  });

  it('returns null for a busy volunteer', () => {
    const need = makeNeed();
    const vol = makeVolunteer({ status: 'busy' });
    expect(computeMatchScore(need, vol, [])).toBeNull();
  });

  it('returns null when burnout_factor > 5.0', () => {
    const need = makeNeed();
    const vol = makeVolunteer({ burnout_factor: 5.1 });
    expect(computeMatchScore(need, vol, [])).toBeNull();
  });

  it('returns null when volunteer is in declinedVolunteerIds', () => {
    const need = makeNeed();
    const vol = makeVolunteer({ id: 'declined-vol' });
    expect(computeMatchScore(need, vol, ['declined-vol'])).toBeNull();
  });

  it('does not exclude volunteer with burnout_factor exactly 5.0', () => {
    const need = makeNeed();
    const vol = makeVolunteer({ burnout_factor: 5.0 });
    expect(computeMatchScore(need, vol, [])).not.toBeNull();
  });

  it('applies reliability multiplier for severity > 7', () => {
    const need = makeNeed({ severity: 8 });
    const vol = makeVolunteer({ reliability_score: 50 });
    const result = computeMatchScore(need, vol, []);

    // Compute expected: same location → distance 0 → 1/(0+1)=1
    // skill_match = 1.0 (empty needSkills), availability = 1.0, burnout = 1.0
    // base = 1.0 * 1.0 * 1.0 * 1.0 = 1.0
    // with reliability: 1.0 * (50/100) = 0.5
    expect(result).not.toBeNull();
    expect(result!.match_score).toBeCloseTo(0.5);
  });

  it('does not apply reliability multiplier for severity <= 7', () => {
    const need = makeNeed({ severity: 7 });
    const vol = makeVolunteer({ reliability_score: 50 });
    const result = computeMatchScore(need, vol, []);

    // base = 1.0 * 1.0 * 1.0 * 1.0 = 1.0 (no reliability multiplier)
    expect(result).not.toBeNull();
    expect(result!.match_score).toBeCloseTo(1.0);
  });

  it('computes correct formula with distance and burnout', () => {
    const need = makeNeed({
      location: { lat: 12.97, lng: 77.59, description: 'A' },
      severity: 5,
    });
    const vol = makeVolunteer({
      location: { lat: 12.97, lng: 77.59, description: 'A' }, // same location
      burnout_factor: 2.0,
    });
    const result = computeMatchScore(need, vol, []);

    // skill_match = 1.0, distance = 0 → 1/(0+1)=1, availability = 1.0, burnout = 2.0
    // score = 1.0 * 1.0 * 1.0 * (1/2.0) = 0.5
    expect(result).not.toBeNull();
    expect(result!.match_score).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// findMatches
// ---------------------------------------------------------------------------

describe('findMatches', () => {
  it('returns top 3 volunteers sorted by match_score descending', () => {
    const need = makeNeed();
    const volunteers = [
      makeVolunteer({ id: 'v1', burnout_factor: 3.0 }),
      makeVolunteer({ id: 'v2', burnout_factor: 1.0 }),
      makeVolunteer({ id: 'v3', burnout_factor: 2.0 }),
      makeVolunteer({ id: 'v4', burnout_factor: 1.5 }),
    ];

    const { matches } = findMatches(need, volunteers, []);

    expect(matches.length).toBeLessThanOrEqual(3);
    // Verify descending order
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].match_score).toBeGreaterThanOrEqual(matches[i].match_score);
    }
    // v2 (burnout 1.0) should be first
    expect(matches[0].volunteer_id).toBe('v2');
  });

  it('excludes busy volunteers', () => {
    const need = makeNeed();
    const volunteers = [
      makeVolunteer({ id: 'v1', status: 'busy' }),
      makeVolunteer({ id: 'v2', status: 'available' }),
    ];

    const { matches } = findMatches(need, volunteers, []);
    const ids = matches.map((m) => m.volunteer_id);
    expect(ids).not.toContain('v1');
  });

  it('excludes volunteers with burnout_factor > 5.0', () => {
    const need = makeNeed();
    const volunteers = [
      makeVolunteer({ id: 'v1', burnout_factor: 6.0 }),
      makeVolunteer({ id: 'v2', burnout_factor: 1.0 }),
    ];

    const { matches } = findMatches(need, volunteers, []);
    const ids = matches.map((m) => m.volunteer_id);
    expect(ids).not.toContain('v1');
  });

  it('excludes declined volunteers', () => {
    const need = makeNeed();
    const volunteers = [
      makeVolunteer({ id: 'v1' }),
      makeVolunteer({ id: 'v2' }),
    ];

    const { matches } = findMatches(need, volunteers, ['v1']);
    const ids = matches.map((m) => m.volunteer_id);
    expect(ids).not.toContain('v1');
    expect(ids).toContain('v2');
  });

  it('filters out volunteers with score <= 0.1', () => {
    const need = makeNeed();
    // Volunteer with 0.0 availability → score = 0
    const otherDay = days[(now.getDay() + 3) % 7];
    const volunteers = [
      makeVolunteer({
        id: 'v1',
        availability: { windows: [{ day: otherDay, start: '09:00', end: '17:00' }] },
      }),
    ];

    const { matches } = findMatches(need, volunteers, []);
    expect(matches.length).toBe(0);
  });

  it('sets overflow_flagged = true when fewer than 3 qualify', () => {
    const need = makeNeed();
    const volunteers = [
      makeVolunteer({ id: 'v1' }),
      makeVolunteer({ id: 'v2' }),
    ];

    const { overflow_flagged } = findMatches(need, volunteers, []);
    expect(overflow_flagged).toBe(true);
  });

  it('sets overflow_flagged = false when 3 or more qualify', () => {
    const need = makeNeed();
    const volunteers = [
      makeVolunteer({ id: 'v1', burnout_factor: 1.0 }),
      makeVolunteer({ id: 'v2', burnout_factor: 1.5 }),
      makeVolunteer({ id: 'v3', burnout_factor: 2.0 }),
      makeVolunteer({ id: 'v4', burnout_factor: 2.5 }),
    ];

    const { matches, overflow_flagged } = findMatches(need, volunteers, []);
    expect(matches.length).toBe(3);
    expect(overflow_flagged).toBe(false);
  });

  it('returns empty matches for empty volunteer list', () => {
    const need = makeNeed();
    const { matches, overflow_flagged } = findMatches(need, [], []);
    expect(matches).toEqual([]);
    expect(overflow_flagged).toBe(true);
  });
});
