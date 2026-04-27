import { haversineDistance } from '../haversine';

describe('haversineDistance', () => {
  it('should compute known distance between Delhi and Mumbai (~1148 km)', () => {
    // Delhi: 28.6139°N, 77.2090°E — Mumbai: 19.0760°N, 72.8777°E
    const distance = haversineDistance(28.6139, 77.209, 19.076, 72.8777);
    expect(distance).toBeGreaterThan(1140);
    expect(distance).toBeLessThan(1160);
  });

  it('should return 0 km for the same point', () => {
    expect(haversineDistance(0, 0, 0, 0)).toBe(0);
    expect(haversineDistance(45.5, 90.2, 45.5, 90.2)).toBe(0);
  });

  it('should be symmetric: distance(A,B) === distance(B,A)', () => {
    const ab = haversineDistance(28.6139, 77.209, 19.076, 72.8777);
    const ba = haversineDistance(19.076, 72.8777, 28.6139, 77.209);
    expect(ab).toBeCloseTo(ba, 10);
  });

  it('should compute max distance for antipodal points (~20015 km)', () => {
    // North pole to south pole
    const distance = haversineDistance(90, 0, -90, 0);
    expect(distance).toBeGreaterThan(20000);
    expect(distance).toBeLessThan(20030);
  });

  it('should throw RangeError for latitude out of [-90, 90]', () => {
    expect(() => haversineDistance(91, 0, 0, 0)).toThrow(RangeError);
    expect(() => haversineDistance(-91, 0, 0, 0)).toThrow(RangeError);
    expect(() => haversineDistance(0, 0, 91, 0)).toThrow(RangeError);
  });

  it('should throw RangeError for longitude out of [-180, 180]', () => {
    expect(() => haversineDistance(0, 181, 0, 0)).toThrow(RangeError);
    expect(() => haversineDistance(0, -181, 0, 0)).toThrow(RangeError);
    expect(() => haversineDistance(0, 0, 0, 181)).toThrow(RangeError);
  });
});
