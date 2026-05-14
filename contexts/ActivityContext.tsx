"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Download, X } from "lucide-react";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import { useCompanyContext } from "@/contexts/CompanyContext";

type AiBulkRow = {
  productId: number;
  sku: string;
  title: string;
  outcome: "ok" | "error";
  message: string;
};
type AiBulkJob = {
  id: number;
  running: boolean;
  paused: boolean;
  overwriteExisting: boolean;
  total: number;
  done: number;
  errors: number;
  currentProductId?: number;
  startedAt?: string;
  brand?: string;
  catalogue?: string;
};
type AiBulkReport = {
  at: string;
  overwriteExisting: boolean;
  total: number;
  done: number;
  errors: number;
  rows: AiBulkRow[];
};
type ActivityEntry = {
  id: string;
  type: string;
  status: string;
  at: string;
  description: string;
  brand?: string;
  catalogue?: string;
  companyId: number;
  total: number;
  done: number;
  errors: number;
};
export type OngoingBulkSeoJob = {
  id: number;
  type: "ai_bulk_seo";
  status: "running" | "paused";
  overwriteExisting: boolean;
  startedAt: string;
  total: number;
  done: number;
  errors: number;
  brand?: string;
  catalogue?: string;
  progressPct: number;
  currentProductId?: number;
};
export type ResumableStoppedBulkSeoJob = {
  id: number;
  status: "stopped";
  overwriteExisting: boolean;
  total: number;
  done: number;
  errors: number;
  brand?: string;
  catalogue?: string;
  startedAt: string;
  finishedAt: string | null;
};
type ActivityNotification = {
  id: string;
  at: string;
  title: string;
  message: string;
  read: boolean;
};
type StartAiBulkSeoInput = {
  products: any[];
  overwriteExisting: boolean;
  fastMode?: boolean;
  companyId: number;
  brand?: string;
  catalogue?: string;
  onCompleted?: () => void;
};
type ActivityContextValue = {
  aiBulkJob: AiBulkJob | null;
  aiBulkReport: AiBulkReport | null;
  showAiBulkReport: boolean;
  setShowAiBulkReport: (v: boolean) => void;
  activities: ActivityEntry[];
  ongoingBulkSeoJobs: OngoingBulkSeoJob[];
  resumableStoppedJobs: ResumableStoppedBulkSeoJob[];
  notifications: ActivityNotification[];
  unreadNotifications: number;
  startAiBulkSeoJob: (input: StartAiBulkSeoInput) => Promise<void>;
  toggleAiBulkPause: () => void;
  stopAiBulkJob: () => void;
  resumeStoppedJob: (jobId: number) => Promise<void>;
  markAllNotificationsRead: () => void;
  refreshActivities: () => Promise<void>;
};

