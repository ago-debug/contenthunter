/** URL pubblica dell’app (link nelle email, redirect). */
export function getPublicAppBaseUrl(): string {
    const u = (process.env.NEXTAUTH_URL || process.env.APP_PUBLIC_URL || process.env.VERCEL_URL || "").trim();
    if (!u) return "http://localhost:3000";
    if (/^https?:\/\//i.test(u)) return u.replace(/\/+$/, "");
    return `https://${u}`.replace(/\/+$/, "");
}
