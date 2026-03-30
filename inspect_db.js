const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const models = ['catalog', 'product', 'user', 'brand', 'category', 'tag', 'stagingProduct'];
        for (const model of models) {
            try {
                const count = await prisma[model].count();
                console.log(`Table ${model}: ${count} records`);
            } catch (e) {
                console.log(`Table ${model} error or not found: ${e.message}`);
            }
        }
    } catch (e) {
        console.error('General error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
