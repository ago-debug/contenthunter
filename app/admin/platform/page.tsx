"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import axios from "axios";
import { toast } from "react-toastify";
import {
    ArrowLeft,
    Building2,
    Coins,
    RefreshCw,
    Save,
    Shield,
    ToggleLeft,
    ToggleRight,
    Users,
} from "lucide-react";

type CompanyOption = {
    id: number;
    name: string;
    slug: string;
    usersCount: number;
    productsCount: number;
    catalogsCount?: number;
    onboardingStatus: string;
    subscriptionPlan: string;
    aiCreditsBalance: string;
};

type LedgerRow = {
    id: number;
    delta: string;
    balanceAfter: string;
    reason: string;
    createdAt: string;
    userId: number | null;
};

type UserRow = {
    id: number;
    email: string;
    name: string | null;
    isActive: boolean;
    profileId: number | null;
    profile: { id: number; name: string } | null;
    createdAt: string;
};

type CompanyDetail = CompanyOption & {
    catalogsCount: number;
    maxProducts: number | null;
    maxUsers: number | null;
    featureSeoGeo: boolean;
    featurePdfSuite: boolean;
    createdAt: string;
    updatedAt: string;
    users: UserRow[];
    aiCreditLedgers: LedgerRow[];
};

const ONBOARDING_OPTIONS = [
    { value: "active", label: "Attivo (accesso utenti)" },
    { value: "pending_approval", label: "In attesa di approvazione" },
    { value: "pending_verification", label: "In attesa verifica email" },
    { value: "rejected", label: "Rifiutato" },
];

const PLAN_OPTIONS = [
    { value: "free", label: "Free (limiti default)" },
    { value: "standard", label: "Standard" },
];

