import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    let idParam = "unknown";
    try {
        const resolvedParams = await params;
        idParam = resolvedParams.id;
        const id = parseInt(idParam);
        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const catalogue = await prisma.catalog.findFirst({
            where: { id, companyId },
            include: {
                brandRef: true,
                entries: {
                    include: {
                        product: {
                            include: {
                                texts: { where: { language: "it" } },
                                prices: { where: { listName: "default" } },
                                extraFields: true,
                                images: true
                            }
                        }
                    },
                    orderBy: { productId: 'desc' }
                },
                searchSources: true,
                pdfs: true
            }
        });

        if (!catalogue) {
            return NextResponse.json({ error: "Catalogue not found" }, { status: 404 });
        }

        const mappedProducts = catalogue.entries.map((entry: any) => {
            const p = entry.product;
            const itText = p.texts?.[0] || {};
            const defPrice = p.prices?.[0] || {};

            const extraObj: Record<string, string> = {};
            let dimensions = "";
            let weight = "";
            let material = "";

            p.extraFields.forEach((ex: any) => {
                if (ex.key === "dimensions") dimensions = ex.value;
                else if (ex.key === "weight") weight = ex.value;
                else if (ex.key === "material") material = ex.value;
                else extraObj[ex.key] = ex.value;
            });

            return {
                id: p.id,
                sku: p.sku,
                ean: p.ean,
                parentSku: p.parentSku,
                brand: p.brand,
                category: p.category,
                title: itText.title || "",
                description: itText.description || "",
                docDescription: itText.docDescription || "",
                bulletPoints: itText.bulletPoints || "",
                price: defPrice.price !== undefined ? String(defPrice.price) : "",
                dimensions,
                weight,
                material,
                extraFields: extraObj,
                images: p.images.map((img: any) => ({ id: img.id.toString(), url: img.imageUrl })),
                catalogId: id
            };
        });

        return NextResponse.json({
            ...catalogue,
            entries: undefined,
            products: mappedProducts
        });
    } catch (err: any) {
        console.error("Fetch catalogue error details:", {
            message: err.message,
            stack: err.stack,
            id: idParam
        });
        return NextResponse.json({
            error: "Fetch failed",
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { id: idParam } = await params;
        const id = parseInt(idParam);
        const body = await req.json();
        const { searchSources, name, imageFolderPath, status, lastListinoName, pdfs, brandId } = body;

        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const updateData: { name?: string; imageFolderPath?: string | null; status?: string; lastListinoName?: string | null; brandId?: number | null } = {};
        if (typeof name === "string") updateData.name = name.trim();
        if (imageFolderPath !== undefined) updateData.imageFolderPath = imageFolderPath === "" ? null : String(imageFolderPath);
        if (typeof status === "string" && ["draft", "processing", "staging", "completed"].includes(status)) updateData.status = status;
        if (lastListinoName !== undefined) updateData.lastListinoName = lastListinoName === "" ? null : String(lastListinoName);
        if (brandId !== undefined) updateData.brandId = brandId === null || brandId === "" ? null : parseInt(String(brandId));

        if (Object.keys(updateData).length > 0) {
            await prisma.catalog.updateMany({
                where: { id, companyId },
                data: updateData
            });
        }

        if (pdfs !== undefined && Array.isArray(pdfs)) {
            await prisma.catalogPdf.deleteMany({ where: { catalogId: id } });
            const paths = pdfs.filter((p: unknown) => typeof p === "string" && p.trim() !== "");
            if (paths.length > 0) {
                await prisma.catalogPdf.createMany({
                    data: paths.map((path: string) => ({
                        catalogId: id,
                        fileName: path.split("/").pop() || "catalogo.pdf",
                        filePath: path.trim()
                    }))
                });
            }
        }

        if (searchSources !== undefined) {
            await prisma.searchSource.deleteMany({
                where: { catalogId: id }
            });
            if (Array.isArray(searchSources) && searchSources.length > 0) {
                await prisma.searchSource.createMany({
                    data: searchSources.map((source: any) => ({
                        catalogId: id,
                        url: source.url,
                        label: source.label || ''
                    }))
                });
            }
        }

        const updated = await prisma.catalog.findFirst({
            where: { id, companyId },
            include: { searchSources: true, pdfs: true, brandRef: true }
        });

        return NextResponse.json(updated);
    } catch (err: any) {
        console.error("Update catalogue error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { id: idParam } = await params;
        const id = parseInt(idParam);
        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const deleted = await prisma.catalog.deleteMany({
            where: { id, companyId }
        });
        if (deleted.count === 0) {
            return NextResponse.json({ error: "Catalogue not found" }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Delete catalogue error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
