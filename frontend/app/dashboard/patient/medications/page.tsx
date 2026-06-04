"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { fadeUp, stagger } from "@/lib/motion";
import Reveal from "@/components/ui/Reveal";
import StatTile from "@/components/ui/StatTile";
import {
  Pill, Bell, Calendar, CheckCircle, AlertTriangle, Sparkles,
  User, Info, XCircle, ChevronDown, ChevronUp, Clock, Activity,
} from "lucide-react";

interface Prescription {
  id: string;
  rx_number: string;
  medicine_name: string;
  medicine_normalized: string;
  dosage: string;
  frequency: string;
  instructions: string;
  duration_days: number;
  start_date: string;
  status: string;
  doctor_name: string;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; cls: string; icon: JSX.Element }> = {
  active:    { label: "Active",    cls: "bg-green-500/20 text-green-300 border-green-500/30",  icon: <CheckCircle className="w-3 h-3" /> },
  completed: { label: "Completed", cls: "bg-gray-700/60 text-gray-400 border-gray-600",         icon: <CheckCircle className="w-3 h-3" /> },
  cancelled: { label: "Cancelled", cls: "bg-red-500/15 text-red-400 border-red-500/25",         icon: <XCircle className="w-3 h-3" /> },
};

function daysBetween(start: string, days: number | null) {
  if (!start || !days) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const diff = Math.ceil((end.getTime() - Date.now()) / 86400000);
  return { end, diff };
}

