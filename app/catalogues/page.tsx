"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, FileText, LayoutGrid, List, Search, ArrowRight, HardDrive, Cpu, Package, Layers, Trash2 } from "lucide-react";
import axios from "axios";
import Link from "next/link";

interface Catalogue {
    id: number;
    name: string;
    filePath: string;
    createdAt: string;
    _count: {
        products: number;
    };
}

export default function CataloguesPage() {
    const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchCatalogues = async () => {
        try {
            const resp = await axios.get("/api/catalogues");
            setCatalogues(resp.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchCatalogues();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to purge this asset?")) return;
        try {
            await axios.delete(`/api/catalogues/${id}`);
            setCatalogues(catalogues.filter(c => c.id !== id));
        } catch (err) {
            console.error("Delete error", err);
        }
    };

    const filteredCatalogues = catalogues.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 md:p-12 space-y-12">
            {/* Header / Archive Control */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
                <div className="space-y-2">
                    <h1 className="text-4xl font-black tracking-tight text-[#111827]">
                        Source <span className="text-gray-300">/</span> Archive
                    </h1>
                    <p className="text-gray-500 font-medium tracking-tight">
                        Gestione dei file sorgente PDF e tracciamento delle unità SKU estratte.
                    </p>
                </div>

                <div className="w-full lg:w-[450px] relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#E6D3C1] transition-colors" />
                    <input
                        type="text"
                        placeholder="Cerca per nome file..."
                        className="w-full h-14 bg-white border border-gray-100 rounded-2xl pl-16 pr-8 text-sm focus:outline-none focus:ring-4 focus:ring-[#E6D3C1]/20 focus:border-[#E6D3C1] shadow-sm transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Grid Visualization */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <AnimatePresence>
                    {filteredCatalogues.map((catalogue, idx) => (
                        <motion.div
                            key={catalogue.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: idx * 0.05 }}
                        >
                            <div className="main-card p-8 h-full flex flex-col group hover:border-[#E6D3C1] transition-all duration-300">
                                <div className="flex items-start justify-between mb-8">
                                    <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-[#E6D3C1]/20 transition-colors">
                                        <FileText className="w-8 h-8 text-gray-400 group-hover:text-[#8B735B]" />
                                    </div>
                                    <button
                                        onClick={() => handleDelete(catalogue.id)}
                                        className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="space-y-4 mb-10 flex-1">
                                    <h3 className="text-xl font-bold text-[#111827] group-hover:text-black transition-colors truncate">
                                        {catalogue.name}
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        <div className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <Package className="w-3.5 h-3.5" />
                                            {catalogue._count.products} Unità SKU
                                        </div>
                                        <div className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <Database className="w-3.5 h-3.5" />
                                            Sorgente PDF
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto pt-6 border-t border-gray-50 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Aggiunto il</span>
                                        <span className="text-xs font-bold text-gray-500">{new Date(catalogue.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <Link
                                        href={`/import?id=${catalogue.id}`}
                                        className="px-6 py-2.5 bg-gray-50 text-gray-400 font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-[#E6D3C1] hover:text-black transition-all flex items-center gap-2"
                                    >
                                        Apri Workspace
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredCatalogues.length === 0 && (
                    <div className="col-span-full py-32 flex flex-col items-center justify-center text-center opacity-30">
                        <div className="w-24 h-24 bg-gray-50 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-gray-200">
                            <Search className="w-10 h-10" />
                        </div>
                        <p className="mt-6 text-sm font-bold uppercase tracking-widest">Nessun file trovato nell&apos;archivio</p>
                    </div>
                )}
            </div>

            <div className="flex justify-center items-center gap-12 pt-8 text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    Storage: local_cloud_v1
                </div>
                <div className="flex items-center gap-2 text-green-500/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Server Status: Online
                </div>
            </div>
        </div>
    );
}
