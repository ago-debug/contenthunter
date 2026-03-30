"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Edit2, RefreshCw, X } from "lucide-react";
import { ClearableSearchInput } from "@/components/ClearableSearchInput";
import axios from "axios";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import { useCompanyContext } from "@/contexts/CompanyContext";

interface TableManagerProps {
    title: string;
    endpoint: string;
    fields: {
        key: string;
        label: string;
        type: "text" | "number" | "select" | "textarea";
        options?: { value: string | number; label: string }[];
        required?: boolean;
    }[];
}

function getAxiosErrorMessage(err: unknown, fallback: string): string {
    const e = err as {
        response?: { data?: { error?: string; details?: string }; status?: number };
        message?: string;
    };
    const d = e?.response?.data;
    const msg = (typeof d?.error === "string" && d.error.trim() ? d.error : null) ||
        (typeof d?.details === "string" && d.details.trim() ? d.details : null);
    if (msg) return msg;
    const st = e?.response?.status;
    if (st === 403) return "Non autorizzato o azienda non specificata (seleziona l’azienda in alto).";
    if (st === 409) return "Conflitto: esiste già un elemento con questi dati.";
    if (st === 503) return "Database non aggiornato (tabella mancante). Esegui prisma db push sul server.";
    if (st === 400) return "Dati non validi. Controlla i campi obbligatori.";
    return e?.message || fallback;
}

function buildPayload(
    formData: Record<string, unknown>,
    fields: TableManagerProps["fields"],
    isCreate: boolean
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
        const raw = formData[f.key];
        if (raw === undefined) continue;
        if (f.type === "number") {
            if (raw === "" || raw === null) {
                out[f.key] = raw;
                continue;
            }
            const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
            out[f.key] = Number.isNaN(n) ? raw : n;
        } else {
            out[f.key] = raw;
        }
    }
    if (isCreate) delete out.id;
    return out;
}

