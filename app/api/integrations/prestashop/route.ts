import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyIdFromHeaders } from "@/lib/auth-api";
import { buildPrestaCanonicalProductUrl, runAutoIndexingAfterChannelPush } from "@/lib/search-indexing";

/** Evita 502 da gateway (es. Vercel) su push con molte chiamate a PrestaShop. Su Hobby il tetto resta ~10s. */
export const maxDuration = 300;
import {
    erpGrossInclVatToPrestaNet,
    parseErpPriceToNumber,
    resolveErpListPriceRaw,
} from "@/lib/prestashop-price-from-erp";
import {
    normalizePrestaPushOverwrite,
    prestaOverwriteNeedsRemoteFetch,
    type PrestaPushFieldOverwrite,
} from "@/lib/channel-push-overwrite";
import {
    buildProductXml,
    convertErpWeightToPrestaWeightField,
    createPrestaShopClient,
    extractLocalizedField,
    fetchPrestaShopWeightUnitCached,
    fetchVatRatePercentForTaxRulesGroup,
    flattenPsResource,
    parsePrestaPhysicalFloat,
    parsePrestaShopErrorMessages,
    parseProductIdFromResponseXml,
    patchStockForSimpleProduct,
    prestashopApiBase,
    prestashopIsoToLangCode,
    prestashopUnityLabelForWeightUnit,
    resolveOrCreateCategoryId,
    resolveOrCreateManufacturerId,
    slugifyLinkRewrite,
    uploadImagesToPrestaProduct,
    type PrestaErpWeightInputUnit,
    type PrestaLangPayload,
    type PrestaProductMapping,
} from "@/lib/prestashop-ws";

function formatPrestaPrice(price: unknown): string {
    if (price === null || price === undefined) return "0";
    const n = parseFloat(String(price).replace(",", ".").replace(/[^\d.-]/g, ""));
    if (Number.isNaN(n)) return "0";
    return n.toFixed(6);
}

function formatPrestaPhysicalNumber(n: number): string {
    if (!Number.isFinite(n)) return "";
    const s = n.toFixed(6).replace(/\.?0+$/, "");
    return s === "" ? "0" : s;
}

function readPhysicalFromProduct(product: any): {
    weight: number | null;
    width: number | null;
    height: number | null;
    depth: number | null;
    unityLabel: string | null;
} {
    const ex =
        product?.extraFields && typeof product.extraFields === "object"
            ? (product.extraFields as Record<string, unknown>)
            : {};
    const weight =
        parsePrestaPhysicalFloat(product?.weight) ??
        parsePrestaPhysicalFloat(ex.prestashopWeight) ??
        parsePrestaPhysicalFloat(ex.weight);
    const width =
        parsePrestaPhysicalFloat(ex.prestashopWidth) ?? parsePrestaPhysicalFloat(ex.width);
    const height =
        parsePrestaPhysicalFloat(ex.prestashopHeight) ?? parsePrestaPhysicalFloat(ex.height);
    const depth =
        parsePrestaPhysicalFloat(ex.prestashopDepth) ?? parsePrestaPhysicalFloat(ex.depth);
    const u =
        ex.prestashopUnity != null && String(ex.prestashopUnity).trim()
            ? String(ex.prestashopUnity).trim().slice(0, 64)
            : ex.weightUnit != null && String(ex.weightUnit).trim()
              ? String(ex.weightUnit).trim().slice(0, 64)
              : null;
    return { weight, width, height, depth, unityLabel: u };
}

async function resolveVatRatePercentForProduct(product: any): Promise<number | null> {
    const rp = product?.vatCode?.ratePercent;
    if (rp !== undefined && rp !== null) {
        const n = Number(rp);
        if (Number.isFinite(n) && n >= 0) return n;
    }
    const vid = product?.vatCodeId;
    if (vid != null) {
        const id = Number(vid);
        if (Number.isFinite(id) && id > 0) {
            try {
                const vc = await prisma.vatCode.findFirst({
                    where: { id },
                    select: { ratePercent: true },
                });
                if (vc?.ratePercent != null) {
                    const n = Number(vc.ratePercent.toString());
                    if (Number.isFinite(n) && n >= 0) return n;
                }
            } catch {
                /* ignore */
            }
        }
    }
    return null;
}

