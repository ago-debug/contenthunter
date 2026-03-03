import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Inizia sincronizzazione Bullet Points...");

    // Trova tutti i testi dei prodotti che hanno i bullet point salvati come stringa
    const textsWithBullets = await prisma.productText.findMany({
        where: {
            bulletPoints: {
                not: null,
                not: ''
            }
        },
        include: {
            product: {
                include: {
                    bulletPointRefs: true
                }
            }
        }
    });

    console.log(`Trovati ${textsWithBullets.length} prodotti con stringhe di bullet points da migrare.`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const text of textsWithBullets) {
        if (!text.bulletPoints || !text.product) continue;

        // Dividi in righe, pulisci e rimuovi eventuali righe vuote
        const bullets = text.bulletPoints
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                // Rimuove trattini o asterischi iniziali
                let cleaned = line;
                if (cleaned.startsWith('- ')) cleaned = cleaned.substring(2);
                if (cleaned.startsWith('* ')) cleaned = cleaned.substring(2);
                return cleaned.trim();
            });

        const existingBulletContents = text.product.bulletPointRefs.map(b => b.content);

        for (const content of bullets) {
            // Se non esiste già un bullet point identico per questo prodotto
            if (!existingBulletContents.includes(content)) {
                await prisma.bulletPoint.create({
                    data: {
                        content: content,
                        productId: text.productId
                    }
                });
                createdCount++;
            } else {
                skippedCount++;
            }
        }
    }

    console.log(`Migrazione completata!`);
    console.log(`Nuovi Bullet Points creati: ${createdCount}`);
    console.log(`Bullet Points già esistenti (saltati): ${skippedCount}`);
}

run()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
