const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.resolve(__dirname, "communityos-solution-challenge-firebase-adminsdk-fbsvc-1e7f2c5602.json"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const NGO_ID = "ngo_001";
const TS = admin.firestore.FieldValue.serverTimestamp;

const volunteers = [
  { id: "vol_004", name: "Sneha Gupta", phone: "+91XXXXXXXXXX", location: { lat: 28.6508, lng: 77.2319, description: "Chandni Chowk, Delhi" }, skills: ["food_distribution", "counseling", "teaching"], ngo_id: NGO_ID, reliability_score: 88, burnout_factor: 1.1, status: "available", task_history: { total_completed: 18, total_declined: 1, total_escalated: 0, avg_response_time_minutes: 6, avg_feedback_rating: 4.7 } },
  { id: "vol_005", name: "Vikram Singh", phone: "+91XXXXXXXXXX", location: { lat: 28.5672, lng: 77.2100, description: "Hauz Khas, Delhi" }, skills: ["driving", "logistics", "rescue"], ngo_id: NGO_ID, reliability_score: 78, burnout_factor: 1.3, status: "available", task_history: { total_completed: 12, total_declined: 3, total_escalated: 1, avg_response_time_minutes: 10, avg_feedback_rating: 4.2 } },
  { id: "vol_006", name: "Ananya Reddy", phone: "+91XXXXXXXXXX", location: { lat: 28.4900, lng: 77.0800, description: "Cyber City, Gurgaon" }, skills: ["medical", "first_aid"], ngo_id: NGO_ID, reliability_score: 95, burnout_factor: 1.0, status: "available", task_history: { total_completed: 40, total_declined: 0, total_escalated: 0, avg_response_time_minutes: 4, avg_feedback_rating: 4.9 } },
  { id: "vol_007", name: "Ravi Teja", phone: "+91XXXXXXXXXX", location: { lat: 28.6280, lng: 77.3649, description: "Vaishali, Ghaziabad" }, skills: ["food_distribution", "driving", "logistics"], ngo_id: NGO_ID, reliability_score: 65, burnout_factor: 1.8, status: "busy", task_history: { total_completed: 8, total_declined: 5, total_escalated: 3, avg_response_time_minutes: 15, avg_feedback_rating: 3.8 } },
  { id: "vol_008", name: "Meera Joshi", phone: "+91XXXXXXXXXX", location: { lat: 28.7000, lng: 77.1500, description: "Model Town, Delhi" }, skills: ["counseling", "teaching", "first_aid"], ngo_id: NGO_ID, reliability_score: 82, burnout_factor: 1.2, status: "available", task_history: { total_completed: 20, total_declined: 2, total_escalated: 1, avg_response_time_minutes: 7, avg_feedback_rating: 4.5 } },
];

async function main() {
  for (const v of volunteers) {
    await db.doc(`volunteers/${v.id}`).set({ ...v, created_at: TS(), updated_at: TS() });
  }
  console.log(`${volunteers.length} additional volunteers created`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
