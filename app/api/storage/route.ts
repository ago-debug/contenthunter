import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
    const filePathParam = req.nextUrl.searchParams.get("path");

    if (!filePathParam) {
        return new NextResponse("Missing file path", { status: 400 });
    }

    try {
        // Resolve the actual local path - we strip the starting slash if present
        let sanitizedPath = filePathParam.startsWith("/") ? filePathParam.slice(1) : filePathParam;

        // Ensure we don't have double slashes or other artifacts
        sanitizedPath = sanitizedPath.replace(/\/+/g, '/');

        // This targets the public folder
        const fullPath = path.join(process.cwd(), "public", sanitizedPath);

        console.log("Storage API attempting to serve:", fullPath);

        if (!fs.existsSync(fullPath)) {
            console.error("Storage API: File not found at", fullPath);
            return new NextResponse(`File Not Found: ${sanitizedPath}`, { status: 404 });
        }

        const data = await readFile(fullPath);

        return new NextResponse(data, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": "inline; filename=\"" + path.basename(fullPath) + "\"",
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
                "Content-Length": data.length.toString()
            }
        });
    } catch (e: any) {
        console.error("Storage API error:", e);
        return new NextResponse(`Internal Error: ${e.message}`, { status: 500 });
    }
}