export default function TableManager({ title, endpoint, fields }: TableManagerProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const { data: session, status: sessionStatus } = useSession();
    const companyContext = useCompanyContext();
    const effectiveCompanyId =
        (session?.user as any)?.companyId ?? companyContext?.selectedCompanyId ?? null;
    const reqConfig = useMemo(
        () =>
            effectiveCompanyId != null
                ? { headers: { "x-company-id": String(effectiveCompanyId) } }
                : {},
        [effectiveCompanyId]
    );

    const fetchData = async () => {
        if (sessionStatus === "loading") return;
        const isGlobalAdmin = Boolean((session?.user as any)?.isGlobalAdmin);
        if (isGlobalAdmin && effectiveCompanyId == null) {
            setData([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const resp = await axios.get(endpoint, reqConfig);
            setData(resp.data);
        } catch (err) {
            console.error(err);
            toast.error(getAxiosErrorMessage(err, "Errore nel caricamento dei dati"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchData();
    }, [endpoint, effectiveCompanyId, sessionStatus, reqConfig]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const isCreate = !editingItem;
        const payload = buildPayload(formData, fields, isCreate);
        try {
            if (editingItem) {
                await axios.put(`${endpoint}/${editingItem.id}`, payload, reqConfig);
                toast.success("Elemento aggiornato");
            } else {
                await axios.post(endpoint, payload, reqConfig);
                toast.success("Elemento creato");
            }
            setShowModal(false);
            setEditingItem(null);
            setFormData({});
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error(getAxiosErrorMessage(err, "Errore nel salvataggio"));
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Sei sicuro di voler eliminare questo elemento?")) return;
        try {
            await axios.delete(`${endpoint}/${id}`, reqConfig);
            toast.success("Elemento eliminato");
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error(getAxiosErrorMessage(err, "Errore nell'eliminazione"));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Eliminare ${selectedIds.length} elementi selezionati?`)) return;
        setIsBulkDeleting(true);
        try {
            await axios.post(`${endpoint}/bulk`, { ids: selectedIds, action: "delete" }, reqConfig);
            toast.success(`${selectedIds.length} elementi eliminati`);
            setSelectedIds([]);
            fetchData();
        } catch (err: any) {
            toast.error(getAxiosErrorMessage(err, "Errore eliminazione massiva"));
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const filteredData = data.filter((item: any) =>
        Object.values(item).some(
            (val) => val && String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    return (
        <div className="p-8 space-y-8 bg-[#F4F5F7] min-h-screen">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
                    <p className="text-sm font-medium text-slate-400 mt-1 uppercase tracking-widest">Gestione anagrafica di sistema</p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <ClearableSearchInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Cerca..."
                        className="flex-1 md:w-80"
                        iconClassName="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                        inputClassName="w-full h-11 bg-white border border-slate-200 rounded-xl pl-12 text-sm focus:outline-none focus:ring-4 focus:ring-slate-900/5 transition-all"
                        paddingRightEmpty="pr-4"
                        paddingRightFilled="pr-10"
                    />
                    <button
                        onClick={() => {
                            setEditingItem(null);
                            setFormData({});
                            setShowModal(true);
                        }}
                        className="h-11 px-6 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10"
                    >
                        <Plus className="w-4 h-4" />
                        Nuovo
                    </button>
                    <button
                        onClick={fetchData}
                        className="h-11 w-11 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 transition-all"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-4 py-3 w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 w-3.5 h-3.5 cursor-pointer"
                                    checked={filteredData.length > 0 && selectedIds.length === filteredData.length}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedIds(filteredData.map((i: any) => i.id));
                                        else setSelectedIds([]);
                                    }}
                                />
                            </th>
                            {fields.map((f) => (
                                <th key={f.key} className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                    {f.label}
                                </th>
                            ))}
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading && data.length === 0 ? (
                            <tr>
                                <td colSpan={fields.length + 2} className="px-6 py-12 text-center text-slate-300">
                                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
                                    <p className="font-bold uppercase tracking-widest text-[10px]">Caricamento dati...</p>
                                </td>
                            </tr>
                        ) : filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={fields.length + 2} className="px-6 py-12 text-center text-slate-300">
                                    <p className="font-bold uppercase tracking-widest text-[10px]">Nessun risultato trovato</p>
                                </td>
                            </tr>
                        ) : (
                            filteredData.map((item) => (
                                <tr key={item.id} className={`hover:bg-slate-50/50 transition-all group ${selectedIds.includes(item.id) ? "bg-slate-50/80" : ""}`}>
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 w-3.5 h-3.5 cursor-pointer"
                                            checked={selectedIds.includes(item.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedIds([...selectedIds, item.id]);
                                                else setSelectedIds(selectedIds.filter((id) => id !== item.id));
                                            }}
                                        />
                                    </td>
                                    {fields.map((f) => (
                                        <td key={f.key} className="px-6 py-4 text-sm font-bold text-slate-600 max-w-[200px]">
                                            {f.type === "textarea" && item[f.key]
                                                ? (String(item[f.key]).slice(0, 60) + (String(item[f.key]).length > 60 ? "…" : ""))
                                                : (item[f.key] ?? "—")}
                                        </td>
                                    ))}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                            <button
                                                onClick={() => {
                                                    setEditingItem(item);
                                                    setFormData(item);
                                                    setShowModal(true);
                                                }}
                                                className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-xl z-[80] flex items-center gap-6 border border-white/10"
                    >
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                            {selectedIds.length} selezionati
                        </span>
                        <button
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                            className="flex items-center gap-2 text-red-400 hover:text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                            <Trash2 className={`w-4 h-4 ${isBulkDeleting ? "animate-spin" : ""}`} />
                            {isBulkDeleting ? "Eliminazione..." : "Elimina selezionati"}
                        </button>
                        <button
                            onClick={() => setSelectedIds([])}
                            className="px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase hover:bg-white/20"
                        >
                            Annulla
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {showModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                                    {editingItem ? 'Modifica Elemento' : 'Nuovo Elemento'}
                                </h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                    {title}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-900 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            {fields.map((f) => (
                                <div key={f.key} className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                        {f.label}
                                        {f.required !== false && f.type !== "textarea" ? " *" : ""}
                                    </label>
                                    {f.type === "textarea" ? (
                                        <textarea
                                            rows={5}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white transition-all resize-y min-h-[100px]"
                                            value={formData[f.key] ?? ""}
                                            onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                                            placeholder="Tono, stile e linee guida per i contenuti AI di questo brand…"
                                        />
                                    ) : (
                                        <input
                                            type={f.type === "number" ? "number" : "text"}
                                            step={f.type === "number" ? "any" : undefined}
                                            required={f.required !== false}
                                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-2xl px-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white transition-all"
                                            value={
                                                f.type === "number"
                                                    ? (formData[f.key] === 0 || formData[f.key] === "0"
                                                          ? formData[f.key]
                                                          : (formData[f.key] ?? ""))
                                                    : (formData[f.key] ?? "")
                                            }
                                            onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                                        />
                                    )}
                                </div>
                            ))}

                            <div className="pt-4 flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 h-12 bg-slate-50 text-slate-400 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all"
                                >
                                    Annulla
                                </button>
                                <button
                                    type="submit"
                                    className="flex-[2] h-12 bg-slate-900 text-white font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-lg shadow-slate-900/10"
                                >
                                    Salva Modifiche
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
