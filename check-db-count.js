const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const count = await prisma.product.count();
        console.log('Total products in database:', count);

        const products = await prisma.product.findMany({
            take: 5,
            include: {
                texts: true,
                prices: true
            }
        });
        console.log('Sample products:', JSON.stringify(products, null, 2));
    } catch (e) {
        console.error('Database connection error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
