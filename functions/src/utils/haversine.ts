/**
 * Haversine distance calculation between two geographic coordinate pairs.
 * Returns distance in kilometers using Earth radius = 6371 km.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Validates that latitude is in [-90, 90] and longitude is in [-180, 180].
 * Throws a RangeError if coordinates are out of bounds.
 */
function validateCoordinates(lat: number, lng: number): void {
  if (lat < -90 || lat > 90) {
    throw new RangeError(`Latitude must be between -90 and 90, got ${lat}`);
  }
  if (lng < -180 || lng > 180) {
    throw new RangeError(`Longitude must be between -180 and 180, got ${lng}`);
  }
}

/** Converts degrees to radians. */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Computes the great-circle distance in km between two lat/lng pairs
 * using the haversine formula.
 *
 * @param lat1 - Latitude of point 1 (degrees, [-90, 90])
 * @param lng1 - Longitude of point 1 (degrees, [-180, 180])
 * @param lat2 - Latitude of point 2 (degrees, [-90, 90])
 * @param lng2 - Longitude of point 2 (degrees, [-180, 180])
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  validateCoordinates(lat1, lng1);
  validateCoordinates(lat2, lng2);

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
