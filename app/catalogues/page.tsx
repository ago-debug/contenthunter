"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, FileText, LayoutGrid, List, Search, ArrowRight, HardDrive, Cpu, Package, Layers, Trash2, Plus, X, Check } from "lucide-react";
import axios from "axios";
import { toast } from "react-toastify";
import Link from "next/link";

interface Catalogue {
    id: number;
    name: string;
    imageFolderPath?: string;
    createdAt: string;
    pdfs: any[];
    _count: {
        products: number;
    };
}

export default function CataloguesPage() {
    const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newRepo, setNewRepo] = useState({
        name: "",
        imageFolderPath: "",
        pdfs: [""]
    });

    const handleCreateRepo = async () => {
        if (!newRepo.name.trim()) {
            toast.error("Inserisci un nome per il progetto");
            return;
        }
        setIsCreating(true);
        try {
            const resp = await axios.post("/api/catalogues", {
                name: newRepo.name,
                imageFolderPath: newRepo.imageFolderPath,
                pdfs: newRepo.pdfs.filter(p => p.trim() !== "")
            });
            toast.success("Repository creato con successo!");
            setIsCreateModalOpen(false);
            setNewRepo({ name: "", imageFolderPath: "", pdfs: [""] });
            fetchCatalogues();
        } catch (err: any) {
            toast.error("Errore durante la creazione: " + err.message);
        } finally {
            setIsCreating(false);
        }
    };

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
                <div className="space-y-1">
                    <h1 className="text-4xl font-black tracking-tight text-[#111827]">
                        Project <span className="text-gray-300">/</span> Repositories
                    </h1>
                    <p className="text-gray-500 font-medium tracking-tight">
                        Gestione dei repository di progetto, configurazione cartelle asset e cataloghi PDF.
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="w-[300px] relative group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-[#E6D3C1] transition-colors" />
                        <input
                            type="text"
                            placeholder="Cerca repository..."
                            className="w-full h-12 bg-white border border-gray-100 rounded-2xl pl-14 pr-6 text-sm focus:outline-none focus:ring-4 focus:ring-[#E6D3C1]/20 focus:border-[#E6D3C1] shadow-sm transition-all font-bold"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="h-12 px-8 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200 flex items-center gap-3"
                    >
                        <Plus className="w-4 h-4" />
                        Nuovo Progetto
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {isCreateModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-10 space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-slate-900 rounded-xl">
                                            <Package className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Crea Repository</h3>
                                            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">Setup Fase 1</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                                        <X className="w-6 h-6 text-slate-400" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block ml-1">Nome Progetto / Repository</label>
                                        <input
                                            value={newRepo.name}
                                            onChange={e => setNewRepo({ ...newRepo, name: e.target.value })}
                                            placeholder="Esempio: Listino 2024 Arredamento"
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block ml-1">Path Cartella Immagini (Locale/Server)</label>
                                        <div className="relative">
                                            <HardDrive className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                value={newRepo.imageFolderPath}
                                                onChange={e => setNewRepo({ ...newRepo, imageFolderPath: e.target.value })}
                                                placeholder="/var/www/images/project_a"
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-14 pr-6 py-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block ml-1">Cataloghi PDF Sorgente</label>
                                            <button
                                                onClick={() => setNewRepo({ ...newRepo, pdfs: [...newRepo.pdfs, ""] })}
                                                className="text-[9px] font-black uppercase tracking-widest text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-all"
                                            >
                                                + Aggiungi PDF
                                            </button>
                                        </div>
                                        <div className="space-y-3 max-h-[150px] overflow-y-auto px-1 custom-scrollbar">
                                            {newRepo.pdfs.map((pdf, idx) => (
                                                <div key={idx} className="flex items-center gap-3">
                                                    <div className="flex-1 relative">
                                                        <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                        <input
                                                            value={pdf}
                                                            onChange={e => {
                                                                const updated = [...newRepo.pdfs];
                                                                updated[idx] = e.target.value;
                                                                setNewRepo({ ...newRepo, pdfs: updated });
                                                            }}
                                                            placeholder="/uploads/catalogo_marzo.pdf"
                                                            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-3 text-[11px] font-bold focus:outline-none focus:border-slate-400"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => setNewRepo({ ...newRepo, pdfs: newRepo.pdfs.filter((_, i) => i !== idx) })}
                                                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 flex gap-4">
                                    <button
                                        onClick={() => setIsCreateModalOpen(false)}
                                        className="flex-1 px-8 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all"
                                    >
                                        Annulla
                                    </button>
                                    <button
                                        onClick={handleCreateRepo}
                                        disabled={isCreating}
                                        className="flex-[2] px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {isCreating ? (
                                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Check className="w-4 h-4" />
                                        )}
                                        Inizializza Repository
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
        </div >
    );
}
