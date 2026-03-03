import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

export async function GET(req: NextRequest) {
    const filePathParam = req.nextUrl.searchParams.get("path");

    if (!filePathParam) {
        return new NextResponse("Missing file path", { status: 400 });
    }

    try {
        let sanitizedPath = filePathParam.startsWith("/") ? filePathParam.slice(1) : filePathParam;
        sanitizedPath = sanitizedPath.replace(/\/+/g, '/');
        const fullPath = path.join(process.cwd(), "public", sanitizedPath);

        if (!fs.existsSync(fullPath)) {
            return new NextResponse(`File Not Found: ${sanitizedPath}`, { status: 404 });
        }

        const stats = fs.statSync(fullPath);

        // For files up to 50MB, read into memory to ensure integrity and bypass stream hiccups
        // larger than that, use stream.
        if (stats.size < 50 * 1024 * 1024) {
            const data = fs.readFileSync(fullPath);
            return new NextResponse(data, {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Length": stats.size.toString(),
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=3600"
                }
            });
        }

        const file = fs.createReadStream(fullPath);
        const stream = Readable.toWeb(file);

        return new NextResponse(stream as any, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${path.basename(fullPath)}"`,
                "Accept-Ranges": "bytes",
                "Content-Length": stats.size.toString()
            }
        });
    } catch (e: any) {
        console.error("Storage API error:", e);
        return new NextResponse(`Internal Error: ${e.message}`, { status: 500 });
    }
}