async function findProductIdByReference(client: ReturnType<typeof createPrestaShopClient>, reference: string) {
    const res = await client.get("/products", {
        params: {
            output_format: "JSON",
            display: "[id,reference]",
            "filter[reference]": `[${reference}]`,
        },
    });
    if (res.status >= 400) return null;
    const list = flattenPsResource<{ id?: string | number }>(res.data, "products");
    const id = list[0]?.id;
    return id != null ? String(id) : null;
}

async function fetchActiveLanguages(client: ReturnType<typeof createPrestaShopClient>) {
    const langRes = await client.get("/languages", {
        params: {
            output_format: "JSON",
            display: "[id,name,iso_code,active]",
            limit: "0,50",
        },
    });
    if (langRes.status >= 400) return [];
    return flattenPsResource<any>(langRes.data, "languages").filter(
        (l: any) => String(l?.active ?? "1") === "1"
    );
}

async function fetchShopsForUi(client: ReturnType<typeof createPrestaShopClient>, labelLangId: number) {
    try {
        const res = await client.get("/shops", {
            params: {
                output_format: "JSON",
                display: "[id,name,active]",
                limit: "0,100",
            },
        });
        if (res.status >= 400) return [];
        const rows = flattenPsResource<any>(res.data, "shops").filter(
            (s: any) => String(s?.active ?? "1") === "1"
        );
        return rows
            .map((s: any) => {
                const id = Number(s.id);
                const rawName = s.name;
                const name =
                    typeof rawName === "string"
                        ? rawName.trim()
                        : extractLocalizedField(rawName, labelLangId) ||
                          extractLocalizedField(rawName, 1) ||
                          `Negozio ${id}`;
                return { id, name: name || `Negozio ${id}` };
            })
            .filter((s: { id: number }) => Number.isFinite(s.id) && s.id > 0);
    } catch {
        return [];
    }
}

function buildCategoryOptionsForUi(
    rows: any[],
    labelLangId: number
): { id: number; label: string }[] {
    const list = rows
        .filter((c: any) => String(c?.active ?? "1") === "1")
        .map((c: any) => {
            const id = Number(c.id);
            const idParent = c.id_parent != null ? Number(c.id_parent) : 0;
            const name =
                extractLocalizedField(c.name, labelLangId) ||
                extractLocalizedField(c.name, 1) ||
                `Categoria ${id}`;
            return {
                id,
                idParent: Number.isFinite(idParent) && idParent > 0 ? idParent : 0,
                name: name || `Categoria ${id}`,
            };
        })
        .filter((c) => Number.isFinite(c.id) && c.id > 0);

    const byId = new Map(list.map((c) => [c.id, c]));

    function depthOf(id: number, guard = new Set<number>()): number {
        if (guard.has(id)) return 0;
        guard.add(id);
        const row = byId.get(id);
        if (!row || !row.idParent || row.idParent <= 0) return 0;
        return 1 + depthOf(row.idParent, guard);
    }

    const enriched = list.map((c) => ({ ...c, depth: depthOf(c.id) }));
    enriched.sort((a, b) =>
        a.depth !== b.depth ? a.depth - b.depth : a.name.localeCompare(b.name, "it", { sensitivity: "base" })
    );

    return enriched.map((c) => ({
        id: c.id,
        label: `${"— ".repeat(c.depth)}${c.name} · ${c.id}`,
    }));
}

async function fetchCategoriesForUi(
    client: ReturnType<typeof createPrestaShopClient>,
    labelLangId: number
): Promise<{ id: number; label: string }[]> {
    try {
        const res = await client.get("/categories", {
            params: {
                output_format: "JSON",
                display: "[id,id_parent,active,name]",
                limit: "0,1000",
                sort: "id_ASC",
            },
        });
        if (res.status >= 400) return [];
        const rows = flattenPsResource<any>(res.data, "categories");
        return buildCategoryOptionsForUi(rows, labelLangId);
    } catch {
        return [];
    }
}

