"use client";

import React, { Suspense, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Database, Sparkles } from "lucide-react";
import { CatalogProvider } from "@/components/CatalogContext";

const ErpTable = dynamic(() => import("@/components/ErpTable"), { ssr: false });
const ImportLab = dynamic(() => import("@/components/ImportLab"), { ssr: false });

type TabId = "library" | "import";

function ProductWorkspaceInner() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tab: TabId = searchParams.get("tab") === "import" ? "import" : "library";

    const setTab = useCallback(
        (next: TabId) => {
            const p = new URLSearchParams(searchParams.toString());
            if (next === "import") p.set("tab", "import");
            else p.delete("tab");
            const qs = p.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname || "/", { scroll: false });
        },
        [pathname, router, searchParams]
    );

    const tabBar = useMemo(
        () => (
            <div className="shrink-0 border-b border-slate-200/80 bg-white px-2 sm:px-3 py-1 flex items-center">
                <div className="inline-flex gap-px p-px rounded-md bg-slate-100 border border-slate-200/70" role="tablist" aria-label="Sezione prodotti">
                    <button
                        type="button"
                        onClick={() => setTab("library")}
                        role="tab"
                        aria-selected={tab === "library"}
                        className={
                            "inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1 rounded-[5px] text-[8px] font-black uppercase tracking-wide transition-colors whitespace-nowrap " +
                            (tab === "library"
                                ? "bg-slate-900 text-white"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/80")
                        }
                    >
                        <Database className="w-3 h-3 shrink-0" aria-hidden />
                        Biblioteca
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab("import")}
                        role="tab"
                        aria-selected={tab === "import"}
                        className={
                            "inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1 rounded-[5px] text-[8px] font-black uppercase tracking-wide transition-colors whitespace-nowrap " +
                            (tab === "import"
                                ? "bg-slate-900 text-white"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/80")
                        }
                    >
                        <Sparkles className="w-3 h-3 shrink-0 text-amber-500" aria-hidden />
                        Import
                    </button>
                </div>
            </div>
        ),
        [setTab, tab]
    );

    return (
        <div className="flex flex-col flex-1 min-h-0 h-[calc(100vh-80px)] max-h-[calc(100vh-80px)] bg-[#F9FAFB]">
            {tabBar}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {tab === "library" ? (
                    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                        <ErpTable />
                    </div>
                ) : (
                    <CatalogProvider>
                        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                            <ImportLab />
                        </div>
                    </CatalogProvider>
                )}
            </div>
        </div>
    );
}

export default function ProductWorkspace() {
    return (
        <Suspense
            fallback={
                <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] gap-4 text-[#111827]/40">
                    <div className="w-12 h-12 border-4 border-slate-900/20 border-t-slate-900 rounded-full animate-spin" />
                    <p className="animate-pulse font-bold tracking-widest text-xs uppercase text-slate-900">Caricamento…</p>
                </div>
            }
        >
            <ProductWorkspaceInner />
        </Suspense>
    );
}
