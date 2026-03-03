"use client";

import TableManager from "@/components/TableManager";
import { Tag } from "lucide-react";

export default function TagsPage() {
    return (
        <TableManager
            title="Tags Management"
            endpoint="/api/tags"
            fields={[
                { key: "name", label: "Tag Name", type: "text" }
            ]}
        />
    );
}
