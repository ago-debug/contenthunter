"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
    MessageCircle,
    X,
    Send,
    Loader2,
    Sparkles,
    BookOpen,
    ShoppingBag,
    PanelRightOpen,
    PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { useCompanyContext } from "@/contexts/CompanyContext";
import type { RecommendedProductChip } from "@/lib/personal-shopper-enrich";
import {
    PersonalShopperFollowUpChips,
    PersonalShopperSuggestedProducts,
    ShopperReplyText,
} from "@/components/PersonalShopperMessageUI";
import ShopperProductPreviewModal from "@/components/ShopperProductPreviewModal";

type AssistantMode = "iris" | "shopper";

type IrisLine = {
    role: "user" | "assistant";
    text: string;
    guidedSteps?: string[];
    fromCache?: boolean;
};

type ShopperLine = {
    role: "user" | "assistant";
    text: string;
    recommendedProducts?: RecommendedProductChip[];
    followUp?: string[];
    followUpChipRole?: "options" | "answer_chips";
    followUpInteraction?: "buttons" | "hints_only";
};

const IRIS_WELCOME: IrisLine = {
    role: "assistant",
    text: "Ciao! Sono l’assistente Iris. Chiedimi come usare la piattaforma (Biblioteca prodotti, cataloghi, import, integrazioni, salvataggi, AI sui testi). Ti indico anche i passi da seguire.",
};

const SHOPPER_WELCOME: ShopperLine = {
    role: "assistant",
    text: "Sono il **Personal Shopper** sul catalogo aziendale: propongo prodotti dalla biblioteca con tono da consulenza. Descrivi cliente, stile, budget o uso.",
};

const DOCK_KEY = "platformAssistantDock";

