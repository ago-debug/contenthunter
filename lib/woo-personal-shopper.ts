import type { Prisma } from "@prisma/client";
import type { RecommendedProductChip } from "@/lib/personal-shopper-enrich";
import { enrichPersonalShopperRecommendedProducts } from "@/lib/personal-shopper-enrich";
import { prisma } from "@/lib/prisma";

export type { RecommendedProductChip } from "@/lib/personal-shopper-enrich";
import { runJsonChatCompletion, type ContentAiKeys } from "@/lib/ai-content-provider";
import { CONTENT_AI_KEY_MISSING_MESSAGE } from "@/lib/ai-content-provider";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { getAssistantMaxOutputTokens } from "@/lib/ai-cost-config";

/** Budget totale testo utente verso il modello (marchi + prodotti). Override: AI_SHOPPER_MAX_PAYLOAD_CHARS. */
const MAX_PAYLOAD_CHARS = (() => {
    const n = parseInt(process.env.AI_SHOPPER_MAX_PAYLOAD_CHARS || "", 10);
    if (Number.isFinite(n) && n >= 8000 && n <= 120_000) return n;
    return 20_000;
})();
/** Budget massimo per la sezione marchi (anagrafica Brand). */
const MAX_BRAND_SECTION_CHARS = 7_000;
/** Paginazione DB: righe per query. */
const PAGE_SIZE = 450;
/** Limite di sicurezza righe per ricerca con termini (intera biblioteca filtrata). */
const MAX_MATCHED_ROWS = 14_000;
/** Senza termini di ricerca: si attraversa tutto il catalogo per id fino a esaurire il budget caratteri. */
const MAX_FULL_SCAN_ROWS = 25_000;
/** Top-up recenti dopo i match (contesto trasversale). */
const MAX_RECENT_TOPUP = 120;

const IT_STOP_SHOPPER = new Set(
    [
        "the", "and", "for", "con", "per", "una", "uno", "degli", "delle", "degli", "alla", "allo", "alle", "agli",
        "alla", "sono", "come", "cosa", "dove", "quando", "quale", "quali", "anche", "solo", "molto", "meno",
        "tutti", "tutte", "questo", "questa", "quello", "quella", "degli", "dello", "della", "delle", "dei", "dagli",
        "negli", "nelle", "sugli", "sulle", "alla", "allo", "vorrei", "voglio", "cerco", "cercavo", "cercare",
        "bisogno", "devo", "puoi", "può", "potete", "grazie", "ecco", "tipo", "circa", "circa", "circa", "circa",
        "hai", "hanno", "abbiamo", "loro", "noi", "voi", "non", "più", "meno", "alla", "tra", "fra", "qui", "gia",
        "gia", "già", "poi", "ora", "mai", "ben", "male", "dal", "dalla", "allo", "dei", "uno", "due", "tre",
        "ieri", "oggi", "dei", "senza", "sotto", "sopra",
    ].map((s) =>
        s
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
    )
);

function normalizeToken(raw: string): string {
    return raw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/gi, "");
}

export type ShopperHistoryTurn = { role: "user" | "assistant"; content: string };

/** Varianti semplici per plurali italiani comuni (bicchieri → bicchier… per match LIKE). */
function expandTermVariants(t: string): string[] {
    const out = new Set<string>([t]);
    if (t.length >= 5 && /i$/.test(t)) out.add(t.slice(0, -1));
    if (t.length >= 5 && /e$/.test(t)) out.add(t.slice(0, -1));
    if (t.length >= 6 && /o$/.test(t)) out.add(`${t.slice(0, -1)}i`);
    return Array.from(out)
        .filter((x) => x.length >= 3)
        .slice(0, 4);
}

/**
 * Termini dalla domanda corrente e dalle ultime richieste utente (storico),
 * esclusi stopword — usati per includere nel contesto migliaia di SKU pertinenti.
 */
