"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface CatalogState {
    catalogId: number | null;
    products: any[];
    pdfPages: any[];
    skuToPageMap: { [sku: string]: number };
    currentPdfUrl: string | null;
    isProcessing: boolean;
}

interface CatalogContextType extends CatalogState {
    setCatalogId: (id: number | null | ((prev: number | null) => number | null)) => void;
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
    const [products, setProducts] = useState<any[]>([]);
    const [pdfPages, setPdfPages] = useState<any[]>([]);
    const [skuToPageMap, setSkuToPageMap] = useState<{ [sku: string]: number }>({});
    const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Persistence
    useEffect(() => {
        const savedId = localStorage.getItem("global_catalog_id");
        if (savedId) setCatalogId(parseInt(savedId));
    }, []);

    useEffect(() => {
        if (catalogId) localStorage.setItem("global_catalog_id", catalogId.toString());
        else localStorage.removeItem("global_catalog_id");
    }, [catalogId]);

    const resetCatalog = () => {
        setCatalogId(null);
        setProducts([]);
        setPdfPages([]);
        setSkuToPageMap({});
        setCurrentPdfUrl(null);
        setIsProcessing(false);
        localStorage.removeItem("global_catalog_id");
    };

    return (
        <CatalogContext.Provider value={{
            catalogId, setCatalogId,
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
