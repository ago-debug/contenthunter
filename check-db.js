const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const catalogs = await prisma.catalog.findMany();
    console.log('Catalogs:', catalogs);
    if (catalogs.length === 0) {
        const newCatalog = await prisma.catalog.create({
            data: {
                name: 'Default Catalog',
                filePath: 'none'
            }
        });
        console.log('Created default catalog:', newCatalog);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
