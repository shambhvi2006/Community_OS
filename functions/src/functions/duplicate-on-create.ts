import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { db } from "../config/firebase";
import { Need } from "../types/need";
import {
  computeEmbedding,
  findDuplicates,
} from "../services/duplicate-detection";

/**
 * Firestore onCreate trigger on `needs/{needId}`.
 * Computes an embedding for the new Need's raw_input,
 * stores it on the document, checks for duplicates,
 * and flags the Need if a duplicate is found.
 */
export const duplicateOnCreate = onDocumentCreated(
  "needs/{needId}",
  async (event) => {
    const data = event.data?.data() as Need | undefined;
    if (!data) {
      return;
    }

    const needId = event.params.needId;

    // Compute embedding for the raw_input text
    let embedding: number[];
    try {
      embedding = await computeEmbedding(data.raw_input);
    } catch (error) {
      // If embedding fails, log and skip duplicate detection
      console.warn(
        `Failed to compute embedding for need ${needId}:`,
        error,
      );
      return;
    }

    // Store the embedding on the Need document
    await db.doc(`needs/${needId}`).update({ embedding });

    // Build the need object with the embedding for comparison
    const needWithEmbedding: Need = { ...data, id: needId, embedding };

    // Find duplicates
    const duplicates = await findDuplicates(
      needWithEmbedding,
      data.ngo_id,
    );

    if (duplicates.length > 0) {
      const topDuplicate = duplicates[0];

      // Set duplicate_of on the new Need
      await db.doc(`needs/${needId}`).update({
        duplicate_of: topDuplicate.existing_need_id,
      });

      // Create a system alert for the coordinator
      await db.collection("system_alerts").add({
        ngo_id: data.ngo_id,
        type: "dispatch_delay" as const,
        severity: "warning" as const,
        message: `Potential duplicate detected: Need ${needId} is similar to ${topDuplicate.existing_need_id} (similarity: ${topDuplicate.similarity_score.toFixed(2)})`,
        metadata: {
          new_need_id: needId,
          existing_need_id: topDuplicate.existing_need_id,
          similarity_score: topDuplicate.similarity_score,
          duplicates: duplicates,
        },
        acknowledged: false,
        created_at: new Date(),
      });
    }
  },
);
