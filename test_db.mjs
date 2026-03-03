import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const textHasBullets = await prisma.productText.findFirst({
        where: { bulletPoints: { not: null, not: '' } }
    });
    console.log("ProductText with bulletPoints:", textHasBullets);

    const extraHasBullets = await prisma.productExtra.findFirst({
        where: { key: { contains: 'bullet' } }
    });
    console.log("ProductExtra with bullet:", extraHasBullets);

    const extraTecnico = await prisma.productExtra.findFirst({
        where: { key: { contains: 'TECNICO' } }
    });
    console.log("ProductExtra with TECNICO:", extraTecnico);
    
    // Also check Caratteristiche
    const extraCaratt = await prisma.productExtra.findFirst({
        where: { key: { contains: 'caratteristiche' } }
    });
    console.log("ProductExtra with caratteristiche:", extraCaratt);
}
run().finally(() => prisma.$disconnect());
