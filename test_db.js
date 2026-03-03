const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const pdfs = await prisma.catalogPdf.findMany();
    console.log("PDF paths in DB:");
    pdfs.forEach(p => console.log(p.filePath));
}
main().finally(() => prisma.$disconnect());
