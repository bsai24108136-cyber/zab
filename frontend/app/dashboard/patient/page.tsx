"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch, API_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { toastSuccess, toastError } from "@/lib/alerts";
import { fadeUp, stagger } from "@/lib/motion";
import StatTile from "@/components/ui/StatTile";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/ui/Reveal";
import {
  FileText, Bell, MessageSquare, CheckCircle, Activity, Download,
  Sparkles,
} from "lucide-react";

interface Reminder { reminders: string[]; count: number; }
interface Doc { id: string; filename: string; file_type: string; status: string; upload_date: string; }

export default function PatientDashboard() {
  const user = getAuth();
  const [reminders, setReminders] = useState<Reminder | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Reminder>("/ai/patient/reminders").catch(() => ({ reminders: [], count: 0 })),
      apiFetch<Doc[]>("/documents/").catch(() => []),
    ]).then(([rem, docList]) => { setReminders(rem); setDocs(docList); })
      .finally(() => setLoading(false));
  }, []);

  async function downloadSummary() {
    setDownloading(true);
    try {
      const token = user?.access_token ?? "";
      const res = await fetch(
        `${API_URL}/ai/summary/${user?.user_id}/download?format=pdf&audience=patient`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "MyHealthSummary.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toastSuccess("Summary ready", "Saved to your downloads.");
    } catch {
      toastError("Download failed", "Please try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  const ready = docs.filter(d => d.status === "ready").length;

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <motion.div
        initial="hidden" animate="visible" variants={stagger(0, 0.08)}
        className="glass relative overflow-hidden p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -top-24 -right-12 h-64 w-64 rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <motion.div variants={fadeUp}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-500 shadow-glow-cyan">
              <Activity className="h-7 w-7 text-white" strokeWidth={2.2} />
            </motion.div>
            <div>
              <motion.h2 variants={fadeUp} className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">
                Welcome back,{" "}
                <span className="gradient-text-animated">
                  {user?.full_name?.split(" ")[0] ?? "Patient"}
                </span>
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-1 text-sm text-ink-200">
                Your health dashboard is up to date.
              </motion.p>
            </div>
          </div>
          <motion.div variants={fadeUp} className="flex items-center gap-2">
            <span className="badge-gemini"><Sparkles className="h-3.5 w-3.5" /> Gemini 1.5 Flash</span>
          </motion.div>
        </div>
      </motion.div>

      {/* Reminder banner */}
      <AnimatePresence>
        {reminders && reminders.count > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-sm border-amber-500/30 bg-amber-500/10 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-200">Medication reminders</p>
                <ul className="mt-1 space-y-0.5">
                  {reminders.reminders.map((r, i) => (
                    <li key={i} className="text-xs text-amber-200/80">• {r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={<FileText className="h-5 w-5" />}      label="My Documents"  value={docs.length}        accent="cyan"   delay={0.00} />
        <StatTile icon={<Bell className="h-5 w-5" />}          label="Reminders"     value={reminders?.count ?? 0} accent="amber"  delay={0.05} sub="next 7 days" />
        <StatTile icon={<MessageSquare className="h-5 w-5" />} label="AI Model"      value="Gemini"             accent="mint"   delay={0.10} sub="1.5 Flash" raw />
        <StatTile icon={<CheckCircle className="h-5 w-5" />}   label="Records Ready" value={ready}              accent="violet" delay={0.15} />
      </div>

      {/* Quick actions */}
      <section>
        <Reveal as="header" className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-300">Quick actions</h3>
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Reveal delay={0}>
            <Link href="/dashboard/patient/chat" className="block">
              <GlassCard interactive accent="cyan" className="group p-5 transition-all hover:-translate-y-1">
                <MessageSquare className="mb-3 h-8 w-8 text-cyan-300 transition-transform group-hover:scale-110" />
                <h3 className="font-semibold text-ink-50">Chat with AI</h3>
                <p className="mt-1 text-xs text-ink-300">Ask about your records</p>
                <div className="badge-gemini mt-3 text-[10px]">Gemini 2.5 Flash</div>
              </GlassCard>
            </Link>
          </Reveal>
          <Reveal delay={0.07}>
            <Link href="/dashboard/patient/documents" className="block">
              <GlassCard interactive accent="violet" className="group p-5 transition-all hover:-translate-y-1">
                <FileText className="mb-3 h-8 w-8 text-violet-300 transition-transform group-hover:scale-110" />
                <h3 className="font-semibold text-ink-50">Upload Documents</h3>
                <p className="mt-1 text-xs text-ink-300">PDF, DOCX, TXT, CSV</p>
              </GlassCard>
            </Link>
          </Reveal>
          <Reveal delay={0.14}>
            <Link href="/dashboard/patient/search" className="block">
              <GlassCard interactive accent="pink" className="group p-5 transition-all hover:-translate-y-1">
                <Activity className="mb-3 h-8 w-8 text-pink-300 transition-transform group-hover:scale-110" />
                <h3 className="font-semibold text-ink-50">Search Records</h3>
                <p className="mt-1 text-xs text-ink-300">Semantic + keyword</p>
              </GlassCard>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Download */}
      <Reveal>
        <button
          onClick={downloadSummary}
          disabled={downloading}
          className="btn-primary w-full justify-center py-4 text-base"
        >
          {downloading ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Preparing PDF…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Download my health summary (PDF)
            </>
          )}
        </button>
      </Reveal>

      {/* Recent documents */}
      <Reveal>
        <GlassCard className="overflow-hidden">
          <div className="border-b border-white/5 px-6 py-4">
            <h3 className="text-sm font-semibold text-ink-100">Recent documents</h3>
          </div>
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <div key={i} className="skeleton h-12" />)}</div>
          ) : docs.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-300">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
              No documents yet.
              <Link href="/dashboard/patient/documents" className="ml-2 text-cyan-300 hover:underline">
                Upload your first →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-ink-300">
                    <th className="px-6 py-2 text-left font-medium">Filename</th>
                    <th className="px-6 py-2 text-left font-medium">Type</th>
                    <th className="px-6 py-2 text-left font-medium">Status</th>
                    <th className="px-6 py-2 text-left font-medium">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {docs.slice(0, 5).map((d, i) => (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="transition-colors hover:bg-white/5"
                    >
                      <td className="max-w-[200px] truncate px-6 py-2.5 font-medium text-ink-100">{d.filename}</td>
                      <td className="px-6 py-2.5">
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-200">
                          {d.file_type}
                        </span>
                      </td>
                      <td className="px-6 py-2.5">
                        <span className={`text-xs font-medium ${
                          d.status === "ready" ? "text-emerald-300"
                          : d.status === "error" ? "text-rose-300" : "text-amber-300"
                        }`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-6 py-2.5 text-xs text-ink-300">
                        {new Date(d.upload_date).toLocaleDateString("en-PK")}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </Reveal>
    </div>
  );
}
