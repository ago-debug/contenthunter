import { NextRequest, NextResponse } from "next/server";

/**
 * TEMPORARY STUB
 *
 * On some production Node environments the previous implementation
 * (using axios + cheerio + external HTTP calls) caused a `File is not defined`
 * error during Next.js static build when collecting page data.
 *
 * To keep the core PIM / Master ERP deployable and stable, we currently
 * short‑circuit this route and just return an empty result set.
 *
 * The UI that calls this endpoint already handles empty arrays gracefully.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query) {
        return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    return NextResponse.json([]);
}
