import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import axios from "axios";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q");

        if (!query) {
            return NextResponse.json({ error: "Missing query" }, { status: 400 });
        }

        // Se è configurata una chiave API di SerpApi, la usiamo
        if (process.env.SERPAPI_KEY) {
            const serpRes = await axios.get('https://serpapi.com/search', {
                params: {
                    engine: "google_shopping",
                    q: query,
                    hl: "it",
                    gl: "it",
                    api_key: process.env.SERPAPI_KEY
                }
            });
            const shoppingResults = serpRes.data.shopping_results || [];
            const images = shoppingResults.map((r: any) => ({
                source: "Google Shopping (API)",
                url: r.thumbnail || r.image,
                title: r.title,
                link: r.link
            })).filter((r: any) => r.url);

            return NextResponse.json(images);
        }

        // Fallback: Web Scraping di base con Cheerio (meno affidabile per le immagini)
        const encodedQuery = encodeURIComponent(query);
        const url = `https://www.google.com/search?q=${encodedQuery}&tbm=shop`;

        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        });

        const $ = cheerio.load(response.data);
        const results: any[] = [];

        // Parsing generico dei risultati (struttura DOM di Google può variare)
        $(".sh-dgr__content").each((i, el) => {
            if (i >= 15) return;
            // Estrazione immagine
            let imgUrl = $(el).find("img").attr("src");
            // A volte Google usa data-src o carica le immagini in base64 tramite script
            if (!imgUrl || !imgUrl.startsWith("http")) {
                const dataSrc = $(el).find("img").attr("data-src");
                if (dataSrc) imgUrl = dataSrc;
                else return; // skip if no valid image URL
            }
            const title = $(el).find("h3").text();

            results.push({
                source: "Google Shopping",
                url: imgUrl,
                title: title
            });
        });

        return NextResponse.json(results);
    } catch (err: any) {
        console.error("Scraping Google Shopping error:", err.message);
        return NextResponse.json({ error: "Failed to scrape" }, { status: 500 });
    }
}
