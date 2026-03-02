import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import axios from "axios";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { imageUrl, sku } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: "Missing image URL" }, { status: 400 });
        }

        // 1. Fetch image from source or process base64
        let finalBuffer: Buffer;
        let finalExtension = 'jpg';

        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return NextResponse.json({ error: "Invalid base64 image data" }, { status: 400 });
            }
            finalExtension = matches[1].split('/')[1] || 'jpg';
            finalBuffer = Buffer.from(matches[2], 'base64');
        } else {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const contentType = response.headers['content-type'];
            finalExtension = contentType ? contentType.split('/')[1] : 'jpg';
            finalBuffer = Buffer.from(response.data);
        }

        // 2. Prepare storage directory
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // 3. Generate filename
        const filename = `${sku || 'product'}_${crypto.randomUUID().substring(0, 8)}.${finalExtension}`;
        const filePath = path.join(uploadDir, filename);

        // 4. Save file
        fs.writeFileSync(filePath, finalBuffer);

        // 5. Return local URL
        const localUrl = `/uploads/products/${filename}`;
        return NextResponse.json({
            success: true,
            localUrl,
            filename
        });

    } catch (err: any) {
        console.error("Storage error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
