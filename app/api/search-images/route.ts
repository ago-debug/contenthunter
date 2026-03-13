import { NextRequest, NextResponse } from "next/server";

/**
 * TEMPORARY STUB
 *
 * Su alcuni ambienti Node di produzione l'implementazione completa
 * di web scraping / Google Images generava errori in fase di build.
 *
 * Per garantire che il deploy del PIM / Master ERP sia stabile,
 * questa route restituisce semplicemente un array vuoto.
 * La UI gestisce già correttamente il caso `images: []`.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query) {
        return NextResponse.json({ images: [] });
    }

    return NextResponse.json({ images: [] });
}
