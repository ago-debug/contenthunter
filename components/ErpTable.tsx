"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { Search, Plus, X, Edit, Trash2, Box, Package, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ErpTable() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const res = await axios.get("/api/products");
            setProducts(res.data);
        } catch (err: any) {
            toast.error("Errore nel caricamento del Server PIM");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedProduct) return;
        setIsSaving(true);
        try {
            await axios.post("/api/products", selectedProduct);
            toast.success("Prodotto aggiornato con successo");
            setSelectedProduct(null);
            fetchProducts(); // refresh table
        } catch (err) {
            toast.error("Errore salvataggio prodotto");
        } finally {
            setIsSaving(false);
        }
    };

    const filteredProducts = products.filter(p =>
        (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.title || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 space-y-8 bg-[#F4F5F7] min-h-screen">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-gray-200">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Libreria Master PIM</h1>
                    <p className="text-sm font-bold text-gray-500 mt-2 uppercase tracking-widest">
                        Gestione Centralizzata Prodotti ed EAV
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cerca SKU o Titolo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white border border-gray-200 rounded-xl py-3 pl-12 pr-4 w-72 focus:outline-none focus:ring-4 focus:ring-blue-100 font-bold text-sm shadow-sm"
                        />
                    </div>
                    <button onClick={fetchProducts} className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all">
                        <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button className="px-6 py-3 bg-blue-600 font-bold text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        Aggiungi Prodotto
                    </button>
                </div>
            </div>

            {/* Tabella Demolizione Vecchia Interfaccia */}
            <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#111827] text-white">
                            <tr>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest rounded-tl-3xl">Immagine</th>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest">SKU</th>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest">Titolo Prodotto</th>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest">Categoria</th>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest">Prezzo</th>
                                <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-20 text-center">
                                        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                                        <p className="mt-4 text-xs font-black uppercase tracking-widest text-gray-400">Caricamento Libreria ERP...</p>
                                    </td>
                                </tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-20 text-center">
                                        <Box className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Nessun prodotto trovato</p>
                                    </td>
                                </tr>
                            ) : filteredProducts.map((p) => (
                                <tr key={p.id} className="hover:bg-blue-50/50 transition-colors group">
                                    <td className="px-8 py-4">
                                        <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                                            {p.images && p.images[0] ? (
                                                <img src={p.images[0].url} alt={p.sku} className="w-full h-full object-contain" />
                                            ) : (
                                                <span className="text-[9px] font-black uppercase text-gray-300 tracking-widest">Nessuna</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-8 py-4">
                                        <span className="font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">{p.sku}</span>
                                        {p.parentSku && (
                                            <div className="mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Figlio di {p.parentSku}</div>
                                        )}
                                    </td>
                                    <td className="px-8 py-4">
                                        <button
                                            onClick={() => setSelectedProduct(p)}
                                            className="font-black text-gray-900 hover:text-blue-600 transition-colors text-left"
                                        >
                                            {p.title || "Prodotto Senza Titolo"}
                                        </button>
                                        <div className="text-sm font-bold text-gray-400 mt-1 line-clamp-1 max-w-sm">{p.description}</div>
                                    </td>
                                    <td className="px-8 py-4 text-sm font-bold text-gray-600 uppercase">{p.category || "-"}</td>
                                    <td className="px-8 py-4 font-black text-orange-600">€ {parseFloat(p.price || "0").toLocaleString()}</td>
                                    <td className="px-8 py-4 text-right">
                                        <button
                                            onClick={() => setSelectedProduct(p)}
                                            className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all mr-2"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modale Modifica */}
            <AnimatePresence>
                {selectedProduct && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pb-20 sm:pb-6 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-[#111827]/40 backdrop-blur-sm"
                            onClick={() => setSelectedProduct(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* Header Modale */}
                            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 sticky top-0 z-10">
                                <div>
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono font-bold text-gray-900 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">{selectedProduct.sku}</span>
                                        <h3 className="text-xl font-black text-[#111827]">{selectedProduct.title || "Modifica Prodotto"}</h3>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedProduct(null)}
                                    className="p-3 bg-white border border-gray-200 text-gray-400 hover:text-gray-900 hover:bg-red-50 hover:border-red-100 rounded-xl transition-all shadow-sm"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Body Modale */}
                            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-white">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <h4 className="text-xs font-black uppercase text-gray-400 tracking-widest border-b border-gray-100 pb-2">Informazioni Base (Core)</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 ml-1 mb-2 block">Titolo</label>
                                                <input
                                                    value={selectedProduct.title || ""}
                                                    onChange={e => setSelectedProduct({ ...selectedProduct, title: e.target.value })}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 ml-1 mb-2 block">Categoria</label>
                                                    <input
                                                        value={selectedProduct.category || ""}
                                                        onChange={e => setSelectedProduct({ ...selectedProduct, category: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 ml-1 mb-2 block">Brand</label>
                                                    <input
                                                        value={selectedProduct.brand || ""}
                                                        onChange={e => setSelectedProduct({ ...selectedProduct, brand: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 ml-1 mb-2 block">Prezzo (Listino Default)</label>
                                                    <input
                                                        value={selectedProduct.price || ""}
                                                        onChange={e => setSelectedProduct({ ...selectedProduct, price: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 ml-1 mb-2 block">Genitore (Varianti)</label>
                                                    <input
                                                        value={selectedProduct.parentSku || ""}
                                                        onChange={e => setSelectedProduct({ ...selectedProduct, parentSku: e.target.value })}
                                                        placeholder="SKU Padre..."
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 ml-1 mb-2 block">Descrizione Commerciale / Ottimizzata</label>
                                                <textarea
                                                    value={selectedProduct.description || ""}
                                                    onChange={e => setSelectedProduct({ ...selectedProduct, description: e.target.value })}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-800 min-h-[120px] focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all resize-y custom-scrollbar"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <h4 className="text-xs font-black uppercase text-gray-400 tracking-widest border-b border-gray-100 pb-2">Campi Extra & Materiali (EAV)</h4>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 ml-1 mb-2 block">Materiale</label>
                                                    <input
                                                        value={selectedProduct.material || ""}
                                                        onChange={e => setSelectedProduct({ ...selectedProduct, material: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-700 text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 ml-1 mb-2 block">Dimensioni</label>
                                                    <input
                                                        value={selectedProduct.dimensions || ""}
                                                        onChange={e => setSelectedProduct({ ...selectedProduct, dimensions: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-700 text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                                    />
                                                </div>
                                            </div>

                                            {selectedProduct.extraFields && Object.keys(selectedProduct.extraFields).length > 0 && (
                                                <div className="p-5 bg-orange-50/50 border border-orange-100 rounded-2xl mt-4 space-y-4">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">Attributi Dinamici (Satelliti)</p>
                                                    {Object.entries(selectedProduct.extraFields).map(([key, value]) => (
                                                        <div key={key}>
                                                            <label className="text-[11px] font-black uppercase tracking-widest text-orange-800/60 ml-1 mb-1 block">{key}</label>
                                                            <input
                                                                value={String(value)}
                                                                onChange={e => {
                                                                    const newExtra = { ...selectedProduct.extraFields, [key]: e.target.value };
                                                                    setSelectedProduct({ ...selectedProduct, extraFields: newExtra });
                                                                }}
                                                                className="w-full bg-white border border-orange-200 rounded-xl px-3 py-2 font-bold text-orange-900 text-sm focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Modale */}
                            <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-4 rounded-b-[2rem]">
                                <button
                                    onClick={() => setSelectedProduct(null)}
                                    className="px-6 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm"
                                >
                                    Annulla
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-8 py-3 bg-[#111827] text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg flex items-center gap-2"
                                >
                                    {isSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                                    Salva Modifiche
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
