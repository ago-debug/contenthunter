import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AuthProvider } from "@/components/Providers";
import { CompanyProvider } from "@/contexts/CompanyContext";
import LayoutClient from "@/components/LayoutClient";
import { AppDialogsProvider } from "@/components/AppDialogsProvider";
import { ActivityProvider } from "@/contexts/ActivityContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Iris · Biblioteca prodotti",
    description:
        "Anagrafica prodotti, contenuti multilingua, canali di vendita e integrazioni — tutto in un unico posto.",
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
                    <CompanyProvider>
                        <ActivityProvider>
                            <AppDialogsProvider>
                                <LayoutClient>
                                    {children}
                                </LayoutClient>
                            </AppDialogsProvider>
                        </ActivityProvider>
                    </CompanyProvider>
                </AuthProvider>

                <ToastContainer
                    position="top-right"
                    theme="light"
                    limit={3}
                    style={{ zIndex: 9999 }}
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
