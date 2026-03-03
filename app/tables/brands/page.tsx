import TableManager from "@/components/TableManager";

export default function BrandsPage() {
    return (
        <TableManager
            title="Brands Management"
            endpoint="/api/brands"
            fields={[
                { key: "name", label: "Brand Name", type: "text" },
                { key: "logoUrl", label: "Logo URL", type: "text" },
            ]}
        />
    );
}
