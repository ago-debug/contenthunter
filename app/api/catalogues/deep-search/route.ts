import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q");
        const catalogId = searchParams.get("catalogId");

        if (!query) {
            return NextResponse.json({ error: "Search query required" }, { status: 400 });
        }

        // Search in the text of the PDF pages
        const matches = await (prisma as any).pdfPage.findMany({
            where: {
                AND: [
                    catalogId ? { catalogId: parseInt(catalogId) } : {},
                    {
                        text: {
                            contains: query
                        }
                    }
                ]
            },
            include: {
                catalog: {
                    select: { name: true }
                }
            },
            take: 10
        });

        const formatted = matches.map((m: any) => ({
            id: m.id,
            catalogName: m.catalog.name,
            pageNumber: m.pageNumber,
            imageUrl: m.imageUrl,
            subImages: JSON.parse(m.subImages || "[]"),
            snippet: m.text.substring(m.text.indexOf(query) - 50, m.text.indexOf(query) + 50)
        }));

        return NextResponse.json(formatted);
    } catch (err: any) {
        console.error("Deep search error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
