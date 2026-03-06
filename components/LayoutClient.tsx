"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { Search, Settings, LogOut, User as UserIcon, Menu } from "lucide-react";

export default function LayoutClient({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);

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

    return (
        <div className="flex min-h-screen">
            {/* Backdrop mobile: copre tutto il contenuto quando il menu è aperto */}
            <div
                aria-hidden="true"
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 lg:hidden ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={() => setSidebarOpen(false)}
            />

            <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-14 lg:h-20 bg-white border-b border-[#E5E7EB] px-4 sm:px-6 lg:px-12 flex items-center justify-between gap-3 sticky top-0 z-30">
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
