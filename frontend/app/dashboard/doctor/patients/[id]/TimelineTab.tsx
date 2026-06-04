"use client";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Activity,
  X, ChevronDown,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Reading { date: string; value: number; }
interface Trend {
  direction: "increasing" | "decreasing" | "stable";
  change_pct: number;
  readings: Reading[];
}
interface TimelineData {
  timeline: any[];
  trends: Record<string, Trend>;
  ai_analysis: string;
  model: string;
  risk_level: "stable" | "worsening" | "critical";
  metric_count: number;
}

const LINE_COLORS = [
  "#22D3EE", "#34D399", "#FBBF24", "#A855F7", "#FB7185",
  "#38BDF8", "#F472B6", "#818CF8", "#4ADE80", "#F87171",
];

const RISK: Record<string, { chip: string; label: string; pulse: boolean }> = {
  stable:    { chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300", label: "Stable",    pulse: false },
  worsening: { chip: "border-amber-500/40 bg-amber-500/15 text-amber-300",       label: "Worsening", pulse: false },
  critical:  { chip: "border-rose-500/50 bg-rose-500/15 text-rose-300",          label: "Critical",  pulse: true  },
};

const tooltipStyle = {
  background: "rgba(17,16,42,0.96)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  fontSize: 12,
  color: "#E6E6F0",
  backdropFilter: "blur(8px)",
};

export default function TimelineTab({ patientId }: { patientId: string }) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiFetch<TimelineData>(`/ai/temporal/${patientId}`);
      setData(res);
    } catch (e: any) {
      setError(e.message ?? "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const metrics = data ? Object.keys(data.trends) : [];
  const dateMap: Record<string, Record<string, number>> = {};
  if (data) {
    metrics.forEach(m => {
      data.trends[m].readings.forEach(r => {
        if (!dateMap[r.date]) dateMap[r.date] = {};
        dateMap[r.date][m] = r.value;
      });
    });
  }
  const chartData = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));

  if (loading) return (
    <div className="space-y-3">
      <div className="skeleton h-64" />
      <div className="skeleton h-40" />
    </div>
  );

  if (error) return (
    <div className="glass p-8 text-center">
      <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-amber-300" />
      <p className="text-sm text-amber-200">{error}</p>
      <button onClick={load} className="btn-ghost mx-auto mt-3 text-xs text-cyan-300">
        Try again
      </button>
    </div>
  );

  if (!data || metrics.length === 0) return (
    <div className="glass p-10 text-center">
      <Activity className="mx-auto mb-2 h-7 w-7 text-ink-300" />
      <p className="text-sm text-ink-100">No numeric health values found in records yet.</p>
      <p className="mt-1 text-xs text-ink-300">Add visit notes with values like "Blood Sugar 140 mg/dL".</p>
    </div>
  );

  const risk = RISK[data.risk_level] ?? RISK.stable;

  return (
    <div className="space-y-4">
      {/* Chart card */}
      <div className="glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-50">
            Health Metrics Over Time
            <span className="ml-2 text-xs text-ink-300">({data.metric_count} metrics)</span>
          </p>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA0B5" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9CA0B5" }} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#9CA0B5" }} />
            {metrics.map((metric, i) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4, cursor: "pointer", strokeWidth: 0, fill: LINE_COLORS[i % LINE_COLORS.length] }}
                activeDot={{
                  r: 6,
                  onClick: (_: any, payload: any) => {
                    const entry = data.timeline.find(t => t.date === payload?.payload?.date);
                    if (entry) setModal(entry);
                  },
                }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[11px] text-ink-300">Click any data point to see the original record.</p>
      </div>

      {/* AI trend analysis */}
      <div className="glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-50">AI Trend Analysis</p>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${risk.chip} ${risk.pulse ? "animate-pulse" : ""}`}>
            {risk.label}
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {metrics.map(m => {
            const t = data.trends[m];
            const Icon = t.direction === "increasing" ? TrendingUp
              : t.direction === "decreasing" ? TrendingDown : Minus;
            const c = t.direction === "increasing" ? "text-rose-300 border-rose-500/30 bg-rose-500/10"
              : t.direction === "decreasing" ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
              : "text-ink-200 border-white/10 bg-white/5";
            return (
              <span key={m} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${c}`}>
                <Icon className="h-3 w-3" />
                {m} ({t.change_pct > 0 ? "+" : ""}{t.change_pct}%)
              </span>
            );
          })}
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-100">{data.ai_analysis}</p>
        <p className="mt-3 text-[11px] text-ink-300">Powered by {data.model}</p>
      </div>

      {/* Modal — original record */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="glass-hi w-full max-w-md p-5"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-50">Record — {modal.date}</p>
                <button onClick={() => setModal(null)} className="text-ink-200 hover:text-ink-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1 text-sm text-ink-100">
                {modal.values?.map((v: any, i: number) => (
                  <p key={i} className="flex items-baseline justify-between gap-3 rounded-lg bg-white/5 px-3 py-1.5">
                    <span className="text-ink-200">{v.metric}</span>
                    <span className="font-semibold">{v.value} <span className="text-xs font-normal text-ink-300">{v.unit}</span></span>
                  </p>
                ))}
              </div>
              <button onClick={() => setModal(null)} className="btn-secondary mt-4 w-full">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TimelineGuide />
    </div>
  );
}

function TimelineGuide() {
  const [open, setOpen] = useState(false);
  const examples = [
    { label: "Blood Sugar",    note: '"Blood Sugar 140 mg/dL"' },
    { label: "Blood Pressure", note: '"BP 130/85 mmHg"'        },
    { label: "HbA1c",          note: '"HbA1c 7.2%"'            },
    { label: "Weight",         note: '"Weight 72 kg"'          },
    { label: "Creatinine",     note: '"Creatinine 1.1 mg/dL"'  },
  ];

  return (
    <div className="glass overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.04]"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-100">
          <Activity className="h-3.5 w-3.5 text-cyan-300" />
          How to populate this timeline
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-ink-300 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4">
              <p className="mb-3 text-xs leading-relaxed text-ink-100">
                The timeline automatically extracts <span className="font-semibold text-cyan-300">numeric health values</span> from visit notes and lab reports. Write values in any of these formats and the AI will plot them over time:
              </p>
              <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {examples.map(ex => (
                  <div key={ex.label} className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">{ex.label}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-200">{ex.note}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <p className="mb-1 text-[11px] font-semibold text-emerald-300">Tips</p>
                <ul className="space-y-0.5 pl-4 text-[11px] leading-relaxed text-emerald-200/90 list-disc">
                  <li>Add values in <strong>visit notes</strong> or <strong>lab report notes</strong></li>
                  <li>Use consistent metric names (e.g. always "Blood Sugar", not sometimes "Glucose")</li>
                  <li>At least <strong>2 data points</strong> are needed before a trend line appears</li>
                  <li>Click any dot on the chart to see the original visit record</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
