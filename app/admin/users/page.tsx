"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";

type UserRow = {
  id: number;
  name: string | null;
  email: string;
  companyId: number | null;
  companyName: string | null;
  profileId: number | null;
  profileName: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProfileOption = { id: number; name: string };
type CompanyOption = { id: number; name: string; slug: string };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editProfileId, setEditProfileId] = useState<number | null>(null);
  const [editCompanyId, setEditCompanyId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: session } = useSession();
  const isGlobalAdmin = !!(session?.user as any)?.isGlobalAdmin;

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get<UserRow[]>("/api/users");
      setUsers(data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Errore caricamento utenti");
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
    Promise.all([fetchUsers(), fetchProfiles(), isGlobalAdmin ? fetchCompanies() : Promise.resolve()]).finally(() => setLoading(false));
  }, [isGlobalAdmin]);

  const openEdit = (u: UserRow) => {
    setEditingUser(u);
    setEditProfileId(u.profileId);
    setEditCompanyId(u.companyId);
    setEditName(u.name || "");
  };

  const saveUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const payload: { name?: string | null; profileId?: number | null; companyId?: number | null } = {
        name: editName.trim() || null,
        profileId: editProfileId,
      };
      if (isGlobalAdmin) payload.companyId = editCompanyId;
      await axios.patch(`/api/users/${editingUser.id}`, payload);
      toast.success("Utente aggiornato");
      setEditingUser(null);
      fetchUsers();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Errore aggiornamento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-12 space-y-8 max-w-5xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Utenti</h1>
            <p className="text-sm text-slate-500">Elenco utenti e assegnazione profilo (permessi).</p>
          </div>
        </div>
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
                  <p className="font-black text-slate-900">{u.name || u.email}</p>
                  <p className="text-sm text-slate-500">{u.email}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Azienda: {u.companyName ?? "—"} · Profilo: {u.profileName ?? "—"}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(u)}
                  className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
                  title="Modifica profilo / nome"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900">Modifica utente</h2>
              <p className="text-sm text-slate-500 mt-1">{editingUser.email}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Nome (facoltativo)
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                  placeholder="Nome visualizzato"
                />
              </div>
              {isGlobalAdmin && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Azienda
                  </label>
                  <select
                    value={editCompanyId ?? ""}
                    onChange={(e) => setEditCompanyId(e.target.value ? Number(e.target.value) : null)}
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
                <p className="text-xs text-slate-400 mt-1">
                  I permessi dipendono dal profilo assegnato. Crea profili dalla pagina Profili.
                </p>
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
    </div>
  );
}
