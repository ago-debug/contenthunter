"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    Settings as SettingsIcon,
    Database,
    Globe,
    Cpu,
    Save,
    Shield,
    RefreshCw,
    Key,
    Building2,
    Sparkles,
    Copy,
} from "lucide-react";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import { useCompanyContext } from "@/contexts/CompanyContext";
import axios from "axios";
import { useAppDialogs } from "@/components/AppDialogsProvider";

type IntegrationGet = {
    companyId: number;
    companyName: string;
    hasOpenaiKey: boolean;
    hasSerpapiKey: boolean;
    hasGeminiKey: boolean;
    hasShopperEmbedToken: boolean;
    wooDomain: string;
    wooConsumerKey: string;
    wooConsumerSecret: string;
    prestaShopUrl: string;
    prestaShopApiKey: string;
    prestaShopDefaultCategoryId: number | null;
    prestaShopLanguageId: number | null;
    prestaShopIdShop: number | null;
    prestaShopTaxRulesGroupId: number | null;
};

export default function SettingsPage() {
    const { confirm: appConfirm } = useAppDialogs();
    const [config, setConfig] = useState({
        openaiKey: "",
        serpapiKey: "",
        geminiKey: "",
        wooDomain: "",
        wooKey: "",
        wooSecret: "",
        prestaShopUrl: "",
        prestaApiKey: "",
        prestaDefaultCategoryId: "",
        prestaLanguageId: "",
        prestaIdShop: "",
        prestaTaxRulesGroupId: "",
    });
    const [flags, setFlags] = useState({
        hasOpenaiKey: false,
        hasSerpapiKey: false,
        hasGeminiKey: false,
        hasShopperEmbedToken: false,
    });
    const [embedBusy, setEmbedBusy] = useState(false);
    const [embedTokenReveal, setEmbedTokenReveal] = useState<string | null>(null);
    const [publicOrigin, setPublicOrigin] = useState("");
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

    const isGlobalAdminUser = Boolean((session?.user as any)?.isGlobalAdmin);

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
                hasShopperEmbedToken: data.hasShopperEmbedToken ?? false,
            });
            setEmbedTokenReveal(null);
            setConfig((prev) => ({
                ...prev,
                openaiKey: "",
                serpapiKey: "",
                geminiKey: "",
                wooDomain: data.wooDomain || "",
                wooKey: data.wooConsumerKey || "",
                wooSecret: data.wooConsumerSecret || "",
                prestaShopUrl: data.prestaShopUrl || "",
                prestaApiKey: data.prestaShopApiKey || "",
                prestaDefaultCategoryId:
                    data.prestaShopDefaultCategoryId != null ? String(data.prestaShopDefaultCategoryId) : "",
                prestaLanguageId: data.prestaShopLanguageId != null ? String(data.prestaShopLanguageId) : "",
                prestaIdShop: data.prestaShopIdShop != null ? String(data.prestaShopIdShop) : "",
                prestaTaxRulesGroupId:
                    data.prestaShopTaxRulesGroupId != null ? String(data.prestaShopTaxRulesGroupId) : "",
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
            try {
                localStorage.setItem(
                    `pim_ps_config_${effectiveCompanyId}`,
                    JSON.stringify({
                        shopUrl: data.prestaShopUrl || "",
                        apiKey: data.prestaShopApiKey || "",
                        defaultCategoryId: data.prestaShopDefaultCategoryId ?? "",
                        languageId: data.prestaShopLanguageId ?? "",
                        idShop: data.prestaShopIdShop ?? "",
                        taxRulesGroupId: data.prestaShopTaxRulesGroupId ?? "",
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

    useEffect(() => {
        if (typeof window !== "undefined") setPublicOrigin(window.location.origin);
    }, []);

    const handleSave = async () => {
        if (effectiveCompanyId == null) {
            toast.error("Seleziona un’azienda dal menu in alto (admin globale).");
            return;
        }
        setIsSaving(true);
        try {
            const payload: Record<string, string | number | null> = {};
            if (config.openaiKey.trim()) payload.openaiKey = config.openaiKey.trim();
            if (config.serpapiKey.trim()) payload.serpapiKey = config.serpapiKey.trim();
            if (config.geminiKey.trim()) payload.geminiKey = config.geminiKey.trim();
            payload.wooDomain = config.wooDomain.trim();
            payload.wooConsumerKey = config.wooKey.trim();
            payload.wooConsumerSecret = config.wooSecret.trim();
            payload.prestaShopUrl = config.prestaShopUrl.trim();
            payload.prestaShopApiKey = config.prestaApiKey.trim();
            const dc = config.prestaDefaultCategoryId.trim();
            payload.prestaShopDefaultCategoryId = dc ? parseInt(dc, 10) : null;
            if (dc && Number.isNaN(payload.prestaShopDefaultCategoryId)) {
                toast.error("ID categoria PrestaShop non valido.");
                setIsSaving(false);
                return;
            }
            const li = config.prestaLanguageId.trim();
            payload.prestaShopLanguageId = li ? parseInt(li, 10) : null;
            if (li && Number.isNaN(payload.prestaShopLanguageId)) {
                toast.error("ID lingua PrestaShop non valido.");
                setIsSaving(false);
                return;
            }
            const sid = config.prestaIdShop.trim();
            payload.prestaShopIdShop = sid ? parseInt(sid, 10) : null;
            if (sid && Number.isNaN(payload.prestaShopIdShop)) {
                toast.error("ID negozio multistore non valido.");
                setIsSaving(false);
                return;
            }
            const tg = config.prestaTaxRulesGroupId.trim();
            payload.prestaShopTaxRulesGroupId = tg ? parseInt(tg, 10) : null;
            if (tg && Number.isNaN(payload.prestaShopTaxRulesGroupId)) {
                toast.error("ID gruppo tasse PrestaShop non valido.");
                setIsSaving(false);
                return;
            }

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
            try {
                localStorage.setItem(
                    `pim_ps_config_${effectiveCompanyId}`,
                    JSON.stringify({
                        shopUrl: config.prestaShopUrl.trim(),
                        apiKey: config.prestaApiKey.trim(),
                        defaultCategoryId: config.prestaDefaultCategoryId.trim(),
                        languageId: config.prestaLanguageId.trim(),
                        idShop: config.prestaIdShop.trim(),
                        taxRulesGroupId: config.prestaTaxRulesGroupId.trim(),
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

    const iframeSnippetFull = useMemo(() => {
        const tok = embedTokenReveal?.trim();
        if (!publicOrigin || !tok) return "";
        const u = `${publicOrigin}/embed/personal-shopper?token=${encodeURIComponent(tok)}`;
        return `<iframe src="${u}" title="Personal Shopper" width="100%" height="560" style="border:0;border-radius:1rem;max-width:420px" loading="lazy"></iframe>`;
    }, [publicOrigin, embedTokenReveal]);

    /** Widget tipo chatbot: pannello ancorato in basso nell&apos;iframe (&amp;float=1); incolla il div in Woo con position:fixed */
    const iframeSnippetCorner = useMemo(() => {
        const tok = embedTokenReveal?.trim();
        if (!publicOrigin || !tok) return "";
        const src = `${publicOrigin}/embed/personal-shopper?token=${encodeURIComponent(tok)}&float=1`;
        return `<!-- Personal Shopper: angolo basso-destra (simile a live chat). corner=left per sinistra -->
<div style="position:fixed;bottom:16px;right:16px;width:min(400px,calc(100vw - 24px));height:min(560px,calc(100vh - 32px));z-index:2147483647;margin:0;padding:0;border:none;border-radius:1rem;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.18);">
  <iframe src="${src}" title="Personal Shopper" width="100%" height="100%" style="border:0;display:block;" loading="lazy"></iframe>
</div>`;
    }, [publicOrigin, embedTokenReveal]);

    const copyText = async (label: string, text: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copiato negli appunti.`);
        } catch {
            toast.error("Impossibile copiare (permessi browser).");
        }
    };

    const regenerateShopperToken = async () => {
        if (effectiveCompanyId == null) return;
        setEmbedBusy(true);
        try {
            const { data } = await axios.post<{ token: string; message?: string }>(
                "/api/company/shopper-embed-token",
                {},
                companyReq
            );
            setEmbedTokenReveal(data.token);
            setFlags((f) => ({ ...f, hasShopperEmbedToken: true }));
            toast.success(data.message || "Token generato. Copialo subito: non sarà più mostrato.");
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "Errore generazione token.");
        } finally {
            setEmbedBusy(false);
        }
    };

    const revokeShopperToken = async () => {
        if (effectiveCompanyId == null) return;
        if (!(await appConfirm("Disattivare il widget sul negozio? Dovrai generare un nuovo token per riattivarlo."))) return;
        setEmbedBusy(true);
        try {
            await axios.delete("/api/company/shopper-embed-token", companyReq);
            setEmbedTokenReveal(null);
            setFlags((f) => ({ ...f, hasShopperEmbedToken: false }));
            toast.success("Widget disattivato.");
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "Errore.");
        } finally {
            setEmbedBusy(false);
        }
    };

    const clearKey = async (field: "openaiKey" | "serpapiKey" | "geminiKey") => {
        if (effectiveCompanyId == null) return;
        if (!(await appConfirm("Rimuovere questa chiave salvata per l’azienda?"))) return;
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
                    {isGlobalAdminUser ? (
                        <>
                            Seleziona un’azienda dal menu in alto per configurare OpenAI, SerpAPI, Gemini, WooCommerce e PrestaShop per
                            quell’azienda.
                        </>
                    ) : (
                        <>Seleziona un’azienda dal menu in alto per aprire le integrazioni e i collegamenti al negozio.</>
                    )}
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
                    {isGlobalAdminUser ? (
                        <>
                            Ogni azienda ha le proprie chiavi API, WooCommerce e PrestaShop. Se un campo è vuoto nel salvataggio, le
                            chiavi segrete (OpenAI / SerpAPI / Gemini) non vengono sovrascritte; usa &quot;Rimuovi&quot; per cancellarle dal
                            database.
                        </>
                    ) : (
                        <>
                            Ogni azienda ha le proprie chiavi e collegamenti. Se lasci vuoto un campo al salvataggio, le chiavi già
                            presenti non vengono sostituite; usa &quot;Rimuovi&quot; per eliminare una chiave salvata.
                        </>
                    )}
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
                                {isGlobalAdminUser ? "OpenAI · SerpAPI · Gemini" : "Chiavi AI e ricerca web"}
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
                            {isGlobalAdminUser ? (
                                <p className="text-[11px] text-slate-500 leading-relaxed mt-2 ml-1">
                                    <span className="font-bold text-slate-600">Fallback testi prodotto:</span> se imposti{" "}
                                    <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">AI_CONTENT_PROVIDER=openai</code> sul
                                    server (o non hai chiave Gemini), le descrizioni SEO usano l&apos;API compatibile OpenAI. Modello schede
                                    lunghe:{" "}
                                    <code className="font-mono text-[10px] text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                                        OPENAI_CHAT_MODEL
                                    </code>{" "}
                                    (default <code className="font-mono text-[10px]">gpt-4o-mini</code>). Per JSON breve (titolo,
                                    traduzioni, assistente):{" "}
                                    <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">OPENAI_JSON_CHAT_MODEL</code> oppure
                                    stesso valore di <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">OPENAI_CHAT_MODEL</code>
                                    . Host alternativo:{" "}
                                    <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">OPENAI_BASE_URL</code>.
                                </p>
                            ) : (
                                <p className="text-[11px] text-slate-500 leading-relaxed mt-2 ml-1">
                                    Chiave opzionale per alcune funzioni di testo e immagini, se il tuo referente IT la richiede insieme o
                                    al posto di Gemini.
                                </p>
                            )}
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
                                    Google Gemini API Key (testi prodotto + PDF)
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
                            {isGlobalAdminUser ? (
                                <p className="text-[11px] text-slate-500 leading-relaxed mt-2 ml-1">
                                    Usata per <span className="font-bold text-slate-600">descrizioni SEO, traduzioni, titoli</span> (default)
                                    e per PDF/estrazione. Incolla <span className="font-bold text-slate-600">solo la chiave</span> (inizia con{" "}
                                    <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">AIza</code>
                                    ). Modello testi:{" "}
                                    <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">GEMINI_CONTENT_MODEL</code> (default{" "}
                                    <code className="font-mono text-[10px]">gemini-1.5-flash</code>
                                    ). PDF: <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">GEMINI_MODEL</code> resta
                                    separato.
                                </p>
                            ) : (
                                <p className="text-[11px] text-slate-500 leading-relaxed mt-2 ml-1">
                                    Usata per testi intelligenti, traduzioni, titoli e analisi dei PDF. Ottieni la chiave da Google AI
                                    Studio e incollala qui.
                                </p>
                            )}
                        </div>
                        {isGlobalAdminUser && (
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-900">
                                    Ridurre i costi AI (variabili sul server)
                                </p>
                                <ul className="text-[11px] text-slate-600 list-disc pl-4 space-y-1.5 leading-relaxed">
                                    <li>
                                        <span className="font-bold text-slate-700">Gemini flash</span> come predefinito testi:{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">AI_CONTENT_PROVIDER=gemini</code> +{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">
                                            GEMINI_CONTENT_MODEL=gemini-1.5-flash
                                        </code>{" "}
                                        (o <code className="font-mono text-[10px]">gemini-2.0-flash</code> se disponibile sul tuo piano).
                                    </li>
                                    <li>
                                        <span className="font-bold text-slate-700">JSON / titoli / traduzioni / assistente</span> con modello
                                        più leggero:{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">GEMINI_JSON_MODEL</code>,{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">OPENAI_JSON_CHAT_MODEL</code> (es.{" "}
                                        <code className="font-mono text-[10px]">gpt-4o-mini</code> o Llama su Groq).
                                    </li>
                                    <li>
                                        <span className="font-bold text-slate-700">Endpoint compatibile OpenAI</span> (prezzi spesso inferiori):{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">OPENAI_BASE_URL</code> + chiave del
                                        provider (Groq, Together, Mistral, OpenRouter, DeepSeek…).
                                    </li>
                                    <li>
                                        Meno token in uscita:{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">AI_ASSISTANT_MAX_OUTPUT_TOKENS</code>{" "}
                                        (default 900),{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">AI_TRANSLATE_MAX_OUTPUT_TOKENS</code>{" "}
                                        (default 1400),{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">
                                            OPENAI_PRODUCT_COPY_MAX_TOKENS_FAST
                                        </code>
                                        / <code className="font-mono text-[10px]">…_FULL</code>.
                                    </li>
                                    <li>
                                        Cache assistente più aggressiva:{" "}
                                        <code className="font-mono text-[10px] bg-white/80 px-1 rounded">AI_ASSISTANT_CACHE_SIMILARITY</code> tra{" "}
                                        0,75 e 0,98 (default 0,88).
                                    </li>
                                </ul>
                            </div>
                        )}
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
                                {isGlobalAdminUser ? "REST API (per questa azienda)" : "Collegamento al negozio"}
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
                        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-6 space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-900">
                                        Personal Shopper sul negozio (WooCommerce)
                                    </p>
                                    <p className="text-[11px] text-slate-600 font-bold leading-relaxed mt-1">
                                        Incolla il codice iframe in una pagina WooCommerce (blocco HTML personalizzato, Elementor HTML o
                                        shortcode). Il token è segreto: chi lo conosce può usare l&apos;assistente sul tuo catalogo.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={embedBusy}
                                        onClick={() => void regenerateShopperToken()}
                                        className="rounded-xl bg-amber-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-700 disabled:opacity-50"
                                    >
                                        {flags.hasShopperEmbedToken ? "Rigenera token" : "Genera token"}
                                    </button>
                                    {flags.hasShopperEmbedToken && (
                                        <button
                                            type="button"
                                            disabled={embedBusy}
                                            onClick={() => void revokeShopperToken()}
                                            className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                        >
                                            Disattiva
                                        </button>
                                    )}
                                </div>
                            </div>
                            {flags.hasShopperEmbedToken && !embedTokenReveal && (
                                <p className="text-[11px] font-bold text-amber-900">
                                    È già attivo un token sul server. Per vedere il codice iframe usa &quot;Rigenera token&quot; (invalida il
                                    precedente) oppure salva questo URL se l&apos;avevi copiato in precedenza.
                                </p>
                            )}
                            {embedTokenReveal && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase text-slate-500">Token (copia subito)</p>
                                    <div className="flex flex-wrap gap-2">
                                        <code className="flex-1 min-w-0 break-all rounded-xl bg-white px-3 py-2 text-[11px] font-mono text-slate-900 border border-amber-200">
                                            {embedTokenReveal}
                                        </code>
                                        <button
                                            type="button"
                                            onClick={() => void copyText("Token", embedTokenReveal)}
                                            className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            Token
                                        </button>
                                    </div>
                                    {iframeSnippetFull && (
                                        <>
                                            <p className="text-[10px] font-black uppercase text-slate-500 pt-2">
                                                Blocco iframe (pagina / anteprima)
                                            </p>
                                            <textarea
                                                readOnly
                                                value={iframeSnippetFull}
                                                rows={4}
                                                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-[11px] font-mono text-slate-800"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void copyText("Snippet iframe", iframeSnippetFull)}
                                                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Copia iframe
                                            </button>
                                        </>
                                    )}
                                    {iframeSnippetCorner && (
                                        <>
                                            <p className="text-[10px] font-black uppercase text-slate-500 pt-3">
                                                Widget angolo (tipo chat · consigliato su Woo)
                                            </p>
                                            <textarea
                                                readOnly
                                                value={iframeSnippetCorner}
                                                rows={8}
                                                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-[11px] font-mono text-slate-800"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void copyText("Widget angolo WooCommerce", iframeSnippetCorner)}
                                                className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-800"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Copia widget angolo
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                            {isGlobalAdminUser ? (
                                <div className="rounded-2xl border border-amber-200 bg-white/80 p-5 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-900 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                                        Istruzioni widget sul negozio WooCommerce (solo admin globale)
                                    </p>
                                    <ol className="text-[11px] text-slate-700 list-decimal pl-4 space-y-2.5 leading-relaxed font-semibold">
                                        <li>
                                            <span className="font-bold text-slate-900">Database:</span> dopo il deploy con il campo{" "}
                                            <code className="font-mono text-[10px] bg-amber-50 px-1 py-0.5 rounded">
                                                Company.shopperEmbedToken
                                            </code>
                                            , esegui sul server{" "}
                                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">npx prisma db push</code> (o una
                                            migration equivalente).
                                        </li>
                                        <li>
                                            <span className="font-bold text-slate-900">URL pubblici:</span> pagina embed{" "}
                                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded break-all">
                                                /embed/personal-shopper?token=…
                                            </code>
                                            ; API senza sessione{" "}
                                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded break-all">
                                                POST /api/public/woo-personal-shopper
                                            </code>
                                            . Il middleware consente <code className="font-mono text-[10px]">/embed</code> e{" "}
                                            <code className="font-mono text-[10px]">/api/public</code> senza cookie di login.
                                        </li>
                                        <li>
                                            <span className="font-bold text-slate-900">Iframe dal dominio Woo:</span> in{" "}
                                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">next.config.js</code> è impostato{" "}
                                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">
                                                Content-Security-Policy: frame-ancestors *
                                            </code>{" "}
                                            sulle route <code className="font-mono text-[10px]">/embed/*</code>. Se un proxy aggiunge{" "}
                                            <code className="font-mono text-[10px]">X-Frame-Options</code> restrittivo, verifica la configurazione
                                            del reverse proxy.
                                        </li>
                                        <li>
                                            <span className="font-bold text-slate-900">WordPress / WooCommerce:</span> incolla lo snippet in un
                                            blocco HTML personalizzato, widget Elementor HTML, o uno shortcode che accetta HTML. L&apos;iframe
                                            carica Content Hunter sul dominio dell&apos;app, non sul dominio del negozio. Per un pannello
                                            fisso in basso come una chat (stile widget), usa lo snippet &quot;widget angolo&quot; oppure aggiungi{" "}
                                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">&amp;float=1</code> all&apos;URL
                                            embed; <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">&amp;corner=left</code>{" "}
                                            per ancorare a sinistra.
                                        </li>
                                        <li>
                                            <span className="font-bold text-slate-900">Requisiti:</span> chiave OpenAI o Gemini per l&apos;azienda
                                            (questa pagina o variabili <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">
                                                OPENAI_API_KEY
                                            </code>
                                            ,{" "}
                                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">GEMINI_API_KEY</code> sul server).
                                        </li>
                                        <li>
                                            <span className="font-bold text-slate-900">Sicurezza:</span> il token equivale a una chiave API per
                                            quel catalogo; non pubblicarlo in pagine indicizzate se vuoi limitare abusi. Usa &quot;Rigenera
                                            token&quot; se sospetti compromissione.
                                        </li>
                                        <li>
                                            <span className="font-bold text-slate-900">Debug iframe bianco:</span> console del browser (errori
                                            CSP, mixed content HTTP/HTTPS), prova l&apos;URL embed in una scheda anonima, verifica che
                                            l&apos;host dell&apos;app sia raggiungibile dai clienti.
                                        </li>
                                    </ol>
                                </div>
                            ) : (
                                <p className="text-[11px] text-slate-600 font-bold leading-relaxed">
                                    Per usare il widget serve una chiave OpenAI o Gemini configurata per questa azienda (sezione AI sopra o
                                    sul server). Per istruzioni tecniche complete rivolgersi a un amministratore globale.
                                </p>
                            )}
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

                <section className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-8 md:col-span-2">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-violet-50 text-violet-700 rounded-[1.5rem]">
                            <Globe className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900">PrestaShop 9 · Webservice</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">
                                URL negozio, chiave API, categoria e lingua predefinite
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                URL negozio (senza /api)
                            </label>
                            <input
                                value={config.prestaShopUrl}
                                onChange={(e) => setConfig({ ...config, prestaShopUrl: e.target.value })}
                                placeholder="https://negozio.tld"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-violet-50 focus:bg-white transition-all font-bold text-slate-900"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                Chiave webservice
                            </label>
                            <input
                                type="password"
                                value={config.prestaApiKey}
                                onChange={(e) => setConfig({ ...config, prestaApiKey: e.target.value })}
                                placeholder="Chiave generata in Parametri avanzati → Webservice"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-violet-50 focus:bg-white transition-all font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                ID categoria default (nuovi prodotti)
                            </label>
                            <input
                                value={config.prestaDefaultCategoryId}
                                onChange={(e) => setConfig({ ...config, prestaDefaultCategoryId: e.target.value })}
                                placeholder="es. 2"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-violet-50 focus:bg-white transition-all font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                ID lingua contenuti
                            </label>
                            <input
                                value={config.prestaLanguageId}
                                onChange={(e) => setConfig({ ...config, prestaLanguageId: e.target.value })}
                                placeholder="es. 1 (lingua predefinita BO)"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-violet-50 focus:bg-white transition-all font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                ID negozio (multistore, opzionale)
                            </label>
                            <input
                                value={config.prestaIdShop}
                                onChange={(e) => setConfig({ ...config, prestaIdShop: e.target.value })}
                                placeholder="Vuoto = contesto predefinito"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-violet-50 focus:bg-white transition-all font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">
                                ID gruppo regole tasse (opzionale)
                            </label>
                            <input
                                value={config.prestaTaxRulesGroupId}
                                onChange={(e) => setConfig({ ...config, prestaTaxRulesGroupId: e.target.value })}
                                placeholder="Vuoto = 1 in app"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-violet-50 focus:bg-white transition-all font-mono"
                            />
                        </div>
                    </div>
                    {isGlobalAdminUser ? (
                        <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                            Abilita il webservice in PrestaShop, crea una chiave con permessi su{" "}
                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">products</code>,{" "}
                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">categories</code>,{" "}
                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">stock_availables</code>,{" "}
                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">languages</code>,{" "}
                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">manufacturers</code>,{" "}
                            <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">images</code>. Il riferimento prodotto in
                            PrestaShop deve coincidere con lo SKU in Iris.
                        </p>
                    ) : (
                        <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                            Abilita il webservice nel back office PrestaShop e incolla URL e chiave qui. Per i permessi della chiave e
                            l&apos;allineamento SKU chiedi al tuo amministratore di sistema.
                        </p>
                    )}
                </section>
            </div>

            <div className="bg-slate-900 p-12 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-10">
                    <Shield className="w-48 h-48 rotate-12" />
                </div>
                <div className="relative z-10">
                    <h3 className="text-2xl font-black tracking-tight">Salva per questa azienda</h3>
                    <p className="text-slate-400 font-bold mt-2">
                        {isGlobalAdminUser ? (
                            <>
                                Le chiavi sono memorizzate nel database per l’azienda selezionata. Fallback: variabili ambiente sul server
                                (OPENAI_API_KEY, SERPAPI_KEY, GEMINI_API_KEY) se non impostate qui.
                            </>
                        ) : (
                            <>Le chiavi e i collegamenti sono salvati in modo sicuro per l’azienda selezionata.</>
                        )}
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
