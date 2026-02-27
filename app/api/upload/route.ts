import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
        const uploadDir = path.join(process.cwd(), "public/uploads");

        // Ensure upload directory exists
        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, fileName);
        await writeFile(filePath, buffer);

        // Create catalogue record
        const catalog = await prisma.catalog.create({
            data: {
                name: file.name,
                filePath: `/public/uploads/${fileName}`,
            },
        });

        return NextResponse.json({
            success: true,
            catalogId: catalog.id,
            filePath: `/public/uploads/${fileName}`
        });
    } catch (err: any) {
        console.error("Upload error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
