"use client";

import TableManager from "@/components/TableManager";

type CatRow = { id: number; name: string; parentId: number | null };

/** Percorso dalla radice al genitore di `parentId` (es. per cella tabella). */
function parentCategoryPath(cats: CatRow[], parentId: unknown): string {
    if (parentId == null || parentId === "") return "—";
    const id = typeof parentId === "number" ? parentId : Number(parentId);
    if (Number.isNaN(id)) return "—";
    const byId = new Map(cats.map((c) => [c.id, c]));
    const parts: string[] = [];
    let cur: CatRow | undefined = byId.get(id);
    const visited = new Set<number>();
    while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        parts.unshift(cur.name);
        cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    return parts.length > 0 ? parts.join(" › ") : `#${id}`;
}

function buildParentOptions(cats: CatRow[], editingId: number | null) {
    const exclude = new Set<number>();
    if (editingId != null) {
        exclude.add(editingId);
        const children = new Map<number, number[]>();
        for (const c of cats) {
            if (c.parentId == null) continue;
            if (!children.has(c.parentId)) children.set(c.parentId, []);
            children.get(c.parentId)!.push(c.id);
        }
        const stack = [...(children.get(editingId) ?? [])];
        while (stack.length) {
            const id = stack.pop()!;
            if (exclude.has(id)) continue;
            exclude.add(id);
            stack.push(...(children.get(id) ?? []));
        }
    }
    const byId = new Map(cats.map((c) => [c.id, c]));
    function pathFor(id: number): string {
        const parts: string[] = [];
        let cur: CatRow | undefined = byId.get(id);
        const visited = new Set<number>();
        while (cur && !visited.has(cur.id)) {
            visited.add(cur.id);
            parts.unshift(cur.name);
            cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
        }
        return parts.join(" › ");
    }
    return cats
        .filter((c) => !exclude.has(c.id))
        .map((c) => ({ value: c.id, label: pathFor(c.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, "it"));
}

export default function CategoriesPage() {
    return (
        <TableManager
            title="Categories Catalog"
            endpoint="/api/categories"
            listEndpoint="/api/categories?all=true"
            fields={[
                { key: "name", label: "Nome categoria", type: "text", required: true },
                {
                    key: "parentId",
                    label: "Categoria padre (opzionale)",
                    type: "searchableSelect",
                    required: false,
                    searchablePlaceholder: "Nessuna — categoria radice",
                    searchableSearchPlaceholder: "Cerca categoria…",
                    optionBuilder: ({ rows, editingItem }) =>
                        buildParentOptions(rows as CatRow[], editingItem?.id ?? null),
                    formatCell: ({ value, rows }) => parentCategoryPath(rows as CatRow[], value),
                },
            ]}
        />
    );
}