const NOTIF_KEY = "contenthunter_notifications_v1";
const ActivityContext = createContext<ActivityContextValue | null>(null);

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const companyContext = useCompanyContext();

  /** Stesso criterio di ErpTable: JWT aziendale o azienda scelta dall’admin globale. */
  const effectiveCompanyId = useMemo(() => {
    const sid = (session?.user as { companyId?: number | null })?.companyId;
    if (typeof sid === "number" && Number.isFinite(sid)) return sid;
    return companyContext?.selectedCompanyId ?? null;
  }, [session?.user, companyContext?.selectedCompanyId]);

  const activityAxiosConfig = useMemo(
    () =>
      effectiveCompanyId != null
        ? { headers: { "x-company-id": String(effectiveCompanyId) } as Record<string, string> }
        : null,
    [effectiveCompanyId]
  );

  const [aiBulkJob, setAiBulkJob] = useState<AiBulkJob | null>(null);
  const [aiBulkReport, setAiBulkReport] = useState<AiBulkReport | null>(null);
  const [showAiBulkReport, setShowAiBulkReport] = useState(false);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [ongoingBulkSeoJobs, setOngoingBulkSeoJobs] = useState<OngoingBulkSeoJob[]>([]);
  const [resumableStoppedJobs, setResumableStoppedJobs] = useState<ResumableStoppedBulkSeoJob[]>([]);
  const [notifications, setNotifications] = useState<ActivityNotification[]>(() =>
    typeof window === "undefined" ? [] : readLocal<ActivityNotification[]>(NOTIF_KEY, [])
  );
  const prevJobStatusRef = useRef<string | null>(null);
  const onCompletedRef = useRef<(() => void) | undefined>(undefined);

  const persistNotifications = (next: ActivityNotification[]) => {
    setNotifications(next);
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const appendNotification = useCallback((title: string, message: string) => {
    const n: ActivityNotification = {
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      title,
      message,
      read: false,
    };
    setNotifications((prev) => {
      const next = [n, ...prev].slice(0, 200);
      try {
        localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    toast.success(`${title}: ${message}`);
  }, []);

  const refreshActivities = useCallback(async () => {
    if (!activityAxiosConfig) return;
    try {
      const { data } = await axios.get("/api/activities", activityAxiosConfig);
      setActivities(Array.isArray(data?.activities) ? data.activities : []);
      setOngoingBulkSeoJobs(Array.isArray(data?.ongoingBulkSeoJobs) ? data.ongoingBulkSeoJobs : []);
      setResumableStoppedJobs(Array.isArray(data?.resumableStoppedJobs) ? data.resumableStoppedJobs : []);
    } catch {
      /* ignore */
    }
  }, [activityAxiosConfig]);

  const refreshCurrentJob = useCallback(async () => {
    if (!activityAxiosConfig) return;
    try {
      const { data } = await axios.get("/api/activities/ai-bulk-seo-jobs", activityAxiosConfig);
      const job = data?.job ?? null;
      setAiBulkJob(job);
      const nowStatus = job ? (job.running ? "running" : job.paused ? "paused" : "done") : null;
      const prev = prevJobStatusRef.current;
      prevJobStatusRef.current = nowStatus;
      if (prev && prev === "running" && nowStatus === null) {
        await refreshActivities();
        appendNotification("Attività completata", "Generazione SEO AI massiva terminata.");
        onCompletedRef.current?.();
      }
    } catch {
      /* ignore */
    }
  }, [activityAxiosConfig, refreshActivities, appendNotification]);

  useEffect(() => {
    if (!activityAxiosConfig) return;
    void refreshActivities();
    void refreshCurrentJob();
    // Con job SEO in esecuzione/pausa: poll rapido. Senza job: ogni 30s (meno pressione su DB/proxy in produzione).
    const intervalMs =
      aiBulkJob?.running || aiBulkJob?.paused ? 8000 : 30000;
    const poll = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refreshCurrentJob();
    };
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [
    activityAxiosConfig,
    refreshActivities,
    refreshCurrentJob,
    aiBulkJob?.running,
    aiBulkJob?.paused,
  ]);

  const startAiBulkSeoJob = async (input: StartAiBulkSeoInput) => {
    if (aiBulkJob?.running || aiBulkJob?.paused) {
      toast.info("C'è già un job AI in esecuzione.");
      return;
    }
    const ids = (input.products || [])
      .map((p: any) => Number(p?.id))
      .filter((n: number) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return;
    onCompletedRef.current = input.onCompleted;
    setAiBulkReport(null);
    const { data } = await axios.post(
      "/api/activities/ai-bulk-seo-jobs",
      {
        productIds: ids,
        overwriteExisting: input.overwriteExisting,
        fastMode: !!input.fastMode,
        brand: input.brand,
        catalogue: input.catalogue,
      },
      { headers: { "x-company-id": String(input.companyId) } }
    );
    setAiBulkJob({
      id: data.jobId,
      running: true,
      paused: false,
      overwriteExisting: input.overwriteExisting,
      total: data.total || ids.length,
      done: 0,
      errors: 0,
      brand: input.brand,
      catalogue: input.catalogue,
    });
  };

  const toggleAiBulkPause = async () => {
    if (!aiBulkJob?.id || !activityAxiosConfig) return;
    await axios.patch(
      `/api/activities/ai-bulk-seo-jobs/${aiBulkJob.id}`,
      { action: aiBulkJob.paused ? "resume" : "pause" },
      activityAxiosConfig
    );
    await refreshCurrentJob();
  };

  const stopAiBulkJob = async () => {
    if (!aiBulkJob?.id || !activityAxiosConfig) return;
    await axios.patch(`/api/activities/ai-bulk-seo-jobs/${aiBulkJob.id}`, { action: "stop" }, activityAxiosConfig);
    await refreshCurrentJob();
    await refreshActivities();
    appendNotification("Attività interrotta", "Generazione SEO AI massiva fermata.");
  };

  const resumeStoppedJob = async (jobId: number) => {
    if (!activityAxiosConfig) return;
    await axios.patch(`/api/activities/ai-bulk-seo-jobs/${jobId}`, { action: "resume" }, activityAxiosConfig);
    await refreshCurrentJob();
    await refreshActivities();
    appendNotification("Attività ripresa", `Job #${jobId} ripreso dal punto di interruzione.`);
  };

  const markAllNotificationsRead = () => {
    const next = notifications.map((n) => ({ ...n, read: true }));
    persistNotifications(next);
  };

  const unreadNotifications = notifications.filter((n) => !n.read).length;

  const loadReport = useCallback(async () => {
    if (!aiBulkJob?.id || !activityAxiosConfig) return;
    const { data } = await axios.get(`/api/activities/ai-bulk-seo-jobs/${aiBulkJob.id}/report`, activityAxiosConfig);
    setAiBulkReport(data);
  }, [aiBulkJob?.id, activityAxiosConfig]);

  useEffect(() => {
    if (showAiBulkReport && !aiBulkReport) {
      void loadReport();
    }
  }, [showAiBulkReport, aiBulkReport, loadReport]);

  const value = useMemo<ActivityContextValue>(
    () => ({
      aiBulkJob,
      aiBulkReport,
      showAiBulkReport,
      setShowAiBulkReport,
      activities,
      ongoingBulkSeoJobs,
      resumableStoppedJobs,
      notifications,
      unreadNotifications,
      startAiBulkSeoJob,
      toggleAiBulkPause,
      stopAiBulkJob,
      resumeStoppedJob,
      markAllNotificationsRead,
      refreshActivities,
    }),
    [
      aiBulkJob,
      aiBulkReport,
      showAiBulkReport,
      activities,
      ongoingBulkSeoJobs,
      resumableStoppedJobs,
      notifications,
      unreadNotifications,
      refreshActivities,
    ]
  );

  const downloadReportCsv = () => {
    if (!aiBulkReport) return;
    const header = ["product_id", "sku", "title", "outcome", "message"];
    const lines = aiBulkReport.rows.map((r) =>
      [r.productId, r.sku, r.title, r.outcome, r.message]
        .map((v) => {
          const s = String(v ?? "");
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai_bulk_report_${new Date(aiBulkReport.at).toISOString().slice(0, 19).replace(/[:.]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ActivityContext.Provider value={value}>
      {children}
      {aiBulkJob && (
        <div className="fixed bottom-4 right-4 z-[200] bg-white border border-slate-200 shadow-xl rounded-2xl p-4 w-[320px]">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">AI massiva in background</p>
            <p className="text-sm font-black text-slate-900 mt-1">
              {aiBulkJob.done}/{aiBulkJob.total}
              {aiBulkJob.errors ? <span className="text-amber-700"> ({aiBulkJob.errors} errori)</span> : null}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {aiBulkJob.currentProductId ? `In corso su ID: ${aiBulkJob.currentProductId}` : "In esecuzione sul server"}
            </p>
            <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-indigo-600"
                style={{ width: aiBulkJob.total > 0 ? `${Math.round((aiBulkJob.done / aiBulkJob.total) * 100)}%` : "0%" }}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={toggleAiBulkPause}
              disabled={!aiBulkJob.running && !aiBulkJob.paused}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-40"
            >
              {aiBulkJob.paused ? "Riprendi" : "Pausa"}
            </button>
            <button
              type="button"
              onClick={stopAiBulkJob}
              disabled={!aiBulkJob.running && !aiBulkJob.paused}
              className="flex-1 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-widest hover:bg-red-100 disabled:opacity-40"
            >
              Stop
            </button>
          </div>
          {!aiBulkJob.running && !aiBulkJob.paused && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowAiBulkReport(true)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
              >
                Visualizza report
              </button>
              <button
                type="button"
                onClick={downloadReportCsv}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black"
              >
                <Download className="w-3.5 h-3.5 inline mr-1" />
                CSV
              </button>
            </div>
          )}
        </div>
      )}
      {showAiBulkReport && aiBulkReport && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAiBulkReport(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 max-w-4xl w-full border border-gray-100 max-h-[90vh] overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">Report generazione AI massiva</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {new Date(aiBulkReport.at).toLocaleString("it-IT")} · Totale {aiBulkReport.total} · Errori {aiBulkReport.errors}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAiBulkReport(false)}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
                title="Chiudi"
              >
                <X className="w-4 h-4 text-slate-700" />
              </button>
            </div>
            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden max-h-[70vh] overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">ID</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">SKU</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Titolo</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Esito</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Messaggio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aiBulkReport.rows.map((r) => (
                    <tr key={`ai-rep-${r.productId}-${r.outcome}`}>
                      <td className="px-3 py-2 text-[11px] font-mono text-slate-700">{r.productId}</td>
                      <td className="px-3 py-2 text-[11px] font-mono text-slate-900">{r.sku}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-700 max-w-[360px] truncate">{r.title}</td>
                      <td className="px-3 py-2 text-[11px] font-black">
                        {r.outcome === "ok" ? <span className="text-emerald-700">OK</span> : <span className="text-amber-800">ERRORE</span>}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-600 max-w-[520px] truncate">{r.message || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ActivityContext.Provider>
  );
}

export function useActivityContext() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivityContext must be used within ActivityProvider");
  return ctx;
}

