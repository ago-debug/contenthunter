import { NextResponse } from "next/server";
import axios from "axios";

type WooMapping = {
    brandAttributeName?: string;
    materialAttributeName?: string;
    dimensionsAttributeName?: string;
    extrasToAttributes?: boolean;
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get("domain");
    const key = searchParams.get("key");
    const secret = searchParams.get("secret");

    if (!domain || !key || !secret) {
        return NextResponse.json({ error: "Missing configuration" }, { status: 400 });
    }

    try {
        // Fetch products from WooCommerce to see fields and mapping
        const response = await axios.get(`${domain}/wp-json/wc/v3/products`, {
            params: { per_page: 5 },
            auth: {
                username: key,
                password: secret
            }
        });

        // Extract unique keys from WooCommerce response for mapping
        const sampleProduct = response.data[0] || {};
        const fields = Object.keys(sampleProduct);

        // Extract attribute names to let user map ERP fields
        const attributeNames = Array.from(
            new Set(
                (sampleProduct?.attributes || [])
                    .map((a: any) => a?.name)
                    .filter((n: any) => typeof n === "string" && n.trim().length > 0)
            )
        );

        return NextResponse.json({
            success: true,
            fields,
            sampleProduct,
            totalFound: response.data.length,
            attributeNames
        });
    } catch (err: any) {
        console.error("WooCommerce Error:", err.response?.data || err.message);
        return NextResponse.json({
            error: "Impossibile connettersi a WooCommerce. Verificare Domain e API Keys.",
            details: err.response?.data || err.message
        }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const body = await req.json();
    const { domain, key, secret, product, mapping } = body as {
        domain: string;
        key: string;
        secret: string;
        product: any;
        mapping?: WooMapping;
    };

    if (!domain || !key || !secret || !product) {
        return NextResponse.json({ error: "Data missing" }, { status: 400 });
    }

    try {
        const effectiveMapping: WooMapping = {
            brandAttributeName: mapping?.brandAttributeName ?? "Brand",
            materialAttributeName: mapping?.materialAttributeName ?? "Material",
            dimensionsAttributeName: mapping?.dimensionsAttributeName ?? "Dimensions",
            extrasToAttributes: mapping?.extrasToAttributes ?? true,
        };

        const brandAttrName = (effectiveMapping.brandAttributeName || "").toString().trim();
        const materialAttrName = (effectiveMapping.materialAttributeName || "").toString().trim();
        const dimensionsAttrName = (effectiveMapping.dimensionsAttributeName || "").toString().trim();

        // Map PIM product to WooCommerce format
        const wooProduct = {
            name: product.title,
            type: "simple",
            regular_price: String(product.price || ""),
            description: product.description || "",
            short_description: product.docDescription || "",
            sku: product.sku,
            categories: product.category ? [{ name: product.category }] : [],
            images: (product.images || []).map((img: any) => ({ src: img.url })),
            attributes: [] as any[],
            ...(product.stock !== undefined && product.stock !== null
                ? {
                    manage_stock: true,
                    stock_quantity: parseInt(String(product.stock), 10) || 0,
                }
                : {})
        };

        const attributes: any[] = [];

        if (brandAttrName && product.brand) {
            attributes.push({ name: brandAttrName, visible: true, variation: false, options: [String(product.brand)] });
        }
        if (materialAttrName && product.material) {
            attributes.push({ name: materialAttrName, visible: true, variation: false, options: [String(product.material)] });
        }
        if (dimensionsAttrName && product.dimensions) {
            attributes.push({ name: dimensionsAttrName, visible: true, variation: false, options: [String(product.dimensions)] });
        }

        if (effectiveMapping.extrasToAttributes && product.extraFields && typeof product.extraFields === "object") {
            // Map all other ERP extra fields to Woo attributes
            const skipKeys = new Set(["stockLocal", "stockSupplier", "dimensions", "material", "weight"]);
            for (const [k, v] of Object.entries(product.extraFields)) {
                if (skipKeys.has(k)) continue;
                const value = v?.toString?.().trim?.() ?? "";
                if (!value) continue;
                attributes.push({
                    name: k,
                    visible: true,
                    variation: false,
                    options: [value],
                });
            }
        }

        wooProduct.attributes = attributes;

        // Upsert by SKU: if product exists -> PUT, else -> POST
        const existingRes = await axios.get(`${domain}/wp-json/wc/v3/products`, {
            params: { sku: product.sku, per_page: 1 },
            auth: { username: key, password: secret },
        });
        const existing = Array.isArray(existingRes.data) ? existingRes.data[0] : null;

        const response = existing
            ? await axios.put(`${domain}/wp-json/wc/v3/products/${existing.id}`, wooProduct, {
                  auth: { username: key, password: secret },
              })
            : await axios.post(`${domain}/wp-json/wc/v3/products`, wooProduct, {
                  auth: { username: key, password: secret },
              });

        return NextResponse.json({
            success: true,
            wooId: response.data.id,
            action: existing ? "updated" : "created",
            data: response.data
        });
    } catch (err: any) {
        console.error("WooCommerce Push Error:", err.response?.data || err.message);
        return NextResponse.json({
            error: "Errore durante la pubblicazione su WooCommerce.",
            details: err.response?.data || err.message
        }, { status: 500 });
    }
}
