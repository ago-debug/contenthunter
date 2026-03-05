import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

// Helper to recursively index image files
function buildImageMap(root: string, currentDir: string, imageMap: Record<string, string[]> = {}) {
    if (!fs.existsSync(currentDir)) return imageMap;

    const files = fs.readdirSync(currentDir);
    for (const file of files) {
        const fullPath = path.join(currentDir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            buildImageMap(root, fullPath, imageMap);
        } else {
            const ext = path.extname(file).toLowerCase();
            if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
                const nameWithoutExt = path.basename(file, ext).toLowerCase();
                const relativePath = path.relative(root, fullPath);

                if (!imageMap[nameWithoutExt]) imageMap[nameWithoutExt] = [];
                imageMap[nameWithoutExt].push(relativePath);
            }
        }
    }
    return imageMap;
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
            imageMap = buildImageMap(localPath, localPath);
            try {
                fs.writeFileSync(indexPath, JSON.stringify(imageMap, null, 2));
            } catch {
                // ignore cache write errors
            }
        }

        const results: { fileName: string; relativePath: string; url: string }[] = [];

        const normalizePath = (relPath: string) =>
            relPath.split(path.sep).join("/");

        if (skuParam) {
            const skuLower = skuParam.toLowerCase();
            const used = new Set<string>();

            const pushMatches = (relPaths: string[]) => {
                for (const rel of relPaths) {
                    const norm = normalizePath(rel);
                    if (used.has(norm)) continue;
                    used.add(norm);

                    const url = baseUrl
                        ? baseUrl + norm
                        : `/api/storage?path=${encodeURIComponent(norm)}`;

                    results.push({
                        fileName: path.basename(norm),
                        relativePath: norm,
                        url
                    });
                }
            };

            // Exact key match
            if (imageMap[skuLower]) {
                pushMatches(imageMap[skuLower]);
            }

            // Partial match on filename key
            for (const key of Object.keys(imageMap)) {
                if (key.includes(skuLower) && key !== skuLower) {
                    pushMatches(imageMap[key]);
                }
            }
        } else {
            // No SKU: return a capped flat list
            const limit = 100;
            outer: for (const key of Object.keys(imageMap)) {
                for (const rel of imageMap[key]) {
                    const norm = normalizePath(rel);
                    const url = baseUrl
                        ? baseUrl + norm
                        : `/api/storage?path=${encodeURIComponent(norm)}`;

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

