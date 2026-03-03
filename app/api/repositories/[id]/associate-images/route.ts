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

        const inputPath = catalog.imageFolderPath;
        let localPath = inputPath;
        let baseUrl = "";

        // Smart Mapping for URL to Local Path (same logic as scan-images)
        if (inputPath.startsWith("http")) {
            baseUrl = inputPath.endsWith("/") ? inputPath : inputPath + "/";
            localPath = path.join(process.cwd(), "public", "images");

            const urlSegments = inputPath.split("/");
            const lastSegment = urlSegments[urlSegments.length - 1] || urlSegments[urlSegments.length - 2];
            const segmentPath = path.join(process.cwd(), "public", lastSegment);
            if (fs.existsSync(segmentPath)) {
                localPath = segmentPath;
            }
        }

        if (!fs.existsSync(localPath)) {
            localPath = path.join(process.cwd(), "public/uploads");
            if (!fs.existsSync(localPath)) {
                return NextResponse.json({ error: `Path not found: ${localPath}` }, { status: 404 });
            }
        }

        const indexPath = path.join(localPath, "images_index.json");
        let imageMap: Record<string, string[]> = {};

        // 1. Load or Build the Image Map
        if (fs.existsSync(indexPath)) {
            try {
                const indexData = fs.readFileSync(indexPath, 'utf-8');
                imageMap = JSON.parse(indexData);
                console.log("Loaded image map from index JSON");
            } catch (e) {
                console.error("Error reading index JSON, rebuilding...");
                imageMap = buildImageMap(localPath, localPath);
                // Save index for next time
                fs.writeFileSync(indexPath, JSON.stringify(imageMap, null, 2));
            }
        } else {
            imageMap = buildImageMap(localPath, localPath);
            // Save index for next time (non-recursive skip for the json itself is handled in buildImageMap)
            fs.writeFileSync(indexPath, JSON.stringify(imageMap, null, 2));
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
