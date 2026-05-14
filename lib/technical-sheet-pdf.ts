import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type TechnicalSheetPdfInput = {
    companyName: string;
    printHeader: boolean;
    printLogo: boolean;
    headerHtmlOrText: string;
    logoUrl: string | null;
    sku: string;
    ean: string | null;
    titleIt: string;
    descriptionIt: string;
    sections: { title: string; body: string }[];
    logistics: {
        codiceArticolo: string;
        codiceEan: string;
        packagingLabel: string;
        packagingNote: string;
        palettLabel: string;
        palettNote: string;
    };
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const MAX_LINE_CHARS = 92;

function wrapText(text: string, maxChars: number): string[] {
    const t = text.replace(/\r\n/g, "\n").trim();
    if (!t) return [];
    const lines: string[] = [];
    for (const para of t.split("\n")) {
        let rest = para.trim();
        while (rest.length > 0) {
            if (rest.length <= maxChars) {
                lines.push(rest);
                break;
            }
            let cut = rest.lastIndexOf(" ", maxChars);
            if (cut < maxChars * 0.5) cut = maxChars;
            lines.push(rest.slice(0, cut).trimEnd());
            rest = rest.slice(cut).trimStart();
        }
    }
    return lines;
}

async function tryEmbedLogo(
    doc: PDFDocument,
    url: string
): Promise<{ draw: (page: import("pdf-lib").PDFPage, x: number, yTop: number) => number } | null> {
    const u = url.trim();
    if (!u.startsWith("http://") && !u.startsWith("https://")) return null;
    try {
        const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const ct = r.headers.get("content-type") || "";
        const ab = await r.arrayBuffer();
        const buf = new Uint8Array(ab);
        if (ct.includes("png") || u.toLowerCase().endsWith(".png")) {
            const image = await doc.embedPng(buf);
            const w = Math.min(120, image.width);
            const h = (image.height * w) / image.width;
            return {
                draw(page, x, yTop) {
                    page.drawImage(image, { x, y: yTop - h, width: w, height: h });
                    return h;
                },
            };
        }
        if (ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g$/i.test(u)) {
            const image = await doc.embedJpg(buf);
            const w = Math.min(120, image.width);
            const h = (image.height * w) / image.width;
            return {
                draw(page, x, yTop) {
                    page.drawImage(image, { x, y: yTop - h, width: w, height: h });
                    return h;
                },
            };
        }
    } catch {
        return null;
    }
    return null;
}

function stripHtml(s: string): string {
    return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function buildTechnicalSheetPdf(input: TechnicalSheetPdfInput): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const drawLine = (text: string, size: number, bold: boolean, color = rgb(0.12, 0.14, 0.18)) => {
        const f = bold ? fontBold : font;
        page.drawText(text, { x: MARGIN, y, size, font: f, color, maxWidth: PAGE_W - 2 * MARGIN });
        y -= size + 4;
    };

    const newPageIfNeeded = (minBottom: number) => {
        if (y < minBottom) {
            page = doc.addPage([PAGE_W, PAGE_H]);
            y = PAGE_H - MARGIN;
        }
    };

    const drawWrapped = (text: string, size: number, bold = false) => {
        const lines = wrapText(stripHtml(text), MAX_LINE_CHARS);
        for (const line of lines) {
            newPageIfNeeded(MARGIN + 60);
            drawLine(line, size, bold);
        }
    };

    const drawSectionTitle = (t: string) => {
        y -= 8;
        newPageIfNeeded(MARGIN + 80);
        drawLine(t.toUpperCase(), 10, true, rgb(0.05, 0.1, 0.2));
        y -= 4;
    };

    if (input.printLogo && input.logoUrl) {
        const emb = await tryEmbedLogo(doc, input.logoUrl);
        if (emb) {
            const h = emb.draw(page, PAGE_W - MARGIN - 120, y + 4);
            y -= Math.max(0, h - 16);
        }
    }

    if (input.printHeader && input.headerHtmlOrText.trim()) {
        drawWrapped(input.headerHtmlOrText, 9);
        y -= 6;
    }

    drawLine("SCHEDA TECNICA", 16, true);
    drawLine(input.companyName, 11, false, rgb(0.35, 0.38, 0.42));
    y -= 10;

    drawSectionTitle("Anagrafica prodotto");
    drawLine(`SKU: ${input.sku}`, 10, false);
    if (input.ean) drawLine(`EAN: ${input.ean}`, 10, false);
    drawLine(`Titolo (IT): ${input.titleIt}`, 10, false);
    y -= 4;
    drawSectionTitle("Descrizione (IT)");
    drawWrapped(input.descriptionIt || "—", 9);

    for (const s of input.sections) {
        if (!s.body.trim()) continue;
        drawSectionTitle(s.title);
        drawWrapped(s.body, 9);
    }

    drawSectionTitle("Scheda logistica");
    drawLine(`Codice articolo: ${input.logistics.codiceArticolo}`, 10, false);
    drawLine(`Codice EAN: ${input.logistics.codiceEan}`, 10, false);
    drawLine(`Packaging: ${input.logistics.packagingLabel || "—"}`, 10, false);
    if (input.logistics.packagingNote.trim()) {
        drawWrapped(`Nota packaging: ${input.logistics.packagingNote}`, 8);
    }
    drawLine(`Palettizzazione: ${input.logistics.palettLabel || "—"}`, 10, false);
    if (input.logistics.palettNote.trim()) {
        drawWrapped(`Nota palettizzazione: ${input.logistics.palettNote}`, 8);
    }

    return new Uint8Array(await doc.save());
}
