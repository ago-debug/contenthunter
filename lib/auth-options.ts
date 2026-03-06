import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Missing parameters");
                }

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email },
                });

                if (!user || !(await bcrypt.compare(credentials.password, user.password))) {
                    throw new Error("Invalid login details");
                }

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
                    include: { profile: true },
                });
                if (dbUser) {
                    token.userId = dbUser.id;
                    token.profileId = dbUser.profileId ?? undefined;
                    token.profileName = dbUser.profile?.name;
                    const perms = dbUser.profile?.permissions;
                    token.permissions = Array.isArray(perms) ? perms : [];
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.sub ?? undefined;
                session.user.userId = token.userId;
                session.user.profileId = token.profileId;
                session.user.profileName = token.profileName;
                session.user.permissions = token.permissions ?? [];
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET || "7f5e8aeb9cdd90123fabcde456890123",
};
