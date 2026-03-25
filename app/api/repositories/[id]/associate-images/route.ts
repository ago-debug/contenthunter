import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

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

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);

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

        // Try remote fetch if it's a URL project
        if (baseUrl) {
            const remoteJsonUrl = baseUrl + "images_map.json";
            console.log("Attempting to fetch remote index:", remoteJsonUrl);
            try {
                const response = await fetch(remoteJsonUrl, { signal: AbortSignal.timeout(5000) });
                if (response.ok) {
                    imageMap = await response.json();
                    console.log("Loaded image map from REMOTE URL");
                    loaded = true;
                }
            } catch (e) {
                console.log("Remote index not found or unreachable. Falling back to local/scan.");
            }
        }

        if (!loaded) {
            const targetPath = fs.existsSync(externalPath) ? externalPath : (fs.existsSync(indexPath) ? indexPath : null);

            if (targetPath) {
                try {
                    const indexData = fs.readFileSync(targetPath, 'utf-8');
                    imageMap = JSON.parse(indexData);
                    console.log(`Loaded image map from local file: ${path.basename(targetPath)}`);
                    loaded = true;
                } catch (e) {
                    console.error(`Error reading ${targetPath}, rebuilding...`);
                }
            }
        }

        if (!loaded) {
            console.log("No index found (remote or local), scanning subdirectories...");
            imageMap = buildImageMap(localPath);
            // Save internal index for next time (if local folder is writable)
            try {
                fs.writeFileSync(indexPath, JSON.stringify(imageMap, null, 2));
            } catch (e: any) {
                console.warn("Could not save local index cache:", e.message);
            }
        }

        // 2. Fetch all products in staging for this catalog
        const products = await prisma.stagingProduct.findMany({
            where: { catalogId }
        });

        let associatedCount = 0;
        let matchedProducts = 0;
        let totalCandidateKeys = Object.keys(imageMap || {}).length;

        // 3. Match and update
        for (const product of products) {
            if (!product.sku) continue;

            const sku = String(product.sku || "").trim();
            const groupedMatches: { index: number; paths: string[] }[] = [];
            for (const key of Object.keys(imageMap)) {
                const info = getImageMatchInfo(key, sku);
                if (!info.matched) continue;
                groupedMatches.push({ index: info.index, paths: imageMap[key] });
            }

            const matches: string[] = [];
            groupedMatches
                .sort((a, b) => a.index - b.index)
                .forEach((entry) => matches.push(...entry.paths));

            if (matches.length > 0) {
                matchedProducts++;
                // Deduplica forte:
                // - evita doppioni nello stesso run
                // - evita duplicati già presenti in DB per lo stesso prodotto
                const existingRows = await prisma.stagingProductImage.findMany({
                    where: { stagingProductId: product.id },
                    select: { imageUrl: true }
                });
                const existingUrls = new Set(existingRows.map((row) => row.imageUrl));
                const seenInThisRun = new Set<string>();

                for (const relPath of matches) {
                    const imageUrl = toPublicUrl(baseUrl, relPath);
                    if (seenInThisRun.has(imageUrl)) continue;
                    seenInThisRun.add(imageUrl);
                    if (existingUrls.has(imageUrl)) continue;

                    await prisma.stagingProductImage.create({
                        data: {
                            stagingProductId: product.id,
                            imageUrl
                        }
                    });
                    existingUrls.add(imageUrl);
                    associatedCount++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            count: associatedCount,
            debug: {
                catalogId,
                inputPath,
                localPath,
                baseUrl,
                loadedFrom: loaded ? (baseUrl ? "remote_or_local_index" : "local_index_or_scan") : "scan",
                totalProducts: products.length,
                matchedProducts,
                totalCandidateKeys,
            },
        });
    } catch (err: any) {
        console.error("Batch Association error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
