import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function clientMeta(req: Request | null | undefined): { ip: string | null; userAgent: string | null } {
    if (!req?.headers) return { ip: null, userAgent: null };
    const xf = req.headers.get("x-forwarded-for");
    const ip =
        xf?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        req.headers.get("cf-connecting-ip") ||
        null;
    const userAgent = req.headers.get("user-agent");
    return {
        ip: ip ? ip.slice(0, 64) : null,
        userAgent: userAgent ? userAgent.slice(0, 512) : null,
    };
}

/** Non blocca mai il flusso auth/API in caso di errore DB. */
export async function recordUserAudit(params: {
    userId: number | null;
    action: string;
    emailHint?: string | null;
    details?: Record<string, unknown> | null;
    req?: Request | null;
}): Promise<void> {
    try {
        const { ip, userAgent } = clientMeta(params.req ?? null);
        await prisma.userAuditLog.create({
            data: {
                userId: params.userId,
                action: params.action.slice(0, 64),
                emailHint: params.emailHint ? params.emailHint.slice(0, 255) : null,
                ip,
                userAgent,
                details:
                    params.details === null || params.details === undefined
                        ? undefined
                        : (params.details as Prisma.InputJsonValue),
            },
        });
    } catch (e) {
        console.warn("[user-audit]", e);
    }
}
