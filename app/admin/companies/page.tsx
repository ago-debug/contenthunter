"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
    Building2,
    Plus,
    Pencil,
    Trash2,
    ArrowLeft,
    SlidersHorizontal,
    Users,
    FileText,
    UserPlus,
    ToggleLeft,
    ToggleRight,
} from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";
import { useAppDialogs } from "@/components/AppDialogsProvider";

type CompanyRow = {
    id: number;
    name: string;
    slug: string;
    createdAt: string;
    usersCount: number;
    productsCount: number;
    catalogsCount: number;
};

type CompanyAnagrafica = {
    legalName: string | null;
    vatNumber: string | null;
    fiscalCode: string | null;
    contactEmail: string | null;
    pecEmail: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    province: string | null;
    country: string | null;
    sdiRecipientCode: string | null;
};

type CompanyUserRow = {
    id: number;
    email: string;
    name: string | null;
    isActive: boolean;
    profileId: number | null;
    profile: { id: number; name: string } | null;
    createdAt: string;
};

type ProfileOption = { id: number; name: string };

const emptyAnagraficaForm = () => ({
    legalName: "",
    vatNumber: "",
    fiscalCode: "",
    contactEmail: "",
    pecEmail: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postalCode: "",
    province: "",
    country: "IT",
    sdiRecipientCode: "",
});

function anagraficaFromApi(a: CompanyAnagrafica | undefined) {
    if (!a) return emptyAnagraficaForm();
    const s = (v: string | null) => (v == null ? "" : String(v));
    return {
        legalName: s(a.legalName),
        vatNumber: s(a.vatNumber),
        fiscalCode: s(a.fiscalCode),
        contactEmail: s(a.contactEmail),
        pecEmail: s(a.pecEmail),
        phone: s(a.phone),
        addressLine1: s(a.addressLine1),
        addressLine2: s(a.addressLine2),
        city: s(a.city),
        postalCode: s(a.postalCode),
        province: s(a.province),
        country: s(a.country) || "IT",
        sdiRecipientCode: s(a.sdiRecipientCode),
    };
}

function anagraficaPayload(form: ReturnType<typeof emptyAnagraficaForm>): CompanyAnagrafica {
    const t = (v: string) => {
        const x = v.trim();
        return x === "" ? null : x;
    };
    return {
        legalName: t(form.legalName),
        vatNumber: t(form.vatNumber),
        fiscalCode: t(form.fiscalCode),
        contactEmail: t(form.contactEmail),
        pecEmail: t(form.pecEmail),
        phone: t(form.phone),
        addressLine1: t(form.addressLine1),
        addressLine2: t(form.addressLine2),
        city: t(form.city),
        postalCode: t(form.postalCode),
        province: t(form.province),
        country: t(form.country),
        sdiRecipientCode: t(form.sdiRecipientCode),
    };
}

