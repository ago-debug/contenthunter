import { NextRequest, NextResponse } from "next/server";
import { ensureCatalogAccess } from "@/lib/auth-api";
import { deletePdf } from "@/lib/pdf-service";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; pdfId: string }> }
) {
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id, 10);
        const pId = parseInt(pdfId, 10);

        if (isNaN(catalogId) || isNaN(pId)) {
            return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
        }

        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
        }

        const deleted = await deletePdf(catalogId, pId);
        if (!deleted) {
            return NextResponse.json({ error: "PDF non trovato" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Delete PDF error:", err);
        return NextResponse.json({ error: err.message || "Errore server" }, { status: 500 });
    }
}
