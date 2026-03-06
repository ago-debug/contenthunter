"use client";

import { useState, useEffect } from "react";
import { FileDown, List, Database, Search, Filter, CheckSquare, Square, Package, CheckCircle2 } from "lucide-react";
import axios from "axios";
import { SearchableSelect } from "@/components/SearchableSelect";

const EXPORT_FIELD_OPTIONS: { key: string; label: string }[] = [
    { key: "sku", label: "SKU" },
    { key: "ean", label: "EAN" },
    { key: "parentSku", label: "Parent SKU" },
    { key: "title", label: "Titolo" },
    { key: "docDescription", label: "Descrizione documento" },
    { key: "category", label: "Categoria" },
    { key: "price", label: "Prezzo" },
    { key: "brand", label: "Brand" },
    { key: "dimensions", label: "Dimensioni" },
    { key: "weight", label: "Peso" },
    { key: "material", label: "Materiale" },
    { key: "bulletPoints", label: "Punti elenco" },
    { key: "description", label: "Descrizione" },
    { key: "images", label: "Immagini (link)" },
];

export default function ExportPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [allBrands, setAllBrands] = useState<any[]>([]);
    const [allCategories, setAllCategories] = useState<any[]>([]);
    const [selectedFields, setSelectedFields] = useState<string[]>([
        "sku", "title", "price", "brand", "category", "images"
    ]);
    const [filterSearch, setFilterSearch] = useState("");
    const [filterBrandId, setFilterBrandId] = useState<string | number>("all");
    const [filterCategoryId, setFilterCategoryId] = useState<string | number>("all");
    const [filterSubCategoryId, setFilterSubCategoryId] = useState<string | number>("all");
    const [filterSubSubCategoryId, setFilterSubSubCategoryId] = useState<string | number>("all");
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [productsRes, brandsRes, categoriesRes] = await Promise.all([
                    axios.get("/api/products"),
                    axios.get("/api/brands"),
                    axios.get("/api/categories?all=true"),
                ]);
                setProducts(productsRes.data);
                setAllBrands(brandsRes.data || []);
                setAllCategories(categoriesRes.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const toggleField = (key: string) => {
        setSelectedFields((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const selectAllFields = () => setSelectedFields(EXPORT_FIELD_OPTIONS.map((f) => f.key));
    const deselectAllFields = () => setSelectedFields([]);

    const handleExportExcel = async () => {
        if (selectedFields.length === 0) return;
        setExporting(true);
        try {
            const filters: Record<string, any> = {};
            if (filterSearch.trim()) filters.search = filterSearch.trim();
            if (filterBrandId !== "all") filters.brandId = Number(filterBrandId);
            if (filterCategoryId !== "all") filters.categoryId = Number(filterCategoryId);
            if (filterSubCategoryId !== "all") filters.subCategoryId = Number(filterSubCategoryId);
            if (filterSubSubCategoryId !== "all") filters.subSubCategoryId = Number(filterSubSubCategoryId);

            const res = await fetch("/api/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fields: selectedFields, filters }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Export fallito");
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `export-${Date.now()}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            console.error(err);
            alert(err.message || "Errore durante l'export");
        } finally {
            setExporting(false);
        }
    };

    const filteredProducts = products.filter(
        (p) =>
            p.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.title && p.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const rootCategories = allCategories.filter((c: any) => !c.parentId);
    const subCategories = allCategories.filter(
        (c: any) => c.parentId === Number(filterCategoryId)
    );
    const subSubCategories = allCategories.filter(
        (c: any) => c.parentId === Number(filterSubCategoryId)
    );

    return (
        <div className="p-8 md:p-12 space-y-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-10">
                <div className="space-y-4 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-4">
                        <div className="p-3 bg-[#E6D3C1]/20 rounded-xl border border-[#E6D3C1]/30">
                            <FileDown className="w-8 h-8 text-[#8B735B]" />
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-[#111827]">
                            Export <span className="text-gray-300">/</span> Console
                        </h1>
                    </div>
                    <p className="text-gray-500 font-medium tracking-tight">
                        Esporta in Excel con campi selezionabili e filtri intelligenti. Le immagini vengono esportate come link nella colonna Immagini.
                    </p>
                </div>
            </div>

            {/* Filtri intelligenti */}
            <div className="main-card p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                        <Filter className="w-5 h-5 text-gray-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-[#111827]">Filtri intelligenti</h3>
                        <p className="text-xs text-gray-400">Applica filtri per esportare solo i prodotti che ti interessano</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cerca SKU, titolo, brand..."
                            className="w-full h-11 pl-9 pr-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E6D3C1]/30 focus:border-[#E6D3C1]"
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                        />
                    </div>
                    <SearchableSelect
                        options={[
                            { value: "all", label: "Tutti i Brand" },
                            ...allBrands.map((b: any) => ({ value: b.id, label: b.name || b.id })),
                        ]}
                        value={filterBrandId === "all" ? "all" : Number(filterBrandId)}
                        onChange={(val) => setFilterBrandId(val ?? "all")}
                        placeholder="Brand"
                        showSearch={true}
                    />
                    <SearchableSelect
                        options={[
                            { value: "all", label: "Categoria" },
                            ...rootCategories.map((c: any) => ({ value: c.id, label: c.name })),
                        ]}
                        value={filterCategoryId === "all" ? "all" : Number(filterCategoryId)}
                        onChange={(val) => {
                            setFilterCategoryId(val ?? "all");
                            setFilterSubCategoryId("all");
                            setFilterSubSubCategoryId("all");
                        }}
                        placeholder="Categoria"
                        showSearch={true}
                    />
                    <SearchableSelect
                        options={[
                            { value: "all", label: "Sub-Categoria" },
                            ...subCategories.map((c: any) => ({ value: c.id, label: c.name })),
                        ]}
                        value={filterSubCategoryId === "all" ? "all" : Number(filterSubCategoryId)}
                        onChange={(val) => {
                            setFilterSubCategoryId(val ?? "all");
                            setFilterSubSubCategoryId("all");
                        }}
                        placeholder="Sub-Categoria"
                        showSearch={true}
                        disabled={filterCategoryId === "all"}
                    />
                    <SearchableSelect
                        options={[
                            { value: "all", label: "Livello 3" },
                            ...subSubCategories.map((c: any) => ({ value: c.id, label: c.name })),
                        ]}
                        value={filterSubSubCategoryId === "all" ? "all" : Number(filterSubSubCategoryId)}
                        onChange={(val) => setFilterSubSubCategoryId(val ?? "all")}
                        placeholder="Livello 3"
                        showSearch={true}
                        disabled={filterSubCategoryId === "all"}
                    />
                </div>
            </div>

            {/* Campi da esportare */}
            <div className="main-card p-8">
                <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <CheckSquare className="w-5 h-5 text-gray-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-[#111827]">Campi da esportare</h3>
                            <p className="text-xs text-gray-400">Seleziona le colonne da includere nel file Excel</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={selectAllFields}
                            className="text-xs font-semibold text-gray-500 hover:text-[#8B735B] px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#E6D3C1]"
                        >
                            Tutti
                        </button>
                        <button
                            type="button"
                            onClick={deselectAllFields}
                            className="text-xs font-semibold text-gray-500 hover:text-[#8B735B] px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#E6D3C1]"
                        >
                            Nessuno
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {EXPORT_FIELD_OPTIONS.map(({ key, label }) => (
                        <label
                            key={key}
                            className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                checked={selectedFields.includes(key)}
                                onChange={() => toggleField(key)}
                                className="rounded border-gray-300 text-[#8B735B] focus:ring-[#E6D3C1] w-4 h-4"
                            />
                            <span className="text-sm font-medium text-gray-800">{label}</span>
                        </label>
                    ))}
                </div>
                <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
                    <span className="text-xs text-gray-400">
                        {selectedFields.length} campi selezionati
                    </span>
                    <button
                        onClick={handleExportExcel}
                        disabled={selectedFields.length === 0 || exporting}
                        className="btn-primary py-3 px-8 flex items-center gap-2 disabled:opacity-50 shadow-lg active:scale-95"
                    >
                        <FileDown className="w-4 h-4" />
                        {exporting ? "Export in corso..." : "Esporta Excel"}
                    </button>
                </div>
            </div>

            {/* Anteprima coda (solo ricerca locale per lista) */}
            <div className="main-card overflow-hidden">
                <div className="p-8 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6 bg-gray-50/30">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                            <List className="w-6 h-6 text-gray-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-[#111827]">Anteprima prodotti</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                L’export usa i filtri sopra; qui vedi solo un’anteprima filtrata per ricerca
                            </p>
                        </div>
                    </div>
                    <div className="w-full md:w-80 relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Filtra anteprima..."
                            className="w-full h-12 bg-white border border-gray-100 rounded-xl pl-12 pr-6 text-sm focus:outline-none focus:ring-4 focus:ring-[#E6D3C1]/20 focus:border-[#E6D3C1]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <th className="px-8 py-4">SKU</th>
                                <th className="px-8 py-4">Titolo / Brand</th>
                                <th className="px-8 py-4">Prezzo</th>
                                <th className="px-8 py-4">Immagini</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredProducts.slice(0, 50).map((p, idx) => (
                                <tr key={p.id || idx} className="hover:bg-gray-50/50">
                                    <td className="px-8 py-6">
                                        <span className="font-mono font-bold text-[#E6D3C1] bg-black px-3 py-1.5 rounded-lg text-sm">
                                            {p.sku}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-900">{p.title || p.name || "N/A"}</span>
                                            <span className="text-[10px] text-gray-400 uppercase font-bold">{p.brand || "—"}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 font-bold text-gray-900">{p.price ?? "—"}</td>
                                    <td className="px-8 py-6 text-[10px] text-gray-500">
                                        {p.images?.length
                                            ? `${p.images.length} link`
                                            : "—"}
                                    </td>
                                </tr>
                            ))}
                            {filteredProducts.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="px-8 py-20 text-center opacity-20">
                                        <Package className="w-20 h-20 mx-auto mb-4" />
                                        <p className="text-sm font-bold uppercase tracking-widest">Nessun record</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex justify-between items-center px-10 text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                <div className="flex items-center gap-6">
                    <Database className="w-4 h-4" />
                    Protocollo: XLSX / Campi selezionabili · Colonna Immagini = link
                </div>
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500/50" />
                    Filtri applicati lato server
                </div>
            </div>
        </div>
    );
}
