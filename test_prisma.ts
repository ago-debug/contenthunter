import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        const query = "DECO-DANEP"
        const matches = await (prisma as any).pdfPage.findMany({
            where: {
                text: {
                    contains: query
                }
            },
            include: {
                catalog: true
            },
            take: 20
        });
        console.log("Matches found:", matches.length);
        console.log("First match snippet:", matches[0]?.text?.substring(0, 100));
    } catch (e) {
        console.error("Query failed:", e);
    } finally {
        await prisma.$disconnect()
    }
}

main()
