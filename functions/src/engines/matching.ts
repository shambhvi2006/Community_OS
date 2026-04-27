import { GeoLocation } from '../types/common';
import { Need } from '../types/need';
import { Volunteer, MatchScoreBreakdown } from '../types/volunteer';
import { haversineDistance } from '../utils/haversine';

/**
 * Returns the ratio of intersecting skills to required skills (0.0–1.0).
 * If needSkills is empty, returns 1.0 (any volunteer matches).
 */
export function computeSkillMatch(
  needSkills: string[],
  volunteerSkills: string[],
): number {
  if (needSkills.length === 0) return 1.0;

  const volunteerSet = new Set(volunteerSkills);
  let matches = 0;
  for (const skill of needSkills) {
    if (volunteerSet.has(skill)) {
      matches++;
    }
  }
  return matches / needSkills.length;
}

/**
 * Computes haversine distance in km between two GeoLocations.
 */
export function computeDistance(loc1: GeoLocation, loc2: GeoLocation): number {
  return haversineDistance(loc1.lat, loc1.lng, loc2.lat, loc2.lng);
}

/**
 * Returns availability score for a volunteer based on current time:
 *  - 1.0 if current day/time falls within an availability window
 *  - 0.5 if within the next 4 hours on the same day
 *  - 0.0 otherwise
 */
export function computeAvailability(volunteer: Volunteer): number {
  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = days[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const window of volunteer.availability.windows) {
    if (window.day.toLowerCase() !== currentDay) continue;

    const [startH, startM] = window.start.split(':').map(Number);
    const [endH, endM] = window.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Current time is within the window
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      return 1.0;
    }

    // Window starts within the next 4 hours
    if (startMinutes > currentMinutes && startMinutes - currentMinutes <= 240) {
      return 0.5;
    }
  }

  return 0.0;
}

/**
 * Computes the match score for a single volunteer against a need.
 * Returns null if the volunteer should be excluded.
 *
 * Exclusion rules:
 *  - status === 'busy'
 *  - burnout_factor > 5.0
 *  - volunteer id is in declinedVolunteerIds
 *
 * Formula: match_score = skill_match × (1/(distance_km+1)) × availability_score × (1/burnout_factor)
 * For severity > 7: match_score *= reliability_score / 100
 */
export function computeMatchScore(
  need: Need,
  volunteer: Volunteer,
  declinedVolunteerIds: string[],
): MatchScoreBreakdown | null {
  // Exclusion checks
  if (volunteer.status === 'busy') return null;
  if (volunteer.burnout_factor > 5.0) return null;
  if (declinedVolunteerIds.includes(volunteer.id)) return null;

  // Need doesn't have a skills field; use empty array (any volunteer matches)
  const needSkills: string[] = [];
  const skill_match = computeSkillMatch(needSkills, volunteer.skills);
  const distance_km = computeDistance(need.location, volunteer.location);
  const availability_score = computeAvailability(volunteer);

  let match_score =
    skill_match *
    (1 / (distance_km + 1)) *
    availability_score *
    (1 / volunteer.burnout_factor);

  if (need.severity > 7) {
    match_score *= volunteer.reliability_score / 100;
  }

  return {
    volunteer_id: volunteer.id,
    skill_match,
    distance_km,
    availability_score,
    burnout_factor: volunteer.burnout_factor,
    reliability_score: volunteer.reliability_score,
    match_score,
  };
}

/**
 * Finds the top matching volunteers for a need.
 * Returns top 3 with score > 0.1, sorted descending by match_score.
 * Sets overflow_flagged = true if fewer than 3 qualify.
 */
export function findMatches(
  need: Need,
  volunteers: Volunteer[],
  declinedVolunteerIds: string[],
): { matches: MatchScoreBreakdown[]; overflow_flagged: boolean } {
  const scored: MatchScoreBreakdown[] = [];

  for (const volunteer of volunteers) {
    const result = computeMatchScore(need, volunteer, declinedVolunteerIds);
    if (result !== null) {
      scored.push(result);
    }
  }

  // Sort descending by match_score
  scored.sort((a, b) => b.match_score - a.match_score);

  // Filter to score > 0.1 and take top 3
  const qualifying = scored.filter((s) => s.match_score > 0.1);
  const top3 = qualifying.slice(0, 3);

  return {
    matches: top3,
    overflow_flagged: qualifying.length < 3,
  };
}

export const matchingEngine = {
  computeSkillMatch,
  computeDistance,
  computeAvailability,
  computeMatchScore,
  findMatches,
};
