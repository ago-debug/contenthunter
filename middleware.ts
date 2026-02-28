import { withAuth } from "next-auth/middleware";

export default withAuth({
    pages: {
        signIn: "/login",
    },
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
         */
        "/((?!api/register|api/auth|api/fix-auth|login|register|_next/static|_next/image|favicon.ico).*)",
    ],
};
