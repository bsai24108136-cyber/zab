"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { apiFetch, API_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { toastError, toastSuccess } from "@/lib/alerts";
import { Brain, RefreshCw, FileText, FileType2 } from "lucide-react";

interface SummarySections {
  primary_conditions: string;
  current_medications: string;
  recent_trends: string;
  medication_adherence: string;
  risk_flags: string;
  overall_status: string;
}
interface SummaryData {
  summary: SummarySections;
  model: string;
  generated_at: string;
  ok: boolean;
}

type SectionTone = "cyan" | "mint" | "amber" | "violet" | "rose" | "slate";

const SECTIONS: { key: keyof SummarySections; label: string; tone: SectionTone }[] = [
  { key: "primary_conditions",  label: "Primary Conditions",   tone: "cyan"   },
  { key: "current_medications", label: "Current Medications",  tone: "mint"   },
  { key: "recent_trends",       label: "Recent Trends",        tone: "amber"  },
  { key: "medication_adherence",label: "Medication Adherence", tone: "violet" },
  { key: "risk_flags",          label: "Risk Flags",           tone: "rose"   },
  { key: "overall_status",      label: "Overall Status",       tone: "slate"  },
];

const TONE: Record<SectionTone, { bar: string; label: string; chipBg: string }> = {
  cyan:   { bar: "from-cyan-400 to-cyan-500",       label: "text-cyan-300",    chipBg: "bg-cyan-500/10"    },
  mint:   { bar: "from-emerald-400 to-emerald-500", label: "text-emerald-300", chipBg: "bg-emerald-500/10" },
  amber:  { bar: "from-amber-400 to-orange-500",    label: "text-amber-300",   chipBg: "bg-amber-500/10"   },
  violet: { bar: "from-violet-400 to-fuchsia-500",  label: "text-violet-300",  chipBg: "bg-violet-500/10"  },
  rose:   { bar: "from-rose-400 to-pink-500",       label: "text-rose-300",    chipBg: "bg-rose-500/10"    },
  slate:  { bar: "from-slate-400 to-slate-500",     label: "text-ink-200",     chipBg: "bg-white/5"        },
};

export default function AISummaryCard({ patientId }: { patientId: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const auth = getAuth();

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const url = `/ai/summary/${patientId}${refresh ? "?refresh=true" : ""}`;
      const res = await apiFetch<SummaryData>(url);
      setData(res);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const download = async (format: "pdf" | "txt") => {
    setDownloading(format);
    try {
      const token = auth?.access_token ?? "";
      const res = await fetch(
        `${API_URL}/ai/summary/${patientId}/download?format=${format}&audience=doctor`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MediTrace_${patientId.slice(0, 8).toUpperCase()}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toastSuccess(`${format.toUpperCase()} downloaded`);
    } catch {
      toastError("Download failed", "Please try again in a moment.");
    } finally {
      setDownloading(null);
    }
  };

  const genTime = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="glass relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl" />

      {/* Header */}
      <div className="relative mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-glow-violet">
            <Brain className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-50">AI Clinical Summary</p>
            <p className="text-[11px] text-ink-300">
              {genTime && `Generated ${genTime} · `}
              {data?.model && <span className="text-violet-300">{data.model}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          title="Refresh summary"
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-200 transition-colors hover:bg-white/5 hover:text-ink-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="rounded-xl bg-white/5 p-3">
              <div className="skeleton mb-2 h-2.5 w-1/3" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton mt-1 h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : !data ? (
        <p className="text-sm text-ink-300">Could not load AI summary. Try refreshing.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SECTIONS.map(({ key, label, tone }, i) => {
              const val = data.summary?.[key] ?? "";
              if (key === "risk_flags" && (!val || val.toUpperCase() === "NONE")) return null;
              const t = TONE[tone];
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`relative overflow-hidden rounded-xl border border-white/5 p-3 ${t.chipBg}`}
                >
                  <div className={`absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b ${t.bar}`} />
                  <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${t.label}`}>
                    {label}
                  </p>
                  <p className="text-[13px] leading-relaxed text-ink-100">{val || "—"}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Download buttons */}
          <div className="mt-4 flex gap-2">
            {([
              { fmt: "pdf" as const, Icon: FileText },
              { fmt: "txt" as const, Icon: FileType2 },
            ]).map(({ fmt, Icon }) => (
              <button
                key={fmt}
                onClick={() => download(fmt)}
                disabled={!!downloading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-100 transition-all hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
              >
                {downloading === fmt
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <Icon className="h-3 w-3" />}
                Download {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
