"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileDown, List, Database, Search, HardDrive, Cpu, Package, CheckCircle2 } from "lucide-react";
import axios from "axios";

export default function ExportPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const resp = await axios.get("/api/products");
                setProducts(resp.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchProducts();
    }, []);

    const handleGenerateLedger = () => {
        window.location.href = "/api/export";
    };

    const filteredProducts = products.filter(p =>
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="p-8 md:p-12 space-y-12">
            {/* Header / Export Control */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-10">
                <div className="space-y-4 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-4">
                        <div className="p-3 bg-[#E6D3C1]/20 rounded-xl border border-[#E6D3C1]/30">
                            <FileDown className="w-8 h-8 text-[#8B735B]" />
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-[#111827]">
                            Export <span className="text-gray-300">/</span> Console
                        </h1>
                    </div>
                    <p className="text-gray-500 font-medium tracking-tight">
                        Generazione manifesti XLSX per integrazione ERP e logistica.
                    </p>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="flex gap-10 px-8 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Voci Totali</span>
                            <span className="text-2xl font-bold text-[#111827]">{products.length}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stato Coda</span>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="text-xs font-bold text-green-600 uppercase">Pronta</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleGenerateLedger}
                        disabled={products.length === 0}
                        className="btn-primary py-4 px-10 flex items-center gap-3 disabled:opacity-20 shadow-lg active:scale-95"
                    >
                        <FileDown className="w-5 h-5" />
                        Esporta Ledger XLSX
                    </button>
                </div>
            </div>

            {/* List Visualization */}
            <div className="main-card overflow-hidden">
                <div className="p-8 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6 bg-gray-50/30">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                            <List className="w-6 h-6 text-gray-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-[#111827]">Coda di Esportazione</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Asset pronti per il trasferimento finale</p>
                        </div>
                    </div>

                    <div className="w-full md:w-80 relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-[#E6D3C1] transition-colors" />
                        <input
                            type="text"
                            placeholder="Filtra coda SKU..."
                            className="w-full h-12 bg-white border border-gray-100 rounded-xl pl-12 pr-6 text-sm focus:outline-none focus:ring-4 focus:ring-[#E6D3C1]/20 focus:border-[#E6D3C1] transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <th className="px-8 py-4">Codice SKU</th>
                                <th className="px-8 py-4">Descrizione Prodotto</th>
                                <th className="px-8 py-4">Prezzo</th>
                                <th className="px-8 py-4 text-right">Verifica</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredProducts.map((p, idx) => (
                                <tr key={p.id || idx} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-8 py-6">
                                        <span className="font-mono font-bold text-[#E6D3C1] bg-black px-3 py-1.5 rounded-lg text-sm">{p.sku}</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-900">{p.name || "N/A"}</span>
                                            <span className="text-[10px] text-gray-400 uppercase font-bold">{p.category || "Generale"}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="font-bold text-gray-900">{p.price || "€ 0,00"}</span>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-green-100">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                            Verificato
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredProducts.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="px-8 py-20 text-center opacity-20">
                                        <Package className="w-20 h-20 mx-auto mb-4" />
                                        <p className="text-sm font-bold uppercase tracking-widest">Nessun record in coda</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex justify-between items-center px-10 text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4" />
                        Latenza: 14ms
                    </div>
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        Protocollo: XLSX/MASTER
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500/50" />
                    Sicurezza: AES-256
                </div>
            </div>
        </div>
    );
}
