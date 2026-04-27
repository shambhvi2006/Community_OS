import { beforeUserCreated } from "firebase-functions/v2/identity";
import { db } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Auth trigger that fires when a new user is created.
 * Creates a user profile document in Firestore `users/{uid}` with default role `volunteer`.
 */
export const onUserCreate = beforeUserCreated(async (event) => {
  const { uid, email, displayName } = event.data;

  await db.doc(`users/${uid}`).set({
    uid,
    email: email ?? "",
    displayName: displayName ?? "",
    role: "volunteer",
    ngo_id: "",
    created_at: FieldValue.serverTimestamp(),
  });
});