export default function PlatformAssistant() {
    const { data: session } = useSession();
    const companyContext = useCompanyContext();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<AssistantMode>("iris");
    const [dock, setDock] = useState<"left" | "right">("right");

    useEffect(() => {
        try {
            const v = localStorage.getItem(DOCK_KEY);
            if (v === "left" || v === "right") setDock(v);
        } catch {
            /* ignore */
        }
    }, []);

    const setDockPersist = (d: "left" | "right") => {
        setDock(d);
        try {
            localStorage.setItem(DOCK_KEY, d);
        } catch {
            /* ignore */
        }
    };

    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [irisMessages, setIrisMessages] = useState<IrisLine[]>([IRIS_WELCOME]);
    const [shopperMessages, setShopperMessages] = useState<ShopperLine[]>([SHOPPER_WELCOME]);
    const [previewSku, setPreviewSku] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const companyId =
        companyContext?.selectedCompanyId ?? (session?.user as { companyId?: number } | undefined)?.companyId;
    const isGlobalAdmin = Boolean((session?.user as { isGlobalAdmin?: boolean } | undefined)?.isGlobalAdmin);

    const companyReq = useMemo(
        () =>
            companyId != null ? { headers: { "x-company-id": String(companyId) } } : { headers: {} as Record<string, string> },
        [companyId]
    );

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [irisMessages, shopperMessages, mode, open, loading]);

    const sendIris = useCallback(async () => {
        const q = input.trim();
        if (!q || loading) return;
        setInput("");
        setIrisMessages((m) => [...m, { role: "user", text: q }]);
        setLoading(true);
        try {
            const res = await fetch("/api/ai/platform-assistant", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(companyId != null ? { "x-company-id": String(companyId) } : {}),
                },
                credentials: "include",
                body: JSON.stringify({ message: q }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || "Errore assistente");
            }
            setIrisMessages((m) => [
                ...m,
                {
                    role: "assistant",
                    text: String(data.answer || ""),
                    guidedSteps: Array.isArray(data.guidedSteps) ? data.guidedSteps : [],
                    fromCache: Boolean(data.fromCache),
                },
            ]);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Errore";
            setIrisMessages((m) => [...m, { role: "assistant", text: `Non sono riuscito a rispondere: ${msg}` }]);
        } finally {
            setLoading(false);
        }
    }, [companyId, input, loading]);

    const sendShopper = useCallback(
        async (override?: string) => {
            const q = (override !== undefined ? override : input).trim();
            if (!q || loading || companyId == null) return;
            setInput("");
            setShopperMessages((m) => [...m, { role: "user", text: q }]);
            setLoading(true);

            const history = shopperMessages.map((line) => ({
                role: line.role,
                content: line.text.replace(/\*\*/g, ""),
            }));

            try {
                const res = await fetch("/api/integrations/woocommerce/personal-shopper", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-company-id": String(companyId),
                    },
                    credentials: "include",
                    body: JSON.stringify({ message: q, history }),
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data?.error || "Errore Personal Shopper");
                }
                const products: RecommendedProductChip[] = Array.isArray(data.recommendedProducts)
                    ? data.recommendedProducts
                    : [];
                const chips: string[] = Array.isArray(data.followUpChips)
                    ? data.followUpChips
                    : Array.isArray(data.followUpQuestions)
                      ? data.followUpQuestions
                      : [];
                const role = data.followUpChipRole === "options" ? "options" : "answer_chips";
                const interaction = data.followUpInteraction === "hints_only" ? "hints_only" : "buttons";
                setShopperMessages((m) => [
                    ...m,
                    {
                        role: "assistant",
                        text: String(data.reply || ""),
                        recommendedProducts: products,
                        followUp: chips,
                        followUpChipRole: role,
                        followUpInteraction: interaction,
                    },
                ]);
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Errore";
                setShopperMessages((m) => [...m, { role: "assistant", text: `Non sono riuscito a rispondere: ${msg}` }]);
            } finally {
                setLoading(false);
            }
        },
        [companyId, input, loading, shopperMessages]
    );

    const send = mode === "iris" ? sendIris : () => void sendShopper();

    const sideClass = dock === "right" ? "right-5" : "left-5";

    if (!session) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`fixed bottom-5 ${sideClass} z-[9990] flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-600 px-4 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-violet-300/40 transition hover:bg-violet-700 ${
                    open ? "pointer-events-none opacity-0" : "opacity-100"
                }`}
                aria-label="Apri assistente (guida piattaforma o Personal Shopper)"
            >
                <MessageCircle className="h-5 w-5 shrink-0" />
                Assistente
            </button>

            {open && (
                <div
                    className={`fixed bottom-5 ${sideClass} z-[9991] flex w-[min(100vw-1.5rem,420px)] max-h-[min(85vh,640px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
                    role="dialog"
                    aria-label={mode === "iris" ? "Assistente piattaforma" : "Personal Shopper catalogo"}
                >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="flex rounded-xl bg-slate-200/80 p-0.5">
                            <button
                                type="button"
                                onClick={() => setMode("iris")}
                                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                                    mode === "iris"
                                        ? "bg-white text-violet-700 shadow-sm"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Guida Iris
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("shopper")}
                                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                                    mode === "shopper"
                                        ? "bg-white text-amber-700 shadow-sm"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Personal Shopper
                            </button>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                type="button"
                                title={dock === "right" ? "Aggancia a sinistra" : "Aggancia a destra"}
                                onClick={() => setDockPersist(dock === "right" ? "left" : "right")}
                                className="rounded-xl p-2 text-slate-500 hover:bg-white hover:text-slate-900"
                                aria-label="Cambia lato pulsante flottante"
                            >
                                {dock === "right" ? (
                                    <PanelLeftOpen className="h-4 w-4" />
                                ) : (
                                    <PanelRightOpen className="h-4 w-4" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-xl p-2 text-slate-500 hover:bg-white hover:text-slate-900"
                                aria-label="Chiudi"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 bg-white">
                        {mode === "iris" ? (
                            <>
                                <Sparkles className="h-5 w-5 shrink-0 text-violet-600" />
                                <div className="min-w-0">
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-800 truncate">
                                        Come usare Iris
                                    </p>
                                    <p className="text-[10px] font-semibold text-slate-500 truncate">
                                        {isGlobalAdmin
                                            ? "Percorsi guidati · cache se domande simili"
                                            : "Passi guidati sulla piattaforma"}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                                <ShoppingBag className="h-5 w-5 shrink-0 text-amber-600" />
                                <div className="min-w-0">
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-800 truncate">
                                        Catalogo · consulenza
                                    </p>
                                    <p className="text-[10px] font-semibold text-slate-500 truncate">
                                        Stessa AI dei canali Woo, senza pubblicare nulla
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
                        {mode === "iris" &&
                            irisMessages.map((line, i) => (
                                <div
                                    key={`i-${i}`}
                                    className={`rounded-xl px-3 py-2.5 text-sm ${
                                        line.role === "user"
                                            ? "ml-6 bg-orange-50 text-slate-900 font-semibold border border-orange-100"
                                            : "mr-4 bg-slate-50 text-slate-800 border border-slate-100"
                                    }`}
                                >
                                    {line.role === "assistant" && line.fromCache && isGlobalAdmin && (
                                        <span className="mb-1 inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800">
                                            Da cache
                                        </span>
                                    )}
                                    <p className="whitespace-pre-wrap leading-relaxed">{line.text}</p>
                                    {line.guidedSteps && line.guidedSteps.length > 0 && (
                                        <ol className="mt-2 list-decimal pl-4 space-y-1 text-xs font-semibold text-slate-700">
                                            {line.guidedSteps.map((step, j) => (
                                                <li key={j}>{step}</li>
                                            ))}
                                        </ol>
                                    )}
                                </div>
                            ))}

                        {mode === "shopper" &&
                            shopperMessages.map((line, i) => (
                                <div
                                    key={`s-${i}`}
                                    className={`rounded-xl px-3 py-2.5 text-sm ${
                                        line.role === "user"
                                            ? "ml-6 bg-amber-100 text-slate-900 font-semibold border border-amber-200"
                                            : "mr-4 bg-slate-50 text-slate-800 border border-slate-100"
                                    }`}
                                >
                                    {line.role === "assistant" ? (
                                        <ShopperReplyText text={line.text} />
                                    ) : (
                                        <p className="whitespace-pre-wrap leading-relaxed">{line.text}</p>
                                    )}
                                    {line.role === "assistant" && line.recommendedProducts && line.recommendedProducts.length > 0 && (
                                        <PersonalShopperSuggestedProducts
                                            variant="app"
                                            products={line.recommendedProducts}
                                            onOpenInApp={(sku) => setPreviewSku(sku)}
                                        />
                                    )}
                                    {line.role === "assistant" && line.followUp && line.followUp.length > 0 && (
                                        <PersonalShopperFollowUpChips
                                            chips={line.followUp}
                                            chipRole={line.followUpChipRole ?? "answer_chips"}
                                            interaction={line.followUpInteraction ?? "buttons"}
                                            onSelect={(fq) => void sendShopper(fq)}
                                        />
                                    )}
                                </div>
                            ))}

                        {loading && (
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 px-1">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {mode === "iris" ? "Analisi in corso…" : "Consulto il catalogo…"}
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <div className="border-t border-slate-100 p-3 space-y-2 bg-white">
                        {mode === "shopper" && companyId == null && (
                            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 rounded-lg px-2 py-1.5 border border-amber-100">
                                Seleziona un&apos;azienda nell&apos;header per usare il Personal Shopper sul catalogo.
                            </p>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                            <BookOpen className="h-3.5 w-3.5 shrink-0" />
                            <Link href="/settings" className="font-bold text-violet-700 hover:underline" onClick={() => setOpen(false)}>
                                Impostazioni
                            </Link>
                            <span>·</span>
                            <Link href="/channels" className="font-bold text-amber-700 hover:underline" onClick={() => setOpen(false)}>
                                Canali
                            </Link>
                            <span>·</span>
                            <Link href="/changelog" className="font-bold text-slate-600 hover:underline" onClick={() => setOpen(false)}>
                                Novità
                            </Link>
                        </div>
                        <div className="flex gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        void send();
                                    }
                                }}
                                rows={2}
                                disabled={loading || (mode === "shopper" && companyId == null)}
                                placeholder={
                                    mode === "iris"
                                        ? "Es. Come salvo il prezzo in Biblioteca prodotti?"
                                        : "Es. Regalo per cucina moderna, budget medio, stile minimal…"
                                }
                                className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                            />
                            <button
                                type="button"
                                disabled={loading || !input.trim() || (mode === "shopper" && companyId == null)}
                                onClick={() => void send()}
                                className={`self-end rounded-xl p-3 text-white disabled:opacity-40 ${
                                    mode === "iris" ? "bg-violet-600 hover:bg-violet-700" : "bg-amber-600 hover:bg-amber-700"
                                }`}
                                aria-label="Invia"
                            >
                                <Send className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ShopperProductPreviewModal
                open={previewSku !== null}
                onClose={() => setPreviewSku(null)}
                sku={previewSku}
                companyReq={companyReq}
            />
        </>
    );
}
