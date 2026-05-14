/** Chiavi `extraFields` per la scheda tecnica (testi liberi). */
export const TECH_SHEET_TEXT_FIELDS: { key: string; label: string; hint?: string; rows: number; wide?: boolean }[] = [
    {
        key: "schedaTec_certOrganismo",
        label: "Certificazione biologica — organismo di controllo",
        hint: "Es. IT-BIO-007",
        rows: 2,
    },
    {
        key: "schedaTec_certOperatore",
        label: "Operatore controllato n°",
        hint: "Codice operatore / certificazione",
        rows: 2,
    },
    {
        key: "schedaTec_confezione",
        label: "Confezione / formato vendita",
        hint: "Es. 2 buste da 0,13 g",
        rows: 2,
    },
    {
        key: "schedaTec_pesoTotale",
        label: "Peso totale confezione",
        hint: "Es. 0,26 g",
        rows: 2,
    },
    { key: "schedaTec_ingredienti", label: "Ingredienti", rows: 4, wide: true },
    { key: "schedaTec_profiloSensoriale", label: "Profilo sensoriale", rows: 6, wide: true },
    {
        key: "schedaTec_qualitaControllata",
        label: "Qualità controllata",
        hint: "Protocolli di controllo, laboratori, convenzioni",
        rows: 8,
        wide: true,
    },
    {
        key: "schedaTec_profiloChimicoFisicoIso",
        label: "Profilo chimico / fisico (ISO 3632:2010 — Cat. ISO I)",
        rows: 6,
        wide: true,
    },
    {
        key: "schedaTec_profiloMicrobiologico",
        label: "Profilo microbiologico",
        rows: 6,
        wide: true,
    },
    { key: "schedaTec_shelfLife", label: "Shelf life", rows: 2 },
    { key: "schedaTec_allergeni", label: "Allergeni", rows: 4, wide: true },
    { key: "schedaTec_ogm", label: "OGM", rows: 2 },
];

export const PICKLIST_CATEGORY = {
    packaging: "logistics_packaging",
    palett: "logistics_palettizzazione",
} as const;

/** Chiavi extraFields usate come categorie picklist (tabella TechnicalPicklistItem). */
export const TECH_SHEET_TEXT_FIELD_KEYS: string[] = TECH_SHEET_TEXT_FIELDS.map((f) => f.key);

const LOGISTICS_CATEGORIES = new Set<string>([PICKLIST_CATEGORY.packaging, PICKLIST_CATEGORY.palett]);

/** Categorie ammesse dall'API `/api/technical-picklist` (logistica + ogni campo scheda tecnica). */
export function isAllowedTechnicalPicklistCategory(category: string): boolean {
    const c = String(category || "").trim();
    if (!c) return false;
    if (LOGISTICS_CATEGORIES.has(c)) return true;
    return TECH_SHEET_TEXT_FIELD_KEYS.includes(c);
}

/** Chiave extraFields per ID voce picklist scheda tecnica. */
export function technicalSheetPickIdKey(fieldKey: string): string {
    return `${fieldKey}_pickId`;
}

/** Chiave extraFields per note prodotto sul blocco scheda tecnica. */
export function technicalSheetNoteKey(fieldKey: string): string {
    return `${fieldKey}_note`;
}

/** Testo effettivo per PDF/stampa: corpo principale + note prodotto. */
export function technicalSheetSectionBody(extra: Record<string, string>, fieldKey: string): string {
    const main = (extra[fieldKey] ?? "").trim();
    const note = (extra[technicalSheetNoteKey(fieldKey)] ?? "").trim();
    if (!note) return main;
    if (!main) return note;
    return `${main}\n\n${note}`;
}
