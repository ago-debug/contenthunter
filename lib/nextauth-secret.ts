/**
 * Secret per la firma JWT NextAuth.
 * In produzione NEXTAUTH_SECRET è obbligatorio (mai usare valori fissi nel repository).
 */
export function getNextAuthSecret(): string {
    const s = process.env.NEXTAUTH_SECRET?.trim();
    if (s && s.length >= 16) {
        return s;
    }
    if (process.env.NODE_ENV !== "production") {
        const dev = s || "__development-only-nextauth-secret-min-32-chars-do-not-use-in-prod__";
        if (!s) {
            console.warn(
                "[auth] NEXTAUTH_SECRET non impostato: uso fallback solo per sviluppo. Imposta una stringa casuale in .env.local"
            );
        }
        return dev;
    }
    throw new Error(
        "NEXTAUTH_SECRET non impostato o troppo corto. In produzione impostare una stringa casuale (es. openssl rand -base64 32)."
    );
}
