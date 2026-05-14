"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanyContext } from "@/contexts/CompanyContext";
import {
    Database,
    FileDown,
    Settings,
    ShieldCheck,
    Globe,
    Cpu,
    Layers,
    List,
    Tag as TagIcon,
    Building2,
    X,
    Globe2,
    Percent,
    History,
    Bell,
    ChevronRight,
    MapPinned,
    Scissors,
    SlidersHorizontal,
    BookOpen,
} from "lucide-react";
import appMeta from "@/data/app-meta.json";

type SidebarProps = { mobileOpen?: boolean; onClose?: () => void };

function formatAppVersionLabel(v: string): string {
    const p = v.trim().split(".");
    if (p.length === 3 && p[2] === "0") return `${p[0]}.${p[1]}`;
    return v;
}

function isTablesPath(p: string) {
    return p === "/tables" || p.startsWith("/tables/");
}

function isAdminSectionPath(p: string) {
    return p === "/admin" || p.startsWith("/admin/");
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
    const pathname = usePathname();
    const { data: session, status: sessionStatus } = useSession();
    const isGlobalAdmin = !!(session?.user as { isGlobalAdmin?: boolean })?.isGlobalAdmin;
    const companyCtx = useCompanyContext();
    const [planFeat, setPlanFeat] = useState<{ seo: boolean; pdf: boolean } | null>(null);

    useEffect(() => {
        if (sessionStatus !== "authenticated") {
            setPlanFeat(null);
            return;
        }
        if (isGlobalAdmin && companyCtx?.selectedCompanyId == null) {
            setPlanFeat({ seo: true, pdf: true });
            return;
        }
        axios
            .get<{ featureSeoGeo?: boolean; featurePdfSuite?: boolean }>("/api/company/features")
            .then((r) =>
                setPlanFeat({
                    seo: !!r.data?.featureSeoGeo,
                    pdf: !!r.data?.featurePdfSuite,
                })
            )
            .catch(() => setPlanFeat({ seo: true, pdf: true }));
    }, [sessionStatus, isGlobalAdmin, companyCtx?.selectedCompanyId]);

    const distributionItems = useMemo(() => {
        const all = [
            { href: "/export", label: "Excel Export", icon: FileDown },
            { href: "/channels", label: "Omnichannel", icon: Globe },
            { href: "/seo-geo", label: "SEO & GEO Hub", icon: MapPinned },
            { href: "/pdf-ai-studio", label: "PDF AI Studio", icon: Scissors },
        ];
        if (planFeat == null) return all;
        return all.filter((it) => {
            if (it.href === "/seo-geo") return planFeat.seo;
            if (it.href === "/pdf-ai-studio") return planFeat.pdf;
            return true;
        });
    }, [planFeat]);

    const productSectionItems = useMemo(() => {
        const all = [
            { href: "/", label: "Prodotti & import", icon: Database },
            { href: "/catalogues", label: "Cataloghi", icon: Layers },
            { href: "/notebook-fonti", label: "Mappa da fonti", icon: BookOpen },
        ];
        if (planFeat == null) return all;
        return all.filter((it) => (it.href === "/notebook-fonti" ? planFeat.pdf : true));
    }, [planFeat]);

    const prevPath = useRef(pathname);

    const [tablesOpen, setTablesOpen] = useState(() => isTablesPath(pathname));
    const [adminOpen, setAdminOpen] = useState(() => isAdminSectionPath(pathname));

    useEffect(() => {
        const prev = prevPath.current;
        if (!isTablesPath(prev) && isTablesPath(pathname)) setTablesOpen(true);
        if (isTablesPath(prev) && !isTablesPath(pathname)) setTablesOpen(false);
        if (!isAdminSectionPath(prev) && isAdminSectionPath(pathname)) setAdminOpen(true);
        if (isAdminSectionPath(prev) && !isAdminSectionPath(pathname)) setAdminOpen(false);
        prevPath.current = pathname;
    }, [pathname]);

    const tableItems = [
        { href: "/tables/categories", label: "Categorie", icon: Layers },
        { href: "/tables/brands", label: "Brand", icon: Globe },
        { href: "/tables/bullets", label: "Bullet points", icon: List },
        { href: "/tables/tags", label: "Tag", icon: TagIcon },
        { href: "/tables/vat-codes", label: "Codici IVA", icon: Percent },
    ];

    const adminSectionItems = useMemo(() => {
        const base = [{ href: "/admin", label: "Control Center", icon: ShieldCheck }];
        if (!isGlobalAdmin) return base;
        return [
            ...base,
            { href: "/admin/platform", label: "Piattaforma & piani", icon: SlidersHorizontal },
            { href: "/admin/companies", label: "Gestione aziende", icon: Building2 },
        ];
    }, [isGlobalAdmin]);

    const monitorItems = [
        { href: "/changelog", label: "Storico modifiche", icon: History },
        { href: "/activities", label: "Attività", icon: Bell },
    ];

    type NavIcon = typeof Database;

    type Block =
        | {
              kind: "section";
              label: string;
              subtitle?: string;
              items: { href: string; label: string; icon: NavIcon }[];
          }
        | {
              kind: "collapsible";
              label: string;
              subtitle?: string;
              open: boolean;
              onToggle: () => void;
              items: { href: string; label: string; icon: NavIcon }[];
          };

    const blocks: Block[] = [
        {
            kind: "section",
            label: "Prodotti & cataloghi",
            subtitle: "Biblioteca, import e cataloghi PDF",
            items: productSectionItems,
        },
        {
            kind: "section",
            label: "Export & canali",
            subtitle: "File, web, SEO locale, PDF AI",
            items: distributionItems,
        },
        {
            kind: "collapsible",
            label: "Tabelle di riferimento",
            subtitle: "Categorie, brand, tag, IVA…",
            open: tablesOpen,
            onToggle: () => setTablesOpen((o) => !o),
            items: tableItems,
        },
        {
            kind: "section",
            label: "Configurazione",
            subtitle: "Account e preferenze",
            items: [{ href: "/settings", label: "Impostazioni", icon: Settings }],
        },
        {
            kind: "collapsible",
            label: "Amministrazione",
            subtitle: "Centro controllo e tenant",
            open: adminOpen,
            onToggle: () => setAdminOpen((o) => !o),
            items: adminSectionItems,
        },
        {
            kind: "section",
            label: "Monitoraggio",
            subtitle: "Versioni e job in corso",
            items: monitorItems,
        },
        {
            kind: "section",
            label: "Automazione",
            subtitle: "Raccolta dati esterni",
            items: [{ href: "/scraping", label: "Scraping Hub", icon: Globe2 }],
        },
    ];

    const displayName =
        session?.user?.name?.trim() ||
        (session?.user as { email?: string })?.email?.split("@")[0] ||
        "Utente";

    const roleLabel = isGlobalAdmin ? "Amministratore globale" : (session?.user as { profileName?: string })?.profileName || "Utente";

    return (
        <aside
            className={`
                w-[85vw] max-w-[300px] lg:w-[260px] bg-white border-r border-slate-200 h-screen flex flex-col px-3 py-5 overflow-y-auto custom-scrollbar shadow-xl
                fixed lg:sticky top-0 left-0 z-[9999] lg:z-50 transform transition-transform duration-300 ease-out
                ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            `}
        >
            <div className="flex items-center justify-between gap-2 mb-6 px-1">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center font-black text-white text-xs shadow-md shrink-0 border border-slate-800">
                    IR
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">Iris</h1>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mt-1">
                        Biblioteca prodotti
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors touch-manipulation -mr-1 border border-transparent hover:border-slate-200"
                    aria-label="Chiudi menu"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <nav className="flex-1 space-y-1">
                {blocks.map((block, bIdx) => (
                    <div
                        key={bIdx}
                        className={`rounded-xl border border-slate-200/90 bg-slate-50/50 p-2 shadow-sm ${bIdx > 0 ? "mt-3" : ""}`}
                    >
                        {block.kind === "collapsible" ? (
                            <button
                                type="button"
                                onClick={block.onToggle}
                                className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/80 transition-colors"
                            >
                                <ChevronRight
                                    className={`w-4 h-4 shrink-0 text-slate-700 mt-0.5 transition-transform ${block.open ? "rotate-90" : ""}`}
                                    aria-hidden
                                />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-900 leading-tight">
                                        {block.label}
                                    </span>
                                    {block.subtitle && (
                                        <span className="block text-[9px] font-semibold text-slate-600 mt-0.5 leading-snug">
                                            {block.subtitle}
                                        </span>
                                    )}
                                </span>
                            </button>
                        ) : (
                            <div className="px-1.5 py-1">
                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-900 leading-tight">
                                    {block.label}
                                </p>
                                {block.subtitle && (
                                    <p className="text-[9px] font-semibold text-slate-600 mt-0.5 leading-snug">{block.subtitle}</p>
                                )}
                            </div>
                        )}

                        {(block.kind === "section" || block.open) && (
                            <ul className={`space-y-0.5 ${block.kind === "collapsible" ? "mt-1 pl-1" : "mt-2"}`}>
                                {block.items.map((item, iIdx) => {
                                    const Icon = item.icon;
                                    const isActive =
                                        item.href === "/"
                                            ? pathname === "/"
                                            : pathname === item.href || pathname.startsWith(item.href + "/");
                                    return (
                                        <li key={iIdx}>
                                            <Link
                                                href={item.href}
                                                onClick={() => onClose?.()}
                                                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-bold text-[12px] transition-all touch-manipulation border ${
                                                    isActive
                                                        ? "bg-slate-900 text-white border-slate-900 shadow-md"
                                                        : "text-slate-700 border-transparent hover:bg-white hover:border-slate-200 hover:text-slate-900"
                                                }`}
                                            >
                                                <span
                                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                                                        isActive
                                                            ? "border-white/20 bg-white/10 text-white"
                                                            : "border-slate-200 bg-white text-slate-700"
                                                    }`}
                                                >
                                                    <Icon className="w-4 h-4" strokeWidth={2} />
                                                </span>
                                                <span className="tracking-tight leading-snug flex-1 text-left">{item.label}</span>
                                                {isActive && (
                                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.9)]" />
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                ))}
            </nav>

            <div className="mt-3 px-0.5">
                <Link
                    href="/changelog"
                    onClick={() => onClose?.()}
                    className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:bg-slate-50 transition-colors shadow-sm"
                >
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.12em]">Release</p>
                    <p className="text-sm font-black text-slate-900 mt-1">v{formatAppVersionLabel(appMeta.version)}</p>
                    <p className="text-[10px] font-bold text-slate-600 mt-0.5 tabular-nums">
                        {new Date(appMeta.lastUpdated).toLocaleString("it-IT", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </p>
                </Link>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mb-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm">
                            <Cpu className="w-4 h-4" strokeWidth={2} />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[11px] font-black text-slate-900 leading-none">AI Hub</span>
                            <span className="text-[9px] font-bold text-slate-600 mt-1">Modelli collegati</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2.5 px-1 py-1">
                    <div className="w-9 h-9 rounded-full bg-slate-200 border-2 border-white shadow shrink-0 ring-1 ring-slate-300" />
                    <div className="flex flex-col overflow-hidden min-w-0">
                        <span className="text-[11px] font-black text-slate-900 truncate">{displayName}</span>
                        <span className="text-[9px] font-bold text-slate-600 truncate">{roleLabel}</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
