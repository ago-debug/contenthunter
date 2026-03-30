"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions";

type ProfileRow = {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  usersCount: number;
  createdAt: string;
  updatedAt: string;
};

export default function AdminProfilesPage() {
  const [list, setList] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchProfiles = async () => {
    try {
      const { data } = await axios.get<ProfileRow[]>("/api/profiles");
      setList(data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Errore caricamento profili");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPermissions([]);
    setModalOpen(true);
  };

  const openEdit = (p: ProfileRow) => {
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description || "");
    setPermissions(p.permissions ?? []);
    setModalOpen(true);
  };

  const togglePermission = (key: PermissionKey) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Inserisci il nome del profilo");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await axios.put(`/api/profiles/${editingId}`, {
          name: name.trim(),
          description: description.trim() || null,
          permissions,
        });
        toast.success("Profilo aggiornato");
      } else {
        await axios.post("/api/profiles", {
          name: name.trim(),
          description: description.trim() || null,
          permissions,
        });
        toast.success("Profilo creato");
      }
      setModalOpen(false);
      fetchProfiles();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async (id: number) => {
    if (!confirm("Eliminare questo profilo? Gli utenti associati non avranno più un profilo.")) return;
    setDeletingId(id);
    try {
      await axios.delete(`/api/profiles/${id}`);
      toast.success("Profilo eliminato");
      fetchProfiles();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Errore eliminazione");
    } finally {
      setDeletingId(null);
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
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Profili</h1>
            <p className="text-sm text-slate-500">Crea e modifica profili con permessi da associare agli utenti.</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuovo profilo
        </button>
      </header>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Caricamento...</div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Nessun profilo. Crea il primo (es. Admin) e assegnalo agli utenti dalla pagina Utenti.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-4 p-6 hover:bg-slate-50/50"
              >
                <div>
                  <p className="font-black text-slate-900">{p.name}</p>
                  {p.description && (
                    <p className="text-sm text-slate-500 mt-0.5">{p.description}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    {p.permissions?.length ?? 0} permessi · {p.usersCount} utenti
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(p)}
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
                    title="Modifica"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteProfile(p.id)}
                    disabled={p.usersCount > 0 || deletingId === p.id}
                    className="p-2.5 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={p.usersCount > 0 ? "Rimuovi gli utenti dal profilo prima di eliminare" : "Elimina"}
                  >
                    {deletingId === p.id ? (
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
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900">
                {editingId ? "Modifica profilo" : "Nuovo profilo"}
              </h2>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                  placeholder="es. Admin, Operatore"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Descrizione (facoltativa)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200 focus:border-slate-400"
                  placeholder="Breve descrizione del profilo"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Permessi
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto rounded-xl border border-slate-100 p-3">
                  {PERMISSION_KEYS.map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={permissions.includes(key)}
                        onChange={() => togglePermission(key)}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm text-slate-700">{PERMISSION_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : editingId ? "Salva" : "Crea"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
