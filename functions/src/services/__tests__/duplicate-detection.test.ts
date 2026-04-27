import { cosineSimilarity } from "../duplicate-detection";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 10);
  });

  it("returns 0 for zero-length vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 when one vector is all zeros", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("throws when vectors have different lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
      "Vectors must have the same length",
    );
  });

  it("computes correct similarity for known vectors", () => {
    // cos([1,0], [1,1]) = 1 / (1 * sqrt(2)) ≈ 0.7071
    const a = [1, 0];
    const b = [1, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1 / Math.sqrt(2), 10);
  });

  it("is symmetric: cosineSimilarity(a, b) === cosineSimilarity(b, a)", () => {
    const a = [3, 4, 1];
    const b = [1, 7, 2];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it("is scale-invariant for positive scalars", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const aScaled = a.map((x) => x * 5);
    expect(cosineSimilarity(a, b)).toBeCloseTo(
      cosineSimilarity(aScaled, b),
      10,
    );
  });

  it("result is always in [-1, 1] range", () => {
    const a = [100, -200, 300];
    const b = [-50, 150, -250];
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });
});
