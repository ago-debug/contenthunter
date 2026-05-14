/**
 * Mappatura campi prodotto stile NotebookLM: più fonti (PDF + testo) → JSON strutturato.
 */

import type { Part } from "@google/generative-ai";
import { getClient, getPdfModel, getResponseText } from "@/lib/gemini-pdf";

export type NotebookAnchor =
    | { mode: "sku"; sku: string }
    | { mode: "title"; titleHint: string }
    | { mode: "new"; suggestedName?: string };

export type ResolvedNotebookSource =
    | { kind: "pdf"; buffer: Buffer; label: string }
    | { kind: "text"; text: string; label: string };

export type NotebookMapAiResult = {
    mapped: Record<string, unknown>;
    extras: { key: string; value: string }[];
    sourceNotes: string[];
    confidence: string | null;
};

function stripJsonFence(s: string): string {
    let t = s.trim();
    if (t.startsWith("```")) {
        t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    }
    return t.trim();
}

function anchorDescription(a: NotebookAnchor): string {
    switch (a.mode) {
        case "sku":
            return `Il prodotto da arricchire è quello con SKU (confronto case-insensitive, ignora spazi bordi): "${a.sku}". Usa solo dati che si riferiscono chiaramente a questo articolo nelle fonti.`;
        case "title":
            return `Individua il prodotto il cui nome/titolo nelle fonti corrisponde o è molto simile a: "${a.titleHint}". Se ce ne sono più candidati, scegli il più supportato dal testo e documenta l'ambiguità in sourceNotes.`;
        case "new":
            return `Contesto "nuovo prodotto": non c'è un legame obbligatorio a uno SKU in archivio.${
                a.suggestedName?.trim()
                    ? ` Nome di lavoro / prodotto suggerito dall'utente: "${a.suggestedName.trim()}".`
                    : ""
            } Estrai i campi richiesti dal materiale che descrive questo articolo.`;
        default:
            return "";
    }
}

function buildUserPrompt(params: {
    anchor: NotebookAnchor;
    fieldKeys: string[];
    mandatoryKeys: string[];
    extraInstructions?: string | null;
}): string {
    const { anchor, fieldKeys, mandatoryKeys, extraInstructions } = params;
    const keysList = fieldKeys.map((k) => `- ${k}`).join("\n");
    const mand =
        mandatoryKeys.length > 0
            ? `Campi obbligatori (se non presenti nelle fonti con evidenza chiara, imposta null e spiega in sourceNotes):\n${mandatoryKeys.map((k) => `- ${k}`).join("\n")}`
            : "Nessun campo obbligatorio oltre alla coerenza con le fonti.";

    return `Sei un assistente stile NotebookLM: ragioni solo sulle fonti fornite (PDF in allegato e/o blocchi di testo). Non inventare dati tecnici o prezzi non supportati dal testo.

${anchorDescription(anchor)}

Chiavi da riempire nell'oggetto JSON "mapped" (usa esattamente questi nomi):
${keysList}

${mand}

${
    extraInstructions?.trim()
        ? `Istruzioni aggiuntive:\n${extraInstructions.trim()}\n`
        : ""
}Formato valori:
- stringhe per testi, sku, ean, brand, categoria, dimensioni, ecc.
- numeri per prezzi se espressi come numero nelle fonti
- per elenchi puntati (bulletPoints) preferisci un array di stringhe JSON; se non sei sicuro usa una stringa con righe separate da "\\n"

Dopo le istruzioni trovi le fonti: i PDF sono parti binarie application/pdf; i testi sono parti testuali etichettate.

Rispondi SOLO con JSON valido (nessun markdown), schema:
{
  "mapped": { <ogni chiave elencata sopra: string | number | string[] | null> },
  "extras": [ { "key": "string", "value": "string" } ],
  "sourceNotes": [ "string" ],
  "confidence": "high" | "medium" | "low"
}

Regole:
- "mapped" deve contenere tutte le chiavi elencate sopra (anche se null).
- "extras": attributi utili non coperti dalle chiavi principali.
- "sourceNotes": 2–6 brevi note su quali fonti hai usato e incertezze.
`;
}

export async function mapProductFieldsFromSources(params: {
    sources: ResolvedNotebookSource[];
    anchor: NotebookAnchor;
    fieldKeys: string[];
    mandatoryKeys: string[];
    extraInstructions?: string | null;
    geminiApiKey: string | null;
}): Promise<NotebookMapAiResult> {
    const { sources, anchor, fieldKeys, mandatoryKeys, extraInstructions, geminiApiKey } = params;
    if (!sources.length) {
        throw new Error("Nessuna fonte.");
    }

    const genAI = getClient(geminiApiKey);
    if (!genAI) {
        throw new Error("Gemini non configurato (chiave API mancante).");
    }

    const model = getPdfModel(genAI, { temperature: 0.15, responseMimeType: "application/json" });
    const userText = buildUserPrompt({ anchor, fieldKeys, mandatoryKeys, extraInstructions });

    const parts: Part[] = [{ text: userText }];

    for (const s of sources) {
        if (s.kind === "pdf") {
            parts.push({
                inlineData: {
                    mimeType: "application/pdf",
                    data: s.buffer.toString("base64"),
                },
            });
            parts.push({ text: `[Fonte PDF: ${s.label}]` });
        } else {
            parts.push({
                text: `[Fonte testo: ${s.label}]\n${s.text}`,
            });
        }
    }

    const result = await model.generateContent({
        contents: [{ role: "user", parts }],
    });

    const raw = stripJsonFence(getResponseText(result));
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error("Risposta AI non è JSON valido.");
    }
    const obj = parsed as Record<string, unknown>;
    const mappedRaw = obj.mapped;
    const mapped: Record<string, unknown> = {};
    if (mappedRaw && typeof mappedRaw === "object" && mappedRaw !== null && !Array.isArray(mappedRaw)) {
        const mr = mappedRaw as Record<string, unknown>;
        for (const k of fieldKeys) {
            if (Object.prototype.hasOwnProperty.call(mr, k)) {
                mapped[k] = mr[k];
            } else {
                mapped[k] = null;
            }
        }
    } else {
        for (const k of fieldKeys) mapped[k] = null;
    }

    const extras: { key: string; value: string }[] = [];
    const extrasRaw = obj.extras;
    if (Array.isArray(extrasRaw)) {
        for (const e of extrasRaw) {
            if (e && typeof e === "object" && "key" in e && "value" in e) {
                const k = String((e as { key: unknown }).key ?? "").trim().slice(0, 120);
                const v = String((e as { value: unknown }).value ?? "").slice(0, 4000);
                if (k) extras.push({ key: k, value: v });
            }
        }
    }

    const notesRaw = obj.sourceNotes;
    const sourceNotes = Array.isArray(notesRaw)
        ? notesRaw.map((n) => String(n)).filter(Boolean).slice(0, 12)
        : [];

    const confidence = obj.confidence != null ? String(obj.confidence).slice(0, 16) : null;

    return { mapped, extras, sourceNotes, confidence };
}

export function computeMissingMandatory(
    mandatoryKeys: string[],
    mapped: Record<string, unknown>
): string[] {
    const miss: string[] = [];
    for (const k of mandatoryKeys) {
        const v = mapped[k];
        if (v === undefined || v === null) {
            miss.push(k);
            continue;
        }
        if (typeof v === "string" && !v.trim()) {
            miss.push(k);
            continue;
        }
        if (Array.isArray(v) && v.length === 0) {
            miss.push(k);
        }
    }
    return miss;
}
