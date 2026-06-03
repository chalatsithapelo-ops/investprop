import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Show RAISING_FUNDS properties
  const props = await db.property.findMany({
    where: { investmentStatus: "RAISING_FUNDS" },
    select: { id: true, title: true, fundingGoal: true, fundingRaised: true, minimumInvestment: true, maxInvestors: true, expectedReturns: true, isPublished: true },
  });
  console.log("RAISING_FUNDS properties:", JSON.stringify(props, null, 2));

  // Ensure all RAISING_FUNDS properties are published
  const result = await db.property.updateMany({
    where: { investmentStatus: "RAISING_FUNDS", isPublished: false },
    data: { isPublished: true },
  });
  console.log(`Updated ${result.count} properties to isPublished=true`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