export function extractPersonalShopperSearchTerms(message: string, history?: ShopperHistoryTurn[]): string[] {
    const chunks: string[] = [message];
    for (const h of history ?? []) {
        if (h.role === "user" && h.content?.trim()) chunks.push(h.content.trim());
    }
    const text = chunks.join(" ");
    const rawTokens =
        text.toLowerCase().match(/[a-zàèéìòùáíóúäöü0-9]{3,}/gi) ?? [];
    const bag = new Set<string>();
    for (const raw of rawTokens) {
        const n = normalizeToken(raw);
        if (n.length < 3 || IT_STOP_SHOPPER.has(n)) continue;
        for (const v of expandTermVariants(n)) {
            bag.add(v);
            if (bag.size >= 32) break;
        }
        if (bag.size >= 32) break;
    }
    return Array.from(bag).slice(0, 18);
}

function buildWhereForTerms(companyId: number, terms: string[]): Prisma.ProductWhereInput {
    const OR: Prisma.ProductWhereInput[] = [];
    for (const t of terms) {
        OR.push(
            { sku: { contains: t } },
            { category: { contains: t } },
            { brand: { contains: t } },
            {
                texts: {
                    some: {
                        language: "it",
                        OR: [
                            { title: { contains: t } },
                            { description: { contains: t } },
                            { docDescription: { contains: t } },
                            { seoAiText: { contains: t } },
                            { bulletPoints: { contains: t } },
                        ],
                    },
                },
            }
        );
    }
    return { companyId, OR };
}

const PRODUCT_SELECT_SHOPPER = {
    sku: true,
    brand: true,
    brandId: true,
    category: true,
    texts: {
        where: { language: "it" },
        take: 1,
        select: { title: true },
    },
    prices: {
        where: { listName: "default" },
        take: 1,
        select: { price: true },
    },
} satisfies Prisma.ProductSelect;

type ProductShopperRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT_SHOPPER }>;

function formatShopperProductLine(p: ProductShopperRow): string {
    const title = p.texts[0]?.title ?? "";
    const price = p.prices[0]?.price != null ? String(p.prices[0].price) : "";
    return [
        `SKU:${p.sku}`,
        title ? `Titolo:${title.replace(/\|/g, " ").slice(0, 180)}` : "",
        p.brand ? `Brand:${p.brand}` : "",
        p.category ? `Cat:${p.category}` : "",
        price ? `Prezzo:${price}` : "",
    ]
        .filter(Boolean)
        .join(" | ");
}

function trimLinesToMaxChars(lines: string[], maxChars: number): string[] {
    const parts = [...lines];
    while (parts.length > 1 && parts.join("\n").length > maxChars) {
        parts.pop();
    }
    let block = parts.join("\n");
    if (block.length > maxChars && parts.length === 1) {
        block = block.slice(0, maxChars);
        return [block];
    }
    return parts;
}

async function fetchMatchedProductsEntireLibrary(
    companyId: number,
    terms: string[]
): Promise<ProductShopperRow[]> {
    const where = buildWhereForTerms(companyId, terms);
    const out: ProductShopperRow[] = [];
    let skip = 0;
    while (out.length < MAX_MATCHED_ROWS) {
        const batch = await prisma.product.findMany({
            where,
            orderBy: { id: "asc" },
            skip,
            take: PAGE_SIZE,
            select: PRODUCT_SELECT_SHOPPER,
        });
        if (batch.length === 0) break;
        out.push(...batch);
        skip += batch.length;
        if (batch.length < PAGE_SIZE) break;
    }
    return out;
}

async function fetchRecentTopup(
    companyId: number,
    excludeSkus: Set<string>,
    take: number
): Promise<ProductShopperRow[]> {
    return prisma.product.findMany({
        where: {
            companyId,
            ...(excludeSkus.size > 0 ? { sku: { notIn: Array.from(excludeSkus) } } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take,
        select: PRODUCT_SELECT_SHOPPER,
    });
}

/** Attraversa tutta la biblioteca per id fino a raggiungere il budget caratteri (nessun filtro termini). */
async function fetchFullLibraryLinesUntilBudget(
    companyId: number,
    maxChars: number
): Promise<string[]> {
    const lines: string[] = [];
    let skip = 0;
    while (skip < MAX_FULL_SCAN_ROWS) {
        const batch = await prisma.product.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            skip,
            take: PAGE_SIZE,
            select: PRODUCT_SELECT_SHOPPER,
        });
        if (batch.length === 0) break;
        for (const p of batch) {
            lines.push(formatShopperProductLine(p));
            if (lines.join("\n").length >= maxChars) {
                return trimLinesToMaxChars(lines, maxChars);
            }
        }
        skip += batch.length;
        if (batch.length < PAGE_SIZE) break;
    }
    return lines;
}

