import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    console.log("INCOMING Deep Search Request: ", req.url);
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q");
        const catalogIdStr = searchParams.get("catalogId");

        if (!query) {
            console.error("Deep search missing query");
            return NextResponse.json({ error: "Search query required" }, { status: 400 });
        }

        const queryObj: any = {
            AND: [
                {
                    text: {
                        contains: query
                    }
                }
            ]
        };

        if (catalogIdStr && catalogIdStr !== 'null' && !isNaN(parseInt(catalogIdStr))) {
            queryObj.AND.push({ catalogId: parseInt(catalogIdStr) });
        }

        console.log("Deep search DB query parameters:", queryObj);

        // Search in the text of the PDF pages
        const matches = await (prisma as any).pdfPage.findMany({
            where: queryObj,
            include: {
                catalog: {
                    select: { name: true }
                }
            },
            take: 20
        });

        console.log(`Found ${matches.length} matches in DB`);

        const formatted = matches.map((m: any) => {
            let parsedSubImages = [];
            try {
                if (m.subImages) {
                    parsedSubImages = JSON.parse(m.subImages);
                }
            } catch (e) {
                console.warn("JSON parse error for subImages in page", m.id);
            }

            const lowerText = (m.text || "").toLowerCase();
            const lowerQuery = query.toLowerCase();
            const index = lowerText.indexOf(lowerQuery);

            // Fallback to start of text if not found (shouldn't happen with contains)
            const safeIndex = index === -1 ? 0 : index;
            const start = Math.max(0, safeIndex - 80);
            const end = Math.min((m.text || "").length, safeIndex + 120);

            return {
                id: m.id,
                catalogName: m.catalog?.name || "Unknown",
                pageNumber: m.pageNumber || 0,
                imageUrl: m.imageUrl || "",
                subImages: parsedSubImages,
                snippet: (m.text || "").substring(start, end).replace(/\n/g, ' ').trim()
            };
        });

        return NextResponse.json(formatted);
    } catch (err: any) {
        console.error("CRITICAL Deep search error:", err);
        return NextResponse.json({
            error: "Internal Server Error in Deep Search",
            message: err.message,
            stack: err.stack
        }, { status: 500 });
    }
}
