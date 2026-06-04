"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, API_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { alertConfirm, toastError, toastSuccess } from "@/lib/alerts";
import AISummaryCard from "./AISummaryCard";
import TimelineTab from "./TimelineTab";
import {
  ArrowLeft, User, FileText, Pill, Activity, Brain,
  Plus, Pencil, X, AlertTriangle, Save, Trash2,
  Calendar, Info, BarChart2, Download,
  ShieldCheck, ShieldX
} from "lucide-react";

interface RxRow {
  id: string; rx_number: string; medicine_name: string;
  medicine_normalized: string; dosage: string; frequency: string;
  instructions: string; duration_days: number; start_date: string; status: string;
}

interface DocRecord { id: string; filename: string; upload_date: string; chunk_count: number; status: string; }
interface MedRecord { id: string; visit_date: string; diagnosis: string; symptoms: string; }
interface LabRecord { id: string; result_status: string; doctor_note: string; uploaded_at: string; }

interface Summary {
  profile: { id: string; full_name: string; email: string; phone: string | null; created_at: string; };
  documents: DocRecord[]; medical_records: MedRecord[]; prescriptions: RxRow[]; lab_reports: LabRecord[];
}

interface AIQueryResult { answer?: string; model?: string; disclaimer?: string; error?: string; }

const TABS = ["Overview", "Documents", "Prescriptions", "Lab Reports", "Timeline", "AI Analysis"] as const;
type Tab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/20",
  completed: "text-gray-400 bg-gray-500/10 border-gray-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
  normal: "text-green-400 bg-green-500/10 border-green-500/20",
  abnormal: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  ready: "text-teal-400", pending: "text-amber-400", error: "text-red-400",
};

const EMPTY_RX = { medicine_name: "", dosage: "", frequency: "", instructions: "", duration_days: "", start_date: new Date().toISOString().split("T")[0], status: "active" };

// ── Drug interaction result type ──────────────────────────────────────────────
interface Interaction { drug_a: string; drug_b: string; severity: string; reason: string; recommendation: string; }
interface InteractionResult {
  verdict: "SAFE" | "CAUTION" | "DANGEROUS";
  interactions: Interaction[];
  overall_recommendation: string;
  model: string;
  response_ms: number;
}

// ── Progress report metrics type ──────────────────────────────────────────────
interface ProgressData {
  patient: { name: string; id: string };
  period: { label: string };
  metrics: { total_visits: number; active_meds: number; med_changes: number; labs_abnormal: number };
  ai_commentary: string;
  ai_model: string;
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const auth = getAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Overview");
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState<AIQueryResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Prescription modals
  const [showAddRx, setShowAddRx] = useState(false);
  const [editRx, setEditRx] = useState<RxRow | null>(null);
  const [rxForm, setRxForm] = useState<typeof EMPTY_RX>({ ...EMPTY_RX });
  const [rxSaving, setRxSaving] = useState(false);
  const [rxMsg, setRxMsg] = useState("");

  // Drug interaction checker
  const [ixResult, setIxResult]     = useState<InteractionResult | null>(null);
  const [ixLoading, setIxLoading]   = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Progress report modal
  const [showProgress, setShowProgress]   = useState(false);
  const [progressPeriod, setProgressPeriod] = useState<30 | 90>(30);
  const [progressData, setProgressData]   = useState<ProgressData | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [pdfDownloading, setPdfDownloading]   = useState(false);

