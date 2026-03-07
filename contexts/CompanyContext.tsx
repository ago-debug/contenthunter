"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const STORAGE_KEY = "contenthunter_selected_company_id";

type CompanyContextValue = {
    selectedCompanyId: number | null;
    setSelectedCompanyId: (id: number | null) => void;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
    const [selectedCompanyId, setState] = useState<number | null>(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const n = parseInt(stored, 10);
                if (!Number.isNaN(n)) setState(n);
            }
        } catch (_) {}
    }, []);

    const setSelectedCompanyId = useCallback((id: number | null) => {
        setState(id);
        try {
            if (id != null) {
                localStorage.setItem(STORAGE_KEY, String(id));
                axios.defaults.headers.common["x-company-id"] = String(id);
            } else {
                localStorage.removeItem(STORAGE_KEY);
                delete axios.defaults.headers.common["x-company-id"];
            }
        } catch (_) {}
    }, []);

    useEffect(() => {
        if (selectedCompanyId != null) {
            axios.defaults.headers.common["x-company-id"] = String(selectedCompanyId);
        } else {
            delete axios.defaults.headers.common["x-company-id"];
        }
    }, [selectedCompanyId]);

    return (
        <CompanyContext.Provider value={{ selectedCompanyId, setSelectedCompanyId }}>
            {children}
        </CompanyContext.Provider>
    );
}

export function useCompanyContext() {
    const ctx = useContext(CompanyContext);
    return ctx;
}
