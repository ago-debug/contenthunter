"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const PdfHub = dynamic(() => import("@/components/PdfHub"), {
    ssr: false,
    loading: () => (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-slate-500 bg-slate-50">
            <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
            <p className="text-xs font-bold uppercase tracking-widest">Caricamento PDF...</p>
        </div>
    ),
});

export default function PdfPage() {
    return (
        <Suspense fallback={null}>
            <PdfHub />
        </Suspense>
    );
}
