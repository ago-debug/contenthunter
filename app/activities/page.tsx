"use client";

import { useMemo, useState } from "react";
import { useActivityContext } from "@/contexts/ActivityContext";
import { Filter, Bell, Search } from "lucide-react";

export default function ActivitiesPage() {
    const { activities } = useActivityContext();
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<"all" | "completed" | "stopped">("all");

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        return activities.filter((a) => {
            if (status !== "all" && a.status !== status) return false;
            if (!term) return true;
            const blob = `${a.description} ${a.brand || ""} ${a.catalogue || ""} ${a.type}`.toLowerCase();
            return blob.includes(term);
        });
    }, [activities, q, status]);

    return (
        <div className="p-6 lg:p-10 max-w-6xl mx-auto">
            <div className="flex items-start gap-4 mb-8">
                <div className="p-3 rounded-2xl bg-slate-900 text-white shadow-lg">
                    <Bell className="w-7 h-7" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Attività</h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Storico operazioni (filtrabile): stato, descrizione, brand/catalogo e contatori.
                    </p>
                </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Cerca attività..."
                        className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-widest text-slate-600"
                    >
                        <option value="all">Tutti</option>
                        <option value="completed">Completate</option>
                        <option value="stopped">Interrotte</option>
                    </select>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100">
                    {filtered.length === 0 ? (
                        <p className="p-8 text-sm font-medium text-slate-500">Nessuna attività trovata.</p>
                    ) : (
                        filtered.map((a) => (
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
                                    Catalogo: <span className="font-bold text-slate-700">{a.catalogue || "—"}</span> ·
                                    Totale: <span className="font-bold text-slate-700">{a.total}</span> ·
                                    Done: <span className="font-bold text-slate-700">{a.done}</span> ·
                                    Errori: <span className="font-bold text-slate-700">{a.errors}</span>
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

