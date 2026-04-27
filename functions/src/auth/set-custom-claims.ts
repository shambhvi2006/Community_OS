import { HttpsError, onCall } from "firebase-functions/v2/https";
import { auth, db } from "../config/firebase";

const VALID_ROLES = ["super_admin", "ngo_admin", "coordinator", "volunteer"] as const;
type Role = (typeof VALID_ROLES)[number];

interface SetCustomClaimsData {
  uid: string;
  role: Role;
  ngo_id: string;
}

/**
 * HTTPS callable Cloud Function that sets `role` and `ngo_id` custom claims
 * on a target user's Firebase Auth token and updates their Firestore profile.
 *
 * Only `ngo_admin` and `super_admin` callers are authorized.
 * Non-super_admin callers must share the same `ngo_id` as the target user.
 */
export const setCustomClaims = onCall<SetCustomClaimsData>(async (request) => {
  // 1. Ensure caller is authenticated
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerRole = request.auth.token.role as string | undefined;
  const callerNgoId = request.auth.token.ngo_id as string | undefined;

  // 2. Ensure caller has ngo_admin or super_admin role
  if (callerRole !== "ngo_admin" && callerRole !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "Only ngo_admin and super_admin can set custom claims."
    );
  }

  // 3. Validate input
  const { uid, role, ngo_id } = request.data;

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "A valid uid is required.");
  }
  if (!VALID_ROLES.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.`
    );
  }
  if (!ngo_id || typeof ngo_id !== "string") {
    throw new HttpsError("invalid-argument", "A valid ngo_id is required.");
  }

  // 4. Tenant check — non-super_admin must match ngo_id
  if (callerRole !== "super_admin" && callerNgoId !== ngo_id) {
    throw new HttpsError(
      "permission-denied",
      "You can only set claims for users within your own NGO."
    );
  }

  // 5. Set custom claims on the target user's auth token
  await auth.setCustomUserClaims(uid, { role, ngo_id });

  // 6. Update the user's Firestore profile document
  await db.doc(`users/${uid}`).set({ role, ngo_id }, { merge: true });

  return { success: true };
});
