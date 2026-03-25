"use client";

import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Bell, Download, X } from "lucide-react";
import { toast } from "react-toastify";

type AiBulkRow = {
    productId: number;
    sku: string;
    title: string;
    outcome: "ok" | "error";
    message: string;
};

type AiBulkJob = {
    running: boolean;
    paused: boolean;
    overwriteExisting: boolean;
    total: number;
    done: number;
    errors: number;
    currentProductId?: number;
    startedAt: string;
    brand?: string;
    companyId: number;
};

type AiBulkReport = {
    at: string;
    overwriteExisting: boolean;
    total: number;
    done: number;
    errors: number;
    rows: AiBulkRow[];
};

type ActivityEntry = {
    id: string;
    type: "ai_bulk_seo";
    status: "completed" | "stopped";
    at: string;
    description: string;
    brand?: string;
    catalogue?: string;
    companyId: number;
    total: number;
    done: number;
    errors: number;
};

type ActivityNotification = {
    id: string;
    at: string;
    title: string;
    message: string;
    read: boolean;
};

type StartAiBulkSeoInput = {
    products: any[];
    overwriteExisting: boolean;
    companyId: number;
    brand?: string;
    catalogue?: string;
    onCompleted?: () => void;
};

type ActivityContextValue = {
    aiBulkJob: AiBulkJob | null;
    aiBulkReport: AiBulkReport | null;
    showAiBulkReport: boolean;
    setShowAiBulkReport: (v: boolean) => void;
    activities: ActivityEntry[];
    notifications: ActivityNotification[];
    unreadNotifications: number;
    startAiBulkSeoJob: (input: StartAiBulkSeoInput) => Promise<void>;
    toggleAiBulkPause: () => void;
    stopAiBulkJob: () => void;
    markAllNotificationsRead: () => void;
};

const ACTIVITY_KEY = "contenthunter_activities_v1";
const NOTIF_KEY = "contenthunter_notifications_v1";

const ActivityContext = createContext<ActivityContextValue | null>(null);

function parseAiBlocks(txt: string) {
    const shortMatch = txt.match(/---SHORT_DESCRIPTION---([\s\S]*?)(---|$)/);
    const descMatch = txt.match(/---DESCRIPTION---([\s\S]*?)(---|$)/);
    const bulletMatch = txt.match(/---BULLET_POINTS---([\s\S]*?)(---|$)/);
    return {
        short: shortMatch ? shortMatch[1].trim() : "",
        desc: descMatch ? descMatch[1].trim() : "",
        bullets: bulletMatch ? bulletMatch[1].trim() : "",
    };
}

