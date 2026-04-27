/**
 * Seed script: Adds demo data to Firestore so the dashboard has something to show.
 *
 * Usage:
 *   npx ts-node scripts/seed-firestore.ts
 *
 * Prerequisites:
 *   - Firebase CLI logged in
 *   - Service account key OR Application Default Credentials
 */

import * as admin from "firebase-admin";
import * as path from "path";

const serviceAccount = require(path.resolve(
  __dirname,
  "communityos-solution-challenge-firebase-adminsdk-fbsvc-1e7f2c5602.json"
));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const NGO_ID = "ngo_001";

async function seedNGO() {
  await db.doc(`ngos/${NGO_ID}`).set({
    id: NGO_ID,
    name: "HelpIndia Foundation",
    region: "asia-south1",
    settings: {
      overflow_enabled: false,
      overflow_partners: [],
      inventory_thresholds: {
        food_kits: 10,
        medical_supplies: 5,
        blankets: 15,
      },
    },
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("✅ NGO created");
}

async function seedNeeds() {
  const needs = [
    {
      source: "whatsapp",
      location: { lat: 28.6139, lng: 77.209, description: "Connaught Place, New Delhi" },
      need_type: "food_shortage",
      severity: 8,
      affected_count: 25,
      vulnerability_flags: ["children", "elderly"],
      urgency_score: 12.5,
      urgency_breakdown: {
        severity: 8,
        affected_count: 25,
        vulnerability_flags: ["children", "elderly"],
        vulnerability_multiplier: 1.7,
        hours_since_reported: 2.5,
        urgency_score: 12.5,
        computed_at: new Date().toISOString(),
      },
      status: "new",
      ngo_id: NGO_ID,
      consent_token: "ct_demo_001",
      raw_input: "There are about 25 people including children and elderly near CP who need food urgently",
      language: "en",
      reporter_phone: "+91XXXXXXXXXX",
      created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 2.5 * 3600000)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail_id: "audit_001",
    },
    {
      source: "whatsapp",
      location: { lat: 28.5355, lng: 77.391, description: "Sector 18, Noida" },
      need_type: "medical_emergency",
      severity: 9,
      affected_count: 3,
      vulnerability_flags: ["medical_emergency", "elderly"],
      urgency_score: 18.9,
      urgency_breakdown: {
        severity: 9,
        affected_count: 3,
        vulnerability_flags: ["medical_emergency", "elderly"],
        vulnerability_multiplier: 1.9,
        hours_since_reported: 1.2,
        urgency_score: 18.9,
        computed_at: new Date().toISOString(),
      },
      status: "new",
      ngo_id: NGO_ID,
      consent_token: "ct_demo_002",
      raw_input: "3 elderly people need medical attention in Sector 18, one is having breathing difficulty",
      language: "en",
      reporter_phone: "+91XXXXXXXXXX",
      created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1.2 * 3600000)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail_id: "audit_002",
    },
    {
      source: "web",
      location: { lat: 28.4595, lng: 77.0266, description: "Gurgaon Railway Station" },
      need_type: "shelter",
      severity: 6,
      affected_count: 12,
      vulnerability_flags: ["children"],
      urgency_score: 5.6,
      urgency_breakdown: {
        severity: 6,
        affected_count: 12,
        vulnerability_flags: ["children"],
        vulnerability_multiplier: 1.4,
        hours_since_reported: 5,
        urgency_score: 5.6,
        computed_at: new Date().toISOString(),
      },
      status: "triaged",
      ngo_id: NGO_ID,
      consent_token: "ct_demo_003",
      raw_input: "12 people including children need temporary shelter near Gurgaon station",
      language: "en",
      created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 3600000)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail_id: "audit_003",
    },
    {
      source: "voice",
      location: { lat: 28.7041, lng: 77.1025, description: "Civil Lines, Delhi" },
      need_type: "water_supply",
      severity: 7,
      affected_count: 50,
      vulnerability_flags: ["children", "pregnant"],
      urgency_score: 9.3,
      urgency_breakdown: {
        severity: 7,
        affected_count: 50,
        vulnerability_flags: ["children", "pregnant"],
        vulnerability_multiplier: 1.8,
        hours_since_reported: 3,
        urgency_score: 9.3,
        computed_at: new Date().toISOString(),
      },
      status: "assigned",
      assigned_volunteer_id: "vol_001",
      ngo_id: NGO_ID,
      consent_token: "ct_demo_004",
      raw_input: "Paani ki bahut zaroorat hai, 50 log hain jismein bacche aur pregnant women hain",
      language: "hi",
      created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 3 * 3600000)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail_id: "audit_004",
    },
    {
      source: "whatsapp",
      location: { lat: 28.6304, lng: 77.2177, description: "India Gate, New Delhi" },
      need_type: "clothing",
      severity: 4,
      affected_count: 8,
      vulnerability_flags: [],
      urgency_score: 2.1,
      urgency_breakdown: {
        severity: 4,
        affected_count: 8,
        vulnerability_flags: [],
        vulnerability_multiplier: 1.0,
        hours_since_reported: 8,
        urgency_score: 2.1,
        computed_at: new Date().toISOString(),
      },
      status: "new",
      ngo_id: NGO_ID,
      consent_token: "ct_demo_005",
      raw_input: "8 people near India Gate need warm clothing",
      language: "en",
      created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 8 * 3600000)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail_id: "audit_005",
    },
  ];

  for (const need of needs) {
    const ref = await db.collection("needs").add(need);
    // Add an audit entry
    await ref.collection("audit_entries").add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      actor_id: "system",
      actor_role: "system",
      action_type: "status_change",
      previous_value: null,
      new_value: need.status,
      source: need.source === "web" ? "web" : "whatsapp",
    });
  }
  console.log(`✅ ${needs.length} needs created`);
}

