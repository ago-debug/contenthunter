import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import axios from "axios";
import crypto from "crypto";

function slugForBrand(name: string): string {
    return (name || "products")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "");
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { imageUrl, sku, brandName } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: "Missing image URL" }, { status: 400 });
        }

        let finalBuffer: Buffer;
        let finalExtension = "jpg";

        if (imageUrl.startsWith("data:")) {
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return NextResponse.json({ error: "Invalid base64 image data" }, { status: 400 });
            }
            finalExtension = (matches[1].split("/")[1] || "jpg").replace("jpeg", "jpg");
            finalBuffer = Buffer.from(matches[2], "base64");
        } else {
            const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
            const contentType = response.headers["content-type"];
            finalExtension = contentType ? contentType.split("/")[1] : "jpg";
            finalBuffer = Buffer.from(response.data);
        }

        const brandSlug = slugForBrand(brandName);
        const segment = brandSlug ? `${brandSlug}/images` : "products";
        const uploadDir = path.join(process.cwd(), "public", "uploads", segment);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filename = `${(sku || "product").replace(/[^a-z0-9]/gi, "_")}_${crypto.randomUUID().substring(0, 8)}.${finalExtension}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, finalBuffer);

        const localUrl = `/uploads/${segment}/${filename}`;
        return NextResponse.json({
            success: true,
            localUrl,
            filename,
        });
    } catch (err: any) {
        console.error("Storage error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
