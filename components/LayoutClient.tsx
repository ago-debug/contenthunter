"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { Search, Settings, LogOut, User as UserIcon } from "lucide-react";

export default function LayoutClient({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const pathname = usePathname();

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

    // If not authenticated and not on an auth page, we might want to show children anyway (login will handle redirect if protected)
    // But usually, if we want a global sidebar/header, we only show it if authenticated.

    return (
        <div className="flex min-h-screen">
            <Sidebar />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="h-20 bg-white border-b border-[#E5E7EB] px-8 md:px-12 flex items-center justify-between sticky top-0 z-50">
                    <div className="flex-1 max-w-2xl relative group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cerca asset, SKU o documenti..."
                            className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl pl-16 pr-6 text-sm focus:outline-none focus:ring-4 focus:ring-[#E6D3C1]/20 focus:bg-white transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-6 ml-12">
                        {session && (
                            <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 rounded-2xl border border-gray-100">
                                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                                    <UserIcon className="w-4 h-4 text-orange-600" />
                                </div>
                                <div className="hidden md:block">
                                    <p className="text-[10px] font-black text-gray-400 uppercase leading-none mb-1">Utente</p>
                                    <p className="text-xs font-black text-[#111827] leading-none">{session.user?.name || session.user?.email}</p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <button className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-gray-400 hover:text-gray-900 transition-colors">
                                <Settings className="w-5 h-5" />
                            </button>
                            {session && (
                                <button
                                    onClick={() => signOut({ callbackUrl: "/login" })}
                                    className="p-3 bg-red-50 rounded-xl border border-red-100 text-red-400 hover:text-red-600 transition-colors"
                                    title="Logout"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto custom-scrollbar">
                    {children}
                </main>
            </div>
        </div>
    );
}
