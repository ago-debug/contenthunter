"use client";

import React, { useState, useRef, useEffect } from 'react';
import { X, Search, Plus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
    value: string | number;
    label: string;
}

interface MultiSearchableSelectProps {
    options: Option[];
    value: (string | number)[];
    onChange: (value: (string | number)[]) => void;
    onAddNew?: (name: string) => void;
    placeholder?: string;
    className?: string;
}

export function MultiSearchableSelect({
    options,
    value,
    onChange,
    onAddNew,
    placeholder = "Seleziona...",
    className = ""
}: MultiSearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(o =>
        o.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleOption = (optValue: string | number) => {
        if (value.includes(optValue)) {
            onChange(value.filter(v => v !== optValue));
        } else {
            onChange([...value, optValue]);
        }
    };

    const isAdded = options.some(o => o.label.toLowerCase() === searchTerm.toLowerCase());

    return (
        <div className={`relative ${className}`} ref={ref}>
            <div
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex flex-wrap gap-2 min-h-[44px] cursor-text hover:border-slate-400 transition-all"
                onClick={() => setIsOpen(true)}
            >
                {value.length > 0 ? (
                    value.map(v => {
                        const opt = options.find(o => o.value === v);
                        return (
                            <span key={v} className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg flex items-center gap-1.5 animate-in zoom-in-95">
                                {opt ? opt.label : v}
                                <X
                                    className="w-3 h-3 cursor-pointer hover:text-red-400"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onChange(value.filter(val => val !== v));
                                    }}
                                />
                            </span>
                        );
                    })
                ) : (
                    <span className="text-sm font-bold text-gray-400 self-center ml-1">{placeholder}</span>
                )}
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl z-[150] overflow-hidden flex flex-col max-h-72"
                    >
                        <div className="p-3 border-b border-gray-50 flex items-center gap-2 bg-slate-50/50">
                            <Search className="w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                className="w-full bg-transparent border-none focus:outline-none text-sm font-bold"
                                placeholder="Cerca o aggiungi nuovo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 pb-2">
                            {searchTerm && !isAdded && onAddNew && (
                                <div
                                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group"
                                    onClick={() => {
                                        onAddNew(searchTerm);
                                        setSearchTerm("");
                                    }}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black uppercase text-blue-600 tracking-widest">Crea nuovo Tag</span>
                                        <span className="text-sm font-bold text-slate-900 mt-0.5">{searchTerm}</span>
                                    </div>
                                    <Plus className="w-4 h-4 text-blue-500" />
                                </div>
                            )}

                            {filteredOptions.length > 0 ? filteredOptions.map((opt) => (
                                <div
                                    key={opt.value}
                                    className={`px-4 py-3 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition-colors border-b border-gray-50 last:border-0 ${value.includes(opt.value) ? 'bg-emerald-50/50' : ''}`}
                                    onClick={() => toggleOption(opt.value)}
                                >
                                    <div className="text-sm font-bold text-slate-900">{opt.label}</div>
                                    {value.includes(opt.value) && <Check className="w-4 h-4 text-emerald-500" />}
                                </div>
                            )) : !onAddNew && (
                                <div className="px-4 py-8 text-center text-slate-400 text-sm font-bold">
                                    Nessun risultato
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
