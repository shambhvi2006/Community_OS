import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../config/firebase";
import { computeScore } from "../engines/urgency";
import { Need } from "../types/need";

const OPEN_STATUSES: Need["status"][] = ["new", "triaged", "assigned", "in_progress"];

/**
 * Cloud Scheduler function that runs every 15 minutes.
 * Recomputes urgency_score for all open Needs so that the
 * hours_since_reported decay factor stays current.
 */
export const urgencyScheduler = onSchedule("every 15 minutes", async () => {
  const snapshot = await db
    .collection("needs")
    .where("status", "in", OPEN_STATUSES)
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const need = doc.data() as Need;
    const breakdown = computeScore(need);

    batch.update(doc.ref, {
      urgency_score: breakdown.urgency_score,
      urgency_breakdown: breakdown,
    });
  }

  await batch.commit();
});
