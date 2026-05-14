"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircleWarning } from "lucide-react";

type AppDialogsContextValue = {
    confirm: (message: string) => Promise<boolean>;
    prompt: (message: string, defaultValue?: string) => Promise<string | null>;
    alert: (message: string) => Promise<void>;
};

const AppDialogsContext = createContext<AppDialogsContextValue | null>(null);

type OpenDialog =
    | {
          kind: "confirm";
          message: string;
          resolve: (v: boolean) => void;
      }
    | {
          kind: "alert";
          message: string;
          resolve: () => void;
      }
    | {
          kind: "prompt";
          message: string;
          defaultValue: string;
          resolve: (v: string | null) => void;
      };

export function AppDialogsProvider({ children }: { children: React.ReactNode }) {
    const mutexRef = useRef(Promise.resolve());
    const [open, setOpen] = useState<OpenDialog | null>(null);
    const [promptValue, setPromptValue] = useState("");
    const promptInputRef = useRef<HTMLInputElement | null>(null);

    const chain = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
        const p = mutexRef.current.then(() => task());
        mutexRef.current = p.then(
            () => {},
            () => {}
        );
        return p;
    }, []);

    const confirm = useCallback(
        (message: string): Promise<boolean> =>
            chain(
                () =>
                    new Promise<boolean>((resolve) => {
                        setOpen({
                            kind: "confirm",
                            message,
                            resolve: (v) => {
                                resolve(v);
                                setOpen(null);
                            },
                        });
                    })
            ),
        [chain]
    );

    const alertFn = useCallback(
        (message: string): Promise<void> =>
            chain(
                () =>
                    new Promise<void>((resolve) => {
                        setOpen({
                            kind: "alert",
                            message,
                            resolve: () => {
                                resolve();
                                setOpen(null);
                            },
                        });
                    })
            ),
        [chain]
    );

    const promptFn = useCallback(
        (message: string, defaultValue = ""): Promise<string | null> =>
            chain(
                () =>
                    new Promise<string | null>((resolve) => {
                        const dv = defaultValue ?? "";
                        setPromptValue(dv);
                        setOpen({
                            kind: "prompt",
                            message,
                            defaultValue: dv,
                            resolve: (v) => {
                                resolve(v);
                                setOpen(null);
                            },
                        });
                    })
            ),
        [chain]
    );

    useEffect(() => {
        if (open?.kind === "prompt") {
            setPromptValue(open.defaultValue);
            const t = window.setTimeout(() => promptInputRef.current?.focus(), 50);
            return () => window.clearTimeout(t);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (open.kind === "confirm") open.resolve(false);
                else if (open.kind === "prompt") open.resolve(null);
                else open.resolve();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const value = useMemo<AppDialogsContextValue>(
        () => ({ confirm, prompt: promptFn, alert: alertFn }),
        [confirm, promptFn, alertFn]
    );

    return (
        <AppDialogsContext.Provider value={value}>
            {children}
            <AnimatePresence>
                {open && (
                    <div className="fixed inset-0 z-[20050] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => {
                                if (open.kind === "confirm") open.resolve(false);
                                else if (open.kind === "prompt") open.resolve(null);
                                else open.resolve();
                            }}
                        />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-100"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start gap-3 mb-4">
                                <div className="p-2.5 bg-slate-900 rounded-xl shrink-0">
                                    <MessageCircleWarning className="w-5 h-5 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    {open.kind === "prompt" ? (
                                        <>
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                                                {open.message}
                                            </p>
                                            <input
                                                ref={promptInputRef}
                                                type="text"
                                                value={promptValue}
                                                onChange={(e) => setPromptValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        open.resolve(promptValue);
                                                    }
                                                }}
                                                className="mt-3 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                                            />
                                        </>
                                    ) : (
                                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                                            {open.message}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 pt-2">
                                {open.kind === "confirm" && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => open.resolve(true)}
                                            className="w-full py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-black text-sm"
                                        >
                                            OK
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => open.resolve(false)}
                                            className="w-full py-2.5 text-gray-500 font-medium text-sm"
                                        >
                                            Annulla
                                        </button>
                                    </>
                                )}
                                {open.kind === "alert" && (
                                    <button
                                        type="button"
                                        onClick={() => open.resolve()}
                                        className="w-full py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-black text-sm"
                                    >
                                        OK
                                    </button>
                                )}
                                {open.kind === "prompt" && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => open.resolve(promptValue)}
                                            className="w-full py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-black text-sm"
                                        >
                                            OK
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => open.resolve(null)}
                                            className="w-full py-2.5 text-gray-500 font-medium text-sm"
                                        >
                                            Annulla
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </AppDialogsContext.Provider>
    );
}

export function useAppDialogs(): AppDialogsContextValue {
    const ctx = useContext(AppDialogsContext);
    if (!ctx) {
        throw new Error("useAppDialogs must be used within AppDialogsProvider");
    }
    return ctx;
}
