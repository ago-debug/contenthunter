import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        const name = req.nextUrl.searchParams.get("name");

        if (!name) {
            return NextResponse.json({ error: "Missing filename in query" }, { status: 400 });
        }

        const arrayBuffer = await req.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return NextResponse.json({ error: "No file content uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(arrayBuffer);
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
