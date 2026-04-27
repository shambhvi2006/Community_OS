// CommunityOS Cloud Functions v2 entry point
import "./config/firebase"; // Initialize firebase-admin and set global options

export { setCustomClaims } from "./auth/set-custom-claims";
export { onUserCreate } from "./auth/on-user-create";
export { urgencyOnWrite } from "./functions/urgency-on-write";
export { urgencyScheduler } from "./functions/urgency-scheduler";
export { whatsappWebhook } from "./functions/whatsapp-webhook";
export { duplicateOnCreate } from "./functions/duplicate-on-create";
export { healthCheck } from "./functions/health-check";
