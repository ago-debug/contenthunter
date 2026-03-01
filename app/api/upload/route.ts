import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const name = req.nextUrl.searchParams.get("name");
        if (!name) {
            return NextResponse.json({ error: "Missing filename in query" }, { status: 400 });
        }

        const arrayBuffer = await req.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return NextResponse.json({ error: "No file content uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(arrayBuffer);

        const fileName = `${Date.now()}-${name.replace(/\s+/g, "_")}`;
        const uploadDir = path.join(process.cwd(), "public/uploads");

        // Ensure upload directory exists
        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, fileName);
        await writeFile(filePath, buffer);

        let catalogId = null;
        if (req.nextUrl.searchParams.get("save") === "true") {
            const catalog = await prisma.catalog.create({
                data: {
                    name: name,
                    filePath: `/uploads/${fileName}`,
                },
            });
            catalogId = catalog.id;
        }

        return NextResponse.json({
            success: true,
            catalogId: catalogId,
            filePath: `/uploads/${fileName}`
        });
    } catch (err: any) {
        console.error("Upload JSON error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
