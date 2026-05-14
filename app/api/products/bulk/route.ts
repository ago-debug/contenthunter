import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { normalizeStockExtraKey } from "@/lib/stock-extra";
import { resolveBulkFieldTemplate, type BulkProductSnapshot } from "@/lib/bulk-field-template";
import { stripHtmlToPlainText } from "@/lib/strip-html-to-plain-text";

/** Evita timeout su operazioni lunghe (hosting serverless / proxy) */
export const maxDuration = 300;

function imageFileNameFromUrl(rawUrl: string): string {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed) return "";
    const noQuery = trimmed.split("?")[0].split("#")[0];
    const parts = noQuery.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    try {
        return decodeURIComponent(last).trim().toLowerCase();
    } catch {
        return last.trim().toLowerCase();
    }
}

function normalizeExtraKeyForStock(rawKey: string): string {
    return normalizeStockExtraKey(rawKey) || rawKey;
}

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
            brand?: string;
        };

        const requiresIds = action !== "dedupe_images";
        if (requiresIds && (!ids || !Array.isArray(ids) || ids.length === 0)) {
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

        /** Rimuove tag HTML da descrizione lunga, doc, bullet e breve SEO (tutte le lingue dei record ProductText). */
        if (action === "strip_html_descriptions") {
            const texts = await prisma.productText.findMany({
                where: { productId: { in: ids } },
                select: {
                    id: true,
                    description: true,
                    docDescription: true,
                    bulletPoints: true,
                    seoAiText: true,
                },
            });

            if (texts.length === 0) {
                return NextResponse.json({ success: true, count: 0 });
            }

            const updates = texts.flatMap((t) => {
                const description = stripHtmlToPlainText(t.description);
                const docDescription = stripHtmlToPlainText(t.docDescription);
                const bulletPoints = stripHtmlToPlainText(t.bulletPoints);
                const seoAiText = stripHtmlToPlainText(t.seoAiText);
                const same =
                    description === (t.description ?? "") &&
                    docDescription === (t.docDescription ?? "") &&
                    bulletPoints === (t.bulletPoints ?? "") &&
                    seoAiText === (t.seoAiText ?? "");
                if (same) return [];
                return [
                    prisma.productText.update({
                        where: { id: t.id },
                        data: { description, docDescription, bulletPoints, seoAiText },
                    }),
                ];
            });

            if (updates.length === 0) {
                return NextResponse.json({ success: true, count: 0 });
            }

            await prisma.$transaction(updates);
            return NextResponse.json({ success: true, count: updates.length });
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

            const cleanIds = ids
                .map((x: unknown) => Number(x))
                .filter((n): n is number => Number.isInteger(n) && n > 0);
            if (cleanIds.length === 0) {
                return NextResponse.json({ error: "Nessun ID prodotto valido" }, { status: 400 });
            }

            const products = await prisma.product.findMany({
                where: { id: { in: cleanIds } },
                // select minimale: compatibile con DB legacy senza vatCodeId
                select: {
                    id: true,
                    sku: true,
                    ean: true,
                    parentSku: true,
                    brand: true,
                    category: true,
                    extraFields: { select: { key: true, value: true } },
                    texts: { where: { language }, select: { id: true, title: true } },
                    prices: { where: { listName: "default" }, select: { price: true } },
                },
            });

            let updatedCount = 0;
            let skippedCount = 0;
            /** Campi scelti ma tutti vuoti su quel prodotto (nessun extra / brand, ecc.) */
            let noFieldValuesCount = 0;

            const normCompare = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

            const toUpsert: { productId: number; newTitle: string }[] = [];

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

                toUpsert.push({ productId: p.id, newTitle });
            }

            if (toUpsert.length > 0) {
                await prisma.$transaction(async (tx) => {
                    await Promise.all(
                        toUpsert.map((u) =>
                            tx.productText.upsert({
                                where: {
                                    productId_language: { productId: u.productId, language }
                                },
                                create: {
                                    productId: u.productId,
                                    language,
                                    title: u.newTitle
                                },
                                update: { title: u.newTitle }
                            })
                        )
                    );
                });
                updatedCount = toUpsert.length;
            }

            return NextResponse.json({
                success: true,
                count: updatedCount,
                skipped: skippedCount,
                noFieldValues: noFieldValuesCount
            });
        }

        /** Imposta lo stesso valore su un campo per tutti gli ID (o solo se vuoto) */
        if (action === "bulk_set_field") {
            const fieldPath = String((body as any).fieldPath ?? "").trim();
            const valueRaw = (body as any).value;
            const onlyIfEmpty = (body as any).onlyIfEmpty === true;
            const strVal = valueRaw == null ? "" : String(valueRaw);

            if (!fieldPath) {
                return NextResponse.json({ error: "fieldPath obbligatorio" }, { status: 400 });
            }

            const cleanIds = ids
                .map((x: unknown) => Number(x))
                .filter((n): n is number => Number.isInteger(n) && n > 0);
            if (cleanIds.length === 0) {
                return NextResponse.json({ error: "Nessun ID valido" }, { status: 400 });
            }

            const fpLower = fieldPath.toLowerCase();
            const isExtra = fpLower.startsWith("extra:");
            const allowEmptyClear =
                isExtra ||
                [
                    "categoryid",
                    "subcategoryid",
                    "subsubcategoryid",
                    "brandid",
                    "ean",
                    "parentsku",
                    "brand",
                    "category",
                    "title",
                    "description",
                    "docdescription",
                    "bulletpoints",
                    "seoaitext",
                    "currency",
                    "dimensions",
                    "weight",
                    "material",
                    "vatcodeid"
                ].includes(fpLower);
            if (fpLower === "sku" && !strVal.trim()) {
                return NextResponse.json({ error: "Valore obbligatorio per SKU" }, { status: 400 });
            }
            if (fpLower === "price" && !strVal.trim()) {
                return NextResponse.json({ error: "Valore obbligatorio per il prezzo" }, { status: 400 });
            }
            if (!isExtra && !strVal.trim() && fpLower !== "price" && !allowEmptyClear) {
                return NextResponse.json({ error: "Valore obbligatorio per questo campo" }, { status: 400 });
            }
            if (isExtra && fieldPath.length <= 6) {
                return NextResponse.json({ error: "Usa extra:nome_campo" }, { status: 400 });
            }

            const allowedNonExtra = new Set([
                "brand",
                "category",
                "ean",
                "parentsku",
                "sku",
                "brandid",
                "categoryid",
                "subcategoryid",
                "subsubcategoryid",
                "dimensions",
                "weight",
                "material",
                "title",
                "description",
                "docdescription",
                "bulletpoints",
                "seoaitext",
                "currency",
                "price",
                "vatcodeid"
            ]);
            if (!isExtra && !allowedNonExtra.has(fpLower)) {
                return NextResponse.json({ error: `Campo non supportato: ${fieldPath}` }, { status: 400 });
            }

            let updated = 0;
            let skipped = 0;

            const CHUNK = 50;
            for (let i = 0; i < cleanIds.length; i += CHUNK) {
                const batch = cleanIds.slice(i, i + CHUNK);
                const products = await prisma.product.findMany({
                    where: { id: { in: batch } },
                    // select minimale: compatibile con DB legacy senza vatCodeId
                    select: {
                        id: true,
                        companyId: true,
                        sku: true,
                        ean: true,
                        parentSku: true,
                        brand: true,
                        category: true,
                        brandId: true,
                        categoryId: true,
                        subCategoryId: true,
                        subSubCategoryId: true,
                        vatCodeId: true,
                        texts: {
                            where: { language: "it" },
                            select: {
                                id: true,
                                title: true,
                                description: true,
                                docDescription: true,
                                bulletPoints: true,
                                seoAiText: true,
                            },
                        },
                        extraFields: { select: { key: true, value: true } },
                        prices: {
                            where: { listName: "default" },
                            select: { price: true, currency: true },
                        },
                    },
                });

                await Promise.all(
                    products.map(async (p) => {
                        const strValResolved = resolveBulkFieldTemplate(strVal, p as BulkProductSnapshot);
                        if (isExtra) {
                            const ekRaw = fieldPath.slice(fieldPath.indexOf(":") + 1).trim();
                            const ek = normalizeExtraKeyForStock(ekRaw);
                            if (!ek) return;
                            const existing = p.extraFields.find(
                                (e) => normalizeExtraKeyForStock(e.key).toLowerCase() === ek.toLowerCase()
                            );
                            const dbKey = existing?.key ?? ek;
                            if (!strValResolved.trim()) {
                                if (existing) {
                                    await prisma.productExtra.delete({
                                        where: { productId_key: { productId: p.id, key: dbKey } }
                                    });
                                    updated++;
                                } else {
                                    skipped++;
                                }
                                return;
                            }
                            if (onlyIfEmpty && (existing?.value || "").trim()) {
                                skipped++;
                                return;
                            }
                            await prisma.productExtra.upsert({
                                where: { productId_key: { productId: p.id, key: dbKey } },
                                create: { productId: p.id, key: ek, value: strValResolved },
                                update: { value: strValResolved }
                            });
                            updated++;
                            return;
                        }

                        if (fpLower === "brand") {
                            if (onlyIfEmpty && (p.brand || "").trim()) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { brand: strValResolved || null }
                            });
                            updated++;
                        } else if (fpLower === "category") {
                            if (onlyIfEmpty && (p.category || "").trim()) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { category: strValResolved || null }
                            });
                            updated++;
                        } else if (fpLower === "ean") {
                            if (onlyIfEmpty && (p.ean || "").trim()) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { ean: strValResolved || null }
                            });
                            updated++;
                        } else if (fpLower === "parentsku") {
                            if (onlyIfEmpty && (p.parentSku || "").trim()) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { parentSku: strValResolved || null }
                            });
                            updated++;
                        } else if (fpLower === "sku") {
                            const newSku = strValResolved.trim();
                            if (!newSku) {
                                skipped++;
                                return;
                            }
                            if (onlyIfEmpty && (p.sku || "").trim()) {
                                skipped++;
                                return;
                            }
                            if (newSku === p.sku) {
                                skipped++;
                                return;
                            }
                            try {
                                await prisma.product.update({
                                    where: { id: p.id },
                                    data: { sku: newSku }
                                });
                                updated++;
                            } catch {
                                skipped++;
                            }
                        } else if (fpLower === "vatcodeid") {
                            const t = strValResolved.trim();
                            if (!t) {
                                if (onlyIfEmpty && p.vatCodeId != null) {
                                    skipped++;
                                    return;
                                }
                                await prisma.product.update({
                                    where: { id: p.id },
                                    data: { vatCodeId: null },
                                });
                                updated++;
                                return;
                            }
                            const n = parseInt(t, 10);
                            if (Number.isNaN(n)) {
                                skipped++;
                                return;
                            }
                            const vc = await prisma.vatCode.findFirst({
                                where: { id: n, companyId: p.companyId },
                                select: { id: true },
                            });
                            if (!vc) {
                                skipped++;
                                return;
                            }
                            if (onlyIfEmpty && p.vatCodeId != null) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { vatCodeId: n },
                            });
                            updated++;
                        } else if (fpLower === "brandid") {
                            const t = strValResolved.trim();
                            if (!t) {
                                if (onlyIfEmpty && p.brandId != null) {
                                    skipped++;
                                    return;
                                }
                                await prisma.product.update({
                                    where: { id: p.id },
                                    data: { brandId: null }
                                });
                                updated++;
                                return;
                            }
                            const n = parseInt(t, 10);
                            if (Number.isNaN(n)) {
                                skipped++;
                                return;
                            }
                            if (onlyIfEmpty && p.brandId != null) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { brandId: n }
                            });
                            updated++;
                        } else if (fpLower === "categoryid") {
                            const t = strValResolved.trim();
                            if (!t) {
                                if (onlyIfEmpty && p.categoryId != null) {
                                    skipped++;
                                    return;
                                }
                                await prisma.product.update({
                                    where: { id: p.id },
                                    data: { categoryId: null }
                                });
                                updated++;
                                return;
                            }
                            const n = parseInt(t, 10);
                            if (Number.isNaN(n)) {
                                skipped++;
                                return;
                            }
                            if (onlyIfEmpty && p.categoryId != null) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { categoryId: n }
                            });
                            updated++;
                        } else if (fpLower === "subcategoryid") {
                            const t = strValResolved.trim();
                            if (!t) {
                                if (onlyIfEmpty && p.subCategoryId != null) {
                                    skipped++;
                                    return;
                                }
                                await prisma.product.update({
                                    where: { id: p.id },
                                    data: { subCategoryId: null }
                                });
                                updated++;
                                return;
                            }
                            const n = parseInt(t, 10);
                            if (Number.isNaN(n)) {
                                skipped++;
                                return;
                            }
                            if (onlyIfEmpty && p.subCategoryId != null) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { subCategoryId: n }
                            });
                            updated++;
                        } else if (fpLower === "subsubcategoryid") {
                            const t = strValResolved.trim();
                            if (!t) {
                                if (onlyIfEmpty && p.subSubCategoryId != null) {
                                    skipped++;
                                    return;
                                }
                                await prisma.product.update({
                                    where: { id: p.id },
                                    data: { subSubCategoryId: null }
                                });
                                updated++;
                                return;
                            }
                            const n = parseInt(t, 10);
                            if (Number.isNaN(n)) {
                                skipped++;
                                return;
                            }
                            if (onlyIfEmpty && p.subSubCategoryId != null) {
                                skipped++;
                                return;
                            }
                            await prisma.product.update({
                                where: { id: p.id },
                                data: { subSubCategoryId: n }
                            });
                            updated++;
                        } else if (fpLower === "dimensions" || fpLower === "weight" || fpLower === "material") {
                            const key = fpLower === "dimensions" ? "dimensions" : fpLower === "weight" ? "weight" : "material";
                            const existing = p.extraFields.find((e) => e.key.toLowerCase() === key);
                            if (!strValResolved.trim()) {
                                if (existing) {
                                    await prisma.productExtra.delete({
                                        where: { productId_key: { productId: p.id, key } }
                                    });
                                    updated++;
                                } else {
                                    skipped++;
                                }
                                return;
                            }
                            if (onlyIfEmpty && (existing?.value || "").trim()) {
                                skipped++;
                                return;
                            }
                            await prisma.productExtra.upsert({
                                where: { productId_key: { productId: p.id, key } },
                                create: { productId: p.id, key, value: strValResolved },
                                update: { value: strValResolved }
                            });
                            updated++;
                        } else if (
                            ["title", "description", "docdescription", "bulletpoints", "seoaitext"].includes(fpLower)
                        ) {
                            const colMap: Record<string, "title" | "description" | "docDescription" | "bulletPoints" | "seoAiText"> =
                                {
                                    title: "title",
                                    description: "description",
                                    docdescription: "docDescription",
                                    bulletpoints: "bulletPoints",
                                    seoaitext: "seoAiText"
                                };
                            const col = colMap[fpLower];
                            const textRow = p.texts[0];
                            const cur = (textRow as Record<string, unknown> | undefined)?.[col] ?? "";
                            if (onlyIfEmpty && String(cur).trim()) {
                                skipped++;
                                return;
                            }
                            await prisma.productText.upsert({
                                where: {
                                    productId_language: { productId: p.id, language: "it" }
                                },
                                create: {
                                    productId: p.id,
                                    language: "it",
                                    [col]: strValResolved || null
                                },
                                update: { [col]: strValResolved || null }
                            });
                            updated++;
                        } else if (fpLower === "currency") {
                            const cur = (strValResolved.trim() || "EUR").toUpperCase().slice(0, 3) || "EUR";
                            const pr = p.prices[0];
                            if (onlyIfEmpty && (pr?.currency || "").trim()) {
                                skipped++;
                                return;
                            }
                            const priceNum =
                                pr != null && typeof pr.price === "number" && !Number.isNaN(pr.price) ? pr.price : 0;
                            await prisma.productPrice.upsert({
                                where: {
                                    productId_listName: { productId: p.id, listName: "default" }
                                },
                                create: {
                                    productId: p.id,
                                    listName: "default",
                                    price: priceNum,
                                    currency: cur
                                },
                                update: { currency: cur }
                            });
                            updated++;
                        } else if (fpLower === "price") {
                            const num = parseFloat(
                                strValResolved.replace(/[^0-9.,-]/g, "").replace(",", ".")
                            );
                            if (isNaN(num)) {
                                skipped++;
                                return;
                            }
                            const pr = p.prices[0];
                            if (onlyIfEmpty && pr != null && !isNaN(pr.price) && pr.price !== 0) {
                                skipped++;
                                return;
                            }
                            const cur =
                                pr != null && (pr.currency || "").trim()
                                    ? String(pr.currency).toUpperCase().slice(0, 3)
                                    : "EUR";
                            await prisma.productPrice.upsert({
                                where: {
                                    productId_listName: { productId: p.id, listName: "default" }
                                },
                                create: { productId: p.id, listName: "default", price: num, currency: cur },
                                update: { price: num }
                            });
                            updated++;
                        } else {
                            // Non dovrebbe accadere: campo già validato in allowedNonExtra.
                            skipped++;
                        }
                    })
                );
            }

            return NextResponse.json({ success: true, updated, skipped });
        }

        if (action === "dedupe_images") {
            const brandRaw = String((body as any).brand ?? "").trim();
            const cleanIds = Array.isArray(ids)
                ? ids
                      .map((x: unknown) => Number(x))
                      .filter((n): n is number => Number.isInteger(n) && n > 0)
                : [];

            if (cleanIds.length === 0 && !brandRaw) {
                return NextResponse.json(
                    { error: "Fornisci almeno ids oppure brand per deduplicare le immagini." },
                    { status: 400 }
                );
            }

            const where: any = {};
            if (cleanIds.length > 0) where.id = { in: cleanIds };
            if (brandRaw) where.brand = brandRaw;

            const products = await prisma.product.findMany({
                where,
                // select minimale: evita crash se il DB non ha ancora colonne nuove (es. vatCodeId)
                select: {
                    id: true,
                    images: { select: { id: true, imageUrl: true } },
                },
            });

            let productsTouched = 0;
            let deletedImages = 0;

            for (const p of products) {
                const seen = new Set<string>();
                const toDelete: number[] = [];
                for (const img of p.images) {
                    const fileName = imageFileNameFromUrl(img.imageUrl || "");
                    if (!fileName) {
                        toDelete.push(img.id);
                        continue;
                    }
                    if (seen.has(fileName)) {
                        toDelete.push(img.id);
                    } else {
                        seen.add(fileName);
                    }
                }
                if (toDelete.length > 0) {
                    await prisma.productImage.deleteMany({
                        where: { id: { in: toDelete } },
                    });
                    productsTouched++;
                    deletedImages += toDelete.length;
                }
            }

            return NextResponse.json({
                success: true,
                productsChecked: products.length,
                productsTouched,
                deletedImages,
                filterBrand: brandRaw || null,
            });
        }

        return NextResponse.json({ error: "Invalid bulk action" }, { status: 400 });
    } catch (err: any) {
        console.error("Bulk action error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
