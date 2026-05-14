"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { X, Package, Loader2 } from "lucide-react";

type ProductRow = {
    id: number;
    sku: string;
    title: string;
    price: string;
    brand: string;
    category: string;
    description: string;
    docDescription: string;
    bulletPoints: string;
    images: { id: string; url: string }[];
};

export default function ShopperProductPreviewModal({
    open,
    onClose,
    sku,
    companyReq,
}: {
    open: boolean;
    onClose: () => void;
    sku: string | null;
    companyReq: { headers: Record<string, string> };
}) {
    const [data, setData] = useState<ProductRow | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [imgIdx, setImgIdx] = useState(0);

    useEffect(() => {
        setImgIdx(0);
        if (!open || !sku) {
            setData(null);
            setErr(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setErr(null);
        axios
            .get<ProductRow[]>(`/api/products?sku=${encodeURIComponent(sku)}`, companyReq)
            .then((res) => {
                const arr = Array.isArray(res.data) ? res.data : [];
                const p = arr[0];
                if (cancelled) return;
                if (p) setData(p);
                else setErr("Prodotto non trovato in biblioteca.");
            })
            .catch(() => {
                if (!cancelled) setErr("Impossibile caricare la scheda.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, sku, companyReq]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50 p-3 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label="Anteprima prodotto"
            onClick={onClose}
        >
            <div
                className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Package className="h-5 w-5 shrink-0 text-amber-600" />
                        <p className="truncate text-sm font-black text-slate-900">Scheda prodotto</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-2 text-slate-500 hover:bg-white hover:text-slate-900"
                        aria-label="Chiudi"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {loading && (
                        <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-500">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Caricamento…
                        </div>
                    )}
                    {err && !loading && (
                        <p className="px-4 py-10 text-center text-sm font-semibold text-red-600">{err}</p>
                    )}
                    {data && !loading && (
                        <div className="space-y-4 p-4">
                            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100">
                                {data.images && data.images.length > 0 ? (
                                    <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={data.images[imgIdx]?.url || data.images[0].url}
                                            alt=""
                                            className="h-full w-full object-contain"
                                        />
                                        {data.images.length > 1 && (
                                            <div className="absolute bottom-2 left-1/2 flex max-w-full -translate-x-1/2 gap-1 overflow-x-auto px-2">
                                                {data.images.map((im, i) => (
                                                    <button
                                                        key={im.id}
                                                        type="button"
                                                        onClick={() => setImgIdx(i)}
                                                        className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 bg-white ${
                                                            i === imgIdx ? "border-amber-500" : "border-transparent opacity-70"
                                                        }`}
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={im.url} alt="" className="h-full w-full object-cover" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">
                                        Nessuna immagine
                                    </div>
                                )}
                            </div>

                            <div>
                                <h2 className="text-lg font-black leading-tight text-slate-900">{data.title || data.sku}</h2>
                                <p className="mt-1 text-sm font-bold text-amber-700">
                                    {data.price ? `${data.price} €` : "Prezzo —"}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
                                    {data.brand ? (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{data.brand}</span>
                                    ) : null}
                                    {data.category ? (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{data.category}</span>
                                    ) : null}
                                </div>
                            </div>

                            {data.description ? (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descrizione</p>
                                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                                        {data.description}
                                    </p>
                                </div>
                            ) : null}

                            {data.docDescription ? (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Descrizione documentale
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
                                        {data.docDescription}
                                    </p>
                                </div>
                            ) : null}

                            {data.bulletPoints ? (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bullet</p>
                                    <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-700">{data.bulletPoints}</p>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
