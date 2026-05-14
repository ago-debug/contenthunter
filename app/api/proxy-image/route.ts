import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import axios from "axios";
import { authOptions } from "@/lib/auth-options";
import { assertSafeProxyImageUrl } from "@/lib/proxy-image-url";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB
const FETCH_TIMEOUT_MS = 15_000;

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
        return new NextResponse("Missing url", { status: 400 });
    }

    try {
        await assertSafeProxyImageUrl(url);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "URL non consentita";
        return new NextResponse(msg, { status: 400 });
    }

    try {
        const resp = await axios.get<ArrayBuffer>(url, {
            responseType: "arraybuffer",
            maxRedirects: 0,
            timeout: FETCH_TIMEOUT_MS,
            maxContentLength: MAX_IMAGE_BYTES,
            maxBodyLength: MAX_IMAGE_BYTES,
            validateStatus: (s) => s >= 200 && s < 400,
            headers: {
                Accept: "image/*,*/*;q=0.8",
            },
        });

        const contentType = String(resp.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
            return new NextResponse("Risposta non è un'immagine", { status: 415 });
        }

        return new NextResponse(resp.data, {
            headers: {
                "Content-Type": contentType || "image/jpeg",
                "Cache-Control": "private, max-age=3600",
            },
        });
    } catch (e: unknown) {
        const isAxios = axios.isAxiosError(e);
        if (isAxios && e.response?.status) {
            return new NextResponse("Origine ha risposto con errore", { status: 502 });
        }
        return new NextResponse("Errore nel recupero dell'immagine", { status: 500 });
    }
}
