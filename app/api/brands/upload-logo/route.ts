import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import axios from "axios";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { imageUrl, brandId } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
        }

        let finalBuffer: Buffer;
        let finalExtension = "jpg";

        if (imageUrl.startsWith("data:")) {
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return NextResponse.json({ error: "Invalid base64 image" }, { status: 400 });
            }
            finalExtension = (matches[1].split("/")[1] || "jpg").replace("jpeg", "jpg");
            finalBuffer = Buffer.from(matches[2], "base64");
        } else {
            const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
            const contentType = response.headers["content-type"];
            finalExtension = contentType ? contentType.split("/")[1] : "jpg";
            if (finalExtension === "jpeg") finalExtension = "jpg";
            finalBuffer = Buffer.from(response.data);
        }

        const uploadDir = path.join(process.cwd(), "public", "uploads", "brands");
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const filename = `brand_${brandId || crypto.randomUUID().substring(0, 8)}_${crypto.randomUUID().substring(0, 6)}.${finalExtension}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, finalBuffer);

        const localUrl = `/uploads/brands/${filename}`;
        return NextResponse.json({ success: true, localUrl, filename });
    } catch (err: any) {
        console.error("Brand logo upload error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
