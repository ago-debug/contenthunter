"use client";

import React, { useState, useEffect } from "react";
import {
    FileText,
    Upload,
    Trash2,
    Sparkles,
    MessageCircle,
    Wand2,
    ExternalLink,
    RefreshCw,
    ChevronDown,
    AlertCircle,
} from "lucide-react";
import axios from "axios";
import { toast } from "react-toastify";

const MAX_PDF_MB = 50;

export default function PdfHub() {
    const [catalogues, setCatalogues] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [catalog, setCatalog] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [summarizingId, setSummarizingId] = useState<number | null>(null);
    const [extractingId, setExtractingId] = useState<number | null>(null);
    const [askPdfId, setAskPdfId] = useState<number | null>(null);
    const [askQuestion, setAskQuestion] = useState("");
    const [askAnswerByPdfId, setAskAnswerByPdfId] = useState<Record<number, string>>({});
    const [summary, setSummary] = useState<any>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        axios
            .get("/api/catalogues")
            .then((res) => setCatalogues(res.data || []))
            .catch(() => toast.error("Errore caricamento cataloghi"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!selectedId) {
            setCatalog(null);
            return;
        }
        const id = parseInt(selectedId, 10);
        if (isNaN(id)) return;
        setLoading(true);
        axios
            .get("/api/catalogues/" + id)
            .then((res) => {
                setCatalog(res.data);
                setSummary(null);
                setAskAnswerByPdfId({});
            })
            .catch(() => toast.error("Errore caricamento catalogo"))
            .finally(() => setLoading(false));
    }, [selectedId]);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedId) return;
        const sizeMB = file.size / 1024 / 1024;
        if (sizeMB > MAX_PDF_MB) {
            toast.error("File troppo grande (max " + MAX_PDF_MB + " MB).");
            return;
        }
        setUploading(true);
        const blob = new Blob([file], { type: "application/pdf" });
        axios
            .post("/api/repositories/" + selectedId + "/pdfs", blob, {
                headers: {
                    "Content-Type": "application/pdf",
                    "X-File-Name": encodeURIComponent(file.name),
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            })
            .then((res) => {
                toast.success(
                    "PDF caricato" +
                        (res.data?.normalized ? " e normalizzato" : "") +
                        (res.data?.sizeMB != null ? " (" + res.data.sizeMB + " MB)" : "")
                );
                axios.get("/api/catalogues/" + selectedId).then((r) => setCatalog(r.data));
            })
            .catch((err) => {
                const msg = err?.response?.data?.error || "Errore upload.";
                toast.error(msg);
            })
            .finally(() => {
                setUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            });
    };

    const handleSummarize = (pdfId: number) => {
        if (!selectedId) return;
        setSummarizingId(pdfId);
        setSummary(null);
        axios
            .get("/api/repositories/" + selectedId + "/pdfs/" + pdfId + "/summarize")
            .then((res) => setSummary(res.data))
            .catch((err) => {
                const msg =
                    err?.response?.data?.error ||
                    (err?.response?.status === 502
                        ? "Il server non ha risposto in tempo (502). Prova con un PDF più piccolo o riprova."
                        : "Errore riassunto.");
                const hint = err?.response?.data?.hint;
                toast.error(hint ? `${msg} ${hint}` : msg, { autoClose: 6000 });
            })
            .finally(() => setSummarizingId(null));
    };

    const handleExtract = (pdfId: number) => {
        if (!selectedId) return;
        setExtractingId(pdfId);
        const toastId = toast.loading("Estrazione prodotti in corso (Gemini)...");
        axios
            .post("/api/repositories/" + selectedId + "/pdfs/" + pdfId + "/extract")
            .then((res) => {
                toast.update(toastId, {
                    render: "Estratti " + (res.data?.count ?? 0) + " prodotti.",
                    type: "success",
                    isLoading: false,
                    autoClose: 3000,
                });
                axios.get("/api/catalogues/" + selectedId).then((r) => setCatalog(r.data));
            })
            .catch((err) => {
                const msg =
                    err?.response?.data?.error ||
                    (err?.response?.status === 502
                        ? "Il server non ha risposto in tempo (502). Prova con un PDF più piccolo o riprova."
                        : "Errore estrazione.");
                const hint = err?.response?.data?.hint;
                toast.update(toastId, {
                    render: hint ? msg + " " + hint : msg,
                    type: "error",
                    isLoading: false,
                    autoClose: 6000,
                });
            })
            .finally(() => setExtractingId(null));
    };

    const handleAsk = (pdfId: number) => {
        const q = askQuestion.trim();
        if (!q || !selectedId) {
            toast.warning("Scrivi una domanda.");
            return;
        }
        setAskPdfId(pdfId);
        axios
            .post("/api/repositories/" + selectedId + "/pdfs/" + pdfId + "/ask", { question: q })
            .then((res) => {
                setAskAnswerByPdfId((prev) => ({ ...prev, [pdfId]: res.data?.answer ?? "" }));
            })
            .catch((err) => {
                const msg =
                    err?.response?.data?.error ||
                    (err?.response?.status === 502
                        ? "Il server non ha risposto in tempo (502). Prova con un PDF più piccolo o riprova."
                        : "Errore risposta.");
                const hint = err?.response?.data?.hint;
                toast.error(hint ? `${msg} ${hint}` : msg, { autoClose: 6000 });
            })
            .finally(() => setAskPdfId(null));
    };

    const handleDelete = (pdfId: number, fileName: string) => {
        if (!selectedId || !window.confirm("Eliminare \"" + fileName + "\" dal catalogo?")) return;
        axios
            .delete("/api/repositories/" + selectedId + "/pdfs/" + pdfId)
            .then(() => {
                toast.success("PDF eliminato");
                setCatalog((prev: any) =>
                    prev ? { ...prev, pdfs: (prev.pdfs || []).filter((p: any) => p.id !== pdfId) } : null
                );
                setAskAnswerByPdfId((prev) => {
                    const next = { ...prev };
                    delete next[pdfId];
                    return next;
                });
            })
            .catch(() => toast.error("Errore eliminazione"));
    };

    return (
        <div className="flex flex-col min-h-[calc(100vh-80px)] bg-slate-50/50">
            <div className="bg-white border-b border-slate-100 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-orange-500 rounded-xl text-white">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">PDF</h1>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                Carica, analizza e collega al catalogo
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="relative">
                            <span className="sr-only">Seleziona catalogo</span>
                            <select
                                value={selectedId ?? ""}
                                onChange={(e) => setSelectedId(e.target.value || null)}
                                className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-orange-200 focus:border-orange-300 appearance-none cursor-pointer"
                            >
                                <option value="">Seleziona catalogo</option>
                                {catalogues.map((c: any) => (
                                    <option key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </label>
                        {selectedId && (
                            <a
                                href={"/import?id=" + selectedId}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Apri in Import Lab
                            </a>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
                {!selectedId && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <FileText className="w-16 h-16 text-slate-200 mb-4" />
                        <p className="text-slate-500 font-bold">Seleziona un catalogo per gestire i PDF</p>
                        <p className="text-slate-400 text-sm mt-1">
                            Carica documenti, usa Gemini per riassunto ed estrazione, poi apri l’Import Lab per collegarli.
                        </p>
                    </div>
                )}

                {selectedId && loading && (
                    <div className="flex justify-center py-12">
                        <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
                    </div>
                )}

                {selectedId && !loading && catalog && (
                    <>
                        <div className="mb-6 flex flex-wrap items-center gap-3">
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept=".pdf"
                                onChange={handleUpload}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                            >
                                {uploading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4" />
                                )}
                                Carica PDF (max {MAX_PDF_MB} MB)
                            </button>
                            <span className="text-xs text-slate-400">
                                {(catalog.pdfs || []).length} PDF nel catalogo
                            </span>
                        </div>

                        {(catalog.pdfs || []).length === 0 && (
                            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
                                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-500 font-bold">Nessun PDF in questo catalogo</p>
                                <p className="text-slate-400 text-sm mt-1">Carica un PDF per iniziare l’analisi con Gemini</p>
                            </div>
                        )}

                        <ul className="space-y-4">
                            {(catalog.pdfs || []).map((pdf: any) => (
                                <li
                                    key={pdf.id}
                                    className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:border-slate-200 transition-colors"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                                                <FileText className="w-5 h-5 text-red-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-800 truncate">{pdf.fileName}</p>
                                                <p className="text-[10px] text-slate-400">ID {pdf.id}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleSummarize(pdf.id)}
                                                disabled={summarizingId === pdf.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 disabled:opacity-50"
                                            >
                                                {summarizingId === pdf.id ? (
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Sparkles className="w-3 h-3" />
                                                )}
                                                Riassumi
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleExtract(pdf.id)}
                                                disabled={extractingId === pdf.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold hover:bg-indigo-200 disabled:opacity-50"
                                            >
                                                {extractingId === pdf.id ? (
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Wand2 className="w-3 h-3" />
                                                )}
                                                Estrai prodotti
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(pdf.id, pdf.fileName)}
                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Elimina"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-slate-50">
                                        <div className="flex flex-wrap gap-2 items-end">
                                            <input
                                                type="text"
                                                value={askQuestion}
                                                onChange={(e) => setAskQuestion(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && handleAsk(pdf.id)}
                                                placeholder="Chiedi qualcosa su questo PDF..."
                                                className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-100 focus:border-orange-300"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleAsk(pdf.id)}
                                                disabled={askPdfId === pdf.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-[10px] font-bold hover:bg-slate-900 disabled:opacity-50"
                                            >
                                                {askPdfId === pdf.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
                                                Chiedi
                                            </button>
                                        </div>
                                        {askAnswerByPdfId[pdf.id] != null && (
                                            <div className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-700 border border-slate-100">
                                                {askAnswerByPdfId[pdf.id]}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>

                        {summary != null && (
                            <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Riassunto (Gemini)</p>
                                <p className="text-sm text-slate-700">{summary.summary}</p>
                                {summary.pageCount != null && (
                                    <p className="text-xs text-slate-500 mt-2">Pagine: {summary.pageCount}</p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
