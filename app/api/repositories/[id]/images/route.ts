import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

// Helper to recursively index image files.
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

    if (key === sku) return { matched: true, index: 0 };

    if (!(key.startsWith(`${sku}_`) || key.startsWith(`${sku}-`) || key.startsWith(`${sku} `))) {
        return { matched: false, index: Number.MAX_SAFE_INTEGER };
    }

    const restRaw = keyRaw.slice(skuRaw.length).trim();
    const rest = normalizeToken(restRaw);
    if (!rest) return { matched: true, index: 0 };

    // Accept formats like:
    // SKU_1, SKU_01, SKU_text_1, SKU_text_anything_01
    const trailingIndexMatch = rest.match(/(?:^|[_\-\s])(\d{1,3})$/);
    if (trailingIndexMatch) {
        const n = parseInt(trailingIndexMatch[1], 10);
        return { matched: true, index: Number.isFinite(n) ? n : 0 };
    }

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

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        const { searchParams } = new URL(req.url);
        const skuParam = searchParams.get("sku");

        if (isNaN(catalogId)) {
            return NextResponse.json({ error: "Invalid catalog ID" }, { status: 400 });
        }

        const catalog = await prisma.catalog.findUnique({
            where: { id: catalogId }
        });

        if (!catalog || !catalog.imageFolderPath) {
            return NextResponse.json({ error: "Repository or image path not found" }, { status: 404 });
        }

        let inputPath = catalog.imageFolderPath;
        let localPath = inputPath;
        let baseUrl = "";

        // Same mapping rules as associate-images
        if (inputPath.startsWith("http")) {
            baseUrl = inputPath.endsWith("/") ? inputPath : inputPath + "/";
            localPath = path.join(process.cwd(), "public", "catalog_images");
        } else if (inputPath.startsWith("/") || fs.existsSync(inputPath)) {
            localPath = inputPath;
        } else {
            localPath = path.join(process.cwd(), "public", inputPath);
        }

        if (!fs.existsSync(localPath)) {
            return NextResponse.json({ error: `Image folder does not exist on server: ${localPath}` }, { status: 404 });
        }

        const indexPath = path.join(localPath, "images_index.json");
        const externalPath = path.join(localPath, "images_map.json");
        let imageMap: Record<string, string[]> = {};
        let loaded = false;

        // 1. Try remote JSON index if baseUrl is defined
        if (baseUrl) {
            const remoteJsonUrl = baseUrl + "images_map.json";
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(remoteJsonUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (response.ok) {
                    imageMap = await response.json();
                    loaded = true;
                }
            } catch {
                // ignore and fallback
            }
        }

        // 2. Local JSON indices
        if (!loaded) {
            const targetPath = fs.existsSync(externalPath)
                ? externalPath
                : (fs.existsSync(indexPath) ? indexPath : null);

            if (targetPath) {
                try {
                    const indexData = fs.readFileSync(targetPath, "utf-8");
                    imageMap = JSON.parse(indexData);
                    loaded = true;
                } catch {
                    // ignore and rebuild
                }
            }
        }

        // 3. Full scan if nothing was loaded
        if (!loaded) {
            imageMap = buildImageMap(localPath);
            try {
                fs.writeFileSync(indexPath, JSON.stringify(imageMap, null, 2));
            } catch {
                // ignore cache write errors
            }
        }

        const results: { fileName: string; relativePath: string; url: string }[] = [];

        if (skuParam) {
            const skuRaw = String(skuParam || "").trim();
            const used = new Set<string>();

            const pushMatches = (relPaths: string[]) => {
                for (const rel of relPaths) {
                    const norm = rel.split(path.sep).join("/");
                    if (used.has(norm)) continue;
                    used.add(norm);

                    const url = toPublicUrl(baseUrl, norm);

                    results.push({
                        fileName: path.basename(norm),
                        relativePath: norm,
                        url
                    });
                }
            };

            const groupedMatches: { index: number; paths: string[] }[] = [];
            for (const key of Object.keys(imageMap)) {
                const info = getImageMatchInfo(key, skuRaw);
                if (!info.matched) continue;
                groupedMatches.push({ index: info.index, paths: imageMap[key] });
            }

            groupedMatches
                .sort((a, b) => a.index - b.index)
                .forEach(entry => pushMatches(entry.paths));
        } else {
            // No SKU: return a capped flat list
            const limit = 100;
            outer: for (const key of Object.keys(imageMap)) {
                for (const rel of imageMap[key]) {
                    const norm = rel.split(path.sep).join("/");
                    const url = toPublicUrl(baseUrl, norm);

                    results.push({
                        fileName: path.basename(norm),
                        relativePath: norm,
                        url
                    });

                    if (results.length >= limit) break outer;
                }
            }
        }

        return NextResponse.json({ images: results });
    } catch (err: any) {
        console.error("List repository images error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

