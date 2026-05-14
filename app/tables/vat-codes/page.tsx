"use client";

import TableManager from "@/components/TableManager";

export default function VatCodesPage() {
    return (
        <TableManager
            title="Codici IVA"
            endpoint="/api/vat-codes"
            fields={[
                { key: "code", label: "Codice", type: "text", required: true },
                { key: "label", label: "Descrizione (opz.)", type: "text", required: false },
                { key: "ratePercent", label: "Aliquota %", type: "number", required: true },
            ]}
        />
    );
}
