"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
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
    ChevronDown,
} from "lucide-react";
import appMeta from "@/data/app-meta.json";

type SidebarProps = { mobileOpen?: boolean; onClose?: () => void };

/** Es. 2.5.0 → 2.5 in etichetta; 2.5.1 resta completo. */
function formatAppVersionLabel(v: string): string {
    const p = v.trim().split(".");
    if (p.length === 3 && p[2] === "0") return `${p[0]}.${p[1]}`;
    return v;
}

function isTablesPath(p: string) {
    return p === "/tables" || p.startsWith("/tables/");
}

function isSystemPath(p: string) {
    return (
        p === "/changelog" ||
        p.startsWith("/settings") ||
        p.startsWith("/admin") ||
        p.startsWith("/activities")
    );
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
    const pathname = usePathname();
    const { data: session } = useSession();
    const isGlobalAdmin = !!(session?.user as any)?.isGlobalAdmin;

    const prevPath = useRef(pathname);

    const [tablesOpen, setTablesOpen] = useState(() => isTablesPath(pathname));
    const [systemOpen, setSystemOpen] = useState(() => isSystemPath(pathname));

    useEffect(() => {
        const prev = prevPath.current;
        if (!isTablesPath(prev) && isTablesPath(pathname)) {
            setTablesOpen(true);
        }
        if (isTablesPath(prev) && !isTablesPath(pathname)) {
            setTablesOpen(false);
        }
        if (!isSystemPath(prev) && isSystemPath(pathname)) {
            setSystemOpen(true);
        }
        if (isSystemPath(prev) && !isSystemPath(pathname)) {
            setSystemOpen(false);
        }
        prevPath.current = pathname;
    }, [pathname]);

    const systemItems = [
        { href: "/settings", label: "Settings", icon: Settings },
        { href: "/admin", label: "Control Center", icon: ShieldCheck },
        ...(isGlobalAdmin ? [{ href: "/admin/companies", label: "Gestione aziende", icon: Building2 }] : []),
        { href: "/changelog", label: "Storico modifiche", icon: History },
    ];

    const menuGroups: {
        label: string;
        collapsible?: boolean;
        open?: boolean;
        onToggle?: () => void;
        items: { href: string; label: string; icon: typeof Database }[];
    }[] = [
        {
            label: "Core PIM",
            items: [{ href: "/", label: "Master ERP", icon: Database }],
        },
        {
            label: "Distribution",
            items: [
                { href: "/export", label: "Excel Export", icon: FileDown },
                { href: "/channels", label: "Omnichannel", icon: Globe },
            ],
        },
        {
            label: "Gestione Tabelle",
            collapsible: true,
            open: tablesOpen,
            onToggle: () => setTablesOpen((o) => !o),
            items: [
                { href: "/tables/categories", label: "Categorie", icon: Layers },
                { href: "/tables/brands", label: "Brand", icon: Globe },
                { href: "/tables/bullets", label: "Bullet points", icon: List },
                { href: "/tables/tags", label: "Tag", icon: TagIcon },
                { href: "/tables/vat-codes", label: "Codici IVA", icon: Percent },
            ],
        },
        {
            label: "System & AI",
            collapsible: true,
            open: systemOpen,
            onToggle: () => setSystemOpen((o) => !o),
            items: [...systemItems, { href: "/activities", label: "Attività", icon: Bell }],
        },
        {
            label: "Scraping",
            items: [{ href: "/scraping", label: "Scraping Hub", icon: Globe2 }],
        },
    ];

    return (
        <aside
            className={`
                w-[85vw] max-w-[300px] lg:w-60 bg-white border-r border-slate-200 h-screen flex flex-col px-3 py-5 overflow-y-auto custom-scrollbar shadow-xl
                fixed lg:sticky top-0 left-0 z-[9999] lg:z-50 transform transition-transform duration-300 ease-out
                ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            `}
        >
            <div className="flex items-center justify-between gap-2 mb-5 px-1">
                <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center font-black text-white shadow-lg overflow-hidden shrink-0">
                    <span className="text-xs">CH</span>
                </div>
                <div className="min-w-0">
                    <h1 className="text-base font-black tracking-tight text-slate-900 leading-none">
                        Content<span className="text-slate-900">Hunter</span>
                    </h1>
                    <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">Enterprise PIM</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors touch-manipulation -mr-1"
                    aria-label="Chiudi menu"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <nav className="flex-1">
                {menuGroups.map((group, gIdx) => (
                    <div
                        key={gIdx}
                        className={`space-y-0.5 ${gIdx > 0 ? "mt-4 pt-3 border-t border-slate-100" : ""}`}
                    >
                        {group.collapsible ? (
                            <button
                                type="button"
                                onClick={group.onToggle}
                                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[8px] font-semibold text-slate-500 uppercase tracking-[0.12em] hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                            >
                                <ChevronDown
                                    className={`w-3 h-3 shrink-0 text-slate-400 transition-transform ${group.open ? "" : "-rotate-90"}`}
                                    aria-hidden
                                />
                                <span className="flex-1">{group.label}</span>
                            </button>
                        ) : (
                            <h3 className="px-2 py-1.5 mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-900 bg-slate-100 border border-slate-200/90 rounded-xl shadow-sm">
                                {group.label}
                            </h3>
                        )}
                        {(!group.collapsible || group.open) && (
                            <div className="space-y-px">
                                {group.items.map((item, iIdx) => {
                                    const Icon = item.icon;
                                    const isActive =
                                        item.href === "/"
                                            ? pathname === "/"
                                            : pathname === item.href || pathname.startsWith(item.href + "/");
                                    return (
                                        <Link
                                            key={iIdx}
                                            href={item.href}
                                            onClick={() => onClose?.()}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg font-bold text-[11px] transition-all group touch-manipulation ${
                                                isActive
                                                    ? "bg-slate-100 text-slate-900 border border-slate-200"
                                                    : "text-slate-400 hover:bg-slate-50/50 hover:text-slate-600"
                                            }`}
                                        >
                                            <div
                                                className={`p-1 rounded-md transition-all ${
                                                    isActive
                                                        ? "bg-white shadow-sm text-slate-900 border border-slate-200"
                                                        : "text-slate-300 group-hover:text-slate-500"
                                                }`}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <span className="tracking-tight leading-tight">{item.label}</span>
                                            {isActive && (
                                                <div className="ml-auto w-1 h-1 rounded-full bg-slate-900 shadow-[0_0_8px_rgba(0,0,0,0.2)] shrink-0" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </nav>

            <div className="mt-2 px-1">
                <Link
                    href="/changelog"
                    onClick={() => onClose?.()}
                    className="block rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2 hover:bg-slate-50 hover:border-slate-200 transition-colors"
                >
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.15em]">Release</p>
                    <p className="text-sm font-black text-slate-900 mt-0.5">v{formatAppVersionLabel(appMeta.version)}</p>
                    <p className="text-[9px] font-bold text-slate-500 mt-0.5 tabular-nums">
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

            <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 transition-all cursor-pointer group mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 group-hover:border-slate-300 group-hover:text-slate-900 transition-all">
                            <Cpu className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-black text-slate-900 leading-none">AI Hub</span>
                            <span className="text-[8px] font-bold text-slate-400 mt-0.5">GPT-4o Ready</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-1 py-1">
                    <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white shadow-sm shrink-0" />
                    <div className="flex flex-col overflow-hidden min-w-0">
                        <span className="text-[10px] font-black text-slate-900 truncate">Augusto Genca</span>
                        <span className="text-[8px] font-bold text-slate-400">PIM Administrator</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
