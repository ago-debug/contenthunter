import { withAuth } from "next-auth/middleware";
import { getNextAuthSecret } from "@/lib/nextauth-secret";

export default withAuth({
    pages: {
        signIn: "/login",
    },
    callbacks: {
        authorized: ({ req, token }) => {
            // Allow public access to storage and static uploads (PDF worker / asset pubblici)
            if (req.nextUrl.pathname.startsWith("/api/storage")) return true;
            if (req.nextUrl.pathname.startsWith("/uploads/")) return true;

            if (req.nextUrl.pathname.startsWith("/api/") && !token) {
                return false; // Result in 401 if requested from withAuth middleware for APIs
            }
            return !!token;
        }
    },
    secret: getNextAuthSecret(),
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
         * - api/storage (forced public for pdf worker; proxy-image richiede login)
         */
        "/((?!api/register|api/auth|api/fix-auth|api/storage|api/debug-db|login|register|_next/static|_next/image|favicon.ico|uploads/).*)",
    ],
};