async function resolveBrandSectionForProducts(
    companyId: number,
    rows: ProductShopperRow[]
): Promise<string> {
    const ids = new Set<number>();
    const names = new Set<string>();
    for (const p of rows) {
        if (p.brandId != null) ids.add(p.brandId);
        const b = p.brand?.trim();
        if (b) names.add(b);
    }
    const orClauses: Prisma.BrandWhereInput[] = [];
    if (ids.size > 0) orClauses.push({ id: { in: Array.from(ids) } });
    if (names.size > 0) orClauses.push({ name: { in: Array.from(names) } });
    if (orClauses.length === 0) return "";

    const brands = await prisma.brand.findMany({
        where: { companyId, OR: orClauses },
        select: {
            name: true,
            aiContentGuidelines: true,
            producerDomain: true,
            logoUrl: true,
        },
        orderBy: { name: "asc" },
    });

    return formatBrandSectionLines(brands);
}

/** Tutti i marchi dell’azienda (per contesto quando non c’è filtro testuale). */
async function resolveBrandSectionAllCompany(companyId: number): Promise<string> {
    const brands = await prisma.brand.findMany({
        where: { companyId },
        select: {
            name: true,
            aiContentGuidelines: true,
            producerDomain: true,
            logoUrl: true,
        },
        orderBy: { name: "asc" },
        take: 500,
    });
    return formatBrandSectionLines(brands);
}

