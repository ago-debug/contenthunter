import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

/** Aumenta il limite su ambienti serverless (Vercel Pro / Node). */
export const maxDuration = 300;

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a map of all image files in a directory (recursive)
 * Key: filename without extension (lowercase)
 * Value: array of relative paths
 */
function buildImageMap(root: string, imageMap: Record<string, string[]> = {}) {
    if (!fs.existsSync(root)) return imageMap;
    const dirs: string[] = [root];

    // Iterative traversal: robust with deeply nested folders (10+ levels).
    while (dirs.length > 0) {
        const currentDir = dirs.pop()!;
        const files = fs.readdirSync(currentDir);

        for (const file of files) {
            const fullPath = path.join(currentDir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                dirs.push(fullPath);
                continue;
            }

            const ext = path.extname(file).toLowerCase();
            if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) continue;

            const nameWithoutExt = path.basename(file, ext).toLowerCase();
            const relativePath = path.relative(root, fullPath);
            if (!imageMap[nameWithoutExt]) imageMap[nameWithoutExt] = [];
            imageMap[nameWithoutExt].push(relativePath);
        }
    }

    return imageMap;
}

function normalizeToken(value: string) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[-\s]+/g, "_");
}

/** Pre-filtro veloce (stessa logica iniziale di getImageMatchInfo) per evitare regex su milioni di coppie. */
function couldMatchSkuKey(keyRaw: string, skuRaw: string): boolean {
    const key = normalizeToken(keyRaw);
    const sku = normalizeToken(skuRaw);
    if (!key || !sku) return false;
    if (key === sku) return true;
    if (key.startsWith(`${sku}_`)) return true;
    const tokenRegex = new RegExp(`(^|_)${escapeRegex(sku)}(_|$)`, "i");
    return tokenRegex.test(key);
}

function getImageMatchInfo(keyRaw: string, skuRaw: string): { matched: boolean; index: number } {
    const key = normalizeToken(keyRaw);
    const sku = normalizeToken(skuRaw);
    if (!key || !sku) return { matched: false, index: Number.MAX_SAFE_INTEGER };

    // Exact name = primary image
    if (key === sku) return { matched: true, index: 0 };

    // Primary rule: name starts with SKU (normalized)
    const startsWithSku = key.startsWith(`${sku}_`) || key === sku;

    // Fallback rule (più permissivo): SKU contenuto come token (es. IMG_<SKU>_01)
    const tokenRegex = new RegExp(`(^|_)${sku}(_|$)`, "i");
    const containsSkuToken = tokenRegex.test(key);

    if (!startsWithSku && !containsSkuToken) {
        return { matched: false, index: Number.MAX_SAFE_INTEGER };
    }

    // Per calcolare l'indice, usa l'ultima sequenza numerica come "ordine"
    // (es. _1, _01, _002). Se assente -> 0.
    const restRaw = keyRaw;
    const rest = normalizeToken(restRaw);
    if (!rest) return { matched: true, index: 0 };

    // Accept formats like:
    // SKU_1, SKU_01, SKU_text_1, SKU_text_anything_01
    const trailingIndexMatch = rest.match(/(?:^|[_\-\s])(\d{1,3})$/);
    if (trailingIndexMatch) {
        const n = parseInt(trailingIndexMatch[1], 10);
        return { matched: true, index: Number.isFinite(n) ? n : 0 };
    }

    // SKU + description but no explicit trailing index => still valid, treat as primary.
    return { matched: true, index: 0 };
}

function toPublicUrl(baseUrl: string, relPath: string) {
    const normalizedRelPath = relPath.split(path.sep).join("/");
    if (baseUrl) {
        const encodedPath = normalizedRelPath
            .split("/")
            .filter(Boolean)
            .map((segment) => encodeURIComponent(segment))
            .join("/");
        return baseUrl + encodedPath;
    }
    return `/api/storage?path=${encodeURIComponent(normalizedRelPath)}`;
}

