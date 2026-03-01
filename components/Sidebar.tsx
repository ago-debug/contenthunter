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
        <aside className="w-80 bg-white border-r border-[#E5E7EB] sticky top-0 h-screen flex flex-col p-8 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-4 mb-14 px-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center font-black text-white shadow-xl shadow-slate-200">
                    CH
                </div>
                <div>
                    <h1 className="text-xl font-black tracking-tighter text-slate-900 leading-none">
                        Content<span className="text-blue-600">Hunter</span>
                    </h1>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1.5">Enterprise PIM</p>
                </div>
            </div>

            <nav className="flex-1 space-y-10">
                {menuGroups.map((group, gIdx) => (
                    <div key={gIdx} className="space-y-4">
                        <h3 className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
                            {group.label}
                        </h3>
                        <div className="space-y-1.5">
                            {group.items.map((item, iIdx) => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={iIdx}
                                        href={item.href}
                                        className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all group ${isActive
                                            ? 'bg-slate-50 text-slate-900 shadow-sm border border-slate-100'
                                            : 'text-slate-400 hover:bg-slate-50/50 hover:text-slate-600'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-white shadow-sm text-blue-600' : 'text-slate-300 group-hover:text-slate-500'}`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <span className="tracking-tight">{item.label}</span>
                                        {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600"></div>}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="mt-12 pt-8 border-t border-slate-100">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 hover:border-blue-100 transition-all cursor-pointer group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 group-hover:border-blue-200 group-hover:text-blue-600 transition-all">
                            <Cpu className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-black text-slate-900">AI Node Active</span>
                            <span className="text-[10px] font-bold text-slate-400">GPT-4o Engine</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4 px-4 py-6">
                    <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm"></div>
                    <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-900">Administrator</span>
                        <span className="text-[10px] font-bold text-slate-400">Enterprise Access</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
