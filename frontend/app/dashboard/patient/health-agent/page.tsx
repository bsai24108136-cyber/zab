"use client";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { apiFetch, API_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { toastSuccess, toastError } from "@/lib/alerts";
import { fadeUp, stagger } from "@/lib/motion";
import Reveal from "@/components/ui/Reveal";
import {
  Leaf, RefreshCw, Download, Utensils, Dumbbell,
  Moon, Star, AlertTriangle, Stethoscope, CheckCircle,
  X, ChevronRight, Clock, Droplets, Heart, Sparkles,
} from "lucide-react";

// ── types ────────────────────────────────────────────────────────────────
interface Meal       { time: string; foods: string[]; avoid: string[] }
interface DayPlan    { day: string; activity: string; intensity: "none" | "low" | "medium" | "high" }
interface SleepSched { bedtime: string; wake_time: string; duration_hours: number; nap?: string }
interface Recommendation { category: string; advice: string }

interface DietPlan      { title: string; condition_note: string; meals: Meal[]; tips: string[]; }
interface ExercisePlan  { title: string; condition_note: string; weekly_plan: DayPlan[]; avoid: string[]; tips: string[]; }
interface SleepPlan     { title: string; condition_note: string; schedule: SleepSched; habits: string[]; avoid: string[]; }
interface LifestylePlan { title: string; condition_note: string; recommendations: Recommendation[]; warning: string; }
interface Plans         { diet: DietPlan; exercise: ExercisePlan; sleep: SleepPlan; lifestyle: LifestylePlan; error?: string; }
interface HealthData    { plans: Plans; model: string; patient_name: string; based_on: string; }

const INTENSITY_DOT: Record<string, string> = {
  none:   "bg-ink-300",
  low:    "bg-emerald-400",
  medium: "bg-amber-400",
  high:   "bg-rose-400",
};

// ── small UI atoms ───────────────────────────────────────────────────────
function ModelBadge({ model }: { model: string }) {
  const isGemini = model.toLowerCase().includes("gemini");
  return (
    <span className={`badge-${isGemini ? "cyan" : "violet"}`}>
      {isGemini ? <Sparkles className="h-3 w-3" /> : "⚡"} {model}
    </span>
  );
}

function ConditionBadge({ note }: { note: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
      {note}
    </span>
  );
}

function FoodChip({ label, type }: { label: string; type: "eat" | "avoid" }) {
  const cls = type === "eat"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {type === "eat" ? "✓" : "✗"} {label}
    </span>
  );
}

// ── skeleton ─────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-24" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-64" />)}
      </div>
      <div className="text-center py-2">
        <div className="inline-flex items-center gap-2 text-sm text-emerald-300">
          <span className="animate-bounce">●</span>
          <span className="animate-bounce" style={{ animationDelay: "0.15s" }}>●</span>
          <span className="animate-bounce" style={{ animationDelay: "0.30s" }}>●</span>
          <span className="ml-2">Your AI health coach is reviewing your records…</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/5">
        <Stethoscope className="h-10 w-10 text-ink-200" />
      </div>
      <h2 className="text-lg font-semibold text-ink-50">No medical records yet</h2>
      <p className="mt-2 max-w-xs text-sm text-ink-300">
        Your health plan will be generated once your doctor adds your first medical record.
      </p>
      <a href="/dashboard/patient" className="btn-primary mt-5">Go to my health</a>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="glass border-rose-500/30 bg-rose-500/5 p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-rose-300" />
      <p className="mb-1 text-sm font-semibold text-rose-200">Could not generate plan</p>
      <p className="mb-5 text-xs text-ink-300">{message}</p>
      <button onClick={onRetry} className="btn-danger mx-auto">Retry</button>
    </div>
  );
}

