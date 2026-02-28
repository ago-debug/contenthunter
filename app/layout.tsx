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
import { AuthProvider } from "@/components/Providers";
import LayoutClient from "@/components/LayoutClient";

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
                <AuthProvider>
                    <LayoutClient>
                        {children}
                    </LayoutClient>
                </AuthProvider>

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
