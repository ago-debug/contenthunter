import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { catalogId, pages } = body;

        if (!catalogId || !pages || !Array.isArray(pages)) {
            return NextResponse.json({ error: "catalogId and pages array are required" }, { status: 400 });
        }

        // Clean old pages for this catalog to avoid duplicates
        await (prisma as any).pdfPage.deleteMany({
            where: { catalogId: parseInt(catalogId) }
        });

        // Batch insert new pages
        const data = pages.map((p: any, idx: number) => ({
            catalogId: parseInt(catalogId),
            pageNumber: idx + 1,
            text: p.textBlocks?.map((b: any) => b.str).join(" ") || "",
            imageUrl: p.imageUrl || "",
            subImages: p.subImages ? JSON.stringify(p.subImages) : "[]"
        }));

        await (prisma as any).pdfPage.createMany({
            data: data
        });

        return NextResponse.json({ success: true, count: pages.length });
    } catch (err: any) {
        console.error("Sync pages error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
