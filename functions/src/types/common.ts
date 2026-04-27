/**
 * Portable Timestamp type alias.
 * Mirrors Firestore Timestamp structure without requiring firebase-admin import.
 */
export type Timestamp = { seconds: number; nanoseconds: number };

/**
 * Vulnerability flag types used across Need and Urgency scoring.
 */
export type VulnerabilityFlag = 'children' | 'elderly' | 'pregnant' | 'disabled' | 'medical_emergency';

/**
 * Reusable geographic location type.
 */
export interface GeoLocation {
  lat: number;
  lng: number;
  description: string;
}
