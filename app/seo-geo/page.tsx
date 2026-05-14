"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import { useCompanyContext } from "@/contexts/CompanyContext";
import {
    ArrowRight,
    BookOpen,
    Bot,
    Download,
    Globe,
    Loader2,
    MapPin,
    Radar,
    Save,
    ScanLine,
    Search,
    Settings,
    Sparkles,
    Zap,
    BarChart3,
    Target,
} from "lucide-react";
import type { SeoGeoHubPayload } from "@/lib/seo-geo-hub-schema";
import type { TechnicalAuditResult } from "@/lib/technical-site-audit";
import type { VisibilityScanResult } from "@/lib/seo-visibility-scan";
import { VISIBILITY_SERP_DEPTH } from "@/lib/seo-visibility-scan";

function emptyHub(): SeoGeoHubPayload {
    return {
        seo: {
            primaryKeywords: "",
            titleFormula: "",
            editorialNotes: "",
            contentLocales: [],
        },
        geo: {
            locationName: "",
            street: "",
            city: "",
            postalCode: "",
            region: "",
            countryCode: "",
            lat: null,
            lng: null,
            serviceArea: "",
            sameAsUrls: "",
            geoNotes: "",
        },
        indexing: {
            autoSubmitOnChannelSync: false,
            indexNowEnabled: false,
            indexNowHost: "",
            indexNowKey: "",
            indexNowKeyLocation: "",
            sitemapUrl: "",
            pingSitemapOnSync: false,
        },
        aiDiscovery: {
            brandSummaryForAi: "",
            topicalFocus: "",
        },
    };
}

function mergeHub(server: SeoGeoHubPayload | null): SeoGeoHubPayload {
    const e = emptyHub();
    if (!server) return e;
    return {
        seo: { ...e.seo, ...server.seo },
        geo: { ...e.geo, ...server.geo },
        indexing: { ...e.indexing!, ...server.indexing },
        aiDiscovery: { ...e.aiDiscovery!, ...server.aiDiscovery },
    };
}

