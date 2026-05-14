import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import changelog from "@/data/changelog.json";

type Entry = { hash: string; at: string; description: string };

function formatDateTime(iso: string): { date: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return { date, time };
}

export default function ChangelogPage() {
  const entries = (changelog as { entries: Entry[] }).entries ?? [];

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Torna a Iris
      </Link>

      <div className="flex items-start gap-4 mb-8">
        <div className="p-3 rounded-2xl bg-slate-900 text-white shadow-lg">
          <History className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Storico modifiche</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Data, ora e messaggio di ogni commit (ultimi {entries.length} aggiornamenti in repository).
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {entries.length === 0 ? (
            <p className="p-8 text-sm font-medium text-slate-500">Nessuna voce nello storico.</p>
          ) : (
            entries.map((e) => {
              const dt = formatDateTime(e.at);
              const date = dt?.date ?? e.at;
              const time = dt?.time ?? "—";
              const short = e.hash.slice(0, 7);
              return (
                <div
                  key={e.hash}
                  className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6"
                >
                  <div className="shrink-0 sm:w-52">
                    <p className="text-xs font-black text-slate-900">{date}</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5 tabular-nums">{time}</p>
                    <p className="text-[10px] font-mono font-bold text-slate-300 mt-2">{short}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 leading-relaxed flex-1 min-w-0 break-words">
                    {e.description}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
