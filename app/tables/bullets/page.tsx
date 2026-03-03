import TableManager from "@/components/TableManager";

export default function BulletsPage() {
    return (
        <TableManager
            title="Bullet Points Pool"
            endpoint="/api/bullets"
            fields={[
                { key: "content", label: "Bullet Point Content", type: "text" },
                { key: "productId", label: "Product ID (Linked)", type: "number" },
            ]}
        />
    );
}
