// Seed dummy partner + compliance logins for testing the new portals.
// Idempotent (upserts). Usage (inside app container): node scripts/seed-partners-compliance.mjs
//
// Creates:
//   conveyancer@demo.com   -> CONVEYANCER      (linked to "Demo Conveyancing Inc" partner)
//   originator@demo.com    -> BOND_ORIGINATOR  (linked to "Demo Bond Originators" partner)
//   compliance@demo.com    -> COMPLIANCE_OFFICER (RE licence recorded)
//   refuge@refugefs.co.za  -> COMPLIANCE_OFFICER (Refuge Financial Services, per proposal)
//
// All demo passwords: password123

import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";

const db = new PrismaClient();

async function ensurePartner(name, type, contactEmail) {
  const existing = await db.referralPartner.findFirst({ where: { name } });
  if (existing) return existing;
  return db.referralPartner.create({
    data: { name, type, contactEmail, active: true, commissionBps: 0, commissionFlat: 0 },
  });
}

async function upsertUser({ email, name, role, extra = {} }) {
  const password = await bcryptjs.hash("password123", 10);
  const user = await db.user.upsert({
    where: { email },
    update: { role, name, ...extra },
    create: {
      email,
      password,
      name,
      role,
      emailVerified: true,
      status: "ACTIVE",
      updatedAt: new Date(),
      ...extra,
    },
  });
  console.log(`  ✓ ${email} (id ${user.id}) -> ${role}`);
  return user;
}

async function main() {
  console.log("Seeding partner + compliance logins...");

  const conveyPartner = await ensurePartner("Demo Conveyancing Inc", "CONVEYANCER", "conveyancer@demo.com");
  const bondPartner = await ensurePartner("Demo Bond Originators", "BOND_ORIGINATOR", "originator@demo.com");

  await upsertUser({
    email: "conveyancer@demo.com",
    name: "Thandiwe Conveyancer",
    role: "CONVEYANCER",
    extra: { referralPartnerId: conveyPartner.id },
  });

  await upsertUser({
    email: "originator@demo.com",
    name: "Bongani Originator",
    role: "BOND_ORIGINATOR",
    extra: { referralPartnerId: bondPartner.id },
  });

  await upsertUser({
    email: "compliance@demo.com",
    name: "Nomsa Compliance",
    role: "COMPLIANCE_OFFICER",
    extra: { complianceOfficer: true, complianceOfficerLicense: "RE5-DEMO-00001" },
  });

  // Refuge Financial Services — the FSCA-accredited partner from the proposal.
  await upsertUser({
    email: "refuge@refugefs.co.za",
    name: "Refuge Financial Services",
    role: "COMPLIANCE_OFFICER",
    extra: { complianceOfficer: true, complianceOfficerLicense: "FSP-REFUGE-PENDING" },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
