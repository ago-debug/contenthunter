import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { triggerAiBulkSeoJob } from "@/lib/ai-bulk-seo-runner";

async function getOwnedJob(companyId: number, idStr: string) {
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return null;
  return prisma.aiBulkSeoJob.findFirst({
    where: { id, companyId },
    select: { id: true, status: true, total: true, done: true, errors: true, startedAt: true, finishedAt: true },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanyId(req);
  if (!ctx) {
    return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
  }
  const { id } = await params;
  const job = await getOwnedJob(ctx.companyId, id);
  if (!job) return NextResponse.json({ error: "Job non trovato" }, { status: 404 });

  const current = await prisma.aiBulkSeoJobItem.findFirst({
    where: { jobId: job.id, status: "processing" },
    orderBy: { id: "asc" },
    select: { productId: true },
  });
  return NextResponse.json({
    id: job.id,
    status: job.status,
    total: job.total,
    done: job.done,
    errors: job.errors,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    currentProductId: current?.productId,
    running: job.status === "running",
    paused: job.status === "paused",
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanyId(req);
  if (!ctx) {
    return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
  }
  const { id } = await params;
  const job = await getOwnedJob(ctx.companyId, id);
  if (!job) return NextResponse.json({ error: "Job non trovato" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  if (!["pause", "resume", "stop"].includes(action)) {
    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  }

  if (action === "pause" && job.status === "running") {
    await prisma.aiBulkSeoJob.update({ where: { id: job.id }, data: { status: "paused" } });
  } else if (action === "resume" && job.status === "paused") {
    await prisma.aiBulkSeoJob.update({ where: { id: job.id }, data: { status: "running" } });
    void triggerAiBulkSeoJob(job.id);
  } else if (action === "stop" && (job.status === "running" || job.status === "paused")) {
    await prisma.aiBulkSeoJob.update({
      where: { id: job.id },
      data: { status: "stopped", finishedAt: new Date() },
    });
    const fresh = await prisma.aiBulkSeoJob.findUnique({
      where: { id: job.id },
      select: { companyId: true, total: true, done: true, errors: true },
    });
    if (fresh) {
      await prisma.activityLog.create({
        data: {
          companyId: fresh.companyId,
          type: "ai_bulk_seo",
          status: "stopped",
          description: "Generazione SEO AI massiva interrotta",
          total: fresh.total,
          done: fresh.done,
          errors: fresh.errors,
        },
      });
    }
  }

  const out = await prisma.aiBulkSeoJob.findUnique({
    where: { id: job.id },
    select: { id: true, status: true, total: true, done: true, errors: true },
  });
  return NextResponse.json(out);
}

