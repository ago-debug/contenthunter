import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
    Settings,
    Search
} from "lucide-react";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Content Hunter",
    description: "Advanced PDF catalogue disassembly and SKU-Image mapping workspace.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.className} bg-[#F4F5F7]`}>
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
                                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full border border-green-100">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <span className="text-[10px] font-bold text-green-700 uppercase tracking-widest">System Online</span>
                                </div>
                                <button className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-gray-400 hover:text-gray-900 transition-colors">
                                    <Settings className="w-5 h-5" />
                                </button>
                            </div>
                        </header>

                        <main className="flex-1 overflow-y-auto custom-scrollbar">
                            {children}
                        </main>
                    </div>
                </div>

                <ToastContainer
                    position="bottom-right"
                    theme="light"
                    toastStyle={{
                        background: '#ffffff',
                        border: '1px solid #E5E7EB',
                        borderRadius: '1rem',
                        padding: '1rem',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#111827',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                />
            </body>
        </html>
    );
}
