import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * PDF STORAGE PROXY (Legacy Reliable Mode)
 * Reverted to simple readFile to ensure complete file delivery without complex streaming 
 * issues that were causing "Error: R" in PDF.js.
 */
export async function GET(req: NextRequest) {
    const filePathParam = req.nextUrl.searchParams.get("path");

    if (!filePathParam) {
        return new NextResponse("Missing file path", { status: 400 });
    }

    try {
        // Resolve path: strip leading slash and sanitize
        let sanitizedPath = filePathParam.startsWith("/") ? filePathParam.slice(1) : filePathParam;
        sanitizedPath = sanitizedPath.replace(/\/+/g, '/');

        const publicDir = path.join(process.cwd(), "public");
        const fullPath = path.resolve(publicDir, sanitizedPath);

        // Security check
        if (!fullPath.startsWith(publicDir)) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const data = await readFile(fullPath);

        return new NextResponse(data, {
            headers: {
                "Content-Type": "application/pdf",
                "Cache-Control": "public, max-age=3600"
            }
        });
    } catch (e: any) {
        console.error("Storage API error:", e);
        return new NextResponse(`Not Found: ${e.message}`, { status: 404 });
    }
}
