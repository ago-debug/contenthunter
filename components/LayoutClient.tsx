"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { useActivityContext } from "@/contexts/ActivityContext";
import { Settings, LogOut, User as UserIcon, Menu, Building2, ChevronDown, Bell } from "lucide-react";
import axios from "axios";
import Link from "next/link";

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
    const [notifOpen, setNotifOpen] = useState(false);
    const { notifications, unreadNotifications, markAllNotificationsRead } = useActivityContext();

    const isGlobalAdmin = !!(session?.user as any)?.isGlobalAdmin;

    useEffect(() => {
        if (isGlobalAdmin) {
            axios.get<CompanyOption[]>("/api/companies").then(({ data }) => setCompanies(Array.isArray(data) ? data : [])).catch(() => setCompanies([])).finally(() => setCompaniesLoaded(true));
        } else {
            setCompaniesLoaded(true);
        }
    }, [isGlobalAdmin]);

    // Admin globale senza azienda selezionata: seleziona la prima disponibile così le API ricevono x-company-id
    useEffect(() => {
        if (isGlobalAdmin && companyContext && companies.length > 0 && companyContext.selectedCompanyId == null) {
            companyContext.setSelectedCompanyId(companies[0].id);
        }
    }, [isGlobalAdmin, companyContext, companies]);

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
                    <div className="flex-1" />
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
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNotifOpen((v) => !v);
                                        if (unreadNotifications > 0) markAllNotificationsRead();
                                    }}
                                    className="p-2.5 lg:p-3 bg-gray-50 rounded-xl border border-gray-100 text-gray-500 hover:text-gray-900 transition-colors touch-manipulation relative"
                                    aria-label="Notifiche attività"
                                >
                                    <Bell className="w-5 h-5" />
                                    {unreadNotifications > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                                            {unreadNotifications > 9 ? "9+" : unreadNotifications}
                                        </span>
                                    )}
                                </button>
                                {notifOpen && (
                                    <>
                                        <div className="fixed inset-0 z-[90]" aria-hidden onClick={() => setNotifOpen(false)} />
                                        <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[95] min-w-[280px] max-w-[360px]">
                                            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notifiche attività</p>
                                                <Link href="/activities" onClick={() => setNotifOpen(false)} className="text-[10px] font-black text-slate-600 hover:text-slate-900">
                                                    Apri attività
                                                </Link>
                                            </div>
                                            <div className="max-h-72 overflow-y-auto">
                                                {notifications.length === 0 ? (
                                                    <p className="px-3 py-4 text-xs font-semibold text-slate-500">Nessuna notifica.</p>
                                                ) : (
                                                    notifications.slice(0, 8).map((n) => (
                                                        <div key={n.id} className="px-3 py-2.5 border-b last:border-b-0 border-slate-100">
                                                            <p className="text-[11px] font-black text-slate-800">{n.title}</p>
                                                            <p className="text-[11px] text-slate-600 mt-0.5">{n.message}</p>
                                                            <p className="text-[10px] text-slate-400 mt-1">{new Date(n.at).toLocaleString("it-IT")}</p>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
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
