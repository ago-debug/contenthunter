import { NextResponse } from "next/server";
import axios from "axios";

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

        return NextResponse.json({
            success: true,
            fields,
            sampleProduct,
            totalFound: response.data.length
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
    const { domain, key, secret, product } = body;

    if (!domain || !key || !secret || !product) {
        return NextResponse.json({ error: "Data missing" }, { status: 400 });
    }

    try {
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
            attributes: [
                { name: "Brand", visible: true, variation: false, options: [product.brand] },
                { name: "Material", visible: true, variation: false, options: [product.material] },
                { name: "Dimensions", visible: true, variation: false, options: [product.dimensions] }
            ]
        };

        const response = await axios.post(`${domain}/wp-json/wc/v3/products`, wooProduct, {
            auth: {
                username: key,
                password: secret
            }
        });

        return NextResponse.json({ success: true, wooId: response.data.id, data: response.data });
    } catch (err: any) {
        console.error("WooCommerce Push Error:", err.response?.data || err.message);
        return NextResponse.json({
            error: "Errore durante la pubblicazione su WooCommerce.",
            details: err.response?.data || err.message
        }, { status: 500 });
    }
}
