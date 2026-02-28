"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, ArrowRight, ShieldCheck, User } from "lucide-react";
import { toast } from "react-toastify";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const result = await signIn("credentials", {
                redirect: false,
                email,
                password,
            });

            if (result?.error) {
                toast.error("Credenziali non valide. Riprova.");
            } else {
                toast.success("Login effettuato con successo!");
                router.push("/");
            }
        } catch (error) {
            toast.error("Si è verificato un errore durante il login.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-[#F4F5F7]">
            {/* Decorative Sidebar */}
            <div className="hidden lg:flex flex-col justify-between p-12 bg-[#111827] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-orange-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>

                <div className="relative z-10">
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center mb-8 border border-white/10 shadow-2xl">
                        <ShieldCheck className="w-8 h-8 text-orange-400" />
                    </div>
                    <h1 className="text-5xl font-black text-white leading-tight mb-8">
                        Accedi a <br /> <span className="text-orange-500">Content Hunter</span>
                    </h1>
                    <p className="text-gray-400 text-lg font-bold max-w-md">
                        Il sistema avanzato per la gestione cataloghi, SKU e asset digitali intelligence-driven.
                    </p>
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="flex -space-x-3">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="w-10 h-10 rounded-full border-2 border-[#111827] bg-gray-800 flex items-center justify-center">
                                    <User className="w-4 h-4 text-gray-400" />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Utilizzato da oltre 500 cataloghisti</p>
                    </div>
                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em]">Version 3.1 Industrial Edition</p>
                </div>
            </div>

            {/* Login Form */}
            <div className="flex items-center justify-center p-8 bg-white lg:bg-transparent">
                <div className="w-full max-w-md">
                    <div className="lg:hidden text-center mb-12">
                        <h1 className="text-3xl font-black text-[#111827] mb-2">Content Hunter</h1>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Accesso Riservato</p>
                    </div>

                    <div className="bg-white p-12 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.08)] border border-gray-100">
                        <h2 className="text-2xl font-black text-[#111827] mb-8">Bentornato</h2>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-4 block">Email Aziendale</label>
                                <div className="relative group">
                                    <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-focus-within:text-orange-500 transition-colors" />
                                    <input
                                        required
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="nome@azienda.it"
                                        className="w-full h-16 bg-gray-50 border border-transparent rounded-[1.25rem] pl-16 pr-6 text-sm font-bold focus:bg-white focus:border-orange-200 outline-none transition-all focus:ring-4 focus:ring-orange-100 placeholder:text-gray-300"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-4 block">Password Personale</label>
                                <div className="relative group">
                                    <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-focus-within:text-orange-500 transition-colors" />
                                    <input
                                        required
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full h-16 bg-gray-50 border border-transparent rounded-[1.25rem] pl-16 pr-6 text-sm font-bold focus:bg-white focus:border-orange-200 outline-none transition-all focus:ring-4 focus:ring-orange-100 placeholder:text-gray-300"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest pt-2">
                                <label className="flex items-center gap-3 text-gray-400 cursor-pointer">
                                    <input type="checkbox" className="w-4 h-4 border-2 border-gray-200 rounded-md checked:bg-orange-500 transition-all cursor-pointer" />
                                    Ricordami
                                </label>
                                <a href="#" className="text-orange-600 hover:text-orange-700">Password dimenticata?</a>
                            </div>

                            <button
                                disabled={isLoading}
                                type="submit"
                                className="w-full h-16 bg-[#111827] text-white rounded-[1.25rem] font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl hover:shadow-orange-200 flex items-center justify-center gap-3 group disabled:opacity-50"
                            >
                                {isLoading ? "Verifica in corso..." : (
                                    <>
                                        Inizia Sessione
                                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-12 text-center">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                Non hai un account? {" "}
                                <Link href="/register" className="text-orange-600 font-black hover:underline underline-offset-4 decoration-2">Registrati Ora</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
