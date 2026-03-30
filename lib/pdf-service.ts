/**
 * PDF service – unica gestione lettura/scrittura/validazione PDF.
 * In upload si tenta di normalizzare il PDF con pdf-lib (riscrittura) per migliorare compatibilità con PDF.js.
 *
 * Convenzioni:
 * - File su disco: public/uploads/{fileName} con fileName = {timestamp}-{nomeSanitizzato}.pdf
 * - In DB (CatalogPdf.filePath): "/uploads/{fileName}"
 * - Dimensione max 50 MB; validazione magic %PDF.
 */

import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { PDFDocument } from "pdf-lib";

export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;
/** Consigliato per Gemini (evita timeout/errori): max ~18 MB. */
export const MAX_PDF_SIZE_FOR_GEMINI_BYTES = 18 * 1024 * 1024;
const UPLOAD_DIR = "uploads";

function getPublicDir(): string {
    return path.join(process.cwd(), "public");
}

function getUploadDir(): string {
    return path.join(getPublicDir(), UPLOAD_DIR);
}

/** Da CatalogPdf.filePath a path assoluto su disco. */
export function pdfFilePathToAbsolute(filePath: string): string {
    const relative = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    return path.resolve(getPublicDir(), relative);
}

/** Controllo minimo per servire un file già salvato: magic %PDF e non vuoto. */
export function validatePdfBufferForServe(buffer: Buffer): { ok: true } | { ok: false; error: string } {
    if (buffer.length === 0) {
        return { ok: false, error: "File vuoto." };
    }
    const magic = buffer.subarray(0, 4).toString("ascii");
    if (magic !== "%PDF") {
        return { ok: false, error: "Il file non è un PDF valido." };
    }
    return { ok: true };
}

/**
 * Tenta di normalizzare il PDF caricandolo e riscrivendolo con pdf-lib.
 * Produce un file spesso più compatibile con PDF.js. Se fallisce, restituisce null (si salva l'originale).
 */
export async function tryNormalizePdfBuffer(buffer: Buffer): Promise<Buffer | null> {
    try {
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const bytes = await doc.save();
        const out = Buffer.from(bytes);
        if (out.length === 0) return null;
        if (out.length > MAX_PDF_SIZE_BYTES) return null;
        const magic = out.subarray(0, 4).toString("ascii");
        if (magic !== "%PDF") return null;
        return out;
    } catch {
        return null;
    }
}

/** Validazione upload: magic %PDF e max size (no trailer per accettare più PDF). */
export function validatePdfBuffer(buffer: Buffer): { ok: true } | { ok: false; error: string } {
    if (buffer.length === 0) {
        return { ok: false, error: "File vuoto." };
    }
    if (buffer.length > MAX_PDF_SIZE_BYTES) {
        return {
            ok: false,
            error: "File troppo grande. Dimensione massima " + Math.round(MAX_PDF_SIZE_BYTES / 1024 / 1024) + " MB.",
        };
    }
    const magic = buffer.subarray(0, 4).toString("ascii");
    if (magic !== "%PDF") {
        return { ok: false, error: "Il file non è un PDF valido (struttura corrotta)." };
    }
    return { ok: true };
}

/**
 * Restituisce il record CatalogPdf e il path assoluto. Verifica che il catalogo esista.
 */
export async function getPdfRecord(catalogId: number, pdfId: number) {
    const pdf = await prisma.catalogPdf.findFirst({
        where: { id: pdfId, catalogId },
    });
    if (!pdf) return null;
    const absolutePath = pdfFilePathToAbsolute(pdf.filePath);
    return { pdf, absolutePath };
}

/**
 * Legge il file PDF dal disco. Restituisce null se file non trovato o non leggibile.
 */
export async function getPdfBuffer(catalogId: number, pdfId: number): Promise<Buffer | null> {
    const record = await getPdfRecord(catalogId, pdfId);
    if (!record) return null;
    const { absolutePath } = record;
    if (!fs.existsSync(absolutePath)) return null;
    try {
        return await readFile(absolutePath);
    } catch {
        return null;
    }
}

/**
 * Salva un buffer PDF su disco e crea il record in DB.
 * Se possibile normalizza il PDF con pdf-lib prima di salvarlo (migliore compatibilità viewer).
 * Validazione inclusa; in caso di errore lancia con messaggio utente.
 */
export async function savePdf(
    catalogId: number,
    buffer: Buffer,
    originalFileName: string
): Promise<{ pdf: { id: number; fileName: string; filePath: string }; sizeBytes: number; normalized?: boolean }> {
    const validation = validatePdfBuffer(buffer);
    if (!validation.ok) {
        throw new Error(validation.error);
    }

    let toSave = buffer;
    let normalized = false;
    const normalizedBuffer = await tryNormalizePdfBuffer(buffer);
    if (normalizedBuffer != null) {
        toSave = normalizedBuffer;
        normalized = true;
    }

    const ext = path.extname(originalFileName) || ".pdf";
    const baseName = path.basename(originalFileName, ext).replace(/[^a-zA-Z0-9.-]/g, "_") || "document";
    const fileName = Date.now() + "-" + baseName + ext;
    const uploadDir = getUploadDir();
    await mkdir(uploadDir, { recursive: true });
    const absolutePath = path.join(uploadDir, fileName);
    await writeFile(absolutePath, toSave);

    const filePath = "/" + UPLOAD_DIR + "/" + fileName;
    const pdf = await prisma.catalogPdf.create({
        data: { catalogId, fileName: originalFileName, filePath },
    });

    return { pdf, sizeBytes: toSave.length, normalized };
}

/**
 * Elimina il file dal disco e il record dal DB. Restituisce true se eliminato.
 */
export async function deletePdf(catalogId: number, pdfId: number): Promise<boolean> {
    const record = await getPdfRecord(catalogId, pdfId);
    if (!record) return false;
    const { pdf, absolutePath } = record;
    if (fs.existsSync(absolutePath)) {
        await unlink(absolutePath);
    }
    await prisma.catalogPdf.delete({ where: { id: pdf.id } });
    return true;
}
