"use client";

import React from "react";
import { Globe, ShoppingBag, Share2, RefreshCw, Layers, CheckCircle2 } from "lucide-react";

export default function ChannelsPage() {
    const channels = [
        { name: "WooCommerce Main", status: "Active", type: "Storefront", lastSync: "2 mins ago" },
        { name: "Amazon Europe", status: "Pending", type: "Marketplace", lastSync: "Never" },
        { name: "eBay Global", status: "Inactive", type: "Marketplace", lastSync: "Never" },
    ];

    return (
        <div className="p-12 space-y-12 max-w-6xl mx-auto animate-in fade-in duration-500">
            <header className="space-y-2">
                <div className="flex items-center gap-3 text-blue-600 mb-2">
                    <Share2 className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Omnichannel Distribution</span>
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Canali di Sincronizzazione</h1>
                <p className="text-slate-500 font-bold max-w-2xl">Gestisci tutti i tuoi endpoint di vendita da un unico hub centrale. Controlla il flusso di dati verso store e marketplace.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {channels.map((ch, idx) => (
                    <div key={idx} className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 flex flex-col justify-between">
                        <div className="space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <ShoppingBag className="w-6 h-6 text-slate-900" />
                                </div>
                                <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${ch.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                        ch.status === 'Pending' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                                            'bg-slate-100 text-slate-400 border border-slate-200'
                                    }`}>
                                    {ch.status}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 leading-none">{ch.name}</h3>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{ch.type}</p>
                            </div>
                        </div>

                        <div className="mt-10 pt-8 border-t border-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <RefreshCw className="w-3.5 h-3.5 text-slate-300" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter italic">Last sync: {ch.lastSync}</span>
                            </div>
                            <button className="p-3 bg-slate-900 text-white rounded-xl hover:bg-blue-600 transition-all shadow-lg">
                                <Layers className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-indigo-900 p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-all duration-700">
                    <Globe className="w-64 h-64 rotate-12" />
                </div>
                <div className="relative z-10 space-y-8 max-w-xl">
                    <div className="w-16 h-1 w-20 bg-white/20 rounded-full"></div>
                    <h2 className="text-4xl font-black tracking-tighter leading-tight">Espandi il tuo Business <br /> su Nuovi Canali</h2>
                    <p className="text-blue-100 font-bold text-lg opacity-80">La nostra infrastruttura ti permette di collegare infiniti marketplace in pochi clic. Mappatura intelligente, traduzione AI e sync stock real-time.</p>
                    <button className="bg-white text-blue-900 px-10 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:scale-105 transition-all shadow-2xl">
                        Aggiungi Nuovo Endpoint
                    </button>
                </div>
            </div>
        </div>
    );
}