function formatBrandSectionLines(
    brands: {
        name: string;
        aiContentGuidelines: string | null;
        producerDomain: string | null;
        logoUrl: string | null;
    }[]
): string {
    if (brands.length === 0) return "";
    const pieces: string[] = [];
    for (const br of brands) {
        const safeName = br.name.replace(/\*|#/g, "").trim();
        const chunks: string[] = [];
        if (br.aiContentGuidelines?.trim()) {
            chunks.push(`Tono / note interne: ${br.aiContentGuidelines.trim().slice(0, 1400)}`);
        }
        if (br.producerDomain?.trim()) {
            chunks.push(`Dominio produttore: ${br.producerDomain.trim().slice(0, 280)}`);
        }
        if (br.logoUrl?.trim()) {
            chunks.push(`Logo: ${br.logoUrl.trim().slice(0, 240)}`);
        }
        const body = chunks.length > 0 ? chunks.join(" | ") : "(nessuna nota aggiuntiva in anagrafica)";
        pieces.push(`• **${safeName}**: ${body}`);
    }
    let text = pieces.join("\n");
    if (text.length > MAX_BRAND_SECTION_CHARS) {
        text = text.slice(0, MAX_BRAND_SECTION_CHARS) + "\n… [altri marchi omessi per lunghezza]";
    }
    return text;
}

function assembleShopperPayload(brandSection: string, productLines: string[]): string {
    const headerBrands =
        brandSection.trim().length > 0
            ? `=== MARCHI (anagrafica Iris — caratterizza i marchi solo con questi dati; puoi sintetizzare stile e target) ===\n${brandSection.trim()}\n\n`
            : "";
    const overhead = headerBrands.length + 120;
    const productBudget = Math.max(2500, MAX_PAYLOAD_CHARS - overhead);
    const lines = trimLinesToMaxChars(productLines, productBudget);
    let productsBlock = lines.join("\n");
    if (productsBlock.length > productBudget) {
        productsBlock =
            productsBlock.slice(0, productBudget) +
            "\n… [righe prodotto omesse: catalogo molto grande — restringi la domanda se serve]";
    }
    return `${headerBrands}=== PRODOTTI (tutta la biblioteca filtrata dalla ricerca quando ci sono parole chiave; altrimenti estratto completo fino al limite tecnico) ===\n${productsBlock}`;
}

export type FollowUpChipRole = "options" | "answer_chips";

/** Come mostrare i chip in UI: pulsanti inviabili vs solo testo (legacy domande). */
export type FollowUpInteraction = "buttons" | "hints_only";

export type PersonalShopperResult = {
    reply: string;
    recommendedSkus: string[];
    /** Suggerimenti mostrati come chip o hint (max 5). */
    followUpChips: string[];
    /** "options" = etichette di scelta; "answer_chips" = messaggi brevi che il cliente può inviare. */
    followUpChipRole: FollowUpChipRole;
    /** Se "hints_only", non mostrare pulsanti (es. solo domande da vecchie risposte API). */
    followUpInteraction: FollowUpInteraction;
    /** Alias deprecato: stesso contenuto di followUpChips (compat client esistenti). */
    followUpQuestions: string[];
};

function looksLikeQuestionChip(s: string): boolean {
    const t = s.trim();
    if (!t) return false;
    if (/\?\s*$/.test(t)) return true;
    return /^(qual\s|qual'|qualè|qual è|quali\s|quale\s|che\s|cosa\s|cos'\s|come\s|dove\s|quando\s|perché\s|perche\s|hai\s|hai gi[aà]\s|cerchi\s|cercate\s|vuoi\s|desideri\s|stai cercando)/i.test(
        t
    );
}

function normalizeFollowUpFields(o: {
    followUpChipRole?: unknown;
    followUpChips?: unknown;
    followUpQuestions?: unknown;
}): Pick<
    PersonalShopperResult,
    "followUpChips" | "followUpChipRole" | "followUpInteraction" | "followUpQuestions"
> {
    const rawRole = String(o.followUpChipRole ?? "").trim().toLowerCase();
    const role: FollowUpChipRole = rawRole === "options" ? "options" : "answer_chips";

    const fromNew = Array.isArray(o.followUpChips)
        ? (o.followUpChips as unknown[])
              .map((s) => String(s).trim())
              .filter(Boolean)
              .slice(0, 5)
        : [];

    const fromLegacy = Array.isArray(o.followUpQuestions)
        ? (o.followUpQuestions as unknown[])
              .map((s) => String(s).trim())
              .filter(Boolean)
              .slice(0, 5)
        : [];

    const chips = fromNew.length > 0 ? fromNew : fromLegacy;

    if (chips.length === 0) {
        return {
            followUpChips: [],
            followUpChipRole: "answer_chips",
            followUpInteraction: "buttons",
            followUpQuestions: [],
        };
    }

    let interaction: FollowUpInteraction = "buttons";
    const qLike = chips.filter(looksLikeQuestionChip).length;

    if (fromNew.length > 0) {
        if (role === "options" && qLike === chips.length) {
            interaction = "hints_only";
        } else if (role === "answer_chips" && qLike === chips.length) {
            interaction = "hints_only";
        }
    } else {
        if (qLike === chips.length) {
            interaction = "hints_only";
        }
    }

    return {
        followUpChips: chips,
        followUpChipRole: role,
        followUpInteraction: interaction,
        followUpQuestions: chips,
    };
}

const SYSTEM = `Sei un personal shopper digitale per un e-commerce collegato a WooCommerce.
L'utente che scrive lavora in azienda: tono professionale ma caloroso, in italiano.
Il messaggio utente contiene due blocchi quando presenti: MARCHI (anagrafica Iris: tono, dominio produttore, ecc.) e PRODOTTI (intera biblioteca filtrata dalla ricerca sul database quando l’utente usa parole chiave; altrimenti estratto sequenziale fino al limite tecnico).
Puoi proporre e confrontare **marchi** usando solo i dati nella sezione MARCHI e le righe prodotto (Titolo, Cat, Brand, SKU): evidenzia differenze di posizionamento o stile coerenti con quelle note.
Nel testo della reply usa i **titoli prodotto** come nell’estratto; evita elenchi di soli codici SKU (gli SKU restano solo nel campo JSON tecnico recommendedSkus).
Non inventare SKU, prezzi o disponibilità assoluta: se un dato manca, dillo.
Se nel blocco PRODOTTI non compaiono righe utili dopo la ricerca sul catalogo completo, proponi filtri o alternative e, se c'è un URL negozio, ricorda di verificare sullo store.
Rispondi in JSON con esattamente queste chiavi:
- "reply" (string, markdown leggero ammesso: elenchi, **grassetto**)
- "recommendedSkus" (array di stringhe, solo SKU presenti nel contesto PRODOTTI; altrimenti array vuoto)
- "followUpChipRole": "options" oppure "answer_chips"
- "followUpChips" (array di stringhe)

Regole per followUpChipRole === "options" (massimo 3 elementi):
  Etichette brevi di scelta mutuamente esclusiva, SENZA punto interrogativo (es. "Fino a 150 €", "Solo da parete", "Acciaio").
  Usa questo ruolo solo per scelte chiare tipo fascia di prezzo, formato, materiale.

Regole per followUpChipRole === "answer_chips" (da 3 a 5 elementi):
  Messaggi brevissimi che il CLIENTE potrebbe inviare nel passo successivo per restringere la ricerca verso prodotti che compaiono nel blocco PRODOTTI (categorie, materiali, budget, marchi solo se presenti nel catalogo).
  Privilegia sempre articoli effettivamente presenti o deducibili dalle righe PRODOTTI e MARCHI; non proporre categorie assenti dall’estratto.
  Devono essere affermazioni o richieste dirette, MAI domande: nessun "?", non iniziare con Qual/Che/Come/Cerchi/Hai/Vuoi.
  Esempi validi: "Budget massimo 200 euro", "Mi servono solo orologi da parete", "Preferisco finitura legno".

Se non servono chip, usa "followUpChips": [] (e scegli un ruolo qualsiasi).

Niente testo fuori dal JSON.`;

function parsePersonalShopperJson(raw: string): PersonalShopperResult {
    let t = raw.trim();
    if (t.startsWith("```")) {
        t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    }
    try {
        const o = JSON.parse(t) as {
            reply?: string;
            recommendedSkus?: unknown;
            followUpQuestions?: unknown;
            followUpChips?: unknown;
            followUpChipRole?: unknown;
        };
        const reply = String(o.reply ?? "").trim();
        const recommendedSkus = Array.isArray(o.recommendedSkus)
            ? (o.recommendedSkus as unknown[]).map((s) => String(s).trim()).filter(Boolean)
            : [];
        const followUp = normalizeFollowUpFields(o);
        return {
            reply: reply || "Non ho potuto elaborare una risposta strutturata.",
            recommendedSkus,
            ...followUp,
        };
    } catch {
        return {
            reply: t.length > 0 ? t : "Risposta non valida dal modello.",
            recommendedSkus: [],
            followUpChips: [],
            followUpChipRole: "answer_chips",
            followUpInteraction: "buttons",
            followUpQuestions: [],
        };
    }
}

export async function buildWooPersonalShopperCatalogBlock(
    companyId: number,
    opts?: { message?: string; history?: ShopperHistoryTurn[] }
): Promise<{
    wooDomain: string | null;
    catalogBlock: string;
}> {
    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { wooDomain: true },
    });

    const message = String(opts?.message ?? "").trim();
    const history = opts?.history ?? [];
    const terms =
        message.length > 0
            ? extractPersonalShopperSearchTerms(message, history)
            : extractPersonalShopperSearchTerms("", history);

    if (terms.length > 0) {
        let mergedRows = await fetchMatchedProductsEntireLibrary(companyId, terms);
        const skuSet = new Set(mergedRows.map((p) => p.sku));
        const recentRows = await fetchRecentTopup(companyId, skuSet, MAX_RECENT_TOPUP);
        mergedRows = [...mergedRows, ...recentRows];
        const productLines = mergedRows.map((p) => formatShopperProductLine(p));
        const brandSection = await resolveBrandSectionForProducts(companyId, mergedRows);
        const catalogBlock = assembleShopperPayload(brandSection, productLines);
        return {
            wooDomain: company?.wooDomain?.trim() || null,
            catalogBlock,
        };
    }

    const brandSectionAll = await resolveBrandSectionAllCompany(companyId);
    const overheadEstimate =
        (brandSectionAll.trim().length > 0 ? brandSectionAll.length : 0) +
        `=== PRODOTTI (tutta la biblioteca filtrata dalla ricerca quando ci sono parole chiave; altrimenti estratto completo fino al limite tecnico) ===\n`.length +
        80;
    const maxProductChars = Math.max(2500, MAX_PAYLOAD_CHARS - overheadEstimate);
    const productLines = await fetchFullLibraryLinesUntilBudget(companyId, maxProductChars);
    const catalogBlock = assembleShopperPayload(brandSectionAll, productLines);

    return {
        wooDomain: company?.wooDomain?.trim() || null,
        catalogBlock,
    };
}

