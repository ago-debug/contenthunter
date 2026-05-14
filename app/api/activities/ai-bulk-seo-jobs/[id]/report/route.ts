import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanyId(req);
  if (!ctx) {
    return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
  }
  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (Number.isNaN(jobId)) return NextResponse.json({ error: "ID job non valido" }, { status: 400 });

  const job = await prisma.aiBulkSeoJob.findFirst({
    where: { id: jobId, companyId: ctx.companyId },
    select: { id: true, total: true, done: true, errors: true, overwriteExisting: true, finishedAt: true, startedAt: true },
  });
  if (!job) return NextResponse.json({ error: "Job non trovato" }, { status: 404 });

  const rows = await prisma.aiBulkSeoJobItem.findMany({
    where: { jobId },
    orderBy: { id: "asc" },
    select: {
      productId: true,
      sku: true,
      title: true,
      status: true,
      message: true,
    },
  });
  return NextResponse.json({
    at: (job.finishedAt || job.startedAt).toISOString(),
    overwriteExisting: job.overwriteExisting,
    total: job.total,
    done: job.done,
    errors: job.errors,
    rows: rows.map((r) => ({
      productId: r.productId,
      sku: r.sku,
      title: r.title || "",
      outcome: r.status === "success" ? "ok" : r.status === "error" ? "error" : "ok",
      message: r.message || "",
    })),
  });
}

