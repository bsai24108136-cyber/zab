"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { fadeUp, stagger } from "@/lib/motion";
import StatTile from "@/components/ui/StatTile";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/ui/Reveal";
import CountUp from "@/components/ui/CountUp";
import {
  Users, FileText, Clock, Shield, DollarSign,
  BarChart3, Stethoscope, Sparkles, AlertCircle, CheckCircle2,
} from "lucide-react";

interface SystemHealth {
  total_users: number; total_documents: number;
  total_chunks: number; total_embeddings: number;
  total_searches: number; avg_ai_response_time_ms: number; status: string;
}
interface Costs {
  gemini:     { total_calls: number; total_tokens: number; estimated_cost_usd: number };
  gpt4o_mini: { total_calls: number; total_tokens: number; exact_cost_usd: number };
  combined_total_usd: number; budget_status: string;
}

export default function AdminDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [costs,  setCosts]  = useState<Costs | null>(null);
  const [doctorCount, setDoctorCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<SystemHealth>("/admin/system-health").catch(() => null),
      apiFetch<Costs>("/admin/costs").catch(() => null),
      apiFetch<any[]>("/admin/doctors").catch(() => []),
    ]).then(([h, c, d]) => {
      setHealth(h); setCosts(c); setDoctorCount(d?.length ?? 0);
    }).finally(() => setLoading(false));
  }, []);

  const total = costs?.combined_total_usd ?? 0;
  const under = total < 10;

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <motion.div
        initial="hidden" animate="visible" variants={stagger(0, 0.08)}
        className="glass relative overflow-hidden p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -top-32 -right-20 h-72 w-72 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <motion.div variants={fadeUp}
              className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 shadow-glow-violet">
              <Shield className="h-7 w-7 text-white" strokeWidth={2.2} />
            </motion.div>
            <div>
              <motion.h2 variants={fadeUp} className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">
                Admin <span className="gradient-text-animated">Control Center</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-1 text-sm text-ink-200">
                System oversight · Cost monitoring · Audit trail
              </motion.p>
            </div>
          </div>
          <motion.div variants={fadeUp} className="flex items-center gap-2">
            <span className={`badge-${under ? "cyan" : "violet"}`}>
              {under ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {health?.status ?? "Healthy"}
            </span>
            <span className="badge-violet">
              <Sparkles className="h-3.5 w-3.5" /> {health?.total_searches ?? 0} searches
            </span>
          </motion.div>
        </div>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="skeleton h-28" />)}
        </div>
      ) : (
        <>
          {/* System health */}
          <section>
            <Reveal as="header" className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-300">System Health</h3>
              <span className="text-[10px] text-ink-300">{new Date().toLocaleString()}</span>
            </Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile icon={<Users className="h-5 w-5" />}      label="Total Users"      value={health?.total_users ?? 0}     accent="cyan"   delay={0.00} />
              <StatTile icon={<Stethoscope className="h-5 w-5"/>} label="Doctors"          value={doctorCount}                  accent="mint"   delay={0.05} sub="registered physicians" />
              <StatTile icon={<FileText className="h-5 w-5" />}   label="Documents"        value={health?.total_documents ?? 0} accent="violet" delay={0.10} />
              <StatTile icon={<Clock className="h-5 w-5" />}      label="Avg AI Response"  value={Math.round(health?.avg_ai_response_time_ms ?? 0)} accent="amber" delay={0.15} suffix="ms" />
            </div>
          </section>

          {/* Cost monitor */}
          <section>
            <Reveal as="header" className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-300">Cost Monitor</h3>
            </Reveal>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <GlassCard interactive accent="amber" className="p-5">
                <div className="badge-gemini mb-3">Gemini 1.5 Flash</div>
                <p className="text-3xl font-bold text-ink-50">
                  $<CountUp to={costs?.gemini.estimated_cost_usd ?? 0} decimals={4} />
                </p>
                <p className="mt-1 text-xs text-ink-300">
                  {costs?.gemini.total_calls ?? 0} calls · {(costs?.gemini.total_tokens ?? 0).toLocaleString()} tokens
                </p>
                <p className="mt-2 text-xs text-emerald-300">✓ Free tier</p>
              </GlassCard>

              <GlassCard interactive accent="violet" className="p-5">
                <div className="badge-gpt mb-3">GPT-4o-mini</div>
                <p className="text-3xl font-bold text-ink-50">
                  $<CountUp to={costs?.gpt4o_mini.exact_cost_usd ?? 0} decimals={4} />
                </p>
                <p className="mt-1 text-xs text-ink-300">
                  {costs?.gpt4o_mini.total_calls ?? 0} calls · {(costs?.gpt4o_mini.total_tokens ?? 0).toLocaleString()} tokens
                </p>
                <p className="mt-2 text-xs text-ink-300">$0.00015/1K in + $0.0006/1K out</p>
              </GlassCard>

              <GlassCard interactive accent={under ? "mint" : "pink"} className="p-5">
                <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-ink-200">
                  <DollarSign className="h-4 w-4 text-emerald-400" /> Total Budget
                </div>
                <p className="text-4xl font-bold text-ink-50">
                  $<CountUp to={total} decimals={4} />
                </p>
                <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  under ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                }`}>
                  {under ? "✓ Under $10 Budget" : "⚠ Over Budget"}
                </span>
              </GlassCard>
            </div>
          </section>

          {/* Quick nav */}
          <section>
            <Reveal as="header" className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-300">Quick actions</h3>
            </Reveal>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { href: "/dashboard/admin/users",    label: "Manage Users",  icon: <Users className="h-5 w-5" />,      accent: "cyan"   as const },
                { href: "/dashboard/admin/users",    label: "Doctors",       icon: <Stethoscope className="h-5 w-5"/>, accent: "mint"   as const },
                { href: "/dashboard/admin/audit",    label: "Audit Log",     icon: <Shield className="h-5 w-5" />,     accent: "violet" as const },
                { href: "/dashboard/admin/searches", label: "Search History",icon: <BarChart3 className="h-5 w-5" />,  accent: "amber"  as const },
              ].map((item, i) => (
                <Reveal key={item.href + item.label} delay={i * 0.05}>
                  <Link href={item.href} className="block">
                    <GlassCard interactive accent={item.accent} className="group p-5 text-center transition-all hover:-translate-y-1">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-ink-100 transition-colors group-hover:text-white">
                        {item.icon}
                      </div>
                      <p className="text-xs font-semibold text-ink-100 transition-colors group-hover:text-white">{item.label}</p>
                    </GlassCard>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
