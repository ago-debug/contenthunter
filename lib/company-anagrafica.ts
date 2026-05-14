import type { Prisma } from "@prisma/client";

export const COMPANY_ANAGRAFICA_KEYS = [
    "legalName",
    "vatNumber",
    "fiscalCode",
    "contactEmail",
    "pecEmail",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "postalCode",
    "province",
    "country",
    "sdiRecipientCode",
] as const;

export type CompanyAnagraficaKey = (typeof COMPANY_ANAGRAFICA_KEYS)[number];

/** Scalari anagrafica compatibili con `CompanyCreateInput` e assegnabili a `CompanyUpdateInput` (no `*FieldUpdateOperationsInput`). */
export type CompanyAnagraficaInput = Partial<
    Pick<Prisma.CompanyCreateInput, CompanyAnagraficaKey>
>;

/** Estrae aggiornamenti anagrafica da body JSON (solo chiavi presenti). Stringa vuota → null. */
export function companyAnagraficaUpdateFromBody(body: Record<string, unknown>): CompanyAnagraficaInput {
    const data: CompanyAnagraficaInput = {};

    const setOpt = (key: CompanyAnagraficaKey, max: number, transform?: (s: string) => string) => {
        if (!(key in body)) return;
        const raw = body[key];
        if (raw === null) {
            (data as Record<string, string | null>)[key] = null;
            return;
        }
        const s0 = String(raw).trim();
        if (s0 === "") {
            (data as Record<string, null>)[key] = null;
            return;
        }
        const s = transform ? transform(s0) : s0;
        (data as Record<string, string>)[key] = s.slice(0, max);
    };

    setOpt("legalName", 512);
    setOpt("vatNumber", 32, (s) => s.toUpperCase().replace(/\s+/g, ""));
    setOpt("fiscalCode", 32, (s) => s.toUpperCase().replace(/\s+/g, ""));
    setOpt("contactEmail", 255, (s) => s.toLowerCase());
    setOpt("pecEmail", 255, (s) => s.toLowerCase());
    setOpt("phone", 64);
    setOpt("addressLine1", 256);
    setOpt("addressLine2", 256);
    setOpt("city", 128);
    setOpt("postalCode", 16);
    setOpt("province", 8, (s) => s.toUpperCase());
    setOpt("country", 2, (s) => s.toUpperCase().slice(0, 2));
    setOpt("sdiRecipientCode", 10, (s) => s.toUpperCase().replace(/\s+/g, ""));

    return data;
}

export function bodyHasAnagraficaKeys(body: Record<string, unknown>): boolean {
    return COMPANY_ANAGRAFICA_KEYS.some((k) => k in body);
}

export type CompanyAnagraficaJson = {
    legalName: string | null;
    vatNumber: string | null;
    fiscalCode: string | null;
    contactEmail: string | null;
    pecEmail: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    province: string | null;
    country: string | null;
    sdiRecipientCode: string | null;
};

export function companyAnagraficaToJson(c: {
    legalName: string | null;
    vatNumber: string | null;
    fiscalCode: string | null;
    contactEmail: string | null;
    pecEmail: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    province: string | null;
    country: string | null;
    sdiRecipientCode: string | null;
}): CompanyAnagraficaJson {
    return {
        legalName: c.legalName,
        vatNumber: c.vatNumber,
        fiscalCode: c.fiscalCode,
        contactEmail: c.contactEmail,
        pecEmail: c.pecEmail,
        phone: c.phone,
        addressLine1: c.addressLine1,
        addressLine2: c.addressLine2,
        city: c.city,
        postalCode: c.postalCode,
        province: c.province,
        country: c.country,
        sdiRecipientCode: c.sdiRecipientCode,
    };
}