export async function runWooPersonalShopper(
    keys: ContentAiKeys,
    args: {
        message: string;
        historyLines: string[];
        wooDomain: string | null;
        catalogBlock: string;
        /** True = cliente sul negozio (iframe Woo); tono più B2C. */
        visitorMode?: boolean;
    }
): Promise<PersonalShopperResult> {
    const maxTok = Math.min(getAssistantMaxOutputTokens(), 1536);
    const storeNote = args.wooDomain
        ? `URL pubblico del negozio WooCommerce (solo per suggerimenti link di ricerca): ${args.wooDomain.replace(/\/+$/, "")}`
        : "URL WooCommerce non configurato in Impostazioni azienda: non inventare URL.";

    const hist =
        args.historyLines.length > 0
            ? `Ulteriori turni precedenti (più recenti in fondo):\n${args.historyLines.slice(-8).join("\n---\n")}`
            : "(nessuno)";

    const msgCap = Math.min(6000, Math.max(500, parseInt(process.env.AI_SHOPPER_MESSAGE_MAX_CHARS || "3200", 10) || 3200));
    const messageTrim = String(args.message ?? "").trim().slice(0, msgCap);
    const catalogCap = Math.max(2000, MAX_PAYLOAD_CHARS - 2000);
    const catalogTrim =
        args.catalogBlock.length > catalogCap
            ? `${args.catalogBlock.slice(0, catalogCap)}\n…[catalogo troncato per limite costo]`
            : args.catalogBlock;

    const userPayload = `${storeNote}

CONTESTO CATALOGO E MARCHI:
${catalogTrim}

CRONOLOGIA BREVE:
${hist}

MESSAGGIO ATTUALE (${args.visitorMode ? "visitatore sul negozio online; rispondi come personal shopper verso il cliente finale" : "operatore in Content Hunter"}):
${messageTrim}`;

    const raw = await runJsonChatCompletion(keys, {
        system: SYSTEM,
        user: userPayload,
        maxTokens: maxTok,
        temperature: 0.55,
    });

    return parsePersonalShopperJson(raw);
}

