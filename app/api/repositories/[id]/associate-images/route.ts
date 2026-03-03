import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

/**
 * Build a map of all image files in a directory (recursive)
 * Key: filename without extension (lowercase)
 * Value: array of relative paths
 */
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
            imageMap = buildImageMap(localPath, localPath);
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

        // 3. Match and update
        for (const product of products) {
            if (!product.sku) continue;

            const sku = product.sku.toLowerCase();
            const matches = imageMap[sku] || [];

            // Also try to find if any image filename *contains* the SKU (partial match)
            // This is slower but covers more cases (e.g. SKU_top.jpg)
            if (matches.length === 0) {
                for (const imgName in imageMap) {
                    if (imgName.includes(sku)) {
                        matches.push(...imageMap[imgName]);
                    }
                }
            }

            if (matches.length > 0) {
                // Clear existing staging images if we are re-associating? 
                // Let's just add new ones for now, but usually clean is better.
                // await prisma.stagingProductImage.deleteMany({ where: { stagingProductId: product.id } });

                for (const relPath of matches) {
                    const imageUrl = baseUrl
                        ? baseUrl + relPath.split(path.sep).join("/")
                        : `/api/storage?path=${encodeURIComponent(relPath)}`;

                    // Check if already exists to avoid duplicates
                    const existing = await prisma.stagingProductImage.findFirst({
                        where: { stagingProductId: product.id, imageUrl }
                    });

                    if (!existing) {
                        await prisma.stagingProductImage.create({
                            data: {
                                stagingProductId: product.id,
                                imageUrl
                            }
                        });
                        associatedCount++;
                    }
                }
            }
        }

        return NextResponse.json({ success: true, count: associatedCount });
    } catch (err: any) {
        console.error("Batch Association error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
