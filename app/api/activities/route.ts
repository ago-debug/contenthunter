import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(req: NextRequest) {
  const ctx = await requireCompanyId(req);
  if (!ctx) {
    return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
  }
  const { companyId } = ctx;

  const [rows, ongoingJobs] = await Promise.all([
    prisma.activityLog.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.aiBulkSeoJob.findMany({
      where: { companyId, status: { in: ["running", "paused"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        overwriteExisting: true,
        total: true,
        done: true,
        errors: true,
        brand: true,
        catalogue: true,
        startedAt: true,
        items: {
          where: { status: "processing" },
          orderBy: { id: "asc" },
          take: 1,
          select: { productId: true },
        },
      },
    }),
  ]);

  const ongoingBulkSeoJobs = ongoingJobs.map((j) => {
    const total = j.total || 0;
    const done = j.done || 0;
    const progressPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return {
      id: j.id,
      type: "ai_bulk_seo" as const,
      status: j.status as "running" | "paused",
      overwriteExisting: j.overwriteExisting,
      startedAt: j.startedAt.toISOString(),
      total,
      done,
      errors: j.errors,
      brand: j.brand || undefined,
      catalogue: j.catalogue || undefined,
      progressPct,
      currentProductId: j.items[0]?.productId,
    };
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
    ongoingBulkSeoJobs,
  });
}

