import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Recursively search for files containing the SKU in the name.
 * Returns relative paths from the root directory.
 */
function findFilesRecursive(root: string, currentDir: string, sku: string, results: string[] = []) {
    if (!fs.existsSync(currentDir)) return results;

    const files = fs.readdirSync(currentDir);
    for (const file of files) {
        const fullPath = path.join(currentDir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            findFilesRecursive(root, fullPath, sku, results);
        } else {
            const fileName = file.toLowerCase();
            const skuLower = sku.toLowerCase();

            // Match if filename contains SKU (e.g. "SKU123.jpg", "image_SKU123_top.png")
            // We ignore common image extensions during comparison if needed, but a simple include is usually safer
            if (fileName.includes(skuLower)) {
                // Get path relative to the root provided in settings
                const relativePath = path.relative(root, fullPath);
                results.push(relativePath);
            }
        }
    }
    return results;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get("sku");
    const inputPath = searchParams.get("folder"); // This is the "link" or "path" from settings

    if (!sku || !inputPath) {
        return NextResponse.json({ error: "SKU and folder are required" }, { status: 400 });
    }

    try {
        let localPath = inputPath;
        let baseUrl = "";

        // If the user provided a URL, try to guess the local path if it's on the same server,
        // or treat it as a base URL for the matches found in a default local gallery.
        if (inputPath.startsWith("http")) {
            baseUrl = inputPath.endsWith("/") ? inputPath : inputPath + "/";

            // Logic to map URL to Local Path:
            // 1. Try public folder if it contains a segment of the URL
            // 2. Try absolute path if it looks like one (unlikely for URL)
            // For now, let's assume if it's a URL, images might be in public/images
            localPath = path.join(process.cwd(), "public", "images");

            // If the URL ends with a known segment, try that too
            const urlSegments = inputPath.split("/");
            const lastSegment = urlSegments[urlSegments.length - 1] || urlSegments[urlSegments.length - 2];
            const segmentPath = path.join(process.cwd(), "public", lastSegment);
            if (fs.existsSync(segmentPath)) {
                localPath = segmentPath;
            }
        }

        if (!fs.existsSync(localPath)) {
            // Fallback to internal uploads/images just in case
            localPath = path.join(process.cwd(), "public/uploads");
        }

        const relativeMatches = findFilesRecursive(localPath, localPath, sku);

        // Convert relative filesystem paths to public URLs
        const matches = relativeMatches.map(rel => {
            if (baseUrl) {
                // If we have a base URL, join it (using POSIX style slashes for URLs)
                return baseUrl + rel.split(path.sep).join("/");
            } else {
                // If it's a local path, assume it's served via public or storage
                return `/api/storage?path=${encodeURIComponent(rel)}`;
            }
        });

        return NextResponse.json({ matches });
    } catch (err: any) {
        console.error("Scan Images error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