async function fetchTaxRulesGroupsForUi(
    client: ReturnType<typeof createPrestaShopClient>,
    labelLangId: number
): Promise<{ id: number; label: string }[]> {
    try {
        const res = await client.get("/tax_rules_groups", {
            params: {
                output_format: "JSON",
                display: "[id,name,active]",
                limit: "0,100",
                sort: "id_ASC",
            },
        });
        if (res.status >= 400) return [];
        const rows = flattenPsResource<any>(res.data, "tax_rules_groups").filter(
            (r: any) => String(r?.active ?? "1") === "1"
        );
        const mapped = rows
            .map((r: any) => {
                const id = Number(r.id);
                const rawName = r.name;
                const name =
                    typeof rawName === "string"
                        ? rawName.trim()
                        : extractLocalizedField(rawName, labelLangId) ||
                          extractLocalizedField(rawName, 1) ||
                          `Gruppo ${id}`;
                return {
                    id,
                    label: `${name || `Gruppo ${id}`} · id ${id}`,
                };
            })
            .filter((r: { id: number }) => Number.isFinite(r.id) && r.id > 0);
        mapped.sort((a, b) =>
            a.label.localeCompare(b.label, "it", { sensitivity: "base" })
        );
        return mapped;
    } catch {
        return [];
    }
}

function firstTranslation<T extends Record<string, any>>(translations: T | undefined, keys: string[]): any {
    if (!translations || typeof translations !== "object") return undefined;
    for (const k of keys) {
        const v = translations[k];
        if (v && typeof v === "object") return v;
    }
    const vals = Object.values(translations);
    return vals.find((v) => v && typeof v === "object");
}

/** iso_code Presta (es. it-it) → codice tabella ProductText (es. it). */
function langRowToErpIso(row: any): string | null {
    const isoRaw = String(row?.iso_code ?? "")
        .trim()
        .toLowerCase();
    return prestashopIsoToLangCode(isoRaw.split("-")[0]);
}