export async function executePersonalShopperForCompany(
    companyId: number,
    args: {
        message: string;
        history?: ShopperHistoryTurn[];
        visitorMode?: boolean;
    }
): Promise<PersonalShopperResult & { wooDomain: string | null; recommendedProducts: RecommendedProductChip[] }> {
    const keys = await resolveIntegrationKeys(companyId);
    const contentKeys = { openai: keys.openai, gemini: keys.gemini };
    if (!contentKeys.openai && !contentKeys.gemini) {
        throw new Error(CONTENT_AI_KEY_MISSING_MESSAGE);
    }

    const { wooDomain, catalogBlock } = await buildWooPersonalShopperCatalogBlock(companyId, {
        message: args.message,
        history: args.history,
    });

    const historyLines: string[] = [];
    for (const h of (args.history ?? []).slice(-12)) {
        if (h.role === "user" && h.content?.trim()) {
            historyLines.push(`Utente: ${h.content.trim()}`);
        } else if (h.role === "assistant" && h.content?.trim()) {
            historyLines.push(`Assistente: ${h.content.trim()}`);
        }
    }

    const result = await runWooPersonalShopper(contentKeys, {
        message: args.message,
        historyLines,
        wooDomain,
        catalogBlock,
        visitorMode: args.visitorMode === true,
    });

    const recommendedProducts = await enrichPersonalShopperRecommendedProducts(companyId, result.recommendedSkus, {
        resolveWooUrls: args.visitorMode === true,
    });

    return { ...result, wooDomain, recommendedProducts };
}
