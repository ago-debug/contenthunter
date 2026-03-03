import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Listing Catalog entries...");
    const catalogs = await prisma.catalog.findMany({
        include: { pdfs: true }
    });
    console.log(JSON.stringify(catalogs, null, 2));
}

main().finally(() => prisma.$disconnect());
