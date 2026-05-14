"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { BookOpen, Loader2, Plus, Trash2, Sparkles } from "lucide-react";

type CatalogPdf = { id: number; fileName?: string | null };
type CatalogRow = { id: number; name: string; pdfs?: CatalogPdf[] };

type AnchorMode = "sku" | "title" | "new";

type FormSource =
    | { id: string; type: "text"; label: string; text: string }
    | { id: string; type: "url"; url: string }
    | { id: string; type: "pdf_catalog"; catalogId: number | ""; pdfId: number | "" }
    | { id: string; type: "pdf_file"; filename: string; dataBase64: string | null };

const PRESET_FIELDS: { key: string; label: string }[] = [
    { key: "sku", label: "SKU" },
    { key: "ean", label: "EAN" },
    { key: "parentSku", label: "SKU padre" },
    { key: "title", label: "Titolo" },
    { key: "description", label: "Descrizione" },
    { key: "docDescription", label: "Descrizione documentazione" },
    { key: "bulletPoints", label: "Bullet points" },
    { key: "price", label: "Prezzo" },
    { key: "brand", label: "Brand" },
    { key: "category", label: "Categoria" },
    { key: "dimensions", label: "Dimensioni" },
    { key: "weight", label: "Peso" },
    { key: "material", label: "Materiale" },
];

function newId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
            const s = String(r.result || "");
            const i = s.indexOf(",");
            resolve(i >= 0 ? s.slice(i + 1) : s);
        };
        r.onerror = () => reject(new Error("Lettura file fallita"));
        r.readAsDataURL(file);
    });
}

