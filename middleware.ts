import { withAuth } from "next-auth/middleware";

export default withAuth({
    pages: {
        signIn: "/login",
    },
    callbacks: {
        authorized: ({ req, token }) => {
            // Allow public access to storage and pdfs
            if (req.nextUrl.pathname.startsWith("/api/storage")) return true;
            if (req.nextUrl.pathname.startsWith("/api/proxy-image")) return true;

            if (req.nextUrl.pathname.startsWith("/api/") && !token) {
                return false; // Result in 401 if requested from withAuth middleware for APIs
            }
            return !!token;
        }
    },
    secret: process.env.NEXTAUTH_SECRET || "7f5e8aeb9cdd90123fabcde456890123",
});

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/register (registration endpoint)
         * - api/auth (auth endpoints)
         * - login (login page)
         * - register (register page)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api/fix-auth (auto-fix plesk dev env)
         * - uploads (static files)
         * - api/storage (forced public for pdf worker)
         */
        "/((?!api/register|api/auth|api/fix-auth|api/storage|login|register|_next/static|_next/image|favicon.ico|uploads/).*)",
    ],
};