  const loadSummary = useCallback(() => {
    apiFetch<Summary>(`/doctor/patients/${id}/summary`)
      .then(setSummary).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // ── Drug checker: fires on blur of medicine_name field ──────────────────────
  const checkInteraction = useCallback((drugName: string) => {
    if (editRx) return;                  // skip for edits, only for new Rx
    if (!drugName || drugName.length < 3) { setIxResult(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIxLoading(true);
      try {
        const res = await apiFetch<InteractionResult>(
          `/doctor/patient/${id}/check-interaction`,
          { method: "POST", body: JSON.stringify({ new_drug: drugName }) }
        );
        setIxResult(res);
      } catch (e) {
        console.error("Interaction check failed:", e);
        setIxResult(null);
      } finally { setIxLoading(false); }
    }, 800);
  }, [id, editRx]);

  // ── Progress report helpers ───────────────────────────────────────────────
  const loadProgressPreview = useCallback(async (days: 30 | 90) => {
    setProgressLoading(true);
    setProgressData(null);
    try {
      const res = await apiFetch<ProgressData>(
        `/doctor/patient/${id}/progress/preview?days=${days}`
      );
      setProgressData(res);
    } catch { /* silent */ }
    finally { setProgressLoading(false); }
  }, [id]);

  const downloadProgressPdf = async () => {
    setPdfDownloading(true);
    try {
      const token = auth?.access_token ?? localStorage.getItem("mt_token") ?? "";
      const res = await fetch(
        `${API_URL}/doctor/patient/${id}/progress/download?days=${progressPeriod}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `ProgressReport_${id.slice(0,8).toUpperCase()}_${progressPeriod}d.pdf`;
      a.click(); URL.revokeObjectURL(url);
      toastSuccess("Progress report downloaded");
      setTimeout(() => setShowProgress(false), 800);
    } catch { toastError("Download failed", "Please try again."); }
    finally { setPdfDownloading(false); }
  };

  function openProgressModal() {
    setShowProgress(true);
    setProgressData(null);
    setProgressPeriod(30);
    loadProgressPreview(30);
  }

  async function runAI() {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    try {
      const res = await apiFetch<AIQueryResult>("/ai/doctor/query", {
        method: "POST",
        body: JSON.stringify({ query: aiQuery, patient_id: id, query_type: "query" }),
      });
      setAiResult(res);
    } catch (e: unknown) { setAiResult({ error: e instanceof Error ? e.message : "Unknown error" }); }
    finally { setAiLoading(false); }
  }

  function openAdd() {
    setRxForm({ ...EMPTY_RX });
    setRxMsg(""); setShowAddRx(true);
  }

  function openEdit(rx: RxRow) {
    setRxForm({
      medicine_name: rx.medicine_name || "",
      dosage: rx.dosage || "",
      frequency: rx.frequency || "",
      instructions: rx.instructions || "",
      duration_days: String(rx.duration_days || ""),
      start_date: rx.start_date || new Date().toISOString().split("T")[0],
      status: rx.status || "active",
    });
    setRxMsg(""); setEditRx(rx);
  }

  async function saveRx() {
    if (!rxForm.medicine_name.trim()) { setRxMsg("Medicine name is required"); return; }
    setRxSaving(true); setRxMsg("");
    try {
      if (editRx) {
        // PATCH existing
        await apiFetch(`/prescriptions/${editRx.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            medicine_name: rxForm.medicine_name,
            dosage: rxForm.dosage || null,
            frequency: rxForm.frequency || null,
            instructions: rxForm.instructions || null,
            duration_days: rxForm.duration_days ? parseInt(rxForm.duration_days) : null,
            start_date: rxForm.start_date || null,
            status: rxForm.status,
          }),
        });
        setRxMsg("✅ Prescription updated");
      } else {
        // POST new
        await apiFetch("/prescriptions/", {
          method: "POST",
          body: JSON.stringify({
            patient_id: id,
            medicine_name: rxForm.medicine_name,
            dosage: rxForm.dosage || null,
            frequency: rxForm.frequency || null,
            instructions: rxForm.instructions || null,
            duration_days: rxForm.duration_days ? parseInt(rxForm.duration_days) : null,
            start_date: rxForm.start_date,
          }),
        });
        setRxMsg("✅ Prescription added");
      }
      await loadSummary();
      setTimeout(() => { setShowAddRx(false); setEditRx(null); setRxMsg(""); }, 1200);
    } catch (e: unknown) { setRxMsg(`❌ ${e instanceof Error ? e.message : "Unknown error"}`); }
    finally { setRxSaving(false); }
  }

  async function cancelRx(rxId: string) {
    const res = await alertConfirm({
      title: "Cancel this prescription?",
      text: "It will be marked cancelled and removed from the patient's active list.",
      icon: "warning",
      confirmText: "Cancel prescription",
      cancelText: "Keep it",
    });
    if (!res.isConfirmed) return;
    try {
      await apiFetch(`/prescriptions/${rxId}`, { method: "DELETE" });
      await loadSummary();
      toastSuccess("Prescription cancelled");
    } catch (e: unknown) { toastError("Could not cancel", e instanceof Error ? e.message : "Unknown error"); }
  }

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="skeleton h-24 rounded-xl"/>)}</div>;
  if (!summary) return <div className="glass p-8 text-center text-gray-500">Patient not found.</div>;

  const p = summary.profile;

  return (
    <div className="space-y-5">
      {/* Back + Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/doctor/patients" className="mt-1 text-gray-500 hover:text-gray-300 transition-colors"><ArrowLeft className="w-4 h-4"/></Link>
          <div>
            <h2 className="text-xl font-bold text-gray-100">{p.full_name}</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{p.id.slice(0,8).toUpperCase()} · {p.email}</p>
          </div>
        </div>
        <button onClick={openProgressModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-violet-400/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 hover:border-violet-400/60">
          <BarChart2 className="w-3.5 h-3.5" />
          Progress Report
        </button>
      </div>

      {/* AI Summary Card — always visible above tabs */}
      <AISummaryCard patientId={id} />

      {/* Stat bar */}
      <div className="grid grid-cols-4 gap-3">
        {[["Documents", summary.documents.length, "text-blue-400"],
          ["Records", summary.medical_records.length, "text-purple-400"],
          ["Prescriptions", summary.prescriptions.length, "text-teal-400"],
          ["Lab Reports", summary.lab_reports.length, "text-amber-400"]].map(([label, val, color]) => (
          <div key={String(label)} className="glass-sm p-3 text-center">
            <p className={`text-lg font-bold ${color}`}>{val}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="relative flex gap-1 border-b border-white/5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative px-4 py-2 text-xs font-medium transition-all whitespace-nowrap ${tab === t ? "text-cyan-200" : "text-ink-300 hover:text-ink-100"}`}>
            {t}
            {tab === t && (
              <motion.span layoutId="patient-tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" />
            )}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "Overview" && (
        <div className="space-y-4">
          <div className="glass p-5 space-y-2">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><User className="w-4 h-4 text-teal-400"/>Profile</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Email", p.email], ["Phone", p.phone || "—"], ["Added", p.created_at ? new Date(p.created_at).toLocaleDateString("en-PK") : "—"]].map(([k, v]) => (
                <div key={k}><p className="text-gray-600 text-xs">{k}</p><p className="text-gray-300">{v}</p></div>
              ))}
            </div>
          </div>
          {summary.medical_records.slice(0, 3).map(r => (
            <div key={r.id} className="glass-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{r.visit_date}</p>
              {r.diagnosis && <p className="text-sm text-gray-200"><span className="text-gray-500">Dx:</span> {r.diagnosis}</p>}
              {r.symptoms && <p className="text-xs text-gray-500 mt-1">{r.symptoms}</p>}
            </div>
          ))}
        </div>
      )}

      {/* DOCUMENTS */}
      {tab === "Documents" && (
        <div className="space-y-2">
          {summary.documents.length === 0
            ? <div className="glass p-8 text-center text-gray-500 text-sm">No documents uploaded for this patient.</div>
            : summary.documents.map(d => (
              <div key={d.id} className="glass-sm p-4 flex items-center gap-4">
                <FileText className="w-4 h-4 text-blue-400 shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{d.filename}</p>
                  <p className="text-xs text-gray-600">{d.upload_date ? new Date(d.upload_date).toLocaleDateString("en-PK") : "—"} · {d.chunk_count} chunks</p>
                </div>
                <span className={`text-xs font-medium ${STATUS_COLORS[d.status] || "text-gray-400"}`}>{d.status}</span>
              </div>
            ))}
        </div>
      )}

      {/* PRESCRIPTIONS — full CRUD */}
      {tab === "Prescriptions" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{summary.prescriptions.length} prescription{summary.prescriptions.length !== 1 ? "s" : ""}</p>
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 rounded-lg text-sm font-medium transition-all">
              <Plus className="w-4 h-4"/>Add Prescription
            </button>
          </div>

          {summary.prescriptions.length === 0 ? (
            <div className="glass p-10 text-center text-gray-500">
              <Pill className="w-9 h-9 mx-auto mb-2 opacity-30"/>
              <p className="text-sm">No prescriptions on file for this patient.</p>
              <button onClick={openAdd} className="mt-3 text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 mx-auto">
                <Plus className="w-3 h-3"/>Add first prescription
              </button>
            </div>
          ) : (
            summary.prescriptions.map(rx => (
              <div key={rx.id} className={`glass p-4 border transition-all ${
                rx.status === "cancelled" ? "opacity-60 border-red-500/20" :
                rx.status === "active" ? "hover:border-teal-500/30" : "hover:border-gray-600"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Pill className={`w-4 h-4 mt-0.5 flex-shrink-0 ${rx.status === "active" ? "text-teal-400" : "text-gray-600"}`}/>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-200 text-sm">
                        {rx.medicine_normalized || rx.medicine_name}
                        {rx.medicine_normalized && rx.medicine_normalized !== rx.medicine_name &&
                          <span className="text-gray-500 font-normal text-xs ml-2">({rx.medicine_name})</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[rx.dosage, rx.frequency, rx.duration_days && `${rx.duration_days} days`].filter(Boolean).join(" · ")}
                      </p>
                      {rx.instructions && (
                        <p className="text-xs text-blue-300/80 mt-1 flex items-center gap-1">
                          <Info className="w-3 h-3"/>{rx.instructions}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-gray-600 font-mono">{rx.rx_number}</span>
                        <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
                          <Calendar className="w-3 h-3"/>{new Date(rx.start_date).toLocaleDateString("en-PK")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[rx.status] || "text-gray-400 border-gray-600"}`}>
                      {rx.status}
                    </span>
                    {rx.status !== "cancelled" && (
                      <>
                        <button onClick={() => openEdit(rx)} title="Edit prescription"
                          className="p-1.5 rounded-lg glass-sm border border-gray-700 text-gray-500 hover:text-teal-400 hover:border-teal-500/30 transition-all">
                          <Pencil className="w-3.5 h-3.5"/>
                        </button>
                        <button onClick={() => cancelRx(rx.id)} title="Cancel prescription"
                          className="p-1.5 rounded-lg glass-sm border border-gray-700 text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-all">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* LAB REPORTS */}
      {tab === "Lab Reports" && (
        <div className="space-y-3">
          {summary.lab_reports.length === 0
            ? <div className="glass p-8 text-center text-gray-500 text-sm">No lab reports yet.</div>
            : summary.lab_reports.map(r => (
              <div key={r.id} className="glass-sm p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">{r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString("en-PK") : "—"}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[r.result_status] || "text-gray-400 border-gray-700"}`}>{r.result_status}</span>
                </div>
                {r.doctor_note && <p className="text-sm text-gray-300">{r.doctor_note}</p>}
              </div>
            ))}
        </div>
      )}

      {/* TIMELINE */}
      {tab === "Timeline" && <TimelineTab patientId={id} />}

      {/* AI ANALYSIS */}
      {tab === "AI Analysis" && (
        <div className="space-y-4">
          <div className="glass p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Brain className="w-4 h-4 text-purple-400"/>Ask AI about this patient</h3>
            <div className="flex gap-2">
              <input value={aiQuery} onChange={e => setAiQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runAI()}
                placeholder="e.g. What are the drug interaction risks? Summarise their history…"
                className="flex-1 glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-purple-500/50 outline-none" />
              <button onClick={runAI} disabled={aiLoading || !aiQuery.trim()}
                className="px-4 py-2 text-sm font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded-lg transition-all disabled:opacity-50">
                {aiLoading ? "…" : "Ask"}
              </button>
            </div>
          </div>
          {aiResult && (
            <div className="glass p-4 space-y-2">
              {aiResult.error
                ? <p className="text-red-400 text-sm">{aiResult.error}</p>
                : <>
                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <Activity className="w-3 h-3"/>
                      {aiResult.model && <span className="badge-gpt text-[10px]">{aiResult.model}</span>}
                    </p>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{aiResult.answer}</p>
                    {aiResult.disclaimer && <p className="text-xs text-amber-400/70 mt-2 border-t border-gray-800 pt-2">{aiResult.disclaimer}</p>}
                  </>
              }
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit Prescription Modal ─────────────────────────────────── */}
      <AnimatePresence>
      {(showAddRx || editRx) && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => { setShowAddRx(false); setEditRx(null); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-hi max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-100 flex items-center gap-2">
                <Pill className="w-4 h-4 text-teal-400"/>
                {editRx ? "Edit Prescription" : "Add Prescription"}
              </h3>
              <button onClick={() => { setShowAddRx(false); setEditRx(null); }} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4"/></button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Medicine Name *</label>
                <div className="relative">
                  <input
                    value={rxForm.medicine_name}
                    onChange={e => { setRxForm(f => ({ ...f, medicine_name: e.target.value })); setIxResult(null); }}
                    onBlur={e => { if (!editRx) checkInteraction(e.target.value); }}
                    placeholder="e.g. Augmentin, Paracetamol, Metformin"
                    className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none" />
                  {ixLoading && (
                    <span className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] text-gray-500">
                      <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                      Checking interactions…
                    </span>
                  )}
                </div>

                {/* ── Interaction result ──────────────────────────────── */}
                {!editRx && ixResult && ixResult.verdict === "SAFE" && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-r-lg text-xs border-l-2 border-emerald-500/60 bg-emerald-500/10 text-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>No known interactions with current medications</span>
                  </div>
                )}
                {!editRx && ixResult && ixResult.verdict === "CAUTION" && (
                  <div className="mt-2 px-3 py-2 rounded-r-lg text-xs border-l-2 border-amber-500/60 bg-amber-500/10 text-amber-200">
                    <div className="flex items-start gap-2 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-300" />
                      <span className="font-semibold">Caution: {ixResult.interactions[0]?.reason}</span>
                    </div>
                    <p className="pl-5 text-[10px]">{ixResult.overall_recommendation}</p>
                    <p className="pl-5 text-[10px] mt-1 text-amber-300/80">Powered by {ixResult.model} · {ixResult.response_ms}ms</p>
                  </div>
                )}
                {!editRx && ixResult && ixResult.verdict === "DANGEROUS" && (
                  <div className="mt-2 px-3 py-2 rounded-r-lg text-xs border-l-2 border-rose-500/60 bg-rose-500/10 text-rose-200">
                    <div className="flex items-start gap-2 mb-1">
                      <ShieldX className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-rose-300" />
                      <span className="font-bold text-rose-200">DANGEROUS: {ixResult.interactions[0]?.reason}</span>
                    </div>
                    <p className="pl-5 text-[10px] font-semibold text-rose-200 mb-2">{ixResult.overall_recommendation}</p>
                    <div className="pl-5">
                      <p className="text-[10px] mb-1">Type <strong>CONFIRM</strong> to override and save anyway:</p>
                      <input
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        placeholder="Type CONFIRM here"
                        className="w-full px-2 py-1 text-xs rounded border border-rose-500/50 bg-rose-500/10 text-rose-100 placeholder-rose-300/40 outline-none focus:border-rose-400" />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Dosage</label>
                  <input value={rxForm.dosage} onChange={e => setRxForm(f => ({ ...f, dosage: e.target.value }))}
                    placeholder="e.g. 500mg, 10ml"
                    className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Frequency</label>
                  <select value={rxForm.frequency} onChange={e => setRxForm(f => ({ ...f, frequency: e.target.value }))}
                    className="w-full bg-gray-900 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-700 outline-none focus:border-teal-500/50">
                    <option value="">Select…</option>
                    <option>Once daily</option>
                    <option>Twice daily (BD)</option>
                    <option>Three times daily (TDS)</option>
                    <option>Four times daily (QID)</option>
                    <option>Every 8 hours</option>
                    <option>Every 12 hours</option>
                    <option>As needed (PRN)</option>
                    <option>At bedtime (HS)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Instructions / Timing</label>
                <input value={rxForm.instructions} onChange={e => setRxForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="e.g. Take with food, morning and evening after meals"
                  className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Duration (days)</label>
                  <input type="number" min="1" value={rxForm.duration_days} onChange={e => setRxForm(f => ({ ...f, duration_days: e.target.value }))}
                    placeholder="e.g. 7, 14, 30"
                    className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Start Date</label>
                  <input type="date" value={rxForm.start_date} onChange={e => setRxForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full glass-sm px-3 py-2 text-sm text-gray-200 rounded-lg border border-gray-700 focus:border-teal-500/50 outline-none" />
                </div>
              </div>

              {editRx && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Status</label>
                  <select value={rxForm.status} onChange={e => setRxForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-gray-900 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-700 outline-none focus:border-teal-500/50">
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
            </div>

            {rxMsg && (
              <p className={`text-xs font-medium ${rxMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{rxMsg}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setShowAddRx(false); setEditRx(null); setIxResult(null); setConfirmText(""); }}
                className="flex-1 py-2 text-sm text-gray-400 glass-sm rounded-lg border border-gray-700 hover:text-gray-200">Cancel</button>
              <button
                onClick={() => {
                  if (!editRx && ixResult?.verdict === "DANGEROUS") {
                    if (confirmText !== "CONFIRM") { setRxMsg("❌ Type CONFIRM in the box to override a DANGEROUS interaction"); return; }
                    // Pass override flag + warning text into saveRx via form
                    setRxForm(f => ({ ...f }));
                    // Save with override metadata
                    (async () => {
                      if (!rxForm.medicine_name.trim()) { setRxMsg("Medicine name is required"); return; }
                      setRxSaving(true); setRxMsg("");
                      try {
                        await apiFetch("/prescriptions/", {
                          method: "POST",
                          body: JSON.stringify({
                            patient_id: id,
                            medicine_name: rxForm.medicine_name,
                            dosage: rxForm.dosage || null,
                            frequency: rxForm.frequency || null,
                            instructions: rxForm.instructions || null,
                            duration_days: rxForm.duration_days ? parseInt(rxForm.duration_days) : null,
                            start_date: rxForm.start_date,
                            interaction_override: true,
                            interaction_warning: ixResult?.overall_recommendation || "",
                          }),
                        });
                        setRxMsg("✅ Prescription saved (override recorded)");
                        await loadSummary();
                        setTimeout(() => { setShowAddRx(false); setIxResult(null); setConfirmText(""); setRxMsg(""); }, 1200);
                      } catch (e: unknown) { setRxMsg(`❌ ${e instanceof Error ? e.message : "Unknown error"}`); }
                      finally { setRxSaving(false); }
                    })();
                    return;
                  }
                  saveRx();
                }}
                disabled={rxSaving || !rxForm.medicine_name.trim() || (!editRx && ixResult?.verdict === "DANGEROUS" && confirmText !== "CONFIRM")}
                className="flex-1 py-2 text-sm font-semibold bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                <Save className="w-4 h-4"/>
                {rxSaving ? "Saving…" : editRx ? "Update" : ixResult?.verdict === "DANGEROUS" ? "Save with Override" : "Add Prescription"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── Progress Report Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
      {showProgress && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowProgress(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-hi max-w-lg w-full p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-100 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-purple-400" />Generate Progress Report
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">AI-generated PDF using patient&apos;s real records</p>
              </div>
              <button onClick={() => setShowProgress(false)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>

            {/* Period toggle */}
            <div>
              <p className="text-xs text-ink-200 mb-2">Select period:</p>
              <div className="flex gap-2">
                {([30, 90] as const).map(d => (
                  <button key={d}
                    onClick={() => { setProgressPeriod(d); loadProgressPreview(d); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all border ${
                      progressPeriod === d
                        ? "bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 border-violet-400/50 text-white shadow-glow-violet"
                        : "bg-white/[0.03] border-white/10 text-ink-100 hover:bg-white/[0.07]"
                    }`}>
                    {d} days
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {progressLoading && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {[1,2,3,4].map(i => <div key={i} className="skeleton h-12" />)}
                </div>
                <div className="skeleton h-20" />
              </div>
            )}

            {!progressLoading && progressData && (
              <div className="space-y-4">
                {/* 4 metric chips */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Visits",      val: progressData.metrics.total_visits,  danger: false },
                    { label: "Active meds", val: progressData.metrics.active_meds,   danger: false },
                    { label: "Med changes", val: progressData.metrics.med_changes,    danger: false },
                    { label: "Abnormal labs",val: progressData.metrics.labs_abnormal, danger: progressData.metrics.labs_abnormal > 0 },
                  ].map(({ label, val, danger }) => (
                    <div key={label} className={`text-center py-2.5 rounded-lg border ${
                      danger
                        ? "bg-rose-500/10 border-rose-500/30"
                        : "bg-cyan-500/10 border-cyan-500/30"
                    }`}>
                      <p className={`text-lg font-bold ${danger ? "text-rose-300" : "text-cyan-200"}`}>{val}</p>
                      <p className="text-[9px] text-ink-300 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* AI commentary */}
                <div className="px-3 py-3 rounded-r-lg text-xs leading-relaxed border-l-2 border-violet-500/60 bg-violet-500/10 text-ink-100">
                  <p className="line-clamp-4">{progressData.ai_commentary}</p>
                  <p className="mt-2 text-[10px] text-violet-200/70">Powered by {progressData.ai_model}</p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowProgress(false)}
                className="flex-1 py-2 text-sm text-gray-400 glass-sm rounded-lg border border-gray-700 hover:text-gray-200">Cancel</button>
              <button
                onClick={downloadProgressPdf}
                disabled={pdfDownloading || progressLoading || !progressData}
                className="btn-primary flex-1">
                {pdfDownloading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating…</>
                  : <><Download className="w-4 h-4" />Download PDF →</>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
