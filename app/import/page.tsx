"use client";

import { CatalogProvider } from "@/components/CatalogContext";
import ImportLab from "@/components/ImportLab";

export default function Page() {
    return (
        <CatalogProvider>
            <ImportLab />
        </CatalogProvider>
    );
}
