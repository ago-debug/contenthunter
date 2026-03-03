import TableManager from "@/components/TableManager";

export default function CategoriesPage() {
    return (
        <TableManager
            title="Categories Catalog"
            endpoint="/api/categories"
            fields={[
                { key: "name", label: "Category Name", type: "text" },
                { key: "parentId", label: "Parent ID (Optional)", type: "number" },
            ]}
        />
    );
}
