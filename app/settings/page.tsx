"use client";

import React, { useState, useEffect } from "react";
import { Settings as SettingsIcon, Database, Globe, Cpu, Save, Shield, ShieldCheck, RefreshCw, Key } from "lucide-react";
import { toast } from "react-toastify";
import { motion } from "framer-motion";

export default function SettingsPage() {
    const [config, setConfig] = useState({
        openaiKey: "",
        serpapiKey: "",
        wooDomain: "",
        wooKey: "",
        wooSecret: ""
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // Load from local storage or placeholder
        const savedWoo = localStorage.getItem("pim_woo_config");
        if (savedWoo) {
            const woo = JSON.parse(savedWoo);
            setConfig(prev => ({
                ...prev,
                wooDomain: woo.domain || "",
                wooKey: woo.key || "",
                wooSecret: woo.secret || ""
            }));
        }
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        // In a real app, we'd save to an API. Here we simulate for PIM frontend.
        localStorage.setItem("pim_woo_config", JSON.stringify({
            domain: config.wooDomain,
            key: config.wooKey,
            secret: config.wooSecret
        }));

        await new Promise(r => setTimeout(r, 1000));
        toast.success("Configurazioni di sistema aggiornate!");
        setIsSaving(false);
    };

    return (
        <div className="p-12 space-y-12 max-w-5xl mx-auto animate-in fade-in duration-500">
            <header className="space-y-2">
                <div className="flex items-center gap-4 text-blue-600 mb-2">
                    <div className="p-3 bg-blue-50 rounded-2xl">
                        <SettingsIcon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">System Config V3</span>
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Impostazioni Globali</h1>
                <p className="text-slate-500 font-bold max-w-2xl">Configura le chiavi API, i tunnel di sincronizzazione e le preferenze del motore AI per tutto l'ecosistema ContentHunter.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* AI & Intelligence */}
                <section className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-purple-50 text-purple-600 rounded-[1.5rem]">
                            <Cpu className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900">AI Intelligence</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">GPT-4o / GPT-4o-mini</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">OpenAI API Key (Server Side)</label>
                            <div className="relative group">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                <input
                                    type="password"
                                    placeholder="••••••••••••••••••••••••"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-purple-50 focus:bg-white transition-all font-mono"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-1 rounded-lg border border-purple-100 opacity-0 group-hover:opacity-100 transition-all">SECRET</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">SerpApi Key (Web Scraper)</label>
                            <div className="relative group">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                <input
                                    type="password"
                                    placeholder="••••••••••••••••••••••••"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:bg-white transition-all font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* WooCommerce Channel */}
                <section className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-8">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-[1.5rem]">
                            <Globe className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900">WooCommerce Sync</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">REST API Connection</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Store Domain</label>
                            <input
                                value={config.wooDomain}
                                onChange={e => setConfig({ ...config, wooDomain: e.target.value })}
                                placeholder="https://tuosito.it"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:bg-white transition-all font-bold text-slate-900"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Consumer Key</label>
                                <input
                                    type="password"
                                    value={config.wooKey}
                                    onChange={e => setConfig({ ...config, wooKey: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:bg-white transition-all font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Consumer Secret</label>
                                <input
                                    type="password"
                                    value={config.wooSecret}
                                    onChange={e => setConfig({ ...config, wooSecret: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:bg-white transition-all font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <div className="bg-slate-900 p-12 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-10">
                    <Shield className="w-48 h-48 rotate-12" />
                </div>
                <div className="relative z-10">
                    <h3 className="text-2xl font-black tracking-tight">Pronto per la produzione?</h3>
                    <p className="text-slate-400 font-bold mt-2">I dati salvati qui verranno utilizzati per tutte le trasmissioni dati API.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="relative z-10 px-12 py-5 bg-blue-600 rounded-[2rem] font-black uppercase tracking-widest text-xs hover:bg-white hover:text-slate-900 transition-all shadow-2xl disabled:opacity-50 flex items-center gap-3"
                >
                    {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Salva Configurazioni
                </button>
            </div>
        </div>
    );
}
