const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Cleaning up massive Base64 strings to restore system stability...");
    const result = await prisma.productImage.updateMany({
        where: {
            imageUrl: {
                startsWith: 'data:image'
            }
        },
        data: {
            imageUrl: 'BASE64_IMAGE_CLEANED_FOR_STABILITY'
        }
    });
    console.log(`Cleaned ${result.count} images.`);
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
