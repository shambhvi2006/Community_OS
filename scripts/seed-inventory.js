const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.resolve(__dirname, "communityos-solution-challenge-firebase-adminsdk-fbsvc-1e7f2c5602.json"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const NGO_ID = "ngo_001";
const TS = admin.firestore.FieldValue.serverTimestamp;

const items = [
  // Central Warehouse, Delhi
  { resource_type: "food_kits", quantity: 120, location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Connaught Place, Delhi" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "medical_supplies", quantity: 45, location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Connaught Place, Delhi" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "blankets", quantity: 200, location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Connaught Place, Delhi" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "water_bottles", quantity: 500, location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Connaught Place, Delhi" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "first_aid_kits", quantity: 30, location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Connaught Place, Delhi" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "hygiene_kits", quantity: 75, location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Connaught Place, Delhi" }, ngo_id: NGO_ID, status: "available" },

  // Noida Depot
  { resource_type: "food_kits", quantity: 60, location: { lat: 28.5355, lng: 77.391, description: "Relief Depot, Sector 18, Noida" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "water_bottles", quantity: 300, location: { lat: 28.5355, lng: 77.391, description: "Relief Depot, Sector 18, Noida" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "medicines", quantity: 8, location: { lat: 28.5355, lng: 77.391, description: "Relief Depot, Sector 18, Noida" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "tents", quantity: 15, location: { lat: 28.5355, lng: 77.391, description: "Relief Depot, Sector 18, Noida" }, ngo_id: NGO_ID, status: "available" },

  // Gurgaon Hub
  { resource_type: "clothing_packs", quantity: 90, location: { lat: 28.4595, lng: 77.0266, description: "Community Hub, Gurgaon Railway Station" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "blankets", quantity: 5, location: { lat: 28.4595, lng: 77.0266, description: "Community Hub, Gurgaon Railway Station" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "rice_bags", quantity: 40, location: { lat: 28.4595, lng: 77.0266, description: "Community Hub, Gurgaon Railway Station" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "dal_packets", quantity: 35, location: { lat: 28.4595, lng: 77.0266, description: "Community Hub, Gurgaon Railway Station" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "cooking_oil", quantity: 3, location: { lat: 28.4595, lng: 77.0266, description: "Community Hub, Gurgaon Railway Station" }, ngo_id: NGO_ID, status: "available" },

  // Model Town Storage
  { resource_type: "medical_supplies", quantity: 22, location: { lat: 28.7000, lng: 77.1500, description: "Storage Unit, Model Town, Delhi" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "first_aid_kits", quantity: 18, location: { lat: 28.7000, lng: 77.1500, description: "Storage Unit, Model Town, Delhi" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "masks", quantity: 500, location: { lat: 28.7000, lng: 77.1500, description: "Storage Unit, Model Town, Delhi" }, ngo_id: NGO_ID, status: "available" },
  { resource_type: "sanitizer", quantity: 7, location: { lat: 28.7000, lng: 77.1500, description: "Storage Unit, Model Town, Delhi" }, ngo_id: NGO_ID, status: "available" },

  // Depleted items
  { resource_type: "tents", quantity: 0, location: { lat: 28.6139, lng: 77.209, description: "Central Warehouse, Connaught Place, Delhi" }, ngo_id: NGO_ID, status: "depleted" },
  { resource_type: "torches", quantity: 0, location: { lat: 28.5355, lng: 77.391, description: "Relief Depot, Sector 18, Noida" }, ngo_id: NGO_ID, status: "depleted" },
];

async function main() {
  // Clear old inventory first
  const old = await db.collection("inventory").where("ngo_id", "==", NGO_ID).get();
  const batch = db.batch();
  old.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`Cleared ${old.size} old inventory items`);

  for (const item of items) {
    await db.collection("inventory").add({ ...item, created_at: TS(), updated_at: TS() });
  }
  console.log(`${items.length} inventory items seeded across 4 locations`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