const CREATE_MANY_CHUNK = 300;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const started = Date.now();
    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        const body = await req.json().catch(() => ({}));
        const allowLocalScanFallback =
            body?.allowLocalScanFallback === true ||
            req.nextUrl.searchParams.get("allowLocalScan") === "1";

        const catalog = await prisma.catalog.findUnique({
            where: { id: catalogId }
        });

        if (!catalog || !catalog.imageFolderPath) {
            return NextResponse.json({ error: "Repository or image path not found" }, { status: 404 });
        }

        let inputPath = catalog.imageFolderPath;
        let localPath = inputPath;
        let baseUrl = "";

        // Smart Mapping for URL to Local Path
        if (inputPath.startsWith("http")) {
            baseUrl = inputPath.endsWith("/") ? inputPath : inputPath + "/";
            localPath = path.join(process.cwd(), "public", "catalog_images");
        } else if (inputPath.startsWith("/") || fs.existsSync(inputPath)) {
            // Se è un path fisico sul disco (VPS) o path assoluto, accettalo
            localPath = inputPath;
        } else {
            // Fallback (relativo alla directory del progetto)
            localPath = path.join(process.cwd(), "public", inputPath);
        }

        if (!fs.existsSync(localPath)) {
            return NextResponse.json({ error: `La cartella delle immagini non esiste sul server: ${localPath}` }, { status: 404 });
        }

        const indexPath = path.join(localPath, "images_index.json");
        const externalPath = path.join(localPath, "images_map.json");
        let imageMap: Record<string, string[]> = {};

        // 1. Load or Build the Image Map
        // Priority:
        // 1. Remote images_map.json (if URL project)
        // 2. Local images_map.json (external PHP generated)
        // 3. Local images_index.json (internal cache)
        // 4. Fresh Scan

        let loaded = false;
        let remoteIndexUrlLoaded: string | null = null;

        // Try remote fetch if it's a URL project
        if (baseUrl) {
            const remoteCandidates = ["images_map.json", "images_index.json"];
            for (const name of remoteCandidates) {
                const remoteJsonUrl = baseUrl + name;
                console.log("Attempting to fetch remote index:", remoteJsonUrl);
                try {
                    const response = await fetch(remoteJsonUrl, {
                        signal: AbortSignal.timeout(60000),
                        headers: { Accept: "application/json" },
                    });
                    if (response.ok) {
                        imageMap = await response.json();
                        remoteIndexUrlLoaded = remoteJsonUrl;
                        console.log("Loaded image map from REMOTE URL:", remoteJsonUrl);
                        loaded = true;
                        break;
                    }
                } catch (e) {
                    console.log("Remote index fetch failed:", remoteJsonUrl, e);
                }
            }
        }

        if (!loaded) {
            const targetPath = fs.existsSync(externalPath) ? externalPath : (fs.existsSync(indexPath) ? indexPath : null);

            if (targetPath) {
                try {
                    const indexData = fs.readFileSync(targetPath, "utf-8");
                    imageMap = JSON.parse(indexData);
                    console.log(`Loaded image map from local file: ${path.basename(targetPath)}`);
                    loaded = true;
                } catch (e) {
                    console.error(`Error reading ${targetPath}, rebuilding...`);
                }
            }
        }

        if (!loaded) {
            /**
             * Con percorso immagini = URL remoto: NON fare fallback sulla scansione di
             * `public/catalog_images` (cartella globale, enorme → timeout 504).
             * Serve un indice JSON sul server remoto, oppure un path locale esplicito.
             */
            if (baseUrl && !allowLocalScanFallback) {
                return NextResponse.json(
                    {
                        error:
                            "Indice immagini remoto non disponibile. Carica sul server immagini un file " +
                            "`images_map.json` (o `images_index.json`) nella stessa cartella dell'URL configurato, " +
                            "oppure usa un percorso cartella locale sul server. " +
                            "Evitiamo la scansione automatica della cartella globale che causerebbe timeout.",
                        code: "REMOTE_IMAGE_INDEX_REQUIRED",
                        hint: `Tentativi: ${baseUrl}images_map.json , ${baseUrl}images_index.json. Solo emergenza: POST JSON {"allowLocalScanFallback":true} per forzare la scansione locale (può essere lentissima).`,
                    },
                    { status: 422 }
                );
            }

            console.log("No index found (remote or local), scanning subdirectories...");
            imageMap = buildImageMap(localPath);
            // Save internal index for next time (if local folder is writable)
            try {
                fs.writeFileSync(indexPath, JSON.stringify(imageMap, null, 2));
            } catch (e: any) {
                console.warn("Could not save local index cache:", e.message);
            }
        }

        const imageKeys = Object.keys(imageMap || {});
        const totalCandidateKeys = imageKeys.length;

        // 2. Tutti i prodotti staging + immagini esistenti in UNA query (evita N+1)
        const products = await prisma.stagingProduct.findMany({
            where: { catalogId },
            select: {
                id: true,
                sku: true,
                images: { select: { imageUrl: true } }
            }
        });

        let associatedCount = 0;
        let matchedProducts = 0;

        const toCreate: { stagingProductId: number; imageUrl: string }[] = [];

        for (const product of products) {
            if (!product.sku) continue;

            const sku = String(product.sku || "").trim();
            const skuN = normalizeToken(sku);
            if (!skuN) continue;

            const existingUrls = new Set((product.images || []).map((row) => row.imageUrl));

            const groupedMatches: { index: number; paths: string[] }[] = [];

            for (const key of imageKeys) {
                if (key.length < skuN.length) continue;
                if (!couldMatchSkuKey(key, sku)) continue;
                const info = getImageMatchInfo(key, sku);
                if (!info.matched) continue;
                groupedMatches.push({ index: info.index, paths: imageMap[key] });
            }

            const matches: string[] = [];
            groupedMatches
                .sort((a, b) => a.index - b.index)
                .forEach((entry) => matches.push(...entry.paths));

            if (matches.length === 0) continue;

            matchedProducts++;
            const seenInThisRun = new Set<string>();

            for (const relPath of matches) {
                const imageUrl = toPublicUrl(baseUrl, relPath);
                if (seenInThisRun.has(imageUrl)) continue;
                seenInThisRun.add(imageUrl);
                if (existingUrls.has(imageUrl)) continue;

                toCreate.push({ stagingProductId: product.id, imageUrl });
                existingUrls.add(imageUrl);
                associatedCount++;
            }
        }

        for (let i = 0; i < toCreate.length; i += CREATE_MANY_CHUNK) {
            const chunk = toCreate.slice(i, i + CREATE_MANY_CHUNK);
            if (chunk.length === 0) continue;
            await prisma.stagingProductImage.createMany({ data: chunk });
        }

        const ms = Date.now() - started;

        return NextResponse.json({
            success: true,
            count: associatedCount,
            debug: {
                catalogId,
                inputPath,
                localPath,
                baseUrl,
                loadedFrom: loaded ? (baseUrl ? "remote_or_local_index" : "local_index_or_scan") : "scan",
                remoteIndexUrl: remoteIndexUrlLoaded,
                allowLocalScanFallback,
                totalProducts: products.length,
                matchedProducts,
                totalCandidateKeys,
                durationMs: ms,
            },
        });
    } catch (err: any) {
        console.error("Batch Association error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
