"use client";

import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

interface Option {
    value: string | number;
    label: string;
    subLabel?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string | number | null;
    onChange: (value: string | number | null) => void;
    onAddNew?: (name: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    showSearch?: boolean;
}

export function SearchableSelect({
    options,
    value,
    onChange,
    onAddNew,
    placeholder = "Seleziona...",
    className = "",
    disabled = false,
    showSearch = true
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const portalId = useId().replace(/:/g, '');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (ref.current?.contains(target)) return;
            const portalRoot = document.getElementById(portalId);
            if (portalRoot?.contains(target)) return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [portalId]);

    const openDropdown = () => {
        if (disabled) return;
        if (!isOpen && ref.current) {
            const rect = ref.current.getBoundingClientRect();
            setDropdownRect({
                top: rect.bottom + 8,
                left: rect.left,
                width: Math.max(rect.width, 200)
            });
            setSearchTerm("");
        }
        setIsOpen(!isOpen);
    };

    const selectedOption = options.find(o => o.value === value);

    const filteredOptions = showSearch
        ? options.filter(o =>
            o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.subLabel?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        : options;

    const dropdownContent = isOpen && !disabled && dropdownRect && typeof document !== 'undefined' && (
        <div
            id={portalId}
            className="fixed bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-60 flex flex-col"
            style={{
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
                zIndex: 9999
            }}
        >
            {showSearch && (
                <div className="p-2 border-b border-gray-50 flex items-center gap-2 bg-slate-50/50 shrink-0">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                        type="text"
                        className="w-full bg-transparent border-none focus:outline-none text-sm font-bold"
                        placeholder="Cerca..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                    />
                </div>
            )}
            <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <div
                    className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-400 italic font-bold"
                    onClick={() => {
                        onChange(null);
                        setIsOpen(false);
                    }}
                >
                    Nessuna selezione
                </div>
                {filteredOptions.length > 0 ? (
                    filteredOptions.map((opt, i) => (
                        <div
                            key={i}
                            className={`px-4 py-3 hover:bg-emerald-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${value === opt.value ? 'bg-emerald-50/50' : ''}`}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                                setSearchTerm("");
                            }}
                        >
                            <div className="text-sm font-bold text-slate-900">{opt.label}</div>
                            {opt.subLabel && <div className="text-[10px] font-black uppercase text-slate-400 mt-0.5">{opt.subLabel}</div>}
                        </div>
                    ))
                ) : searchTerm.trim() !== "" && onAddNew ? (
                    <div
                        className="px-4 py-6 border-2 border-dashed border-emerald-100 m-2 rounded-xl bg-emerald-50/20 hover:bg-emerald-50 transition-all cursor-pointer group"
                        onClick={() => {
                            onAddNew(searchTerm);
                            setIsOpen(false);
                            setSearchTerm("");
                        }}
                    >
                        <div className="flex flex-col items-center gap-2 text-center text-emerald-600">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Search className="w-4 h-4" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-wider">Crea nuova voce:</p>
                            <span className="text-sm font-bold text-slate-800 break-all px-2 italic">"{searchTerm}"</span>
                        </div>
                    </div>
                ) : (
                    <div className="px-4 py-8 text-center text-slate-400 text-sm font-bold">
                        Nessun risultato
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <>
            <div className={`relative ${className}`} ref={ref}>
                <div
                    className={`w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-400'}`}
                    onClick={openDropdown}
                >
                    <span className={`text-sm font-bold ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>
            {typeof document !== 'undefined' && dropdownContent && createPortal(dropdownContent, document.body)}
        </>
    );
}
