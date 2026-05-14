import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicAppBaseUrl } from "@/lib/app-base-url";

/**
 * Conferma email self-service: link inviato alla registrazione.
 * GET /api/auth/verify-email?token=...
 */
export async function GET(req: Request) {
    const base = getPublicAppBaseUrl();
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim();
    if (!token) {
        return NextResponse.redirect(new URL("/login?verified=0", base));
    }

    try {
        const user = await prisma.user.findFirst({
            where: { emailVerificationToken: token },
            select: { id: true, emailVerificationExpires: true },
        });
        if (!user || !user.emailVerificationExpires) {
            return NextResponse.redirect(new URL("/login?verified=0", base));
        }
        if (user.emailVerificationExpires.getTime() < Date.now()) {
            return NextResponse.redirect(new URL("/login?verified=expired", base));
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerifiedAt: new Date(),
                emailVerificationToken: null,
                emailVerificationExpires: null,
            },
        });

        return NextResponse.redirect(new URL("/login?verified=1", base));
    } catch (e) {
        console.error("[verify-email]", e);
        return NextResponse.redirect(new URL("/login?verified=0", base));
    }
}
