import React, { useState, useRef, useEffect } from 'react';
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
}

export function SearchableSelect({ options, value, onChange, onAddNew, placeholder = "Seleziona...", className = "", disabled = false }: SearchableSelectProps) {
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

    const selectedOption = options.find(o => o.value === value);

    const filteredOptions = options.filter(o =>
        o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.subLabel?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={`relative ${className}`} ref={ref}>
            <div
                className={`w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-400'}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className={`text-sm font-bold ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && !disabled && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 flex flex-col">
                    <div className="p-2 border-b border-gray-50 flex items-center gap-2 bg-slate-50/50">
                        <Search className="w-4 h-4 text-slate-400" />
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
                    <div className="overflow-y-auto custom-scrollbar flex-1">
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
            )}
        </div>
    );
}
