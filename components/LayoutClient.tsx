"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { Search, Settings, LogOut, User as UserIcon, Menu, Building2, ChevronDown } from "lucide-react";
import axios from "axios";

type CompanyOption = { id: number; name: string; slug: string };

export default function LayoutClient({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const companyContext = useCompanyContext();
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [companiesLoaded, setCompaniesLoaded] = useState(false);
    const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);

    const isGlobalAdmin = !!(session?.user as any)?.isGlobalAdmin;

    useEffect(() => {
        if (isGlobalAdmin) {
            axios.get<CompanyOption[]>("/api/companies").then(({ data }) => setCompanies(Array.isArray(data) ? data : [])).catch(() => setCompanies([])).finally(() => setCompaniesLoaded(true));
        } else {
            setCompaniesLoaded(true);
        }
    }, [isGlobalAdmin]);

    // (Intenzionalmente niente auto-selezione o refresh qui.)
    // La selezione azienda è gestita dal CompanyContext e dai singoli moduli
    // che rifanno i fetch quando cambia selectedCompanyId.

    const isAuthPage = pathname === "/login" || pathname === "/register";

    if (status === "loading") {
        return (
            <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-orange-100 border-t-orange-600 rounded-full animate-spin"></div>
                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Inizializzazione sessione...</p>
                </div>
            </div>
        );
    }

    if (isAuthPage) {
        return <main className="min-h-screen bg-[#F4F5F7]">{children}</main>;
    }

    // Admin globale: aspetta di avere aziende caricate e (una selezionata oppure lista vuota) prima di mostrare il contenuto.
    const hasCompanyOrEmpty = companiesLoaded && (companyContext?.selectedCompanyId != null || companies.length === 0);
    const waitingForCompany = isGlobalAdmin && !hasCompanyOrEmpty;
    if (waitingForCompany) {
        return (
            <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-orange-100 border-t-orange-600 rounded-full animate-spin" />
                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Caricamento azienda...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen">
            {/* Backdrop mobile: z-index alto così sta sopra header e contenuti (sticky/modali) */}
            <div
                aria-hidden="true"
                className={`fixed inset-0 bg-black/50 z-[9998] transition-opacity duration-300 lg:hidden ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={() => setSidebarOpen(false)}
            />

            <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-14 lg:h-20 bg-white border-b border-[#E5E7EB] px-4 sm:px-6 lg:px-12 flex items-center justify-between gap-3 sticky top-0 z-[100]">
                    <button
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-2.5 -ml-1 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors touch-manipulation"
                        aria-label="Apri menu"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex-1 min-w-0 max-w-2xl relative group">
                        <Search className="absolute left-3 lg:left-6 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cerca asset, SKU..."
                            className="w-full h-10 lg:h-12 bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl pl-10 lg:pl-16 pr-4 text-sm focus:outline-none focus:ring-2 lg:focus:ring-4 focus:ring-[#E6D3C1]/20 focus:bg-white transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        {isGlobalAdmin && companyContext && (
                            <div className="relative hidden sm:block">
                                <button
                                    type="button"
                                    onClick={() => setCompanyDropdownOpen((v) => !v)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100"
                                >
                                    <Building2 className="w-4 h-4" />
                                    <span className="max-w-[120px] truncate">
                                        {companyContext.selectedCompanyId
                                            ? companies.find((c) => c.id === companyContext.selectedCompanyId)?.name ?? "Azienda"
                                            : "Seleziona azienda"}
                                    </span>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                {companyDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-[90]" aria-hidden onClick={() => setCompanyDropdownOpen(false)} />
                                        <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[95] min-w-[180px] max-h-64 overflow-y-auto">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    companyContext.setSelectedCompanyId(null);
                                                    setCompanyDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-4 py-2 text-xs font-bold ${!companyContext.selectedCompanyId ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                                            >
                                                Nessuna (tutte)
                                            </button>
                                            {companies.map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => {
                                                        companyContext.setSelectedCompanyId(c.id);
                                                        setCompanyDropdownOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-2 text-xs font-bold truncate ${companyContext.selectedCompanyId === c.id ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                                                >
                                                    {c.name}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {session && (
                            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                                    <UserIcon className="w-3.5 h-3.5 text-orange-600" />
                                </div>
                                <div className="hidden md:block">
                                    <p className="text-[10px] font-black text-gray-400 uppercase leading-none">Utente</p>
                                    <p className="text-xs font-black text-[#111827] leading-none truncate max-w-[120px]">{session.user?.name || session.user?.email}</p>
                                </div>
                            </div>
                        )}
                        <button className="p-2.5 lg:p-3 bg-gray-50 rounded-xl border border-gray-100 text-gray-400 hover:text-gray-900 transition-colors touch-manipulation" aria-label="Impostazioni">
                            <Settings className="w-5 h-5" />
                        </button>
                        {session && (
                            <button
                                onClick={() => signOut({ callbackUrl: "/login" })}
                                className="p-2.5 lg:p-3 bg-red-50 rounded-xl border border-red-100 text-red-400 hover:text-red-600 transition-colors touch-manipulation"
                                title="Logout"
                                aria-label="Esci"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    {children}
                </main>
            </div>
        </div>
    );
}
