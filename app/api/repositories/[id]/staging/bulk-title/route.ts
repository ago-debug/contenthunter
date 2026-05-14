import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        if (isNaN(catalogId)) {
            return NextResponse.json({ error: "Invalid catalog ID" }, { status: 400 });
        }

        const body = await req.json();
        const {
            search = "",
            replace = "",
            insertPosition = "end",
        } = body as {
            search?: string;
            replace?: string;
            insertPosition?: "start" | "end";
        };

        const cleanSearch = (search || "").toString();
        const cleanReplace = (replace || "").toString().trim();
        const cleanInsertPosition: "start" | "end" = insertPosition === "start" ? "start" : "end";

        if (!cleanReplace) {
            return NextResponse.json({ error: "Valore da inserire nel titolo non valido." }, { status: 400 });
        }

        const products = await prisma.stagingProduct.findMany({
            where: { catalogId },
            select: {
                id: true,
                texts: {
                    where: { language: "it" },
                },
            },
        });

        let updatedCount = 0;

        for (const prod of products) {
            const baseText = prod.texts[0];
            const currentTitle = (baseText?.title || "").toString();

            let newTitle = currentTitle;

            if (cleanSearch) {
                // sostituisci tutte le occorrenze esatte (case-sensitive) della parte cercata
                newTitle = newTitle.split(cleanSearch).join(cleanReplace);
            }

            // Se dopo la sostituzione il titolo non contiene ancora la parte nuova,
            // la aggiungiamo nella posizione richiesta (inizio/fine).
            if (!newTitle.toLowerCase().includes(cleanReplace.toLowerCase())) {
                newTitle =
                    cleanInsertPosition === "start"
                        ? cleanReplace + (newTitle ? " " + newTitle : "")
                        : (newTitle ? newTitle + " " : "") + cleanReplace;
            }

            if (newTitle === currentTitle) continue;

            if (!baseText) {
                await prisma.stagingProductText.create({
                    data: {
                        stagingProductId: prod.id,
                        language: "it",
                        title: newTitle,
                    },
                });
            } else {
                await prisma.stagingProductText.update({
                    where: { id: baseText.id },
                    data: { title: newTitle },
                });
            }

            updatedCount++;
        }

        return NextResponse.json({
            success: true,
            updatedCount,
        });
    } catch (err: any) {
        console.error("Staging bulk title update error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

