"use client";

import { useEffect, useMemo, useState } from "react";
import { useActivityContext } from "@/contexts/ActivityContext";
import { Filter, Bell, Loader2 } from "lucide-react";
import { ClearableSearchInput } from "@/components/ClearableSearchInput";

export default function ActivitiesPage() {
    const { activities, ongoingBulkSeoJobs, refreshActivities } = useActivityContext();
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<"all" | "completed" | "stopped" | "ongoing">("all");

    useEffect(() => {
        void refreshActivities();
        const id = setInterval(() => {
            void refreshActivities();
        }, 3000);
        return () => clearInterval(id);
    }, [refreshActivities]);

    const filteredHistory = useMemo(() => {
        const term = q.trim().toLowerCase();
        return activities.filter((a) => {
            if (status !== "all" && status !== "ongoing" && a.status !== status) return false;
            if (!term) return true;
            const blob = `${a.description} ${a.brand || ""} ${a.catalogue || ""} ${a.type}`.toLowerCase();
            return blob.includes(term);
        });
    }, [activities, q, status]);

    const filteredOngoing = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return ongoingBulkSeoJobs;
        return ongoingBulkSeoJobs.filter((j) => {
            const blob = `${j.brand || ""} ${j.catalogue || ""} ai_bulk_seo`.toLowerCase();
            return blob.includes(term);
        });
    }, [ongoingBulkSeoJobs, q]);

    const showHistoryBlock = status !== "ongoing";

    return (
        <div className="p-6 lg:p-10 max-w-6xl mx-auto">
            <div className="flex items-start gap-4 mb-8">
                <div className="p-3 rounded-2xl bg-slate-900 text-white shadow-lg">
                    <Bell className="w-7 h-7" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Attività</h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Job in corso con avanzamento percentuale; sotto lo storico (filtrabile) con stato,
                        descrizione, brand/catalogo e contatori.
                    </p>
                </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <ClearableSearchInput
                    value={q}
                    onChange={setQ}
                    placeholder="Cerca attività..."
                    className="w-full sm:w-72"
                    iconClassName="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                    inputClassName="w-full h-10 pl-9 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
                    paddingRightEmpty="pr-3"
                    paddingRightFilled="pr-10"
                />
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as typeof status)}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-widest text-slate-600"
                    >
                        <option value="all">Tutti</option>
                        <option value="ongoing">In corso</option>
                        <option value="completed">Completate</option>
                        <option value="stopped">Interrotte</option>
                    </select>
                </div>
            </div>

            <div className="mb-6">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    In corso
                </h2>
                {filteredOngoing.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center">
                        {status === "ongoing" ? (
                            <p className="text-sm font-medium text-slate-500">Nessuna attività in corso.</p>
                        ) : (
                            <p className="text-sm font-medium text-slate-500">
                                Nessun job SEO AI massivo attivo al momento.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredOngoing.map((j) => (
                            <div
                                key={`ongoing-${j.id}`}
                                className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 to-white shadow-sm p-4 sm:p-5"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {new Date(j.startedAt).toLocaleString("it-IT")}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                                        {j.status === "paused" ? (
                                            <>
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                In pausa
                                            </>
                                        ) : (
                                            <>
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                In esecuzione
                                            </>
                                        )}
                                    </span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        SEO AI massiva
                                    </span>
                                </div>
                                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <p className="text-lg font-black text-slate-900 tabular-nums">
                                            {j.progressPct}%
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            {j.done}/{j.total} elaborati
                                            {j.errors ? (
                                                <span className="text-amber-700 font-semibold">
                                                    {" "}
                                                    · {j.errors} errori
                                                </span>
                                            ) : null}
                                        </p>
                                    </div>
                                    <p className="text-[11px] text-slate-600">
                                        Brand: <span className="font-bold text-slate-800">{j.brand || "—"}</span> ·
                                        Catalogo:{" "}
                                        <span className="font-bold text-slate-800">{j.catalogue || "—"}</span>
                                    </p>
                                </div>
                                {j.currentProductId ? (
                                    <p className="text-[11px] text-slate-500 mt-2 truncate">
                                        Prodotto corrente: ID {j.currentProductId}
                                    </p>
                                ) : null}
                                <div className="mt-3 h-2.5 rounded-full bg-slate-200/80 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-indigo-600 transition-[width] duration-500 ease-out"
                                        style={{ width: `${j.progressPct}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showHistoryBlock && (
                <>
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">
                        Storico
                    </h2>
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="divide-y divide-slate-100">
                            {filteredHistory.length === 0 ? (
                                <p className="p-8 text-sm font-medium text-slate-500">
                                    Nessuna voce nello storico per i filtri selezionati.
                                </p>
                            ) : (
                                filteredHistory.map((a) => (
                                    <div key={a.id} className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                {new Date(a.at).toLocaleString("it-IT")}
                                            </span>
                                            <span
                                                className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                                    a.status === "completed"
                                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                        : "bg-amber-50 text-amber-700 border border-amber-200"
                                                }`}
                                            >
                                                {a.status === "completed" ? "Completata" : "Interrotta"}
                                            </span>
                                        </div>
                                        <p className="text-sm font-semibold text-slate-700 mt-2">{a.description}</p>
                                        <p className="text-[11px] text-slate-500 mt-1">
                                            Brand: <span className="font-bold text-slate-700">{a.brand || "—"}</span> ·
                                            Catalogo:{" "}
                                            <span className="font-bold text-slate-700">{a.catalogue || "—"}</span> ·
                                            Totale: <span className="font-bold text-slate-700">{a.total}</span> · Done:{" "}
                                            <span className="font-bold text-slate-700">{a.done}</span> · Errori:{" "}
                                            <span className="font-bold text-slate-700">{a.errors}</span>
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
