/**
 * Sets custom claims (role + ngo_id) on a Firebase Auth user.
 *
 * Usage:
 *   npx ts-node scripts/set-admin.ts your-email@gmail.com
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

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("❌ Usage: npx ts-node scripts/set-admin.ts YOUR_EMAIL@gmail.com");
    process.exit(1);
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log(`Found user: ${user.displayName} (${user.uid})`);

    await admin.auth().setCustomUserClaims(user.uid, {
      role: "super_admin",
      ngo_id: "ngo_001",
    });

    console.log(`✅ Custom claims set for ${email}:`);
    console.log(`   role: super_admin`);
    console.log(`   ngo_id: ngo_001`);
    console.log(`\n⚠️  The user needs to sign out and sign back in for claims to take effect.`);
    process.exit(0);
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      console.error(`❌ No user found with email: ${email}`);
      console.error("   Sign in to the app first, then run this script again.");
    } else {
      console.error("❌ Error:", err.message);
    }
    process.exit(1);
  }
}

main();
