"use client";

import type { InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";

export type ClearableSearchInputProps = {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    /** Classi sul wrapper `relative` (es. `w-full`, `flex-1 min-w-0`) */
    className?: string;
    /** Icona lente a sinistra */
    showSearchIcon?: boolean;
    iconClassName?: string;
    /**
     * Classi input senza `pr-*` destro: gestito dal componente in base a presenza testo.
     * Includere padding sinistro per l’icona (es. `pl-9`, `pl-12`).
     */
    inputClassName: string;
    paddingRightEmpty?: string;
    paddingRightFilled?: string;
    clearAriaLabel?: string;
    clearButtonClassName?: string;
    /** Se impostato, controlla la visibilità della X al posto di `value.trim()` */
    clearVisible?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type">;

export function ClearableSearchInput({
    value,
    onChange,
    placeholder,
    className = "",
    showSearchIcon = true,
    iconClassName = "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none",
    inputClassName,
    paddingRightEmpty = "pr-3",
    paddingRightFilled = "pr-10",
    clearAriaLabel = "Svuota ricerca",
    clearButtonClassName = "absolute right-0.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 focus:outline-none focus:ring-2 focus:ring-slate-200",
    clearVisible,
    autoComplete = "off",
    ...inputProps
}: ClearableSearchInputProps) {
    const has = clearVisible !== undefined ? clearVisible : value.trim().length > 0;
    const pr = has ? paddingRightFilled : paddingRightEmpty;
    return (
        <div className={`relative ${className}`}>
            {showSearchIcon && <Search className={iconClassName} />}
            <input
                type="text"
                autoComplete={autoComplete}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`${inputClassName} ${pr}`}
                {...inputProps}
            />
            {has && (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    className={clearButtonClassName}
                    aria-label={clearAriaLabel}
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
