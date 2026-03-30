"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Building2, Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";

type CompanyRow = {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  usersCount: number;
  productsCount: number;
  catalogsCount: number;
};

export default function AdminCompaniesPage() {
  const [list, setList] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setSlug("");
    setModalOpen(true);
  };

  const openEdit = (c: CompanyRow) => {
    setEditingId(c.id);
    setName(c.name);
    setSlug(c.slug);
    setModalOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Inserisci il nome dell'azienda");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await axios.put(`/api/companies/${editingId}`, { name: name.trim(), slug: slug.trim() || undefined });
        toast.success("Azienda aggiornata");
      } else {
        await axios.post("/api/companies", { name: name.trim(), slug: slug.trim() || undefined });
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
    if (!confirm("Eliminare questa azienda? Verranno eliminati anche tutti i dati associati (cataloghi, prodotti, utenti dell'azienda).")) return;
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
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Aziende</h1>
            <p className="text-sm text-slate-500">Gestione multi-azienda. Solo l’admin globale può creare e modificare le aziende.</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuova azienda
        </button>
      </header>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Caricamento...</div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Nessuna azienda. Crea la prima azienda e assegna gli utenti dalla pagina Utenti.
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
                    title="Modifica"
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
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900">
                {editingId ? "Modifica azienda" : "Nuova azienda"}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                  placeholder="Ragione sociale"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Slug (opzionale)</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-200"
                  placeholder="identificativo-url"
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)} className="px-5 py-2.5 rounded-xl border border-slate-200 font-bold hover:bg-slate-50">
                Annulla
              </button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black disabled:opacity-50">
                {saving ? "Salvataggio..." : editingId ? "Salva" : "Crea"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
