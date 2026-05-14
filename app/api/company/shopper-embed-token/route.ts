import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

/** Genera o rigenera il token per widget / iframe WooCommerce (Personal Shopper pubblico). */
export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }

    const raw = randomBytes(36).toString("base64url");

    await prisma.company.update({
        where: { id: ctx.companyId },
        data: { shopperEmbedToken: raw },
    });

    return NextResponse.json({
        token: raw,
        message:
            "Copia il token e il codice iframe qui sotto. Chi ha il token può usare il Personal Shopper sul catalogo della tua azienda: non condividerlo pubblicamente.",
    });
}

/** Rimuove il token (disattiva widget pubblico). */
export async function DELETE(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }

    await prisma.company.update({
        where: { id: ctx.companyId },
        data: { shopperEmbedToken: null },
    });

    return NextResponse.json({ ok: true });
}