// ── card 1: Diet ─────────────────────────────────────────────────────────
function DietCard({ plan }: { plan: DietPlan }) {
  return (
    <div className="glass relative overflow-hidden p-5">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-bold text-ink-50">{plan.title}</span>
        </div>
        <ConditionBadge note={plan.condition_note} />
      </div>
      <div className="space-y-4">
        {plan.meals?.map((meal, i) => (
          <div key={i}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-300">
              {meal.time}
            </p>
            <div className="flex flex-wrap gap-1">
              {meal.foods?.map((f, j) => <FoodChip key={j} label={f} type="eat" />)}
              {meal.avoid?.map((a, j) => <FoodChip key={j} label={a} type="avoid" />)}
            </div>
          </div>
        ))}
      </div>
      {plan.tips?.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-300">Tips</p>
          <ol className="space-y-1">
            {plan.tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-xs text-ink-100">
                <span className="font-bold text-emerald-400">{i + 1}.</span>{t}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── card 2: Exercise ─────────────────────────────────────────────────────
function ExerciseCard({ plan }: { plan: ExercisePlan }) {
  return (
    <div className="glass relative overflow-hidden p-5">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-cyan-300" />
          <span className="text-sm font-bold text-ink-50">{plan.title}</span>
        </div>
        <ConditionBadge note={plan.condition_note} />
      </div>
      <div className="mb-4 grid grid-cols-7 gap-1">
        {plan.weekly_plan?.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1 rounded-lg border border-white/5 bg-white/[0.03] p-1.5 text-center">
            <span className="text-[9px] font-bold uppercase text-ink-300">{d.day.slice(0, 3)}</span>
            <span className="line-clamp-2 text-[9px] leading-tight text-ink-100">{d.activity}</span>
            <span className={`h-2 w-2 rounded-full ${INTENSITY_DOT[d.intensity] ?? "bg-ink-300"}`} />
          </div>
        ))}
      </div>
      {plan.avoid?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {plan.avoid.map((a, i) => <FoodChip key={i} label={a} type="avoid" />)}
        </div>
      )}
      {plan.tips?.length > 0 && (
        <div className="border-t border-white/5 pt-3">
          <ol className="space-y-1">
            {plan.tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-xs text-ink-100">
                <span className="font-bold text-cyan-400">{i + 1}.</span>{t}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── card 3: Sleep ────────────────────────────────────────────────────────
function SleepCard({ plan }: { plan: SleepPlan }) {
  const sc = plan.schedule ?? ({} as SleepSched);
  return (
    <div className="glass relative overflow-hidden p-5">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-violet-400 to-fuchsia-500" />
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4 text-violet-300" />
          <span className="text-sm font-bold text-ink-50">{plan.title}</span>
        </div>
        <ConditionBadge note={plan.condition_note} />
      </div>

      <div className="mb-3 flex items-center justify-center gap-3 rounded-xl border border-white/5 bg-gradient-to-br from-violet-500/10 to-transparent py-4">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-ink-300">Bedtime</p>
          <p className="text-xl font-bold text-ink-50">{sc.bedtime ?? "—"}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-violet-300" />
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-ink-300">Wake</p>
          <p className="text-xl font-bold text-ink-50">{sc.wake_time ?? "—"}</p>
        </div>
        <span className="ml-1 rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-bold text-violet-200">
          {sc.duration_hours ?? "?"} hrs
        </span>
      </div>

      {sc.nap && <p className="mb-3 text-center text-xs italic text-ink-300">{sc.nap}</p>}

      {plan.habits?.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {plan.habits.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-ink-100">
              <CheckCircle className="mt-0.5 h-3.5 w-3.5 text-emerald-300" />{h}
            </div>
          ))}
        </div>
      )}

      {plan.avoid?.length > 0 && (
        <div className="space-y-1.5 border-t border-white/5 pt-3">
          {plan.avoid.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-ink-100">
              <X className="mt-0.5 h-3.5 w-3.5 text-rose-300" />{a}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── card 4: Lifestyle ────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Stress:     <Heart className="h-3 w-3" />,
  Hydration:  <Droplets className="h-3 w-3" />,
  Monitoring: <Clock className="h-3 w-3" />,
  Social:     <Star className="h-3 w-3" />,
  Habits:     <CheckCircle className="h-3 w-3" />,
};

function LifestyleCard({ plan }: { plan: LifestylePlan }) {
  return (
    <div className="glass relative overflow-hidden p-5">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-amber-400 to-pink-500" />
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-300" />
          <span className="text-sm font-bold text-ink-50">{plan.title}</span>
        </div>
        <ConditionBadge note={plan.condition_note} />
      </div>

      <div className="mb-4 space-y-2.5">
        {plan.recommendations?.map((r, i) => (
          <div key={i} className="flex gap-2.5">
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-300">
              {CATEGORY_ICONS[r.category]}{r.category}
            </span>
            <p className="text-xs leading-relaxed text-ink-100">{r.advice}</p>
          </div>
        ))}
      </div>

      {plan.warning && (
        <div className="flex items-start gap-2 rounded-r-lg border-l-2 border-amber-500/60 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span>{plan.warning}</span>
        </div>
      )}
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────
export default function HealthAgentPage() {
  const user = getAuth();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const fetchPlans = useCallback(async (refresh = false) => {
    setLoading(true); setError("");
    try {
      const endpoint = refresh ? "/ai/patient/health-plans/refresh" : "/ai/patient/health-plans";
      const method   = refresh ? "POST" : "GET";
      const res      = await apiFetch<HealthData>(endpoint, { method });
      if (res?.plans?.error) setError(res.plans.error);
      else setData(res);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load health plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  async function downloadPlan() {
    setDownloading(true);
    try {
      const token = user?.access_token ?? localStorage.getItem("mt_token") ?? "";
      const res = await fetch(`${API_URL}/ai/patient/health-plans/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "MyHealthPlan.pdf"; a.click();
      URL.revokeObjectURL(url);
      toastSuccess("Health plan downloaded");
    } catch {
      toastError("Download failed", "Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <Skeleton />;
  if (error)   return <ErrorState message={error} onRetry={() => fetchPlans(true)} />;
  if (!data)   return <EmptyState />;

  const { plans, model, based_on } = data;
  const hasRecords = based_on && based_on !== "No diagnosis recorded";

  return (
    <div className="space-y-6">
      {/* Banner */}
      <motion.div
        initial="hidden" animate="visible" variants={stagger(0, 0.08)}
        className="glass relative overflow-hidden p-5 sm:p-6"
      >
        <div className="pointer-events-none absolute -top-20 -right-12 h-56 w-56 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <motion.div variants={fadeUp}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 shadow-glow-cyan">
              <Leaf className="h-6 w-6 text-white" strokeWidth={2.2} />
            </motion.div>
            <div>
              <motion.h1 variants={fadeUp} className="text-lg font-bold tracking-tight text-ink-50">
                Your <span className="gradient-text-animated">Personal Health Plan</span>
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-200">
                Generated based on your medical records by <ModelBadge model={model} />
              </motion.p>
            </div>
          </div>
          <motion.button variants={fadeUp}
            onClick={() => fetchPlans(true)}
            className="btn-secondary shrink-0"
          >
            <RefreshCw className="h-4 w-4" />Refresh plan
          </motion.button>
        </div>

        {hasRecords && (
          <p className="relative mt-3 text-[11px] text-emerald-300">
            Based on: <span className="font-medium text-emerald-200">{based_on}</span>
          </p>
        )}
      </motion.div>

      {/* 4 plan cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Reveal delay={0.00}>{plans.diet      && <DietCard      plan={plans.diet}      />}</Reveal>
        <Reveal delay={0.07}>{plans.exercise  && <ExerciseCard  plan={plans.exercise}  />}</Reveal>
        <Reveal delay={0.14}>{plans.sleep     && <SleepCard     plan={plans.sleep}     />}</Reveal>
        <Reveal delay={0.21}>{plans.lifestyle && <LifestyleCard plan={plans.lifestyle} />}</Reveal>
      </div>

      {/* Download */}
      <Reveal>
        <button
          id="health-plan-download-btn"
          onClick={downloadPlan}
          disabled={downloading}
          className="btn-primary w-full justify-center py-4"
        >
          {downloading ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Preparing PDF…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Download my health plan as PDF
            </>
          )}
        </button>
      </Reveal>
    </div>
  );
}