function RxCard({ rx, index }: { rx: Prescription; index: number }) {
  const [open, setOpen] = useState(false);
  const countdown = daysBetween(rx.start_date, rx.duration_days);
  const isExpiring = countdown && countdown.diff >= 0 && countdown.diff <= 7;
  const isExpired  = countdown && countdown.diff < 0;
  const badge = STATUS_MAP[rx.status] ?? STATUS_MAP.active;

  return (
    <motion.div
      layout
      variants={fadeUp}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className={`glass border transition-all overflow-hidden ${
        rx.status === "cancelled" ? "opacity-60 border-red-500/20" :
        isExpired   ? "border-red-500/30 bg-red-500/5" :
        isExpiring  ? "border-amber-500/30 bg-amber-500/5" :
        "hover:border-teal-500/30"
      }`}
    >
      {/* Header row */}
      <div className="p-5 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            rx.status === "active" ? "bg-gradient-to-br from-teal-500/30 to-cyan-500/20 shadow-glow-cyan" : "bg-gray-700/50"
          }`}>
            <Pill className={`w-4 h-4 ${rx.status === "active" ? "text-teal-300" : "text-gray-500"}`} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-100 leading-tight">
              {rx.medicine_normalized || rx.medicine_name}
              {rx.medicine_normalized && rx.medicine_normalized !== rx.medicine_name && (
                <span className="text-xs text-gray-500 font-normal ml-2">({rx.medicine_name})</span>
              )}
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {rx.dosage && <span className="font-medium">{rx.dosage}</span>}
              {rx.dosage && rx.frequency && " · "}
              {rx.frequency && <span>{rx.frequency}</span>}
            </p>
            {rx.instructions && (
              <p className="text-xs text-blue-300/80 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />{rx.instructions}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${badge.cls}`}>
            {badge.icon}{badge.label}
          </span>
          {countdown && rx.status === "active" && (
            <p className={`text-[11px] flex items-center gap-1 ${isExpired ? "text-red-400" : isExpiring ? "text-amber-400" : "text-gray-500"}`}>
              <Clock className="w-3 h-3" />
              {isExpired
                ? `Ended ${Math.abs(countdown.diff)}d ago`
                : `${countdown.diff} days left`}
            </p>
          )}
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
            <ChevronDown className="w-4 h-4 text-gray-600 mt-1" />
          </motion.div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-800/60 px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-gray-600 uppercase tracking-wider font-semibold mb-0.5">RX Number</p>
                <p className="text-gray-300 font-mono">{rx.rx_number}</p>
              </div>
              <div>
                <p className="text-gray-600 uppercase tracking-wider font-semibold mb-0.5">Prescribed By</p>
                <p className="text-gray-300 flex items-center gap-1"><User className="w-3 h-3" />{rx.doctor_name || "—"}</p>
              </div>
              <div>
                <p className="text-gray-600 uppercase tracking-wider font-semibold mb-0.5">Duration</p>
                <p className="text-gray-300">{rx.duration_days ? `${rx.duration_days} days` : "—"}</p>
              </div>
              <div>
                <p className="text-gray-600 uppercase tracking-wider font-semibold mb-0.5">Start Date</p>
                <p className="text-gray-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(rx.start_date).toLocaleDateString("en-PK")}
                </p>
              </div>
              {countdown && (
                <div>
                  <p className="text-gray-600 uppercase tracking-wider font-semibold mb-0.5">End Date</p>
                  <p className={`flex items-center gap-1 ${isExpired ? "text-red-400" : isExpiring ? "text-amber-400" : "text-gray-300"}`}>
                    <Calendar className="w-3 h-3" />
                    {countdown.end.toLocaleDateString("en-PK")}
                  </p>
                </div>
              )}
              {rx.instructions && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-gray-600 uppercase tracking-wider font-semibold mb-0.5">Instructions</p>
                  <p className="text-blue-300/80">{rx.instructions}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function MedicationsPage() {
  const user = getAuth();
  const [rxs, setRxs] = useState<Prescription[]>([]);
  const [reminders, setReminders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "cancelled">("all");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiFetch<Prescription[]>(`/prescriptions/${user.user_id}`).catch(() => []),
      apiFetch<{ reminders: string[] }>("/ai/patient/reminders").catch(() => ({ reminders: [] })),
    ]).then(([rxData, remData]) => {
      setRxs(rxData);
      setReminders(remData.reminders);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = rxs.filter(r => filter === "all" || r.status === filter);
  const counts = {
    all: rxs.length,
    active: rxs.filter(r => r.status === "active").length,
    completed: rxs.filter(r => r.status === "completed").length,
    cancelled: rxs.filter(r => r.status === "cancelled").length,
  };

  const expiringSoon = rxs.filter(r => {
    if (r.status !== "active") return false;
    const c = daysBetween(r.start_date, r.duration_days);
    return c && c.diff >= 0 && c.diff <= 7;
  }).length;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Hero header */}
      <motion.div
        initial="hidden" animate="visible" variants={stagger(0, 0.08)}
        className="glass relative overflow-hidden p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -top-24 -right-12 h-64 w-64 rounded-full bg-teal-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <motion.div variants={fadeUp}
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ rotate: { repeat: Infinity, duration: 6, ease: "easeInOut" }, delay: 0.2 }}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 via-emerald-500 to-cyan-500 shadow-glow-cyan">
              <Pill className="h-7 w-7 text-white" strokeWidth={2.2} />
            </motion.div>
            <div>
              <motion.h2 variants={fadeUp} className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">
                My <span className="gradient-text-animated">Medications</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-1 text-sm text-ink-200">
                {counts.active} active prescription{counts.active !== 1 ? "s" : ""} on file
              </motion.p>
            </div>
          </div>
          <motion.div variants={fadeUp} className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"><Activity className="h-3.5 w-3.5" /> Tracked daily</span>
            {expiringSoon > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-amber-500/15 text-amber-300 border-amber-500/30">
                <AlertTriangle className="h-3 w-3" /> {expiringSoon} expiring
              </span>
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* Stat tiles */}
      {!loading && rxs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile icon={<CheckCircle className="h-5 w-5" />} label="Active" value={counts.active} accent="mint" delay={0.05} />
          <StatTile icon={<Clock className="h-5 w-5" />}       label="Expiring ≤7d" value={expiringSoon} accent="amber" delay={0.10} />
          <StatTile icon={<CheckCircle className="h-5 w-5" />} label="Completed" value={counts.completed} accent="cyan"  delay={0.15} />
          <StatTile icon={<XCircle className="h-5 w-5" />}     label="Cancelled" value={counts.cancelled} accent="rose"  delay={0.20} />
        </div>
      )}

      {/* Refill reminders */}
      <AnimatePresence>
        {reminders.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
            className="glass p-5 bg-amber-500/5 border-amber-500/25 relative overflow-hidden"
          >
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <motion.div
                  animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
                  transition={{ rotate: { repeat: Infinity, repeatDelay: 4, duration: 0.8 } }}
                >
                  <Bell className="w-4 h-4 text-amber-400" />
                </motion.div>
                <h3 className="text-sm font-semibold text-amber-300">Upcoming Refill Reminders</h3>
                <span className="badge-gemini text-[10px]"><Sparkles className="w-2.5 h-2.5" />AI-generated</span>
              </div>
              <div className="space-y-1.5">
                {reminders.map((r, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.06 }}
                    className="text-sm text-amber-200/80 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{r}
                  </motion.p>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter tabs */}
      {rxs.length > 0 && (
        <Reveal>
          <div className="flex gap-2 flex-wrap">
            {(["all", "active", "completed", "cancelled"] as const).map(f => (
              <motion.button
                key={f}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  filter === f
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-glow-cyan"
                    : "text-gray-500 hover:text-gray-300 glass-sm"
                }`}>
                {f} ({counts[f]})
              </motion.button>
            ))}
          </div>
        </Reveal>
      )}

      {/* Prescriptions */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Reveal>
          <div className="glass p-12 text-center text-gray-500">
            <Pill className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {rxs.length === 0 ? "No prescriptions on file yet." : `No ${filter} prescriptions.`}
            </p>
            {rxs.length === 0 && (
              <p className="text-xs text-gray-600 mt-2">
                Your doctor will add medications here after your consultation.
              </p>
            )}
          </div>
        </Reveal>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div
            key={filter}
            initial="hidden" animate="visible" variants={stagger(0, 0.05)}
            className="space-y-3"
          >
            {filtered.map((rx, i) => <RxCard key={rx.id} rx={rx} index={i} />)}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