async function seedVolunteers() {
  const volunteers = [
    {
      id: "vol_001",
      name: "Rahul Sharma",
      phone: "+91XXXXXXXXXX",
      location: { lat: 28.6292, lng: 77.2182, description: "Janpath, New Delhi" },
      skills: ["first_aid", "food_distribution", "driving"],
      availability: {
        windows: [
          { day: "monday", start: "09:00", end: "17:00" },
          { day: "wednesday", start: "09:00", end: "17:00" },
          { day: "friday", start: "09:00", end: "17:00" },
        ],
      },
      ngo_id: NGO_ID,
      reliability_score: 85,
      burnout_factor: 1.2,
      status: "available",
      task_history: {
        total_completed: 23,
        total_declined: 2,
        total_escalated: 1,
        avg_response_time_minutes: 8,
        avg_feedback_rating: 4.5,
      },
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      id: "vol_002",
      name: "Priya Patel",
      phone: "+91XXXXXXXXXX",
      location: { lat: 28.5445, lng: 77.334, description: "Sector 62, Noida" },
      skills: ["medical", "first_aid", "counseling"],
      availability: {
        windows: [
          { day: "monday", start: "08:00", end: "20:00" },
          { day: "tuesday", start: "08:00", end: "20:00" },
          { day: "thursday", start: "08:00", end: "20:00" },
          { day: "saturday", start: "10:00", end: "16:00" },
        ],
      },
      ngo_id: NGO_ID,
      reliability_score: 92,
      burnout_factor: 1.0,
      status: "available",
      task_history: {
        total_completed: 31,
        total_declined: 1,
        total_escalated: 0,
        avg_response_time_minutes: 5,
        avg_feedback_rating: 4.8,
      },
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      id: "vol_003",
      name: "Amit Kumar",
      phone: "+91XXXXXXXXXX",
      location: { lat: 28.4667, lng: 77.0333, description: "DLF Phase 3, Gurgaon" },
      skills: ["driving", "logistics", "food_distribution"],
      availability: {
        windows: [
          { day: "saturday", start: "09:00", end: "18:00" },
          { day: "sunday", start: "09:00", end: "18:00" },
        ],
      },
      ngo_id: NGO_ID,
      reliability_score: 72,
      burnout_factor: 1.5,
      status: "available",
      task_history: {
        total_completed: 15,
        total_declined: 4,
        total_escalated: 2,
        avg_response_time_minutes: 12,
        avg_feedback_rating: 4.0,
      },
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  for (const vol of volunteers) {
    await db.doc(`volunteers/${vol.id}`).set(vol);
  }
  console.log(`✅ ${volunteers.length} volunteers created`);
}

async function seedInventory() {
  const items = [
    {
      resource_type: "food_kits",
      quantity: 45,
      location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Delhi" },
      ngo_id: NGO_ID,
      status: "available",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      resource_type: "medical_supplies",
      quantity: 12,
      location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Delhi" },
      ngo_id: NGO_ID,
      status: "available",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      resource_type: "blankets",
      quantity: 80,
      location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Delhi" },
      ngo_id: NGO_ID,
      status: "available",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      resource_type: "water_bottles",
      quantity: 200,
      location: { lat: 28.5355, lng: 77.391, description: "Noida Depot" },
      ngo_id: NGO_ID,
      status: "available",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  for (const item of items) {
    await db.collection("inventory").add(item);
  }
  console.log(`✅ ${items.length} inventory items created`);
}

async function seedCompletedNeeds() {
  // Add some completed needs for impact metrics
  const completedNeeds = [
    {
      source: "whatsapp",
      location: { lat: 28.58, lng: 77.22, description: "Lajpat Nagar, Delhi" },
      need_type: "food_shortage",
      severity: 7,
      affected_count: 15,
      vulnerability_flags: ["children"],
      urgency_score: 0,
      status: "completed",
      ngo_id: NGO_ID,
      consent_token: "ct_demo_c1",
      raw_input: "Food needed for 15 people",
      language: "en",
      created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 48 * 3600000)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail_id: "audit_c1",
    },
    {
      source: "web",
      location: { lat: 28.65, lng: 77.18, description: "Karol Bagh, Delhi" },
      need_type: "medical_emergency",
      severity: 9,
      affected_count: 2,
      vulnerability_flags: ["elderly", "medical_emergency"],
      urgency_score: 0,
      status: "verified",
      ngo_id: NGO_ID,
      consent_token: "ct_demo_c2",
      raw_input: "2 elderly people need medical help",
      language: "en",
      created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 72 * 3600000)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail_id: "audit_c2",
    },
    {
      source: "whatsapp",
      location: { lat: 28.52, lng: 77.21, description: "Saket, Delhi" },
      need_type: "shelter",
      severity: 6,
      affected_count: 20,
      vulnerability_flags: ["children", "pregnant"],
      urgency_score: 0,
      status: "completed",
      ngo_id: NGO_ID,
      consent_token: "ct_demo_c3",
      raw_input: "20 people need shelter",
      language: "en",
      created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 96 * 3600000)),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail_id: "audit_c3",
    },
  ];

  for (const need of completedNeeds) {
    await db.collection("needs").add(need);
  }
  console.log(`✅ ${completedNeeds.length} completed needs created for impact metrics`);
}

async function main() {
  console.log("🌱 Seeding Firestore with demo data...\n");

  await seedNGO();
  await seedNeeds();
  await seedVolunteers();
  await seedInventory();
  await seedCompletedNeeds();

  console.log("\n🎉 Seeding complete! Your dashboard should now show data.");
  console.log("\n⚠️  Remember: You still need to set custom claims on your user.");
  console.log('   Run this after signing in:');
  console.log('   npx ts-node scripts/set-admin.ts YOUR_EMAIL');
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
