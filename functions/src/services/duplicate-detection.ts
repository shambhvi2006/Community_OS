import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../config/firebase";
import { Need } from "../types/need";
import { haversineDistance } from "../utils/haversine";

let genAIInstance: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAIInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    genAIInstance = new GoogleGenerativeAI(apiKey);
  }
  return genAIInstance;
}

/** Visible for testing — allows injecting a mock GoogleGenerativeAI instance. */
export function _setGenAIForTesting(
  instance: GoogleGenerativeAI | null,
): void {
  genAIInstance = instance;
}

/**
 * Computes cosine similarity between two vectors.
 * Returns a value in [-1, 1]. Returns 0 for zero-length vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  if (a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  if (denominator === 0) {
    return 0;
  }

  const similarity = dot / denominator;
  // Clamp to [-1, 1] to handle floating-point imprecision
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Computes a text embedding using Gemini text-embedding-004.
 */
export async function computeEmbedding(text: string): Promise<number[]> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

const DUPLICATE_RADIUS_KM = 5;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;

/**
 * Finds potential duplicate Needs within the same NGO that are:
 * - Within 5 km radius
 * - Have cosine similarity > 0.85 on their embeddings
 *
 * Returns candidates sorted by similarity descending.
 */
export async function findDuplicates(
  need: Need,
  ngo_id: string,
): Promise<{ existing_need_id: string; similarity_score: number }[]> {
  // Query open needs in the same NGO that have embeddings
  const openStatuses = ["new", "triaged", "assigned", "in_progress"];
  const snapshot = await db
    .collection("needs")
    .where("ngo_id", "==", ngo_id)
    .where("status", "in", openStatuses)
    .get();

  const candidates: { existing_need_id: string; similarity_score: number }[] =
    [];

  for (const doc of snapshot.docs) {
    // Skip the need itself
    if (doc.id === need.id) {
      continue;
    }

    const existingNeed = doc.data() as Need;

    // Must have an embedding to compare
    if (!existingNeed.embedding || existingNeed.embedding.length === 0) {
      continue;
    }

    // Must have a valid embedding on the new need
    if (!need.embedding || need.embedding.length === 0) {
      continue;
    }

    // Check geographic proximity (within 5 km)
    const distance = haversineDistance(
      need.location.lat,
      need.location.lng,
      existingNeed.location.lat,
      existingNeed.location.lng,
    );

    if (distance > DUPLICATE_RADIUS_KM) {
      continue;
    }

    // Compute cosine similarity between embeddings
    const similarity = cosineSimilarity(need.embedding, existingNeed.embedding);

    if (similarity > DUPLICATE_SIMILARITY_THRESHOLD) {
      candidates.push({
        existing_need_id: doc.id,
        similarity_score: similarity,
      });
    }
  }

  // Sort by similarity descending
  candidates.sort((a, b) => b.similarity_score - a.similarity_score);

  return candidates;
}
