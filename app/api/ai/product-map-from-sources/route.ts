import { NextRequest, NextResponse } from "next/server";
import { requireCompanyId, ensureCatalogAccess, getSession } from "@/lib/auth-api";
import { assertCompanyFeatureEnabled } from "@/lib/plan-limits";
import {
    assertAiCreditsSufficient,
    applyAiCreditDebit,
    getAiCreditChargeNotebookMap,
} from "@/lib/ai-credits";
import { getPdfBuffer, tryNormalizePdfBuffer, MAX_PDF_SIZE_FOR_GEMINI_BYTES } from "@/lib/pdf-service";
import { fetchUrlAsPlainText } from "@/lib/fetch-url-safe";
import {
    mapProductFieldsFromSources,
    computeMissingMandatory,
    type NotebookAnchor,
    type ResolvedNotebookSource,
} from "@/lib/notebook-product-map";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";

export const maxDuration = 120;

const MAX_SOURCES = 8;
const MAX_FIELD_KEYS = 36;
const MAX_TEXT_PER_CLIP = 120_000;
const MAX_PDF_TOTAL = 4;

function sanitizeFieldKey(k: unknown): string | null {
    if (typeof k !== "string") return null;
    const t = k.trim().slice(0, 64);
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(t)) return null;
    return t;
}

function parseAnchor(body: Record<string, unknown>): NotebookAnchor | null {
    const a = body.anchor;
    if (!a || typeof a !== "object") return null;
    const mode = String((a as { mode?: unknown }).mode || "").toLowerCase();
    if (mode === "sku") {
        const sku = String((a as { sku?: unknown }).sku || "").trim();
        if (!sku || sku.length > 120) return null;
        return { mode: "sku", sku };
    }
    if (mode === "title") {
        const titleHint = String((a as { titleHint?: unknown }).titleHint || "").trim();
        if (!titleHint || titleHint.length > 300) return null;
        return { mode: "title", titleHint };
    }
    if (mode === "new") {
        const suggestedName = String((a as { suggestedName?: unknown }).suggestedName || "").trim();
        return { mode: "new", suggestedName: suggestedName.slice(0, 300) || undefined };
    }
    return null;
}

type SourceIn = Record<string, unknown>;

