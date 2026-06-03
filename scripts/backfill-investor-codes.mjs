import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const users = await db.user.findMany({
    where: { investorCode: null },
    select: { id: true, name: true },
  });

  console.log(`Backfilling ${users.length} users with investor codes...`);

  for (const u of users) {
    const code = `IP-INV-${u.id.toString().padStart(5, "0")}`;
    await db.user.update({ where: { id: u.id }, data: { investorCode: code } });
    console.log(`  ${u.name} (id=${u.id}) → ${code}`);
  }

  console.log("Done!");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
