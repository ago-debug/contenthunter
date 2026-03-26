"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Settings as SettingsIcon, Database, Globe, Cpu, Save, Shield, RefreshCw, Key, Building2 } from "lucide-react";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import { useCompanyContext } from "@/contexts/CompanyContext";
import axios from "axios";

type IntegrationGet = {
    companyId: number;
    companyName: string;
    hasOpenaiKey: boolean;
    hasSerpapiKey: boolean;
    hasGeminiKey: boolean;
    wooDomain: string;
    wooConsumerKey: string;
    wooConsumerSecret: string;
};

export default function SettingsPage() {
    const [config, setConfig] = useState({
        openaiKey: "",
        serpapiKey: "",
        geminiKey: "",
        wooDomain: "",
        wooKey: "",
        wooSecret: "",
    });
    const [flags, setFlags] = useState({
        hasOpenaiKey: false,
        hasSerpapiKey: false,
        hasGeminiKey: false,
    });
    const [companyLabel, setCompanyLabel] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    const { data: session, status: sessionStatus } = useSession();
    const companyContext = useCompanyContext();
    const effectiveCompanyId =
        (session?.user as any)?.companyId ?? companyContext?.selectedCompanyId ?? null;

    const companyReq = useMemo(
        () =>
            effectiveCompanyId != null
                ? { headers: { "x-company-id": String(effectiveCompanyId) } }
                : {},
        [effectiveCompanyId]
    );

    const wooStorageKey = effectiveCompanyId != null
        ? `pim_woo_config_${effectiveCompanyId}`
        : "pim_woo_config_all";

    const load = async () => {
        if (sessionStatus === "loading") return;
        const isGlobalAdmin = Boolean((session?.user as any)?.isGlobalAdmin);
        if (isGlobalAdmin && effectiveCompanyId == null) {
            setLoading(false);
            setCompanyLabel(null);
            return;
        }
        if (effectiveCompanyId == null) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data } = await axios.get<IntegrationGet>("/api/company/integration-settings", companyReq);
            setCompanyLabel(data.companyName);
            setFlags({
                hasOpenaiKey: data.hasOpenaiKey,
                hasSerpapiKey: data.hasSerpapiKey,
                hasGeminiKey: data.hasGeminiKey,
            });
            setConfig((prev) => ({
                ...prev,
                openaiKey: "",
                serpapiKey: "",
                geminiKey: "",
                wooDomain: data.wooDomain || "",
                wooKey: data.wooConsumerKey || "",
                wooSecret: data.wooConsumerSecret || "",
            }));
            try {
                localStorage.setItem(
                    wooStorageKey,
                    JSON.stringify({
                        domain: data.wooDomain || "",
                        key: data.wooConsumerKey || "",
                        secret: data.wooConsumerSecret || "",
                    })
                );
            } catch {
                /* ignore */
            }
        } catch (e: any) {
            console.error(e);
            toast.error(e?.response?.data?.error || "Impossibile caricare le impostazioni azienda.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [effectiveCompanyId, sessionStatus, companyReq]);

    const handleSave = async () => {
        if (effectiveCompanyId == null) {
            toast.error("Seleziona un’azienda dal menu in alto (admin globale).");
            return;
        }
        setIsSaving(true);
        try {
            const payload: Record<string, string> = {};
            if (config.openaiKey.trim()) payload.openaiKey = config.openaiKey.trim();
            if (config.serpapiKey.trim()) payload.serpapiKey = config.serpapiKey.trim();
            if (config.geminiKey.trim()) payload.geminiKey = config.geminiKey.trim();
            payload.wooDomain = config.wooDomain.trim();
            payload.wooConsumerKey = config.wooKey.trim();
            payload.wooConsumerSecret = config.wooSecret.trim();

            await axios.patch("/api/company/integration-settings", payload, companyReq);

            try {
                localStorage.setItem(
                    wooStorageKey,
                    JSON.stringify({
                        domain: config.wooDomain,
                        key: config.wooKey,
                        secret: config.wooSecret,
                    })
                );
            } catch {
                /* ignore */
            }

            setConfig((c) => ({ ...c, openaiKey: "", serpapiKey: "", geminiKey: "" }));
            await load();
            toast.success("Configurazioni azienda aggiornate.");
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "Errore salvataggio.");
        } finally {
            setIsSaving(false);
        }
    };

    const clearKey = async (field: "openaiKey" | "serpapiKey" | "geminiKey") => {
        if (effectiveCompanyId == null) return;
        if (!window.confirm("Rimuovere questa chiave salvata per l’azienda?")) return;
        try {
            await axios.patch(
                "/api/company/integration-settings",
                { [field]: null },
                companyReq
            );
            await load();
            toast.success("Chiave rimossa.");
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "Errore.");
        }
    };

    if (sessionStatus === "loading" || loading) {
        return (
            <div className="p-12 flex items-center justify-center min-h-[40vh]">
                <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        );
    }

    if (effectiveCompanyId == null) {
        return (
            <div className="p-12 max-w-2xl mx-auto">
                <p className="text-slate-600 font-bold">
                    Seleziona un’azienda dal menu in alto per configurare OpenAI, SerpAPI, Gemini e WooCommerce per quell’azienda.
                </p>
            </div>
        );
    }

    return (
        <div className="p-12 space-y-12 max-w-5xl mx-auto animate-in fade-in duration-500">
            <header className="space-y-2">
                <div className="flex items-center gap-4 text-blue-600 mb-2">
                    <div className="p-3 bg-blue-50 rounded-2xl">
                        <SettingsIcon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Integrazioni per azienda</span>
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Impostazioni integrazioni</h1>
                <div className="flex flex-wrap items-center gap-3 text-slate-500 font-bold max-w-2xl">
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span>
                        Azienda: <span className="text-slate-900">{companyLabel ?? `ID ${effectiveCompanyId}`}</span>
                    </span>
                </div>
                <p className="text-slate-500 font-bold max-w-2xl">
                    Ogni azienda ha le proprie chiavi API e credenziali WooCommerce. Se un campo è vuoto nel salvataggio, le chiavi
                    segrete (OpenAI / SerpAPI / Gemini) non vengono sovrascritte; usa &quot;Rimuovi&quot; per cancellarle dal database.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-purple-50 text-purple-600 rounded-[1.5rem]">
                            <Cpu className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900">AI Intelligence</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">
                                OpenAI · SerpAPI · Gemini
                            </p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex items-center justify-between ml-1 mb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    OpenAI API Key
                                </label>
                                {flags.hasOpenaiKey && (
                                    <button
                                        type="button"
                                        onClick={() => void clearKey("openaiKey")}
                                        className="text-[9px] font-black uppercase text-red-500 hover:text-red-700"
                                    >
                                        Rimuovi
                                    </button>
                                )}
                            </div>
                            <div className="relative group">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                <input
                                    type="password"
                                    value={config.openaiKey}
                                    onChange={(e) => setConfig({ ...config, openaiKey: e.target.value })}
                                    placeholder={flags.hasOpenaiKey ? "•••• chiave salvata — incolla per sostituire" : "sk-…"}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-purple-50 focus:bg-white transition-all font-mono"
                                />
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-2 ml-1">
                                <span className="font-bold text-slate-600">Modello per testi prodotto (descrizioni SEO):</span> non si
                                configura qui. Sul server imposta la variabile d&apos;ambiente{" "}
                                <code className="font-mono text-[10px] text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                                    OPENAI_CHAT_MODEL
                                </code>{" "}
                                (default <code className="font-mono text-[10px]">gpt-4o-mini</code>, già il più rapido ed economico tra i
                                modelli consigliati). Esempio in <code className="font-mono text-[10px]">.env</code>:{" "}
                                <code className="font-mono text-[10px]">OPENAI_CHAT_MODEL=gpt-4o-mini</code>.
                            </p>
                        </div>
                        <div>
                            <div className="flex items-center justify-between ml-1 mb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    SerpAPI Key (ricerca web)
                                </label>
                                {flags.hasSerpapiKey && (
                                    <button
                                        type="button"
                                        onClick={() => void clearKey("serpapiKey")}
                                        className="text-[9px] font-black uppercase text-red-500 hover:text-red-700"
                                    >
                                        Rimuovi
                                    </button>
                                )}
                            </div>
                            <div className="relative group">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                <input
                                    type="password"
                                    value={config.serpapiKey}
                                    onChange={(e) => setConfig({ ...config, serpapiKey: e.target.value })}
                                    placeholder={flags.hasSerpapiKey ? "•••• chiave salvata — incolla per sostituire" : "SerpAPI…"}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:bg-white transition-all font-mono"
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between ml-1 mb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Google Gemini API Key (PDF / estrazione)
                                </label>
                                {flags.hasGeminiKey && (
                                    <button
                                        type="button"
                                        onClick={() => void clearKey("geminiKey")}
                                        className="text-[9px] font-black uppercase text-red-500 hover:text-red-700"
                                    >
                                        Rimuovi
                                    </button>
                                )}
                            </div>
                            <div className="relative group">
                                <Database className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                <input
                                    type="password"
                                    value={config.geminiKey}
                                    onChange={(e) => setConfig({ ...config, geminiKey: e.target.value })}
                                    placeholder={flags.hasGeminiKey ? "•••• chiave salvata — incolla per sostituire" : "AIza…"}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:bg-white transition-all font-mono"
                                />
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-2 ml-1">
                                Incolla <span className="font-bold text-slate-600">solo la chiave</span> (inizia con{" "}
                                <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">AIza</code>
                                ), non l&apos;URL dell&apos;API. L&apos;endpoint ufficiale (
                                <code className="font-mono text-[10px]">generativelanguage.googleapis.com/v1beta</code>
                                ) è già usato dall&apos;SDK; non va configurato qui.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-[1.5rem]">
                            <Globe className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900">WooCommerce Sync</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">
                                REST API (per questa azienda)
                            </p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                Store domain
                            </label>
                            <input
                                value={config.wooDomain}
                                onChange={(e) => setConfig({ ...config, wooDomain: e.target.value })}
                                placeholder="https://tuosito.it"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:bg-white transition-all font-bold text-slate-900"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                    Consumer Key
                                </label>
                                <input
                                    type="password"
                                    value={config.wooKey}
                                    onChange={(e) => setConfig({ ...config, wooKey: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:bg-white transition-all font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                    Consumer Secret
                                </label>
                                <input
                                    type="password"
                                    value={config.wooSecret}
                                    onChange={(e) => setConfig({ ...config, wooSecret: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:bg-white transition-all font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <div className="bg-slate-900 p-12 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-10">
                    <Shield className="w-48 h-48 rotate-12" />
                </div>
                <div className="relative z-10">
                    <h3 className="text-2xl font-black tracking-tight">Salva per questa azienda</h3>
                    <p className="text-slate-400 font-bold mt-2">
                        Le chiavi sono memorizzate nel database per l’azienda selezionata. Fallback: variabili ambiente sul server
                        (OPENAI_API_KEY, SERPAPI_KEY, GEMINI_API_KEY) se non impostate qui.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="relative z-10 px-12 py-5 bg-blue-600 rounded-[2rem] font-black uppercase tracking-widest text-xs hover:bg-white hover:text-slate-900 transition-all shadow-2xl disabled:opacity-50 flex items-center gap-3"
                >
                    {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Salva configurazioni
                </button>
            </div>
        </div>
    );
}
