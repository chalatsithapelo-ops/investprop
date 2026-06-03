import { PrismaClient } from "@prisma/client";
const p = new PrismaClient({ log: [] });

try {
  // Also sync the main Property.fundingGoal to match the flip sub-type goal (R340,000)
  // for consistency. The sub-type goal is the source of truth per getPropertyById logic.
  await p.property.update({
    where: { id: 9 },
    data: {
      fundingGoal: 340000,
    },
  });

  console.log("SYNCED: Property.fundingGoal set to 340000 to match PropertyFlip.fundingGoal");

  // Final verification
  const prop = await p.property.findUnique({
    where: { id: 9 },
    select: { id: true, title: true, fundingGoal: true, fundingRaised: true, investmentStatus: true, isPublished: true }
  });
  console.log("FINAL:", JSON.stringify(prop));
} catch(e) {
  console.error("ERROR:", e.message);
}
process.exit(0);
