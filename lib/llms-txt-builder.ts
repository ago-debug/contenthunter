import type { SeoGeoHubPayload } from "@/lib/seo-geo-hub-schema";

/**
 * Contenuto suggerito per llms.txt (standard emergente per crawler IA).
 * Va pubblicato sul dominio pubblico del negozio (es. https://negozio.it/llms.txt).
 */
export function buildLlmsTxtDocument(args: {
    companyName: string;
    hub: SeoGeoHubPayload;
    productCount: number;
    wooDomain?: string | null;
}): string {
    const lines: string[] = [];
    lines.push(`# ${args.companyName}`);
    lines.push("");
    lines.push("> Documento generato da Iris (Content Hunter) per migliorare la scoperta da parte di sistemi IA e crawler compatibili.");
    lines.push("");

    const ai = args.hub.aiDiscovery;
    if (ai?.brandSummaryForAi?.trim()) {
        lines.push("## Brand");
        lines.push(ai.brandSummaryForAi.trim());
        lines.push("");
    }
    if (ai?.topicalFocus?.trim()) {
        lines.push("## Focus contenuti");
        lines.push(ai.topicalFocus.trim());
        lines.push("");
    }

    const seo = args.hub.seo;
    if (seo.primaryKeywords?.trim()) {
        lines.push("## Keyword strategiche");
        lines.push(seo.primaryKeywords.trim());
        lines.push("");
    }

    const geo = args.hub.geo;
    const geoBits = [geo.city, geo.region, geo.countryCode].filter(Boolean).join(", ");
    if (geo.locationName?.trim() || geoBits) {
        lines.push("## Presenza locale");
        if (geo.locationName?.trim()) lines.push(`- Punto vendita / sede: ${geo.locationName.trim()}`);
        if (geoBits) lines.push(`- Territorio: ${geoBits}`);
        if (geo.serviceArea?.trim()) lines.push(`- Area servita: ${geo.serviceArea.trim().slice(0, 500)}`);
        lines.push("");
    }

    lines.push("## Catalogo");
    lines.push(
        `- Circa **${args.productCount}** referenze gestite in biblioteca prodotti Iris (anagrafica centrale).`
    );
    if (args.wooDomain?.trim()) {
        lines.push(`- Storefront e-commerce: ${args.wooDomain.trim().replace(/\/+$/, "")}`);
    }
    lines.push("");
    lines.push("## Policy");
    lines.push("- I contenuti prodotto pubblicati sul negozio sono la fonte di verità per disponibilità e prezzi.");
    lines.push("");

    return lines.join("\n").trim() + "\n";
}
