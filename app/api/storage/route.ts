import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
    const filePathParam = req.nextUrl.searchParams.get("path");

    if (!filePathParam) {
        return new NextResponse("Missing file path", { status: 400 });
    }

    try {
        // Resolve the actual local path - we strip the starting slash if present
        const sanitizedPath = filePathParam.startsWith("/") ? filePathParam.slice(1) : filePathParam;

        // This targets the public folder
        const fullPath = path.join(process.cwd(), "public", sanitizedPath);

        const data = await readFile(fullPath);

        return new NextResponse(data, {
            headers: {
                "Content-Type": "application/pdf"
            }
        });
    } catch (e: any) {
        console.error("Storage API error:", e);
        return new NextResponse("Not Found", { status: 404 });
    }
}
