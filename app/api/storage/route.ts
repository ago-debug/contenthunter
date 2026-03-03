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
        // Resolve the actual local path - we strip the starting slash if present
        let sanitizedPath = filePathParam.startsWith("/") ? filePathParam.slice(1) : filePathParam;

        // Ensure we don't have double slashes or other artifacts
        sanitizedPath = sanitizedPath.replace(/\/+/g, '/');

        // This targets the public folder
        const fullPath = path.join(process.cwd(), "public", sanitizedPath);

        if (!fs.existsSync(fullPath)) {
            return new NextResponse(`File Not Found: ${sanitizedPath}`, { status: 404 });
        }

        const stat = fs.statSync(fullPath);
        const fileSize = stat.size;
        const range = req.headers.get("range");

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize) {
                return new NextResponse("Requested range not satisfiable", { status: 416 });
            }

            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(fullPath, { start, end });

            // Convert ReadStream to standard Web stream
            const stream = Readable.toWeb(file);

            return new NextResponse(stream as any, {
                status: 206,
                headers: {
                    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunksize.toString(),
                    "Content-Type": "application/pdf",
                },
            });
        } else {
            const file = fs.createReadStream(fullPath);
            const stream = Readable.toWeb(file);

            return new NextResponse(stream as any, {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": "inline; filename=\"" + path.basename(fullPath) + "\"",
                    "Accept-Ranges": "bytes",
                    "Content-Length": fileSize.toString()
                }
            });
        }
    } catch (e: any) {
        console.error("Storage API error:", e);
        return new NextResponse(`Internal Error: ${e.message}`, { status: 500 });
    }
}
