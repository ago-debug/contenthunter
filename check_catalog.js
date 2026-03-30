const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const catalog = await prisma.catalog.findFirst();
    console.log('Catalog:', JSON.stringify(catalog, null, 2));
}

main().finally(() => prisma.$disconnect());
