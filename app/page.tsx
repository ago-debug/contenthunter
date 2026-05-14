"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const ProductWorkspace = dynamic(() => import("@/components/ProductWorkspace"), {
    ssr: false,
    loading: () => (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen gap-4 text-[#111827]/40">
            <div className="w-12 h-12 border-4 border-slate-900/20 border-t-slate-900 rounded-full animate-spin"></div>
            <p className="animate-pulse font-bold tracking-widest text-xs uppercase text-slate-900">Caricamento Iris…</p>
        </div>
    ),
});

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ProductWorkspace />
        </Suspense>
    );
}
