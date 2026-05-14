import { PDFDocument } from "pdf-lib";

/** Numero di pagine del PDF (1-based count = valore restituito). */
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
}

/**
 * Estrae un nuovo PDF con solo le pagine [fromInclusive1, toInclusive1] (indici 1-based come in UI / Gemini).
 */
export async function extractPdfPageRangeToBuffer(
    buffer: Buffer,
    fromInclusive1: number,
    toInclusive1: number
): Promise<Buffer> {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const total = doc.getPageCount();
    const from = Math.max(1, Math.min(Math.floor(fromInclusive1), total));
    const to = Math.max(from, Math.min(Math.floor(toInclusive1), total));
    const indices: number[] = [];
    for (let i = from - 1; i <= to - 1; i++) indices.push(i);

    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(doc, indices);
    for (const page of copied) {
        outDoc.addPage(page);
    }
    const bytes = await outDoc.save();
    return Buffer.from(bytes);
}

/**
 * Se l’AI ha restituito numeri di pagina locali (1…N nello slice), mappa al catalogo globale.
 */
export function remapExtractedPageNumbersToGlobal(
    products: { pageNumber?: unknown }[],
    pageFrom1: number,
    pageTo1: number
): void {
    const span = pageTo1 - pageFrom1 + 1;
    if (span < 1) return;
    for (const p of products) {
        const n = typeof p.pageNumber === "number" ? p.pageNumber : parseInt(String(p.pageNumber), 10);
        if (!Number.isFinite(n)) continue;
        // Già nel range globale dello slice
        if (n >= pageFrom1 && n <= pageTo1) continue;
        // Probabile indice locale 1…span
        if (n >= 1 && n <= span) {
            p.pageNumber = n + (pageFrom1 - 1);
        }
    }
}
