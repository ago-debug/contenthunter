import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { canAccessProductImageForCompany } from "@/lib/auth-api";
import { verifyProductImageSignature } from "@/lib/product-image-serving";

export const maxDuration = 60;

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const idStr = (await params).id;
    const imageId = parseInt(idStr, 10);
    if (!Number.isFinite(imageId) || imageId <= 0) {
        return NextResponse.json({ error: "ID non valido" }, { status: 400 });
    }

    const row = await prisma.productImage.findUnique({
        where: { id: imageId },
        select: {
            imageUrl: true,
            imageData: true,
            mimeType: true,
            product: { select: { companyId: true } },
        },
    });

    if (!row) {
        return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    }

    const url = req.nextUrl;
    const sigOk = verifyProductImageSignature(
        imageId,
        url.searchParams.get("exp"),
        url.searchParams.get("sig")
    );

    if (!sigOk) {
        const allowed = await canAccessProductImageForCompany(req, row.product.companyId);
        if (!allowed) {
            return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
        }
    }

    if (row.imageData && row.imageData.length > 0) {
        const buf = Buffer.from(row.imageData);
        const mime =
            row.mimeType?.split(";")[0]?.trim().toLowerCase() || "image/jpeg";
        const ct = mime.startsWith("image/") ? mime : "image/jpeg";
        return new NextResponse(new Uint8Array(buf), {
            headers: {
                "Content-Type": ct,
                "Cache-Control": sigOk ? "public, max-age=3600" : "private, max-age=3600",
            },
        });
    }

    const legacyPath = row.imageUrl?.trim() || "";
    if (legacyPath.startsWith("/uploads/") || legacyPath.startsWith("/")) {
        try {
            const rel = legacyPath.startsWith("/") ? legacyPath.slice(1) : legacyPath;
            const fullPath = path.resolve(process.cwd(), "public", rel);
            const publicRoot = path.resolve(process.cwd(), "public");
            if (!fullPath.startsWith(publicRoot)) {
                return NextResponse.json({ error: "Percorso non valido" }, { status: 400 });
            }
            const data = await readFile(fullPath);
            const ext = path.extname(rel).toLowerCase();
            let ct = "application/octet-stream";
            if (ext.match(/\.(png|jpe?g|webp|gif)$/i)) {
                ct = "image/" + (ext === ".jpg" || ext === ".jpeg" ? "jpeg" : ext.slice(1));
            }
            return new NextResponse(data, {
                headers: {
                    "Content-Type": ct,
                    "Cache-Control": "public, max-age=3600",
                },
            });
        } catch {
            return NextResponse.json({ error: "File non disponibile sul server" }, { status: 404 });
        }
    }

    return NextResponse.json({ error: "Immagine non disponibile" }, { status: 404 });
}
