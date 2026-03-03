"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Search, RefreshCw, X } from "lucide-react";
import axios from "axios";
import { toast } from "react-toastify";

interface TableManagerProps {
    title: string;
    endpoint: string;
    fields: {
        key: string;
        label: string;
        type: "text" | "number" | "select";
        options?: { value: string | number; label: string }[];
    }[];
}

export default function TableManager({ title, endpoint, fields }: TableManagerProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});

    const fetchData = async () => {
        setLoading(true);
        try {
            const resp = await axios.get(endpoint);
            setData(resp.data);
        } catch (err) {
            console.error(err);
            toast.error("Errore nel caricamento dei dati");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [endpoint]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingItem) {
                await axios.put(`${endpoint}/${editingItem.id}`, formData);
                toast.success("Elemento aggiornato");
            } else {
                await axios.post(endpoint, formData);
                toast.success("Elemento creato");
            }
            setShowModal(false);
            setEditingItem(null);
            setFormData({});
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error("Errore nel salvataggio");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Sei sicuro di voler eliminare questo elemento?")) return;
        try {
            await axios.delete(`${endpoint}/${id}`);
            toast.success("Elemento eliminato");
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error("Errore nell'eliminazione");
        }
    };

    const filteredData = data.filter((item: any) =>
        Object.values(item).some(
            (val) => val && String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    return (
        <div className="p-8 space-y-8 bg-[#F4F5F7] min-h-screen">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
                    <p className="text-sm font-medium text-slate-400 mt-1 uppercase tracking-widest">Gestione anagrafica di sistema</p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Cerca..."
                            className="w-full h-11 bg-white border border-slate-200 rounded-xl pl-12 pr-4 text-sm focus:outline-none focus:ring-4 focus:ring-slate-900/5 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => {
                            setEditingItem(null);
                            setFormData({});
                            setShowModal(true);
                        }}
                        className="h-11 px-6 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10"
                    >
                        <Plus className="w-4 h-4" />
                        Nuovo
                    </button>
                    <button
                        onClick={fetchData}
                        className="h-11 w-11 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 transition-all"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            {fields.map((f) => (
                                <th key={f.key} className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                    {f.label}
                                </th>
                            ))}
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading && data.length === 0 ? (
                            <tr>
                                <td colSpan={fields.length + 1} className="px-6 py-12 text-center text-slate-300">
                                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
                                    <p className="font-bold uppercase tracking-widest text-[10px]">Caricamento dati...</p>
                                </td>
                            </tr>
                        ) : filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={fields.length + 1} className="px-6 py-12 text-center text-slate-300">
                                    <p className="font-bold uppercase tracking-widest text-[10px]">Nessun risultato trovato</p>
                                </td>
                            </tr>
                        ) : (
                            filteredData.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50/50 transition-all group">
                                    {fields.map((f) => (
                                        <td key={f.key} className="px-6 py-4 text-sm font-bold text-slate-600">
                                            {item[f.key]}
                                        </td>
                                    ))}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                            <button
                                                onClick={() => {
                                                    setEditingItem(item);
                                                    setFormData(item);
                                                    setShowModal(true);
                                                }}
                                                className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                                    {editingItem ? 'Modifica Elemento' : 'Nuovo Elemento'}
                                </h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                    {title}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-900 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            {fields.map((f) => (
                                <div key={f.key} className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                        {f.label}
                                    </label>
                                    <input
                                        type={f.type === "number" ? "number" : "text"}
                                        required
                                        className="w-full h-12 bg-slate-50 border border-slate-100 rounded-2xl px-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white transition-all"
                                        value={formData[f.key] || ""}
                                        onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                                    />
                                </div>
                            ))}

                            <div className="pt-4 flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 h-12 bg-slate-50 text-slate-400 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all"
                                >
                                    Annulla
                                </button>
                                <button
                                    type="submit"
                                    className="flex-[2] h-12 bg-slate-900 text-white font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-lg shadow-slate-900/10"
                                >
                                    Salva Modifiche
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
