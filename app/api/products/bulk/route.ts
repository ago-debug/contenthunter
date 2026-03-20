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
        const { ids, action, prefix, search, replace } = body as {
            ids: number[];
            action: string;
            prefix?: string;
            search?: string;
            replace?: string;
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

        // Bulk replace a part of the Italian title and ensure the new text is present
        if (action === "replace_title_part") {
            const cleanReplace = (replace ?? "").trim();
            const cleanSearch = (search ?? "").toString();

            if (!cleanReplace) {
                return NextResponse.json({ error: "Replace text is required" }, { status: 400 });
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

            let updatedCount = 0;

            const replaceLower = cleanReplace.toLowerCase();

            for (const t of texts) {
                const currentTitle = (t.title || "").toString();
                let newTitle = currentTitle;

                if (cleanSearch) {
                    newTitle = newTitle.split(cleanSearch).join(cleanReplace);
                }

                // Assicura che "replace" sia all'inizio del titolo: se manca lo aggiungi davanti, se c'è ma non in testa spostalo in testa
                const base = newTitle.trim().replace(/\s+/g, " ");
                const normalizedForCheck = base.toLowerCase();
                if (!normalizedForCheck.includes(replaceLower)) {
                    newTitle = base ? cleanReplace + " " + base : cleanReplace;
                } else if (!normalizedForCheck.startsWith(replaceLower)) {
                    // Contiene già il testo ma non in testa: rimuovi un'occorrenza e metti in testa
                    const escaped = cleanReplace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const withoutOne = base.replace(new RegExp(escaped, "gi"), "").trim().replace(/\s+/g, " ");
                    newTitle = withoutOne ? cleanReplace + " " + withoutOne : cleanReplace;
                }

                newTitle = newTitle.trim();
                if (newTitle === currentTitle.trim()) {
                    continue;
                }

                try {
                    await prisma.productText.update({
                        where: { id: t.id },
                        data: { title: newTitle }
                    });
                    updatedCount++;
                } catch (e) {
                    console.error("Bulk replace_title_part single update error:", e);
                }
            }

            return NextResponse.json({ success: true, count: updatedCount });
        }

        // Aggiunge al titolo (lingua IT) valori presi dagli stessi prodotti (SKU, extra, ecc.)
        if (action === "append_product_fields_to_title") {
            const fields = (body as any).fields as string[] | undefined;
            const position = (body as any).position as string | undefined;
            const separatorRaw = ((body as any).separator ?? " · ").toString();
            const separator = separatorRaw.trim() === "" ? " · " : separatorRaw;
            const language = ((body as any).language ?? "it").toString();

            if (!fields || !Array.isArray(fields) || fields.length === 0) {
                return NextResponse.json({ error: "fields (array) is required" }, { status: 400 });
            }
            if (position !== "start" && position !== "end") {
                return NextResponse.json({ error: "position must be start or end" }, { status: 400 });
            }

            const buildExtraLowerMap = (extras: { key: string; value: string }[]) => {
                const m: Record<string, string> = {};
                for (const ex of extras) {
                    m[ex.key.toLowerCase()] = (ex.value ?? "").trim();
                }
                return m;
            };

            const resolveProductFieldValue = (
                p: {
                    sku: string;
                    ean: string | null;
                    parentSku: string | null;
                    brand: string | null;
                    category: string | null;
                    extraFields: { key: string; value: string }[];
                    prices: { price: number }[];
                },
                fieldId: string
            ): string => {
                const id = fieldId.trim();
                if (!id) return "";
                const lower = id.toLowerCase();
                const xm = buildExtraLowerMap(p.extraFields);

                switch (lower) {
                    case "sku":
                        return (p.sku || "").trim();
                    case "ean":
                        return (p.ean || "").trim();
                    case "parentsku":
                    case "parent_sku":
                        return (p.parentSku || "").trim();
                    case "brand":
                        return (p.brand || "").trim();
                    case "category":
                    case "categoria":
                        return (p.category || "").trim();
                    case "dimensions":
                    case "dimensioni":
                        return xm["dimensions"] || "";
                    case "weight":
                    case "peso":
                        return xm["weight"] || "";
                    case "material":
                    case "materiale":
                        return xm["material"] || "";
                    case "price":
                    case "prezzo": {
                        const pr = p.prices?.[0];
                        return pr != null && pr.price != null ? String(pr.price) : "";
                    }
                    default:
                        return xm[lower] || "";
                }
            };

            const products = await prisma.product.findMany({
                where: { id: { in: ids } },
                include: {
                    extraFields: true,
                    texts: { where: { language } },
                    prices: { where: { listName: "default" } }
                }
            });

            let updatedCount = 0;
            let skippedCount = 0;
            /** Campi scelti ma tutti vuoti su quel prodotto (nessun extra / brand, ecc.) */
            let noFieldValuesCount = 0;

            const normCompare = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

            for (const p of products) {
                const textRow = p.texts[0];
                const parts: string[] = [];
                for (const fid of fields) {
                    const v = resolveProductFieldValue(p, fid);
                    if (v) parts.push(v);
                }

                if (parts.length === 0) {
                    noFieldValuesCount++;
                    continue;
                }

                const chunk = parts.join(separator).trim();
                const currentTitle = (textRow?.title || "").toString().trim();
                const nt = normCompare(currentTitle);
                const nc = normCompare(chunk);

                // Solo blocco intero: il controllo "ogni valore nel titolo" saltava tutto con falsi positivi
                // (es. prezzo "89", lettere corte contenute in altre parole).
                const chunkAlreadyInTitle = nc.length > 0 && nt.includes(nc);

                if (chunkAlreadyInTitle) {
                    skippedCount++;
                    continue;
                }

                let newTitle: string;
                if (position === "start") {
                    newTitle = currentTitle ? `${chunk}${separator}${currentTitle}`.trim() : chunk;
                } else {
                    newTitle = currentTitle ? `${currentTitle}${separator}${chunk}`.trim() : chunk;
                }

                newTitle = newTitle.replace(/\s+/g, " ").trim();
                if (newTitle === currentTitle) continue;

                await prisma.productText.upsert({
                    where: {
                        productId_language: { productId: p.id, language }
                    },
                    create: {
                        productId: p.id,
                        language,
                        title: newTitle
                    },
                    update: { title: newTitle }
                });
                updatedCount++;
            }

            return NextResponse.json({
                success: true,
                count: updatedCount,
                skipped: skippedCount,
                noFieldValues: noFieldValuesCount
            });
        }

        return NextResponse.json({ error: "Invalid bulk action" }, { status: 400 });
    } catch (err: any) {
        console.error("Bulk action error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
