"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, ArrowRight, UserPlus, User, CheckCircle2 } from "lucide-react";
import { toast } from "react-toastify";

export default function RegisterPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await res.json();

            if (res.ok) {
                toast.success("Registrazione completata! Accedi ora.");
                router.push("/login");
            } else {
                toast.error(data.message || "Errore durante la registrazione.");
            }
        } catch (error) {
            toast.error("Si è verificato un errore di rete.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-[#F4F5F7]">
            {/* Decorative Sidebar */}
            <div className="hidden lg:flex flex-col justify-between p-12 bg-[#111827] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-orange-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>

                <div className="relative z-10">
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center mb-8 border border-white/10 shadow-2xl">
                        <UserPlus className="w-8 h-8 text-orange-400" />
                    </div>
                    <h1 className="text-5xl font-black text-white leading-tight mb-8">
                        Crea il tuo <br /> <span className="text-orange-500">Workspace</span>
                    </h1>
                    <p className="text-gray-400 text-lg font-bold max-w-md">
                        Unisciti alla piattaforma di catalogazione automatizzata più avanzata del settore.
                    </p>

                    <div className="mt-12 space-y-6">
                        <div className="flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center border border-orange-500/20 group-hover:bg-orange-500/40 transition-all">
                                <CheckCircle2 className="w-5 h-5 text-orange-400" />
                            </div>
                            <p className="text-sm font-black text-white uppercase tracking-widest">Estrazione Automatica SKU</p>
                        </div>
                        <div className="flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20 group-hover:bg-blue-500/40 transition-all">
                                <CheckCircle2 className="w-5 h-5 text-blue-400" />
                            </div>
                            <p className="text-sm font-black text-white uppercase tracking-widest">Web Scraping Intelligence</p>
                        </div>
                    </div>
                </div>

                <div className="relative z-10">
                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em]">Industrial Content Engine V3</p>
                </div>
            </div>

            {/* Register Form */}
            <div className="flex items-center justify-center p-8 bg-white lg:bg-transparent">
                <div className="w-full max-w-md">
                    <div className="lg:hidden text-center mb-12">
                        <h1 className="text-3xl font-black text-[#111827] mb-2">Content Hunter</h1>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Registrazione Workspace</p>
                    </div>

                    <div className="bg-white p-12 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.08)] border border-gray-100">
                        <h2 className="text-2xl font-black text-[#111827] mb-8">Nuovo Account</h2>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-4 block">Nome Completo</label>
                                <div className="relative group">
                                    <User className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-focus-within:text-orange-500 transition-colors" />
                                    <input
                                        required
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Mario Rossi"
                                        className="w-full h-16 bg-gray-50 border border-transparent rounded-[1.25rem] pl-16 pr-6 text-sm font-bold focus:bg-white focus:border-orange-200 outline-none transition-all focus:ring-4 focus:ring-orange-100 placeholder:text-gray-300"
                                    />
                                </div>
                            </div>

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
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-4 block">Password Sicura</label>
                                <div className="relative group">
                                    <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-focus-within:text-orange-500 transition-colors" />
                                    <input
                                        required
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Minimo 8 caratteri"
                                        className="w-full h-16 bg-gray-50 border border-transparent rounded-[1.25rem] pl-16 pr-6 text-sm font-bold focus:bg-white focus:border-orange-200 outline-none transition-all focus:ring-4 focus:ring-orange-100 placeholder:text-gray-300"
                                    />
                                </div>
                            </div>

                            <button
                                disabled={isLoading}
                                type="submit"
                                className="w-full h-16 bg-[#111827] text-white rounded-[1.25rem] font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl hover:shadow-orange-200 flex items-center justify-center gap-3 group mt-4 disabled:opacity-50"
                            >
                                {isLoading ? "Creazione in corso..." : (
                                    <>
                                        Crea Account
                                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-12 text-center">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                Hai già un account? {" "}
                                <Link href="/login" className="text-orange-600 font-black hover:underline underline-offset-4 decoration-2">Accedi Qui</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
