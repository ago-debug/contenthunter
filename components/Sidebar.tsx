"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Database,
    FileDown,
    Calendar,
    BarChart3,
    History
} from "lucide-react";

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-80 bg-white border-r border-[#E5E7EB] sticky top-0 h-screen flex flex-col p-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-4 px-4 mb-12">
                <div className="w-10 h-10 rounded-xl bg-orange-200 flex items-center justify-center font-black text-orange-800">
                    CH
                </div>
                <h1 className="text-xl font-black tracking-tight text-[#111827]">
                    Content <span className="text-gray-400">Hunter</span>
                </h1>
            </div>

            <nav className="space-y-8">
                <div>
                    <h3 className="px-6 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">
                        Menu Principale
                    </h3>
                    <div className="space-y-1">
                        <Link
                            href="/"
                            className={`sidebar-item ${pathname === '/' ? 'active' : ''}`}
                        >
                            <LayoutDashboard className="w-5 h-5" />
                            Workspace
                        </Link>
                        <Link
                            href="/catalogues"
                            className={`sidebar-item ${pathname === '/catalogues' ? 'active' : ''}`}
                        >
                            <Database className="w-5 h-5" />
                            Catalogues
                        </Link>
                        <Link
                            href="/export"
                            className={`sidebar-item ${pathname === '/export' ? 'active' : ''}`}
                        >
                            <FileDown className="w-5 h-5" />
                            Export Console
                        </Link>
                        <div className="sidebar-item opacity-50 cursor-not-allowed">
                            <Calendar className="w-5 h-5" />
                            Schedule
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="px-6 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">
                        Analytics
                    </h3>
                    <div className="space-y-1">
                        <div className="sidebar-item opacity-50 cursor-not-allowed">
                            <BarChart3 className="w-5 h-5" />
                            Reports
                        </div>
                        <div className="sidebar-item opacity-50 cursor-not-allowed">
                            <History className="w-5 h-5" />
                            Audit Logs
                        </div>
                    </div>
                </div>
            </nav>

            <div className="mt-auto pt-8 border-t border-[#E5E7EB]">
                <div className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-gray-50 cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                        AG
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-900">Augusto G.</span>
                        <span className="text-[10px] text-gray-400">Administrator</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
