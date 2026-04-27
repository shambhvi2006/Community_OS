import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db } from "../config/firebase";
import { computeScore } from "../engines/urgency";
import { Need } from "../types/need";

/**
 * Firestore onWrite trigger on `needs/{needId}`.
 * Computes urgency_score on Need creation/update and writes the result back.
 * Skips recomputation if the only changes were to urgency_score/urgency_breakdown
 * to avoid infinite trigger loops.
 */
export const urgencyOnWrite = onDocumentWritten("needs/{needId}", async (event) => {
  const afterData = event.data?.after?.data() as Need | undefined;

  // Document was deleted — nothing to score
  if (!afterData) {
    return;
  }

  const beforeData = event.data?.before?.data() as Need | undefined;

  // If this is an update (not a create), check whether the only changes
  // were urgency_score and/or urgency_breakdown. If so, skip to prevent loops.
  if (beforeData) {
    const beforeCopy = { ...beforeData } as Record<string, unknown>;
    const afterCopy = { ...afterData } as Record<string, unknown>;

    delete beforeCopy.urgency_score;
    delete beforeCopy.urgency_breakdown;
    delete afterCopy.urgency_score;
    delete afterCopy.urgency_breakdown;

    if (JSON.stringify(beforeCopy) === JSON.stringify(afterCopy)) {
      return;
    }
  }

  const breakdown = computeScore(afterData);

  const needId = event.params.needId;
  await db.doc(`needs/${needId}`).update({
    urgency_score: breakdown.urgency_score,
    urgency_breakdown: breakdown,
  });
});
