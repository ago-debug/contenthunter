const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const images = await prisma.productImage.findMany({
        select: {
            id: true,
            imageUrl: true // This might crash here too if I'm not careful, let's try to just get lengths if possible via raw query if supported, but prisma findMany is risky
        },
        take: 10
    });

    images.forEach(img => {
        console.log(`Image ${img.id} length: ${img.imageUrl.length}`);
    });
}

main().catch(err => console.error("Script failed:", err)).finally(() => prisma.$disconnect());