function buildLangPayloadsForPush(
    product: any,
    langRows: any[],
    defaultLangId: number,
    sku: string
): PrestaLangPayload[] {
    const translations =
        product.translations && typeof product.translations === "object" ? product.translations : {};

    const defaultRow = langRows.find((r) => Number(r?.id) === defaultLangId);
    const preferIso =
        (defaultRow && langRowToErpIso(defaultRow)) ||
        prestashopIsoToLangCode(String(defaultRow?.iso_code ?? "")) ||
        "it";

    const pickTr = (iso: string) => (iso && translations[iso] ? translations[iso] : {});

    const fallTitle =
        (product.title as string) ||
        pickTr(preferIso)?.title ||
        translations?.it?.title ||
        firstTranslation(translations, ["it", "en", "de", "fr", "es"])?.title ||
        sku;
    const fallDesc =
        (product.description as string) ||
        pickTr(preferIso)?.description ||
        translations?.it?.description ||
        firstTranslation(translations, ["it", "en", "de", "fr", "es"])?.description ||
        "";
    const fallShort =
        (product.docDescription as string) ||
        pickTr(preferIso)?.docDescription ||
        translations?.it?.docDescription ||
        firstTranslation(translations, ["it", "en", "de", "fr", "es"])?.docDescription ||
        "";

    const out: PrestaLangPayload[] = [];
    for (const row of langRows) {
        const lid = Number(row.id);
        if (!Number.isFinite(lid)) continue;
        const iso = langRowToErpIso(row) || "";
        const tr = iso ? pickTr(iso) : {};

        const title = String(tr?.title ?? "").trim() || fallTitle;
        const description = String(tr?.description ?? "").trim() || fallDesc;
        const descriptionShort = String(tr?.docDescription ?? "").trim() || fallShort;

        out.push({
            id: lid,
            title: title || sku,
            description,
            descriptionShort,
            slug: slugifyLinkRewrite(title || fallTitle, sku),
        });
    }

    if (out.length === 0) {
        out.push({
            id: defaultLangId,
            title: fallTitle || sku,
            description: fallDesc,
            descriptionShort: fallShort,
            slug: slugifyLinkRewrite(fallTitle, sku),
        });
    }

    return out;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const shopUrl = searchParams.get("shopUrl");
    const apiKey = searchParams.get("apiKey");
    const idShopRaw = searchParams.get("idShop");
    const labelLangParam = searchParams.get("labelLangId");
    const idShop = idShopRaw ? parseInt(idShopRaw, 10) : undefined;

    if (!shopUrl?.trim() || !apiKey?.trim()) {
        return NextResponse.json({ error: "Configurazione PrestaShop mancante (shopUrl, apiKey)" }, { status: 400 });
    }

    try {
        const base = prestashopApiBase(shopUrl);
        const client = createPrestaShopClient(base, apiKey, {
            idShop: idShop != null && !Number.isNaN(idShop) && idShop > 0 ? idShop : undefined,
        });

        const [prodRes, langRes] = await Promise.all([
            client.get("/products", {
                params: {
                    output_format: "JSON",
                    display: "full",
                    limit: "0,5",
                    sort: "id_DESC",
                },
            }),
            client.get("/languages", {
                params: {
                    output_format: "JSON",
                    display: "[id,name,iso_code,active]",
                    limit: "0,50",
                },
            }),
        ]);

        if (prodRes.status >= 400) {
            return NextResponse.json(
                {
                    error: "Impossibile leggere i prodotti dal webservice PrestaShop.",
                    details: typeof prodRes.data === "string" ? prodRes.data.slice(0, 2000) : prodRes.data,
                    status: prodRes.status,
                },
                { status: 502 }
            );
        }

        const products = flattenPsResource<any>(prodRes.data, "products");
        const languages = flattenPsResource<any>(langRes.data, "languages").filter(
            (l: any) => String(l?.active ?? "1") === "1"
        );

        const languagesOut = languages.map((l: any) => ({
            id: l.id,
            name: extractLocalizedField(l.name, Number(l.id) || 1) || String(l.iso_code ?? l.id),
            iso_code: l.iso_code,
        }));

        const labelLangIdParsed =
            labelLangParam != null && String(labelLangParam).trim() !== ""
                ? parseInt(String(labelLangParam), 10)
                : NaN;
        const labelLangId =
            Number.isFinite(labelLangIdParsed) && labelLangIdParsed > 0
                ? labelLangIdParsed
                : Number(languages[0]?.id) || 1;

        const [weightUnit, shops, categories, taxRulesGroups] = await Promise.all([
            fetchPrestaShopWeightUnitCached(client, base),
            fetchShopsForUi(client, labelLangId),
            fetchCategoriesForUi(client, labelLangId),
            fetchTaxRulesGroupsForUi(client, labelLangId),
        ]);

        const sample = products[0] ?? {};
        const fields = sample && typeof sample === "object" ? Object.keys(sample) : [];

        return NextResponse.json({
            success: true,
            fields,
            sampleProduct: sample,
            totalFound: products.length,
            /** Unità peso negozio (`PS_WEIGHT_UNIT`), per conversione push da anagrafica. */
            weightUnit,
            /** Lingua usata per le etichette categorie/negozi in questa risposta. */
            labelLangIdUsed: labelLangId,
            languages: languagesOut,
            /** Multistore: vuoto se un solo negozio o webservice non espone `/shops`. */
            shops,
            /** Categorie attive, indentate per profondità albero. */
            categories,
            /** Gruppi IVA / tasse attivi (campo `id_tax_rules_group` prodotto). */
            taxRulesGroups,
        });
    } catch (err: any) {
        console.error("PrestaShop GET Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                error: "Impossibile connettersi a PrestaShop. Verificare URL negozio e chiave webservice.",
                details: err.response?.data || err.message,
            },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    const body = await req.json();
    const { shopUrl, apiKey, product, mapping, overwrite } = body as {
        shopUrl: string;
        apiKey: string;
        product: any;
        mapping?: Partial<PrestaProductMapping>;
        overwrite?: Partial<PrestaPushFieldOverwrite>;
    };

    if (!shopUrl?.trim() || !apiKey?.trim() || !product?.sku) {
        return NextResponse.json({ error: "Dati mancanti (shopUrl, apiKey, product.sku)" }, { status: 400 });
    }

    const idShopNum = mapping?.idShop != null ? Number(mapping.idShop) : NaN;

    const catParentNum =
        mapping?.categoryParentId != null ? Number(mapping.categoryParentId) : NaN;

    const categoryResolveCache: Record<string, number> = {
        ...(mapping?.categoryResolveCache && typeof mapping.categoryResolveCache === "object"
            ? mapping.categoryResolveCache
            : {}),
    };
    const manufacturerResolveCache: Record<string, number> = {
        ...(mapping?.manufacturerResolveCache && typeof mapping.manufacturerResolveCache === "object"
            ? mapping.manufacturerResolveCache
            : {}),
    };

    const erpWU =
        mapping?.erpWeightInputUnit === "g" ||
        mapping?.erpWeightInputUnit === "lb" ||
        mapping?.erpWeightInputUnit === "kg"
            ? mapping.erpWeightInputUnit
            : ("kg" as PrestaErpWeightInputUnit);

    const effectiveMapping: PrestaProductMapping = {
        defaultCategoryId: Number(mapping?.defaultCategoryId) || 2,
        languageId: Number(mapping?.languageId) || 1,
        idTaxRulesGroup: mapping?.idTaxRulesGroup != null ? Number(mapping.idTaxRulesGroup) : 1,
        erpWeightInputUnit: erpWU,
        stockQuantityERPKey: mapping?.stockQuantityERPKey === "stockSupplier" ? "stockSupplier" : "stockLocal",
        idShop: Number.isFinite(idShopNum) && idShopNum > 0 ? idShopNum : undefined,
        syncManufacturer: mapping?.syncManufacturer !== false,
        syncCategoryFromProduct: mapping?.syncCategoryFromProduct !== false,
        categoryParentId:
            Number.isFinite(catParentNum) && catParentNum > 0 ? catParentNum : undefined,
        uploadImages: mapping?.uploadImages !== false,
        maxImages: mapping?.maxImages != null ? Math.min(30, Math.max(1, Number(mapping.maxImages))) : 12,
        erpPriceIncludesVat: mapping?.erpPriceIncludesVat !== false,
    };

    if (!Number.isFinite(effectiveMapping.defaultCategoryId) || effectiveMapping.defaultCategoryId <= 0) {
        return NextResponse.json({ error: "defaultCategoryId non valido" }, { status: 400 });
    }
    if (!Number.isFinite(effectiveMapping.languageId) || effectiveMapping.languageId <= 0) {
        return NextResponse.json({ error: "languageId non valido" }, { status: 400 });
    }

    const sku = String(product.sku).trim();
    const stockKey = effectiveMapping.stockQuantityERPKey ?? "stockLocal";
    const erpStockRaw = product?.extraFields?.[stockKey] ?? product?.stock ?? null;
    const erpStockNum =
        erpStockRaw !== null && erpStockRaw !== undefined ? parseInt(String(erpStockRaw), 10) : NaN;
    const hasStock = Number.isFinite(erpStockNum) && !Number.isNaN(erpStockNum);

    try {
        const base = prestashopApiBase(shopUrl);
        const client = createPrestaShopClient(base, apiKey, {
            idShop: effectiveMapping.idShop,
        });

        const ow = normalizePrestaPushOverwrite(overwrite);
        const existingId = await findProductIdByReference(client, sku);
        const isUpdate = existingId != null && String(existingId).length > 0;

        const priceRaw = resolveErpListPriceRaw(product);
        const grossNum = parseErpPriceToNumber(priceRaw);
        const needsExForPrice =
            isUpdate && ow.price !== false && !Number.isFinite(grossNum);

        let exRow: any = null;
        if (isUpdate && (prestaOverwriteNeedsRemoteFetch(ow) || needsExForPrice)) {
            try {
                const exRes = await client.get(`/products/${existingId}`, {
                    params: { output_format: "JSON", display: "full" },
                });
                if (exRes.status < 400) {
                    const list = flattenPsResource<any>(exRes.data, "products");
                    exRow = list[0] ?? null;
                }
            } catch {
                exRow = null;
            }
        }

        let priceStr: string;
        if (isUpdate && exRow && ow.price === false) {
            priceStr = formatPrestaPrice(exRow.price);
        } else if (!Number.isFinite(grossNum)) {
            if (isUpdate && exRow) {
                priceStr = formatPrestaPrice(exRow.price);
            } else {
                priceStr = "0";
            }
        } else if (effectiveMapping.erpPriceIncludesVat !== false) {
            let vatR = await resolveVatRatePercentForProduct(product);
            if (vatR == null) {
                vatR = await fetchVatRatePercentForTaxRulesGroup(
                    client,
                    effectiveMapping.idTaxRulesGroup ?? 1
                );
            }
            if (vatR == null) {
                console.warn(
                    "[prestashop] Listino ERP IVA inclusa: aliquota sconosciuta (né da prodotto né da gruppo tasse Presta). Uso 22% per scorporo verso campo price (imponibile)."
                );
                vatR = 22;
            }
            const net = erpGrossInclVatToPrestaNet(grossNum, vatR);
            priceStr = net.toFixed(6);
        } else {
            priceStr = formatPrestaPrice(priceRaw);
        }

        let categoryIdForProduct = effectiveMapping.defaultCategoryId;
        if (!(isUpdate && exRow && ow.category === false)) {
            if (effectiveMapping.syncCategoryFromProduct !== false) {
                let catLabel = String(product?.category ?? "").trim();
                const erpCatId = product?.categoryId != null ? Number(product.categoryId) : NaN;
                if (!catLabel && Number.isFinite(erpCatId) && erpCatId > 0) {
                    try {
                        const companyId =
                            product?.companyId != null ? Number(product.companyId) : NaN;
                        const row = await prisma.category.findFirst({
                            where: {
                                id: erpCatId,
                                ...(Number.isFinite(companyId) && companyId > 0
                                    ? { companyId }
                                    : {}),
                            },
                            select: { name: true },
                        });
                        catLabel = String(row?.name ?? "").trim();
                    } catch {
                        /* ignore */
                    }
                }
                if (catLabel) {
                    try {
                        const resolved = await resolveOrCreateCategoryId(
                            client,
                            catLabel,
                            {
                                languageId: effectiveMapping.languageId,
                                idParent: effectiveMapping.categoryParentId ?? 2,
                            },
                            categoryResolveCache
                        );
                        if (resolved != null && resolved > 0) {
                            categoryIdForProduct = resolved;
                        }
                    } catch (cErr) {
                        console.warn("[prestashop] category resolve/create skipped:", cErr);
                    }
                }
            }
        } else {
            const cid = Number(exRow.id_category_default);
            if (Number.isFinite(cid) && cid > 0) categoryIdForProduct = cid;
        }

        let idManufacturer: number | undefined;
        if (!(isUpdate && exRow && ow.manufacturer === false)) {
            if (effectiveMapping.syncManufacturer) {
                const brandName = (product.brand as string)?.trim?.() || "";
                if (brandName) {
                    try {
                        idManufacturer = await resolveOrCreateManufacturerId(
                            client,
                            brandName,
                            effectiveMapping.languageId,
                            manufacturerResolveCache
                        );
                    } catch (mErr) {
                        console.warn("[prestashop] manufacturer skipped:", mErr);
                    }
                }
            }
        } else {
            const mid = Number(exRow.id_manufacturer);
            if (Number.isFinite(mid) && mid > 0) idManufacturer = mid;
        }

        const langRows = await fetchActiveLanguages(client);
        let langs = buildLangPayloadsForPush(product, langRows, effectiveMapping.languageId, sku);
        if (isUpdate && exRow) {
            if (!ow.title) {
                langs = langs.map((l) => ({
                    ...l,
                    title: extractLocalizedField(exRow.name, l.id) || l.title,
                    slug: extractLocalizedField(exRow.link_rewrite, l.id) || l.slug,
                }));
            }
            if (!ow.description) {
                langs = langs.map((l) => ({
                    ...l,
                    description: extractLocalizedField(exRow.description, l.id) ?? l.description,
                }));
            }
            if (!ow.shortDescription) {
                langs = langs.map((l) => ({
                    ...l,
                    descriptionShort:
                        extractLocalizedField(exRow.description_short, l.id) ?? l.descriptionShort,
                }));
            }
        }

        let eanForXml: string | null = product.ean != null && String(product.ean).trim() ? String(product.ean).trim() : null;
        if (isUpdate && exRow && ow.ean === false) {
            const exEan = exRow.ean13 != null ? String(exRow.ean13).trim() : "";
            eanForXml = exEan || null;
        }

        const preservePhysical = isUpdate && exRow && ow.physical === false;
        let widthXml: string | undefined;
        let heightXml: string | undefined;
        let depthXml: string | undefined;
        let weightXml: string | undefined;
        let unityXml: string | undefined;
        if (!preservePhysical) {
            const phys = readPhysicalFromProduct(product);
            let shopWU: string | null = null;
            if (phys.weight != null) {
                shopWU = await fetchPrestaShopWeightUnitCached(client, base);
                weightXml = formatPrestaPhysicalNumber(
                    convertErpWeightToPrestaWeightField(
                        phys.weight,
                        effectiveMapping.erpWeightInputUnit ?? "kg",
                        shopWU
                    )
                );
            }
            if (phys.width != null) widthXml = formatPrestaPhysicalNumber(phys.width);
            if (phys.height != null) heightXml = formatPrestaPhysicalNumber(phys.height);
            if (phys.depth != null) depthXml = formatPrestaPhysicalNumber(phys.depth);
            if (phys.unityLabel) {
                unityXml = phys.unityLabel;
            } else if (weightXml) {
                if (shopWU == null) shopWU = await fetchPrestaShopWeightUnitCached(client, base);
                unityXml = prestashopUnityLabelForWeightUnit(shopWU);
            }
        }

        const mappingForXml: PrestaProductMapping = {
            ...effectiveMapping,
            defaultCategoryId: categoryIdForProduct,
        };

        const xml = buildProductXml({
            mapping: mappingForXml,
            sku,
            price: priceStr,
            productId: existingId,
            ean: eanForXml,
            idManufacturer,
            langs,
            width: widthXml,
            height: heightXml,
            depth: depthXml,
            weight: weightXml,
            unity: unityXml,
        });

        let res;
        if (existingId) {
            res = await client.put(`/products/${existingId}`, xml, {
                headers: { "Content-Type": "application/xml" },
            });
        } else {
            res = await client.post("/products", xml, {
                headers: { "Content-Type": "application/xml" },
            });
        }

        if (res.status >= 400) {
            const detail = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
            const prestashopErrors =
                typeof res.data === "string" ? parsePrestaShopErrorMessages(res.data) : [];
            const errorMsg =
                prestashopErrors[0] ?? "Errore webservice PrestaShop durante salvataggio prodotto.";
            console.error("PrestaShop Push Error:", detail);
            const httpStatus = res.status >= 500 ? 502 : 400;
            return NextResponse.json(
                {
                    error: errorMsg,
                    prestashopErrors,
                    details: detail.slice(0, 4000),
                    resolveCaches: {
                        categories: categoryResolveCache,
                        manufacturers: manufacturerResolveCache,
                    },
                },
                { status: httpStatus }
            );
        }

        let prestashopId = existingId;
        if (!prestashopId && typeof res.data === "string") {
            prestashopId = parseProductIdFromResponseXml(res.data);
        }
        if (!prestashopId) {
            prestashopId = await findProductIdByReference(client, sku);
        }

        if (prestashopId && ow.stock !== false && hasStock) {
            try {
                await patchStockForSimpleProduct(client, prestashopId, erpStockNum);
            } catch (stockErr) {
                console.warn("[prestashop] stock patch skipped:", stockErr);
            }
        }

        let imagesUploaded = 0;
        let imagesFailed = 0;
        if (
            prestashopId &&
            ow.images !== false &&
            effectiveMapping.uploadImages &&
            Array.isArray(product.images) &&
            product.images.length > 0
        ) {
            try {
                const imgRes = await uploadImagesToPrestaProduct(base, apiKey, prestashopId, product.images, {
                    maxImages: effectiveMapping.maxImages,
                    idShop: effectiveMapping.idShop,
                });
                imagesUploaded = imgRes.uploaded;
                imagesFailed = imgRes.failed;
            } catch (imgErr) {
                console.warn("[prestashop] image upload skipped:", imgErr);
            }
        }

        const companyIdForIndexing = getCompanyIdFromHeaders(req);
        if (companyIdForIndexing != null && prestashopId) {
            const canonical = buildPrestaCanonicalProductUrl(shopUrl, Number(prestashopId));
            void runAutoIndexingAfterChannelPush(companyIdForIndexing, [canonical]).catch(() => {});
        }

        return NextResponse.json({
            success: true,
            prestashopId,
            action: existingId ? "updated" : "created",
            imagesUploaded,
            imagesFailed,
            resolveCaches: {
                categories: categoryResolveCache,
                manufacturers: manufacturerResolveCache,
            },
        });
    } catch (err: any) {
        console.error("PrestaShop Push Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                error: "Errore durante la pubblicazione su PrestaShop.",
                details: err.response?.data || err.message,
                resolveCaches: {
                    categories: categoryResolveCache,
                    manufacturers: manufacturerResolveCache,
                },
            },
            { status: 500 }
        );
    }
}
