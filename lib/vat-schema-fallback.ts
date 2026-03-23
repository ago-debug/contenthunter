/**
 * Rileva errori Prisma/MySQL quando lo schema IVA (VatCode / Product.vatCodeId)
 * non è ancora stato applicato sul DB (es. manca `prisma db push` in produzione).
 */
export function isVatSchemaUnavailableError(err: unknown): boolean {
    const e = err as { code?: string; message?: string };
    const code = e?.code;
    // Prisma: tabella o colonna assente
    if (code === "P2021" || code === "P2022") return true;
    const msg = String(e?.message ?? "").toLowerCase();
    if (msg.includes("doesn't exist") && (msg.includes("vatcode") || msg.includes("vat_code"))) return true;
    if (msg.includes("unknown column") && msg.includes("vatcodeid")) return true;
    if (msg.includes("unknown table") && msg.includes("vat")) return true;
    return false;
}