export default function NotebookFontiPage() {
    const { data: session, status } = useSession();
    const companyContext = useCompanyContext();
    const effectiveCompanyId =
        (session?.user as { companyId?: number } | undefined)?.companyId ?? companyContext?.selectedCompanyId ?? null;

    const companyReq = useMemo(
        () => (effectiveCompanyId != null ? { headers: { "x-company-id": String(effectiveCompanyId) } } : {}),
        [effectiveCompanyId]
    );

    const isGlobalAdminUser = !!(session?.user as { isGlobalAdmin?: boolean })?.isGlobalAdmin;
    const [planPdfAllowed, setPlanPdfAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        if (status !== "authenticated") {
            setPlanPdfAllowed(null);
            return;
        }
        if (isGlobalAdminUser) {
            setPlanPdfAllowed(true);
            return;
        }
        if (effectiveCompanyId == null) {
            setPlanPdfAllowed(false);
            return;
        }
        axios
            .get<{ featurePdfSuite?: boolean }>("/api/company/features", companyReq)
            .then((r) => setPlanPdfAllowed(!!r.data?.featurePdfSuite))
            .catch(() => setPlanPdfAllowed(true));
    }, [status, isGlobalAdminUser, effectiveCompanyId, companyReq]);

    const [catalogs, setCatalogs] = useState<CatalogRow[]>([]);
    useEffect(() => {
        if (status !== "authenticated" || planPdfAllowed === false) return;
        axios
            .get<CatalogRow[]>("/api/catalogues", companyReq)
            .then((r) => setCatalogs(Array.isArray(r.data) ? r.data : []))
            .catch(() => setCatalogs([]));
    }, [status, planPdfAllowed, companyReq]);

    const [anchorMode, setAnchorMode] = useState<AnchorMode>("title");
    const [anchorSku, setAnchorSku] = useState("");
    const [anchorTitle, setAnchorTitle] = useState("");
    const [anchorNewName, setAnchorNewName] = useState("");

    const [fieldInclude, setFieldInclude] = useState<Record<string, boolean>>(() => {
        const o: Record<string, boolean> = {};
        for (const f of PRESET_FIELDS) o[f.key] = ["title", "sku", "description", "price"].includes(f.key);
        return o;
    });
    const [fieldMandatory, setFieldMandatory] = useState<Record<string, boolean>>(() => {
        const o: Record<string, boolean> = {};
        for (const f of PRESET_FIELDS) o[f.key] = f.key === "sku" || f.key === "title";
        return o;
    });
    const [extraFieldKeysRaw, setExtraFieldKeysRaw] = useState("");

    const [sources, setSources] = useState<FormSource[]>([
        { id: newId(), type: "text", label: "Scheda / note", text: "" },
    ]);
    const [extraInstructions, setExtraInstructions] = useState("");

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{
        mapped: Record<string, unknown>;
        extras: { key: string; value: string }[];
        sourceNotes: string[];
        confidence: string | null;
        missingMandatory: string[];
    } | null>(null);

    const addSource = useCallback((t: FormSource["type"]) => {
        const id = newId();
        if (t === "text") setSources((s) => [...s, { id, type: "text", label: "", text: "" }]);
        else if (t === "url") setSources((s) => [...s, { id, type: "url", url: "" }]);
        else if (t === "pdf_catalog") setSources((s) => [...s, { id, type: "pdf_catalog", catalogId: "", pdfId: "" }]);
        else setSources((s) => [...s, { id, type: "pdf_file", filename: "", dataBase64: null }]);
    }, []);

    const removeSource = useCallback((id: string) => {
        setSources((s) => (s.length <= 1 ? s : s.filter((x) => x.id !== id)));
    }, []);

    const updateSource = useCallback((id: string, patch: Partial<FormSource>) => {
        setSources((rows) => rows.map((r) => (r.id === id ? ({ ...r, ...patch } as FormSource) : r)));
    }, []);

    const buildPayload = useCallback(() => {
        const fieldKeys: string[] = [];
        for (const f of PRESET_FIELDS) {
            if (fieldInclude[f.key]) fieldKeys.push(f.key);
        }
        const extra = extraFieldKeysRaw
            .split(/[,;\s]+/)
            .map((x) => x.trim())
            .filter(Boolean);
        const keyRe = /^[a-zA-Z][a-zA-Z0-9_]*$/;
        for (const k of extra) {
            if (keyRe.test(k) && k.length <= 64 && !fieldKeys.includes(k)) fieldKeys.push(k);
        }
        const mandatoryKeys = fieldKeys.filter((k) => fieldMandatory[k]);

        let anchor: { mode: AnchorMode; sku?: string; titleHint?: string; suggestedName?: string };
        if (anchorMode === "sku") {
            anchor = { mode: "sku", sku: anchorSku.trim() };
        } else if (anchorMode === "title") {
            anchor = { mode: "title", titleHint: anchorTitle.trim() };
        } else {
            anchor = { mode: "new", suggestedName: anchorNewName.trim() || undefined };
        }

        const apiSources: Array<Record<string, unknown>> = [];
        for (const s of sources) {
            if (s.type === "text") {
                if (!s.text.trim()) continue;
                apiSources.push({
                    type: "text",
                    label: s.label.trim() || "Testo",
                    text: s.text,
                });
            } else if (s.type === "url") {
                if (!s.url.trim()) continue;
                apiSources.push({ type: "url", url: s.url.trim() });
            } else if (s.type === "pdf_catalog") {
                if (s.catalogId === "" || s.pdfId === "") continue;
                apiSources.push({
                    type: "pdf_catalog",
                    catalogId: Number(s.catalogId),
                    pdfId: Number(s.pdfId),
                });
            } else if (s.type === "pdf_file") {
                if (!s.dataBase64) continue;
                apiSources.push({
                    type: "pdf_base64",
                    filename: s.filename || "documento.pdf",
                    data: s.dataBase64,
                });
            }
        }

        return { anchor, fieldKeys, mandatoryKeys, sources: apiSources, extraInstructions: extraInstructions.trim() || undefined };
    }, [
        anchorMode,
        anchorSku,
        anchorTitle,
        anchorNewName,
        fieldInclude,
        fieldMandatory,
        extraFieldKeysRaw,
        sources,
        extraInstructions,
    ]);

    const runMap = async () => {
        const p = buildPayload();
        if (!p.fieldKeys.length) {
            toast.error("Seleziona almeno un campo da compilare.");
            return;
        }
        if (p.sources.length === 0) {
            toast.error("Aggiungi almeno una fonte con contenuto.");
            return;
        }
        if (p.anchor.mode === "sku" && !p.anchor.sku) {
            toast.error("Inserisci lo SKU per l’ancora.");
            return;
        }
        if (p.anchor.mode === "title" && !p.anchor.titleHint) {
            toast.error("Inserisci titolo o nome prodotto per l’ancora.");
            return;
        }
        setLoading(true);
        setResult(null);
        try {
            const res = await axios.post("/api/ai/product-map-from-sources", p, {
                ...companyReq,
                timeout: 110_000,
            });
            setResult(res.data);
            if (res.data.missingMandatory?.length) {
                toast.warning(`Campi obbligatori mancanti: ${res.data.missingMandatory.join(", ")}`);
            } else {
                toast.success("Mappatura completata.");
            }
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.error || e.message : "Errore richiesta";
            toast.error(String(msg));
        } finally {
            setLoading(false);
        }
    };

    if (status === "loading") {
        return (
            <div className="min-h-[50vh] flex items-center justify-center text-slate-600">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    if (status !== "authenticated") {
        return (
            <div className="max-w-lg mx-auto mt-16 p-6 border border-slate-200 rounded-xl bg-white shadow-sm">
                <p className="text-slate-700">Accedi per usare la mappatura da fonti.</p>
            </div>
        );
    }

    if (planPdfAllowed === false) {
        return (
            <div className="max-w-lg mx-auto mt-16 p-6 border border-amber-200 rounded-xl bg-amber-50">
                <p className="text-amber-900 font-medium">PDF Suite non attivo per questo piano.</p>
                <p className="text-sm text-amber-800 mt-2">Contatta l’amministratore per abilitare PDF AI / suite cataloghi.</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 pb-20">
            <div className="flex items-start gap-3 mb-8">
                <div className="p-3 rounded-xl bg-indigo-600 text-white shadow-md">
                    <BookOpen className="w-7 h-7" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Mappa da fonti (NotebookLM)</h1>
                    <p className="text-slate-600 mt-1 text-sm leading-relaxed">
                        Unisci PDF da catalogo, PDF caricati, pagine web e testo libero. L’AI legge solo le fonti che indichi e
                        restituisce JSON allineato ai campi prodotto (obbligatori opzionali). Stesso approccio ragionato di{" "}
                        <span className="font-semibold">NotebookLM</span>: contesto multi-fonte, niente allucinazioni oltre il
                        testo fornito.
                    </p>
                    <Link href="/" className="text-sm text-indigo-600 font-semibold mt-2 inline-block hover:underline">
                        ← Torna a Prodotti & import
                    </Link>
                </div>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Ancora prodotto</h2>
                <div className="flex flex-wrap gap-4 mb-4">
                    {(
                        [
                            ["sku", "SKU esistente"],
                            ["title", "Titolo / nome"],
                            ["new", "Nuovo prodotto"],
                        ] as const
                    ).map(([m, lab]) => (
                        <label key={m} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name="am" checked={anchorMode === m} onChange={() => setAnchorMode(m)} />
                            <span>{lab}</span>
                        </label>
                    ))}
                </div>
                {anchorMode === "sku" && (
                    <input
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="Es. ABC-123"
                        value={anchorSku}
                        onChange={(e) => setAnchorSku(e.target.value)}
                    />
                )}
                {anchorMode === "title" && (
                    <input
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="Nome o titolo come compare in listino / sito"
                        value={anchorTitle}
                        onChange={(e) => setAnchorTitle(e.target.value)}
                    />
                )}
                {anchorMode === "new" && (
                    <input
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="Nome di lavoro (opzionale)"
                        value={anchorNewName}
                        onChange={(e) => setAnchorNewName(e.target.value)}
                    />
                )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Campi da compilare</h2>
                <div className="grid sm:grid-cols-2 gap-2">
                    {PRESET_FIELDS.map((f) => (
                        <label
                            key={f.key}
                            className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                        >
                            <span className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={!!fieldInclude[f.key]}
                                    onChange={(e) =>
                                        setFieldInclude((x) => ({
                                            ...x,
                                            [f.key]: e.target.checked,
                                        }))
                                    }
                                />
                                {f.label}
                            </span>
                            <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                                <input
                                    type="checkbox"
                                    disabled={!fieldInclude[f.key]}
                                    checked={!!fieldMandatory[f.key]}
                                    onChange={(e) =>
                                        setFieldMandatory((x) => ({
                                            ...x,
                                            [f.key]: e.target.checked,
                                        }))
                                    }
                                />
                                Obbl.
                            </label>
                        </label>
                    ))}
                </div>
                <div className="mt-4">
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Chiavi extra (separate da virgola)</label>
                    <input
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="es. colore, garanzia_mesi, codice_fornitore"
                        value={extraFieldKeysRaw}
                        onChange={(e) => setExtraFieldKeysRaw(e.target.value)}
                    />
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Fonti</h2>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => addSource("text")}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
                        >
                            <Plus className="w-3 h-3" /> Testo
                        </button>
                        <button
                            type="button"
                            onClick={() => addSource("url")}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
                        >
                            <Plus className="w-3 h-3" /> URL
                        </button>
                        <button
                            type="button"
                            onClick={() => addSource("pdf_catalog")}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
                        >
                            <Plus className="w-3 h-3" /> PDF catalogo
                        </button>
                        <button
                            type="button"
                            onClick={() => addSource("pdf_file")}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
                        >
                            <Plus className="w-3 h-3" /> PDF file
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {sources.map((s, idx) => (
                        <div key={s.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-500">Fonte {idx + 1}</span>
                                <button
                                    type="button"
                                    onClick={() => removeSource(s.id)}
                                    className="p-1 text-slate-400 hover:text-red-600"
                                    aria-label="Rimuovi"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            {s.type === "text" && (
                                <>
                                    <input
                                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm mb-2"
                                        placeholder="Etichetta (opzionale)"
                                        value={s.label}
                                        onChange={(e) => updateSource(s.id, { label: e.target.value })}
                                    />
                                    <textarea
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[100px]"
                                        placeholder="Incolla qui scheda tecnica, email, estratto listino…"
                                        value={s.text}
                                        onChange={(e) => updateSource(s.id, { text: e.target.value })}
                                    />
                                </>
                            )}
                            {s.type === "url" && (
                                <input
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                                    placeholder="https://…"
                                    value={s.url}
                                    onChange={(e) => updateSource(s.id, { url: e.target.value })}
                                />
                            )}
                            {s.type === "pdf_catalog" && (
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <select
                                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                                        value={s.catalogId === "" ? "" : String(s.catalogId)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            updateSource(s.id, {
                                                catalogId: v === "" ? "" : Number(v),
                                                pdfId: "",
                                            });
                                        }}
                                    >
                                        <option value="">— Catalogo —</option>
                                        {catalogs.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                                        value={s.pdfId === "" ? "" : String(s.pdfId)}
                                        disabled={s.catalogId === ""}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            updateSource(s.id, { pdfId: v === "" ? "" : Number(v) });
                                        }}
                                    >
                                        <option value="">— PDF —</option>
                                        {(catalogs.find((c) => c.id === s.catalogId)?.pdfs || []).map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.fileName || `PDF #${p.id}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {s.type === "pdf_file" && (
                                <div>
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        className="text-sm w-full"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) {
                                                updateSource(s.id, { filename: "", dataBase64: null });
                                                return;
                                            }
                                            try {
                                                const b64 = await fileToBase64(file);
                                                updateSource(s.id, { filename: file.name, dataBase64: b64 });
                                            } catch {
                                                toast.error("Impossibile leggere il PDF");
                                            }
                                        }}
                                    />
                                    {s.dataBase64 && (
                                        <p className="text-xs text-emerald-600 mt-1">Caricato: {s.filename || "file.pdf"}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="mt-4">
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Istruzioni aggiuntive per l’AI</label>
                    <textarea
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[72px]"
                        placeholder="Es. prezzi IVA esclusa, lingua italiana, ignora righe cancellate…"
                        value={extraInstructions}
                        onChange={(e) => setExtraInstructions(e.target.value)}
                    />
                </div>
            </section>

            <button
                type="button"
                disabled={loading || planPdfAllowed === null}
                onClick={() => void runMap()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                Esegui mappatura
            </button>

            {result && (
                <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-900 text-slate-100 p-5 overflow-x-auto">
                    <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
                        {result.confidence && (
                            <span className="px-2 py-0.5 rounded bg-slate-700 text-xs">Confidence: {result.confidence}</span>
                        )}
                        {result.missingMandatory?.length > 0 && (
                            <span className="px-2 py-0.5 rounded bg-amber-900/80 text-amber-100 text-xs">
                                Obbligatori mancanti: {result.missingMandatory.join(", ")}
                            </span>
                        )}
                    </div>
                    {result.sourceNotes?.length > 0 && (
                        <ul className="text-xs text-slate-400 mb-4 list-disc pl-4 space-y-1">
                            {result.sourceNotes.map((n, i) => (
                                <li key={i}>{n}</li>
                            ))}
                        </ul>
                    )}
                    <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
                        {JSON.stringify({ mapped: result.mapped, extras: result.extras }, null, 2)}
                    </pre>
                </section>
            )}
        </div>
    );
}
