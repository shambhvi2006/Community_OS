import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "asia-south1" });

const app = admin.initializeApp();

export const db = admin.firestore(app);
export const auth = admin.auth(app);
