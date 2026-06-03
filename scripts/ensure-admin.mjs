// Idempotent admin user provisioning. Safe to run on production.
// Usage: ADMIN_PASSWORD='...' node scripts/ensure-admin.mjs
//   or:  ADMIN_EMAIL=admin@investprop.io ADMIN_PASSWORD='...' node scripts/ensure-admin.mjs

import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@investprop.io";
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) {
    console.error("ERROR: ADMIN_PASSWORD env var is required (min 8 chars)");
    process.exit(1);
  }
  const hash = await bcryptjs.hash(pw, 10);
  const user = await db.user.upsert({
    where: { email },
    update: { password: hash, role: "ADMIN", emailVerified: true, updatedAt: new Date() },
    create: {
      email,
      password: hash,
      name: "Platform Admin",
      role: "ADMIN",
      emailVerified: true,
      updatedAt: new Date(),
    },
  });
  console.log(`OK: admin user ready -> id=${user.id} email=${user.email} role=${user.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
