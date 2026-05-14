const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const productCount = await prisma.product.count();
        const catalogCount = await prisma.catalog.count();
        const entryCount = await prisma.catalogEntry.count();

        console.log('Total products:', productCount);
        console.log('Total catalogs:', catalogCount);
        console.log('Total catalog entries:', entryCount);

        const catalogs = await prisma.catalog.findMany();
        console.log('Catalogs:', JSON.stringify(catalogs, null, 2));

        const sampleEntries = await prisma.catalogEntry.findMany({ take: 5 });
        console.log('Sample entries:', JSON.stringify(sampleEntries, null, 2));
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
