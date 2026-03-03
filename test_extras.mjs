import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    const extras = await prisma.productExtra.findMany({
        distinct: ['key'],
        select: { key: true }
    });
    console.log("Distinct Extra Keys:", extras.map(e => e.key));
}
run().finally(() => prisma.$disconnect());
