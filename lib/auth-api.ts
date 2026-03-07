import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { hasPermission, type PermissionKey } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

/** Restituisce la sessione corrente (lato server). */
export async function getSession(): Promise<Session | null> {
    return getServerSession(authOptions);
}

/**
 * Restituisce la sessione solo se l'utente ha almeno uno dei permessi indicati (o admin).
 * Se l'utente non ha ancora un profilo (profileId assente), viene consentito l'accesso
 * per permettere la bootstrap (assegnazione del primo profilo).
 */
export async function requirePermission(
    permission: PermissionKey | PermissionKey[]
): Promise<Session | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    const perms = session.user.permissions ?? [];
    const list = Array.isArray(permission) ? permission : [permission];
    const hasOne = list.some((p) => hasPermission(perms, p));
    if (hasOne) return session;
    // Bootstrap: utente senza profilo può accedere per assegnarsi un profilo
    if (session.user.profileId == null && session.user.userId) return session;
    return null;
}

/** True se l'utente è admin globale (companyId null). Solo lui può vedere/gestire le aziende. */
export function isGlobalAdmin(session: Session | null): boolean {
    return !!session?.user?.isGlobalAdmin;
}

/**
 * Restituisce l'id azienda effettivo per la richiesta corrente.
 * - Utente aziendale (companyId valorizzato): ignora fromRequest, restituisce il suo companyId.
 * - Admin globale (companyId null): restituisce fromRequest (query/body/header) o null se non fornito.
 */
export function getCompanyId(
    session: Session | null,
    fromRequest?: number | string | null
): number | null {
    if (!session?.user) return null;
    if (session.user.companyId != null) return session.user.companyId;
    if (fromRequest == null || fromRequest === "") return null;
    const n = typeof fromRequest === "string" ? parseInt(fromRequest, 10) : fromRequest;
    return Number.isNaN(n) ? null : n;
}

/** Restituisce la sessione solo se l'utente è admin globale (companyId null). */
export async function requireGlobalAdmin(): Promise<Session | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isGlobalAdmin) return null;
    return session;
}

/**
 * Legge companyId da query (companyId) o header (x-company-id).
 * Usato dalle API per determinare il contesto azienda quando l'admin globale fa richieste.
 */
export async function getCompanyIdFromRequest(req: Request): Promise<number | null> {
    const url = new URL(req.url);
    const q = url.searchParams.get("companyId");
    if (q) {
        const n = parseInt(q, 10);
        if (!Number.isNaN(n)) return n;
    }
    const h = req.headers.get("x-company-id");
    if (h) {
        const n = parseInt(h, 10);
        if (!Number.isNaN(n)) return n;
    }
    return null;
}

/**
 * Restituisce il companyId effettivo per la richiesta: richiede sessione valida.
 * Per utente aziendale usa sempre session.companyId.
 * Per admin globale usa companyId dalla request (query/header); se manca restituisce null (403 nelle API).
 */
export async function requireCompanyId(req: Request): Promise<{ session: Session; companyId: number } | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    const fromReq = await getCompanyIdFromRequest(req);
    const companyId = getCompanyId(session, fromReq);
    if (companyId == null) return null;
    return { session, companyId };
}

/**
 * Verifica che il catalogo esista e appartenga all'azienda dell'utente.
 * Da usare nelle route repositories/[id]/... (id = catalogId).
 */
export async function ensureCatalogAccess(
    req: Request,
    catalogId: number
): Promise<{ companyId: number } | null> {
    const ctx = await requireCompanyId(req);
    if (!ctx) return null;
    const catalog = await prisma.catalog.findFirst({
        where: { id: catalogId, companyId: ctx.companyId },
        select: { id: true },
    });
    return catalog ? { companyId: ctx.companyId } : null;
}
