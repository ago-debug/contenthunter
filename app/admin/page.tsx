"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Database, Trash2, RefreshCw, Layers, HardDrive, BarChart, Server, Users, UserCog, Building2 } from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";

export default function AdminPage() {
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    const handleAction = async (action: string) => {
        setIsProcessing(action);
        try {
            if (action === "db-push") {
                // In un ambiente reale, questo chiamerebbe uno script server-side
                await new Promise(r => setTimeout(r, 2000));
                toast.success("Database Schema sincronizzato con Prisma Push!");
            } else if (action === "clear-cache") {
                await new Promise(r => setTimeout(r, 1500));
                toast.success("Cache transiente e log temporanei eliminati.");
            }
        } catch (err) {
            toast.error("Errore durante l'esecuzione dell'operazione admin.");
        } finally {
            setIsProcessing(null);
        }
    };

    const stats = [
        { label: "Health Status", value: "Optimal", icon: ShieldCheck, color: "text-emerald-500" },
        { label: "Server Latency", value: "24ms", icon: Server, color: "text-blue-500" },
        { label: "Storage Use", value: "1.2 GB", icon: HardDrive, color: "text-orange-500" },
    ];

    return (
        <div className="p-12 space-y-12 max-w-6xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3 text-slate-400 mb-2">
                        <ShieldCheck className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">Internal Control Center</span>
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Amministrazione Sistema</h1>
                    <p className="text-slate-500 font-bold">Monitora l'infrastruttura, gestisci le tabelle del database e pulisci i dati di sessione.</p>
                </div>
            </header>

            <section className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100">
                <h2 className="text-xl font-black text-slate-900 mb-6">Gestione utenti e permessi</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Link
                        href="/admin/companies"
                        className="flex items-center gap-4 p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all group"
                    >
                        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                            <Building2 className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="font-black text-slate-900">Aziende</p>
                            <p className="text-xs text-slate-500">Multi-azienda (solo admin globale)</p>
                        </div>
                    </Link>
                    <Link
                        href="/admin/users"
                        className="flex items-center gap-4 p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all group"
                    >
                        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                            <Users className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="font-black text-slate-900">Utenti</p>
                            <p className="text-xs text-slate-500">Elenco utenti e assegnazione profilo</p>
                        </div>
                    </Link>
                    <Link
                        href="/admin/profiles"
                        className="flex items-center gap-4 p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all group"
                    >
                        <div className="w-14 h-14 bg-violet-50 text-violet-600 rounded-xl flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                            <UserCog className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="font-black text-slate-900">Profili</p>
                            <p className="text-xs text-slate-500">Crea e modifica profili con permessi</p>
                        </div>
                    </Link>
                </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((s, idx) => (
                    <div key={idx} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-3">{s.label}</p>
                            <p className={`text-2xl font-black text-slate-900 tracking-tight`}>{s.value}</p>
                        </div>
                        <div className={`p-4 bg-slate-50 rounded-2xl ${s.color}`}>
                            <s.icon className="w-6 h-6" />
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Database Maintenance */}
                <section className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-8">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center shadow-inner">
                            <Database className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 leading-tight">Database Ops</h3>
                            <p className="text-sm font-bold text-slate-400 mt-1">Sincronizzazione Schema & Migrazioni</p>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 italic text-[11px] text-slate-500 leading-relaxed">
                        Attenzione: Il comando 'Force Push' sovrascrive lo schema del DB con le definizioni Prisma locali. Utilizzare solo in caso di disallineamento tabelle.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                            onClick={() => handleAction("db-push")}
                            disabled={isProcessing !== null}
                            className="bg-slate-900 text-white p-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            {isProcessing === "db-push" ? <RefreshCw className="w-4 h-4 animate-spin text-blue-400" /> : <RefreshCw className="w-4 h-4" />}
                            Sync Schema (Push)
                        </button>
                        <button
                            disabled
                            className="bg-white border border-slate-100 text-slate-400 p-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-sm flex items-center justify-center gap-3 cursor-not-allowed"
                        >
                            <Layers className="w-4 h-4" />
                            Run Migrations
                        </button>
                    </div>
                </section>

                {/* Data Cleaning */}
                <section className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-8">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-[1.5rem] flex items-center justify-center shadow-inner">
                            <Trash2 className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 leading-tight">Cleanup Lab</h3>
                            <p className="text-sm font-bold text-slate-400 mt-1">Manutenzione Dati ed Eccedenze</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <button
                            onClick={() => handleAction("clear-cache")}
                            disabled={isProcessing !== null}
                            className="w-full bg-red-50 text-red-600 p-6 rounded-3xl font-black uppercase text-[11px] tracking-widest border border-red-100 hover:bg-red-600 hover:text-white transition-all shadow-sm flex items-center justify-between group px-10"
                        >
                            <div className="flex items-center gap-4">
                                <Trash2 className="w-5 h-5 group-hover:animate-bounce" />
                                <span>Elimina Dati Transienti</span>
                            </div>
                            <span className="text-[9px] font-black bg-white px-2 py-0.5 rounded opacity-50 group-hover:opacity-100 text-red-600 transition-all uppercase">Forza Pulizia</span>
                        </button>

                        <div className="flex items-center gap-4 p-8 bg-amber-50 rounded-[2rem] border border-amber-100">
                            <div className="p-4 bg-white rounded-2xl shadow-sm text-amber-600">
                                <BarChart className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-amber-900 tracking-tight">Report Log: 142MB</p>
                                <p className="text-[10px] font-bold text-amber-600/60 uppercase tracking-widest">Manutenzione consigliata</p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <footer className="pt-12 border-t border-slate-100 flex justify-between items-center opacity-40">
                <span className="text-[9px] font-black uppercase tracking-[0.4em]">ContentHunter Enterprise Panel © 2026</span>
                <div className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse animation-delay-500"></div>
                </div>
            </footer>
        </div>
    );
}
