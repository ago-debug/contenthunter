import { redirect } from "next/navigation";

/** Compatibilità link vecchi: /import → hub prodotti con tab Import Lab */
export default async function ImportPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const id = sp.id;
    const idStr = Array.isArray(id) ? id[0] : id;
    const q = new URLSearchParams();
    q.set("tab", "import");
    if (idStr) q.set("id", idStr);
    redirect(`/?${q.toString()}`);
}
