"use client";

import TableManager from "@/components/TableManager";
import { Tag } from "lucide-react";

export default function TagsPage() {
    return (
        <TableManager
            title="Tags Management"
            subtitle="Categorize and label products with custom tags"
            apiEndpoint="/api/tags"
            columns={[
                { key: "name", label: "Tag Name", type: "text", required: true }
            ]}
            icon={Tag}
        />
    );
}
