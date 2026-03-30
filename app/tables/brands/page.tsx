import TableManager from "@/components/TableManager";

export default function BrandsPage() {
    return (
        <TableManager
            title="Brands Management"
            endpoint="/api/brands"
            fields={[
                { key: "name", label: "Brand Name", type: "text" },
                { key: "logoUrl", label: "Logo URL", type: "text" },
                { key: "aiContentGuidelines", label: "Linee guida AI (tono, stile)", type: "textarea", required: false },
            ]}
        />
    );
}
