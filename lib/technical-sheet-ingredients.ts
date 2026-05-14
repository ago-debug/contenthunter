/** Chiave `extraFields` JSON array composizione (ricetta). */
export const INGREDIENT_COMPOSITION_KEY = "schedaTec_ingredienti_composition";

/** Chiave testo introduttivo / aggiuntivo ingredienti (PDF). */
export const INGREDIENTS_FIELD_KEY = "schedaTec_ingredienti";

export type IngredientLine = {
    id: string;
    picklistId: number | null;
    /** Etichetta in PDF (da picklist o manuale). */
    label: string;
    qty: string;
    unit: string;
};

export const INGREDIENT_UNITS: { value: string; label: string }[] = [
    { value: "g", label: "g" },
    { value: "kg", label: "kg" },
    { value: "mg", label: "mg" },
    { value: "ml", label: "ml" },
    { value: "l", label: "l" },
    { value: "cl", label: "cl" },
    { value: "dl", label: "dl" },
    { value: "pz", label: "pz" },
    { value: "%", label: "%" },
    { value: "", label: "—" },
];

const MAX_LINES = 12;

function newLineId(): string {
    return `ing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyIngredientLine(): IngredientLine {
    return { id: newLineId(), picklistId: null, label: "", qty: "", unit: "g" };
}

export function parseIngredientComposition(raw: string | undefined | null): IngredientLine[] {
    if (!raw || !String(raw).trim()) return [emptyIngredientLine()];
    try {
        const parsed = JSON.parse(String(raw)) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) return [emptyIngredientLine()];
        const out: IngredientLine[] = [];
        for (const row of parsed.slice(0, MAX_LINES)) {
            if (!row || typeof row !== "object") continue;
            const r = row as Record<string, unknown>;
            const pickId = r.picklistId != null ? Number(r.picklistId) : NaN;
            out.push({
                id: typeof r.id === "string" && r.id ? r.id : newLineId(),
                picklistId: Number.isFinite(pickId) ? pickId : null,
                label: r.label != null ? String(r.label) : "",
                qty: r.qty != null ? String(r.qty) : "",
                unit: r.unit != null ? String(r.unit) : "",
            });
        }
        return out.length ? out : [emptyIngredientLine()];
    } catch {
        return [emptyIngredientLine()];
    }
}

export function serializeIngredientComposition(lines: IngredientLine[]): string {
    const clean = lines
        .slice(0, MAX_LINES)
        .map((l) => ({
            id: l.id,
            picklistId: l.picklistId,
            label: l.label.trim(),
            qty: l.qty.trim(),
            unit: l.unit.trim(),
        }));
    return JSON.stringify(clean);
}

/** Blocco testo per PDF da righe composizione. */
export function formatIngredientCompositionBlock(lines: IngredientLine[]): string {
    const rows = lines.filter((l) => l.label.trim() || l.picklistId != null);
    if (!rows.length) return "";
    return rows
        .map((l) => {
            const name = l.label.trim() || "—";
            const q = l.qty.trim();
            const u = l.unit.trim();
            if (q && u) return `• ${name}: ${q} ${u}`;
            if (q) return `• ${name}: ${q}`;
            return `• ${name}`;
        })
        .join("\n");
}

const NOTE_SUFFIX = "_note";

/** Corpo PDF sezione Ingredienti: intro + composizione + note. */
export function ingredientSectionBodyForPdf(extra: Record<string, string>): string {
    const intro = (extra[INGREDIENTS_FIELD_KEY] ?? "").trim();
    const compText = formatIngredientCompositionBlock(parseIngredientComposition(extra[INGREDIENT_COMPOSITION_KEY]));
    const note = (extra[`${INGREDIENTS_FIELD_KEY}${NOTE_SUFFIX}`] ?? "").trim();
    return [intro, compText, note].filter(Boolean).join("\n\n");
}
