import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET() {
    try {
        // 1. Test Environment Variables
        const dbUrl = process.env.DATABASE_URL ? "CONFIGURED (Hidden for safety)" : "MISSING";

        // 2. Test DB Connection
        await prisma.$queryRaw`SELECT 1`;

        // 3. Check Tables
        const catalogCount = await prisma.catalog.count();
        const productCount = await prisma.product.count();

        // 4. Check Filesystem
        const pubUploadsDir = path.join(process.cwd(), "public/uploads");
        const uploadsDir = path.join(process.cwd(), "uploads");

        const disk = {
            publicUploadsExists: fs.existsSync(pubUploadsDir),
            uploadsExists: fs.existsSync(uploadsDir),
            cwd: process.cwd(),
            publicUploadsContent: fs.existsSync(pubUploadsDir) ? fs.readdirSync(pubUploadsDir).slice(0, 10) : []
        };

        return NextResponse.json({
            status: "SUCCESS",
            databaseUrl: dbUrl,
            connection: "ACTIVE",
            stats: {
                catalogs: catalogCount,
                products: productCount
            },
            disk
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
