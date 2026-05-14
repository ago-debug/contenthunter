/** Campi da sovrascrivere sul canale (false = mantieni valore già presente sul negozio, solo in aggiornamento). */

export type PrestaPushFieldOverwrite = {
    title: boolean;
    description: boolean;
    shortDescription: boolean;
    price: boolean;
    ean: boolean;
    category: boolean;
    manufacturer: boolean;
    images: boolean;
    stock: boolean;
    /** Peso, dimensioni (l×p×h) ed etichetta unità (`unity` su Presta) */
    physical: boolean;
};

export const DEFAULT_PRESTA_PUSH_OVERWRITE: PrestaPushFieldOverwrite = {
    title: true,
    description: true,
    shortDescription: true,
    price: true,
    ean: true,
    category: true,
    manufacturer: true,
    images: true,
    stock: true,
    physical: true,
};

export function normalizePrestaPushOverwrite(raw: unknown): PrestaPushFieldOverwrite {
    const d = { ...DEFAULT_PRESTA_PUSH_OVERWRITE };
    if (!raw || typeof raw !== "object") return d;
    const o = raw as Record<string, unknown>;
    (Object.keys(d) as (keyof PrestaPushFieldOverwrite)[]).forEach((k) => {
        if (o[k] === false) d[k] = false;
    });
    return d;
}

export type WooPushFieldOverwrite = {
    title: boolean;
    description: boolean;
    shortDescription: boolean;
    price: boolean;
    images: boolean;
    categories: boolean;
    brand: boolean;
    stock: boolean;
    /** Campo `weight` REST (unità = impostazioni WooCommerce) */
    weight: boolean;
    attributesExtra: boolean;
    acfMeta: boolean;
};

export const DEFAULT_WOO_PUSH_OVERWRITE: WooPushFieldOverwrite = {
    title: true,
    description: true,
    shortDescription: true,
    price: true,
    images: true,
    categories: true,
    brand: true,
    stock: true,
    weight: true,
    attributesExtra: true,
    acfMeta: true,
};

export function normalizeWooPushOverwrite(raw: unknown): WooPushFieldOverwrite {
    const d = { ...DEFAULT_WOO_PUSH_OVERWRITE };
    if (!raw || typeof raw !== "object") return d;
    const o = raw as Record<string, unknown>;
    (Object.keys(d) as (keyof WooPushFieldOverwrite)[]).forEach((k) => {
        if (o[k] === false) d[k] = false;
    });
    return d;
}

export function prestaOverwriteNeedsRemoteFetch(ow: PrestaPushFieldOverwrite): boolean {
    return Object.values(ow).some((v) => v === false);
}

export function wooOverwriteNeedsRemoteFetch(ow: WooPushFieldOverwrite): boolean {
    return Object.values(ow).some((v) => v === false);
}