export default function SeoGeoHubPage() {
    const { data: session, status } = useSession();
    const companyContext = useCompanyContext();
    const effectiveCompanyId =
        (session?.user as { companyId?: number } | undefined)?.companyId ?? companyContext?.selectedCompanyId ?? null;

    const companyReq = useMemo(
        () =>
            effectiveCompanyId != null ? { headers: { "x-company-id": String(effectiveCompanyId) } } : {},
        [effectiveCompanyId]
    );

    const isGlobalAdminUser = !!(session?.user as { isGlobalAdmin?: boolean })?.isGlobalAdmin;
    const [planSeoAllowed, setPlanSeoAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        if (status !== "authenticated") {
            setPlanSeoAllowed(null);
            return;
        }
        if (isGlobalAdminUser) {
            setPlanSeoAllowed(true);
            return;
        }
        if (effectiveCompanyId == null) {
            setPlanSeoAllowed(false);
            return;
        }
        axios
            .get<{ featureSeoGeo?: boolean }>("/api/company/features", companyReq)
            .then((r) => setPlanSeoAllowed(!!r.data?.featureSeoGeo))
            .catch(() => setPlanSeoAllowed(false));
    }, [status, isGlobalAdminUser, effectiveCompanyId, companyReq]);

    const [hub, setHub] = useState<SeoGeoHubPayload>(() => emptyHub());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [localesInput, setLocalesInput] = useState("");
    const [indexTestUrls, setIndexTestUrls] = useState("");
    const [triggerBusy, setTriggerBusy] = useState(false);
    const [llmsBusy, setLlmsBusy] = useState(false);
    const [auditSiteUrl, setAuditSiteUrl] = useState("");
    const [auditResult, setAuditResult] = useState<TechnicalAuditResult | null>(null);
    const [auditLoading, setAuditLoading] = useState(false);
    /** Scelta utente dopo l’audit: null = non ancora scelta */
    const [nextStepChoice, setNextStepChoice] = useState<"none" | "apply_sitemap" | "manual" | null>(null);

    const [visKeywordsOverride, setVisKeywordsOverride] = useState("");
    const [visGl, setVisGl] = useState("it");
    const [visHl, setVisHl] = useState("it");
    const [visResult, setVisResult] = useState<VisibilityScanResult | null>(null);
    const [visLoading, setVisLoading] = useState(false);

    useEffect(() => {
        if (planSeoAllowed === false) {
            setLoading(false);
            return;
        }
        if (planSeoAllowed !== true) {
            return;
        }
        if (status === "loading" || effectiveCompanyId == null) {
            if (status !== "loading" && effectiveCompanyId == null) setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        axios
            .get<{ hub?: SeoGeoHubPayload; wooDomain?: string | null; prestaShopUrl?: string | null }>(
                "/api/seo-geo-hub",
                {
                    headers: { "x-company-id": String(effectiveCompanyId) },
                }
            )
            .then((res) => {
                if (cancelled) return;
                const h = mergeHub(res.data?.hub ?? null);
                setHub(h);
                setLocalesInput((h.seo.contentLocales ?? []).join(", "));
                const def =
                    res.data?.wooDomain?.trim() ||
                    res.data?.prestaShopUrl?.trim() ||
                    "";
                setAuditSiteUrl((prev) => (prev.trim() ? prev : def));
            })
            .catch(() => {
                toast.error("Impossibile caricare il piano SEO/GEO.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [status, effectiveCompanyId, planSeoAllowed]);

    const persistLocales = (raw: string): string[] =>
        raw
            .split(/[,;\s]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 12);

    const handleSave = async () => {
        if (effectiveCompanyId == null) {
            toast.error("Seleziona un’azienda.");
            return;
        }
        setSaving(true);
        try {
            const locales = persistLocales(localesInput);
            const payload: SeoGeoHubPayload = {
                ...hub,
                seo: { ...hub.seo, contentLocales: locales },
            };
            await axios.put("/api/seo-geo-hub", { hub: payload }, companyReq);
            setHub(payload);
            toast.success("Piano SEO & GEO salvato.");
        } catch {
            toast.error("Salvataggio non riuscito.");
        } finally {
            setSaving(false);
        }
    };

    const downloadLlmsTxt = async () => {
        if (effectiveCompanyId == null) return;
        setLlmsBusy(true);
        try {
            const res = await axios.get<string>("/api/seo-geo-hub/llms-txt", {
                ...companyReq,
                responseType: "text",
            });
            const blob = new Blob([res.data], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "llms.txt";
            a.click();
            URL.revokeObjectURL(url);
            toast.success("File llms.txt scaricato — pubblicalo nella root del negozio online.");
        } catch {
            toast.error("Download non riuscito.");
        } finally {
            setLlmsBusy(false);
        }
    };

    const runPingSitemapOnly = async () => {
        if (effectiveCompanyId == null) return;
        setTriggerBusy(true);
        try {
            const res = await axios.post("/api/seo-geo-hub/trigger-index", { pingSitemapOnly: true }, companyReq);
            toast.success(`Ping sitemap: ${JSON.stringify(res.data?.results ?? {})}`);
        } catch {
            toast.error("Ping non riuscito — verifica URL sitemap e salvataggio.");
        } finally {
            setTriggerBusy(false);
        }
    };

    const runIndexNowTest = async () => {
        if (effectiveCompanyId == null) return;
        const urls = indexTestUrls
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((u) => /^https?:\/\//i.test(u))
            .slice(0, 50);
        setTriggerBusy(true);
        try {
            const res = await axios.post("/api/seo-geo-hub/trigger-index", { urls }, companyReq);
            toast.success(`Invio manuale: ${JSON.stringify(res.data?.results ?? {})}`);
        } catch {
            toast.error("Invio IndexNow non riuscito.");
        } finally {
            setTriggerBusy(false);
        }
    };

    const runTechnicalAudit = async () => {
        if (effectiveCompanyId == null) return;
        setAuditLoading(true);
        setAuditResult(null);
        setNextStepChoice(null);
        try {
            const res = await axios.post<{ audit?: TechnicalAuditResult; error?: string }>(
                "/api/seo-geo-hub/technical-audit",
                { siteUrl: auditSiteUrl.trim() || undefined },
                companyReq
            );
            if (res.data?.error) {
                toast.error(res.data.error);
                return;
            }
            if (res.data?.audit) {
                setAuditResult(res.data.audit);
                toast.success("Analisi tecnica completata.");
            }
        } catch (e: unknown) {
            const msg =
                axios.isAxiosError(e) && e.response?.data?.error
                    ? String(e.response.data.error)
                    : "Analisi non riuscita.";
            toast.error(msg);
        } finally {
            setAuditLoading(false);
        }
    };

    const runVisibilitySnapshot = async () => {
        if (effectiveCompanyId == null) return;
        const site = auditSiteUrl.trim();
        if (!site) {
            toast.warning("Inserisci l’URL del negozio (stesso campo dell’analisi tecnica).");
            return;
        }
        setVisLoading(true);
        setVisResult(null);
        try {
            const res = await axios.post<{ snapshot?: VisibilityScanResult; error?: string }>(
                "/api/seo-geo-hub/visibility-scan",
                {
                    siteUrl: site,
                    keywords: visKeywordsOverride.trim() || undefined,
                    gl: visGl.trim() || "it",
                    hl: visHl.trim() || "it",
                },
                { ...companyReq, timeout: 120_000 }
            );
            if (res.data?.error) {
                toast.error(res.data.error);
                return;
            }
            if (res.data?.snapshot) {
                setVisResult(res.data.snapshot);
                toast.success(
                    res.data.snapshot.mode === "serpapi"
                        ? "Snapshot visibilità aggiornato (SerpAPI)."
                        : "Analisi euristica completata (configura SerpAPI per le posizioni Google)."
                );
            }
        } catch (e: unknown) {
            const msg =
                axios.isAxiosError(e) && e.response?.data?.error
                    ? String(e.response.data.error)
                    : "Scansione visibilità non riuscita.";
            toast.error(msg);
        } finally {
            setVisLoading(false);
        }
    };

    const confirmNextStep = () => {
        if (nextStepChoice == null) {
            toast.info("Seleziona un’opzione tra «Come vuoi procedere».");
            return;
        }
        if (nextStepChoice === "none") {
            toast.info("Nessuna modifica automatica. Puoi continuare a configurare il piano quando vuoi.");
            return;
        }
        if (nextStepChoice === "apply_sitemap") {
            const url = auditResult?.suggestedSitemapUrl?.trim();
            if (!url) {
                toast.warning("Nessuna sitemap rilevata da applicare. Configura l’URL manualmente più sotto.");
                return;
            }
            setHub((prev) => ({
                ...prev,
                indexing: { ...prev.indexing, sitemapUrl: url },
            }));
            toast.success("URL sitemap inserito nel piano — premi «Salva piano» per confermare.");
            document.getElementById("seo-geo-indexing")?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        if (nextStepChoice === "manual") {
            toast.info("Configurazione manuale: scorri alle sezioni sotto.");
            document.getElementById("seo-geo-indexing")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    if (status === "loading") {
        return (
            <div className="min-h-[40vh] flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-slate-300" />
            </div>
        );
    }

    if (planSeoAllowed === false) {
        return (
            <div className="max-w-lg mx-auto px-4 py-16 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">SEO &amp; GEO Hub</p>
                <h1 className="text-2xl font-black text-slate-900 mt-2">Modulo non incluso nel piano</h1>
                <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                    Il tenant corrente non ha il modulo SEO &amp; GEO attivo. Chiedi all&apos;amministratore globale di
                    abilitarlo da Piattaforma &amp; piani.
                </p>
                <Link
                    href="/admin/platform"
                    className="inline-block mt-6 text-orange-600 font-black hover:underline"
                >
                    Apri Piattaforma &amp; piani
                </Link>
            </div>
        );
    }

    if (planSeoAllowed === null && !isGlobalAdminUser) {
        return (
            <div className="min-h-[40vh] flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-slate-300" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Modulo integrato</p>
                    <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mt-1">SEO & GEO Hub</h1>
                    <p className="text-sm font-semibold text-slate-600 mt-2 max-w-2xl leading-relaxed">
                        Piano unico collegato all’anagrafica aziendale: strategia SEO sui contenuti Iris (biblioteca, export,
                        canali), coordinate Local / GEO, indicizzazione automatica dopo push ({""}
                        <strong className="text-slate-800">IndexNow</strong> + ping sitemap) e file{" "}
                        <strong className="text-slate-800">llms.txt</strong> per crawler IA (da pubblicare sul dominio del
                        negozio).
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:border-slate-300 shadow-sm"
                    >
                        <BookOpen className="w-4 h-4" />
                        Biblioteca
                    </Link>
                    <Link
                        href="/channels"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:border-slate-300 shadow-sm"
                    >
                        <Globe className="w-4 h-4" />
                        Canali
                    </Link>
                    <Link
                        href="/settings"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-[11px] font-black uppercase tracking-widest text-white hover:bg-black shadow-lg"
                    >
                        <Settings className="w-4 h-4" />
                        Integrazioni
                    </Link>
                </div>
            </div>

            {effectiveCompanyId == null ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900">
                    Seleziona un’azienda dall’header per configurare il modulo SEO & GEO.
                </div>
            ) : loading ? (
                <div className="flex items-center justify-center py-24 gap-3 text-slate-500 font-bold">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Caricamento piano…
                </div>
            ) : (
                <>
                    <section className="mb-8 rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white flex flex-wrap items-center gap-3 justify-between">
                            <div className="flex items-center gap-3">
                                <ScanLine className="w-5 h-5 shrink-0 opacity-95" />
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">
                                        Passo 1
                                    </p>
                                    <h2 className="text-[12px] font-black uppercase tracking-[0.18em]">
                                        Analisi tecnica del sito vetrina
                                    </h2>
                                    <p className="text-[11px] font-semibold text-slate-300 mt-1 max-w-2xl">
                                        Controllo in sola lettura (HTTPS, titolo, robots, sitemap, llms.txt). Usa il dominio
                                        da Impostazioni o incolla un URL.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                    URL negozio da analizzare
                                </label>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <input
                                        type="url"
                                        value={auditSiteUrl}
                                        onChange={(e) => setAuditSiteUrl(e.target.value)}
                                        placeholder="https://www.tuonegozio.it"
                                        className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                    />
                                    <button
                                        type="button"
                                        disabled={auditLoading}
                                        onClick={() => void runTechnicalAudit()}
                                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-black disabled:opacity-50 shrink-0"
                                    >
                                        {auditLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <ScanLine className="w-4 h-4" />
                                        )}
                                        Avvia analisi
                                    </button>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500">
                                    Se Woo o Presta sono configurati in{" "}
                                    <Link href="/settings" className="text-slate-800 underline font-bold">
                                        Impostazioni
                                    </Link>
                                    , l’URL viene precompilato.
                                </p>
                            </div>

                            {auditResult && (
                                <div className="space-y-5 border-t border-slate-100 pt-5">
                                    <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-[11px] font-semibold text-slate-600">
                                        <strong className="text-slate-900">Dominio analizzato:</strong>{" "}
                                        {auditResult.finalOrigin}{" "}
                                        <span className="text-slate-400">
                                            · {new Date(auditResult.checkedAt).toLocaleString("it-IT")}
                                        </span>
                                    </div>
                                    <ul className="space-y-2">
                                        {auditResult.checks.map((c) => (
                                            <li
                                                key={c.id}
                                                className={`flex flex-wrap items-start gap-2 rounded-xl border px-4 py-3 text-[12px] ${
                                                    c.ok
                                                        ? "border-emerald-100 bg-emerald-50/80 text-emerald-950"
                                                        : "border-amber-100 bg-amber-50/80 text-amber-950"
                                                }`}
                                            >
                                                <span
                                                    className={`font-black uppercase text-[9px] tracking-wider shrink-0 mt-0.5 ${
                                                        c.ok ? "text-emerald-700" : "text-amber-800"
                                                    }`}
                                                >
                                                    {c.ok ? "OK" : "Da migliorare"}
                                                </span>
                                                <span>
                                                    <strong className="font-black">{c.label}:</strong> {c.detail}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    {auditResult.recommendations.length > 0 && (
                                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800 mb-2">
                                                Suggerimenti
                                            </p>
                                            <ul className="list-disc pl-4 space-y-1 text-[12px] font-semibold text-indigo-950">
                                                {auditResult.recommendations.map((r, i) => (
                                                    <li key={i}>{r}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-4">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            Passo 2 — Come vuoi procedere?
                                        </p>
                                        <div className="space-y-3">
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="next-seo-step"
                                                    className="mt-1"
                                                    checked={nextStepChoice === "none"}
                                                    onChange={() => setNextStepChoice("none")}
                                                />
                                                <span className="text-[13px] font-semibold text-slate-800 leading-snug">
                                                    Solo consultazione: non applicare nulla automaticamente in Iris.
                                                </span>
                                            </label>
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="next-seo-step"
                                                    className="mt-1"
                                                    checked={nextStepChoice === "apply_sitemap"}
                                                    onChange={() => setNextStepChoice("apply_sitemap")}
                                                />
                                                <span className="text-[13px] font-semibold text-slate-800 leading-snug">
                                                    Inserisci nel piano l’URL sitemap se l’abbiamo trovata
                                                    {auditResult.suggestedSitemapUrl ? (
                                                        <span className="block font-mono text-[11px] text-slate-600 mt-1 break-all">
                                                            {auditResult.suggestedSitemapUrl}
                                                        </span>
                                                    ) : (
                                                        <span className="block text-amber-800 font-bold mt-1">
                                                            (nessuna rilevata — scegli configurazione manuale)
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="next-seo-step"
                                                    className="mt-1"
                                                    checked={nextStepChoice === "manual"}
                                                    onChange={() => setNextStepChoice("manual")}
                                                />
                                                <span className="text-[13px] font-semibold text-slate-800 leading-snug">
                                                    Configuro tutto manualmente (scorri alla sezione indicizzazione).
                                                </span>
                                            </label>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => confirmNextStep()}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-black"
                                        >
                                            Conferma scelta
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    <section
                        id="seo-geo-visibility"
                        className="mb-8 rounded-3xl border border-amber-200/80 bg-white shadow-sm overflow-hidden"
                    >
                        <div className="px-6 py-4 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white flex flex-wrap items-center gap-3 justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                                <BarChart3 className="w-5 h-5 shrink-0 opacity-95" />
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-100">
                                        Visibilità dominio
                                    </p>
                                    <h2 className="text-[12px] font-black uppercase tracking-[0.18em]">
                                        Controllo posizionamenti e azioni (stile Semrush)
                                    </h2>
                                    <p className="text-[11px] font-semibold text-amber-50 mt-1 max-w-2xl leading-snug">
                                        Con SerpAPI: posizione approssimativa del tuo dominio nei risultati Google per le
                                        keyword del piano. Sempre: confronto keyword ↔ titolo, meta e H1 della homepage +
                                        suggerimenti operativi.
                                    </p>
                                </div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest bg-white/15 px-3 py-1.5 rounded-lg shrink-0">
                                Max 8 query / scansione
                            </span>
                        </div>
                        <div className="p-6 space-y-5">
                            <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">
                                Usa lo <strong className="text-slate-900">stesso URL</strong> del blocco analisi tecnica sopra.
                                Le keyword prese di default sono quelle in{" "}
                                <strong className="text-slate-900">«Keyword primarie»</strong> (salva il piano se le hai
                                appena modificate). Opzionale: incolla qui un elenco alternativo (una per riga o separate
                                da virgola).
                            </p>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <label className="lg:col-span-2 block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <Target className="w-3.5 h-3.5" />
                                        Keyword per questa scansione (opzionale)
                                    </span>
                                    <textarea
                                        value={visKeywordsOverride}
                                        onChange={(e) => setVisKeywordsOverride(e.target.value)}
                                        rows={3}
                                        placeholder={`Lascia vuoto per usare:\n${(hub.seo.primaryKeywords || "").slice(0, 200)}${(hub.seo.primaryKeywords || "").length > 200 ? "…" : ""}`}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-100 resize-y min-h-[88px]"
                                    />
                                </label>
                                <div className="space-y-3">
                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Google gl (paese)
                                        </span>
                                        <input
                                            type="text"
                                            value={visGl}
                                            onChange={(e) => setVisGl(e.target.value.toLowerCase().slice(0, 2))}
                                            placeholder="it"
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Google hl (lingua)
                                        </span>
                                        <input
                                            type="text"
                                            value={visHl}
                                            onChange={(e) => setVisHl(e.target.value.toLowerCase().slice(0, 5))}
                                            placeholder="it"
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                                <button
                                    type="button"
                                    disabled={visLoading}
                                    onClick={() => void runVisibilitySnapshot()}
                                    className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-[11px] font-black uppercase tracking-widest hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 shadow-md"
                                >
                                    {visLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <BarChart3 className="w-4 h-4" />
                                    )}
                                    Analizza visibilità
                                </button>
                                <Link
                                    href="/settings"
                                    className="text-[11px] font-bold text-amber-800 underline decoration-amber-300 hover:text-amber-950"
                                >
                                    SerpAPI in Impostazioni → per dati posizione reali
                                </Link>
                            </div>

                            {visResult && (
                                <div className="space-y-5 border-t border-amber-100 pt-5">
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
                                        <span className="rounded-full bg-slate-900 text-white px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                                            {visResult.mode === "serpapi" ? "SerpAPI attivo" : "Solo euristiche"}
                                        </span>
                                        <span>
                                            <strong className="text-slate-900">{visResult.siteOrigin}</strong> · host{" "}
                                            <code className="text-slate-800">{visResult.targetHost}</code>
                                        </span>
                                        <span className="text-slate-400">
                                            {new Date(visResult.scannedAt).toLocaleString("it-IT")}
                                        </span>
                                    </div>
                                    {visResult.notice && (
                                        <div className="rounded-xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-[12px] font-semibold text-amber-950">
                                            {visResult.notice}
                                        </div>
                                    )}
                                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                                        <table className="min-w-full text-left text-[12px]">
                                            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                <tr>
                                                    <th className="px-4 py-3">Keyword</th>
                                                    <th className="px-4 py-3 whitespace-nowrap">Pos. Google</th>
                                                    <th className="px-4 py-3 hidden md:table-cell">Pagina trovata</th>
                                                    <th className="px-4 py-3 text-center">Tit.</th>
                                                    <th className="px-4 py-3 text-center">Meta</th>
                                                    <th className="px-4 py-3 text-center">H1</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                                                {visResult.rows.map((row) => (
                                                    <tr key={row.keyword} className="hover:bg-slate-50/80">
                                                        <td className="px-4 py-3 max-w-[200px]">{row.keyword}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            {row.googlePosition != null ? (
                                                                <span
                                                                    className={
                                                                        row.googlePosition <= 3
                                                                            ? "text-emerald-700 font-black"
                                                                            : row.googlePosition <= 10
                                                                              ? "text-amber-800 font-black"
                                                                              : "text-slate-600"
                                                                    }
                                                                >
                                                                    {row.googlePosition}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 hidden md:table-cell max-w-xs truncate text-slate-600">
                                                            {row.matchedUrl || "—"}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {row.inHomeTitle ? "✓" : "—"}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {row.inHomeMetaDescription ? "✓" : "—"}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">{row.inHomeH1 ? "✓" : "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-[10px] font-semibold text-slate-500">
                                        Colonne Tit./Meta/H1: presenza della keyword (non case-sensitive) su homepage.
                                        Posizione: primi {VISIBILITY_SERP_DEPTH} organici Google (varia per utente e SERP reale).
                                    </p>
                                    {visResult.recommendations.length > 0 && (
                                        <div className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-4">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-orange-900 mb-2">
                                                Azioni suggerite per aumentare la visibilità
                                            </p>
                                            <ul className="list-disc pl-4 space-y-1.5 text-[12px] font-semibold text-orange-950 leading-snug">
                                                {visResult.recommendations.map((r, i) => (
                                                    <li key={i}>{r}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <section className="rounded-3xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
                            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center gap-3">
                                <Search className="w-5 h-5 shrink-0 opacity-90" />
                                <div>
                                    <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">SEO a 360°</h2>
                                    <p className="text-[11px] font-semibold opacity-90 mt-0.5">
                                        Allineamento con titoli, copy breve/lungo e job AI in biblioteca
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 space-y-5">
                                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-[11px] font-semibold text-slate-600 leading-snug">
                                    <Sparkles className="w-4 h-4 inline mr-1 text-indigo-500 -mt-0.5" />
                                    I contenuti prodotto restano in{" "}
                                    <strong className="text-slate-800">Biblioteca → SEO & AI Content</strong>; qui definisci
                                    linee guida e priorità keyword per tutta l’azienda.
                                </div>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Keyword primarie / cluster
                                    </span>
                                    <textarea
                                        value={hub.seo.primaryKeywords ?? ""}
                                        onChange={(e) =>
                                            setHub({ ...hub, seo: { ...hub.seo, primaryKeywords: e.target.value } })
                                        }
                                        rows={4}
                                        placeholder="Es. orologi da parete, design italiano, regalo casa…"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-y min-h-[100px]"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Formula titoli (suggerimento)
                                    </span>
                                    <input
                                        type="text"
                                        value={hub.seo.titleFormula ?? ""}
                                        onChange={(e) =>
                                            setHub({ ...hub, seo: { ...hub.seo, titleFormula: e.target.value } })
                                        }
                                        placeholder='Es. {{brand}} {{title}} | {{company}}'
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Lingue contenuti (ISO, separate da virgola)
                                    </span>
                                    <input
                                        type="text"
                                        value={localesInput}
                                        onChange={(e) => setLocalesInput(e.target.value)}
                                        placeholder="it, en, de"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Note editoriali / checklist
                                    </span>
                                    <textarea
                                        value={hub.seo.editorialNotes ?? ""}
                                        onChange={(e) =>
                                            setHub({ ...hub, seo: { ...hub.seo, editorialNotes: e.target.value } })
                                        }
                                        rows={4}
                                        placeholder="Ton of voice, stagionalità, prodotti core da valorizzare…"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-y min-h-[88px]"
                                    />
                                </label>
                            </div>
                        </section>

                        <section className="rounded-3xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
                            <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center gap-3">
                                <Radar className="w-5 h-5 shrink-0 opacity-90" />
                                <div>
                                    <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">GEO / Local a 360°</h2>
                                    <p className="text-[11px] font-semibold opacity-90 mt-0.5">
                                        Sede, area di servizio e collegamenti per SEO locale e schema
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-[11px] font-semibold text-slate-600 leading-snug">
                                    <MapPin className="w-4 h-4 inline mr-1 text-emerald-600 -mt-0.5" />
                                    Usa questi dati come riferimento unico per LocalBusiness / Organization; il push verso Woo
                                    o Presta resta dai{" "}
                                    <Link href="/channels" className="text-emerald-700 underline font-black">
                                        Canali
                                    </Link>
                                    .
                                </div>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Nome sede / punto vendita
                                    </span>
                                    <input
                                        type="text"
                                        value={hub.geo.locationName ?? ""}
                                        onChange={(e) =>
                                            setHub({ ...hub, geo: { ...hub.geo, locationName: e.target.value } })
                                        }
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                    />
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="block space-y-2 sm:col-span-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Indirizzo
                                        </span>
                                        <input
                                            type="text"
                                            value={hub.geo.street ?? ""}
                                            onChange={(e) =>
                                                setHub({ ...hub, geo: { ...hub.geo, street: e.target.value } })
                                            }
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">CAP</span>
                                        <input
                                            type="text"
                                            value={hub.geo.postalCode ?? ""}
                                            onChange={(e) =>
                                                setHub({ ...hub, geo: { ...hub.geo, postalCode: e.target.value } })
                                            }
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Città
                                        </span>
                                        <input
                                            type="text"
                                            value={hub.geo.city ?? ""}
                                            onChange={(e) =>
                                                setHub({ ...hub, geo: { ...hub.geo, city: e.target.value } })
                                            }
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Provincia / regione
                                        </span>
                                        <input
                                            type="text"
                                            value={hub.geo.region ?? ""}
                                            onChange={(e) =>
                                                setHub({ ...hub, geo: { ...hub.geo, region: e.target.value } })
                                            }
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Paese (ISO2)
                                        </span>
                                        <input
                                            type="text"
                                            value={hub.geo.countryCode ?? ""}
                                            onChange={(e) =>
                                                setHub({
                                                    ...hub,
                                                    geo: {
                                                        ...hub.geo,
                                                        countryCode: e.target.value.toUpperCase().slice(0, 2),
                                                    },
                                                })
                                            }
                                            placeholder="IT"
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lat</span>
                                        <input
                                            type="text"
                                            value={hub.geo.lat != null ? String(hub.geo.lat) : ""}
                                            onChange={(e) => {
                                                const v = e.target.value.trim();
                                                if (v === "") {
                                                    setHub({ ...hub, geo: { ...hub.geo, lat: null } });
                                                    return;
                                                }
                                                const n = parseFloat(v);
                                                setHub({
                                                    ...hub,
                                                    geo: {
                                                        ...hub.geo,
                                                        lat: Number.isFinite(n) ? n : hub.geo.lat ?? null,
                                                    },
                                                });
                                            }}
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lng</span>
                                        <input
                                            type="text"
                                            value={hub.geo.lng != null ? String(hub.geo.lng) : ""}
                                            onChange={(e) => {
                                                const v = e.target.value.trim();
                                                if (v === "") {
                                                    setHub({ ...hub, geo: { ...hub.geo, lng: null } });
                                                    return;
                                                }
                                                const n = parseFloat(v);
                                                setHub({
                                                    ...hub,
                                                    geo: {
                                                        ...hub.geo,
                                                        lng: Number.isFinite(n) ? n : hub.geo.lng ?? null,
                                                    },
                                                });
                                            }}
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        />
                                    </label>
                                </div>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Area di servizio (testo)
                                    </span>
                                    <textarea
                                        value={hub.geo.serviceArea ?? ""}
                                        onChange={(e) =>
                                            setHub({ ...hub, geo: { ...hub.geo, serviceArea: e.target.value } })
                                        }
                                        rows={3}
                                        placeholder="Es. Consegna in Lombardia; ritiro in negozio…"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 resize-y"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        URL profili & sameAs (uno per riga)
                                    </span>
                                    <textarea
                                        value={hub.geo.sameAsUrls ?? ""}
                                        onChange={(e) =>
                                            setHub({ ...hub, geo: { ...hub.geo, sameAsUrls: e.target.value } })
                                        }
                                        rows={3}
                                        placeholder="https://maps.google.com/…&#10;https://www.instagram.com/…"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 resize-y font-mono text-[12px]"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Note GEO / locale
                                    </span>
                                    <textarea
                                        value={hub.geo.geoNotes ?? ""}
                                        onChange={(e) =>
                                            setHub({ ...hub, geo: { ...hub.geo, geoNotes: e.target.value } })
                                        }
                                        rows={3}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100 resize-y"
                                    />
                                </label>
                            </div>
                        </section>
                    </div>

                    <section
                        id="seo-geo-indexing"
                        className="mt-8 rounded-3xl border border-amber-100 bg-white shadow-sm overflow-hidden scroll-mt-24"
                    >
                        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white flex flex-wrap items-center gap-3 justify-between">
                            <div className="flex items-center gap-3">
                                <Zap className="w-5 h-5 shrink-0 opacity-95" />
                                <div>
                                    <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">
                                        Indicizzazione automatica (Google / Bing / IndexNow)
                                    </h2>
                                    <p className="text-[11px] font-semibold opacity-95 mt-0.5 max-w-xl">
                                        Dopo ogni pubblicazione WooCommerce o PrestaShop, Iris può notificare gli URL al
                                        protocollo IndexNow (usato da Bing, Yandex, ecc.) e fare ping della sitemap
                                        (Google/Bing — metodo legacy, non garantisce crawl immediato).
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 space-y-5">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-amber-600"
                                    checked={hub.indexing?.autoSubmitOnChannelSync ?? false}
                                    onChange={(e) =>
                                        setHub({
                                            ...hub,
                                            indexing: {
                                                ...hub.indexing,
                                                autoSubmitOnChannelSync: e.target.checked,
                                            },
                                        })
                                    }
                                />
                                <span className="text-[13px] font-semibold text-slate-800 leading-snug">
                                    Esegui automaticamente dopo ogni push su canale (notifica motori compatibili)
                                </span>
                            </label>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-amber-600"
                                    checked={hub.indexing?.pingSitemapOnSync ?? false}
                                    onChange={(e) =>
                                        setHub({
                                            ...hub,
                                            indexing: {
                                                ...hub.indexing,
                                                pingSitemapOnSync: e.target.checked,
                                            },
                                        })
                                    }
                                />
                                <span className="text-[13px] font-semibold text-slate-800 leading-snug">
                                    Ping sitemap (Google + Bing) insieme alle notifiche URL
                                </span>
                            </label>
                            <label className="block space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    URL pubblico sitemap XML
                                </span>
                                <input
                                    type="url"
                                    value={hub.indexing?.sitemapUrl ?? ""}
                                    onChange={(e) =>
                                        setHub({
                                            ...hub,
                                            indexing: { ...hub.indexing, sitemapUrl: e.target.value },
                                        })
                                    }
                                    placeholder="https://tuonegozio.it/wp-sitemap.xml"
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                />
                            </label>
                            <p className="text-[11px] font-semibold text-slate-500 border-t border-slate-100 pt-4">
                                <strong className="text-slate-800">IndexNow:</strong> genera una chiave sul dominio del
                                negozio (file <code className="text-xs bg-slate-100 px-1 rounded">.txt</code> in root) e
                                incolla host + chiave qui — stesso dominio degli URL pubblicati.
                            </p>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-amber-600"
                                    checked={hub.indexing?.indexNowEnabled ?? false}
                                    onChange={(e) =>
                                        setHub({
                                            ...hub,
                                            indexing: {
                                                ...hub.indexing,
                                                indexNowEnabled: e.target.checked,
                                            },
                                        })
                                    }
                                />
                                <span className="text-[13px] font-semibold text-slate-800 leading-snug">
                                    Abilita IndexNow per gli URL prodotto dopo il push
                                </span>
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Host (senza https)
                                    </span>
                                    <input
                                        type="text"
                                        value={hub.indexing?.indexNowHost ?? ""}
                                        onChange={(e) =>
                                            setHub({
                                                ...hub,
                                                indexing: { ...hub.indexing, indexNowHost: e.target.value },
                                            })
                                        }
                                        placeholder="www.tuonegozio.it"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Chiave IndexNow
                                    </span>
                                    <input
                                        type="text"
                                        value={hub.indexing?.indexNowKey ?? ""}
                                        onChange={(e) =>
                                            setHub({
                                                ...hub,
                                                indexing: { ...hub.indexing, indexNowKey: e.target.value },
                                            })
                                        }
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                    />
                                </label>
                            </div>
                            <label className="block space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    URL file chiave (opzionale, se non è in root)
                                </span>
                                <input
                                    type="url"
                                    value={hub.indexing?.indexNowKeyLocation ?? ""}
                                    onChange={(e) =>
                                        setHub({
                                            ...hub,
                                            indexing: { ...hub.indexing, indexNowKeyLocation: e.target.value },
                                        })
                                    }
                                    placeholder="https://www.tuonegozio.it/abc123.txt"
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                />
                            </label>
                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    type="button"
                                    disabled={triggerBusy}
                                    onClick={() => void runPingSitemapOnly()}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-amber-200 text-[11px] font-black uppercase tracking-widest text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                                >
                                    {triggerBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    Ping sitemap ora
                                </button>
                                <button
                                    type="button"
                                    disabled={triggerBusy}
                                    onClick={() => void runIndexNowTest()}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-amber-700 disabled:opacity-50"
                                >
                                    Test IndexNow (URL sotto)
                                </button>
                            </div>
                            <label className="block space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    URL da inoltrare (uno per riga, test manuale)
                                </span>
                                <textarea
                                    value={indexTestUrls}
                                    onChange={(e) => setIndexTestUrls(e.target.value)}
                                    rows={3}
                                    placeholder={"https://www.tuonegozio.it/prodotto/…\nhttps://…"}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-mono text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-amber-100"
                                />
                            </label>
                        </div>
                    </section>

                    <section className="mt-8 rounded-3xl border border-violet-100 bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white flex items-center gap-3">
                            <Bot className="w-5 h-5 shrink-0 opacity-95" />
                            <div>
                                <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">Scoperta IA (llms.txt)</h2>
                                <p className="text-[11px] font-semibold opacity-95 mt-0.5">
                                    Testi per crawler e assistenti: scarica il file e caricalo su{" "}
                                    <strong className="font-black">https://tuodominio/llms.txt</strong> (non passa da
                                    Iris).
                                </p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <label className="block space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Sintesi brand (per IA)
                                </span>
                                <textarea
                                    value={hub.aiDiscovery?.brandSummaryForAi ?? ""}
                                    onChange={(e) =>
                                        setHub({
                                            ...hub,
                                            aiDiscovery: { ...hub.aiDiscovery, brandSummaryForAi: e.target.value },
                                        })
                                    }
                                    rows={3}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-violet-100"
                                />
                            </label>
                            <label className="block space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Focus tematici (prodotti / settore)
                                </span>
                                <textarea
                                    value={hub.aiDiscovery?.topicalFocus ?? ""}
                                    onChange={(e) =>
                                        setHub({
                                            ...hub,
                                            aiDiscovery: { ...hub.aiDiscovery, topicalFocus: e.target.value },
                                        })
                                    }
                                    rows={3}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-violet-100"
                                />
                            </label>
                            <button
                                type="button"
                                disabled={llmsBusy}
                                onClick={() => void downloadLlmsTxt()}
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50"
                            >
                                {llmsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Scarica llms.txt
                            </button>
                        </div>
                    </section>

                    <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                        <p className="text-[12px] font-semibold text-slate-600 flex items-center gap-2">
                            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                            Salvataggio sul record azienda — utilizzabile in automazioni e export futuri.
                        </p>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleSave()}
                            className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-black disabled:opacity-50 shadow-lg"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Salva piano
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
