import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { stagingProductId, imageUrl } = body;

        if (!stagingProductId || !imageUrl) {
            return NextResponse.json({ error: "Missing data" }, { status: 400 });
        }

        let finalUrl = imageUrl;

        // If it's a base64 image (extracted from PDF), save it to public/uploads
        if (imageUrl.startsWith("data:image")) {
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return NextResponse.json({ error: "Invalid base64 image" }, { status: 400 });
            }

            const buffer = Buffer.from(matches[2], 'base64');
            const fileName = `extracted_${crypto.randomUUID()}.jpg`;
            const uploadDir = path.join(process.cwd(), "public", "uploads", "extracted");

            // Ensure directory exists
            await mkdir(uploadDir, { recursive: true });

            await writeFile(path.join(uploadDir, fileName), buffer);
            finalUrl = `/api/storage?path=uploads/extracted/${fileName}`;
        }

        const newImage = await prisma.stagingProductImage.create({
            data: {
                stagingProductId: parseInt(stagingProductId),
                imageUrl: finalUrl
            }
        });

        return NextResponse.json(newImage);
    } catch (err: any) {
        console.error("Staging Image Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
