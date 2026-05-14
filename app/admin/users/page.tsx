"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { CURRENT_TERMS_VERSION } from "@/lib/terms-version";
import { ArrowLeft, Pencil, UserPlus, ScrollText, Download } from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";

type UserRow = {
    id: number;
    name: string | null;
    lastName: string | null;
    phone: string | null;
    fiscalCode: string | null;
    email: string;
    companyId: number | null;
    companyName: string | null;
    profileId: number | null;
    profileName: string | null;
    termsAcceptedAt: string | null;
    termsVersion: string | null;
    createdAt: string;
    updatedAt: string;
};

type ProfileOption = { id: number; name: string };
type CompanyOption = { id: number; name: string; slug: string };

type AuditRow = {
    id: number;
    action: string;
    emailHint: string | null;
    ip: string | null;
    userAgent: string | null;
    details: unknown;
    createdAt: string;
};

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [profiles, setProfiles] = useState<ProfileOption[]>([]);
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<UserRow | null>(null);
    const [editProfileId, setEditProfileId] = useState<number | null>(null);
    const [editCompanyId, setEditCompanyId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [editLastName, setEditLastName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editFiscalCode, setEditFiscalCode] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [editAcceptTermsNow, setEditAcceptTermsNow] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newName, setNewName] = useState("");
    const [newLastName, setNewLastName] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [newFiscalCode, setNewFiscalCode] = useState("");
    const [newCompanyId, setNewCompanyId] = useState<number | null>(null);
    const [newProfileId, setNewProfileId] = useState<number | null>(null);
    const [newAcceptTerms, setNewAcceptTerms] = useState(false);
    const [creating, setCreating] = useState(false);
    const [auditUserId, setAuditUserId] = useState<number | null>(null);
    const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const { data: session } = useSession();
    const isGlobalAdmin = !!(session?.user as { isGlobalAdmin?: boolean }).isGlobalAdmin;
    const companyContext = useCompanyContext();
    const selectedCompanyId = companyContext?.selectedCompanyId ?? null;

    const fetchUsers = async () => {
        try {
            let url = "/api/users";
            if (isGlobalAdmin && selectedCompanyId != null) {
                url = `/api/users?companyId=${selectedCompanyId}`;
            }
            const { data } = await axios.get<UserRow[]>(url);
            setUsers(data);
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
            toast.error(msg || "Errore caricamento utenti");
        }
    };

    const fetchProfiles = async () => {
        try {
            const { data } = await axios.get<{ id: number; name: string }[]>("/api/profiles");
            setProfiles(data);
        } catch (_) {
            setProfiles([]);
        }
    };

    const fetchCompanies = async () => {
        try {
            const { data } = await axios.get<CompanyOption[]>("/api/companies");
            setCompanies(Array.isArray(data) ? data : []);
        } catch (_) {
            setCompanies([]);
        }
    };

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchUsers(), fetchProfiles(), isGlobalAdmin ? fetchCompanies() : Promise.resolve()]).finally(() =>
            setLoading(false)
        );
    }, [isGlobalAdmin, selectedCompanyId]);

    const openAudit = async (userId: number) => {
        setAuditUserId(userId);
        setAuditLoading(true);
        setAuditRows([]);
        try {
            const { data } = await axios.get<{ items: AuditRow[] }>(`/api/users/${userId}/audit`);
            setAuditRows(data.items ?? []);
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
            toast.error(msg || "Errore caricamento log");
            setAuditUserId(null);
        } finally {
            setAuditLoading(false);
        }
    };

    const downloadAuditCsv = (userId: number) => {
        window.open(`/api/users/${userId}/audit?format=csv`, "_blank", "noopener,noreferrer");
    };

    const displayName = (u: UserRow) => {
        const parts = [u.name, u.lastName].filter(Boolean);
        return parts.length ? parts.join(" ") : u.email;
    };

    const openEdit = (u: UserRow) => {
        setEditingUser(u);
        setEditProfileId(u.profileId);
        setEditCompanyId(u.companyId);
        setEditName(u.name || "");
        setEditLastName(u.lastName || "");
        setEditPhone(u.phone || "");
        setEditFiscalCode(u.fiscalCode || "");
        setEditEmail(u.email);
        setEditPassword("");
        setEditAcceptTermsNow(false);
    };

    const saveUser = async () => {
        if (!editingUser) return;
        if (!editEmail.trim()) {
            toast.error("L'email è obbligatoria");
            return;
        }
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                name: editName.trim() || null,
                lastName: editLastName.trim() || null,
                phone: editPhone.trim() || null,
                fiscalCode: editFiscalCode.trim() || null,
                email: editEmail.trim(),
                profileId: editProfileId,
            };
            if (editPassword.length > 0) {
                if (editPassword.length < 6) {
                    toast.error("La password deve avere almeno 6 caratteri");
                    setSaving(false);
                    return;
                }
                payload.password = editPassword;
            }
            if (isGlobalAdmin) payload.companyId = editCompanyId;
            if (editAcceptTermsNow) payload.acceptTerms = true;

            await axios.patch(`/api/users/${editingUser.id}`, payload);
            toast.success("Utente aggiornato");
            setEditingUser(null);
            fetchUsers();
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
            toast.error(msg || "Errore aggiornamento");
        } finally {
            setSaving(false);
        }
    };

    const createUser = async () => {
        if (!newEmail.trim()) {
            toast.error("Inserisci l'email");
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            toast.error("Password obbligatoria (minimo 6 caratteri)");
            return;
        }
        if (!newAcceptTerms) {
            toast.error("È necessario confermare l'accettazione delle condizioni d'uso");
            return;
        }
        setCreating(true);
        try {
            await axios.post("/api/users", {
                email: newEmail.trim(),
                password: newPassword,
                name: newName.trim() || undefined,
                lastName: newLastName.trim() || undefined,
                phone: newPhone.trim() || undefined,
                fiscalCode: newFiscalCode.trim() || undefined,
                companyId: isGlobalAdmin ? newCompanyId : undefined,
                profileId: newProfileId ?? undefined,
                acceptTerms: true,
            });
            toast.success("Utente creato");
            setShowCreate(false);
            setNewEmail("");
            setNewPassword("");
            setNewName("");
            setNewLastName("");
            setNewPhone("");
            setNewFiscalCode("");
            setNewCompanyId(null);
            setNewProfileId(null);
            setNewAcceptTerms(false);
            fetchUsers();
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
            toast.error(msg || "Errore creazione utente");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="p-12 space-y-8 max-w-5xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/admin" className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Utenti</h1>
                        <p className="text-sm text-slate-500">
                            Anagrafica, condizioni d&apos;uso, profilo e log accessi/attività (contesto azienda dall&apos;header).
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black"
                >
                    <UserPlus className="w-4 h-4" />
                    Aggiungi utente
                </button>
            </header>

            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-100 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-500">Caricamento...</div>
                ) : users.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">Nessun utente.</div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {users.map((u) => (
                            <li
                                key={u.id}
                                className="flex flex-wrap items-center justify-between gap-4 p-6 hover:bg-slate-50/50"
                            >
                                <div>
                                    <p className="font-black text-slate-900">{displayName(u)}</p>
                                    <p className="text-sm text-slate-500">{u.email}</p>
                                    {(u.phone || u.fiscalCode) && (
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {u.phone ? `Tel. ${u.phone}` : ""}
                                            {u.phone && u.fiscalCode ? " · " : ""}
                                            {u.fiscalCode ? `CF ${u.fiscalCode}` : ""}
                                        </p>
                                    )}
                                    <p className="text-xs text-slate-400 mt-1">
                                        Azienda: {u.companyName ?? "—"} · Profilo: {u.profileName ?? "—"}
                                        {u.termsAcceptedAt ? (
                                            <span className="text-emerald-600 font-bold"> · Condizioni: OK</span>
                                        ) : (
                                            <span className="text-amber-600 font-bold"> · Condizioni: mancanti</span>
                                        )}
                                    </p>
                                </div>
                                <button
                                    onClick={() => openEdit(u)}
                                    className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
                                    title="Modifica utente"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100">
                            <h2 className="text-xl font-black text-slate-900">Nuovo utente</h2>
                            <p className="text-sm text-slate-500 mt-1">Anagrafica, credenziali, azienda e profilo.</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Email *
                                </label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    placeholder="email@esempio.it"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Password *
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    placeholder="Minimo 6 caratteri"
                                />
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        Nome
                                    </label>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        Cognome
                                    </label>
                                    <input
                                        type="text"
                                        value={newLastName}
                                        onChange={(e) => setNewLastName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Telefono
                                </label>
                                <input
                                    type="text"
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Codice fiscale
                                </label>
                                <input
                                    type="text"
                                    value={newFiscalCode}
                                    onChange={(e) => setNewFiscalCode(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                />
                            </div>
                            {isGlobalAdmin && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        Azienda
                                    </label>
                                    <select
                                        value={newCompanyId ?? ""}
                                        onChange={(e) => setNewCompanyId(e.target.value ? Number(e.target.value) : null)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    >
                                        <option value="">— Admin globale (nessuna azienda) —</option>
                                        {companies.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Profilo (permessi)
                                </label>
                                <select
                                    value={newProfileId ?? ""}
                                    onChange={(e) => setNewProfileId(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                >
                                    <option value="">— Nessun profilo —</option>
                                    {profiles.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={newAcceptTerms}
                                    onChange={(e) => setNewAcceptTerms(e.target.checked)}
                                    className="mt-1 w-4 h-4 rounded border-slate-300"
                                />
                                <span className="text-sm text-slate-700 leading-snug">
                                    L&apos;utente accetta le condizioni d&apos;uso e l&apos;informativa privacy della piattaforma
                                    (versione <span className="font-mono font-bold">{CURRENT_TERMS_VERSION}</span>). *
                                </span>
                            </label>
                        </div>
                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={createUser}
                                disabled={creating}
                                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black disabled:opacity-50"
                            >
                                {creating ? "Creazione..." : "Crea utente"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100">
                            <h2 className="text-xl font-black text-slate-900">Modifica utente</h2>
                            <p className="text-sm text-slate-500 mt-1">ID: {editingUser.id}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Email *
                                </label>
                                <input
                                    type="email"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Nuova password
                                </label>
                                <input
                                    type="password"
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    placeholder="Lascia vuoto per non modificare (min. 6 caratteri)"
                                />
                            </div>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Anagrafica</p>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        Nome
                                    </label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        Cognome
                                    </label>
                                    <input
                                        type="text"
                                        value={editLastName}
                                        onChange={(e) => setEditLastName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Telefono
                                </label>
                                <input
                                    type="text"
                                    value={editPhone}
                                    onChange={(e) => setEditPhone(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Codice fiscale
                                </label>
                                <input
                                    type="text"
                                    value={editFiscalCode}
                                    onChange={(e) => setEditFiscalCode(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-2">
                                <p className="text-xs font-bold text-slate-600">Condizioni d&apos;uso</p>
                                {editingUser.termsAcceptedAt ? (
                                    <p className="text-sm text-slate-700">
                                        Accettate il{" "}
                                        <span className="font-mono font-bold">
                                            {new Date(editingUser.termsAcceptedAt).toLocaleString("it-IT")}
                                        </span>
                                        {editingUser.termsVersion ? (
                                            <>
                                                {" "}
                                                · versione <span className="font-mono">{editingUser.termsVersion}</span>
                                            </>
                                        ) : null}
                                    </p>
                                ) : (
                                    <p className="text-sm text-amber-700 font-bold">Nessuna accettazione registrata.</p>
                                )}
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editAcceptTermsNow}
                                        onChange={(e) => setEditAcceptTermsNow(e.target.checked)}
                                        className="mt-1 w-4 h-4 rounded border-slate-300"
                                    />
                                    <span className="text-sm text-slate-700 leading-snug">
                                        Registra ora l&apos;accettazione delle condizioni (versione{" "}
                                        <span className="font-mono font-bold">{CURRENT_TERMS_VERSION}</span>)
                                    </span>
                                </label>
                            </div>

                            {isGlobalAdmin && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        Azienda / Admin globale
                                    </label>
                                    <select
                                        value={editCompanyId ?? ""}
                                        onChange={(e) => setEditCompanyId(e.target.value ? Number(e.target.value) : null)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                    >
                                        <option value="">— Admin globale (accesso a tutte le aziende) —</option>
                                        {companies.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Profilo
                                </label>
                                <select
                                    value={editProfileId ?? ""}
                                    onChange={(e) => setEditProfileId(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                                >
                                    <option value="">— Nessun profilo —</option>
                                    {profiles.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => openAudit(editingUser.id)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm font-bold hover:bg-slate-50"
                                >
                                    <ScrollText className="w-4 h-4" />
                                    Log accessi e attività
                                </button>
                                <button
                                    type="button"
                                    onClick={() => downloadAuditCsv(editingUser.id)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-orange-100 bg-orange-50 text-orange-900 text-sm font-bold hover:bg-orange-100"
                                >
                                    <Download className="w-4 h-4" />
                                    Scarica CSV
                                </button>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={saveUser}
                                disabled={saving}
                                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black disabled:opacity-50"
                            >
                                {saving ? "Salvataggio..." : "Salva"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {auditUserId != null && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-4">
                            <div>
                                <h2 className="text-xl font-black text-slate-900">Log utente #{auditUserId}</h2>
                                <p className="text-sm text-slate-500 mt-1">Login, logout e aggiornamenti profilo.</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => downloadAuditCsv(auditUserId)}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold hover:bg-slate-50"
                                >
                                    <Download className="w-4 h-4" />
                                    CSV
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAuditUserId(null)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 font-bold hover:bg-slate-50"
                                >
                                    Chiudi
                                </button>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {auditLoading ? (
                                <p className="text-slate-500 font-bold">Caricamento...</p>
                            ) : auditRows.length === 0 ? (
                                <p className="text-slate-500">Nessun evento registrato.</p>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="text-left text-xs font-black uppercase text-slate-500 border-b border-slate-100">
                                        <tr>
                                            <th className="pb-3 pr-4">Data</th>
                                            <th className="pb-3 pr-4">Azione</th>
                                            <th className="pb-3 pr-4">IP</th>
                                            <th className="pb-3">Dettagli</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {auditRows.map((r) => (
                                            <tr key={r.id} className="align-top">
                                                <td className="py-3 pr-4 whitespace-nowrap text-slate-600 font-mono text-xs">
                                                    {new Date(r.createdAt).toLocaleString("it-IT")}
                                                </td>
                                                <td className="py-3 pr-4 font-bold text-slate-900">{r.action}</td>
                                                <td className="py-3 pr-4 text-slate-600 text-xs">{r.ip ?? "—"}</td>
                                                <td className="py-3 text-xs text-slate-600 break-all">
                                                    {r.emailHint ? `email: ${r.emailHint} · ` : ""}
                                                    {r.details != null ? JSON.stringify(r.details) : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
