"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const WorkspaceClient = dynamic(() => import("@/components/WorkspaceClient"), {
    ssr: false,
    loading: () => (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen gap-4 text-[#111827]/40">
            <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
            <p className="animate-pulse font-bold tracking-widest text-xs uppercase">Loading Workspace Module...</p>
        </div>
    ),
});

export default function Page() {
    return (
        <Suspense fallback={null}>
            <WorkspaceClient />
        </Suspense>
    );
}
