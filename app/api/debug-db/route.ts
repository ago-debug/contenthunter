import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

/**
 * Diagnostica DB senza sessione (es. login che non funziona).
 * In produzione, opzionale: imposta DEBUG_DB_TOKEN e chiama ?token=...
 */
export async function GET(req: NextRequest) {
    const isProd = process.env.NODE_ENV === "production";
    const expected = process.env.DEBUG_DB_TOKEN?.trim();
    if (isProd && expected) {
        const token = req.nextUrl.searchParams.get("token");
        if (token !== expected) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }

    try {
        const dbUrl = process.env.DATABASE_URL ? "CONFIGURED (Hidden for safety)" : "MISSING";

        await prisma.$queryRaw`SELECT 1`;

        const [catalogCount, productCount, userCount] = await Promise.all([
            prisma.catalog.count(),
            prisma.product.count(),
            prisma.user.count(),
        ]);

        const pubUploadsDir = path.join(process.cwd(), "public/uploads");
        const uploadsDir = path.join(process.cwd(), "uploads");

        const disk = {
            publicUploadsExists: fs.existsSync(pubUploadsDir),
            uploadsExists: fs.existsSync(uploadsDir),
            cwd: process.cwd(),
            publicUploadsContent: fs.existsSync(pubUploadsDir) ? fs.readdirSync(pubUploadsDir).slice(0, 10) : [],
        };

        return NextResponse.json({
            status: "SUCCESS",
            databaseUrl: dbUrl,
            connection: "ACTIVE",
            stats: {
                catalogs: catalogCount,
                products: productCount,
                users: userCount,
            },
            disk,
            hint:
                userCount === 0
                    ? "Nessun utente in tabella User: registrane uno o usa scripts/reset-password.js su server."
                    : undefined,
        });
    } catch (err: any) {
        const body: Record<string, unknown> = {
            status: "ERROR",
            message: err?.message || "Unknown error",
            hint: "Verifica DATABASE_URL e che MariaDB accetti connessioni dall’host dell’app.",
        };
        if (!isProd && err?.stack) {
            body.stack = err.stack;
        }
        return NextResponse.json(body, { status: 500 });
    }
}
