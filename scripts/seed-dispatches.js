const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.resolve(
  __dirname,
  "communityos-solution-challenge-firebase-adminsdk-fbsvc-1e7f2c5602.json"
));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const NGO_ID = "ngo_001";
const TS = admin.firestore.FieldValue.serverTimestamp;
const fromDate = (d) => admin.firestore.Timestamp.fromDate(d);
const hoursAgo = (h) => new Date(Date.now() - h * 3600000);

async function main() {
  console.log("Seeding dispatches and completed needs...\n");

  // First, get existing completed need IDs
  const needsSnap = await db.collection("needs")
    .where("ngo_id", "==", NGO_ID)
    .where("status", "in", ["completed", "verified"])
    .get();

  const completedNeedIds = needsSnap.docs.map(d => d.id);
  console.log(`Found ${completedNeedIds.length} completed needs`);

  // Create dispatches for completed needs
  const dispatches = [];
  const volunteers = ["vol_001", "vol_002", "vol_003"];

  for (let i = 0; i < completedNeedIds.length; i++) {
    const needId = completedNeedIds[i];
    const volId = volunteers[i % volunteers.length];
    const createdHoursAgo = 72 - (i * 20);
    const sentDelay = 10 + (i * 5); // minutes after creation
    const responseDelay = 5 + (i * 3); // minutes after sent
    const completionDelay = 60 + (i * 30); // minutes after response

    const createdAt = hoursAgo(createdHoursAgo);
    const sentAt = new Date(createdAt.getTime() + sentDelay * 60000);
    const respondedAt = new Date(sentAt.getTime() + responseDelay * 60000);
    const completedAt = new Date(respondedAt.getTime() + completionDelay * 60000);

    dispatches.push({
      need_id: needId,
      volunteer_id: volId,
      ngo_id: NGO_ID,
      status: "completed",
      match_score_breakdown: {
        volunteer_id: volId,
        skill_match: 0.7 + Math.random() * 0.3,
        distance_km: 1 + Math.random() * 10,
        availability_score: 1.0,
        burnout_factor: 1.0 + Math.random() * 0.5,
        reliability_score: 70 + Math.floor(Math.random() * 30),
        match_score: 0.15 + Math.random() * 0.3,
      },
      sent_at: fromDate(sentAt),
      responded_at: fromDate(respondedAt),
      completed_at: fromDate(completedAt),
      escalation_count: 0,
      created_at: fromDate(createdAt),
    });
  }

  // Add a few more recent dispatches (accepted, in progress)
  dispatches.push({
    need_id: "recent_1",
    volunteer_id: "vol_001",
    ngo_id: NGO_ID,
    status: "accepted",
    match_score_breakdown: {
      volunteer_id: "vol_001",
      skill_match: 0.85,
      distance_km: 3.2,
      availability_score: 1.0,
      burnout_factor: 1.2,
      reliability_score: 85,
      match_score: 0.21,
    },
    sent_at: fromDate(hoursAgo(2)),
    responded_at: fromDate(hoursAgo(1.8)),
    escalation_count: 0,
    created_at: fromDate(hoursAgo(2.5)),
  });

  dispatches.push({
    need_id: "recent_2",
    volunteer_id: "vol_002",
    ngo_id: NGO_ID,
    status: "accepted",
    match_score_breakdown: {
      volunteer_id: "vol_002",
      skill_match: 0.92,
      distance_km: 1.5,
      availability_score: 1.0,
      burnout_factor: 1.0,
      reliability_score: 92,
      match_score: 0.37,
    },
    sent_at: fromDate(hoursAgo(5)),
    responded_at: fromDate(hoursAgo(4.9)),
    escalation_count: 0,
    created_at: fromDate(hoursAgo(5.5)),
  });

  for (const d of dispatches) {
    await db.collection("dispatches").add(d);
  }
  console.log(`${dispatches.length} dispatches created`);

  console.log("\nDone! Refresh the dashboard.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
