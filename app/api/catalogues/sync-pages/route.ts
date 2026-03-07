import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { ensureCatalogAccess } from "@/lib/auth-api";
import fs from "fs";
import path from "path";

/** Salva immagine da data URL su disco; ritorna path pubblico o null. */
function savePageImageIfBase64(dataUrl: string, catalogId: number, pageIndex: number): string | null {
    if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
    const match = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!match || match.length !== 3) return null;
    const ext = (match[1].split("/")[1] || "jpg").replace("jpeg", "jpg");
    const dir = path.join(process.cwd(), "public", "uploads", "catalogs", String(catalogId), "pages");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `page_${pageIndex + 1}.${ext}`;
    const filePath = path.join(dir, filename);
    try {
        const buffer = Buffer.from(match[2], "base64");
        fs.writeFileSync(filePath, buffer);
        return `/uploads/catalogs/${catalogId}/pages/${filename}`;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const catalogId = parseInt(String(body.catalogId));
        const pages = body.pages;
        if (Number.isNaN(catalogId)) {
            return NextResponse.json({ error: "catalogId required" }, { status: 400 });
        }
        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato o catalogo non trovato" }, { status: 403 });
        }
        if (!pages || !Array.isArray(pages)) {
            return NextResponse.json({ error: "pages array required" }, { status: 400 });
        }

        await (prisma as any).pdfPage.deleteMany({
            where: { catalogId }
        });

        const data = pages.map((p: any, idx: number) => {
            let imageUrl = p.imageUrl || "";
            const saved = savePageImageIfBase64(imageUrl, catalogId, idx);
            if (saved) imageUrl = saved;
            return {
                catalogId,
                pageNumber: idx + 1,
                text: p.textBlocks?.map((b: any) => b.str).join(" ") || "",
                imageUrl,
                subImages: p.subImages ? JSON.stringify(p.subImages) : "[]"
            };
        });

        await (prisma as any).pdfPage.createMany({ data });

        return NextResponse.json({ success: true, count: pages.length });
    } catch (err: any) {
        console.error("Sync pages error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