export default function AdminPlatformPage() {
    const { data: session, status } = useSession();
    const isGlobalAdmin = !!(session?.user as { isGlobalAdmin?: boolean })?.isGlobalAdmin;
    const [bootstrapCompanyFromUrl, setBootstrapCompanyFromUrl] = useState<number | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const raw = new URLSearchParams(window.location.search).get("company");
        const n = raw ? parseInt(raw, 10) : NaN;
        setBootstrapCompanyFromUrl(Number.isFinite(n) ? n : null);
    }, []);

    const [forbidden, setForbidden] = useState(false);
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<CompanyDetail | null>(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [onboardingStatus, setOnboardingStatus] = useState("active");
    const [subscriptionPlan, setSubscriptionPlan] = useState("standard");
    const [maxProducts, setMaxProducts] = useState<string>("");
    const [maxUsers, setMaxUsers] = useState<string>("");
    const [featureSeoGeo, setFeatureSeoGeo] = useState(true);
    const [featurePdfSuite, setFeaturePdfSuite] = useState(true);

    const [creditDelta, setCreditDelta] = useState("");
    const [creditReason, setCreditReason] = useState("");

    const loadCompanies = useCallback(async () => {
        setLoadingList(true);
        try {
            const { data, status: st } = await axios.get<CompanyOption[]>("/api/companies").catch((e) => ({
                data: [],
                status: e?.response?.status,
            }));
            if (st === 403) {
                setForbidden(true);
                setCompanies([]);
            } else {
                setCompanies(Array.isArray(data) ? data : []);
            }
        } catch {
            setForbidden(true);
            setCompanies([]);
        } finally {
            setLoadingList(false);
        }
    }, []);

    const loadDetail = useCallback(async (id: number) => {
        setLoadingDetail(true);
        try {
            const { data } = await axios.get<CompanyDetail>(`/api/companies/${id}`);
            setDetail(data);
            setName(data.name);
            setSlug(data.slug);
            setOnboardingStatus(data.onboardingStatus || "active");
            setSubscriptionPlan((data.subscriptionPlan || "standard").toLowerCase());
            setMaxProducts(data.maxProducts != null ? String(data.maxProducts) : "");
            setMaxUsers(data.maxUsers != null ? String(data.maxUsers) : "");
            setFeatureSeoGeo(!!data.featureSeoGeo);
            setFeaturePdfSuite(!!data.featurePdfSuite);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore caricamento azienda");
            setDetail(null);
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    useEffect(() => {
        if (status === "loading") return;
        if (!isGlobalAdmin) {
            setForbidden(true);
            return;
        }
        void loadCompanies();
    }, [status, isGlobalAdmin, loadCompanies]);

    useEffect(() => {
        if (!isGlobalAdmin || companies.length === 0) return;
        const initial =
            bootstrapCompanyFromUrl != null && companies.some((c) => c.id === bootstrapCompanyFromUrl)
                ? bootstrapCompanyFromUrl
                : companies[0].id;
        setSelectedId(initial);
    }, [isGlobalAdmin, companies, bootstrapCompanyFromUrl]);

    useEffect(() => {
        if (selectedId != null && isGlobalAdmin) {
            void loadDetail(selectedId);
        }
    }, [selectedId, isGlobalAdmin, loadDetail]);

    const saveCompany = async () => {
        if (selectedId == null) return;
        setSaving(true);
        try {
            await axios.put(`/api/companies/${selectedId}`, {
                name: name.trim(),
                slug: slug.trim() || undefined,
                onboardingStatus,
                subscriptionPlan,
                maxProducts: maxProducts.trim() === "" ? null : parseInt(maxProducts, 10),
                maxUsers: maxUsers.trim() === "" ? null : parseInt(maxUsers, 10),
                featureSeoGeo,
                featurePdfSuite,
            });
            toast.success("Impostazioni salvate");
            await loadCompanies();
            await loadDetail(selectedId);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore salvataggio");
        } finally {
            setSaving(false);
        }
    };

    const applyCredit = async () => {
        if (selectedId == null) return;
        const n = parseFloat(String(creditDelta).replace(",", "."));
        if (!Number.isFinite(n) || n === 0) {
            toast.error("Inserisci un importo diverso da zero");
            return;
        }
        setSaving(true);
        try {
            await axios.put(`/api/companies/${selectedId}`, {
                aiCreditDelta: n,
                aiCreditReason: creditReason.trim() || "admin_adjust",
            });
            toast.success("Movimento crediti registrato");
            setCreditDelta("");
            setCreditReason("");
            await loadCompanies();
            await loadDetail(selectedId);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore movimento crediti");
        } finally {
            setSaving(false);
        }
    };

    const toggleUserActive = async (u: UserRow) => {
        try {
            await axios.patch(`/api/users/${u.id}`, { isActive: !u.isActive });
            toast.success(u.isActive ? "Utente disattivato" : "Utente riattivato");
            if (selectedId != null) await loadDetail(selectedId);
            await loadCompanies();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore aggiornamento utente");
        }
    };

    if (status === "loading" || loadingList) {
        return (
            <div className="p-12 text-center text-slate-500 font-bold">Caricamento…</div>
        );
    }

    if (forbidden || !isGlobalAdmin) {
        return (
            <div className="p-12 max-w-2xl mx-auto text-center">
                <p className="text-slate-600 font-bold">Solo l&apos;admin globale può accedere a Piattaforma &amp; piani.</p>
                <Link href="/admin" className="mt-4 inline-block text-orange-600 font-bold hover:underline">
                    Torna all&apos;Admin
                </Link>
            </div>
        );
    }

    if (companies.length === 0) {
        return (
            <div className="p-12 max-w-2xl mx-auto space-y-4">
                <p className="text-slate-600 font-bold">Nessuna azienda registrata. Crea prima un&apos;azienda da Gestione aziende.</p>
                <Link
                    href="/admin/companies"
                    className="inline-flex items-center gap-2 text-orange-600 font-bold hover:underline"
                >
                    <Building2 className="w-4 h-4" />
                    Gestione aziende
                </Link>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <header className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex items-start gap-4">
                    <Link
                        href="/admin"
                        className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Piattaforma &amp; piani</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Configurazione tenant: stato workspace, piani, limiti, crediti AI e accesso utenti.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        void loadCompanies();
                        if (selectedId != null) void loadDetail(selectedId);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
                >
                    <RefreshCw className="w-4 h-4" />
                    Aggiorna
                </button>
            </header>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 shadow-sm space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Azienda</label>
                <select
                    className="w-full md:max-w-md px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-900"
                    value={selectedId ?? ""}
                    onChange={(e) => setSelectedId(parseInt(e.target.value, 10))}
                >
                    {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name} — {c.subscriptionPlan} · {c.onboardingStatus} · {c.usersCount} utenti
                        </option>
                    ))}
                </select>
            </div>

            {loadingDetail || !detail ? (
                <div className="text-center text-slate-500 py-16 font-bold">Caricamento dettaglio…</div>
            ) : (
                <div className="space-y-8">
                    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-orange-500" />
                            Anagrafica
                        </h2>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Slug</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 font-mono text-sm"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-orange-500" />
                            Stato workspace e piano
                        </h2>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Onboarding</label>
                                <select
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                                    value={onboardingStatus}
                                    onChange={(e) => setOnboardingStatus(e.target.value)}
                                >
                                    {ONBOARDING_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-400 mt-1">
                                    Solo stato <strong>Attivo</strong> consente il login agli utenti dell&apos;azienda.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Piano</label>
                                <select
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                                    value={subscriptionPlan}
                                    onChange={(e) => setSubscriptionPlan(e.target.value)}
                                >
                                    {PLAN_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                    Max prodotti (vuoto = default piano)
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                                    value={maxProducts}
                                    onChange={(e) => setMaxProducts(e.target.value)}
                                    placeholder="es. 100"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                    Max utenti (vuoto = default piano)
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                                    value={maxUsers}
                                    onChange={(e) => setMaxUsers(e.target.value)}
                                    placeholder="es. 2"
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-6">
                            <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={featureSeoGeo}
                                    onChange={(e) => setFeatureSeoGeo(e.target.checked)}
                                />
                                Modulo SEO &amp; GEO
                            </label>
                            <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={featurePdfSuite}
                                    onChange={(e) => setFeaturePdfSuite(e.target.checked)}
                                />
                                PDF AI Studio
                            </label>
                        </div>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void saveCompany()}
                            className="inline-flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-sm hover:bg-black disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            Salva impostazioni
                        </button>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Coins className="w-5 h-5 text-orange-500" />
                            Crediti AI — saldo{" "}
                            <span className="text-orange-600">{detail.aiCreditsBalance}</span>
                        </h2>
                        <div className="grid md:grid-cols-3 gap-4 items-end">
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Importo (+ o −)</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                                    value={creditDelta}
                                    onChange={(e) => setCreditDelta(e.target.value)}
                                    placeholder="es. 100 o -10"
                                />
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo (opz.)</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                                    value={creditReason}
                                    onChange={(e) => setCreditReason(e.target.value)}
                                    placeholder="ricarica / correzione"
                                />
                            </div>
                            <div>
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void applyCredit()}
                                    className="w-full md:w-auto px-5 py-3 rounded-2xl border-2 border-orange-500 text-orange-700 font-black text-sm hover:bg-orange-50 disabled:opacity-50"
                                >
                                    Registra movimento
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-100">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
                                        <th className="p-3">Data</th>
                                        <th className="p-3">Delta</th>
                                        <th className="p-3">Saldo dopo</th>
                                        <th className="p-3">Motivo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detail.aiCreditLedgers.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-6 text-center text-slate-400 font-bold">
                                                Nessun movimento registrato
                                            </td>
                                        </tr>
                                    ) : (
                                        detail.aiCreditLedgers.map((r) => (
                                            <tr key={r.id} className="border-t border-slate-100">
                                                <td className="p-3 whitespace-nowrap text-slate-600">
                                                    {new Date(r.createdAt).toLocaleString("it-IT")}
                                                </td>
                                                <td className="p-3 font-mono font-bold">{r.delta}</td>
                                                <td className="p-3 font-mono">{r.balanceAfter}</td>
                                                <td className="p-3 text-slate-600">{r.reason}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Users className="w-5 h-5 text-orange-500" />
                            Utenti — accesso
                        </h2>
                        <p className="text-xs text-slate-500">
                            Disattivare un utente impedisce il login immediato. L&apos;approvazione workspace è il campo
                            Onboarding sopra.
                        </p>
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                            {detail.users.map((u) => (
                                <li
                                    key={u.id}
                                    className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50/80"
                                >
                                    <div>
                                        <p className="font-bold text-slate-900">{u.email}</p>
                                        <p className="text-xs text-slate-500">
                                            {u.name || "—"} · profilo {u.profile?.name ?? "—"}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void toggleUserActive(u)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm border ${
                                            u.isActive
                                                ? "border-emerald-200 text-emerald-800 bg-emerald-50"
                                                : "border-slate-200 text-slate-500 bg-slate-100"
                                        }`}
                                    >
                                        {u.isActive ? (
                                            <>
                                                <ToggleRight className="w-5 h-5" />
                                                Attivo
                                            </>
                                        ) : (
                                            <>
                                                <ToggleLeft className="w-5 h-5" />
                                                Disattivato
                                            </>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <p className="text-center text-xs text-slate-400 pb-8">
                        Link diretto:{" "}
                        <code className="bg-slate-100 px-1 rounded">/admin/platform?company={selectedId}</code>
                    </p>
                </div>
            )}
        </div>
    );
}
