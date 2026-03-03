import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string, pdfId: string }> }
) {
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id);
        const pId = parseInt(pdfId);

        if (isNaN(catalogId) || isNaN(pId)) {
            return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
        }

        const pdf = await prisma.catalogPdf.findUnique({
            where: { id: pId }
        });

        if (!pdf) {
            return NextResponse.json({ error: "PDF not found" }, { status: 404 });
        }

        // Delete from filesystem
        const fullPath = path.join(process.cwd(), "public", pdf.filePath);
        if (fs.existsSync(fullPath)) {
            await unlink(fullPath);
        }

        // Delete from database
        await prisma.catalogPdf.delete({
            where: { id: pId }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Delete PDF error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
