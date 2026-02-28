import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const handler = NextAuth({
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
        async session({ session, token }) {
            if (token && session.user) {
                (session.user as any).id = token.sub;
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET || "7f5e8aeb9cdd90123fabcde456890123",
});

export { handler as GET, handler as POST };
