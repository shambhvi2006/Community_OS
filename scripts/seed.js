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
  console.log("Seeding Firestore...\n");

  // 1. NGO
  await db.doc(`ngos/${NGO_ID}`).set({
    id: NGO_ID, name: "HelpIndia Foundation", region: "asia-south1",
    settings: { overflow_enabled: false, overflow_partners: [], inventory_thresholds: { food_kits: 10, medical_supplies: 5, blankets: 15 } },
    created_at: TS(), updated_at: TS(),
  });
  console.log("NGO created");

  // 2. Needs
  const needs = [
    { source:"whatsapp", location:{lat:28.6139,lng:77.209,description:"Connaught Place, New Delhi"}, need_type:"food_shortage", severity:8, affected_count:25, vulnerability_flags:["children","elderly"], urgency_score:12.5, urgency_breakdown:{severity:8,affected_count:25,vulnerability_flags:["children","elderly"],vulnerability_multiplier:1.7,hours_since_reported:2.5,urgency_score:12.5,computed_at:new Date().toISOString()}, status:"new", ngo_id:NGO_ID, consent_token:"ct_001", raw_input:"25 people including children and elderly near CP need food", language:"en", created_at:fromDate(hoursAgo(2.5)), updated_at:TS(), audit_trail_id:"a1" },
    { source:"whatsapp", location:{lat:28.5355,lng:77.391,description:"Sector 18, Noida"}, need_type:"medical_emergency", severity:9, affected_count:3, vulnerability_flags:["medical_emergency","elderly"], urgency_score:18.9, urgency_breakdown:{severity:9,affected_count:3,vulnerability_flags:["medical_emergency","elderly"],vulnerability_multiplier:1.9,hours_since_reported:1.2,urgency_score:18.9,computed_at:new Date().toISOString()}, status:"new", ngo_id:NGO_ID, consent_token:"ct_002", raw_input:"3 elderly need medical help in Sector 18", language:"en", created_at:fromDate(hoursAgo(1.2)), updated_at:TS(), audit_trail_id:"a2" },
    { source:"web", location:{lat:28.4595,lng:77.0266,description:"Gurgaon Railway Station"}, need_type:"shelter", severity:6, affected_count:12, vulnerability_flags:["children"], urgency_score:5.6, urgency_breakdown:{severity:6,affected_count:12,vulnerability_flags:["children"],vulnerability_multiplier:1.4,hours_since_reported:5,urgency_score:5.6,computed_at:new Date().toISOString()}, status:"triaged", ngo_id:NGO_ID, consent_token:"ct_003", raw_input:"12 people need shelter near Gurgaon station", language:"en", created_at:fromDate(hoursAgo(5)), updated_at:TS(), audit_trail_id:"a3" },
    { source:"voice", location:{lat:28.7041,lng:77.1025,description:"Civil Lines, Delhi"}, need_type:"water_supply", severity:7, affected_count:50, vulnerability_flags:["children","pregnant"], urgency_score:9.3, urgency_breakdown:{severity:7,affected_count:50,vulnerability_flags:["children","pregnant"],vulnerability_multiplier:1.8,hours_since_reported:3,urgency_score:9.3,computed_at:new Date().toISOString()}, status:"assigned", assigned_volunteer_id:"vol_001", ngo_id:NGO_ID, consent_token:"ct_004", raw_input:"50 people need water, children and pregnant women", language:"hi", created_at:fromDate(hoursAgo(3)), updated_at:TS(), audit_trail_id:"a4" },
    { source:"whatsapp", location:{lat:28.6304,lng:77.2177,description:"India Gate, New Delhi"}, need_type:"clothing", severity:4, affected_count:8, vulnerability_flags:[], urgency_score:2.1, urgency_breakdown:{severity:4,affected_count:8,vulnerability_flags:[],vulnerability_multiplier:1.0,hours_since_reported:8,urgency_score:2.1,computed_at:new Date().toISOString()}, status:"new", ngo_id:NGO_ID, consent_token:"ct_005", raw_input:"8 people near India Gate need warm clothing", language:"en", created_at:fromDate(hoursAgo(8)), updated_at:TS(), audit_trail_id:"a5" },
    // Completed needs for impact metrics
    { source:"whatsapp", location:{lat:28.58,lng:77.22,description:"Lajpat Nagar"}, need_type:"food_shortage", severity:7, affected_count:15, vulnerability_flags:["children"], urgency_score:0, status:"completed", ngo_id:NGO_ID, consent_token:"ct_c1", raw_input:"Food needed", language:"en", created_at:fromDate(hoursAgo(48)), updated_at:TS(), audit_trail_id:"ac1" },
    { source:"web", location:{lat:28.65,lng:77.18,description:"Karol Bagh"}, need_type:"medical_emergency", severity:9, affected_count:2, vulnerability_flags:["elderly"], urgency_score:0, status:"verified", ngo_id:NGO_ID, consent_token:"ct_c2", raw_input:"Medical help needed", language:"en", created_at:fromDate(hoursAgo(72)), updated_at:TS(), audit_trail_id:"ac2" },
    { source:"whatsapp", location:{lat:28.52,lng:77.21,description:"Saket"}, need_type:"shelter", severity:6, affected_count:20, vulnerability_flags:["children","pregnant"], urgency_score:0, status:"completed", ngo_id:NGO_ID, consent_token:"ct_c3", raw_input:"Shelter needed", language:"en", created_at:fromDate(hoursAgo(96)), updated_at:TS(), audit_trail_id:"ac3" },
  ];
  for (const n of needs) {
    const ref = await db.collection("needs").add(n);
    await ref.collection("audit_entries").add({ timestamp:TS(), actor_id:"system", actor_role:"system", action_type:"status_change", previous_value:null, new_value:n.status, source:"system" });
  }
  console.log(`${needs.length} needs created`);

  // 3. Volunteers
  const vols = [
    { id:"vol_001", name:"Rahul Sharma", phone:"+91XXXXXXXXXX", location:{lat:28.6292,lng:77.2182,description:"Janpath, Delhi"}, skills:["first_aid","food_distribution","driving"], availability:{windows:[{day:"monday",start:"09:00",end:"17:00"},{day:"wednesday",start:"09:00",end:"17:00"},{day:"friday",start:"09:00",end:"17:00"}]}, ngo_id:NGO_ID, reliability_score:85, burnout_factor:1.2, status:"available", task_history:{total_completed:23,total_declined:2,total_escalated:1,avg_response_time_minutes:8,avg_feedback_rating:4.5}, created_at:TS(), updated_at:TS() },
    { id:"vol_002", name:"Priya Patel", phone:"+91XXXXXXXXXX", location:{lat:28.5445,lng:77.334,description:"Sector 62, Noida"}, skills:["medical","first_aid","counseling"], availability:{windows:[{day:"monday",start:"08:00",end:"20:00"},{day:"tuesday",start:"08:00",end:"20:00"},{day:"thursday",start:"08:00",end:"20:00"}]}, ngo_id:NGO_ID, reliability_score:92, burnout_factor:1.0, status:"available", task_history:{total_completed:31,total_declined:1,total_escalated:0,avg_response_time_minutes:5,avg_feedback_rating:4.8}, created_at:TS(), updated_at:TS() },
    { id:"vol_003", name:"Amit Kumar", phone:"+91XXXXXXXXXX", location:{lat:28.4667,lng:77.0333,description:"DLF Phase 3, Gurgaon"}, skills:["driving","logistics","food_distribution"], availability:{windows:[{day:"saturday",start:"09:00",end:"18:00"},{day:"sunday",start:"09:00",end:"18:00"}]}, ngo_id:NGO_ID, reliability_score:72, burnout_factor:1.5, status:"available", task_history:{total_completed:15,total_declined:4,total_escalated:2,avg_response_time_minutes:12,avg_feedback_rating:4.0}, created_at:TS(), updated_at:TS() },
  ];
  for (const v of vols) { await db.doc(`volunteers/${v.id}`).set(v); }
  console.log(`${vols.length} volunteers created`);

  // 4. Inventory
  const items = [
    { resource_type:"food_kits", quantity:45, location:{lat:28.6139,lng:77.209,description:"Central Warehouse, Delhi"}, ngo_id:NGO_ID, status:"available", created_at:TS(), updated_at:TS() },
    { resource_type:"medical_supplies", quantity:12, location:{lat:28.6139,lng:77.209,description:"Central Warehouse, Delhi"}, ngo_id:NGO_ID, status:"available", created_at:TS(), updated_at:TS() },
    { resource_type:"blankets", quantity:80, location:{lat:28.6139,lng:77.209,description:"Central Warehouse, Delhi"}, ngo_id:NGO_ID, status:"available", created_at:TS(), updated_at:TS() },
    { resource_type:"water_bottles", quantity:200, location:{lat:28.5355,lng:77.391,description:"Noida Depot"}, ngo_id:NGO_ID, status:"available", created_at:TS(), updated_at:TS() },
  ];
  for (const i of items) { await db.collection("inventory").add(i); }
  console.log(`${items.length} inventory items created`);

  console.log("\nDone! Now run: node scripts/set-admin.js YOUR_EMAIL@gmail.com");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
