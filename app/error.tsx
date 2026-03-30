"use client";

import { useEffect } from "react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("App error:", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 max-w-md w-full text-center">
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6 text-red-500">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">Qualcosa è andato storto</h1>
                <p className="text-sm text-gray-500 mb-6">
                    Si è verificato un errore. Controlla la connessione e riprova.
                </p>
                <button
                    onClick={reset}
                    className="w-full py-3 px-4 bg-[#111827] text-white font-semibold rounded-xl hover:bg-black transition-colors"
                >
                    Riprova
                </button>
            </div>
        </div>
    );
}
