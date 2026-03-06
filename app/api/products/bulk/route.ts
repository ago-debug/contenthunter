import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

// Helper to normalize Italian product titles:
// - trim + collapse multiple spaces
// - lowercase everything
// - capitalize first letter of each word except common short words (unless first word)
function normalizeTitle(raw: string | null | undefined): string {
    if (!raw) return "";
    let text = raw.trim().replace(/\s+/g, " ").toLowerCase();
    if (!text) return "";

    const smallWords = new Set([
        "di", "a", "da", "in", "con", "su", "per", "tra", "fra",
        "e", "ed", "o",
        "il", "lo", "la", "i", "gli", "le",
        "un", "uno", "una",
        "al", "allo", "alla", "ai", "agli", "alle",
        "dal", "dallo", "dalla", "dai", "dagli", "dalle",
        "del", "dello", "della", "dei", "degli", "delle"
    ]);

    const words = text.split(" ");
    const result: string[] = [];

    words.forEach((word, index) => {
        const bare = word.replace(/[^a-zàèéìòóù]/g, "");
        const isSmall = smallWords.has(bare);
        const shouldCapitalize = index === 0 || !isSmall;

        if (shouldCapitalize && word.length > 0) {
            result.push(word.charAt(0).toUpperCase() + word.slice(1));
        } else {
            result.push(word);
        }
    });

    return result.join(" ");
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { ids, action, prefix } = body as {
            ids: number[];
            action: string;
            prefix?: string;
        };

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
        }

        if (action === "delete") {
            await prisma.product.deleteMany({
                where: { id: { in: ids } }
            });
            return NextResponse.json({ success: true, count: ids.length });
        }

        // Bulk normalize Italian titles
        if (action === "normalize_titles") {
            const texts = await prisma.productText.findMany({
                where: {
                    productId: { in: ids },
                    language: "it"
                },
                select: { id: true, title: true }
            });

            if (texts.length === 0) {
                return NextResponse.json({ success: true, count: 0 });
            }

            await prisma.$transaction(
                texts.map((t) =>
                    prisma.productText.update({
                        where: { id: t.id },
                        data: { title: normalizeTitle(t.title) }
                    })
                )
            );

            return NextResponse.json({ success: true, count: texts.length });
        }

        // Bulk add prefix to Italian titles
        if (action === "add_title_prefix") {
            const cleanPrefix = (prefix ?? "").trim();
            if (!cleanPrefix) {
                return NextResponse.json({ error: "Prefix is required" }, { status: 400 });
            }

            const texts = await prisma.productText.findMany({
                where: {
                    productId: { in: ids },
                    language: "it"
                },
                select: { id: true, title: true }
            });

            if (texts.length === 0) {
                return NextResponse.json({ success: true, count: 0 });
            }

            await prisma.$transaction(
                texts.map((t) =>
                    prisma.productText.update({
                        where: { id: t.id },
                        data: {
                            title: `${cleanPrefix} ${t.title ?? ""}`.trim()
                        }
                    })
                )
            );

            return NextResponse.json({ success: true, count: texts.length });
        }

        return NextResponse.json({ error: "Invalid bulk action" }, { status: 400 });
    } catch (err: any) {
        console.error("Bulk action error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
