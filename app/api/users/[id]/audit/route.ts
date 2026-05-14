import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGlobalAdmin, requirePermission } from "@/lib/auth-api";

function csvEscape(v: unknown): string {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session =
        (await requirePermission(["users:read", "admin"])) ?? (await requireGlobalAdmin());
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const userId = parseInt(idStr, 10);
    if (Number.isNaN(userId)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, companyId: true },
    });
    if (!target) {
        return NextResponse.json({ message: "Utente non trovato" }, { status: 404 });
    }

    if (!session.user.isGlobalAdmin) {
        if (target.companyId == null || target.companyId !== session.user.companyId) {
            return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
        }
    }

    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    const take = Math.min(500, Math.max(1, parseInt(url.searchParams.get("take") || "200", 10) || 200));

    const rows = await prisma.userAuditLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
            id: true,
            action: true,
            emailHint: true,
            ip: true,
            userAgent: true,
            details: true,
            createdAt: true,
        },
    });

    if (format === "csv") {
        const header = ["id", "createdAt", "action", "emailHint", "ip", "userAgent", "details"];
        const lines = [
            header.join(";"),
            ...rows.map((r) =>
                [
                    r.id,
                    r.createdAt.toISOString(),
                    r.action,
                    r.emailHint ?? "",
                    r.ip ?? "",
                    r.userAgent ?? "",
                    r.details != null ? JSON.stringify(r.details) : "",
                ]
                    .map(csvEscape)
                    .join(";")
            ),
        ];
        const bom = "\ufeff";
        return new NextResponse(bom + lines.join("\n"), {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="audit-utente-${userId}.csv"`,
            },
        });
    }

    return NextResponse.json({
        items: rows.map((r) => ({
            id: r.id,
            action: r.action,
            emailHint: r.emailHint,
            ip: r.ip,
            userAgent: r.userAgent,
            details: r.details,
            createdAt: r.createdAt.toISOString(),
        })),
    });
}
