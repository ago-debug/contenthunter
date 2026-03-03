const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
    const pdfs = await prisma.catalogPdf.findMany();
    let updated = 0;
    for (const pdf of pdfs) {
        if (/[^a-zA-Z0-9./_-]/.test(pdf.filePath)) {
            const oldPathFull = path.join(process.cwd(), 'public', pdf.filePath);
            const newFilePath = pdf.filePath.replace(/[^a-zA-Z0-9./_-]/g, '_');
            const newPathFull = path.join(process.cwd(), 'public', newFilePath);
            
            if (fs.existsSync(oldPathFull)) {
                fs.renameSync(oldPathFull, newPathFull);
                console.log(`Renamed physical file: ${pdf.filePath} -> ${newFilePath}`);
            } else {
                console.log(`File not found, updating DB anyway: ${pdf.filePath}`);
            }

            await prisma.catalogPdf.update({
                where: { id: pdf.id },
                data: { filePath: newFilePath }
            });
            updated++;
        }
    }
    console.log(`Fixed ${updated} PDF records.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
