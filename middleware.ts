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
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        "/((?!api/register|api/auth|login|register|_next/static|_next/image|favicon.ico).*)",
    ],
};
