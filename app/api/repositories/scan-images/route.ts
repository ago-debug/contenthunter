import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function findFilesWithSku(dir: string, sku: string, results: string[] = []) {
    if (!fs.existsSync(dir)) return results;

    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            findFilesWithSku(fullPath, sku, results);
        } else {
            // Check if filename contains SKU (case insensitive)
            if (file.toLowerCase().includes(sku.toLowerCase())) {
                // Return a path that can be served via /api/proxy-image or similar
                results.push(fullPath);
            }
        }
    }
    return results;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get("sku");
    const folder = searchParams.get("folder");

    if (!sku || !folder) {
        return NextResponse.json({ error: "SKU and folder are required" }, { status: 400 });
    }

    try {
        const matches = findFilesWithSku(folder, sku);
        return NextResponse.json({ matches });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