export default function AdminCompaniesPage() {
    const { confirm: appConfirm } = useAppDialogs();
    const [list, setList] = useState<CompanyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [modalTab, setModalTab] = useState<"anagrafica" | "utenti">("anagrafica");
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [anagrafica, setAnagrafica] = useState(emptyAnagraficaForm);
    const [companyUsers, setCompanyUsers] = useState<CompanyUserRow[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [profiles, setProfiles] = useState<ProfileOption[]>([]);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserName, setNewUserName] = useState("");
    const [newUserProfileId, setNewUserProfileId] = useState<string>("");
    const [creatingUser, setCreatingUser] = useState(false);

    const fetchCompanies = async () => {
        try {
            const { data, status } = await axios.get<CompanyRow[]>("/api/companies").catch((e) => ({
                data: [],
                status: e?.response?.status,
            }));
            if (status === 403) {
                setForbidden(true);
                setList([]);
            } else {
                setList(Array.isArray(data) ? data : []);
            }
        } catch (_) {
            setForbidden(true);
            setList([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCompanies();
    }, []);

    const loadProfiles = useCallback(async () => {
        try {
            const { data } = await axios.get<ProfileOption[]>("/api/profiles");
            setProfiles(Array.isArray(data) ? data : []);
        } catch {
            setProfiles([]);
        }
    }, []);

    const loadCompanyDetail = useCallback(async (id: number) => {
        setDetailLoading(true);
        try {
            const { data } = await axios.get<{
                anagrafica?: CompanyAnagrafica;
                users?: CompanyUserRow[];
            }>(`/api/companies/${id}`);
            setAnagrafica(anagraficaFromApi(data.anagrafica));
            setCompanyUsers(Array.isArray(data.users) ? data.users : []);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore caricamento scheda");
            setCompanyUsers([]);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const openCreate = () => {
        setEditingId(null);
        setName("");
        setSlug("");
        setAnagrafica(emptyAnagraficaForm());
        setCompanyUsers([]);
        setModalTab("anagrafica");
        setModalOpen(true);
        void loadProfiles();
    };

    const openEdit = (c: CompanyRow) => {
        setEditingId(c.id);
        setName(c.name);
        setSlug(c.slug);
        setModalTab("anagrafica");
        setModalOpen(true);
        void loadProfiles();
        void loadCompanyDetail(c.id);
    };

    const refreshUsersOnly = async (id: number) => {
        try {
            const { data } = await axios.get<{ users?: CompanyUserRow[] }>(`/api/companies/${id}`);
            setCompanyUsers(Array.isArray(data.users) ? data.users : []);
        } catch {
            /* ignore */
        }
    };

    const save = async () => {
        if (!name.trim()) {
            toast.error("Inserisci il nome dell’azienda (ragione sociale o nome commerciale)");
            return;
        }
        setSaving(true);
        try {
            const ana = anagraficaPayload(anagrafica);
            if (editingId) {
                await axios.put(`/api/companies/${editingId}`, {
                    name: name.trim(),
                    slug: slug.trim() || undefined,
                    ...ana,
                });
                toast.success("Scheda azienda aggiornata");
                await loadCompanyDetail(editingId);
            } else {
                await axios.post("/api/companies", {
                    name: name.trim(),
                    slug: slug.trim() || undefined,
                    ...ana,
                });
                toast.success("Azienda creata");
            }
            setModalOpen(false);
            fetchCompanies();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore salvataggio");
        } finally {
            setSaving(false);
        }
    };

    const deleteCompany = async (id: number) => {
        if (!(await appConfirm("Eliminare questa azienda? Verranno eliminati anche tutti i dati associati (cataloghi, prodotti, utenti dell’azienda)."))) return;
        setDeletingId(id);
        try {
            await axios.delete(`/api/companies/${id}`);
            toast.success("Azienda eliminata");
            fetchCompanies();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore eliminazione");
        } finally {
            setDeletingId(null);
        }
    };

    const toggleUserActive = async (u: CompanyUserRow) => {
        if (!editingId) return;
        try {
            await axios.patch(`/api/users/${u.id}`, { isActive: !u.isActive });
            toast.success(u.isActive ? "Utente disattivato" : "Utente riattivato");
            await refreshUsersOnly(editingId);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore aggiornamento utente");
        }
    };

    const createCompanyUser = async () => {
        if (!editingId) return;
        if (!newUserEmail.trim()) {
            toast.error("Email obbligatoria");
            return;
        }
        if (!newUserPassword || newUserPassword.length < 6) {
            toast.error("Password minimo 6 caratteri");
            return;
        }
        setCreatingUser(true);
        try {
            await axios.post("/api/users", {
                email: newUserEmail.trim(),
                password: newUserPassword,
                name: newUserName.trim() || undefined,
                companyId: editingId,
                profileId: newUserProfileId === "" ? null : Number(newUserProfileId),
            });
            toast.success("Utente creato");
            setNewUserEmail("");
            setNewUserPassword("");
            setNewUserName("");
            setNewUserProfileId("");
            await refreshUsersOnly(editingId);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "Errore creazione utente");
        } finally {
            setCreatingUser(false);
        }
    };

    if (forbidden) {
        return (
            <div className="p-12 max-w-2xl mx-auto text-center">
                <p className="text-slate-600 font-bold">Solo l’admin globale può visualizzare e gestire le aziende.</p>
                <Link href="/admin" className="mt-4 inline-block text-orange-600 font-bold hover:underline">
                    Torna all’Admin
                </Link>
            </div>
        );
    }

    const tabBtn = (id: "anagrafica" | "utenti", label: string, icon: React.ReactNode) => (
        <button
            type="button"
            onClick={() => setModalTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-colors ${
                modalTab === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div className="p-12 space-y-8 max-w-5xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/admin" className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Building2 className="w-7 h-7 text-orange-500" />
                            Aziende
                        </h1>
                        <p className="text-sm text-slate-500">
                            Anagrafica cliente e multi-azienda. Solo l’admin globale crea e modifica le aziende; i piani e i limiti tenant sono in{" "}
                            <span className="font-bold text-slate-700">Piani &amp; tenant</span>.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href="/admin/platform"
                        className="flex items-center gap-2 border border-slate-200 text-slate-800 px-5 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-colors"
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        Piani &amp; tenant
                    </Link>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Nuova azienda
                    </button>
                </div>
            </header>

            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-100 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-500">Caricamento...</div>
                ) : list.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        Nessuna azienda. Crea la prima azienda e assegna gli utenti dalla scheda o dalla pagina Utenti.
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {list.map((c) => (
                            <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 p-6 hover:bg-slate-50/50">
                                <div>
                                    <p className="font-black text-slate-900">{c.name}</p>
                                    <p className="text-sm text-slate-500">{c.slug}</p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {c.usersCount} utenti · {c.productsCount} prodotti · {c.catalogsCount} cataloghi
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => openEdit(c)}
                                        className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
                                        title="Scheda anagrafica e utenti"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => deleteCompany(c.id)}
                                        disabled={deletingId === c.id}
                                        className="p-2.5 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 disabled:opacity-50"
                                        title="Elimina"
                                    >
                                        {deletingId === c.id ? (
                                            <span className="w-4 h-4 block border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-black text-slate-900">
                                {editingId ? "Scheda anagrafica azienda" : "Nuova azienda"}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 font-medium">
                                Dati del cliente (fatturazione e contatti). Per limiti tenant e moduli (SEO/PDF) usa la pagina Piani & tenant.
                            </p>
                            <div className="flex flex-wrap gap-2 mt-4">
                                {tabBtn("anagrafica", "Anagrafica", <FileText className="w-4 h-4" />)}
                                {tabBtn("utenti", "Utenti", <Users className="w-4 h-4" />)}
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 min-h-0">
                            {modalTab === "anagrafica" && (
                                <div className="space-y-6">
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                                Nome commerciale / uso interno
                                            </label>
                                            <input
                                                type="text"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                placeholder="es. Dimensione Casa"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                                Slug (opzionale)
                                            </label>
                                            <input
                                                type="text"
                                                value={slug}
                                                onChange={(e) => setSlug(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                placeholder="identificativo-url"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                                Ragione sociale completa
                                            </label>
                                            <input
                                                type="text"
                                                value={anagrafica.legalName}
                                                onChange={(e) => setAnagrafica((a) => ({ ...a, legalName: e.target.value }))}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                placeholder="Se diversa dal nome sopra"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Dati fiscali</p>
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Partita IVA</label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.vatNumber}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, vatNumber: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                    placeholder="IT01234567890"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Codice fiscale</label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.fiscalCode}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, fiscalCode: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                                    Codice destinatario / SDI
                                                </label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.sdiRecipientCode}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, sdiRecipientCode: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                    placeholder="es. ABCDE12 o 0000000"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Contatti</p>
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                                                <input
                                                    type="email"
                                                    value={anagrafica.contactEmail}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, contactEmail: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">PEC</label>
                                                <input
                                                    type="email"
                                                    value={anagrafica.pecEmail}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, pecEmail: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Telefono</label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.phone}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, phone: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Sede legale / operativa</p>
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            <div className="sm:col-span-2">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Indirizzo</label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.addressLine1}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, addressLine1: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                    placeholder="Via, numero civico"
                                                />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                                    Indirizzo (riga 2)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.addressLine2}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, addressLine2: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">CAP</label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.postalCode}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, postalCode: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Città</label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.city}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, city: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Provincia</label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.province}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, province: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                    placeholder="VE"
                                                    maxLength={8}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Paese (ISO)</label>
                                                <input
                                                    type="text"
                                                    value={anagrafica.country}
                                                    onChange={(e) => setAnagrafica((a) => ({ ...a, country: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                                                    placeholder="IT"
                                                    maxLength={2}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalTab === "utenti" && (
                                <div className="space-y-6">
                                    {!editingId ? (
                                        <p className="text-sm text-slate-600 font-bold">
                                            Salva prima la nuova azienda; poi potrai aprire la scheda e gestire gli utenti collegati a questo cliente.
                                        </p>
                                    ) : detailLoading ? (
                                        <p className="text-slate-500 text-sm font-bold">Caricamento utenti…</p>
                                    ) : (
                                        <>
                                            <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wider text-slate-500">
                                                        <tr>
                                                            <th className="px-4 py-3">Nome</th>
                                                            <th className="px-4 py-3">Email</th>
                                                            <th className="px-4 py-3">Profilo</th>
                                                            <th className="px-4 py-3">Stato</th>
                                                            <th className="px-4 py-3 text-right">Accesso</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {companyUsers.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 font-medium">
                                                                    Nessun utente associato a questa azienda.
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            companyUsers.map((u) => (
                                                                <tr key={u.id} className="hover:bg-slate-50/80">
                                                                    <td className="px-4 py-3 font-bold text-slate-900">{u.name || "—"}</td>
                                                                    <td className="px-4 py-3 text-slate-700">{u.email}</td>
                                                                    <td className="px-4 py-3 text-slate-600">{u.profile?.name ?? "—"}</td>
                                                                    <td className="px-4 py-3">
                                                                        <span
                                                                            className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-black ${
                                                                                u.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                                                                            }`}
                                                                        >
                                                                            {u.isActive ? "Attivo" : "Disattivato"}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleUserActive(u)}
                                                                            className="inline-flex items-center gap-1.5 text-xs font-black text-slate-700 hover:text-orange-600"
                                                                            title={u.isActive ? "Disattiva accesso" : "Riattiva accesso"}
                                                                        >
                                                                            {u.isActive ? (
                                                                                <ToggleRight className="w-5 h-5 text-emerald-600" />
                                                                            ) : (
                                                                                <ToggleLeft className="w-5 h-5 text-slate-400" />
                                                                            )}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>

                                            <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-5 space-y-4">
                                                <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                                    <UserPlus className="w-4 h-4 text-orange-600" />
                                                    Nuovo utente per questa azienda
                                                </div>
                                                <div className="grid sm:grid-cols-2 gap-3">
                                                    <input
                                                        type="email"
                                                        placeholder="Email *"
                                                        value={newUserEmail}
                                                        onChange={(e) => setNewUserEmail(e.target.value)}
                                                        className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold"
                                                    />
                                                    <input
                                                        type="password"
                                                        placeholder="Password (min 6) *"
                                                        value={newUserPassword}
                                                        onChange={(e) => setNewUserPassword(e.target.value)}
                                                        className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold"
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Nome visualizzato"
                                                        value={newUserName}
                                                        onChange={(e) => setNewUserName(e.target.value)}
                                                        className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold"
                                                    />
                                                    <select
                                                        value={newUserProfileId}
                                                        onChange={(e) => setNewUserProfileId(e.target.value)}
                                                        className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold"
                                                    >
                                                        <option value="">Profilo (opzionale)</option>
                                                        {profiles.map((p) => (
                                                            <option key={p.id} value={p.id}>
                                                                {p.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={createCompanyUser}
                                                    disabled={creatingUser}
                                                    className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-black disabled:opacity-50"
                                                >
                                                    {creatingUser ? "Creazione…" : "Crea utente"}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 flex flex-wrap justify-end gap-3 shrink-0 bg-slate-50/80 rounded-b-3xl">
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 font-bold hover:bg-white bg-white"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                onClick={save}
                                disabled={saving}
                                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black disabled:opacity-50"
                            >
                                {saving ? "Salvataggio..." : editingId ? "Salva scheda" : "Crea azienda"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
