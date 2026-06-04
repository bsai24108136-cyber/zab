"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { fadeUp, stagger } from "@/lib/motion";
import StatTile from "@/components/ui/StatTile";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/ui/Reveal";
import {
  Users, Brain, FileText, TrendingUp, Activity,
  AlertTriangle, Stethoscope, Sparkles, ArrowRight,
} from "lucide-react";

interface Patient {
  id: string; full_name: string; email: string;
  created_at: string; is_active: boolean;
}

export default function DoctorDashboard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [docs, setDocs] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [criticalCount, setCriticalCount] = useState(0);
  const [urgentCount, setUrgentCount]     = useState(0);

  useEffect(() => {
    Promise.all([
      apiFetch<Patient[]>("/admin/users").catch(() => []),
      apiFetch<unknown[]>("/documents/").catch(() => []),
      apiFetch<unknown>("/notifications/").catch(() => null),
    ]).then(([users, docList, notifs]) => {
      setPatients(users.filter((u: Patient) => u?.id && u?.email).slice(0, 10));
      setDocs(docList);
      if (notifs) {
        setCriticalCount(notifs.critical_count ?? 0);
        setUrgentCount(notifs.urgent_count ?? 0);
      }
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      {/* Requires-attention banner */}
      {(criticalCount > 0 || urgentCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className={`relative overflow-hidden rounded-2xl border px-5 py-3.5 backdrop-blur-xl ${
            criticalCount > 0
              ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
              </span>
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-semibold">
                {criticalCount > 0
                  ? `${criticalCount} CRITICAL alert${criticalCount > 1 ? "s" : ""} require immediate attention`
                  : `${urgentCount} urgent alert${urgentCount > 1 ? "s" : ""} need review`}
              </p>
            </div>
            <Link href="/dashboard/doctor/patients"
              className="whitespace-nowrap rounded-lg border border-current/30 bg-current/10 px-3 py-1.5 text-xs font-semibold transition-all hover:bg-current/20">
              Review now <ArrowRight className="ml-1 inline h-3 w-3" />
            </Link>
          </div>
        </motion.div>
      )}

      {/* Hero */}
      <motion.div
        initial="hidden" animate="visible" variants={stagger(0, 0.08)}
        className="glass relative overflow-hidden p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <motion.div variants={fadeUp}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 shadow-glow-cyan">
              <Stethoscope className="h-7 w-7 text-white" strokeWidth={2.2} />
            </motion.div>
            <div>
              <motion.h2 variants={fadeUp} className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">
                Doctor <span className="gradient-text-animated">Workbench</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-1 text-sm text-ink-200">
                Clinical AI powered by Grok + Gemini 2.5 Flash
              </motion.p>
            </div>
          </div>
          <motion.div variants={fadeUp} className="flex items-center gap-2">
            <span className="badge-cyan"><Sparkles className="h-3.5 w-3.5" /> Grok</span>
            <span className="badge-gemini">Gemini 2.5</span>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={<Users className="h-5 w-5" />}      label="Patients"   value={patients.length}              accent="cyan"   delay={0.00} />
        <StatTile icon={<FileText className="h-5 w-5" />}   label="Documents"  value={(docs as unknown[]).length}   accent="violet" delay={0.05} />
        <StatTile icon={<Brain className="h-5 w-5" />}      label="AI Model"   value="Grok"                          accent="mint"   delay={0.10} sub="+ Gemini 2.5" raw />
        <StatTile icon={<TrendingUp className="h-5 w-5" />} label="Tools"      value={10}                            accent="amber"  delay={0.15} sub="agent tools" />
      </div>

      {/* Quick actions */}
      <section>
        <Reveal as="header" className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-300">Quick actions</h3>
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Reveal delay={0.0}>
            <Link href="/dashboard/doctor/ai-assistant" className="block">
              <GlassCard interactive accent="violet" className="group p-5 transition-all hover:-translate-y-1">
                <Brain className="mb-3 h-8 w-8 text-violet-300 transition-transform group-hover:scale-110" />
                <h3 className="font-semibold text-ink-50">AI Assistant</h3>
                <p className="mt-1 text-xs text-ink-300">6-tab clinical intelligence</p>
                <div className="badge-gemini mt-3 text-[10px]">Grok / Gemini 2.5</div>
              </GlassCard>
            </Link>
          </Reveal>
          <Reveal delay={0.07}>
            <Link href="/dashboard/doctor/patients" className="block">
              <GlassCard interactive accent="cyan" className="group p-5 transition-all hover:-translate-y-1">
                <Users className="mb-3 h-8 w-8 text-cyan-300 transition-transform group-hover:scale-110" />
                <h3 className="font-semibold text-ink-50">Patient List</h3>
                <p className="mt-1 text-xs text-ink-300">View & manage patients</p>
              </GlassCard>
            </Link>
          </Reveal>
          <Reveal delay={0.14}>
            <Link href="/dashboard/doctor/documents" className="block">
              <GlassCard interactive accent="mint" className="group p-5 transition-all hover:-translate-y-1">
                <FileText className="mb-3 h-8 w-8 text-emerald-300 transition-transform group-hover:scale-110" />
                <h3 className="font-semibold text-ink-50">Upload Docs</h3>
                <p className="mt-1 text-xs text-ink-300">PDF, DOCX, TXT, CSV</p>
              </GlassCard>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Recent patients */}
      <section>
        <GlassCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <h3 className="text-sm font-semibold text-ink-100">Recent patients</h3>
            <Link href="/dashboard/doctor/patients" className="text-xs text-cyan-300 transition-colors hover:text-cyan-200">
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <div key={i} className="skeleton h-12" />)}</div>
          ) : patients.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-300">
              <Activity className="mx-auto mb-2 h-8 w-8 opacity-30" />
              No patients yet.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {patients.slice(0, 5).map((p, i) => (
                <motion.li key={p.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-xs font-bold text-white shadow-glow-cyan">
                      {(p.full_name || p.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-50">{p.full_name || "—"}</p>
                      <p className="text-xs text-ink-300">{p.email}</p>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/doctor/ai-assistant?patient_id=${p.id}`}
                    className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200 transition-colors hover:bg-violet-500/20"
                  >
                    AI Analysis
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </GlassCard>
      </section>
    </div>
  );
}