export async function POST(req: NextRequest) {
    try {
        const ctx = await requireCompanyId(req);
        if (!ctx) {
            return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
        }
        const { companyId } = ctx;
        const session = await getSession();
        const pdfGate = await assertCompanyFeatureEnabled(companyId, "pdfSuite", session);
        if (!pdfGate.ok) {
            return NextResponse.json({ error: pdfGate.message }, { status: 403 });
        }

        const creditCost = getAiCreditChargeNotebookMap();
        const creditPre = await assertAiCreditsSufficient(companyId, creditCost);
        if (!creditPre.ok) {
            return NextResponse.json({ error: creditPre.message }, { status: 402 });
        }

        const body = (await req.json()) as Record<string, unknown>;
        const anchor = parseAnchor(body);
        if (!anchor) {
            return NextResponse.json(
                { error: "anchor non valido: usa mode sku|title|new con i campi richiesti." },
                { status: 400 }
            );
        }

        const rawKeys = Array.isArray(body.fieldKeys) ? body.fieldKeys : [];
        const fieldKeys = Array.from(
            new Set(rawKeys.map(sanitizeFieldKey).filter((x): x is string => x != null))
        );
        if (fieldKeys.length === 0 || fieldKeys.length > MAX_FIELD_KEYS) {
            return NextResponse.json(
                { error: `fieldKeys: da 1 a ${MAX_FIELD_KEYS} nomi validi (lettera iniziale, poi lettere/numeri/_).` },
                { status: 400 }
            );
        }

        const rawMandatory = Array.isArray(body.mandatoryKeys) ? body.mandatoryKeys : [];
        const mandatoryKeys = Array.from(
            new Set(rawMandatory.map(sanitizeFieldKey).filter((x): x is string => x != null))
        ).filter((k) => fieldKeys.includes(k));

        const extraInstructions =
            typeof body.extraInstructions === "string" ? body.extraInstructions.slice(0, 4000) : null;

        const sourcesIn = Array.isArray(body.sources) ? body.sources : [];
        if (sourcesIn.length === 0 || sourcesIn.length > MAX_SOURCES) {
            return NextResponse.json({ error: `Indicare da 1 a ${MAX_SOURCES} fonti.` }, { status: 400 });
        }

        const resolved: ResolvedNotebookSource[] = [];
        let pdfCount = 0;

        for (const s of sourcesIn as SourceIn[]) {
            if (!s || typeof s !== "object") continue;
            const type = String(s.type || "").trim();
            if (type === "pdf_catalog") {
                pdfCount++;
                const catalogId = Number(s.catalogId);
                const pdfId = Number(s.pdfId);
                if (!Number.isFinite(catalogId) || !Number.isFinite(pdfId)) {
                    return NextResponse.json(
                        { error: "pdf_catalog: catalogId e pdfId devono essere numerici." },
                        { status: 400 }
                    );
                }
                const access = await ensureCatalogAccess(req, catalogId);
                if (!access) {
                    return NextResponse.json({ error: "Catalogo non accessibile." }, { status: 403 });
                }
                const bufRaw = await getPdfBuffer(catalogId, pdfId);
                if (!bufRaw) {
                    return NextResponse.json(
                        { error: `PDF non trovato (catalogo ${catalogId}, pdf ${pdfId}).` },
                        { status: 404 }
                    );
                }
                if (bufRaw.length > MAX_PDF_SIZE_FOR_GEMINI_BYTES) {
                    return NextResponse.json({ error: "PDF troppo grande per l'elaborazione Gemini." }, { status: 413 });
                }
                const normalized = (await tryNormalizePdfBuffer(bufRaw)) ?? bufRaw;
                const label =
                    typeof s.label === "string" && s.label.trim()
                        ? s.label.trim().slice(0, 200)
                        : `catalogo ${catalogId} / ${pdfId}`;
                resolved.push({ kind: "pdf", buffer: normalized, label });
            } else if (type === "pdf_base64") {
                pdfCount++;
                const data = typeof s.data === "string" ? s.data.trim() : "";
                if (!data) {
                    return NextResponse.json({ error: "pdf_base64: campo data (base64) richiesto." }, { status: 400 });
                }
                let buffer: Buffer;
                try {
                    buffer = Buffer.from(data, "base64");
                } catch {
                    return NextResponse.json({ error: "pdf_base64: base64 non valido." }, { status: 400 });
                }
                if (buffer.length > MAX_PDF_SIZE_FOR_GEMINI_BYTES) {
                    return NextResponse.json({ error: "PDF caricato troppo grande." }, { status: 413 });
                }
                const normalized = (await tryNormalizePdfBuffer(buffer)) ?? buffer;
                const fn =
                    typeof s.filename === "string" && s.filename.trim()
                        ? s.filename.trim().slice(0, 200)
                        : "upload.pdf";
                resolved.push({ kind: "pdf", buffer: normalized, label: fn });
            } else if (type === "url") {
                const url = typeof s.url === "string" ? s.url.trim() : "";
                if (!url) {
                    return NextResponse.json({ error: "url: campo url richiesto." }, { status: 400 });
                }
                let plain: Awaited<ReturnType<typeof fetchUrlAsPlainText>>;
                try {
                    plain = await fetchUrlAsPlainText(url);
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Errore di rete";
                    return NextResponse.json({ error: `URL: ${msg}` }, { status: 400 });
                }
                const headline = plain.title ? `${plain.title} (${plain.finalUrl})` : plain.finalUrl;
                resolved.push({
                    kind: "text",
                    label: headline.slice(0, 240),
                    text: plain.text.slice(0, MAX_TEXT_PER_CLIP),
                });
            } else if (type === "text") {
                const text = typeof s.text === "string" ? s.text : "";
                if (!text.trim()) {
                    return NextResponse.json({ error: "text: campo text richiesto." }, { status: 400 });
                }
                const lab =
                    typeof s.label === "string" && s.label.trim()
                        ? s.label.trim().slice(0, 200)
                        : "Testo incollato";
                resolved.push({ kind: "text", label: lab, text: text.slice(0, MAX_TEXT_PER_CLIP) });
            } else {
                return NextResponse.json({ error: `Tipo fonte non supportato: ${type || "(vuoto)"}` }, { status: 400 });
            }
        }

        if (resolved.length === 0) {
            return NextResponse.json({ error: "Nessuna fonte valida." }, { status: 400 });
        }

        if (pdfCount > MAX_PDF_TOTAL) {
            return NextResponse.json({ error: `Massimo ${MAX_PDF_TOTAL} PDF per richiesta.` }, { status: 400 });
        }

        const keys = await resolveIntegrationKeys(companyId);
        const ai = await mapProductFieldsFromSources({
            sources: resolved,
            anchor,
            fieldKeys,
            mandatoryKeys,
            extraInstructions,
            geminiApiKey: keys.gemini || null,
        });

        const missingMandatory = computeMissingMandatory(mandatoryKeys, ai.mapped);

        try {
            await applyAiCreditDebit({
                companyId,
                userId: (session?.user as { userId?: number } | undefined)?.userId,
                amount: creditCost,
                reason: "notebook_map",
                meta: { sourceCount: resolved.length, pdfCount, fieldCount: fieldKeys.length },
            });
        } catch (deErr) {
            console.warn("[ai-credits] addebito notebook_map:", deErr);
        }

        return NextResponse.json({
            mapped: ai.mapped,
            extras: ai.extras,
            sourceNotes: ai.sourceNotes,
            confidence: ai.confidence,
            missingMandatory,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Errore server";
        console.error("product-map-from-sources:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
