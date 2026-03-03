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

            // Convert ReadStream to ReadableStream for Next.js
            const stream = new ReadableStream({
                start(controller) {
                    file.on("data", (chunk) => controller.enqueue(chunk));
                    file.on("end", () => controller.close());
                    file.on("error", (err) => controller.error(err));
                },
                cancel() {
                    file.destroy();
                }
            });

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
            const data = await readFile(fullPath);
            return new NextResponse(data, {
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
