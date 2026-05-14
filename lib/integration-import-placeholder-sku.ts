/**
 * SKU provvisori per import da canali esterni quando il negozio non espone un codice articolo
 * (reference / SKU). Pattern stabile: stesso id remoto = stesso codice, così i re-import aggiornano
 * lo stesso prodotto Iris. Modificabile a mano dopo.
 *
 * Nuovi connettori: usare `placeholderSkuForChannel` e il flag `generateSkuForMissingChannelSku` nel body.
 */

export type IntegrationImportChannel = "woocommerce" | "prestashop";

export function integrationImportNumericId(raw: unknown): number | null {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
}

export function placeholderSkuWooCommerce(wooProductId: number): string {
    return `AUTO-WOO-${wooProductId}`;
}

export function placeholderSkuPrestashop(prestaProductId: number): string {
    return `AUTO-PS-${prestaProductId}`;
}

export function placeholderSkuForChannel(
    channel: IntegrationImportChannel,
    remoteProductId: number
): string {
    if (channel === "woocommerce") return placeholderSkuWooCommerce(remoteProductId);
    return placeholderSkuPrestashop(remoteProductId);
}

/** Flag unificato per tutti gli import da canale; legacy per Woo/Presta se già in uso. */
export function readGenerateSkuForMissingChannelSku(
    body: Record<string, unknown> | null | undefined,
    channel: IntegrationImportChannel
): boolean {
    if (!body || typeof body !== "object") return false;
    if (body.generateSkuForMissingChannelSku === true) return true;
    if (channel === "woocommerce" && body.generateSkuForMissingWooSku === true) return true;
    if (channel === "prestashop" && body.generateSkuForMissingPrestaSku === true) return true;
    return false;
}
