const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.resolve(
  __dirname,
  "communityos-solution-challenge-firebase-adminsdk-fbsvc-1e7f2c5602.json"
));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/set-admin.js YOUR_EMAIL@gmail.com");
    process.exit(1);
  }

  const user = await admin.auth().getUserByEmail(email);
  console.log(`Found user: ${user.displayName} (${user.uid})`);

  await admin.auth().setCustomUserClaims(user.uid, {
    role: "super_admin",
    ngo_id: "ngo_001",
  });

  console.log(`Custom claims set: role=super_admin, ngo_id=ngo_001`);
  console.log("Sign out and sign back in for changes to take effect.");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e.message);
  if (e.code === "auth/user-not-found") {
    console.error("Sign in to the app first, then run this script again.");
  }
  process.exit(1);
});
