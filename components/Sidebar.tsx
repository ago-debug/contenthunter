"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Database,
    FileDown,
    Calendar,
    BarChart3,
    History,
    Settings,
    ShieldCheck,
    Box,
    Globe,
    Cpu
} from "lucide-react";

export default function Sidebar() {
    const pathname = usePathname();

    const menuGroups = [
        {
            label: "Core PIM",
            items: [
                { href: "/", label: "Master ERP", icon: Database },
                { href: "/import", label: "Import Lab", icon: FileDown },
                { href: "/catalogues", label: "Catalogues", icon: Box },
            ]
        },
        {
            label: "Distribution",
            items: [
                { href: "/export", label: "Excel Export", icon: FileDown },
                { href: "/channels", label: "Omnichannel", icon: Globe },
            ]
        },
        {
            label: "System & AI",
            items: [
                { href: "/settings", label: "Settings", icon: Settings },
                { href: "/admin", label: "Control Center", icon: ShieldCheck },
            ]
        }
    ];

    return (
        <aside className="w-72 bg-white border-r border-slate-200 sticky top-0 h-screen flex flex-col p-6 overflow-y-auto custom-scrollbar shadow-sm">
            <div className="flex items-center gap-3 mb-10 px-2">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center font-black text-white shadow-lg overflow-hidden shrink-0">
                    <span className="text-sm">CH</span>
                </div>
                <div>
                    <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">
                        Content<span className="text-blue-600">Hunter</span>
                    </h1>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">Enterprise PIM</p>
                </div>
            </div>

            <nav className="flex-1 space-y-8">
                {menuGroups.map((group, gIdx) => (
                    <div key={gIdx} className="space-y-3">
                        <h3 className="px-3 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            {group.label}
                        </h3>
                        <div className="space-y-1">
                            {group.items.map((item, iIdx) => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={iIdx}
                                        href={item.href}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-all group ${isActive
                                            ? 'bg-slate-50 text-slate-900 border border-slate-100'
                                            : 'text-slate-400 hover:bg-slate-50/50 hover:text-slate-600'
                                            }`}
                                    >
                                        <div className={`p-1.5 rounded-lg transition-all ${isActive ? 'bg-white shadow-sm text-blue-600 border border-blue-50' : 'text-slate-300 group-hover:text-slate-500'}`}>
                                            <Icon className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="tracking-tight">{item.label}</span>
                                        {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></div>}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 transition-all cursor-pointer group mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 group-hover:border-blue-200 group-hover:text-blue-600 transition-all">
                            <Cpu className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-black text-slate-900 leading-none">AI Hub</span>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">GPT-4o Ready</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 px-2 py-2">
                    <div className="w-9 h-9 rounded-full bg-slate-200 border-2 border-white shadow-sm shrink-0"></div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-[11px] font-black text-slate-900 truncate">Augusto Genca</span>
                        <span className="text-[9px] font-bold text-slate-400">PIM Administrator</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
