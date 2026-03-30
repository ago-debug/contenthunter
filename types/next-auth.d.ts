import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
    interface Session {
        user: {
            id?: string;
            userId?: number;
            companyId?: number | null;
            companyName?: string | null;
            isGlobalAdmin?: boolean;
            profileId?: number;
            profileName?: string;
            permissions?: string[];
            name?: string | null;
            email?: string | null;
            image?: string | null;
        };
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        userId?: number;
        companyId?: number | null;
        companyName?: string | null;
        isGlobalAdmin?: boolean;
        profileId?: number;
        profileName?: string;
        permissions?: string[];
    }
}
