"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface CatalogState {
    catalogId: number | null;
    projectName: string;
    csvName: string;
    pdfName: string;
    products: any[];
    pdfPages: any[];
    skuToPageMap: { [sku: string]: number };
    currentPdfUrl: string | null;
    isProcessing: boolean;
}

interface CatalogContextType extends CatalogState {
    setCatalogId: (id: number | null | ((prev: number | null) => number | null)) => void;
    setProjectName: (val: string | ((prev: string) => string)) => void;
    setCsvName: (val: string | ((prev: string) => string)) => void;
    setPdfName: (val: string | ((prev: string) => string)) => void;
    setProducts: (products: any[] | ((prev: any[]) => any[])) => void;
    setPdfPages: (pages: any[] | ((prev: any[]) => any[])) => void;
    setSkuToPageMap: (map: { [sku: string]: number } | ((prev: { [sku: string]: number }) => { [sku: string]: number })) => void;
    setCurrentPdfUrl: (url: string | null | ((prev: string | null) => string | null)) => void;
    setIsProcessing: (val: boolean | ((prev: boolean) => boolean)) => void;
    resetCatalog: () => void;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
    const [catalogId, setCatalogId] = useState<number | null>(null);
    const [projectName, setProjectName] = useState<string>("Nuovo Progetto");
    const [csvName, setCsvName] = useState<string>("");
    const [pdfName, setPdfName] = useState<string>("");
    const [products, setProducts] = useState<any[]>([]);
    const [pdfPages, setPdfPages] = useState<any[]>([]);
    const [skuToPageMap, setSkuToPageMap] = useState<{ [sku: string]: number }>({});
    const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Persistence
    useEffect(() => {
        const savedId = localStorage.getItem("global_catalog_id");
        if (savedId) setCatalogId(parseInt(savedId));

        const savedProject = localStorage.getItem("global_project_name");
        if (savedProject) setProjectName(savedProject);

        const savedCsv = localStorage.getItem("global_csv_name");
        if (savedCsv) setCsvName(savedCsv);

        const savedPdf = localStorage.getItem("global_pdf_name");
        if (savedPdf) setPdfName(savedPdf);
    }, []);

    useEffect(() => {
        if (catalogId) localStorage.setItem("global_catalog_id", catalogId.toString());
        else localStorage.removeItem("global_catalog_id");
    }, [catalogId]);

    useEffect(() => {
        localStorage.setItem("global_project_name", projectName);
    }, [projectName]);

    useEffect(() => {
        localStorage.setItem("global_csv_name", csvName);
    }, [csvName]);

    useEffect(() => {
        localStorage.setItem("global_pdf_name", pdfName);
    }, [pdfName]);

    const resetCatalog = () => {
        setCatalogId(null);
        setProjectName("Nuovo Progetto");
        setCsvName("");
        setPdfName("");
        setProducts([]);
        setPdfPages([]);
        setSkuToPageMap({});
        setCurrentPdfUrl(null);
        setIsProcessing(false);
        localStorage.removeItem("global_catalog_id");
        localStorage.removeItem("global_project_name");
        localStorage.removeItem("global_csv_name");
        localStorage.removeItem("global_pdf_name");
    };

    return (
        <CatalogContext.Provider value={{
            catalogId, setCatalogId,
            projectName, setProjectName,
            csvName, setCsvName,
            pdfName, setPdfName,
            products, setProducts,
            pdfPages, setPdfPages,
            skuToPageMap, setSkuToPageMap,
            currentPdfUrl, setCurrentPdfUrl,
            isProcessing, setIsProcessing,
            resetCatalog
        }}>
            {children}
        </CatalogContext.Provider>
    );
}

export function useCatalog() {
    const context = useContext(CatalogContext);
    if (context === undefined) {
        throw new Error("useCatalog must be used within a CatalogProvider");
    }
    return context;
}
