import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { hasPermission, type PermissionKey } from "@/lib/permissions";
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
