"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { Box, Plus, RefreshCw, Search, Spider, PlayCircle, Globe2 } from "lucide-react";
import { toast } from "react-toastify";

interface ScrapeProject {
    id: number;
    name: string;
    description?: string | null;
    createdAt: string;
}

interface ScrapeSpider {
    id: number;
    projectId: number;
    name: string;
    startUrl?: string | null;
    createdAt: string;
}

interface ScrapeJob {
    id: number;
    spiderId: number;
    status: string;
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    totalPages?: number | null;
    successCount?: number | null;
    errorCount?: number | null;
}

export default function ScrapingPage() {
    const companyContext = useCompanyContext();
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<ScrapeProject[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [spiders, setSpiders] = useState<ScrapeSpider[]>([]);
    const [selectedSpiderId, setSelectedSpiderId] = useState<number | null>(null);
    const [jobs, setJobs] = useState<ScrapeJob[]>([]);

    const [newProjectName, setNewProjectName] = useState("");
    const [newProjectDesc, setNewProjectDesc] = useState("");

    const [newSpiderName, setNewSpiderName] = useState("");
    const [newSpiderStartUrl, setNewSpiderStartUrl] = useState("");

    const loadProjects = async () => {
        try {
            setLoading(true);
            const res = await axios.get<ScrapeProject[]>("/api/scraping/projects");
            setProjects(res.data || []);
            if (!selectedProjectId && res.data.length > 0) {
                setSelectedProjectId(res.data[0].id);
            }
        } catch (err: any) {
            console.error("loadProjects error", err);
            toast.error("Errore nel caricamento dei progetti scraping.");
        } finally {
            setLoading(false);
        }
    };

    const loadSpiders = async (projectId: number) => {
        try {
            const res = await axios.get<ScrapeSpider[]>("/api/scraping/spiders", {
                params: { projectId },
            });
            setSpiders(res.data || []);
            if (res.data.length > 0) {
                setSelectedSpiderId((prev) => prev && res.data.some(s => s.id === prev) ? prev : res.data[0].id);
            } else {
                setSelectedSpiderId(null);
                setJobs([]);
            }
        } catch (err: any) {
            console.error("loadSpiders error", err);
            toast.error("Errore nel caricamento degli spider.");
        }
    };

    const loadJobs = async (spiderId: number) => {
        try {
            const res = await axios.get<ScrapeJob[]>("/api/scraping/jobs", {
                params: { spiderId },
            });
            setJobs(res.data || []);
        } catch (err: any) {
            console.error("loadJobs error", err);
            toast.error("Errore nel caricamento dei job.");
        }
    };

    useEffect(() => {
        loadProjects();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyContext?.selectedCompanyId]);

    useEffect(() => {
        if (selectedProjectId) {
            loadSpiders(selectedProjectId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjectId]);

    useEffect(() => {
        if (selectedSpiderId) {
            loadJobs(selectedSpiderId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSpiderId]);

    const handleCreateProject = async () => {
        const name = newProjectName.trim();
        if (!name) {
            toast.warning("Inserisci un nome progetto.");
            return;
        }
        try {
            const res = await axios.post<ScrapeProject>("/api/scraping/projects", {
                name,
                description: newProjectDesc || null,
            });
            toast.success("Progetto creato.");
            setNewProjectName("");
            setNewProjectDesc("");
            setProjects((prev) => [res.data, ...prev]);
            setSelectedProjectId(res.data.id);
        } catch (err: any) {
            console.error("createProject error", err);
            toast.error(err.response?.data?.error || "Errore creazione progetto.");
        }
    };

    const handleCreateSpider = async () => {
        if (!selectedProjectId) {
            toast.warning("Seleziona prima un progetto.");
            return;
        }
        const name = newSpiderName.trim();
        if (!name) {
            toast.warning("Inserisci un nome spider.");
            return;
        }
        try {
            const res = await axios.post<ScrapeSpider>("/api/scraping/spiders", {
                projectId: selectedProjectId,
                name,
                startUrl: newSpiderStartUrl || null,
            });
            toast.success("Spider creato.");
            setNewSpiderName("");
            setNewSpiderStartUrl("");
            setSpiders((prev) => [res.data, ...prev]);
            setSelectedSpiderId(res.data.id);
        } catch (err: any) {
            console.error("createSpider error", err);
            toast.error(err.response?.data?.error || "Errore creazione spider.");
        }
    };

    const handleCreateJob = async () => {
        if (!selectedSpiderId) {
            toast.warning("Seleziona uno spider.");
            return;
        }
        try {
            const res = await axios.post<ScrapeJob>("/api/scraping/jobs", {
                spiderId: selectedSpiderId,
            });
            toast.success("Job creato (pending).");
            setJobs((prev) => [res.data, ...prev]);
        } catch (err: any) {
            console.error("createJob error", err);
            toast.error(err.response?.data?.error || "Errore creazione job.");
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-56px)] lg:h-[calc(100vh-80px)] bg-[#F4F5F7] overflow-hidden min-h-0">
            <div className="flex-none p-4 sm:p-6 pb-2 bg-[#F4F5F7]/95 backdrop-blur-md border-b border-slate-200/60">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg">
                            <Globe2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Scraping Hub</h1>
                            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                Gestione progetti, spider e job di scraping
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={loadProjects}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reload
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-6 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
                    {/* Colonna Progetti */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Box className="w-4 h-4 text-slate-400" />
                                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                    Progetti
                                </span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">
                                {projects.length} progetti
                            </span>
                        </div>
                        <div className="p-3 border-b border-slate-100 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Nome progetto"
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] font-bold text-slate-800"
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateProject}
                                    className="p-2 rounded-xl bg-slate-900 text-white hover:bg-black"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                            <textarea
                                placeholder="Descrizione (opzionale)"
                                value={newProjectDesc}
                                onChange={(e) => setNewProjectDesc(e.target.value)}
                                rows={2}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-medium text-slate-700 resize-none"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {loading && projects.length === 0 ? (
                                <div className="flex items-center justify-center py-10 text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Caricamento...
                                </div>
                            ) : projects.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                                    <Search className="w-6 h-6 text-slate-200 mb-3" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                                        Nessun progetto scraping
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Crea il primo progetto per iniziare a configurare spider e job.
                                    </p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {projects.map((p) => {
                                        const active = selectedProjectId === p.id;
                                        return (
                                            <li key={p.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedProjectId(p.id)}
                                                    className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-slate-50 transition-colors ${
                                                        active ? "bg-slate-50" : ""
                                                    }`}
                                                >
                                                    <span className="text-[12px] font-black text-slate-900 truncate">
                                                        {p.name}
                                                    </span>
                                                    {p.description && (
                                                        <span className="text-[11px] text-slate-500 line-clamp-2">
                                                            {p.description}
                                                        </span>
                                                    )}
                                                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">
                                                        ID {p.id}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Colonna Spider */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Spider className="w-4 h-4 text-slate-400" />
                                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                    Spider
                                </span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">
                                {spiders.length} spider
                            </span>
                        </div>
                        <div className="p-3 border-b border-slate-100 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Nome spider"
                                    value={newSpiderName}
                                    onChange={(e) => setNewSpiderName(e.target.value)}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] font-bold text-slate-800"
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateSpider}
                                    className="p-2 rounded-xl bg-slate-900 text-white hover:bg-black"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="Start URL (opzionale)"
                                value={newSpiderStartUrl}
                                onChange={(e) => setNewSpiderStartUrl(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-medium text-slate-700"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {!selectedProjectId ? (
                                <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                                    <Search className="w-6 h-6 text-slate-200 mb-3" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                                        Nessun progetto selezionato
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Seleziona un progetto a sinistra per vedere o creare spider.
                                    </p>
                                </div>
                            ) : spiders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                                    <Search className="w-6 h-6 text-slate-200 mb-3" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                                        Nessuno spider configurato
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Crea il primo spider per definire cosa e come estrarre.
                                    </p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {spiders.map((s) => {
                                        const active = selectedSpiderId === s.id;
                                        return (
                                            <li key={s.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedSpiderId(s.id)}
                                                    className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-slate-50 transition-colors ${
                                                        active ? "bg-slate-50" : ""
                                                    }`}
                                                >
                                                    <span className="text-[12px] font-black text-slate-900 truncate">
                                                        {s.name}
                                                    </span>
                                                    {s.startUrl && (
                                                        <span className="text-[11px] text-slate-500 line-clamp-1">
                                                            {s.startUrl}
                                                        </span>
                                                    )}
                                                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">
                                                        ID {s.id}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Colonna Job */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <PlayCircle className="w-4 h-4 text-slate-400" />
                                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                    Job
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleCreateJob}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black disabled:opacity-40"
                                disabled={!selectedSpiderId}
                            >
                                <PlayCircle className="w-3.5 h-3.5" />
                                Nuovo job
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {!selectedSpiderId ? (
                                <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                                    <Search className="w-6 h-6 text-slate-200 mb-3" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                                        Nessuno spider selezionato
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Seleziona uno spider per vedere e creare job.
                                    </p>
                                </div>
                            ) : jobs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                                    <Search className="w-6 h-6 text-slate-200 mb-3" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                                        Nessun job trovato
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Crea un job per avviare una esecuzione di scraping con lo spider selezionato.
                                    </p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {jobs.map((j) => (
                                        <li key={j.id} className="px-4 py-3 text-[11px]">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-black text-slate-900">
                                                    Job #{j.id}
                                                </span>
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.18em] ${
                                                        j.status === "done"
                                                            ? "bg-emerald-50 text-emerald-600"
                                                            : j.status === "running"
                                                                ? "bg-blue-50 text-blue-600"
                                                                : j.status === "failed"
                                                                    ? "bg-red-50 text-red-600"
                                                                    : "bg-slate-50 text-slate-500"
                                                    }`}
                                                >
                                                    {j.status}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-3 text-slate-500">
                                                <span>
                                                    {j.totalPages != null ? `${j.totalPages} pagine` : "— pagine"}
                                                </span>
                                                <span>OK: {j.successCount ?? 0}</span>
                                                <span>ERR: {j.errorCount ?? 0}</span>
                                            </div>
                                            <div className="mt-1 text-[9px] text-slate-400 flex gap-2 flex-wrap">
                                                <span>Creato: {new Date(j.createdAt).toLocaleString()}</span>
                                                {j.startedAt && <span>Start: {new Date(j.startedAt).toLocaleString()}</span>}
                                                {j.finishedAt && <span>Fine: {new Date(j.finishedAt).toLocaleString()}</span>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

