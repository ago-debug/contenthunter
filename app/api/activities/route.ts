import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(req: NextRequest) {
  const ctx = await requireCompanyId(req);
  if (!ctx) {
    return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
  }
  const { companyId } = ctx;

  const rows = await prisma.activityLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 400,
  });

  return NextResponse.json({
    activities: rows.map((r) => ({
      id: String(r.id),
      type: r.type,
      status: r.status,
      at: r.createdAt.toISOString(),
      description: r.description,
      brand: r.brand || undefined,
      catalogue: r.catalogue || undefined,
      companyId: r.companyId,
      total: r.total,
      done: r.done,
      errors: r.errors,
    })),
  });
}

