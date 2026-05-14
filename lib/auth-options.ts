import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getNextAuthSecret } from "@/lib/nextauth-secret";
import { recordUserAudit } from "@/lib/user-audit";

export const authOptions: NextAuthOptions = {
    events: {
        async signOut(message) {
            const token = "token" in message ? message.token : null;
            const sub = token?.sub;
            if (sub) {
                const id = parseInt(sub, 10);
                if (!Number.isNaN(id)) {
                    await recordUserAudit({ userId: id, action: "logout" });
                }
            }
        },
    },
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials, req) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Missing parameters");
                }

                const email = credentials.email.trim();
                const reqObj = req instanceof Request ? req : null;
                let user;
                try {
                    // Usa Prisma (tabella reale @@map / case del server): la raw SQL "FROM User"
                    // può fallire su MariaDB dopo upgrade se il nome/case della tabella differisce.
                    user = await prisma.user.findUnique({
                        where: { email },
                        include: { company: { select: { onboardingStatus: true } } },
                    });
                } catch (e) {
                    console.error("[auth] Errore database durante il login:", e);
                    throw new Error("AuthServiceUnavailable");
                }

                if (!user) {
                    await recordUserAudit({
                        userId: null,
                        action: "login_failed",
                        emailHint: email,
                        details: { reason: "unknown_user" },
                        req: reqObj,
                    });
                    throw new Error("Invalid login details");
                }

                if (!(await bcrypt.compare(credentials.password, user.password))) {
                    await recordUserAudit({
                        userId: user.id,
                        action: "login_failed",
                        emailHint: email,
                        details: { reason: "bad_password" },
                        req: reqObj,
                    });
                    throw new Error("Invalid login details");
                }

                if (user.isActive === false) {
                    await recordUserAudit({
                        userId: user.id,
                        action: "login_denied",
                        emailHint: email,
                        details: { reason: "inactive" },
                        req: reqObj,
                    });
                    throw new Error("AccessDenied");
                }
                if (user.companyId != null && user.company && user.company.onboardingStatus !== "active") {
                    await recordUserAudit({
                        userId: user.id,
                        action: "login_denied",
                        emailHint: email,
                        details: { reason: "workspace_not_active" },
                        req: reqObj,
                    });
                    throw new Error("AccessDenied");
                }
                if (user.emailVerificationToken != null && user.emailVerifiedAt == null) {
                    await recordUserAudit({
                        userId: user.id,
                        action: "login_denied",
                        emailHint: email,
                        details: { reason: "email_not_verified" },
                        req: reqObj,
                    });
                    throw new Error("EmailNotVerified");
                }

                await recordUserAudit({
                    userId: user.id,
                    action: "login_success",
                    emailHint: email,
                    req: reqObj,
                });

                return {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.name,
                };
            },
        }),
    ],
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async jwt({ token, user: authUser }) {
            if (authUser?.id) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: parseInt(authUser.id, 10) },
                    include: { profile: true, company: true },
                });
                if (dbUser) {
                    token.userId = dbUser.id;
                    token.companyId = dbUser.companyId ?? undefined;
                    token.companyName = dbUser.company?.name;
                    token.isGlobalAdmin = dbUser.companyId == null;
                    token.profileId = dbUser.profileId ?? undefined;
                    token.profileName = dbUser.profile?.name;
                    const perms = dbUser.profile?.permissions;
                    token.permissions = Array.isArray(perms) ? (perms as string[]) : [];
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.sub ?? undefined;
                session.user.userId = token.userId;
                session.user.companyId = token.companyId ?? null;
                session.user.companyName = token.companyName ?? null;
                session.user.isGlobalAdmin = token.isGlobalAdmin ?? false;
                session.user.profileId = token.profileId;
                session.user.profileName = token.profileName;
                session.user.permissions = token.permissions ?? [];
            }
            return session;
        },
    },
    secret: getNextAuthSecret(),
};
