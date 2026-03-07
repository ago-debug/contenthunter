import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ensureCatalogAccess } from "@/lib/auth-api";

export const maxDuration = 60; // Increase to 60 seconds for large file processing

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        if (Number.isNaN(catalogId)) {
            return NextResponse.json({ error: "Invalid catalog ID" }, { status: 400 });
        }
        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato o catalogo non trovato" }, { status: 403 });
        }
        console.log("PDF Upload request received...");
        let name = "upload.pdf";
        if (req.headers.get("X-File-Name")) {
            name = decodeURIComponent(req.headers.get("X-File-Name")!);
        } else if (req.nextUrl.searchParams.get("name")) {
            name = decodeURIComponent(req.nextUrl.searchParams.get("name")!);
        }

        const arrayBuffer = await req.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return NextResponse.json({ error: "No file content uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(arrayBuffer);

        // --- MANDATORY MAGIC BYTE CHECK ---
        const magic = buffer.subarray(0, 4).toString();
        console.log(`[UPLOAD-CHECK] Processing file: ${name}. Magic Header: ${magic}`);

        if (magic !== "%PDF") {
            console.error(`[UPLOAD-ERROR] File ${name} is NOT a valid PDF. Starts with: ${magic}`);
            return NextResponse.json({ error: "Il file inviato non sembra essere un PDF valido (struttura corrotta)." }, { status: 400 });
        }

        const cleanName = name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const fileName = `${Date.now()}-${cleanName}`;
        const uploadDir = path.join(process.cwd(), "public/uploads");

        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, fileName);
        await writeFile(filePath, buffer);

        const pdf = await prisma.catalogPdf.create({
            data: {
                catalogId,
                fileName: name,
                filePath: `/uploads/${fileName}`
            }
        });

        return NextResponse.json(pdf);
    } catch (err: any) {
        console.error("PDF Upload error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
