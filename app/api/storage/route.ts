import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * Serve file from public/ by path (per immagini e altri asset).
 * Per i PDF del catalogo usare GET /api/repositories/[id]/pdfs/[pdfId]/file (con auth).
 */
export async function GET(req: NextRequest) {
    const filePathParam = req.nextUrl.searchParams.get("path");
    if (!filePathParam) {
        return new NextResponse("Missing path", { status: 400 });
    }

    try {
        let relative = filePathParam.startsWith("/") ? filePathParam.slice(1) : filePathParam;
        relative = relative.replace(/\/+/g, "/");

        const publicDir = path.join(process.cwd(), "public");
        const fullPath = path.resolve(publicDir, relative);

        if (!fullPath.startsWith(publicDir)) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const data = await readFile(fullPath);

        const ext = path.extname(relative).toLowerCase();
        let contentType = "application/octet-stream";
        if (ext === ".pdf") contentType = "application/pdf";
        else if (ext === ".svg") contentType = "image/svg+xml";
        else if (ext.match(/\.(png|jpe?g|webp|gif)$/i)) contentType = "image/" + (ext === ".jpg" ? "jpeg" : ext.slice(1));

        return new NextResponse(data, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=3600",
            },
        });
    } catch (e: any) {
        console.error("Storage API error:", e?.message, filePathParam);
        return new NextResponse("File not found", { status: 404 });
    }
}
