"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Send, ShoppingBag, Sparkles } from "lucide-react";
import type { RecommendedProductChip } from "@/lib/personal-shopper-enrich";
import {
    PersonalShopperFollowUpChips,
    PersonalShopperSuggestedProducts,
    ShopperReplyText,
} from "@/components/PersonalShopperMessageUI";

type Line = {
    role: "user" | "assistant";
    text: string;
    recommendedProducts?: RecommendedProductChip[];
    followUp?: string[];
    followUpChipRole?: "options" | "answer_chips";
    followUpInteraction?: "buttons" | "hints_only";
};

function EmbedChatInner({
    token,
    float,
    corner,
}: {
    token: string;
    float: boolean;
    corner: "left" | "right";
}) {
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState<Line[]>([
        {
            role: "assistant",
            text: "Ciao! Sono il **Personal Shopper** del negozio. Dimmi per chi stai acquistando, stile, budget o ambiente: ti propongo idee coerenti con il catalogo.",
        },
    ]);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const sendMessage = useCallback(
        async (override?: string) => {
            const q = (override !== undefined ? override : input).trim();
            if (!q || loading || !token) return;
            setInput("");
            setMessages((m) => [...m, { role: "user", text: q }]);
            setLoading(true);
            const history = messages.map((line) => ({
                role: line.role,
                content: line.text.replace(/\*\*/g, ""),
            }));
            try {
                const res = await fetch("/api/public/woo-personal-shopper", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, message: q, history }),
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data?.error || "Errore");
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
                setMessages((m) => [
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
                setMessages((m) => [...m, { role: "assistant", text: `Spiacenti: ${msg}` }]);
            } finally {
                setLoading(false);
            }
        },
        [input, loading, messages, token]
    );

    const panel = (
        <div className="flex max-h-[min(85vh,560px)] flex-col overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-amber-50 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white">
                <ShoppingBag className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-widest">Personal Shopper</p>
                    <p className="truncate text-[10px] font-semibold opacity-90">Powered by Content Hunter</p>
                </div>
                <Sparkles className="ml-auto h-4 w-4 opacity-90" />
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 min-h-0">
                {messages.map((line, i) => (
                    <div
                        key={i}
                        className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                            line.role === "user"
                                ? "ml-6 bg-amber-500 text-white"
                                : "mr-2 border border-slate-100 bg-slate-50 text-slate-800"
                        }`}
                    >
                        {line.role === "assistant" ? (
                            <ShopperReplyText text={line.text} />
                        ) : (
                            <p className="whitespace-pre-wrap font-medium">{line.text}</p>
                        )}
                        {line.role === "assistant" && line.recommendedProducts && line.recommendedProducts.length > 0 && (
                            <PersonalShopperSuggestedProducts variant="embed" products={line.recommendedProducts} />
                        )}
                        {line.role === "assistant" && line.followUp && line.followUp.length > 0 && (
                            <PersonalShopperFollowUpChips
                                chips={line.followUp}
                                chipRole={line.followUpChipRole ?? "answer_chips"}
                                interaction={line.followUpInteraction ?? "buttons"}
                                onSelect={(fq) => void sendMessage(fq)}
                            />
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Un momento…
                    </div>
                )}
                <div ref={bottomRef} />
            </div>
            <div className="border-t border-slate-100 p-3 shrink-0">
                <div className="flex gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void sendMessage();
                            }
                        }}
                        rows={2}
                        disabled={loading}
                        placeholder="Scrivi qui…"
                        className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    />
                    <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={loading || !input.trim()}
                        className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-40"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    );

    if (float) {
        const side = corner === "left" ? "left-4 right-auto" : "right-4 left-auto";
        return (
            <div className={`fixed bottom-4 ${side} z-50 w-[min(100vw-2rem,400px)] max-h-[min(100vh-2rem,580px)] flex flex-col`}>
                {panel}
            </div>
        );
    }

    return panel;
}

function EmbedChat() {
    const searchParams = useSearchParams();
    const token = (searchParams.get("token") || "").trim();
    const float =
        searchParams.get("float") === "1" ||
        searchParams.get("layout") === "float" ||
        searchParams.get("dock") === "float";
    const cornerRaw = (searchParams.get("corner") || "right").toLowerCase();
    const corner: "left" | "right" = cornerRaw === "left" ? "left" : "right";

    if (!token) {
        return (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/80 p-8 text-center text-sm font-semibold text-amber-900">
                Parametro <code className="rounded bg-white px-1">token</code> mancante nell&apos;URL dell&apos;iframe.
                Configura il widget in Content Hunter → Impostazioni → WooCommerce.
            </div>
        );
    }

    return (
        <div
            className={
                float
                    ? "min-h-0 bg-transparent"
                    : "min-h-screen bg-gradient-to-b from-amber-50/50 to-white p-3 md:p-6"
            }
        >
            <EmbedChatInner token={token} float={float} corner={corner} />
        </div>
    );
}

export default function EmbedPersonalShopperPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[200px] items-center justify-center text-sm font-semibold text-slate-500">
                    Caricamento…
                </div>
            }
        >
            <EmbedChat />
        </Suspense>
    );
}
