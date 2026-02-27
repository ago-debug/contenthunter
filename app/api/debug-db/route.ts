import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        // 1. Test Environment Variables
        const dbUrl = process.env.DATABASE_URL ? "CONFIGURED (Hidden for safety)" : "MISSING";

        // 2. Test DB Connection
        await prisma.$queryRaw`SELECT 1`;

        // 3. Check Tables
        const catalogCount = await prisma.catalog.count();
        const productCount = await prisma.product.count();

        return NextResponse.json({
            status: "SUCCESS",
            databaseUrl: dbUrl,
            connection: "ACTIVE",
            stats: {
                catalogs: catalogCount,
                products: productCount
            }
        });
    } catch (err: any) {
        return NextResponse.json({
            status: "ERROR",
            message: err.message,
            stack: err.stack,
            hint: "Check if DATABASE_URL is correct and if you run 'npx prisma db push' on the server."
        }, { status: 500 });
    }
}
