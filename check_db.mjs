import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    try {
        const counts = {
            catalogs: await prisma.catalog.count(),
            products: await prisma.product.count(),
            catalogEntries: await prisma.catalogEntry.count()
        };
        console.log(JSON.stringify(counts, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
