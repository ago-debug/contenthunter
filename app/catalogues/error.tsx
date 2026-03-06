"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CataloguesError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Catalogues page error:", error);
    }, [error]);

    return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
                <h2 className="text-lg font-bold text-gray-900 mb-2">Errore Catalogues</h2>
                <p className="text-sm text-gray-500 mb-6">
                    Impossibile caricare i cataloghi. Verifica la connessione al server.
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="py-2.5 px-5 bg-[#111827] text-white font-semibold rounded-xl hover:bg-black transition-colors"
                    >
                        Riprova
                    </button>
                    <Link
                        href="/"
                        className="py-2.5 px-5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                    >
                        Torna al Master
                    </Link>
                </div>
            </div>
        </div>
    );
}