function readLocal<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
    const [aiBulkJob, setAiBulkJob] = useState<AiBulkJob | null>(null);
    const [aiBulkReport, setAiBulkReport] = useState<AiBulkReport | null>(null);
    const [showAiBulkReport, setShowAiBulkReport] = useState(false);
    const [activities, setActivities] = useState<ActivityEntry[]>(() =>
        typeof window === "undefined" ? [] : readLocal<ActivityEntry[]>(ACTIVITY_KEY, [])
    );
    const [notifications, setNotifications] = useState<ActivityNotification[]>(() =>
        typeof window === "undefined" ? [] : readLocal<ActivityNotification[]>(NOTIF_KEY, [])
    );

    const queueRef = useRef<any[]>([]);
    const stopRef = useRef(false);
    const rowsRef = useRef<AiBulkRow[]>([]);

    const persistActivities = (next: ActivityEntry[]) => {
        setActivities(next);
        try {
            localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
        } catch {
            /* ignore */
        }
    };
    const persistNotifications = (next: ActivityNotification[]) => {
        setNotifications(next);
        try {
            localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
        } catch {
            /* ignore */
        }
    };

    const appendActivity = (entry: ActivityEntry) => {
        const next = [entry, ...activities].slice(0, 500);
        persistActivities(next);
    };
    const appendNotification = (title: string, message: string) => {
        const n: ActivityNotification = {
            id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            at: new Date().toISOString(),
            title,
            message,
            read: false,
        };
        const next = [n, ...notifications].slice(0, 200);
        persistNotifications(next);
        toast.success(`${title}: ${message}`);
    };

    const toggleAiBulkPause = () => {
        setAiBulkJob((prev) => (prev ? { ...prev, paused: !prev.paused } : prev));
    };
    const stopAiBulkJob = () => {
        stopRef.current = true;
        setAiBulkJob((prev) => (prev ? { ...prev, running: false, paused: false } : prev));
    };

    const startAiBulkSeoJob = async (input: StartAiBulkSeoInput) => {
        if (aiBulkJob?.running) {
            toast.info("C'è già un job AI in esecuzione.");
            return;
        }
        const { products, overwriteExisting, companyId, brand, catalogue, onCompleted } = input;
        if (!products.length) return;

        stopRef.current = false;
        queueRef.current = [...products];
        rowsRef.current = [];
        setAiBulkReport(null);
        setAiBulkJob({
            running: true,
            paused: false,
            overwriteExisting,
            total: products.length,
            done: 0,
            errors: 0,
            startedAt: new Date().toISOString(),
            brand,
            companyId,
        });

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const lang = "it";

        const runLoop = async () => {
            while (queueRef.current.length > 0) {
                if (stopRef.current) break;

                const paused = ((): boolean => {
                    let isPaused = false;
                    setAiBulkJob((prev) => {
                        isPaused = !!prev?.paused;
                        return prev;
                    });
                    return isPaused;
                })();
                if (paused) {
                    await sleep(350);
                    continue;
                }

                const product = queueRef.current.shift();
                if (!product) break;

                setAiBulkJob((prev) => (prev ? { ...prev, currentProductId: product.id } : prev));

                try {
                    const { images, extraFields, docDescription, ...cleanProductData } = product;
                    const res = await fetch("/api/ai/describe", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-company-id": String(companyId),
                        },
                        credentials: "include",
                        body: JSON.stringify({
                            productData: {
                                ...cleanProductData,
                                docDescription: docDescription?.substring(0, 2000) || "",
                                extraFieldsPreview: extraFields
                                    ? Object.entries(extraFields)
                                          .map(([k, v]) => `${k}: ${v}`)
                                          .join(", ")
                                          .substring(0, 1000)
                                    : "",
                            },
                            language: lang,
                            options: { respectExisting: !overwriteExisting, useExistingAsModel: true },
                        }),
                    });
                    if (!res.ok) {
                        const t = await res.text().catch(() => "");
                        throw new Error(t || "AI describe failed");
                    }

                    const txt = await res.text();
                    const blocks = parseAiBlocks(txt);
                    const existing = product.translations?.[lang] || {};
                    const payload = {
                        ...product,
                        translations: {
                            ...product.translations,
                            [lang]: {
                                ...existing,
                                seoAiText:
                                    overwriteExisting || !existing.seoAiText
                                        ? blocks.short || existing.seoAiText
                                        : existing.seoAiText,
                                description:
                                    overwriteExisting || !existing.description
                                        ? blocks.desc || existing.description
                                        : existing.description,
                                bulletPoints:
                                    overwriteExisting || !existing.bulletPoints
                                        ? blocks.bullets || existing.bulletPoints
                                        : existing.bulletPoints,
                            },
                        },
                    };
                    await axios.post("/api/products", payload, {
                        headers: { "x-company-id": String(companyId) },
                    });

                    rowsRef.current.push({
                        productId: product.id,
                        sku: String(product.sku || ""),
                        title: String(product.title || product.translations?.[lang]?.title || ""),
                        outcome: "ok",
                        message: "",
                    });
                    setAiBulkJob((prev) =>
                        prev ? { ...prev, done: prev.done + 1, currentProductId: product.id } : prev
                    );
                } catch (e: any) {
                    const msg =
                        e?.response?.data?.details || e?.response?.data?.error || e?.message || "Errore sconosciuto";
                    rowsRef.current.push({
                        productId: product.id,
                        sku: String(product.sku || ""),
                        title: String(product.title || product.translations?.[lang]?.title || ""),
                        outcome: "error",
                        message: String(msg).slice(0, 2000),
                    });
                    setAiBulkJob((prev) =>
                        prev
                            ? { ...prev, done: prev.done + 1, errors: prev.errors + 1, currentProductId: product.id }
                            : prev
                    );
                }

                await sleep(220);
            }

            const endedAt = new Date().toISOString();
            const errorCount = rowsRef.current.filter((r) => r.outcome === "error").length;
            const finalDone = rowsRef.current.length;
            const finalTotal = products.length;
            const stopped = stopRef.current;

            setAiBulkJob((prev) => (prev ? { ...prev, running: false, paused: false, currentProductId: undefined } : prev));
            const report: AiBulkReport = {
                at: endedAt,
                overwriteExisting,
                total: finalTotal,
                done: finalDone,
                errors: errorCount,
                rows: rowsRef.current,
            };
            setAiBulkReport(report);

            const activity: ActivityEntry = {
                id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: "ai_bulk_seo",
                status: stopped ? "stopped" : "completed",
                at: endedAt,
                description: stopped
                    ? "Generazione SEO AI massiva interrotta"
                    : "Generazione SEO AI massiva completata",
                brand,
                catalogue,
                companyId,
                total: finalTotal,
                done: finalDone,
                errors: errorCount,
            };
            appendActivity(activity);
            appendNotification(
                stopped ? "Attività interrotta" : "Attività completata",
                `${activity.description} (${finalDone}/${finalTotal}, errori: ${errorCount})`
            );
            onCompleted?.();
        };

        void runLoop();
    };

    const markAllNotificationsRead = () => {
        const next = notifications.map((n) => ({ ...n, read: true }));
        persistNotifications(next);
    };

    const unreadNotifications = notifications.filter((n) => !n.read).length;

    const value = useMemo<ActivityContextValue>(
        () => ({
            aiBulkJob,
            aiBulkReport,
            showAiBulkReport,
            setShowAiBulkReport,
            activities,
            notifications,
            unreadNotifications,
            startAiBulkSeoJob,
            toggleAiBulkPause,
            stopAiBulkJob,
            markAllNotificationsRead,
        }),
        [aiBulkJob, aiBulkReport, showAiBulkReport, activities, notifications, unreadNotifications]
    );

    return (
        <ActivityContext.Provider value={value}>
            {children}
            {aiBulkJob && (
                <div className="fixed bottom-4 right-4 z-[200] bg-white border border-slate-200 shadow-xl rounded-2xl p-4 w-[320px]">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                AI massiva in background
                            </p>
                            <p className="text-sm font-black text-slate-900 mt-1">
                                {aiBulkJob.done}/{aiBulkJob.total}
                                {aiBulkJob.errors ? <span className="text-amber-700"> ({aiBulkJob.errors} errori)</span> : null}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1 truncate">
                                {aiBulkJob.currentProductId ? `In corso su ID: ${aiBulkJob.currentProductId}` : "In attesa..."}
                            </p>
                            <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                    className="h-full bg-indigo-600"
                                    style={{
                                        width:
                                            aiBulkJob.total > 0
                                                ? `${Math.round((aiBulkJob.done / aiBulkJob.total) * 100)}%`
                                                : "0%",
                                    }}
                                />
                            </div>
                        </div>
                        {!aiBulkJob.running ? <Bell className="w-4 h-4 text-slate-400" /> : null}
                    </div>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={toggleAiBulkPause}
                            disabled={!aiBulkJob.running}
                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-40"
                        >
                            {aiBulkJob.paused ? "Riprendi" : "Pausa"}
                        </button>
                        <button
                            type="button"
                            onClick={stopAiBulkJob}
                            disabled={!aiBulkJob.running}
                            className="flex-1 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-widest hover:bg-red-100 disabled:opacity-40"
                        >
                            Stop
                        </button>
                    </div>
                    {aiBulkReport && !aiBulkJob.running && (
                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowAiBulkReport(true)}
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
                            >
                                Visualizza report
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const header = ["product_id", "sku", "title", "outcome", "message"];
                                    const lines = aiBulkReport.rows.map((r) =>
                                        [r.productId, r.sku, r.title, r.outcome, r.message]
                                            .map((v) => {
                                                const s = String(v ?? "");
                                                return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                                            })
                                            .join(",")
                                    );
                                    const csv = [header.join(","), ...lines].join("\r\n");
                                    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `ai_bulk_report_${new Date(aiBulkReport.at).toISOString().slice(0, 19).replace(/[:.]/g, "-")}.csv`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black"
                            >
                                <Download className="w-3.5 h-3.5 inline mr-1" />
                                CSV
                            </button>
                        </div>
                    )}
                </div>
            )}
            {showAiBulkReport && aiBulkReport && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAiBulkReport(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-5 max-w-4xl w-full border border-gray-100 max-h-[90vh] overflow-hidden">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Report generazione AI massiva</h3>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {new Date(aiBulkReport.at).toLocaleString("it-IT")} · Totale {aiBulkReport.total} · Errori {aiBulkReport.errors}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAiBulkReport(false)}
                                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
                                title="Chiudi"
                            >
                                <X className="w-4 h-4 text-slate-700" />
                            </button>
                        </div>
                        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden max-h-[70vh] overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">ID</th>
                                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">SKU</th>
                                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Titolo</th>
                                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Esito</th>
                                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Messaggio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {aiBulkReport.rows.map((r) => (
                                        <tr key={`ai-rep-${r.productId}-${r.outcome}`}>
                                            <td className="px-3 py-2 text-[11px] font-mono text-slate-700">{r.productId}</td>
                                            <td className="px-3 py-2 text-[11px] font-mono text-slate-900">{r.sku}</td>
                                            <td className="px-3 py-2 text-[11px] text-slate-700 max-w-[360px] truncate">{r.title}</td>
                                            <td className="px-3 py-2 text-[11px] font-black">
                                                {r.outcome === "ok" ? (
                                                    <span className="text-emerald-700">OK</span>
                                                ) : (
                                                    <span className="text-amber-800">ERRORE</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-[11px] text-slate-600 max-w-[520px] truncate">{r.message || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </ActivityContext.Provider>
    );
}

export function useActivityContext() {
    const ctx = useContext(ActivityContext);
    if (!ctx) throw new Error("useActivityContext must be used within ActivityProvider");
    return ctx;
}

