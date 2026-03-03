"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const ImportLab = dynamic(() => import("@/components/ImportLab"), {
    ssr: false,
    loading: () => (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen gap-4 text-[#111827]/40 bg-slate-50">
            <div className="w-12 h-12 border-4 border-slate-900/10 border-t-slate-900 rounded-full animate-spin"></div>
            <p className="animate-pulse font-black tracking-widest text-[10px] uppercase">Loading Import Lab V3.1...</p>
        </div>
    ),
});

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ImportLab />
        </Suspense>
    );
}
