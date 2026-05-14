"use client";

import React, { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
    Maximize2, ZoomIn, ZoomOut, Check, X,
    Scissors, Type, Image as ImageIcon, Sparkles,
    ChevronLeft, ChevronRight, ScanSearch, MousePointer2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PdfVisualWorkspaceProps {
    pdfInstance: any;
    onCropSave?: (page: number, bbox: any, dataUrl: string) => Promise<void>;
    selectedProductMapping?: any | null; // From _ai_visual_mapping metadata
}

export default function PdfVisualWorkspace({
    pdfInstance,
    onCropSave,
    selectedProductMapping
}: PdfVisualWorkspaceProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(1.0);
    const [mode, setMode] = useState<"select" | "crop">("select");
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Crop States
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [currentBox, setCurrentBox] = useState<any | null>(null);

    useEffect(() => {
        if (pdfInstance) {
            renderPage();
        }
    }, [pdfInstance, currentPage, zoom]);

    // Handle auto-navigation when a mapping is selected
    useEffect(() => {
        if (selectedProductMapping?.page) {
            setCurrentPage(selectedProductMapping.page);
        }
    }, [selectedProductMapping]);

    const renderPage = async () => {
        if (!pdfInstance || !canvasRef.current) return;
        try {
            const page = await pdfInstance.getPage(currentPage);
            const viewport = page.getViewport({ scale: zoom * 1.5 }); // Higher-res rendering
            const canvas = canvasRef.current;
            const context = canvas.getContext("2d");

            if (context) {
                // High DPI support
                const dpr = window.devicePixelRatio || 1;
                canvas.height = viewport.height * dpr;
                canvas.width = viewport.width * dpr;
                canvas.style.height = `${viewport.height}px`;
                canvas.style.width = `${viewport.width}px`;
                context.scale(dpr, dpr);

                await page.render({ canvasContext: context, viewport }).promise;
            }
        } catch (err) {
            console.error("Renderer error:", err);
        }
    };

    const getRelativeCoords = (e: React.MouseEvent) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height
        };
    };

    const onMouseDown = (e: React.MouseEvent) => {
        if (mode !== "crop") return;
        const coords = getRelativeCoords(e);
        setIsDrawing(true);
        setStartPoint(coords);
        setCurrentBox({ ymin: coords.y, xmin: coords.x, ymax: coords.y, xmax: coords.x });
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing) return;
        const coords = getRelativeCoords(e);
        setCurrentBox({
            ymin: Math.min(startPoint.y, coords.y),
            xmin: Math.min(startPoint.x, coords.x),
            ymax: Math.max(startPoint.y, coords.y),
            xmax: Math.max(startPoint.x, coords.x)
        });
    };

    const onMouseUp = () => {
        setIsDrawing(false);
    };

    const handleManualCropSave = async () => {
        if (!currentBox || !canvasRef.current || !onCropSave) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // Create a temporary canvas for the crop
        const tempCanvas = document.createElement("canvas");
        const tctx = tempCanvas.getContext("2d");

        // Convert relative bbox back to absolute pixels for high-res extraction
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;

        const sx = currentBox.xmin * cw;
        const sy = currentBox.ymin * ch;
        const sWidth = (currentBox.xmax - currentBox.xmin) * cw;
        const sHeight = (currentBox.ymax - currentBox.ymin) * ch;

        tempCanvas.width = sWidth * 2; // Extra res for the save
        tempCanvas.height = sHeight * 2;

        if (tctx) {
            tctx.drawImage(canvas, sx * dpr, sy * dpr, sWidth * dpr, sHeight * dpr, 0, 0, tempCanvas.width, tempCanvas.height);
            const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.95);
            await onCropSave(currentPage, currentBox, dataUrl);
            setCurrentBox(null);
            setMode("select");
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden relative" ref={containerRef}>
            {/* Top Toolbar */}
            <div className="h-14 bg-slate-950/50 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-30">
                <div className="flex items-center gap-2">
                    <div className="flex bg-white/10 p-1 rounded-xl">
                        <button
                            onClick={() => setMode("select")}
                            className={`p-2 rounded-lg transition-all ${mode === "select" ? "bg-white text-slate-950 shadow-lg" : "text-white hover:bg-white/5"}`}
                        >
                            <MousePointer2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setMode("crop")}
                            className={`p-2 rounded-lg transition-all ${mode === "crop" ? "bg-white text-slate-950 shadow-lg" : "text-white hover:bg-white/5"}`}
                        >
                            <Scissors className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="h-4 w-[1px] bg-white/10 mx-2" />
                    <div className="flex items-center gap-1">
                        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-2 text-white/50 hover:text-white transition-colors">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-black font-mono text-white/40 uppercase w-12 text-center">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-2 text-white/50 hover:text-white transition-colors">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                        <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1 text-white hover:text-orange-400 disabled:opacity-20 transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-black text-white px-2 uppercase tracking-widest">
                            Pag. <span className="text-orange-400">{currentPage}</span> / {pdfInstance?.numPages}
                        </span>
                        <button disabled={currentPage >= (pdfInstance?.numPages || 0)} onClick={() => setCurrentPage(p => p + 1)} className="p-1 text-white hover:text-orange-400 disabled:opacity-20 transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Workspace (Viewport) */}
            <div className="flex-1 overflow-auto bg-slate-900/50 flex justify-center p-8 custom-scrollbar">
                <div className="relative shadow-2xl shadow-black/50 h-fit"
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                >
                    <canvas ref={canvasRef} className="rounded-sm" />

                    {/* Diagnostic Layer: AI Visual Mapping */}
                    {selectedProductMapping?.page === currentPage && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute border-4 border-orange-500 bg-orange-500/10 pointer-events-none shadow-[0_0_20px_rgba(249,115,22,0.5)] z-10"
                            style={{
                                top: `${selectedProductMapping.bbox[0] / 10}%`,
                                left: `${selectedProductMapping.bbox[1] / 10}%`,
                                height: `${(selectedProductMapping.bbox[2] - selectedProductMapping.bbox[0]) / 10}%`,
                                width: `${(selectedProductMapping.bbox[3] - selectedProductMapping.bbox[1]) / 10}%`,
                            }}
                        >
                            <div className="absolute top-0 left-0 -translate-y-full bg-orange-500 text-white px-2 py-1 rounded-t-lg font-black text-[8px] uppercase tracking-widest whitespace-nowrap">
                                AI Detected Product Region
                            </div>
                        </motion.div>
                    )}

                    {/* Professional Overlay for Selection/Crop */}
                    {currentBox && (
                        <div
                            className="absolute border-2 border-white bg-blue-500/10 shadow-[0_0_15px_rgba(255,255,255,0.3)] z-20"
                            style={{
                                top: `${currentBox.ymin * 100}%`,
                                left: `${currentBox.xmin * 100}%`,
                                height: `${(currentBox.ymax - currentBox.ymin) * 100}%`,
                                width: `${(currentBox.xmax - currentBox.xmin) * 100}%`,
                            }}
                        >
                            <div className="absolute bottom-4 right-4 flex gap-2">
                                <button onClick={handleManualCropSave} className="p-2 bg-blue-600 text-white rounded-lg shadow-xl hover:bg-blue-700 transition-all">
                                    <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => setCurrentBox(null)} className="p-2 bg-red-600 text-white rounded-lg shadow-xl hover:bg-red-700 transition-all">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
